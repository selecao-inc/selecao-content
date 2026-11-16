# AGENTS.md — AI エージェント向けの作業ルール

株式会社セレソンの発信サイト（https://media.selecao.ai）と、記事の自動化のリポジトリ。
AI エージェントはこのファイルのルールに従って作業する。ツール固有の指示ファイル（CLAUDE.md 等）は置かない（CI で検出して失敗させる）。

会社のサイト（https://selecao.ai）は別リポジトリ `selecao-inc/selecao-ai` で管理する。このリポジトリから会社のサイトを直接変更しない。

## 最初に読むもの

1. このファイル
2. `docs/`（ARCHITECTURE / RUNBOOK / DECISIONS）
3. 担当する GitHub Issue（`gh issue view <番号> --repo selecao-inc/selecao-content`）

## ルール

1. **1 PR = 1 Issue = 1 目的**。Issue に書かれた範囲だけを変更する。無関係なリファクタ・整形・改善を混ぜない
2. **記事の PR とコードの PR を混ぜない**
   - 記事の PR：`content/articles/` だけを変える。事実確認（執筆と別のモデル）と、人の確認を通す
   - コードの PR：それ以外（サイト・自動化・`infra/`・`docs/`）を変える。執筆と別のモデルのレビューと、人の承認を通す
3. **main に直接 push しない**。作業ブランチ（`feat/` `fix/` `infra/` `docs/` `chore/` `article/`）から PR を出す。マージは人間が行う
4. **過剰実装しない**。将来用のコード・不要な抽象化・ラッパーを作らない。必要になった時点で足す
5. **依存は固定版**で追加する（`pnpm add -E`。`^` `~` を付けない）。更新は Dependabot の PR で行う
6. **版の指定元は1か所**：Node = `package.json` の `engines.node`、pnpm = `packageManager`。`.nvmrc` 等を別に作らない
7. **`infra/` の変更は PR 経由のみ**。手元で `terraform apply` しない（HCP Terraform がマージ時に反映する）
8. **秘密情報を書かない**。鍵・トークンは `infra/secrets.enc.yaml`（SOPS 暗号化）以外のどこにも置かない。コード・ログ・ドキュメント・PR 本文にも含めない
9. **"Done" の前に検証コマンドを全部通す**。結果（pass/fail）を PR 本文に書く
10. **コードを変える PR では `docs/` も同じ PR で更新する**
11. AI が作ったコミットには `Co-Authored-By` を付ける

## 検証コマンド

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## PR の書き方

タイトル：`<種類>: <変更内容>`（例 `feat: 記事の一覧ページを追加`）
本文：背景 / 概要 / テスト（コマンドと結果） / 完了条件（Issue のチェックリスト） / `Closes #<Issue番号>`

## リポジトリ構成

```
app/          サイト本体（Next.js App Router）
content/      記事・巡回先（段階1〜）
public/       静的ファイル
tests/        テスト（Vitest）
infra/        Terraform・SOPS（段階0）
docs/         技術ドキュメント・記事の書き方と自動化の指示（docs/articles/）
.github/      CI・Dependabot
```

`src/` は作らない。

## 技術

Next.js（App Router・React・TypeScript）／ Tailwind CSS v4 ／ 静的生成 ／ pnpm ／ Vitest ／ Vercel ／ Terraform + HCP Terraform ／ SOPS（age）
