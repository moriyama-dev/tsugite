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
- **Work panel** under that terminal: an input box that is easy to use with Japanese and
  other input methods, the current state (working, waiting for your answer, ready) with a
  timer, a send queue, desktop notifications, prompt history and snippets. Claude Code
  itself is shown exactly as it is; the panel only types into it.
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

### Work panel

Tabs started with the wand button get a panel under the terminal.

- **Input**: Enter sends, Shift+Enter adds a line (or switch to Ctrl/⌘+Enter in the **⋯**
  menu). Enter never sends while an input method is converting. ↑ at the start of the box
  recalls earlier prompts; drafts are kept per machine. The prompt is pasted into the
  terminal and submitted, so line breaks survive.
- **State**: read from the title Claude Code gives the terminal, and from the question on
  screen when it waits for an answer. The side panel shows the same next to the machine.
- **While it works**: what you send is queued and sent when Claude Code is ready again.
  **Stop** sends Esc. When it waits for an answer, the panel offers **1 2 3 ↑ ↓ Enter**
  as keys; nothing is ever answered for you.
- **Notifications** when a run finishes or needs an answer and you are looking elsewhere.
- **Snippets** under the input insert ready-made instructions; edit them with the pencil.
  The clock button lists what you sent from the tab and how long each run took; pick one
  to edit and send it again. The **⋯** menu sends `/resume`, `/compact`, `/model`,
  `/clear` and `/help`.

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

Claude and Claude Code are trademarks of Anthropic, PBC; Tailscale is a trademark of
Tailscale Inc. Tsugite is an independent project, not affiliated with or endorsed by
either. It does not include Claude Code: it starts the copy installed on your machine,
signed in with your own account and subject to Anthropic's terms.

---

## 日本語

Tsugite（継手）は、ターミナルが主役の SSH クライアントです（Linux・macOS）。
Tailscale につながっているマシンを一覧表示し、クリックひとつでターミナルを開いたり、
指定したフォルダで [Claude Code](https://claude.com/claude-code) を起動したりできます。

- サイドバーの **Tailscale** セクション：Tailnet 上のマシンを、オンラインのものから順に表示します（30秒ごとに更新）。オフラインのマシンもワンクリックで表示できます
- **SSH 接続** セクション：Tailscale に入っていないサーバー用です。ホスト、ポート、鍵、踏み台、プロキシ、ポート転送、ログインスクリプトを設定できます。`~/.ssh/config` のホストも表示されます
- **Claude Code を起動**：ログインして作業フォルダに移動し、`tmux` の中で `claude` を実行します。回線が切れても続きから再開できます。Claude Code が入っていなければ、導入するか確認します
- そのターミナルの下の **作業パネル**：日本語入力しやすい入力欄、今の状態（処理中・確認待ち・待機中）と経過時間、送信キュー、デスクトップ通知、指示の履歴と定型文。Claude Code の画面はそのまま表示し、パネルはそこへ入力するだけです
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

**作業パネル**：杖のボタンで開いたタブには、ターミナルの下にパネルが付きます。

- **入力欄**：Enter で送信、Shift+Enter で改行です（**⋯** メニューで Ctrl/⌘+Enter 送信に切り替えられます）。日本語の変換中の Enter では送信しません。入力欄の先頭で ↑ を押すと、前の指示を呼び出せます。下書きはマシンごとに残ります。指示はターミナルに貼り付けてから送るので、改行もそのまま届きます
- **状態**：Claude Code がターミナルに付けるタイトルと、確認待ちのときに画面に出る質問から判断します。サイドバーのマシン名の横にも同じ印が出ます
- **処理中**：送った指示はキューに入り、Claude Code が待機中に戻ったら送られます。**中断** は Esc キーを送ります。確認待ちのときは **1 2 3 ↑ ↓ Enter** のキーを押せます。勝手に答えることはありません
- **通知**：ほかの画面を見ているあいだに処理が終わったり、確認待ちになったりすると知らせます
- **定型文**：入力欄の下に並び、クリックで文が入ります。鉛筆のボタンで編集できます。時計のボタンでは、このタブから送った指示と所要時間の一覧を見られ、選ぶと入力欄に戻して直してから送り直せます。**⋯** メニューから `/resume`、`/compact`、`/model`、`/clear`、`/help` を送れます

### 商標について

Claude と Claude Code は Anthropic, PBC の商標、Tailscale は Tailscale Inc. の商標です。Tsugite は独立したプロジェクトで、両社とは提携しておらず、承認も受けていません。Tsugite には Claude Code は含まれていません。手元に入っている Claude Code を、利用者自身のアカウントで起動するだけで、利用には Anthropic の規約が適用されます。
