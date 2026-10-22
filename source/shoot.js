// 投稿カード用の実画面を撮る（Chrome headless / CDP）。実行: node source/shoot.js <出力フォルダ>
// Card1: お客さんがリンクを開いた画面（iPhone SafariのUA・幅390px・DPR2）／ Card2: デスクトップの作る画面（サンプル入力・リンク作成後）
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2]);
const DATE = process.env.SHOOT_DATE || '2026-10-23';
const W1 = 390, W2 = 1000, H2 = 800;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8777, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);
(async () => {
  const b = await launch(9423);
  await b.send('Network.setBlockedURLs', { urls: ['*cloudflareinsights.com*'] });
  await b.send('Emulation.setUserAgentOverride', { userAgent: IPHONE });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.open(ORIGIN, W1, 900, 2, true, 'light');
  const hash = await b.ev(`'#'+NV.encode(NV.toConfig(NV.sampleDraft(Date.now()),Date.now()).cfg)`);
  await b.open(ORIGIN + '?openExternalBrowser=1&s=1' + hash, W1, 1600, 2, true, 'light');
  const m = await b.ev(`(()=>{const a=document.querySelector('.v-shop').getBoundingClientRect();const g=[...document.querySelectorAll('.view .stack a')].find(x=>x.textContent==='Googleカレンダーに追加').getBoundingClientRect();return {top:a.top+scrollY,bottom:g.bottom+scrollY,btn:document.querySelector('.view .stack a').textContent,appt:document.querySelector('.appt').innerText.split(String.fromCharCode(10)).join(' / ')}})()`);
  const TOP = Math.floor(m.top - 8), H1 = Math.ceil(m.bottom - TOP + 6);
  console.log('card1', W1 + 'x' + H1, 'w/h', (W1 / H1).toFixed(3), m.btn, '|', m.appt);
  await b.shot(path.join(OUT, `01-x-primary-open-link-iphone-${W1}px-${DATE}.png`), { x: 0, y: TOP, width: W1, height: H1 });
  await b.send('Emulation.setUserAgentOverride', { userAgent: '' });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await b.open(ORIGIN + '?s=2', W2, H2, 1, false, 'light');
  await b.ev(`localStorage.clear()`); await b.open(ORIGIN + '?s=3', W2, H2, 2, false, 'light');
  await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='サンプルを入れる').click()`); await b.sleep(300);
  await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='リンクを作る').click()`); await b.sleep(400);
  // ローカルのアドレス（127.0.0.1）が写らないよう、URL欄は本番の公開予定アドレスに置き換えず、欄の中身を1行ぶん送った状態で撮る
  await b.ev(`window.scrollTo(0,0);document.querySelector('.sticky').scrollTop=0;document.querySelector('textarea.urlbox').scrollTop=26`); await b.sleep(200);
  console.log('card2', W2 + 'x' + H2, await b.ev(`document.querySelector('.len').textContent`), JSON.stringify(await b.ev(`document.querySelector('textarea.urlbox').value.slice(0,40)`)));
  await b.shot(path.join(OUT, `02-make-link-${W2}px-${DATE}.png`), { x: 0, y: 0, width: W2, height: H2 });
  b.close(); srv.close(); setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error(e); process.exit(2); });
