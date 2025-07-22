// ================================
// データマージ用
// ================================
// dataMerge.js

import {
  collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { validateFields } from './validation.js';

// ??????????????????????????????????????????????????????????????
//const db = window.db;
//const auth = window.auth;

// -----------------------------
// inputデータを既存アカウントへマージする。活動名重複の扱いは引数で制御。
// 重複対象無　　　　　　　　　　　全てinput
// 重複対象有 &　マージせず分ける　全てinput
// 重複対象有 &　マージする　　　　一部input(重複活動名はスルー)
// -----------------------------
export async function mergeUserData(inputActivities, inputRecords, currentActNames, dupActNames) {
  const currentUid = auth.currentUser.uid; // 再ログイン後のUIDを使用
  // 並列でまとめて登録用の変数
  const actAdds = []; 
  const recAdds = [];

    // 既存レコードを取得（重複チェック用）
  const currentRecords = await getQueryData("records", { userId: currentUid });

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
    }

    // 取得中のinputアクティビティに対応する記録一覧を取得
    const inputActRecs = inputRecords.filter(r => r.actName=== inputAct.actName);
    // 記録一覧を1件ずつ処理(活動名重複を分けない場合もそのまま登録)
    for (const inputRec of inputActRecs) {
      // 既存レコード一覧に完全重複のinput記録が1件でも存在するかを確認
      const dupFlg = currentRecords.some(cr =>
        cr.actName === setActName &&
        cr.date === inputRec.date &&
        cr.time === inputRec.time
      );

      // 重複がない場合
      if (!dupFlg) {
        // 記録を追加（あとでまとめて Promise.all）
        recAdds.push(addQueryData("records", {
          ...inputRec,         // 取得情報をそのまま展開
          actName: setActName, // 上書き（重複回避で名称変更の可能性があるため）
          userId: currentUid   // 上書き
        }));

      } else {
        console.log(`⏭ 重複スキップ: ${setActName} (${inputRec.date}, ${inputRec.time}s)`); // 処理の遅延回避で削除検討？？？？？？？？？？？？
      }
    }
  }
  // 並列でまとめて登録（activities + records）
  await Promise.all([...actAdds, ...recAdds]);
}

// -----------------------------
// 既存名称をもとに、重複しない名称を生成する。
// -----------------------------
export function getUniqueName(checkName, currentNames) {
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

// -----------------------------
// 匿名ユーザーの削除予約を deleteQueue に登録する。
// 実際の削除は後日バッチ処理などで行う。
/** ----------------------------
 * @param {string} anonUid - 匿名ユーザーのUID
 */
export async function reserveDelUser(anonUid) {
  try {
    await addDoc(collection(db, "reserveDeleteUser"), {
      userId: anonUid,
      date: new Date().toLocaleString(), // 現在時刻（タイムスタンプ）
      status: "delete"      // 状態管理フラグ（任意）
    });
    console.log(`🕒 匿名UID (${anonUid}) の削除予約を登録しました`);
  } catch (err) {
    console.error("❌ 匿名UIDの削除予約登録に失敗:", err);
    throw err;
  }
}

// -----------------------------
// 匿名ユーザーの活動と記録を削除する。
/** ----------------------------
 * @param {string} uid - 削除対象の userId（匿名UIDなど）
 */
export async function deleteAnonUserData (uid) {
  try {
    await deleteCollectionByUser("activities", uid);
    await deleteCollectionByUser("records", uid);
  } catch (err) {
    throw err;
  }
}

// -----------------------------
// 特定ユーザーの指定コレクション内の全ドキュメントを削除する。
/** ----------------------------
 * @param {string} collectionName - 対象コレクション名（例: "activities", "records"）
 * @param {string} uid - 削除対象の userId（匿名UIDなど）
 */
export async function deleteCollectionByUser(collectionName, uid) {
  try {
    // FirestoreからUIDに紐づくデータを取得
    const docsToDelete = await getQueryData(collectionName, { userId: uid });
    // 一括削除処理
    const deleteOps = docsToDelete.map(doc =>deleteQueryData(collectionName, doc.id));
    // 削除処理完了まで待機
    await Promise.all(deleteOps);
    console.log(`🗑 ${collectionName}（${docsToDelete.length}件）を削除しました`);
  } catch (err) {
    console.error(`❌ ${uid}の${collectionName} の一括削除に失敗:`, err);
    throw err;
  }
}

// -----------------------------
// Firestore の任意のコレクションから、指定された複数のフィールド条件（where句）に一致するデータを取得する。
/** ----------------------------
 * @param {string} collectionName - "activities" や "records" などのコレクション名
 * @param {Object} filters - 取得条件のフィールドと値の組（例: { userId: ..., actName: ... }）
 * @returns {Promise<Array<Object>>} 各ドキュメントの { id, ...データ } を配列で返す
 */
export async function getQueryData(collectionName, filters = {}) {
  // データ取得
  const snap = await getDocs(query(
    collection(db, collectionName),
    ...Object.entries(filters).map(([field, value]) => where(field, "==", value))
  ));

  // snap.idとsnap.data().[項目]を一纏めにし返す(snap.idは削除更新に使用)
  return snap.docs.map(doc => ({
    id: doc.id,         // ドキュメントID
    ...doc.data(),      // activity, time, date, userId など
  }));
}

// -----------------------------
// Firestore の指定コレクションへ、指定されたデータを新規ドキュメントとして登録する。
//  - validateFields() で必須項目の存在と補完をチェック
//  - userId や recOrder などもここで自動補完
//  - 不正なデータはスキップ（null時）
/** ----------------------------
 * @param {string} collectionName - "activities" や "records" などのコレクション名
 * @param {Object} data - 登録するフィールドのデータ（例: { actName, userId, ... }）
 * @returns {Promise<DocumentReference|undefined>} Firestoreへの追加結果（失敗時は何も返さない）
 */
export async function addQueryData(collectionName, data = {}) {
   // 登録データの検証＋補完
  const validData = validateFields(collectionName, data);
  if (!validData) {
    console.warn(`⛔ 無効なデータなので登録スキップ:`, data);
    return; // 無効データの場合は処理をスキップ
  }
  // Firestoreへ登録
  return await addDoc(collection(db, collectionName), validData);
}

// -----------------------------
// Firestore の指定コレクションからドキュメントIDで1件削除する
/** ----------------------------
 * @param {string} collectionName - "activities" や "records" などのコレクション名
 * @param {string} docId - 削除対象のドキュメントID
 * @returns {Promise<void>} 削除処理の Promise を返す（await 可能に）
 */
export async function deleteQueryData(collectionName, docId) {
  try {
    // 削除処理（非同期）
    const result = await deleteDoc(doc(db, collectionName, docId));
    console.log(`🗑 ${collectionName} のドキュメント（ID: ${docId}）を削除しました`);
    return result;
  } catch (err) {
    console.error(`❌ ${collectionName} の削除に失敗:`, err);
    throw err; // 上位でキャッチのため
  }
}