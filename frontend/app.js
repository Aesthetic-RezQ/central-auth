const state = { accessToken: localStorage.getItem("cas_access"), refreshToken: localStorage.getItem("cas_refresh"), user: null };
const $ = (id) => document.getElementById(id);

const api = async (path, options = {}) => {
  const headers = {"Content-Type": "application/json", ...(options.headers || {})};
  if (state.accessToken) headers.Authorization = "Bearer " + state.accessToken;
  const response = await fetch("/api" + path, {...options, headers});
  if (response.status === 401 && state.refreshToken && !path.includes("/auth/")) {
    const refreshed = await fetch("/api/v1/auth/refresh", {method:"POST", headers:{"Content-Type":"application/json","X-Application-Code":"CENTRAL_AUTH"}, body:JSON.stringify({refresh_token:state.refreshToken})});
    if (refreshed.ok) { saveTokens(await refreshed.json()); return api(path, options); }
    signOut();
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "Request failed");
  return body;
};

const saveTokens = (tokens) => {
  state.accessToken = tokens.access_token;
  state.refreshToken = tokens.refresh_token;
  localStorage.setItem("cas_access", state.accessToken);
  localStorage.setItem("cas_refresh", state.refreshToken);
};
const signOut = () => { localStorage.removeItem("cas_access"); localStorage.removeItem("cas_refresh"); location.reload(); };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => {
  if (character === "&") return "&amp;";
  if (character === "<") return "&lt;";
  if (character === ">") return "&gt;";
  if (character === '"') return "&quot;";
  return "&#039;";
});
const showToast = (message, error = false) => {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("bic-hidden", "bic-alert-success", "bic-alert-danger");
  toast.classList.add(error ? "bic-alert-danger" : "bic-alert-success");
  setTimeout(() => { toast.textContent = ""; toast.classList.add("bic-hidden"); }, 3500);
};
const getInitials = (name) => (String(name || "").trim().charAt(0) || "U").toUpperCase();

const statusBadge = (status) => {
  const type = status === "active" ? "success" : status === "disabled" ? "danger" : "warning";
  return "<span class='bic-badge bic-badge-" + type + "'>" + esc(status) + "</span>";
};
const icon = (name) => {
  const paths = {
    eye: "<path d='M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z'/><circle cx='12' cy='12' r='2.5'/>",
    edit: "<path d='m4 16-.8 4.8L8 20l11.2-11.2-4-4L4 16Z'/><path d='m13.8 6.2 4 4'/>",
    trash: "<path d='M4 7h16'/><path d='M10 11v5M14 11v5'/><path d='m6 7 1 13h10l1-13M9 7V4h6v3'/>",
    plus: "<path d='M12 5v14M5 12h14'/>",
    refresh: "<path d='M20 11a8 8 0 0 0-14.7-3L3 11'/><path d='M3 5v6h6'/><path d='M4 13a8 8 0 0 0 14.7 3L21 13'/><path d='M21 19v-6h-6'/>",
  };
  return "<svg class='bic-icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + (paths[name] || "") + "</svg>";
};

function tableSortValue(row, columnIndex, type) {
  const cell = row.cells[columnIndex];
  if (!cell) return "";
  const value = cell.dataset.sortValue ?? cell.textContent.trim();
  if (type === "number") return Number(value.replace(/[^0-9.-]/g, "")) || 0;
  if (type === "date") return Date.parse(value) || 0;
  return value.toLowerCase();
}

function makeTableSortable(table) {
  if (table.dataset.sortableReady === "true") return;
  table.dataset.sortableReady = "true";
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);
  headers.forEach((header, columnIndex) => {
    if (header.dataset.sortable === "false") return;
    const label = header.textContent.trim();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bic-table-sort";
    button.setAttribute("aria-label", "Sort by " + label);
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const indicator = document.createElement("span");
    indicator.className = "bic-sort-indicator";
    indicator.setAttribute("aria-hidden", "true");
    indicator.textContent = "↕";
    button.append(labelNode, indicator);
    header.textContent = "";
    header.appendChild(button);
    button.addEventListener("click", () => {
      const tbody = table.tBodies[0];
      const rows = Array.from(tbody?.rows || []).filter((row) => !row.querySelector(".bic-empty"));
      if (rows.length < 2) return;
      const nextDirection = button.dataset.direction === "asc" ? "desc" : "asc";
      const type = header.dataset.sortType || "text";
      rows.sort((left, right) => {
        const leftValue = tableSortValue(left, columnIndex, type);
        const rightValue = tableSortValue(right, columnIndex, type);
        if (leftValue === rightValue) return 0;
        const result = leftValue > rightValue ? 1 : -1;
        return nextDirection === "asc" ? result : -result;
      });
      rows.forEach((row) => tbody.appendChild(row));
      headers.forEach((candidate) => {
        candidate.removeAttribute("aria-sort");
        candidate.querySelector(".bic-sort-indicator")?.replaceChildren(document.createTextNode("↕"));
        candidate.querySelector(".bic-table-sort")?.removeAttribute("data-direction");
      });
      button.dataset.direction = nextDirection;
      header.setAttribute("aria-sort", nextDirection === "asc" ? "ascending" : "descending");
      indicator.textContent = nextDirection === "asc" ? "↑" : "↓";
    });
  });
}

function enableTableSorting(root = document) {
  root.querySelectorAll("table.bic-sortable").forEach(makeTableSortable);
}

async function loadPortal() {
  try {
    state.user = await api("/v1/auth/me");
    $("login-view").classList.add("bic-hidden");
    $("portal-view").classList.remove("bic-hidden");
    const initial = getInitials(state.user.full_name || state.user.username);
    const roleTitle = state.user.is_superadmin ? "Administrator" : (state.user.roles?.[0]?.name || "Administrator");
    $("identity").innerHTML =
      "<div class='bic-user-chip'>" +
        "<div class='bic-user-avatar'>" + esc(initial) + "</div>" +
        "<div class='bic-user-info'>" +
          "<strong class='bic-user-name'>" + esc(state.user.full_name) + "</strong>" +
          "<div class='bic-user-role-row'>" +
            "<span class='bic-user-role'>" + esc(roleTitle) + "</span>" +
            "<svg class='bic-user-chevron' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>" +
          "</div>" +
        "</div>" +
      "</div>";
    await showSection("overview");
  } catch (error) { signOut(); }
}

async function showSection(name) {
  document.querySelectorAll(".portal-section").forEach((section) => section.classList.add("bic-hidden"));
  document.querySelectorAll(".bic-nav-link").forEach((link) => link.classList.toggle("is-active", link.dataset.section === name));
  $("section-" + name).classList.remove("bic-hidden");
  $("page-title").textContent = name === "rbac" ? "Roles & permissions" : name[0].toUpperCase() + name.slice(1);
  if (name === "overview") await renderOverview();
  if (name === "users") await renderUsers();
  if (name === "divisions") await renderDivisions();
  if (name === "applications") await renderApplications();
  if (name === "rbac") await renderRBAC();
  if (name === "audit") await renderAudit();
}

async function renderOverview() {
  const results = await Promise.all([api("/v1/admin/dashboard"), api("/v1/admin/application-status")]);
  const data = results[0];
  const applicationStatus = results[1];
  const metrics = [
    ["Total users", data.total_users, "total", "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M22 21v-2a4 4 0 0 0-3-3.87'/><path d='M16 3.13a4 4 0 0 1 0 7.75'/></svg>"],
    ["Active users", data.active_users, "active", "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><polyline points='16 11 18 13 22 9'/></svg>"],
    ["Disabled users", data.disabled_users, "disabled", "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><line x1='17' x2='22' y1='8' y2='13'/><line x1='22' x2='17' y1='8' y2='13'/></svg>"],
    ["Applications", data.registered_applications, "applications", "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7'/><path d='M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'/><line x1='2' x2='22' y1='7' y2='7'/></svg>"]
  ];
  $("section-overview").innerHTML =
    "<div class='bic-kpi-grid'>" + metrics.map((item) =>
      "<div class='bic-card bic-stat'>" +
        "<div class='bic-stat-content'>" +
          "<span class='bic-stat-label'>" + item[0] + "</span>" +
          "<strong class='bic-stat-value'>" + item[1] + "</strong>" +
        "</div>" +
        "<div class='bic-stat-icon-wrap bic-stat-icon-" + item[2] + "'>" + item[3] + "</div>" +
      "</div>"
    ).join("") + "</div>" +
    "<div class='bic-card bic-panel'><div class='bic-toolbar'><h3 class='bic-section-title'>Recent authentication</h3><span class='bic-muted'>Latest 10</span></div>" + activityTable(data.recent_authentication_activity) + "</div>" +
    "<div class='bic-card bic-panel bic-section-spaced'><div class='bic-toolbar'><div><h3 class='bic-section-title'>Application connectivity</h3><span class='bic-muted'>Live health checks from Central Auth</span></div><button id='refresh-connection-status' class='bic-btn bic-btn-secondary bic-btn-sm'>Refresh</button></div>" + connectionStatusCards(applicationStatus) + "</div>";
  enableTableSorting($("section-overview"));
  $("refresh-connection-status").onclick = () => renderOverview();
}

function connectionStatusCards(payload) {
  const statusText = {connected:"Connected", unavailable:"Unavailable", not_configured:"Not configured", not_registered:"Not registered"};
  const statusClass = {connected:"success", unavailable:"danger", not_configured:"warning", not_registered:"info"};
  return "<div class='bic-connection-grid'>" + payload.applications.map((app) => {
    const state = app.status || "not_configured";
    const checked = app.checked_at ? new Date(app.checked_at).toLocaleTimeString() : "—";
    const latency = app.latency_ms !== undefined ? " · " + app.latency_ms + " ms" : "";
    return "<div class='bic-connection-card'><div class='bic-toolbar'><strong>" + esc(app.name) + "</strong><span class='bic-badge bic-badge-" + (statusClass[state] || "info") + "'>" + (statusText[state] || state) + "</span></div><div class='bic-status-line'><span class='bic-status-dot bic-status-dot-" + (statusClass[state] || "info") + "'></span><span>" + esc(app.message || "") + "</span></div><div class='bic-connection-meta'>Checked " + checked + latency + "</div></div>";
  }).join("") + "</div>";
}
function activityTable(rows) {
  if (!rows.length) return "<p class='bic-empty'>No authentication activity yet.</p>";
  return "<div class='bic-table-wrap'><table class='bic-table bic-sortable'><thead><tr><th>Event</th><th>Application</th><th data-sort-type='date'>Time</th></tr></thead><tbody>" +
    rows.map((row) => "<tr><td><span class='bic-badge " + (row.event === "LOGIN_SUCCESS" ? "bic-badge-success" : "bic-badge-danger") + "'>" + esc(row.event) + "</span></td><td>" + esc(row.application || "—") + "</td><td data-sort-value='" + esc(row.timestamp) + "'>" + new Date(row.timestamp).toLocaleString() + "</td></tr>").join("") +
    "</tbody></table></div>";
}

const USER_CSV_FIELDS = ["username", "email", "full_name", "division", "status", "is_superadmin", "applications", "roles", "password"];

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function csvRow(values) { return values.map(csvEscape).join(","); }

function downloadUsersCsv(users) {
  const rows = [csvRow(USER_CSV_FIELDS)];
  users.forEach((user) => {
    const applications = user.is_superadmin
      ? "ALL"
      : user.applications.map((application) => application.code).join(";");
    const roles = user.roles.map((role) => role.application_code + ":" + role.name).join(";");
    rows.push(csvRow([
      user.username,
      user.email,
      user.full_name,
      user.division?.code || "",
      user.status,
      user.is_superadmin ? "true" : "false",
      applications,
      roles,
      ""
    ]));
  });
  const blob = new Blob(["\uFEFF" + rows.join("\r\n") + "\r\n"], {type: "text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "central-auth-users.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Users exported to CSV");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field === "") quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((candidate) => candidate.some((value) => value.trim() !== ""));
}

function parseCsvBoolean(value) {
  return ["true", "1", "yes", "y"].includes(String(value || "").trim().toLowerCase());
}

function csvList(value) {
  return String(value || "").split(";").map((item) => item.trim()).filter(Boolean);
}

async function syncImportedUser(user, row, applications, roles, divisions, isNew) {
  const status = String(row.status || "active").trim().toLowerCase();
  if (!["active", "disabled", "locked"].includes(status)) throw new Error("status must be active, disabled, or locked");
  const isSuperadmin = parseCsvBoolean(row.is_superadmin);
  const applicationValues = csvList(row.applications);
  const requestedAppCodes = isSuperadmin && applicationValues.some((value) => value.toUpperCase() === "ALL")
    ? new Set(applications.map((application) => application.code))
    : new Set(applicationValues.map((value) => value.toUpperCase()));
  const knownAppCodes = new Set(applications.map((application) => application.code.toUpperCase()));
  const unknownApplications = Array.from(requestedAppCodes).filter((code) => !knownAppCodes.has(code.toUpperCase()));
  if (unknownApplications.length) throw new Error("unknown application(s): " + unknownApplications.join(", "));

  const requestedRoles = new Map();
  csvList(row.roles).forEach((value) => {
    const separator = value.indexOf(":");
    if (separator < 1 || separator === value.length - 1) throw new Error("roles must use APPLICATION_CODE:ROLE_NAME");
    const applicationCode = value.slice(0, separator).trim().toUpperCase();
    const roleName = value.slice(separator + 1).trim();
    const role = roles.find((candidate) => candidate.application_code.toUpperCase() === applicationCode && candidate.name.toLowerCase() === roleName.toLowerCase());
    if (!role) throw new Error("unknown role: " + value);
    requestedRoles.set(String(role.id), role);
    requestedAppCodes.add(role.application_code.toUpperCase());
  });
  const divisionValue = String(row.division || "").trim().toLowerCase();
  const division = divisionValue ? divisions.find((candidate) => candidate.code.toLowerCase() === divisionValue || candidate.name.toLowerCase() === divisionValue) : null;
  if (divisionValue && !division) throw new Error("unknown division: " + row.division);

  if (isNew) {
    const password = String(row.password || "");
    if (password.length < 12) throw new Error("new users require a password of at least 12 characters");
    user = await api("/v1/admin/users", {method:"POST", body:JSON.stringify({username:row.username.trim(), email:row.email.trim(), full_name:row.full_name.trim(), password, is_superadmin:isSuperadmin, division_id:division?.id || null})});
  } else {
    user = await api("/v1/admin/users/" + user.id, {method:"PUT", body:JSON.stringify({email:row.email.trim(), full_name:row.full_name.trim(), status, is_superadmin:isSuperadmin, division_id:division?.id || null})});
    if (row.password && String(row.password).length) await api("/v1/admin/users/" + user.id + "/reset-password", {method:"POST", body:JSON.stringify({password:String(row.password)})});
  }
  if (isNew && status !== "active") await api("/v1/admin/users/" + user.id, {method:"PUT", body:JSON.stringify({status})});

  const current = await api("/v1/admin/users/" + user.id);
  const currentApps = new Set(current.applications.map((application) => application.code.toUpperCase()));
  for (const application of applications) {
    const code = application.code.toUpperCase();
    if (requestedAppCodes.has(code) && !currentApps.has(code)) await api("/v1/admin/users/" + user.id + "/applications", {method:"POST", body:JSON.stringify({application_code:application.code, enabled:true})});
    else if (!requestedAppCodes.has(code) && currentApps.has(code)) await api("/v1/admin/users/" + user.id + "/applications/" + application.code, {method:"DELETE"});
  }
  const currentRoleIds = new Set(current.roles.map((role) => String(role.id)));
  for (const role of roles) {
    const id = String(role.id);
    if (requestedRoles.has(id) && !currentRoleIds.has(id)) await api("/v1/admin/users/" + user.id + "/roles", {method:"POST", body:JSON.stringify({role_id:role.id})});
    else if (!requestedRoles.has(id) && currentRoleIds.has(id)) await api("/v1/admin/users/" + user.id + "/roles/" + role.id, {method:"DELETE"});
  }
}

async function importUsersCsv(file) {
  const rows = parseCsv(await file.text());
  if (rows.length < 2) throw new Error("The CSV contains no user rows");
  if (rows.length > 501) throw new Error("Import is limited to 500 users per file");
  const header = rows[0].map((value) => value.trim().replace(/^\uFEFF/, ""));
  if (header.length !== USER_CSV_FIELDS.length || header.some((value, index) => value !== USER_CSV_FIELDS[index])) throw new Error("CSV header must be: " + USER_CSV_FIELDS.join(","));
  const [applications, roles, divisions, existingUsers] = await Promise.all([api("/v1/admin/applications"), api("/v1/admin/roles"), api("/v1/admin/divisions"), api("/v1/admin/users")]);
  const usersByUsername = new Map(existingUsers.map((user) => [user.username.toLowerCase(), user]));
  const usersByEmail = new Map(existingUsers.map((user) => [user.email.toLowerCase(), user]));
  let imported = 0;
  const errors = [];
  for (let index = 1; index < rows.length; index += 1) {
    const values = rows[index];
    const row = Object.fromEntries(USER_CSV_FIELDS.map((field, fieldIndex) => [field, String(values[fieldIndex] ?? "").trim()]));
    const line = index + 1;
    try {
      if (values.length !== USER_CSV_FIELDS.length) throw new Error("expected " + USER_CSV_FIELDS.length + " fields");
      if (!row.username || !row.email || !row.full_name) throw new Error("username, email, and full_name are required");
      const existing = usersByUsername.get(row.username.toLowerCase());
      const emailOwner = usersByEmail.get(row.email.toLowerCase());
      if (emailOwner && (!existing || emailOwner.id !== existing.id)) throw new Error("email belongs to another user");
      const importedUser = await syncImportedUser(existing, row, applications, roles, divisions, !existing);
      usersByUsername.set(row.username.toLowerCase(), importedUser);
      usersByEmail.set(row.email.toLowerCase(), importedUser);
      imported += 1;
    } catch (error) { errors.push("Line " + line + ": " + error.message); }
  }
  await renderUsers();
  if (errors.length) showToast("Imported " + imported + " user(s); " + errors.length + " row(s) failed. " + errors[0], true);
  else showToast("Imported " + imported + " user(s)");
}

async function renderUsers() {
  const [users, divisions] = await Promise.all([api("/v1/admin/users"), api("/v1/admin/divisions")]);
  const divisionOptions = "<option value=''>All Divisions</option>" + divisions.map((d) => "<option value='" + esc(d.name) + "'>" + esc(d.name) + "</option>").join("");

  $("section-users").innerHTML =
    "<div class='bic-page-header'>" +
      "<div>" +
        "<p class='bic-kicker'>IDENTITY DIRECTORY</p>" +
        "<h2 class='bic-page-title'>Users</h2>" +
        "<p class='bic-page-subtitle'>Manage identities, application access, and assigned roles.</p>" +
      "</div>" +
      "<div class='bic-action-row'>" +
        "<input id='users-import-file' class='bic-hidden' type='file' accept='.csv,text/csv'>" +
        "<button id='import-users' class='bic-btn bic-btn-secondary bic-btn-sm'>" + icon("plus") + " Import CSV</button>" +
        "<button id='export-users' class='bic-btn bic-btn-secondary bic-btn-sm'>Export CSV</button>" +
        "<button id='new-user' class='bic-btn bic-btn-primary bic-btn-sm'>" + icon("plus") + " New user</button>" +
      "</div>" +
    "</div>" +
    "<div class='bic-card bic-panel'>" +
      "<div class='bic-table-toolbar'>" +
        "<div class='bic-toolbar-filter-group'>" +
          "<div class='bic-search-input-wrap'>" +
            "<svg class='bic-search-icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>" +
            "<input class='bic-control bic-search-control' id='users-search' type='search' placeholder='Search by name, username, email, role...' aria-label='Search users'>" +
          "</div>" +
          "<select class='bic-select bic-filter-select' id='users-division-filter' aria-label='Filter by division'>" + divisionOptions + "</select>" +
        "</div>" +
        "<div class='bic-toolbar-meta'>" +
          "<span class='bic-badge bic-badge-info'>" + users.length + " identities</span>" +
        "</div>" +
      "</div>" +
      "<div class='bic-table-wrap'>" +
        "<table class='bic-table bic-sortable bic-users-table'>" +
          "<thead>" +
            "<tr>" +
              "<th>User</th>" +
              "<th>Email</th>" +
              "<th>Division</th>" +
              "<th>Status</th>" +
              "<th>Applications</th>" +
              "<th>Roles</th>" +
              "<th data-sort-type='date'>Last login</th>" +
              "<th data-sortable='false' class='bic-text-right'>Actions</th>" +
            "</tr>" +
          "</thead>" +
          "<tbody id='users-table-body'></tbody>" +
        "</table>" +
      "</div>" +
    "</div>";

  const renderRows = () => {
    const query = $("users-search")?.value.trim().toLowerCase() || "";
    const divisionFilter = $("users-division-filter")?.value.trim().toLowerCase() || "";
    const filtered = users.filter((user) => {
      const haystack = [user.full_name, user.username, user.email, user.division?.code, user.division?.name, user.status, ...user.applications.map((app) => app.code), ...user.roles.map((role) => role.name)].join(" ").toLowerCase();
      const matchQuery = !query || haystack.includes(query);
      const matchDivision = !divisionFilter || (user.division?.name || "").toLowerCase() === divisionFilter;
      return matchQuery && matchDivision;
    });

    $("users-table-body").innerHTML = filtered.length ? filtered.map((user) => {
      const initial = esc(getInitials(user.full_name || user.username));
      const roleList = user.roles || [];
      const visibleRoles = roleList.slice(0, 2);
      const remainingCount = roleList.length - visibleRoles.length;
      const allRolesTitle = esc(roleList.map((r) => r.name + " (" + r.application_code + ")").join(", "));
      
      const roleBadges = visibleRoles.map((role) =>
        "<span class='bic-badge bic-badge-primary' title='" + esc(role.application_code) + " role'>" + esc(role.name) + "</span>"
      ).join("");
      const moreRoleBadge = remainingCount > 0 ? "<span class='bic-badge bic-badge-info' title='" + allRolesTitle + "'>+" + remainingCount + " more</span>" : "";
      
      const appBadges = user.applications.length
        ? user.applications.map((app) => "<span class='bic-app-tag'>" + esc(app.code) + "</span>").join(" ")
        : (user.is_superadmin ? "<span class='bic-badge bic-badge-primary'>All</span>" : "<span class='bic-muted'>None</span>");

      return "<tr>" +
        "<td>" +
          "<div class='bic-user-cell'>" +
            "<div class='bic-user-avatar bic-user-avatar-sm'>" + initial + "</div>" +
            "<div class='bic-user-names'>" +
              "<strong class='bic-user-name-title'>" + esc(user.full_name) + "</strong>" +
              "<span class='bic-user-handle'>@" + esc(user.username) + "</span>" +
            "</div>" +
          "</div>" +
        "</td>" +
        "<td><span class='bic-email-cell' title='" + esc(user.email) + "'>" + esc(user.email) + "</span></td>" +
        "<td>" + (user.division?.name ? "<span class='bic-division-tag'>" + esc(user.division.name) + "</span>" : "<span class='bic-muted'>Unassigned</span>") + "</td>" +
        "<td>" + statusBadge(user.status) + "</td>" +
        "<td><div class='bic-app-tags-wrap'>" + appBadges + "</div></td>" +
        "<td><div class='bic-role-summary'>" + (roleBadges + moreRoleBadge || "<span class='bic-muted'>None</span>") + "</div></td>" +
        "<td data-sort-value='" + esc(user.last_login_at || "") + "'><span class='bic-date-cell'>" + (user.last_login_at ? new Date(user.last_login_at).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}) : "<span class='bic-muted'>Never</span>") + "</span></td>" +
        "<td class='bic-text-right'>" +
          "<div class='bic-action-row bic-justify-end'>" +
            "<button class='bic-icon-action' data-details='" + user.id + "' title='View details' aria-label='View details'>" + icon("eye") + "</button>" +
            "<button class='bic-icon-action' data-edit='" + user.id + "' title='Modify user' aria-label='Modify user'>" + icon("edit") + "</button>" +
            "<button class='bic-icon-action bic-icon-action-danger' data-delete='" + user.id + "' title='Delete user' aria-label='Delete user'>" + icon("trash") + "</button>" +
          "</div>" +
        "</td>" +
      "</tr>";
    }).join("") : "<tr><td colspan='8' class='bic-empty'>No users found. Try adjusting your search or filters.</td></tr>";

    document.querySelectorAll("[data-details]").forEach((button) => button.onclick = () => openUserDetails(button.dataset.details, false));
    document.querySelectorAll("[data-edit]").forEach((button) => button.onclick = () => openUserDetails(button.dataset.edit, true));
    document.querySelectorAll("[data-delete]").forEach((button) => button.onclick = () => deleteUser(button.dataset.delete));
  };

  $("users-search").oninput = renderRows;
  $("users-division-filter").onchange = renderRows;
  renderRows();
  enableTableSorting($("section-users"));
  $("new-user").onclick = () => openNewUserForm(divisions);
  $("export-users").onclick = () => downloadUsersCsv(users);
  $("import-users").onclick = () => $("users-import-file").click();
  $("users-import-file").onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try { await importUsersCsv(file); } catch (error) { showToast(error.message, true); }
  };
}

function openNewUserForm(divisions) {
  $("modal-root").innerHTML =
    "<div class='bic-modal-backdrop is-open' role='presentation'><div class='bic-modal' role='dialog' aria-modal='true' aria-labelledby='new-user-title'>" +
    "<div class='bic-modal-header'><div><p class='bic-kicker'>USER DIRECTORY</p><h3 id='new-user-title'>Create user</h3></div><button class='bic-icon-button' data-close-modal aria-label='Close'>✕</button></div>" +
    "<form id='new-user-form'><div class='bic-modal-body'><div class='bic-form-group'><label class='bic-label' for='new-username'>Username</label><input class='bic-control' id='new-username' required pattern='[a-zA-Z0-9._-]+'></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-email'>Email</label><input class='bic-control' id='new-email' type='email' required></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-full-name'>Full name</label><input class='bic-control' id='new-full-name' required></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-division'>Division</label><select class='bic-select' id='new-division'><option value=''>Unassigned</option>" + divisions.map((division) => "<option value='" + esc(division.id) + "'>" + esc(division.name) + " (" + esc(division.code) + ")</option>").join("") + "</select></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-password'>Initial password</label><input class='bic-control' id='new-password' type='password' minlength='12' required><span class='bic-help'>Minimum 12 characters.</span></div></div>" +
    "<div class='bic-modal-footer'><button type='button' class='bic-btn bic-btn-secondary' data-close-modal>Cancel</button><button type='submit' class='bic-btn bic-btn-primary'>Create user</button></div></form></div></div>";
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.onclick = closeModal);
  $("new-user-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api("/v1/admin/users", {method:"POST", body:JSON.stringify({username:$("new-username").value, email:$("new-email").value, full_name:$("new-full-name").value, password:$("new-password").value, division_id:$("new-division").value || null})});
      closeModal();
      showToast("User created");
      await renderUsers();
    } catch (error) { showToast(error.message, true); }
  };
}

async function deleteUser(userId) {
  const user = await api("/v1/admin/users/" + userId);
  if (!confirm("Delete user " + user.username + "? This action cannot be undone.")) return;
  try {
    await api("/v1/admin/users/" + userId, {method:"DELETE"});
    showToast("User deleted");
    await renderUsers();
  } catch (error) { showToast(error.message, true); }
}

async function renderDivisions() {
  const divisions = await api("/v1/admin/divisions");
  $("section-divisions").innerHTML =
    "<div class='bic-page-header'><div><p class='bic-kicker'>ORGANIZATION DIRECTORY</p><h2 class='bic-page-title'>Divisions</h2><p class='bic-page-subtitle'>Manage the organizational divisions available on user profiles.</p></div><button id='new-division' class='bic-btn bic-btn-primary bic-btn-sm'>" + icon("plus") + " New division</button></div>" +
    "<div class='bic-card bic-panel'><div class='bic-table-toolbar'><span class='bic-muted'>" + divisions.length + " divisions</span><span class='bic-help'>Deleting a division unassigns it from users; user accounts are not deleted.</span></div><div class='bic-table-wrap'><table class='bic-table bic-sortable'><thead><tr><th>Code</th><th>Name</th><th>Description</th><th data-sortable='false' class='bic-text-right'>Actions</th></tr></thead><tbody>" +
    (divisions.map((division) => "<tr><td><strong>" + esc(division.code) + "</strong></td><td>" + esc(division.name) + "</td><td>" + esc(division.description || "—") + "</td><td class='bic-text-right'><div class='bic-action-row bic-justify-end'><button class='bic-icon-action' data-edit-division='" + esc(division.id) + "' title='Modify division' aria-label='Modify division'>" + icon("edit") + "</button><button class='bic-icon-action bic-icon-action-danger' data-delete-division='" + esc(division.id) + "' title='Delete division' aria-label='Delete division'>" + icon("trash") + "</button></div></td></tr>").join("") || "<tr><td colspan='4' class='bic-empty'>No divisions defined yet.</td></tr>") +
    "</tbody></table></div></div>";
  enableTableSorting($("section-divisions"));
  $("new-division").onclick = () => openDivisionForm();
  document.querySelectorAll("[data-edit-division]").forEach((button) => button.onclick = () => {
    const division = divisions.find((candidate) => candidate.id === button.dataset.editDivision);
    if (division) openDivisionForm(division);
  });
  document.querySelectorAll("[data-delete-division]").forEach((button) => button.onclick = () => deleteDivision(button.dataset.deleteDivision));
}

function openDivisionForm(division = null) {
  const editing = Boolean(division);
  $("modal-root").innerHTML =
    "<div class='bic-modal-backdrop is-open' role='presentation'><div class='bic-modal' role='dialog' aria-modal='true' aria-labelledby='division-form-title'>" +
    "<div class='bic-modal-header'><div><p class='bic-kicker'>ORGANIZATION DIRECTORY</p><h3 id='division-form-title'>" + (editing ? "Modify division" : "Create division") + "</h3></div><button class='bic-icon-button' data-close-modal aria-label='Close'>✕</button></div>" +
    "<form id='division-form'><div class='bic-modal-body'><div class='bic-form-group'><label class='bic-label' for='division-code'>Code</label><input class='bic-control' id='division-code' required pattern='[A-Z0-9_-]+' maxlength='40' value='" + esc(division?.code || "") + "'><span class='bic-help'>Use a stable uppercase code, for example FINANCE or IT_OPS.</span></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='division-name'>Name</label><input class='bic-control' id='division-name' required maxlength='120' value='" + esc(division?.name || "") + "'></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='division-description'>Description</label><textarea class='bic-control bic-textarea' id='division-description' maxlength='500'>" + esc(division?.description || "") + "</textarea></div></div>" +
    "<div class='bic-modal-footer'><button type='button' class='bic-btn bic-btn-secondary' data-close-modal>Cancel</button><button type='submit' class='bic-btn bic-btn-primary'>" + (editing ? "Apply changes" : "Create division") + "</button></div></form></div></div>";
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.onclick = closeModal);
  $("division-form").onsubmit = async (event) => {
    event.preventDefault();
    const body = {code:$("division-code").value.trim().toUpperCase(), name:$("division-name").value.trim(), description:$("division-description").value.trim() || null};
    try {
      await api(editing ? "/v1/admin/divisions/" + division.id : "/v1/admin/divisions", {method:editing ? "PUT" : "POST", body:JSON.stringify(body)});
      closeModal();
      showToast(editing ? "Division updated" : "Division created");
      await renderDivisions();
    } catch (error) { showToast(error.message, true); }
  };
}

async function deleteDivision(divisionId) {
  const divisions = await api("/v1/admin/divisions");
  const division = divisions.find((candidate) => candidate.id === divisionId);
  if (!division || !confirm("Delete division " + division.name + "? Users assigned to it will become unassigned.")) return;
  try {
    await api("/v1/admin/divisions/" + divisionId, {method:"DELETE"});
    showToast("Division deleted");
    await renderDivisions();
  } catch (error) { showToast(error.message, true); }
}

async function openUserDetails(userId, editable) {
  const user = await api("/v1/admin/users/" + userId);
  const applications = await api("/v1/admin/applications");
  const roles = await api("/v1/admin/roles");
  const divisions = await api("/v1/admin/divisions");
  const selectedApplications = new Set(user.applications.map((app) => app.code));
  const selectedRoles = new Set(user.roles.map((role) => role.id));
  const fieldDisabled = editable ? "" : " disabled";
  const accessRows = applications.map((app) => {
    const appRoles = roles.filter((role) => role.application_code === app.code);
    const applicationCell = "<td class='bic-access-application-cell' rowspan='" + Math.max(appRoles.length, 1) + "'><label class='bic-table-check'><input type='checkbox' data-app-code='" + esc(app.code) + "' " + (selectedApplications.has(app.code) ? "checked" : "") + fieldDisabled + "><span><strong>" + esc(app.name) + "</strong><small class='bic-muted'>" + esc(app.code) + "</small></span></label></td>";
    if (!appRoles.length) return "<tr>" + applicationCell + "<td colspan='2' class='bic-muted'>No roles defined for this application.</td></tr>";
    return appRoles.map((role, index) => "<tr>" + (index === 0 ? applicationCell : "") + "<td><label class='bic-table-check'><input type='checkbox' data-role-id='" + esc(role.id) + "' data-role-application='" + esc(app.code) + "' " + (selectedRoles.has(role.id) ? "checked" : "") + fieldDisabled + "><span>" + esc(role.name) + "</span></label></td><td><span class='bic-compact-value'>" + esc(role.description || "Application role") + "</span></td></tr>").join("");
  }).join("");
  $("modal-root").innerHTML =
    "<div class='bic-modal-backdrop is-open' role='presentation'><div class='bic-modal bic-user-details-modal' role='dialog' aria-modal='true' aria-labelledby='user-details-title'>" +
    "<div class='bic-modal-header'><div class='bic-user-chip'><div class='bic-user-avatar bic-user-avatar-lg'>" + esc(getInitials(user.full_name || user.username)) + "</div><div><p class='bic-kicker bic-mb-0'>" + (editable ? "EDIT USER" : "USER DETAILS") + "</p><h3 id='user-details-title' class='bic-mb-0'>" + esc(user.full_name) + "</h3><p class='bic-muted bic-mb-0'>@" + esc(user.username) + "</p></div></div><button class='bic-icon-button' data-close-modal aria-label='Close'>✕</button></div>" +
    "<form id='user-details-form'><div class='bic-modal-body'>" +
    "<div class='bic-form-group'><label class='bic-label' for='detail-email'>Email</label><input class='bic-control' id='detail-email' type='email' value='" + esc(user.email) + "' required" + fieldDisabled + "></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='detail-name'>Full name</label><input class='bic-control' id='detail-name' value='" + esc(user.full_name) + "' required" + fieldDisabled + "></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='detail-division'>Division</label><select class='bic-select' id='detail-division'" + fieldDisabled + "><option value=''>Unassigned</option>" + divisions.map((division) => "<option value='" + esc(division.id) + "' " + (user.division?.id === division.id ? "selected" : "") + ">" + esc(division.name) + " (" + esc(division.code) + ")</option>").join("") + "</select></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='detail-status'>Status</label><select class='bic-select' id='detail-status'" + fieldDisabled + "><option value='active' " + (user.status === "active" ? "selected" : "") + ">Active</option><option value='disabled' " + (user.status === "disabled" ? "selected" : "") + ">Disabled</option><option value='locked' " + (user.status === "locked" ? "selected" : "") + ">Locked</option></select></div>" +
    "<div class='bic-form-group'><span class='bic-label'>Application access and roles</span><div class='bic-table-wrap bic-access-table-wrap'><table class='bic-table bic-access-table'><thead><tr><th>Application access</th><th>Role</th><th>Role description</th></tr></thead><tbody>" + accessRows + "</tbody></table></div><span class='bic-help'>Selecting a role automatically grants access to its application.</span></div>" +
    (editable ? "<div class='bic-form-group'><label class='bic-label' for='detail-password'>Reset password <span class='bic-help'>Optional; leave blank to keep the current password.</span></label><input class='bic-control' id='detail-password' type='password' minlength='12' placeholder='Minimum 12 characters'></div>" : "") +
    "</div><div class='bic-modal-footer'><button type='button' class='bic-btn bic-btn-secondary' data-close-modal>" + (editable ? "Cancel" : "Close") + "</button>" + (editable ? "<button type='submit' class='bic-btn bic-btn-primary'>Apply changes</button>" : "") + "</div></form></div></div>";
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.onclick = closeModal);
  if (!editable) return;
  document.querySelectorAll("[data-role-id]").forEach((input) => input.onchange = () => {
    if (input.checked) {
      const appInput = document.querySelector("[data-app-code='" + input.dataset.roleApplication + "']");
      if (appInput) appInput.checked = true;
    }
  });
  document.querySelectorAll("[data-app-code]").forEach((input) => input.onchange = () => {
    if (!input.checked) document.querySelectorAll("[data-role-application='" + input.dataset.appCode + "']").forEach((roleInput) => { roleInput.checked = false; });
  });
  $("user-details-form").onsubmit = async (event) => {
    event.preventDefault();
    const selectedAppCodes = new Set(Array.from(document.querySelectorAll("[data-app-code]:checked")).map((input) => input.dataset.appCode));
    const selectedRoleIds = new Set(Array.from(document.querySelectorAll("[data-role-id]:checked")).map((input) => input.dataset.roleId));
    try {
      await api("/v1/admin/users/" + userId, {method:"PUT", body:JSON.stringify({email:$("detail-email").value, full_name:$("detail-name").value, status:$("detail-status").value, division_id:$("detail-division").value || null})});
      for (const app of applications) {
        if (selectedAppCodes.has(app.code)) await api("/v1/admin/users/" + userId + "/applications", {method:"POST", body:JSON.stringify({application_code:app.code, enabled:true})});
        else if (selectedApplications.has(app.code)) await api("/v1/admin/users/" + userId + "/applications/" + app.code, {method:"DELETE"});
      }
      for (const role of roles) {
        if (selectedRoleIds.has(role.id) && !selectedRoles.has(role.id)) await api("/v1/admin/users/" + userId + "/roles", {method:"POST", body:JSON.stringify({role_id:role.id})});
        else if (!selectedRoleIds.has(role.id) && selectedRoles.has(role.id)) await api("/v1/admin/users/" + userId + "/roles/" + role.id, {method:"DELETE"});
      }
      const password = $("detail-password").value;
      if (password) await api("/v1/admin/users/" + userId + "/reset-password", {method:"POST", body:JSON.stringify({password})});
      closeModal();
      showToast("User changes applied");
      await renderUsers();
    } catch (error) { showToast(error.message, true); }
  };
}
function closeModal() { $("modal-root").innerHTML = ""; }

function openApplicationForm() {
  $("modal-root").innerHTML =
    "<div class='bic-modal-backdrop is-open' role='presentation'><div class='bic-modal' role='dialog' aria-modal='true' aria-labelledby='app-form-title'>" +
    "<div class='bic-modal-header'><div><p class='bic-kicker'>INTEGRATED APPLICATIONS</p><h3 id='app-form-title'>Register application</h3></div><button class='bic-icon-button' data-close-modal aria-label='Close'>✕</button></div>" +
    "<form id='app-form'><div class='bic-modal-body'><div class='bic-form-group'><label class='bic-label' for='app-code'>Application Code</label><input class='bic-control' id='app-code' required pattern='[A-Z0-9_-]+' maxlength='40' placeholder='e.g. WIKI or NMS'><span class='bic-help'>Unique uppercase identifier.</span></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='app-name'>Application Name</label><input class='bic-control' id='app-name' required maxlength='120' placeholder='e.g. Company Knowledge Base'></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='app-description'>Description</label><textarea class='bic-control bic-textarea' id='app-description' maxlength='500' placeholder='Brief description of the application'></textarea></div></div>" +
    "<div class='bic-modal-footer'><button type='button' class='bic-btn bic-btn-secondary' data-close-modal>Cancel</button><button type='submit' class='bic-btn bic-btn-primary'>Register application</button></div></form></div></div>";
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.onclick = closeModal);
  $("app-form").onsubmit = async (event) => {
    event.preventDefault();
    const body = {code:$("app-code").value.trim().toUpperCase(), name:$("app-name").value.trim(), description:$("app-description").value.trim() || null};
    try {
      await api("/v1/admin/applications", {method:"POST", body:JSON.stringify(body)});
      closeModal();
      showToast("Application registered");
      await renderApplications();
    } catch (error) { showToast(error.message, true); }
  };
}

async function renderApplications() {
  const apps = await api("/v1/admin/applications");
  $("section-applications").innerHTML =
    "<div class='bic-page-header'><div><h3>Applications</h3><p class='bic-muted'>" + apps.length + " registered applications</p></div><button id='new-app' class='bic-btn bic-btn-primary'>" + icon("plus") + " Register application</button></div>" +
    "<div class='bic-card bic-panel'><div class='bic-table-wrap'><table class='bic-table bic-sortable'><thead><tr><th>Code</th><th>Name</th><th>Description</th><th>Status</th></tr></thead><tbody>" +
    apps.map((app) => "<tr><td><strong>" + esc(app.code) + "</strong></td><td>" + esc(app.name) + "</td><td>" + esc(app.description || "—") + "</td><td>" + statusBadge(app.status) + "</td></tr>").join("") +
    "</tbody></table></div></div>";
  enableTableSorting($("section-applications"));
  $("new-app").onclick = () => openApplicationForm();
}

async function renderRBAC() {
  const [roles, permissions, applications] = await Promise.all([api("/v1/admin/roles"), api("/v1/admin/permissions"), api("/v1/admin/applications")]);
  const render = (applicationCode) => {
    const appRoles = roles.filter((role) => role.application_code === applicationCode);
    const appPermissions = permissions.filter((permission) => permission.application_code === applicationCode);
    const roleRows = appRoles.map((role) => {
      const permissionNames = role.permissions || [];
      return "<tr><td><strong>" + esc(role.name) + "</strong><br><span class='bic-muted'>" + esc(role.description || "No description") + "</span></td><td data-sort-type='number' data-sort-value='" + permissionNames.length + "'><span class='bic-badge bic-badge-primary'>" + permissionNames.length + " permission" + (permissionNames.length === 1 ? "" : "s") + "</span></td><td><span class='bic-compact-value' title='" + esc(permissionNames.join(", ")) + "'>" + esc(permissionNames.slice(0, 3).join(", ") || "None") + (permissionNames.length > 3 ? " …" : "") + "</span></td></tr>";
    }).join("") || "<tr><td colspan='3' class='bic-empty'>No roles defined for this application.</td></tr>";
    const permissionRows = appPermissions.map((permission) => "<tr><td><strong>" + esc(permission.code) + "</strong></td><td>" + esc(permission.description || "—") + "</td></tr>").join("") || "<tr><td colspan='2' class='bic-empty'>No permissions defined for this application.</td></tr>";
    const appOptions = applications.map((app) => "<option value='" + esc(app.code) + "' " + (app.code === applicationCode ? "selected" : "") + ">" + esc(app.name) + " (" + esc(app.code) + ")</option>").join("");
    $("section-rbac").innerHTML =
      "<div class='bic-page-header'><div><p class='bic-kicker'>AUTHORIZATION POLICY</p><h3>Roles & permissions</h3><p class='bic-muted'>Manage one application policy at a time to keep role and permission assignments clear and safe.</p></div><div class='bic-action-row'><select class='bic-select' id='rbac-application' aria-label='Select application'>" + appOptions + "</select><button id='toggle-role-form' class='bic-btn bic-btn-secondary bic-btn-sm'>" + icon("plus") + " New role</button><button id='toggle-permission-form' class='bic-btn bic-btn-primary bic-btn-sm'>" + icon("plus") + " New permission</button></div></div>" +
      "<div class='bic-grid-2'>" +
        "<div class='bic-card bic-panel'>" +
          "<div class='bic-toolbar'><h3 class='bic-section-title'>Roles</h3><span class='bic-muted'>" + appRoles.length + " defined</span></div>" +
          "<form id='form-create-role' class='bic-inline-form-box bic-hidden'>" +
            "<div class='bic-inline-form-header'>" +
              "<strong class='bic-inline-form-title'>Create Role</strong>" +
              "<span class='bic-inline-form-app'>" + esc(applicationCode) + "</span>" +
            "</div>" +
            "<div class='bic-inline-form-grid'>" +
              "<div class='bic-form-group'>" +
                "<label class='bic-label' for='new-role-name'>Role Name <span class='bic-text-danger'>*</span></label>" +
                "<input class='bic-control' id='new-role-name' placeholder='e.g. auditor or support_lead' required maxlength='80'>" +
              "</div>" +
              "<div class='bic-form-group'>" +
                "<label class='bic-label' for='new-role-desc'>Description</label>" +
                "<input class='bic-control' id='new-role-desc' placeholder='Brief description of duties' maxlength='255'>" +
              "</div>" +
            "</div>" +
            "<div class='bic-inline-form-actions'>" +
              "<button type='submit' class='bic-btn bic-btn-primary bic-btn-sm'>Save Role</button>" +
              "<button type='button' id='cancel-role-form' class='bic-btn bic-btn-secondary bic-btn-sm'>Cancel</button>" +
            "</div>" +
          "</form>" +
          "<div class='bic-table-wrap'><table class='bic-table bic-sortable'><thead><tr><th>Role</th><th data-sort-type='number'>Permissions</th><th>Permission summary</th></tr></thead><tbody>" + roleRows + "</tbody></table></div>" +
        "</div>" +
        "<div class='bic-card bic-panel'>" +
          "<div class='bic-toolbar'><h3 class='bic-section-title'>Permissions</h3><span class='bic-muted'>" + appPermissions.length + " defined</span></div>" +
          "<form id='form-create-permission' class='bic-inline-form-box bic-hidden'>" +
            "<div class='bic-inline-form-header'>" +
              "<strong class='bic-inline-form-title'>Create Permission</strong>" +
              "<span class='bic-inline-form-app'>" + esc(applicationCode) + "</span>" +
            "</div>" +
            "<div class='bic-inline-form-grid'>" +
              "<div class='bic-form-group'>" +
                "<label class='bic-label' for='new-perm-code'>Permission Code <span class='bic-text-danger'>*</span></label>" +
                "<input class='bic-control' id='new-perm-code' placeholder='e.g. nms.device.view' required maxlength='120'>" +
              "</div>" +
              "<div class='bic-form-group'>" +
                "<label class='bic-label' for='new-perm-desc'>Description</label>" +
                "<input class='bic-control' id='new-perm-desc' placeholder='Brief summary of permission' maxlength='255'>" +
              "</div>" +
            "</div>" +
            "<div class='bic-inline-form-actions'>" +
              "<button type='submit' class='bic-btn bic-btn-primary bic-btn-sm'>Save Permission</button>" +
              "<button type='button' id='cancel-permission-form' class='bic-btn bic-btn-secondary bic-btn-sm'>Cancel</button>" +
            "</div>" +
          "</form>" +
          "<div class='bic-table-wrap'><table class='bic-table bic-sortable'><thead><tr><th>Code</th><th>Description</th></tr></thead><tbody>" + permissionRows + "</tbody></table></div>" +
        "</div>" +
      "</div>" +
      "<div class='bic-card bic-panel bic-section-spaced'><div class='bic-toolbar'><div><h3 class='bic-section-title'>Assign permissions</h3><span class='bic-muted'>Only roles and permissions from " + esc(applicationCode) + " are shown.</span></div></div><div class='bic-action-row'><select class='bic-select' id='permission-role' aria-label='Select role'>" + appRoles.map((role) => "<option value='" + esc(role.id) + "'>" + esc(role.name) + "</option>").join("") + "</select><select class='bic-select' id='role-permission' aria-label='Select permission'>" + appPermissions.map((permission) => "<option value='" + esc(permission.id) + "'>" + esc(permission.code) + "</option>").join("") + "</select><button class='bic-btn bic-btn-primary' id='assign-permission-button' " + (!appRoles.length || !appPermissions.length ? "disabled" : "") + ">Assign permission</button></div></div>";
    
    enableTableSorting($("section-rbac"));
    $("rbac-application").onchange = (event) => render(event.target.value);

    const roleForm = $("form-create-role");
    const permForm = $("form-create-permission");

    $("toggle-role-form").onclick = () => {
      roleForm.classList.toggle("bic-hidden");
      if (!roleForm.classList.contains("bic-hidden")) $("new-role-name")?.focus();
    };
    $("cancel-role-form").onclick = () => roleForm.classList.add("bic-hidden");

    $("toggle-permission-form").onclick = () => {
      permForm.classList.toggle("bic-hidden");
      if (!permForm.classList.contains("bic-hidden")) $("new-perm-code")?.focus();
    };
    $("cancel-permission-form").onclick = () => permForm.classList.add("bic-hidden");

    roleForm.onsubmit = async (event) => {
      event.preventDefault();
      const name = $("new-role-name").value.trim();
      const description = $("new-role-desc").value.trim() || null;
      if (!name) return;
      try {
        await api("/v1/admin/roles", {method:"POST", body:JSON.stringify({application_code:applicationCode, name, description})});
        showToast("Role created");
        await renderRBAC();
      } catch (error) { showToast(error.message, true); }
    };

    permForm.onsubmit = async (event) => {
      event.preventDefault();
      const code = $("new-perm-code").value.trim();
      const description = $("new-perm-desc").value.trim() || null;
      if (!code) return;
      try {
        await api("/v1/admin/permissions", {method:"POST", body:JSON.stringify({application_code:applicationCode, code, description})});
        showToast("Permission created");
        await renderRBAC();
      } catch (error) { showToast(error.message, true); }
    };

    $("assign-permission-button").onclick = async () => {
      if (!$("permission-role").value || !$("role-permission").value) return showToast("Create a role and permission first", true);
      try { await api("/v1/admin/roles/" + $("permission-role").value + "/permissions", {method:"POST", body:JSON.stringify({permission_id:$("role-permission").value})}); showToast("Permission assigned"); await renderRBAC(); }
      catch (error) { showToast(error.message, true); }
    };
  };
  render(applications[0]?.code || "");
}

async function renderAudit() {
  const logs = await api("/v1/admin/audit-logs");
  $("section-audit").innerHTML = "<div class='bic-card bic-panel'><div class='bic-toolbar'><h3 class='bic-section-title'>Security-sensitive events</h3><span class='bic-muted'>Latest 100</span></div><div class='bic-table-wrap'><table class='bic-table bic-sortable'><thead><tr><th data-sort-type='date'>Time</th><th>Event</th><th>Application</th><th>Source IP</th></tr></thead><tbody>" + logs.map((log) => "<tr><td data-sort-value='" + esc(log.timestamp) + "'>" + new Date(log.timestamp).toLocaleString() + "</td><td><span class='bic-badge " + (log.event.includes("FAILED") ? "bic-badge-danger" : "bic-badge-success") + "'>" + esc(log.event) + "</span></td><td>" + esc(log.application || "—") + "</td><td>" + esc(log.source_ip || "—") + "</td></tr>").join("") + "</tbody></table></div></div>";
  enableTableSorting($("section-audit"));
}

const showLoginMode = () => {
  $("login-form").classList.remove("bic-hidden");
  $("forgot-password-form").classList.add("bic-hidden");
  $("reset-password-form").classList.add("bic-hidden");
};
const showForgotPasswordMode = () => {
  $("login-form").classList.add("bic-hidden");
  $("forgot-password-form").classList.remove("bic-hidden");
  $("reset-password-form").classList.add("bic-hidden");
  $("forgot-email").focus();
};
const showResetPasswordMode = () => {
  $("login-form").classList.add("bic-hidden");
  $("forgot-password-form").classList.add("bic-hidden");
  $("reset-password-form").classList.remove("bic-hidden");
  $("reset-password").focus();
};

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("login-error").textContent = "";
  try {
    const tokens = await api("/v1/auth/login", {method:"POST", body:JSON.stringify({username:$("username").value, password:$("password").value, application_code:"CENTRAL_AUTH"})});
    saveTokens(tokens);
    await loadPortal();
  } catch (error) { $("login-error").textContent = error.message; }
});
$("forgot-password-link").onclick = () => {
  $("forgot-password-message").textContent = "";
  showForgotPasswordMode();
};
$("back-to-login").onclick = () => showLoginMode();
$("forgot-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("forgot-password-message").textContent = "";
  try {
    const result = await api("/v1/auth/forgot-password", {method:"POST", body:JSON.stringify({email:$('forgot-email').value.trim()})});
    $("forgot-password-message").textContent = result.message;
  } catch (error) { $("forgot-password-message").textContent = error.message; }
});
let resetToken = new URLSearchParams(window.location.search).get("reset_token");
$("reset-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("reset-password").value;
  const confirmation = $("reset-password-confirm").value;
  $("reset-password-message").textContent = "";
  if (password !== confirmation) {
    $("reset-password-message").textContent = "The passwords do not match.";
    return;
  }
  try {
    const result = await api("/v1/auth/reset-password", {method:"POST", body:JSON.stringify({token:resetToken, password})});
    history.replaceState({}, document.title, window.location.pathname);
    $("reset-password-message").textContent = result.message;
    setTimeout(() => {
      showLoginMode();
      $("login-error").textContent = result.message;
    }, 900);
  } catch (error) { $("reset-password-message").textContent = error.message; }
});
$("logout-button").onclick = async () => { try { await api("/v1/auth/logout", {method:"POST", body:JSON.stringify({refresh_token:state.refreshToken})}); } finally { signOut(); } };
document.querySelectorAll(".bic-nav-link").forEach((link) => link.onclick = () => showSection(link.dataset.section));
if (state.accessToken) loadPortal();
else if (resetToken) showResetPasswordMode();
