# 問題出題ロジック設計

## 1. 目的

学習アプリにおける問題出題ロジックの目的は、単に「期限が来た問題」を出すことではありません。実用的な出題ロジックでは、少なくとも次の3点を同時に満たす必要があります。

1. 忘れかけている問題を適切なタイミングで出すこと
2. ユーザーにとって苦手な問題をやや優先すること
3. 同じ問題ばかり出る不快な体験を避けること

そのため本設計では、**忘却ベースの出題制御**と**成績ベースの苦手補正**を組み合わせ、さらに**新規問題導入**と**連続出題防止**を加えた方式を採用します。

---

## 2. 設計方針

各問題に対して、次の2種類の状態を分けて持ちます。

### 2.1 記憶状態

* その問題を今どの程度覚えていそうか
* 次回いつ出題すべきか
* どの程度長い間隔に耐えられるか

### 2.2 統計状態

* 何回解いたか
* どの程度正解できているか
* 最近安定しているか、それとも崩れているか
* 回答時間が速いか遅いか

この2つを分ける理由は明確です。

* 忘却モデルだけでは、「最近たまたま正解した苦手問題」が埋もれやすい
* 正答率だけでは、「今ちょうど忘れかけている問題」が拾えない

したがって、出題優先度は複数シグナルの合成で決めます。

---

## 3. 各問題に持たせるデータ

各問題 `q` に対して、最低限次の情報を持ちます。

```text
id
created_at
last_answered_at
next_due_at

answer_count
correct_count
wrong_count
correct_streak
wrong_streak

stability
ease
difficulty
last_interval_days
avg_response_time_ms
ema_accuracy
last_result
stage
suspended
tags / category
```

### 3.1 各項目の意味

* `stability`

  * 記憶の安定度
  * 大きいほど忘れにくく、次回間隔も伸びやすい
* `ease`

  * その問題の間隔がどの程度伸びやすいかを表す係数
* `difficulty`

  * ユーザーにとっての苦手度
  * 正答率とは別の軸として保持する
* `ema_accuracy`

  * 最近の成績を表す指数移動平均
* `stage`

  * 学習段階を表す状態値

### 3.2 最低構成

初期実装では次だけでもよいです。

```text
answer_count
correct_count
last_answered_at
next_due_at
correct_streak
stability
ease
difficulty
last_result
```

---

## 4. 学習段階（stage）

実装とチューニングをしやすくするため、問題に段階を持たせます。

* `NEW`: 未出題
* `LEARNING`: 学習初期
* `REVIEW`: 通常復習
* `MASTERED`: 安定している
* `LAPSE`: 一度安定したあと崩れた

### 4.1 遷移イメージ

* 未出題 → 初回答で `LEARNING`
* 短い間隔で正解が続く → `REVIEW`
* 長い間隔でも安定して正解 → `MASTERED`
* `MASTERED` で不正解 → `LAPSE`
* `LAPSE` は短めの間隔で再学習し、回復したら `REVIEW` に戻す

この段階を持つことで、同じ正解でも意味を変えられます。

* `LEARNING` では間隔を急に伸ばしすぎない
* `REVIEW` では通常通り伸ばす
* `LAPSE` では回復フェーズとして慎重に戻す

---

## 5. 忘却の扱い

厳密な認知モデルをそのまま使う必要はありません。アプリ実装では、**記憶保持率の推定**として簡略化して扱うのが現実的です。

経過日数を `t`、安定度を `S` とすると、保持率は次のように置けます。

```math
retention = e^{-t / S}
```

* `retention` が 1 に近いほど覚えている
* 0 に近いほど忘れている

このとき重要なのは、**`S` を問題ごとに持つこと**です。

* 正解が続く → `stability` を上げる
* 不正解 → `stability` を下げる

これにより、ユーザーにとって「定着している問題」は自然に出題間隔が伸びます。

---

## 6. 出題優先度の考え方

各問題に対して、毎回 **出題優先度 `score`** を計算します。

```text
score =
  w_due       * dueScore +
  w_weak      * weakScore +
  w_novelty   * noveltyScore +
  w_retry     * retryScore +
  w_difficulty* difficultyScore -
  w_fatigue   * fatiguePenalty
```

ここで重要なのは、`difficulty` を保存するだけで終わらせず、**出題選択にも明示的に使うこと**です。

---

## 7. 各スコアの定義

### 7.1 `dueScore`: 今出すべき度

`dueScore` は、忘却または期限超過から算出します。

#### 方法A: `next_due_at` ベース

```text
overdue_days = max(0, days(now - next_due_at))
dueScore = sigmoid(overdue_days / 2)
```

このように `max(0, ...)` を入れて、**期限前の問題を過剰に押し上げない**ようにします。

#### 方法B: 保持率ベース

```text
elapsed_days = days(now - last_answered_at)
retention = exp(-elapsed_days / stability)
dueScore = 1 - retention
```

どちらでもよいですが、実装初期は `next_due_at` ベースの方が扱いやすいです。

---

### 7.2 `weakScore`: 苦手補正

単純な正答率では、解答回数が少ない問題を過大評価しやすいので、ベイズ補正を使います。

```text
adjustedAccuracy = (correct_count + alpha) / (answer_count + alpha + beta)
weakScore = 1 - adjustedAccuracy
```

例:

```text
alpha = 2
beta = 2
```

さらに最近の状態を反映するため、`ema_accuracy` も併用します。

```text
weakScore = 0.6 * (1 - ema_accuracy) + 0.4 * (1 - adjustedAccuracy)
```

これにより、

* 長期的に苦手な問題
* 最近崩れている問題

の両方を拾いやすくなります。

---

### 7.3 `difficultyScore`: 問題固有の苦手度

`difficulty` は `weakScore` と似ていますが、役割は分けます。

* `weakScore`: 実績ベースの苦手状態
* `difficultyScore`: ユーザーにとって定性的に難しい問題である度合い

例えば、同程度の正答率でも、いつも回答時間が長い問題や、何度も崩れやすい問題は `difficulty` を高く保てます。

```text
difficultyScore = normalize(difficulty, min=0.1, max=3.0)
```

`difficulty` を独立シグナルとして残しておくと、正答率だけでは表現しづらい「苦手さの粘着性」を扱いやすくなります。

---

### 7.4 `noveltyScore`: 新規問題導入補正

新規問題が永遠に出なくなるのを防ぐための補正です。

```text
if answer_count == 0:
    noveltyScore = 1.0
elif answer_count < 3:
    noveltyScore = 0.5
else:
    noveltyScore = 0.0
```

---

### 7.5 `retryScore`: 同一セッションでの再挑戦補正

これは**同一セッション内の再出題制御専用**に使います。

ここを長期復習と混ぜると、誤答補正が二重に効いて、同じ問題が過剰に出やすくなります。したがって、`retryScore` は次のように限定して使います。

* 直近で間違えた問題を、数問後に再出題候補へ入れる
* 長期的な再出題間隔の短縮は `next_due_at` 側で管理する

例:

```text
if session_retry_queued:
    retryScore = 0.8
else:
    retryScore = 0.0
```

---

### 7.6 `fatiguePenalty`: 出しすぎ防止

同じ問題ばかり出るのを防ぐためのペナルティです。

```text
elapsed_minutes = minutes(now - last_answered_at)
fatiguePenalty = exp(-elapsed_minutes / cooldown_minutes)
```

* 出題直後は大きい
* 時間が経つと小さくなる

---

## 8. 実用的な重みの初期値

V1では次の重みから始めると扱いやすいです。

```text
w_due        = 0.40
w_weak       = 0.20
w_novelty    = 0.15
w_retry      = 0.10
w_difficulty = 0.15
w_fatigue    = 0.25
```

```text
score = max(0, score)
```

### 8.1 この配分の意図

* 最優先は「今ちょうど復習すべき問題」
* その次に「苦手であること」
* 新規問題も一定割合で混ぜる
* 直近誤答の再挑戦は効かせすぎない
* 出しすぎ防止は強めに効かせる

---

## 9. 次回出題時刻 `next_due_at` の更新

次回出題時刻の更新は、**正解で伸ばし、不正解で縮める**のが基本です。ただし、成長率を強くしすぎると間隔が急激に伸びて運用が不安定になるため、**上限と段階補正**を入れます。

### 9.1 学習初期は固定テーブル

初期学習段階は固定テーブルの方が安定します。

* 初回正解 → 10分後
* 2回目正解 → 1日後
* 3回目正解 → 3日後
* 4回目正解 → 7日後
* 5回目正解 → 14日後

この固定テーブルは `NEW` / `LEARNING` にのみ適用します。

---

### 9.2 通常復習以降の更新

#### 正解時

```text
growth = 1.0 + min(0.15 + 0.05 * correct_streak, 0.35)
stability = stability * growth * ease * timeFactor
stability = min(stability, stability_cap)

difficulty = max(0.1, difficulty - 0.03)
ease = min(2.3, ease + 0.02)
next_interval_days = stability
```

ポイント:

* `correct_streak` の効果には上限を設ける
* `ease` の上限もやや低めに抑える
* `stability` にも上限 `stability_cap` を設ける

例:

```text
stability_cap = 180 days
```

これにより、「数回正解しただけで極端に遠い未来へ飛ぶ」問題を防げます。

---

#### 不正解時

```text
stability = max(0.3, stability * 0.5)
difficulty = min(3.0, difficulty + 0.08)
ease = max(1.1, ease - 0.04)
next_interval_days = max(min_retry_days, stability * 0.3)
```

例:

```text
min_retry_days = 10 / 1440   # 10分
```

ここで重要なのは、不正解時の短縮は**長期スケジュール側の制御**とし、同一セッション内の再挑戦は `retryScore` 側で別管理することです。

---

## 10. 回答時間の扱い

正解でも、回答時間が長すぎるなら「怪しい正解」である可能性があります。そこで、`stability` 更新量に時間補正を入れます。

```text
if response_time_ms <= target_time_ms:
    timeFactor = 1.0
elif response_time_ms <= slow_time_ms:
    timeFactor = 0.8
else:
    timeFactor = 0.6
```

これにより、たまたま正解しただけの問題が過剰に安定扱いされるのを防げます。

---

## 11. 出題選択アルゴリズム

毎回最大スコアの問題だけを選ぶと偏りやすいため、**候補全体に対して重み付きランダム**で選びます。

### 11.1 手順

1. 候補を絞る

   * `suspended` は除外
   * 直近 `N` 問以内に出た問題は除外
   * 同カテゴリの連続出題を軽く抑制

2. 各候補の `score` を計算する

3. 候補全体に対して重み付きランダムで1件選ぶ

```text
probability(q) = (score(q)^gamma + minimumWeight) / sum(score^gamma + minimumWeight)
```

例:

```text
gamma = 1.2
minimumWeight = 0.02
```

これにより、出すべき問題を優先しつつ、毎回同じ順番になるのを防げます。さらに、十分に覚えていそうな問題も低確率で候補に残るため、完全に出なくなることを避けられます。

---

## 12. 同一セッションでの再出題ルール

誤答した問題は、その場での再挑戦が有効です。ただし直後に出すと短期記憶で答えられるだけになりやすいため、少し間を空けます。

### 12.1 セッション内再出題

* 間違えたら **3〜8問後** に再出題候補へ入れる
* 連続出題は避ける
* 同じ問題のその日中の再挑戦上限も持てるとなおよい

```text
if answered_wrong:
    enqueue_retry(question, after_n_questions=5)
```

### 12.2 セッション外の復習

セッション終了後も `next_due_at` を短めに設定し、短期復習につなげます。

* 10分後
* 1時間後
* 翌日

などの段階的設計が有効です。

---

## 13. 新規・復習・苦手再挑戦の比率

スコアだけに任せると、苦手問題が多いユーザーではセッションが単調になりやすいです。そのため、1セッション内の比率を緩く制御してもよいです。

例:

* 新規: 20%
* 通常復習: 60%
* 苦手再挑戦: 20%

この比率は固定でもよいですし、ユーザーの学習段階に応じて変更してもよいです。

---

## 14. 正答率の扱いで注意すべき点

### 14.1 単純正答率だけでは不十分

`correct_count / answer_count` だけでは、

* 1回中0回正解
* 50回中0回正解

の差を十分に表せません。

### 14.2 推奨方針

長期傾向と短期傾向を分けて持ちます。

* 長期傾向: ベイズ補正正答率
* 短期傾向: `ema_accuracy`

これにより、

* 昔は苦手だったが最近安定している問題
* 昔は安定していたが最近崩れている問題

を自然に区別できます。

---

## 15. 解答回数の使い方

解答回数には少なくとも3つの用途があります。

### 15.1 新規問題導入

`answer_count == 0` の問題を出すための判定に使う

### 15.2 正答率の信頼度補正

解答回数が少ない間は、苦手補正を弱めに扱う

```text
confidence = min(1.0, answer_count / 10)
weakScore = confidence * weakScore_raw + (1 - confidence) * 0.5
```

### 15.3 卒業判定

十分安定した問題を低頻度モードへ移す判断に使う

例:

* 解答回数 10回以上
* ベイズ補正正答率 90%以上
* `stability >= 30日`

これを満たす問題を `MASTERED` 候補として扱います。

---

## 16. 疑似コード

### 16.1 ユーティリティ

```python
import math
import random
from datetime import timedelta


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def adjusted_accuracy(correct_count, answer_count, alpha=2, beta=2):
    return (correct_count + alpha) / (answer_count + alpha + beta)


def weighted_random_choice(scored_items, gamma=1.2):
    weights = [max(score, 0.0) ** gamma for _, score in scored_items]
    total = sum(weights)
    r = random.random() * total
    acc = 0.0
    for item, weight in zip(scored_items, weights):
        acc += weight
        if acc >= r:
            return item[0]
    return scored_items[-1][0]
```

### 16.2 スコア計算

```python
def normalize(value, min_value=0.1, max_value=3.0):
    clipped = max(min_value, min(max_value, value))
    return (clipped - min_value) / (max_value - min_value)


def calc_due_score(now, q):
    if q.next_due_at:
        overdue_days = max(0.0, (now - q.next_due_at).total_seconds() / 86400)
        return sigmoid(overdue_days / 2.0)

    if not q.last_answered_at:
        return 1.0

    elapsed_days = (now - q.last_answered_at).total_seconds() / 86400
    retention = math.exp(-elapsed_days / max(q.stability, 0.1))
    return 1.0 - retention


def calc_fatigue_penalty(now, q, cooldown_minutes=30):
    if not q.last_answered_at:
        return 0.0
    elapsed_minutes = (now - q.last_answered_at).total_seconds() / 60
    return math.exp(-elapsed_minutes / cooldown_minutes)


def calc_weak_score(q):
    long_term = 1.0 - adjusted_accuracy(q.correct_count, q.answer_count)
    short_term = 1.0 - q.ema_accuracy
    raw = 0.6 * short_term + 0.4 * long_term

    confidence = min(1.0, q.answer_count / 10.0)
    return confidence * raw + (1.0 - confidence) * 0.5


def calc_novelty_score(q):
    if q.answer_count == 0:
        return 1.0
    if q.answer_count < 3:
        return 0.5
    return 0.0


def calc_retry_score(q):
    return 0.8 if getattr(q, "session_retry_queued", False) else 0.0


def calc_difficulty_score(q):
    return normalize(q.difficulty)


def calc_score(q, now):
    due = calc_due_score(now, q)
    weak = calc_weak_score(q)
    novelty = calc_novelty_score(q)
    retry = calc_retry_score(q)
    difficulty = calc_difficulty_score(q)
    fatigue = calc_fatigue_penalty(now, q)

    score = (
        0.40 * due +
        0.20 * weak +
        0.15 * novelty +
        0.10 * retry +
        0.15 * difficulty -
        0.25 * fatigue
    )
    return max(0.0, score)
```

### 16.3 出題選択

```python
def select_question(questions, now):
    candidates = [q for q in questions if not q.suspended]

    scored = [(q, calc_score(q, now)) for q in candidates]
    scored = [(q, s) for q, s in scored if s > 0]
    scored.sort(key=lambda x: x[1], reverse=True)

    top = scored[:20]
    return weighted_random_choice(top, gamma=1.2)
```

### 16.4 回答後更新

```python
def update_after_answer(q, is_correct, response_time_ms, now):
    q.answer_count += 1
    q.last_answered_at = now
    q.last_result = "correct" if is_correct else "wrong"
    q.ema_accuracy = 0.8 * q.ema_accuracy + 0.2 * (1.0 if is_correct else 0.0)

    if response_time_ms <= 5000:
        time_factor = 1.0
    elif response_time_ms <= 12000:
        time_factor = 0.8
    else:
        time_factor = 0.6

    if is_correct:
        q.c
```
