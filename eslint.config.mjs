const browserGlobals = 'window document navigator localStorage sessionStorage fetch AbortController Blob URL TextEncoder TextDecoder crypto btoa atob FileReader File FormData XMLHttpRequest MediaRecorder MediaDevices SpeechRecognition webkitSpeechRecognition HTMLCanvasElement HTMLAudioElement HTMLVideoElement Image ClipboardItem Notification ServiceWorker Registration IndexedDB IDBKeyRange IDBObjectStore IDBTransaction DOMParser requestAnimationFrame cancelAnimationFrame matchMedia location history confirm alert prompt setTimeout clearTimeout setInterval clearInterval console Audio ResizeObserver IntersectionObserver HTMLElement Node Event CustomEvent MouseEvent KeyboardEvent performance devicePixelRatio screen indexedDB SpeechSynthesisUtterance speechSynthesis MediaMetadata structuredClone self caches Worker BroadcastChannel CSSStyleSheet USB Bluetooth Serial navigator'.split(/\s+/).filter(Boolean);

const G = {};
for (const g of browserGlobals) G[g] = 'readonly';

export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: G
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-cond-assign': 'off',
      'no-prototype-builtins': 'off'
    }
  }
];
