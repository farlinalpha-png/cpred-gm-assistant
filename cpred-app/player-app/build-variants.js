// Regenerates the Android PWA and single-file variants of the Player
// Companion from the master copies in this folder. Run after any change
// to player.html / player.js / data.js:
//   node build-variants.js
// Outputs:
//   ../android-app/index.html               (player.html + PWA head + service worker)
//   ../android-app/player.js                (copy)
//   ../android-app/data.js                  (copy)
//   ../android-app/CPRED-Player-OneFile.html (player.html with data.js + player.js inlined)
const fs = require('fs');
const path = require('path');

const here = __dirname;
const androidDir = path.join(here, '..', 'android-app');

const html = fs.readFileSync(path.join(here, 'player.html'), 'utf8');
const data = fs.readFileSync(path.join(here, 'data.js'), 'utf8');
const js = fs.readFileSync(path.join(here, 'player.js'), 'utf8');

const PWA_HEAD = `<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#0a0a14">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-192.png">`;

const SW_REGISTER = `<script>
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
</script>`;

// Android PWA: same page + manifest/icons in <head> + service worker registration
const android = html
  .replace('<title>CP:RED Player Companion</title>', '<title>CP:RED Player Companion</title>\n' + PWA_HEAD)
  .replace('</body>', SW_REGISTER + '\n</body>');
fs.writeFileSync(path.join(androidDir, 'index.html'), android);
fs.writeFileSync(path.join(androidDir, 'player.js'), js);
fs.writeFileSync(path.join(androidDir, 'data.js'), data);

// One-file: inline both scripts so the page works standalone from file://
const oneFile = html
  .replace('<script src="data.js"></script>', '<script>\n' + data + '\n</script>')
  .replace('<script src="player.js"></script>', '<script>\n' + js + '\n</script>');
fs.writeFileSync(path.join(androidDir, 'CPRED-Player-OneFile.html'), oneFile);

console.log('Built: android-app/index.html, player.js, data.js, CPRED-Player-OneFile.html');
