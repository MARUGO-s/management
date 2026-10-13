// 貸借表の重複・入力ミスの疑いを判定する共通ロジック
// 入力画面（送信前の警告）・店舗別貸借分析（重複チェックボタン）・月次の自動チェックで同じ判定を使う。
// ブラウザでは <script> で読み込み、window.DuplicateCheck として使う（Deno などでも globalThis に入る）。
(function (root) {
  'use strict';

  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;
  const CORRECTION_MARK = '✏️修正';

  // ハイフン類は入力画面の店舗リストと同じ「‑」(U+2011) にそろえる
  function normalizeStore(name) {
    const cleaned = String(name || '').trim().normalize('NFKC').replace(/[-‐‒–−－]/g, '‑');
    const aliases = {
      'マルゴ': 'MARUGO', 'マルゴセカンド': 'MARUGO2',
      'クラウディア2': 'Claudia2',
      'BISTRO CAVA,CAVA': 'BISTRO CAVACAVA',
      'BISTRO CAVA CAVA': 'BISTRO CAVACAVA',
      'BISTROCAVACAVA': 'BISTRO CAVACAVA',
      'BISTRO CAVA・CAVA': 'BISTRO CAVACAVA',
      'BISTRO CAVA‑CAVA': 'BISTRO CAVACAVA'
    };
    return aliases[cleaned] || cleaned;
  }

  function parseAmount(value) {
    if (value === null || value === undefined || value === '') return 0;
    const normalized = String(value)
      .replace(/[０-９．]/g, s => String.fromCharCode(s.charCodeAt(0) - 65248))
      .replace(/[,\s¥￥]/g, '');
    return parseFloat(normalized) || 0;
  }

  // 2026/1/5・2026-01-05・2026年1月5日 → 2026-01-05（読めなければ空文字）
  function parseDate(value) {
    const m = String(value || '').match(/(\d{4})[年\/\-.](\d{1,2})[月\/\-.](\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
  }

  // 入力日時（例: 2026/10/07 13:28:45）をミリ秒に。読めなければ NaN
  function parseInputTime(value) {
    const m = String(value || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime() : NaN;
  }

  function dayDiff(a, b) {
    return Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / DAY));
  }

  // 取引の日付が入力日の何日後か（入力日時が読めなければ NaN）
  function daysAfterInput(row) {
    return Math.round((Date.parse(row.date) - Date.parse(parseDate(row.inputDate))) / DAY);
  }

  function isCorrection(row) {
    return !!(row.correction && String(row.correction).includes(CORRECTION_MARK));
  }

  // 品目の比較用: 全角・半角や記号の違いをそろえ、年は下2桁にする（「2012」と「12」を同じとみなす）
  function normalizeItem(item) {
    return String(item || '').normalize('NFKC').toLowerCase().replace(/[\s・,.'’"]/g, '').replace(/20(\d{2})/g, '$1');
  }

  // 品目の表記ゆれ（「アサヒ シャンティ」と「シャンティ」等）は、片方がもう片方を含めば同じ品とみなす
  function similarItem(a, b) {
    const x = normalizeItem(a);
    const y = normalizeItem(b);
    if (x === y) return true;
    return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x));
  }

  function sameAmount(a, b) {
    return Math.abs(a - b) < 0.01;
  }

  // 貸借表 A:L の値（1行目は見出し）を判定用の行に変換する
  function rowsFromSheetValues(values) {
    return (values || []).slice(1).map((r, index) => ({
      originalRowIndex: index + 2,
      date: parseDate(r[0]) || parseDate(r[9]),
      name: String(r[1] || '').trim(),
      lender: normalizeStore(r[2]),
      borrower: normalizeStore(r[3]),
      category: String(r[4] || '').trim(),
      item: String(r[5] || '').trim(),
      quantity: String(r[6] || '').trim(),
      unitPrice: String(r[7] || '').trim(),
      amount: parseAmount(r[8]),
      inputDate: String(r[9] || '').trim(),
      correction: String(r[10] || '').trim(),
      receiptId: String(r[11] || '').trim()
    }));
  }

  // 修正データ（✏️修正）と、それが取り消している元データの組を全データから求める
  // 修正データは元データの貸主・借主を入れ替えた同じ品目・同額の行。シート上の位置は元データの
  // 真下とは限らない（修正が続けて入る・二重入力の片方を取り消す等）ため、位置ではなく内容で探す:
  //   - 貸主・借主が逆、品目と金額が同じ、修正より後に入力された行ではない、まだ組になっていない
  //   - 日付が同じ行を優先し、無ければ1日違いまで許す（2025年の修正画面は日付が1日前にずれていた）
  //   - 候補が複数なら日付が近く、シート上の位置が近いもの。修正の修正にも対応するため、
  //     修正データは入力の古い順に処理し、相手が修正データでもよい
  //   - 最後に、相手のない修正が「組になった修正」を逆向きに取り消していれば（修正の修正）、
  //     その修正と組にして元データを集計に戻す（3行の合計は元の取引1件分）
  // GAS（activeRowsFromValues_）も同じ規則で判定する。修正の登録時、GASは「選んだ元行だけが
  // 取り消される」位置に修正行を挿入し、そうできなければ登録しない。
  // rows は { lender, borrower, item, amount, date(YYYY-MM-DD), inputDate, correction } を持つ行の配列（シートの並び順）
  function findCorrectionPairs(rows) {
    const keyOf = (lender, borrower, row) => `${lender}|${borrower}|${row.item}|${Math.round(row.amount * 100)}`;
    const rowsByKey = new Map();
    rows.forEach((row, index) => {
      const key = keyOf(row.lender, row.borrower, row);
      if (!rowsByKey.has(key)) rowsByKey.set(key, []);
      rowsByKey.get(key).push(index);
    });

    const corrections = rows
      .map((row, index) => index)
      .filter(index => isCorrection(rows[index]))
      .sort((a, b) => (parseInputTime(rows[a].inputDate) || 0) - (parseInputTime(rows[b].inputDate) || 0));

    const used = new Set();
    const partner = new Map();
    const pairOf = new Map(); // 修正の行番号 → 取り消した行の行番号（組になった順）
    const pair = (correctionIndex, originalIndex) => {
      used.add(correctionIndex);
      used.add(originalIndex);
      partner.set(correctionIndex, originalIndex);
      partner.set(originalIndex, correctionIndex);
      pairOf.set(correctionIndex, originalIndex);
    };
    const candidatesFor = correctionIndex => {
      const correction = rows[correctionIndex];
      return (rowsByKey.get(keyOf(correction.borrower, correction.lender, correction)) || []).slice();
    };
    const eligible = (correctionIndex, index, maxDays) => index !== correctionIndex &&
      dayDiff(rows[index].date, rows[correctionIndex].date) <= maxDays &&
      !(parseInputTime(rows[index].inputDate) > parseInputTime(rows[correctionIndex].inputDate));
    const closest = (correctionIndex, list) => list.sort((a, b) =>
      dayDiff(rows[a].date, rows[correctionIndex].date) - dayDiff(rows[b].date, rows[correctionIndex].date) ||
      Math.abs(a - correctionIndex) - Math.abs(b - correctionIndex))[0];
    [0, 1].forEach(maxDays => {
      corrections.forEach(correctionIndex => {
        if (used.has(correctionIndex)) return;
        const found = closest(correctionIndex, candidatesFor(correctionIndex)
          .filter(index => !used.has(index) && eligible(correctionIndex, index, maxDays)));
        if (found !== undefined) pair(correctionIndex, found);
      });
    });
    // 修正の修正: 組になった修正を逆向きに取り消す修正は、その修正と組にし、元の行を集計に戻す
    // （3行の合計は元の取引1件分になる）。GAS の activeRowsFromValues_ と同じ規則。
    corrections.forEach(correctionIndex => {
      if (used.has(correctionIndex)) return;
      const found = closest(correctionIndex, candidatesFor(correctionIndex).filter(index =>
        isCorrection(rows[index]) && used.has(index) && !isCorrection(rows[partner.get(index)]) &&
        eligible(correctionIndex, index, 1)));
      if (found === undefined) return;
      const revived = partner.get(found);
      used.delete(revived);
      partner.delete(revived);
      pairOf.delete(found);
      pair(correctionIndex, found);
    });

    const pairs = [...pairOf].map(([correctionIndex, originalIndex]) =>
      ({ correction: rows[correctionIndex], original: rows[originalIndex] }));
    const unmatched = corrections.filter(index => !used.has(index)).map(index => rows[index]);
    return { pairs, unmatched };
  }

  // 集計に残っている通常行（修正データでも、修正で取り消された行でもない）
  function liveRows(rows, correctionResult) {
    const cancelled = new Set();
    correctionResult.pairs.forEach(pair => {
      cancelled.add(pair.correction);
      cancelled.add(pair.original);
    });
    return rows.filter(row => !isCorrection(row) && !cancelled.has(row));
  }

  function bucketBy(rows, keyFn) {
    const buckets = new Map();
    rows.forEach(row => {
      const key = keyFn(row);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(row);
    });
    return buckets;
  }

  const byInputTime = (a, b) => (parseInputTime(a.inputDate) || 0) - (parseInputTime(b.inputDate) || 0);
  const compactName = name => String(name || '').replace(/[\s　]/g, '');

  // 重複・入力ミスの疑いを洗い出す。返り値の groups は確度の高い順:
  //   level: 'high'（重複の疑いが強い）/ 'medium'（重複の可能性）/ 'check'（要確認）
  //   rows: グループの全行、duplicateRows: 重複とみられる行、extraAmount: 重複分の金額
  function findSuspects(rows, options = {}) {
    const correctionResult = options.correctionResult || findCorrectionPairs(rows);
    const live = liveRows(rows, correctionResult);
    const groups = [];
    const flagged = new Set();

    // 1. 同じ日付・貸主・借主・金額で品目が同じ（表記ゆれを含む）行
    bucketBy(live, r => `${r.date}|${r.lender}|${r.borrower}|${Math.round(r.amount * 100)}`).forEach(bucket => {
      if (bucket.length < 2) return;
      const clusters = [];
      bucket.forEach(row => {
        const matched = clusters.filter(cluster => cluster.some(other => similarItem(other.item, row.item)));
        if (matched.length === 0) { clusters.push([row]); return; }
        const merged = [].concat(...matched, [row]);
        matched.forEach(cluster => clusters.splice(clusters.indexOf(cluster), 1));
        clusters.push(merged);
      });
      clusters.filter(cluster => cluster.length > 1).forEach(cluster => {
        cluster.sort(byInputTime);
        const sameName = new Set(cluster.map(r => compactName(r.name))).size === 1;
        const span = parseInputTime(cluster[cluster.length - 1].inputDate) - parseInputTime(cluster[0].inputDate);
        let level = 'medium';
        let kind = '別の人が同じ取引を登録（両店が入力した可能性）';
        if (sameName && span <= 30 * MINUTE) {
          level = 'high';
          kind = '同じ人が短時間に同じ内容を繰り返し登録';
        } else if (sameName) {
          kind = '同じ内容を別の日に再登録';
        }
        cluster.forEach(r => flagged.add(r));
        groups.push({
          level, kind, rows: cluster, duplicateRows: cluster.slice(1),
          extraAmount: (cluster.length - 1) * cluster[0].amount,
          note: `同じ内容が${cluster.length}件`
        });
      });
    });

    // 2. 同じ人が同じ品・同額を、日付だけ変えて入れ直した
    //    （毎週の定期納品など日付違いの正当な取引も多いので、3品以上まとめて入れ直した一覧と、
    //      入力日より後の日付＝打ち間違いが明らかなものだけを対象にする）
    const redated = new Map();
    const mistypedPartners = new Map();
    bucketBy(live, r => `${compactName(r.name)}|${r.lender}|${r.borrower}|${Math.round(r.amount * 100)}`).forEach(bucket => {
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const a = bucket[i], b = bucket[j];
          if (a.date === b.date || !similarItem(a.item, b.item)) continue;
          if (Math.abs(parseInputTime(a.inputDate) - parseInputTime(b.inputDate)) > 120 * MINUTE) continue;
          const [first, second] = a.date < b.date ? [a, b] : [b, a];
          const key = `${compactName(a.name)}|${a.lender}|${a.borrower}|${first.date}|${second.date}`;
          if (!redated.has(key)) redated.set(key, []);
          redated.get(key).push([first, second]);
        }
      }
    });
    redated.forEach(candidatePairs => {
      // 1行は1組にだけ使う（同じ品の重複が何件もあると、同じ行が何組にも数えられるため）
      const usedRows = new Set();
      const pairs = candidatePairs.filter(([first, second]) => {
        if (usedRows.has(first) || usedRows.has(second)) return false;
        usedRows.add(first);
        usedRows.add(second);
        return true;
      });
      if (new Set(pairs.map(([first]) => normalizeItem(first.item))).size >= 3) {
        const [firstDate, secondDate] = [pairs[0][0].date, pairs[0][1].date];
        const all = [].concat(...pairs);
        all.forEach(r => flagged.add(r));
        groups.push({
          level: 'high',
          kind: `同じ一覧を日付を変えて入れ直した（${firstDate} と ${secondDate}）`,
          rows: all, duplicateRows: pairs.map(pair => pair[0]), eitherSide: true,
          extraAmount: pairs.reduce((sum, pair) => sum + pair[0].amount, 0),
          note: `${pairs.length}品が両方の日付で登録。どちらか一方が重複`
        });
        return;
      }
      pairs.forEach(([first, second]) => {
        const future = [first, second].find(r => daysAfterInput(r) >= 1);
        if (!future) return;
        if (!mistypedPartners.has(future)) mistypedPartners.set(future, []);
        mistypedPartners.get(future).push(future === first ? second : first);
      });
    });
    // 打ち間違えた行は1回だけ数える。相手は「日」が同じもの（月の打ち間違い）、次に入力時刻が近いもの
    mistypedPartners.forEach((partners, future) => {
      const futureTime = parseInputTime(future.inputDate);
      const other = partners.slice().sort((a, b) =>
        (a.date.slice(8) === future.date.slice(8) ? 0 : 1) - (b.date.slice(8) === future.date.slice(8) ? 0 : 1) ||
        Math.abs(parseInputTime(a.inputDate) - futureTime) - Math.abs(parseInputTime(b.inputDate) - futureTime))[0];
      flagged.add(future);
      groups.push({
        level: 'high', kind: '日付を打ち間違えて入れ直した',
        rows: [other, future], duplicateRows: [future], extraAmount: future.amount,
        note: `${future.date} は入力日より後の日付`
      });
    });

    // 3. 貸主と借主が逆の登録が打ち消し合っている（修正マークなし）。返却なら正しいが、向きの入力ミスの可能性
    bucketBy(live, r => `${normalizeItem(r.item)}|${Math.round(r.amount * 100)}`).forEach(bucket => {
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const a = bucket[i], b = bucket[j];
          if (a.lender !== b.borrower || a.borrower !== b.lender || dayDiff(a.date, b.date) > 1) continue;
          groups.push({
            level: 'check', kind: '貸主と借主が逆の登録が打ち消し合っている（修正マークなし）',
            rows: [a, b].sort(byInputTime), duplicateRows: [], extraAmount: 0,
            note: '返却なら正しい。向きの入力ミスなら両方とも取引が消えている'
          });
        }
      }
    });

    // 4. 同じ人・同じ日付・同じ品で、数量や金額だけ変えて入れ直した可能性
    bucketBy(live, r => `${compactName(r.name)}|${r.date}|${r.lender}|${r.borrower}|${normalizeItem(r.item)}`).forEach(bucket => {
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const a = bucket[i], b = bucket[j];
          if (sameAmount(a.amount, b.amount)) continue;
          if (Math.abs(parseInputTime(a.inputDate) - parseInputTime(b.inputDate)) > 60 * MINUTE) continue;
          groups.push({
            level: 'check', kind: '数量・金額だけ変えて入れ直した可能性',
            rows: [a, b].sort(byInputTime), duplicateRows: [], extraAmount: 0,
            note: '両方集計に残っている。別の取引なら問題なし'
          });
        }
      }
    });

    // 5. 入力日より後の日付（別の月に集計されている可能性）
    live.filter(r => !flagged.has(r) && daysAfterInput(r) > 3).forEach(r => {
      groups.push({
        level: 'check', kind: '日付の誤りの疑い（入力日より後の日付）',
        rows: [r], duplicateRows: [], extraAmount: 0, note: '別の月に集計されている可能性'
      });
    });

    // 6. 金額が数量×単価と合わない（1円を超える差）
    live.forEach(r => {
      const quantity = parseAmount(r.quantity);
      const unitPrice = parseAmount(r.unitPrice);
      if (!quantity || !unitPrice || Math.abs(quantity * unitPrice - r.amount) <= 1) return;
      groups.push({
        level: 'check', kind: '金額が数量×単価と合わない',
        rows: [r], duplicateRows: [], extraAmount: 0,
        note: `数量×単価=¥${Math.round(quantity * unitPrice).toLocaleString()}`
      });
    });

    // 7. 取り消す相手が見つからない修正データ（同じ取消の二重入力など）
    correctionResult.unmatched.forEach(r => {
      groups.push({
        level: 'check', kind: '取り消す相手が見つからない修正データ',
        rows: [r], duplicateRows: [], extraAmount: 0, note: '同じ取引を二重に取り消している可能性'
      });
    });

    const order = { high: 0, medium: 1, check: 2 };
    groups.sort((a, b) => order[a.level] - order[b.level] ||
      String(b.rows[0].date).localeCompare(String(a.rows[0].date)));
    return { groups, correctionResult };
  }

  // 期間内（どれかの行の日付が期間内）のグループだけにする。start/end は YYYY-MM-DD（空なら制限なし）
  function filterGroupsByPeriod(groups, start, end) {
    return groups.filter(group => group.rows.some(r =>
      (!start || r.date >= start) && (!end || r.date <= end)));
  }

  function summarize(groups) {
    const summary = {};
    ['high', 'medium', 'check'].forEach(level => {
      const list = groups.filter(g => g.level === level);
      summary[level] = {
        groups: list.length,
        duplicateRows: list.reduce((sum, g) => sum + g.duplicateRows.length, 0),
        extraAmount: list.reduce((sum, g) => sum + g.extraAmount, 0)
      };
    });
    return summary;
  }

  // 送信前の確認: これから登録する行と似た登録が、すでに集計に残っていないか
  //   - 同じ日付・貸主・借主・金額で品目が同じ（誰がどの端末で入力した分も対象）
  //   - 同じ人が24時間以内に、日付だけ違う同じ内容を登録している（日付を直して入れ直す場合）
  // entries は { date, name, lender, borrower, item, amount } の配列（amount は文字列でもよい）
  function findSimilarForNewEntries(rows, entries, now = Date.now()) {
    const live = liveRows(rows, findCorrectionPairs(rows));
    const results = [];
    entries.forEach(entry => {
      const date = parseDate(entry.date);
      const lender = normalizeStore(entry.lender);
      const borrower = normalizeStore(entry.borrower);
      const amount = parseAmount(entry.amount);
      const candidates = live.filter(r => r.lender === lender && r.borrower === borrower &&
        sameAmount(r.amount, amount) && similarItem(r.item, entry.item));
      const sameTransaction = candidates.filter(r => r.date === date);
      const redated = candidates.filter(r => r.date !== date &&
        compactName(r.name) === compactName(entry.name) &&
        now - parseInputTime(r.inputDate) <= DAY);
      if (sameTransaction.length || redated.length) {
        results.push({ entry, sameTransaction, redated });
      }
    });
    return results;
  }

  // まだサーバーに送っていない行同士も確認する。異なる正当な取引は確認後に登録できる。
  function findSimilarWithinBatch(entries) {
    const duplicates = [];
    entries.forEach((entry, duplicateIndex) => {
      for (let firstIndex = 0; firstIndex < duplicateIndex; firstIndex++) {
        const first = entries[firstIndex];
        if (parseDate(first.date) === parseDate(entry.date) &&
          normalizeStore(first.lender) === normalizeStore(entry.lender) &&
          normalizeStore(first.borrower) === normalizeStore(entry.borrower) &&
          sameAmount(parseAmount(first.amount), parseAmount(entry.amount)) &&
          similarItem(first.item, entry.item)) {
          duplicates.push({ firstIndex, duplicateIndex });
          break;
        }
      }
    });
    return duplicates;
  }

  function findReverseForCorrection(rows, entry) {
    const date = parseDate(entry.date);
    const lender = normalizeStore(entry.lender);
    const borrower = normalizeStore(entry.borrower);
    const amount = parseAmount(entry.amount);
    return liveRows(rows, findCorrectionPairs(rows)).find(row =>
      row.date === date && row.lender === borrower && row.borrower === lender &&
      Math.round(row.amount * 100) === Math.round(amount * 100) &&
      row.item === String(entry.item || '').trim()) || null;
  }

  // 候補グループの「確認キー」（画面で「問題なし」として非表示にした記録を結び付ける）。
  // シートの行番号は行の挿入でずれ、受付ID（L列）は月次報告が読まないため、どちらも使わない。
  // 行の内容だけから作り、GAS（getDisplayValues → rowsFromSheetValues）と解析画面の行
  // （名前・品目が未トリム、数量の書式違い）で同じ値になる。グループに行が加わる・減るなど
  // 構成が変わればキーも変わり、候補は未確認として再び表示される。
  function storeIdentity(name) {
    const store = normalizeStore(name).toUpperCase();
    // 解析画面の normalizeStoreName は大文字小文字を問わず BISTRO と CAVA を含む名前をそろえる
    return store.includes('BISTRO') && store.includes('CAVA') ? 'BISTRO CAVACAVA' : store;
  }

  // 入力日時は時間帯に依存しない「YYYY/MM/DD HH:mm:ss」の文字列にそろえる（ミリ秒値は実行環境の
  // 時間帯で変わり、ブラウザーとGASでキーが一致しなくなる）
  function inputTimeIdentity(value) {
    const text = String(value || '').trim();
    const m = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return text;
    const pad = n => String(Number(n || 0)).padStart(2, '0');
    return `${m[1]}/${pad(m[2])}/${pad(m[3])} ${pad(m[4])}:${pad(m[5])}:${pad(m[6])}`;
  }

  function groupMemberIdentity(row) {
    return [
      String(row.date || ''),
      compactName(row.name),
      storeIdentity(row.lender),
      storeIdentity(row.borrower),
      String(row.item || '').trim().normalize('NFKC'),
      Math.round((Number(row.amount) || 0) * 100),
      inputTimeIdentity(row.inputDate),
      isCorrection(row)
    ];
  }

  // cyrb53（53ビットの非暗号ハッシュ）。TextEncoder・crypto を使わず GAS でも同じ値になる
  function cyrb53(text, seed) {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  // 'dr1_' + 16進28桁。確度・種類・構成行（順不同）が同じなら同じキー
  function groupKey(group) {
    const members = (group.rows || []).map(row => JSON.stringify(groupMemberIdentity(row))).sort();
    const canonical = JSON.stringify([String(group.level || ''), String(group.kind || ''), members]);
    const hex = seed => cyrb53(canonical, seed).toString(16).padStart(14, '0');
    return 'dr1_' + hex(0x2d9b) + hex(0x6a1f);
  }

  root.DuplicateCheck = {
    normalizeStore, parseAmount, parseDate, parseInputTime, isCorrection, similarItem,
    rowsFromSheetValues, findCorrectionPairs, findSuspects, filterGroupsByPeriod, summarize,
    findSimilarForNewEntries, findSimilarWithinBatch, findReverseForCorrection,
    groupKey, groupMemberIdentity
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
