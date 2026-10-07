const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');

require(path.resolve(__dirname, '..', 'js', 'duplicate-check.js'));
const D = globalThis.DuplicateCheck;

// 貸借表 A:K と同じ並び: 日付, 名前, 貸主, 借主, カテゴリー, 品目, 個/本, 単価, 金額, 入力日時, 修正
const HEADER = ['›', '名前', '貸主', '借主', 'カテゴリー', '品目', '個/本', '単価', '金額', '入力日時', '修正'];
const sheet = lines => D.rowsFromSheetValues([HEADER, ...lines]);
const line = (date, name, lender, borrower, item, amount, input, correction = '') =>
  [date, name, lender, borrower, '飲料', item, '1.00', amount.toLocaleString(), amount.toLocaleString(), input, correction];
const kinds = result => result.groups.map(g => `${g.level}:${g.kind}`);

test('修正データは真下でなくても、内容（貸主・借主が逆・同品目・同額）で元データと組になる', () => {
  const rows = sheet([
    line('2026/06/02', '伊藤', '本部', '371BAR', 'Echezeaux', 54000, '2026/07/31 17:05:53', '✏️修正'),
    line('2026/07/02', '伊藤', '本部', '371BAR', 'La Tache', 234916, '2026/07/31 17:06:22', '✏️修正'),
    line('2026/06/02', '伊藤', '371BAR', '本部', 'Echezeaux', 54000, '2026/07/03 12:05:29'),
    line('2026/07/02', '伊藤', '371BAR', '本部', 'La Tache', 234916, '2026/07/03 12:05:19')
  ]);
  const { pairs, unmatched } = D.findCorrectionPairs(rows);
  assert.equal(pairs.length, 2);
  assert.equal(unmatched.length, 0);
  const tache = pairs.find(p => p.correction.item === 'La Tache');
  assert.equal(tache.original.originalRowIndex, 5);
});

test('修正データの日付が元データより1日前でも組になる（2025年の修正画面のずれ）', () => {
  const rows = sheet([
    line('2025/10/26', '伊東', 'YOTSUYA', 'GRANDE', 'BIB', 1760, '2025/10/04 15:46:07', '✏️修正'),
    line('2025/10/27', '伊東', 'GRANDE', 'YOTSUYA', 'BIB', 1760, '2025/10/04 15:37:54')
  ]);
  assert.equal(D.findCorrectionPairs(rows).pairs.length, 1);
});

test('同じ元データを二重に取り消した修正は、相手なしとして残る', () => {
  const rows = sheet([
    line('2026/04/26', '木津', '371BAR', 'GRANDE', 'ローランペリエ', 9900, '2026/04/03 17:56:03', '✏️修正'),
    line('2026/04/26', '木津', '371BAR', 'GRANDE', 'ローランペリエ', 9900, '2026/04/03 17:55:09', '✏️修正'),
    line('2026/04/26', '木津', 'GRANDE', '371BAR', 'ローランペリエ', 9900, '2026/04/03 17:51:24')
  ]);
  const result = D.findSuspects(rows);
  assert.equal(result.correctionResult.pairs.length, 1);
  assert.deepEqual(kinds(result), ['check:取り消す相手が見つからない修正データ']);
});

test('同じ人が短時間に同じ内容を繰り返し登録すると「高」、表記ゆれの品目もまとめる', () => {
  const rows = sheet([
    line('2026/09/03', '庄司', '焼肉マルゴ', 'MARUNOUCHI', 'アサヒ　シャンティ', 3948, '2026/09/14 22:06:46'),
    line('2026/09/03', '庄司', '焼肉マルゴ', 'MARUNOUCHI', 'アサヒ　シャンティ', 3948, '2026/09/14 22:07:46'),
    line('2026/09/03', '庄司', '焼肉マルゴ', 'MARUNOUCHI', 'シャンティ', 3948, '2026/09/14 22:13:23')
  ]);
  const { groups } = D.findSuspects(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].level, 'high');
  assert.equal(groups[0].duplicateRows.length, 2);
  assert.equal(groups[0].extraAmount, 7896);
});

test('修正で取り消し済みの重複は対象にしない', () => {
  const rows = sheet([
    line('2026/07/28', '木津', '本部', 'GRANDE', 'La Tâche 2012', 150700, '2026/08/12 13:48:03', '✏️修正'),
    line('2026/07/28', '木津', 'GRANDE', '本部', 'La Tâche 2012', 150700, '2026/08/12 13:46:49'),
    line('2026/07/28', '木津', 'GRANDE', '本部', 'La Tâche 2012', 150700, '2026/08/12 13:46:20')
  ]);
  assert.deepEqual(D.findSuspects(rows).groups, []);
});

test('別の人が同じ取引を登録したもの・別の日の再登録は「中」', () => {
  const rows = sheet([
    line('2025/09/25', '大塚', 'MARUGO‑D', "eric'S", 'Blason Rose', 7040, '2025/09/25 16:14:46'),
    line('2025/09/25', '野口', 'MARUGO-D', "eric'S", 'Blason Rose', 7040, '2025/09/25 17:06:37'),
    line('2025/11/26', '木津', 'GRANDE', 'MARUGO', 'ランブルスコ', 2310, '2025/11/27 19:59:39'),
    line('2025/11/26', '木津', 'GRANDE', 'MARUGO', 'ランブルスコ', 2310, '2025/12/05 11:38:54')
  ]);
  const { groups } = D.findSuspects(rows);
  assert.deepEqual(groups.map(g => g.level), ['medium', 'medium']);
  assert.ok(groups.some(g => g.kind.includes('両店')));
  assert.ok(groups.some(g => g.kind.includes('別の日')));
});

test('3品以上を日付だけ変えて入れ直した一覧は「高」、2品までの日付違いは正当な定期取引として扱う', () => {
  const batch = ['A', 'B', 'C'].flatMap((item, i) => [
    line('2025/12/01', '木津', 'GRANDE', 'マルゴS', item, 1000 + i, `2026/01/04 15:4${i}:00`),
    line('2025/12/07', '木津', 'GRANDE', 'マルゴS', item, 1000 + i, `2026/01/04 15:5${i}:00`)
  ]);
  const weekly = [
    line('2026/01/02', '木津', 'GRANDE', '371BAR', '瀬戸田レモン', 2800, '2026/01/18 21:30:15'),
    line('2026/01/06', '木津', 'GRANDE', '371BAR', '瀬戸田レモン', 2800, '2026/01/18 21:39:26')
  ];
  const { groups } = D.findSuspects(sheet([...batch, ...weekly]));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].level, 'high');
  assert.ok(groups[0].eitherSide);
  assert.equal(groups[0].extraAmount, 3003);
});

test('入力日より後の日付で入れ直したものは「日付を打ち間違えて入れ直した」', () => {
  const rows = sheet([
    line('2026/09/15', '伊藤', '371BAR', '元祖どないや', 'Cremant', 2002, '2026/09/14 18:15:14'),
    line('2026/08/15', '伊藤', '371BAR', '元祖どないや', 'Cremant', 2002, '2026/09/14 18:31:17')
  ]);
  const { groups } = D.findSuspects(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, '日付を打ち間違えて入れ直した');
  assert.equal(groups[0].duplicateRows[0].date, '2026-09-15');
});

test('貸主と借主が逆の登録が打ち消し合っているものは「要確認」', () => {
  const rows = sheet([
    line('2026/06/02', '名塚', '本部', '371BAR', 'La Tache16', 234916, '2026/06/21 21:31:25'),
    line('2026/06/02', '伊藤', '371BAR', '本部', 'La Tache16', 234916, '2026/07/03 12:06:26')
  ]);
  assert.deepEqual(kinds(D.findSuspects(rows)), ['check:貸主と借主が逆の登録が打ち消し合っている（修正マークなし）']);
});

test('期間の絞り込みは、どれかの行の日付が期間内のグループを残す', () => {
  const rows = sheet([
    line('2026/07/26', '齋藤', 'MITAN', '鮨こるり', 'ホールケーキ', 7677, '2026/08/05 21:40:00'),
    line('2026/07/26', '齋藤', 'MITAN', '鮨こるり', 'ホールケーキ', 7677, '2026/08/05 21:45:01')
  ]);
  const { groups } = D.findSuspects(rows);
  assert.equal(D.filterGroupsByPeriod(groups, '2026-07-01', '2026-07-31').length, 1);
  assert.equal(D.filterGroupsByPeriod(groups, '2026-08-01', '2026-08-31').length, 0);
  assert.equal(D.summarize(groups).high.extraAmount, 7677);
});

test('送信前の確認: 同じ取引と、24時間以内に日付だけ変えた同じ内容を見つける', () => {
  const rows = sheet([
    line('2026/07/26', '齋藤', 'MITAN', '鮨こるり', 'ホールケーキ', 7677, '2026/08/05 21:40:00'),
    line('2026/12/01', '木津', 'GRANDE', 'マルゴS', 'テタンジェ', 3905, '2026/12/10 15:00:00')
  ]);
  const now = new Date(2026, 11, 10, 16, 0, 0).getTime();
  const findings = D.findSimilarForNewEntries(rows, [
    { date: '2026-07-26', name: '別の人', lender: 'MITAN', borrower: '鮨こるり', item: 'ホールケーキ', amount: '7677' },
    { date: '2026-12-07', name: '木津', lender: 'GRANDE', borrower: 'マルゴS', item: 'テタンジェ', amount: '3,905' },
    { date: '2026-07-27', name: '齋藤', lender: 'MITAN', borrower: '鮨こるり', item: 'ホールケーキ', amount: '7677' }
  ], now);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].sameTransaction.length, 1);
  assert.equal(findings[1].redated.length, 1);
});

test('送信前の確認: 取り消し済みの行とは比べない', () => {
  const rows = sheet([
    line('2026/07/28', '木津', '本部', 'GRANDE', 'La Tâche 2012', 150700, '2026/08/12 13:48:03', '✏️修正'),
    line('2026/07/28', '木津', 'GRANDE', '本部', 'La Tâche 2012', 150700, '2026/08/12 13:46:49')
  ]);
  const findings = D.findSimilarForNewEntries(rows, [
    { date: '2026-07-28', name: '木津', lender: 'GRANDE', borrower: '本部', item: 'La Tâche 2012', amount: '150700' }
  ]);
  assert.deepEqual(findings, []);
});

test('同じ品の重複が何件あっても、日付違いの一覧の入れ直しとは数えない（品の種類で数える）', () => {
  const rows = sheet([
    ...[0, 1, 2, 3].map(i => line('2026/08/13', '伊藤', '371BAR', 'X&C', 'サンレオナルド', 1925, `2026/09/14 18:1${i}:00`)),
    line('2026/08/27', '伊藤', '371BAR', 'X&C', 'サンレオナルド', 1925, '2026/09/14 18:32:34')
  ]);
  const { groups } = D.findSuspects(rows);
  assert.deepEqual(groups.map(g => g.kind), ['同じ人が短時間に同じ内容を繰り返し登録']);
  assert.equal(groups[0].duplicateRows.length, 3);
});

test('品目の年の書き方（2012 と 12）の違いは同じ品とみなす', () => {
  assert.ok(D.similarItem('ニコラフィアット12', 'ニコラフィアット2012'));
  assert.ok(D.similarItem('コントドシャンパーニュ06', 'コントドシャンパーニュ2006'));
  assert.ok(!D.similarItem('クロ・デュ・ジョゲイロン　２０１６', 'クロ・デュ・ジョゲイロン　１７'));
});

test('日付を打ち間違えた行は1回だけ数え、「日」が同じ登録を相手にする', () => {
  const rows = sheet([
    line('2026/08/27', '伊藤', '371BAR', '元祖どないや', 'Cremant', 2002, '2026/09/14 18:31:48'),
    line('2026/09/15', '伊藤', '371BAR', '元祖どないや', 'Cremant', 2002, '2026/09/14 18:15:14'),
    line('2026/08/15', '伊藤', '371BAR', '元祖どないや', 'Cremant', 2002, '2026/09/14 18:31:17')
  ]);
  const { groups } = D.findSuspects(rows);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rows.map(r => r.date), ['2026-08-15', '2026-09-15']);
});
