# 공개 페이지와 실시간 교실 서버

공개 게임 주소는 **https://yeomt.github.io/YeomBallForge/** 입니다. 배포는 `main`의 변경을 GitHub Actions로 테스트·빌드한 뒤 `dist/`만 게시합니다. GitHub Pages는 정적 HTML·CSS·JavaScript를 제공하므로, 학생 여러 명이 같은 방에 참여하는 게임 판정은 별도 Node.js WebSocket 서버가 담당합니다. [GitHub Pages 공식 설명](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 정적 페이지에서 되는 것

서버가 연결되지 않은 빌드도 도감, 볼 실험실, 샘플 퀴즈·강화·CPU 토너먼트/30인 럼블 연습을 실행합니다. 화면에 **이 기기 연습**임을 표시합니다. 실제 교실 방 생성·참가는 `BALLFORGE_WS_URL`가 연결되어야 합니다. 비어 있으면 실시간 서버 미설정 안내를 표시합니다.

```sh
npm ci --ignore-scripts
npm test
npm run build
```

빌드는 이전 `dist/`를 지운 뒤 정적 파일과 브라우저용 공통 모듈을 복사합니다. 모든 경로는 `/YeomBallForge/` 같은 하위 경로에서 동작합니다. 교사 비밀번호·문제은행·서버 난수는 배포물에 포함하지 않습니다.

## 실시간 서버: 같은 교실 PC

`npm start`로 HTTP와 WebSocket 서버를 함께 실행합니다. 기본 주소는 `http://localhost:3000/`입니다. 학생들은 같은 Wi-Fi에서 `http://<교사 PC의 LAN IPv4>:3000/`로 접속합니다. QR의 주소가 학생 기기에서 접근 가능한 같은 네트워크인지 확인합니다. 포트는 `.env`의 `PORT`로 바꿀 수 있습니다.

실시간 수업 동안 Node 프로세스를 계속 실행해야 합니다. 방은 메모리에 보관하므로 재시작·배포 시 기존 방이 만료됩니다. 진행 중인 수업이 끝난 뒤 서버를 교체합니다.

## 실시간 서버: 공개 HTTPS 서비스

이 저장소에는 기존 서버에 올릴 Dockerfile과 선택 가능한 Render 배포 설정 `render.yaml`이 있습니다. 특정 외부 서버가 이미 배포·연결되었다고 가정하지 않습니다.

### Render 미리보기 배포

계정 연결 후 `render.yaml`의 Web Service를 생성하면 `main` 코드를 받아 `npm ci --omit=dev --ignore-scripts`, `npm start`를 실행합니다. 설정은 무료 미리보기 인스턴스이며 유료 전환을 자동 승인하지 않습니다.

- `TEACHER_PASSWORD`: Render 비공개 환경 변수에 12자 이상으로 직접 설정합니다. GitHub·클라이언트 코드에 기록하지 않습니다.
- `NODE_ENV=production`, `HOST=0.0.0.0`을 사용합니다. `PORT`는 Render가 제공하는 값을 읽습니다.
- `ALLOWED_ORIGINS=https://yeomt.github.io`로 Pages 출처를 허용합니다. Render 도메인에서도 교실 UI를 쓸 경우 그 정확한 HTTPS 출처를 쉼표로 추가합니다.
- `/health`가 정상 응답하는지 확인하고 서비스의 실제 도메인으로 `wss://<서비스도메인>/ws`를 구성합니다.

Render의 무료 서비스는 유휴 시 내려가고 다음 HTTP 요청이나 WebSocket 연결 때 다시 올라옵니다. 공식 문서는 무료 인스턴스를 미리보기 용도로 설명합니다. 실제 수업 운영 자원은 해당 서버에서 30명 부하를 측정한 뒤 결정합니다. [공식 첫 배포 안내](https://render.com/docs/your-first-deploy) · [무료 서비스 제한](https://render.com/docs/free) · [Blueprint 명세](https://render.com/docs/blueprint-spec)

### 기존 AWS 또는 Docker 호스트

게임 전용 프로세스와 TLS를 종료할 도메인/프록시가 필요합니다. 초기 인메모리 방 구조에서는 단일 인스턴스로 운영합니다. 서버 측 비공개 환경 파일에 `NODE_ENV=production`, `TEACHER_PASSWORD`, `ALLOWED_ORIGINS`를 설정합니다.

```sh
docker build -t yeomballforge:1.1.0 .
docker run -d --name yeomballforge --restart unless-stopped \
  --env-file /etc/yeomballforge/server.env \
  -p 127.0.0.1:3310:3000 yeomballforge:1.1.0
```

예시 Caddy 설정은 다음과 같습니다. 주소와 포트는 실제 서버에 맞춰 바꿉니다.

```caddyfile
ballforge.example.org {
    reverse_proxy 127.0.0.1:3310
}
```

`/ws`의 WebSocket Upgrade와 `/api/qr` 요청을 같은 서버로 전달해야 합니다. `https://<게임도메인>/health`에서 `ok: true`를 확인합니다.

## 공개 페이지에 서버 연결

1. GitHub 저장소 변수 **BALLFORGE_WS_URL**에 실제 `wss://<게임도메인>/ws`를 지정합니다. 이는 공개 접속 주소이며 비밀번호가 아닙니다.
2. `main`에 변경을 반영하거나 **Actions → Publish arena → Run workflow**로 다시 빌드합니다. `public/config.js` 대신 빌드 결과의 `config.js`에 접속 주소가 들어갑니다.
3. GitHub Pages의 게시 원본은 **GitHub Actions**를 사용합니다. 배포 환경이 브랜치를 제한한다면 `main`을 허용해야 합니다. [공식 Pages 게시 원본 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
4. 공개 페이지에서 교사 방 생성 → 별도 학생 기기 참가 → 퀴즈 → 강화 선택 → 토너먼트 자기 경기/호스트 경기 선택 → 럼블 학생 개인 카드 → 새로고침 재접속을 확인합니다.

서버 주소에 비밀번호·쿼리·해시를 넣을 수 없고 경로는 `/ws`만 허용합니다. HTTPS 페이지는 WSS 서버에 연결합니다. 같은 서버에서 직접 제공되는 UI는 같은 출처의 WebSocket을 사용합니다.
