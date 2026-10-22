// 純ロジックの検算。実行: node source/core-test.js
// index.html の <script id="core"> を取り出して読み込み、時刻・往復・壊れたリンク・止める文字・.ics・UA判定を確かめる
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = { module: { exports: {} }, TextEncoder, TextDecoder, btoa, atob, console };
vm.createContext(ctx); vm.runInContext(src, ctx);
const NV = ctx.module.exports;
let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log('NG', name, '\n  got ', g, '\n  want', w); }
}
const NOW = Date.UTC(2026, 9, 22, 18, 30); // 2026-10-23 03:30 日本時間
const cfgOf = d => NV.toConfig(Object.assign(NV.emptyDraft(), d), NOW);

// S1 Card1の値
const sample = NV.sampleDraft(NOW);
eq('sample date', sample.date, '2026-11-14');
const c1 = NV.toConfig(sample, NOW).cfg;
eq('S1 display', NV.display(c1), { date: '2026年11月14日（土）', time: '14:00〜15:30（90分）' });
const ics1 = NV.ics(c1, NOW);
eq('S1 DTSTART', /DTSTART:(\S+)/.exec(ics1)[1], '20261114T050000Z');
eq('S1 DTEND', /DTEND:(\S+)/.exec(ics1)[1], '20261114T063000Z');
eq('S1 google dates', /dates=([^&]+)/.exec(NV.googleUrl(c1))[1], '20261114T050000Z/20261114T063000Z');
eq('S1 google ctz', /ctz=([^&]+)/.exec(NV.googleUrl(c1))[1], 'Asia%2FTokyo');
eq('S1 google host', NV.googleUrl(c1).indexOf('https://calendar.google.com/calendar/render?action=TEMPLATE&text='), 0);
eq('S1 alarm', /TRIGGER:(\S+)/.exec(ics1)[1], '-P1D');

// S2 日付またぎ・深夜
const c2 = cfgOf({ shop: 'A', date: '2026-12-31', time: '23:30', dur: '90' }).cfg;
eq('S2 display', NV.display(c2).time, '23:30〜翌1:00（90分）');
eq('S2 ics', [/DTSTART:(\S+)/.exec(NV.ics(c2, NOW))[1], /DTEND:(\S+)/.exec(NV.ics(c2, NOW))[1]], ['20261231T143000Z', '20261231T160000Z']);
const c2b = cfgOf({ shop: 'A', date: '2026-11-15', time: '00:30', dur: '30' }).cfg;
eq('S2 0:30 → UTC前日', /DTSTART:(\S+)/.exec(NV.ics(c2b, NOW))[1], '20261114T153000Z');
eq('S2 0:30 display', NV.display(c2b), { date: '2026年11月15日（日）', time: '0:30〜1:00（30分）' });
const c2c = cfgOf({ shop: 'A', date: '2026-11-15', time: '09:05', dur: '240' }).cfg;
eq('S2 9:05+240', NV.display(c2c).time, '9:05〜13:05（240分）');

// S3 うるう年・存在しない日付・範囲
eq('S3 2028-02-29', !!cfgOf({ shop: 'A', date: '2028-02-29', time: '10:00', dur: '60' }).cfg, true);
['2027-02-29', '2026-02-30', '2026-13-01', '2026-00-10', 'abc'].forEach(d => eq('S3 bad ' + d, cfgOf({ shop: 'A', date: d, time: '10:00', dur: '60' }).errors.indexOf('予約日を確かめてください') >= 0, true));
eq('S3 past', cfgOf({ shop: 'A', date: '2026-10-22', time: '10:00', dur: '60' }).errors, ['予約日が今日より前になっています']);
eq('S3 today ok', !!cfgOf({ shop: 'A', date: '2026-10-23', time: '10:00', dur: '60' }).cfg, true);
eq('S3 +2y ok', !!cfgOf({ shop: 'A', date: '2028-10-23', time: '10:00', dur: '60' }).cfg, true);
eq('S3 +2y+1', cfgOf({ shop: 'A', date: '2028-10-24', time: '10:00', dur: '60' }).errors, ['予約日は2年後までにしてください']);
eq('S3 time bad', cfgOf({ shop: 'A', date: '2026-11-01', time: '24:00', dur: '60' }).errors, ['開始時刻を確かめてください']);
eq('S3 dur bad', cfgOf({ shop: 'A', date: '2026-11-01', time: '10:00', dur: '61' }).errors, ['所要時間を選んでください']);
eq('S3 empty', cfgOf({}).errors, ['店名を入れてください', '予約日を入れてください', '開始時刻を入れてください']);

// S4 往復
const tricky = { shop: '整体院 🌿𠮷野家;,\\テスト', date: '2026-11-20', time: '18:45', dur: '45', note: 'タオル持参で;おねがい,します\\ ＃ ｶﾀｶﾅ 🙏', remind: '3' };
const c4 = cfgOf(tricky).cfg;
eq('S4 cfg', !!c4, true);
eq('S4 roundtrip', NV.decodeHash('#' + NV.encode(c4)), c4);
eq('S4 fromConfig', NV.fromConfig(c4), { shop: c4.shop, date: '2026-11-20', time: '18:45', dur: '45', note: c4.note, remind: '3' });
eq('S4 makeUrl', NV.makeUrl('https://x.test/next-visit-link/', c4).indexOf('https://x.test/next-visit-link/?openExternalBrowser=1#v1='), 0);
const c4n = cfgOf({ shop: 'A', date: '2026-11-20', time: '18:45', dur: '45', note: '', remind: '0' }).cfg;
eq('S4 no note/no alarm', [NV.decodeHash('#' + NV.encode(c4n)).note, /VALARM/.test(NV.ics(c4n, NOW))], ['', false]);

// S5 壊れたハッシュ
const enc = a => '#v1=' + Buffer.from(JSON.stringify(a)).toString('base64url');
const good = [1, 'A', '20261120', '1845', 45, '', 0];
eq('S5 good', !!NV.decodeHash(enc(good)), true);
const bads = {
  empty: '', hashonly: '#', cut: NV.encode(c4).slice(0, 20), v2: '#v2=' + enc(good).slice(4), notarr: enc({ a: 1 }),
  len6: enc(good.slice(0, 6)), ver2: enc([2].concat(good.slice(1))), durOut: enc([1, 'A', '20261120', '1845', 50, '', 0]),
  remind4: enc([1, 'A', '20261120', '1845', 45, '', 4]), remindStr: enc([1, 'A', '20261120', '1845', 45, '', '1']),
  dateFmt: enc([1, 'A', '2026-11-20', '1845', 45, '', 0]), dateBad: enc([1, 'A', '20260230', '1845', 45, '', 0]),
  timeBad: enc([1, 'A', '20261120', '2460', 45, '', 0]), durStr: enc([1, 'A', '20261120', '1845', '45', '', 0]),
  shopEmpty: enc([1, '', '20261120', '1845', 45, '', 0]), shopLong: enc([1, 'あ'.repeat(31), '20261120', '1845', 45, '', 0]),
  noteLong: enc([1, 'A', '20261120', '1845', 45, 'あ'.repeat(81), 0]), link: enc([1, 'A', '20261120', '1845', 45, 'www.evil.example', 0]),
  phone: enc([1, 'A', '20261120', '1845', 45, '090-1234-5678', 0]), mail: enc([1, 'a@b', '20261120', '1845', 45, '', 0]),
  ctrl: enc([1, 'A\nB', '20261120', '1845', 45, '', 0]), huge: '#v1=' + 'A'.repeat(1200), junk: '#v1=@@@', utf8bad: '#v1=_w'
};
Object.keys(bads).forEach(k => eq('S5 ' + k, NV.decodeHash(bads[k]), null));

// S6 止める文字
['http://x', 'www.x', 'example.com', 'ｅｘａｍｐｌｅ．ｃｏｍ', 'a@b', 'a＠b', '090-1234-5678', '09012345678', '０９０ １２３４ ５６７８', '090ー1234ー5678', '+81 90', 'tel:1']
  .forEach(s => eq('S6 block ' + s, !!NV.blockedReason(s), true));
['11月14日 14:00', '3回目', '2026年11月14日', 'カット＋カラー', '10:00〜11:30', '1,000円', '前回の写真', '第2・第4土曜']
  .forEach(s => eq('S6 allow ' + s, NV.blockedReason(s), ''));
eq('S6 shop phone error', cfgOf({ shop: '店 03-1234-5678', date: '2026-11-01', time: '10:00', dur: '60' }).errors, ['店名に電話番号は入れられません']);
eq('S6 note mail error', cfgOf({ shop: 'A', date: '2026-11-01', time: '10:00', dur: '60', note: 'x@y.jp' }).errors, ['持ち物・ひと言にリンクは入れられません']);
eq('S6 shop 30/31', [!!cfgOf({ shop: 'あ'.repeat(30), date: '2026-11-01', time: '10:00', dur: '60' }).cfg, cfgOf({ shop: 'あ'.repeat(31), date: '2026-11-01', time: '10:00', dur: '60' }).errors], [true, ['店名は30字までです']]);
eq('S6 note 80/81', [!!cfgOf({ shop: 'A', date: '2026-11-01', time: '10:00', dur: '60', note: '🌿'.repeat(80) }).cfg, cfgOf({ shop: 'A', date: '2026-11-01', time: '10:00', dur: '60', note: 'あ'.repeat(81) }).errors], [true, ['持ち物・ひと言は80字までです']]);

// S7 XSS文字は文字のまま（.icsにもそのまま。HTMLとして解釈されるのは画面側で textContent を使うので起きない）
const cx = cfgOf({ shop: '<img src=x onerror=alert(1)>', date: '2026-11-01', time: '10:00', dur: '60', note: '"><script>alert(1)</script>' });
eq('S7 cfg ok', !!cx.cfg, true);
eq('S7 roundtrip', NV.decodeHash('#' + NV.encode(cx.cfg)).shop, '<img src=x onerror=alert(1)>');

// S8 .ics の形
function unfold(t) { return t.replace(/\r\n /g, ''); }
function unesc(s) { return s.replace(/\\n/g, '\n').replace(/\\([;,\\])/g, '$1'); }
const longNote = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん、；，テスト';
const c8 = cfgOf({ shop: '長い名前の整体院;テスト,店', date: '2026-11-20', time: '10:00', dur: '60', note: longNote, remind: '2' }).cfg;
const t8 = NV.ics(c8, NOW);
eq('S8 CRLF only', /[^\r]\n/.test(t8), false);
eq('S8 ends CRLF', t8.slice(-2), '\r\n');
eq('S8 line octets<=75', t8.split('\r\n').every(l => Buffer.byteLength(l, 'utf8') <= 75), true);
const lines8 = unfold(t8).split('\r\n');
eq('S8 summary', unesc(lines8.find(l => l.startsWith('SUMMARY:')).slice(8)), '長い名前の整体院;テスト,店 ご予約');
eq('S8 description', unesc(lines8.find(l => l.startsWith('DESCRIPTION:')).slice(12)), longNote + '\n（' + NV.FIXED_NOTE + '）');
eq('S8 trigger 2h', /TRIGGER:(\S+)/.exec(t8)[1], '-PT2H');
eq('S8 trigger 1h', /TRIGGER:(\S+)/.exec(NV.ics(cfgOf({ shop: 'A', date: '2026-11-20', time: '10:00', dur: '60', remind: '3' }).cfg, NOW))[1], '-PT1H');
eq('S8 dtstamp', /DTSTAMP:(\S+)/.exec(t8)[1], '20261022T183000Z');
eq('S8 structure', lines8.filter(l => /^(BEGIN|END):/.test(l)), ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'BEGIN:VALARM', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR']);
eq('S8 uid stable', NV.uid(c8) === NV.uid(Object.assign({}, c8, { note: 'x' })), true);
eq('S8 uid differs', NV.uid(c8) === NV.uid(Object.assign({}, c8, { time: '1100' })), false);
eq('S8 filename', NV.icsFilename(c1), 'next-visit-20261114-1400.ics');
eq('S8 fold multibyte not split', NV.fold('A'.repeat(74) + 'あ').split('\r\n').map(l => Buffer.byteLength(l)), [74, 4]);

// S9 UA判定（公開されている各ブラウザのUA文字列。2026-10-23 に whatismybrowser.com の「最新のUA」一覧で形式を確認したもの＋従来形式）
const UA = {
  'iPhone Safari iOS18.7（最新一覧）': ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1', 0, 'ios-safari', 'iPhone'],
  'iPhone Safari iOS17.5': ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 5, 'ios-safari', 'iPhone'],
  'iPhone Chrome（最新一覧）': ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/156.0.8078.46 Mobile/15E148 Safari/604.1', 5, 'ios-other', 'iPhone'],
  'iPhone Firefox（最新一覧）': ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/158.0 Mobile/15E148 Safari/605.1.15', 5, 'ios-other', 'iPhone'],
  'iPhone Edge': ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/126.2592.56 Mobile/15E148 Safari/605.1.15', 5, 'ios-other', 'iPhone'],
  'iPad Safari iPadOS17（Mac表記）': ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 5, 'ios-safari', 'iPad'],
  'iPad Safari 旧表記': ['Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1', 5, 'ios-safari', 'iPad'],
  'Mac Safari': ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 0, 'other', ''],
  'iPhone LINE': ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0', 5, 'ios-inapp', 'iPhone'],
  'iPhone Instagram': ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91 (iPhone15,2; iOS 17_5; ja_JP; ja; scale=3.00; 1179x2556; 621829014)', 5, 'ios-inapp', 'iPhone'],
  'iPhone Facebook': ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.98;FBBV/600000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBLC/ja_JP;FBOP/5]', 5, 'ios-inapp', 'iPhone'],
  'iPhone WKWebView（Safari表記なし）': ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 5, 'ios-inapp', 'iPhone'],
  'Android Chrome': ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', 5, 'android', 'Android'],
  'Android LINE': ['Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 Line/14.10.1/IAB', 5, 'android', 'Android'],
  'Windows Chrome': ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 0, 'other', '']
};
Object.keys(UA).forEach(k => { const [ua, mtp, kind, dev] = UA[k]; eq('S9 ' + k, NV.platformOf(ua, mtp), { kind, device: dev }); });

// S11 下書き（日付・時刻を残さない）
eq('S11 storable', NV.storable(sample), { shop: 'サンプル美容室', dur: '90', note: sample.note, remind: '1' });
eq('S11 sanitize', NV.sanitizeDraft({ shop: 'X', date: '2026-11-14', time: '14:00', dur: '61', remind: '9' }), { shop: 'X', date: '', time: '', dur: '60', note: '', remind: '1' });

// S12 過去
eq('S12 past', [NV.isPast(c1, NOW), NV.isPast(c1, Date.UTC(2026, 10, 14, 5, 0, 1))], [false, true]);

console.log('pass', pass, 'fail', fail);
process.exit(fail ? 1 : 0);
