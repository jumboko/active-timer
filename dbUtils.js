// ================================
// DBアクセスおよび基本処理
// ================================
// dbUtils.js

import { db } from "./firebaseCore.js";
import {
  collection, getDocs, addDoc, setDoc, deleteDoc, doc, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { validateFields } from './validation.js';

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
// Firestore の指定コレクションへ、ドキュメントIDで指定された複数フィールドを更新する
//  - merge: true = 既存の値を保持しつつ、指定したフィールドだけを更新
/** ----------------------------
 * @param {string} collectionName - "activities" や "records" などのコレクション名
 * @param {string} docId - 更新対象のドキュメントID
 * @param {Object} data - 登録するフィールドのデータ（例: { actName, userId, ... }）
 * @returns {Promise<void>} Firestoreへの更新完了（失敗時は例外スロー）
 */
export async function updateQueryData(collectionName, docId, data) {
  const docRef = doc(db, collectionName, docId);
  const result = await setDoc(docRef, data, { merge: true });   // 既存データにマージ（上書き）

  console.log(`${collectionName} のドキュメント（ID: ${docId}）を更新しました`);
  return result;
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
