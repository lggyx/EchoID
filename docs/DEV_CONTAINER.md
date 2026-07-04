# EchoID 开发容器

两个容器：
- **echoid-dev**  Next.js 应用（Node 22）→ 宿主 `:3000`
- **echoid-asr**  faster-whisper ASR 微服务（Python 3.11）→ 宿主 `:8000`

都跑在 Apple 官方 `container` CLI 里，通过宿主机代理访问外网。

## 前置
- macOS 15+ 且已装 `container`（`container --version` 应能输出）
- 宿主机代理监听 `127.0.0.1:7897`（对应 `~/.zshrc` 里的 `proxy_on`）
- 宿主机 `python3` 存在（macOS 自带）
- Huggingface 模型缓存在 `~/.cache/huggingface`（会被 ASR 容器**只读挂载**，无需重下）

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
