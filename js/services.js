/* Daftar endpoint dan domain yang didukung (sumber: file CSV). */
(function () {
  const tlds = ["co", "com", "id", "io", "me", "net"];
  const subUnlock = [];
  ["sub4unlock", "sub2unlock"].forEach(function (n) {
    tlds.forEach(function (t) { subUnlock.push(n + "." + t); });
  });

  window.SERVICES = [
    { endpoint: "adlinks", name: "Ad Links", domains: ["loot-link.com","lootdest.org","free-content.pro","lootdest.com","bleleadersto.com","fast-links.org","best-links.org","work.ink","workink.net","rinku.pro","7mb.io","stfly.vip","shrtslug.biz","lockr.so","lockr.net","linkunlocker.com","link-unlock.com","arolinks.com","tpi.li","go.linkify.ru","bstlar.com","scriptpastebins.com","bstshrt.com","sfl.gl","go.yorurl.com","yorurl.com","robloxscripts.gg","lnbz.la","linkzy.space","ez4short.com","cuty.io","cety.io","boost.ink","adfoc.us","mendationforc.info"] },
    { endpoint: "adlinksumo", name: "AdLinkSumo / Kalimbachords", domains: ["adlinksumo.com","kalimbachords.net"] },
    { endpoint: "linkvertise", name: "Linkvertise", domains: ["linkvertise.com"] },
    { endpoint: "ouo", name: "Ouo.io", domains: ["ouo.io"] },
    { endpoint: "pastesites", name: "Paste Sites", domains: ["pastebin.com","paste-drop.com","pastefy.app","paster.so","paster.gg","justpaste.it","pastecanyon.com","pastehill.com","pastemode.com","rentry.org","rentry.co"] },
    { endpoint: "tutwuri", name: "SFL / Tutwuri / Adsafelink", domains: ["sfl.gl","tutwuri.com","adsafelink.com"] },
    { endpoint: "shorteners", name: "Shorteners", domains: ["bit.ly","cl.gy","goo.gl","is.gd","rebrand.ly","shorter.me","t.co","t.ly","tiny.cc","tinylink.onl","tinyurl.com","v.gd"] },
    { endpoint: "shortig", name: "Shortig", domains: ["shortig.com"] },
    { endpoint: "shortxlinks", name: "ShortXLinks", domains: ["shortxlinks.in"] },
    { endpoint: "socialunlocks", name: "Social Unlocks", domains: ["rekonise.com","rekonise.org","rkns.link","socialwolvez.com","mboost.me","bst.gg","booo.st","social-unlock.com","sub2get.com","subfinal.com","unlocknow.net","ytsubme.com"] },
    { endpoint: "sub4unlock", name: "Sub4Unlock / Sub2Unlock", domains: subUnlock }
  ];
})();
