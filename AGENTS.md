# AGENTS.md

<!-- AI エージェント共通の指示（Claude・Codex・Gemini・Copilot などが読む）。CLAUDE.md はこれを取り込むだけ。 -->

天秤の書（司法試験の論文式を練習する学習ゲーム）の PWA 版。https://satou-aaaaa.github.io/tenbin/

## 準備（最初に一度）

```bash
bash scripts/setup.sh   # Node.js（版は .nvmrc）を確かめ、依存とブラウザを入れる。何度実行してもよい（Windows は Git Bash で）
```

Claude Code のクラウドセッションでは `.claude/settings.json` のフックが自動で実行する（ブラウザは CHROMIUM_PATH で入っているものを使う）。

## push する前の確認

```bash
node tools/build_pwa.mjs <hourei-quest.html> .   # アプリ本体（単体HTML）から作り直す。外側だけ直すなら <hourei-quest.html> の代わりに index.html でよい
node tools/check.mjs --browser --rebuild          # 文法・manifest・アイコン・SHELL・ブラウザで開く・作り直して同じか（CI の Check と同じ）
```

## 公開

- index.html・sw.js・manifest・アイコンは生成物。手で直さない（Check の作り直し比べで落ちる）。
- GitHub Pages は `main` を公開する。マージすれば反映される。
- `changes.html`（更新情報）は Changes ワークフローがマージされた PR の題から作り直す。手で直さない。
  遊ぶ人に見せたくない PR（.github/・qa/・tools/・README・CLAUDE.md だけの変更）は載らない。

## 共通のきまり

- PR の作り方・マージの仕方は satou-aaaaa/shared-workflows の `routines/pr.md`、全体のきまりは `routines/common.md` に従う。
- CI の部品（CI失敗Issue・死活監視・Lighthouse・ブランチ片付け）は shared-workflows の共通部品を呼ぶ。
  リポジトリ側の .github/workflows には呼び出しと設定値だけを書く。
- Claude 以外の AI・人が作業するときは、shared-workflows の `routines/tool-map.md`（道具の置き換え）と `routines/without-claude.md` を読む。
