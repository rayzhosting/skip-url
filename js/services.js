/*
  Daftar layanan dan domain yang dikenali otomatis.
  "endpoint" di sini adalah ID layanan internal. Server (api/skip.js) yang
  menerjemahkannya ke nama endpoint tiap provider (Theresav, FGSI, dst).
  Link yang domainnya tidak ada di daftar ini otomatis dicoba lewat "universal".
*/
(function () {
  const tlds = ["co", "com", "id", "io", "me", "net"];
  function expand(name) { return tlds.map(function (t) { return name + "." + t; }); }

  window.SERVICES = [
    { endpoint: "sfl", name: "SFL.gl", domains: ["sfl.gl", "tutwuri.com"] },
    { endpoint: "ouo", name: "Ouo.io / Ouo.press", domains: ["ouo.io", "ouo.press"] },
    { endpoint: "linkvertise", name: "Linkvertise", domains: ["linkvertise.com"] },
    { endpoint: "adlinksumo", name: "AdLinkSumo / Kalimbachords", domains: ["adlinksumo.com", "kalimbachords.net"] },
    { endpoint: "adsafe", name: "AdSafe", domains: ["adsafelink.com"] },
    { endpoint: "sub2unlock", name: "Sub2Unlock", domains: expand("sub2unlock") },
    { endpoint: "sub4unlock", name: "Sub4Unlock / Subs4Unlock", domains: expand("sub4unlock") },
    { endpoint: "shrinkme", name: "Shrinkme", domains: ["shrinkme.io", "shrinkme.click"] },
    { endpoint: "tpi", name: "TPI / Token Base64", domains: ["tpi.li"] },
    { endpoint: "vplink", name: "VPLink", domains: ["vplink.in"] },
    { endpoint: "droplink", name: "Droplink", domains: ["droplink.co"] },
    { endpoint: "linkpays", name: "LinkPays", domains: ["linkpays.in"] },
    { endpoint: "moneyblink", name: "MoneyBlink", domains: ["moneyblink.com"] },
    { endpoint: "bicolink", name: "Bicolink", domains: ["bicolink.net"] },

    /* Tersedia di provider tapi belum ada daftar domainnya: pilih manual atau biarkan lewat Universal */
    { endpoint: "biplab", name: "Biplab", domains: [] },
    { endpoint: "cutwin", name: "CutWin", domains: [] },
    { endpoint: "delta", name: "Delta", domains: [] },
    { endpoint: "earnlinks", name: "EarnLinks", domains: [] },
    { endpoint: "izen", name: "Izen", domains: [] },
    { endpoint: "linkpoi", name: "LinkPoi", domains: [] },
    { endpoint: "move2link", name: "Move2Link", domains: [] },
    { endpoint: "pndk", name: "Pndk", domains: [] },

    /* Khusus provider FGSI (cadangan) */
    { endpoint: "adlinks", name: "Ad Links", domains: ["loot-link.com","lootdest.org","free-content.pro","lootdest.com","bleleadersto.com","fast-links.org","best-links.org","work.ink","workink.net","rinku.pro","7mb.io","stfly.vip","shrtslug.biz","lockr.so","lockr.net","linkunlocker.com","link-unlock.com","arolinks.com","go.linkify.ru","bstlar.com","scriptpastebins.com","bstshrt.com","go.yorurl.com","yorurl.com","robloxscripts.gg","lnbz.la","linkzy.space","ez4short.com","cuty.io","cety.io","boost.ink","adfoc.us","mendationforc.info"] },
    { endpoint: "pastesites", name: "Paste Sites", domains: ["pastebin.com","paste-drop.com","pastefy.app","paster.so","paster.gg","justpaste.it","pastecanyon.com","pastehill.com","pastemode.com","rentry.org","rentry.co"] },
    { endpoint: "shorteners", name: "Shorteners", domains: ["bit.ly","cl.gy","goo.gl","is.gd","rebrand.ly","shorter.me","t.co","t.ly","tiny.cc","tinylink.onl","tinyurl.com","v.gd"] },
    { endpoint: "shortig", name: "Shortig", domains: ["shortig.com"] },
    { endpoint: "shortxlinks", name: "ShortXLinks", domains: ["shortxlinks.in"] },
    { endpoint: "socialunlocks", name: "Social Unlocks", domains: ["rekonise.com","rekonise.org","rkns.link","socialwolvez.com","mboost.me","bst.gg","booo.st","social-unlock.com","sub2get.com","subfinal.com","unlocknow.net","ytsubme.com"] },

    /* Cadangan otomatis untuk domain yang tidak dikenali */
    { endpoint: "universal", name: "Universal", domains: [] }
  ];
})();
