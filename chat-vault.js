// Optional local protection for the Nostr identity. Without a chat password,
// the private key remains in the archive; message crypto stays NIP-44/59.
(function (root) {
  'use strict';
  const MIN_PASSWORD_LENGTH = 8;
  const ITERATIONS = 600000, HEX = /^[0-9a-f]{64}$/;
  const ORDER = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
  const encoder = new TextEncoder();
  let config, secret = null, unlockedFingerprint = '', epoch = 0;
  function failure(code) { const e = new Error(code); e.code = code; return e; }
  function encode(bytes) { return btoa(String.fromCharCode(...bytes)); }
  function decode(text, length) {
    if (typeof text !== 'string' || text.length !== Math.ceil(length / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw failure('VAULT_INVALID');
    let bytes;
    try { bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0)); } catch (_) { throw failure('VAULT_INVALID'); }
    if (bytes.length !== length || encode(bytes) !== text) throw failure('VAULT_INVALID');
    return bytes;
  }
  function validate(v, expectedPk) {
    const keys = ['v', 'alg', 'kdf', 'it', 'pk', 'salt', 'iv', 'data'];
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length ||
        keys.some(k => !Object.prototype.hasOwnProperty.call(v, k)) || v.v !== 1 || v.alg !== 'AES-GCM' ||
        v.kdf !== 'PBKDF2-SHA256' || v.it !== ITERATIONS || typeof v.pk !== 'string' || !HEX.test(v.pk) || expectedPk && expectedPk !== v.pk) throw failure('VAULT_INVALID');
    decode(v.salt, 16); decode(v.iv, 12); decode(v.data, 48);
    return {v: 1, alg: v.alg, kdf: v.kdf, it: v.it, pk: v.pk, salt: v.salt, iv: v.iv, data: v.data};
  }
  const fingerprint = v => JSON.stringify(validate(v));
  const aad = v => encoder.encode(JSON.stringify(['gym-chat-vault', v.v, v.alg, v.kdf, v.it, v.pk]));
  function passwordCheck(password, creating = false) {
    if (typeof password !== 'string' || password.length < (creating ? MIN_PASSWORD_LENGTH : 1) || password.length > 1024) throw failure('VAULT_PASSWORD');
  }
  async function key(password, salt, usage) {
    passwordCheck(password);
    const bytes = encoder.encode(password);
    try {
      const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
      return await crypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS}, material,
        {name: 'AES-GCM', length: 256}, false, [usage]);
    } finally { bytes.fill(0); }
  }
  async function nostr() {
    if (root.NostrTools) return root.NostrTools;
    if (typeof root.nostrLoad === 'function') return root.nostrLoad();
    throw failure('VAULT_UNAVAILABLE');
  }
  function scalar(hex) {
    if (typeof hex !== 'string' || !HEX.test(hex) || hex === '0'.repeat(64) || hex >= ORDER) throw failure('VAULT_INVALID');
    return Uint8Array.from(hex.match(/../g), x => parseInt(x, 16));
  }
  async function open(vault, password, expectedPk) {
    const v = validate(vault, expectedPk), nt = await nostr();
    let bytes;
    try {
      bytes = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: decode(v.iv, 12), additionalData: aad(v), tagLength: 128},
        await key(password, decode(v.salt, 16), 'decrypt'), decode(v.data, 48)));
    } catch (_) { throw failure('VAULT_PASSWORD'); }
    try {
      if (bytes.length !== 32 || nt.getPublicKey(bytes) !== v.pk) throw failure('VAULT_INVALID');
      return bytes;
    } catch (e) { bytes.fill(0); throw failure('VAULT_INVALID'); }
  }
  async function seal(bytes, password, expectedPk) {
    passwordCheck(password, true);
    const nt = await nostr(), pk = nt.getPublicKey(bytes);
    if (expectedPk && pk !== expectedPk) throw failure('VAULT_INVALID');
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const v = {v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', it: ITERATIONS, pk, salt: encode(salt), iv: encode(iv)};
    v.data = encode(new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad(v), tagLength: 128},
      await key(password, salt, 'encrypt'), bytes)));
    // Verify a recoverable envelope before any caller replaces a legacy copy.
    const check = await open(v, password, pk); check.fill(0);
    return v;
  }
  async function sealLegacy(hex, password, expectedPk) {
    const bytes = scalar(hex);
    try { return await seal(bytes, password, expectedPk); } finally { bytes.fill(0); }
  }
  async function create(password) {
    const nt = await nostr(), bytes = nt.generateSecretKey();
    try { return await seal(bytes, password); } finally { bytes.fill(0); }
  }
  async function createUnprotected() {
    const nt = await nostr(), bytes = nt.generateSecretKey();
    try { return {pk: nt.getPublicKey(bytes), sk: Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('')}; }
    finally { bytes.fill(0); }
  }
  const record = () => config && config.record() || null;
  function notify() { document.dispatchEvent(new Event('gt:chat-vault-state')); }
  function lock() {
    epoch++; if (secret) secret.fill(0);
    secret = null; unlockedFingerprint = ''; notify();
  }
  function isUnlocked() {
    const c = record();
    try {
      if (!c || config.cleanupPending() || c.vaultInvalid || c.keyInvalid) return false;
      if (c.sk && !c.vault) {
        if (secret) secret.fill(0);
        secret = null; unlockedFingerprint = '';
        return !!c.pk && scalar(c.sk).length === 32;
      }
      return !!secret && !c.sk && unlockedFingerprint === fingerprint(validate(c.vault, c.pk));
    }
    catch (_) { return false; }
  }
  function isProtected() { const c = record(); return !!(c && Object.hasOwn(c, 'vault')); }
  function status() {
    const c = record();
    if (c && (c.vaultInvalid || c.keyInvalid)) return 'error';
    if (c && c.sk && !Object.hasOwn(c, 'vault')) {
      try { const bytes = scalar(c.sk), nt = root.NostrTools; if (!c.pk || nt && nt.getPublicKey(bytes) !== c.pk) return 'error'; return config && config.cleanupPending() ? 'cleanup' : 'unlocked'; } catch (_) { return 'error'; }
    }
    if (c && Object.prototype.hasOwnProperty.call(c, 'vault')) {
      try { validate(c.vault, c.pk); if (c.sk) return 'error'; } catch (_) { return 'error'; }
      if (config && config.cleanupPending()) return 'cleanup';
      return isUnlocked() ? 'unlocked' : 'locked';
    }
    if (c && !c.sk && (c.pk || Object.keys(c.friends || {}).length || Object.keys(c.msgs || {}).length)) return 'error';
    return 'setup';
  }
  async function unlock(password) {
    const c = record();
    if (!c || status() === 'error' || status() === 'cleanup') throw failure('VAULT_INVALID');
    const v = validate(c.vault, c.pk), expected = fingerprint(v), mine = ++epoch;
    const bytes = await open(v, password, c.pk);
    let current = false;
    try { current = mine === epoch && !!record() && expected === fingerprint(record().vault); } catch (_) {}
    if (!current) { bytes.fill(0); throw failure('VAULT_STALE'); }
    if (secret) secret.fill(0);
    secret = bytes; unlockedFingerprint = expected; notify();
  }
  async function removePassword() {
    if (!isUnlocked() || !isProtected() || !secret) throw failure('VAULT_LOCKED');
    const mine = ++epoch, bytes = secret.slice();
    try {
      await config.unprotect(bytes, () => mine === epoch);
      if (secret) secret.fill(0);
      secret = null; unlockedFingerprint = ''; notify();
    } finally { bytes.fill(0); }
  }
  function requireSecret() {
    if (!isUnlocked()) throw failure('VAULT_LOCKED');
    if (!secret) return scalar(record().sk);
    return secret;
  }
  root.ChatVault = Object.freeze({
    configure(value) { if (config) throw failure('VAULT_CONFIGURED'); config = value; },
    MIN_PASSWORD_LENGTH, validate, sealLegacy, create, createUnprotected,
    async verify(v, password, pk) { const bytes = await open(v, password, pk); bytes.fill(0); return v.pk; },
    status, isUnlocked, refresh: notify, isProtected, publicKey: () => record() && record().pk || '',
    setup(password) { const mine = ++epoch; return config.setup(password, () => mine === epoch); }, unlock, removePassword, lock,
    sync() { if (secret && !isUnlocked()) lock(); },
    createMessage(event, recipient) {
      const nt = root.NostrTools, sk = requireSecret();
      const rumor = nt.nip59.createRumor(event, sk);
      return {rumor, wrap: nt.nip59.createWrap(nt.nip59.createSeal(rumor, sk, recipient), recipient)};
    },
    decrypt(cipher, peer) {
      const nt = root.NostrTools, conversation = nt.nip44.getConversationKey(requireSecret(), peer);
      try { return nt.nip44.decrypt(cipher, conversation); } finally { conversation.fill(0); }
    }
  });
  addEventListener('pagehide', lock);
})(window);
