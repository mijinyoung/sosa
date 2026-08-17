/* 배포 환경별 공개 설정입니다. 비밀값·Pixel ID·Access Token은 넣지 마세요. */
window.SOSA_CONFIG = {
  relayUrl: 'https://sosa-lead-relay.mijinyoung.workers.dev'
};

// Pixel ID는 중계 API의 환경변수에서만 읽어 이 파일로 내려옵니다.
window.SOSA_META_READY = new Promise(function(resolve) {
  var script = document.createElement('script');
  script.src = window.SOSA_CONFIG.relayUrl.replace(/\/$/, '') + '/meta-pixel.js';
  script.async = true;
  script.onload = resolve;
  script.onerror = resolve; // 접수 성공 자체를 추적 스크립트 오류로 막지 않습니다.
  document.head.appendChild(script);
});
