// ================================
// 活動毎の記録一覧のレコードをソート
// ================================
// sortRecords.js

// 今回の画面で有効な並び順（currentOrderをベースに初期化）
let activeOrder = null; 

// -----------------------------
// ソートオプションを定義
// -----------------------------
const sortOptions = [
  { value: "time-asc", label: "最短記録順" },
  { value: "time-desc", label: "最長記録順" },
  { value: "date-asc", label: "古い日付順" },
  { value: "date-desc", label: "最新日付順" }
];

// -----------------------------
// ソートプルダウン作成
// -----------------------------
export function createSortOptions() {
  // sortSelector: DOM上のソート用<select>要素を取得
  const sortSelector = document.getElementById("sortSelector");
  sortSelector.innerHTML = "";  // 既存の<option>をすべて削除して初期化

  // sortOptions配列に定義されたソート項目をループし、<option>を作成して追加
  sortOptions.forEach(opt => {
    const option = document.createElement("option"); // 新しい<option>要素
    option.value = opt.value;         // value属性にソートキーを設定（例: "time-asc"）
    option.textContent = opt.label;   // ユーザーに表示する文字列
    sortSelector.appendChild(option); // <select> に追加
  });

  // ソートプルダウンを監視し、変更時にボタンの活性/非活性を更新
  document.getElementById("sortSelector").addEventListener("change", updateSortButtonState);
}

// -----------------------------
// ソートプルダウンの指定を活動に応じた内容に初期化
// -----------------------------
export function setSortSelector(currentOrder) {
  // sortSelector: DOM上のソート用<select>要素を取得
  const sortSelector = document.getElementById("sortSelector");
  const sortButton = document.getElementById("sortBtn");

  // ソートボタンの初期表示は非活性
  sortButton.disabled = true;

  // currentOrder に合わせて選択 ※currentOrder は "asc" or "desc" で保存されている前提
  if (currentOrder === "asc") {
    sortSelector.value = "time-asc";  // 最短記録順を初期選択
  } else if (currentOrder === "desc") {
    sortSelector.value = "time-desc"; // 最長記録順を初期選択
  }
}

// -----------------------------
// ソート関数（「ソート」ボタン押下時に実行）
// -----------------------------
function sortRecords() {
  // 現在選択されているソート条件を取得
  const activeSort = document.getElementById("sortSelector").value;
  // recordList: 記録一覧の<ul>要素を取得
  const list = document.getElementById("recordList");
  // <li> 要素を配列に変換（NodeList → Array）
  const items = Array.from(list.querySelectorAll("li"));

  // 各<li>の data-* 属性（data-time, data-date）を使ってソートする
  items.sort((a, b) => {
    // 選択したソート条件に対応する処理を実行 ※Number()=文字列を数値に変換、 getTime()=日付文字列をタイムスタンプに変換
    if (activeSort === "time-asc")  return Number(a.dataset.time) - Number(b.dataset.time); // 記録時間の昇順（小さい順）でソート
    if (activeSort === "time-desc") return Number(b.dataset.time) - Number(a.dataset.time); // 記録時間の降順（大きい順）でソート
    if (activeSort === "date-asc")  return new Date(a.dataset.date) - new Date(b.dataset.date); // 日付の昇順（古い順）でソート
    if (activeSort === "date-desc") return new Date(b.dataset.date) - new Date(a.dataset.date); // 日付の降順（新しい順）でソート
  });

  // 並べ替えた要素をDOMに反映
  items.forEach(item => list.appendChild(item));

  // activeOrderを変更後のソート条件に更新
  activeOrder = activeSort;
  // ソートボタンを非活性化
  updateSortButtonState() 
}

// -----------------------------
// ソートボタンの活性/非活性を更新
// -----------------------------
function updateSortButtonState() {
  const sortSelector = document.getElementById("sortSelector");
  const sortButton = document.getElementById("sortBtn");

  // activeOrder と一致したら無効化
  sortButton.disabled = (activeOrder === sortSelector.value);
}

// -----------------------------
// HTMLから使うためにグローバル登録
// -----------------------------
window.sortRecords = sortRecords;