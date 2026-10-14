# 天秤の書（論文答案クエスト）PWA版

司法試験の論文式を、事例問題で練習する学習ゲームのPWA版です。

- 公開URL: https://satou-aaaaa.github.io/tenbin/
- 一度開くとオフラインでも使えます。スマホではホーム画面に追加してください。
- 進み具合と答案はブラウザ内にだけ保存されます。
- Claudeの添削は、claude.ai版（Artifact）で開いたときだけ使えます。

## 更新のしかた

アプリ本体（単体HTML）から次のコマンドで作り直します。

```
node tools/build_pwa.mjs <hourei-quest.html> .
```
