// ===== AES-GCM 私密数据加密 =====
// 密钥由用户口令派生（PBKDF2），口令不存储；可选项「记住口令」(localStorage, 设备级)。
let _key = null;

export const cryptoSupported = !!globalThis.crypto && !!crypto.subtle;

export const hasKey = () => !!_key;

export const deriveKey = async (passphrase) => {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  _key = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt: enc.encode('ai-workbench-salt-v1'), iterations: 100000, hash:'SHA-256' },
    baseKey, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']
  );
  return _key;
};

export const encryptText = async (plain) => {
  if (!_key) return { cipher: plain, enc:false };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, _key, new TextEncoder().encode(plain));
  return { enc:true, iv: btoa(String.fromCharCode(...iv)), data: btoa(String.fromCharCode(...new Uint8Array(ct))) };
};
export const decryptPayload = async (obj) => {
  if (!obj || !obj.enc) return obj ? obj.data : '';
  if (!_key) throw new Error('NO_KEY');
  const iv = Uint8Array.from(atob(obj.iv), c=>c.charCodeAt(0));
  const ct = Uint8Array.from(atob(obj.data), c=>c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv}, _key, ct);
  return new TextDecoder().decode(pt);
};
// 记住口令（设备级，仅本机）
export const rememberKey = (passphrase) => { try { localStorage.setItem('wb_enc_pass','1'); localStorage.setItem('wb_enc_pass_val', passphrase); } catch{} };
export const recallKey = async () => {
  const v = localStorage.getItem('wb_enc_pass_val');
  if (v) { await deriveKey(v); return true; }
  return false;
};
export const clearRemembered = () => { localStorage.removeItem('wb_enc_pass'); localStorage.removeItem('wb_enc_pass_val'); };
export const isRemembered = () => !!localStorage.getItem('wb_enc_pass');
