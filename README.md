# Tsugite

**English** | [日本語](#日本語)

Tsugite is a terminal-first SSH client for Linux and macOS. It lists the machines
on your Tailscale network, opens a terminal on any of them with one click, and can
start [Claude Code](https://claude.com/claude-code) there in the folder you choose.

- **Tailscale** section in the side panel: every machine on your tailnet, online ones
  first, refreshed every 30 seconds. Offline machines are one click away.
- **SSH connections** section for everything else: host, port, keys, jump hosts,
  proxies, port forwarding and login scripts. Hosts in `~/.ssh/config` show up too.
- **Start Claude Code** on any machine: Tsugite logs in, changes into the working folder,
  and runs `claude` inside `tmux`, so a dropped connection picks up where it left off.
  If Claude Code is missing it offers to install it.
- Tabs, split panes, a vault for passwords and keys, themes and color schemes.
- No file browser, no telemetry, no self-updater (updates come through apt and Homebrew).

Tsugite is a fork of [Tabby](https://github.com/Eugeny/tabby) (MIT). On first start it
imports your existing Tabby settings, so saved SSH connections carry over.

## Install

### macOS

macOS 12 or later, Apple Silicon and Intel. With [Homebrew](https://brew.sh):

```sh
brew tap moriyama-dev/tsugite https://github.com/moriyama-dev/tsugite
brew install --cask tsugite
```

Updates then come with `brew upgrade`. You can also use the `.dmg` from
[Releases](https://github.com/moriyama-dev/tsugite/releases); the app is not
notarized, so the first time open **System Settings → Privacy & Security** and
choose **Open Anyway**.

### Linux (Ubuntu / Debian)

Linux x64, Ubuntu 22.04 or later.

```sh
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://moriyama-dev.github.io/tsugite/tsugite-archive-keyring.gpg | sudo tee /etc/apt/keyrings/tsugite-archive-keyring.gpg > /dev/null
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/tsugite-archive-keyring.gpg] https://moriyama-dev.github.io/tsugite stable main" | sudo tee /etc/apt/sources.list.d/tsugite.list > /dev/null
sudo apt update
sudo apt install tsugite
```

Updates then come with `sudo apt upgrade`. The `.deb` and a portable `.tar.gz`
are also on the [Releases](https://github.com/moriyama-dev/tsugite/releases) page.

## Using it

### Tailscale machines

Install [Tailscale](https://tailscale.com/download) on this computer and sign in;
the machines appear in the side panel. Hover a machine for three buttons:

| Button | What it does |
|---|---|
| Terminal | Opens an SSH session (double-click does the same) |
| Wand | Starts Claude Code on the machine |
| Gear | Username, authentication and Claude Code working folder for this machine |

Two ways to log in, chosen per machine:

- **Tailscale SSH (no key)**: run `sudo tailscale up --ssh` on the remote machine
  once. Tailscale checks your identity; no keys to manage. Machines with Tailscale
  SSH enabled use this by default.
- **SSH key**: the remote machine runs an ordinary SSH server. Tsugite tries your SSH
  agent and the keys in `~/.ssh`, or a key file you pick.

The default username is your local one; change it per machine, or for all of them
from the right-click menu on the **Tailscale** heading. Right-click a machine to copy
its address or save it as a regular SSH connection (for port forwarding and other
advanced options).

### SSH connections

Click **+** next to **SSH connections** to add a host that is not on your tailnet.
Each connection has a **Claude Code working folder** field and the same wand button.

### Claude Code on the remote machine

The remote machine needs Linux or macOS and `sh`. The first time, Claude Code asks
you to sign in: it prints a URL; open it in your browser. Installing `tmux` on the
remote machine is recommended (`sudo apt install tmux`, `brew install tmux`): closing
the tab then leaves Claude running, and starting it again reattaches.

On a macOS remote machine:

- Turn on **System Settings → General → Sharing → Remote Login** for SSH.
- The Tailscale app from the App Store or tailscale.com cannot act as a Tailscale SSH
  server; use **SSH key** for Macs.
- Claude Code keeps its login in the keychain, which is locked in SSH sessions. If it
  asks you to sign in every time, run `security unlock-keychain` first.

## Building from source

Node.js 22+, Yarn 1 and, on Linux, `libfontconfig-dev libsecret-1-dev`:

```sh
yarn
yarn run build
TABBY_DEV=1 yarn start                 # run from the source tree
node scripts/prepackage-plugins.mjs
node scripts/build-linux.mjs           # or build-macos.mjs; output in dist/
```

## License

MIT. Copyright (c) 2017 Tabby Developers, (c) 2026 Yoshiro Moriyama. See [LICENSE](LICENSE).

---

## 日本語

Tsugite（継手）は、ターミナルが主役の SSH クライアントです（Linux・macOS）。
Tailscale につながっているマシンを一覧表示し、クリックひとつでターミナルを開いたり、
指定したフォルダで [Claude Code](https://claude.com/claude-code) を起動したりできます。

- サイドバーの **Tailscale** セクション：Tailnet 上のマシンを、オンラインのものから順に表示します（30秒ごとに更新）。オフラインのマシンもワンクリックで表示できます
- **SSH 接続** セクション：Tailscale に入っていないサーバー用です。ホスト、ポート、鍵、踏み台、プロキシ、ポート転送、ログインスクリプトを設定できます。`~/.ssh/config` のホストも表示されます
- **Claude Code を起動**：ログインして作業フォルダに移動し、`tmux` の中で `claude` を実行します。回線が切れても続きから再開できます。Claude Code が入っていなければ、導入するか確認します
- タブ、画面分割、パスワードと鍵を守る Vault、テーマと配色
- ファイルブラウザー、利用状況の送信、自動アップデート機能はありません（更新は apt と Homebrew で行います）

Tsugite は [Tabby](https://github.com/Eugeny/tabby)（MIT ライセンス）のフォークです。
初めて起動したときに Tabby の設定を引き継ぐので、保存済みの SSH 接続もそのまま使えます。

### インストール

**macOS**（macOS 12 以降、Apple Silicon と Intel）

```sh
brew tap moriyama-dev/tsugite https://github.com/moriyama-dev/tsugite
brew install --cask tsugite
```

以後は `brew upgrade` で更新されます。[Releases](https://github.com/moriyama-dev/tsugite/releases) の `.dmg` も使えますが、公証（notarize）していないので、初回は **システム設定 → プライバシーとセキュリティ** で **このまま開く** を選んでください。

**Linux**（Ubuntu 22.04 以降 / Debian、x64）

```sh
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://moriyama-dev.github.io/tsugite/tsugite-archive-keyring.gpg | sudo tee /etc/apt/keyrings/tsugite-archive-keyring.gpg > /dev/null
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/tsugite-archive-keyring.gpg] https://moriyama-dev.github.io/tsugite stable main" | sudo tee /etc/apt/sources.list.d/tsugite.list > /dev/null
sudo apt update
sudo apt install tsugite
```

以後は `sudo apt upgrade` で更新されます。

### 使い方

**Tailscale のマシン**：このコンピューターに [Tailscale](https://tailscale.com/download) を入れてログインすると、サイドバーにマシンが並びます。マシンにマウスを乗せると、3つのボタンが出ます。

| ボタン | 動作 |
|---|---|
| ターミナル | SSH で接続します（ダブルクリックでも同じ） |
| 杖 | そのマシンで Claude Code を起動します |
| 歯車 | ユーザー名、認証方式、Claude Code の作業フォルダを設定します |

ログインの方式はマシンごとに選べます。

- **Tailscale SSH（鍵なし）**：接続先で一度だけ `sudo tailscale up --ssh` を実行します。本人確認は Tailscale が行うので、鍵の管理が要りません。Tailscale SSH が有効なマシンでは、これが初期値になります
- **SSH 鍵**：接続先で普通の SSH サーバーを動かします。SSH エージェントと `~/.ssh` の鍵を自動で試します。特定の鍵ファイルを指定することもできます

ユーザー名の初期値は、このコンピューターのユーザー名です。マシンごとに変えるか、**Tailscale** の見出しの右クリックメニューで、全体の初期値を変えられます。マシンを右クリックすると、アドレスのコピーや、通常の SSH 接続として保存（ポート転送などの詳しい設定を使うため）ができます。

**SSH 接続**：**SSH 接続** の見出しの **＋** から、Tailnet にないサーバーを追加します。各接続に **Claude Code の作業フォルダ** の欄と、杖のボタンがあります。

**接続先の Claude Code**：接続先は Linux か macOS で、`sh` が必要です。初回は Claude Code がログイン用の URL を表示するので、手元のブラウザで開いてください。接続先に `tmux` を入れておくのがおすすめです（`sudo apt install tmux`、`brew install tmux`）。タブを閉じても Claude が動き続け、もう一度起動するとそのまま戻れます。

接続先が macOS のとき：

- **システム設定 → 一般 → 共有 → リモートログイン** をオンにしてください
- App Store 版や公式サイト版の Tailscale アプリは、Tailscale SSH のサーバーになれません。Mac には **SSH 鍵** を使ってください
- Claude Code はログイン情報をキーチェーンに保存しますが、SSH 経由ではキーチェーンがロックされています。毎回ログインを求められる場合は、先に `security unlock-keychain` を実行してください
