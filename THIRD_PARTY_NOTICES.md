# 소스와 자산 출처

방·전투·화면 코드는 이 저장소를 위해 작성했습니다. 기존 DS배틀로얄의 서버 권위 구조와 재접속 개념을 참고한 기준 커밋은 `5585c8ca5f262d51e3732fb2115bab6e660fefd5`입니다. 기획서 작성 시점과 구현 착수 시점의 main SHA가 일치했습니다. [기존 게임 구조 문서](https://github.com/YEOMT/DSbettleroyale/blob/5585c8ca5f262d51e3732fb2115bab6e660fefd5/docs/architecture.md)

런타임 의존성은 npm 잠금 파일에 고정했습니다.

| 라이브러리 | 용도 | 라이선스 |
|---|---|---|
| [ws](https://github.com/websockets/ws) 8.22.1 | 서버 WebSocket 연결·프레임 | MIT |
| [qrcode](https://github.com/soldair/node-qrcode) 1.5.4 | 방 참가 QR PNG 생성 | MIT |

간접 의존성의 버전·무결성·라이선스 정보는 `package-lock.json`과 각 배포 패키지에 있습니다. 클라이언트는 브라우저의 WebSocket, Canvas 2D, Web Audio를 사용합니다.

라틴 제목 글꼴 Barlow Condensed ExtraBold Italic은 SIL Open Font License 1.1에 따라 원본을 배포합니다. 원본 Git blob은 `fbb716a1922dcc8c5a939394609c1d55a6d5d292`입니다. [공식 글꼴](https://github.com/google/fonts/tree/main/ofl/barlowcondensed) · [동봉 라이선스](public/assets/Barlow-LICENSE.txt)

대표 이미지는 내장 이미지 생성 도구로 이 게임용으로 제작한 [arena-keyart.jpg](public/assets/arena-keyart.jpg)입니다. 제작 지시는 어두운 경기장 오른쪽에서 연두색 룬을 새긴 흑연 금속 공과 작은 화염 공이 맞붙는 와이드 3D 장면, 왼쪽은 제목을 위한 여백, 이미지 안의 텍스트 없음이었습니다. 로고·아이콘·경기 도형은 프로젝트에서 작성했고 음향은 실시간 합성합니다.

`public/assets/balls/`의 26개 캐릭터 초상화는 이 프로젝트에서 직접 그린 원본 SVG입니다. `node tools/generate-portraits.mjs`로 재생성합니다. 검객·닌자·탄성 격투가·빙결 술사·소환사 등 만화적인 전투 유형을 표현하며 외부 캐릭터 스크린샷이나 초상화를 포함하지 않습니다.

추가 콘텐츠의 기획 참고는 [Random.GG Ballfight](https://www.random.gg/ballfight)와 [Custom Balls Tutorial](https://weapon-ball-fight-wbf-official.fandom.com/wiki/Custom_Balls_Tutorial)입니다. 도감·형태 선택·발동 조건과 약점으로 정의하는 능력 구성에서 아이디어를 참고했습니다. 해당 게임의 엔진 코드·캐릭터 이미지·음원을 가져온 파일은 없습니다.

강화 경제 계산 스크립트는 최신 `packages/content/economy.js`와 실제 강화 전이를 사용합니다. 이전 기획서의 8+정답당1, +0~+20 규칙은 현재 버전에 적용하지 않습니다.
