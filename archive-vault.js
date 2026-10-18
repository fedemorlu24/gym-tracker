// Password protection of local data. The data key is independent of the chat
// identity and never persisted unwrapped. No network or password persistence.
(function (root) {
  'use strict';
  const IT = 600000, MAX = 160 * 1024 * 1024, encoder = new TextEncoder();
  const fail = code => Object.assign(new Error(code), {code});
  const encode = bytes => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reader.onabort = () => reject(fail('ARCHIVE_FORMAT'));
    reader.readAsDataURL(new Blob([bytes]));
  });
  function decode(s, limit = MAX) {
    if (typeof s !== 'string' || s.length > Math.ceil(limit / 3) * 4 || s.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw fail('ARCHIVE_FORMAT');
    const bytes = Uint8Array.from(atob(s), c => c.charCodeAt(0));
    if (bytes.length > limit) throw fail('ARCHIVE_FORMAT');
    return bytes;
  }
  function header(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== 'alg,data,id,it,iv,kdf,salt,v' ||
        value.v !== 1 || value.alg !== 'AES-GCM' || value.kdf !== 'PBKDF2-SHA256' || value.it !== IT ||
        typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/.test(value.id) ||
        decode(value.salt, 16).length !== 16 || decode(value.iv, 12).length !== 12 || decode(value.data, 48).length !== 48) throw fail('ARCHIVE_FORMAT');
    return JSON.parse(JSON.stringify(value));
  }
  const fingerprint = value => JSON.stringify(header(value));
  const wrapAAD = h => encoder.encode(JSON.stringify(['gym-archive-key', h.v, h.alg, h.kdf, h.it, h.id, h.salt, h.iv]));
  async function wrappingKey(password, salt, usage) {
    if (typeof password !== 'string' || !password.length || password.length > 1024) throw fail('ARCHIVE_PASSWORD');
    const bytes = encoder.encode(password);
    try {
      const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
      return await crypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: IT}, material,
        {name: 'AES-GCM', length: 256}, false, [usage]);
    } finally { bytes.fill(0); }
  }
  // A tagged tree preserves Blob values, including rollback photos, without
  // interpreting marker-shaped objects originating in imported JSON.
  async function pack(value, depth = 0) {
    if (depth > 70) throw fail('ARCHIVE_FORMAT');
    if (value instanceof Blob) return ['blob', value.type, await encode(value)];
    if (Array.isArray(value)) return ['array', await Promise.all(value.map(v => pack(v, depth + 1)))];
    if (value && typeof value === 'object') return ['object', await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await pack(v, depth + 1)]))];
    if (value === undefined) return ['undefined'];
    return ['value', value];
  }
  function unpack(value, depth = 0) {
    if (depth > 70 || !Array.isArray(value)) throw fail('ARCHIVE_FORMAT');
    if (value[0] === 'blob') return new Blob([decode(value[2])], {type: value[1]});
    if (value[0] === 'array') return value[1].map(v => unpack(v, depth + 1));
    if (value[0] === 'object') return Object.fromEntries(value[1].map(([k, v]) => [k, unpack(v, depth + 1)]));
    if (value[0] === 'undefined') return undefined;
    if (value[0] === 'value') return value[1];
    throw fail('ARCHIVE_FORMAT');
  }
  function session(h, key) {
    Object.freeze(h);
    const aad = (kind, id) => encoder.encode(JSON.stringify(['gym-archive-record', 1, h.id, kind, id]));
    return Object.freeze({
      header: h, fingerprint: fingerprint(h), close() { key = null; },
      async seal(value, kind, id) {
        if (!key) throw fail('ARCHIVE_LOCKED');
        const bytes = encoder.encode(JSON.stringify(await pack(value))), iv = crypto.getRandomValues(new Uint8Array(12));
        try {
          if (!key) throw fail('ARCHIVE_LOCKED');
          if (bytes.length > MAX) throw fail('ARCHIVE_FORMAT');
          const data = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad(kind, id), tagLength: 128}, key, bytes);
          return {av: 1, iv: await encode(iv), data: await encode(data)};
        } finally { bytes.fill(0); }
      },
      async open(value, kind, id) {
        if (!key) throw fail('ARCHIVE_LOCKED');
        if (!value || value.av !== 1 || Object.keys(value).sort().join(',') !== 'av,data,iv') throw fail('ARCHIVE_FORMAT');
        const iv = decode(value.iv, 12), data = decode(value.data, MAX + 16);
        if (iv.length !== 12 || data.length < 16) throw fail('ARCHIVE_FORMAT');
        const bytes = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv, additionalData: aad(kind, id), tagLength: 128}, key, data));
        try { return unpack(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes))); }
        finally { bytes.fill(0); }
      }
    });
  }
  async function unlock(value, password) {
    const h = header(value); let bytes;
    try {
      bytes = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: decode(h.iv, 12), additionalData: wrapAAD(h), tagLength: 128},
        await wrappingKey(password, decode(h.salt, 16), 'decrypt'), decode(h.data, 48)));
      if (bytes.length !== 32) throw fail('ARCHIVE_FORMAT');
      return session(h, await crypto.subtle.importKey('raw', bytes, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']));
    } catch (_) { throw fail('ARCHIVE_PASSWORD'); }
    finally { if (bytes) bytes.fill(0); }
  }
  async function create(password) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw fail('ARCHIVE_PASSWORD');
    const bytes = crypto.getRandomValues(new Uint8Array(32)), salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const h = {v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', it: IT, id: crypto.randomUUID(), salt: await encode(salt), iv: await encode(iv)};
    try {
      h.data = await encode(await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: wrapAAD(h), tagLength: 128},
        await wrappingKey(password, salt, 'encrypt'), bytes));
      // Verify the wrapped key before callers replace any recoverable source.
      return await unlock(h, password);
    } finally { bytes.fill(0); }
  }
  root.ArchiveVault = Object.freeze({create, unlock, validate: header, fingerprint});
})(window);
