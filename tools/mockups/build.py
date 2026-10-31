"""Генерує статичні макети трьох візуальних напрямів у mockups/.
Запуск: python3 tools/mockups/build.py
Однакова інформаційна архітектура, різний стиль — щоб порівнювати саме стиль."""
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'mockups')

# Іконки мастей: різна ФОРМА (крапля / полум'я / гранований камінь) — не лише колір.
SYMBOLS = '''
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="s-water" viewBox="0 0 24 24"><path d="M12 2.5C8.2 7.6 5.5 11.3 5.5 14.6a6.5 6.5 0 0 0 13 0c0-3.3-2.7-7-6.5-12.1Z" fill="currentColor"/><path d="M9 15.2a3 3 0 0 0 3 3" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" fill="none" stroke-linecap="round"/></symbol>
  <symbol id="s-fire" viewBox="0 0 24 24"><path d="M12.6 2c.5 3.1-1.2 4.9-2.8 6.6C8.2 10.3 6.5 12 6.5 15a5.5 5.5 0 0 0 11 0c0-2.2-1-3.9-2.1-5.2.1 1.6-.5 2.8-1.6 3.3.6-3.9-.6-8.3-1.2-11.1Z" fill="currentColor"/><path d="M12 21a2.8 2.8 0 0 1-2.8-2.8c0-1.6 1.3-2.5 2.3-3.7.3 1.2 1 1.6 1.7 2 .9.5 1.6 1.2 1.6 2.1A2.8 2.8 0 0 1 12 21Z" fill="#fff" fill-opacity=".45"/></symbol>
  <symbol id="s-stone" viewBox="0 0 24 24"><path d="M7.5 4h9l4.5 7.5-4.5 8.5h-9L3 11.5 7.5 4Z" fill="currentColor"/><path d="M7.5 4 10 11.5 3 11.5M16.5 4 14 11.5h7M10 11.5h4l-2.4 8.5" stroke="#000" stroke-opacity=".28" stroke-width="1.2" fill="none" stroke-linejoin="round"/></symbol>
  <symbol id="s-knife" viewBox="0 0 24 24"><path d="M20.5 2.5c-4.5 1.2-9.3 5.4-12.2 9.6l3.6 3.6c4.2-2.9 8.2-7.6 8.6-13.2Z" fill="currentColor"/><path d="m8.3 12.1-1.6 1.6 3.6 3.6 1.6-1.6" fill="currentColor" opacity=".7"/><path d="M7.4 15.1 3 19.5 4.5 21l4.4-4.4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></symbol>
  <symbol id="s-mirror" viewBox="0 0 24 24"><ellipse cx="12" cy="10" rx="6.5" ry="8" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M9 7.5 12.5 4M9 11l5.5-5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".7"/><path d="M12 18v4M9 22h6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></symbol>
  <symbol id="s-chip" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1.6"/><path d="M12 2v3.3M12 18.7V22M2 12h3.3M18.7 12H22M4.9 4.9l2.3 2.3M16.8 16.8l2.3 2.3M4.9 19.1l2.3-2.3M16.8 7.2l2.3-2.3" stroke="#fff" stroke-opacity=".7" stroke-width="2"/></symbol>
  <symbol id="s-eye" viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></symbol>
  <symbol id="s-swap" viewBox="0 0 24 24"><path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="s-up" viewBox="0 0 24 24"><path d="M12 4 4 14h5v6h6v-6h5Z" fill="currentColor"/></symbol>
  <symbol id="s-down" viewBox="0 0 24 24"><path d="M12 20 4 10h5V4h6v6h5Z" fill="currentColor"/></symbol>
</svg>'''


def suit(s):
    return f'<svg class="si {s}"><use href="#s-{s}"/></svg>'


def card(v, s, extra='', cls=''):
    """Числова карта: кут, велике значення, іконка масті."""
    return f'''<div class="card {s} {cls}">
      <div class="cor">{v}{suit(s)}</div>
      <div class="big">{v}</div>
      <svg class="pip {s}"><use href="#s-{s}"/></svg>{extra}
    </div>'''


def knife(cls=''):
    return f'''<div class="card special {cls}">
      <div class="sp-top">б'є 10 і 🪞</div>
      <svg class="sp-ico"><use href="#s-knife"/></svg>
      <div class="sp-name">Ніж</div>
    </div>'''


def back(cls=''):
    return f'<div class="card back {cls}"><div class="mono">ВБ</div></div>'


def chip(cls=''):
    return f'<svg class="chip {cls}"><use href="#s-chip"/></svg>'


FONTS = '''
@font-face{font-family:Playfair;font-weight:700;src:url(../fonts/playfair-display-cyrillic-700-normal.woff2) format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:Playfair;font-weight:700;src:url(../fonts/playfair-display-latin-700-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Playfair;font-weight:900;src:url(../fonts/playfair-display-cyrillic-900-normal.woff2) format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:Playfair;font-weight:900;src:url(../fonts/playfair-display-latin-900-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Manrope;font-weight:500;src:url(../fonts/manrope-cyrillic-500-normal.woff2) format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:Manrope;font-weight:500;src:url(../fonts/manrope-latin-500-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Manrope;font-weight:700;src:url(../fonts/manrope-cyrillic-700-normal.woff2) format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:Manrope;font-weight:700;src:url(../fonts/manrope-latin-700-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Manrope;font-weight:800;src:url(../fonts/manrope-cyrillic-800-normal.woff2) format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:Manrope;font-weight:800;src:url(../fonts/manrope-latin-800-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Oswald;font-weight:500;src:url(../fonts/oswald-cyrillic-500-normal.woff2) format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:Oswald;font-weight:500;src:url(../fonts/oswald-latin-500-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Oswald;font-weight:700;src:url(../fonts/oswald-cyrillic-700-normal.woff2) format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:Oswald;font-weight:700;src:url(../fonts/oswald-latin-700-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Inter;font-weight:500;src:url(../fonts/inter-cyrillic-500-normal.woff2) format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:Inter;font-weight:500;src:url(../fonts/inter-latin-500-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Inter;font-weight:700;src:url(../fonts/inter-cyrillic-700-normal.woff2) format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:Inter;font-weight:700;src:url(../fonts/inter-latin-700-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Unbounded;font-weight:600;src:url(../fonts/unbounded-cyrillic-600-normal.woff2) format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:Unbounded;font-weight:600;src:url(../fonts/unbounded-latin-600-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Unbounded;font-weight:800;src:url(../fonts/unbounded-cyrillic-800-normal.woff2) format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:Unbounded;font-weight:800;src:url(../fonts/unbounded-latin-800-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
'''

# Спільна геометрія макета (393×852). Кольори/шрифти/фактури — у темах.
BASE = '''
*{box-sizing:border-box;margin:0;font-variant-numeric:lining-nums tabular-nums}
.si.water{color:var(--water-ui,var(--water))}.si.fire{color:var(--fire-ui,var(--fire))}.si.stone{color:var(--stone-ui,var(--stone))}
.card .si.water,.card .pip.water{color:var(--water)}.card .si.fire,.card .pip.fire{color:var(--fire)}.card .si.stone,.card .pip.stone{color:var(--stone)}
html,body{background:#111;color:var(--ink)}
body{font-family:var(--font-ui);-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;align-items:center;gap:28px;padding:24px 0 60px}
.label{font:600 15px/1.3 var(--font-ui);color:#bbb;text-align:center;max-width:393px;padding:0 16px}
.label b{color:#fff}
.phone{width:393px;height:852px;position:relative;overflow:hidden;border-radius:44px;background:var(--bg);box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 10px #000;display:flex;flex-direction:column;padding:54px 14px 30px;gap:10px}
.phone::before{content:"";position:absolute;inset:0;background:var(--texture);pointer-events:none;opacity:var(--texture-opacity,1)}
.phone>*{position:relative}
.status{position:absolute;top:16px;left:34px;right:30px;display:flex;justify-content:space-between;font:600 16px/1 Inter,system-ui;color:var(--ink)}
.island{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:124px;height:36px;border-radius:20px;background:#000}
/* банер фази */
.phase{height:46px;border-radius:var(--r-m);display:flex;align-items:center;gap:10px;padding:0 14px;font:700 17px/1.1 var(--font-ui)}
.phase .t{flex:1}
.phase .t small{display:block;font-weight:500;font-size:15px;opacity:.85;margin-top:2px}
.phase.act{background:var(--act-bg);color:var(--act-ink)}
.phase.wait{background:var(--wait-bg);color:var(--wait-ink)}
.ring{width:34px;height:34px;flex-shrink:0;position:relative}
.ring svg{width:34px;height:34px;transform:rotate(-90deg)}
.ring span{position:absolute;inset:0;display:grid;place-items:center;font:700 13px/1 var(--font-ui);font-variant-numeric:tabular-nums}
/* суперник */
.opp{display:flex;align-items:center;gap:10px;height:60px;padding:0 12px;border-radius:var(--r-m);background:var(--panel)}
.ava{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;font:700 19px/1 var(--font-display);background:var(--ava-bg);color:var(--ava-ink);position:relative;flex-shrink:0}
.ava .tr{position:absolute;inset:-5px;width:56px;height:56px;transform:rotate(-90deg)}
.who{flex:1;min-width:0}
.who b{display:block;font:700 17px/1.2 var(--font-ui)}
.tags{display:flex;gap:6px;margin-top:3px;flex-wrap:nowrap}
.tag{display:inline-flex;align-items:center;gap:4px;font:600 15px/1 var(--font-ui);color:var(--muted)}
.tag svg{width:16px;height:16px}
.minis{display:flex;margin-right:4px}
.minis i{width:16px;height:23px;border-radius:3px;background:var(--back-mini);margin-left:-6px;border:1px solid var(--line);display:block}
.stack{display:flex;align-items:center;gap:6px;font:800 24px/1 var(--font-num);font-variant-numeric:tabular-nums;color:var(--ink)}
.stack .chip{width:22px;height:22px;color:var(--gold)}
/* стіл */
.table{flex:1;border-radius:var(--r-l);background:var(--felt);border:var(--felt-border);box-shadow:var(--felt-shadow);position:relative;padding:12px;display:flex;flex-direction:column}
.tbar{display:flex;justify-content:space-between;align-items:center;font:600 15px/1 var(--font-ui);color:var(--muted)}
.trump{display:inline-flex;align-items:center;gap:6px;padding:6px 10px 6px 8px;border-radius:99px;background:var(--trump-bg);color:var(--ink);font:700 15px/1 var(--font-ui)}
.trump .si{width:18px;height:18px}
.deck{display:inline-flex;gap:8px;align-items:center;font-variant-numeric:tabular-nums}
.deck .hi{color:var(--hi)} .deck .lo{color:var(--lo)}
.arena{flex:1;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;justify-items:center}
.seat{display:flex;flex-direction:column;align-items:center;gap:8px}
.seat>:last-child{height:28px;display:flex;align-items:center}
.seat .nm{font:600 15px/1 var(--font-ui);color:var(--muted)}
.bet{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;background:var(--bet-bg);font:800 15px/1 var(--font-ui);color:var(--ink);font-variant-numeric:tabular-nums}
.bet .chip{width:16px;height:16px;color:var(--gold)}
.bet.hot{background:var(--bet-hot-bg);color:var(--bet-hot-ink)}
.scouted{font:600 15px/1 var(--font-ui);color:var(--hi);display:flex;gap:4px;align-items:center}
.scouted svg{width:16px;height:16px}
.pot{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:104px}
.pot .lbl{font:700 15px/1 var(--font-ui);letter-spacing:.12em;text-transform:uppercase;color:var(--gold)}
.pot .num{font:800 46px/1 var(--font-num);font-variant-numeric:tabular-nums;color:var(--pot-ink)}
.pot .chips{display:flex;margin-top:2px}
.pot .chips .chip{width:20px;height:20px;color:var(--gold);margin-left:-7px}
.jack{font:700 15px/1 var(--font-ui);color:var(--jack);padding:4px 9px;border-radius:99px;background:var(--jack-bg)}
/* карти */
.card{width:var(--cw);height:calc(var(--cw)*1.42);border-radius:var(--r-card);background:var(--card-bg);border:var(--card-border);box-shadow:var(--card-shadow);position:relative;color:var(--c);flex-shrink:0}
.card.water{--c:var(--water)} .card.fire{--c:var(--fire)} .card.stone{--c:var(--stone)} .card.special{--c:var(--special)}
.card .cor{position:absolute;top:6px;left:7px;display:flex;flex-direction:column;align-items:center;font:800 calc(var(--cw)*.27)/1 var(--font-num)}
.card .cor .si{width:calc(var(--cw)*.24);height:calc(var(--cw)*.24);margin-top:2px}
.card .big{position:absolute;inset:0;display:grid;place-items:center;font:800 calc(var(--cw)*.62)/1 var(--font-num);color:var(--card-num);padding-top:4%}
.card .pip{position:absolute;right:7px;bottom:7px;width:calc(var(--cw)*.3);height:calc(var(--cw)*.3)}
.card.back{background:var(--back);border:var(--back-border)}
.card.back .mono{position:absolute;inset:0;display:grid;place-items:center;font:900 calc(var(--cw)*.24)/1 var(--font-display);color:var(--mono)}
.card .sp-ico{position:absolute;left:50%;top:48%;width:calc(var(--cw)*.5);height:calc(var(--cw)*.5);transform:translate(-50%,-50%);color:var(--c)}
.card .sp-name{position:absolute;bottom:8px;left:0;right:0;text-align:center;font:800 15px/1 var(--font-ui);color:var(--c);text-transform:uppercase}
.hand .card .sp-top{display:none}.card .sp-top{position:absolute;top:7px;left:0;right:0;text-align:center;font:600 calc(var(--cw)*.12)/1 var(--font-ui);color:var(--muted)}
.card.special{background:var(--special-bg)}
.arena .card{--cw:84px}
.lock{position:absolute;bottom:-24px;left:0;right:0;text-align:center;font:600 15px/1 var(--font-ui);color:var(--muted);white-space:nowrap}
/* рука */
.hand{display:flex;justify-content:center;gap:8px;padding-top:16px;height:150px;align-items:flex-end}
.hand .card{--cw:78px}
.hand .card.trumped{box-shadow:var(--card-shadow),0 0 0 2.5px var(--trump-ring)}
.tb{position:absolute;top:-13px;left:50%;transform:translateX(-50%);padding:4px 8px;border-radius:99px;background:var(--trump-ring);color:var(--trump-ring-ink);font:800 15px/1 var(--font-ui);white-space:nowrap;font-variant-numeric:tabular-nums}
.hand.dim .card{opacity:.92}
/* дії */
.acts{display:flex;flex-direction:column;gap:8px}
.btn{height:52px;border-radius:var(--r-m);display:flex;align-items:center;justify-content:center;gap:8px;font:700 17px/1.1 var(--font-ui);border:0;color:var(--ink);background:var(--btn2);font-variant-numeric:tabular-nums}
.btn small{font-weight:500;font-size:15px;opacity:.8}
.btn.primary{height:60px;background:var(--accent);color:var(--accent-ink);box-shadow:var(--accent-shadow);font-size:19px}
.btn.primary small{opacity:.85}
.row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.row .btn{height:50px;font-size:16px;flex-direction:column;gap:2px}
.btn.allin{color:var(--danger-ink);background:var(--allin-bg)}
.btn.ghost{background:transparent;color:var(--muted);height:44px;text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1px}
/* я */
.me{display:flex;align-items:center;gap:10px;height:54px;padding:0 12px;border-radius:var(--r-m);background:var(--panel)}
.me .ava{width:40px;height:40px;font-size:16px}
.me .who b{font-size:16px}
.react{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--btn2);font-size:20px}

/* ── «Подвій або нічого» ── */
.don{position:absolute;inset:0;background:var(--don-veil);display:flex;flex-direction:column;align-items:center;padding:108px 18px 40px;gap:14px}
.don h2{font:900 30px/1.05 var(--font-display);color:var(--don-title);text-align:center;letter-spacing:.01em}
.don .sub{font:600 16px/1.35 var(--font-ui);color:var(--muted);text-align:center}
.don .sub b{color:var(--gold);font-variant-numeric:tabular-nums}
.don .base{position:relative;margin:34px 0 4px}
.don .base .card{--cw:120px}
.don .base .bl{position:absolute;top:-30px;left:50%;transform:translateX(-50%);font:800 15px/1 var(--font-ui);letter-spacing:.14em;color:var(--muted);text-transform:uppercase}
.don .next{position:absolute;right:-74px;top:30px}
.don .next .card{--cw:60px;transform:rotate(8deg)}
.choices{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%}
.choice{border-radius:var(--r-l);padding:14px 12px 12px;background:var(--choice-bg);border:var(--choice-border);display:flex;flex-direction:column;gap:8px;color:var(--ink)}
.choice .h{display:flex;align-items:center;gap:6px;font:800 21px/1 var(--font-display)}
.choice .h svg{width:22px;height:22px}
.meter{height:10px;border-radius:5px;background:var(--meter-bg);overflow:hidden}
.meter i{display:block;height:100%;border-radius:5px;background:var(--meter)}
.choice .pc{display:flex;justify-content:space-between;font:700 15px/1 var(--font-ui);font-variant-numeric:tabular-nums;color:var(--muted)}
.choice .pc b{color:var(--ink);font-size:17px}
.choice .win{font:800 26px/1 var(--font-num);color:var(--win);font-variant-numeric:tabular-nums}
.choice .win small{font:600 15px/1 var(--font-ui);color:var(--muted);margin-left:4px}
.choice.best{border:var(--choice-best-border);box-shadow:var(--choice-best-shadow)}
.eq{font:600 15px/1.3 var(--font-ui);color:var(--muted);text-align:center}
.take{width:100%;height:56px;border-radius:var(--r-m);background:var(--btn2);color:var(--ink);font:700 18px/1 var(--font-ui);display:flex;align-items:center;justify-content:center;gap:8px;font-variant-numeric:tabular-nums}
.take .chip{width:20px;height:20px;color:var(--gold)}
.don .oppline{display:flex;gap:8px;align-items:center;font:600 15px/1 var(--font-ui);color:var(--muted);margin-top:auto}
'''

THEMES = {
    'a': dict(
        title='A · Підпільний клуб',
        desc='Глибоке зелене сукно, латунь і золото, тепле світло. Шрифти: Playfair Display (заголовки й цифри) + Manrope (інтерфейс).',
        css='''
:root{--font-display:Playfair,Georgia,serif;--font-num:Manrope,system-ui,sans-serif;--font-ui:Manrope,system-ui,sans-serif;
--bg:#0b1410;--ink:#f6efe0;--muted:#c8bda4;--panel:linear-gradient(180deg,#1b2620,#121b16);--line:rgba(212,175,95,.35);
--texture:radial-gradient(120% 60% at 50% 0%,rgba(255,196,110,.16),transparent 60%),radial-gradient(90% 40% at 50% 100%,rgba(0,0,0,.6),transparent);
--gold:#e2b75a;--accent:linear-gradient(180deg,#f3cf78,#c9962f);--accent-ink:#241a06;--accent-shadow:0 6px 18px rgba(201,150,47,.35),inset 0 1px 0 rgba(255,255,255,.5);
--act-bg:linear-gradient(90deg,#c9962f,#e9c26a);--act-ink:#1e1504;--wait-bg:rgba(246,239,224,.07);--wait-ink:#d9cfb8;
--felt:radial-gradient(ellipse at 50% 42%,#1f6b47 0%,#145236 45%,#0c3a26 100%);--felt-border:3px solid #6b5426;
--felt-shadow:inset 0 0 0 2px rgba(226,183,90,.35),inset 0 10px 40px rgba(0,0,0,.45),0 10px 30px rgba(0,0,0,.5);
--trump-bg:rgba(0,0,0,.32);--hi:#ffcf8a;--lo:#a9d6ff;--bet-bg:rgba(0,0,0,.35);--bet-hot-bg:#e2b75a;--bet-hot-ink:#1e1504;
--pot-ink:#fff4d6;--jack:#ffd27a;--jack-bg:rgba(0,0,0,.35);
--card-bg:linear-gradient(170deg,#fffaf0,#efe4cc);--card-border:1px solid #c9b07a;--card-shadow:0 4px 10px rgba(0,0,0,.35);--card-num:#1d1a14;--r-card:10px;
--water:#1f6fb8;--fire:#c4421c;--stone:#5f5a50;--water-ui:#7cc0ff;--fire-ui:#ff8a5c;--stone-ui:#d4ccb8;--special:#7a3f9a;--special-bg:linear-gradient(170deg,#f8f0ff,#e6d8f0);
--back:repeating-linear-gradient(45deg,transparent 0 6px,rgba(226,183,90,.18) 6px 7px),repeating-linear-gradient(-45deg,transparent 0 6px,rgba(226,183,90,.18) 6px 7px),linear-gradient(160deg,#7a1f2b,#4a0f19);
--back-border:2px solid #d4af5f;--mono:#f0d28c;--back-mini:linear-gradient(160deg,#7a1f2b,#4a0f19);
--trump-ring:#e2b75a;--trump-ring-ink:#1e1504;--btn2:rgba(246,239,224,.09);--danger-ink:#ffb3a3;--allin-bg:rgba(160,40,30,.35);
--ava-bg:linear-gradient(160deg,#3a2b14,#1b140a);--ava-ink:#f0d28c;--r-m:14px;--r-l:22px;
--don-veil:radial-gradient(80% 50% at 50% 34%,rgba(255,196,110,.22),transparent 70%),rgba(6,12,9,.94);--don-title:#f3cf78;
--choice-bg:linear-gradient(180deg,rgba(255,240,210,.09),rgba(255,240,210,.03));--choice-border:1.5px solid rgba(226,183,90,.35);
--choice-best-border:2px solid #e2b75a;--choice-best-shadow:0 0 0 4px rgba(226,183,90,.15);--meter-bg:rgba(255,255,255,.1);--meter:linear-gradient(90deg,#c9962f,#f3cf78);--win:#9be38a}
.phone{--texture-opacity:1}
.card.back .mono{font-style:italic;text-shadow:0 1px 0 #000}
.card.back::after{content:"";position:absolute;inset:6px;border:1px solid rgba(240,210,140,.55);border-radius:6px}
''',
        back='<div class="card back"><div class="mono">ВБ</div></div>'),
    'b': dict(
        title='B · Неон-нуар',
        desc='Розвиток поточного стилю, але стриманий: темний графіт, світиться лише важливе (твій хід, головна кнопка, банк). Шрифти: Oswald (заголовки й цифри) + Inter (інтерфейс).',
        css='''
:root{--font-display:Oswald,Impact,sans-serif;--font-num:Oswald,Impact,sans-serif;--font-ui:Inter,system-ui,sans-serif;
--bg:#0a0910;--ink:#f1eef8;--muted:#a8a2bd;--panel:#15131f;--line:rgba(255,255,255,.12);
--texture:radial-gradient(100% 45% at 50% 0%,rgba(255,47,146,.12),transparent 65%),radial-gradient(80% 35% at 50% 100%,rgba(34,230,255,.08),transparent);
--gold:#ffd25a;--accent:#ff2f92;--accent-ink:#fff;--accent-shadow:0 0 22px rgba(255,47,146,.55);
--act-bg:#ff2f92;--act-ink:#fff;--wait-bg:#1b1828;--wait-ink:#cfc9e2;
--felt:radial-gradient(ellipse at 50% 40%,#131c25,#0c1118);--felt-border:1px solid rgba(34,230,255,.28);--felt-shadow:inset 0 0 40px rgba(0,0,0,.6);
--trump-bg:#1c1a29;--hi:#ffb36b;--lo:#7fd6ff;--bet-bg:#1c1a29;--bet-hot-bg:#ff2f92;--bet-hot-ink:#fff;
--pot-ink:#fff;--jack:#ff8ac4;--jack-bg:rgba(255,47,146,.14);
--card-bg:#17141f;--card-border:1.5px solid var(--c);--card-shadow:0 4px 12px rgba(0,0,0,.5);--card-num:#fff;--r-card:11px;
--water:#38c3ff;--fire:#ff7a3d;--stone:#c7c0b0;--special:#c58bff;--special-bg:#1b1526;
--back:radial-gradient(circle at 50% 50%,rgba(255,47,146,.5) 0 13%,transparent 14%),repeating-linear-gradient(0deg,transparent 0 9px,rgba(255,47,146,.16) 9px 10px),repeating-linear-gradient(90deg,transparent 0 9px,rgba(255,47,146,.16) 9px 10px),#1a0f22;
--back-border:1.5px solid #ff2f92;--mono:#fff;--back-mini:#2a1236;
--trump-ring:#ffd25a;--trump-ring-ink:#1a1400;--btn2:#1d1a2a;--danger-ink:#ff9cc6;--allin-bg:#2a1426;
--ava-bg:#221d33;--ava-ink:#fff;--r-m:14px;--r-l:20px;
--don-veil:radial-gradient(70% 40% at 50% 34%,rgba(255,47,146,.2),transparent 70%),rgba(6,5,10,.95);--don-title:#fff;
--choice-bg:#15131f;--choice-border:1px solid rgba(255,255,255,.12);--choice-best-border:1.5px solid #22e6ff;--choice-best-shadow:0 0 18px rgba(34,230,255,.35);
--meter-bg:#262338;--meter:#22e6ff;--win:#7dff9b}
.pot .num{text-shadow:0 0 18px rgba(255,210,90,.55)}
.phase.act{box-shadow:0 0 20px rgba(255,47,146,.45)}
.card .big{text-shadow:0 0 10px color-mix(in srgb,var(--c) 60%,transparent)}
.don h2{text-shadow:0 0 22px rgba(255,47,146,.6);text-transform:uppercase}
''',
        back=''),
    'c': dict(
        title='C · Сучасний мінімал',
        desc='Плоскі виразні кольори, великі форми, чиста типографіка, без світіння й фактур. Шрифти: Unbounded (заголовки й цифри) + Manrope (інтерфейс).',
        css='''
:root{--font-display:Unbounded,system-ui,sans-serif;--font-num:Unbounded,system-ui,sans-serif;--font-ui:Manrope,system-ui,sans-serif;
--bg:#14151b;--ink:#ffffff;--muted:#a3a6b5;--panel:#1e2029;--line:rgba(255,255,255,.1);--texture:none;
--gold:#ffc83d;--accent:#7b61ff;--accent-ink:#fff;--accent-shadow:none;
--act-bg:#7b61ff;--act-ink:#fff;--wait-bg:#262833;--wait-ink:#c9ccd8;
--felt:#1f7a5a;--felt-border:0;--felt-shadow:none;
--trump-bg:rgba(0,0,0,.22);--hi:#ffd6a0;--lo:#cfe6ff;--bet-bg:rgba(0,0,0,.22);--bet-hot-bg:#ffc83d;--bet-hot-ink:#1a1400;
--pot-ink:#fff;--jack:#1a1400;--jack-bg:#ffc83d;
--card-bg:#ffffff;--card-border:0;--card-shadow:0 2px 0 rgba(0,0,0,.25);--card-num:#14151b;--r-card:14px;
--water:#1e7bff;--fire:#ff5a1f;--stone:#6b6f7d;--water-ui:#8ec0ff;--fire-ui:#ffa06f;--stone-ui:#d7d9e0;--special:#7b61ff;--special-bg:#f1edff;
--back:#7b61ff;--back-border:0;--mono:#fff;--back-mini:#7b61ff;
--trump-ring:#ffc83d;--trump-ring-ink:#1a1400;--btn2:#2a2c37;--danger-ink:#ff8f8f;--allin-bg:#3a2430;
--ava-bg:#ffc83d;--ava-ink:#1a1400;--r-m:16px;--r-l:26px;
--don-veil:#14151b;--don-title:#fff;
--choice-bg:#1e2029;--choice-border:0;--choice-best-border:2px solid #7b61ff;--choice-best-shadow:none;
--meter-bg:#2e3040;--meter:#7b61ff;--win:#3ee08f}
.card.back::before{content:"";position:absolute;width:70%;height:70%;left:15%;top:15%;border-radius:50%;background:#9c87ff}
.card.back::after{content:"";position:absolute;width:40%;height:40%;left:30%;top:30%;background:#ffc83d;transform:rotate(45deg);border-radius:6px}
.card.back .mono{z-index:1;color:#1a1400;font-size:calc(var(--cw)*.16)}
.pot .num{font-size:44px}
.card .big{font-weight:800}
.don .base .card{box-shadow:0 0 0 6px rgba(255,255,255,.06)}
''',
        back=''),
}


def ring(frac, color, size=34, stroke=4, track='rgba(255,255,255,.18)'):
    r = (size - stroke) / 2
    c = 2 * 3.14159 * r
    return f'''<svg viewBox="0 0 {size} {size}"><circle cx="{size/2}" cy="{size/2}" r="{r}" fill="none" stroke="{track}" stroke-width="{stroke}"/><circle cx="{size/2}" cy="{size/2}" r="{r}" fill="none" stroke="{color}" stroke-width="{stroke}" stroke-linecap="round" stroke-dasharray="{c*frac:.1f} {c:.1f}"/></svg>'''


def screen_bet(t):
    return f'''
<div class="phone">
  <div class="island"></div><div class="status"><span>21:47</span><span>87%</span></div>
  <div class="phase act">
    <div class="t">Твій хід<small>Суперник підняв на 10</small></div>
    <div class="ring">{ring(.72, 'currentColor', track='rgba(0,0,0,.2)')}<span>18</span></div>
  </div>
  <div class="opp">
    <div class="ava">О</div>
    <div class="who"><b>Оля</b>
      <div class="tags"><span class="tag"><svg><use href="#s-eye"/></svg>розвідка</span><span class="tag">·</span><span class="tag">3 карти</span></div>
    </div>
    <div class="minis"><i></i><i></i><i></i></div>
    <div class="stack">{chip()}72</div>
  </div>
  <div class="table">
    <div class="tbar">
      <span class="trump">Козир {suit('fire')} +1</span>
      <span class="deck">Раунд 5/12</span>
    </div>
    <div class="arena">
      <div class="seat"><span class="nm">Оля</span>{back()}<span class="bet hot">{chip()}+10</span></div>
      <div class="pot"><span class="lbl">Банк</span><span class="num">45</span><span class="chips">{chip()}{chip()}{chip()}</span><span class="jack">джекпот 5</span></div>
      <div class="seat"><span class="nm">Ти</span><div style="position:relative">{card(9,'water')}</div><span class="scouted"><svg><use href="#s-eye"/></svg>в Олі висока</span></div>
    </div>
    <div class="tbar"><span>Анте 10</span><span class="deck">Колода 17 · <span class="hi">↑6–10: 7</span> <span class="lo">↓1–5: 8</span> ✦2</span></div>
  </div>
  <div class="hand dim">
    <div style="position:relative">{card(7,'fire',cls='trumped')}<span class="tb">7 → 8</span></div>
    {card(3,'water')}
    {knife()}
    {card(9,'stone')}
  </div>
  <div class="acts">
    <div class="btn primary">Колл 10 <small>· лишиться 108</small></div>
    <div class="row">
      <div class="btn">Ре-рейз +5<small>лишиться 103</small></div>
      <div class="btn">Ре-рейз +10<small>лишиться 98</small></div>
      <div class="btn allin">Ва-банк<small>+72</small></div>
    </div>
    <div class="btn ghost">Пас — віддати банк 45</div>
  </div>
  <div class="me">
    <div class="ava">Т</div><div class="who"><b>Ти</b></div>
    <div class="react">😎</div>
    <div class="stack">{chip()}118</div>
  </div>
</div>'''


def screen_don(t):
    return f'''
<div class="phone">
  <div class="island"></div><div class="status"><span>21:48</span><span>87%</span></div>
  <div class="don">
    <h2>Подвій або нічого</h2>
    <div class="sub">Ризикуєш чистим виграшем <b>15</b><br>Вгадай: наступна карта більша чи менша?</div>
    <div class="base"><span class="bl">База</span>{card(5,'water')}<div class="next">{back()}</div></div>
    <div class="choices">
      <div class="choice">
        <div class="h"><svg><use href="#s-up"/></svg>Більше</div>
        <div class="meter"><i style="width:52%"></i></div>
        <div class="pc"><span>шанс <b>52%</b></span><span>× <b>1.6</b></span></div>
        <div class="win">+9<small>до 24</small></div>
      </div>
      <div class="choice">
        <div class="h"><svg><use href="#s-down"/></svg>Менше</div>
        <div class="meter"><i style="width:43%"></i></div>
        <div class="pc"><span>шанс <b>43%</b></span><span>× <b>2.0</b></span></div>
        <div class="win">+15<small>до 30</small></div>
      </div>
    </div>
    <div class="eq">Рівно (5%) — ставка повертається. Не вгадаєш — 15 іде в джекпот.</div>
    <div class="take">{chip()}Забрати виграш 15</div>
    <div class="oppline"><div class="ava" style="width:32px;height:32px;font-size:14px">О</div>Оля дивиться наживо · 72</div>
  </div>
</div>'''


def page(key, t):
    return f'''<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{t['title']} — макет «Ва-банк»</title>
<style>{FONTS}{BASE}{t['css']}
@media (max-width:440px){{body{{padding:0;gap:0;background:var(--bg)}}.phone{{border-radius:0;box-shadow:none;width:100vw;min-height:100vh}}.label{{padding:16px;background:#000}}.island,.status{{display:none}}.phone{{padding-top:max(14px,env(safe-area-inset-top))}}}}
</style></head><body>
{SYMBOLS}
<div class="label"><b>{t['title']}</b> — торги (твій хід, суперник підняв)<br>{t['desc']}<br><a href="./" style="color:#9cf">← усі напрями</a></div>
{screen_bet(t)}
<div class="label"><b>{t['title']}</b> — «Подвій або нічого»</div>
{screen_don(t)}
</body></html>'''


INDEX = '''<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ва-банк — макети дизайну</title>
<style>
body{margin:0;background:#0d0d10;color:#eee;font:16px/1.5 system-ui,-apple-system,sans-serif;padding:24px 16px 60px}
h1{font-size:24px;margin:0 0 6px}p{color:#aaa;margin:0 0 18px;max-width:720px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
a.card{display:block;border-radius:18px;padding:18px;color:#fff;text-decoration:none;min-height:120px}
a.card b{font-size:20px;display:block;margin-bottom:6px}a.card span{opacity:.85;font-size:15px}
.a{background:radial-gradient(ellipse at 50% 30%,#1f6b47,#0c3a26);border:2px solid #b8913f}
.b{background:#14111c;border:1px solid #ff2f92;box-shadow:0 0 18px rgba(255,47,146,.35)}
.c{background:#7b61ff}
.frames{display:none;gap:24px;margin-top:28px;overflow-x:auto}
.frames iframe{width:393px;height:1820px;border:0;border-radius:12px;flex-shrink:0;background:#111}
@media (min-width:900px){.frames{display:flex}}
</style></head><body>
<h1>«Ва-банк» — три візуальні напрями</h1>
<p>Однаковий стан гри в усіх трьох: 5-й раунд, козир — Вогонь, суперник підняв на 10, ти підглянув(-ла) («висока»). Другий екран — «Подвій або нічого». Відкрий кожен напрям, порівняй і напиши, який обираєш (можна з правками: «B, але кнопки як у C»).</p>
<div class="grid">
<a class="card a" href="a.html"><b>A · Підпільний клуб</b><span>Зелене сукно, латунь і золото, кремові карти, тепле світло.</span></a>
<a class="card b" href="b.html"><b>B · Неон-нуар</b><span>Темний графіт, неон лише на важливому.</span></a>
<a class="card c" href="c.html"><b>C · Сучасний мінімал</b><span>Плоскі кольори, великі форми, чиста типографіка.</span></a>
</div>
<div class="frames"><iframe src="a.html" title="A"></iframe><iframe src="b.html" title="B"></iframe><iframe src="c.html" title="C"></iframe></div>
</body></html>'''

os.makedirs(OUT, exist_ok=True)
for k, t in THEMES.items():
    with open(os.path.join(OUT, f'{k}.html'), 'w') as f:
        f.write(page(k, t))
with open(os.path.join(OUT, 'index.html'), 'w') as f:
    f.write(INDEX)
print('ok')
