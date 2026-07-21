/* ==========================================================================
   Merit Legal Services — Member portal (schedule.html)
   Handles member sign-up / log-in, requesting an appointment from the open
   times the office has published, and viewing / rescheduling / cancelling.
   Talks to Supabase only; if Supabase isn't configured, shows a call-us note.
   ========================================================================== */
(function () {
  "use strict";

  var sb = window.mlsSupabase && window.mlsSupabase();

  var el = {
    loading:      document.getElementById("portal-loading"),
    unconfigured: document.getElementById("portal-unconfigured"),
    authView:     document.getElementById("auth-view"),
    portalView:   document.getElementById("portal-view"),
    email:        document.getElementById("portal-email"),
    logoutBtn:    document.getElementById("logout-btn"),
    loginForm:    document.getElementById("login-form"),
    signupForm:   document.getElementById("signup-form"),
    bookingForm:  document.getElementById("booking-form"),
    slotSelect:   document.getElementById("book-slot"),
    noSlotsHint:  document.getElementById("no-slots-hint"),
    apptList:     document.getElementById("my-appointments"),
    tabs:         document.querySelectorAll(".auth-tab")
  };

  /* Nothing to do on pages without the portal. */
  if (!el.portalView && !el.authView) return;

  if (!sb) {
    hide(el.loading);
    show(el.unconfigured);
    return;
  }

  /* ---------- tiny helpers ---------- */
  function show(node) { if (node) node.hidden = false; }
  function hide(node) { if (node) node.hidden = true; }

  function alertBox(node, msg, kind) {
    if (!node) return;
    node.textContent = msg;
    node.className = "form-alert" + (kind ? " is-" + kind : "");
    node.hidden = !msg;
  }

  function fieldError(groupId, hasError) {
    var g = document.getElementById(groupId);
    if (g) g.classList.toggle("has-error", hasError);
    return hasError;
  }

  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  function fmtDate(dateStr) {
    var p = String(dateStr).split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return DAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  function fmtTime(timeStr) {
    var p = String(timeStr).split(":");
    var h = Number(p[0]), m = p[1] || "00";
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ":" + m + " " + ampm;
  }

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- auth tabs ---------- */
  el.tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var which = tab.getAttribute("data-tab");
      el.tabs.forEach(function (t) {
        var active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      if (which === "login") { show(el.loginForm); hide(el.signupForm); }
      else { hide(el.loginForm); show(el.signupForm); }
    });
  });

  /* ---------- session / view switching ---------- */
  function render(session) {
    hide(el.loading);
    if (session && session.user) {
      hide(el.authView);
      show(el.portalView);
      if (el.email) el.email.textContent = session.user.email || "";
      prefillFromAccount(session.user);
      refreshCalendar();
      loadAppointments();
    } else {
      show(el.authView);
      hide(el.portalView);
    }
  }

  function prefillFromAccount(user) {
    var meta = (user && user.user_metadata) || {};
    var first = document.getElementById("book-first");
    var last = document.getElementById("book-last");
    if (first && !first.value && meta.first_name) first.value = meta.first_name;
    if (last && !last.value && meta.last_name) last.value = meta.last_name;
  }

  sb.auth.getSession().then(function (res) {
    render(res && res.data ? res.data.session : null);
  });
  sb.auth.onAuthStateChange(function (_event, session) { render(session); });

  /* ---------- log in ---------- */
  if (el.loginForm) {
    el.loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = el.loginForm.elements["email"].value.trim();
      var pass = el.loginForm.elements["password"].value;
      var bad = false;
      bad = fieldError("group-login-email", !emailPattern.test(email)) || bad;
      bad = fieldError("group-login-pass", pass === "") || bad;
      if (bad) return;

      var btn = el.loginForm.querySelector("button[type='submit']");
      setBusy(btn, "Logging in\u2026");
      alertBox(document.getElementById("login-alert"), "");
      sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
        setBusy(btn, false, "Log In");
        if (res.error) {
          alertBox(document.getElementById("login-alert"), friendlyAuthError(res.error), "error");
        }
      });
    });
  }

  /* ---------- sign up ---------- */
  if (el.signupForm) {
    el.signupForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = el.signupForm.elements;
      var first = f["first-name"].value.trim();
      var last = f["last-name"].value.trim();
      var email = f["email"].value.trim();
      var pass = f["password"].value;
      var bad = false;
      bad = fieldError("group-signup-first", first === "") || bad;
      bad = fieldError("group-signup-last", last === "") || bad;
      bad = fieldError("group-signup-email", !emailPattern.test(email)) || bad;
      bad = fieldError("group-signup-pass", pass.length < 8) || bad;
      if (bad) return;

      var btn = el.signupForm.querySelector("button[type='submit']");
      setBusy(btn, "Creating\u2026");
      alertBox(document.getElementById("signup-alert"), "");
      sb.auth.signUp({
        email: email,
        password: pass,
        options: { data: { first_name: first, last_name: last } }
      }).then(function (res) {
        setBusy(btn, false, "Create Account");
        if (res.error) {
          alertBox(document.getElementById("signup-alert"), friendlyAuthError(res.error), "error");
          return;
        }
        /* If email confirmation is ON, there's a user but no session yet. */
        if (res.data && res.data.session) {
          /* logged straight in — onAuthStateChange will render the portal */
        } else {
          alertBox(document.getElementById("signup-alert"),
            "Account created! Please check your email to confirm your address, then log in.", "success");
        }
      });
    });
  }

  /* ---------- forgot password ---------- */
  var forgot = document.getElementById("forgot-link");
  if (forgot) {
    forgot.addEventListener("click", function () {
      var email = (el.loginForm.elements["email"].value || "").trim();
      if (!emailPattern.test(email)) {
        alertBox(document.getElementById("login-alert"),
          "Enter your email above first, then tap \u201CForgot password?\u201D again.", "error");
        return;
      }
      sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href }).then(function () {
        alertBox(document.getElementById("login-alert"),
          "If that email has an account, a reset link is on its way.", "success");
      });
    });
  }

  /* ---------- log out ---------- */
  if (el.logoutBtn) {
    el.logoutBtn.addEventListener("click", function () {
      sb.auth.signOut();
    });
  }

  /* ---------- availability: calendar + date-filtered time picker ----------
     The member optionally picks WHO to meet with, then a DATE on a month
     calendar (only days with open times are selectable); the time dropdown
     then shows just that day's times. This keeps the picker usable even when
     the office publishes months of recurring slots. */
  var calEl        = document.getElementById("slot-calendar");
  var timeLabelEl  = document.getElementById("cal-time-label");
  var withEl       = document.getElementById("book-with");
  var allSlotRows  = [];   // raw open slots from the server (unfiltered)
  var withFilter   = "";   // "" = anyone, otherwise a staff name
  var slotsByDate  = {};   // "YYYY-MM-DD" -> [slot, ...]  (after the with-filter)
  var availDates   = [];   // sorted list of dates that have open times
  var selectedDate = null;
  var cursor       = null; // { y, m } month currently shown

  function slotTimeLabel(s) {
    return fmtTime(s.slot_time) + (s.staff_name ? "  \u00b7  with " + s.staff_name : "");
  }

  function fetchSlots() {
    return sb.rpc("available_slots").then(function (res) { return (res && res.data) || []; });
  }

  /* Populate a plain <select> with every upcoming slot (used by reschedule). */
  function fillSelect(selectEl, rows) {
    selectEl.innerHTML = "";
    var first = document.createElement("option");
    first.value = "";
    first.textContent = rows.length ? "Select a time\u2026" : "No open times available";
    selectEl.appendChild(first);
    rows.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = fmtDate(s.slot_date) + " \u2014 " + slotTimeLabel(s);
      selectEl.appendChild(o);
    });
  }

  /* Rebuild the "Meet with" dropdown from the distinct people in the open
     slots, keeping the current choice if it's still offered. */
  function rebuildWithOptions(rows) {
    if (!withEl) return;
    var names = [];
    rows.forEach(function (s) {
      if (s.staff_name && names.indexOf(s.staff_name) === -1) names.push(s.staff_name);
    });
    names.sort();
    if (withFilter && names.indexOf(withFilter) === -1) withFilter = ""; // person no longer available
    withEl.innerHTML = '<option value="">Anyone</option>';
    names.forEach(function (n) {
      var o = document.createElement("option");
      o.value = n; o.textContent = n;
      if (n === withFilter) o.selected = true;
      withEl.appendChild(o);
    });
    // Hide the control entirely if nobody is named on any slot.
    var group = document.getElementById("group-book-with");
    if (group) group.hidden = names.length === 0;
  }

  /* Fetch fresh availability, then rebuild the people list and the calendar. */
  function refreshCalendar() {
    if (!calEl) return fetchSlots(); // page without a calendar: nothing to draw
    return fetchSlots().then(function (rows) {
      allSlotRows = rows;
      rebuildWithOptions(rows);
      applyFilter();
      return rows;
    });
  }

  /* Rebuild slotsByDate / calendar from the cached rows, honoring withFilter. */
  function applyFilter() {
    slotsByDate = {};
    allSlotRows.forEach(function (s) {
      if (withFilter && (s.staff_name || "") !== withFilter) return;
      (slotsByDate[s.slot_date] = slotsByDate[s.slot_date] || []).push(s);
    });
    availDates = Object.keys(slotsByDate).sort();

    if (el.noSlotsHint) el.noSlotsHint.hidden = availDates.length > 0;

    // keep the current selection if it still has times, else pick the first
    if (!selectedDate || !slotsByDate[selectedDate]) {
      selectedDate = availDates.length ? availDates[0] : null;
    }
    var basis = selectedDate || availDates[0] || todayISOparts();
    var p = String(basis).split("-");
    cursor = { y: +p[0], m: +p[1] - 1 };

    drawCalendar();
    populateTimes(selectedDate);
  }

  if (withEl) {
    withEl.addEventListener("change", function () {
      withFilter = withEl.value;
      applyFilter();
    });
  }

  function todayISOparts() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function mk(y, m) { return y * 12 + m; }

  function drawCalendar() {
    if (!calEl) return;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var curMK = mk(today.getFullYear(), today.getMonth());
    var lastMK = availDates.length
      ? (function () { var p = availDates[availDates.length - 1].split("-"); return mk(+p[0], +p[1] - 1); })()
      : curMK;
    var shownMK = mk(cursor.y, cursor.m);

    var monthName = ["January","February","March","April","May","June","July","August","September","October","November","December"][cursor.m];
    var canPrev = shownMK > curMK;
    var canNext = shownMK < lastMK;

    var html =
      '<div class="cal-head">' +
        '<button type="button" class="cal-nav" data-dir="-1" aria-label="Previous month"' + (canPrev ? "" : " disabled") + '>\u2039</button>' +
        '<span class="cal-title">' + monthName + " " + cursor.y + '</span>' +
        '<button type="button" class="cal-nav" data-dir="1" aria-label="Next month"' + (canNext ? "" : " disabled") + '>\u203a</button>' +
      '</div>' +
      '<div class="cal-grid">' +
        '<span class="cal-dow">Su</span><span class="cal-dow">Mo</span><span class="cal-dow">Tu</span>' +
        '<span class="cal-dow">We</span><span class="cal-dow">Th</span><span class="cal-dow">Fr</span><span class="cal-dow">Sa</span>';

    var firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();
    var daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    for (var i = 0; i < firstWeekday; i++) html += '<span class="cal-cell cal-blank"></span>';
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = cursor.y + "-" + String(cursor.m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      var has = !!slotsByDate[ds];
      if (has) {
        var sel = ds === selectedDate ? " is-selected" : "";
        html += '<button type="button" class="cal-cell cal-day is-available' + sel + '" data-date="' + ds + '">' + d + '</button>';
      } else {
        html += '<span class="cal-cell cal-day is-off">' + d + '</span>';
      }
    }
    html += '</div>';
    calEl.innerHTML = html;

    calEl.querySelectorAll(".cal-nav").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.disabled) return;
        var dir = +b.getAttribute("data-dir");
        var nm = cursor.m + dir, ny = cursor.y;
        if (nm < 0) { nm = 11; ny--; } else if (nm > 11) { nm = 0; ny++; }
        cursor = { y: ny, m: nm };
        drawCalendar();
      });
    });
    calEl.querySelectorAll(".cal-day.is-available").forEach(function (b) {
      b.addEventListener("click", function () {
        selectedDate = b.getAttribute("data-date");
        drawCalendar();
        populateTimes(selectedDate);
        var g = document.getElementById("group-book-slot");
        if (g) g.classList.remove("has-error");
      });
    });
  }

  /* Fill the time dropdown with just the selected date's slots. */
  function populateTimes(date) {
    if (!el.slotSelect) return;
    var rows = (date && slotsByDate[date]) || [];
    el.slotSelect.innerHTML = "";
    var first = document.createElement("option");
    first.value = "";
    first.textContent = rows.length ? "Select a time\u2026" : "Pick a highlighted date above";
    el.slotSelect.appendChild(first);
    rows.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = slotTimeLabel(s);
      el.slotSelect.appendChild(o);
    });
    if (timeLabelEl) {
      if (date) { timeLabelEl.hidden = false; timeLabelEl.textContent = "Times on " + fmtDate(date); }
      else { timeLabelEl.hidden = true; }
    }
  }

  /* ---------- request an appointment ---------- */
  if (el.bookingForm) {
    el.bookingForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = el.bookingForm.elements;
      var bad = false;
      bad = fieldError("group-book-first", f["first-name"].value.trim() === "") || bad;
      bad = fieldError("group-book-last", f["last-name"].value.trim() === "") || bad;
      bad = fieldError("group-book-phone", f["phone"].value.trim() === "") || bad;
      bad = fieldError("group-book-service", f["service"].value === "") || bad;
      bad = fieldError("group-book-slot", f["slot"].value === "") || bad;
      if (bad) return;

      var btn = el.bookingForm.querySelector("button[type='submit']");
      setBusy(btn, "Sending\u2026");
      alertBox(document.getElementById("booking-alert"), "");
      sb.rpc("book_slot", {
        p_slot_id: f["slot"].value,
        p_first: f["first-name"].value.trim(),
        p_last: f["last-name"].value.trim(),
        p_phone: f["phone"].value.trim(),
        p_service: f["service"].value,
        p_language: f["language"].value,
        p_notes: f["notes"].value.trim()
      }).then(function (res) {
        setBusy(btn, false, "Request Appointment");
        if (res.error) {
          alertBox(document.getElementById("booking-alert"), res.error.message, "error");
          refreshCalendar(); // refresh in case the slot was just taken
          return;
        }
        el.bookingForm.reset();
        selectedDate = null;
        refreshCalendar();
        loadAppointments();
        if (window.MLS_openModal) window.MLS_openModal("success-modal");
      });
    });

    el.bookingForm.querySelectorAll("input, select, textarea").forEach(function (field) {
      field.addEventListener("input", function () {
        var g = field.closest(".form-group");
        if (g) g.classList.remove("has-error");
      });
    });
  }

  /* ---------- my appointments ---------- */
  var STATUS = {
    pending:   { label: "Pending",   cls: "pending"   },
    confirmed: { label: "Confirmed", cls: "confirmed" },
    rejected:  { label: "Declined",  cls: "rejected"  },
    cancelled: { label: "Cancelled", cls: "cancelled" }
  };

  function loadAppointments() {
    if (!el.apptList) return;
    sb.from("appointments")
      .select("id, slot_date, slot_time, staff_name, service, status, notes, created_at")
      .order("slot_date", { ascending: true })
      .order("slot_time", { ascending: true })
      .then(function (res) {
        if (res.error) {
          el.apptList.innerHTML = '<p class="portal-status">Could not load your appointments. Please refresh.</p>';
          return;
        }
        renderAppointments(res.data || []);
      });
  }

  function renderAppointments(rows) {
    if (!rows.length) {
      el.apptList.innerHTML = '<p class="portal-status">You have no appointments yet. Request one above.</p>';
      return;
    }
    /* active first (pending, confirmed), then closed (rejected, cancelled) */
    var order = { pending: 0, confirmed: 1, rejected: 2, cancelled: 3 };
    rows.sort(function (a, b) {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return (a.slot_date + a.slot_time).localeCompare(b.slot_date + b.slot_time);
    });

    el.apptList.innerHTML = "";
    rows.forEach(function (a) {
      var meta = STATUS[a.status] || STATUS.pending;
      var card = document.createElement("article");
      card.className = "appt-card";

      var canManage = a.status === "pending" || a.status === "confirmed";
      card.innerHTML =
        '<div class="appt-head">' +
          '<span class="appt-when">' + esc(fmtDate(a.slot_date)) + " &middot; " + esc(fmtTime(a.slot_time)) + '</span>' +
          '<span class="badge badge-' + meta.cls + '">' + meta.label + '</span>' +
        '</div>' +
        '<p class="appt-service">' + esc(a.service) +
          (a.staff_name ? ' <span class="appt-with">&middot; with ' + esc(a.staff_name) + '</span>' : '') + '</p>' +
        (a.status === "pending"   ? '<p class="appt-note">Waiting for the office to confirm.</p>' : "") +
        (a.status === "confirmed" ? '<p class="appt-note">Confirmed by our office. We look forward to seeing you.</p>' : "") +
        (a.status === "rejected"  ? '<p class="appt-note">This time didn\u2019t work out. Please request another.</p>' : "") +
        '<div class="appt-actions"></div>' +
        '<div class="reschedule-box" hidden></div>';

      var actions = card.querySelector(".appt-actions");
      if (canManage) {
        var rBtn = document.createElement("button");
        rBtn.type = "button";
        rBtn.className = "btn btn-navy btn-sm";
        rBtn.textContent = "Reschedule";
        rBtn.addEventListener("click", function () { openReschedule(card, a.id); });

        var cBtn = document.createElement("button");
        cBtn.type = "button";
        cBtn.className = "btn btn-ghost btn-sm";
        cBtn.textContent = "Cancel";
        cBtn.addEventListener("click", function () { cancelAppt(a.id, cBtn); });

        actions.appendChild(rBtn);
        actions.appendChild(cBtn);
      }
      el.apptList.appendChild(card);
    });
  }

  function cancelAppt(id, btn) {
    if (!window.confirm("Cancel this appointment? This frees the time for others.")) return;
    setBusy(btn, "Cancelling\u2026");
    sb.rpc("cancel_my_appointment", { p_id: id }).then(function (res) {
      if (res.error) { setBusy(btn, false, "Cancel"); window.alert(res.error.message); return; }
      refreshCalendar();
      loadAppointments();
    });
  }

  function openReschedule(card, id) {
    var box = card.querySelector(".reschedule-box");
    if (!box.hidden) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML =
      '<label class="reschedule-label">Pick a new time</label>' +
      '<select class="reschedule-select"><option value="">Loading\u2026</option></select>' +
      '<div class="appt-actions"><button type="button" class="btn btn-gold btn-sm rs-confirm">Confirm New Time</button></div>' +
      '<p class="form-alert" hidden></p>';
    var sel = box.querySelector(".reschedule-select");
    var alertN = box.querySelector(".form-alert");
    fetchSlots().then(function (rows) { fillSelect(sel, rows); });
    box.querySelector(".rs-confirm").addEventListener("click", function () {
      var newSlot = sel.value;
      if (!newSlot) { alertBox(alertN, "Please choose a new time.", "error"); return; }
      var confirmBtn = box.querySelector(".rs-confirm");
      setBusy(confirmBtn, "Saving\u2026");
      sb.rpc("reschedule_my_appointment", { p_id: id, p_new_slot_id: newSlot }).then(function (res) {
        setBusy(confirmBtn, false, "Confirm New Time");
        if (res.error) { alertBox(alertN, res.error.message, "error"); fetchSlots().then(function (rows) { fillSelect(sel, rows); }); return; }
        refreshCalendar();
        loadAppointments();
      });
    });
  }

  /* ---------- shared button busy-state ---------- */
  function setBusy(btn, busyLabel, restoreLabel) {
    if (!btn) return;
    if (busyLabel) {
      btn.dataset.label = btn.textContent;
      btn.disabled = true;
      btn.textContent = busyLabel;
    } else {
      btn.disabled = false;
      btn.textContent = restoreLabel || btn.dataset.label || btn.textContent;
    }
  }

  function friendlyAuthError(error) {
    var m = (error && error.message) || "Something went wrong.";
    if (/invalid login credentials/i.test(m)) return "Email or password is incorrect.";
    if (/email not confirmed/i.test(m)) return "Please confirm your email first — check your inbox for the link.";
    if (/already registered/i.test(m)) return "An account with that email already exists. Try logging in.";
    return m;
  }
})();
