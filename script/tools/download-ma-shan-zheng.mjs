#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import zlib from 'node:zlib'

const CSS_URL = 'https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap'
const OUT_DIR = path.resolve(process.cwd(), 'fonts', 'mashanzheng')
const OUT_CSS = path.resolve(OUT_DIR, 'mashanzheng.css')

function fetchHttps(url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'text/css,*/*;q=0.1',
    'Accept-Encoding': 'gzip, br, deflate'
  }
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchHttps(res.headers.location))
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Request failed: ${res.statusCode} ${url}`))
        res.resume()
        return
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        const enc = (res.headers['content-encoding'] || '').toLowerCase()
        try {
          let text
          if (enc.includes('br')) {
            text = zlib.brotliDecompressSync(buffer).toString('utf8')
          } else if (enc.includes('gzip')) {
            text = zlib.gunzipSync(buffer).toString('utf8')
          } else if (enc.includes('deflate')) {
            text = zlib.inflateSync(buffer).toString('utf8')
          } else {
            text = buffer.toString('utf8')
          }
          resolve(text)
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

async function downloadFile(url, dest) {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true })
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.destroy()
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode} ${url}`))
        res.resume()
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve(dest)))
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err))
    })
  })
}

async function main() {
  console.log('Fetching Google Fonts CSS...')
  const css = await fetchHttps(CSS_URL)

  // 提取所有 woff2 链接
  // 同时匹配带引号和不带引号的 url()
  const urls = [...css.matchAll(/url\((?:'|")?(https:[^\)\"']+\.woff2)(?:'|")?\)/g)].map(m => m[1])
  if (urls.length === 0) {
    throw new Error('No woff2 urls found in CSS')
  }
  console.log(`Found ${urls.length} woff2 files`)

  // 下载并重命名为本地短文件名（取最后一段数字标号保留）
  const manifest = []
  for (const u of urls) {
    const idMatch = u.match(/\.([0-9]+)\.woff2$/)
    const id = idMatch ? idMatch[1] : 'latin'
    const filename = `mashanzheng-${id}.woff2`
    const dest = path.join(OUT_DIR, filename)
    if (!fs.existsSync(dest)) {
      console.log('Downloading', filename)
      await downloadFile(u, dest)
    } else {
      console.log('Exists', filename)
    }
    manifest.push({ url: u, file: filename })
  }

  // 生成本地 CSS，将远程 url 替换为相对路径
  let localCss = css
  for (const { url, file } of manifest) {
    localCss = localCss.replaceAll(url, `./${file}`)
  }
  // 强制使用 font-display:block，避免首屏 fallback 引起跳变
  localCss = localCss.replace(/font-display:\s*\w+;/g, 'font-display: block;')

  await fs.promises.mkdir(OUT_DIR, { recursive: true })
  await fs.promises.writeFile(OUT_CSS, localCss, 'utf8')
  console.log('Local CSS written to', OUT_CSS)

  console.log('\nNext: include this CSS in your page and prefer the local face with font-display:swap already set.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
