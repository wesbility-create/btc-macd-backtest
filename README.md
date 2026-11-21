# Binance MACD 靜態 PWA（Safari 版）

## 立即部署（不需要 GitHub 或 Python）
1. 解壓 ZIP。
2. 在電腦瀏覽器開啟 https://dash.cloudflare.com/ ，建立免費帳號。
3. 進入 Workers & Pages → Create → Pages → Upload assets（直接上傳）。
4. 上傳解壓後的資料夾內容（index.html 必須在根目錄），按 Deploy。
5. 在 iPhone Safari 開啟取得的 `*.pages.dev` HTTPS 網址，分享 → 加入主畫面。

若 Cloudflare 的選單名稱變動，請尋找 Pages 的 Direct Upload / Upload assets。
也可部署到任何支援靜態檔案的 HTTPS 託管平台。

## 功能
BTCUSDT / 5m 預設；直接向 Binance 公開 REST API 下載歷史 K 線（現貨或 USDT 永續）。
MACD 12/26/9，訊號 K 收盤確認，下一根開盤進場；止損是訊號 K 前一根高低點，止盈 5R。
不重疊持倉；同 K 棒同時觸及停損停利，以停損優先；費用、滑價可設定。
勝率、平均 R、PF、最大回撤、交易明細與 CSV 匯出。

## 重要限制
* 網頁直接向 Binance API 發請求；若所在地區、瀏覽器 CORS 政策或網路阻擋，資料下載會失敗。此版本沒有代理伺服器，也不會繞過地區限制。
* 免費靜態託管只負責網頁，不保證 Binance API 可用。
* 資料下載最多 60,000 根；僅使用已收盤 K 線。
* 回測為 OHLC 模擬，不含資金費率、強平、訂單簿深度；不代表實際可成交績效。
* 本專案未經 iPhone Safari 實機連線測試；請先用短日期區間驗證。

## 本機測試
解壓後在資料夾執行 `python -m http.server 8000`，用瀏覽器開啟 http://localhost:8000。
PWA 安裝需要 HTTPS（localhost 為例外）。
