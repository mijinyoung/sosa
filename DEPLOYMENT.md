# 소사 랜딩 접수·Meta 배포 안내

## 변경 파일

- `index.html`: 예약값 전송, 과거 날짜 차단, 중계 API 접수 성공 뒤 Browser Lead 실행
- `tracking-config.js`: 공개 중계 API 주소만 보관하고 Meta 추적 스크립트를 불러옴
- `apps-script/Code.gs`: Sheets 저장, SOLAPI 관리자/고객 문자, ScriptProperties 사용
- `worker/`: CORS·입력 검증·Apps Script 확인·Meta CAPI를 수행하는 Cloudflare Worker

`sosa/index.html`은 기존 보조 페이지이므로 변경하지 않았습니다. 실제 배포 루트가 이 파일이라면 동일한 구조를 별도 적용해야 합니다.

## 1. Apps Script 설정

1. 기존 Apps Script 프로젝트에서 `Code.gs`로 교체합니다.
2. 프로젝트 설정 > 스크립트 속성에 아래 값을 새로 등록합니다.

| 키 | 값 |
| --- | --- |
| `SOLAPI_API_KEY` | 새로 발급한 SOLAPI API Key |
| `SOLAPI_API_SECRET` | 새로 발급한 SOLAPI API Secret |
| `SENDER_PHONE` | SOLAPI에 등록한 발신번호, 숫자만 |
| `ADMIN_PHONE` | 관리자 수신번호, 숫자만 |
| `RELAY_SHARED_SECRET` | 무작위 긴 문자열 |

3. 웹 앱을 **실행 사용자: 나**, **액세스 권한: 모든 사용자**로 새 배포하고 `/exec` URL을 복사합니다.
4. Sheet의 A~F 열을 각각 `접수일시`, `성함`, `연락처`, `관심평형`, `방문희망일`, `방문희망시간`으로 준비합니다.

## 2. Cloudflare Worker 설정

1. `worker/` 폴더를 Worker 프로젝트로 배포합니다.
2. `.dev.vars.example`의 이름을 참고해 Worker Secret/환경변수를 등록합니다. `.dev.vars` 파일은 저장소에 올리지 않습니다.
3. `ALLOWED_ORIGIN`은 실제 랜딩 도메인의 스킴·도메인만 정확히 입력합니다. 예: `https://landing.example.com`
4. `APPS_SCRIPT_URL`에는 위 Apps Script `/exec` URL을, `APPS_SCRIPT_RELAY_TOKEN`에는 동일한 `RELAY_SHARED_SECRET`을 입력합니다.
5. Worker URL을 `tracking-config.js`의 `relayUrl`에 입력합니다.

## 3. Meta 설정

1. Events Manager에서 Pixel ID와 Conversions API Access Token을 생성합니다.
2. 각각 Worker의 `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN` Secret으로 등록합니다.
3. 테스트 중에는 Events Manager의 Test Event Code를 `META_TEST_EVENT_CODE`로 임시 등록합니다. 운영 전 삭제합니다.
4. Pixel 도메인 허용 목록과 이벤트 측정 설정을 실제 랜딩 도메인 기준으로 확인합니다.

## 4. 배포 후 테스트 순서

1. 중계 API URL과 허용 도메인이 맞는지 확인합니다.
2. 일반 문의(예약일·시간 미선택)를 제출합니다. Sheet의 A~F 열과 관리자/고객 문자를 확인합니다. 문자에 방문희망 항목은 없어야 합니다.
3. 예약 문의를 제출합니다. Sheet E/F 열 및 두 문자에 방문희망 항목이 표시되어야 합니다.
4. Meta Test Events에서 PageView와 Lead가 한 건씩 보이는지, Browser/Server Lead의 `event_id`가 같아 중복 제거되는지 확인합니다.
5. Worker 로그에서 전화번호나 토큰 없이 `lead_success`, `capi_success`만 기록되는지 확인합니다.

## 참고

SOLAPI는 요청 접수 응답과 실제 단말기 수신 상태가 다를 수 있습니다. 이 구현의 “성공”은 Sheets 저장과 SOLAPI 발송 요청의 정상 접수까지를 의미합니다.
