const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] 
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    
    // We can test against local server or file URL
    const videoPath = 'http://localhost:3000/assets/videos/gacha_5star_flow_transparent.webm';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { margin: 0; background-color: rgb(255, 0, 255); overflow: hidden; }
          video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: transparent; }
        </style>
      </head>
      <body>
        <video id="v" src="${videoPath}" muted autoplay playsinline></video>
      </body>
      </html>
    `;
    await page.setContent(html);
    
    // Wait for video to be seeked to 1.5s
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const v = document.getElementById('v');
        v.addEventListener('loadeddata', () => {
          v.currentTime = 1.5;
          v.onseeked = resolve;
        });
        if (v.readyState >= 2) {
          v.currentTime = 1.5;
          v.onseeked = resolve;
        }
      });
    });
    
    await page.screenshot({ path: path.join(__dirname, '../public/assets/videos/test_alpha_t1.png') });

    await page.evaluate(() => {
      return new Promise((resolve) => {
        const v = document.getElementById('v');
        v.currentTime = 4.5;
        v.onseeked = resolve;
      });
    });
    
    await page.screenshot({ path: path.join(__dirname, '../public/assets/videos/test_alpha_t4.png') });
    await browser.close();
    console.log('SUCCESS: Screenshots saved!');
  } catch (err) {
    console.error('Error:', err);
  }
})();
