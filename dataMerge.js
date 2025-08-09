// ================================
// データマージ用
// ================================
// dataMerge.js

import { auth } from './firebaseCore.js';
import { getQueryData, addQueryData, updateQueryData } from './dbUtils.js';
import { showMergeModal } from './modalHandler.js';

// -----------------------------
// インポートまたは匿名→Google昇格時のデータマージ確認処理
// - 活動名の重複確認・分離対応
// - 完了後は auth-ready イベントを発火して UI を再初期化
/** ----------------------------
 * @param {Array} inputActivities - マージ対象のアクティビティ一覧
 * @param {Array} inputRecords - マージ対象の記録一覧
 * @param {string} mode - "google"（昇格）または "import"（インポート）
 * @returns {boolean} - マージが行われたかどうか（キャンセル時は false）
 */
export async function mergeCheck(inputActivities, inputRecords, mode ) {
  try {
    // 呼び出し元に応じてメッセージ変更
    let message = "";
    if (mode === "google") {
      message = "匿名ユーザーの活動記録があります。\nGoogleアカウントに引き継ぎますか？\n\nキャンセルすると匿名データは削除されます。";
    } else if (mode === "import") {
      message = "現在のアカウントにインポートします。\n\nキャンセルするとインポートは中止されます。";
    }
    
    // メッセージポップアップでユーザがマージをキャンセルした場合
    const doMerge = confirm(message); 
    if (!doMerge) {
      console.log("🛑 ユーザーがマージをキャンセルしました");
      return false; // インポート時のアラート設定のため
    }

    // 現行ユーザの活動データ一覧を取得
    const currentActivities = await getQueryData("activities", { userId: auth.currentUser.uid });
    // 現行ユーザのアクティビティ名一覧を取得（重複チェック用）
    const currentActNames = currentActivities.map(act => act.actName);

    // inputユーザと現行ユーザで重複している活動名の一覧を取得
    let dupActNames = inputActivities.map(act => act.actName).filter(name => currentActNames.includes(name));
    // 重複がある場合
    if (dupActNames.length > 0) {
      const sepFlg = !confirm(
        "活動名が重複している可能性があります。\n統合して保存しますか？\n\nキャンセルすると活動を分けて保存します。"
      );
      // 分けて保存する場合、重複活動名リストは空にする（すべて登録対象にする）
      if (sepFlg) {dupActNames = [];}
    }
    //マージ処理
    await mergeUserData(inputActivities, inputRecords, currentActNames, dupActNames);
    console.log("✅ 匿名データをGoogleアカウントにマージしました");
    
    // 初期化のためカスタムイベントを dispatch（main.js がこれを待つ）
    window.dispatchEvent(new Event("auth-ready"));
    return true; // インポート時のアラート設定のため

  } catch (error) {
    console.error("❌ データマージに失敗:", error);
    alert("データマージに失敗しました。");
    return false; // インポート時のアラート設定のため
  }
}

// -----------------------------
// inputデータを既存アカウントへマージする。活動名重複の扱いは引数で制御。
// - 重複対象無　　　　　　　　　　　全てinput
// - 重複対象有 &　マージせず分ける　全てinput(重複活動名も別名化して登録)
// - 重複対象有 &　マージする　　　　一部input(重複活動名はスルー)
/** ----------------------------
 * @param {Array<Object>} inputActivities - インポート元の活動データ配列（{ actName, recOrder, ... }）
 * @param {Array<Object>} inputRecords    - インポート元の記録データ配列（{ actName, date, time, ... }）
 * @param {Array<string>} currentActNames - 既存アカウントに登録済みの全活動名一覧
 * @param {Array<string>} dupActNames     - 活動名の重複があった場合にマージ対象外とする活動名一覧
 */
export async function mergeUserData(inputActivities, inputRecords, currentActNames, dupActNames) {
  // 再ログイン後のUIDを使用し既存レコードを取得（重複チェック用）
  const currentUid = auth.currentUser.uid;
  const currentRecords = await getQueryData("records", { userId: currentUid });

  // 並列でまとめて登録用の変数
  const actAdds = []; 
  const recAdds = [];
  // 記録をマージする際にメモのみ差分があり両方に値がある場合のレコード情報取得変数
  const mergeWarnings = [];

  // inputアクティビティが存在する場合、1件ずつ処理
  for (const inputAct of inputActivities) {
    // 既存アカウントに記録を登録する活動名を設定
    let  setActName = inputAct.actName;

    // 登録をスキップしない場合（重複なし、または重複分を分ける選択の場合）※マージする場合で活動名重複時のみスキップ
    if (!dupActNames.includes(setActName)) {
      // 名称の重複回避のため活動名を更新
       setActName = getUniqueName(inputAct.actName, currentActNames);

      // 新たな活動を追加（あとでまとめて Promise.all）
      actAdds.push(addQueryData("activities", {
        ...inputAct,         // 取得情報をそのまま展開
        actName: setActName, // 上書き（重複回避で名称変更の可能性があるため）
        userId: currentUid,  // 上書き
      }));

      // 名前が重複しないようにリストに追加
      currentActNames.push(setActName);
    } else {
      console.log(`⏭ 活動名重複スキップ(マージ対応): ${setActName}`); // 処理の遅延回避で削除検討？？？？？？？？？？？？
    }

    // 取得中のinputアクティビティに対応する記録一覧を取得
    const inputActRecs = inputRecords.filter(r => r.actName=== inputAct.actName);
    // 記録一覧を1件ずつ処理(活動名重複を分けない場合もそのまま登録)
    for (const inputRec of inputActRecs) {
      // 既存レコード一覧から完全一致する記録（重複）を検索
      const dupRec = currentRecords.find(cr =>
        cr.actName === setActName &&
        cr.date === inputRec.date &&
        cr.time === inputRec.time
      );

      // 重複がない場合
      if (!dupRec) {
        // 記録を追加（あとでまとめて Promise.all）
        recAdds.push(addQueryData("records", {
          ...inputRec,         // 取得情報をそのまま展開
          actName: setActName, // 上書き（重複回避で名称変更の可能性があるため）
          userId: currentUid   // 上書き
        }));

      // 重複ありの場合
      } else {
         // メモ内容を取得　※falseな値(null、undefined)の場合、空文字を設定
        const inputMemo = inputRec.memo || "";
        const currentMemo = dupRec.memo || "";

        let mergedMemo = currentMemo;

        // インプットメモに値がある、かつメモの内容が異なる場合　※インプットにメモがない、またはメモに差異がない場合はスキップ
        if (inputMemo && inputMemo !== currentMemo) {
          // 既存メモが空の場合
          if (!currentMemo) {
            mergedMemo = inputMemo; // インプットメモがupdate対象

          // 両方に値はあるが、既存メモに以前にマージした痕跡がある場合
          } else if (currentMemo.includes('\nーーーーーここからマージメモーーーーー\n')) {
            console.log(`⚠️ 既にメモにマージの痕跡があるためスキップ: ${inputMemo}`);
            continue; // 次のレコードへ

          // 両方に値がある場合
          } else  {
            mergedMemo = `${currentMemo}\nーーーーーここからマージメモーーーーー\n${inputMemo}`; // メモをマージ

            // マージしたことをユーザに伝える情報取得
            mergeWarnings.push({
              actName: setActName,
              date: inputRec.date,
              time: inputRec.time
            });
          }
          // 記録を更新（あとでまとめて Promise.all）
          recAdds.push(updateQueryData("records", dupRec.id, { memo: mergedMemo }));
          console.log(`メモ内容をマージ更新: ${setActName} (${inputRec.date}, ${inputRec.time}s)`);
        } else {
          console.log(`⏭ 記録重複スキップ: ${setActName} (${inputRec.date}, ${inputRec.time}s)`); // 処理の遅延回避で削除検討？？？？？？？？？？？？
        }
      }
    }
  }
  // 並列でまとめて登録（activities + records）
  await Promise.all([...actAdds, ...recAdds]);

  // メモマージ警告があれば通知
  if (mergeWarnings.length > 0) {
    showMergeModal(mergeWarnings);
  }
}

// -----------------------------
// 既存名称をもとに、重複しない名称を生成する。
// -----------------------------
function getUniqueName(checkName, currentNames) {
  // そのまま使えるかチェック
  if (!currentNames.includes(checkName)) {
    return checkName;
  }

  // "活動名 (1)", "活動名 (2)", ... と重複しない名前を探す
  let counter = 1;
  let candidateName;
  do {
    candidateName = `${checkName}(${counter})`;
    counter++;
  } while (currentNames.includes(candidateName));

  return candidateName; // 重複しない名前が見つかったら返す
}
