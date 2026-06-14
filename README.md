# myx-cli

**画面の左下に常に表示しておきたいもの**を1か所にまとめる、自分用の常駐ウィジェットです。
Ghostty で `claude` を使っている間、tmux の左下ペインに表示します。

```
  5h ███░░░░░░░░░ 28% →44%  ⏳3h18m
  7d ████░░░░░░░░ 35% →64%  ⏳4d6h
```

## 趣旨

「これは**常に見ておきたい**な」と思ったものを、左下のこの小さなペインに**随時追加していく**前提で作っています。今は Claude の使用量を出していますが、今後ほしくなったものを足していきます。

**現在表示しているもの**

- **Claude の使用量** … 5時間 / 週次のレート制限バー、リセットまでの残り時間（`⏳`）、現ペースでの着地予測（`→NN%`）。緑/黄/赤で色分け。

> `→NN%` = そのウィンドウの平均ペースで進んだ場合、リセット時点で何%になるかの予測（超過ペースなら赤）。

## 仕組み

`myx launch` で tmux レイアウトを生成します。カレントディレクトリのシェルを**縦4列**に並べ、**一番左の列の下**にウィジェットを固定します。

```
┌──────┬──────┬──────┬──────┐
│ work │      │      │      │
│      │ work │ work │ work │   ← claude は好きな列で起動
├──────┤      │      │      │
│ myx  │      │      │      │   ← ウィジェット（高さ固定）
└──────┴──────┴──────┴──────┘
```

（Ghostty には特定ペインへプロセスを配置する API が無いため、レイアウトは tmux で組みます。）

使用量は**公式の値**です。Claude Code が statusLine コマンドへ stdin で渡す JSON の
`rate_limits.five_hour` / `rate_limits.seven_day` を `myx statusline` が
`~/.cache/myx/usage.json` にキャッシュし、ウィジェットがそれを読みます（API キー不要・推定なし）。
バーとカウントダウンは毎秒再描画、％は Claude Code を使うたびに更新され、約10分アイドルで `⚠`（stale）になります。

## 必要環境

- macOS ＋ [Ghostty](https://ghostty.org)
- tmux 3.4 以上
- Node 20 以上
- 使用制限のある Claude プラン（Pro / Max など。statusLine に `rate_limits` が出るもの）

## セットアップ

```bash
npm install

# どこからでも `myx launch` できるよう PATH に通す（~/.local/bin が PATH 上である前提）
ln -sf "$PWD/bin/myx" ~/.local/bin/myx

# 公式の使用量をウィジェットに流す。~/.claude/settings.json をバックアップし、
# 既存の statusLine があれば連結保持する。実行後 Claude Code を再起動:
myx install-statusline

# tmux の初期設定（truecolor + マウス）: scripts/tmux-myx.conf の内容を
# 自分の tmux 設定（例: ~/.config/tmux/tmux.conf）に追記して tmux を再起動

myx doctor          # tmux / statusLine / キャッシュ / 設定 を確認
```

## 使い方

```bash
myx launch          # レイアウトを生成して接続（claude は好きな列で起動）
myx launch --fresh  # 既存セッションを消して再構築（設定変更を反映するとき）
myx launch --canvas # 左1列（作業＋widget）＋右半分に GUI キャンバス（macOS、下記）
myx widget          # ウィジェット単体（ペイン内で動いているもの）
myx doctor          # 環境チェック
```

`myx launch --fresh` は **対象セッションの外**（新しい Ghostty タブなど）から実行してください。
セッションの中で実行すると、再構築前に自分自身のプロセスごと kill されます。

## 右側のキャンバス（`--canvas`、macOS）

「左で claude を動かし、その成果（HTML など）を**右側の本物のウィンドウ**に映す」ためのレイアウトです。
左の tmux 列は **上＝作業（claude）／下＝使用量ウィジェット**。右半分は tmux ペインではなく、
タイル配置した**実ブラウザ（Chrome `--app`）ウィンドウ**です（実 GUI なので将来 Illustrator なども載せられる）。

```
┌────────┐  ┌──────────────┐
│ work   │  │              │
│(claude)│  │   canvas     │  ← 実ブラウザ／アプリのウィンドウ
├────────┤  │ (myx show …) │     （画面の右半分にタイル）
│ myx    │  │              │
└────────┘  └──────────────┘
  Ghostty       別 GUI ウィンドウ
```

```bash
myx launch --canvas          # レイアウト生成＋ウィンドウ配置
myx show ./report.html       # 左の claude から右へ表示（編集すると自動リロード）
myx show https://example.com # URL もそのまま表示
```

仕組み: `myx show` は表示対象を `~/.cache/myx/canvas/state.json` に書き、ローカルの小さなサーバ
（`myx canvas-serve`、Node 標準の http のみ・追加依存なし）が配信するラッパーページが状態を
ポーリングして `<iframe>` を差し替えます。**監視フラグ不要で、表示中ファイルを編集すると自動で再読込**
されます。ウィンドウを開いて右半分へ配置する部分だけ osascript を使うため、初回に
**オートメーション＋アクセシビリティ**の許可を求められます（未許可なら手順を表示して継続）。

## 開発

```bash
npm install
npm run typecheck   # tsc --noEmit（型チェック）
npm test            # node:test のユニットテスト（projection 計算・整形ロジック）
npm run format      # Prettier 整形（確認のみは npm run format:check）
npm run once        # 1 フレームだけ stdout に描画
```

ビルド工程はありません（`tsx` で直接実行）。GitHub Actions の CI が Node 20 / 22 で
typecheck・テスト・整形チェックを実行します。

## 設定

任意。`~/.config/myx/config.json`（`config.example.json` 参照）:

| キー                    | 意味                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `pane.heightLines`      | myx ペインの高さ（絶対行数。例 `2`）。窓のリサイズでも維持される       |
| `pane.heightPct`        | …または一番左の列に対する割合（`heightLines` 未設定時に使用）          |
| `session`               | `myx launch` の tmux セッション名（既定 `myx`）                        |
| `canvas.split`          | `--canvas` で Ghostty に割く画面左側の割合（既定 `0.5`）               |
| `canvas.port`           | キャンバス用ローカルサーバのポート（既定 `7842`）                      |
| `canvas.menuBarPx`      | タイル時にメニューバー分あける上端の余白 px（既定 `25`）               |
| `canvas.tileSelf`       | `launch --canvas` で Ghostty 自身も左半分にタイルするか（既定 `true`） |
| `canvas.chromePath`     | キャンバスに使う Chrome バイナリのパス上書き（任意）                   |
| `statuslinePassthrough` | `install-statusline` が自動設定。以前の statusLine を連結するための値  |

## メモ

- 以前は Google カレンダー連携も実装していましたが、ウィジェットを使用量に集中させるため撤去しました（git 履歴から復元可能）。
