# GitHub Pages와 AWS 연결

게임 소스는 `YEOMT/YeomBallForge`에 있습니다. 현재 검증 주소는 실행 중인 교실 PC입니다. 검토 후 직접 게시하면 GitHub Pages가 정적 화면과 브라우저 내 연습 경기를 제공합니다. 교실 PC나 추후 연결할 AWS 서버가 방·채점·강화·실전 전투를 담당합니다. [GitHub Pages 공식 설명](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 교실 PC

`npm ci` 후 `npm start`로 HTTP와 WebSocket 서버가 함께 시작됩니다. 기본 주소는 `http://localhost:3000/`이며 같은 Wi-Fi의 학생은 `http://<교사 PC의 LAN IPv4>:3000/`로 접속합니다. 다중 네트워크 어댑터 환경에서 QR에 표시된 주소가 학생 기기와 같은 망인지 확인하세요. 교사가 해당 LAN 주소로 직접 열면 그 주소를 공유합니다. 포트는 `.env`의 `PORT`로 지정합니다.

## AWS 배포 후보

1. 사용할 서버의 CPU·메모리와 여유 포트를 확인하고 게임 전용 디렉터리와 프로세스를 준비합니다. HTTPS 도메인과 TLS를 종료할 역방향 프록시 또는 로드 밸런서를 지정합니다. 인메모리 방을 유지하도록 초기 버전은 단일 서버 인스턴스로 운영합니다.
2. 서버에 `NODE_ENV=production`, 12자 이상의 비공개 `TEACHER_PASSWORD`, 허용할 정확한 HTTPS 출처 목록 `ALLOWED_ORIGINS`를 설정합니다. Pages 출처는 `https://yeomt.github.io`입니다. 게임 서버에서 직접 화면을 열면 그 서버의 HTTPS 출처도 쉼표로 추가합니다.
3. 저장소의 Dockerfile로 이미지를 빌드하고 새 컨테이너를 시작합니다. 아래 예시에서 `server.env`는 서버 측 비공개 파일입니다. 포트와 자원 제한은 호스트의 실측 여유에 맞춥니다.

```sh
docker build -t ds-ball-forge:1.0.0 .
docker run -d --name ds-ball-forge --restart unless-stopped \
  --env-file /etc/ds-ball-forge/server.env \
  -p 127.0.0.1:3310:3000 --memory=256m --cpus=1 ds-ball-forge:1.0.0
```

4. 전용 도메인의 HTTP 요청과 `/ws`의 WebSocket Upgrade를 같은 인스턴스로 전달합니다. Caddy에서는 아래처럼 새 도메인 블록을 추가할 수 있습니다. 방 QR 이미지는 같은 서비스의 `/api/qr`에서 생성됩니다.

```caddyfile
ballforge.example.org {
    reverse_proxy 127.0.0.1:3310
}
```

5. `https://<게임도메인>/health`에서 `ok: true`와 프로토콜 버전을 확인합니다. HTTPS 페이지에서는 `wss://<게임도메인>/ws`가 필요합니다. 서버 도메인에서 직접 플레이하면 같은 출처의 WebSocket을 자동 선택합니다.

## Pages 정적 화면 갱신

루트의 `npm run build`는 정적 사이트를 `dist/`에 생성합니다. 서버 연결 전에는 브라우저 연습 모드와 교실 서버 접속 안내를 표시합니다. AWS가 준비되면 빌드 시 환경 변수 `BALLFORGE_WS_URL`에 실제 WSS 주소를 지정합니다.

```powershell
$env:BALLFORGE_WS_URL = 'wss://ballforge.example.org/ws'
npm run build
```

저장소의 Pages 게시 방식은 GitHub Actions입니다. 사용자가 PR을 검토한 뒤 직접 게시하도록 수동 실행만 설정했습니다.

1. 게임 PR을 검토하고 병합합니다. 저장소가 빈 상태에서 시작했으므로 최초 PR의 기준 브랜치는 `review-base`입니다. 기존 Pages 환경이 허용하는 `main` 브랜치를 검토·병합한 커밋에서 생성하세요.
2. AWS 서버가 준비되면 저장소 변수 `BALLFORGE_WS_URL`를 설정합니다. 비워 두면 공개 페이지에서 연습 경기를 관전할 수 있습니다.
3. GitHub **Actions → Publish arena → Run workflow**에서 `main`을 선택하고 직접 실행합니다. 테스트 통과 후 `dist/`만 게시합니다. 게시 주소는 `https://yeomt.github.io/YeomBallForge/`입니다.
4. AWS 연결 후 교사 방 생성 → 별도 기기 참가 → 퀴즈 → 강화 → 실제 경기 → 새로고침 재접속을 확인하세요. 모든 정적 모듈·이미지 경로는 `/YeomBallForge/` 아래에서 동작합니다. [GitHub Pages 워크플로 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

프로세스를 교체하면 진행 중인 방이 만료됩니다. 수업이 끝난 뒤 배포하세요.
