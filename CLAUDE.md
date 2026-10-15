# CLAUDE.md

天秤の書（司法試験の論文式を練習する学習ゲーム）の PWA 版。https://satou-aaaaa.github.io/tenbin/

## push する前の確認

```bash
node tools/build_pwa.mjs <hourei-quest.html> .   # アプリ本体（単体HTML）から作り直す。index.html を手で直さない
node tools/check.mjs --browser                    # 文法・manifest・ブラウザで開いてエラーが出ないか（CI の Check と同じ）
```

## 公開

- GitHub Pages は `main` を公開する。マージすれば反映される。
- `changes.html`（更新情報）は Changes ワークフローがマージされた PR の題から作り直す。手で直さない。
  遊ぶ人に見せたくない PR（.github/・qa/・tools/・README・CLAUDE.md だけの変更）は載らない。

## 共通のきまり

- PR の作り方・マージの仕方は共通スキル（PR の手順）と、satou-aaaaa/shared-workflows の `routines/common.md` に従う。
- CI の部品（CI失敗Issue・死活監視・Lighthouse・ブランチ片付け）は shared-workflows の共通部品を呼ぶ。
  リポジトリ側の .github/workflows には呼び出しと設定値だけを書く。
