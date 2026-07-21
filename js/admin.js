/* ==========================================================================
   Merit Legal Services — Staff admin dashboard (admin-log-in.html)
   Real security comes from Supabase Auth + Row Level Security: only accounts
   listed in the `admins` table can read or manage data. This script just
   drives the UI for creating availability and reviewing appointment requests.
   ========================================================================== */
(function () {
  "use strict";

  var sb = window.mlsSupabase && window.mlsSupabase();

  var el = {
    loading:      document.getElementById("admin-loading"),
    unconfigured: document.getElementById("admin-unconfigured"),
    auth:         document.getElementById("admin-auth"),
    denied:       document.getElementById("admin-denied"),
    dash:         document.getElementById("admin-dash"),
    who:          document.getElementById("admin-who"),
    summary:      document.getElementById("admin-summary"),
    loginForm:    document.getElementById("admin-login-form"),
    logoutBtn:    document.getElementById("admin-logout"),
    apptsBox:     document.getElementById("admin-appts"),
    slotsBox:     document.getElementById("admin-slots"),
    recurTimes:   document.getElementById("recur-times")
  };

  if (!el.dash) return;

  if (!sb) {
    hide(el.loading);
    show(el.unconfigured);
    return;
  }

  /* ---------- helpers ---------- */
  function show(n) { if (n) n.hidden = false; }
  function hide(n) { if (n) n.hidden = true; }
  function alertBox(n, msg, kind) {
    if (!n) return;
    n.textContent = msg || "";
    n.className = "form-alert" + (kind ? " is-" + kind : "");
    n.hidden = !msg;
  }
  function fieldError(id, bad) { var g = document.getElementById(id); if (g) g.classList.toggle("has-error", bad); return bad; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function setBusy(btn, busy, restore) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = busy; }
    else { btn.disabled = false; btn.textContent = restore || btn.dataset.label || btn.textContent; }
  }
  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  function fmtDate(s) { var p = String(s).split("-"); var d = new Date(+p[0], +p[1]-1, +p[2]); return DAYS[d.getDay()]+", "+MONTHS[d.getMonth()]+" "+d.getDate()+", "+d.getFullYear(); }
  function fmtTime(s) { var p = String(s).split(":"); var h=+p[0], m=p[1]||"00"; var ap=h>=12?"PM":"AM"; var h12=h%12; if(h12===0)h12=12; return h12+":"+m+" "+ap; }
  function todayISO() { var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }

  /* ---------- session / gate ---------- */
  function gate(session) {
    hide(el.loading);
    if (!session || !session.user) {
      show(el.auth); hide(el.denied); hide(el.dash); hide(el.logoutBtn);
      return;
    }
    /* Signed in — is this account an admin? */
    sb.rpc("is_admin").then(function (res) {
      var isAdmin = res && res.data === true;
      if (isAdmin) {
        hide(el.auth); hide(el.denied); show(el.dash); show(el.logoutBtn);
        if (el.who) el.who.textContent = session.user.email || "";
        initDashboard();
      } else {
        hide(el.auth); show(el.denied); hide(el.dash); hide(el.logoutBtn);
      }
    });
  }

  sb.auth.getSession().then(function (r) { gate(r && r.data ? r.data.session : null); });
  sb.auth.onAuthStateChange(function (_e, session) { gate(session); });

  /* ---------- login ---------- */
  if (el.loginForm) {
    el.loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = el.loginForm.elements["email"].value.trim();
      var pass = el.loginForm.elements["password"].value;
      var bad = false;
      bad = fieldError("group-admin-email", !emailPattern.test(email)) || bad;
      bad = fieldError("group-admin-pass", pass === "") || bad;
      if (bad) return;
      var btn = el.loginForm.querySelector("button[type='submit']");
      setBusy(btn, "Logging in\u2026");
      alertBox(document.getElementById("admin-login-alert"), "");
      sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
        setBusy(btn, false, "Log In");
        if (res.error) {
          var m = /invalid login credentials/i.test(res.error.message) ? "Email or password is incorrect." : res.error.message;
          alertBox(document.getElementById("admin-login-alert"), m, "error");
        }
      });
      el.loginForm.querySelectorAll("input").forEach(function (f) {
        f.addEventListener("input", function () { var g = f.closest(".form-group"); if (g) g.classList.remove("has-error"); });
      });
    });
  }

  function doLogout() { sb.auth.signOut(); }
  if (el.logoutBtn) el.logoutBtn.addEventListener("click", doLogout);
  var deniedLogout = document.getElementById("admin-denied-logout");
  if (deniedLogout) deniedLogout.addEventListener("click", doLogout);

  /* ---------- dashboard init (once) ---------- */
  var dashReady = false;
  function initDashboard() {
    if (dashReady) { refreshAll(); return; }
    dashReady = true;

    /* panel tabs */
    document.querySelectorAll(".admin-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".admin-tab").forEach(function (t) {
          var a = t === tab; t.classList.toggle("is-active", a); t.setAttribute("aria-selected", a ? "true" : "false");
        });
        document.querySelectorAll(".admin-panel").forEach(function (p) { p.hidden = true; });
        var panel = document.getElementById(tab.getAttribute("data-panel"));
        if (panel) panel.hidden = false;
      });
    });

    /* appointment filters */
    document.querySelectorAll("#appt-filters .chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        document.querySelectorAll("#appt-filters .chip").forEach(function (c) { c.classList.toggle("is-active", c === chip); });
        apptFilter = chip.getAttribute("data-filter");
        renderAppts();
      });
    });

    /* availability: date minimums + defaults */
    var t = todayISO();
    ["single-date", "recur-from", "recur-to"].forEach(function (id) {
      var n = document.getElementById(id); if (n) n.setAttribute("min", t);
    });
    var rf = document.getElementById("recur-from"); if (rf && !rf.value) rf.value = t;

    /* recurring time rows */
    addTimeRow("09:00");
    document.getElementById("add-time-row").addEventListener("click", function () { addTimeRow("10:00"); });

    document.getElementById("single-add").addEventListener("click", addSingle);
    document.getElementById("recur-generate").addEventListener("click", generateRecurring);
    document.getElementById("publish-all").addEventListener("click", publishAllDrafts);
    var showPast = document.getElementById("show-past");
    if (showPast) showPast.addEventListener("change", renderSlots);

    /* create appointment (call-in / walk-in) */
    var toggleCreate = document.getElementById("toggle-create");
    if (toggleCreate) toggleCreate.addEventListener("click", function () {
      var card = document.getElementById("create-card");
      card.hidden = !card.hidden;
      if (!card.hidden) fillCreateSlots();
    });
    var createSubmit = document.getElementById("create-submit");
    if (createSubmit) createSubmit.addEventListener("click", createAppointment);
    ["create-first", "create-last", "create-email", "create-phone", "create-service", "create-slot"].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.addEventListener("input", function () { var g = n.closest(".form-group"); if (g) g.classList.remove("has-error"); });
    });

    refreshAll();
  }

  function refreshAll() { loadAppointments(); loadSlots(); }

  /* ====================================================================
     AVAILABILITY
     ==================================================================== */
  function addTimeRow(val) {
    var row = document.createElement("div");
    row.className = "time-row";
    row.innerHTML = '<input type="time" step="900" value="' + esc(val) + '">' +
                    '<button type="button" class="linklike remove-time" aria-label="Remove time">&times;</button>';
    row.querySelector(".remove-time").addEventListener("click", function () {
      if (el.recurTimes.querySelectorAll(".time-row").length > 1) row.remove();
    });
    el.recurTimes.appendChild(row);
  }

  function addSingle() {
    var date = document.getElementById("single-date").value;
    var time = document.getElementById("single-time").value;
    var publish = document.getElementById("single-publish").checked;
    var staff = document.getElementById("single-staff").value.trim();
    var alertN = document.getElementById("single-alert");
    if (!date || !time) { alertBox(alertN, "Pick a date and time.", "error"); return; }
    var btn = document.getElementById("single-add");
    setBusy(btn, "Adding\u2026");
    upsertSlots([{ slot_date: date, slot_time: normTime(time), published: publish, staff_name: staff || null }]).then(function (res) {
      setBusy(btn, false, "Add Time");
      if (res.error) { alertBox(alertN, res.error.message, "error"); return; }
      alertBox(alertN, "Time added.", "success");
      loadSlots();
    });
  }

  function generateRecurring() {
    var alertN = document.getElementById("recur-alert");
    var days = [];
    document.querySelectorAll("#weekday-row input:checked").forEach(function (c) { days.push(+c.value); });
    var times = [];
    el.recurTimes.querySelectorAll("input[type='time']").forEach(function (i) { if (i.value) times.push(normTime(i.value)); });
    var from = document.getElementById("recur-from").value;
    var to = document.getElementById("recur-to").value;
    var publish = document.getElementById("recur-publish").checked;
    var staff = document.getElementById("recur-staff").value.trim();

    if (!days.length) { alertBox(alertN, "Choose at least one weekday.", "error"); return; }
    if (!times.length) { alertBox(alertN, "Add at least one time.", "error"); return; }
    if (!from || !to) { alertBox(alertN, "Pick a start and end date.", "error"); return; }
    if (to < from) { alertBox(alertN, "End date must be after start date.", "error"); return; }

    var rows = [];
    var start = parseISO(from), end = parseISO(to);
    for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (days.indexOf(d.getDay()) === -1) continue;
      var ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      times.forEach(function (tm) { rows.push({ slot_date: ds, slot_time: tm, published: publish, staff_name: staff || null }); });
    }
    if (!rows.length) { alertBox(alertN, "No dates matched. Widen the range or weekdays.", "error"); return; }
    if (rows.length > 500) { alertBox(alertN, "That would create " + rows.length + " times. Please narrow the range.", "error"); return; }

    var btn = document.getElementById("recur-generate");
    setBusy(btn, "Generating\u2026");
    upsertSlots(rows).then(function (res) {
      setBusy(btn, false, "Generate Times");
      if (res.error) { alertBox(alertN, res.error.message, "error"); return; }
      alertBox(alertN, "Added " + rows.length + " time(s). Duplicates were skipped.", "success");
      loadSlots();
    });
  }

  function upsertSlots(rows) {
    /* ignoreDuplicates so re-running never errors on an existing (date,time) */
    return sb.from("slots").upsert(rows, { onConflict: "slot_date,slot_time", ignoreDuplicates: true });
  }

  function publishAllDrafts() {
    var btn = document.getElementById("publish-all");
    setBusy(btn, "Publishing\u2026");
    sb.from("slots").update({ published: true }).eq("published", false).gte("slot_date", todayISO()).then(function (res) {
      setBusy(btn, false, "Publish all drafts");
      loadSlots();
    });
  }

  var allSlots = [];
  var activeSlotIds = {};
  function loadSlots() {
    /* Load slots and mark which are held by an active appointment. */
    Promise.all([
      sb.from("slots").select("id, slot_date, slot_time, published, staff_name").order("slot_date").order("slot_time"),
      sb.from("appointments").select("slot_id").in("status", ["pending", "confirmed"])
    ]).then(function (r) {
      allSlots = (r[0] && r[0].data) || [];
      activeSlotIds = {};
      ((r[1] && r[1].data) || []).forEach(function (a) { if (a.slot_id) activeSlotIds[a.slot_id] = true; });
      renderSlots();
    });
  }

  function renderSlots() {
    if (!el.slotsBox) return;
    var showPast = document.getElementById("show-past") && document.getElementById("show-past").checked;
    var t = todayISO();
    var rows = allSlots.filter(function (s) { return showPast || s.slot_date >= t; });
    if (!rows.length) {
      el.slotsBox.innerHTML = '<p class="portal-status">No times yet. Add some above.</p>';
      return;
    }
    var html = '<table class="admin-table"><thead><tr><th>Date</th><th>Time</th><th>With</th><th>Status</th><th></th></tr></thead><tbody>';
    rows.forEach(function (s) {
      var booked = !!activeSlotIds[s.id];
      var state = booked ? '<span class="badge badge-confirmed">Booked</span>'
                         : (s.published ? '<span class="badge badge-open">Open</span>' : '<span class="badge badge-draft">Draft</span>');
      html += '<tr>' +
        '<td>' + esc(fmtDate(s.slot_date)) + '</td>' +
        '<td>' + esc(fmtTime(s.slot_time)) + '</td>' +
        '<td>' + (s.staff_name ? esc(s.staff_name) : '<span class="muted">&mdash;</span>') + '</td>' +
        '<td>' + state + '</td>' +
        '<td class="row-actions">' +
          (s.published
            ? '<button class="linklike" data-act="unpublish" data-id="' + s.id + '">Unpublish</button>'
            : '<button class="linklike" data-act="publish" data-id="' + s.id + '">Publish</button>') +
          (booked ? '' : '<button class="linklike danger" data-act="delete" data-id="' + s.id + '">Delete</button>') +
        '</td></tr>';
    });
    html += '</tbody></table>';
    el.slotsBox.innerHTML = html;

    el.slotsBox.querySelectorAll("button[data-act]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-id"), act = b.getAttribute("data-act");
        if (act === "delete") {
          if (!window.confirm("Delete this time?")) return;
          sb.from("slots").delete().eq("id", id).then(loadSlots);
        } else {
          sb.from("slots").update({ published: act === "publish" }).eq("id", id).then(loadSlots);
        }
      });
    });
  }

  /* ====================================================================
     APPOINTMENTS
     ==================================================================== */
  var STATUS = {
    pending:   { label: "Pending",   cls: "pending"   },
    confirmed: { label: "Confirmed", cls: "confirmed" },
    rejected:  { label: "Declined",  cls: "rejected"  },
    cancelled: { label: "Cancelled", cls: "cancelled" }
  };
  var allAppts = [];
  var apptFilter = "pending";
  var openSlots = [];

  function loadAppointments() {
    Promise.all([
      sb.from("appointments")
        .select("id, first_name, last_name, email, phone, service, language, notes, slot_date, slot_time, staff_name, status, created_at")
        .order("slot_date", { ascending: true }).order("slot_time", { ascending: true }),
      sb.rpc("available_slots")
    ]).then(function (r) {
      if (r[0] && r[0].error) { el.apptsBox.innerHTML = '<p class="portal-status">Could not load appointments.</p>'; return; }
      allAppts = (r[0] && r[0].data) || [];
      openSlots = (r[1] && r[1].data) || [];
      updateSummary();
      renderAppts();
      fillCreateSlots();
    });
  }

  function slotOptionLabel(s) {
    return fmtDate(s.slot_date) + " \u2014 " + fmtTime(s.slot_time) + (s.staff_name ? " (with " + s.staff_name + ")" : "");
  }

  function fillCreateSlots() {
    var sel = document.getElementById("create-slot");
    if (!sel) return;
    sel.innerHTML = "";
    var first = document.createElement("option");
    first.value = "";
    first.textContent = openSlots.length ? "Select an open time\u2026" : "No open times — add availability first";
    sel.appendChild(first);
    openSlots.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = slotOptionLabel(s);
      sel.appendChild(o);
    });
  }

  function createAppointment() {
    var first = document.getElementById("create-first").value.trim();
    var last = document.getElementById("create-last").value.trim();
    var email = document.getElementById("create-email").value.trim();
    var phone = document.getElementById("create-phone").value.trim();
    var service = document.getElementById("create-service").value;
    var slot = document.getElementById("create-slot").value;
    var language = document.getElementById("create-language").value;
    var notes = document.getElementById("create-notes").value.trim();
    var alertN = document.getElementById("create-alert");

    var bad = false;
    bad = fieldError("group-create-first", first === "") || bad;
    bad = fieldError("group-create-last", last === "") || bad;
    bad = fieldError("group-create-email", !emailPattern.test(email)) || bad;
    bad = fieldError("group-create-phone", phone === "") || bad;
    bad = fieldError("group-create-service", service === "") || bad;
    bad = fieldError("group-create-slot", slot === "") || bad;
    if (bad) return;

    var btn = document.getElementById("create-submit");
    setBusy(btn, "Creating\u2026");
    alertBox(alertN, "");
    sb.rpc("admin_book_slot", {
      p_slot_id: slot,
      p_first: first,
      p_last: last,
      p_email: email,
      p_phone: phone,
      p_service: service,
      p_language: language,
      p_notes: notes
    }).then(function (res) {
      setBusy(btn, false, "Create Appointment");
      if (res.error) { alertBox(alertN, res.error.message, "error"); refreshAll(); return; }
      ["create-first", "create-last", "create-email", "create-phone", "create-notes"].forEach(function (id) { document.getElementById(id).value = ""; });
      document.getElementById("create-service").value = "";
      document.getElementById("create-slot").value = "";
      alertBox(alertN, "Appointment created and confirmed.", "success");
      refreshAll();
    });
  }

  function updateSummary() {
    var pending = allAppts.filter(function (a) { return a.status === "pending"; }).length;
    if (el.summary) el.summary.textContent = pending ? (pending + " pending to review") : "No pending requests";
  }

  function renderAppts() {
    var rows = apptFilter === "all" ? allAppts : allAppts.filter(function (a) { return a.status === apptFilter; });
    if (!rows.length) {
      el.apptsBox.innerHTML = '<p class="portal-status">Nothing here.</p>';
      return;
    }
    el.apptsBox.innerHTML = "";
    rows.forEach(function (a) {
      var meta = STATUS[a.status] || STATUS.pending;
      var card = document.createElement("article");
      card.className = "admin-appt";
      card.innerHTML =
        '<div class="appt-head">' +
          '<span class="appt-when">' + esc(fmtDate(a.slot_date)) + " &middot; " + esc(fmtTime(a.slot_time)) + '</span>' +
          '<span class="badge badge-' + meta.cls + '">' + meta.label + '</span>' +
        '</div>' +
        '<p class="appt-name">' + esc(a.first_name + " " + a.last_name) + '</p>' +
        '<p class="appt-meta">' +
          '<a href="mailto:' + esc(a.email) + '">' + esc(a.email) + '</a> &middot; ' +
          '<a href="tel:' + esc(String(a.phone).replace(/[^0-9+]/g, "")) + '">' + esc(a.phone) + '</a>' +
        '</p>' +
        '<p class="appt-service"><strong>' + esc(a.service) + '</strong>' +
          (a.staff_name ? ' &middot; with ' + esc(a.staff_name) : '') +
          (a.language ? ' &middot; ' + esc(a.language) : '') + '</p>' +
        (a.notes ? '<p class="appt-notes">&ldquo;' + esc(a.notes) + '&rdquo;</p>' : '') +
        '<div class="appt-actions"></div>' +
        '<div class="change-box" hidden></div>';

      var actions = card.querySelector(".appt-actions");
      if (a.status === "pending" || a.status === "confirmed") {
        if (a.status !== "confirmed") actions.appendChild(mkBtn("Confirm", "btn-gold", function (b) { setStatus(a.id, "confirmed", b); }));
        actions.appendChild(mkBtn("Change time", "btn-navy", function () { toggleChange(card, a.id); }));
        actions.appendChild(mkBtn("Decline", "btn-ghost", function (b) {
          if (window.confirm("Decline this request? The time is freed for others.")) setStatus(a.id, "rejected", b);
        }));
      } else if (a.status === "rejected" || a.status === "cancelled") {
        actions.appendChild(mkBtn("Reinstate (confirm)", "btn-navy", function (b) { setStatus(a.id, "confirmed", b); }));
      }
      el.apptsBox.appendChild(card);
    });
  }

  function mkBtn(label, cls, onClick) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "btn btn-sm " + cls; b.textContent = label;
    b.addEventListener("click", function () { onClick(b); });
    return b;
  }

  function setStatus(id, status, btn) {
    setBusy(btn, "\u2026");
    sb.from("appointments").update({ status: status }).eq("id", id).then(function (res) {
      if (res.error) { setBusy(btn, false); window.alert(res.error.message); return; }
      refreshAll();
    });
  }

  function toggleChange(card, id) {
    var box = card.querySelector(".change-box");
    if (!box.hidden) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    if (!openSlots.length) {
      box.innerHTML = '<p class="appt-note">No other open times available. Add availability first.</p>';
      return;
    }
    var opts = '<option value="">Select a new open time\u2026</option>';
    openSlots.forEach(function (s) { opts += '<option value="' + s.id + '">' + esc(slotOptionLabel(s)) + '</option>'; });
    box.innerHTML =
      '<label class="reschedule-label">Move to a different open time (confirms it):</label>' +
      '<select class="reschedule-select">' + opts + '</select>' +
      '<div class="appt-actions"><button type="button" class="btn btn-gold btn-sm ch-save">Save &amp; Confirm</button></div>' +
      '<p class="form-alert" hidden></p>';
    var sel = box.querySelector(".reschedule-select");
    var alertN = box.querySelector(".form-alert");
    box.querySelector(".ch-save").addEventListener("click", function () {
      if (!sel.value) { alertBox(alertN, "Pick a new time.", "error"); return; }
      var b = box.querySelector(".ch-save");
      setBusy(b, "Saving\u2026");
      sb.from("appointments").update({ slot_id: sel.value, status: "confirmed" }).eq("id", id).then(function (res) {
        setBusy(b, false, "Save & Confirm");
        if (res.error) { alertBox(alertN, res.error.message, "error"); return; }
        refreshAll();
      });
    });
  }

  /* ---------- small utils ---------- */
  function normTime(t) { return t.length === 5 ? t + ":00" : t; }  /* HH:MM -> HH:MM:SS */
  function parseISO(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
})();
