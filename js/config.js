/*
  Konfigurasi sisi browser.
  API key TIDAK disimpan di sini lagi: key hanya ada di server (environment
  variable FGSI_API_KEY di Vercel) dan dipakai oleh api/skip.js.
*/
window.APP_CONFIG = {
  PROXY_URL: "/api/skip"
};
