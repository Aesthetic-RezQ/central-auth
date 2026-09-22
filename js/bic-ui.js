(function () {
  "use strict";

  document.addEventListener("click", function (event) {
    const sidebarToggle = event.target.closest("[data-bic-toggle-sidebar]");
    if (sidebarToggle) {
      const sidebar = document.querySelector(".bic-sidebar");
      if (sidebar) {
        const open = sidebar.classList.toggle("is-open");
        document.body.classList.toggle("bic-sidebar-open", open);
        sidebarToggle.setAttribute("aria-expanded", String(open));
        sidebarToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
        const label = sidebarToggle.querySelector(".bic-sr-only");
        if (label) label.textContent = open ? "Close navigation" : "Open navigation";
        let overlay = document.querySelector(".bic-sidebar-overlay");
        if (open && !overlay) {
          overlay = document.createElement("button");
          overlay.type = "button";
          overlay.className = "bic-sidebar-overlay";
          overlay.setAttribute("aria-label", "Close navigation");
          document.body.appendChild(overlay);
        }
        if (!open && overlay) overlay.remove();
      }
    }

    const sidebarOverlay = event.target.closest(".bic-sidebar-overlay");
    if (sidebarOverlay) {
      const sidebar = document.querySelector(".bic-sidebar");
      sidebar?.classList.remove("is-open");
      document.body.classList.remove("bic-sidebar-open");
      sidebarOverlay.remove();
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
      document.querySelector(".bic-sidebar")?.classList.remove("is-open");
      document.body.classList.remove("bic-sidebar-open");
      document.querySelector(".bic-sidebar-overlay")?.remove();
    }
  });
})();
