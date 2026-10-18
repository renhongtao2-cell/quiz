/* ============================================================
   授权校验模块 · assets/license.js
   ------------------------------------------------------------
   作用：买家没激活就进不了测评页；激活后按设备绑定，最多 3 台。
   部署前只需要改下面的 LICENSE_CONFIG 一处。

   接入方式（放在 <head> 里，紧跟 style.css 之后）：
     <script src="../assets/license.js"></script>
   ============================================================ */

(function () {
  "use strict";

  /* ==========================================================
     ① 配置区 —— 部署时只改这里
     ========================================================== */
  var LICENSE_CONFIG = {
    // Supabase 项目地址，控制台 → Project Settings → API → Project URL
    supabaseUrl: "https://gqrlyukppptsbtwaxvzv.supabase.co",

    // 同页面的 anon public key（这串是公开的，放前端没问题，权限由 RLS 兜住）
    supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdxcmx5dWtwcHB0c2J0d2F4dnp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMDQ4MTAsImV4cCI6MjEwNzg4MDgxMH0.IIdrjdNKBpJJrWo6xlayQM3yhoI5BY-gtsHpinKyzxs",

    // 激活页文件名（和 index.html 同级）
    gate: "gate.html",

    // 不需要授权就能打开的页面：首页做展示、激活页本身当然要能开
    free: ["index.html", "gate.html"],

    // 本地存储键名（实际键名会拼上站点后缀，如 xhs_lic_v1_main）
    storageKey: "xhs_lic_v1",

    // 站点标识。同一个 Supabase 可以挂很多个测评站。
    // 码和次数都按这里配的名字分开算：A 站的码到 B 站用会被拒。
    // 建第二个站时，把这个值改成新名字（如 "wild"），两站互不影响。
    app: "main",

    // 后台静默校验的间隔（小时）。0 = 每次打开都校验
    recheckHours: 6
  };

  /* ==========================================================
     ② 以下不用改
     ========================================================== */

  window.LICENSE_CONFIG = LICENSE_CONFIG;

  /* ---------- 站点根目录（兼容 GitHub Pages 子路径） ---------- */
  var self = document.currentScript ||
    (function () {
      var all = document.getElementsByTagName("script");
      return all[all.length - 1];
    })();

  var ROOT = (function () {
    var s = (self && self.src) || "";
    var i = s.indexOf("assets/license.js");
    return i >= 0 ? s.slice(0, i) : "./";
  })();

  var GATE_URL = ROOT + LICENSE_CONFIG.gate;

  /* ---------- 是否已配置 ---------- */
  // 正式环境只认 https://xxx.supabase.co
  // 本地联调时允许 http://127.0.0.1:端口（仅当页面本身也在 localhost 上）
  var LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  var CONFIGURED =
    (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(LICENSE_CONFIG.supabaseUrl) ||
      (LOCAL_HOST && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(LICENSE_CONFIG.supabaseUrl))) &&
    /^[A-Za-z0-9._-]{40,}$/.test(LICENSE_CONFIG.supabaseAnonKey);

  /* ---------- 小工具 ---------- */

  function pageName() {
    var p = location.pathname;
    var n = p.slice(p.lastIndexOf("/") + 1);
    return n || "index.html";
  }

  function isFreePage() {
    return LICENSE_CONFIG.free.indexOf(pageName()) >= 0;
  }

  function isGatePage() {
    return pageName() === LICENSE_CONFIG.gate;
  }

  // 本地令牌按站点分开存：同一个域名下挂多个站时，各站各记各的
  function skey() {
    return LICENSE_CONFIG.storageKey + "_" + (LICENSE_CONFIG.app || "main");
  }

  function loadToken() {
    try {
      var raw = localStorage.getItem(skey());
      var t = raw ? JSON.parse(raw) : null;
      return t && t.code ? t : null;
    } catch (e) {
      return null;
    }
  }

  function saveToken(t) {
    try {
      localStorage.setItem(skey(), JSON.stringify(t));
    } catch (e) {}
  }

  function clearToken() {
    try {
      localStorage.removeItem(skey());
    } catch (e) {}
  }

  function hidePage() {
    try {
      var s = document.createElement("style");
      s.textContent = "html{visibility:hidden!important}";
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  }

  /* ---------- 设备指纹 ----------
     注意：故意不用 canvas 画文字，因为字体加载时机不同会导致
     同一个浏览器算出不同指纹，买家就会被误判成「换了设备」。 */
  function h32(str, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function fingerprint() {
    var p = [];
    p.push(navigator.userAgent || "");
    p.push(navigator.language || "");
    p.push((navigator.languages || []).join(","));
    p.push(navigator.platform || "");
    p.push(navigator.hardwareConcurrency || 0);
    p.push(navigator.maxTouchPoints || 0);
    p.push(screen.width + "x" + screen.height + "x" + screen.colorDepth + "x" + (window.devicePixelRatio || 1));
    p.push(new Date().getTimezoneOffset());
    try {
      p.push(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    } catch (e) {
      p.push("");
    }

    // 纯图形绘制，不含文字，跨次稳定
    try {
      var c = document.createElement("canvas");
      c.width = 180;
      c.height = 40;
      var x = c.getContext("2d");
      if (x) {
        x.fillStyle = "#f60";
        x.fillRect(0, 0, 180, 40);
        x.globalCompositeOperation = "multiply";
        var g = x.createLinearGradient(0, 0, 180, 40);
        g.addColorStop(0, "#0af");
        g.addColorStop(1, "#fd0");
        x.fillStyle = g;
        x.beginPath();
        x.arc(60, 20, 22, 0, Math.PI * 2, true);
        x.arc(110, 20, 22, 0, Math.PI * 2, true);
        x.fill();
        x.globalCompositeOperation = "source-over";
        x.strokeStyle = "rgba(20,40,60,0.6)";
        x.lineWidth = 1.5;
        x.beginPath();
        x.moveTo(0, 12.5);
        x.bezierCurveTo(50, 5, 120, 35, 180, 9);
        x.stroke();
        p.push(c.toDataURL().slice(-120));
      } else {
        p.push("no2d");
      }
    } catch (e) {
      p.push("nofp");
    }

    var s = p.join("|");
    return h32(s, 0x811c9dc5) + h32(s, 0x1b873593) + h32(s, 0xcc9e2d51);
  }

  var DEVICE = fingerprint();

  /* ---------- Supabase RPC ---------- */
  function rpc(fn, body) {
    var url = LICENSE_CONFIG.supabaseUrl.replace(/\/+$/, "") + "/rest/v1/rpc/" + fn;
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: LICENSE_CONFIG.supabaseAnonKey,
        Authorization: "Bearer " + LICENSE_CONFIG.supabaseAnonKey
      },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error("HTTP " + r.status + " " + t.slice(0, 200));
        });
      }
      return r.json();
    });
  }

  /* ---------- 码格式化 ---------- */
  function normCode(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function formatCode(s) {
    var k = normCode(s).replace(/^XHS/, "");
    var out = [];
    for (var i = 0; i < k.length && i < 12; i += 4) out.push(k.slice(i, i + 4));
    return "XHS" + (out.length ? "-" + out.join("-") : "");
  }

  /* ---------- 跳激活页 ---------- */
  function openGate(reason) {
    if (isGatePage()) return;
    hidePage();
    var back = location.pathname + location.search + location.hash;
    var q = "?back=" + encodeURIComponent(back);
    if (reason) q += "&why=" + encodeURIComponent(reason);
    location.replace(GATE_URL + q);
  }

  /* ---------- 演示模式提示（没配 Supabase 时） ---------- */
  function showDemoBadge() {
    function go() {
      if (!document.body || document.getElementById("lic-demo-badge")) return;
      var d = document.createElement("div");
      d.id = "lic-demo-badge";
      d.textContent = "演示模式 · 未接入授权";
      d.style.cssText = [
        "position:fixed", "left:50%", "bottom:14px", "transform:translateX(-50%)",
        "z-index:99999", "padding:7px 14px", "border-radius:999px",
        "font:500 12px/1.5 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif",
        "background:rgba(20,24,20,.82)", "color:#c6f94a",
        "border:1px solid rgba(198,249,74,.35)", "backdrop-filter:blur(8px)",
        "pointer-events:none", "letter-spacing:.02em"
      ].join(";");
      document.body.appendChild(d);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", go);
    } else {
      go();
    }
  }

  /* ==========================================================
     ③ 对外接口
     ========================================================== */
  var LICENSE = {
    enabled: CONFIGURED,
    device: DEVICE,
    code: null,
    plan: null,
    expiresAt: null,
    token: null,
    usedRuns: 0,
    maxRuns: 0,
    runsLeft: null,
    app: LICENSE_CONFIG.app,
    rpc: rpc,
    gateUrl: GATE_URL,
    isGatePage: isGatePage,
    loadToken: loadToken,
    saveToken: saveToken,
    clearToken: clearToken,
    normCode: normCode,
    formatCode: formatCode,
    openGate: openGate,
    onChange: null
  };

  /* 扣次数 / 查剩余
     dry  = true 只查不扣，false 扣一次（测评出结果时调用）
     quiz = 测评标识（mental / wild / battery / love…）
            每个测评各算各的次数，A 测完了不影响 B */
  LICENSE.consume = function (dry, quiz) {
    if (!CONFIGURED || !LICENSE.code) {
      return Promise.resolve({ ok: true, unlimited: true, left: null });
    }
    return rpc("license_consume", {
      p_code: LICENSE.code,
      p_device: DEVICE,
      p_app: LICENSE.app,
      p_quiz: quiz || "all",
      p_dry: !!dry
    }).then(function (r) {
      if (r && typeof r.left === "number") {
        LICENSE.usedRuns = r.used;
        LICENSE.maxRuns = r.max;
        LICENSE.runsLeft = r.left;
        LICENSE.quiz = r.quiz || quiz || null;
      }
      return r;
    });
  };

  window.LICENSE = LICENSE;

  function apply(result, token) {
    LICENSE.code = token.code;
    LICENSE.plan = result.plan || token.plan || "basic";
    LICENSE.expiresAt = result.expires_at || null;
    LICENSE.token = token;
    if (typeof result.max_runs === "number") LICENSE.maxRuns = result.max_runs;
    if (typeof result.used_runs === "number") LICENSE.usedRuns = result.used_runs;
    if (typeof result.left === "number") LICENSE.runsLeft = result.left;
    token.plan = LICENSE.plan;
    token.device = DEVICE;
    token.ts = Date.now();
    saveToken(token);
    if (typeof LICENSE.onChange === "function") {
      try { LICENSE.onChange(LICENSE); } catch (e) {}
    }
  }

  /* ==========================================================
     ④ 拦截逻辑
     ========================================================== */

  if (!CONFIGURED) {
    if (!isGatePage() && !isFreePage()) showDemoBadge();
    return;
  }

  if (isFreePage() || isGatePage()) return;

  var token = loadToken();

  if (!token) {
    openGate("need");
    return;
  }

  // 先放行（不阻塞首屏），后台再核验
  LICENSE.code = token.code;
  LICENSE.plan = token.plan || "basic";
  LICENSE.token = token;

  // 距上次校验不足 N 小时就先不核验，减少请求
  var fresh =
    LICENSE_CONFIG.recheckHours > 0 &&
    token.ts &&
    Date.now() - token.ts < LICENSE_CONFIG.recheckHours * 3600 * 1000;

  if (!fresh) {
    rpc("license_check", {
      p_code: token.code,
      p_device: DEVICE,
      p_app: LICENSE_CONFIG.app
    })
      .then(function (r) {
        if (r && r.ok) {
          apply(r, token);
          return;
        }
        var reason = (r && r.reason) || "invalid";

        // 指纹漂移（换浏览器内核 / 系统升级）：自动重新绑定，别把付费用户挡在外面
        if (reason === "not_bound") {
          return rpc("license_redeem", {
            p_code: token.code,
            p_device: DEVICE,
            p_app: LICENSE_CONFIG.app,
            p_ua: navigator.userAgent
          }).then(function (r2) {
            if (r2 && r2.ok) {
              apply(r2, token);
            } else {
              clearToken();
              openGate((r2 && r2.reason) || reason);
            }
          });
        }

        clearToken();
        openGate(reason);
      })
      .catch(function () {
        // 网络异常不踢人，下次打开再试
      });
  }
})();
