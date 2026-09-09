// ===== 媒体：录音 / 语音转文字 / 视频处理 =====
import { toast } from './utils.js';

// --- 麦克风录音 (MediaRecorder) ---
export const startRecording = (opts={}) => new Promise((resolve, reject) => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { reject(new Error('不支持录音')); return; }
  navigator.mediaDevices.getUserMedia({ audio:true }).then(stream => {
    const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'audio/mp4' });
    const chunks = [];
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => { stream.getTracks().forEach(t=>t.stop());
      const blob = new Blob(chunks, { type: mr.mimeType }); resolve({ blob, url: URL.createObjectURL(blob), mime: mr.mimeType }); };
    mr.start();
    resolve._stop = () => mr.stop();
    resolve.controller = { stop: () => mr.stop() };
  }).catch(reject);
});

// --- 语音转文字 ---
// 优先使用 Web Speech API (SpeechRecognition)，否则返回提示（需手动输入）
export const hasSpeechRecognition = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return !!SR;
};
export const createTranscriber = (onFinal, onInterim) => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'zh-CN'; rec.continuous = true; rec.interimResults = true;
  rec.onresult = (e) => {
    let interim='', final='';
    for (let i=e.resultIndex;i<e.results.length;i++){
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
    }
    if (final) onFinal(final);
    if (interim) onInterim(interim);
  };
  return rec;
};

// 文本转语音（朗读）
export const speak = (text, opts={}) => {
  if (!('speechSynthesis' in window)) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN'; u.rate = opts.rate||1; u.pitch = opts.pitch||1;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
  return true;
};
export const stopSpeak = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); };

// --- 视频：去水印 / 文案提取 / 音频分离 ---
// 浏览器内可行的基础处理：Canvas 重绘去水印(模糊局部)、ffmpeg.wasm 过于重，这里提供客户端可行方案：
// 1) 视频转音频：用 WebAudio 解码(若存在音频轨) —— 复杂，我们提供「上传视频 -> 提取首帧封面」与「画布去水印导出」。
export const extractFrame = (videoFile) => new Promise((resolve) => {
  const url = URL.createObjectURL(videoFile);
  const v = document.createElement('video');
  v.src = url; v.muted = true; v.crossOrigin='anonymous';
  v.onloadeddata = () => { v.currentTime = Math.min(0.1, v.duration/2); };
  v.onseeked = () => {
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v,0,0);
    c.toBlob(b=>{ resolve(b); URL.revokeObjectURL(url); }, 'image/png');
  };
  v.onerror = () => resolve(null);
});

// 画布去水印：将矩形区域做模糊处理（简单高斯近似）
export const removeWatermark = (imgBlob, rects=[]) => new Promise((resolve) => {
  const url = URL.createObjectURL(imgBlob);
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas'); c.width=im.width; c.height=im.height;
    const ctx = c.getContext('2d'); ctx.drawImage(im,0,0);
    const tile = 8;
    rects.forEach(r=>{
      for (let y=r.y; y<r.y+r.h; y+=tile) for (let x=r.x; x<r.x+r.w; x+=tile) {
        const sx=Math.max(0,x-tile), sy=Math.max(0,y-tile);
        const d = ctx.getImageData(sx,sy,Math.min(tile*3,im.width-sx),Math.min(tile*3,im.height-sy)).data;
        let rr=0,gg=0,bb=0,n=0;
        for (let i=0;i<d.length;i+=4){ rr+=d[i];gg+=d[i+1];bb+=d[i+2];n++; }
        ctx.fillStyle=`rgb(${rr/n|0},${gg/n|0},${bb/n|0})`;
        ctx.fillRect(x,y,Math.min(tile,im.width-x),Math.min(tile,im.height-y));
      }
    });
    c.toBlob(b=>{ resolve(b); URL.revokeObjectURL(url); }, 'image/png');
  };
  im.onerror = ()=>resolve(null);
  im.src = url;
});

// 无损压缩图片（用于封面）
export const resizeImage = (imgBlob, maxW=1280) => new Promise((resolve)=>{
  const url=URL.createObjectURL(imgBlob); const im=new Image();
  im.onload=()=>{ const sc=Math.min(1,maxW/im.width); const c=document.createElement('canvas');
    c.width=im.width*sc; c.height=im.height*sc; c.getContext('2d').drawImage(im,0,0,c.width,c.height);
    c.toBlob(b=>{ resolve(b); URL.revokeObjectURL(url); },'image/jpeg',0.85); };
  im.onerror=()=>resolve(null); im.src=url;
});
