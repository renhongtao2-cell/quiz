/* ============================================================
   测评引擎 quiz.js
   零依赖：封面 → 逐题作答 → 结果计算 → 结果卡（Canvas 生成可保存图片）
   用法：createQuiz({ ...config })
   ============================================================ */

(function (global) {
  "use strict";

  var LETTERS = ["A", "B", "C", "D", "E"];

  /* ---------------- 小工具 ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function toast(msg) {
    var t = $(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("on"); }, 1900);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ---------------- Canvas 文案排版辅助 ---------------- */

  var NO_LINE_START = "，。、；：？！）》」』】…·%,.!?:;)";

  function wrapLines(ctx, text, maxWidth) {
    var lines = [];
    var cur = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ctx.measureText(cur + ch).width > maxWidth && cur) {
        lines.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) lines.push(cur);

    // 避免标点出现在行首（中文排版规则）
    for (var j = 1; j < lines.length; j++) {
      var guard = 0;
      while (lines[j] && NO_LINE_START.indexOf(lines[j][0]) >= 0 && guard++ < 4) {
        lines[j - 1] += lines[j][0];
        lines[j] = lines[j].slice(1);
      }
    }
    return lines.filter(function (l) { return l.length > 0; });
  }

  function drawParagraph(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var lines = wrapLines(ctx, text, maxWidth);
    var cut = false;
    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      cut = true;
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (cut && i === lines.length - 1) {
        while (ctx.measureText(line + "…").width > maxWidth && line.length > 1) {
          line = line.slice(0, -1);
        }
        line += "…";
      }
      ctx.fillText(line, x, y + i * lineHeight);
    }
    return y + lines.length * lineHeight;
  }

  /* ---------------- 海报主题 ---------------- */

  var THEME_POSTER = {
    archive: { c1: "#0a0f0b", c2: "#1a2b16", ink: "#f0f6ec", sub: "#9db094", accent: "#c6f94a" },
    nature: { c1: "#f4efe2", c2: "#e2e8d6", ink: "#22251c", sub: "#6d7360", accent: "#2f5d43" },
    volt: { c1: "#050a14", c2: "#0d2b33", ink: "#eaf6ff", sub: "#8fb0c4", accent: "#43e7d1" },
    rose: { c1: "#fdf3f0", c2: "#f3ddd8", ink: "#38201e", sub: "#8d6d68", accent: "#a33b52" }
  };

  function posterTheme(cfg, result) {
    var base = THEME_POSTER[cfg.theme] || THEME_POSTER.archive;
    var p = result.poster || {};
    return {
      c1: p.c1 || base.c1,
      c2: p.c2 || base.c2,
      ink: p.ink || base.ink,
      sub: p.sub || base.sub,
      accent: p.accent || base.accent
    };
  }

  /* ---------------- 生成结果卡 ---------------- */

  function buildPoster(cfg, result, index) {
    var W = 750, H = 1000;
    var c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    var ctx = c.getContext("2d");
    var t = posterTheme(cfg, result);

    // 背景
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, t.c1);
    g.addColorStop(1, t.c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 装饰圆
    var rg = ctx.createRadialGradient(660, 130, 10, 660, 130, 420);
    rg.addColorStop(0, hexA(t.accent, 0.2));
    rg.addColorStop(1, hexA(t.accent, 0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(660, 130, 420, 0, Math.PI * 2);
    ctx.fill();

    // 编号水印
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = t.accent;
    ctx.font = '800 260px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(pad(index + 1), W - 48, 96);
    ctx.restore();

    var PAD = 56;

    // 顶部品牌
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = t.sub;
    ctx.font = '600 19px "PingFang SC", "Microsoft YaHei", sans-serif';
    if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
    ctx.fillText(cfg.posterBrand || cfg.brand, PAD, 76);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    // 顶部右侧日期
    ctx.textAlign = "right";
    ctx.fillStyle = hexA(t.sub, 0.75);
    ctx.font = '400 18px "PingFang SC", "Microsoft YaHei", sans-serif';
    var d = new Date();
    ctx.fillText(d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate()), W - PAD, 76);

    // 小标题
    ctx.textAlign = "left";
    ctx.fillStyle = t.accent;
    ctx.font = '700 18px "PingFang SC", "Microsoft YaHei", sans-serif';
    if ("letterSpacing" in ctx) ctx.letterSpacing = "5px";
    ctx.fillText(cfg.posterLabel || "MY RESULT", PAD, 200);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    // 主标题（自动缩字号适配）
    var nameSize = 88;
    ctx.fillStyle = t.ink;
    ctx.font = '800 ' + nameSize + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
    while (ctx.measureText(result.name).width > W - PAD * 2 && nameSize > 44) {
      nameSize -= 4;
      ctx.font = '800 ' + nameSize + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
    }
    ctx.fillText(result.name, PAD, 288);

    // 英文
    var y = 336;
    if (result.en) {
      ctx.fillStyle = hexA(t.accent, 0.92);
      ctx.font = '700 23px "PingFang SC", "Microsoft YaHei", sans-serif';
      if ("letterSpacing" in ctx) ctx.letterSpacing = "5px";
      ctx.fillText(result.en, PAD, y);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      y += 56;
    }

    // 一句话
    if (result.tagline) {
      ctx.fillStyle = t.ink;
      ctx.font = '600 32px "PingFang SC", "Microsoft YaHei", sans-serif';
      y = drawParagraph(ctx, result.tagline, PAD, y + 22, W - PAD * 2, 48, 2) + 8;
    }

    // 分割线
    y += 24;
    ctx.strokeStyle = hexA(t.ink, 0.16);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 42;

    // 描述
    if (result.desc) {
      ctx.fillStyle = hexA(t.sub, 0.95);
      ctx.font = '400 23px "PingFang SC", "Microsoft YaHei", sans-serif';
      y = drawParagraph(ctx, result.desc, PAD, y, W - PAD * 2, 40, 4) + 14;
    }

    // 特质标签（画成小胶囊）
    if (result.traits && result.traits.length) {
      y += 12;
      ctx.font = '600 21px "PingFang SC", "Microsoft YaHei", sans-serif';
      var tx = PAD;
      for (var i = 0; i < Math.min(result.traits.length, 4); i++) {
        var label = result.traits[i];
        var tw = ctx.measureText(label).width + 34;
        if (tx + tw > W - PAD) { tx = PAD; y += 54; }
        roundRect(ctx, tx, y - 24, tw, 42, 21);
        ctx.fillStyle = hexA(t.accent, 0.16);
        ctx.fill();
        ctx.fillStyle = t.accent;
        ctx.fillText(label, tx + 17, y + 4);
        tx += tw + 10;
      }
      y += 42;
    }

    // 稀有度
    if (result.rarity) {
      y += 20;
      var rarTxt = "同类型稀有度 " + result.rarity + "%";
      ctx.fillStyle = hexA(t.accent, 0.95);
      ctx.font = '700 22px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(rarTxt, PAD, y);
      var rarW = ctx.measureText(rarTxt).width;
      ctx.fillStyle = hexA(t.sub, 0.8);
      ctx.font = '400 21px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText("· " + rarityWord(result.rarity), PAD + rarW + 16, y);
      y += 24;
    }

    // 底部
    var by = H - 118;
    ctx.strokeStyle = hexA(t.ink, 0.14);
    ctx.beginPath();
    ctx.moveTo(PAD, by);
    ctx.lineTo(W - PAD, by);
    ctx.stroke();

    ctx.fillStyle = hexA(t.ink, 0.9);
    ctx.font = '600 22px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(cfg.posterCta || "你也来测一测 →", PAD, by + 48);

    ctx.textAlign = "right";
    ctx.fillStyle = hexA(t.sub, 0.8);
    ctx.font = '400 19px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(cfg.posterFoot || "仅供娱乐 · 不构成任何专业建议", W - PAD, by + 48);

    return c.toDataURL("image/png");
  }

  /* ---------------- 双人匹配卡 ---------------- */

  function fitSize(ctx, text, maxWidth, start, min, weight) {
    var size = start;
    ctx.font = (weight || 800) + " " + size + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
    while (ctx.measureText(text).width > maxWidth && size > min) {
      size -= 2;
      ctx.font = (weight || 800) + " " + size + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
    }
    return size;
  }

  function buildPairPoster(cfg, mine, friend, friendName, score, band) {
    var W = 750, H = 1000;
    var c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    var ctx = c.getContext("2d");
    var t = posterTheme(cfg, mine);

    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, t.c1);
    g.addColorStop(1, t.c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var rg = ctx.createRadialGradient(375, 560, 20, 375, 560, 460);
    rg.addColorStop(0, hexA(t.accent, 0.16));
    rg.addColorStop(1, hexA(t.accent, 0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(375, 560, 460, 0, Math.PI * 2);
    ctx.fill();

    var PAD = 56;

    // 顶部
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = t.sub;
    ctx.font = '600 19px "PingFang SC", "Microsoft YaHei", sans-serif';
    if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
    ctx.fillText(cfg.posterBrand || cfg.brand, PAD, 76);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    ctx.textAlign = "right";
    ctx.fillStyle = hexA(t.sub, 0.75);
    ctx.font = '400 18px "PingFang SC", "Microsoft YaHei", sans-serif';
    var d = new Date();
    ctx.fillText(d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate()), W - PAD, 76);

    // 小标题
    ctx.textAlign = "left";
    ctx.fillStyle = t.accent;
    ctx.font = '700 18px "PingFang SC", "Microsoft YaHei", sans-serif';
    if ("letterSpacing" in ctx) ctx.letterSpacing = "5px";
    ctx.fillText("MATCH REPORT", PAD, 176);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    // 两栏
    var colW = 282;
    var colY = 300;

    ctx.fillStyle = hexA(t.accent, 0.9);
    ctx.font = '700 20px "PingFang SC", "Microsoft YaHei", sans-serif';
    if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
    ctx.fillText("我", PAD, colY - 68);
    ctx.fillText(friendName, 398, colY - 68);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    ctx.fillStyle = t.ink;
    fitSize(ctx, mine.name, colW, 62, 30);
    ctx.fillText(mine.name, PAD, colY);

    ctx.fillStyle = t.ink;
    fitSize(ctx, friend.name, colW, 62, 30);
    ctx.fillText(friend.name, 398, colY);

    // 英文名
    ctx.font = '700 16px "PingFang SC", "Microsoft YaHei", sans-serif';
    if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
    ctx.fillStyle = hexA(t.sub, 0.85);
    if (mine.en) ctx.fillText(mine.en, PAD, colY + 40);
    if (friend.en) ctx.fillText(friend.en, 398, colY + 40);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    // 中间分隔
    ctx.strokeStyle = hexA(t.ink, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(375, colY - 108);
    ctx.lineTo(375, colY + 56);
    ctx.stroke();

    // 匹配度
    var num = String(score);
    ctx.textAlign = "left";
    ctx.font = '800 150px "PingFang SC", "Microsoft YaHei", sans-serif';
    var nw = ctx.measureText(num).width;
    ctx.font = '800 44px "PingFang SC", "Microsoft YaHei", sans-serif';
    var pw = ctx.measureText("%").width;
    var total = nw + 4 + pw;
    var sx = (W - total) / 2;

    ctx.fillStyle = t.accent;
    ctx.font = '800 150px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(num, sx, 560);
    ctx.font = '800 44px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText("%", sx + nw + 4, 552);

    // 匹配度说明
    ctx.textAlign = "center";
    ctx.fillStyle = hexA(t.sub, 0.85);
    ctx.font = '600 20px "PingFang SC", "Microsoft YaHei", sans-serif';
    if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
    ctx.fillText("匹 配 度", W / 2, 610);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    ctx.fillStyle = t.ink;
    ctx.font = '700 34px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(band.name, W / 2, 672);

    // 描述
    ctx.textAlign = "left";
    ctx.fillStyle = hexA(t.sub, 0.95);
    ctx.font = '400 24px "PingFang SC", "Microsoft YaHei", sans-serif';
    var lines = wrapLines(ctx, band.desc, W - PAD * 2 - 20);
    var startY = 736;
    for (var i = 0; i < Math.min(lines.length, 3); i++) {
      var line = lines[i];
      if (i === 2 && lines.length > 3) {
        while (ctx.measureText(line + "…").width > W - PAD * 2 && line.length > 1) line = line.slice(0, -1);
        line += "…";
      }
      var lw = ctx.measureText(line).width;
      ctx.fillText(line, (W - lw) / 2, startY + i * 40);
    }

    // 底部
    var by = H - 118;
    ctx.strokeStyle = hexA(t.ink, 0.14);
    ctx.beginPath();
    ctx.moveTo(PAD, by);
    ctx.lineTo(W - PAD, by);
    ctx.stroke();

    ctx.fillStyle = hexA(t.ink, 0.9);
    ctx.font = '600 22px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(cfg.posterPairCta || "你们也来测一测 →", PAD, by + 48);

    ctx.textAlign = "right";
    ctx.fillStyle = hexA(t.sub, 0.8);
    ctx.font = '400 19px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText("仅供娱乐 · 不构成任何专业建议", W - PAD, by + 48);

    return c.toDataURL("image/png");
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hexA(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function rarityWord(v) {
    if (v < 16) return "相当少见";
    if (v < 19) return "比较少见";
    if (v < 23) return "不算多见";
    return "还挺常见的";
  }

  /* ---------------- 主流程 ---------------- */

  var MATCH_BANDS = [
    { min: 85, name: "同频共振型", desc: "你们像同一个频道的两个电台，不用解释太多就能对上。舒服，但也容易一起卡在同一个坑里。" },
    { min: 72, name: "互补舒服型", desc: "你们刚好补上对方缺的那块。他拉你出门，你让他慢下来——前提是别急着改造对方。" },
    { min: 58, name: "需要磨合型", desc: "你们的默认设置不太一样，所以前期会有点累。但只要愿意把话说清楚，这段关系会很结实。" },
    { min: 0, name: "两个物种型", desc: "你们几乎是两种生物。要么互相看不顺眼，要么成为彼此最好奇的意外——没有中间态。" }
  ];

  function bandOf(score) {
    for (var i = 0; i < MATCH_BANDS.length; i++) {
      if (score >= MATCH_BANDS[i].min) return MATCH_BANDS[i];
    }
    return MATCH_BANDS[MATCH_BANDS.length - 1];
  }

  function matchScore(a, b) {
    if (!a || !b || !a.dims || !b.dims || !a.dims.length) return null;
    var n = Math.min(a.dims.length, b.dims.length);
    var sum = 0;
    for (var i = 0; i < n; i++) {
      sum += Math.abs((a.dims[i].v || 0) - (b.dims[i].v || 0));
    }
    var avg = sum / n;
    return Math.max(42, Math.min(97, Math.round(100 - avg * 1.05)));
  }

  function createQuiz(cfg) {
    var root = $("#app");
    var answers = [];
    var idx = 0;
    var locked = false;

    /* ---- 读取分享参数 ---- */
    var params = new URLSearchParams(location.search);
    var friendName = (params.get("n") || "").slice(0, 10).trim();
    var friendId = params.get("from") || "";
    var friend = null;
    if (friendId) {
      for (var fi = 0; fi < cfg.results.length; fi++) {
        if (cfg.results[fi].id === friendId) { friend = cfg.results[fi]; break; }
      }
    }
    if (friend && !friendName) friendName = "TA";

    var topbar = $("#topbar");
    var progress = $("#progress");
    var fill = $("#progress > i");

    function setChrome(show, cur, total) {
      if (!topbar) return;
      topbar.style.display = show ? "flex" : "none";
      progress.style.display = show ? "block" : "none";
      if (show) {
        $(".counter").textContent = pad(cur + 1) + " / " + pad(total);
        fill.style.width = ((cur) / total * 100) + "%";
      }
    }

    /* ---- 封面 ---- */
    function renderCover() {
      setChrome(false);
      root.innerHTML =
        '<div class="screen cover anim">' +
        '<div class="eyebrow">' + esc(cfg.eyebrow || "PERSONALITY TEST") + "</div>" +
        (friend
          ? '<div class="friend-banner">' +
            '<div class="fb-label">你的朋友 <b>' + esc(friendName) + "</b> 测出了</div>" +
            '<div class="fb-type">' + esc(friend.name) + (friend.en ? ' <span style="opacity:.5;font-size:12px;letter-spacing:.14em">' + esc(friend.en) + "</span>" : "") + "</div>" +
            '<div class="fb-tip">测完就能看到你们的匹配度 · 共 ' + cfg.questions.length + " 题</div>" +
            "</div>"
          : "") +
        "<h1>" + cfg.title + "</h1>" +
        '<p class="lede">' + esc(cfg.lede) + "</p>" +
        '<div class="meta-row">' +
        '<span class="chip solid">' + esc(cfg.metaMain) + "</span>" +
        (cfg.metaExtra || []).map(function (m) {
          return '<span class="chip">' + esc(m) + "</span>";
        }).join("") +
        "</div>" +
        (cfg.coverList
          ? '<ul class="cover-list">' + cfg.coverList.map(function (li) {
              return "<li><span>" + li + "</span></li>";
            }).join("") + "</ul>"
          : "") +
        '<div style="height:6px"></div>' +
        '<button class="btn primary block" id="startBtn">' + (friend ? "开始对答案" : "开始测试") + ' <span style="opacity:.6">→</span></button>' +
        '<p class="footnote">' + esc(cfg.coverFoot || "") + "</p>" +
        "</div>";

      $("#startBtn").addEventListener("click", function () {
        answers = [];
        idx = 0;
        renderQuestion(0);
      });
    }

    /* ---- 题目 ---- */
    function renderQuestion(i) {
      idx = i;
      var q = cfg.questions[i];
      setChrome(true, i, cfg.questions.length);
      fill.style.width = (i / cfg.questions.length * 100) + "%";

      var opts = q.opts.map(function (o, oi) {
        return (
          '<button class="opt" data-oi="' + oi + '">' +
          '<span class="key">' + LETTERS[oi] + "</span>" +
          "<span>" + esc(o.t) + "</span>" +
          "</button>"
        );
      }).join("");

      root.innerHTML =
        '<div class="screen anim q-wrap">' +
        '<div class="q-no">问题 ' + pad(i + 1) + "</div>" +
        '<h2 class="q-text">' + esc(q.q) + "</h2>" +
        '<div class="opts">' + opts + "</div>" +
        "</div>";

      $(".back").disabled = i === 0;

      var btns = root.querySelectorAll(".opt");
      Array.prototype.forEach.call(btns, function (b) {
        b.addEventListener("click", function () {
          if (locked) return;
          locked = true;
          b.classList.add("sel");
          var oi = Number(b.dataset.oi);
          answers[i] = oi;

          setTimeout(function () {
            locked = false;
            if (i + 1 < cfg.questions.length) {
              renderQuestion(i + 1);
            } else {
              fill.style.width = "100%";
              showResult();
            }
          }, 210);
        });
      });

      // 回显已选
      if (answers[i] != null) {
        btns[answers[i]].classList.add("sel");
      }
    }

    function goBack() {
      if (idx > 0) renderQuestion(idx - 1);
    }

    /* ---- 计分 ---- */
    function computeResult() {
      var score = {};
      cfg.results.forEach(function (r) { score[r.id] = 0; });
      cfg.questions.forEach(function (q, qi) {
        var o = q.opts[answers[qi]];
        if (!o || !o.s) return;
        for (var k in o.s) {
          score[k] = (score[k] || 0) + o.s[k];
        }
      });

      var ranked = cfg.results.slice().sort(function (a, b) {
        return (score[b.id] || 0) - (score[a.id] || 0);
      });
      return {
        top: ranked[0],
        second: ranked[1],
        score: score
      };
    }

    /* ---- 结果 ---- */
    /* 出结果前先扣一次使用次数；没接入授权时直接放行 */
    function showResult() {
      var lic = window.LICENSE;

      if (!lic || !lic.enabled || !lic.code) {
        renderResultNow();
        return;
      }

      root.innerHTML =
        '<div class="screen" style="display:flex;align-items:center;' +
        'justify-content:center;min-height:50vh;font-size:13.5px;' +
        'color:var(--muted);letter-spacing:.04em">正在生成结果…</div>';

      lic.consume(false, cfg.slug).then(function (r) {
        if (r && r.ok === false && r.reason === "no_runs") {
          renderNoRuns(r);
          return;
        }
        renderResultNow();
        if (r && typeof r.left === "number") showRunsLeft(r.left);
      }).catch(function () {
        // 网络异常不能挡住付了钱的用户
        renderResultNow();
      });
    }

    function licCode() {
      return (window.LICENSE && window.LICENSE.code) || "";
    }

    function showRunsLeft(left) {
      var box = root.querySelector(".screen.result");
      if (!box) return;
      var d = document.createElement("div");
      d.style.cssText =
        "margin:26px 0 0;padding:12px 14px;border-radius:12px;" +
        "border:1px solid var(--line);font-size:12.5px;line-height:1.65;" +
        "color:var(--muted);text-align:center";
      d.innerHTML = left > 0
        ? "本次已计入 · 这份测评还能测 <b style=\"color:var(--accent)\">" + left + "</b> 次"
        : "这是这份测评的<b style=\"color:var(--accent)\">最后一次</b>，已用完";
      box.appendChild(d);
    }

    function renderNoRuns(r) {
      setChrome(false);
      var max = (r && r.max) || 3;
      root.innerHTML =
        '<div class="screen result anim" style="text-align:center;padding:16vh 4px 0">' +
        '<div style="font-size:11px;letter-spacing:.22em;color:var(--muted);margin-bottom:20px">NO RUNS LEFT</div>' +
        '<h2 style="margin:0 0 16px;font-size:27px;letter-spacing:-.02em">这份测评的次数用完了</h2>' +
        '<p style="margin:0 auto 30px;max-width:22em;font-size:14px;line-height:1.9;color:var(--muted)">' +
        "这份测评的 " + max + " 次机会已经全部用完。<br>其他测评还能正常测。</p>" +
        '<button class="btn primary block" id="copyCodeBtn">复制我的码，去联系卖家</button>' +
        '<p style="margin:16px 0 0;font-size:12px;color:var(--muted);opacity:.7">' +
        esc(licCode()) + "</p>" +
        "</div>";

      var b = $("#copyCodeBtn");
      if (b) {
        b.addEventListener("click", function () {
          copyText(licCode());
          toast("已复制，发给卖家就行");
        });
      }
    }

    function renderResultNow() {
      setChrome(false);
      var res = computeResult();
      var r = res.top;
      var index = cfg.results.indexOf(r);

      var bars = (r.dims || []).map(function (d) {
        return (
          '<div class="bar-row">' +
          '<div class="bar-top"><span>' + esc(d.k) + "</span><b>" + d.v + "</b></div>" +
          '<div class="bar-track"><i class="bar-fill" data-v="' + d.v + '"></i></div>' +
          "</div>"
        );
      }).join("");

      // 与朋友的对答案结果
      var score = friend ? matchScore(r, friend) : null;
      var band = score != null ? bandOf(score) : null;
      var matchHtml = "";
      if (friend && score != null) {
        matchHtml =
          '<div class="match-card">' +
          '<div class="match-title">你和「' + esc(friendName) + "」的匹配度</div>" +
          '<div class="match-score">' + score + "<span>%</span></div>" +
          '<div class="match-band">' + esc(band.name) + "</div>" +
          '<div class="match-desc">' + esc(band.desc) + "</div>" +
          '<div class="match-vs">' +
          "<span>" + esc(r.name) + "</span>" +
          '<i>×</i>' +
          "<span>" + esc(friend.name) + "</span>" +
          "</div>" +
          '<button class="btn primary block" id="pairBtn" style="margin-top:6px">生成我们的卡片</button>' +
          "</div>";
      }

      root.innerHTML =
        '<div class="screen result anim">' +
        '<div class="result-head">' +
        '<div class="big-index">' + pad(index + 1) + "</div>" +
        '<div class="r-label">' + esc(cfg.resultLabel || "RESULT") + "</div>" +
        '<h2 class="r-name">' + esc(r.name) + "</h2>" +
        (r.en ? '<div class="r-en">' + esc(r.en) + "</div>" : "") +
        "</div>" +
        '<p class="r-tagline">' + esc(r.tagline) + "</p>" +
        '<div class="rarity"><span>和你同类型的人占</span><b>' + r.rarity + "%</b>" +
        "<span style=\"opacity:.7\">· " + rarityWord(r.rarity) + "</span></div>" +
        matchHtml +
        '<p class="r-desc">' + esc(r.desc) + "</p>" +
        '<hr class="divider">' +
        (bars ? '<div><div class="r-label" style="margin-bottom:14px">' +
          esc(cfg.dimLabel || "五维分布") + "</div><div class=\"bars\">" + bars + "</div></div>" : "") +
        (res.second
          ? '<div class="block-card"><h4>隐藏特质</h4><p>你身上还带着一点「' +
            esc(res.second.name) + "」的影子 — " + esc(res.second.tagline) + "</p></div>"
          : "") +
        '<div class="pair">' +
        '<div class="block-card"><h4>与你合拍</h4><p>' + esc(r.like) + "</p></div>" +
        '<div class="block-card"><h4>你的雷区</h4><p>' + esc(r.avoid) + "</p></div>" +
        "</div>" +
        (r.traits
          ? '<div class="block-card"><h4>' + esc(cfg.traitsLabel || "特征关键词") + "</h4>" +
            '<div class="tags">' + r.traits.map(function (x) {
              return '<span class="tag">' + esc(x) + "</span>";
            }).join("") + "</div></div>"
          : "") +
        (r.quote ? '<blockquote class="quote">' + esc(r.quote) + "</blockquote>" : "") +
        '<div class="btn-row">' +
        '<button class="btn ' + (friend ? "ghost" : "primary") + '" id="posterBtn">生成结果卡</button>' +
        '<button class="btn ghost" id="shareBtn">邀请对答案</button>' +
        "</div>" +
        '<div class="link-row">' +
        '<button class="link-btn" id="copyBtn">复制分享文案</button>' +
        '<button class="link-btn" id="againBtn">再测一次</button>' +
        "</div>" +
        '<p class="footnote">' + esc(cfg.footnote || "本测试仅供娱乐参考，不构成任何心理学诊断或专业建议。") + "</p>" +
        "</div>";

      // 维度条动画
      requestAnimationFrame(function () {
        Array.prototype.forEach.call(root.querySelectorAll(".bar-fill"), function (b) {
          b.style.width = b.dataset.v + "%";
        });
      });

      /* ---- 分享链接 / 文案 ---- */
      function shareUrl(id, name) {
        var base = location.href.split("#")[0].split("?")[0];
        var q = "?from=" + encodeURIComponent(id);
        if (name) q += "&n=" + encodeURIComponent(name);
        return base + q;
      }

      function caption(id, name) {
        var plainTitle = cfg.title.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "");
        var lines = [
          "我在《" + plainTitle + "》测出：",
          r.name + (r.en ? " · " + r.en : ""),
          "「" + r.tagline + "」",
          "和你同类型的人占 " + r.rarity + "%",
          cfg.questions.length + " 题，1 分钟出结果。",
          "你也来测 → " + shareUrl(id, name)
        ];
        if (cfg.hashtags && cfg.hashtags.length) lines.push(cfg.hashtags.join(" "));
        return lines.join("\n");
      }

      function openShare() {
        var mask = document.createElement("div");
        mask.className = "poster-mask";
        mask.innerHTML =
          '<div class="sheet-box">' +
          "<h3>邀请朋友对答案</h3>" +
          "<p>朋友打开链接会先看到你的结果，测完自动生成你们的匹配度和双人卡。昵称留空就显示「TA」。</p>" +
          '<div><label>你的昵称</label><input id="nickInput" maxlength="10" placeholder="比如：小 A"></div>' +
          '<div><label>分享链接</label><input id="linkInput" readonly></div>' +
          '<div class="poster-actions">' +
          '<button class="btn primary" id="copyCap">复制文案 + 链接</button>' +
          '<button class="btn ghost" id="closeSheet">关闭</button>' +
          "</div>" +
          "</div>";

        document.body.appendChild(mask);
        requestAnimationFrame(function () { mask.classList.add("on"); });

        var nick = $("#nickInput", mask);
        var link = $("#linkInput", mask);

        function refresh() {
          link.value = shareUrl(r.id, nick.value.trim());
        }
        refresh();

        nick.addEventListener("input", refresh);
        link.addEventListener("click", function () { link.select(); });

        $("#copyCap", mask).addEventListener("click", function () {
          copyText(caption(r.id, nick.value.trim())).then(function (ok) {
            toast(ok ? "文案已复制，去发给 TA 吧" : "复制失败，请长按手动选择");
          });
        });

        mask.addEventListener("click", function (e) {
          if (e.target === mask || e.target.id === "closeSheet") {
            mask.classList.remove("on");
            setTimeout(function () { mask.remove(); }, 260);
          }
        });
      }

      $("#againBtn").addEventListener("click", function () {
        answers = [];
        renderCover();
      });

      $("#copyBtn").addEventListener("click", function () {
        copyText(caption(r.id, "")).then(function (ok) {
          toast(ok ? "分享文案已复制" : "复制失败，请手动选择文字");
        });
      });

      $("#shareBtn").addEventListener("click", openShare);

      $("#posterBtn").addEventListener("click", function () {
        openPoster(buildPoster(cfg, r, index), r.name);
      });

      var pairBtn = $("#pairBtn");
      if (pairBtn) {
        pairBtn.addEventListener("click", function () {
          openPoster(buildPairPoster(cfg, r, friend, friendName, score, band), "match");
        });
      }
    }

    /* ---- 海报弹层 ---- */
    function openPoster(dataUrl, name) {
      var mask = document.createElement("div");
      mask.className = "poster-mask";
      mask.innerHTML =
        '<div class="poster-box">' +
        '<img src="' + dataUrl + '" alt="结果卡">' +
        '<div class="poster-actions">' +
        '<a class="btn primary" download="' + esc(cfg.slug || "result") + "-" + esc(name) + '.png" href="' + dataUrl + '">保存图片</a>' +
        '<button class="btn ghost" id="closePoster">关闭</button>' +
        "</div>" +
        '<div class="poster-hint">手机端长按图片也可保存 · 尺寸 750×1000，适配小红书竖版</div>' +
        "</div>";

      document.body.appendChild(mask);
      requestAnimationFrame(function () { mask.classList.add("on"); });

      mask.addEventListener("click", function (e) {
        if (e.target === mask || e.target.id === "closePoster") {
          mask.classList.remove("on");
          setTimeout(function () { mask.remove(); }, 260);
        }
      });
    }

    /* ---- 启动 ---- */
    var backBtn = $(".back");
    if (backBtn) backBtn.addEventListener("click", goBack);

    if (location.hash === "#result" && sessionStorage.getItem("quiz-" + cfg.slug)) {
      // 预留：直接看结果
    }
    renderCover();

    return { cover: renderCover };
  }

  global.createQuiz = createQuiz;
})(window);
