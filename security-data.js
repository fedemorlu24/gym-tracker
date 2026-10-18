// Trust boundary for persisted storage, backups and shared plans.
// Text stays literal Unicode: HTML escaping belongs at the rendering sink.
// Unknown JSON fields survive for forward compatibility, but executable values,
// accessors, non-finite numbers and prototype-control properties do not.
(function (root) {
  'use strict';
  const reserved = new Set(Object.getOwnPropertyNames(Object.prototype).concat(['prototype']));
  const dict = () => Object.create(null);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const record = o => !!o && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
  const array = a => Array.isArray(a) ? a : [];
  const text = (v, fallback = '') => typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : fallback;
  const finite = (v, fallback = 0, min = -1e12, max = 1e12) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN;
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const integer = (v, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) => Math.round(finite(v, fallback, min, max));
  const flag = v => v === true || v === 1;
  const hex = v => typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v) ? v.toLowerCase() : '';
  function validDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(v)) return false;
    const d = new Date(v + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }
  const validId = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v) && !reserved.has(v);
  // Stable migration identity, NOT a cryptographic hash or a Nostr event ID.
  function migratedId(v, scope) {
    const s = scope + '\0' + text(v), seeds = [2166136261, 3335557771, 1020304051, 2654435761];
    return 'm-' + seeds.map(seed => {
      let h = seed;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
      return h.toString(16).padStart(8, '0');
    }).join('');
  }
  const normalizeId = (v, scope = 'id') => validId(v) ? v : migratedId(v, scope);
  function allocator(values, scope) {
    const reservedIds = new Set(values.filter(validId)), used = new Set();
    return (value, fallback) => {
      const original = text(value), base = normalizeId(original || fallback, scope);
      let id = base, n = 0;
      while (used.has(id) || (id !== original && reservedIds.has(id))) id = base.slice(0, 115) + '-' + (++n);
      used.add(id); return id;
    };
  }
  function copyJSON(value, allowReserved = false, state = {nodes: 0, stack: new Set()}, depth = 0) {
    // Fail the complete boundary instead of partially truncating a large archive.
    if (++state.nodes > 1000000 || depth > 64) throw new Error('Archive structure limit');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (!Array.isArray(value) && !record(value)) return undefined;
    if (state.stack.has(value)) throw new Error('Cyclic archive');
    state.stack.add(value);
    const out = Array.isArray(value) ? [] : dict();
    for (const k of Object.keys(value)) {
      if (!Array.isArray(value) && !allowReserved && reserved.has(k)) continue;
      const prop = Object.getOwnPropertyDescriptor(value, k);
      if (!prop || !own(prop, 'value')) continue;
      const v = copyJSON(prop.value, false, state, depth + 1);
      if (v !== undefined) out[k] = v;
    }
    state.stack.delete(value); return out;
  }
  const fields = o => record(o) ? copyJSON(o) : dict();
  function optionalText(out, source, keys) {
    keys.forEach(k => { if (own(source, k)) out[k] = text(source[k]); });
  }
  function optionalNumbers(out, source, keys, min = 0, max = 1e9) {
    keys.forEach(k => { if (own(source, k)) out[k] = finite(source[k], 0, min, max); });
  }
  function optionalDates(out, source, keys) {
    keys.forEach(k => { if (own(source, k)) { if (validDate(source[k])) out[k] = source[k]; else delete out[k]; } });
  }
  function target(source) {
    const out = fields(source);
    out.sets = integer(source.sets, 3, 1, 10000);
    out.reps = text(source.reps, '8–12');
    out.rest = finite(source.rest, 0, 0, 86400);
    optionalText(out, source, ['note', 'by', 'rir', 'tempo', 'alt']);
    return out;
  }
  function plan(source) {
    if (!record(source) || !Array.isArray(source.days)) return null;
    const out = fields(source);
    out.id = normalizeId(source.id || JSON.stringify(out), 'plan');
    out.name = text(source.name);
    optionalText(out, source, ['author', 'role', 'note', 'food']);
    if (own(source, 'own')) out.own = flag(source.own);
    optionalDates(out, source, ['got']);
    out.days = source.days.filter(record).map(day => {
      const d = fields(day); d.name = text(day.name);
      optionalText(d, day, ['warm']); optionalNumbers(d, day, ['min'], 0, 10000);
      d.ex = array(day.ex).filter(record).map(ex => {
        const e = target(ex); e.n = text(ex.n);
        if (own(ex, 'lib')) e.lib = validId(ex.lib) ? ex.lib : '';
        return e;
      });
      return d;
    });
    return out;
  }
  function normalizePlan(source) { try { return plan(source); } catch (_) { return null; } }
  function normalizeChallenge(source) {
    if (!record(source)) return null;
    const out = fields(source);
    out.id = normalizeId(source.id, 'social'); out.n = text(source.n, '?');
    optionalDates(out, source, ['d', 'got']);
    ['st', 'wt', 'm'].forEach(k => out[k] = integer(source[k], 0, 0, 1e6));
    out.pg = finite(source.pg);
    if (own(source, 'me')) out.me = flag(source.me);
    out.l = array(source.l).filter(record).map(lift => {
      const l = fields(lift); l.k = text(lift.k); l.n = text(lift.n);
      l.e = finite(lift.e, 0, 0, 1e9);
      l.b = [finite(array(lift.b)[0], 0, 0, 1e6), integer(array(lift.b)[1], 0, 0, 1e6)];
      if (own(lift, 'p')) l.p = lift.p === null ? null : finite(lift.p);
      return l;
    });
    return out;
  }
  const reactions = ['❤️', '💪', '🔥', '🏆', '👏', '😂'];
  const defaultRelays = ['wss://nos.lol', 'wss://relay.damus.io', 'wss://relay.primal.net', 'wss://offchain.pub'];
  function relayURL(v) {
    if (typeof v !== 'string' || v.length > 2048) return false;
    try { const u = new URL(v); return u.protocol === 'wss:' && !!u.hostname && !u.username && !u.password && !u.hash; } catch (_) { return false; }
  }
  function stripAv(value) {
    if (!value || typeof value !== 'object') return;
    if (own(value, 'av')) delete value.av;
    Object.values(value).forEach(stripAv);
  }
  function normalizeChat(source) {
    if (!record(source)) return null;
    const out = fields(source); stripAv(out);
    const sk = hex(source.sk), pk = hex(source.pk);
    // Range-check the scalar; derive/check its public key in chatInit with nostr-tools.
    const order = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
    if (sk && sk !== '0'.repeat(64) && sk < order) out.sk = sk; else delete out.sk;
    if (pk) out.pk = pk; else delete out.pk;
    delete out.vaultInvalid; delete out.keyInvalid;
    // Keep a damaged identity visible and unusable, never silently turn it into
    // a new-account request or discard its conversations/workout archive.
    // These markers survive removal of malformed fields on an earlier pass.
    // Recovery replaces the archive with a valid import, not a newly made key.
    if (source.vaultInvalid === true) out.vaultInvalid = true;
    if (source.keyInvalid === true || own(source, 'sk') && !out.sk || own(source, 'pk') && !pk) out.keyInvalid = true;
    if (own(source, 'vault')) {
      try {
        out.vault = root.ChatVault.validate(source.vault, pk);
        if (!pk || out.sk) throw new Error('Ambiguous vault identity');
      } catch (_) { out.vaultInvalid = true; }
    }
    if (typeof source.tok === 'string' && /^[0-9a-f]{24}$/i.test(source.tok)) out.tok = source.tok.toLowerCase(); else delete out.tok;
    out.friends = dict();
    if (record(source.friends)) Object.entries(source.friends).forEach(([key, friend]) => {
      if (!record(friend)) return;
      const id = hex(key) || hex(friend.pk); if (!id) return;
      const f = fields(friend); stripAv(f); f.pk = id; f.n = text(friend.n, '?');
      f.added = integer(friend.added, 0, 0, 8640000000000); f.unread = integer(friend.unread, 0, 0, 1e9);
      if (own(friend, 'hid')) f.hid = flag(friend.hid) ? 1 : 0;
      if (own(friend, 'tel')) f.tel = /^\d{8,15}$/.test(text(friend.tel)) ? text(friend.tel) : '';
      out.friends[id] = f;
    });
    out.msgs = dict();
    if (record(source.msgs)) Object.entries(source.msgs).forEach(([key, messages]) => {
      const id = hex(key); if (!id || !Array.isArray(messages)) return;
      const ids = new Set();
      const list = messages.filter(record).map(message => {
        const mid = hex(message.id), kind = message.k;
        if (!mid || ids.has(mid) || !['t', 'img', 'rx', 'pr', 'em', 'sf', 'sc'].includes(kind) || !['me', 'them'].includes(message.from)) return null;
        if (kind === 'rx' && (!hex(message.to) || !reactions.includes(message.e))) return null;
        ids.add(mid);
        const m = fields(message); stripAv(m); m.id = mid; m.k = kind;
        m.t = integer(message.t, 0, 0, 8640000000000);
        if (own(message, 'x') || kind === 't' || kind === 'em' || kind === 'sf' || kind === 'sc') m.x = text(message.x).slice(0, kind === 'sf' || kind === 'sc' ? 120000 : kind === 'em' ? 32 : 2000);
        if (own(message, 'to')) m.to = hex(message.to);
        if (own(message, 'e')) m.e = reactions.includes(message.e) ? message.e : '';
        optionalText(m, message, ['ex']); optionalNumbers(m, message, ['kg', 'rp'], 0, 1e6);
        optionalNumbers(m, message, ['w', 'h'], 0, 8192);
        if (own(message, 'ok')) m.ok = flag(message.ok) ? 1 : 0;
        if (own(message, 'd')) m.d = flag(message.d) ? 1 : 0;
        return m;
      }).filter(Boolean);
      // No CHAT_KEEP trimming on migration: only the normal send/receive retention
      // policy may expire old conversations. Valid stored messages all survive.
      out.msgs[id] = (out.msgs[id] || []).concat(list).sort((a, b) => a.t - b.t);
    });
    out.relays = Array.isArray(source.relays) ? [...new Set(source.relays.filter(relayURL))] : defaultRelays.slice();
    out.sync = integer(source.sync, 0, 0, 8640000000000);
    out.seen = [...new Set(array(source.seen).map(hex).filter(Boolean))];
    out.blocked = [...new Set(array(source.blocked).map(hex).filter(Boolean))];
    return out;
  }
  function normalizeArchive(source) {
    if (!record(source) || !Array.isArray(source.sessions)) return null;
    const out = fields(source), planRefs = new Map();
    if (own(source, 'plans')) {
      out.plans = dict();
      const entries = record(source.plans) ? Object.entries(source.plans) : [];
      const allocate = allocator(entries.map(([key, p]) => record(p) ? text(p.id, key) : key), 'plan');
      entries.forEach(([key, sourcePlan]) => {
        const p = plan(sourcePlan); if (!p) return;
        const id = allocate(sourcePlan.id || key, key); p.id = id; out.plans[id] = p;
        if (!planRefs.has(key)) planRefs.set(key, id);
        if (!planRefs.has(sourcePlan.id)) planRefs.set(sourcePlan.id, id);
      });
    }
    const allocateSession = allocator(source.sessions.filter(record).map(s => s.id), 'session');
    out.sessions = source.sessions.filter(s => record(s) && validDate(s.date)).map((sourceSession, i) => {
      const s = fields(sourceSession); s.id = allocateSession(sourceSession.id, 'session-' + i); s.name = text(sourceSession.name, '–');
      const es = array(sourceSession.exercises).filter(e => record(e) && typeof e.name === 'string' && !!e.name);
      const allocateExercise = allocator(es.map(e => e.id), 'exercise-' + s.id);
      s.exercises = es.map((sourceExercise, j) => {
        const e = fields(sourceExercise); e.id = allocateExercise(sourceExercise.id, 'exercise-' + j); e.name = sourceExercise.name;
        if (own(sourceExercise, 'lib')) e.lib = validId(sourceExercise.lib) ? sourceExercise.lib : '';
        e.sets = array(sourceExercise.sets).filter(record).map(z => {
          const reps = integer(z.reps, 0, 1, 1e6), kg = finite(z.kg, -1, 0, 1e6);
          if (reps <= 0 || kg < 0) return null;
          const set = fields(z); set.reps = reps; set.kg = kg;
          if (own(z, 'at')) { const at = finite(z.at, -1, 0, 8640000000000000); if (at >= 0) set.at = at; else delete set.at; }
          return set;
        }).filter(Boolean);
        if (record(sourceExercise.target)) e.target = target(sourceExercise.target); else delete e.target;
        return e;
      });
      if (record(sourceSession.plan)) {
        s.plan = fields(sourceSession.plan);
        s.plan.id = planRefs.get(sourceSession.plan.id) || normalizeId(sourceSession.plan.id, 'plan');
        s.plan.day = integer(sourceSession.plan.day, 0, 0, 1e6);
      } else delete s.plan;
      return s;
    });
    if (own(source, 'body')) out.body = array(source.body).filter(b => record(b) && validDate(b.date)).map(b => {
      const v = fields(b); optionalNumbers(v, b, ['weight', 'kcal'], 0, 1e6); return v;
    });
    if (own(source, 'profile')) {
      out.profile = fields(source.profile);
      if (own(out.profile, 'sex') && !['m', 'f', ''].includes(out.profile.sex)) delete out.profile.sex;
      optionalNumbers(out.profile, out.profile, ['age', 'weight'], 0, 1e6);
      delete out.profile.av;
    }
    if (own(source, 'settings')) {
      const s = out.settings = fields(source.settings);
      if (own(s, 'lang') && !['it', 'en', 'es', 'fr', 'de'].includes(s.lang)) delete s.lang;
      if (own(s, 'theme') && !['auto', 'light', 'dark'].includes(s.theme)) delete s.theme;
      optionalNumbers(s, s, ['rest', 'restLast'], 0, 86400);
      if (own(s, 'weekly')) s.weekly = integer(s.weekly, 3, 1, 7);
    }
    if (own(source, 'social')) {
      out.social = fields(source.social); out.social.id = normalizeId(out.social.id, 'social');
      optionalText(out.social, out.social, ['name']); delete out.social.av;
    }
    if (own(source, 'friends')) {
      out.friends = dict(); const entries = record(source.friends) ? Object.entries(source.friends) : [];
      const allocate = allocator(entries.map(([key, f]) => record(f) ? text(f.id, key) : key), 'social');
      entries.forEach(([key, friend]) => {
        const f = normalizeChallenge(friend); if (!f) return;
        f.id = allocate(friend.id || key, key); delete f.av; out.friends[f.id] = f;
      });
    }
    if (own(source, 'contacts')) {
      const cs = array(source.contacts).filter(record), allocate = allocator(cs.map(c => c.id), 'contact');
      out.contacts = cs.map((c, i) => {
        const v = fields(c); v.id = allocate(c.id, 'contact-' + i); v.n = text(c.n, '?');
        v.tel = /^\d{8,15}$/.test(text(c.tel)) ? text(c.tel) : ''; delete v.av; return v;
      });
    }
    if (own(source, 'goals')) {
      const gs = array(source.goals).filter(g => record(g) && ['lift', 'body'].includes(g.type));
      const allocate = allocator(gs.map(g => g.id), 'goal');
      out.goals = gs.map((g, i) => {
        const v = fields(g); v.id = allocate(g.id, 'goal-' + i); v.start = finite(g.start, 0, 0, 1e9);
        optionalDates(v, g, ['created', 'done']);
        if (g.type === 'lift') { v.ex = text(g.ex); v.kg = finite(g.kg, 0, 0, 1e6); v.reps = integer(g.reps, 1, 1, 1e6); }
        else v.weight = finite(g.weight, 0, 0, 1e6);
        return v;
      });
    }
    if (own(source, 'badges')) {
      out.badges = dict();
      if (record(source.badges)) Object.entries(source.badges).forEach(([key, value]) => {
        if (validId(key) && (value === 'prima' || validDate(value))) out.badges[key] = value;
      });
    }
    if (own(source, 'rest')) {
      // Keys are exercise names, not identifiers. Preserve even '__proto__' safely.
      out.rest = dict();
      if (record(source.rest)) Object.entries(source.rest).forEach(([key, value]) => {
        const n = finite(value, -1, 0, 86400); if (n >= 0) out.rest[key] = n;
      });
    }
    if (own(source, 'guide')) {
      out.guide = fields(source.guide);
      if (own(out.guide, 'off')) out.guide.off = flag(out.guide.off);
      if (own(out.guide, 'seen')) {
        const seen = out.guide.seen; out.guide.seen = dict();
        if (record(seen)) Object.entries(seen).forEach(([key, value]) => { if (validId(key) && flag(value)) out.guide.seen[key] = value; });
      }
    }
    if (own(source, 'backup')) {
      out.backup = fields(source.backup); optionalNumbers(out.backup, out.backup, ['last', 'snooze'], 0, 8640000000000000);
      if (own(out.backup, 'enc')) out.backup.enc = flag(out.backup.enc);
    }
    if (own(source, 'chat')) { const c = normalizeChat(source.chat); if (c) out.chat = c; else delete out.chat; }
    if (own(source, 'ts')) out.ts = finite(source.ts, 0, 0, 8640000000000000);
    if (own(source, 'donationNudgeSeen')) out.donationNudgeSeen = flag(source.donationNudgeSeen);
    // Earlier installs/backups also used a boolean completion flag.
    if (own(source, 'tourSeen') && !validDate(source.tourSeen) && source.tourSeen !== true && source.tourSeen !== 1) delete out.tourSeen;
    return out;
  }
  function clean(source) { try { return normalizeArchive(source); } catch (_) { return null; } }
  root.GymData = Object.freeze({clean, normalizePlan, normalizeChallenge, normalizeChat, validId, normalizeId, validDate, relayURL});
})(window);
