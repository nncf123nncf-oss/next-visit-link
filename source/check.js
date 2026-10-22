// 実画面の確認（Chrome headless / CDP）。実行: node source/check.js <出力フォルダ>
// 作る→URL→開く、375px/880pxの矩形、ライト/ダーク、UAごとのボタン、.icsの保存、XSS、壊れたリンク、下書き、計測ビーコン
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2] || 'check-out');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8775, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);
const UA = {
  iphoneSafari: ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1', 5],
  iphoneChrome: ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/156.0.8078.46 Mobile/15E148 Safari/604.1', 5],
  iphoneLine: ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0', 5],
  ipadSafari: ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 5],
  android: ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', 5]
};
const measure = `(()=>{const out={sw:document.documentElement.scrollWidth,iw:innerWidth,over:[],small:[],wrapDate:null};
  document.querySelectorAll('main *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&r.right>innerWidth+0.5)out.over.push(e.tagName+'.'+e.className)});
  document.querySelectorAll('main button:not([hidden]), main a.btn, main input, main select, main summary').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&(r.height<43.5||r.width<43.5))out.small.push((e.textContent||e.type||e.tagName).slice(0,14)+':'+Math.round(r.width)+'x'+Math.round(r.height))});
  const d=document.querySelector('.appt .d'),t=document.querySelector('.appt .t');if(d){const lh=parseFloat(getComputedStyle(d).lineHeight);out.wrapDate=[Math.round(d.getBoundingClientRect().height/lh),Math.round(t.getBoundingClientRect().height/parseFloat(getComputedStyle(t).lineHeight))]}
  out.over=[...new Set(out.over)].slice(0,8);out.small=out.small.slice(0,8);return out})()`;
const btnTexts = `[...document.querySelectorAll('.view .stack > *')].map(e=>e.tagName+':'+e.textContent+(e.getAttribute('download')?' [download='+e.getAttribute('download')+' href='+e.getAttribute('href').slice(0,5)+' target='+e.getAttribute('target')+']':'')+(e.tagName==='A'&&!e.getAttribute('download')?' [href='+e.getAttribute('href').slice(0,60)+'…]':''))`;

(async () => {
  const b = await launch(9421);
  const reqs = [];
  b.on(m => { if (m.method === 'Network.requestWillBeSent') reqs.push(m.params.request.url + ' ' + (m.params.request.postData || '')); });
  await b.send('Network.enable');
  // 本番の計測に検算の閲覧を混ぜないため、既定では計測ビーコンを止める（送信内容を確かめるときだけ CHECK_BEACON=1）
  if (!process.env.CHECK_BEACON) await b.send('Network.setBlockedURLs', { urls: ['*cloudflareinsights.com*'] });
  // 1) 作る画面 375px
  await b.open(ORIGIN, 375, 900, 2, true, 'light');
  await b.ev(`localStorage.clear()`); await b.open(ORIGIN, 375, 900, 2, true, 'light');
  console.log('make-empty', JSON.stringify(await b.ev(measure)));
  await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='リンクを作る').click()`); await b.sleep(200);
  console.log('make-empty-errors', await b.ev(`document.querySelector('.errors[role=alert]').innerText.replace(/\\n+/g,' / ')`));
  await b.ev(`window.confirm=()=>true;[...document.querySelectorAll('button')].find(x=>x.textContent==='サンプルを入れる').click()`); await b.sleep(300);
  await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='リンクを作る').click()`); await b.sleep(300);
  const gen = await b.ev(`({len:document.querySelector('.len').textContent,url:document.querySelector('textarea.urlbox').value,errHidden:document.querySelector('.errors[role=alert]').hidden})`);
  console.log('generated', JSON.stringify({ len: gen.len, realLen: [...gen.url].length, errHidden: gen.errHidden, head: gen.url.slice(0, 60) }));
  console.log('make-sample-375', JSON.stringify(await b.ev(measure)));
  await b.shot(path.join(OUT, 'check-375-make.png'), { x: 0, y: 0, width: 375, height: Math.min(9000, await b.ev('document.documentElement.scrollHeight')) });
  // 下書き: リロード後
  await b.open(ORIGIN, 375, 900, 2, true, 'light');
  console.log('draft-after-reload', JSON.stringify(await b.ev(`[...document.querySelectorAll('.panel input, .panel select')].map(e=>e.value)`)));

  // 2) 開く画面（UAごと）
  const url = gen.url.replace(/^https?:\/\/[^/]*\/[^#?]*/, ORIGIN);
  for (const k of Object.keys(UA)) {
    await b.send('Emulation.setUserAgentOverride', { userAgent: UA[k][0] });
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: UA[k][1] });
    await b.open(url.replace('#', '&ua=' + k + '#'), 375, 900, 2, true, 'light');
    console.log('view-' + k, JSON.stringify(await b.ev(btnTexts)), '| assist:', await b.ev(`(document.querySelector('.assist')||{}).innerText||''`).then(s => s.replace(/\n+/g, ' / ')));
    if (k === 'iphoneSafari') {
      console.log('view-375-measure', JSON.stringify(await b.ev(measure)));
      console.log('view-text', JSON.stringify(await b.ev(`document.querySelector('.appt').innerText.replace(/\\n+/g,' / ')`)));
      await b.shot(path.join(OUT, 'check-375-view-iphone.png'), { x: 0, y: 0, width: 375, height: await b.ev('document.documentElement.scrollHeight') });
      // blob の中身を読む
      console.log('blob-ics-head', JSON.stringify(await b.ev(`fetch(document.querySelector('.view .stack a[download]').href).then(r=>r.text()).then(t=>t.split('\\r\\n').slice(0,14).join(' | '))`)));
      console.log('blob-type', await b.ev(`fetch(document.querySelector('.view .stack a[download]').href).then(r=>r.blob()).then(x=>x.type)`));
    }
    if (k === 'iphoneChrome') await b.shot(path.join(OUT, 'check-375-view-iphone-chrome.png'), { x: 0, y: 0, width: 375, height: await b.ev('document.documentElement.scrollHeight') });
  }
  await b.send('Emulation.setUserAgentOverride', { userAgent: '' });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: false });

  // 3) ダーク・880px
  await b.open(url, 375, 900, 2, true, 'dark');
  console.log('view-dark', JSON.stringify(await b.ev(measure)));
  await b.shot(path.join(OUT, 'check-375-view-dark.png'), { x: 0, y: 0, width: 375, height: await b.ev('document.documentElement.scrollHeight') });
  await b.open(ORIGIN, 880, 900, 1, false, 'light');
  await b.ev(`window.confirm=()=>true;[...document.querySelectorAll('button')].find(x=>x.textContent==='サンプルを入れる').click()`); await b.sleep(300);
  await b.ev(`[...document.querySelectorAll('button')].find(x=>x.textContent==='リンクを作る').click()`); await b.sleep(300);
  console.log('make-880', JSON.stringify(await b.ev(measure)), JSON.stringify(await b.ev(`(()=>{const l=document.querySelector('.layout').children;return [l[0].getBoundingClientRect().width,l[1].getBoundingClientRect().left]})()`)));
  await b.shot(path.join(OUT, 'check-880-make.png'), { x: 0, y: 0, width: 880, height: 900 });

  // 4) パソコン（Windows Chrome）で .ics を保存
  const dl = path.join(OUT, 'dl'); fs.mkdirSync(dl, { recursive: true });
  await b.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await b.open(url.replace('#', '&ua=desk#'), 1000, 900, 1, false, 'light');
  console.log('view-desktop', JSON.stringify(await b.ev(btnTexts)));
  await b.ev(`document.querySelector('.view .stack a[download]').click()`); await b.sleep(1500);
  const files = fs.readdirSync(dl).filter(f => f.endsWith('.ics'));
  console.log('downloaded', files, files[0] ? JSON.stringify(fs.readFileSync(path.join(dl, files[0]), 'utf8').split('\r\n').filter(Boolean).join(' | ')) : '');

  // 5) 最長・XSS
  const xss = await b.ev(`(()=>{const c=NV.toConfig({shop:'<img src=x onerror=alert(1)>'+'長'.repeat(2),date:'2026-12-31',time:'23:30',dur:'240',note:'"><script>alert(1)</script>'+'長い文字'.repeat(13),remind:'1'},Date.now());return c.cfg?'#'+NV.encode(c.cfg):JSON.stringify(c.errors)})()`);
  await b.open(ORIGIN + xss, 375, 900, 2, true, 'light');
  console.log('xss', JSON.stringify(await b.ev(`({img:document.querySelectorAll('main img').length,script:document.querySelectorAll('main script').length,shop:document.querySelector('.v-shop').textContent,time:document.querySelector('.appt .t').textContent})`)), JSON.stringify(await b.ev(measure)));
  const longest = await b.ev(`'#'+NV.encode(NV.toConfig({shop:'長'.repeat(30),date:'2026-12-31',time:'23:30',dur:'240',note:'あ'.repeat(80),remind:'1'},Date.now()).cfg)`);
  await b.open(ORIGIN + longest, 375, 900, 2, true, 'light');
  console.log('longest-375', JSON.stringify(await b.ev(measure)));
  await b.shot(path.join(OUT, 'check-375-longest.png'), { x: 0, y: 0, width: 375, height: await b.ev('document.documentElement.scrollHeight') });

  // 6) 壊れたリンク・過去
  for (const h of ['#v1=abc', '#v2=xx', '#' + 'x'.repeat(2000)]) { await b.open(ORIGIN + h, 375, 900, 2, true, 'light'); console.log('broken', h.slice(0, 12), await b.ev(`document.querySelector('h1')&&document.querySelector('h1').textContent`), await b.ev(`document.querySelectorAll('.appt').length`)); }
  await b.open(ORIGIN + '?openExternalBrowser=1', 375, 900, 2, true, 'light');
  console.log('lost-hash', await b.ev(`document.querySelector('h1').textContent+' / '+document.querySelectorAll('input').length`));
  const past = await b.ev(`'#'+NV.encode({shop:'A',date:'20260101',time:'1000',dur:60,note:'',remind:0})`);
  await b.open(ORIGIN + past, 375, 900, 2, true, 'light');
  console.log('past', await b.ev(`(document.querySelector('.past')||{}).textContent`));

  // 7) 送信されたURL（ページ以外の通信と、ハッシュが含まれるか）
  const others = reqs.filter(u => !u.startsWith(ORIGIN) && !u.startsWith('blob:') && !u.startsWith('data:')).map(u => u.split(' ')[0]);
  const rum = reqs.filter(u => u.indexOf('cdn-cgi/rum') >= 0);
  console.log('rum-posts', rum.length, 'rum-has-hash', rum.some(u => /#v1=|v1=WzE/.test(u)), 'rum-has-openExternal', rum.some(u => /openExternalBrowser/.test(u)), JSON.stringify((rum[0] || '').slice(0, 400)));
  console.log('requests-outside', JSON.stringify([...new Set(others)]), 'hash-in-any', reqs.some(u => !u.startsWith(ORIGIN) && /v1=/.test(u)));
  b.close(); srv.close(); setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error(e); process.exit(2); });
