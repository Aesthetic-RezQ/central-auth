(function () {
  "use strict";

  document.addEventListener("click", function (event) {
    const navToggle = event.target.closest("[data-bic-toggle-menu], [data-bic-toggle-sidebar]");
    if (navToggle) {
      const nav = document.querySelector(".bic-nav-horizontal, .bic-sidebar");
      if (nav) {
        const open = nav.classList.toggle("is-open");
        document.body.classList.toggle("bic-nav-open", open);
        navToggle.setAttribute("aria-expanded", String(open));
        navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      }
      return;
    }

    const navLink = event.target.closest(".bic-nav-link");
    if (navLink) {
      const nav = document.querySelector(".bic-nav-horizontal, .bic-sidebar");
      if (nav && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        document.body.classList.remove("bic-nav-open");
      }
    }

    const dropdownToggle = event.target.closest(".bic-dropdown-toggle, .bic-identity");
    if (dropdownToggle) {
      const dropdown = dropdownToggle.closest(".bic-dropdown");
      if (dropdown) {
        const isOpen = dropdown.classList.toggle("is-open");
        dropdownToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      }
      document.querySelectorAll(".bic-dropdown.is-open").forEach(function (d) {
        if (d !== dropdownToggle.closest(".bic-dropdown")) {
          d.classList.remove("is-open");
          d.querySelector(".bic-dropdown-toggle, .bic-identity")?.setAttribute("aria-expanded", "false");
        }
      });
      return;
    }

    if (!event.target.closest(".bic-dropdown")) {
      document.querySelectorAll(".bic-dropdown.is-open").forEach(function (d) {
        d.classList.remove("is-open");
        d.querySelector(".bic-dropdown-toggle, .bic-identity")?.setAttribute("aria-expanded", "false");
      });
    }

    const modalOpen = event.target.closest("[data-bic-modal-open]");
    if (modalOpen) {
      const id = modalOpen.getAttribute("data-bic-modal-open");
      const modal = document.getElementById(id);
      if (modal) modal.classList.add("is-open");
    }

    const modalClose = event.target.closest("[data-bic-modal-close]");
    if (modalClose) {
      const backdrop = modalClose.closest(".bic-modal-backdrop");
      if (backdrop) backdrop.classList.remove("is-open");
    }

    if (event.target.classList.contains("bic-modal-backdrop")) {
      event.target.classList.remove("is-open");
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      document.querySelectorAll(".bic-modal-backdrop.is-open")
        .forEach(el => el.classList.remove("is-open"));
      document.querySelectorAll(".bic-dropdown.is-open").forEach(function (d) {
        d.classList.remove("is-open");
        d.querySelector(".bic-dropdown-toggle, .bic-identity")?.setAttribute("aria-expanded", "false");
      });
      document.querySelector(".bic-nav-horizontal, .bic-sidebar")?.classList.remove("is-open");
      document.body.classList.remove("bic-nav-open");
    }
  });
})();
