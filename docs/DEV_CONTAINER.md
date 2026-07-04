# EchoID 开发容器

两个服务：
- **app**  Next.js 应用（Node 22）→ 宿主 `:3000`
- **asr**  faster-whisper ASR 微服务（Python 3.11）→ 宿主 `:8000`

支持两种容器化方式:

| 方式 | 平台 | 一句话 |
|---|---|---|
| [Docker Compose](#docker-compose) | 跨平台 | 一条 `docker compose up`,推荐 |
| [Apple `container`](#apple-container-climacos-15) | macOS 15+ | 不需要 Docker Desktop |

---

## Docker Compose

前置：Docker Engine 20.10+ / Compose v2。

```bash
docker compose up --build       # 前台
docker compose up -d --build    # 后台
docker compose exec app bash    # 进 app 容器
docker compose logs -f asr      # 看 ASR 推理日志
docker compose down             # 停止 & 删除
```

- app 通过 Compose 内置 DNS 访问 asr（`http://asr:8000`),不需要任何桥接。
- 首次启动会：install 依赖 → prisma generate → prisma db push → next dev,大约 2–3 分钟。
- 之后 `node_modules` 存在匿名 volume 里,重启秒开。

**代理**：如果需要走本机代理（比如 Clash/Mihomo）:

```bash
cp docker-compose.override.example.yml docker-compose.override.yml
# 里面已经把 host.docker.internal:7897 配好,按需修改端口
docker compose up --build
```

Linux 主机需要 `extra_hosts: ["host.docker.internal:host-gateway"]`（示例文件里已经写好）。macOS/Windows Docker Desktop 天然支持 `host.docker.internal`。

**Huggingface 模型缓存**：`asr` 服务会把宿主 `~/.cache/huggingface` 挂进容器,不重复下载。首次运行前如果本机没有 `Systran/faster-whisper-small`,容器会自动下载（~464MB,走代理时约 3–5 分钟）。

**修改端口**：`.env` 里改 `APP_PORT` / `ASR_PORT` 或 `HF_CACHE_DIR`（参考 `.env.example`）。

---

## Apple `container` CLI (macOS 15+)

不装 Docker Desktop 时的替代方案。两个容器 + 一个宿主代理桥。

## 前置
- macOS 15+ 且已装 `container`（`container --version` 应能输出）
- 宿主机代理监听 `127.0.0.1:7897`（对应 `~/.zshrc` 里的 `proxy_on`）
- 宿主机 `python3` 存在（macOS 自带）
- Huggingface 模型缓存在 `~/.cache/huggingface`（会被 ASR 容器**只读挂载**,无需重下）

## 一次性准备

```bash
scripts/dev.sh bridge     # 启动代理桥（0.0.0.0:17897 -> 127.0.0.1:7897）
scripts/dev.sh build      # 构建 echoid-dev 镜像（Node app）
scripts/dev.sh build-asr  # 构建 echoid-asr 镜像（Python + faster-whisper）
```

桥接是必需的：宿主机代理只监听 loopback，容器无法直连；桥接把它暴露到 `192.168.64.1:17897`（容器网络网关），容器内通过 `HTTP(S)_PROXY=http://192.168.64.1:17897` 直接使用。

## 日常开发

```bash
scripts/dev.sh up         # bridge + asr（detached）
scripts/dev.sh dev        # npm install + prisma + npm run dev，映射 :3000（interactive）
```

在宿主机浏览器打开 <http://localhost:3000>。ASR 服务地址会通过环境变量 `ASR_ENDPOINT=http://192.168.64.1:8000` 自动注入到 Next.js 容器。

## 只想跑单个服务

```bash
scripts/dev.sh asr        # 只起 ASR，方便单独调试
scripts/dev.sh shell      # 交互 shell（Next.js 容器），源码在 /app
scripts/dev.sh status     # 查看两个容器和桥的状态
```

## 停止

```bash
scripts/dev.sh stop       # 停两个容器 + 停桥
```

## 网络说明

| 位置        | 代理地址                        | ASR 地址                    |
|-------------|----------------------------------|-----------------------------|
| 宿主机 zsh  | `http://127.0.0.1:7897`（原样）  | `http://localhost:8000`     |
| 桥接监听    | `0.0.0.0:17897`                  |                             |
| 容器内看到 | `http://192.168.64.1:17897`      | `http://192.168.64.1:8000`  |

容器里 `HTTP_PROXY / HTTPS_PROXY / http_proxy / https_proxy` 已自动注入；`NO_PROXY` 包含 `localhost, 127.0.0.1, 192.168.64.1` 保证本地和 ASR 不走代理。

## 切换 ASR 到 mock

`.env` 里改：
```
ASR_PROVIDER=mock
```
重启 dev 容器即可。这样开发时不需要 ASR 容器（只需要 dev 一个）。
