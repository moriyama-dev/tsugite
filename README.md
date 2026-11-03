# Tsugite

**English** | [日本語](#日本語)

Tsugite is a terminal for Linux and macOS, built on [Tabby](https://github.com/Eugeny/tabby).
It adds two things to it: the machines on your Tailscale network in the side panel, and
an explorer that shows the folder your terminal is in, the way VS Code's explorer does.

- **Tailscale** in the side panel: every machine on your tailnet, opened with a
  double-click. Online and offline machines are in lists you can fold, and you can sort
  machines into groups of your own.
- **Explorer** under it: the files of the folder the focused terminal is in, following
  every `cd`, on this computer and on SSH servers. Open, create, rename and delete
  files and folders, copy a path, or `cd` the terminal into a folder.
- **SSH connections** for servers outside your tailnet: host, port, keys, jump hosts,
  proxies, port forwarding and login scripts. Hosts in `~/.ssh/config` show up too.
- Drop a folder from Finder or your file manager onto the window to open a terminal in it.
  Dropped files are typed into the terminal as paths.
- Tabs, split panes, a vault for passwords and keys, themes and color schemes.
- No telemetry, no self-updater (updates come through apt and Homebrew).

Tsugite is a fork of Tabby (MIT). On first start it imports your existing Tabby
settings, so saved SSH connections carry over.

## Install

### macOS

macOS 12 or later, Apple Silicon and Intel. With [Homebrew](https://brew.sh):

```sh
brew tap moriyama-dev/tsugite https://github.com/moriyama-dev/tsugite
brew install --cask moriyama-dev/tsugite/tsugite
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
the machines appear in the side panel, refreshed every 30 seconds.

- **Online** and **Offline** list the machines that are in no group. Click a heading
  to fold it; Offline starts folded. Folded lists stay folded the next time.
- **Groups**: click the folder button on the **Tailscale** heading (or right-click it)
  to make one, then drag machines onto it, or right-click a machine →
  **Move to group**. Drag a machine onto Online, Offline or the Tailscale heading to
  take it out of its group. Right-click a group to rename or delete it; deleting a
  group keeps its machines.
- Double-click a machine, or use its terminal button, to open an SSH session. The gear
  button sets the username and authentication for that machine.

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

On a macOS remote machine, turn on **System Settings → General → Sharing → Remote
Login**. The Tailscale app for macOS cannot act as a Tailscale SSH server, so use
**SSH key** for Macs.

### Explorer

The explorer shows the folder of the terminal you are typing in (in a split tab, the
focused pane) and follows it as you `cd`.

- Click a folder to open it; double-click a file (or press Enter) to open it in the app
  your system picks. A file on an SSH server is fetched to a temporary folder first, and
  each time you save it there it is sent back to the server.
- Right-click for **Open in terminal** (`cd` there), **New file**, **New folder**,
  **Copy path** (the absolute path), **Rename** (F2) and **Delete** (Delete key).
  On this computer, deleted items go to the trash; on a server they are deleted for good,
  so Tsugite asks first.
- Hover an item for its size, permissions and modification time.
- Like VS Code, it does not show `.git`, `.DS_Store` and a few other such files.

To follow the folder on an SSH server, the shell there has to say where it is after
each command (with the OSC 7 escape code). When it connects, Tsugite sets that up:

- It writes `~/.config/tsugite/tsugite.bash` and `tsugite.zsh` on the server, and adds
  one line that loads them to `~/.bashrc` (and to `~/.bash_profile` if that does not
  load `~/.bashrc`) or `~/.zshrc`, for the shells in use. For fish it puts
  `~/.config/fish/conf.d/tsugite.fish`. Nothing else is changed.
- Other terminals ignore OSC 7, so the line does no harm elsewhere.
- To undo it, delete the lines that end in `# Added by Tsugite…`, `~/.config/tsugite`
  and `~/.config/fish/conf.d/tsugite.fish`. To stop Tsugite from adding them, turn off
  **Settings → SSH → Let the explorer follow the folder you are in**.
- Inside `tmux` on the server, the folder reaches Tsugite only with
  `set -g allow-passthrough on` in `~/.tmux.conf`.
- Until the shell reports its folder (or with a shell other than bash, zsh and fish),
  the explorer shows the home folder.

Local terminals need none of this: Tsugite reads the folder from the system.

### SSH connections

Click **+** next to **SSH connections** to add a server that is not on your tailnet.

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

Tailscale is a trademark of Tailscale Inc. Tsugite is an independent project, not
affiliated with or endorsed by Tailscale Inc. or the Tabby developers.

---

## 日本語

Tsugite（継手）は、[Tabby](https://github.com/Eugeny/tabby) をもとにした Linux・macOS 用のターミナルです。
Tabby に、次の2つを足しています。サイドバーに並ぶ Tailscale のマシンと、VS Code のエクスプローラーのように、ターミナルが今いるフォルダーを表示するエクスプローラーです。

- サイドバーの **Tailscale**：Tailnet 上のマシンを一覧表示し、ダブルクリックで接続します。オンラインとオフラインのマシンは、それぞれ折りたためる一覧に分かれています。自分で作ったグループにマシンを分けることもできます
- その下の **エクスプローラー**：操作中のターミナルが今いるフォルダーのファイルを表示し、`cd` するたびに追従します。このコンピューターでも、SSH の接続先でも使えます。ファイルやフォルダーを開く・作る・名前を変える・削除する、パスをコピーする、ターミナルでそのフォルダーに移動する、ができます
- **SSH 接続**：Tailnet にないサーバー用です。ホスト、ポート、鍵、踏み台、プロキシ、ポート転送、ログインスクリプトを設定できます。`~/.ssh/config` のホストも表示されます
- Finder やファイルマネージャーからフォルダーをウィンドウにドロップすると、そのフォルダーでターミナルが開きます。ファイルをドロップすると、そのパスがターミナルに入力されます
- タブ、画面分割、パスワードと鍵を守る Vault、テーマと配色
- 利用状況の送信、自動アップデート機能はありません（更新は apt と Homebrew で行います）

Tsugite は Tabby（MIT ライセンス）のフォークです。初めて起動したときに Tabby の設定を引き継ぐので、保存済みの SSH 接続もそのまま使えます。

### インストール

**macOS**（macOS 12 以降、Apple Silicon と Intel）

```sh
brew tap moriyama-dev/tsugite https://github.com/moriyama-dev/tsugite
brew install --cask moriyama-dev/tsugite/tsugite
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

**Tailscale のマシン**：このコンピューターに [Tailscale](https://tailscale.com/download) を入れてログインすると、サイドバーにマシンが並びます（30秒ごとに更新）。

- **オンライン** と **オフライン** には、どのグループにも入っていないマシンが並びます。見出しをクリックすると折りたためます。オフラインは最初は折りたたまれています。折りたたんだ状態は、次に起動したときもそのままです
- **グループ**：**Tailscale** の見出しのフォルダーのボタン（または右クリック）で作り、マシンをドラッグして入れます。マシンを右クリック →「グループに移動」でも入れられます。オンライン・オフライン・Tailscale の見出しにドラッグすると、グループから外れます。グループを右クリックすると、名前の変更と削除ができます。グループを削除しても、中のマシンは消えません
- マシンをダブルクリックするか、ターミナルのボタンで SSH 接続します。歯車のボタンで、そのマシンのユーザー名と認証方式を設定します

ログインの方式はマシンごとに選べます。

- **Tailscale SSH（鍵なし）**：接続先で一度だけ `sudo tailscale up --ssh` を実行します。本人確認は Tailscale が行うので、鍵の管理が要りません。Tailscale SSH が有効なマシンでは、これが初期値になります
- **SSH 鍵**：接続先で普通の SSH サーバーを動かします。SSH エージェントと `~/.ssh` の鍵を自動で試します。特定の鍵ファイルを指定することもできます

ユーザー名の初期値は、このコンピューターのユーザー名です。マシンごとに変えるか、**Tailscale** の見出しの右クリックメニューで、全体の初期値を変えられます。マシンを右クリックすると、アドレスのコピーや、通常の SSH 接続として保存（ポート転送などの詳しい設定を使うため）ができます。

接続先が macOS のときは、**システム設定 → 一般 → 共有 → リモートログイン** をオンにしてください。macOS 用の Tailscale アプリは Tailscale SSH のサーバーになれないので、Mac には **SSH 鍵** を使ってください。

**エクスプローラー**：入力中のターミナル（画面分割のタブでは、フォーカスのある側）が今いるフォルダーを表示し、`cd` に追従します。

- フォルダーはクリックで開きます。ファイルはダブルクリック（または Enter）で、OS が選ぶアプリで開きます。SSH の接続先のファイルは、いったん手元の一時フォルダーに取ってきて開き、保存するたびに接続先へ書き戻します
- 右クリックで「ターミナルでここに移動」（`cd`）、「新しいファイル」「新しいフォルダー」「パスをコピー」（絶対パス）、「名前を変更」（F2）、「削除」（Delete キー）ができます。このコンピューターで削除したものはゴミ箱に入ります。接続先では完全に削除されるので、先に確認します
- 項目にマウスを乗せると、サイズ・権限・更新日時が出ます
- VS Code と同じく、`.git` や `.DS_Store` などは表示しません

SSH の接続先で場所に追従するには、接続先のシェルがコマンドのたびに今いる場所を知らせる（OSC 7 というエスケープコード）必要があります。Tsugite は接続するときに、これを設定します。

- 接続先に `~/.config/tsugite/tsugite.bash` と `tsugite.zsh` を書き込み、使っているシェルの `~/.bashrc`（`~/.bashrc` を読まない `~/.bash_profile` があればそこにも）か `~/.zshrc` に、それを読み込む1行を足します。fish には `~/.config/fish/conf.d/tsugite.fish` を置きます。ほかは何も変えません
- ほかのターミナルは OSC 7 を無視するので、ほかのターミナルで接続しても害はありません
- 元に戻すには、`# Added by Tsugite…` で終わる行と、`~/.config/tsugite`、`~/.config/fish/conf.d/tsugite.fish` を消してください。足さないようにするには、**設定 → SSH →「エクスプローラーを今いる場所に追従させる」** をオフにします
- 接続先の `tmux` の中では、`~/.tmux.conf` に `set -g allow-passthrough on` があるときだけ、場所が Tsugite に届きます
- シェルから場所が届くまで（bash・zsh・fish 以外のシェルでも）、エクスプローラーはホームフォルダーを表示します

このコンピューターのターミナルでは、この設定は要りません。場所は OS から読み取ります。

**SSH 接続**：**SSH 接続** の見出しの **＋** から、Tailnet にないサーバーを追加します。

### 商標について

Tailscale は Tailscale Inc. の商標です。Tsugite は独立したプロジェクトで、Tailscale Inc. や Tabby の開発者とは提携しておらず、承認も受けていません。
