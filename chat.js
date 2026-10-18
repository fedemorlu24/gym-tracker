// Chat con gli amici, senza un nostro server: messaggi cifrati da un capo all'altro (NIP-17/44/59) su relay pubblici Nostr.
// La chiave segreta è generata sul telefono e resta nel backup. Si accettano solo messaggi da amici o con il gettone del tuo invito.
const CHAT_RELAYS = ['wss://nos.lol', 'wss://relay.damus.io', 'wss://relay.primal.net', 'wss://offchain.pub'];
const CHAT_EMOJI = ['💪', '🔥', '🏆', '👏', '🏋️', '❤️', '😂', '👍', '🥵', '💯', '🎉', '🙌', '😮', '🤝', '🥇', '⚡'];
const CHAT_REACT = ['❤️', '💪', '🔥', '🏆', '👏', '😂'];
const CHAT_IMG_MAX = 29000;       // byte per foto: cifrata due volte (sigillo e busta NIP-59) deve restare sotto i 64 KB di NIP-44
const CHAT_BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const CHAT_KEEP = 400;            // messaggi tenuti per conversazione

// ---------- stato e chiavi ----------
let NT = null, ntLoading = null;
function nostrLoad() {
  if (NT) return Promise.resolve(NT);
  if (window.NostrTools) return Promise.resolve(NT = window.NostrTools);
  return ntLoading || (ntLoading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'nostr-tools.js?v=' + ((document.querySelector('script[src^="chat.js"]') || {src: ''}).src.split('?v=')[1] || '1');
    s.onload = () => { NT = window.NostrTools; res(NT); }; s.onerror = () => { ntLoading = null; rej(new Error('nostr')); };
    document.head.appendChild(s);
  }));
}
const chat = () => db.chat || (db.chat = {friends: {}, msgs: {}, relays: CHAT_RELAYS.slice(), sync: 0, seen: [], blocked: []});
const chatFriends = () => Object.values(chat().friends).filter(f => !f.hid).sort((a, b) => (lastMsg(b.pk) ? lastMsg(b.pk).t : b.added || 0) - (lastMsg(a.pk) ? lastMsg(a.pk).t : a.added || 0));
const lastMsg = pk => { const l = (chat().msgs[pk] || []).filter(m => m.k !== 'rx'); return l[l.length - 1]; };
const chatUnreadTotal = () => Object.values(chat().friends).reduce((a, f) => a + (f.unread || 0), 0);
async function chatInit() {
  const nt = await nostrLoad(), c = chat();
  if (!c.sk) {
    const sk = nt.generateSecretKey();
    c.sk = toHex(sk); c.pk = nt.getPublicKey(sk);
    c.tok = toHex(nt.generateSecretKey()).slice(0, 24);
    save();
  }
  return c;
}
const toHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const fromHex = h => Uint8Array.from(h.match(/../g), x => parseInt(x, 16));
const skBytes = () => fromHex(chat().sk);
const nowSec = () => Math.floor(Date.now() / 1000);

// ---------- relay ----------
const relays = {};   // url → {ws, open, tries, timer, q}
let chatTimer = null;
function chatOnline() { return Object.values(relays).filter(r => r.open).length; }
function relayConnect(url) {
  const r = relays[url] || (relays[url] = {open: false, tries: 0, q: []});
  if (r.ws && (r.ws.readyState === 0 || r.ws.readyState === 1)) return;
  let ws; try { ws = new WebSocket(url); } catch (e) { return; }
  r.ws = ws;
  ws.onopen = () => {
    r.open = true; r.tries = 0;
    ws.send(JSON.stringify(['REQ', 'gt', {kinds: [1059], '#p': [chat().pk], since: Math.max(0, chat().sync - 3 * 86400)}]));
    r.q.splice(0).forEach(m => ws.send(m));
    chatRefresh();
  };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m[0] === 'EVENT' && m[2]) chatReceive(m[2]);
    else if (m[0] === 'OK') chatAcked(m[1], m[2], url);
    else if (m[0] === 'EOSE') { chat().sync = nowSec(); save(); }
  };
  ws.onclose = ws.onerror = () => {
    if (r.ws !== ws) return;
    r.open = false; clearTimeout(r.timer);
    if (!chat().relays.includes(url) || document.hidden) return;
    r.timer = setTimeout(() => relayConnect(url), Math.min(60000, 2500 * Math.pow(2, r.tries++)));
    chatRefresh();
  };
}
function chatConnect() {
  chat().relays.forEach(relayConnect);
  Object.keys(relays).forEach(u => { if (!chat().relays.includes(u)) { try { relays[u].ws.close(); } catch (e) {} delete relays[u]; } });
}
function relaySend(ev) {
  const m = JSON.stringify(['EVENT', ev]);
  chat().relays.forEach(u => { const r = relays[u]; if (!r) { relayConnect(u); relays[u].q.push(m); } else if (r.open) r.ws.send(m); else r.q.push(m); });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && db.chat && db.chat.sk) chatConnect(); });
window.addEventListener('online', () => { if (db.chat && db.chat.sk) chatConnect(); });
const pending = {};   // id del wrap → id del messaggio (per la spunta di consegna)
function chatAcked(wrapId, ok, url) {
  const mid = pending[wrapId]; if (!mid || !ok) return;
  Object.values(chat().msgs).forEach(l => { const m = l.find(x => x.id === mid); if (m && !m.ok) { m.ok = 1; } });
  save(); chatRefresh();
}

// ---------- invio e ricezione ----------
async function chatSend(pk, body) {
  const nt = await nostrLoad(), c = await chatInit();
  const rumor = nt.nip59.createRumor({kind: 14, content: JSON.stringify(body), tags: [['p', pk]], created_at: nowSec()}, skBytes());
  const wrap = nt.nip59.createWrap(nt.nip59.createSeal(rumor, skBytes(), pk), pk);
  pending[wrap.id] = rumor.id;
  chatConnect(); relaySend(wrap);
  const m = {id: rumor.id, from: 'me', t: rumor.created_at, k: body.k, x: body.x, to: body.to, e: body.e, ex: body.ex, kg: body.kg, rp: body.rp, w: body.w, h: body.h, ok: 0};
  if (body.k === 'img') { await imgPut(rumor.id, body.d); m.d = 1; }
  if (body.k !== 'hi' && body.k !== 'pf') chatStore(pk, m);
  return m;
}
function chatStore(pk, m) {
  const l = chat().msgs[pk] || (chat().msgs[pk] = []);
  if (l.some(x => x.id === m.id)) return false;
  l.push(m); l.sort((a, b) => a.t - b.t);
  while (l.length > CHAT_KEEP) { const o = l.shift(); if (o.d) imgDel(o.id); }
  save(); return true;
}
// apre una busta: verifica le firme e che il mittente sia chi dice di essere
function chatOpen(wrap) {
  if (!NT.verifyEvent(wrap) || wrap.kind !== 1059) return null;
  const sk = skBytes();
  const seal = JSON.parse(NT.nip44.decrypt(wrap.content, NT.nip44.getConversationKey(sk, wrap.pubkey)));
  if (seal.kind !== 13 || !NT.verifyEvent(seal)) return null;
  const rumor = JSON.parse(NT.nip44.decrypt(seal.content, NT.nip44.getConversationKey(sk, seal.pubkey)));
  if (rumor.pubkey !== seal.pubkey || rumor.kind !== 14) return null;
  return rumor;
}
async function chatReceive(wrap) {
  const c = chat();
  if (!wrap || !wrap.id || c.seen.includes(wrap.id)) return;
  try { await nostrLoad(); } catch (e) { return; }
  c.seen.push(wrap.id); if (c.seen.length > 3000) c.seen.splice(0, 500);
  let r, b;
  try { r = chatOpen(wrap); b = r && JSON.parse(r.content); } catch (e) { return; }
  if (!r || !b || typeof b !== 'object') return;
  const from = r.pubkey; if (from === c.pk || c.blocked.includes(from)) return;
  if (b.k === 'hi') {            // un amico ha aperto il tuo invito: si accetta solo con il tuo gettone
    if (b.tok !== c.tok && !c.friends[from]) return;
    if (!c.friends[from]) { c.friends[from] = {pk: from, n: String(b.n || '?').slice(0, 30), added: nowSec(), unread: 0}; save(); chatRefresh(); toast(t('chatAdded', esc(c.friends[from].n))); }
    if (AV_OK(b.av)) { c.friends[from].av = b.av; save(); }
    if (c.av) chatSend(from, {k: 'pf', av: c.av});
    chatRefresh(); return;
  }
  const f = c.friends[from]; if (!f) return;
  if (b.k === 'pf') { f.av = AV_OK(b.av) ? b.av : ''; save(); chatRefresh(); return; }
  const m = {id: r.id, from: 'them', t: Math.min(r.created_at, nowSec()), k: String(b.k || 't').slice(0, 3), x: typeof b.x === 'string' ? b.x.slice(0, b.k === 'sf' || b.k === 'sc' ? 120000 : 2000) : '', to: String(b.to || '').slice(0, 64),
    e: String(b.e || '').slice(0, 8), ex: String(b.ex || '').slice(0, 60), kg: +b.kg || 0, rp: +b.rp || 0, w: +b.w || 0, h: +b.h || 0};
  if (m.k === 'img') { if (typeof b.d !== 'string' || !/^data:image\/jpeg;base64,/.test(b.d) || b.d.length > 66000) return; await imgPut(r.id, b.d); m.d = 1; }
  if (!['t', 'img', 'rx', 'pr', 'em', 'sf', 'sc'].includes(m.k)) return;
  if ((m.k === 'sf' && !parseChallenge(m.x)) || (m.k === 'sc' && !parsePlan(m.x))) return;
  if (!chatStore(from, m)) return;
  if (f.hid && m.k !== 'rx') f.hid = 0;
  if (m.k !== 'rx' && !(view.name === 'chat' && view.id === from && !document.hidden)) f.unread = (f.unread || 0) + 1;
  save(); chatRefresh();
  if (view.name === 'chat' && view.id === from && !document.hidden && (m.k === 'rx' || m.k === 'em')) setTimeout(() => chatBurst(m.k === 'rx' ? m.e : [...m.x][0], document.querySelector(`.cm[data-mid="${m.k === 'rx' ? m.to : m.id}"]`)), 60);
}

// ---------- foto ----------
const imgCache = {};
function imgPut(id, data) { imgCache[id] = data; return photoTx('readwrite', st => st.put({id: 'c:' + id, date: today(), pose: 'chat', data, blob: new Blob([data])})).catch(() => {}); }
function imgDel(id) { delete imgCache[id]; photoTx('readwrite', st => st.delete('c:' + id)).catch(() => {}); }
async function imgGet(id) {
  if (imgCache[id]) return imgCache[id];
  try { const r = await photoTx('readonly', st => st.get('c:' + id)); if (r && r.data) return imgCache[id] = r.data; } catch (e) {}
  return '';
}
// riduce la foto finché sta nel limite
function chatShrink(file) {
  const fit = (src, W, H) => {
    let side = 720, q = .72;
    for (let i = 0; i < 14; i++) {
      const k = Math.min(1, side / Math.max(W, H)), c = document.createElement('canvas');
      c.width = Math.round(W * k); c.height = Math.round(H * k);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      const d = c.toDataURL('image/jpeg', q);
      if (d.length * .75 <= CHAT_IMG_MAX) return {d, w: c.width, h: c.height};
      if (q > .42) q -= .08; else side = Math.round(side * .82);
    }
    throw new Error('big');
  };
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(u); try { res(fit(img, img.naturalWidth, img.naturalHeight)); } catch (e) { rej(e); } };
    // se il browser non legge il formato come immagine (es. HEIC), prova a decodificarlo direttamente
    img.onerror = () => { URL.revokeObjectURL(u); (window.createImageBitmap ? createImageBitmap(file) : Promise.reject(new Error('img'))).then(bm => res(fit(bm, bm.width, bm.height))).catch(rej); };
    img.src = u;
  });
}

// foto del profilo: quadrata e minuscola (circa 4 KB), viaggia con l'invito e si aggiorna agli amici
const AV_OK = d => typeof d === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d) && d.length < 16000;
function chatAvatarFrom(file) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(u);
      const c = document.createElement('canvas'); c.width = c.height = 112; const g = c.getContext('2d'), k = Math.min(img.width, img.height);
      g.drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, 112, 112);
      res(c.toDataURL('image/jpeg', .72));
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('img')); };
    img.src = u;
  });
}
async function chatSetAvatar(file) {
  await chatInit(); const c = chat();
  c.av = file ? await chatAvatarFrom(file) : ''; save();
  chatFriends().forEach(f => chatSend(f.pk, {k: 'pf', av: c.av}));
}
// ---------- inviti ----------
const chatLink = () => INVITE_URL + '#chat=' + b64e({v: 1, k: chat().pk, n: nick() || '?', t: chat().tok});
function parseChatLink(text) {
  const m = String(text || '').match(/chat=([A-Za-z0-9_-]{20,1000})/);
  if (!m) return null;
  try { const o = b64d(m[1]); if (o.v !== 1 || !/^[0-9a-f]{64}$/.test(o.k || '') || typeof o.t !== 'string') return null; return {pk: o.k, n: String(o.n || '?').slice(0, 30), tok: o.t.slice(0, 40)}; } catch (e) { return null; }
}
async function chatAccept(o) {
  await chatInit(); const c = chat();
  if (o.pk === c.pk) { toast(t('ownChallenge')); return; }
  const had = !!c.friends[o.pk];
  c.friends[o.pk] = {...(c.friends[o.pk] || {}), pk: o.pk, n: o.n, added: nowSec(), unread: 0, hid: 0};
  c.blocked = c.blocked.filter(x => x !== o.pk); save();
  await chatSend(o.pk, {k: 'hi', n: nick() || '🙂', tok: o.tok, av: c.av || ''});
  closeSheet(); go({name: 'chat', id: o.pk, from: 'chat'});
  toast(had ? t('chatReopened', esc(o.n)) : t('chatAdded', esc(o.n)));
}
// invito aperto da un link (come per sfide e schede)
function chatLinkSheet(o, raw) {
  const accept = () => needNick(() => chatAccept(o));
  if (standalone() || !isIOS) { accept(); return true; }
  shareText = INVITE_URL + '#chat=' + raw;
  needNick(async () => { await chatAccept(o);
    setTimeout(() => sheet(`<h2>${esc(t('chatAdded', o.n))}</h2><p class="sub" style="margin-bottom:14px">${t('chatInBrowserNote')}</p><button class="btn p wide" data-act="copytext">${t('copyLink')}</button>`), 700); });
  return true;
}
function sheetChatInvite() {
  needNick(async () => {
    await chatInit(); chatConnect();
    const msg = t('chatInviteMsg', nick() || '🙂') + '\n' + chatLink();
    shareText = msg;
    sheet(`<h2>${t('chatInviteBtn')}</h2><p class="sub" style="margin-bottom:12px">${t('chatInviteText')}</p>
      <button class="btn p wide" data-act="sharetext">${icon('share')} ${t('shareWord')}</button><div class="gap"></div>
      <button class="btn s wide" data-act="copytext">${t('copyLink')}</button><div class="gap"></div>
      <button class="btn s wide" data-act="chatpaste" style="background:var(--fill)">${t('chatPasteBtn')}</button>
      <p class="note" style="padding:12px 2px 0">${t('chatPrivacy')}</p>`);
  });
}

// ---------- schermate ----------
const avaGrad = n => { let h = 0; for (const ch of String(n)) h = (h * 31 + ch.charCodeAt(0)) % 360; return `linear-gradient(135deg,hsl(${h} 85% 58%),hsl(${(h + 40) % 360} 85% 48%))`; };
const ava = (n, s = 46, av) => av ? `<span class="cava ph" style="width:${s}px;height:${s}px"><img src="${av}" alt=""></span>` : `<span class="cava" style="width:${s}px;height:${s}px;background:${avaGrad(n)};font-size:${Math.round(s * .42)}px">${esc(String(n).trim().charAt(0).toUpperCase() || '?')}</span>`;
const chatTime = ts => { const d = new Date(ts * 1000), n = new Date();
  return d.toDateString() === n.toDateString() ? d.toLocaleTimeString(locale, {hour: '2-digit', minute: '2-digit'}) : d.toLocaleDateString(locale, {day: 'numeric', month: 'short'}); };
const prevText = m => !m ? t('chatNoMsg') : m.k === 'img' ? t('chatPhotoMsg') : m.k === 'sf' ? '🏁 ' + t('chatChallengeMsg') : m.k === 'sc' ? '📋 ' + t('chatPlanMsg') : m.k === 'pr' ? `🏆 ${m.ex}` : m.k === 'em' ? m.x : (m.from === 'me' ? t('chatYou') + ': ' : '') + m.x;
function chatInbox() {
  const fr = chatFriends();
  let html = `<button class="btn p wide" data-act="chatinvite" style="margin-bottom:8px">${icon('plus')} ${t('chatInviteBtn')}</button>
    <button class="btn s wide" data-act="chatpaste" style="margin-bottom:12px;background:var(--fill)">${t('chatPasteBtn')}</button>`;
  if (!fr.length) return html + `<div class="empty" style="padding:30px 14px">${t('chatEmpty')}</div><p class="note" style="padding:0 6px">${t('chatPrivacy')}</p>`;
  html += `<div class="list">${fr.map(f => { const m = lastMsg(f.pk);
    return `<button class="row chatrow" data-act="chatopen" data-pk="${f.pk}">${ava(f.n, 46, f.av)}<div class="grow"><h3>${esc(f.n)}</h3><div class="sub${f.unread ? ' unread' : ''}">${esc(prevText(m))}</div></div>
      <div class="chtime">${m ? chatTime(m.t) : ''}${f.unread ? `<i class="cdot">${f.unread > 9 ? '9+' : f.unread}</i>` : ''}</div></button>`; }).join('')}</div>
    <p class="note" style="margin-top:12px">${chatStatus()}</p>`;
  return html;
}
const chatStatus = () => t('chatConnected', chatOnline(), chat().relays.length);
function bubbleHtml(pk, m, list) {
  const rx = list.filter(x => x.k === 'rx' && x.to === m.id), mine = m.from === 'me';
  const rxs = rx.length ? `<div class="crx">${Object.entries(rx.reduce((a, x) => (a[x.e] = (a[x.e] || 0) + 1, a), {})).map(([e, n]) => `<span>${e}${n > 1 ? n : ''}</span>`).join('')}</div>` : '';
  let body;
  if (m.k === 'img') body = `<img class="cimg" src="${CHAT_BLANK}" data-imgid="${m.id}" data-act="chatimg" alt="${esc(t('chatPhoto'))}" ${m.w ? `style="aspect-ratio:${m.w}/${m.h}"` : ''}>`;
  else if (m.k === 'pr') body = `<div class="cpr"><b>🏆 ${t('record')}</b><span>${esc(m.ex)}</span><strong>${fmtKg(m.kg)} kg × ${m.rp}</strong><small>Gym Tracker</small></div>`;
  else if (m.k === 'sf') { const o = parseChallenge(m.x) || {n: '?', l: []};
    body = `<div class="cpr"><b>🏁 ${t('chatChallengeMsg')}</b><span>${esc(o.n)}</span><small>${t('chatLifts', o.l.length)}</small>${mine ? '' : `<button class="btn s" data-act="chatlinkopen" data-mid="${m.id}">${t('chatAddChallenge')}</button>`}</div>`; }
  else if (m.k === 'sc') { const o = parsePlan(m.x) || {name: '?', days: []};
    body = `<div class="cpr"><b>📋 ${t('chatPlanMsg')}</b><span>${esc(o.name)}</span><small>${t('chatDays', o.days.length)}${o.author ? ' · ' + esc(o.author) : ''}</small>${mine ? '' : `<button class="btn s" data-act="chatlinkopen" data-mid="${m.id}">${t('chatSavePlan')}</button>`}</div>`; }
  else if (m.k === 'em') return `<div class="cm ${mine ? 'me' : 'them'}" data-mid="${m.id}"><div class="cbig">${esc(m.x)}</div>${rxs}<span class="ct">${chatTime(m.t)}</span></div>`;
  else body = `<div class="cb">${esc(m.x).replace(/\n/g, '<br>')}</div>`;
  return `<div class="cm ${mine ? 'me' : 'them'}" data-mid="${m.id}">${body}${rxs}<span class="ct">${chatTime(m.t)}${mine ? (m.ok ? ' ✓' : ' …') : ''}</span></div>`;
}
function chatList(pk) {
  const l = chat().msgs[pk] || [], vis = l.filter(m => m.k !== 'rx');
  if (!vis.length) return `<div class="empty" style="padding:40px 14px">${t('chatStart')}</div>`;
  let day = '', out = '';
  vis.forEach(m => {
    const dk = new Date(m.t * 1000).toDateString();
    if (dk !== day) { day = dk; out += `<div class="cday">${new Date(m.t * 1000).toDateString() === new Date().toDateString() ? t('chatToday') : new Date(m.t * 1000).toLocaleDateString(locale, {weekday: 'short', day: 'numeric', month: 'short'})}</div>`; }
    out += bubbleHtml(pk, m, l);
  });
  return out;
}
function chatView() {
  const pk = view.id, f = chat().friends[pk];
  return `<header class="chead"><button class="ib" data-act="home" aria-label="${t('back')}">${icon('back')}</button>
      ${ava(f.n, 38, f.av)}<div class="t small"><h1>${esc(f.n)}</h1><p id="chat-status">${chatStatus()}</p></div>
      <button class="ib" data-act="chatmenu" data-pk="${pk}" aria-label="${t('chatSettings')}">${icon('more')}</button></header>
    <div class="clist" id="chat-list">${chatList(pk)}</div>
    <div class="cbar" id="cbar"><div class="ctray" id="ctray" hidden>${CHAT_EMOJI.map(e => `<button data-act="chatemoji" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
      <form data-form="chatsend" data-pk="${pk}"><button type="button" class="ib" data-act="chatpick" aria-label="${t('chatPhoto')}">${icon('camera')}</button>
      <input name="x" id="cinput" placeholder="${esc(t('chatPh'))}" autocomplete="off" enterkeyhint="send" maxlength="1000">
      <button type="button" class="ib" data-act="chattray" aria-label="emoji">😀</button><button class="csend" aria-label="${t('chatSend')}">${icon('fwd')}</button></form>
      <input type="file" id="cfile" accept="image/*" hidden></div>`;
}
// aggiorna senza ridisegnare tutto: lista messaggi o elenco chat
// aggiorna la conversazione aperta senza ridisegnarla: i messaggi nuovi si aggiungono in fondo, la posizione resta
function chatRefresh(toBottom) {
  if (view.name === 'chat' && chat().friends[view.id]) {
    const el = document.getElementById('chat-list'); if (!el) return;
    const l = chat().msgs[view.id] || [], vis = l.filter(m => m.k !== 'rx'), rxN = l.length - vis.length;
    const shown = [...el.querySelectorAll('.cm[data-mid]')].map(x => x.dataset.mid);
    const near = toBottom || el.scrollHeight - el.scrollTop - el.clientHeight < 160, top = el.scrollTop;
    const prefix = shown.length && shown.length <= vis.length && shown.every((id, i) => vis[i].id === id) && el._rx === rxN;
    if (prefix && shown.length < vis.length) {
      let day = new Date(vis[shown.length - 1].t * 1000).toDateString(), out = '';
      vis.slice(shown.length).forEach(m => {
        const dk = new Date(m.t * 1000).toDateString();
        if (dk !== day) { day = dk; out += `<div class="cday">${t('chatToday')}</div>`; }
        out += bubbleHtml(view.id, m, l).replace('class="cm ', 'class="cm cnew ');
      });
      el.insertAdjacentHTML('beforeend', out); chatImgs();
    } else if (!prefix) { el.innerHTML = chatList(view.id); el._rx = rxN; chatImgs(); }
    vis.forEach(m => { if (m.from === 'me' && m.ok) { const ct = el.querySelector(`.cm[data-mid="${m.id}"] > .ct`); if (ct && ct.textContent.endsWith(' …')) ct.textContent = ct.textContent.slice(0, -2) + ' ✓'; } });
    requestAnimationFrame(() => { if (near) el.scrollTo({top: el.scrollHeight, behavior: toBottom ? 'smooth' : 'auto'}); else el.scrollTop = top; });
    const st = document.getElementById('chat-status'); if (st) st.textContent = chatStatus();
    if (chat().friends[view.id].unread) { chat().friends[view.id].unread = 0; save(); }
  } else if (view.name === 'home') render();
  const tb = document.querySelector('.tabbar [data-tab=chat] i'); if (tb) { const n = chatUnreadTotal(); tb.textContent = n > 9 ? '9+' : n; tb.hidden = !n; }
}
// la foto vera si carica da IndexedDB: nel frattempo c'è un'immagine trasparente, mai un'icona rotta
function chatImgs() { document.querySelectorAll('img[data-imgid]').forEach(i => { if (!i.dataset.ok) imgGet(i.dataset.imgid).then(d => { if (d) { i.src = d; i.dataset.ok = '1'; } }); }); }
function chatEnter(pk) {
  const f = chat().friends[pk]; if (f && f.unread) { f.unread = 0; save(); }
  chatImgs();
  const el = document.getElementById('chat-list'); if (el) { el._rx = (chat().msgs[pk] || []).filter(m => m.k === 'rx').length; el.scrollTop = el.scrollHeight; }
  chatConnect();
  const file = document.getElementById('cfile');
  if (file) file.onchange = async () => {
    const x = file.files[0]; file.value = ''; if (!x) return;
    try { const r = await chatShrink(x); await chatSend(pk, {k: 'img', d: r.d, w: r.w, h: r.h}); chatRefresh(true); } catch (e) { alert(t('chatPhotoFail')); }
  };
}
// tastiera su iPhone: la barra sale sopra la tastiera
if (window.visualViewport) {
  const kb = () => {
    const v = window.visualViewport, h = document.documentElement.clientHeight, k = Math.max(0, Math.round(h - v.height - v.offsetTop));
    document.documentElement.style.setProperty('--kb', k + 'px'); document.documentElement.classList.toggle('kbopen', k > 60);
    if (k > 60) { const el = document.getElementById('chat-list'); if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 220) el.scrollTop = el.scrollHeight; }
  };
  window.visualViewport.addEventListener('resize', kb); window.visualViewport.addEventListener('scroll', kb);
}

// ---------- reazioni: doppio tocco = cuore, pressione lunga = scelta emoji ----------
let lastTap = {id: '', t: 0}, pressT = null;
function chatBurst(e, anchor) {
  const r = anchor ? anchor.getBoundingClientRect() : {left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0};
  try { navigator.vibrate && navigator.vibrate(12); } catch (x) {}
  for (let i = 0; i < 9; i++) {
    const d = document.createElement('div'); d.className = 'cburst'; d.textContent = e;
    d.style.left = (r.left + r.width / 2 + (Math.random() * 90 - 45)) + 'px'; d.style.top = (r.top + r.height / 2) + 'px';
    d.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px'); d.style.setProperty('--dy', -(110 + Math.random() * 170) + 'px');
    d.style.setProperty('--rot', (Math.random() * 80 - 40) + 'deg'); d.style.animationDelay = (i * 40) + 'ms'; d.style.fontSize = (22 + Math.random() * 22) + 'px';
    document.body.appendChild(d); setTimeout(() => d.remove(), 1500);
  }
}
function chatReact(mid, e) {
  chatBurst(e, document.querySelector(`.cm[data-mid="${mid}"]`));
  const pk = view.id, l = chat().msgs[pk] || [], mine = l.find(x => x.k === 'rx' && x.to === mid && x.from === 'me' && x.e === e);
  if (mine) return;   // una sola reazione uguale per messaggio
  chatSend(pk, {k: 'rx', to: mid, e}).then(chatRefresh);
}
function chatPickReaction(mid, anchor) {
  document.querySelectorAll('.crxbar').forEach(x => x.remove());
  const bar = document.createElement('div'); bar.className = 'crxbar';
  bar.innerHTML = CHAT_REACT.map(e => `<button data-e="${e}">${e}</button>`).join('');
  const r = anchor.getBoundingClientRect();
  bar.style.top = Math.max(70, r.top - 54 + window.scrollY) + 'px'; bar.style.left = Math.min(Math.max(8, r.left), window.innerWidth - 270) + 'px';
  bar.onclick = ev => { const b = ev.target.closest('button'); if (b) { chatReact(mid, b.dataset.e); } bar.remove(); };
  document.body.appendChild(bar); setTimeout(() => document.addEventListener('click', () => bar.remove(), {once: true}), 50);
}
document.addEventListener('click', ev => {
  const m = ev.target.closest && ev.target.closest('.cm'); if (!m || view.name !== 'chat' || ev.target.closest('[data-act=chatimg]') && false) return;
  const now = Date.now();
  if (lastTap.id === m.dataset.mid && now - lastTap.t < 320) { lastTap = {id: '', t: 0}; chatReact(m.dataset.mid, '❤️'); const h = document.createElement('div'); h.className = 'cheart'; h.textContent = '❤️'; m.appendChild(h); setTimeout(() => h.remove(), 700); }
  else lastTap = {id: m.dataset.mid, t: now};
});
document.addEventListener('pointerdown', ev => {
  const m = ev.target.closest && ev.target.closest('.cm'); if (!m || view.name !== 'chat') return;
  clearTimeout(pressT); pressT = setTimeout(() => chatPickReaction(m.dataset.mid, m), 480);
});
['pointerup', 'pointermove', 'pointercancel', 'scroll'].forEach(e => document.addEventListener(e, () => clearTimeout(pressT), true));

// ---------- menu, impostazioni, condivisione di un record ----------
function sheetChatMenu(pk) {
  const f = chat().friends[pk], tel = f.tel ? '+' + f.tel : '';
  sheet(`<h2>${esc(f.n)}</h2>
    <a class="btn s wide" href="https://wa.me/${f.tel || ''}?text=${encodeURIComponent(t('chatWaMsg', nick() || '🙂') + '\n' + INVITE_URL)}" target="_blank" rel="noopener">${t('chatWaNudge')}</a><div class="gap"></div>
    <form data-form="chatfriend" data-pk="${pk}"><label class="field">${t('name')}<input name="n" value="${esc(f.n)}" maxlength="30"></label>
    <label class="field">${t('friendTel')}<input name="p" value="${tel}" inputmode="tel" placeholder="+39 333 1234567"></label>
    <p class="sub" style="margin-bottom:12px">${t('chatTelHint')}</p><button class="btn p wide">${t('save')}</button></form><div class="gap"></div>
    <button class="btn s wide" data-act="chatclear" data-pk="${pk}" style="background:var(--fill)">${t('chatDelete')}</button><div class="gap"></div>
    <button class="btn s wide" data-act="chatremove" data-pk="${pk}" style="background:var(--fill)">${t('chatRemove')}</button><div class="gap"></div>
    <button class="btn d wide" data-act="chatblock" data-pk="${pk}">${t('chatBlock')}</button>`);
}
function sheetChatSettings() {
  const c = chat(), list = c.relays;
  sheet(`<h2>${t('chatSettings')}</h2>
    <div class="myav">${ava(nick() || '?', 72, c.av)}<div class="grow"><h3>${esc(nick() || '')}</h3><button class="btn s" data-act="chatavatar" style="min-height:40px;margin-top:6px">${icon('camera')} ${t('chatAvatar')}</button>${c.av ? ` <button class="ib txt" data-act="chatavatardel">${t('delete')}</button>` : ''}</div><input type="file" id="avfile" accept="image/*" hidden></div>
    <p class="note" style="padding:0 2px 12px">${t('chatPrivacy')}</p>
    <p class="glabel">${t('chatRelays')}</p><p class="sub" style="margin-bottom:8px">${t('chatRelaysText')} ${chatStatus()}</p>
    <div class="list">${list.map(u => `<div class="row"><div class="grow"><h3 style="font-size:15px">${esc(u.replace('wss://', ''))}</h3><div class="sub">${relays[u] && relays[u].open ? t('chatUp') : t('chatDown')}</div></div><button class="ib" data-act="chatrdel" data-u="${esc(u)}" aria-label="${t('delete')}">✕</button></div>`).join('')}</div>
    <form data-form="chatrelay" style="margin-top:10px"><label class="field">${t('chatRelayAdd')}<input name="u" placeholder="wss://…" inputmode="url" autocomplete="off"></label><button class="btn s wide" style="background:var(--fill)">${t('chatRelayBtn')}</button></form><div class="gap"></div>
    <button class="btn s wide" data-act="chatreset" style="background:var(--fill)">${t('chatRelayReset')}</button><div class="gap"></div>
    <button class="btn s wide" data-act="chatrotate" style="background:var(--fill)">${t('chatRotate')}</button>`);
}
// sfide e schede viaggiano in chat con lo stesso formato dei link #sfida= / #scheda=
let chatOutLink = '';
function chatLinkTargets(msg) {
  const fr = chatFriends();
  if (!/(sfida|scheda)=/.test(msg) || !fr.length) return '';
  chatOutLink = msg;
  return `<p class="glabel">${t('chatInApp')}</p><div class="list">${fr.map(f => `<button class="row chatrow" data-act="chatlinkto" data-pk="${f.pk}">${ava(f.n, 40, f.av)}<div class="grow"><h3>${esc(f.n)}</h3></div><span class="chev">${icon('chev')}</span></button>`).join('')}</div><div class="gap"></div>`;
}
// invia un'immagine (card dell'allenamento o dei progressi, foto del fisico) a un amico della chat
let chatOutImg = null;
function sheetChatPickImg(blob, warn) {
  const fr = chatFriends();
  if (!fr.length) { sheetChatInvite(); return; }
  chatOutImg = blob;
  sheet(`<h2>${t('chatShareHere')}</h2>${warn ? `<p class="warn">${t('photoShareWarn')}</p>` : ''}
    <img class="big-img" src="${URL.createObjectURL(blob)}" alt="" style="max-height:36vh;object-fit:contain"><div class="gap"></div>
    <div class="list">${fr.map(f => `<button class="row chatrow" data-act="chatimgto" data-pk="${f.pk}">${ava(f.n, 40, f.av)}<div class="grow"><h3>${esc(f.n)}</h3></div><span class="chev">${icon('chev')}</span></button>`).join('')}</div>`);
}
// invia un record o un esercizio a un amico della chat
function sheetChatPick(card) {
  const fr = chatFriends();
  if (!fr.length) { sheetChatInvite(); return; }
  sheet(`<h2>${t('chatShareHere')}</h2><div class="cpr" style="margin:0 0 12px"><b>🏆 ${t('record')}</b><span>${esc(card.ex)}</span><strong>${fmtKg(card.kg)} kg × ${card.rp}</strong></div>
    <div class="list">${fr.map(f => `<button class="row chatrow" data-act="chatcard" data-pk="${f.pk}" data-ex="${esc(card.ex)}" data-kg="${card.kg}" data-rp="${card.rp}">${ava(f.n, 40, f.av)}<div class="grow"><h3>${esc(f.n)}</h3></div><span class="chev">${icon('chev')}</span></button>`).join('')}</div>`);
}

Object.assign(acts, {
  chatinvite: sheetChatInvite,
  chatavatar: () => { const i = document.getElementById('avfile'); i.onchange = async () => { const x = i.files[0]; if (!x) return; try { await chatSetAvatar(x); sheetChatSettings(); toast(t('chatAvatarDone')); } catch (e) { alert(t('chatPhotoFail')); } }; i.click(); },
  chatavatardel: async () => { await chatSetAvatar(null); sheetChatSettings(); },
  chatlinkto: b => {
    const pk = b.dataset.pk, x = chatOutLink; if (!x) return;
    closeSheet(); chatSend(pk, {k: /scheda=/.test(x) ? 'sc' : 'sf', x}).then(() => go({name: 'chat', id: pk, from: 'chat'}), () => alert(t('chatSendFail')));
  },
  chatlinkopen: b => {
    const m = (chat().msgs[view.id] || []).find(x => x.id === b.dataset.mid); if (!m) return;
    if (m.k === 'sc') addPlan(parsePlan(m.x)); else addFriend(parseChallenge(m.x));
  },
  chatcardpick: b => sheetChatPick({ex: b.dataset.ex, kg: +b.dataset.kg, rp: +b.dataset.rp}),
  chatimgto: async b => {
    const pk = b.dataset.pk, x = chatOutImg; if (!x) return;
    closeSheet();
    try { const r = await chatShrink(x); await chatSend(pk, {k: 'img', d: r.d, w: r.w, h: r.h}); chatOutImg = null; go({name: 'chat', id: pk, from: 'chat'}); }
    catch (e) { alert(t('chatPhotoFail')); }
  },
  chatopen: b => { go({name: 'chat', id: b.dataset.pk, from: 'chat'}); },
  chatmenu: b => sheetChatMenu(b.dataset.pk),
  chatsettings: sheetChatSettings,
  chattray: () => { const t2 = document.getElementById('ctray'); if (t2) t2.hidden = !t2.hidden; },
  chatemoji: b => {
    const i = document.getElementById('cinput'), v = i.value.trim();
    // emoji da sola con campo vuoto = emoji grande; altrimenti si aggiunge al testo
    if (!v) chatSend(view.id, {k: 'em', x: b.dataset.e}).then(() => chatRefresh(true)); else { i.value += b.dataset.e; i.focus(); }
  },
  chatpick: () => document.getElementById('cfile').click(),
  chatimg: b => { const d = imgCache[b.dataset.imgid]; if (d) sheet(`<img class="big-img" src="${d}" alt="">`); },
  // elimina la conversazione e la toglie dall'elenco (ricompare se l'amico riscrive); le foto si cancellano dopo il tempo per annullare
  chatclear: b => { const pk = b.dataset.pk, old = (chat().msgs[pk] || []).slice(); closeSheet(); go({name: 'home', tab: 'chat'});
    undoable(t('chatDeleted'), () => { chat().msgs[pk] = []; if (chat().friends[pk]) chat().friends[pk].hid = 1; });
    setTimeout(() => { if (!(chat().msgs[pk] || []).length) old.forEach(m => m.d && imgDel(m.id)); }, 9000); },
  // elimina l'amico: sparisce dalla chat (senza bloccarlo: con un nuovo invito si ritrovano)
  chatremove: b => { const pk = b.dataset.pk, old = (chat().msgs[pk] || []).slice(); closeSheet(); go({name: 'home', tab: 'chat'});
    undoable(t('chatRemoved'), () => { delete chat().friends[pk]; delete chat().msgs[pk]; });
    setTimeout(() => { if (!chat().friends[pk]) old.forEach(m => m.d && imgDel(m.id)); }, 9000); },
  chatpaste: () => sheetPasteAny(t('chatPasteTitle')),
  chatblock: b => { const pk = b.dataset.pk, c = chat(); closeSheet(); c.blocked.push(pk); delete c.friends[pk]; delete c.msgs[pk]; save(); go({name: 'home', tab: 'chat'}); toast(t('chatBlockedDone')); },
  chatrdel: b => { chat().relays = chat().relays.filter(u => u !== b.dataset.u); save(); chatConnect(); sheetChatSettings(); },
  chatreset: () => { chat().relays = CHAT_RELAYS.slice(); save(); chatConnect(); sheetChatSettings(); },
  chatrotate: () => { chat().tok = toHex(NT.generateSecretKey()).slice(0, 24); save(); toast(t('chatRotated')); closeSheet(); },
  chatcard: b => { const pk = b.dataset.pk; closeSheet(); chatSend(pk, {k: 'pr', ex: b.dataset.ex, kg: +b.dataset.kg, rp: +b.dataset.rp}).then(() => { go({name: 'chat', id: pk, from: 'chat'}); }); },
});
Object.assign(forms, {
  chatsend: f => {
    const x = f.x.value.trim(), pk = f.dataset.pk; if (!x) return;
    f.x.value = '';
    const only = /^(\p{Extended_Pictographic}|‍|️|\s){1,8}$/u.test(x) && [...x.matchAll(/\p{Extended_Pictographic}/gu)].length <= 3;
    chatSend(pk, only ? {k: 'em', x} : {k: 't', x}).then(() => chatRefresh(true));
    f.x.focus();
    const tr = document.getElementById('ctray'); if (tr) tr.hidden = true;
  },
  chatfriend: f => {
    const fr = chat().friends[f.dataset.pk], n = f.n.value.trim().slice(0, 30), raw = f.p.value.trim(), tel = waNumber(raw);
    if (raw && !tel) return alert(t('friendTelBad'));
    if (n) fr.n = n; fr.tel = tel; save(); closeSheet(); render(); toast(t('saved'));
  },
  chatrelay: f => {
    let u = f.u.value.trim(); if (!/^wss:\/\/[\w.\-]+(:\d+)?(\/\S*)?$/.test(u)) return alert(t('chatRelayBad'));
    if (!chat().relays.includes(u)) chat().relays.push(u); save(); chatConnect(); sheetChatSettings();
  },
});
// all'avvio, se la chat è già attiva, ci si collega in silenzio
if (db.chat && db.chat.sk) nostrLoad().then(() => chatConnect()).catch(() => {});

// testi
const CHAT_TXT = {
  it: {tabChat: 'Chat', chatAvatar: 'Foto profilo', chatAvatarDone: 'Foto profilo aggiornata 📸', chatInviteBtn: 'Invita in chat', chatInviteText: 'Manda il tuo link a un amico: quando lo apre vi ritrovate qui, con messaggi, foto ed emoji.', chatEmpty: 'Nessuna chat. Invita un amico: scrivetevi qui, con foto ed emoji, senza dare il numero.', chatPrivacy: 'Messaggi cifrati da un capo all’altro. Passano da server pubblici che non possono leggerli ma vedono chi scrive a chi e quando. Il messaggio arriva quando apri l’app: puoi avvisare l’amico su WhatsApp.',
    chatInApp: 'Nella chat dell\'app', chatChallengeMsg: 'Sfida', chatPlanMsg: 'Scheda', chatAddChallenge: 'Aggiungi la sfida', chatSavePlan: 'Salva la scheda', chatLifts: n => `${n} esercizi`, chatDays: n => `${n} giorni`, chatSendFail: 'Non riesco a inviarla in chat: manda il link.', chatRemove: 'Elimina amico', chatRemoved: 'Amico eliminato', chatPasteBtn: 'Ho ricevuto un link', chatPasteTitle: 'Incolla il link ricevuto', chatInBrowserNote: 'Lo trovi già in Chat qui nel browser. Se usi Gym dall’icona sulla schermata Home, copia il link, apri l’app e tocca Chat → «Ho ricevuto un link».', chatStart: 'Scrivi il primo messaggio 💪', chatPh: 'Scrivi un messaggio…', chatSend: 'Invia', chatPhoto: 'Foto', chatYou: 'Tu', chatPhotoMsg: '📷 Foto', chatNoMsg: 'Nessun messaggio', chatToday: 'Oggi', chatSettings: 'Chat', chatRelays: 'Server di appoggio', chatRelaysText: 'Relay pubblici dove passano i messaggi cifrati. Più sono, meglio arriva.', chatRelayAdd: 'Aggiungi un server', chatRelayBtn: 'Aggiungi', chatRelayBad: 'Scrivi l’indirizzo con wss://', chatRelayReset: 'Ripristina i server consigliati', chatRotate: 'Nuovo link d’invito', chatRotated: 'Nuovo link: i vecchi inviti non funzionano più', chatUp: 'connesso', chatDown: 'non raggiungibile',
    chatConnected: (n, m) => `${n} di ${m} server connessi`, chatWaNudge: 'Avvisa su WhatsApp', chatWaMsg: n => `${n} ti ha scritto su Gym Tracker 💪 Apri l’app per leggere:`, chatTelHint: 'Il numero serve solo per avvisarlo su WhatsApp. Resta sul tuo telefono.', chatDelete: 'Elimina la conversazione', chatDeleted: 'Conversazione eliminata', chatBlock: 'Blocca', chatBlockedDone: 'Amico bloccato',
    chatAdded: n => `${n} aggiunto alla chat`, chatReopened: n => `Chat con ${n}`, chatLinkFrom: n => `${n} ti invita in chat`, chatInviteMsg: n => `${n} ti invita a chattare su Gym Tracker 💪 Tocca il link e aggiungilo alla Home:`, chatShareHere: 'Invia in chat', chatPhotoFail: 'Non riesco a inviare la foto.', delete: 'Elimina'},
  en: {tabChat: 'Chat', chatAvatar: 'Profile photo', chatAvatarDone: 'Profile photo updated 📸', chatInviteBtn: 'Invite to chat', chatInviteText: 'Send your link to a friend: when they open it you’ll meet here, with messages, photos and emoji.', chatEmpty: 'No chats yet. Invite a friend: write here, with photos and emoji, without sharing your number.', chatPrivacy: 'End-to-end encrypted messages. They pass through public servers that can’t read them but see who writes to whom and when. A message arrives when you open the app: you can nudge your friend on WhatsApp.',
    chatInApp: 'In the app chat', chatChallengeMsg: 'Challenge', chatPlanMsg: 'Workout plan', chatAddChallenge: 'Add the challenge', chatSavePlan: 'Save the plan', chatLifts: n => `${n} exercises`, chatDays: n => `${n} days`, chatSendFail: 'Couldn\'t send it in chat: send the link instead.', chatRemove: 'Remove friend', chatRemoved: 'Friend removed', chatPasteBtn: 'I received a link', chatPasteTitle: 'Paste the link you received', chatInBrowserNote: 'You’ll find them in Chat here in the browser. If you use Gym from the Home Screen icon, copy the link, open the app and tap Chat → “I received a link”.', chatStart: 'Write the first message 💪', chatPh: 'Write a message…', chatSend: 'Send', chatPhoto: 'Photo', chatYou: 'You', chatPhotoMsg: '📷 Photo', chatNoMsg: 'No messages', chatToday: 'Today', chatSettings: 'Chat', chatRelays: 'Relay servers', chatRelaysText: 'Public relays that carry the encrypted messages. The more, the better they arrive.', chatRelayAdd: 'Add a server', chatRelayBtn: 'Add', chatRelayBad: 'Write the address starting with wss://', chatRelayReset: 'Restore recommended servers', chatRotate: 'New invite link', chatRotated: 'New link: old invites no longer work', chatUp: 'connected', chatDown: 'unreachable',
    chatConnected: (n, m) => `${n} of ${m} servers connected`, chatWaNudge: 'Nudge on WhatsApp', chatWaMsg: n => `${n} wrote to you on Gym Tracker 💪 Open the app to read:`, chatTelHint: 'The number is only used to nudge them on WhatsApp. It stays on your phone.', chatDelete: 'Delete conversation', chatDeleted: 'Conversation deleted', chatBlock: 'Block', chatBlockedDone: 'Friend blocked',
    chatAdded: n => `${n} added to chat`, chatReopened: n => `Chat with ${n}`, chatLinkFrom: n => `${n} invites you to chat`, chatInviteMsg: n => `${n} invites you to chat on Gym Tracker 💪 Tap the link and add it to your Home Screen:`, chatShareHere: 'Send in chat', chatPhotoFail: 'I can’t send the photo.', delete: 'Delete'},
  es: {tabChat: 'Chat', chatAvatar: 'Foto de perfil', chatAvatarDone: 'Foto de perfil actualizada 📸', chatInviteBtn: 'Invitar al chat', chatInviteText: 'Envía tu enlace a un amigo: cuando lo abra os encontraréis aquí, con mensajes, fotos y emoji.', chatEmpty: 'Aún no hay chats. Invita a un amigo: escribid aquí, con fotos y emoji, sin dar el número.', chatPrivacy: 'Mensajes cifrados de extremo a extremo. Pasan por servidores públicos que no pueden leerlos, pero ven quién escribe a quién y cuándo. El mensaje llega al abrir la app: puedes avisar al amigo por WhatsApp.',
    chatInApp: 'En el chat de la app', chatChallengeMsg: 'Desafío', chatPlanMsg: 'Rutina', chatAddChallenge: 'Añadir el desafío', chatSavePlan: 'Guardar la rutina', chatLifts: n => `${n} ejercicios`, chatDays: n => `${n} días`, chatSendFail: 'No se pudo enviar en el chat: envía el enlace.', chatRemove: 'Eliminar amigo', chatRemoved: 'Amigo eliminado', chatPasteBtn: 'He recibido un enlace', chatPasteTitle: 'Pega el enlace recibido', chatInBrowserNote: 'Ya está en el Chat aquí en el navegador. Si usas Gym desde el icono de inicio, copia el enlace, abre la app y toca Chat → «He recibido un enlace».', chatStart: 'Escribe el primer mensaje 💪', chatPh: 'Escribe un mensaje…', chatSend: 'Enviar', chatPhoto: 'Foto', chatYou: 'Tú', chatPhotoMsg: '📷 Foto', chatNoMsg: 'Sin mensajes', chatToday: 'Hoy', chatSettings: 'Chat', chatRelays: 'Servidores de apoyo', chatRelaysText: 'Relays públicos por donde pasan los mensajes cifrados. Cuantos más, mejor llegan.', chatRelayAdd: 'Añadir un servidor', chatRelayBtn: 'Añadir', chatRelayBad: 'Escribe la dirección con wss://', chatRelayReset: 'Restaurar los servidores recomendados', chatRotate: 'Nuevo enlace de invitación', chatRotated: 'Nuevo enlace: las invitaciones antiguas ya no funcionan', chatUp: 'conectado', chatDown: 'no disponible',
    chatConnected: (n, m) => `${n} de ${m} servidores conectados`, chatWaNudge: 'Avisar por WhatsApp', chatWaMsg: n => `${n} te ha escrito en Gym Tracker 💪 Abre la app para leer:`, chatTelHint: 'El número solo sirve para avisarle por WhatsApp. Se queda en tu teléfono.', chatDelete: 'Eliminar la conversación', chatDeleted: 'Conversación eliminada', chatBlock: 'Bloquear', chatBlockedDone: 'Amigo bloqueado',
    chatAdded: n => `${n} añadido al chat`, chatReopened: n => `Chat con ${n}`, chatLinkFrom: n => `${n} te invita al chat`, chatInviteMsg: n => `${n} te invita a chatear en Gym Tracker 💪 Toca el enlace y añádelo a inicio:`, chatShareHere: 'Enviar al chat', chatPhotoFail: 'No puedo enviar la foto.', delete: 'Eliminar'},
  fr: {tabChat: 'Chat', chatAvatar: 'Photo de profil', chatAvatarDone: 'Photo de profil mise à jour 📸', chatInviteBtn: 'Inviter au chat', chatInviteText: 'Envoyez votre lien à un ami : quand il l’ouvre, vous vous retrouvez ici, avec messages, photos et emoji.', chatEmpty: 'Pas encore de chat. Invitez un ami : écrivez-vous ici, avec photos et emoji, sans donner votre numéro.', chatPrivacy: 'Messages chiffrés de bout en bout. Ils passent par des serveurs publics qui ne peuvent pas les lire mais voient qui écrit à qui et quand. Le message arrive à l’ouverture de l’app : vous pouvez prévenir l’ami sur WhatsApp.',
    chatInApp: 'Dans le chat de l’app', chatChallengeMsg: 'Défi', chatPlanMsg: 'Programme', chatAddChallenge: 'Ajouter le défi', chatSavePlan: 'Enregistrer le programme', chatLifts: n => `${n} exercices`, chatDays: n => `${n} jours`, chatSendFail: 'Impossible de l’envoyer dans le chat : envoyez le lien.', chatRemove: 'Supprimer l’ami', chatRemoved: 'Ami supprimé', chatPasteBtn: 'J’ai reçu un lien', chatPasteTitle: 'Collez le lien reçu', chatInBrowserNote: 'Vous le trouvez déjà dans le Chat ici, dans le navigateur. Si vous utilisez Gym depuis l’icône d’accueil, copiez le lien, ouvrez l’app et touchez Chat → « J’ai reçu un lien ».', chatStart: 'Écrivez le premier message 💪', chatPh: 'Écrire un message…', chatSend: 'Envoyer', chatPhoto: 'Photo', chatYou: 'Vous', chatPhotoMsg: '📷 Photo', chatNoMsg: 'Aucun message', chatToday: 'Aujourd’hui', chatSettings: 'Chat', chatRelays: 'Serveurs relais', chatRelaysText: 'Relais publics par où passent les messages chiffrés. Plus il y en a, mieux ils arrivent.', chatRelayAdd: 'Ajouter un serveur', chatRelayBtn: 'Ajouter', chatRelayBad: 'Écrivez l’adresse avec wss://', chatRelayReset: 'Rétablir les serveurs conseillés', chatRotate: 'Nouveau lien d’invitation', chatRotated: 'Nouveau lien : les anciennes invitations ne marchent plus', chatUp: 'connecté', chatDown: 'injoignable',
    chatConnected: (n, m) => `${n} serveurs sur ${m} connectés`, chatWaNudge: 'Prévenir sur WhatsApp', chatWaMsg: n => `${n} vous a écrit sur Gym Tracker 💪 Ouvrez l’app pour lire :`, chatTelHint: 'Le numéro sert seulement à le prévenir sur WhatsApp. Il reste sur votre téléphone.', chatDelete: 'Supprimer la conversation', chatDeleted: 'Conversation supprimée', chatBlock: 'Bloquer', chatBlockedDone: 'Ami bloqué',
    chatAdded: n => `${n} ajouté au chat`, chatReopened: n => `Chat avec ${n}`, chatLinkFrom: n => `${n} vous invite au chat`, chatInviteMsg: n => `${n} vous invite à discuter sur Gym Tracker 💪 Touchez le lien et ajoutez-le à l’accueil :`, chatShareHere: 'Envoyer dans le chat', chatPhotoFail: 'Je ne peux pas envoyer la photo.', delete: 'Supprimer'},
  de: {tabChat: 'Chat', chatAvatar: 'Profilfoto', chatAvatarDone: 'Profilfoto aktualisiert 📸', chatInviteBtn: 'Zum Chat einladen', chatInviteText: 'Sende deinen Link an einen Freund: Sobald er ihn öffnet, trefft ihr euch hier, mit Nachrichten, Fotos und Emoji.', chatEmpty: 'Noch keine Chats. Lade einen Freund ein: Schreibt euch hier, mit Fotos und Emoji, ohne Nummer.', chatPrivacy: 'Ende-zu-Ende-verschlüsselte Nachrichten. Sie laufen über öffentliche Server, die sie nicht lesen können, aber sehen, wer wem wann schreibt. Die Nachricht kommt an, wenn du die App öffnest: Du kannst den Freund über WhatsApp anstupsen.',
    chatInApp: 'Im Chat der App', chatChallengeMsg: 'Herausforderung', chatPlanMsg: 'Trainingsplan', chatAddChallenge: 'Herausforderung hinzufügen', chatSavePlan: 'Plan speichern', chatLifts: n => `${n} Übungen`, chatDays: n => `${n} Tage`, chatSendFail: 'Senden im Chat fehlgeschlagen: schick den Link.', chatRemove: 'Freund entfernen', chatRemoved: 'Freund entfernt', chatPasteBtn: 'Ich habe einen Link erhalten', chatPasteTitle: 'Erhaltenen Link einfügen', chatInBrowserNote: 'Du findest ihn schon im Chat hier im Browser. Nutzt du Gym über das Symbol auf dem Home-Bildschirm, kopiere den Link, öffne die App und tippe auf Chat → „Ich habe einen Link erhalten“.', chatStart: 'Schreibe die erste Nachricht 💪', chatPh: 'Nachricht schreiben…', chatSend: 'Senden', chatPhoto: 'Foto', chatYou: 'Du', chatPhotoMsg: '📷 Foto', chatNoMsg: 'Keine Nachrichten', chatToday: 'Heute', chatSettings: 'Chat', chatRelays: 'Relay-Server', chatRelaysText: 'Öffentliche Relays, über die die verschlüsselten Nachrichten laufen. Je mehr, desto besser kommen sie an.', chatRelayAdd: 'Server hinzufügen', chatRelayBtn: 'Hinzufügen', chatRelayBad: 'Adresse mit wss:// eingeben', chatRelayReset: 'Empfohlene Server wiederherstellen', chatRotate: 'Neuer Einladungslink', chatRotated: 'Neuer Link: alte Einladungen funktionieren nicht mehr', chatUp: 'verbunden', chatDown: 'nicht erreichbar',
    chatConnected: (n, m) => `${n} von ${m} Servern verbunden`, chatWaNudge: 'Per WhatsApp anstupsen', chatWaMsg: n => `${n} hat dir auf Gym Tracker geschrieben 💪 Öffne die App zum Lesen:`, chatTelHint: 'Die Nummer dient nur zum Anstupsen über WhatsApp. Sie bleibt auf deinem Handy.', chatDelete: 'Unterhaltung löschen', chatDeleted: 'Unterhaltung gelöscht', chatBlock: 'Blockieren', chatBlockedDone: 'Freund blockiert',
    chatAdded: n => `${n} zum Chat hinzugefügt`, chatReopened: n => `Chat mit ${n}`, chatLinkFrom: n => `${n} lädt dich zum Chat ein`, chatInviteMsg: n => `${n} lädt dich zum Chat auf Gym Tracker ein 💪 Tippe auf den Link und füge ihn zum Home-Bildschirm hinzu:`, chatShareHere: 'Im Chat senden', chatPhotoFail: 'Ich kann das Foto nicht senden.', delete: 'Löschen'},
};
Object.keys(CHAT_TXT).forEach(l => I18N[l] && Object.assign(I18N[l], CHAT_TXT[l]));
render();   // la prima schermata è stata disegnata prima di questo file: ora c'è anche la scheda Chat
