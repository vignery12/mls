/* ==========================================================================
   Merit Legal Services — Site Scripts
   Mobile nav, sticky header, scroll reveal, pop-up modals,
   contact & scheduling form validation, back-to-top, footer year.
   ========================================================================== */
(function () {
  "use strict";

  var OFFICE_EMAIL = "meritlegalservices@yahoo.com";

  /* ---------- Mobile navigation ---------- */
  var navToggle = document.querySelector(".nav-toggle");
  var mainNav = document.querySelector(".main-nav");
  var navScrim = document.querySelector(".nav-scrim");

  function closeNav() {
    if (!mainNav) return;
    mainNav.classList.remove("is-open");
    document.body.classList.remove("nav-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  }

  if (navToggle && mainNav) {
    navToggle.addEventListener("click", function () {
      var open = mainNav.classList.toggle("is-open");
      document.body.classList.toggle("nav-open", open);
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    if (navScrim) navScrim.addEventListener("click", closeNav);
    mainNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeNav);
    });
  }

  /* ---------- Sticky header shadow ---------- */
  var header = document.querySelector(".site-header");
  function onScrollHeader() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();

  /* ---------- Scroll reveal (respects reduced motion) ---------- */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealEls.forEach(function (el) { el.classList.add("is-visible"); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      revealEls.forEach(function (el) { io.observe(el); });
    }
  }

  /* ---------- Modal helpers ---------- */
  var lastFocused = null;

  function openModal(id) {
    var overlay = document.getElementById(id);
    if (!overlay) return;
    lastFocused = document.activeElement;
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    var focusable = overlay.querySelector(".modal-close, button, a, input, textarea");
    if (focusable) focusable.focus();
    document.body.style.overflow = "hidden";
  }

  function closeModal(overlay) {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocused) lastFocused.focus();
  }

  document.querySelectorAll("[data-open-modal]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      openModal(btn.getAttribute("data-open-modal"));
    });
  });

  document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal(overlay);
    });
    overlay.querySelectorAll("[data-close-modal]").forEach(function (btn) {
      btn.addEventListener("click", function () { closeModal(overlay); });
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.is-open").forEach(closeModal);
    }
  });

  /* ---------- Welcome pop-up (once per browser session) ---------- */
  var welcomeModal = document.getElementById("welcome-modal");
  if (welcomeModal) {
    var alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem("mls-welcome-shown") === "1";
    } catch (err) { /* storage unavailable — show once per page load */ }

    if (!alreadyShown) {
      window.setTimeout(function () {
        openModal("welcome-modal");
        try { sessionStorage.setItem("mls-welcome-shown", "1"); } catch (err) { /* noop */ }
      }, 3500);
    }
  }

  /* ---------- Shared form helpers ---------- */
  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setError(groupId, hasError) {
    var group = document.getElementById(groupId);
    if (group) group.classList.toggle("has-error", hasError);
    return hasError;
  }

  function clearErrorsOnInput(form) {
    form.querySelectorAll("input, select, textarea").forEach(function (field) {
      field.addEventListener("input", function () {
        var group = field.closest(".form-group");
        if (group) group.classList.remove("has-error");
      });
    });
  }

  /* ---------- Contact form ---------- */
  var contactForm = document.getElementById("contact-form");
  if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();

      var first = contactForm.elements["first-name"];
      var last = contactForm.elements["last-name"];
      var email = contactForm.elements["email"];
      var comment = contactForm.elements["comment"];

      var invalid = false;
      invalid = setError("group-first", first.value.trim() === "") || invalid;
      invalid = setError("group-last", last.value.trim() === "") || invalid;
      invalid = setError("group-email", !emailPattern.test(email.value.trim())) || invalid;
      invalid = setError("group-comment", comment.value.trim() === "") || invalid;

      if (invalid) {
        var firstError = contactForm.querySelector(".has-error input, .has-error textarea");
        if (firstError) firstError.focus();
        return;
      }

      /* No server backend is wired up yet, so the form opens the visitor's
         email app addressed to the office with the message pre-filled.
         To send silently instead, swap this block for a fetch() call to a
         form service (e.g. Formspree) or your own endpoint. */
      var subject = encodeURIComponent("Website Inquiry from " + first.value.trim() + " " + last.value.trim());
      var body = encodeURIComponent(
        "Name: " + first.value.trim() + " " + last.value.trim() + "\n" +
        "Email: " + email.value.trim() + "\n\n" +
        comment.value.trim()
      );
      window.location.href = "mailto:" + OFFICE_EMAIL + "?subject=" + subject + "&body=" + body;

      contactForm.reset();
      openModal("success-modal");
    });

    clearErrorsOnInput(contactForm);
  }

  /* ---------- Scheduling form (schedule.html) ---------- */
  var scheduleForm = document.getElementById("schedule-form");
  if (scheduleForm) {
    /* Don't allow past dates */
    var dateInput = document.getElementById("sched-date");
    if (dateInput) {
      var today = new Date();
      var iso = today.getFullYear() + "-" +
        String(today.getMonth() + 1).padStart(2, "0") + "-" +
        String(today.getDate()).padStart(2, "0");
      dateInput.setAttribute("min", iso);
    }

    scheduleForm.addEventListener("submit", function (e) {
      e.preventDefault();

      var f = scheduleForm.elements;
      var invalid = false;
      invalid = setError("group-sched-first", f["first-name"].value.trim() === "") || invalid;
      invalid = setError("group-sched-last", f["last-name"].value.trim() === "") || invalid;
      invalid = setError("group-sched-email", !emailPattern.test(f["email"].value.trim())) || invalid;
      invalid = setError("group-sched-phone", f["phone"].value.trim() === "") || invalid;
      invalid = setError("group-sched-service", f["service"].value === "") || invalid;
      invalid = setError("group-sched-date", f["date"].value === "") || invalid;
      invalid = setError("group-sched-time", f["time"].value === "") || invalid;

      if (invalid) {
        var firstError = scheduleForm.querySelector(".has-error input, .has-error select, .has-error textarea");
        if (firstError) firstError.focus();
        return;
      }

      /* Phase 1: the request is emailed to the office for confirmation.
         Phase 2: replace this with a booking backend or a Google Calendar /
         Calendly embed — see the notes in schedule.html and admin.html. */
      var subject = encodeURIComponent(
        "Appointment Request — " + f["service"].value + " — " + f["date"].value + " " + f["time"].value
      );
      var body = encodeURIComponent(
        "APPOINTMENT REQUEST\n" +
        "--------------------------------\n" +
        "Name: " + f["first-name"].value.trim() + " " + f["last-name"].value.trim() + "\n" +
        "Email: " + f["email"].value.trim() + "\n" +
        "Phone: " + f["phone"].value.trim() + "\n" +
        "Service: " + f["service"].value + "\n" +
        "Preferred Date: " + f["date"].value + "\n" +
        "Preferred Time: " + f["time"].value + "\n" +
        "Language: " + f["language"].value + "\n\n" +
        "Notes:\n" + f["notes"].value.trim()
      );
      window.location.href = "mailto:" + OFFICE_EMAIL + "?subject=" + subject + "&body=" + body;

      scheduleForm.reset();
      openModal("success-modal");
    });

    clearErrorsOnInput(scheduleForm);
  }

  /* ---------- Back to top ---------- */
  var backToTop = document.querySelector(".back-to-top");
  if (backToTop) {
    var toggleBackToTop = function () {
      backToTop.classList.toggle("is-visible", window.scrollY > 500);
    };
    window.addEventListener("scroll", toggleBackToTop, { passive: true });
    toggleBackToTop();
    backToTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-current-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
