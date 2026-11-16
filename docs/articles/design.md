# 記事の自動化：設計整理

作成日: 2026-11-16。状態: **段階0に着手**（#1〜#3）。§10 の未チェックの項目は未決。

selecao-ai の worktree `article-automation-design` で整理したものを、リポジトリ作成後にここへ移した。段階1以降の実装後に `docs/articles/pipeline.md` へ正本化する。

## 0. 目的と前提

- 目的: セレソンとして、AI の最新情報と、実際に試した知見の記事を書き続け、selecao.ai と X で届ける。ネタ収集・執筆・事実確認・公開・投稿を自動化し、人の作業を最小にする。
- 決定済み（2026-11-16）: 頻度は **週2〜3本**。SNS は **X**。ただし **最初はサイトだけ**で始め、X 投稿は後の段階。
- 決定済み（2026-11-16）: 公開先は **サブドメイン `media.selecao.ai`**、リポジトリは **新規の `selecao-inc/selecao-content`**（§4）。
  - `media` を選んだ理由: `news` は最新情報に意味が限られる。`media` なら解説・事例・動画・ツール配布・ニュースレターへ広げても名前に無理がない。
  - 別リポジトリにした理由: 自動化で記事の PR が多く流れるため、会社のサイト（selecao-ai）の PR・CI・合格シナリオの順番待ちと切り離す。自動化の不具合が会社のサイトに及ばない。
  - リポジトリ名を `content`（単数形）にした理由: Web で「発信するもの全般」を指す慣例どおり（`contents` は「目次・中身」の意味に寄る）。サイト以外の発信先（X・ニュースレター等）が増えても名前を変えずに済む。
  - 記事だけのリポジトリとサイトのリポジトリには分けない: リポジトリをまたぐ更新・プレビューの連携が増えるわりに得るものが少ない。記事は Markdown なので将来の移行も容易。
- 決定済み（2026-11-16）: **最初は公開前に人の確認を入れる**。外す時期は §8 の基準を満たしたうえで大野さんが判断する。
- 決定済み（2026-11-16）: ソフトウェアファクトリーの仕組みは **記事とコードで分けて適用する**（§6）。
- 設計の原則:
  - **状態はすべて GitHub に置く**（Issue・PR・ラベル）。特定の AI ツールの中に状態を持たない（設計書 docs/factory/ の原則0）。
  - **指示はリポジトリの Markdown に置く**（docs/articles/）。ルーティンや CI は「このファイルを読んで実行せよ」と呼ぶだけにし、どのツールに差し替えても同じ動きをさせる。
  - **書く役と確かめる役を別のモデルにする**（Claude と Codex）。
  - **失敗は必ず人に届く**。静かに止まらない。

## 1. 全体の流れ

```
[毎日 7:00]        R1 ネタ収集（AI ルーティン）
                     content/sources.yaml の RSS を巡回 → 重複除外 → 候補 Issue
                          │ label: article:candidate
                          ▼
[月・水・金 9:00]   R2 執筆（AI ルーティン）
                     候補を1件選ぶ → 記事 Markdown を書く → PR
                          │ label: article:fact-check
                          ▼
[PR の更新時]       W1 事実確認（GitHub Actions）
                     ① 機械検査（スキーマ・出典・リンク・確認日）
                     ② AI 確認（執筆と別モデル）：主張ごとに出典と照合
                          ├─ 不合格 → article:needs-fix → R2 が修正（最大2回）
                          │                                  → 3回目は人へ（article:escalated）
                          ▼ 合格
                     article:awaiting-owner
                          ▼
[週1・金]           人の確認（大野）：まとめて見てマージ。ひと言は任意
                          ▼ マージ
                     Vercel が本番に反映
                          ▼ 本番デプロイ成功
                     W2 公開後処理：Issue を閉じる（article:published）／X 投稿（段階5）

[毎日]              W3 滞留整理：承認待ち14日超 → PR を閉じ、候補に戻す
[毎月1日]           R3 再検証：確認日から90日超の記事の出典を確かめ直す → 更新 PR
[毎週月曜]          R4 週報：収集・執筆・公開・失敗の件数と、閲覧・X の反応を Slack へ
[常時]              失敗通知：どの処理も失敗したら Slack へ
```

## 2. 状態（ラベル）

| ラベル | 付く場所 | 意味 | 次に動くもの |
|---|---|---|---|
| `article:candidate` | Issue | ネタ候補 | R2 |
| `article:pick` | Issue | 大野さんが「これ書いて」と指定（優先） | R2 |
| `article:drafting` | Issue | 執筆中（二重着手の防止） | R2 |
| `article:fact-check` | PR | 事実確認待ち | W1 |
| `article:needs-fix` | PR | 確認で不合格 | R2（修正） |
| `article:escalated` | PR | 2回直しても不合格 | 人 |
| `article:awaiting-owner` | PR | 公開前の人の確認待ち | 人 |
| `article:published` | Issue | 公開済み | — |
| `article:rejected` | Issue | 見送り（重複・価値不足・滞留） | — |

- 1記事 = 1 Issue = 1 PR = 1 ブランチ（`article/<日付>-<slug>`）。
- ラベルの付け外しは処理（R・W）だけが行い、人は `article:pick` と `article:rejected` だけを使う。

## 3. 各処理の仕様

### R1 ネタ収集（毎日 7:00 JST）

- 入力: `content/sources.yaml`（巡回先。RSS がある公式の発表を中心にする。RSS の無いサイトの読み取りはしない）、既存の記事の出典、既存 Issue。
- 処理: 新着を読み、§5 の基準で点数を付ける。出典 URL で重複を除く（既存記事の `sources`、既存 Issue の本文）。
- 出力: 候補 Issue（1日あたり最大5件）。本文は「何が出たか／一次情報の URL／セレソンにとっての意味（1〜2文）／点数」。
- 失敗時: 巡回先ごとの失敗を集計し、Slack へ。1か所の失敗で全体を止めない。

### R2 執筆（月・水・金 9:00 JST）

- 選び方: `article:pick` があればそれを最優先。無ければ点数の最も高い `article:candidate`。候補が無ければ何もせず週報に記録する。
- 処理: `docs/articles/guide.md`（書き方のルール）に従って書く。一次情報を自分で開いて確かめ、確認日を入れる。
- 出力: 記事の PR（§4 の形式）。PR 本文に、記事の Preview URL、主張と出典の対応表、自己確認の結果を書く。
- 修正: `article:needs-fix` の PR を優先して直す。直した回数を PR に記録し、3回目は `article:escalated` にして人へ。

### W1 事実確認（PR の作成・更新時）

1. **機械検査**（決定的に判定。CI の必須チェック `article-check`）
   - front matter のスキーマ（§4）
   - `sources` が1件以上あり、すべて https で、取得できる
   - `verifiedAt` が PR の作成日から7日以内
   - 本文の引用が長すぎない（1か所あたりの上限を決める）
   - 禁止事項（個人情報らしき文字列、社外秘、他社の誹謗）の簡易検出
2. **AI 確認**（執筆と別のモデル）
   - 記事の主張を1つずつ取り出し、出典を開いて「一致／不一致／出典に記載なし」を判定する
   - 結果を表にして PR にコメントし、合否でラベルを付け替える
   - 「出典に記載なし」の主張は、筆者の意見であると分かる書き方になっていれば合格とする

### 人の確認（週1・金）

- `article:awaiting-owner` の PR をまとめて見る。PR に「Preview URL・確認の表・差分」がそろっているので、記事を開いて読み、マージするだけ。
- ひと言（任意）: PR に `ひと言:` で始まるコメントを書くと、R2 が記事に反映して再確認に回す。
- 見送り: PR を閉じて Issue に `article:rejected` を付ける。

### W2 公開後処理（本番デプロイの成功時）

- 新しく追加された `content/articles/*.md` を検出し、Issue を `article:published` にして閉じる。
- 段階5から: X に「タイトル＋要約＋URL」を投稿し、投稿 URL を Issue に記録する。投稿に失敗しても記事の公開は取り消さず、Slack に通知して再投稿できるようにする。

### W3 滞留整理（毎日）

- `article:awaiting-owner` のまま14日を超えた PR を閉じ、Issue を `article:candidate` に戻す（ネタが古くなっていれば `article:rejected`）。

### R3 再検証（毎月1日）

- `verifiedAt` から90日を超えた記事について、出典を確かめ直す。
- 変わっていなければ `verifiedAt` だけ更新する PR、変わっていれば追記または「情報が古い可能性があります」の表示を提案する PR を出す。どちらも W1 と人の確認を通す。

### R4 週報（毎週月曜）

- 件数: 収集・執筆・公開・見送り・修正の回数・失敗。
- 反応: GA4 の記事ごとの閲覧数、（段階5から）X の反応。
- 次の週のネタ選びへの提案（よく読まれた分野）。基準そのものの変更は人が判断して `docs/articles/guide.md` を直す。

## 4. 公開先・リポジトリ構成と記事の形式

### 公開先（URL）

| ページ | URL |
|---|---|
| 記事の一覧 | `https://media.selecao.ai/articles` |
| 記事の本文 | `https://media.selecao.ai/articles/<日付>-<英語の短い名前>`（例 `2026-11-16-devin-apps`） |
| RSS | `https://media.selecao.ai/articles/feed.xml` |

- URL は「日付-英語の短い名前」。日本語の URL は SNS に貼ると文字化けのように見えるため。タイトルは日本語。
- `media.selecao.ai` のトップ（`/`）は、記事以外のコンテンツが増えたときの入口にする。当面は記事の一覧を表示する。
- selecao.ai のトップページに新しい記事を並べる場合は、media の RSS を読み込む。2つのリポジトリを直接依存させない。

### リポジトリ `selecao-inc/selecao-content`

サイト本体・記事・自動化をひとまとめにする（下記）。会社のサイトの文章（サービス・会社概要）は引き続き selecao-ai の #41 で管理する。

```
app/                    media.selecao.ai のサイト本体（Next.js）
content/
  articles/2026-11-16-devin-apps.md   記事本体
  sources.yaml                        巡回先の一覧
docs/articles/
  guide.md        書き方のルール（人とAIの共通）
  pipeline.md     この設計（状態・処理・失敗時）を実装後に正本化
  prompts/
    collect.md    R1 の指示
    write.md      R2 の指示
    factcheck.md  W1 の AI 確認の指示
    reverify.md   R3 の指示
    report.md     R4 の指示
.github/workflows/
  article-check.yml    W1（機械検査・AI 確認の起動）
  article-publish.yml  W2
  article-stale.yml    W3
scripts/articles/check.ts  機械検査の本体（テスト付き）
app/articles/          一覧・記事ページ・RSS・共有画像
AGENTS.md              このリポジトリのルール（selecao-ai の AGENTS.md を基に作る）
```

記事の front matter:

```yaml
id: 2026-11-16-devin-apps          # ファイル名と一致
title: Devin Apps・Codex Sites・Claude Artifacts を比べる
summary: AI で作ったアプリを、どこで誰に配るか   # 一覧・共有画像・X 投稿に使う
date: 2026-11-16                   # 公開日
verifiedAt: 2026-11-16             # 事実を最後に確かめた日
sources:                           # 一次情報を優先。1件以上必須
  - https://example.com/official-announcement
tags: [ai-tools, hosting]
aiAssisted: true                   # AI が執筆したことの表示
published: true                    # マージ＝公開。下書きは PR のまま置く
```

## 5. ネタ選びと書き方の基準（guide.md の骨子）

ネタの点数（R1）:
- セレソンの事業（AI 開発チームの立ち上げ／業務の AI 化／Web 制作）との関係
- 一次情報（公式の発表・ドキュメント）で確かめられるか
- 日本語でまだ詳しく書かれていないか
- セレソンが実際に試せるか（試した記事は加点）

書き方:
- 冒頭3行で「何が出たか／誰に関係するか／セレソンの見方」を書く。
- 「セレソンならこう使う」「試したらこうだった」を必ず入れる。要約だけの記事にしない。
- 他社の記事の文章を写さない。引用は必要最小限にし、出典を明示する。
- 料金・提供範囲・対応プランなど変わりやすい情報には、確認日を添える。
- 不確かなことは不確かと書く。推測を事実のように書かない。
- 末尾に「AI の支援を受けて作成し、セレソンが確認しています」を表示する（文言は要決定）。

## 6. 段階と Issue の切り方（案）

| 段階 | 成果物 | 前提 | 完了条件の例 |
|---|---|---|---|
| 0 | リポジトリ `selecao-content`・Vercel プロジェクト・`media.selecao.ai` のドメイン・AGENTS.md・CI の土台 | §10 の基盤の管理方法の決定 | 空のサイトが `media.selecao.ai` で開く。PR ごとに Preview が出て、CI が必須チェックになっている |
| 1 | R1 ネタ収集・sources.yaml・ラベル | 段階0（リポジトリと Issue の置き場所） | 1週間で候補が毎日出る。重複0。失敗が Slack に届く |
| 2 | 記事ページ（一覧・本文・共有画像・RSS） | 段階0 | 記事を1本追加するとページ・RSS・共有画像が出る |
| 3 | R2 執筆 → PR、guide.md、prompts | 段階1・2 | 週3回 PR が出る。PR に Preview と対応表がそろう |
| 4 | W1 事実確認（機械検査＋AI 確認）、修正ループ | 段階3 | 誤りを入れたテスト記事が不合格になる。修正→再確認が回る |
| 5 | W2・W3・失敗通知・R4 週報 | 段階4 | 滞留・失敗・件数が人に届く |
| 6 | X 投稿 | 段階5、X API の契約 | 公開と同時に投稿され、失敗時は再投稿できる |
| 7 | R3 再検証 | 段階5 | 90日超の記事に更新 PR が出る |
| 8 | 自動公開への切り替え | 実績（§8） | 人の判断で有効化 |

- 別リポジトリにしたため、selecao-ai の #41 や合格シナリオの仕組みの完成を待たずに着手できる。
- ソフトウェアファクトリーの考え方の適用（2026-11-16 決定）:
  - **記事の PR**（`content/articles/` だけを変える PR）: W1 の事実確認（執筆と別のモデル）と人の確認だけ。合格シナリオは適用しない。
  - **コードの PR**（サイト・自動化・`infra/`・`docs/articles/` を変える PR）: selecao-ai と同じく、別モデルのレビューと人の承認を通す。合格シナリオは仕組み（worktree `factory-scenarios-design`）ができてから適用する。それまでは CI と Preview の確認で代える。
  - 記事とコードを1つの PR に混ぜない。
- 段階1〜は selecao-content の Issue として起票する（タスクは最も関係の深いリポの Issue で管理するルールに従う）。

## 7. 実行基盤（要検証）

| 処理 | 候補 | 確かめること |
|---|---|---|
| R1〜R4 の AI 処理 | Claude のルーティン（クラウドの定期実行） | 実行回数・時間の上限、GitHub への PR 作成の権限、プランの枠で動くか |
| W1 の AI 確認（別モデル） | Codex（GitHub 上の Codex への依頼、または GitHub Actions からの実行） | 自動で起動する方法、API 料金が別にかかるか、bot からの依頼で起動するか |
| W1〜W3 の機械処理 | GitHub Actions | — |
| 秘密情報（X・Slack） | SOPS → HCP Terraform → GitHub Actions の secrets | 既存の SOPS の流れに載せられるか |
| 通知 | Slack | 投稿先チャンネル |

- R2 の「修正」をラベルの変化で即時に起動するには、ルーティンを外部から起動する方法が要る。無ければ、R2 を1日数回動かして `article:needs-fix` を拾う方式で代える。

### 基盤の管理方法（案・2026-11-16 調査）

selecao-ai の現状（`infra/README.md`・`docs/RUNBOOK.md`・`docs/DECISIONS.md` ADR-003/004 より）:

- HCP Terraform Workspace `selecao-ai` が selecao-ai の `infra/` だけを VCS 連携で見る。PR で plan、マージで Auto-apply。
- HCP の `GITHUB_TOKEN` は fine-grained PAT `hcp-terraform-selecao-ai`。Repository access は selecao-ai のみ（Administration RW・Contents RO）。期限 2027-10-21（#19）。
- HCP の `VERCEL_API_TOKEN` はチーム `yusukeohno16s-projects` のトークン。
- DNS はお名前.com で手作業管理（Terraform 管理外）。秘密情報は `infra/secrets.enc.yaml`（SOPS/age）→ Vercel の環境変数。

選択肢:

| | A：selecao-ai の `infra/` に足す | B：selecao-content に専用の `infra/` と HCP Workspace（推奨） | C：全サイト共通の infra リポジトリを作る |
|---|---|---|---|
| 内容 | `github_repository`・保護・`vercel_project`・ドメインを selecao-ai の Terraform に追加 | selecao-content に `infra/` を置き、HCP Workspace `selecao-content` を新設 | selecao-ai・selecao-content・tb-promotion 等の基盤を1か所で管理 |
| 切り離し | × media の基盤変更が会社サイトのリポジトリの PR になる | ○ 別リポジトリにした決定と一貫する | ○ |
| 権限 | PAT の対象を selecao-content に広げる | PAT・Workspace を別に持つ。影響範囲が分かれる | 1つの強い権限に集まる |
| 秘密情報 | X・Slack 等の GitHub Actions 用の値まで selecao-ai の SOPS に混ざる | selecao-content の SOPS に閉じる | 1か所に集まる |
| 手間 | 小 | 中（Workspace・PAT の初回設定、更新対象が1組増える） | 大（既存の移行を伴う。今回の範囲外） |

推奨: **B**。理由は、別リポジトリにした目的（会社サイトとの切り離し）と一貫し、権限と秘密情報の影響範囲も分かれるため。トークンの更新が1組増える点は、期限を selecao-ai（#19、2027-10-21）とそろえて同じ日に更新する運用で抑える。C はサイトがさらに増えたときに別途検討する。

B の手順（段階0）:

1. **リポジトリの作成は人が行う**（または人の承認のもとで `gh repo create`）。HCP の PAT は対象リポジトリを絞るため組織にリポジトリを作る権限を持たせない。作成後に Terraform へ `import` する（selecao-ai の #6 と同じ方式）。
2. HCP Workspace `selecao-content` を作る（VCS 連携・Working Directory `infra`・Auto-apply・Terraform の版を selecao-ai とそろえる）。Workspace の環境変数は selecao-ai と同じ構成（`VERCEL_API_TOKEN`・`GITHUB_TOKEN`・`SOPS_AGE_KEY`、すべて Sensitive）。`GITHUB_TOKEN` は selecao-content だけを対象にした新しい fine-grained PAT。
3. Terraform で管理するもの: `github_repository`（Squash のみ・マージ後のブランチ自動削除）、`github_branch_protection`（PR 必須・必須チェック `ci`・管理者にも適用）、`vercel_project`（`selecao-content`・本番ブランチ `main`）、`vercel_project_domain`（`media.selecao.ai`）、必要になった時点で GitHub Actions の secrets。
4. **DNS は人が手作業で追加**: お名前.com に `media` の CNAME を1件（値は Vercel の Domains 画面の案内に従う。selecao-ai の `www` は `cname.vercel-dns.com`）。既存のメール用レコード・NS は変更しない。
5. HTTPS・表示を確認し、RUNBOOK に記録する。

要確認: HCP Terraform の現在のプランで Workspace を追加できるか・上限、Vercel のプランでプロジェクト追加の費用が発生しないか。（age 鍵は分けると決定済み。§10）

## 8. 人の確認を外す基準（案）

設計書では `content/` は危険度「軽」で、自動マージは「実績を見て別途判断」とされている。切り替えの目安:

- 直近20本で、人が事実の誤りを指摘した記事が0本
- 公開後に訂正した記事が0本
- W1 の AI 確認が、意図的に誤りを入れたテスト記事を見逃していない

満たしても自動で切り替えず、大野さんが判断する。切り替え後も、週報で公開した記事の一覧を確認する。

## 9. 費用とリスク

| 項目 | 内容 | 対策 |
|---|---|---|
| AI の利用料 | ルーティン・Codex がプランの枠で収まるか | §7 で確認。収まらなければ頻度を下げる |
| X API | 料金体系が変わりやすい | 段階6の着手時に確認 |
| 誤情報 | 会社名で誤りが出る | 別モデルの確認・人の確認・再検証・訂正の手順 |
| 著作権 | 他社記事の転載 | 写さない・引用最小・機械検査で引用長を制限 |
| 巡回先の変化 | RSS の廃止・形式変更 | 失敗通知。巡回先ごとに隔離して全体を止めない |
| ツール依存 | 特定ツールが使えなくなる | 状態は GitHub、指示はリポの Markdown。処理系は差し替え可能にする |

## 10. 決めること

- [x] 公開先とリポジトリ：`media.selecao.ai`・`selecao-inc/selecao-content`（2026-11-16 決定）
- [x] 基盤の管理方法：B（selecao-content に専用の `infra/` と HCP Workspace）（2026-11-16 決定）
- [x] ファクトリーの適用範囲：記事とコードで分ける（2026-11-16 決定。§6）
- [x] 公開前の人の確認：最初は入れる。外すのは §8 の基準を満たしたうえで大野さんが判断（2026-11-16 決定）
- [x] リポジトリの公開範囲：public（selecao-ai と同じ。記事はどのみち公開される）（2026-11-16 決定）
- [x] age 鍵：selecao-ai と分ける（B の「影響範囲を分ける」と一貫させる）（2026-11-16 決定）
- [ ] AI 執筆の表示の文言と、記事の筆者名（セレソン編集部／大野）
- [ ] 巡回先の最初の一覧（sources.yaml の初期値）
- [ ] Slack の通知先チャンネル
- [ ] §7 の実行基盤（特に Codex の自動起動）を、誰がいつ検証するか
- [ ] 段階1 を先に起票するか

## 11. 段階0の手順と Issue 案（B・public・age 鍵は別）

selecao-ai の `infra/`（`versions.tf`・`github.tf`・`main.tf`）と `.github/workflows/ci.yml` の書き方をそのまま写して作る。新しいやり方は持ち込まない。

### 順番

順番に意味がある。HCP Workspace はリポジトリの `infra/` を見るので、リポジトリより先には作れない。また、infra の PR で plan を出すには Workspace が先に要る。

| # | 誰が | 作業 | 終わったと言える状態 |
|---|---|---|---|
| 0-1 | 人 | `selecao-inc/selecao-content` を public で作る（README だけの初期コミット）。`selecao-agents` を Write で招待する | 済（2026-11-16） |
| 0-2 | AI（PR） | サイトの土台：Next.js の空のページ・`AGENTS.md`・`ci.yml`・Dependabot・`docs/`（ARCHITECTURE・RUNBOOK・DECISIONS） | `pnpm lint / typecheck / test / build` が通り、CI の `ci` が緑 |
| 0-3 | 人 | fine-grained PAT（対象は selecao-content のみ。Administration RW・Contents RO。期限は 2027-10-21 にそろえる）と、selecao-content 専用の age 鍵を新しく作る（selecao-ai の鍵は使わない） | 値が手元のパスワード管理にだけある |
| 0-4 | 人 | HCP Workspace `selecao-content` を作る（VCS 連携・Working Directory `infra`・Auto-apply・Terraform 1.16.6）。環境変数 `VERCEL_API_TOKEN`・`GITHUB_TOKEN`・`SOPS_AGE_KEY` をすべて Sensitive で入れる | Workspace が selecao-content を見ている |
| 0-5 | AI（PR） | `infra/`：`github_repository`（import）・`github_branch_protection`（必須チェック `ci`）・`vercel_project`・`vercel_project_domain`（`media.selecao.ai`）・空の `secrets.enc.yaml` | PR で plan が出て、追加のみ・削除0。マージで apply が成功 |
| 0-6 | 人 | お名前.com に `media` の CNAME を1件追加（値は Vercel の Domains 画面の案内に従う）。既存のメール用レコード・NS は触らない | Vercel の Domains 画面で Valid |
| 0-7 | AI（PR） | 確認結果を RUNBOOK に記録 | `https://media.selecao.ai` が HTTPS で開く。PR ごとに Preview が出る。`main` に直接 push できない |

- 0-2 はブランチ保護がまだ無い状態でマージする（0-5 で保護が入る）。それでも PR 経由にし、main へ直接 push しない。
- 0-1・0-3・0-4・0-6 は外部サービスの設定なので、AI は手順を示すだけで実行しない。

### Issue（起票済み：0-2 = #1、0-5 = #2、0-6・0-7 = #3）

1. **サイトの土台を作る**（0-2）
   - 完了条件: 空のページが Preview で開く／検証コマンドがすべて通る／`ci` が CLAUDE.md 等を検出して失敗する／`AGENTS.md` に記事の PR とコードの PR の扱い（§6）が書いてある
2. **基盤を Terraform で管理する**（0-5。前提: 0-3・0-4 が済んでいる）
   - 完了条件: plan が追加のみ／apply 成功／`main` が保護され `ci` が必須／`media.selecao.ai` が Vercel プロジェクトに付いている
3. **media.selecao.ai を公開して RUNBOOK に記録する**（0-6・0-7。前提: 2）
   - 完了条件: HTTPS で開く／RUNBOOK に DNS の値・PAT の期限・更新手順がある

人の作業（0-1・0-3・0-4・0-6）は Issue にせず、それぞれの Issue の「前提」に書く。
