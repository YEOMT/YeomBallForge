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

강화 경제 계산 스크립트는 사용자가 제공한 기획서 부록 A를 사용했습니다. 외부 게임의 캐릭터·그림·음원이나 게임 엔진 소스를 복제한 파일은 없습니다.
