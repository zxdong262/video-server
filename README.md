# video-server

极简、只读的视频点播服务：目录浏览 + 浏览器直接播放，零依赖，单文件 Node 服务。

A tiny read-only VOD server: browse folders, click to play. Zero dependencies, plain Node.

## 用法 / Usage

```bash
git clone https://github.com/zxdong262/video-server.git
cd video-server
cp .env.example .env   # 填写 MEDIA_ROOT / set MEDIA_ROOT
node server.js         # 或 npm start
```

Windows：

```bat
git clone https://github.com/zxdong262/video-server.git E:\dev\video-server
cd /d E:\dev\video-server
copy .env.example .env
```

`.env` 示例：

```ini
PORT=24433
HOST=0.0.0.0
MEDIA_ROOT=G:\media
SITE_TITLE=Media
AUTH_USER=admin
AUTH_PASS=change-me
```

## 配置 / Settings

| Key | 默认 / default | 说明 / meaning |
| --- | --- | --- |
| `PORT` | `24433` | 监听端口 / listen port |
| `HOST` | `0.0.0.0` | 监听地址 / bind address |
| `MEDIA_ROOT` | — | 媒体根目录，绝对路径 / media root, absolute path |
| `SITE_TITLE` | `Media` | 页面标题 / page title |
| `AUTH_USER` | — | 登录用户名，留空则关闭认证 / login user, empty disables auth |
| `AUTH_PASS` | — | 登录密码 / login password |

## 功能 / Features

- 任意层级目录浏览，面包屑 + 返回上级 / directory browsing with breadcrumbs
- 点击视频直接播放，HTML5 播放器 / play videos in the browser
- HTTP Range 支持，可拖动进度、边下边播 / range requests, seeking works
- 同目录自动生成播放列表，支持上下集切换、播完自动下一个 / playlist + auto next
- 记住播放位置，下次打开从上次处继续 / resume playback position
- 同名 `.vtt` 字幕自动挂载 / matching `.vtt` subtitles are attached
- 排序：名称 / 大小 / 时间 / sort by name, size or time
- 路径穿越防护，只读，不写文件 / path traversal guarded, read-only
- Cookie 登录，凭据写在 `.env`，改密码即踢掉所有旧会话 / cookie login, credentials in `.env`

## 路由 / Routes

| Route | 说明 |
| --- | --- |
| `/` | 根目录列表 |
| `/b/<path>` | 目录列表 |
| `/w/<path>` | 播放页 |
| `/f/<path>` | 原始文件（流式，支持 Range 与 `?dl=1` 下载） |
| `/api/health` | 健康检查 |
| `/login` `/logout` | 登录 / 退出 |

## 登录 / Auth

设置 `AUTH_USER` / `AUTH_PASS` 后，未登录访问会跳到 `/login`；登录状态用 HMAC 签名 cookie 保存 30 天。

Set both `AUTH_USER` and `AUTH_PASS` to enable the login page. Sessions are
stateless HMAC-signed cookies valid for 30 days; changing either value
invalidates every existing session. Leave them empty to serve anonymously.

## 开机自启（Windows，可选）/ Autostart

```bat
schtasks /Create /TN video-server /TR "E:\dev\video-server\start.bat" /SC ONLOGON /RL HIGHEST /F
schtasks /Run /TN video-server
```

`start.bat`：

```bat
@echo off
cd /d E:\dev\video-server
node server.js >> server.log 2>&1
```

如需局域网访问，放行端口：

```bat
netsh advfirewall firewall add rule name="video-server 24433" dir=in action=allow protocol=TCP localport=24433
```

## License

MIT
