// =============================================================
// tick.js: Tick, the 3D habit coach (Three.js), his speech bubble + chat panel,
// and the landing hero. Started once from app.js with initTick(ctx).
// ctx gives Tick access to the app: state S, helpers, and two hooks
// (afterRender / afterToast) so Tick can react to what happens in the app.
// =============================================================
import * as THREE from "three";

export function initTick(ctx) {
  var $ = ctx.$, S = ctx.S, api = ctx.api, done = ctx.done, easeIt = ctx.easeIt, goApp = ctx.goApp, loadAll = ctx.loadAll,
    rate = ctx.rate, refresh = ctx.refresh, setVal = ctx.setVal, streak = ctx.streak, render = ctx.render;
  var hero = $("#lp"), cv = $("#c3");
  addEventListener("click", function(e) {
    var b = e.target.closest("[data-g]");
    if (!b) return;
    S.tab = b.dataset.g;
    render();
    if (ctx.U) { refresh(S.tab); goApp(); } else $("#app").scrollIntoView({ behavior: "smooth" });
    if (b.dataset.f) setTimeout(function() {
      var n = $("#nn");
      if (n) n.focus({ preventScroll: true });
    }, 700);
  });
  var BOT = { sx: innerWidth * 0.7, sy: innerHeight * 0.45, r: 90, dk: 0 }, mx = innerWidth * 0.5, my = innerHeight * 0.5, lastAct = Date.now(), hopReq = 0, tk = 0, vOn = false, ptab = S.tab, sp_ = $("#sp"), panel = $("#tp");
  var DAY = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  function know() {
    var hs = S.habits, left = hs.filter(function(h) {
      return !done(h);
    }), so = hs.slice().sort(function(a2, b) {
      return rate(b) - rate(a2);
    }), wd = [0, 0, 0, 0, 0, 0, 0], td = (new Date()).getDay();
    hs.forEach(function(h) {
      for (var i2 = 0; i2 < 27; i2++) if (!h.h[i2]) wd[((td - (27 - i2)) % 7 + 7) % 7]++;
    });
    var rs_ = Object.keys(S.reasons).sort(function(a2, b) {
      return S.reasons[b] - S.reasons[a2];
    })[0];
    return { hs, left, best: so[0], worst: so[so.length - 1], day: DAY[wd.indexOf(Math.max.apply(null, wd))], reason: rs_, avg: hs.length ? Math.round(hs.reduce(function(a2, h) {
      return a2 + rate(h);
    }, 0) / hs.length) : 0 };
  }
  function summary() {
    var k = know();
    if (!k.hs.length) return "No habits yet. Add one and I will start tracking it.";
    return "You are at " + k.avg + "% over 28 days. Best: " + k.best.n.toLowerCase() + " (" + rate(k.best) + "%, streak " + streak(k.best) + "). Weakest: " + k.worst.n.toLowerCase() + " (" + rate(k.worst) + "%). " + (k.left.length ? k.left.length + " left today." : "Ring closed today.");
  }
  function weak() {
    var k = know();
    if (!k.hs.length) return "Nothing to analyse yet.";
    return k.worst.n + " is your weak spot at " + rate(k.worst) + "%. You miss most on " + k.day + ', and your top logged reason is "' + k.reason + '". ' + (k.worst.miss >= 3 ? 'Say "lower ' + k.worst.n.toLowerCase() + '" and I will set a lighter target.' : "Pair it with something you never skip.");
  }
  function nxt() {
    var k = know();
    if (!k.hs.length) return "Add your first habit below.";
    if (!k.left.length) return "Everything is done today. Check on your circle?";
    var h = k.left.sort(function(a2, b) {
      return b.v / b.t - a2.v / a2.t;
    })[0];
    return k.left.length + " left. Start with " + h.n.toLowerCase() + ": " + (h.t - h.v) + " " + h.u + " to go.";
  }
  function find(q) {
    return S.habits.filter(function(h) {
      return h.n.toLowerCase().split(" ").some(function(w) {
        return w.length > 3 && new RegExp("\\b" + w + "\\b").test(q);
      });
    })[0];
  }
  function ask(q) {
    q = q.toLowerCase();
    var h = find(q);
    if (h && /\b(mark|finish)\b|^complete/.test(q)) {
      var was_ = done(h);
      setVal(h, h.t);
      return "Marked " + h.n.toLowerCase() + " complete. Streak is now " + (streak(h) + (was_ ? 0 : 1)) + ".";
    }
    if (h && /lower|easier|reduce/.test(q)) {
      var nt_ = Math.max(h.st, Math.round(h.t * 0.6 / h.st) * h.st);
      easeIt(h);
      return "Done. " + h.n + " target is now " + nt_ + " " + h.u + ".";
    }
    var tabs = { today: "today", circle: "circle", sprint: "chal", leaderboard: "chal", insight: "insights", analytics: "insights" };
    for (var k in tabs) if (/open|go to|show me|take me/.test(q) && q.indexOf(k) > -1) {
      S.tab = tabs[k];
      render();
      goApp();
      return "Opening " + k + ".";
    }
    if (/freeze/.test(q)) return "You have " + S.freeze + " streak freeze" + (S.freeze == 1 ? "" : "s") + ". Use one on a habit you missed yesterday.";
    if (/rank|sprint|leader/.test(q)) {
      var y = know().avg, r = 1 + S.mem.filter(function(m) {
        return m.cons > y;
      }).length;
      return "You rank " + r + " of " + (S.mem.length + 1) + " in the sprint. It ranks consistency, not streak length.";
    }
    if (/circle|friend|team/.test(q)) {
      var nd = S.mem.filter(function(m) {
        return !m.done;
      }).map(function(m) {
        return m.n;
      });
      return S.mem.length - nd.length + " of " + S.mem.length + " circle members checked in." + (nd.length ? " " + nd.join(", ") + " still pending. Want to nudge them?" : "");
    }
    if (h) return h.n + ": streak " + streak(h) + ", " + rate(h) + "% this month, today " + h.v + "/" + h.t + " " + h.u + ".";
    if (/weak|worst|struggl|miss|problem|why/.test(q)) return weak();
    if (/next|should|todo|left|today|plan/.test(q)) return nxt();
    if (/streak/.test(q)) return S.habits.map(function(x) {
      return x.n + " " + streak(x);
    }).join(", ") + ".";
    if (/doing|progress|summary|status|how am/.test(q)) return summary();
    if (/^(hi|hello|hey)\b/.test(q)) return "Hello. " + nxt();
    return 'I can check streaks, find weak spots, mark habits done, lower a target, or open Circle, Sprint and Insights. Try "how am I doing?"';
  }
  function addLog(w, m) {
    var d = document.createElement("div");
    d.className = "lg " + w;
    d.textContent = m;
    var l = $("#tl");
    l.appendChild(d);
    l.scrollTop = 1e5;
  }
  function speak(m) {
    if (vOn && window.speechSynthesis) {
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(m));
    }
  }
  function say(m, hold) {
    var id = ++tk, i2 = 0;
    sp_.style.opacity = 1;
    (function ty() {
      if (id != tk) return;
      i2++;
      sp_.textContent = m.slice(0, i2);
      if (i2 < m.length) setTimeout(ty, 26);
      else setTimeout(function() {
        if (id == tk) sp_.style.opacity = 0;
      }, hold || 4500);
    })();
  }
  function tell(m, hold) {
    if (!panel.hidden) addLog("b", m);
    else say(m, hold);
    speak(m);
  }
  var HIST = [], busy = 0;
  function reply(q, a2, d) {
    busy = 0;
    d.textContent = a2;
    $("#tl").scrollTop = 1e5;
    HIST.push({ role: "user", content: q }, { role: "assistant", content: a2 });
    HIST = HIST.slice(-8);
    speak(a2);
    lastAct = Date.now();
  }
  function send(q) {
    q = q.trim();
    if (!q || busy) return;
    addLog("u", q);
    var d = document.createElement("div");
    d.className = "lg b";
    if (!ctx.U) {
      d.textContent = "Sign in first and I will see your streaks.";
      $("#tl").appendChild(d);
      $("#tl").scrollTop = 1e5;
      return;
    }
    busy = 1;
    d.textContent = "...";
    $("#tl").appendChild(d);
    api("/tick", { method: "POST", body: { messages: HIST.concat([{ role: "user", content: q }]) } }).then(function(r) {
      if (!r.reply || /^Tick AI is not connected/.test(r.reply)) {
        reply(q, ask(q), d);
        return;
      }
      reply(q, r.reply, d);
      if (r.changed) loadAll();
    }, function() {
      reply(q, ask(q), d);
    });
  }
  function tp(on) {
    panel.hidden = !on;
    if (on) {
      sp_.style.opacity = 0;
      tk++;
      if (!$("#tl").children.length) addLog("b", ctx.U ? "I am Tick. I know your last 28 days of streaks. Ask me anything, or tap a shortcut." : "I am Tick. Sign in and I will start watching your streaks.");
      $("#ta").focus();
    }
  }
  $("#tpx").onclick = function() {
    tp(false);
  };
  $("#ts").onclick = function() {
    var a2 = $("#ta");
    send(a2.value);
    a2.value = "";
  };
  $("#ta").addEventListener("keydown", function(e) {
    if (e.key == "Enter") {
      send(this.value);
      this.value = "";
    }
  });
  $("#tq").onclick = function(e) {
    var b = e.target.closest("button");
    if (b) send(b.textContent);
  };
  $("#tv").onclick = function() {
    vOn = !vOn;
    this.textContent = vOn ? "🔊" : "🔇";
    if (!vOn && window.speechSynthesis) speechSynthesis.cancel();
  };
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) $("#tm").style.display = "none";
  else $("#tm").onclick = function() {
    var r = new SR();
    r.lang = "en-IN";
    r.onresult = function(e) {
      send(e.results[0][0].transcript);
    };
    r.start();
  };
  ctx.afterRender(function() {
    if (S.tab != ptab) {
      ptab = S.tab;
      (function (f) { if (f) tell(f()); })({ today: nxt, circle: function() {
        return ask("circle");
      }, chal: function() {
        return ask("rank");
      }, insights: weak }[S.tab]);
    }
  });
  ctx.afterToast(function(m) {
    if (/ done\./.test(m)) {
      hopReq = 1;
      tell("Locked in. " + (know().left.length ? know().left.length + " left today." : "Your ring is closed. Your circle can see it."));
    } else if (/^Logged:/.test(m)) tell("Noted. I will watch that pattern.");
    else if (/freeze/i.test(m)) tell("Freeze used. Do not make it a habit.");
    else if (/^Target lowered/.test(m)) tell("Lighter target set. Consistency beats intensity.");
    else if (/^Habit added/.test(m)) {
      hopReq = 1;
      tell("New habit tracked. Its history starts today.");
    }
  });
  var lastH = 0;
  addEventListener("pointerover", function(e) {
    var c = e.target.closest && e.target.closest("#app .card"), n = c && c.querySelector(".nm");
    if (!n || Date.now() - lastH < 7e3 || !panel.hidden) return;
    var h = S.habits.filter(function(x) {
      return x.n == n.textContent;
    })[0];
    if (h) {
      lastH = Date.now();
      say(h.n + ": streak " + streak(h) + ", " + rate(h) + "% this month.", 3e3);
    }
  });
  addEventListener("focusin", function(e) {
    if (e.target.id == "nn") say("A new habit? Start small. Small targets survive bad weeks.");
  });
  var away = false;
  addEventListener("scroll", function() {
    lastAct = Date.now();
    var a2 = scrollY > innerHeight * 0.5;
    if (a2 && !away) {
      away = true;
      tell("I will tag along. Click me anytime to ask about your streaks.");
    }
    if (!a2 && away && scrollY < innerHeight * 0.15) {
      away = false;
      tell("Back home. Projector online.");
    }
  }, { passive: true });
  setInterval(function() {
    if (!panel.hidden || Date.now() - lastAct < 15e3 || !S.habits.length) return;
    lastAct = Date.now() - 5e3;
    var o = [nxt(), "Pattern: you miss most on " + know().day + ".", "Missed yesterday? You have " + S.freeze + " freeze."];
    say(o[Math.floor(Math.random() * o.length)]);
  }, 9e3);
  setTimeout(function() {
    var last = 0;
    try {
      last = +localStorage.getItem("sc_seen") || 0;
      localStorage.setItem("sc_seen", Date.now());
    } catch (e) {
    }
    var hr = (new Date()).getHours(), gt = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening", aw = last ? Math.floor((Date.now() - last) / 36e5) : 0;
    say(gt + ". I am Tick, keeper of your streaks." + (aw >= 12 ? " You were away " + Math.max(1, Math.floor(aw / 24)) + " day(s). Let us restart gently." : ""), 5e3);
  }, 900);
  (function pos() {
    requestAnimationFrame(pos);
    if (sp_.style.opacity === "0" || !panel.hidden) return;
    var bw = sp_.offsetWidth, bh = sp_.offsetHeight;
    sp_.style.left = Math.max(8, Math.min(innerWidth - bw - 8, BOT.sx + BOT.r * 0.6 - bw)) + "px";
    sp_.style.top = Math.max(60, BOT.sy - BOT.r * 0.9 - bh) + "px";
  })();
  var rm = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var R = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true });
  R.setPixelRatio(Math.min(devicePixelRatio, 2));
  var sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  cam.position.set(0, 1.7, 8.4);
  cam.lookAt(0, -0.1, 0);
  sc.add(new THREE.HemisphereLight(16773341, 6946838, 0.85));
  var dl = new THREE.DirectionalLight(16777215, 1.2);
  dl.position.set(-3, 4, 6);
  sc.add(dl);
  var rl = new THREE.DirectionalLight(16747162, 1.1);
  rl.position.set(4, 1, -3);
  sc.add(rl);
  var g = new THREE.Group();
  g.scale.setScalar(1.25);
  g.position.y = 0.15;
  sc.add(g);
  var HM = [];
  var VS = "varying vec3 vN,vV;varying float vY;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);vY=(modelMatrix*vec4(position,1.)).y;gl_Position=projectionMatrix*mv;}";
  var FS = "uniform float t;uniform vec3 c;uniform float a;uniform float nf;uniform float by;uniform float su;varying vec3 vN,vV;varying float vY;void main(){float ly=(vY-by)/su+.15;float f=pow(1.-abs(dot(vN,vV)),2.);float s=.72+.28*sin(ly*80.-t*5.);float k=.92+.08*sin(t*45.)*step(.8,fract(t*.35));float p=-1.6+fract(t*.4)*3.8;float bd=exp(-pow(ly-p,2.)*70.);float fd=mix(smoothstep(-1.7,-.8,ly),1.,nf);gl_FragColor=vec4(c*(.6+f*1.7+bd*1.4)*s*k,(a+f*.7+bd*.5)*s*fd);}";
  function hm(c, a2, nf) {
    var m = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, c: { value: new THREE.Color(c) }, a: { value: a2 }, nf: { value: nf ? 1 : 0 }, by: { value: 0.15 }, su: { value: 1 } }, vertexShader: VS, fragmentShader: FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    HM.push(m);
    return m;
  }
  function dk(c, o) {
    return new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o || 0.92, depthWrite: false });
  }
  function ad(geo, mat, x, y, z, p) {
    var o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    (p || g).add(o);
    return o;
  }
  function sp(r, mat, x, y, z, sx, sy, sz, p) {
    var o = ad(new THREE.SphereGeometry(r, 32, 24), mat, x, y, z, p);
    o.scale.set(sx, sy, sz);
    return o;
  }
  function cy(r, h, mat, e) {
    var q = new THREE.CylinderGeometry(r, r, h, 64);
    q.rotateX(Math.PI / 2);
    var o = ad(q, mat, 0, 0, 0);
    if (e) o.add(new THREE.LineSegments(new THREE.EdgesGeometry(q, 20), new THREE.LineBasicMaterial({ color: 16761434, transparent: true, opacity: 0.9 })));
    return o;
  }
  var BR = 5905920;
  cy(1.18, 0.56, hm(16751130, 0.55), 1);
  cy(1, 0.6, hm(16765562, 0.2));
  for (var i = 0; i < 12; i++) {
    var a = i / 12 * Math.PI * 2, tkm = ad(new THREE.BoxGeometry(0.05, i % 3 ? 0.1 : 0.18, 0.04), hm(16761434, 0.9), Math.sin(a) * 0.86, Math.cos(a) * 0.86, 0.31);
    tkm.rotation.z = -a;
  }
  var eyes = [], pup = [], brw = [];
  [-1, 1].forEach(function(s) {
    var e = new THREE.Group();
    e.position.set(s * 0.34, 0.2, 0.31);
    g.add(e);
    sp(0.23, hm(16777215, 0.95), 0, 0, 0, 1, 1.15, 0.35, e);
    pup.push(sp(0.12, dk(3805696), 0, 0, 0.07, 1, 1.1, 0.5, e));
    sp(0.04, dk(16777215, 1), 0.04, 0.07, 0.13, 1, 1, 0.5, e);
    eyes.push(e);
    var b = ad(new THREE.BoxGeometry(0.3, 0.06, 0.04), dk(BR), s * 0.34, 0.58, 0.32);
    b.rotation.z = -s * 0.2;
    brw.push(b);
    sp(0.13, hm(16738874, 0.6), s * 0.6, -0.2, 0.31, 1, 0.8, 0.2);
  });
  var pin = new THREE.Group();
  pin.position.set(0, -0.08, 0.34);
  g.add(pin);
  sp(0.07, hm(16757306, 1), 0, 0, 0.02, 1, 1, 1, pin);
  var hh = new THREE.Group(), mh = new THREE.Group();
  hh.position.z = 0.01;
  mh.position.z = 0.02;
  pin.add(hh, mh);
  ad(new THREE.BoxGeometry(0.045, 0.22, 0.03), dk(BR), 0, 0.11, 0, hh);
  ad(new THREE.BoxGeometry(0.035, 0.32, 0.03), dk(BR), 0, 0.16, 0, mh);
  var mo = ad(new THREE.TorusGeometry(0.3, 0.032, 10, 32, Math.PI), dk(8004096), 0, -0.42, 0.32);
  mo.rotation.z = Math.PI;
  var fl = [[0.22, 0.55, 16734762, 0], [0.16, 0.4, 16757611, 0.05], [0.1, 0.25, 16773570, 0.1]].map(function(f) {
    return ad(new THREE.ConeGeometry(f[0], f[1], 24), hm(f[2], 0.85), 0, 1.55 + f[3] * 2, f[3]);
  });
  var bs = new THREE.Group();
  bs.position.y = -1.95;
  sc.add(bs);
  function sm(fs) {
    var m = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, dm: { value: 1 } }, vertexShader: "varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}", fragmentShader: fs.replace("void main(){", "uniform float dm;void main(){").replace("gl_FragColor=vec4(", "gl_FragColor=vec4(dm*"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    HM.push(m);
    return m;
  }
  var gc = document.createElement("canvas");
  gc.width = gc.height = 128;
  var gx = gc.getContext("2d"), gr = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,150,40,.75)");
  gr.addColorStop(1, "rgba(255,150,40,0)");
  gx.fillStyle = gr;
  gx.fillRect(0, 0, 128, 128);
  var gq = new THREE.PlaneGeometry(6, 6);
  gq.rotateX(-Math.PI / 2);
  ad(gq, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0, -0.01, 0, bs);
  var fq = new THREE.CircleGeometry(2.6, 64);
  fq.rotateX(-Math.PI / 2);
  ad(fq, sm("uniform float t;varying vec3 vP;void main(){float r=length(vP.xz),an=atan(vP.z,vP.x);float rg=smoothstep(0.,.05,abs(fract(r*3.)-.5)-.45);float sk=smoothstep(0.,.04,abs(fract(an*3.8197)-.5)-.46)*step(1.4,r);float pl=exp(-pow(r-fract(t*.35)*2.6,2.)*40.);float fd=1.-smoothstep(1.2,2.6,r);float v=(rg*.7+sk*.5+pl*1.1+.12)*fd;gl_FragColor=vec4(vec3(1.,.62,.15)*v,v);}"), 0, 5e-3, 0, bs);
  ad(new THREE.CylinderGeometry(1.3, 1.4, 0.14, 64), dk(2360576, 0.92), 0, -0.07, 0, bs);
  var tq = new THREE.TorusGeometry(1.3, 0.03, 8, 96);
  tq.rotateX(Math.PI / 2);
  ad(tq, hm(16757306, 1, 1), 0, 0.01, 0, bs);
  var tq2 = new THREE.TorusGeometry(0.75, 0.02, 8, 80);
  tq2.rotateX(Math.PI / 2);
  ad(tq2, hm(16761434, 0.8, 1), 0, 0.02, 0, bs);
  var dr = new THREE.Group();
  dr.position.y = 0.03;
  bs.add(dr);
  for (i = 0; i < 28; i++) {
    var da = i / 28 * Math.PI * 2, db = ad(new THREE.BoxGeometry(0.16, 0.02, 0.05), hm(16757306, 0.9, 1), Math.cos(da) * 1.55, 0, Math.sin(da) * 1.55, dr);
    db.rotation.y = -da;
  }
  ad(new THREE.CylinderGeometry(1.15, 0.95, 3.4, 64, 1, true), sm("uniform float t;varying vec3 vP;void main(){float h=clamp(vP.y/3.4+.5,0.,1.);float an=atan(vP.z,vP.x);float st=.55+.45*sin(an*28.+t*1.5)*sin(an*11.-t);float al=pow(1.-h,1.6)*.32*st+.03;gl_FragColor=vec4(vec3(1.,.6,.12)*al*2.,al);}"), 0, 1.7, 0, bs);
  var SN = 70, sg = new THREE.BufferGeometry(), sa = new Float32Array(SN * 3);
  for (i = 0; i < SN; i++) {
    var sq = Math.random() * 6.28, rr = Math.random() * 0.95;
    sa[i * 3] = Math.cos(sq) * rr;
    sa[i * 3 + 1] = Math.random() * 3.4;
    sa[i * 3 + 2] = Math.sin(sq) * rr;
  }
  sg.setAttribute("position", new THREE.BufferAttribute(sa, 3));
  bs.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.06, color: 16761434, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
  var sr = new THREE.TorusGeometry(1.15, 0.015, 6, 80);
  sr.rotateX(Math.PI / 2);
  var scn = ad(sr, hm(16769162, 0.9, 1), 0, 0, 0, bs);
  var N = 90, pg = new THREE.BufferGeometry(), pp = new Float32Array(N * 3);
  for (i = 0; i < N; i++) {
    pp[i * 3] = (Math.random() - 0.5) * 8;
    pp[i * 3 + 1] = Math.random() * 7 - 3;
    pp[i * 3 + 2] = (Math.random() - 0.5) * 4;
  }
  pg.setAttribute("position", new THREE.BufferAttribute(pp, 3));
  sc.add(new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.07, color: 16765600, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })));
  var nx = 0, ny = 0, ox = 0, oy = 0, hop = 0, vy = 0, vis = true, t = 0, nod = 0, wv = 0, dk = 0, K = 1.1, rc = new THREE.Raycaster(), pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), v2 = new THREE.Vector2(), tmp = new THREE.Vector3();
  function w2(px, py) {
    cam.updateMatrixWorld();
    v2.set(px / innerWidth * 2 - 1, -(py / innerHeight * 2 - 1));
    rc.setFromCamera(v2, cam);
    rc.ray.intersectPlane(pl, tmp);
    return tmp.clone();
  }
  function rs() {
    var w = cv.clientWidth, h = cv.clientHeight;
    R.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
  rs();
  addEventListener("resize", rs);
  addEventListener("pointermove", function(e) {
    mx = e.clientX;
    my = e.clientY;
    lastAct = Date.now();
    document.body.style.cursor = Math.hypot(mx - BOT.sx, my - BOT.sy) < BOT.r ? "pointer" : "";
  });
  addEventListener("keydown", function() {
    nod = 0.3;
  });
  // Clicking Tick (even many times) must never select the text behind him.
  function onTick(e) { return !e.target.closest("button,input,textarea,select,a,#tp,nav") && Math.hypot(e.clientX - BOT.sx, e.clientY - BOT.sy) < BOT.r; }
  addEventListener("mousedown", function(e) { if (onTick(e)) { e.preventDefault(); var g = getSelection(); if (g) g.removeAllRanges(); } });
  addEventListener("selectstart", function(e) { if (BOT.down) e.preventDefault(); });
  addEventListener("dblclick", function(e) { if (onTick(e)) { e.preventDefault(); var g = getSelection(); if (g) g.removeAllRanges(); } });
  addEventListener("click", function(e) {
    if (e.target.closest("button,input,a,#tp,nav")) return;
    if (Math.hypot(e.clientX - BOT.sx, e.clientY - BOT.sy) < BOT.r) {
      var g = getSelection(); if (g) g.removeAllRanges();
      hopReq = 1;
      tp(panel.hidden);
    }
  });
  // --- Light theme for Tick -------------------------------------------------
  // In dark mode Tick is made of glowing (additive) light, which turns pale on a
  // light page. In light mode we switch those materials to normal blending and
  // darken their colours so Tick stays bold and clearly visible.
  function tickTheme() {
    var light = S.theme == "light";
    sc.traverse(function(o) {
      var list = o.material ? [].concat(o.material) : [];
      list.forEach(function(mt) {
        var d = mt.userData;
        if (d.b0 === undefined) {
          d.b0 = mt.blending;
          d.o0 = mt.opacity;
          if (mt.uniforms && mt.uniforms.c) d.c0 = mt.uniforms.c.value.clone();
          else if (mt.color) d.c0 = mt.color.clone();
        }
        if (d.b0 !== THREE.AdditiveBlending) return; // solid parts (eyes, mouth, hands) already fine
        mt.blending = light ? THREE.NormalBlending : d.b0;
        if (mt.uniforms && mt.uniforms.c) mt.uniforms.c.value.copy(d.c0).multiplyScalar(light && d.c0.getHex() != 16777215 ? 0.85 : 1);
        else if (mt.uniforms && mt.uniforms.dm) mt.uniforms.dm.value = 1;
        else if (mt.isPointsMaterial) mt.color.setHex(light ? 11880223 : d.c0.getHex());
        else if (mt.isLineBasicMaterial) mt.color.setHex(light ? 12740618 : d.c0.getHex());
        else if (mt.map) mt.opacity = light ? 0.35 : d.o0;
        mt.needsUpdate = true;
      });
    });
  }
  addEventListener("sc:theme", tickTheme);
  tickTheme();
  (function loop() {
    requestAnimationFrame(loop);
    if (!vis) return;
    t += 0.016;
    var W = innerWidth, H = innerHeight, hr = hero.getBoundingClientRect(), hH = hero.offsetHeight || H, mob = W < 760, ms = mob ? 0.78 : 1;
    dk += (Math.max(0, Math.min(1, scrollY / (hH * 0.55))) - dk) * 0.07;
    var e = dk * dk * (3 - 2 * dk), sw = Math.sin(e * Math.PI);
    var hx = mob ? W * 0.5 : W * 0.71, hy = hr.top + hH * (mob ? 0.34 : 0.47), dx = W - (mob ? 60 : 92), dy = H - (mob ? 150 : 104);
    var wh = w2(hx, hy), SC = (1 + ((mob ? 0.32 : 0.3) - 1) * e) * ms, BP = w2(hx + (dx - hx) * e - sw * 70, hy + (dy - hy) * e - sw * 40);
    bs.position.set(wh.x, wh.y - 2.1 * ms, 0);
    bs.scale.set(ms, Math.max(1e-3, 1 - e * 1.1), ms);
    bs.visible = e < 0.97 && hr.bottom > -300;
    var pv = BP.clone().project(cam);
    BOT.sx = (pv.x * 0.5 + 0.5) * W;
    BOT.sy = (-pv.y * 0.5 + 0.5) * H;
    BOT.r = 1.35 * SC * H / 4.93;
    BOT.dk = e;
    nx = Math.max(-1, Math.min(1, (mx - BOT.sx) / (W * 0.5)));
    ny = Math.max(-1, Math.min(1, (my - BOT.sy) / (H * 0.5)));
    if (hopReq) {
      vy = 0.13;
      hopReq = 0;
    }
    var d = Math.min(1, Math.hypot(nx, ny));
    nod *= 0.9;
    HM.forEach(function(m) {
      m.uniforms.t.value = t;
      if (m.uniforms.by) {
        m.uniforms.by.value = BP.y;
        m.uniforms.su.value = SC * K / 1.25;
      }
    });
    scn.position.y = t * 0.45 % 1 * 3.7;
    var gg = t % 6 > 5.86;
    g.position.set(BP.x + (gg ? (Math.random() - 0.5) * 0.25 * SC : 0), BP.y, BP.z);
    g.scale.set(K * SC * (gg ? 1 + Math.random() * 0.15 : 1), K * SC, K * SC);
    g.rotation.y += (nx * 0.55 - g.rotation.y) * 0.08;
    g.rotation.x += (ny * 0.3 + nod - g.rotation.x) * 0.08;
    g.rotation.z += (-nx * 0.06 - g.rotation.z) * 0.06;
    ox += (nx * 0.09 - ox) * 0.12;
    oy += (-ny * 0.07 - oy) * 0.12;
    pup.forEach(function(p) {
      p.position.x = ox;
      p.position.y = oy;
    });
    mo.scale.set(0.9 + (1 - d) * 0.25, 0.5 + (1 - d) * 1.1, 1);
    brw.forEach(function(b) {
      b.position.y = 0.58 + (1 - d) * 0.04 - ny * 0.03;
    });
    hop += vy;
    vy -= 9e-3;
    if (hop < 0) {
      hop = 0;
      vy = 0;
    }
    wv *= 0.97;
    var D = new Date();
    hh.rotation.z = -(D.getHours() % 12 + D.getMinutes() / 60) / 12 * Math.PI * 2;
    mh.rotation.z = -D.getMinutes() / 60 * Math.PI * 2;
    if (!rm) {
      g.position.y = BP.y + (Math.sin(t * 1.6) * 0.07 + hop) * SC;
      var bl = t % 4.2 > 4.05 ? 0.1 : 1;
      eyes.forEach(function(e2) {
        e2.scale.y = bl;
      });
      fl.forEach(function(f, i3) {
        f.scale.y = 1 + Math.sin(t * 6 + i3 * 2) * 0.12;
        f.scale.x = 1 + Math.sin(t * 5 + i3) * 0.06;
      });
      var a2 = pg.attributes.position;
      for (var i2 = 0; i2 < N; i2++) {
        a2.array[i2 * 3 + 1] += 0.012 + i2 % 5 * 2e-3;
        if (a2.array[i2 * 3 + 1] > 4) a2.array[i2 * 3 + 1] = -3;
      }
      a2.needsUpdate = true;
      for (var j = 0; j < SN; j++) {
        sa[j * 3 + 1] += 0.02 + j % 4 * 4e-3;
        if (sa[j * 3 + 1] > 3.4) sa[j * 3 + 1] = 0;
      }
      sg.attributes.position.needsUpdate = true;
      dr.rotation.y = t * 0.4;
    }
    R.render(sc, cam);
  })();
}
