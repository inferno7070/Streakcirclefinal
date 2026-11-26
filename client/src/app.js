// StreakCircle client (single-page app, no framework).
//
// File layout (top to bottom):
//   1. (constants.js)      5. Reminders           9. Circle screen
//   2. App state (S)       6. View helpers       10. Sprint screen
//   3. Theme               7. Today + dialogs    11. Insights / You screens
//   4. Server sync + auth  8. render()           12. Click handler, boot
// Flow: user clicks -> click handler -> api() call -> state S updated -> render() redraws.
// api.js handles fetch + JWT; constants.js = option lists; tick.js = Tick 3D coach + landing hero.
// main.js loads this file and the styles.

import { io } from "socket.io-client";
import { api, getToken, setToken } from "./api.js";
import { CAT, UNITS, ICONS, AVATARS, PRI, MET } from "./constants.js";
import { initTick } from "./tick.js";

// ======================================================================
// CONSTANTS: labels and option lists used by the forms and filters
// ======================================================================

// ======================================================================
// APP STATE: one object holding everything the screens draw from
// ======================================================================
// S = single source of truth for the UI. render() rebuilds the page from it.
// tab = current screen, habits/mem/all = data from the server, form/cal/modal = open dialogs.
var S = {
  tab: "today",
  freeze: 1,
  reasons: { busy: 0, forgot: 0, "too hard": 0, sick: 0, tired: 0, other: 0 },
  habits: [],
  mem: [],
  all: [],
  circle: null,
  level: 1,
  xp: 0,
  total: 0,
  am: "login",
  err: "",
  cat: "all",
  q: "",
  form: null,
  cal: null,
  stats: null,
  feed: [],
  chat: [],
  chal: [],
  cs: null,
  ct: "ov",
  rng: "w",
  notes: { unread: 0, items: [] },
  modal: null,
  coach: null,
  sug: null,
  busy: "",
  mview: null,
  lm: "consistency",
  cf: null,
  pf: null,
  pw: { cur: "", nw: "" },
  msg: "",
  theme: "dark",
  remOn: false,
  _lt: ""
};

// ======================================================================
// SMALL HELPERS: escaping, dates, formatting, toasts
// ======================================================================
// Escape text before putting it into HTML so user input can never inject markup.
var esc = function(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};
// Left-pad a number to two digits (7 -> "07").
function pad(n) {
  return ("0" + n).slice(-2);
}
// Today as YYYY-MM-DD in the browser's local time.
function dayKey() {
  var d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
// Add n days to a YYYY-MM-DD string.
function addD(s, n) {
  var d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// "5m", "3h", "2d": how long ago a timestamp was.
function ago(t) {
  var s = Math.max(0, (Date.now() - new Date(t)) / 1e3);
  return s < 60 ? "now" : s < 3600 ? Math.floor(s / 60) + "m" : s < 86400 ? Math.floor(s / 3600) + "h" : Math.floor(s / 86400) + "d";
}
function $(s) {
  return document.querySelector(s);
}
// A habit counts as finished if today is done, or (weekly habits) this week's goal is met.
function ok(h) {
  return !!h.done || !!h.wm;
}
// Alias of ok(), kept for readability in views.
function done(h) {
  return ok(h);
}
// Current streak from the server (days for daily habits, weeks for weekly).
function streak(h) {
  return h.streak || 0;
}
// Completion % over the last 28 days from the server.
function rate(h) {
  return h.rate || 0;
}
// Overall progress today (0..1) used by the ring on the Today screen.
function prog() {
  return S.habits.reduce(function(a, h) {
    return a + (h.wm && !h.done ? 1 : Math.min(h.v / h.t, 1));
  }, 0) / (S.habits.length || 1);
}
// True when every habit is finished: closes the ring.
function allDone() {
  return S.habits.length > 0 && S.habits.every(ok);
}
// Draws the circular progress ring (SVG) with a centre label.
function ringSVG(p, lab) {
  var c = 2 * Math.PI * 52;
  return '<div class="ring"><svg width="100%" height="100%" viewBox="0 0 120 120"><circle class="t" cx="60" cy="60" r="52"/><circle class="f" cx="60" cy="60" r="52" style="--c:' + c + ";--o:" + c * (1 - p) + '"/></svg><b>' + lab + "</b></div>";
}
// Shows a short message at the top of the screen for 2 seconds.
function toast(t) {
  var e = document.createElement("div");
  e.className = "toast";
  e.textContent = t;
  document.body.appendChild(e);
  setTimeout(function() {
    e.remove();
  }, 2200);
}
// Emoji burst that floats up from the click position (celebration effect).
function float(em, ev) {
  for (var i = 0; i < 5; i++) {
    var e = document.createElement("div");
    e.className = "fl";
    e.textContent = em;
    e.style.left = ev.clientX - 15 + (Math.random() * 60 - 30) + "px";
    e.style.top = ev.clientY - 15 + "px";
    e.style.animationDelay = i * 0.08 + "s";
    document.body.appendChild(e);
    setTimeout(function(x) {
      x.remove();
    }, 1800, e);
  }
}
// Stable colour per person/id so avatars always look the same.
function hue(s) {
  var x = 0;
  for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) % 360;
  return "hsl(" + x + ",62%,52%)";
}
// First character (emoji-safe) of a name, used as an avatar fallback.
function first(n) {
  return Array.from(String(n || "?"))[0] || "?";
}
// HTML for a round avatar (emoji if set, otherwise first letter).
function av(m, cls) {
  return '<div class="av ' + (cls || "") + '" style="background:' + hue(m.id || m.n || "x") + '">' + esc(m.e || first(m.n || m.name)) + "</div>";
}
// Safe localStorage read/write (never throws if storage is blocked).
function store(k, v) {
  try {
    if (v === void 0) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch (e) {
    return null;
  }
}

// ======================================================================
// THEME: dark/light switch, remembered in localStorage
// ======================================================================
// Applies "dark" or "light" through <html data-theme=...> (styles.css reacts to it).
function theme(t) {
  S.theme = t;
  document.documentElement.dataset.theme = t;
  store("sc_theme", t);
  // Tell the 3D Tick (landing section) to switch between glowing and solid look
  window.dispatchEvent(new Event("sc:theme"));
}
theme(store("sc_theme") == "light" ? "light" : "dark");
S.remOn = store("sc_rem") == "1";

// ======================================================================
// SERVER SYNC: loading data, saving changes, keeping the screen in step
// ======================================================================
// U = signed-in user, sock = Socket.IO connection, pend/Q = queue so saves run one at a time.
var U = null, sock = null, pend = 0, Q = Promise.resolve();
// Habits the user already explained today ("busy", "forgot"...) so the prompt is hidden.
function skips() {
  try {
    var j = JSON.parse(store("sc_skip") || "null");
    return j && j.d == dayKey() && Array.isArray(j.ids) ? j.ids : [];
  } catch (e) {
    return [];
  }
}
// Remember that a habit's missed-yesterday prompt was answered today.
function addSkip(id) {
  var ids = skips();
  if (ids.indexOf(id) < 0) ids.push(id);
  store("sc_skip", JSON.stringify({ d: dayKey(), ids }));
}
// Convert the server's /habits response into the compact shape the views use.
function adapt(p) {
  S.freeze = p.freezes;
  S.level = p.level || 1;
  S.xp = p.xp || 0;
  var sk = skips();
  S.habits = p.habits.map(function(x) {
    return { id: x.id, ic: x.icon, n: x.name, u: x.unit, t: x.target, st: x.step, v: x.value, done: x.done, streak: x.streak, rate: x.rate, my: x.missedYesterday, miss: x.rough ? 3 : 0, h: x.heat.slice(0, 27), skip: sk.indexOf(x.id) > -1 ? 1 : 0, cat: x.category, fq: x.frequency, pw: x.perWeek, pri: x.priority, rem: x.remindAt, wd: x.weekDone, wm: x.weekMet, best: x.best, tot: x.total, cr: x.created };
  });
}
// Store the circle + member list from the server (S.mem excludes yourself).
function setCircle(c) {
  S.circle = c.circle || null;
  S.all = c.members || [];
  S.mem = S.all.filter(function(m) {
    return !m.me;
  }).map(function(m) {
    return { id: m.id, n: m.name, e: m.emoji, c: hue(m.id), cons: m.cons, str: m.streak, done: m.done ? 1 : 0, pts: m.points, own: m.owner, ha: m.habits };
  });
}
// Store /stats data (insights screen).
function setStats(s) {
  S.stats = s;
  S.reasons = s.reasons || S.reasons;
  S.total = s.total || 0;
}
// Store the notification list and unread count.
function setNotes(n) {
  S.notes = n;
}
// Refresh notifications from the server.
function loadNotes() {
  return api("/notifications").then(function(n) {
    setNotes(n);
    if (S.modal != "notes") render();
  }).catch(function() {
  });
}
// Load habits, circle, stats and notifications together, then redraw.
function loadAll() {
  if (!U) return Promise.resolve();
  return Promise.all([api("/habits"), api("/circle"), api("/stats"), api("/notifications")]).then(function(r) {
    adapt(r[0]);
    setCircle(r[1]);
    setStats(r[2]);
    setNotes(r[3]);
  }).catch(function(e) {
    toast(e.message);
  }).then(function() {
    render();
    remTick();
  });
}
// Reload just the data the given tab needs (called when switching tabs).
function refresh(tab) {
  if (!U) return;
  var p = [];
  if (tab == "insights") p.push(api("/stats").then(setStats));
  if (tab == "circle") {
    p.push(api("/circle").then(function(c) {
      setCircle(c);
      return c.circle ? Promise.all([api("/circle/stats").then(function(x) {
        S.cs = x;
      }), api("/circle/feed").then(function(x) {
        S.feed = x.items;
      }), api("/circle/chat").then(function(x) {
        S.chat = x.items;
      })]) : 0;
    }));
  }
  if (tab == "chal") {
    p.push(api("/circle").then(function(c) {
      setCircle(c);
      return c.circle ? api("/challenges").then(function(x) {
        S.chal = x.challenges;
      }) : S.chal = [];
    }));
  }
  if (tab == "today") p.push(api("/stats").then(setStats));
  Promise.all(p).then(function() {
    if (S.tab == tab) render();
  }).catch(function() {
  });
}
// Queue a server action so quick taps are sent in order; on failure show the error and resync.
function run(fn) {
  pend++;
  Q = Q.then(fn).catch(function(e) {
    toast(e.message);
    return loadAll();
  }).then(function() {
    pend--;
  });
  return Q;
}
// Apply a fresh /habits response unless more saves are still waiting.
function apply(p) {
  if (pend <= 1) {
    adapt(p);
    render();
  }
}
// Find a habit in state by its id.
function byId(id) {
  return S.habits.filter(function(z) {
    return z.id == id;
  })[0];
}
// Set today's progress for a habit: updates the screen instantly, then saves to the server.
function setVal(x, v, ev, quiet) {
  var was = x.done;
  v = Math.max(0, Math.min(v, x.t));
  x.v = v;
  x.done = v >= x.t;
  render();
  return run(function() {
    return api("/habits/" + x.id + "/progress", { method: "PUT", body: { value: v } }).then(function(p) {
      apply(p);
      var n = byId(x.id);
      if (!quiet && n && !was && n.done) {
        if (ev) float("🔥", ev);
        toast(n.n + " done. Streak " + streak(n));
      }
    });
  });
}
// "Lower target" recovery action: asks the server for an easier target.
function easeIt(x) {
  return run(function() {
    return api("/habits/" + x.id + "/ease", { method: "POST" }).then(function(p) {
      apply(p);
      var n = byId(x.id);
      if (n) toast("Target lowered to " + n.t + " " + n.u);
      refresh("insights");
    });
  });
}

// ======================================================================
// AUTH: sign up, sign in, sign out, live connection
// ======================================================================
// Sign in or create an account, store the JWT, then start the app.
function auth(mode) {
  var em = $("#ae") ? $("#ae").value.trim() : "", pw = $("#ap") ? $("#ap").value : "", nm = $("#an") ? $("#an").value.trim() : "";
  if (mode == "signup" && !nm) {
    S.err = "Enter your name";
    render();
    return;
  }
  S.err = "";
  var btn = $('[data-a="' + mode + '"]');
  if (btn) {
    btn.disabled = true;
  }
  api("/auth/" + (mode == "login" ? "login" : "register"), { method: "POST", body: mode == "login" ? { email: em, password: pw } : { name: nm, email: em, password: pw } }).then(function(r) {
    setToken(r.token);
    start(r.user);
  }, function(e) {
    S.err = e.message;
    render();
    var f = $("#ae");
    if (f) {
      f.value = em;
      if ($("#an")) $("#an").value = nm;
    }
  });
}
// Open the Socket.IO connection and handle live events (nudges, chat, feed, challenges).
function connect() {
  if (sock || !U) return;
  sock = io({ auth: { token: getToken() } });
  sock.on("notify", function(n) {
    toast((n.type == "nudge" ? "👋 " : "🔔 ") + n.text);
    loadNotes();
  });
  sock.on("circle:update", function() {
    api("/circle").then(function(c) {
      setCircle(c);
      if (S.tab == "circle" || S.tab == "chal") render();
    }).catch(function() {
    });
  });
  sock.on("circle:activity", function() {
    if (S.tab == "circle" && S.ct == "feed") api("/circle/feed").then(function(f) {
      S.feed = f.items;
      render();
    }).catch(function() {
    });
  });
  sock.on("chat:msg", function(m) {
    if (!S.chat.some(function(x) {
      return x.id == m.id;
    })) S.chat.push(m);
    if (S.tab == "circle" && S.ct == "chat") render();
    else if (U && m.user.id != U.id) toast("💬 " + m.user.name + ": " + m.text.slice(0, 40));
  });
  sock.on("challenge:update", function() {
    if (S.tab == "chal") api("/challenges").then(function(x) {
      S.chal = x.challenges;
      render();
    }).catch(function() {
    });
  });
  sock.on("circle:removed", function() {
    S.circle = null;
    S.mem = [];
    S.all = [];
    S.feed = [];
    S.chat = [];
    S.chal = [];
    render();
  });
  sock.on("connect_error", function() {
  });
}
// Called after login: show Today and load everything.
function start(u) {
  U = u;
  S.tab = "today";
  S.pf = null;
  connect();
  render();
  loadAll().then(goApp);
  goApp();
}
// Clear the token and all local state, close the socket.
function signout() {
  setToken(null);
  U = null;
  S.habits = [];
  S.mem = [];
  S.all = [];
  S.circle = null;
  S.stats = null;
  S.modal = null;
  S.coach = null;
  S.sug = null;
  if (sock) {
    sock.close();
    sock = null;
  }
  S.err = "";
  render();
}
// HTML for the sign in / create account card.
function authView() {
  var reg = S.am == "register";
  return '<div class="top"><div class="logo">Streak<i>Circle</i></div></div><div class="card"><h3>' + (reg ? "Create your account" : "Welcome back") + '</h3><p class="sub">' + (reg ? "Pick a password with 8 or more characters." : "Sign in to keep your streaks and circle.") + '</p><div class="ctl col" style="margin-top:10px">' + (reg ? '<input id="an" placeholder="Your name" aria-label="Your name" autocomplete="name" maxlength="40">' : "") + '<input id="ae" type="email" placeholder="Email" aria-label="Email" autocomplete="email"><input id="ap" type="password" placeholder="Password" aria-label="Password" autocomplete="' + (reg ? "new-password" : "current-password") + '"><div class="err" role="alert">' + esc(S.err) + '</div><button class="pri" data-a="' + (reg ? "signup" : "login") + '">' + (reg ? "Create account" : "Sign in") + '</button><button class="link" data-a="swap">' + (reg ? "Have an account? Sign in" : "New here? Create an account") + "</button></div></div>";
}
addEventListener("keydown", function(e) {
  if (e.key == "Escape" && S.modal) {
    S.modal = null;
    render();
    return;
  }
  if (e.key != "Enter") return;
  if (!U && e.target.closest && e.target.closest("#app input")) auth(S.am == "register" ? "signup" : "login");
  else if (e.target.id == "ci") sendChat();
  else if (e.target.id == "cn" && $('[data-a="mk"]')) $('[data-a="mk"]').click();
  else if (e.target.id == "cj" && $('[data-a="jn"]')) $('[data-a="jn"]').click();
});
addEventListener("sc:logout", function() {
  if (U) signout();
});
addEventListener("focus", function() {
  loadAll();
});

// ======================================================================
// FORM INPUT BINDING: inputs with data-m="path" write straight into S
// ======================================================================
// Set S.a.b.c = value from a "a.b.c" string.
function setPath(p, v) {
  var k = p.split("."), o = S;
  for (var i = 0; i < k.length - 1; i++) {
    if (!o[k[i]]) o[k[i]] = {};
    o = o[k[i]];
  }
  o[k[k.length - 1]] = v;
}
// Input/change handler: copies the field value into state (re-renders if data-r is set).
function bind(e) {
  var m = e.target.dataset && e.target.dataset.m;
  if (!m) return;
  setPath(m, e.target.value);
  if (e.target.dataset.r && e.type == "input") render();
}
document.addEventListener("input", bind);
document.addEventListener("change", bind);

// ======================================================================
// REMINDERS: in-app toast + optional browser notification
// ======================================================================
// "07:30" -> minutes since midnight.
function mins(t) {
  var p = t.split(":");
  return +p[0] * 60 + +p[1];
}
// Reminders already shown today (stored so they do not repeat).
function fired() {
  try {
    var j = JSON.parse(store("sc_fired") || "null");
    return j && j.d == dayKey() ? j : { d: dayKey(), ids: [] };
  } catch (e) {
    return { d: dayKey(), ids: [] };
  }
}
// Every 30s: show a reminder for any unfinished habit whose time has passed (within 2 hours).
function remTick() {
  if (!U || !S.habits.length) return;
  var n = new Date(), now = n.getHours() * 60 + n.getMinutes(), f = fired(), ch = false;
  S.habits.forEach(function(h) {
    if (!h.rem || ok(h) || f.ids.indexOf(h.id) > -1) return;
    var d = now - mins(h.rem);
    if (d < 0 || d > 120) return;
    f.ids.push(h.id);
    ch = true;
    toast("⏰ Time for " + h.n);
    if (S.remOn && window.Notification && Notification.permission == "granted") {
      try {
        new Notification("StreakCircle", { body: "Time for " + h.ic + " " + h.n });
      } catch (e) {
      }
    }
  });
  if (ch) store("sc_fired", JSON.stringify(f));
}
setInterval(remTick, 3e4);

// ======================================================================
// VIEW HELPERS: small HTML builders reused by the screens
// ======================================================================
// HTML for a <select> bound to state path m.
function sel(m, opts, cur) {
  return '<select data-m="' + m + '">' + opts.map(function(o) {
    return '<option value="' + esc(o[0]) + '"' + (String(o[0]) == String(cur) ? " selected" : "") + ">" + esc(o[1]) + "</option>";
  }).join("") + "</select>";
}
// Bar chart (percent per label) used by Insights and circle analytics.
function bars(a) {
  return '<div class="bars">' + a.map(function(d, i) {
    return '<div class="col"><b>' + d.pct + '%</b><div class="tr"><i style="height:' + Math.max(3, d.pct) + "%;animation-delay:" + i * 40 + 'ms"></i></div><span>' + esc(d.label) + "</span></div>";
  }).join("") + "</div>";
}
// Labelled progress bar row.
function meter(label, val, color, extra) {
  return '<div class="sub" style="display:flex;justify-content:space-between"><span>' + label + "</span><span>" + (extra == null ? val + "%" : extra) + '</span></div><div class="lb"><span style="width:' + Math.min(100, val) + "%;background:" + (color || "var(--pri)") + '"></span></div><div style="height:8px"></div>';
}
// Page header: title, level, freezes and the notification bell.
function topbar(title) {
  var nu = S.notes.unread || 0;
  return '<div class="top"><div class="logo">' + title + '</div><div class="chips"><span class="chip">Lv ' + S.level + '</span><span class="chip">🧊 ' + S.freeze + '</span><button class="chip bell" data-a="bell" aria-label="Notifications">🔔' + (nu ? "<em>" + (nu > 9 ? "9+" : nu) + "</em>" : "") + "</button></div></div>";
}

// ======================================================================
// TODAY SCREEN: habit list, search/filter, suggestions
// ======================================================================
// Blank values for the new-habit form.
function newForm() {
  return { n: "", ic: "⭐", cat: "other", u: "times", t: 10, fq: "daily", pw: 3, pri: "medium", rem: "" };
}
// Apply search + filter chip, then sort by priority.
function filt() {
  var q = S.q.trim().toLowerCase();
  return S.habits.filter(function(h) {
    if (q && h.n.toLowerCase().indexOf(q) < 0) return false;
    if (S.cat == "pending") return !ok(h);
    if (S.cat == "done") return ok(h);
    if (S.cat != "all" && h.cat != S.cat) return false;
    return true;
  }).sort(function(a, b) {
    return (PRI[b.pri] || 2) - (PRI[a.pri] || 2);
  });
}
// One habit card: progress, +/- buttons, tags, history/edit/delete, recovery notes.
function habitCard(x) {
  var d = x.done, y = x.my && !x.skip;
  var h = '<div class="card"><div class="row"><div class="ico">' + esc(x.ic) + '</div><div class="grow"><div class="nm">' + esc(x.n) + '</div><div class="sub">Target ' + x.t + " " + x.u + " · " + rate(x) + '% this month</div></div><div class="flame">🔥 ' + streak(x) + (x.fq == "weekly" ? "w" : "") + "</div></div>";
  h += '<div class="tags"><span class="tg">' + (CAT[x.cat] || CAT.other) + '</span><span class="tg p-' + x.pri + '">' + x.pri + '</span><span class="tg">' + (x.fq == "weekly" ? "📅 " + x.wd + "/" + x.pw + " this week" : "Daily") + "</span>" + (x.rem ? '<span class="tg">⏰ ' + esc(x.rem) + "</span>" : "") + '<span class="grow"></span><button class="ib" data-a="cal" data-i="' + x.id + '" aria-label="History calendar" title="History">📅</button><button class="ib" data-a="edit" data-i="' + x.id + '" aria-label="Edit habit" title="Edit">✎</button><button class="ib" data-a="del" data-i="' + x.id + '" aria-label="Delete habit" title="Delete">✕</button></div>';
  h += '<div class="bar ' + (d ? "ok" : "") + '"><span style="width:' + Math.min(x.v / x.t * 100, 100) + '%"></span></div>';
  h += '<div class="ctl"><button data-a="dec" data-i="' + x.id + '" aria-label="Decrease">−</button><span class="val">' + x.v + " / " + x.t + '</span><button data-a="inc" data-i="' + x.id + '" aria-label="Increase">+</button><span class="grow"></span><button class="' + (d ? "" : "pri") + '" data-a="full" data-i="' + x.id + '">' + (d ? "Done ✓" : "Mark complete") + "</button></div>";
  if (y && !d) h += '<div class="note">You missed yesterday. What got in the way?<div class="ctl">' + Object.keys(S.reasons).map(function(r) {
    return '<button data-a="why" data-i="' + x.id + '" data-r="' + r + '">' + r + "</button>";
  }).join("") + (S.freeze ? '<button class="okb" data-a="frz" data-i="' + x.id + '">🧊 Use freeze</button>' : "") + "</div></div>";
  if (x.miss >= 3) h += '<div class="note">Rough patch on ' + esc(x.n.toLowerCase()) + '. A lighter target keeps the streak alive.<div class="ctl"><button class="pri" data-a="ease" data-i="' + x.id + '">Lower to ' + Math.max(x.st, Math.round(x.t * 0.6 / x.st) * x.st) + " " + x.u + "</button></div></div>";
  return h + "</div>";
}
// The Today screen.
function today() {
  var h = topbar("Streak<i>Circle</i>");
  h += '<div class="hero">' + ringSVG(prog(), Math.round(prog() * 100) + "%") + "<div><h2>" + (allDone() ? "Circle closed for today." : "Close your ring today.") + "</h2><p>" + (allDone() ? "Your circle can see you showed up." : S.habits.filter(function(x) {
    return !ok(x);
  }).length + " habits left. Your circle is watching, kindly.") + "</p></div></div>";
  var cats = [["all", "All"], ["pending", "Pending"], ["done", "Done"]].concat(Object.keys(CAT).filter(function(c) {
    return S.habits.some(function(x) {
      return x.cat == c;
    });
  }).map(function(c) {
    return [c, CAT[c]];
  }));
  h += '<div class="card"><div class="ctl"><input id="qs" data-m="q" data-r="1" value="' + esc(S.q) + '" placeholder="Search habits" aria-label="Search habits" style="flex:1" type="search"><button class="pri" data-a="newh">＋ New habit</button></div><div class="chipsrow">' + cats.map(function(c) {
    return '<button class="fc ' + (S.cat == c[0] ? "on" : "") + '" data-a="fcat" data-v="' + c[0] + '">' + c[1] + "</button>";
  }).join("") + "</div></div>";
  var L = filt();
  if (!S.habits.length) h += '<div class="card"><h3>No habits yet</h3><p class="sub">Add your first habit. Start small.</p><div class="ctl" style="margin-top:10px"><button class="pri" data-a="newh">＋ New habit</button><button data-a="sug">✨ Suggest habits</button></div></div>';
  else if (!L.length) h += '<div class="card"><p class="sub">No habits match this filter.</p></div>';
  L.forEach(function(x) {
    h += habitCard(x);
  });
  h += '<div class="card"><h3>Need ideas?</h3><p class="sub">Tick can suggest small habits that fit what you already do.</p><div class="ctl" style="margin-top:10px"><button data-a="sug"' + (S.busy == "sug" ? " disabled" : "") + ">" + (S.busy == "sug" ? "Thinking…" : "✨ Suggest habits") + "</button></div>";
  if (S.sug) h += S.sug.suggestions.map(function(s, i) {
    return '<div class="mem"><div class="ico">' + esc(s.icon) + '</div><div class="grow"><div class="nm">' + esc(s.name) + '</div><div class="sub">' + s.target + " " + s.unit + " · " + esc(s.why) + '</div></div><button class="pri" data-a="addsug" data-i="' + i + '">Add</button></div>';
  }).join("");
  return h + "</div>";
}

// ======================================================================
// DIALOGS (modals): habit form, calendar, notifications, member progress
// ======================================================================
// New / edit habit dialog.
function formModal() {
  var f = S.form;
  return '<div class="md" role="dialog" aria-modal="true"><div class="mh"><h3>' + (f.id ? "Edit habit" : "New habit") + '</h3><button data-a="mx" aria-label="Close">✕</button></div><div class="fg"><label>Name</label><input id="nn" data-m="form.n" value="' + esc(f.n) + '" maxlength="40" placeholder="e.g. Morning walk" aria-label="Habit name"></div><div class="fg"><label>Icon</label><div class="pk">' + ICONS.map(function(i) {
    return '<button class="' + (f.ic == i ? "on" : "") + '" data-a="fset" data-k="ic" data-v="' + i + '">' + i + "</button>";
  }).join("") + '</div></div><div class="fg2"><div class="fg"><label>Category</label>' + sel("form.cat", Object.keys(CAT).map(function(c) {
    return [c, CAT[c]];
  }), f.cat) + '</div><div class="fg"><label>Priority</label><div class="seg">' + ["low", "medium", "high"].map(function(p) {
    return '<button class="' + (f.pri == p ? "on" : "") + '" data-a="fset" data-k="pri" data-v="' + p + '">' + p + "</button>";
  }).join("") + '</div></div></div><div class="fg2"><div class="fg"><label>Target</label><input type="number" min="1" max="100000" data-m="form.t" value="' + esc(f.t) + '" aria-label="Target"></div><div class="fg"><label>Unit</label>' + sel("form.u", UNITS.map(function(u) {
    return [u, u];
  }), f.u) + '</div></div><div class="fg"><label>Frequency</label><div class="seg">' + ["daily", "weekly"].map(function(p) {
    return '<button class="' + (f.fq == p ? "on" : "") + '" data-a="fset" data-k="fq" data-v="' + p + '">' + p + "</button>";
  }).join("") + "</div></div>" + (f.fq == "weekly" ? '<div class="fg"><label>Goal</label>' + sel("form.pw", [1, 2, 3, 4, 5, 6].map(function(n) {
    return [n, n + (n == 1 ? " day" : " days") + " a week"];
  }), f.pw) + "</div>" : "") + '<div class="fg"><label>Reminder</label><div class="ctl"><input type="time" data-m="form.rem" value="' + esc(f.rem) + '" aria-label="Reminder time" style="flex:1"><button data-a="fset" data-k="rem" data-v="">Clear</button></div></div><div class="ctl" style="margin-top:14px"><span class="grow"></span><button data-a="mx">Cancel</button><button class="pri" data-a="fsave">' + (f.id ? "Save changes" : "Add habit") + "</button></div></div>";
}
// Month calendar for one habit: done / missed / frozen days; last 7 days are tappable to fix.
function calModal() {
  var c = S.cal;
  if (!c) return "";
  var ym = c.ym, d0 = new Date(ym + "-01T00:00:00Z"), lead = (d0.getUTCDay() + 6) % 7, dim = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 0)).getUTCDate(), td = c.today, cr = c.habit ? c.habit.created : "0000-00-00", lim = addD(td, -7);
  var okc = 0, msc = 0, cells = ["M", "T", "W", "T", "F", "S", "S"].map(function(x2) {
    return "<b>" + x2 + "</b>";
  }).join("");
  for (var i = 0; i < lead; i++) cells += '<i class="cd e"></i>';
  for (var n = 1; n <= dim; n++) {
    var d = ym + "-" + pad(n), x = c.days[d], cl = "cd";
    if (d > td) cl += " fut";
    else if (d < cr) cl += " dis";
    else if (x && x.d) {
      cl += " ok";
      okc++;
    } else if (x && x.f) {
      cl += " fz";
    } else if (d < td) {
      cl += " ms";
      msc++;
    }
    if (d == td) cl += " td";
    var ed = d <= td && d >= cr && d >= lim;
    cells += ed ? '<button class="' + cl + '" data-a="cday" data-d="' + d + '" aria-label="' + d + '">' + n + "</button>" : '<i class="' + cl + '">' + n + "</i>";
  }
  var ml = d0.toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
  return '<div class="md" role="dialog" aria-modal="true"><div class="mh"><h3>' + esc(c.ic) + " " + esc(c.name) + '</h3><button data-a="mx" aria-label="Close">✕</button></div><div class="ctl" style="justify-content:space-between"><button data-a="cmo" data-d="-1" aria-label="Previous month">‹</button><b>' + ml + '</b><button data-a="cmo" data-d="1" aria-label="Next month">›</button></div><div class="cal">' + cells + '</div><div class="lg2"><span><i class="cd ok"></i>Done ' + okc + '</span><span><i class="cd ms"></i>Missed ' + msc + '</span><span><i class="cd fz"></i>Freeze</span></div><p class="sub" style="margin-top:8px">Tap any of the last 7 days to fix a check-in.</p></div>';
}
// Notifications dialog.
function notesModal() {
  var n = S.notes.items || [];
  return '<div class="md" role="dialog" aria-modal="true"><div class="mh"><h3>Notifications</h3><button data-a="mx" aria-label="Close">✕</button></div>' + (n.length ? n.map(function(x) {
    return '<div class="mem"><div class="grow"><div class="nm" style="font-size:15px">' + esc(x.text) + '</div><div class="sub">' + ago(x.at) + " ago</div></div></div>";
  }).join("") : '<p class="sub">Nothing yet. Nudges, reactions and circle news show up here.</p>') + "</div>";
}
// A circle member's habit progress dialog.
function memberModal() {
  var m = S.mview;
  if (!m) return "";
  if (m.loading) return '<div class="md"><div class="mh"><h3>Loading…</h3><button data-a="mx" aria-label="Close">✕</button></div></div>';
  return '<div class="md" role="dialog" aria-modal="true"><div class="mh"><div class="row">' + av({ id: m.member.id, n: m.member.name, e: m.member.emoji }) + '<div><h3 style="margin:0">' + esc(m.member.name) + '</h3><div class="sub">' + esc(m.member.bio || "") + '</div></div></div><button data-a="mx" aria-label="Close">✕</button></div><div class="stats"><div><b>' + m.cons + "%</b><span>consistency</span></div><div><b>" + m.streak + "</b><span>best streak</span></div><div><b>" + (m.done ? "Yes" : "No") + "</b><span>ring closed</span></div></div>" + (m.habits.length ? m.habits.map(function(h) {
    return '<div class="card" style="margin-bottom:8px;padding:12px"><div class="row"><div class="ico" style="width:38px;height:38px;font-size:19px">' + esc(h.icon) + '</div><div class="grow"><div class="nm" style="font-size:15px">' + esc(h.name) + '</div><div class="sub">' + (h.frequency == "weekly" ? h.weekDone + "/" + h.perWeek + " this week" : h.value + " / " + h.target + " " + h.unit + " today") + " · " + h.rate + '%</div></div><div class="flame">🔥 ' + h.streak + '</div></div><div class="dots">' + h.heat.map(function(v) {
      return '<i class="' + (v ? "on" : "") + '"></i>';
    }).join("") + "</div></div>";
  }).join("") : '<p class="sub">No habits shared yet.</p>') + "</div>";
}

// ======================================================================
// CIRCLE SCREEN: members, analytics, feed, chat
// ======================================================================
// The Circle screen (create/join form, or overview with Overview/Feed/Chat sub-tabs).
function circle() {
  if (!S.circle) return topbar("My <i>circle</i>") + '<div class="card"><h3>Create a circle</h3><p class="sub">Private group for up to 12 people. You get a code to share.</p><div class="ctl" style="margin-top:10px"><input id="cn" placeholder="Circle name" style="flex:1" aria-label="Circle name" maxlength="30"><button class="pri" data-a="mk">Create</button></div></div><div class="card"><h3>Join with a code</h3><div class="ctl"><input id="cj" placeholder="Enter code" style="flex:1" aria-label="Circle code" maxlength="8"><button class="pri" data-a="jn">Join</button></div></div>';
  var c = S.circle, h = topbar("My <i>circle</i>") + '<div class="ctl" style="margin-bottom:12px"><span class="chip">' + esc(c.name) + '</span><span class="grow"></span><div class="seg">' + [["ov", "Overview"], ["feed", "Feed"], ["chat", "Chat"]].map(function(t) {
    return '<button class="' + (S.ct == t[0] ? "on" : "") + '" data-a="ct" data-v="' + t[0] + '">' + t[1] + "</button>";
  }).join("") + "</div></div>";
  if (S.ct == "feed") return h + feedView();
  if (S.ct == "chat") return h + chatView();
  var n = S.mem.filter(function(m) {
    return m.done;
  }).length + (allDone() ? 1 : 0), tot = S.mem.length + 1, k = S.mem.length || 1;
  h += '<div class="card"><div class="orbit"><div class="spin">';
  S.mem.forEach(function(m, i) {
    var a = i * 360 / k;
    h += '<div class="m" style="transform:rotate(' + a + "deg) translateX(105px) rotate(-" + a + 'deg)"><div class="av ' + (m.done ? "done" : "") + '" style="background:' + m.c + '">' + esc(m.e || first(m.n)) + "</div></div>";
  });
  h += "</div>" + ringSVG(n / tot, "<div>" + n + "/" + tot + "<br><small>checked in</small></div>") + '</div><div class="ctl" style="justify-content:center">Invite code <b>' + esc(c.code) + '</b><button data-a="cc">Copy</button><button data-a="lv">Leave</button></div></div>';
  var s = S.cs;
  if (s) h += '<div class="card"><h3>Circle analytics</h3><div class="stats"><div><b>' + s.avg + "%</b><span>avg consistency</span></div><div><b>" + s.closedToday + "/" + s.members + "</b><span>closed today</span></div><div><b>" + s.checkinsWeek + "</b><span>check-ins / week</span></div></div>" + bars(s.week) + (s.top ? '<p class="sub" style="margin-top:10px">🏆 Most consistent: <b>' + esc(s.top.name) + "</b> (" + s.top.cons + "%) · 🔥 Longest streak: <b>" + esc(s.longest.name) + "</b> (" + s.longest.streak + ")</p>" : "") + "</div>";
  h += '<div class="card"><h3>Members</h3>';
  S.all.forEach(function(m) {
    var u = 'data-u="' + esc(m.id) + '" data-n="' + esc(m.name) + '"';
    h += '<div class="mem">' + av({ id: m.id, n: m.name, e: m.emoji }) + '<div class="grow"><div class="nm">' + esc(m.name) + (m.me ? ' <span class="tg">you</span>' : "") + (m.owner ? ' <span class="tg">owner</span>' : "") + '</div><div class="sub">' + (m.done ? "Checked in today" : "Not yet today") + " · 🔥 " + m.streak + " · " + m.cons + "% · " + m.points + ' pts</div></div><button class="ib" data-a="mview" ' + u + ' aria-label="View progress" title="View progress">👁</button>' + (m.me ? "" : (m.done ? '<button data-a="react" data-e="👏" ' + u + '>👏</button><button data-a="react" data-e="🔥" ' + u + ">🔥</button>" : '<button class="pri" data-a="react" data-e="👋" ' + u + ">Nudge</button>") + (c.isOwner ? '<button class="ib" data-a="mrm" ' + u + ' aria-label="Remove member" title="Remove">✕</button>' : "")) + "</div>";
  });
  if (S.all.length < 2) h += '<p class="sub" style="margin-top:8px">Share the code. Friends appear here once they join.</p>';
  return h + "</div>";
}
// Activity feed with emoji reactions.
function feedView() {
  var h = '<div class="card"><h3>Activity</h3>';
  if (!S.feed.length) return h + '<p class="sub">Nothing yet. Complete a habit and it shows up here.</p></div>';
  return h + S.feed.map(function(a) {
    return '<div class="mem fi">' + av(a.user ? { id: a.user.id, n: a.user.name, e: a.user.emoji } : { n: "?" }) + '<div class="grow"><div class="ft">' + esc(a.text) + '</div><div class="sub">' + ago(a.at) + ' ago</div><div class="rx">' + ["👏", "🔥", "💪", "❤️"].map(function(e) {
      var c = a.counts[e] || 0;
      return '<button class="' + (a.mine.indexOf(e) > -1 ? "on" : "") + '" data-a="frx" data-i="' + a.id + '" data-e="' + e + '">' + e + (c ? " " + c : "") + "</button>";
    }).join("") + "</div></div></div>";
  }).join("") + "</div>";
}
// Circle chat.
function chatView() {
  var h = '<div class="card"><h3>Circle chat</h3><div id="cl" class="cl">';
  if (!S.chat.length) h += '<p class="sub">Say hi to your circle 👋</p>';
  S.chat.forEach(function(m) {
    var me2 = U && m.user.id == U.id;
    h += '<div class="cm ' + (me2 ? "me" : "") + '"><div class="who">' + (me2 ? "You" : esc(m.user.name)) + " · " + ago(m.at) + '</div><div class="cb">' + esc(m.text) + "</div></div>";
  });
  return h + '</div><div class="ctl" style="margin-top:10px"><input id="ci" data-m="msg" value="' + esc(S.msg) + '" placeholder="Message your circle" maxlength="300" style="flex:1" aria-label="Message"><button class="pri" data-a="csend">Send</button></div></div>';
}
// Send a chat message to the circle.
function sendChat() {
  var t = (S.msg || "").trim();
  if (!t) return;
  S.msg = "";
  var i = $("#ci");
  if (i) i.value = "";
  run(function() {
    return api("/circle/chat", { method: "POST", body: { text: t } }).then(function(m) {
      if (!S.chat.some(function(x) {
        return x.id == m.id;
      })) S.chat.push(m);
      render();
    });
  });
}

// ======================================================================
// SPRINT SCREEN: leaderboard and challenges
// ======================================================================
// Format a leaderboard value for the chosen ranking mode.
function metVal(m, k) {
  return k == "consistency" ? m.cons + "%" : k == "streak" ? "🔥 " + m.str : m.pts + " pts";
}
// The Sprint screen.
function chal() {
  var y = Math.round(S.habits.reduce(function(a, h2) {
    return a + rate(h2);
  }, 0) / (S.habits.length || 1)), best = Math.max.apply(null, [0].concat(S.habits.map(streak)));
  var me2 = S.all.filter(function(m) {
    return m.me;
  })[0];
  var L = S.mem.concat([{ id: "me", n: "You", c: "#fff", cons: me2 ? me2.cons : y, str: me2 ? me2.streak : best, pts: me2 ? me2.points : S.xp }]);
  var k = S.lm, key = k == "consistency" ? "cons" : k == "streak" ? "str" : "pts";
  L.sort(function(a, b) {
    return b[key] - a[key] || b.pts - a.pts;
  });
  var mx = Math.max.apply(null, L.map(function(m) {
    return m[key];
  }).concat([1]));
  var h = topbar("The <i>sprint</i>") + '<div class="card"><h3>Leaderboard</h3><p class="sub">' + (S.circle ? esc(S.circle.name) + " · " : "Solo · ") + 'last 28 days. Pick how to rank.</p><div class="seg" style="margin-top:10px">' + Object.keys(MET).map(function(m) {
    return '<button class="' + (k == m ? "on" : "") + '" data-a="lm" data-v="' + m + '">' + MET[m] + "</button>";
  }).join("") + '</div></div><div class="card">';
  L.forEach(function(m, i) {
    var w = key == "cons" ? m.cons : m[key] / mx * 100;
    h += '<div class="mem"><div class="rank">' + (["🥇", "🥈", "🥉"][i] || i + 1) + '</div><div class="grow"><div class="row"><div class="nm grow">' + esc(m.n) + "</div><b>" + metVal(m, k) + '</b></div><div class="lb"><span style="width:' + w + "%;background:" + m.c + '"></span></div></div></div>';
  });
  h += "</div>";
  if (!S.circle) return h + '<div class="card"><h3>Group challenges</h3><p class="sub">Join or create a circle to run challenges with friends.</p><div class="ctl" style="margin-top:10px"><button class="pri" data-g="circle">Go to circle</button></div></div>';
  h += '<div class="card"><div class="row"><h3 class="grow" style="margin:0">Challenges</h3><button class="pri" data-a="cnew">' + (S.cf ? "Close" : "＋ New") + "</button></div>";
  if (S.cf) h += '<div class="note"><div class="ctl col"><input data-m="cf.name" value="' + esc(S.cf.name) + '" placeholder="Challenge name" maxlength="40" aria-label="Challenge name"><div class="fg2"><div class="fg"><label>Rank by</label>' + sel("cf.metric", Object.keys(MET).map(function(m) {
    return [m, MET[m]];
  }), S.cf.metric) + '</div><div class="fg"><label>Duration</label>' + sel("cf.days", [7, 14, 21, 30, 60, 90].map(function(n) {
    return [n, n + " days"];
  }), S.cf.days) + '</div></div><button class="pri" data-a="cmk">Start challenge</button></div></div>';
  h += "</div>";
  if (!S.chal.length) h += '<div class="card"><p class="sub">No challenges yet. Start one and invite your circle.</p></div>';
  S.chal.forEach(function(c) {
    var pct = Math.round(Math.min(c.elapsed, c.total) / c.total * 100), st = c.status == "active" ? c.daysLeft + " days left" : c.status == "upcoming" ? "Starts " + c.start : "Ended";
    h += '<div class="card"><div class="row"><div class="grow"><div class="nm">' + esc(c.name) + '</div><div class="sub">' + MET[c.metric] + " · " + c.total + " days · " + st + "</div></div>" + (c.status != "ended" ? '<button class="' + (c.joined ? "" : "pri") + '" data-a="' + (c.joined ? "cleave" : "cjoin") + '" data-i="' + c.id + '">' + (c.joined ? "Leave" : "Join") + "</button>" : "") + (c.mine || S.circle.isOwner ? '<button class="ib" data-a="cdel" data-i="' + c.id + '" aria-label="Delete challenge">✕</button>' : "") + '</div><div class="bar"><span style="width:' + pct + '%"></span></div>';
    if (!c.board.length) h += '<p class="sub">No one has joined yet.</p>';
    c.board.slice(0, 5).forEach(function(r, i) {
      var v = c.metric == "consistency" ? r.consistency + "%" : c.metric == "streak" ? "🔥 " + r.streak : r.points + " pts";
      h += '<div class="mem"><div class="rank" style="font-size:18px">' + (["🥇", "🥈", "🥉"][i] || i + 1) + '</div><div class="grow nm" style="font-size:15px">' + esc(r.name) + (U && r.id == U.id ? ' <span class="tg">you</span>' : "") + "</div><b>" + v + "</b></div>";
    });
    h += "</div>";
  });
  return h;
}

// ======================================================================
// INSIGHTS SCREEN: stats, charts, missed-habit insights, AI coach
// ======================================================================
// The Insights screen.
function insights() {
  var s = S.stats, h = topbar("<i>Insights</i>");
  if (!s) return h + '<div class="card"><p class="sub">Loading your stats…</p></div>';
  h += '<div class="stats"><div><b>' + s.habits + "</b><span>habits</span></div><div><b>" + s.doneToday + "/" + s.habits + "</b><span>done today</span></div><div><b>" + s.avg + "%</b><span>completion</span></div><div><b>" + s.best + "</b><span>current streak</span></div><div><b>" + s.longest + "</b><span>longest streak</span></div><div><b>" + s.total + "</b><span>check-ins</span></div></div>";
  h += '<div class="card"><div class="row"><h3 class="grow" style="margin:0">Progress</h3><div class="seg">' + [["w", "Week"], ["m", "Month"]].map(function(t) {
    return '<button class="' + (S.rng == t[0] ? "on" : "") + '" data-a="rng" data-v="' + t[0] + '">' + t[1] + "</button>";
  }).join("") + '</div></div><div style="height:12px"></div>' + bars(S.rng == "w" ? s.week : s.weeks) + "</div>";
  h += '<div class="card"><h3>Last 28 days</h3><div class="heat">';
  s.heat.forEach(function(c, d) {
    h += '<i style="opacity:' + (0.12 + c * 0.88) + ";animation-delay:" + d * 18 + 'ms" title="Day ' + (d + 1) + '"></i>';
  });
  h += "</div></div>";
  var i = s.insights || {}, tot = Object.keys(s.reasons).reduce(function(a, r) {
    return a + s.reasons[r];
  }, 0);
  h += '<div class="card"><h3>Missed-habit insights</h3>';
  if (!i.missedTotal && !tot) h += '<p class="sub">No misses logged. Keep it up.</p>';
  else {
    h += '<div class="tags">' + (i.worstDay ? '<span class="tg">📉 Most misses: ' + i.worstDay + "</span>" : "") + (i.weakest ? '<span class="tg">' + esc(i.weakest.icon) + " Weakest: " + esc(i.weakest.name) + " (" + i.weakest.rate + "%)</span>" : "") + (i.topReason ? '<span class="tg">Top reason: ' + i.topReason + "</span>" : "") + '<span class="tg">' + i.missedTotal + ' misses / 28 days</span></div><div style="height:10px"></div>';
    var mx = Math.max.apply(null, Object.keys(s.reasons).map(function(k) {
      return s.reasons[k];
    }).concat([1]));
    Object.keys(s.reasons).forEach(function(r) {
      h += meter(r, s.reasons[r] / mx * 100, "var(--hot)", s.reasons[r]);
    });
  }
  h += "</div>";
  if (s.recovery && s.recovery.length) {
    h += '<div class="card"><h3>Recovery plan</h3><p class="sub">These habits are slipping. A lighter target makes it easier to restart.</p>';
    s.recovery.forEach(function(r) {
      h += '<div class="mem"><div class="ico">' + esc(r.icon) + '</div><div class="grow"><div class="nm" style="font-size:15px">' + esc(r.name) + '</div><div class="sub">Missed ' + r.missed7 + " of last 7 days · " + r.rate + "%</div></div>" + (r.canEase ? '<button class="pri" data-a="ease" data-i="' + r.id + '">' + r.target + " → " + r.easier + " " + r.unit + "</button>" : '<span class="sub">Already minimal</span>') + "</div>";
    });
    h += "</div>";
  }
  h += '<div class="card"><h3>By habit</h3>';
  if (!s.byHabit.length) h += '<p class="sub">Add a habit to see performance.</p>';
  s.byHabit.forEach(function(x) {
    h += meter(esc(x.icon) + " " + esc(x.name) + ' <span class="sub">· 🔥 ' + x.streak + " · best " + x.best + " · " + x.total + " check-ins</span>", x.rate);
  });
  h += '</div><div class="card"><h3>AI coach</h3><p class="sub">Personalised tips from your last 28 days.</p><div class="ctl" style="margin-top:10px"><button class="pri" data-a="coach"' + (S.busy == "coach" ? " disabled" : "") + ">" + (S.busy == "coach" ? "Thinking…" : "✨ Coach me") + "</button></div>";
  if (S.coach) h += '<div class="note">' + S.coach.tips.map(function(t) {
    return '<div style="margin-bottom:6px">• ' + esc(t) + "</div>";
  }).join("") + (S.coach.motivation ? '<div style="margin-top:8px"><b>' + esc(S.coach.motivation) + "</b></div>" : "") + (S.coach.ai ? "" : '<div class="sub" style="margin-top:6px">Basic coach. Add GROQ_API_KEY on the server for full AI coaching.</div>') + "</div>";
  return h + "</div>";
}

// ======================================================================
// YOU SCREEN: profile, theme, reminders, password, account
// ======================================================================
// The You screen.
function me() {
  if (!S.pf) S.pf = { n: U.name, b: U.bio || "", e: U.emoji || "" };
  var p = S.pf, h = topbar("<i>You</i>");
  h += '<div class="card"><h3>Profile</h3><div class="pk" style="margin-bottom:10px">' + AVATARS.map(function(e) {
    return '<button class="' + (p.e == e ? "on" : "") + '" data-a="pem" data-v="' + e + '">' + e + "</button>";
  }).join("") + '<button data-a="pem" data-v="">Aa</button></div><div class="ctl col"><input data-m="pf.n" value="' + esc(p.n) + '" maxlength="40" placeholder="Name" aria-label="Name"><input data-m="pf.b" value="' + esc(p.b) + '" maxlength="120" placeholder="Short bio" aria-label="Bio"><div class="sub">' + esc(U.email) + (U.joined ? " · joined " + new Date(U.joined).toLocaleDateString() : "") + '</div><button class="pri" data-a="psave">Save profile</button></div></div>';
  h += '<div class="card"><h3>Appearance</h3><div class="seg">' + ["dark", "light"].map(function(t) {
    return '<button class="' + (S.theme == t ? "on" : "") + '" data-a="theme" data-v="' + t + '">' + (t == "dark" ? "🌙 Dark" : "☀️ Light") + "</button>";
  }).join("") + "</div></div>";
  h += '<div class="card"><h3>Reminders</h3><p class="sub">Set a time on any habit and Tick reminds you while StreakCircle is open.</p><div class="ctl" style="margin-top:10px"><button class="' + (S.remOn ? "okb" : "") + '" data-a="rem">' + (S.remOn ? "Browser alerts on ✓" : "Turn on browser alerts") + "</button></div></div>";
  h += '<div class="card"><h3>Password</h3><div class="ctl col"><input type="password" data-m="pw.cur" value="' + esc(S.pw.cur) + '" placeholder="Current password" autocomplete="current-password" aria-label="Current password"><input type="password" data-m="pw.nw" value="' + esc(S.pw.nw) + '" placeholder="New password (8+ characters)" autocomplete="new-password" aria-label="New password"><button data-a="pwsave">Change password</button></div></div>';
  h += '<div class="card"><h3>Account</h3><div class="ctl"><button class="pri" data-a="out">Sign out</button><button data-a="dacc">Delete account</button></div></div>';
  return h;
}

// ======================================================================
// RENDER: draws the current screen + open dialog
// ======================================================================
// HTML of whichever dialog is open.
function modalHTML() {
  var m = S.modal;
  if (!m) return "";
  var b = m == "form" && S.form ? formModal() : m == "cal" ? calModal() : m == "notes" ? notesModal() : m == "member" ? memberModal() : "";
  return b ? '<div class="ov">' + b + "</div>" : "";
}
// Jump straight to the page content below the landing hero. Instant (not smooth) so a
// re-render or data load cannot cancel it; re-applied after layout settles.
function goApp() {
  if (!U || !$("#app")) return;
  var jump = function() { scrollTo({ top: $("#app").getBoundingClientRect().top + scrollY, behavior: "auto" }); };
  jump();
  requestAnimationFrame(jump);
  setTimeout(jump, 120);
}
// Redraw everything from S, keeping the focused input and cursor position.
function render() {
  document.body.classList.toggle("in", !!U);
  var ae = document.activeElement, fid = ae && ae.id && ($("#app") && $("#app").contains(ae) || $("#mo") && $("#mo").contains(ae)) ? ae.id : null, fs = fid && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  var cls = S._lt !== S.tab || !U ? "view" : "";
  S._lt = S.tab;
  var v = U ? { today, circle, chal, insights, me }[S.tab]() : authView();
  $("#app").innerHTML = '<div class="' + cls + '">' + v + "</div>";
  var mo = $("#mo");
  if (!mo) {
    mo = document.createElement("div");
    mo.id = "mo";
    document.body.appendChild(mo);
  }
  mo.innerHTML = U ? modalHTML() : "";
  document.body.style.overflow = mo.innerHTML ? "hidden" : "";
  $("#nav").innerHTML = U ? [["today", "Today"], ["circle", "Circle"], ["chal", "Sprint"], ["insights", "Insights"], ["me", "You"]].map(function(t) {
    return '<button data-t="' + t[0] + '" class="' + (S.tab == t[0] ? "on" : "") + '">' + t[1] + "</button>";
  }).join("") : "";
  if (fid) {
    var f = document.getElementById(fid);
    if (f) {
      f.focus({ preventScroll: true });
      if (fs && f.setSelectionRange && /text|search/.test(f.type || "")) try {
        f.setSelectionRange(fs[0], fs[1]);
      } catch (e) {
      }
    }
  }
  var cl = $("#cl");
  if (cl) cl.scrollTop = 1e5;
}

// ======================================================================
// ACTIONS: helpers used by the click handler
// ======================================================================
// Open the habit dialog (edit if a habit is given, otherwise new).
function openForm(x) {
  S.form = x ? { id: x.id, n: x.n, ic: x.ic, cat: x.cat, u: x.u, t: x.t, fq: x.fq, pw: x.fq == "weekly" ? x.pw : 3, pri: x.pri, rem: x.rem || "" } : newForm();
  S.modal = "form";
  render();
}
// Convert form state to the JSON the server expects.
function formBody(f) {
  return { name: f.n.trim(), icon: f.ic, unit: f.u, target: Number(f.t), category: f.cat, priority: f.pri, frequency: f.fq, perWeek: f.fq == "weekly" ? Number(f.pw) : void 0, remindAt: f.rem || "" };
}
// Open a habit's calendar and load its history.
function openCal(id) {
  var x = byId(id);
  if (!x) return;
  S.cal = { id, name: x.n, ic: x.ic, ym: dayKey().slice(0, 7), days: {}, today: dayKey(), habit: null };
  S.modal = "cal";
  render();
  calLoad();
}
// Fetch the history for the open calendar.
function calLoad() {
  var c = S.cal;
  if (!c) return;
  api("/habits/" + c.id + "/history").then(function(r) {
    if (!S.cal) return;
    S.cal.days = r.days;
    S.cal.today = r.today;
    S.cal.habit = r.habit;
    render();
  }).catch(function(e) {
    toast(e.message);
  });
}

// ======================================================================
// CLICK HANDLER: one listener for every button. data-t = tab, data-a = action.
// Each block below handles one data-a value.
// ======================================================================
document.addEventListener("click", function(e) {
  // Click on the dark backdrop closes the open dialog
  if (e.target.classList && e.target.classList.contains("ov")) {
    S.modal = null;
    render();
    return;
  }
  var b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.t) {
    S.tab = b.dataset.t;
    render();
    refresh(S.tab);
    // Jump straight to the page content (below the landing hero)
    goApp();
    return;
  }
  var a = b.dataset.a;
  if (!a) return;
  if (a == "login" || a == "signup") {
    auth(a);
    return;
  }
  if (a == "swap") {
    S.am = S.am == "register" ? "login" : "register";
    S.err = "";
    render();
    return;
  }
  if (a == "out") {
    signout();
    return;
  }
  if (!U) return;
  if (a == "mx") {
    S.modal = null;
    render();
    return;
  }
  var x = byId(b.dataset.i);
  // Add one step to today's progress
  if (a == "inc" && x) setVal(x, x.v + x.st, e);
  // Remove one step from today's progress
  if (a == "dec" && x) setVal(x, x.v - x.st, e);
  // Mark complete / undo complete
  if (a == "full" && x) {
    var w = x.done;
    setVal(x, w ? 0 : x.t, e, true);
    if (!w) {
      float("🎉", e);
      run(function() {
        var n = byId(x.id);
        if (n && n.done) toast(n.n + " done. Streak " + streak(n));
      });
    }
  }
  // Log why yesterday was missed
  if (a == "why" && x) {
    var r = b.dataset.r;
    S.reasons[r] = (S.reasons[r] || 0) + 1;
    x.skip = 1;
    addSkip(x.id);
    toast("Logged: " + r);
    render();
    run(function() {
      return api("/habits/" + x.id + "/reason", { method: "POST", body: { reason: r } });
    });
  }
  // Spend a streak freeze on yesterday
  if (a == "frz" && x) run(function() {
    return api("/habits/" + x.id + "/freeze", { method: "POST" }).then(function(p) {
      apply(p);
      toast("Streak saved by a freeze");
    });
  });
  // Lower the target (recovery)
  if (a == "ease") {
    var ex = x || byId(b.dataset.i);
    if (ex) easeIt(ex);
  }
  // Open the new-habit dialog
  if (a == "newh") openForm();
  // Open the edit dialog
  if (a == "edit" && x) openForm(x);
  // Open the history calendar
  if (a == "cal" && x) openCal(x.id);
  // Pick a value in the habit form (icon, priority, frequency...)
  if (a == "fset") {
    S.form[b.dataset.k] = b.dataset.v;
    render();
  }
  // Choose a filter chip
  if (a == "fcat") {
    S.cat = b.dataset.v;
    render();
  }
  // Save the habit form (create or update)
  if (a == "fsave") {
    var f = S.form, body = formBody(f);
    if (!body.name) {
      toast("Give your habit a name");
      return;
    }
    if (!(body.target >= 1)) {
      toast("Target must be at least 1");
      return;
    }
    run(function() {
      return api(f.id ? "/habits/" + f.id : "/habits", { method: f.id ? "PATCH" : "POST", body }).then(function(p) {
        S.modal = null;
        adapt(p);
        render();
        toast(f.id ? "Habit updated" : "Habit added");
        refresh("today");
      });
    });
  }
  // Delete a habit
  if (a == "del" && x) {
    if (!confirm('Delete "' + x.n + '" and its history?')) return;
    run(function() {
      return api("/habits/" + x.id, { method: "DELETE" }).then(function(p) {
        apply(p);
        toast("Habit removed");
      });
    });
  }
  // Calendar: previous / next month
  if (a == "cmo") {
    var d0 = new Date(S.cal.ym + "-01T00:00:00Z");
    d0.setUTCMonth(d0.getUTCMonth() + +b.dataset.d);
    S.cal.ym = d0.toISOString().slice(0, 7);
    render();
  }
  // Calendar: toggle done on one of the last 7 days
  if (a == "cday") {
    var c = S.cal, d = b.dataset.d, was = c.days[d] && c.days[d].d, tg = c.habit ? c.habit.target : 0;
    run(function() {
      return api("/habits/" + c.id + "/progress", { method: "PUT", body: { value: was ? 0 : tg, date: d } }).then(function(p) {
        apply(p);
        calLoad();
      });
    });
  }
  // AI: suggest habits
  if (a == "sug") {
    S.busy = "sug";
    render();
    api("/ai/suggest", { method: "POST" }).then(function(r2) {
      S.sug = r2;
      S.busy = "";
      render();
    }, function(er) {
      S.busy = "";
      render();
      toast(er.message);
    });
  }
  // Add one suggested habit
  if (a == "addsug") {
    var s = S.sug.suggestions[+b.dataset.i];
    run(function() {
      return api("/habits", { method: "POST", body: { name: s.name, icon: s.icon, unit: s.unit, target: s.target, category: s.category } }).then(function(p) {
        S.sug.suggestions.splice(+b.dataset.i, 1);
        apply(p);
        toast("Habit added");
      });
    });
  }
  // AI: coach tips
  if (a == "coach") {
    S.busy = "coach";
    render();
    api("/ai/coach", { method: "POST" }).then(function(r2) {
      S.coach = r2;
      S.busy = "";
      render();
    }, function(er) {
      S.busy = "";
      render();
      toast(er.message);
    });
  }
  // Insights: week / month chart
  if (a == "rng") {
    S.rng = b.dataset.v;
    render();
  }
  // Open notifications and mark them read
  if (a == "bell") {
    S.modal = "notes";
    render();
    if (S.notes.unread) {
      S.notes.unread = 0;
      api("/notifications/read", { method: "POST" }).then(function() {
        return api("/notifications");
      }).then(function(n) {
        S.notes.items = n.items;
      }).catch(function() {
      });
    }
  }
  // Send a nudge or reaction to a circle member
  if (a == "react") {
    var to = b.dataset.u, em = b.dataset.e, nm = b.dataset.n;
    if (to) run(function() {
      return api("/circle/nudge", { method: "POST", body: { to, emoji: em } }).then(function() {
        float(em, e);
        toast(em == "👋" ? "Nudge sent to " + nm : "Sent " + em + " to " + nm);
      });
    });
  }
  // Circle sub-tab: overview / feed / chat
  if (a == "ct") {
    S.ct = b.dataset.v;
    render();
    refresh("circle");
  }
  // React to a feed update
  if (a == "frx") {
    var fi = b.dataset.i, fe = b.dataset.e;
    run(function() {
      return api("/circle/feed/" + fi + "/react", { method: "POST", body: { emoji: fe } }).then(function() {
        return api("/circle/feed");
      }).then(function(f2) {
        S.feed = f2.items;
        render();
      });
    });
  }
  // Send chat message
  if (a == "csend") sendChat();
  // Open a member's progress
  if (a == "mview") {
    S.mview = { loading: 1 };
    S.modal = "member";
    render();
    api("/circle/member/" + b.dataset.u).then(function(m) {
      S.mview = m;
      render();
    }, function(er) {
      S.modal = null;
      render();
      toast(er.message);
    });
  }
  // Owner: remove a member
  if (a == "mrm") {
    if (!confirm("Remove " + b.dataset.n + " from the circle?")) return;
    var id = b.dataset.u;
    run(function() {
      return api("/circle/members/" + id, { method: "DELETE" }).then(function(c2) {
        setCircle(c2);
        render();
        toast("Member removed");
      });
    });
  }
  // Create a circle
  if (a == "mk") {
    var cn = $("#cn").value.trim();
    if (!cn) {
      toast("Name your circle");
      return;
    }
    run(function() {
      return api("/circle", { method: "POST", body: { name: cn } }).then(function(c2) {
        setCircle(c2);
        render();
        toast("Circle created");
        refresh("circle");
      });
    });
  }
  // Join a circle with a code
  if (a == "jn") {
    var cj = $("#cj").value.trim().toUpperCase();
    if (!cj) return;
    run(function() {
      return api("/circle/join", { method: "POST", body: { code: cj } }).then(function(c2) {
        setCircle(c2);
        render();
        toast("Joined " + S.circle.name);
        refresh("circle");
      });
    });
  }
  // Copy the invite code
  if (a == "cc") {
    try {
      navigator.clipboard.writeText(S.circle.code);
    } catch (er) {
    }
    toast("Code copied");
  }
  // Leave the circle
  if (a == "lv") {
    if (!confirm("Leave this circle?")) return;
    run(function() {
      return api("/circle/leave", { method: "POST" }).then(function() {
        S.circle = null;
        S.mem = [];
        S.all = [];
        S.feed = [];
        S.chat = [];
        S.chal = [];
        S.cs = null;
        render();
      });
    });
  }
  // Leaderboard ranking mode
  if (a == "lm") {
    S.lm = b.dataset.v;
    render();
  }
  // Show / hide the new-challenge form
  if (a == "cnew") {
    S.cf = S.cf ? null : { name: "", metric: "consistency", days: 7 };
    render();
  }
  // Create a challenge
  if (a == "cmk") {
    var cf = S.cf;
    if (!cf.name.trim()) {
      toast("Name the challenge");
      return;
    }
    run(function() {
      return api("/challenges", { method: "POST", body: { name: cf.name, metric: cf.metric, days: Number(cf.days) } }).then(function() {
        S.cf = null;
        toast("Challenge started");
        return api("/challenges");
      }).then(function(r2) {
        S.chal = r2.challenges;
        render();
      });
    });
  }
  // Join or leave a challenge
  if (a == "cjoin" || a == "cleave") {
    var ci = b.dataset.i;
    run(function() {
      return api("/challenges/" + ci + "/" + (a == "cjoin" ? "join" : "leave"), { method: "POST" }).then(function() {
        return api("/challenges");
      }).then(function(r2) {
        S.chal = r2.challenges;
        render();
        toast(a == "cjoin" ? "You are in" : "Left challenge");
      });
    });
  }
  // Delete a challenge
  if (a == "cdel") {
    if (!confirm("Delete this challenge?")) return;
    var cd = b.dataset.i;
    run(function() {
      return api("/challenges/" + cd, { method: "DELETE" }).then(function() {
        return api("/challenges");
      }).then(function(r2) {
        S.chal = r2.challenges;
        render();
      });
    });
  }
  // Pick an avatar
  if (a == "pem") {
    S.pf.e = b.dataset.v;
    render();
  }
  // Save profile
  if (a == "psave") {
    var pf = S.pf;
    run(function() {
      return api("/me", { method: "PATCH", body: { name: pf.n, bio: pf.b, emoji: pf.e } }).then(function(r2) {
        U = r2.user;
        S.pf = null;
        render();
        toast("Profile saved");
      });
    });
  }
  // Switch dark / light theme
  if (a == "theme") {
    theme(b.dataset.v);
    render();
  }
  // Turn browser reminders on / off
  if (a == "rem") {
    if (S.remOn) {
      S.remOn = false;
      store("sc_rem", "0");
      render();
      return;
    }
    if (!window.Notification) {
      S.remOn = true;
      store("sc_rem", "1");
      render();
      toast("In-app reminders on");
      return;
    }
    Notification.requestPermission().then(function(p) {
      S.remOn = p == "granted";
      store("sc_rem", S.remOn ? "1" : "0");
      render();
      toast(S.remOn ? "Browser alerts on" : "Alerts blocked. In-app reminders still work.");
    });
  }
  // Change password
  if (a == "pwsave") {
    var pw = S.pw;
    run(function() {
      return api("/me/password", { method: "POST", body: { current: pw.cur, next: pw.nw } }).then(function() {
        S.pw = { cur: "", nw: "" };
        render();
        toast("Password changed");
      });
    });
  }
  // Delete the account (asks for password)
  if (a == "dacc") {
    var p1 = prompt("This permanently deletes your account and all data. Type your password to confirm:");
    if (!p1) return;
    run(function() {
      return api("/me", { method: "DELETE", body: { password: p1 } }).then(function() {
        signout();
        toast("Account deleted");
      });
    });
  }
});

// ======================================================================
// BOOT: draw once, then restore the session if a token is saved
// ======================================================================
render();
if (getToken()) api("/me").then(function(r) {
  start(r.user);
}, function() {
  setToken(null);
  render();
});

// ======================================================================
// TICK: the 3D coach + landing hero live in tick.js. Started last, after the first render().
// ======================================================================
initTick({
  $: $, S: S, api: api, done: done, easeIt: easeIt, goApp: goApp, loadAll: loadAll, rate: rate, refresh: refresh, setVal: setVal, streak: streak,
  get U() { return U; },
  render: function() { return render.apply(this, arguments); },
  afterRender: function(fn) { var _r = render; render = function() { _r(); fn(); }; },
  afterToast: function(fn) { var _t = toast; toast = function(m) { _t(m); fn(m); }; },
});
