// ================================
// validationチェック用
// ================================
// validation.js

/**
 * Firestore 各コレクションに対応するスキーマ（必須フィールド一覧）
 */
export const SCHEMAS = {
  activities: ["actName", "recOrder", "userId"], // 活動名・並び順・ユーザーID
  records: ["actName", "time", "date", "userId"], // 活動名・タイム・日付・ユーザーID
};

/**
 * Firestore に保存する前のデータを検査・補正する関数
 *
 * ✅ 必須項目がすべて存在するかをチェック
 * ✅ `recOrder`（activitiesのみ）と `userId` は自動補完
 * ✅ スキーマに含まれない不要な項目は除外
 * ✅ 補完できない必須項目が欠けている場合は null を返す（登録スキップ）
 *
 * @param {string} collectionName - Firestoreコレクション名（例："activities"）
 * @param {object} data - 登録対象データ（省略時は空オブジェクトで処理）
 * @returns {object|null} - 補正済みのデータ。スキーマに合わない場合は null。
 */
export function validateFields(collectionName, rawData = {}) {
  const schema = SCHEMAS[collectionName]; // コレクションに対応する項目一覧をスキーマから取得

  // スキーマが未定義のコレクションは処理中断
  if (!schema) {
  console.error(`❌ "${collectionName}" は許可されていないコレクションです。登録を中止します`);
  return null;
  }

  const cleanData = {}; // 補正後のデータ格納用

  // 項目名を順番に取得　※スキーマにない項目は扱わない
  for (const key of schema) {
    // 対象項目が存在し中身がある場合　　　時間とか日付とかはフォーマットも確認いりそう？？？？
    if (rawData[key] != null && rawData[key] !== "") {
      cleanData[key] = rawData[key]; // そのまま使用

    // 不足があった場合
    }else {
      // activitiesのrecOrderに問題があった場合
      if (key === "recOrder" && collectionName === "activities") {
        cleanData[key] = "asc"; // 並び順は初期値 "asc"

      // userIdに問題があった場合
      } else if (key === "userId") {
        cleanData[key] = auth.currentUser.uid; // ユーザーIDを補完

      } else {
        // 補完不可能な項目が不足 → 無効データとして null を返す
        console.warn(`❌ ${collectionName} の必須項目 "${key}" が欠落し補完不能:`, rawData);
        return null;
      }
    }
  }
  return cleanData; // スキーマ準拠・補完済みの安全なデータ
}
