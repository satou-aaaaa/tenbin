# 天秤の書（論文答案クエスト）PWA版

司法試験の論文式を、事例問題で練習する学習ゲームのPWA版です。

- 公開URL: https://satou-aaaaa.github.io/tenbin/
- 一度開くとオフラインでも使えます。スマホではホーム画面に追加してください。
- 進み具合と答案はブラウザ内にだけ保存されます。消えないようブラウザに頼んでいますが、念のため目次の「記録の引っ越し」から書き出して控えを取ってください（しばらく書き出していないと案内が出ます）。
- Claudeの添削は、claude.ai版（Artifact）で開いたときだけ使えます。

## ご利用の前に

- 学習用のアプリで、法律相談ではありません。実際のトラブルは弁護士や法テラスに相談してください。
- 試験の実施団体とは関係のない、個人の非公式アプリです。問題・解説は作者が AI（Claude）を使って作り、確かめていますが、正確さは保証できません。
- 問題はすべて新しく作ったもので、過去問の文章は使っていません。条文は e-Gov 法令検索（デジタル庁）のデータをもとに作者が加工しています。条文・判決文は著作権の対象外（著作権法13条）ですが、問題と解説の文章の著作権は作者にあります。
- 同じ内容をアプリの下の「このアプリについて」にも載せています（`tools/build_pwa.mjs` が付け、`tools/check.mjs` があるか確かめます）。

## 更新のしかた

### 前提

- Node.js 22 以上と npm（版は `.nvmrc`）
- 最初に一度だけ、道具（Playwright と Chromium）を入れます。版は `package-lock.json` で固定しています。何度実行してもかまいません（Windows は Git Bash で）。

```
bash scripts/setup.sh
```

すでに Chromium がある環境では、`CHROMIUM_PATH=<chromium の場所>` を付けるとそれを使います（Claude Code のクラウドセッションでは setup.sh が自動で設定します）。

### 作り直す

元になるのは、アプリ本体の単体HTML（claude.ai 版の Artifact から保存した `hourei-quest.html`）です。リポジトリには入れていません。

```
node tools/build_pwa.mjs <hourei-quest.html> .
```

本体は変えずに PWA の外側（`tools/build_pwa.mjs` の中身）だけを直したときは、今の `index.html` を元にして作り直せます。

```
node tools/build_pwa.mjs index.html .
```

`SOURCE_DATE_EPOCH`（秒）を付けると、版をその時刻にします。同じ入力と同じ版からは同じファイルができます。

### 生成物（直接直さない）

`index.html`・`sw.js`・`manifest.webmanifest`・アイコン（`icon-192.png`・`icon-512.png`・`icon-maskable-512.png`・`apple-touch-icon.png`）は `tools/build_pwa.mjs` が作ります。直すときはこのスクリプトを直して作り直してください。`changes.html` は Changes ワークフローが作ります。

### 検査

```
node tools/check.mjs --browser --rebuild
```

PR と main への push で、CI（Check）が同じ検査をします。文法、manifest とアイコンの大きさ、`sw.js` がオフライン用に取るファイルがそろっているか、ブラウザで開いてエラーが出ないか、作り直して生成物と同じになるかを見ます。
