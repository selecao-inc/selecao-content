# ARCHITECTURE

段階0（サイトの土台）の構成。記事の自動化の全体設計は [設計メモ](articles/design.md) を参照。

## 構成

| 置き場所 | 役割 |
|---|---|
| `app/layout.tsx` | `<html lang="ja">`、書体 Noto Sans JP、地の色。明るい配色のみ |
| `app/page.tsx` | トップ（`/`）。段階0は「準備中」の表示だけ。段階2で記事の一覧にする |
| `app/globals.css` | 色・書体。selecao.ai の値にそろえている |
| `tests/page.test.tsx` | トップの表示のテスト |
| `.github/workflows/ci.yml` | lint・型・テスト・build と、AGENTS.md 以外の指示ファイルの検出（job 名 `ci`） |

技術・版の決め方は selecao-ai と同じ（版の正本は `package.json` と `pnpm-lock.yaml`）。

## まだ無いもの

- `infra/`（GitHub・Vercel・ドメインの Terraform 管理）：段階0の次の PR で足す
- 記事・自動化：段階1以降
