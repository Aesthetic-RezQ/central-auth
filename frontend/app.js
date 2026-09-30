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
  const label = status === "active" ? "Active" : status === "disabled" ? "Disabled" : "Locked";
  return "<span class='bic-badge bic-badge-" + type + "'><span class='bic-badge-dot'></span>" + esc(label) + "</span>";
};

const orgRoleBadge = (user) => {
  if (user.is_superadmin || user.org_role === "system_administrator") {
    return "<span class='bic-badge bic-badge-purple' title='System Administrator / Super Admin'>System Administrator</span>";
  }
  if (user.position?.is_general_manager || user.org_role === "general_manager") {
    return "<span class='bic-badge bic-badge-warning' title='Executive General Manager'>General Manager</span>";
  }
  if (user.position?.is_manager || user.org_role === "manager") {
    return "<span class='bic-badge bic-badge-primary' title='Department / Division Manager'>Manager</span>";
  }
  return "<span class='bic-badge bic-badge-info' title='Standard Employee'>Employee</span>";
};

const icon = (name) => {
  const paths = {
    eye: "<path d='M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z'/><circle cx='12' cy='12' r='2.5'/>",
    edit: "<path d='m4 16-.8 4.8L8 20l11.2-11.2-4-4L4 16Z'/><path d='m13.8 6.2 4 4'/>",
    trash: "<path d='M4 7h16'/><path d='M10 11v5M14 11v5'/><path d='m6 7 1 13h10l1-13M9 7V4h6v3'/>",
    plus: "<path d='M12 5v14M5 12h14'/>",
    refresh: "<path d='M20 11a8 8 0 0 0-14.7-3L3 11'/><path d='M3 5v6h6'/><path d='M4 13a8 8 0 0 0 14.7 3L21 13'/><path d='M21 19v-6h-6'/>",
    copy: "<rect width='14' height='14' x='8' y='8' rx='2' ry='2'/><path d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'/>",
    shield: "<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/>",
    check: "<polyline points='20 6 9 17 4 12'/>",
    users: "<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M22 21v-2a4 4 0 0 0-3-3.87'/><path d='M16 3.13a4 4 0 0 1 0 7.75'/>",
    lock: "<rect width='18' height='11' x='3' y='11' rx='2' ry='2'/><path d='M7 11V7a5 5 0 0 1 10 0v4'/>",
    matrix: "<rect width='18' height='18' x='3' y='3' rx='2'/><path d='M3 9h18M3 15h18M9 3v18M15 3v18'/>",
    grid: "<rect width='7' height='7' x='3' y='3' rx='1'/><rect width='7' height='7' x='14' y='3' rx='1'/><rect width='7' height='7' x='14' y='14' rx='1'/><rect width='7' height='7' x='3' y='14' rx='1'/>",
    key: "<circle cx='7.5' cy='15.5' r='5.5'/><path d='m21 2-9.6 9.6M15.5 7.5l3 3M18.5 4.5l3 3'/>",
    info: "<circle cx='12' cy='12' r='10'/><line x1='12' y1='16' x2='12' y2='12'/><line x1='12' y1='8' x2='12.01' y2='8'/>",
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
  const pageTitle = $("page-title");
  if (pageTitle) pageTitle.textContent = name === "rbac" ? "Roles & permissions" : name[0].toUpperCase() + name.slice(1);
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
    "<div class='bic-page-header'><div><p class='bic-kicker'>CENTRAL IDENTITY PLATFORM</p><h2 class='bic-page-title'>Overview</h2><p class='bic-page-subtitle'>High-level metrics, active directory health, and recent authentication activity.</p></div></div>" +
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

const USER_CSV_FIELDS = ["username", "employee_id", "email", "full_name", "division", "position", "status", "is_superadmin", "applications", "roles", "password"];

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
      : (user.applications || []).map((application) => application.code).join(";");
    const roles = (user.roles || []).map((role) => role.application_code + ":" + role.name).join(";");
    rows.push(csvRow([
      user.username,
      user.employee_id || "",
      user.email,
      user.full_name,
      user.division?.code || "",
      user.position?.code || "",
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

async function syncImportedUser(user, row, applications, roles, divisions, positions, isNew) {
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

  const positionValue = String(row.position || "").trim().toLowerCase();
  const position = positionValue ? positions.find((candidate) => candidate.code.toLowerCase() === positionValue || candidate.name.toLowerCase() === positionValue) : null;
  if (positionValue && !position) throw new Error("unknown position: " + row.position);

  const employeeId = String(row.employee_id || "").trim() || null;

  if (isNew) {
    const password = String(row.password || "");
    if (password.length < 12) throw new Error("new users require a password of at least 12 characters");
    user = await api("/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: row.username.trim(),
        employee_id: employeeId,
        email: row.email.trim(),
        full_name: row.full_name.trim(),
        password,
        is_superadmin: isSuperadmin,
        division_id: division?.id || null,
        position_id: position?.id || null,
      })
    });
  } else {
    user = await api("/v1/admin/users/" + user.id, {
      method: "PUT",
      body: JSON.stringify({
        email: row.email.trim(),
        full_name: row.full_name.trim(),
        employee_id: employeeId,
        status,
        is_superadmin: isSuperadmin,
        division_id: division?.id || null,
        position_id: position?.id || null,
      })
    });
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
  const [applications, roles, divisions, positions, existingUsers] = await Promise.all([
    api("/v1/admin/applications"),
    api("/v1/admin/roles"),
    api("/v1/admin/divisions"),
    api("/v1/admin/positions"),
    api("/v1/admin/users")
  ]);
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
      const importedUser = await syncImportedUser(existing, row, applications, roles, divisions, positions, !existing);
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
  const [users, divisions, positions] = await Promise.all([
    api("/v1/admin/users"),
    api("/v1/admin/divisions"),
    api("/v1/admin/positions"),
  ]);
  
  const divisionOptions = "<option value=''>All Divisions</option>" + divisions.map((d) => "<option value='" + esc(d.name) + "'>" + esc(d.name) + "</option>").join("");
  const positionOptions = "<option value=''>All Positions</option>" + positions.map((p) => "<option value='" + esc(p.name) + "'>" + esc(p.name) + "</option>").join("");

  $("section-users").innerHTML =
    "<div class='bic-page-header'>" +
      "<div>" +
        "<p class='bic-kicker'>IDENTITY DIRECTORY</p>" +
        "<h2 class='bic-page-title'>Users</h2>" +
        "<p class='bic-page-subtitle'>Master directory of internal employee identities, organizational hierarchy, and application access.</p>" +
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
            "<input class='bic-control bic-search-control' id='users-search' type='search' placeholder='Search by name, employee ID, email, role...' aria-label='Search users'>" +
          "</div>" +
          "<select class='bic-select bic-filter-select' id='users-division-filter' aria-label='Filter by division'>" + divisionOptions + "</select>" +
          "<select class='bic-select bic-filter-select' id='users-position-filter' aria-label='Filter by position'>" + positionOptions + "</select>" +
          "<select class='bic-select bic-filter-select' id='users-org-role-filter' aria-label='Filter by org role'>" +
            "<option value=''>All Org Roles</option>" +
            "<option value='system_administrator'>System Administrator</option>" +
            "<option value='general_manager'>General Manager</option>" +
            "<option value='manager'>Manager</option>" +
            "<option value='employee'>Employee</option>" +
          "</select>" +
          "<select class='bic-select bic-filter-select' id='users-status-filter' aria-label='Filter by status'>" +
            "<option value=''>All Statuses</option>" +
            "<option value='active'>Active</option>" +
            "<option value='disabled'>Disabled</option>" +
            "<option value='locked'>Locked</option>" +
          "</select>" +
        "</div>" +
        "<div class='bic-toolbar-meta'>" +
          "<span class='bic-badge bic-badge-info'>" + users.length + " identities</span>" +
        "</div>" +
      "</div>" +
      "<div class='bic-table-wrap'>" +
        "<table class='bic-table bic-sortable bic-users-table'>" +
          "<thead>" +
            "<tr>" +
              "<th class='col-user'>User</th>" +
              "<th class='col-employee-id'>Employee ID</th>" +
              "<th class='col-division'>Division</th>" +
              "<th class='col-position'>Position</th>" +
              "<th class='col-org-role'>Org Role</th>" +
              "<th class='col-status'>Status</th>" +
              "<th class='col-apps'>Applications</th>" +
              "<th class='col-last-login' data-sort-type='date'>Last login</th>" +
              "<th class='col-actions bic-text-right' data-sortable='false'>Actions</th>" +
            "</tr>" +
          "</thead>" +
          "<tbody id='users-table-body'></tbody>" +
        "</table>" +
      "</div>" +
    "</div>";

  const renderRows = () => {
    const query = $("users-search")?.value.trim().toLowerCase() || "";
    const divisionFilter = $("users-division-filter")?.value.trim().toLowerCase() || "";
    const positionFilter = $("users-position-filter")?.value.trim().toLowerCase() || "";
    const orgRoleFilter = $("users-org-role-filter")?.value.trim().toLowerCase() || "";
    const statusFilter = $("users-status-filter")?.value.trim().toLowerCase() || "";

    const filtered = users.filter((user) => {
      const userOrgRole = user.org_role || (user.is_superadmin ? "system_administrator" : (user.position?.is_general_manager ? "general_manager" : (user.position?.is_manager ? "manager" : "employee")));
      const haystack = [
        user.full_name,
        user.username,
        user.employee_id || "",
        user.email,
        userOrgRole,
        userOrgRole.replace(/_/g, " "),
        user.division?.code,
        user.division?.name,
        user.position?.name,
        user.status,
        ...user.applications.map((app) => app.code),
        ...user.roles.map((role) => role.name),
      ].join(" ").toLowerCase();

      const matchQuery = !query || haystack.includes(query);
      const matchDivision = !divisionFilter || (user.division?.name || "").toLowerCase() === divisionFilter;
      const matchPosition = !positionFilter || (user.position?.name || "").toLowerCase() === positionFilter;
      const matchOrgRole = !orgRoleFilter || userOrgRole === orgRoleFilter;
      const matchStatus = !statusFilter || (user.status || "").toLowerCase() === statusFilter;
      return matchQuery && matchDivision && matchPosition && matchOrgRole && matchStatus;
    });

    $("users-table-body").innerHTML = filtered.length ? filtered.map((user) => {
      const initial = esc(getInitials(user.full_name || user.username));
      let appBadges = "<span class='bic-muted'>None</span>";
      if (user.is_superadmin) {
        appBadges = "<span class='bic-badge bic-badge-purple' title='All Applications Authorized'>All Applications</span>";
      } else if (user.applications && user.applications.length > 0) {
        if (user.applications.length <= 3) {
          appBadges = user.applications.map((app) => "<span class='bic-app-tag'>" + esc(app.code) + "</span>").join(" ");
        } else {
          const firstThree = user.applications.slice(0, 3).map((app) => "<span class='bic-app-tag'>" + esc(app.code) + "</span>").join(" ");
          const remainingCount = user.applications.length - 3;
          const remainingNames = user.applications.slice(3).map((app) => app.code).join(", ");
          appBadges = firstThree + " <span class='bic-app-tag bic-app-tag-more' title='" + esc(remainingNames) + "'>+" + remainingCount + " more</span>";
        }
      }

      return "<tr>" +
        "<td class='col-user'>" +
          "<div class='bic-user-cell'>" +
            "<div class='bic-user-avatar bic-user-avatar-sm'>" + initial + "</div>" +
            "<div class='bic-user-names'>" +
              "<strong class='bic-user-name-title'>" + esc(user.full_name) + "</strong>" +
              "<span class='bic-user-handle'>@" + esc(user.username) + " · <span class='bic-muted'>" + esc(user.email) + "</span></span>" +
            "</div>" +
          "</div>" +
        "</td>" +
        "<td class='col-employee-id'>" + (user.employee_id ? "<span class='bic-employee-badge font-mono'><strong>" + esc(user.employee_id) + "</strong></span>" : "<span class='bic-muted'>—</span>") + "</td>" +
        "<td class='col-division'>" + (user.division?.name ? "<span class='bic-division-tag'>" + esc(user.division.name) + "</span>" : "<span class='bic-muted'>Unassigned</span>") + "</td>" +
        "<td class='col-position'>" + (user.position?.name ? "<span class='bic-position-tag'>" + esc(user.position.name) + "</span>" : "<span class='bic-muted'>Unassigned</span>") + "</td>" +
        "<td class='col-org-role'>" + orgRoleBadge(user) + "</td>" +
        "<td class='col-status'>" + statusBadge(user.status) + "</td>" +
        "<td class='col-apps'><div class='bic-app-tags-wrap'>" + appBadges + "</div></td>" +
        "<td class='col-last-login' data-sort-value='" + esc(user.last_login_at || "") + "'><span class='bic-date-cell'>" + (user.last_login_at ? new Date(user.last_login_at).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}) : "<span class='bic-muted'>Never</span>") + "</span></td>" +
        "<td class='col-actions bic-text-right'>" +
          "<div class='bic-action-row bic-justify-end'>" +
            "<button class='bic-icon-action bic-action-view' data-details='" + user.id + "' title='View details' aria-label='View details'>" + icon("eye") + "</button>" +
            "<button class='bic-icon-action bic-action-edit' data-edit='" + user.id + "' title='Modify user' aria-label='Modify user'>" + icon("edit") + "</button>" +
            "<button type='button' class='bic-icon-action bic-action-key' data-reset-password='" + esc(user.id) + "' title='Reset password' aria-label='Reset password for " + esc(user.username) + "'>" + icon("key") + "</button>" +
            "<button class='bic-icon-action bic-action-delete' data-delete='" + user.id + "' title='Delete user' aria-label='Delete user'>" + icon("trash") + "</button>" +
          "</div>" +
        "</td>" +
      "</tr>";
    }).join("") : "<tr><td colspan='9' class='bic-empty'>No users found. Try adjusting your search or filters.</td></tr>";

    document.querySelectorAll("[data-details]").forEach((button) => button.onclick = () => openUserDetails(button.dataset.details, false));
    document.querySelectorAll("[data-edit]").forEach((button) => button.onclick = () => openUserDetails(button.dataset.edit, true));
    document.querySelectorAll("[data-reset-password]").forEach((button) => button.onclick = () => openPasswordResetForm(users.find((user) => user.id === button.dataset.resetPassword)));
    document.querySelectorAll("[data-delete]").forEach((button) => button.onclick = () => deleteUser(button.dataset.delete));
  };

  $("users-search").oninput = renderRows;
  $("users-division-filter").onchange = renderRows;
  $("users-position-filter").onchange = renderRows;
  $("users-org-role-filter").onchange = renderRows;
  $("users-status-filter").onchange = renderRows;
  renderRows();
  enableTableSorting($("section-users"));
  $("new-user").onclick = () => openNewUserForm(divisions, positions, users);
  $("export-users").onclick = () => downloadUsersCsv(users);
  $("import-users").onclick = () => $("users-import-file").click();
  $("users-import-file").onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try { await importUsersCsv(file); } catch (error) { showToast(error.message, true); }
  };
}

function openNewUserForm(divisions, positions, users) {
  $("modal-root").innerHTML =
    "<div class='bic-modal-backdrop is-open' role='presentation'><div class='bic-modal' role='dialog' aria-modal='true' aria-labelledby='new-user-title'>" +
    "<div class='bic-modal-header'><div><p class='bic-kicker'>USER DIRECTORY</p><h3 id='new-user-title'>Create user</h3></div><button class='bic-icon-button' data-close-modal aria-label='Close'>✕</button></div>" +
    "<form id='new-user-form'><div class='bic-modal-body'>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-username'>Username</label><input class='bic-control' id='new-username' required pattern='[a-zA-Z0-9._-]+'></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-employee-id'>Employee ID</label><input class='bic-control' id='new-employee-id' placeholder='e.g. EMP00123'><span class='bic-help'>Corporate employee number.</span></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-email'>Email</label><input class='bic-control' id='new-email' type='email' required></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-full-name'>Full name</label><input class='bic-control' id='new-full-name' required></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-org-role'>Organizational Role</label><select class='bic-select' id='new-org-role'><option value='employee' selected>Standard Employee (Staff / Contributor)</option><option value='manager'>Manager (Department / Division Manager)</option><option value='general_manager'>General Manager (Executive Approver)</option><option value='system_administrator'>System Administrator (Super Admin / IT Admin)</option></select><span class='bic-help'>Authoritative role tier used by Helpdesk & approval routing.</span></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-division'>Division</label><select class='bic-select' id='new-division'><option value=''>Unassigned</option>" + divisions.map((division) => "<option value='" + esc(division.id) + "'>" + esc(division.name) + " (" + esc(division.code) + ")</option>").join("") + "</select></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-position'>Position</label><select class='bic-select' id='new-position'><option value=''>Unassigned</option>" + positions.map((p) => "<option value='" + esc(p.id) + "'>" + esc(p.name) + (p.is_manager ? " (Manager)" : "") + "</option>").join("") + "</select></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-manager'>Direct Manager</label><select class='bic-select' id='new-manager'><option value=''>Automatic (Division Manager)</option>" + users.filter((u) => u.status === "active").map((u) => "<option value='" + esc(u.id) + "'>" + esc(u.full_name) + " (@" + esc(u.username) + ")</option>").join("") + "</select><span class='bic-help'>Optional override. Defaults to division manager.</span></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='new-password'>Initial password</label><input class='bic-control' id='new-password' type='password' minlength='12' required><span class='bic-help'>Minimum 12 characters.</span></div>" +
    "</div>" +
    "<div class='bic-modal-footer'><button type='button' class='bic-btn bic-btn-secondary' data-close-modal>Cancel</button><button type='submit' class='bic-btn bic-btn-primary'>Create user</button></div></form></div></div>";
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.onclick = closeModal);

  $("new-org-role").onchange = () => {
    const role = $("new-org-role").value;
    if (role === "general_manager") {
      const gm = positions.find((p) => p.is_general_manager || p.code === "GENERAL_MANAGER" || p.code === "GM");
      if (gm) $("new-position").value = gm.id;
    } else if (role === "manager") {
      const mgr = positions.find((p) => p.is_manager && !p.is_general_manager);
      if (mgr) $("new-position").value = mgr.id;
    } else if (role === "employee") {
      const currentPos = positions.find((p) => p.id === $("new-position").value);
      if (currentPos && (currentPos.is_manager || currentPos.is_general_manager)) {
        const staff = positions.find((p) => !p.is_manager && !p.is_general_manager);
        if (staff) $("new-position").value = staff.id;
      }
    }
  };
  $("new-position").onchange = () => {
    const pos = positions.find((p) => p.id === $("new-position").value);
    if ($("new-org-role").value === "system_administrator") return;
    if (pos?.is_general_manager) $("new-org-role").value = "general_manager";
    else if (pos?.is_manager) $("new-org-role").value = "manager";
    else if (pos) $("new-org-role").value = "employee";
  };

  $("new-user-form").onsubmit = async (event) => {
    event.preventDefault();
    const role = $("new-org-role").value;
    const isSuperAdmin = role === "system_administrator";
    let posId = $("new-position").value || null;
    if (!posId) {
      if (role === "general_manager") {
        const gm = positions.find((p) => p.is_general_manager || p.code === "GENERAL_MANAGER" || p.code === "GM");
        if (gm) posId = gm.id;
      } else if (role === "manager") {
        const mgr = positions.find((p) => p.is_manager && !p.is_general_manager);
        if (mgr) posId = mgr.id;
      }
    }
    try {
      await api("/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: $("new-username").value,
          employee_id: $("new-employee-id").value.trim() || null,
          email: $("new-email").value,
          full_name: $("new-full-name").value,
          password: $("new-password").value,
          is_superadmin: isSuperAdmin,
          division_id: $("new-division").value || null,
          position_id: posId,
          manager_user_id: $("new-manager").value || null,
        })
      });
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
  const [divisions, users] = await Promise.all([api("/v1/admin/divisions"), api("/v1/admin/users")]);
  $("section-divisions").innerHTML =
    "<div class='bic-page-header'><div><p class='bic-kicker'>ORGANIZATION DIRECTORY</p><h2 class='bic-page-title'>Divisions</h2><p class='bic-page-subtitle'>Manage the organizational divisions and designated division managers.</p></div><button id='new-division' class='bic-btn bic-btn-primary bic-btn-sm'>" + icon("plus") + " New division</button></div>" +
    "<div class='bic-card bic-panel'><div class='bic-table-toolbar'><span class='bic-muted'>" + divisions.length + " divisions</span><span class='bic-help'>Deleting a division unassigns it from users; user accounts are not deleted.</span></div><div class='bic-table-wrap'><table class='bic-table bic-sortable'><thead><tr><th>Code</th><th>Name</th><th>Division Manager</th><th>Description</th><th data-sortable='false' class='bic-text-right'>Actions</th></tr></thead><tbody>" +
    (divisions.map((division) => {
      const mgrText = division.manager ? "<strong>" + esc(division.manager.full_name) + "</strong> <small class='bic-muted'>(" + esc(division.manager.email) + ")</small>" : "<span class='bic-muted'>Unassigned</span>";
      return "<tr><td><strong>" + esc(division.code) + "</strong></td><td>" + esc(division.name) + "</td><td>" + mgrText + "</td><td>" + esc(division.description || "—") + "</td><td class='bic-text-right'><div class='bic-action-row bic-justify-end'><button class='bic-icon-action' data-edit-division='" + esc(division.id) + "' title='Modify division' aria-label='Modify division'>" + icon("edit") + "</button><button class='bic-icon-action bic-icon-action-danger' data-delete-division='" + esc(division.id) + "' title='Delete division' aria-label='Delete division'>" + icon("trash") + "</button></div></td></tr>";
    }).join("") || "<tr><td colspan='5' class='bic-empty'>No divisions defined yet.</td></tr>") +
    "</tbody></table></div></div>";
  enableTableSorting($("section-divisions"));
  $("new-division").onclick = () => openDivisionForm(null, users);
  document.querySelectorAll("[data-edit-division]").forEach((button) => button.onclick = () => {
    const division = divisions.find((candidate) => candidate.id === button.dataset.editDivision);
    if (division) openDivisionForm(division, users);
  });
  document.querySelectorAll("[data-delete-division]").forEach((button) => button.onclick = () => deleteDivision(button.dataset.deleteDivision));
}

function openDivisionForm(division = null, users = []) {
  const editing = Boolean(division);
  const managerOptions = "<option value=''>Unassigned</option>" + users.filter((u) => u.status === "active").map((u) => "<option value='" + esc(u.id) + "' " + (division?.manager_user_id === u.id ? "selected" : "") + ">" + esc(u.full_name) + " (@" + esc(u.username) + ")</option>").join("");

  $("modal-root").innerHTML =
    "<div class='bic-modal-backdrop is-open' role='presentation'><div class='bic-modal' role='dialog' aria-modal='true' aria-labelledby='division-form-title'>" +
    "<div class='bic-modal-header'><div><p class='bic-kicker'>ORGANIZATION DIRECTORY</p><h3 id='division-form-title'>" + (editing ? "Modify division" : "Create division") + "</h3></div><button class='bic-icon-button' data-close-modal aria-label='Close'>✕</button></div>" +
    "<form id='division-form'><div class='bic-modal-body'>" +
    "<div class='bic-form-group'><label class='bic-label' for='division-code'>Code</label><input class='bic-control' id='division-code' required pattern='[A-Z0-9_-]+' maxlength='40' value='" + esc(division?.code || "") + "'><span class='bic-help'>Use a stable uppercase code, for example FINANCE or IT_OPS.</span></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='division-name'>Name</label><input class='bic-control' id='division-name' required maxlength='120' value='" + esc(division?.name || "") + "'></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='division-manager'>Division Manager</label><select class='bic-select' id='division-manager'>" + managerOptions + "</select><span class='bic-help'>Responsible manager for Helpdesk 1st-level approval workflow.</span></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='division-description'>Description</label><textarea class='bic-control bic-textarea' id='division-description' maxlength='500'>" + esc(division?.description || "") + "</textarea></div>" +
    "</div>" +
    "<div class='bic-modal-footer'><button type='button' class='bic-btn bic-btn-secondary' data-close-modal>Cancel</button><button type='submit' class='bic-btn bic-btn-primary'>" + (editing ? "Apply changes" : "Create division") + "</button></div></form></div></div>";
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.onclick = closeModal);
  $("division-form").onsubmit = async (event) => {
    event.preventDefault();
    const body = {
      code: $("division-code").value.trim().toUpperCase(),
      name: $("division-name").value.trim(),
      manager_user_id: $("division-manager").value || null,
      description: $("division-description").value.trim() || null
    };
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
  const positions = await api("/v1/admin/positions");
  const allUsers = await api("/v1/admin/users");

  const selectedApplications = new Set(user.applications.map((app) => app.code));
  const selectedRoles = new Set(user.roles.map((role) => role.id));
  const fieldDisabled = editable ? "" : " disabled";
  const currentOrgRole = (user.is_superadmin || user.org_role === "system_administrator")
    ? "system_administrator"
    : (user.position?.is_general_manager || user.org_role === "general_manager"
        ? "general_manager"
        : (user.position?.is_manager || user.org_role === "manager" ? "manager" : "employee"));

  const accessRows = applications.map((app) => {
    const appRoles = roles.filter((role) => role.application_code === app.code);
    const applicationCell = "<td class='bic-access-application-cell' rowspan='" + Math.max(appRoles.length, 1) + "'><label class='bic-table-check'><input type='checkbox' data-app-code='" + esc(app.code) + "' " + (selectedApplications.has(app.code) ? "checked" : "") + fieldDisabled + "><span><strong>" + esc(app.name) + "</strong><small class='bic-muted'>" + esc(app.code) + "</small></span></label></td>";
    if (!appRoles.length) return "<tr>" + applicationCell + "<td colspan='2' class='bic-muted'>No roles defined for this application.</td></tr>";
    return appRoles.map((role, index) => "<tr>" + (index === 0 ? applicationCell : "") + "<td><label class='bic-table-check'><input type='checkbox' data-role-id='" + esc(role.id) + "' data-role-application='" + esc(app.code) + "' " + (selectedRoles.has(role.id) ? "checked" : "") + fieldDisabled + "><span>" + esc(role.name) + "</span></label></td><td><span class='bic-compact-value'>" + esc(role.description || "Application role") + "</span></td></tr>").join("");
  }).join("");

  const managerCandidates = allUsers.filter((u) => u.id !== user.id && u.status === "active");

  $("modal-root").innerHTML =
    "<div class='bic-modal-backdrop is-open' role='presentation'><div class='bic-modal bic-user-details-modal' role='dialog' aria-modal='true' aria-labelledby='user-details-title'>" +
    "<div class='bic-modal-header'><div class='bic-user-chip'><div class='bic-user-avatar bic-user-avatar-lg'>" + esc(getInitials(user.full_name || user.username)) + "</div><div><div class='bic-chip-header-row'><p class='bic-kicker bic-mb-0'>" + (editable ? "EDIT USER" : "USER DETAILS") + "</p>" + orgRoleBadge(user) + "</div><h3 id='user-details-title' class='bic-mb-0'>" + esc(user.full_name) + "</h3><p class='bic-muted bic-mb-0'>@" + esc(user.username) + "</p></div></div><button class='bic-icon-button' data-close-modal aria-label='Close'>✕</button></div>" +
    "<form id='user-details-form'><div class='bic-modal-body'>" +
    "<div class='bic-form-group'><label class='bic-label' for='detail-name'>Full name</label><input class='bic-control' id='detail-name' value='" + esc(user.full_name) + "' required" + fieldDisabled + "></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='detail-employee-id'>Employee ID</label><input class='bic-control' id='detail-employee-id' value='" + esc(user.employee_id || "") + "' placeholder='e.g. EMP00123'" + fieldDisabled + "><span class='bic-help'>Authoritative corporate employee number.</span></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='detail-email'>Email</label><input class='bic-control' id='detail-email' type='email' value='" + esc(user.email) + "' required" + fieldDisabled + "></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='detail-org-role'>Organizational Role</label><select class='bic-select' id='detail-org-role'" + fieldDisabled + "><option value='employee' " + (currentOrgRole === "employee" ? "selected" : "") + ">Standard Employee (Staff / Contributor)</option><option value='manager' " + (currentOrgRole === "manager" ? "selected" : "") + ">Manager (Department / Division Manager)</option><option value='general_manager' " + (currentOrgRole === "general_manager" ? "selected" : "") + ">General Manager (Executive Approver)</option><option value='system_administrator' " + (currentOrgRole === "system_administrator" ? "selected" : "") + ">System Administrator (Super Admin / IT Admin)</option></select><span class='bic-help'>Authoritative role tier used by Helpdesk and integrated systems for administrative and approval routing.</span></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='detail-division'>Division</label><select class='bic-select' id='detail-division'" + fieldDisabled + "><option value=''>Unassigned</option>" + divisions.map((division) => "<option value='" + esc(division.id) + "' " + (user.division?.id === division.id ? "selected" : "") + ">" + esc(division.name) + " (" + esc(division.code) + ")</option>").join("") + "</select></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='detail-position'>Position</label><select class='bic-select' id='detail-position'" + fieldDisabled + "><option value=''>Unassigned</option>" + positions.map((p) => "<option value='" + esc(p.id) + "' " + (user.position?.id === p.id ? "selected" : "") + ">" + esc(p.name) + (p.is_manager ? " (Manager)" : "") + "</option>").join("") + "</select></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='detail-manager'>Direct Manager</label><select class='bic-select' id='detail-manager'" + fieldDisabled + "><option value=''>Automatic (Division Manager)</option>" + managerCandidates.map((m) => "<option value='" + esc(m.id) + "' " + (user.manager?.id === m.id ? "selected" : "") + ">" + esc(m.full_name) + " (@" + esc(m.username) + ")</option>").join("") + "</select><span class='bic-help'>Supervisor override if distinct from division head.</span></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='detail-status'>Status</label><select class='bic-select' id='detail-status'" + fieldDisabled + "><option value='active' " + (user.status === "active" ? "selected" : "") + ">Active</option><option value='disabled' " + (user.status === "disabled" ? "selected" : "") + ">Disabled</option><option value='locked' " + (user.status === "locked" ? "selected" : "") + ">Locked</option></select></div>" +
    "<div class='bic-form-group'><span class='bic-label'>Application access and roles</span><div class='bic-table-wrap bic-access-table-wrap'><table class='bic-table bic-access-table'><thead><tr><th>Application access</th><th>Role</th><th>Role description</th></tr></thead><tbody>" + accessRows + "</tbody></table></div><span class='bic-help'>Selecting a role automatically grants access to its application.</span></div>" +
    (editable ? "<div class='bic-form-group'><label class='bic-label' for='detail-password'>Reset password <span class='bic-help'>Optional; leave blank to keep the current password.</span></label><input class='bic-control' id='detail-password' type='password' minlength='12' placeholder='Minimum 12 characters'></div>" : "") +
    "</div><div class='bic-modal-footer'><button type='button' class='bic-btn bic-btn-secondary' data-close-modal>" + (editable ? "Cancel" : "Close") + "</button>" + (editable ? "<button type='submit' class='bic-btn bic-btn-primary'>Apply changes</button>" : "") + "</div></form></div></div>";
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.onclick = closeModal);
  if (!editable) return;

  $("detail-org-role").onchange = () => {
    const role = $("detail-org-role").value;
    if (role === "general_manager") {
      const gm = positions.find((p) => p.is_general_manager || p.code === "GENERAL_MANAGER" || p.code === "GM");
      if (gm) $("detail-position").value = gm.id;
    } else if (role === "manager") {
      const mgr = positions.find((p) => p.is_manager && !p.is_general_manager);
      if (mgr) $("detail-position").value = mgr.id;
    } else if (role === "employee") {
      const currentPos = positions.find((p) => p.id === $("detail-position").value);
      if (currentPos && (currentPos.is_manager || currentPos.is_general_manager)) {
        const staff = positions.find((p) => !p.is_manager && !p.is_general_manager);
        if (staff) $("detail-position").value = staff.id;
      }
    }
  };
  $("detail-position").onchange = () => {
    const pos = positions.find((p) => p.id === $("detail-position").value);
    if ($("detail-org-role").value === "system_administrator") return;
    if (pos?.is_general_manager) $("detail-org-role").value = "general_manager";
    else if (pos?.is_manager) $("detail-org-role").value = "manager";
    else if (pos) $("detail-org-role").value = "employee";
  };

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
    const role = $("detail-org-role").value;
    const isSuperAdmin = role === "system_administrator";
    const selectedAppCodes = new Set(Array.from(document.querySelectorAll("[data-app-code]:checked")).map((input) => input.dataset.appCode));
    const selectedRoleIds = new Set(Array.from(document.querySelectorAll("[data-role-id]:checked")).map((input) => input.dataset.roleId));
    let posId = $("detail-position").value || null;
    if (!posId) {
      if (role === "general_manager") {
        const gm = positions.find((p) => p.is_general_manager || p.code === "GENERAL_MANAGER" || p.code === "GM");
        if (gm) posId = gm.id;
      } else if (role === "manager") {
        const mgr = positions.find((p) => p.is_manager && !p.is_general_manager);
        if (mgr) posId = mgr.id;
      }
    }
    try {
      await api("/v1/admin/users/" + userId, {
        method: "PUT",
        body: JSON.stringify({
          email: $("detail-email").value,
          full_name: $("detail-name").value,
          employee_id: $("detail-employee-id").value.trim() || null,
          status: $("detail-status").value,
          is_superadmin: isSuperAdmin,
          division_id: $("detail-division").value || null,
          position_id: posId,
          manager_user_id: $("detail-manager").value || null,
        })
      });
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
function openPasswordResetForm(user) {
  if (!user) return;
  $("modal-root").innerHTML =
    "<div class='bic-modal-backdrop is-open'><div class='bic-modal' role='dialog' aria-modal='true' aria-labelledby='password-reset-title'>" +
    "<div class='bic-modal-header'><div><h3 id='password-reset-title'>Reset password</h3><p class='bic-muted'>" + esc(user.full_name) + " (@" + esc(user.username) + ")</p></div><button type='button' class='bic-icon-button' data-close-modal aria-label='Close'>✕</button></div>" +
    "<form id='admin-password-reset-form'><div class='bic-modal-body'>" +
    "<div class='bic-form-group'><label class='bic-label' for='admin-reset-password'>New password</label><input class='bic-control' id='admin-reset-password' type='password' autocomplete='new-password' minlength='12' maxlength='256' required><span class='bic-help'>Minimum 12 characters. The user will sign in with this new password.</span></div>" +
    "<div class='bic-form-group'><label class='bic-label' for='admin-reset-confirm'>Confirm new password</label><input class='bic-control' id='admin-reset-confirm' type='password' autocomplete='new-password' minlength='12' maxlength='256' required></div>" +
    "<p id='admin-reset-error' class='bic-login-error' role='alert'></p></div>" +
    "<div class='bic-modal-footer'><button type='button' class='bic-btn bic-btn-secondary' data-close-modal>Cancel</button><button type='submit' class='bic-btn bic-btn-primary'>Reset password</button></div></form></div></div>";
  $("modal-root").querySelectorAll("[data-close-modal]").forEach((button) => button.onclick = closeModal);
  $("admin-reset-password").focus();
  $("admin-password-reset-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $("admin-reset-error");
    const password = $("admin-reset-password").value;
    message.textContent = "";
    if (password !== $("admin-reset-confirm").value) {
      message.textContent = "The passwords do not match.";
      $("admin-reset-confirm").focus();
      return;
    }
    const submit = form.querySelector("[type='submit']");
    submit.disabled = true;
    try {
      await api("/v1/admin/users/" + encodeURIComponent(user.id) + "/reset-password", {method:"POST", body:JSON.stringify({password})});
      form.reset();
      if (form.isConnected) closeModal();
      showToast("Password reset for " + user.username);
    } catch (error) {
      if (form.isConnected) message.textContent = error.message;
      else showToast(error.message, true);
    } finally { submit.disabled = false; }
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
  const applications = await api("/v1/admin/applications");
  $("section-applications").innerHTML =
    "<div class='bic-page-header'><div><p class='bic-kicker'>OIDC IDENTITY PROVIDER</p><h2 class='bic-page-title'>Applications &amp; OIDC Clients</h2><p class='bic-page-subtitle'>Manage registered OpenID Connect clients, allowed redirect URIs, OAuth 2.0 credentials, and token lifetimes.</p></div><button id='new-application' class='bic-btn bic-btn-primary bic-btn-sm'>" + icon("plus") + " Register application</button></div>" +
    "<div class='bic-card bic-panel'><div class='bic-table-toolbar'><span class='bic-muted'>" + applications.length + " registered client application" + (applications.length === 1 ? "" : "s") + "</span></div>" +
    "<div class='bic-table-wrap'><table class='bic-table bic-sortable'><thead><tr><th>Application</th><th>Client ID</th><th>Client Type</th><th>Redirect URIs</th><th>Status</th><th class='bic-text-right'>Actions</th></tr></thead><tbody>" +
    applications.map((app) => {
      const uriCount = (app.redirect_uris || []).length;
      return "<tr>" +
        "<td><div><strong>" + esc(app.name) + "</strong><br><span class='bic-app-tag' style='font-size:0.75rem;'>" + esc(app.code) + "</span></div></td>" +
        "<td><code>" + esc(app.client_id || app.code.toLowerCase()) + "</code></td>" +
        "<td><span class='bic-badge " + (app.client_type === "public" ? "bic-badge-warning" : "bic-badge-info") + "'>" + esc(app.client_type || "confidential") + "</span></td>" +
        "<td><span class='bic-badge " + (uriCount > 0 ? "bic-badge-success" : "bic-badge-warning") + "'>" + uriCount + " registered</span></td>" +
        "<td>" + statusBadge(app.status) + "</td>" +
        "<td class='bic-text-right'>" +
          "<button class='bic-btn bic-btn-secondary bic-btn-sm' data-configure-app='" + esc(app.id) + "' style='padding:0.25rem 0.6rem;font-size:0.75rem;'>" + icon("lock") + " Configure OIDC</button>" +
        "</td>" +
      "</tr>";
    }).join("") +
    "</tbody></table></div></div>";
  enableTableSorting($("section-applications"));
  $("new-application").onclick = openApplicationForm;

  document.querySelectorAll("[data-configure-app]").forEach((btn) => {
    btn.onclick = () => {
      const app = applications.find((a) => a.id === btn.dataset.configureApp);
      if (app) openApplicationConfigModal(app);
    };
  });
}

function openApplicationConfigModal(app) {
  let activeTab = "oidc";

  const renderModal = () => {
    $("modal-root").innerHTML =
      "<div class='bic-modal-backdrop is-open' role='presentation'>" +
        "<div class='bic-modal bic-role-modal' role='dialog' aria-modal='true' aria-labelledby='app-modal-title' style='max-width:720px;'>" +
          "<div class='bic-modal-header'>" +
            "<div class='bic-action-row'>" +
              "<div class='bic-stat-icon-wrap bic-stat-icon-applications' style='width:36px;height:36px;'>" + icon("lock") + "</div>" +
              "<div>" +
                "<p class='bic-kicker bic-mb-0'>OIDC CLIENT CONFIGURATION</p>" +
                "<h3 id='app-modal-title' style='margin:0.2rem 0 0;font-size:1.15rem;'>" + esc(app.name) + " (" + esc(app.code) + ")</h3>" +
              "</div>" +
            "</div>" +
            "<button class='bic-icon-button' data-close-modal aria-label='Close'>✕</button>" +
          "</div>" +

          "<div class='bic-modal-tabs'>" +
            "<button class='bic-modal-tab " + (activeTab === "oidc" ? "is-active" : "") + "' id='tab-btn-oidc'>" + icon("shield") + " OIDC &amp; Security</button>" +
            "<button class='bic-modal-tab " + (activeTab === "uris" ? "is-active" : "") + "' id='tab-btn-uris'>" + icon("key") + " Redirect URIs (" + (app.redirect_uris || []).length + ")</button>" +
          "</div>" +

          "<div class='bic-modal-body' id='app-modal-body-content'></div>" +

          "<div class='bic-modal-footer'>" +
            "<button type='button' class='bic-btn bic-btn-secondary' data-close-modal>Close</button>" +
          "</div>" +
        "</div>" +
      "</div>";

    document.querySelectorAll("[data-close-modal]").forEach((b) => b.onclick = closeModal);
    $("tab-btn-oidc").onclick = () => { activeTab = "oidc"; renderTabBody(); renderModal(); };
    $("tab-btn-uris").onclick = () => { activeTab = "uris"; renderTabBody(); renderModal(); };

    renderTabBody();
  };

  const renderTabBody = () => {
    const container = $("app-modal-body-content");
    if (!container) return;

    if (activeTab === "oidc") {
      container.innerHTML =
        "<form id='app-oidc-form'>" +
          "<div class='bic-form-group'>" +
            "<label class='bic-label'>Client ID (OAuth 2.0 / OIDC)</label>" +
            "<div class='bic-input-group' style='display:flex;gap:0.5rem;'>" +
              "<input class='bic-control' value='" + esc(app.client_id || app.code.toLowerCase()) + "' readonly style='background:#f8fafc;font-family:monospace;'>" +
              "<button type='button' class='bic-btn bic-btn-secondary bic-btn-sm' id='copy-client-id-btn'>" + icon("copy") + " Copy</button>" +
            "</div>" +
            "<span class='bic-help'>Unique identifier passed in authorization and token requests.</span>" +
          "</div>" +

          "<div class='bic-form-group'>" +
            "<label class='bic-label'>Client Secret</label>" +
            "<div class='bic-input-group' style='display:flex;gap:0.5rem;align-items:center;'>" +
              "<input class='bic-control' id='client-secret-field' value='" + (app.has_client_secret ? "••••••••••••••••••••••••••••••••" : "No secret generated") + "' readonly style='background:#f8fafc;font-family:monospace;'>" +
              "<button type='button' class='bic-btn bic-btn-warning bic-btn-sm' id='regen-secret-btn'>" + icon("refresh") + " Regenerate</button>" +
            "</div>" +
            "<div id='new-secret-alert' class='bic-alert bic-alert-warning bic-hidden' style='margin-top:0.5rem;font-size:0.8rem;'></div>" +
            "<span class='bic-help'>Used for confidential client token exchanges. Never expose in frontend/SPA clients.</span>" +
          "</div>" +

          "<div class='bic-grid-2' style='gap:1rem;margin-bottom:1rem;'>" +
            "<div class='bic-form-group' style='margin-bottom:0;'>" +
              "<label class='bic-label' for='app-client-type'>Client Type</label>" +
              "<select class='bic-select' id='app-client-type'>" +
                "<option value='confidential' " + (app.client_type === "confidential" ? "selected" : "") + ">Confidential (Server-side Web App)</option>" +
                "<option value='public' " + (app.client_type === "public" ? "selected" : "") + ">Public (SPA / Mobile App)</option>" +
              "</select>" +
            "</div>" +
            "<div class='bic-form-group' style='margin-bottom:0;'>" +
              "<label class='bic-label' for='app-status-sel'>Application Status</label>" +
              "<select class='bic-select' id='app-status-sel'>" +
                "<option value='active' " + (app.status === "active" ? "selected" : "") + ">Active</option>" +
                "<option value='disabled' " + (app.status === "disabled" ? "selected" : "") + ">Disabled</option>" +
              "</select>" +
            "</div>" +
          "</div>" +

          "<div class='bic-grid-2' style='gap:1rem;margin-bottom:1rem;'>" +
            "<div class='bic-form-group' style='margin-bottom:0;'>" +
              "<label class='bic-label' for='app-access-lifetime'>Access Token Lifetime (seconds)</label>" +
              "<input class='bic-control' type='number' id='app-access-lifetime' value='" + (app.access_token_lifetime || 3600) + "' min='60' max='86400'>" +
            "</div>" +
            "<div class='bic-form-group' style='margin-bottom:0;'>" +
              "<label class='bic-label' for='app-id-lifetime'>ID Token Lifetime (seconds)</label>" +
              "<input class='bic-control' type='number' id='app-id-lifetime' value='" + (app.id_token_lifetime || 3600) + "' min='60' max='86400'>" +
            "</div>" +
          "</div>" +

          "<div class='bic-form-group'>" +
            "<label class='bic-label'>Consent Screen</label>" +
            "<label class='bic-table-check'><input type='checkbox' id='app-require-consent' " + (app.require_consent ? "checked" : "") + "><span>Prompt users for consent on first login</span></label>" +
          "</div>" +

          "<div style='display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1.5rem;'>" +
            "<button type='submit' class='bic-btn bic-btn-primary'>Save OIDC Settings</button>" +
          "</div>" +
        "</form>";

      $("copy-client-id-btn").onclick = () => {
        navigator.clipboard.writeText(app.client_id || app.code.toLowerCase());
        showToast("Client ID copied to clipboard");
      };

      $("regen-secret-btn").onclick = async () => {
        if (!confirm("Regenerating the client secret will invalidate the existing secret immediately. Integrated services using the old secret will fail until updated. Continue?")) return;
        try {
          const res = await api("/v1/admin/applications/" + app.id + "/regenerate-secret", { method: "POST" });
          $("client-secret-field").value = res.client_secret;
          $("new-secret-alert").innerHTML = "<strong>New Client Secret Generated:</strong><br><code style='user-select:all;'>" + esc(res.client_secret) + "</code><br><small>Copy and store this secret securely. It will not be shown again.</small>";
          $("new-secret-alert").classList.remove("bic-hidden");
          showToast("Client secret regenerated successfully");
          app.has_client_secret = true;
        } catch (err) { showToast(err.message, true); }
      };

      $("app-oidc-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api("/v1/admin/applications/" + app.id, {
            method: "PUT",
            body: JSON.stringify({
              client_type: $("app-client-type").value,
              status: $("app-status-sel").value,
              access_token_lifetime: parseInt($("app-access-lifetime").value, 10),
              id_token_lifetime: parseInt($("app-id-lifetime").value, 10),
              require_consent: $("app-require-consent").checked,
            })
          });
          showToast("OIDC configuration updated");
          closeModal();
          await renderApplications();
        } catch (err) { showToast(err.message, true); }
      };

    } else if (activeTab === "uris") {
      const uris = app.redirect_uris || [];
      container.innerHTML =
        "<p class='bic-muted' style='font-size:0.8125rem;margin-top:0;'>Exact URL matching is enforced. Wildcards (<code>*</code>) and fragments (<code>#</code>) are rejected per RFC 6749 and OIDC Core 1.0.</p>" +
        "<form id='add-uri-form' style='display:flex;gap:0.5rem;margin-bottom:1rem;'>" +
          "<input class='bic-control' id='new-redirect-uri' placeholder='e.g. http://localhost:8081/auth/callback' required style='flex:1;'>" +
          "<button type='submit' class='bic-btn bic-btn-primary bic-btn-sm'>" + icon("plus") + " Add URI</button>" +
        "</form>" +
        "<div class='bic-table-wrap'>" +
          "<table class='bic-table' style='font-size:0.8125rem;'>" +
            "<thead><tr><th>Allowed Callback / Redirect URI</th><th>Added</th><th class='bic-text-right'>Action</th></tr></thead>" +
            "<tbody>" +
              (uris.length ? uris.map((u) =>
                "<tr>" +
                  "<td><code>" + esc(u.uri) + "</code></td>" +
                  "<td>" + (u.created_at ? new Date(u.created_at).toLocaleDateString() : "—") + "</td>" +
                  "<td class='bic-text-right'><button class='bic-btn bic-btn-danger bic-btn-sm' data-del-uri='" + esc(u.id) + "' style='padding:0.2rem 0.5rem;font-size:0.7rem;'>Remove</button></td>" +
                "</tr>"
              ).join("") : "<tr><td colspan='3' class='bic-empty'>No redirect URIs registered. This client cannot initiate OIDC authorization flows until a valid callback URL is added.</td></tr>") +
            "</tbody>" +
          "</table>" +
        "</div>";

      $("add-uri-form").onsubmit = async (e) => {
        e.preventDefault();
        const uri = $("new-redirect-uri").value.trim();
        try {
          const res = await api("/v1/admin/applications/" + app.id + "/redirect-uris", {
            method: "POST",
            body: JSON.stringify({ uri })
          });
          if (!app.redirect_uris) app.redirect_uris = [];
          app.redirect_uris.push(res);
          showToast("Redirect URI registered");
          renderModal();
        } catch (err) { showToast(err.message, true); }
      };

      document.querySelectorAll("[data-del-uri]").forEach((btn) => {
        btn.onclick = async () => {
          const uid = btn.dataset.delUri;
          try {
            await api("/v1/admin/applications/" + app.id + "/redirect-uris/" + uid, { method: "DELETE" });
            app.redirect_uris = (app.redirect_uris || []).filter((u) => u.id !== uid);
            showToast("Redirect URI removed");
            renderModal();
          } catch (err) { showToast(err.message, true); }
        };
      });
    }
  };

  renderModal();
}

const rbacState = {
  activeTab: "roles",
  searchQuery: "",
  appFilter: "",
  typeFilter: "",
  matrixApp: "",
};

async function renderRBAC() {
  const [applications, roles, permissions, users] = await Promise.all([
    api("/v1/admin/applications"),
    api("/v1/admin/roles"),
    api("/v1/admin/permissions"),
    api("/v1/admin/users")
  ]);

  if (!rbacState.matrixApp && applications.length > 0) {
    const defaultApp = applications.find(a => a.code === "HELPDESK") || applications[0];
    rbacState.matrixApp = defaultApp.code;
  }

  const appOptions = "<option value=''>All Applications</option>" + applications.map((a) => "<option value='" + esc(a.code) + "' " + (rbacState.appFilter === a.code ? "selected" : "") + ">" + esc(a.name) + " (" + esc(a.code) + ")</option>").join("");

  $("section-rbac").innerHTML =
    "<div class='bic-page-header'>" +
      "<div>" +
        "<p class='bic-kicker'>AUTHORIZATION &amp; ACCESS CONTROL</p>" +
        "<h2 class='bic-page-title'>Roles &amp; permissions</h2>" +
        "<p class='bic-page-subtitle'>Manage application roles, organizational roles, permission matrices, and user privilege assignments across the enterprise.</p>" +
      "</div>" +
      "<div class='bic-action-row'>" +
        "<button id='rbac-new-role' class='bic-btn bic-btn-primary bic-btn-sm'>" + icon("plus") + " New role</button>" +
        "<button id='rbac-new-perm' class='bic-btn bic-btn-secondary bic-btn-sm'>" + icon("plus") + " New permission</button>" +
      "</div>" +
    "</div>" +

    "<nav class='bic-nav-tabs' role='tablist'>" +
      "<button class='bic-tab-item " + (rbacState.activeTab === "roles" ? "is-active" : "") + "' data-rbac-tab='roles'>" + icon("shield") + "<span>Roles</span><span class='bic-tab-badge'>" + roles.length + "</span></button>" +
      "<button class='bic-tab-item " + (rbacState.activeTab === "matrix" ? "is-active" : "") + "' data-rbac-tab='matrix'>" + icon("matrix") + "<span>Permission Matrix</span></button>" +
      "<button class='bic-tab-item " + (rbacState.activeTab === "permissions" ? "is-active" : "") + "' data-rbac-tab='permissions'>" + icon("key") + "<span>Permissions Catalog</span><span class='bic-tab-badge'>" + permissions.length + "</span></button>" +
      "<button class='bic-tab-item " + (rbacState.activeTab === "org_roles" ? "is-active" : "") + "' data-rbac-tab='org_roles'>" + icon("users") + "<span>Organizational Roles</span><span class='bic-tab-badge'>4 Tiers</span></button>" +
    "</nav>" +

    "<div id='rbac-tab-content'></div>";

  // Attach Tab navigation handlers
  document.querySelectorAll("[data-rbac-tab]").forEach((btn) => {
    btn.onclick = () => {
      rbacState.activeTab = btn.dataset.rbacTab;
      renderRBACTabContent(applications, roles, permissions, users);
      document.querySelectorAll("[data-rbac-tab]").forEach((b) => b.classList.toggle("is-active", b.dataset.rbacTab === rbacState.activeTab));
    };
  });

  $("rbac-new-role").onclick = () => openRoleForm(null, applications, permissions);
  $("rbac-new-perm").onclick = () => openPermissionForm(applications);

  renderRBACTabContent(applications, roles, permissions, users);
}

function renderRBACTabContent(applications, roles, permissions, users) {
  const container = $("rbac-tab-content");
  if (!container) return;

  if (rbacState.activeTab === "roles") {
    renderRBACRolesView(container, applications, roles, permissions, users);
  } else if (rbacState.activeTab === "matrix") {
    renderRBACMatrixView(container, applications, roles, permissions);
  } else if (rbacState.activeTab === "permissions") {
    renderRBACPermissionsView(container, applications, permissions, roles);
  } else if (rbacState.activeTab === "org_roles") {
    renderRBACOrgRolesView(container, users);
  }
}

function renderRBACRolesView(container, applications, roles, permissions, users) {
  const appOptions = "<option value=''>All Applications</option>" + applications.map((a) => "<option value='" + esc(a.code) + "' " + (rbacState.appFilter === a.code ? "selected" : "") + ">" + esc(a.name) + "</option>").join("");
  const typeOptions =
    "<option value=''>All Types</option>" +
    "<option value='application' " + (rbacState.typeFilter === "application" ? "selected" : "") + ">Application Roles</option>" +
    "<option value='system' " + (rbacState.typeFilter === "system" ? "selected" : "") + ">System Roles</option>" +
    "<option value='organizational' " + (rbacState.typeFilter === "organizational" ? "selected" : "") + ">Organizational Roles</option>";

  container.innerHTML =
    "<div class='bic-card bic-panel'>" +
      "<div class='bic-table-toolbar'>" +
        "<div class='bic-toolbar-filter-group'>" +
          "<div class='bic-search-input-wrap'>" +
            "<svg class='bic-search-icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>" +
            "<input class='bic-control bic-search-control' id='rbac-role-search' type='search' placeholder='Search roles, description, permissions...' value='" + esc(rbacState.searchQuery) + "' aria-label='Search roles'>" +
          "</div>" +
          "<select class='bic-select bic-filter-select' id='rbac-role-app-filter' aria-label='Filter by application'>" + appOptions + "</select>" +
          "<select class='bic-select bic-filter-select' id='rbac-role-type-filter' aria-label='Filter by type'>" + typeOptions + "</select>" +
        "</div>" +
        "<div class='bic-toolbar-meta'>" +
          "<span class='bic-badge bic-badge-info' id='rbac-filtered-count'>" + roles.length + " roles</span>" +
        "</div>" +
      "</div>" +
      "<div class='bic-table-wrap'>" +
        "<table class='bic-table bic-sortable' id='rbac-roles-table'>" +
          "<thead>" +
            "<tr>" +
              "<th>Role Name</th>" +
              "<th>Application</th>" +
              "<th>Type</th>" +
              "<th>Permissions</th>" +
              "<th>Assigned Users</th>" +
              "<th data-sortable='false' class='bic-text-right'>Actions</th>" +
            "</tr>" +
          "</thead>" +
          "<tbody id='rbac-roles-tbody'></tbody>" +
        "</table>" +
      "</div>" +
    "</div>";

  const renderRows = () => {
    const query = (rbacState.searchQuery || "").trim().toLowerCase();
    const appF = (rbacState.appFilter || "").trim().toLowerCase();
    const typeF = (rbacState.typeFilter || "").trim().toLowerCase();

    const filtered = roles.filter((r) => {
      const haystack = [r.name, r.description || "", r.application_code, r.role_type, ...(r.permissions || [])].join(" ").toLowerCase();
      const matchQuery = !query || haystack.includes(query);
      const matchApp = !appF || (r.application_code || "").toLowerCase() === appF;
      const matchType = !typeF || (r.role_type || "").toLowerCase() === typeF;
      return matchQuery && matchApp && matchType;
    });

    $("rbac-filtered-count").textContent = filtered.length + " role" + (filtered.length === 1 ? "" : "s");

    $("rbac-roles-tbody").innerHTML = filtered.length ? filtered.map((r) => {
      const typeBadge = r.is_system
        ? "<span class='bic-badge bic-badge-dark' title='Protected system-level role'>System</span>"
        : (r.role_type === "organizational"
            ? "<span class='bic-badge bic-badge-purple' title='Central Auth Governance role'>Organizational</span>"
            : "<span class='bic-badge bic-badge-info' title='Application feature role'>Application</span>");

      const permBadge = "<span class='bic-badge bic-badge-primary' title='" + esc(r.permissions.slice(0, 5).join(", ")) + (r.permissions.length > 5 ? "..." : "") + "'>" + r.permission_count + " perms</span>";
      const userBadge = "<span class='bic-badge " + (r.user_count > 0 ? "bic-badge-success" : "bic-badge-warning") + "'>" + r.user_count + " user" + (r.user_count === 1 ? "" : "s") + "</span>";

      return "<tr>" +
        "<td>" +
          "<div class='bic-user-names'>" +
            "<strong class='bic-user-name-title'>" + esc(r.name) + "</strong>" +
            "<span class='bic-user-handle'>" + esc(r.description || "No description provided.") + "</span>" +
          "</div>" +
        "</td>" +
        "<td><span class='bic-app-tag'>" + esc(r.application_code) + "</span></td>" +
        "<td>" + typeBadge + "</td>" +
        "<td>" + permBadge + "</td>" +
        "<td>" + userBadge + "</td>" +
        "<td class='bic-text-right'>" +
          "<div class='bic-action-row bic-justify-end'>" +
            "<button class='bic-icon-action' data-role-details='" + esc(r.id) + "' title='View role details & permissions' aria-label='View role details'>" + icon("eye") + "</button>" +
            "<button class='bic-icon-action' data-role-edit='" + esc(r.id) + "' title='Edit role definition' aria-label='Edit role'>" + icon("edit") + "</button>" +
            "<button class='bic-icon-action' data-role-clone='" + esc(r.id) + "' title='Clone role' aria-label='Clone role'>" + icon("copy") + "</button>" +
            "<button class='bic-icon-action bic-icon-action-danger' data-role-delete='" + esc(r.id) + "' " + (r.is_system ? "disabled title='System roles cannot be deleted'" : "title='Delete role'") + " aria-label='Delete role'>" + icon("trash") + "</button>" +
          "</div>" +
        "</td>" +
      "</tr>";
    }).join("") : "<tr><td colspan='6' class='bic-empty'>No roles match the search criteria.</td></tr>";

    // Bind action buttons
    document.querySelectorAll("[data-role-details]").forEach((b) => b.onclick = () => openRoleDetailsModal(b.dataset.roleDetails, applications, permissions, users));
    document.querySelectorAll("[data-role-edit]").forEach((b) => {
      b.onclick = () => {
        const role = roles.find((r) => r.id === b.dataset.roleEdit);
        if (role) openRoleForm(role, applications, permissions);
      };
    });
    document.querySelectorAll("[data-role-clone]").forEach((b) => {
      b.onclick = () => {
        const role = roles.find((r) => r.id === b.dataset.roleClone);
        if (role) openRoleForm(role, applications, permissions, true);
      };
    });
    document.querySelectorAll("[data-role-delete]").forEach((b) => {
      b.onclick = () => {
        const role = roles.find((r) => r.id === b.dataset.roleDelete);
        if (role) deleteRole(role.id, role.name, role.is_system);
      };
    });
  };

  $("rbac-role-search").oninput = (e) => { rbacState.searchQuery = e.target.value; renderRows(); };
  $("rbac-role-app-filter").onchange = (e) => { rbacState.appFilter = e.target.value; renderRows(); };
  $("rbac-role-type-filter").onchange = (e) => { rbacState.typeFilter = e.target.value; renderRows(); };

  renderRows();
  enableTableSorting($("rbac-roles-table"));
}

function renderRBACMatrixView(container, applications, roles, permissions) {
  const currentApp = applications.find((a) => a.code === rbacState.matrixApp) || applications[0];
  if (!currentApp) {
    container.innerHTML = "<div class='bic-empty'>No applications configured.</div>";
    return;
  }

  const appRoles = roles.filter((r) => r.application_code === currentApp.code);
  const appPerms = permissions.filter((p) => p.application_code === currentApp.code);

  // Group permissions by module
  const moduleGroups = {};
  appPerms.forEach((p) => {
    const mod = p.module || "General";
    if (!moduleGroups[mod]) moduleGroups[mod] = [];
    moduleGroups[mod].push(p);
  });

  const appPills = applications.map((a) =>
    "<button class='bic-btn " + (a.code === currentApp.code ? "bic-btn-primary" : "bic-btn-secondary") + " bic-btn-sm' data-matrix-app='" + esc(a.code) + "'>" +
      esc(a.name) + " (" + esc(a.code) + ")" +
    "</button>"
  ).join(" ");

  container.innerHTML =
    "<div class='bic-card bic-panel'>" +
      "<div class='bic-table-toolbar'>" +
        "<div>" +
          "<h3 class='bic-section-title'>Permission Matrix — " + esc(currentApp.name) + "</h3>" +
          "<span class='bic-muted'>Cross-tabulation of roles vs. granted permission flags</span>" +
        "</div>" +
        "<div class='bic-action-row'>" + appPills + "</div>" +
      "</div>" +
      "<div class='bic-matrix-wrap'>" +
        "<table class='bic-matrix-table'>" +
          "<thead>" +
            "<tr>" +
              "<th class='bic-matrix-sticky-col' style='min-width:280px;'>Permission / Module</th>" +
              appRoles.map((r) => "<th class='bic-text-center' style='min-width:120px;'>" + esc(r.name) + "</th>").join("") +
            "</tr>" +
          "</thead>" +
          "<tbody>" +
            (Object.keys(moduleGroups).length ? Object.entries(moduleGroups).map(([modName, perms]) => {
              const headerRow = "<tr class='bic-matrix-module-row'><td colspan='" + (appRoles.length + 1) + "'>" + esc(modName) + " (" + perms.length + ")</td></tr>";
              const permRows = perms.map((p) => {
                return "<tr>" +
                  "<td class='bic-matrix-sticky-col'>" +
                    "<div><code>" + esc(p.code) + "</code></div>" +
                    "<small class='bic-muted'>" + esc(p.description || "") + "</small>" +
                  "</td>" +
                  appRoles.map((r) => {
                    const hasPerm = (r.permissions || []).includes(p.code);
                    return "<td class='bic-matrix-cell'>" + (hasPerm ? "<span class='bic-matrix-check'>✓</span>" : "<span class='bic-matrix-dash'>—</span>") + "</td>";
                  }).join("") +
                "</tr>";
              }).join("");
              return headerRow + permRows;
            }).join("") : "<tr><td colspan='" + (appRoles.length + 1) + "' class='bic-empty'>No permissions defined for " + esc(currentApp.name) + ".</td></tr>") +
          "</tbody>" +
        "</table>" +
      "</div>" +
    "</div>";

  document.querySelectorAll("[data-matrix-app]").forEach((btn) => {
    btn.onclick = () => {
      rbacState.matrixApp = btn.dataset.matrixApp;
      renderRBACMatrixView(container, applications, roles, permissions);
    };
  });
}

function renderRBACPermissionsView(container, applications, permissions, roles) {
  container.innerHTML =
    "<div class='bic-card bic-panel'>" +
      "<div class='bic-table-toolbar'>" +
        "<div class='bic-toolbar-filter-group'>" +
          "<div class='bic-search-input-wrap'>" +
            "<svg class='bic-search-icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>" +
            "<input class='bic-control bic-search-control' id='rbac-perm-search' type='search' placeholder='Search permission code, module, description...' aria-label='Search permissions'>" +
          "</div>" +
        "</div>" +
        "<div class='bic-toolbar-meta'>" +
          "<span class='bic-badge bic-badge-info'>" + permissions.length + " permissions</span>" +
        "</div>" +
      "</div>" +
      "<div class='bic-table-wrap'>" +
        "<table class='bic-table bic-sortable' id='rbac-perms-table'>" +
          "<thead>" +
            "<tr>" +
              "<th>Permission Code</th>" +
              "<th>Module</th>" +
              "<th>Application</th>" +
              "<th>Description</th>" +
              "<th>Granted in Roles</th>" +
            "</tr>" +
          "</thead>" +
          "<tbody id='rbac-perms-tbody'></tbody>" +
        "</table>" +
      "</div>" +
    "</div>";

  const renderRows = () => {
    const query = ($("rbac-perm-search")?.value || "").trim().toLowerCase();
    const filtered = permissions.filter((p) => {
      const haystack = [p.code, p.module || "", p.application_code || "", p.description || "", ...(p.roles || [])].join(" ").toLowerCase();
      return !query || haystack.includes(query);
    });

    $("rbac-perms-tbody").innerHTML = filtered.length ? filtered.map((p) => {
      const roleBadges = (p.roles || []).length ? p.roles.map((r) => "<span class='bic-badge bic-badge-primary'>" + esc(r) + "</span>").join(" ") : "<span class='bic-muted'>None</span>";
      return "<tr>" +
        "<td><code>" + esc(p.code) + "</code></td>" +
        "<td><span class='bic-badge bic-badge-info'>" + esc(p.module || "General") + "</span></td>" +
        "<td><span class='bic-app-tag'>" + esc(p.application_code) + "</span></td>" +
        "<td>" + esc(p.description || "—") + "</td>" +
        "<td><div class='bic-action-row'>" + roleBadges + "</div></td>" +
      "</tr>";
    }).join("") : "<tr><td colspan='5' class='bic-empty'>No permissions match query.</td></tr>";
  };

  $("rbac-perm-search").oninput = renderRows;
  renderRows();
  enableTableSorting($("rbac-perms-table"));
}

function renderRBACOrgRolesView(container, users) {
  const tiers = [
    {
      key: "system_administrator",
      title: "System Administrator",
      badge: "<span class='bic-badge bic-badge-purple'>System Administrator</span>",
      icon: "shield",
      desc: "Super administrator holding full root permissions across Central Auth, system configurations, and security bypass authorities.",
      users: users.filter((u) => u.is_superadmin || u.org_role === "system_administrator"),
    },
    {
      key: "general_manager",
      title: "General Manager",
      badge: "<span class='bic-badge bic-badge-warning'>General Manager</span>",
      icon: "users",
      desc: "Executive authority designated for second-level and cross-division ticket approvals, budget sign-offs, and company-wide workflows.",
      users: users.filter((u) => (u.position?.is_general_manager || u.org_role === "general_manager") && !u.is_superadmin),
    },
    {
      key: "manager",
      title: "Manager",
      badge: "<span class='bic-badge bic-badge-primary'>Manager</span>",
      icon: "users",
      desc: "Division or Department manager responsible for first-level operational ticket approvals and direct report supervisions.",
      users: users.filter((u) => (u.position?.is_manager && !u.position?.is_general_manager || u.org_role === "manager") && !u.is_superadmin),
    },
    {
      key: "employee",
      title: "Standard Employee",
      badge: "<span class='bic-badge bic-badge-info'>Employee</span>",
      icon: "users",
      desc: "Standard corporate contributor permitted to create requests, view personal tickets, and consume authorized company applications.",
      users: users.filter((u) => !u.is_superadmin && !u.position?.is_manager && !u.position?.is_general_manager && u.org_role !== "general_manager" && u.org_role !== "manager"),
    }
  ];

  container.innerHTML =
    "<div class='bic-grid-2'>" +
      tiers.map((t) => {
        const userList = t.users.slice(0, 8).map((u) =>
          "<div class='bic-user-chip' style='margin-bottom:0.5rem;'>" +
            "<div class='bic-user-avatar bic-user-avatar-sm'>" + esc(getInitials(u.full_name || u.username)) + "</div>" +
            "<div>" +
              "<strong class='bic-user-name'>" + esc(u.full_name) + "</strong>" +
              "<small class='bic-muted'>" + esc(u.position?.name || u.division?.name || "@" + u.username) + "</small>" +
            "</div>" +
          "</div>"
        ).join("") || "<span class='bic-muted'>No users assigned to this tier.</span>";

        return "<div class='bic-card bic-panel'>" +
          "<div class='bic-table-toolbar' style='margin-bottom:0.75rem;'>" +
            "<div class='bic-action-row'>" + icon(t.icon) + "<strong style='font-size:1.05rem;'>" + esc(t.title) + "</strong></div>" +
            t.badge +
          "</div>" +
          "<p class='bic-muted' style='font-size:0.8125rem;margin-bottom:1rem;line-height:1.4;'>" + esc(t.desc) + "</p>" +
          "<div style='border-top:1px solid var(--bic-border);padding-top:0.75rem;'>" +
            "<div style='font-size:0.75rem;font-weight:600;text-transform:uppercase;color:var(--bic-text-secondary);margin-bottom:0.5rem;letter-spacing:0.04em;'>Assigned Users (" + t.users.length + ")</div>" +
            userList +
            (t.users.length > 8 ? "<small class='bic-muted'>+ " + (t.users.length - 8) + " more users</small>" : "") +
          "</div>" +
        "</div>";
      }).join("") +
    "</div>";
}

async function openRoleDetailsModal(roleId, applications, allPermissions, allUsers) {
  try {
    const role = await api("/v1/admin/roles/" + roleId);
    let modalTab = "overview";

    const renderModalBody = () => {
      const modalBody = $("role-modal-body-container");
      if (!modalBody) return;

      if (modalTab === "overview") {
        modalBody.innerHTML =
          "<div class='bic-role-stat-grid'>" +
            "<div class='bic-role-stat-card'>" +
              "<span class='bic-role-stat-label'>Application</span>" +
              "<span class='bic-role-stat-val'>" + esc(role.application_code) + "</span>" +
            "</div>" +
            "<div class='bic-role-stat-card'>" +
              "<span class='bic-role-stat-label'>Granted Permissions</span>" +
              "<span class='bic-role-stat-val'>" + role.permission_count + "</span>" +
            "</div>" +
            "<div class='bic-role-stat-card'>" +
              "<span class='bic-role-stat-label'>Assigned Users</span>" +
              "<span class='bic-role-stat-val'>" + role.user_count + "</span>" +
            "</div>" +
          "</div>" +
          "<div class='bic-form-group'>" +
            "<label class='bic-label'>Role Description</label>" +
            "<p class='bic-muted' style='margin:0;line-height:1.5;'>" + esc(role.description || "No description provided.") + "</p>" +
          "</div>" +
          "<div class='bic-form-group'>" +
            "<label class='bic-label'>Role Metadata</label>" +
            "<table class='bic-table' style='font-size:0.8rem;'>" +
              "<tr><td style='width:30%;font-weight:600;'>Role ID</td><td><code>" + esc(role.id) + "</code></td></tr>" +
              "<tr><td style='font-weight:600;'>Application Code</td><td><span class='bic-app-tag'>" + esc(role.application_code) + "</span></td></tr>" +
              "<tr><td style='font-weight:600;'>Role Type</td><td>" + (role.is_system ? "<span class='bic-badge bic-badge-dark'>System Protected</span>" : "<span class='bic-badge bic-badge-info'>Application Scoped</span>") + "</td></tr>" +
              "<tr><td style='font-weight:600;'>Created At</td><td>" + (role.created_at ? new Date(role.created_at).toLocaleString() : "—") + "</td></tr>" +
            "</table>" +
          "</div>";
      } else if (modalTab === "permissions") {
        // Group permissions by module
        const moduleGroups = {};
        role.permissions.forEach((p) => {
          const mod = p.module || "General";
          if (!moduleGroups[mod]) moduleGroups[mod] = [];
          moduleGroups[mod].push(p);
        });

        modalBody.innerHTML = Object.keys(moduleGroups).length ? Object.entries(moduleGroups).map(([modName, perms]) => {
          return "<div class='bic-perm-module-card'>" +
            "<div class='bic-perm-module-header'>" +
              "<span class='bic-perm-module-title'>" + icon("shield") + esc(modName) + "</span>" +
              "<span class='bic-badge bic-badge-primary'>" + perms.length + " granted</span>" +
            "</div>" +
            "<div class='bic-perm-grid'>" +
              perms.map((p) =>
                "<div class='bic-perm-item' style='cursor:default;'>" +
                  "<span class='bic-matrix-check' style='flex-shrink:0;'>✓</span>" +
                  "<div class='bic-perm-item-content'>" +
                    "<span class='bic-perm-item-code'>" + esc(p.code) + "</span>" +
                    "<span class='bic-perm-item-desc'>" + esc(p.description || "") + "</span>" +
                  "</div>" +
                "</div>"
              ).join("") +
            "</div>" +
          "</div>";
        }).join("") : "<div class='bic-empty'>No permissions currently assigned to this role.</div>";
      } else if (modalTab === "users") {
        modalBody.innerHTML =
          "<div class='bic-table-toolbar' style='margin-bottom:0.75rem;'>" +
            "<span class='bic-muted'>" + role.users.length + " assigned user" + (role.users.length === 1 ? "" : "s") + "</span>" +
            "<button id='assign-users-btn' class='bic-btn bic-btn-primary bic-btn-sm'>" + icon("plus") + " Assign users</button>" +
          "</div>" +
          "<div class='bic-table-wrap'>" +
            "<table class='bic-table' style='font-size:0.8rem;'>" +
              "<thead><tr><th>User</th><th>Employee ID</th><th>Division / Position</th><th>Status</th><th class='bic-text-right'>Action</th></tr></thead>" +
              "<tbody>" +
                (role.users.length ? role.users.map((u) =>
                  "<tr>" +
                    "<td>" +
                      "<div class='bic-user-chip'>" +
                        "<div class='bic-user-avatar bic-user-avatar-sm'>" + esc(getInitials(u.full_name || u.username)) + "</div>" +
                        "<div><strong>" + esc(u.full_name) + "</strong><small class='bic-muted'>@" + esc(u.username) + "</small></div>" +
                      "</div>" +
                    "</td>" +
                    "<td>" + esc(u.employee_id || "—") + "</td>" +
                    "<td>" + esc(u.division_name || "—") + " / " + esc(u.position_name || "—") + "</td>" +
                    "<td>" + statusBadge(u.status) + "</td>" +
                    "<td class='bic-text-right'>" +
                      "<button class='bic-btn bic-btn-danger bic-btn-sm' data-remove-user-role='" + esc(u.id) + "' style='padding:0.2rem 0.5rem;font-size:0.7rem;'>Remove</button>" +
                    "</td>" +
                  "</tr>"
                ).join("") : "<tr><td colspan='5' class='bic-empty'>No users assigned to this role yet.</td></tr>") +
              "</tbody>" +
            "</table>" +
          "</div>";

        $("assign-users-btn").onclick = () => openAssignUsersToRoleModal(role, allUsers, applications, allPermissions);
        document.querySelectorAll("[data-remove-user-role]").forEach((btn) => {
          btn.onclick = async () => {
            const uid = btn.dataset.removeUserRole;
            try {
              await api("/v1/admin/roles/" + role.id + "/users/" + uid, { method: "DELETE" });
              showToast("User removed from role");
              openRoleDetailsModal(role.id, applications, allPermissions, allUsers);
              await renderRBAC();
            } catch (err) { showToast(err.message, true); }
          };
        });
      }
    };

    $("modal-root").innerHTML =
      "<div class='bic-modal-backdrop is-open' role='presentation'>" +
        "<div class='bic-modal bic-role-modal' role='dialog' aria-modal='true' aria-labelledby='role-detail-title'>" +
          "<div class='bic-modal-header'>" +
            "<div class='bic-action-row'>" +
              "<div class='bic-stat-icon-wrap bic-stat-icon-total' style='width:36px;height:36px;'>" + icon("shield") + "</div>" +
              "<div>" +
                "<div class='bic-action-row' style='gap:0.35rem;'>" +
                  "<span class='bic-app-tag'>" + esc(role.application_code) + "</span>" +
                  (role.is_system ? "<span class='bic-badge bic-badge-dark'>System</span>" : "") +
                "</div>" +
                "<h3 id='role-detail-title' style='margin:0.2rem 0 0;font-size:1.15rem;'>" + esc(role.name) + "</h3>" +
              "</div>" +
            "</div>" +
            "<div class='bic-action-row'>" +
              "<button class='bic-btn bic-btn-secondary bic-btn-sm' id='modal-edit-role-btn'>" + icon("edit") + " Edit</button>" +
              "<button class='bic-icon-button' data-close-modal aria-label='Close'>✕</button>" +
            "</div>" +
          "</div>" +

          "<div class='bic-modal-tabs'>" +
            "<button class='bic-modal-tab is-active' data-role-modal-tab='overview'>" + icon("info") + " Overview</button>" +
            "<button class='bic-modal-tab' data-role-modal-tab='permissions'>" + icon("key") + " Permissions (" + role.permission_count + ")</button>" +
            "<button class='bic-modal-tab' data-role-modal-tab='users'>" + icon("users") + " Assigned Users (" + role.user_count + ")</button>" +
          "</div>" +

          "<div class='bic-modal-body' id='role-modal-body-container'></div>" +

          "<div class='bic-modal-footer'>" +
            "<button type='button' class='bic-btn bic-btn-secondary' data-close-modal>Close</button>" +
          "</div>" +
        "</div>" +
      "</div>";

    document.querySelectorAll("[data-close-modal]").forEach((b) => b.onclick = closeModal);

    document.querySelectorAll("[data-role-modal-tab]").forEach((btn) => {
      btn.onclick = () => {
        modalTab = btn.dataset.roleModalTab;
        document.querySelectorAll("[data-role-modal-tab]").forEach((b) => b.classList.toggle("is-active", b.dataset.roleModalTab === modalTab));
        renderModalBody();
      };
    });

    $("modal-edit-role-btn").onclick = () => {
      closeModal();
      openRoleForm(role, applications, allPermissions);
    };

    renderModalBody();
  } catch (err) { showToast(err.message, true); }
}

function openRoleForm(role = null, applications = [], allPermissions = [], isClone = false) {
  const editing = Boolean(role) && !isClone;
  const cloning = Boolean(role) && isClone;
  const currentAppCode = role ? role.application_code : (applications[0]?.code || "CENTRAL_AUTH");

  let selectedPermIds = new Set(role ? (role.permission_ids || []) : []);
  let activeAppCode = currentAppCode;

  const title = cloning ? "Clone role: " + esc(role.name) : (editing ? "Edit role: " + esc(role.name) : "Create new role");
  const initialName = cloning ? role.name + " Copy" : (role?.name || "");
  const initialDesc = cloning ? (role.description ? role.description + " (Copy)" : "") : (role?.description || "");

  const renderFormPermissions = () => {
    const permContainer = $("role-form-perm-container");
    if (!permContainer) return;

    const appPerms = allPermissions.filter((p) => p.application_code === activeAppCode);
    const moduleGroups = {};
    appPerms.forEach((p) => {
      const mod = p.module || "General";
      if (!moduleGroups[mod]) moduleGroups[mod] = [];
      moduleGroups[mod].push(p);
    });

    $("role-form-selected-count").textContent = selectedPermIds.size + " of " + appPerms.length + " permissions selected";

    if (!appPerms.length) {
      permContainer.innerHTML = "<div class='bic-empty'>No permissions defined for application " + esc(activeAppCode) + ".</div>";
      return;
    }

    permContainer.innerHTML = Object.entries(moduleGroups).map(([modName, perms]) => {
      const allSelectedInMod = perms.every((p) => selectedPermIds.has(p.id));
      return "<div class='bic-perm-module-card'>" +
        "<div class='bic-perm-module-header'>" +
          "<span class='bic-perm-module-title'>" + icon("shield") + esc(modName) + " (" + perms.length + ")</span>" +
          "<button type='button' class='bic-btn bic-btn-secondary bic-btn-sm' data-toggle-module='" + esc(modName) + "' style='font-size:0.7rem;padding:0.15rem 0.4rem;'>" + (allSelectedInMod ? "Deselect All" : "Select All") + "</button>" +
        "</div>" +
        "<div class='bic-perm-grid'>" +
          perms.map((p) => {
            const isChecked = selectedPermIds.has(p.id);
            return "<label class='bic-perm-item'>" +
              "<input type='checkbox' data-perm-id='" + esc(p.id) + "' data-perm-module='" + esc(modName) + "' " + (isChecked ? "checked" : "") + ">" +
              "<div class='bic-perm-item-content'>" +
                "<span class='bic-perm-item-code'>" + esc(p.code) + "</span>" +
                "<span class='bic-perm-item-desc'>" + esc(p.description || "") + "</span>" +
              "</div>" +
            "</label>";
          }).join("") +
        "</div>" +
      "</div>";
    }).join("");

    // Attach checkbox changes
    permContainer.querySelectorAll("[data-perm-id]").forEach((cb) => {
      cb.onchange = () => {
        if (cb.checked) selectedPermIds.add(cb.dataset.permId);
        else selectedPermIds.delete(cb.dataset.permId);
        $("role-form-selected-count").textContent = selectedPermIds.size + " of " + appPerms.length + " permissions selected";
      };
    });

    // Attach module toggle
    permContainer.querySelectorAll("[data-toggle-module]").forEach((btn) => {
      btn.onclick = () => {
        const modName = btn.dataset.toggleModule;
        const modPerms = moduleGroups[modName] || [];
        const allSelected = modPerms.every((p) => selectedPermIds.has(p.id));
        modPerms.forEach((p) => {
          if (allSelected) selectedPermIds.delete(p.id);
          else selectedPermIds.add(p.id);
        });
        renderFormPermissions();
      };
    });
  };

  const appOptions = applications.map((a) => "<option value='" + esc(a.code) + "' " + (a.code === activeAppCode ? "selected" : "") + ">" + esc(a.name) + " (" + esc(a.code) + ")</option>").join("");

  $("modal-root").innerHTML =
    "<div class='bic-modal-backdrop is-open' role='presentation'>" +
      "<div class='bic-modal bic-role-modal' role='dialog' aria-modal='true' aria-labelledby='role-form-title'>" +
        "<div class='bic-modal-header'>" +
          "<div>" +
            "<p class='bic-kicker'>ROLE CONFIGURATION</p>" +
            "<h3 id='role-form-title' style='margin:0;font-size:1.15rem;'>" + title + "</h3>" +
          "</div>" +
          "<button class='bic-icon-button' data-close-modal aria-label='Close'>✕</button>" +
        "</div>" +
        "<form id='role-edit-form'>" +
          "<div class='bic-modal-body'>" +
            "<div class='bic-grid-2' style='gap:1rem;margin-bottom:1rem;'>" +
              "<div class='bic-form-group' style='margin-bottom:0;'>" +
                "<label class='bic-label' for='role-f-app'>Target Application</label>" +
                "<select class='bic-select' id='role-f-app' " + (editing ? "disabled" : "required") + ">" + appOptions + "</select>" +
              "</div>" +
              "<div class='bic-form-group' style='margin-bottom:0;'>" +
                "<label class='bic-label' for='role-f-name'>Role Name</label>" +
                "<input class='bic-control' id='role-f-name' required maxlength='80' placeholder='e.g. Helpdesk Supervisor' value='" + esc(initialName) + "'>" +
              "</div>" +
            "</div>" +
            "<div class='bic-form-group'>" +
              "<label class='bic-label' for='role-f-desc'>Role Description</label>" +
              "<input class='bic-control' id='role-f-desc' maxlength='500' placeholder='Define the responsibilities and access privileges granted by this role' value='" + esc(initialDesc) + "'>" +
            "</div>" +
            "<div class='bic-form-group'>" +
              "<div class='bic-table-toolbar' style='margin-bottom:0.5rem;'>" +
                "<label class='bic-label' style='margin:0;'>Permission Assignment</label>" +
                "<span class='bic-badge bic-badge-info' id='role-form-selected-count'>0 selected</span>" +
              "</div>" +
              "<div id='role-form-perm-container' style='max-height:360px;overflow-y:auto;padding-right:0.25rem;'></div>" +
            "</div>" +
          "</div>" +
          "<div class='bic-modal-footer'>" +
            "<button type='button' class='bic-btn bic-btn-secondary' data-close-modal>Cancel</button>" +
            "<button type='submit' class='bic-btn bic-btn-primary'>" + (editing ? "Save changes" : "Create role") + "</button>" +
          "</div>" +
        "</form>" +
      "</div>" +
    "</div>";

  document.querySelectorAll("[data-close-modal]").forEach((b) => b.onclick = closeModal);

  $("role-f-app").onchange = () => {
    activeAppCode = $("role-f-app").value;
    selectedPermIds.clear();
    renderFormPermissions();
  };

  renderFormPermissions();

  $("role-edit-form").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("role-f-name").value.trim();
    const description = $("role-f-desc").value.trim() || null;
    const permission_ids = Array.from(selectedPermIds);

    try {
      if (editing) {
        await api("/v1/admin/roles/" + role.id, {
          method: "PUT",
          body: JSON.stringify({ name, description, permission_ids })
        });
        showToast("Role updated successfully");
      } else if (cloning) {
        await api("/v1/admin/roles/" + role.id + "/clone", {
          method: "POST",
          body: JSON.stringify({ name, description })
        });
        showToast("Role cloned successfully");
      } else {
        await api("/v1/admin/roles", {
          method: "POST",
          body: JSON.stringify({ application_code: activeAppCode, name, description, permission_ids })
        });
        showToast("Role created successfully");
      }
      closeModal();
      await renderRBAC();
    } catch (err) { showToast(err.message, true); }
  };
}

function openAssignUsersToRoleModal(role, allUsers, applications, allPermissions) {
  const assignedUserIds = new Set((role.users || []).map((u) => u.id));
  const activeCandidates = allUsers.filter((u) => u.status === "active");

  $("modal-root").innerHTML =
    "<div class='bic-modal-backdrop is-open' role='presentation'>" +
      "<div class='bic-modal' role='dialog' aria-modal='true' aria-labelledby='assign-title'>" +
        "<div class='bic-modal-header'>" +
          "<div>" +
            "<p class='bic-kicker'>USER ASSIGNMENT</p>" +
            "<h3 id='assign-title' style='margin:0;'>Assign Users to " + esc(role.name) + "</h3>" +
          "</div>" +
          "<button class='bic-icon-button' data-close-modal aria-label='Close'>✕</button>" +
        "</div>" +
        "<form id='assign-users-form'>" +
          "<div class='bic-modal-body'>" +
            "<p class='bic-muted' style='font-size:0.8125rem;margin-top:0;'>Select active directory users to grant the <strong>" + esc(role.name) + "</strong> role.</p>" +
            "<div class='bic-search-input-wrap' style='margin-bottom:0.75rem;'>" +
              "<svg class='bic-search-icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>" +
              "<input class='bic-control bic-search-control' id='assign-user-search' type='search' placeholder='Search name, email, employee ID...'>" +
            "</div>" +
            "<div id='assign-users-list' style='max-height:280px;overflow-y:auto;display:grid;gap:0.35rem;'></div>" +
          "</div>" +
          "<div class='bic-modal-footer'>" +
            "<button type='button' class='bic-btn bic-btn-secondary' data-close-modal>Cancel</button>" +
            "<button type='submit' class='bic-btn bic-btn-primary'>Assign selected</button>" +
          "</div>" +
        "</form>" +
      "</div>" +
    "</div>";

  document.querySelectorAll("[data-close-modal]").forEach((b) => b.onclick = closeModal);

  const renderUserChecklist = () => {
    const q = ($("assign-user-search")?.value || "").trim().toLowerCase();
    const filtered = activeCandidates.filter((u) => {
      const haystack = [u.full_name, u.username, u.email, u.employee_id || ""].join(" ").toLowerCase();
      return !q || haystack.includes(q);
    });

    $("assign-users-list").innerHTML = filtered.length ? filtered.map((u) => {
      const isAssigned = assignedUserIds.has(u.id);
      return "<label class='bic-check-item' style='padding:0.4rem 0.6rem;'>" +
        "<input type='checkbox' data-assign-uid='" + esc(u.id) + "' " + (isAssigned ? "checked" : "") + ">" +
        "<div class='bic-user-chip' style='gap:0.5rem;'>" +
          "<div class='bic-user-avatar bic-user-avatar-sm'>" + esc(getInitials(u.full_name || u.username)) + "</div>" +
          "<div><strong>" + esc(u.full_name) + "</strong><small class='bic-muted'>" + esc(u.employee_id ? u.employee_id + " · " : "") + esc(u.email) + "</small></div>" +
        "</div>" +
      "</label>";
    }).join("") : "<div class='bic-empty'>No users match query.</div>";
  };

  $("assign-user-search").oninput = renderUserChecklist;
  renderUserChecklist();

  $("assign-users-form").onsubmit = async (e) => {
    e.preventDefault();
    const selectedIds = Array.from(document.querySelectorAll("[data-assign-uid]:checked")).map((cb) => cb.dataset.assignUid);
    try {
      await api("/v1/admin/roles/" + role.id + "/users", {
        method: "POST",
        body: JSON.stringify({ user_ids: selectedIds })
      });
      showToast("Users assigned to role");
      closeModal();
      openRoleDetailsModal(role.id, applications, allPermissions, allUsers);
      await renderRBAC();
    } catch (err) { showToast(err.message, true); }
  };
}

function openPermissionForm(applications) {
  const appOptions = applications.map((a) => "<option value='" + esc(a.code) + "'>" + esc(a.name) + " (" + esc(a.code) + ")</option>").join("");

  $("modal-root").innerHTML =
    "<div class='bic-modal-backdrop is-open' role='presentation'>" +
      "<div class='bic-modal' role='dialog' aria-modal='true' aria-labelledby='perm-form-title'>" +
        "<div class='bic-modal-header'>" +
          "<div>" +
            "<p class='bic-kicker'>AUTHORIZATION</p>" +
            "<h3 id='perm-form-title' style='margin:0;'>Create new permission</h3>" +
          "</div>" +
          "<button class='bic-icon-button' data-close-modal aria-label='Close'>✕</button>" +
        "</div>" +
        "<form id='new-perm-form'>" +
          "<div class='bic-modal-body'>" +
            "<div class='bic-form-group'>" +
              "<label class='bic-label' for='new-perm-app'>Application</label>" +
              "<select class='bic-select' id='new-perm-app' required>" + appOptions + "</select>" +
            "</div>" +
            "<div class='bic-form-group'>" +
              "<label class='bic-label' for='new-perm-code'>Permission Code</label>" +
              "<input class='bic-control' id='new-perm-code' required minlength='3' maxlength='160' placeholder='e.g. helpdesk.tickets.export'>" +
              "<span class='bic-help'>Dot-separated hierarchical code (e.g. app.resource.action).</span>" +
            "</div>" +
            "<div class='bic-form-group'>" +
              "<label class='bic-label' for='new-perm-desc'>Description</label>" +
              "<textarea class='bic-control bic-textarea' id='new-perm-desc' maxlength='500' placeholder='Explain the specific capability governed by this permission'></textarea>" +
            "</div>" +
          "</div>" +
          "<div class='bic-modal-footer'>" +
            "<button type='button' class='bic-btn bic-btn-secondary' data-close-modal>Cancel</button>" +
            "<button type='submit' class='bic-btn bic-btn-primary'>Create permission</button>" +
          "</div>" +
        "</form>" +
      "</div>" +
    "</div>";

  document.querySelectorAll("[data-close-modal]").forEach((b) => b.onclick = closeModal);

  $("new-perm-form").onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      application_code: $("new-perm-app").value,
      code: $("new-perm-code").value.trim(),
      description: $("new-perm-desc").value.trim() || null,
    };
    try {
      await api("/v1/admin/permissions", { method: "POST", body: JSON.stringify(body) });
      closeModal();
      showToast("Permission created successfully");
      await renderRBAC();
    } catch (err) { showToast(err.message, true); }
  };
}

async function deleteRole(roleId, roleName, isSystem) {
  if (isSystem) {
    alert("Core system roles (e.g. CENTRAL_SUPERADMIN) cannot be deleted.");
    return;
  }
  if (!confirm("Are you sure you want to delete role '" + roleName + "'? All user assignments and granted permission links for this role will be removed.")) {
    return;
  }
  try {
    await api("/v1/admin/roles/" + roleId, { method: "DELETE" });
    showToast("Role '" + roleName + "' deleted");
    await renderRBAC();
  } catch (err) { showToast(err.message, true); }
}

async function renderAudit() {
  const [logs, applications] = await Promise.all([api("/v1/admin/audit-logs"), api("/v1/admin/applications")]);
  const appOptions = "<option value=''>All Applications</option>" + applications.map((a) => "<option value='" + esc(a.code) + "'>" + esc(a.name) + "</option>").join("");

  $("section-audit").innerHTML =
    "<div class='bic-page-header'><div><p class='bic-kicker'>GOVERNANCE</p><h2 class='bic-page-title'>Audit log</h2><p class='bic-page-subtitle'>Immutable event ledger tracking logins, synchronization queries, and security actions.</p></div></div>" +
    "<div class='bic-card bic-panel'>" +
      "<div class='bic-table-toolbar'>" +
        "<div class='bic-toolbar-filter-group'>" +
          "<div class='bic-search-input-wrap'>" +
            "<svg class='bic-search-icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>" +
            "<input class='bic-control bic-search-control' id='audit-search' type='search' placeholder='Search event, IP, metadata...' aria-label='Search audit logs'>" +
          "</div>" +
          "<select class='bic-select bic-filter-select' id='audit-app-filter' aria-label='Filter by application'>" + appOptions + "</select>" +
        "</div>" +
        "<div class='bic-toolbar-meta'><span class='bic-badge bic-badge-info'>" + logs.length + " events</span></div>" +
      "</div>" +
      "<div class='bic-table-wrap'><table class='bic-table bic-sortable'><thead><tr><th>Event</th><th>Application</th><th>Source IP</th><th data-sort-type='date'>Timestamp</th><th>Metadata</th></tr></thead><tbody id='audit-table-body'></tbody></table></div>" +
    "</div>";

  const renderAuditRows = () => {
    const query = $("audit-search")?.value.trim().toLowerCase() || "";
    const appFilter = $("audit-app-filter")?.value.trim().toLowerCase() || "";
    const filtered = logs.filter((log) => {
      const haystack = [log.event, log.application || "", log.source_ip || "", JSON.stringify(log.metadata || {})].join(" ").toLowerCase();
      const matchQuery = !query || haystack.includes(query);
      const matchApp = !appFilter || (log.application || "").toLowerCase() === appFilter;
      return matchQuery && matchApp;
    });

    $("audit-table-body").innerHTML = filtered.length ? filtered.map((log) => {
      const isSuccess = log.event.includes("SUCCESS") || log.event.includes("CREATED") || log.event.includes("UPDATED");
      const isFailed = log.event.includes("FAILED") || log.event.includes("DELETED") || log.event.includes("DISABLED");
      const badgeClass = isSuccess ? "bic-badge-success" : (isFailed ? "bic-badge-danger" : "bic-badge-info");
      return "<tr>" +
        "<td><span class='bic-badge " + badgeClass + "'>" + esc(log.event) + "</span></td>" +
        "<td>" + (log.application ? "<span class='bic-app-tag'>" + esc(log.application) + "</span>" : "<span class='bic-muted'>—</span>") + "</td>" +
        "<td><code>" + esc(log.source_ip || "—") + "</code></td>" +
        "<td data-sort-value='" + esc(log.timestamp) + "'>" + new Date(log.timestamp).toLocaleString() + "</td>" +
        "<td><pre class='bic-audit-metadata' style='margin:0;font-size:0.75rem;max-width:320px;overflow:hidden;text-overflow:ellipsis;'>" + esc(JSON.stringify(log.metadata || {})) + "</pre></td>" +
      "</tr>";
    }).join("") : "<tr><td colspan='5' class='bic-empty'>No audit logs matching query.</td></tr>";
  };

  $("audit-search").oninput = renderAuditRows;
  $("audit-app-filter").onchange = renderAuditRows;
  renderAuditRows();
  enableTableSorting($("section-audit"));
}

function showForgotPasswordMode() {
  $("login-form").classList.add("bic-hidden");
  $("reset-password-form").classList.add("bic-hidden");
  $("forgot-password-form").classList.remove("bic-hidden");
  $("forgot-email").focus();
}

function showLoginMode() {
  $("forgot-password-form").classList.add("bic-hidden");
  $("reset-password-form").classList.add("bic-hidden");
  $("login-form").classList.remove("bic-hidden");
  $("login-error").textContent = "";
  $("username").focus();
}

function showResetPasswordMode() {
  $("login-view").classList.remove("bic-hidden");
  $("portal-view").classList.add("bic-hidden");
  $("login-form").classList.add("bic-hidden");
  $("forgot-password-form").classList.add("bic-hidden");
  $("reset-password-form").classList.remove("bic-hidden");
  $("reset-password").focus();
}

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("login-error").textContent = "";
  try {
    const tokens = await api("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("username").value,
        password: $("password").value,
        application_code: "CENTRAL_AUTH",
      }),
    });
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
