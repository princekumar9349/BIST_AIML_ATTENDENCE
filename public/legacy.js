
    /* ============================================================================
     * BIST BHOPAL & BGI - AIML DEPARTMENT ATTENDANCE SYSTEM (v4.5 TURBO FRONTEND)
     * HOD: Dr. Rashmi Singh  |  Developed by Devlinkhub Team (https://devlinkhub.in)
     * Optimizations: Skeleton Shimmer UI + Persistent Student Cache + Deduplication
     * ============================================================================ */

    const $ = s => document.querySelector(s);
    const DEPT_NAME = 'Department of AIML';
    const HOD_NAME = 'Dr. Rashmi Singh';
    const COLLEGE_NAME = 'Bansal Institute of Science & Technology (BIST), Bhopal';
    const GROUP_NAME = 'Bansal Group of Institutes (BGI)';
    const DEVLINK_URL = 'https://devlinkhub.in';

    // Your Live Google Apps Script Execution URL
    const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbzI0TWb3nKKJFJiGOWdvVfhpWwNXu1tJ0ryNS7xpUa_BQc1N946-2gtUPuznhWBLc7r4Q/exec";
    let GAS_URL = DEFAULT_GAS_URL;
    try { localStorage.removeItem('bist_gas_url'); } catch (e) { }

    // Resolve the API URL from the stable Apps Script deployment so all
    // devices use the same centrally configured endpoint.
    async function loadSharedAppsScriptUrl() {
      try {
        const response = await fetch(DEFAULT_GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ fn: 'getAppsScriptUrl', args: [] }),
          cache: 'no-store'
        });
        const payload = await response.json();
        const value = payload?.data;
        if (payload?.ok && validAppsScriptUrl(value)) GAS_URL = value;
      } catch (error) {
        console.warn('Could not load shared Apps Script URL; using the default endpoint.', error);
      }
    }

    // Cache TTL Rules (in milliseconds)
    const STUDENT_TTL_MS = 5 * 60 * 1000; // 5 minutes persistent student cache (no repeated fetching!)
    const STAFF_TTL_MS = 45 * 1000;       // 45 seconds fast in-memory cache for staff

    const S = {
      token: null,
      user: null,
      classId: '',
      classes: [],
      subjects: [],
      teachers: [],
      minPct: 75,
      tab: '',
      onlyDefaulters: false,
      absDate: '',
      reportFrom: '',
      reportTo: ''
    };

    let M = null;
    let LOGIN = { mode: 'student', branch: '', sem: '', classId: '' };
    let PUBLIC_CLASSES = [];
    let busyCount = 0;

    // Fast In-Memory Cache & Pending Request Deduplicator
    const MEM_CACHE = {};
    const IN_FLIGHT = {};

    /* ---------------- High-Precision Inline SVG Crests + Image Logos ---------------- */
    const SVG_BIST_FALLBACK = `<svg viewBox="0 0 120 120" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <circle cx="60" cy="60" r="56" fill="#991b1b" stroke="#7f1d1d" stroke-width="2.5"/>
  <circle cx="60" cy="60" r="42" fill="#ffffff" stroke="#1e293b" stroke-width="2"/>
  <circle cx="60" cy="60" r="35" fill="#ffffff" stroke="#991b1b" stroke-width="4" stroke-dasharray="5 3.5"/>
  <circle cx="60" cy="60" r="28" fill="#fefce8" stroke="#c5a059" stroke-width="1.5"/>
  <text x="60" y="15" text-anchor="middle" fill="#ffffff" font-size="7.5" font-weight="900" font-family="sans-serif" letter-spacing="0.5">BANSAL INSTITUTE</text>
  <text x="60" y="54" text-anchor="middle" fill="#991b1b" font-size="15" font-weight="900" font-family="sans-serif">BIST</text>
  <text x="60" y="67" text-anchor="middle" fill="#0a192f" font-size="8.5" font-weight="800" font-family="sans-serif">AIML • BHOPAL</text>
  <path d="M22 98 Q60 88 98 98 L94 112 Q60 103 26 112 Z" fill="#991b1b" stroke="#ffffff" stroke-width="1.2"/>
  <text x="60" y="106" text-anchor="middle" fill="#ffffff" font-size="8" font-weight="900" font-family="sans-serif" letter-spacing="0.6">BIST, BHOPAL</text>
</svg>`;

    const SVG_BGI_FALLBACK = `<svg viewBox="0 0 175 96" width="68" height="38" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 10 L44 3 L78 10 L78 48 C78 72 44 90 44 90 C44 90 10 72 10 48 Z" fill="#ffffff" stroke="#0a192f" stroke-width="4.5"/>
  <path d="M15 14 L44 8 L73 14 L73 47 C73 67 44 83 44 83 C44 83 15 67 15 47 Z" fill="none" stroke="#c5a059" stroke-width="2.2"/>
  <text x="44" y="50" text-anchor="middle" fill="#0a192f" font-size="24" font-weight="900" stroke="#c5a059" stroke-width="0.8" font-family="sans-serif">BGI</text>
  <text x="44" y="68" text-anchor="middle" fill="#c5a059" font-size="8" font-weight="900">BGI GROUP</text>
  <text x="86" y="34" fill="#0a192f" font-size="21" font-weight="900" font-family="serif" letter-spacing="0.5">BANSAL</text>
  <text x="86" y="49" fill="#0a192f" font-size="8.2" font-weight="800" font-family="sans-serif" letter-spacing="0.4">GROUP OF INSTITUTES</text>
  <rect x="86" y="56" width="84" height="15" rx="2" fill="#c5a059"/>
  <text x="128" y="66" text-anchor="middle" fill="#ffffff" font-size="6.5" font-weight="800" font-family="sans-serif">BHOPAL | INDORE | MANDIDEEP</text>
</svg>`;

    function renderLogos(size = 'md') {
      const h = size === 'lg' ? '52px' : size === 'sm' ? '26px' : '34px';
      return `
    <div class="logo-pill" style="padding:${size === 'lg' ? '6px 12px' : '3px 7px'}">
      <img src="bistimages.jpg" alt="BIST Bhopal" style="height:${h};width:auto;border-radius:6px"
           onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <span style="display:none;line-height:0">${SVG_BIST_FALLBACK}</span>
      <div class="logo-sep" style="height:${size === 'lg' ? '34px' : '20px'}"></div>
      <img src="bansal....png" alt="BGI Group" style="height:${h};width:auto;max-width:${size === 'lg' ? '125px' : '82px'};border-radius:6px"
           onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <span style="display:none;line-height:0">${SVG_BGI_FALLBACK}</span>
    </div>
  `;
    }

    function devFooterHTML() {
      return `
    <footer class="dev-footer">
      <div class="logos">${renderLogos('sm')}</div>
      <div style="font-size:11.5px;font-weight:900;color:var(--navy);margin-bottom:2px">BANSAL INSTITUTE OF SCIENCE & TECHNOLOGY, BHOPAL</div>
      <div style="font-size:10.5px;font-weight:800;color:var(--gold-dark);margin-bottom:2px">BANSAL GROUP OF INSTITUTES (BGI)</div>
      <div style="font-size:10.5px;font-weight:700;color:var(--mu);margin-bottom:8px">Department of AIML (Artificial Intelligence & Machine Learning) • HOD: ${HOD_NAME}</div>
      <a href="${DEVLINK_URL}" target="_blank" rel="noopener noreferrer" class="dev-credit">Developed by Devlinkhub Team</a>
    </footer>
  `;
    }

    /* ---------------- SKELETON SHIMMER TEMPLATES ---------------- */
    function skStudent() {
      return `
        <div class="card" style="text-align:center;padding:20px 15px">
          <div class="sk sk-circle" style="width:130px;height:130px;margin:0 auto 14px"></div>
          <div class="sk" style="height:18px;width:55%;margin:0 auto 8px"></div>
          <div class="sk" style="height:13px;width:40%;margin:0 auto 12px"></div>
          <div class="sk sk-pill" style="height:26px;width:65%;margin:0 auto"></div>
        </div>
        <div class="sk" style="height:14px;width:48%;margin:14px 4px 10px"></div>
        ${[1, 2, 3].map(() => `
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <div style="width:65%">
                <div class="sk" style="height:15px;width:85%;margin-bottom:6px"></div>
                <div class="sk" style="height:11px;width:50%"></div>
              </div>
              <div class="sk" style="height:24px;width:50px"></div>
            </div>
            <div class="sk sk-pill" style="height:8px;width:100%;margin-bottom:8px"></div>
            <div class="sk" style="height:11px;width:40%"></div>
          </div>
        `).join('')}
      `;
    }

    function skReport() {
      return `
        <div class="row3" style="margin-bottom:12px">
          ${[1, 2, 3].map(() => `
            <div class="card" style="margin:0;padding:14px 10px;text-align:center">
              <div class="sk" style="height:24px;width:50%;margin:0 auto 6px"></div>
              <div class="sk" style="height:10px;width:70%;margin:0 auto"></div>
            </div>
          `).join('')}
        </div>
        <div class="card">
          <div class="row2" style="margin-bottom:12px">
            <div class="sk" style="height:34px;border-radius:9px"></div>
            <div class="sk" style="height:34px;border-radius:9px"></div>
          </div>
          <div class="sk" style="height:38px;width:100%;border-radius:11px;margin-bottom:12px"></div>
          ${[1, 2, 3, 4, 5, 6].map(() => `
            <div class="sk" style="height:32px;width:100%;margin-bottom:6px;border-radius:6px"></div>
          `).join('')}
        </div>
      `;
    }

    function skList(rows = 5) {
      return `
        <div class="card">
          <div class="sk" style="height:18px;width:52%;margin-bottom:8px"></div>
          <div class="sk" style="height:12px;width:75%;margin-bottom:16px"></div>
          ${Array.from({ length: rows }).map(() => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--ln)">
              <div style="width:68%">
                <div class="sk" style="height:14px;width:80%;margin-bottom:6px"></div>
                <div class="sk" style="height:11px;width:45%"></div>
              </div>
              <div class="sk" style="height:30px;width:68px;border-radius:9px"></div>
            </div>
          `).join('')}
        </div>
      `;
    }

    /* ---------------- Utilities & Persistent LocalStorage Cache ---------------- */
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const today = () => {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };

    function timeAgo(ts) {
      if (!ts) return 'Just now';
      const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (sec < 30) return 'Just now';
      if (sec < 60) return sec + 's ago';
      const min = Math.floor(sec / 60);
      if (min < 60) return min + 'm ago';
      const hr = Math.floor(min / 60);
      return hr + 'h ago';
    }

    function isGasEnv() {
      return (typeof google !== 'undefined' && google.script && google.script.run) || Boolean(typeof GAS_URL !== 'undefined' && GAS_URL && !GAS_URL.includes('YOUR_SCRIPT_ID_HERE'));
    }

    function updateNetStatus() {
      const b = $('#net-banner');
      const txt = $('#net-banner-text');
      if (!b || !txt) return;
      if (!navigator.onLine) {
        b.className = 'offline';
        txt.textContent = 'Offline / Low Network Mode — Viewing saved data from phone memory!';
      } else if (!isGasEnv()) {
        b.className = 'gas-ready';
        txt.textContent = 'Ready for Google Apps Script connection.';
      } else {
        b.className = '';
      }
    }
    window.addEventListener('online', updateNetStatus);
    window.addEventListener('offline', updateNetStatus);

    function cacheSet(key, val) {
      const entry = { ts: Date.now(), data: val };
      MEM_CACHE[key] = entry;
      try { localStorage.setItem('bist_v4_' + key, JSON.stringify(entry)); } catch (e) { }
    }

    function cacheGetEntry(key) {
      if (MEM_CACHE[key]) return MEM_CACHE[key];
      try {
        const raw = localStorage.getItem('bist_v4_' + key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        MEM_CACHE[key] = parsed;
        return parsed;
      } catch (e) { return null; }
    }

    function cacheGet(key) {
      const entry = cacheGetEntry(key);
      return entry ? entry.data : null;
    }

    function isCacheFresh(key, ttlMs) {
      const entry = cacheGetEntry(key);
      if (!entry || !entry.ts) return false;
      return (Date.now() - entry.ts) < ttlMs;
    }

    function clearWriteCaches() {
      const keys = new Set(Object.keys(MEM_CACHE));
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('bist_v4_')) keys.add(key.slice('bist_v4_'.length));
        }
      } catch (e) { }
      keys.forEach(k => {
        if (k === 'public_classes') return;
        delete MEM_CACHE[k];
        try { localStorage.removeItem('bist_v4_' + k); } catch (e) { }
      });
    }

    function fnCacheKey(fn, args) {
      try { return 'rpc_' + fn + '_' + JSON.stringify(args || []); } catch (e) { return 'rpc_' + fn; }
    }

    function toast(msg) {
      const t = $('#toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => t.classList.remove('show'), 3000);
    }

    function busy(delta) {
      busyCount += delta;
      const bar = $('#loader');
      if (busyCount > 0) {
        bar.style.width = '84%';
      } else {
        busyCount = 0;
        bar.style.width = '100%';
        setTimeout(() => { if (busyCount === 0) bar.style.width = '0%'; }, 240);
      }
    }

    /* Custom Non-Blocking Modals */
    function closeModal() {
      $('#modal-backdrop').classList.remove('open');
    }

    function showConfirmModal(title, message, confirmText, isDanger, onConfirm) {
      const m = $('#modal-content');
      m.innerHTML = `
    <h4>${esc(title)}</h4>
    <p>${esc(message)}</p>
    <div class="row2" style="margin-top:14px">
      <button class="btn sec" onclick="closeModal()">Cancel</button>
      <button class="btn ${isDanger ? 'red' : 'gold'}" id="modal-ok-btn">${esc(confirmText || 'Confirm')}</button>
    </div>
  `;
      $('#modal-backdrop').classList.add('open');
      $('#modal-ok-btn').onclick = () => { closeModal(); onConfirm(); };
    }

    function showPromptModal(title, message, placeholder, defaultVal, onSubmit) {
      const m = $('#modal-content');
      m.innerHTML = `
    <h4>${esc(title)}</h4>
    <p>${esc(message)}</p>
    <input id="modal-inp" class="inp" value="${esc(defaultVal ?? '')}" placeholder="${esc(placeholder || '')}" style="margin-bottom:14px">
    <div class="row2">
      <button class="btn sec" onclick="closeModal()">Cancel</button>
      <button class="btn gold" id="modal-sub-btn">Save</button>
    </div>
  `;
      $('#modal-backdrop').classList.add('open');
      const inp = $('#modal-inp');
      setTimeout(() => { inp.focus(); inp.select(); }, 50);
      inp.onkeydown = e => { if (e.key === 'Enter') $('#modal-sub-btn').click(); };
      $('#modal-sub-btn').onclick = () => {
        const val = inp.value.trim();
        if (val === '') return toast('Please enter a value');
        closeModal();
        onSubmit(val);
      };
    }

    function copyText(text, successMsg) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        toast(successMsg || 'Copied to clipboard');
      } catch (e) {
        toast('Could not copy text');
      }
      document.body.removeChild(ta);
    }

    /* ---------------- TURBO API ENGINE (Deduplicated + Cached) ---------------- */
    const CACHEABLE = [
      'publicClasses', 'listClasses', 'listTeachers', 'listSubjects',
      'listStudents', 'getAttendanceSheet', 'getAbsentees', 'getSummary',
      'getSummaryByDateRange', 'getSettings', 'getMyAttendance'
    ];
    const ckey = (fn, a) => fnCacheKey(fn, fn === 'publicClasses' ? [] : (a || []).slice(1));

    async function rawPost(fn, args) {
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ fn, args })
      });
      const json = await res.json();
      const isOk = json.ok !== undefined ? json.ok : (json.status === 'ok');
      const data = json.data !== undefined ? json.data : (json.result !== undefined ? json.result : json);
      if (!isOk) throw new Error(json.error || json.message || 'Server error');
      return data;
    }

    async function run(fn, ...a) {
      const isRead = CACHEABLE.includes(fn);
      const key = ckey(fn, a);

      // Deduplicate identical in-flight read requests
      if (isRead && IN_FLIGHT[key]) {
        return IN_FLIGHT[key];
      }

      const task = (async () => {
        busy(1);
        try {
          const data = await rawPost(fn, a);
          busy(-1);
          if (isRead) {
            cacheSet(key, data);
          } else {
            // Any write operation invalidates staff read caches so UI stays fresh
            clearWriteCaches();
          }
          return data;
        } catch (e) {
          busy(-1);
          const cached = cacheGet(key);
          if (cached !== null && isRead) {
            toast('Low Network: Showing saved campus data');
            return cached;
          }
          const msg = e.message || String(e);
          if (/Session expired/i.test(msg)) {
            toast('Session expired');
            setTimeout(() => logout(true), 800);
          } else {
            toast('Error: ' + msg.replace(/^Error:\s*/i, ''));
          }
          return undefined;
        } finally {
          delete IN_FLIGHT[key];
        }
      })();

      if (isRead) IN_FLIGHT[key] = task;
      return task;
    }

    async function call(fn, ...args) {
      return await run(fn, S.token, ...args);
    }

    const saveSession = (tk, userObj) => {
      try {
        if (tk && userObj) {
          localStorage.setItem('att_tk_v4', tk);
          localStorage.setItem('att_usr_v4', JSON.stringify(userObj));
        } else {
          localStorage.removeItem('att_tk_v4');
          localStorage.removeItem('att_usr_v4');
        }
      } catch (e) { }
    };

    /* ============================================================================
     * 1. INITIALIZATION & INSTANT SESSION RESUME
     * ============================================================================ */
    async function init() {
      updateNetStatus();
      S.absDate = today();

      let tk = null, savedUser = null;
      try {
        tk = localStorage.getItem('att_tk_v4');
        const rawU = localStorage.getItem('att_usr_v4');
        if (rawU) savedUser = JSON.parse(rawU);
      } catch (e) { }

      // Instant boot from localStorage session without waiting for network roundtrip!
      if (tk && savedUser) {
        await start({ token: tk, user: savedUser });
        // Verify token silently in background
        run('resume', tk).then(r => {
          // A delayed resume response must never log out a newer session.
          if ((!r || !r.user) && S.token === tk) logout(true);
        }).catch(() => { });
        return;
      }

      if (tk) {
        try {
          const r = await run('resume', tk);
          if (r && r.user) { await start(r); return; }
        } catch (e) {
          saveSession(null, null);
        }
      }
      vLogin();
    }

    async function vLogin() {
      const isStu = LOGIN.mode === 'student';
      let lastEnr = '';
      try { lastEnr = localStorage.getItem('bist_last_enr') || ''; } catch (e) { }

      $('#app').innerHTML = `
    <div style="background:linear-gradient(150deg, var(--navy) 0%, var(--navy-2) 60%, var(--navy-3) 100%);min-height:100vh;padding:22px 16px;display:flex;flex-direction:column;justify-content:space-between;color:#fff">
      <div>
        <div style="display:flex;justify-content:center;margin-top:8px;margin-bottom:14px">
          ${renderLogos('lg')}
        </div>
        <div style="text-align:center;margin-bottom:18px">
          <div style="display:inline-block;background:rgba(197,160,89,0.2);border:1px solid var(--gold);color:var(--gold);font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:999px;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px">
            BANSAL GROUP OF INSTITUTES (BGI)
          </div>
          <h1 style="margin:0;font-size:18px;font-weight:900;letter-spacing:-0.01em;color:#fff;line-height:1.25">
            BANSAL INSTITUTE OF SCIENCE & TECHNOLOGY, BHOPAL
          </h1>
          <p style="margin:5px 0 2px;font-size:13.5px;font-weight:800;color:var(--gold)">
            Department of AIML (Artificial Intelligence & Machine Learning)
          </p>
          <p style="margin:0;font-size:12.5px;color:#cbd5e1;font-weight:700">
            HOD: <b style="color:#fff">${HOD_NAME}</b>
          </p>
        </div>

        <div class="card" style="color:var(--tx);padding:18px;border-radius:20px;border:2px solid var(--gold)">
          <div class="seg">
            <button class="${isStu ? 'on' : ''}" onclick="LOGIN.mode='student';vLogin()">Student Portal</button>
            <button class="${!isStu ? 'on' : ''}" onclick="LOGIN.mode='staff';vLogin()">HOD / Faculty</button>
          </div>

          ${isStu ? `
            <div id="stu-login-box">
              <label class="lbl">Select Class (Branch • Sem • Section)</label>
              <select id="l-class" class="inp" onchange="LOGIN.classId=this.value">
                <option value="">Loading classes…</option>
              </select>
              <button class="btn sm outline" style="margin-top:7px" onclick="refreshLoginClasses()">Refresh class list</button>

              <div id="stu-quick-chips" class="chips" style="margin-top:8px"></div>

              <label class="lbl">Enrollment Number</label>
              <input id="l-enr" class="inp" value="${esc(lastEnr)}" placeholder="e.g. 0112AL231001" autocapitalize="characters"
                     style="text-transform:uppercase;font-family:monospace"
                     onkeydown="if(event.key==='Enter')doStudent()">

              <button id="student-login-btn" class="btn gold" style="margin-top:14px" onclick="doStudent()" disabled>
                View My Attendance
              </button>
            </div>
          ` : `
            <div>
              <label class="lbl">Faculty / HOD Username</label>
              <input id="l-user" class="inp" placeholder="Enter username (e.g. hod)" autocapitalize="none" autocomplete="username">

              <label class="lbl">Password</label>
              <input id="l-pass" class="inp" type="password" placeholder="Enter password" autocomplete="current-password"
                     onkeydown="if(event.key==='Enter')doStaff()">

              <button class="btn" style="margin-top:14px" onclick="doStaff()">
                Secure Staff Login
              </button>
            </div>
          `}
        </div>
      </div>

      <div style="text-align:center;margin-top:20px">
        <div style="font-size:11px;color:#cbd5e1;margin-bottom:6px">Bhopal • Indore • Mandideep</div>
        <a href="${DEVLINK_URL}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid var(--gold);color:var(--gold);font-size:11px;font-weight:800;padding:5px 14px;border-radius:999px;letter-spacing:0.06em;text-transform:uppercase;text-decoration:none">
          Developed by Devlinkhub Team
        </a>
      </div>
    </div>
  `;

      if (isStu) {
        loadPublicClassesForLogin();
      }
    }

    function renderPublicClassesDropdown(list) {
      const sel = $('#l-class');
      const chips = $('#stu-quick-chips');
      if (!sel) return;
      PUBLIC_CLASSES = list;
      if (!list.length) {
        sel.innerHTML = `<option value="">No classes created yet (Contact HOD)</option>`;
        sel.disabled = true;
        const loginButton = $('#student-login-btn');
        if (loginButton) loginButton.disabled = true;
        return;
      }
      let savedCid = '';
      try { savedCid = localStorage.getItem('bist_last_cid') || ''; } catch (e) { }
      if (!LOGIN.classId && savedCid && list.some(c => c.id === savedCid)) {
        LOGIN.classId = savedCid;
      }
      if (!LOGIN.classId || !list.some(c => c.id === LOGIN.classId)) {
        LOGIN.classId = list[0].id;
      }
      sel.innerHTML = list.map(c =>
        `<option value="${esc(c.id)}" ${c.id === LOGIN.classId ? 'selected' : ''}>${esc(c.branch)} • Sem ${esc(c.sem)} • Sec ${esc(c.section)}</option>`
      ).join('');
      sel.disabled = false;
      const loginButton = $('#student-login-btn');
      if (loginButton) loginButton.disabled = false;

      if (chips && list.length > 1) {
        chips.innerHTML = list.map(c =>
          `<button class="chip ${c.id === LOGIN.classId ? 'on' : ''}" onclick="LOGIN.classId='${esc(c.id)}';$('#l-class').value='${esc(c.id)}';document.querySelectorAll('#stu-quick-chips .chip').forEach(b=>b.classList.remove('on'));this.classList.add('on')">${esc(c.branch)} S${esc(c.sem)}-${esc(c.section)}</button>`
        ).join('');
      }
    }

    async function loadPublicClassesForLogin() {
      const sel = $('#l-class');
      if (sel) { sel.disabled = true; sel.innerHTML = '<option value="">Checking current classes…</option>'; }
      busy(1);
      try {
        const fresh = await rawPost('publicClasses', []);
        if (Array.isArray(fresh)) {
          cacheSet('public_classes', fresh);
          cacheSet(fnCacheKey('publicClasses', []), fresh);
          renderPublicClassesDropdown(fresh);
        }
      } catch (e) {
        const cached = cacheGet('public_classes');
        if (!navigator.onLine && Array.isArray(cached)) {
          renderPublicClassesDropdown(cached);
          toast('Offline: showing the last saved class list');
        } else if (sel) {
          sel.innerHTML = '<option value="">Could not load classes — tap Refresh</option>';
          toast('Could not load current classes');
        }
      } finally {
        busy(-1);
      }
    }

    function refreshLoginClasses() {
      delete MEM_CACHE['public_classes'];
      delete MEM_CACHE[fnCacheKey('publicClasses', [])];
      try {
        localStorage.removeItem('bist_v4_public_classes');
        localStorage.removeItem('bist_v4_' + fnCacheKey('publicClasses', []));
      } catch (e) { }
      loadPublicClassesForLogin();
    }

    async function doStudent() {
      const cid = $('#l-class')?.value;
      const enr = $('#l-enr')?.value.trim().toUpperCase();
      if (!cid) return toast('Please select your Class');
      if (!enr) return toast('Please enter your Enrollment No');
      try {
        localStorage.setItem('bist_last_enr', enr);
        localStorage.setItem('bist_last_cid', cid);
      } catch (e) { }

      const res = await run('studentLogin', cid, enr);
      if (res) await start(res);
    }

    async function doStaff() {
      const u = $('#l-user')?.value.trim();
      const p = $('#l-pass')?.value;
      if (!u || !p) return toast('Enter both username and password');
      const res = await run('login', u, p);
      if (res) await start(res);
    }

    async function logout(silent) {
      if (S.token) run('logout', S.token).catch(() => { });
      const wasStudent = S.user && S.user.role === 'STUDENT';
      S.token = null;
      S.user = null;
      saveSession(null, null);
      LOGIN.mode = wasStudent ? 'student' : 'staff';
      vLogin();
      if (!silent) toast('Logged out safely');
    }

    /* ============================================================================
     * 2. APP SHELL, NAVIGATION & BATCHED STARTUP
     * ============================================================================ */
    async function start(r) {
      if (!r || !r.user) return;
      const sessionToken = r.token;
      const user = r.user;
      S.token = sessionToken;
      S.user = user;
      saveSession(sessionToken, user);

      const role = user.role;
      if (role === 'STUDENT') {
        tab('myatt');
        return;
      }

      // Render shell immediately with cached classes if available
      const cachedClasses = cacheGet('staff_classes_' + user.username);
      const cachedTeachers = cacheGet('staff_teachers');
      if (cachedClasses) {
        S.classes = cachedClasses;
        S.teachers = cachedTeachers || [];
        S.classId = S.classId || S.classes[0]?.id || '';
        tab(role === 'HOD' ? 'report' : 'mark');
      } else {
        renderShell();
        $('#view').innerHTML = role === 'HOD' ? skReport() : skList(4);
      }

      // Single Batch Request if supported by v4.5 Turbo backend, with fallback to parallel calls
      try {
        if (role === 'HOD') {
          const bRes = await rawPost('batchCall', [[
            { fn: 'listClasses', args: [S.token] },
            { fn: 'listTeachers', args: [S.token] },
            { fn: 'getSettings', args: [S.token] }
          ]]);
          if (Array.isArray(bRes) && bRes[0]?.ok) {
            S.classes = bRes[0].data || [];
            S.teachers = bRes[1]?.data || [];
            if (bRes[2]?.data?.min) S.minPct = bRes[2].data.min;
          } else {
            throw new Error('Fallback to parallel');
          }
        } else {
          S.classes = (await call('listClasses')) || [];
        }
      } catch (e) {
        const [classes, teachers, settings] = await Promise.all([
          call('listClasses'),
          role === 'HOD' ? call('listTeachers') : Promise.resolve([]),
          role === 'HOD' ? call('getSettings') : Promise.resolve({ min: 75 })
        ]);
        S.classes = classes || [];
        S.teachers = teachers || [];
        if (settings && settings.min) S.minPct = settings.min;
      }

      // The session may have been cleared while the network request was in
      // flight (for example, an expired saved token failed silent resume).
      if (S.token !== sessionToken || S.user !== user) return;

      cacheSet('staff_classes_' + user.username, S.classes);
      if (role === 'HOD') cacheSet('staff_teachers', S.teachers);

      if (!S.classId || !S.classes.some(c => c.id === S.classId)) {
        S.classId = S.classes[0]?.id || '';
      }

      if (!cachedClasses) {
        tab(role === 'HOD' ? 'report' : 'mark');
      } else {
        const needsClassBar = ['report', 'students', 'subjects', 'absent'].includes(S.tab) || (S.tab === 'mark' && S.user.role === 'HOD');
        renderClassBar(needsClassBar);
      }
    }

    function getNavTabs() {
      const role = S.user?.role;
      if (role === 'HOD') {
        return [
          ['report', 'Master', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>'],
          ['mark', 'Attend.', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>'],
          ['absent', 'Absent', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'],
          ['students', 'Students', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>'],
          ['subjects', 'Subjects', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>'],
          ['setup', 'Setup', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>'],
          ['profile', 'Profile', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>']
        ];
      }
      if (role === 'TEACHER') {
        return [
          ['mark', 'Attendance', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>'],
          ['absent', 'Absentees', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'],
          ['students', 'Students', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>'],
          ['profile', 'Profile', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>']
        ];
      }
      return [
        ['myatt', 'My Attendance', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'],
        ['profile', 'Profile & Info', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>']
      ];
    }

    function renderShell() {
      const u = S.user;
      const navItems = getNavTabs();
      const displayTitle = u.role === 'HOD' ? HOD_NAME : u.name;
      const subtitle = u.role === 'STUDENT'
        ? `${u.username} • ${u.label}`
        : u.role === 'HOD'
          ? `HOD • ${DEPT_NAME}`
          : `Faculty • @${u.username}`;

      $('#app').innerHTML = `
    <header class="top-bar">
      <div class="top-row">
        <div class="brand-cluster">
          ${renderLogos('sm')}
          <div class="user-meta">
            <h2>${esc(displayTitle)}</h2>
            <p>${esc(subtitle)}</p>
          </div>
        </div>
        <button class="icon-btn" onclick="logout()">
          <span>Logout</span>
        </button>
      </div>
    </header>

    <div id="class-bar-slot"></div>
    <main id="view"></main>

    <nav class="bot-nav">
      ${navItems.map(item => `
        <button id="nb-${item[0]}" onclick="tab('${item[0]}')">
          ${item[2]}
          <span>${item[1]}</span>
        </button>
      `).join('')}
    </nav>
  `;
    }

    function renderClassBar(showBar = true) {
      const slot = $('#class-bar-slot');
      if (!slot) return;
      if (!showBar || S.user.role === 'STUDENT' || !S.classes.length) {
        slot.innerHTML = '';
        return;
      }
      const cur = S.classes.find(c => c.id === S.classId);
      slot.innerHTML = `
    <div class="class-bar">
      <select onchange="S.classId=this.value;tab(S.tab)">
        ${S.classes.map(c => `<option value="${esc(c.id)}" ${c.id === S.classId ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
      </select>
      ${cur?.url ? `<a class="btn sm gold" style="width:auto;padding:9px 11px" target="_blank" href="${esc(cur.url)}" title="Open Google Sheet">Sheet</a>` : ''}
    </div>
  `;
    }

    function noClassCard() {
      return `
    <div class="card empty">
      ${S.user.role === 'HOD'
          ? `No Class created yet.<br><button class="btn gold sm" style="margin-top:10px" onclick="tab('setup')">+ Create First Class in Setup</button>`
          : `No classes or subjects have been assigned to you yet. Please contact <b>${HOD_NAME} (HOD AIML)</b>.`}
    </div>
    ${devFooterHTML()}
  `;
    }

    async function tab(t) {
      S.tab = t;
      M = null;
      if (!$('#view') || !$('nav.bot-nav')) renderShell();
      document.querySelectorAll('nav.bot-nav button').forEach(b => b.classList.toggle('on', b.id === 'nb-' + t));
      window.scrollTo(0, 0);

      const needsClassBar = ['report', 'students', 'subjects', 'absent'].includes(t) || (t === 'mark' && S.user.role === 'HOD');
      renderClassBar(needsClassBar);

      const views = {
        report: vReport,
        mark: vMark,
        absent: vAbsent,
        students: vStudents,
        subjects: vSubjects,
        setup: vSetup,
        myatt: vStudent,
        profile: vProfile
      };
      if (views[t]) views[t]();
    }

    /* ============================================================================
     * 3. HOD: MASTER REPORT (`getSummary` + `forceRecompile` for Manual Sheet Edits)
     * ============================================================================ */
    async function vReport(forceSync = false) {
      const v = $('#view');
      if (!S.classId) { v.innerHTML = noClassCard(); return; }

      const hasRange = Boolean(S.reportFrom && S.reportTo);
      const cacheKey = hasRange
        ? `summary_range_${S.classId}_${S.reportFrom}_${S.reportTo}`
        : 'summary_' + S.classId;
      const cachedEntry = cacheGetEntry(cacheKey);

      if (!forceSync && cachedEntry) {
        drawReportView(cachedEntry.data, !isCacheFresh(cacheKey, STAFF_TTL_MS), cachedEntry.ts);
        if (isCacheFresh(cacheKey, STAFF_TTL_MS)) return;
      } else {
        v.innerHTML = skReport();
      }

      const res = hasRange
        ? await call('getSummaryByDateRange', S.classId, S.reportFrom, S.reportTo)
        : await call(forceSync ? 'forceRecompile' : 'getSummary', S.classId);
      if (!res) return;
      cacheSet(cacheKey, res);
      if (forceSync) toast(hasRange ? 'Date-range attendance refreshed' : 'Master sheet and manual counts synced');
      if (S.tab === 'report') drawReportView(res, false, Date.now());
    }

    function applyHodReportRange() {
      const from = $('#hod-range-from')?.value || '';
      const to = $('#hod-range-to')?.value || '';
      if (!from || !to) return toast('Choose both start and end dates');
      if (from > to) return toast('Start date must be before end date');
      S.reportFrom = from;
      S.reportTo = to;
      vReport();
    }

    function reportCacheKey() {
      return S.reportFrom && S.reportTo
        ? `summary_range_${S.classId}_${S.reportFrom}_${S.reportTo}`
        : 'summary_' + S.classId;
    }

    function clearHodReportRange() {
      S.reportFrom = '';
      S.reportTo = '';
      vReport();
    }

    function drawReportView(res, isSyncing, ts) {
      const v = $('#view');
      const table = res.table || [];
      const min = res.min || S.minPct || 75;
      S.minPct = min;

      if (table.length < 2) {
        v.innerHTML = `<div class="card empty">No attendance data available yet.</div>${devFooterHTML()}`;
        return;
      }

      const headers = table[0];
      const totRow = table[1];
      const stuRows = table.slice(2);
      const pctIdx = headers.length - 1;

      const isLow = r => r[pctIdx] !== '' && Number(r[pctIdx]) < min;
      const defaultersCount = stuRows.filter(isLow).length;
      const shownRows = S.onlyDefaulters ? stuRows.filter(isLow) : stuRows;

      v.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span class="sync-pill">
        <span class="sync-dot ${isSyncing ? 'pulsing' : ''}"></span>
        ${isSyncing ? 'Syncing live…' : 'Synced ' + timeAgo(ts)}
      </span>
      <button class="btn sm outline" onclick="vReport(true)" title="Click after editing Previous Count in Excel/Sheet">
        Sync Sheet Edits
      </button>
    </div>

    <div class="card">
      <h3>Attendance by Date Range</h3>
      <p class="hint">View class attendance between two dates. Percentages use only marked lectures in that period.</p>
      <div class="row2">
        <div><label class="lbl" for="hod-range-from">From</label><input id="hod-range-from" class="inp" type="date" value="${esc(S.reportFrom)}"></div>
        <div><label class="lbl" for="hod-range-to">To</label><input id="hod-range-to" class="inp" type="date" value="${esc(S.reportTo)}"></div>
      </div>
      <div class="row2" style="margin-top:8px">
        <button class="btn gold" onclick="applyHodReportRange()">Show Period</button>
        <button class="btn sec" onclick="clearHodReportRange()">Show All-Time Report</button>
      </div>
      ${res.range ? `<p class="hint" style="margin-bottom:0">Showing ${esc(res.range.start)} through ${esc(res.range.end)}.</p>` : ''}
    </div>

    <div class="row3" style="margin-bottom:12px">
      <div class="card" style="text-align:center;margin:0;padding:12px 8px">
        <div style="font-size:22px;font-weight:900;color:var(--navy)">${stuRows.length}</div>
        <div style="font-size:10.5px;font-weight:800;color:var(--mu);text-transform:uppercase">Students</div>
      </div>
      <div class="card" style="text-align:center;margin:0;padding:12px 8px">
        <div style="font-size:22px;font-weight:900;color:var(--bad)">${defaultersCount}</div>
        <div style="font-size:10.5px;font-weight:800;color:var(--bad);text-transform:uppercase">Below ${min}%</div>
      </div>
      <div class="card" style="text-align:center;margin:0;padding:12px 8px">
        <div style="font-size:22px;font-weight:900;color:var(--ok)">${stuRows.length - defaultersCount}</div>
        <div style="font-size:10.5px;font-weight:800;color:var(--ok);text-transform:uppercase">Safe (${min}%+)</div>
      </div>
    </div>

    <div class="card">
      <div class="row2" style="margin-bottom:10px">
        <button class="btn sm ${S.onlyDefaulters ? 'red' : 'sec'}" onclick="S.onlyDefaulters=!S.onlyDefaulters;drawReportView(cacheGet('${reportCacheKey()}'),false,Date.now())">
          ${S.onlyDefaulters ? `Showing Below ${min}% Only` : `Filter Defaulters (Below ${min}%)`}
        </button>
        <a class="btn sm gold" target="_blank" href="${esc(res.url || '#')}">Open Master Sheet</a>
      </div>

      <input id="rep-q" class="inp" placeholder="Search student name or enrollment no…" oninput="filterMasterTable()" style="margin-bottom:10px">

      ${shownRows.length ? `
        <div class="table-wrap">
          <table class="master-tbl" id="master-tbl">
            <thead>
              <tr>
                ${headers.map((h, idx) => `<th class="${idx === 2 ? 'name-col' : ''}">${esc(h)}</th>`).join('')}
              </tr>
              <tr class="tot-row">
                ${totRow.map((c, idx) => `<td class="${idx === 2 ? 'name-col' : ''}">${esc(c)}${idx === pctIdx && c !== '' ? '%' : ''}</td>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${shownRows.map(r => {
        const low = isLow(r);
        return `<tr class="stu-tr" data-q="${esc((r[1] + ' ' + r[2]).toLowerCase())}">
                  ${r.map((c, j) => {
          const isPct = j === pctIdx && c !== '';
          const cls = j === 2 ? 'name-col' : (isPct ? (low ? 'low-cell' : 'ok-cell') : '');
          return `<td class="${cls}">${esc(c)}${isPct ? '%' : ''}</td>`;
        }).join('')}
                </tr>`;
      }).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div class="empty">No students match this filter.</div>`}
    </div>
    ${devFooterHTML()}
  `;
    }

    function filterMasterTable() {
      const q = ($('#rep-q')?.value || '').toLowerCase();
      document.querySelectorAll('#master-tbl tr.stu-tr').forEach(tr => {
        tr.style.display = tr.dataset.q.includes(q) ? '' : 'none';
      });
    }

    /* ============================================================================
     * 4. ATTENDANCE MARKING (Regular Subjects & HOD Extra Activities)
     * ============================================================================ */
    async function vMark() {
      const v = $('#view');
      const isHod = S.user.role === 'HOD';
      if (isHod && !S.classId) { v.innerHTML = noClassCard(); return; }

      const subKey = 'subs_' + (isHod ? S.classId : S.user.username);
      const cachedSubs = cacheGet(subKey);
      if (cachedSubs) {
        S.subjects = cachedSubs;
        drawMarkSubjectsList();
        if (isCacheFresh(subKey, STAFF_TTL_MS)) return;
      } else {
        v.innerHTML = skList(4);
      }

      const fresh = await call('listSubjects', isHod ? S.classId : '');
      if (!fresh) return;
      S.subjects = fresh;
      cacheSet(subKey, fresh);
      if (S.tab === 'mark' && !M) drawMarkSubjectsList();
    }

    function drawMarkSubjectsList() {
      const v = $('#view');
      const isHod = S.user.role === 'HOD';
      if (!S.subjects.length) {
        v.innerHTML = `
      <div class="card empty">
        ${isHod
            ? `No subjects or extra activities in this class yet.<br><button class="btn gold sm" style="margin-top:10px" onclick="tab('subjects')">+ Add Subject / Activity</button>`
            : `No subjects assigned to you yet. Please contact ${HOD_NAME}.`}
      </div>
      ${devFooterHTML()}
    `;
        return;
      }

      const regular = S.subjects.filter(s => s.type !== 'EXTRA');
      const extras = S.subjects.filter(s => s.type === 'EXTRA');

      v.innerHTML = `
    ${regular.length ? `
      <div class="card">
        <h3>Regular Class Subjects</h3>
        <p class="hint">Tap a subject to mark or edit daily lecture attendance (P / A)</p>
        ${regular.map(s => {
        const idx = S.subjects.indexOf(s);
        return `
            <div class="list-item" style="cursor:pointer" onclick="openSheet(${idx})">
              <div class="info">
                <b>${esc(s.subject)}</b>
                <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">
                  <span class="tag">${esc(s.cls)}</span>
                  ${s.teacher ? `<span class="tag" style="background:#f1f5f9;color:var(--mu);border-color:var(--ln)">@${esc(s.teacher)}</span>` : ''}
                </div>
              </div>
              <button class="btn sm">Mark</button>
            </div>
          `;
      }).join('')}
      </div>
    ` : ''}

    ${extras.length ? `
      <div class="card">
        <h3>Extra Activities / Bonus Lectures (HOD)</h3>
        <p class="hint">Award bonus lecture counts (Workshops, Hackathons, Seminars, Sports)</p>
        ${extras.map(s => {
        const idx = S.subjects.indexOf(s);
        return `
            <div class="list-item" style="cursor:pointer" onclick="openSheet(${idx})">
              <div class="info">
                <b>${esc(s.subject)}</b>
                <div style="margin-top:4px">
                  <span class="tag extra">EXTRA ACTIVITY</span>
                  <span class="tag">${esc(s.cls)}</span>
                </div>
              </div>
              <button class="btn sm gold">Award</button>
            </div>
          `;
      }).join('')}
      </div>
    ` : ''}
    ${devFooterHTML()}
  `;
    }

    async function openSheet(idx) {
      const s = S.subjects[idx];
      if (!s) return;
      renderClassBar(false);
      M = {
        s,
        date: today(),
        sess: '1',
        lecs: 2,
        exists: false,
        extra: s.type === 'EXTRA',
        rows: [],
        q: ''
      };
      await loadSheet();
    }

    async function loadSheet() {
      const v = $('#view');
      v.innerHTML = skList(7);
      const r = await call('getAttendanceSheet', M.s.classId, M.s.subject, M.date, M.sess);
      if (!r) return;
      M.extra = !!r.extra;
      M.exists = !!r.exists;
      M.lecs = r.lecs || (M.extra ? 2 : 1);
      M.rows = (r.rows || []).map(row => ({
        e: row.e,
        n: row.n,
        s: M.extra
          ? (row.s !== null && row.s !== '' ? Number(row.s) : 0)
          : (row.s === 'A' ? 'A' : 'P')
      }));
      drawSheet();
    }

    function drawSheet() {
      const v = $('#view');
      const isExtra = M.extra;

      v.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <button class="btn sec sm" onclick="tab('mark')">Back to Subjects</button>
      <span class="tag ${M.exists ? 'ok' : ''}">${M.exists ? 'Previously Saved (Editing)' : 'New Entry'}</span>
    </div>

    <div class="card">
      <h3>
        <span>${esc(M.s.subject)}</span>
        ${isExtra ? `<span class="tag extra">EXTRA</span>` : `<span class="tag">REGULAR</span>`}
      </h3>
      <p class="hint">${esc(M.s.cls)}</p>

      <div class="${isExtra ? 'row3' : 'row2'}">
        <div>
          <label class="lbl">Date</label>
          <input type="date" class="inp" value="${M.date}" onchange="M.date=this.value;loadSheet()">
        </div>
        <div>
          <label class="lbl">${isExtra ? 'Session #' : 'Lecture #'}</label>
          <select class="inp" onchange="M.sess=this.value;loadSheet()">
            ${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}" ${n == M.sess ? 'selected' : ''}>${isExtra ? 'Session ' : 'Lecture '}${n}</option>`).join('')}
          </select>
        </div>
        ${isExtra ? `
          <div>
            <label class="lbl">Max Lectures</label>
            <input type="number" min="1" max="99" class="inp" value="${M.lecs}"
                   onchange="M.lecs=Math.max(1,Math.min(99,parseInt(this.value,10)||1));clampExtraRows();drawSheetList()">
          </div>
        ` : ''}
      </div>

      <div id="att-summary-counters" class="row2" style="margin-top:12px"></div>

      <div class="row2" style="margin-top:10px">
        ${isExtra ? `
          <button class="btn sm ok" onclick="setAllExtra(M.lecs)">Set All Max (${M.lecs})</button>
          <button class="btn sm sec" onclick="setAllExtra(0)">Reset All to 0</button>
        ` : `
          <button class="btn sm ok" onclick="setAllRegular('P')">Mark All Present</button>
          <button class="btn sm red" onclick="setAllRegular('A')">Mark All Absent</button>
        `}
      </div>

      <input class="inp" placeholder="Search student name or enrollment…" style="margin-top:10px"
             oninput="M.q=this.value.toLowerCase();drawSheetList()">
    </div>

    <div class="card" style="padding:4px 0" id="sheet-stu-list"></div>

    <div class="savebar">
      <div class="savebar-inner">
        <button class="btn gold" id="save-att-btn" onclick="saveAtt()">
          Save ${isExtra ? 'Activity Attendance' : 'Lecture Attendance'}
        </button>
      </div>
    </div>
  `;

      drawSheetList();
    }

    function clampExtraRows() {
      M.rows.forEach(r => {
        r.s = Math.max(0, Math.min(M.lecs, parseInt(r.s, 10) || 0));
      });
    }

    function updateCountersDOM() {
      const counters = $('#att-summary-counters');
      if (!counters) return;
      if (M.extra) {
        const withCredit = M.rows.filter(r => Number(r.s) > 0).length;
        counters.innerHTML = `
          <div style="background:var(--okb);color:var(--ok);padding:8px;border-radius:10px;text-align:center;font-weight:800">
            Awarded: ${withCredit}
          </div>
          <div style="background:#f1f5f9;color:var(--mu);padding:8px;border-radius:10px;text-align:center;font-weight:800">
            Zero (0): ${M.rows.length - withCredit}
          </div>
        `;
      } else {
        const pCount = M.rows.filter(r => r.s === 'P').length;
        const aCount = M.rows.length - pCount;
        counters.innerHTML = `
          <div style="background:var(--okb);color:var(--ok);padding:8px;border-radius:10px;text-align:center;font-weight:800">
            Present: ${pCount}
          </div>
          <div style="background:var(--badb);color:var(--bad);padding:8px;border-radius:10px;text-align:center;font-weight:800">
            Absent: ${aCount}
          </div>
        `;
      }
    }

    function drawSheetList() {
      updateCountersDOM();
      const listEl = $('#sheet-stu-list');
      if (!listEl) return;

      if (!M.rows.length) {
        listEl.innerHTML = `<div class="empty">No students in this class yet. Add students first.</div>`;
        return;
      }

      const filtered = M.rows
        .map((r, idx) => ({ ...r, idx }))
        .filter(r => (r.e + ' ' + r.n).toLowerCase().includes(M.q));

      if (!filtered.length) {
        listEl.innerHTML = `<div class="empty">No matching students</div>`;
        return;
      }

      if (M.extra) {
        listEl.innerHTML = filtered.map(r => `
      <div class="att-row">
        <div class="info" style="min-width:0;flex:1">
          <b style="display:block;font-size:13.5px">${esc(r.n)}</b>
          <small style="color:var(--mu);font-family:monospace">${esc(r.e)}</small>
        </div>
        <div class="stepper">
          <button class="step-btn" onclick="stepExtra(${r.idx}, -1)">-</button>
          <input id="step-inp-${r.idx}" type="number" min="0" max="${M.lecs}" class="step-val" value="${r.s}"
                 onchange="setExtraRow(${r.idx}, this.value)">
          <button class="step-btn" onclick="stepExtra(${r.idx}, 1)">+</button>
          <button class="step-btn" style="width:auto;padding:0 7px;font-size:11px;background:var(--gold-light)" onclick="setExtraRow(${r.idx}, ${M.lecs})">Max</button>
        </div>
      </div>
    `).join('');
      } else {
        listEl.innerHTML = filtered.map(r => `
      <div class="att-row clickable" onclick="toggleRegular(${r.idx})">
        <div class="info" style="min-width:0;flex:1">
          <b style="display:block;font-size:14px">${esc(r.n)}</b>
          <small style="color:var(--mu);font-family:monospace">${esc(r.e)}</small>
        </div>
        <div id="pa-box-${r.idx}" class="pa-box ${r.s}">${r.s}</div>
      </div>
    `).join('');
      }
    }

    // Surgical DOM toggle for 0ms tap response on low-end phones
    function toggleRegular(i) {
      const next = M.rows[i].s === 'P' ? 'A' : 'P';
      M.rows[i].s = next;
      const box = document.getElementById('pa-box-' + i);
      if (box) {
        box.className = 'pa-box ' + next;
        box.textContent = next;
      }
      updateCountersDOM();
    }

    function setAllRegular(val) {
      M.rows.forEach(r => r.s = val);
      drawSheetList();
    }
    function stepExtra(i, delta) {
      const cur = Number(M.rows[i].s) || 0;
      const next = Math.max(0, Math.min(M.lecs, cur + delta));
      M.rows[i].s = next;
      const inp = document.getElementById('step-inp-' + i);
      if (inp) inp.value = next;
      updateCountersDOM();
    }
    function setExtraRow(i, val) {
      const next = Math.max(0, Math.min(M.lecs, parseInt(val, 10) || 0));
      M.rows[i].s = next;
      const inp = document.getElementById('step-inp-' + i);
      if (inp) inp.value = next;
      updateCountersDOM();
    }
    function setAllExtra(val) {
      const v = Math.max(0, Math.min(M.lecs, parseInt(val, 10) || 0));
      M.rows.forEach(r => r.s = v);
      drawSheetList();
    }

    async function saveAtt() {
      if (!navigator.onLine) {
        return toast('You are offline. Reconnect to internet before saving.');
      }
      const model = M;
      if (!model) return;
      const btn = $('#save-att-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving to Google Sheet…'; }

      const marks = {};
      model.rows.forEach(r => { marks[r.e] = r.s; });
      const res = await call('saveAttendance', model.s.classId, model.s.subject, model.date, model.sess, model.lecs, marks);

      if (btn?.isConnected) { btn.disabled = false; btn.textContent = `Save ${model.extra ? 'Activity Attendance' : 'Lecture Attendance'}`; }
      if (res) {
        model.exists = true;
        delete MEM_CACHE['summary_' + model.s.classId];
        toast(res);
        if (M === model) drawSheet();
      }
    }

    /* ============================================================================
     * 5. ABSENTEES VIEW (`getAbsentees`) + WHATSAPP COPY
     * ============================================================================ */
    async function vAbsent() {
      const v = $('#view');
      if (!S.classId) { v.innerHTML = noClassCard(); return; }
      if (!S.absDate) S.absDate = today();

      v.innerHTML = `
    <div class="card">
      <h3>Daily Absentee Tracker</h3>
      <p class="hint">View lecture-wise absentees and copy formatted list for WhatsApp groups</p>
      <label class="lbl">Select Date</label>
      <input type="date" class="inp" value="${S.absDate}" onchange="S.absDate=this.value;vAbsent()">
    </div>
    ${skList(3)}
  `;

      const data = await call('getAbsentees', S.classId, S.absDate);
      if (!data) return;

      const blocks = data.blocks || [];
      window._lastAbsentData = data;

      v.innerHTML = `
    <div class="card">
      <h3>
        <span>Absentees (${esc(data.date)})</span>
        ${blocks.length ? `<button class="btn sm gold" onclick="copyAbsentWhatsApp()">Copy for WhatsApp</button>` : ''}
      </h3>
      <p class="hint">${esc(data.label)}</p>
      <label class="lbl">Change Date</label>
      <input type="date" class="inp" value="${S.absDate}" onchange="S.absDate=this.value;vAbsent()">
    </div>

    ${blocks.length ? blocks.map(b => `
      <div class="card">
        <h3>
          <span>Lec ${b.lec}: ${esc(b.subject)}</span>
          <span class="tag ${b.absent.length ? 'bad' : 'ok'}">${b.absent.length} Absent / ${b.total}</span>
        </h3>
        <p class="hint">Faculty: ${esc(b.teacher || 'Assigned Faculty')}</p>
        ${b.absent.length ? `
          <div style="border-top:1px solid var(--ln);margin-top:6px;padding-top:6px">
            ${b.absent.map((st, idx) => `
              <div class="list-item" style="padding:7px 2px">
                <div class="info">
                  <b>${idx + 1}. ${esc(st.n)}</b>
                  <small>${esc(st.e)}</small>
                </div>
                <span class="tag bad">ABSENT</span>
              </div>
            `).join('')}
          </div>
        ` : `<div style="color:var(--ok);font-weight:800;font-size:13px">100% Attendance in this lecture</div>`}
      </div>
    `).join('') : `
      <div class="card empty">No lectures marked on ${esc(data.date)} for this class.</div>
    `}
    ${devFooterHTML()}
  `;
    }

    function copyAbsentWhatsApp() {
      const d = window._lastAbsentData;
      if (!d || !d.blocks || !d.blocks.length) return;
      let lines = [
        `*${COLLEGE_NAME}*`,
        `*${DEPT_NAME} - Absentee Report*`,
        `*Class:* ${d.label}`,
        `*Date:* ${d.date}`,
        `--------------------------------`
      ];
      d.blocks.forEach(b => {
        lines.push(`\n*Lecture ${b.lec}: ${b.subject}* (${b.absent.length}/${b.total} Absent)`);
        if (!b.absent.length) {
          lines.push(`All Present`);
        } else {
          b.absent.forEach((st, i) => lines.push(`${i + 1}. ${st.e} - ${st.n}`));
        }
      });
      lines.push(`\n_HOD: ${HOD_NAME}_`);
      copyText(lines.join('\n'), 'WhatsApp Absentee List Copied');
    }

    /* ============================================================================
     * 6. STUDENTS MANAGEMENT (`listStudents`, `addStudents`, `removeStudent`)
     * ============================================================================ */
    async function vStudents() {
      const v = $('#view');
      if (!S.classId) { v.innerHTML = noClassCard(); return; }

      const stuKey = 'roster_' + S.classId;
      const cached = cacheGet(stuKey);
      if (cached) {
        drawStudentsRoster(cached);
        if (isCacheFresh(stuKey, STAFF_TTL_MS)) return;
      } else {
        v.innerHTML = skList(6);
      }

      const list = await call('listStudents', S.classId);
      if (!list) return;
      cacheSet(stuKey, list);
      if (S.tab === 'students') drawStudentsRoster(list);
    }

    function drawStudentsRoster(list) {
      const v = $('#view');
      const isHod = S.user.role === 'HOD';
      const curCls = S.classes.find(c => c.id === S.classId);

      v.innerHTML = `
    <div class="card">
      <h3>Add Student to Class</h3>
      <p class="hint">${esc(curCls?.label || '')}</p>

      <div class="row2">
        <div>
          <label class="lbl">Enrollment No</label>
          <input id="st-enr" class="inp" placeholder="0112AL231001" autocapitalize="characters" style="text-transform:uppercase;font-family:monospace">
        </div>
        <div>
          <label class="lbl">Student Name</label>
          <input id="st-name" class="inp" placeholder="Full Name">
        </div>
      </div>
      <button class="btn" style="margin-top:12px" onclick="addSingleStudent()">+ Add Student</button>

      <details style="margin-top:12px;border-top:1px solid var(--ln);padding-top:10px">
        <summary style="font-weight:800;color:var(--navy);cursor:pointer;font-size:13px">Bulk Paste Students (Excel / CSV List)</summary>
        <p class="hint" style="margin-top:6px">One student per line: <code>EnrollmentNo, Full Name</code></p>
        <textarea id="st-bulk" class="inp" placeholder="0112AL231001, Aarav Sharma&#10;0112AL231002, Priya Patel"></textarea>
        <button class="btn gold" style="margin-top:8px" onclick="addBulkStudents()">Import All Students</button>
      </details>
    </div>

    <div class="card">
      <h3>
        <span>Enrolled Students (${list.length})</span>
      </h3>
      <input id="st-q" class="inp" placeholder="Search name or enrollment…" oninput="filterStudentList()" style="margin:8px 0">

      <div id="st-list-box">
        ${list.length ? list.map(s => `
          <div class="list-item st-item" data-q="${esc((s.e + ' ' + s.n).toLowerCase())}">
            <div class="info">
              <b>${esc(s.n)}</b>
              <small>${esc(s.e)}</small>
            </div>
            ${isHod ? `<button class="btn sm red" onclick="confirmRemoveStudent('${esc(s.e)}', '${esc(s.n)}')">Remove</button>` : ''}
          </div>
        `).join('') : `<div class="empty">No students enrolled in this class yet.</div>`}
      </div>
    </div>
    ${devFooterHTML()}
  `;
    }

    function filterStudentList() {
      const q = ($('#st-q')?.value || '').toLowerCase();
      document.querySelectorAll('#st-list-box .st-item').forEach(el => {
        el.style.display = el.dataset.q.includes(q) ? '' : 'none';
      });
    }

    async function addSingleStudent() {
      const e = $('#st-enr')?.value.trim();
      const n = $('#st-name')?.value.trim();
      if (!e || !n) return toast('Enter both Enrollment No and Student Name');
      const r = await call('addStudents', S.classId, `${e}, ${n}`);
      if (r) {
        delete MEM_CACHE['roster_' + S.classId];
        toast(r.added ? 'Student added' : 'Already exists or invalid');
        vStudents();
      }
    }

    async function addBulkStudents() {
      const txt = $('#st-bulk')?.value.trim();
      if (!txt) return toast('Paste student lines first');
      const r = await call('addStudents', S.classId, txt);
      if (r) {
        delete MEM_CACHE['roster_' + S.classId];
        toast(`${r.added} added` + (r.skipped ? `, ${r.skipped} skipped` : ''));
        vStudents();
      }
    }

    function confirmRemoveStudent(enr, name) {
      showConfirmModal(
        'Remove Student?',
        `Remove ${name} (${enr}) from this class and all its subject sheets?`,
        'Remove Permanently',
        true,
        async () => {
          const r = await call('removeStudent', S.classId, enr);
          if (r) {
            delete MEM_CACHE['roster_' + S.classId];
            toast(r);
            vStudents();
          }
        }
      );
    }

    /* ============================================================================
     * 7. HOD: SUBJECTS & EXTRA ACTIVITIES (`listSubjects`, `addSubject`, `updatePriorTotal`)
     * ============================================================================ */
    let SUB_FORM_TYPE = 'CLASS';

    async function vSubjects() {
      const v = $('#view');
      if (!S.classId) { v.innerHTML = noClassCard(); return; }

      v.innerHTML = skList(4);
      S.subjects = await call('listSubjects', S.classId) || [];
      drawSubjectsView();
    }

    function drawSubjectsView() {
      const v = $('#view');
      const curCls = S.classes.find(c => c.id === S.classId);
      const isExtra = SUB_FORM_TYPE === 'EXTRA';

      const teacherOpts = sel => `<option value="">— Unassigned —</option>` +
        S.teachers.map(t => `<option value="${esc(t.username)}" ${t.username === sel ? 'selected' : ''}>${esc(t.name)} (@${esc(t.username)})</option>`).join('');

      v.innerHTML = `
    <div class="card">
      <h3>Add Subject or Extra Activity</h3>
      <p class="hint">${esc(curCls?.label || '')} — Creates a dedicated sheet tab automatically</p>

      <div class="seg" style="margin-top:8px">
        <button class="${!isExtra ? 'on' : ''}" onclick="SUB_FORM_TYPE='CLASS';drawSubjectsView()">Regular Subject</button>
        <button class="${isExtra ? 'on' : ''}" onclick="SUB_FORM_TYPE='EXTRA';drawSubjectsView()">Extra Activity (HOD)</button>
      </div>

      <label class="lbl">${isExtra ? 'Activity Name (e.g. AI Hackathon, NSS, Workshop)' : 'Subject Name (e.g. Machine Learning, Deep Learning)'}</label>
      <input id="sub-name" class="inp" placeholder="${isExtra ? 'e.g. Industrial Visit / Tech Fest' : 'e.g. Artificial Intelligence (AL-501)'}">

      ${!isExtra ? `
        <label class="lbl">Assign Faculty</label>
        <select id="sub-teacher" class="inp">${teacherOpts('')}</select>
      ` : ''}

      <label class="lbl">Prior Total Lectures (Total classes held before app, for Column C 'Previous Count')</label>
      <input id="sub-prior" type="number" min="0" class="inp" value="0" placeholder="0">

      <button class="btn ${isExtra ? 'gold' : ''}" style="margin-top:12px" onclick="createSubjectItem()">
        + Create ${isExtra ? 'Extra Activity' : 'Subject'}
      </button>
    </div>

    <div class="card">
      <h3>Configured Subjects & Activities (${S.subjects.length})</h3>
      ${S.subjects.length ? S.subjects.map(s => `
        <div class="list-item" style="flex-wrap:wrap;gap:8px">
          <div class="info" style="min-width:160px">
            <b>${esc(s.subject)}</b>
            <div style="margin-top:3px;display:flex;gap:5px;flex-wrap:wrap;align-items:center">
              <span class="tag ${s.type === 'EXTRA' ? 'extra' : ''}">${s.type === 'EXTRA' ? 'EXTRA ACTIVITY (HOD)' : 'CLASS SUBJECT'}</span>
              <button class="tag" style="cursor:pointer;background:#fff" onclick="editSubjectPrior('${esc(s.subject)}', ${s.prior || 0})" title="Edit Prior Total Classes">
                Edit Prior Total: ${s.prior || 0} lecs
              </button>
            </div>
          </div>
          ${s.type !== 'EXTRA' ? `
            <select class="inp" style="width:auto;min-width:165px;padding:7px 10px;font-size:12px"
                    onchange="updateSubjectTeacher('${esc(s.subject)}', this.value)">
              ${teacherOpts(s.teacher)}
            </select>
          ` : ''}
        </div>
      `).join('') : `<div class="empty">No subjects created for this class yet.</div>`}
    </div>
    ${devFooterHTML()}
  `;
    }

    async function createSubjectItem() {
      const name = $('#sub-name')?.value.trim();
      const teacher = $('#sub-teacher')?.value || '';
      const prior = Number($('#sub-prior')?.value) || 0;
      if (!name) return toast('Please enter a name');
      const r = await call('addSubject', S.classId, name, teacher, SUB_FORM_TYPE, prior);
      if (r) {
        S.subjects = r;
        toast((SUB_FORM_TYPE === 'EXTRA' ? 'Extra Activity' : 'Subject') + ' created');
        drawSubjectsView();
      }
    }

    async function updateSubjectTeacher(subject, teacher) {
      const r = await call('changeTeacher', S.classId, subject, teacher);
      if (r) toast(r);
    }

    function editSubjectPrior(subject, currentPrior) {
      showPromptModal(
        `Prior Total Classes (${subject})`,
        `Enter total classes held before using the app (matches 'Previous Count' column C in the Sheet):`,
        'e.g. 20',
        String(currentPrior || 0),
        async val => {
          const r = await call('updatePriorTotal', S.classId, subject, Number(val) || 0);
          if (r) {
            toast(r);
            vSubjects();
          }
        }
      );
    }

    /* ============================================================================
     * 8. HOD: SETUP TAB (Classes, Min %, Teachers)
     * ============================================================================ */
    async function vSetup() {
      const v = $('#view');
      v.innerHTML = `
    <div class="card">
      <h3>Create New Class (Branch + Sem + Sec)</h3>
      <p class="hint">Creates a dedicated Google Workbook for the class</p>

      <label class="lbl">Branch</label>
      <input id="cls-branch" class="inp" value="AIML" placeholder="e.g. AIML or CSE-AIML">

      <div class="row2">
        <div>
          <label class="lbl">Semester (1-8)</label>
          <select id="cls-sem" class="inp">
            ${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}">Semester ${n}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="lbl">Section</label>
          <input id="cls-sec" class="inp" value="A" placeholder="e.g. A" autocapitalize="characters" style="text-transform:uppercase">
        </div>
      </div>

      <button class="btn gold" style="margin-top:12px" onclick="createNewClass()">+ Create Class Workbook</button>

      ${S.classes.length ? `
        <div style="margin-top:14px;border-top:1px solid var(--ln);padding-top:10px">
          <label class="lbl">Existing Classes (${S.classes.length})</label>
          ${S.classes.map(c => `
            <div class="list-item">
              <div class="info">
                <b>${esc(c.label)}</b>
                <small>${esc(c.file || '')}</small>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn sm sec" onclick="openRenameClassModal('${esc(c.id)}','${esc(c.branch)}','${esc(c.sem)}','${esc(c.section)}')">Rename</button>
                <a class="btn sm outline" target="_blank" href="${esc(c.url)}">Sheet</a>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    <div class="card">
      <h3>Minimum Attendance Requirement (%)</h3>
      <p class="hint">Students below this threshold are highlighted in red on the Master Sheet</p>
      <div class="row2" style="align-items:center">
        <input id="min-pct-inp" type="number" min="1" max="100" class="inp" value="${S.minPct}">
        <button class="btn" onclick="saveMinPct()">Update Minimum %</button>
      </div>
    </div>

    <div class="card">
      <h3>Add Department Faculty</h3>
      <label class="lbl">Faculty Full Name</label>
      <input id="t-name" class="inp" placeholder="e.g. Prof. Ankit Verma">

      <div class="row2">
        <div>
          <label class="lbl">Username</label>
          <input id="t-user" class="inp" placeholder="e.g. averma" autocapitalize="none">
        </div>
        <div>
          <label class="lbl">Initial Password</label>
          <input id="t-pass" class="inp" placeholder="min 4 chars">
        </div>
      </div>
      <button class="btn" style="margin-top:12px" onclick="addNewTeacher()">+ Create Faculty Account</button>

      <div style="margin-top:14px;border-top:1px solid var(--ln);padding-top:10px">
        <label class="lbl">Registered Faculty (${S.teachers.length})</label>
        ${S.teachers.length ? S.teachers.map(t => `
          <div class="list-item">
            <div class="info">
              <b>${esc(t.name)}</b>
              <small>@${esc(t.username)}</small>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn sm sec" onclick="promptResetTeacherPw('${esc(t.username)}')">Reset PW</button>
              <button class="btn sm red" onclick="confirmRemoveTeacher('${esc(t.username)}','${esc(t.name)}')">Remove</button>
            </div>
          </div>
        `).join('') : `<div class="empty">No faculty added yet.</div>`}
      </div>
    </div>
    ${devFooterHTML()}
  `;
    }

    async function saveEmailReportSettings() {
      const email = $('#report-email')?.value.trim();
      if (!email) return toast('Enter the report recipient email');
      const result = await call('setEmailReportSettings', email, $('#report-daily').checked, $('#report-weekly').checked, $('#report-monthly').checked, $('#report-hour').value, $('#report-sender').value);
      if (result) toast(result.enabled ? 'Report settings saved for ' + result.email : 'Settings saved; all automatic reports are paused');
    }

    function validAppsScriptUrl(value) {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'script.google.com' && /^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname);
      } catch (e) { return false; }
    }

    function saveAppsScriptUrl() {
      const value = $('#appscript-url')?.value.trim();
      if (!validAppsScriptUrl(value)) return toast('Enter a valid Apps Script Web App URL ending in /exec');
      rawPostTo(DEFAULT_GAS_URL, 'setAppsScriptUrl', [S.token, value]).then(() => {
        GAS_URL = value;
        toast('Shared Apps Script URL saved; reconnecting all devices…');
        setTimeout(() => location.reload(), 700);
      }).catch(error => toast('Could not save shared URL: ' + (error.message || String(error))));
    }

    async function rawPostTo(url, fn, args) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ fn, args }),
        cache: 'no-store'
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Server error');
      return json.data;
    }

    async function testAppsScriptConnection() {
      const value = $('#appscript-url')?.value.trim();
      if (!validAppsScriptUrl(value)) return toast('Enter a valid Apps Script Web App URL ending in /exec');
      const previous = GAS_URL;
      GAS_URL = value;
      try {
        await rawPost('publicClasses', []);
        toast('Apps Script connection successful');
      } catch (error) {
        toast('Apps Script connection failed: ' + (error.message || String(error)));
      } finally { GAS_URL = previous; }
    }

    async function sendTestAttendanceEmail() {
      const result = await call('sendTestAttendanceEmail');
      if (result?.sent) toast('Test email sent to ' + result.email);
    }

    async function createNewClass() {
      const b = $('#cls-branch')?.value.trim();
      const sem = $('#cls-sem')?.value;
      const sec = $('#cls-sec')?.value.trim();
      const r = await call('createClass', b, sem, sec);
      if (r) {
        S.classes = r;
        cacheSet('staff_classes_' + S.user.username, r);
        if (!S.classId && r.length) S.classId = r[0].id;
        toast('Class workbook created');
        vSetup();
      }
    }

    function openRenameClassModal(id, branch, sem, sec) {
      const m = $('#modal-content');
      m.innerHTML = `
    <h4>Rename Class</h4>
    <p>Updates the class details and renames its Google Spreadsheet file.</p>
    <label class="lbl">Branch</label>
    <input id="rn-b" class="inp" value="${esc(branch)}">
    <div class="row2">
      <div>
        <label class="lbl">Semester</label>
        <select id="rn-s" class="inp">
          ${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}" ${String(n) === String(sem) ? 'selected' : ''}>Sem ${n}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="lbl">Section</label>
        <input id="rn-sec" class="inp" value="${esc(sec)}" style="text-transform:uppercase">
      </div>
    </div>
    <div class="row2" style="margin-top:14px">
      <button class="btn sec" onclick="closeModal()">Cancel</button>
      <button class="btn gold" id="rn-save-btn">Save Changes</button>
    </div>
  `;
      $('#modal-backdrop').classList.add('open');
      $('#rn-save-btn').onclick = async () => {
        const nb = $('#rn-b').value.trim();
        const ns = $('#rn-s').value;
        const nsec = $('#rn-sec').value.trim();
        closeModal();
        const r = await call('renameClass', id, nb, ns, nsec);
        if (r) {
          S.classes = r;
          cacheSet('staff_classes_' + S.user.username, r);
          toast('Class renamed');
          vSetup();
        }
      };
    }

    async function saveMinPct() {
      const val = $('#min-pct-inp')?.value;
      const r = await call('setMinPercent', val);
      if (r && r.min) {
        S.minPct = r.min;
        toast(`Minimum attendance updated to ${r.min}%`);
      }
    }

    async function addNewTeacher() {
      const u = $('#t-user')?.value.trim();
      const n = $('#t-name')?.value.trim();
      const p = $('#t-pass')?.value;
      const r = await call('addTeacher', u, n, p);
      if (r) {
        S.teachers = r;
        cacheSet('staff_teachers', r);
        toast('Faculty account created');
        vSetup();
      }
    }

    function promptResetTeacherPw(username) {
      showPromptModal(
        `Reset Password (@${username})`,
        'Enter a new password (minimum 4 characters):',
        'New password',
        '',
        async newPass => {
          const r = await call('resetTeacherPassword', username, newPass);
          if (r) toast(r);
        }
      );
    }

    function confirmRemoveTeacher(username, name) {
      showConfirmModal(
        'Remove Faculty?',
        `Remove ${name} (@${username})? Their subjects will remain intact but become unassigned.`,
        'Remove',
        true,
        async () => {
          const r = await call('removeTeacher', username);
          if (r) {
            S.teachers = r;
            cacheSet('staff_teachers', r);
            toast('Faculty removed');
            vSetup();
          }
        }
      );
    }

    /* ============================================================================
     * 9. STUDENT DASHBOARD (`getMyAttendance` — Persistent Cache, No Repeated Fetch)
     * ============================================================================ */
    async function vStudent(forceRefresh = false) {
      const v = $('#view');
      const cacheKey = 'myatt_' + (S.user?.classId || '') + '_' + (S.user?.username || '');
      const cachedEntry = cacheGetEntry(cacheKey);

      // 1. If we have cached data in localStorage, show it immediately (0ms)!
      if (cachedEntry && cachedEntry.data) {
        const freshEnough = isCacheFresh(cacheKey, STUDENT_TTL_MS);
        // Do NOT re-fetch from Google Script if cache is less than 5 mins old (unless user tapped Refresh)
        if (!forceRefresh && freshEnough) {
          drawStudentAttendance(cachedEntry.data, false, cachedEntry.ts);
          return;
        }
        // Cache is older than 5 mins or user tapped Refresh -> show cached UI with subtle syncing badge
        drawStudentAttendance(cachedEntry.data, true, cachedEntry.ts);
      } else {
        // First time ever opening -> show smooth Shimmer Skeleton UI
        v.innerHTML = skStudent();
      }

      const d = await call('getMyAttendance');
      if (!d) return;
      cacheSet(cacheKey, d);
      if (forceRefresh) toast('Attendance synced');
      if (S.tab === 'myatt') drawStudentAttendance(d, false, Date.now());
    }

    function applyAttendanceRange() {
      const from = $('#att-range-from')?.value || '';
      const to = $('#att-range-to')?.value || '';
      if (from && to && from > to) return toast('Start date must be before end date');
      S.attFrom = from;
      S.attTo = to;
      const cacheKey = 'myatt_' + (S.user?.classId || '') + '_' + (S.user?.username || '');
      const cached = cacheGet(cacheKey);
      if (cached) drawStudentAttendance(cached, false, cacheGetEntry(cacheKey)?.ts || Date.now());
      else vStudent();
    }

    function clearAttendanceRange() {
      S.attFrom = '';
      S.attTo = '';
      const from = $('#att-range-from');
      const to = $('#att-range-to');
      if (from) from.value = '';
      if (to) to.value = '';
      applyAttendanceRange();
    }

    function attendanceDateInRange(record, from, to) {
      const date = String(record.d || '').slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(date) && (!from || date >= from) && (!to || date <= to);
    }

    function attendanceForRange(source) {
      const subjects = (source.subjects || []).map(subject => {
        const records = (subject.records || []).filter(r => attendanceDateInRange(r, S.attFrom, S.attTo));
        const present = records.filter(r => r.s === 'P').length;
        const total = records.filter(r => r.s === 'P' || r.s === 'A').length;
        return { ...subject, records, p: present, t: total, pct: total ? Math.round(present * 1000 / total) / 10 : null };
      });
      const extras = (source.extras || []).map(extra => {
        const records = (extra.records || []).filter(r => attendanceDateInRange(r, S.attFrom, S.attTo));
        const p = records.reduce((sum, r) => sum + (Number(String(r.s).split('/')[0]) || 0), 0);
        const t = records.reduce((sum, r) => sum + (Number(String(r.s).split('/')[1]) || 0), 0);
        return { ...extra, records, p, t };
      });
      const p = subjects.reduce((sum, s) => sum + s.p, 0) + extras.reduce((sum, x) => sum + x.p, 0);
      const t = subjects.reduce((sum, s) => sum + s.t, 0);
      return { ...source, subjects, extras, p, t, overall: t ? Math.round(Math.min(100, p * 100 / t) * 10) / 10 : null };
    }

    function drawStudentAttendance(source, isSyncing, ts) {
      const inRange = Boolean(S.attFrom || S.attTo);
      const d = inRange ? attendanceForRange(source) : source;
      const v = $('#view');
      const col = p => p == null ? 'var(--mu)' : p >= d.min ? 'var(--ok)' : p >= d.min - 10 ? 'var(--warn)' : 'var(--bad)';
      const needMore = (p, t) => {
        const m = d.min / 100;
        if (m >= 1) return Math.max(0, t - p);
        const x = Math.ceil((m * t - p) / (1 - m));
        return x > 0 ? x : 0;
      };

      const extrasSum = (d.extras || []).reduce((acc, x) => acc + (x.p || 0), 0);

      v.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span class="sync-pill">
        <span class="sync-dot ${isSyncing ? 'pulsing' : ''}"></span>
        ${isSyncing ? 'Refreshing from server…' : 'Saved on device • Synced ' + timeAgo(ts)}
      </span>
      <button class="btn sm sec" onclick="vStudent(true)">Refresh</button>
    </div>

    <div class="card">
      <h3>Attendance by Date Range</h3>
      <p class="hint">Choose a period to see your attendance and day-wise records within those dates.</p>
      <div class="row2">
        <div><label class="lbl" for="att-range-from">From</label><input id="att-range-from" class="inp" type="date" value="${esc(S.attFrom || '')}"></div>
        <div><label class="lbl" for="att-range-to">To</label><input id="att-range-to" class="inp" type="date" value="${esc(S.attTo || '')}"></div>
      </div>
      <div class="row2" style="margin-top:8px">
        <button class="btn gold" onclick="applyAttendanceRange()">Show Attendance</button>
        <button class="btn sec" onclick="clearAttendanceRange()">Clear Dates</button>
      </div>
      ${inRange ? `<p class="hint" style="margin-bottom:0">Showing ${S.attFrom ? esc(S.attFrom) : 'all recorded dates'} through ${S.attTo ? esc(S.attTo) : 'today'}. Percentages use classes marked in this period.</p>` : ''}
    </div>

    <div class="card" style="text-align:center;position:relative">
      <div class="ring-wrap" style="background:conic-gradient(${col(d.overall)} ${(d.overall || 0) * 3.6}deg, var(--ln) 0)">
        <div class="ring-inner">
          <b style="color:${col(d.overall)}">${d.overall == null ? '–' : d.overall + '%'}</b>
          <small>Min ${d.min}%</small>
        </div>
      </div>

      <h3 style="justify-content:center;font-size:16px;margin-top:6px">${esc(S.user.name)}</h3>
      <p class="hint" style="margin-bottom:8px">
        <b>${d.p}</b> total credit / <b>${d.t}</b> regular classes
        ${extrasSum > 0 ? ` <span class="tag extra">+${extrasSum} Extra Bonus</span>` : ''}
      </p>

      ${inRange
          ? d.overall != null && d.overall < d.min
            ? `<span class="tag bad" style="padding:5px 12px;font-size:11.5px">Below ${d.min}% for this period</span>`
            : d.overall != null
              ? `<span class="tag ok" style="padding:5px 12px;font-size:11.5px">On Track for this period</span>`
              : `<span class="tag">No classes marked in this period</span>`
          : d.overall != null && d.overall < d.min
          ? `<span class="tag bad" style="padding:5px 12px;font-size:11.5px">Below ${d.min}% — Attend next <b>${needMore(d.p, d.t)}</b> classes continuously</span>`
          : d.overall != null
            ? `<span class="tag ok" style="padding:5px 12px;font-size:11.5px">On Track (Above ${d.min}% requirement)</span>`
            : `<span class="tag">No classes recorded yet</span>`}
    </div>

    <!-- Regular Subjects -->
    <div style="font-size:12px;font-weight:900;color:var(--navy);text-transform:uppercase;margin:14px 4px 8px;letter-spacing:0.04em">
      Subject-wise Attendance (${(d.subjects || []).length})
    </div>

    ${(d.subjects || []).length ? d.subjects.map(s => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <b style="font-size:14.5px;color:var(--navy)">${esc(s.subject)}</b>
            <div style="font-size:11.5px;color:var(--mu)">${esc(s.teacher ? 'Prof. ' + s.teacher : 'AIML Faculty')}</div>
          </div>
          <b style="font-size:18px;color:${col(s.pct)}">${s.pct == null ? '–' : s.pct + '%'}</b>
        </div>
        <div class="pbar"><i style="width:${Math.min(100, s.pct || 0)}%;background:${col(s.pct)}"></i></div>
        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--mu);font-weight:700">
          <span>${s.p} Present / ${s.t} Classes</span>
          ${s.pct != null && s.pct < d.min ? `<span style="color:var(--bad)">${inRange ? `Below ${d.min}% in this period` : `Need ${needMore(s.p, s.t)} more for ${d.min}%`}</span>` : ''}
        </div>
        ${s.records && s.records.length ? `
          <details style="margin-top:8px;border-top:1px solid var(--ln);padding-top:6px">
            <summary style="font-size:12px;font-weight:800;color:var(--navy);cursor:pointer">Day-wise Attendance Log (${s.records.length})</summary>
            <div class="rec-pills">
              ${s.records.map(r => `<span class="${esc(r.k)}">${esc(r.d)} • ${esc(r.s)}</span>`).join('')}
            </div>
          </details>
        ` : ''}
      </div>
    `).join('') : `<div class="card empty">No subjects added to your class yet.</div>`}

    <!-- Extra Activities -->
    ${(d.extras || []).length ? `
      <div style="font-size:12px;font-weight:900;color:var(--navy);text-transform:uppercase;margin:14px 4px 8px;letter-spacing:0.04em">
        Extra Activities & Bonus Credits
      </div>
      ${d.extras.map(ex => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <b style="font-size:14px;color:var(--navy)">${esc(ex.subject)}</b>
              <div style="font-size:11.5px;color:var(--mu)">Bonus lectures credited: <b>+${ex.p}</b> (out of ${ex.t} conducted)</div>
            </div>
            <span class="tag extra">+${ex.p} Lecs</span>
          </div>
          ${ex.records && ex.records.length ? `
            <div class="rec-pills" style="margin-top:8px">
              ${ex.records.map(r => `<span class="${esc(r.k)}">${esc(r.d)}: ${esc(r.s)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `).join('')}
    ` : ''}

    ${devFooterHTML()}
  `;
    }

    /* ============================================================================
     * 10. PROFILE & DEPARTMENT INFO TAB
     * ============================================================================ */
    async function vProfile() {
      const u = S.user;
      const isStaff = u.role === 'HOD' || u.role === 'TEACHER';
      const emailReportSettings = u.role === 'HOD'
        ? await call('getEmailReportSettings') || { email: '', senderEmail: '', senderAliases: [], daily: true, weekly: true, monthly: true, hour: 18 }
        : null;

      $('#view').innerHTML = `
    <div class="card card-navy" style="text-align:center;padding:20px 16px">
      <div style="display:flex;justify-content:center;margin-bottom:12px">
        ${renderLogos('md')}
      </div>
      <div class="tag" style="margin-bottom:8px">${GROUP_NAME}</div>
      <h3 style="justify-content:center;font-size:17px;color:#fff;margin-bottom:2px">
        ${esc(u.role === 'HOD' ? HOD_NAME : u.name)}
      </h3>
      <p style="margin:2px 0 10px;color:var(--gold);font-weight:800;font-size:12.5px">
        ${u.role === 'HOD'
          ? 'Head of Department (HOD) — AIML'
          : u.role === 'TEACHER'
            ? `Faculty Member (@${esc(u.username)}) — AIML`
            : `Student (${esc(u.username)}) • ${esc(u.label)}`}
      </p>

      <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(197,160,89,0.35);border-radius:12px;padding:10px;text-align:left;font-size:12px;line-height:1.6">
        <div><b>Institute:</b> ${COLLEGE_NAME}</div>
        <div><b>Department:</b> Artificial Intelligence & Machine Learning (AIML)</div>
        <div><b>HOD:</b> ${HOD_NAME}</div>
        <div><b>Group:</b> BGI (Bhopal | Indore | Mandideep)</div>
      </div>
    </div>

    ${u.role === 'HOD' ? `
      <div class="card">
        <h3>Apps Script Connection</h3>
        <p class="hint">Paste the deployed Google Apps Script Web App URL ending in <b>/exec</b>.</p>
        <label class="lbl" for="appscript-url">Web App URL</label>
        <input id="appscript-url" class="inp" type="url" value="${esc(GAS_URL)}" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="url">
        <div class="row2" style="margin-top:10px">
          <button class="btn gold" onclick="saveAppsScriptUrl()">Save Connection</button>
          <button class="btn sec" onclick="testAppsScriptConnection()">Test Connection</button>
        </div>
      </div>

      <div class="card">
        <h3>Automatic Attendance Emails</h3>
        <p class="hint">Choose the reports and sending time. Weekly and monthly reports include an Excel workbook.</p>
        <label class="lbl" for="report-email">Report recipient email</label>
        <input id="report-email" class="inp" type="email" value="${esc(emailReportSettings.email)}" placeholder="hod@example.com" autocomplete="email">
        <label class="lbl" for="report-sender">Sender ID (Apps Script Gmail)</label>
        <select id="report-sender" class="inp">
          <option value="" ${!emailReportSettings.senderEmail ? 'selected' : ''}>Default Apps Script account</option>
          ${(emailReportSettings.senderAliases || []).map(alias => `<option value="${esc(alias)}" ${alias === emailReportSettings.senderEmail ? 'selected' : ''}>${esc(alias)}</option>`).join('')}
        </select>
        <p class="hint">Sender IDs must already be configured as “Send mail as” aliases on the Google account running Apps Script. No app password is needed.</p>
        <label class="lbl" for="report-hour">Send hour (project time zone)</label>
        <select id="report-hour" class="inp">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === Number(emailReportSettings.hour) ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select>
        <div style="display:grid;gap:8px;margin:12px 0">
          <label style="display:flex;align-items:center;gap:8px"><input id="report-daily" type="checkbox" ${emailReportSettings.daily ? 'checked' : ''}> Daily present and absent list</label>
          <label style="display:flex;align-items:center;gap:8px"><input id="report-weekly" type="checkbox" ${emailReportSettings.weekly ? 'checked' : ''}> Weekly attendance Excel (Monday)</label>
          <label style="display:flex;align-items:center;gap:8px"><input id="report-monthly" type="checkbox" ${emailReportSettings.monthly ? 'checked' : ''}> Monthly overall attendance (1st)</label>
        </div>
        <div class="row2" style="margin-top:10px">
          <button class="btn gold" onclick="saveEmailReportSettings()">Save Report Settings</button>
          <button class="btn sec" onclick="sendTestAttendanceEmail()">Send Test Email</button>
        </div>
        <p class="hint" style="margin-bottom:0">Weekly reports cover the previous Monday–Sunday. Monthly reports cover the previous calendar month. Send time uses the Apps Script project time zone.</p>
      </div>
    ` : ''}

    ${isStaff ? `
      <div class="card">
        <h3>Change My Password</h3>
        <p class="hint">Update login password for @${esc(u.username)}</p>
        <label class="lbl">Current Password</label>
        <input id="pw-old" type="password" class="inp" placeholder="Enter current password">
        <label class="lbl">New Password (min 4 characters)</label>
        <input id="pw-new" type="password" class="inp" placeholder="Enter new password">
        <button class="btn gold" style="margin-top:12px" onclick="updateMyPassword()">Update Password</button>
      </div>
    ` : ''}

    <div class="card" style="text-align:center">
      <div style="font-size:11px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:0.05em">
        System Architecture & Engineering
      </div>
      <div style="font-size:16px;font-weight:900;color:var(--navy);margin:4px 0">
        <a href="${DEVLINK_URL}" target="_blank" rel="noopener noreferrer" class="dev-link-plain">Developed by Devlinkhub Team</a>
      </div>
      <p class="hint" style="margin:0">
        Optimized for Low-Connectivity Campus Zones • BIST Bhopal AIML Portal v4.5
      </p>
    </div>

    <button class="btn red" onclick="logout()">Sign Out of Account</button>
    ${devFooterHTML()}
  `;
    }

    async function updateMyPassword() {
      const o = $('#pw-old')?.value;
      const n = $('#pw-new')?.value;
      if (!o || !n) return toast('Enter both old and new password');
      const r = await call('changePassword', o, n);
      if (r) {
        toast(r);
        $('#pw-old').value = '';
        $('#pw-new').value = '';
      }
    }

    window.onload = async () => {
      await loadSharedAppsScriptUrl();
      await init();
    };
  
