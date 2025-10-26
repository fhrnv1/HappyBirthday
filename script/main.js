// 预先初始化音频，避免用户快速点击开始时 audio 仍未创建导致无法播放
// 默认指向项目内置音乐，后续若 customize.json 指定了其他音乐会在加载后覆盖
let audioUrl = "./music/bgMusic.mp3"
let audio = new Audio(audioUrl)
audio.preload = "auto"
// 默认循环播放 BGM，可在 customize.json 中通过 musicLoop 覆盖
audio.loop = true
// iOS/Safari 内联播放，避免进入全屏播放器
audio.playsInline = true
let isPlaying = false
// 提前获取播放按钮引用，避免在播放 Promise 同步抛错时出现 TDZ（临时死区）错误
const playPauseButton = document.getElementById('playPauseButton')
// 收集自定义字体名称，等待加载后再应用，减少刷新时字体跳变
let customFontNames = ['Ma Shan Zheng'];
// 音频预取：优先下载为 Blob，点击开始时可本地流式播放，减少等待与卡顿
let prefetchedAudioUrl = null
let prefetchPromise = null

async function prefetchAudio(url) {
  try {
    if (!url) return null
    // 如果是同源资源，直接抓取 Blob；跨域失败则回退到原链接
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`prefetch failed ${res.status}`)
    const blob = await res.blob()
    // 释放旧 blob URL，避免内存泄漏
    if (prefetchedAudioUrl) {
      try { URL.revokeObjectURL(prefetchedAudioUrl) } catch (_) {}
    }
    prefetchedAudioUrl = URL.createObjectURL(blob)
    return prefetchedAudioUrl
  } catch (e) {
    console.warn('Prefetch audio failed, fallback to direct src:', e)
    return null
  }
}

// Import the data to customize and insert them into page
// 避免潜在的全局命名冲突：用 IIFE 隔离作用域
(function initBirthdayApp(){
  fetch("customize.json")
    .then(res => res.json())
    .then((data) => {
      // ===== 时间门控：到达指定时间才可开始 =====
      const startBtn = document.querySelector('#startButton')
      const countdownScreen = document.getElementById('countdownScreen')
      const countdownEl = document.getElementById('countdown')
      let isUnlocked = true
      let countdownTimer = null

      function parseLocalDateTime(str) {
        if (!str) return null
        const s = String(str).trim()
        // 支持 "YYYY-MM-DD HH:mm[:ss]" / "YYYY/MM/DD HH:mm[:ss]" / ISO "YYYY-MM-DDTHH:mm[:ss]"
        const iso = s.includes('T') ? s : s.replace(' ', 'T').replace(/\//g, '-')
        const d = new Date(iso)
        if (!isNaN(d.getTime())) return d
        // 手动解析
        const m = s.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/)
        if (m) {
          const [_, Y, M, D, h = '0', m2 = '0', s2 = '0'] = m
          const dt = new Date(
            Number(Y),
            Number(M) - 1,
            Number(D),
            Number(h),
            Number(m2),
            Number(s2)
          )
          return isNaN(dt.getTime()) ? null : dt
        }
        return null
      }

      function formatDiff(ms) {
        if (ms < 0) ms = 0
        const totalSec = Math.floor(ms / 1000)
        const days = Math.floor(totalSec / 86400)
        const hours = Math.floor((totalSec % 86400) / 3600)
        const minutes = Math.floor((totalSec % 3600) / 60)
        const seconds = totalSec % 60
        const pad = (n) => n.toString().padStart(2, '0')
        return days > 0
          ? `${days} 天 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
          : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      }

      function setLockedUI(locked) {
        if (startBtn) {
          if (locked) {
            startBtn.setAttribute('aria-disabled', 'true')
            startBtn.classList.add('disabled')
          } else {
            startBtn.removeAttribute('aria-disabled')
            startBtn.classList.remove('disabled')
          }
        }
        // 开始界面显示/隐藏
        const startSign = document.querySelector('.startSign')
        if (startSign) {
          if (locked) {
            startSign.hidden = true
          } else {
            startSign.hidden = false
          }
        }
        if (countdownScreen) {
          if (locked) {
            countdownScreen.style.display = 'block' // 强制覆盖 CSS 中的 display:none
            countdownScreen.setAttribute('aria-hidden', 'false')
          } else {
            countdownScreen.style.display = 'none'
            countdownScreen.setAttribute('aria-hidden', 'true')
          }
        }
      }

      const unlockTimeStr = (data.unlockTime || '').trim()
      const unlockAt = parseLocalDateTime(unlockTimeStr)
      if (unlockAt && unlockAt.getTime() > Date.now()) {
        isUnlocked = false
        setLockedUI(true)
        const tick = () => {
          const now = Date.now()
          const diff = unlockAt.getTime() - now
          if (diff <= 0) {
            clearInterval(countdownTimer)
            countdownTimer = null
            isUnlocked = true
            setLockedUI(false)
            // 同步页面状态类
            document.documentElement.classList.remove('locked')
            document.documentElement.classList.add('unlocked')
            // 无障碍：自动聚焦到开始按钮
            if (startBtn) setTimeout(() => startBtn.focus(), 50)
          } else if (countdownEl) {
            countdownEl.textContent = formatDiff(diff)
          }
        }
        tick()
        countdownTimer = setInterval(tick, 1000)
      } else {
        // 未配置或已到时间
        isUnlocked = true
        setLockedUI(false)
        document.documentElement.classList.remove('locked')
        document.documentElement.classList.add('unlocked')
      }

  const dataArr = Object.keys(data)
      dataArr.map(customData => {
        if (data[customData] !== "") {
          if (customData === "imagePath") {
            document
              .querySelector(`[data-node-name*="${customData}"]`)
              .setAttribute("src", data[customData])
          } else if (customData === "fonts") {
            data[customData].forEach(font => {
              if (font && font.path) {
                const link = document.createElement('link')
                link.rel = 'stylesheet'
                link.href = font.path
                document.head.appendChild(link)
              }
              // 推迟应用字体，先收集名称，待用户点击开始并尝试加载后再切换
              if (font && font.name) customFontNames.push(font.name)
            })
          } else if (customData === "music") {
            audioUrl = data[customData]
            if (audio) {
              audio.src = audioUrl
            } else {
              audio = new Audio(audioUrl)
              audio.preload = "auto"
              audio.loop = true
              audio.playsInline = true
            }
            // 异步预取音频，转为 Blob URL，提升首播稳定性
            prefetchPromise = prefetchAudio(audioUrl)
          } else if (customData === "musicLoop") {
            // 允许在 customize.json 中用 true/false 控制是否循环
            try { audio.loop = Boolean(data[customData]) } catch (_) {}
          } else {
            document.querySelector(`[data-node-name*="${customData}"]`).innerText = data[customData]
          }
        }

        // Check if the iteration is over
        // Run amimation if so
        if (dataArr.length === dataArr.indexOf(customData) + 1) {
          document.querySelector("#startButton").addEventListener("click", async () => {
            if (startBtn && (startBtn.getAttribute('aria-disabled') === 'true')) return
            if (!isUnlocked) return
            // 若已预取完成，优先切换为 blob URL，减少首播等待
            try {
              if (prefetchPromise) {
                const readyUrl = await Promise.race([
                  prefetchPromise,
                  new Promise(resolve => setTimeout(() => resolve(null), 700))
                ])
                if (readyUrl) {
                  audio.src = readyUrl
                }
              }
            } catch (_) {}

            // 确保在用户手势内尝试开始播放，避免浏览器策略拦截
            if (audio) togglePlay(true)

            // 等待进入 playing 状态后再启动重量级动画，降低启动期卡顿对音频的影响
            await new Promise(resolve => {
              if (!audio) return resolve()
              if (!audio.paused) return resolve()
              const onPlaying = () => { audio.removeEventListener('playing', onPlaying); resolve() }
              // 最多等待 1 秒，超时仍继续
              const t = setTimeout(() => { audio && audio.removeEventListener('playing', onPlaying); resolve() }, 1000)
              audio.addEventListener('playing', () => { clearTimeout(t); onPlaying() })
            })
            // 在开始前尝试等待自定义字体，最多等待 1500ms，超时则直接开始，避免长等待
            await waitForFonts(customFontNames, 1500)
            applyCustomFont()
            document.querySelector(".startSign").style.display = "none"
            animationTimeline()
          })
          // animationTimeline()
        }
      })
    })
    .catch(err => {
      // 如果配置加载失败，仍然允许开始动画，避免页面卡住
      console.error("Failed to load customize.json:", err)
      const startBtn = document.querySelector("#startButton")
      if (startBtn) {
        startBtn.addEventListener("click", async () => {
          // 无配置时不做时间门控
          if (audio) togglePlay(true)
          // 等待进入 playing 状态后再启动重量级动画
          await new Promise(resolve => {
            if (!audio) return resolve()
            if (!audio.paused) return resolve()
            const onPlaying = () => { audio.removeEventListener('playing', onPlaying); resolve() }
            const t = setTimeout(() => { audio && audio.removeEventListener('playing', onPlaying); resolve() }, 1000)
            audio.addEventListener('playing', () => { clearTimeout(t); onPlaying() })
          })
          await waitForFonts(customFontNames, 1500)
          applyCustomFont()
          document.querySelector(".startSign").style.display = "none"
          animationTimeline()
        })
      }
    })
})();

// Animation Timeline
const animationTimeline = () => {
  // Spit chars that needs to be animated individually
  const textBoxChars = document.getElementsByClassName("hbd-chatbox")[0]
  const hbd = document.getElementsByClassName("wish-hbd")[0]

  textBoxChars.innerHTML = `<span>${textBoxChars.innerHTML
    .split("")
    .join("</span><span>")}</span>`

  hbd.innerHTML = `<span>${hbd.innerHTML
    .split("")
    .join("</span><span>")}</span>`

  const ideaTextTrans = {
    opacity: 0,
    y: -20,
    rotationX: 5,
    skewX: "15deg"
  }

  const ideaTextTransLeave = {
    opacity: 0,
    y: 20,
    rotationY: 5,
    skewX: "-15deg"
  }

  const tl = new TimelineMax()

  tl
    .to(".container", 0.1, {
      visibility: "visible"
    })
    .from(".one", 0.7, {
      opacity: 0,
      y: 10
    })
    .from(".two", 0.4, {
      opacity: 0,
      y: 10
    })
    .to(
      ".one",
      0.7,
      {
        opacity: 0,
        y: 10
      },
      "+=2.5"
    )
    .to(
      ".two",
      0.7,
      {
        opacity: 0,
        y: 10
      },
      "-=1"
    )
    .from(".three", 0.7, {
      opacity: 0,
      y: 10
      // scale: 0.7
    })
    .to(
      ".three",
      0.7,
      {
        opacity: 0,
        y: 10
      },
      "+=2"
    )
    .from(".four", 0.7, {
      scale: 0.2,
      opacity: 0
    })
    .from(".fake-btn", 0.3, {
      scale: 0.2,
      opacity: 0
    })
    .staggerTo(
      ".hbd-chatbox span",
      0.5,
      {
        visibility: "visible"
      },
      0.05
    )
    .to(".fake-btn", 0.1, {
      backgroundColor: "#8FE3B6"
    })
    .to(
      ".four",
      0.5,
      {
        scale: 0.2,
        opacity: 0,
        y: -150
      },
      "+=0.7"
    )
    .from(".idea-1", 0.7, ideaTextTrans)
    .to(".idea-1", 0.7, ideaTextTransLeave, "+=1.5")
    .from(".idea-2", 0.7, ideaTextTrans)
    .to(".idea-2", 0.7, ideaTextTransLeave, "+=1.5")
    .from(".idea-3", 0.7, ideaTextTrans)
    .to(".idea-3 strong", 0.5, {
      scale: 1.2,
      x: 10,
      backgroundColor: "rgb(21, 161, 237)",
      color: "#fff"
    })
    .to(".idea-3", 0.7, ideaTextTransLeave, "+=1.5")
    .from(".idea-4", 0.7, ideaTextTrans)
    .to(".idea-4", 0.7, ideaTextTransLeave, "+=1.5")
    .from(
      ".idea-5",
      0.7,
      {
        rotationX: 15,
        rotationZ: -10,
        skewY: "-5deg",
        y: 50,
        z: 10,
        opacity: 0
      },
      "+=0.5"
    )
    .to(
      ".idea-5 .smiley",
      0.7,
      {
        rotation: 90,
        x: 8
      },
      "+=0.4"
    )
    .to(
      ".idea-5",
      0.7,
      {
        scale: 0.2,
        opacity: 0
      },
      "+=2"
    )
    .staggerFrom(
      ".idea-6 span",
      0.8,
      {
        scale: 3,
        opacity: 0,
        rotation: 15,
        ease: Expo.easeOut
      },
      0.2
    )
    .staggerTo(
      ".idea-6 span",
      0.8,
      {
        scale: 3,
        opacity: 0,
        rotation: -15,
        ease: Expo.easeOut
      },
      0.2,
      "+=1"
    )
    .staggerFromTo(
      ".baloons img",
      2.5,
      {
        opacity: 0.9,
        y: 1400
      },
      {
        opacity: 1,
        y: -1000
      },
      0.2
    )
    .from(
      ".lydia-dp",
      0.5,
      {
        scale: 3.5,
        opacity: 0,
        x: 25,
        y: -25,
        rotationZ: -45
      },
      "-=2"
    )
    .from(".hat", 0.5, {
      x: -100,
      y: 350,
      rotation: -180,
      opacity: 0
    })
    .staggerFrom(
      ".wish-hbd span",
      0.7,
      {
        opacity: 0,
        y: -50,
        // scale: 0.3,
        rotation: 150,
        skewX: "30deg",
        ease: Elastic.easeOut.config(1, 0.5)
      },
      0.1
    )
    .staggerFromTo(
      ".wish-hbd span",
      0.7,
      {
        scale: 1.4,
        rotationY: 150
      },
      {
        scale: 1,
        rotationY: 0,
        color: "#ff69b4",
        ease: Expo.easeOut
      },
      0.1,
      "party"
    )
    .from(
      ".wish h5",
      0.5,
      {
        opacity: 0,
        y: 10,
        skewX: "-15deg"
      },
      "party"
    )
    .staggerTo(
      ".eight svg",
      1.5,
      {
        visibility: "visible",
        opacity: 0,
        scale: 80,
        repeat: 3,
        repeatDelay: 1.4
      },
      0.3
    )
    .to(".six", 0.5, {
      opacity: 0,
      y: 30,
      zIndex: "-1"
    })
    .staggerFrom(".nine p", 1, ideaTextTrans, 1.2)
    .to(
      ".last-smile",
      0.5,
      {
        rotation: 90
      },
      "+=1"
    )

  // tl.seek("currentStep");
  // tl.timeScale(2);

  // Restart Animation on click
  const replyBtn = document.getElementById("replay")
  replyBtn.addEventListener("click", () => {
    tl.restart()

  })
}

// Run fetch and animation in sequence（已在 IIFE 中立即执行）
// 防拖拽兜底：阻止 .photo 内图片的拖拽/按下默认行为
(function installPhotoGuards(){
  const photo = document.querySelector('.photo')
  if (!photo) return
  photo.addEventListener('dragstart', (e) => {
    e.preventDefault()
  })
  photo.addEventListener('pointerdown', (e) => {
    const t = e.target
    if (t && t.tagName === 'IMG') {
      e.preventDefault()
    }
  })
})()


// Removed redundant audio play trigger here; playback is handled in the fetch handler's start button click event.

playPauseButton.addEventListener('click', () => {
  if (audio) {
    togglePlay(!isPlaying)
  }
})

// 键盘可访问性：Enter/Space 切换播放
playPauseButton.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (audio) {
      togglePlay(!isPlaying)
    }
  }
})

function togglePlay(play) {
  if (!audio) return

  const setUI = (on) => {
    isPlaying = on
    if (playPauseButton) {
      playPauseButton.classList.toggle('playing', on)
      playPauseButton.setAttribute('aria-pressed', String(on))
    }
  }

  if (play) {
    // 某些浏览器返回 Promise，需要处理被策略阻止的情况
    try {
      // 确保速率/静音等状态正确
      audio.muted = false
      audio.playbackRate = 1.0
      const p = audio.play()
      if (p && typeof p.then === 'function') {
        p.then(() => setUI(true)).catch(err => {
          console.warn('Audio play was blocked or failed:', err)
          setUI(false)
        })
      } else {
        // 老浏览器：audio.play() 不返回 Promise
        setUI(true)
      }
    } catch (err) {
      console.warn('Audio play threw error:', err)
      setUI(false)
    }
  } else {
    try { audio.pause() } catch (_) {}
    setUI(false)
  }
}

// 等待字体加载，尽量用页面已有文字样本触发对应 unicode-range 子集
function waitForFonts(names = [], timeout = 1500, textSample) {
  if (!('fonts' in document) || names.length === 0) return Promise.resolve()
  const fallbackLatin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?' 
  let sample = textSample
  if (!sample) {
    try {
      // 提取页面前一段可见文本，避免过长
      const bodyText = (document.body && document.body.innerText) ? document.body.innerText : ''
      sample = (bodyText && bodyText.trim()) ? bodyText.slice(0, 80) : '生日快乐，祝你天天开心！Happy Birthday 2025'
    } catch (_) {
      sample = '生日快乐，祝你天天开心！Happy Birthday 2025'
    }
  }
  // 附加常见拉丁字符，保证基础子集也加载
  const testString = (sample + ' ' + fallbackLatin).slice(0, 200)
  const loads = names.map(n => {
    try {
      return document.fonts.load(`400 1em "${n}"`, testString)
    } catch (_) {
      return Promise.resolve()
    }
  })
  const all = Promise.all(loads)
  return new Promise(resolve => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    const t = setTimeout(finish, timeout)
    all.then(() => { clearTimeout(t); finish() }).catch(() => { clearTimeout(t); finish() })
  })
}

function applyCustomFont() {
  if (!customFontNames || customFontNames.length === 0) return
  // 仅在字体已可用时切换，避免因超时未加载造成跳变
  const isReady = (() => {
    if (!('fonts' in document)) return true // 老浏览器，直接切换
    try {
      return customFontNames.some(n => document.fonts.check(`1em "${n}"`))
    } catch (_) {
      return false
    }
  })()
  if (isReady) {
    document.body.classList.add('font-ready')
  } else {
    // 再短暂重试一次，以捕获刚好加载完的时机
    setTimeout(() => {
      try {
        const ok = customFontNames.some(n => document.fonts.check(`1em "${n}"`))
        if (ok) document.body.classList.add('font-ready')
      } catch (_) {}
    }, 400)
  }
}