let teamsData = [];
let organizations = [];
let competitionSettings = {};
let currentTeamId = null;
let isNewTeam = false;
const STORAGE_KEY = "opmr_teams_data_v2";
const STORAGE_KEY_OLD = "opmr_teams_data";
const ADMIN_MODE_KEY = "opmr_admin_mode";
const GH_SETTINGS_KEY = "opmr_gh_settings";
const ADMIN_PASSWORD = "opmr2026";
let isAdmin = localStorage.getItem(ADMIN_MODE_KEY) === "true";
let isGrouped = false;
let currentView = "teams";
let currentYear = 2026;
let returnToView = "list";
let returnToTeamId = null;
let currentProtocolTeamId = null;

// ===== НАСТРОЙКИ СОРЕВНОВАНИЙ ПО УМОЛЧАНИЮ =====
function getDefaultCompetitionSettings() {
  return {
    2026: {
      bek: {date: "28.11.2026", color: "badge-bek", criteria: []},
      tnpa: {date: "28.11.2026", color: "badge-tnpa", criteria: []},
      anpa: {date: "29.11.2026", color: "badge-anpa", criteria: []},
      anna: {date: "29.11.2026", color: "badge-anna", criteria: []},
    },
    2025: {
      bek: {date: "28.11.2025", color: "badge-bek", criteria: []},
      tnpa: {date: "28.11.2025", color: "badge-tnpa", criteria: []},
      anpa: {date: "29.11.2025", color: "badge-anpa", criteria: []},
    },
    2024: {
      anna: {
        date: "01.11.2024",
        color: "badge-anna",
        criteria: [
          {section: "Квалификация", fields: ["Сумма размерений", "Штрафные баллы", "Вес (кг)", "Бонусные баллы"]},
          {section: "Презентация", fields: ["Структура", "Эффективность", "Новизна", "Перспектива", "Качество"]},
          {section: "Задание 2 (траектория)", fields: ["Среднее отклонение", "Баллы"]},
          {section: "Задание 3 (растения)", fields: ["Остров 1", "Остров 2", "Остров 3", "Баллы"]},
          {section: "Задание 4 (объекты)", fields: ["Кол-во объектов", "Баллы", "Бонус за непрерывность"]},
        ],
      },
    },
  };
}

function getGitHubSettings() {
  try {
    const s = localStorage.getItem(GH_SETTINGS_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function saveGitHubSettings() {
  const settings = {
    owner: document.getElementById("ghOwner").value.trim(),
    repo: document.getElementById("ghRepo").value.trim(),
    branch: document.getElementById("ghBranch").value.trim() || "main",
    token: document.getElementById("ghToken").value.trim(),
  };
  if (!settings.owner || !settings.repo || !settings.token) {
    showToast("Заполните все обязательные поля", "error");
    return;
  }
  localStorage.setItem(GH_SETTINGS_KEY, JSON.stringify(settings));
  bootstrap.Modal.getInstance(document.getElementById("githubSettingsModal")).hide();
  showToast("Настройки GitHub сохранены", "success");
  renderHeaderButtons();
}

function openGitHubSettings() {
  const settings = getGitHubSettings();
  if (settings) {
    document.getElementById("ghOwner").value = settings.owner;
    document.getElementById("ghRepo").value = settings.repo;
    document.getElementById("ghBranch").value = settings.branch;
    document.getElementById("ghToken").value = settings.token;
  } else {
    document.getElementById("ghOwner").value = "";
    document.getElementById("ghRepo").value = "";
    document.getElementById("ghBranch").value = "main";
    document.getElementById("ghToken").value = "";
  }
  new bootstrap.Modal(document.getElementById("githubSettingsModal")).show();
}

function toggleTokenVisibility() {
  const input = document.getElementById("ghToken");
  const icon = document.getElementById("tokenToggleIcon");
  if (input.type === "password") {
    input.type = "text";
    icon.className = "fas fa-eye-slash";
  } else {
    input.type = "password";
    icon.className = "fas fa-eye";
  }
}

async function testGitHubConnection() {
  const settings = {
    owner: document.getElementById("ghOwner").value.trim(),
    repo: document.getElementById("ghRepo").value.trim(),
    token: document.getElementById("ghToken").value.trim(),
  };
  if (!settings.owner || !settings.repo || !settings.token) {
    showToast("Заполните owner, repo и token", "error");
    return;
  }
  showToast("Проверка соединения...", "info");
  try {
    const res = await fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}`, {
      headers: {Authorization: `token ${settings.token}`, Accept: "application/vnd.github.v3+json"},
    });
    if (res.ok) {
      const data = await res.json();
      showToast(`✓ Подключено: ${data.full_name}`, "success");
    } else {
      const err = await res.json();
      showToast(`✗ Ошибка: ${err.message}`, "error");
    }
  } catch (e) {
    showToast(`✗ Ошибка сети: ${e.message}`, "error");
  }
}

async function commitToGitHub() {
  const settings = getGitHubSettings();
  if (!settings || !settings.owner || !settings.repo || !settings.token)
    return {success: false, message: "Настройки GitHub не заданы"};
  const filePath = "data/teams.json";
  const apiUrl = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${filePath}`;
  const headers = {Authorization: `token ${settings.token}`, Accept: "application/vnd.github.v3+json"};
  const dataToSave = {organizations, competitionSettings, teams: teamsData};
  const jsonStr = JSON.stringify(dataToSave, null, 2);
  const content = btoa(unescape(encodeURIComponent(jsonStr)));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let sha = null;
      const getRes = await fetch(`${apiUrl}?ref=${settings.branch}`, {headers});
      if (getRes.ok) {
        sha = (await getRes.json()).sha;
      } else if (getRes.status !== 404) {
        const err = await getRes.json();
        return {success: false, message: `Ошибка чтения файла: ${err.message}`};
      }
      const body = {
        message: `Обновление базы участников (${new Date().toLocaleString("ru-RU")})`,
        content,
        branch: settings.branch,
      };
      if (sha) body.sha = sha;
      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: {...headers, "Content-Type": "application/json"},
        body: JSON.stringify(body),
      });
      if (putRes.ok) return {success: true, message: "Данные сохранены в GitHub"};
      else {
        const err = await putRes.json();
        if (err.message?.includes("does not match") && attempt < 3) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        return {success: false, message: `Ошибка коммита: ${err.message}`};
      }
    } catch (e) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      return {success: false, message: `Ошибка сети: ${e.message}`};
    }
  }
  return {success: false, message: "Не удалось сохранить после 3 попыток"};
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast-msg ${type}`;
  toast.innerHTML = `<i class="fas fa-${type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : "info-circle"} me-2"></i>${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const parts = String(dateStr).trim().split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return dateStr;
}

function formatFio(fio) {
  if (!fio) return "—";
  const parts = fio.trim().split(/\s+/);
  if (parts.length >= 2)
    return `<span class="fio-cell"><span class="fio-surname">${parts[0]}</span> <span class="fio-name-patronymic">${parts.slice(1).join(" ")}</span></span>`;
  return `<span class="fio-cell"><span class="fio-surname">${fio}</span></span>`;
}

function formatDescription(desc) {
  if (!desc || desc.trim() === "") return '<div class="detail-value text-muted">—</div>';
  return desc
    .split("\n")
    .filter((p) => p.trim() !== "")
    .map((para) => {
      const sentences = para.split(". ").filter((s) => s.trim() !== "");
      if (sentences.length > 1)
        return sentences
          .map(
            (s) =>
              `<p style="margin-bottom:0.5rem;color:#334155;font-size:1rem;line-height:1.6">${s.endsWith(".") ? s : s + "."}</p>`,
          )
          .join("");
      return `<p style="margin-bottom:0.5rem;color:#334155;font-size:1rem;line-height:1.6">${para.trim()}</p>`;
    })
    .join("");
}

function getCategoryBadge(apparatusClass, extraClass = "", year = currentYear) {
  const value = String(apparatusClass || "")
    .trim()
    .toLowerCase();
  const yearSettings = competitionSettings[year] || {};
  let foundId = null;
  for (const key in yearSettings) {
    if (value.includes(key.toLowerCase())) {
      foundId = key;
      break;
    }
  }
  if (!foundId) return `<span class="badge category-badge ${extraClass} bg-secondary text-white">Н/Д</span>`;
  const config = yearSettings[foundId];
  return `<span class="badge category-badge ${extraClass} ${config.color}">${foundId.toUpperCase()}</span>`;
}

function parsePhotosField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isDirectImageLink(url) {
  return /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(url);
}

function transformYandexFormsData(rawArray) {
  return rawArray
    .map((teamArr) => {
      let obj = {};
      teamArr.forEach(([key, value]) => {
        obj[key.trim()] = value ? value.trim() : "";
      });
      let members = [];
      for (let i = 1; i <= 10; i++) {
        let fioKey = `Ф.И.О. [${i}]`;
        if (obj[fioKey] && obj[fioKey] !== "")
          members.push({
            fio: obj[fioKey],
            birth: obj[`Дата рождения [${i}]`] || "",
            passport: obj[`Паспорт/Свидетельство о рождении [${i}]`] || "",
            isStudent: obj[`Студент [${i}]`] || "",
            order: obj[`Приказ о зачислении (для студентов) [${i}]`] || "",
          });
      }
      let createdDate = "—";
      if (obj["Время создания"]) {
        const parts = obj["Время создания"].trim().split(" ")[0].split("-");
        if (parts.length === 3) createdDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
      }
      return {
        id: obj["ID"] || Math.random().toString(36).substr(2, 9),
        created: createdDate,
        organization: obj["Организация"] || "Без названия",
        city: obj["Город (населённый пункт)"] || "",
        region: obj["Республика/край/область"] || "",
        postalCode: obj["Почтовый индекс"] || "",
        address: obj["Адрес"] || "",
        phone: obj["Телефон/факс"] || "",
        email: obj["Email"] || "",
        orgLeader: obj["ФИО руководителя организации"] || "",
        apparatusClass: obj["Класс аппарата"] || "",
        description: obj["Краткое описание аппарата"] || "",
        photos: parsePhotosField(obj["Фото аппарата"]),
        teamLeader: obj["ФИО руководителя команды"] || "",
        teamLeaderPhone: obj["Контактный телефон руководителя команды"] || "",
        members,
      };
    })
    .filter((team) => (team.organization || "").toLowerCase().trim() !== "тест");
}

function getNextOrgId() {
  if (organizations.length === 0) return "001";
  const maxId = Math.max(...organizations.map((o) => parseInt(o.id)));
  return String(maxId + 1).padStart(3, "0");
}

function findOrCreateOrg(fullName, shortName, city) {
  let org = organizations.find((o) => o.fullName.toLowerCase() === fullName.toLowerCase());
  if (!org) {
    org = {id: getNextOrgId(), fullName, shortName: shortName || fullName, city: city || ""};
    organizations.push(org);
  } else {
    if (shortName && !org.shortName) org.shortName = shortName;
    if (city && !org.city) org.city = city;
  }
  return org;
}

function migrateData() {
  const oldData = localStorage.getItem(STORAGE_KEY_OLD);
  if (!oldData) return false;
  try {
    const oldTeams = JSON.parse(oldData);
    if (!Array.isArray(oldTeams) || oldTeams.length === 0) return false;
    organizations = [];
    competitionSettings = getDefaultCompetitionSettings();
    teamsData = [];
    const orgMap = {};
    oldTeams.forEach((team) => {
      const orgName = team.organization || "Без названия";
      const shortName = team.shortName || "";
      const city = team.city || "";
      if (!orgMap[orgName.toLowerCase()]) {
        const org = findOrCreateOrg(orgName, shortName, city);
        orgMap[orgName.toLowerCase()] = org.id;
      } else {
        const existingOrg = organizations.find((o) => o.id === orgMap[orgName.toLowerCase()]);
        if (existingOrg) {
          if (shortName && !existingOrg.shortName) existingOrg.shortName = shortName;
          if (city && !existingOrg.city) existingOrg.city = city;
        }
      }
      const hasProtocol =
        team.protocol && (team.protocol.totalScore > 0 || team.protocol.place > 0 || team.protocol.competition);
      teamsData.push({...team, orgId: orgMap[orgName.toLowerCase()], year: hasProtocol ? 2025 : 2026, shortName});
      delete teamsData[teamsData.length - 1].organization;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({organizations, competitionSettings, teams: teamsData}));
    localStorage.removeItem(STORAGE_KEY_OLD);
    return true;
  } catch (e) {
    console.error("Ошибка миграции:", e);
    return false;
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({organizations, competitionSettings, teams: teamsData}));
  } catch (e) {
    console.warn("Не удалось сохранить:", e);
  }
}

function loadData() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      organizations = parsed.organizations || [];
      competitionSettings = parsed.competitionSettings || getDefaultCompetitionSettings();
      teamsData = parsed.teams || [];
      return true;
    }
  } catch (e) {
    console.warn("Ошибка чтения:", e);
  }
  return false;
}

function renderHeaderButtons() {
  const container = document.getElementById("headerButtons");
  const adminButtons = isAdmin
    ? `<label for="fileInput" class="btn btn-outline-primary btn-upload mb-0" title="Импортировать данные из JSON файла"><i class="fas fa-file-upload"></i><span class="btn-text ms-2">Загрузить JSON</span></label>
       <button class="btn btn-success btn-upload" onclick="downloadJSON()" title="Скачать текущие данные"><i class="fas fa-download"></i><span class="btn-text ms-2">Скачать JSON</span></button>
       <button class="btn btn-primary btn-upload" onclick="createNewTeam()"><i class="fas fa-plus"></i><span class="btn-text ms-2">Команда</span></button>
       <button class="btn btn-outline-dark btn-upload" onclick="openGitHubSettings()" title="Настройки GitHub"><i class="fab fa-github"></i><span class="btn-text ms-2">GitHub</span></button>
       <button class="btn btn-outline-info btn-upload" onclick="showOrgManager()" title="Справочник организаций"><i class="fas fa-building"></i><span class="btn-text ms-2">Организации</span></button>
       <button class="btn btn-outline-warning btn-upload" onclick="showApparatusManager()" title="Настройки соревнований"><i class="fas fa-cogs"></i><span class="btn-text ms-2">Соревнования</span></button>`
    : "";
  container.innerHTML = `${adminButtons}
    <div class="btn-group view-switcher" role="group" style="overflow:hidden">
      <button class="btn ${currentView === "teams" ? "btn-primary" : "btn-outline-primary"}" onclick="showTeamsView()" style="border-right:none;border-radius:8px 0 0 8px"><i class="fas fa-users"></i><span class="btn-text ms-2">Команды</span></button>
      <button class="btn ${currentView === "competition" ? "btn-primary" : "btn-outline-primary"}" onclick="showCompetitionView()" style="border-radius:0 8px 8px 0"><i class="fas fa-trophy"></i><span class="btn-text ms-2">Соревнования</span></button>
    </div>
    <button class="btn btn-grouping-icon ${isGrouped ? "active" : ""}" onclick="toggleGrouping()" title="${isGrouped ? "Показать списком" : "Группировать по классам"}"><i class="fas fa-layer-group"></i></button>
    <button class="btn ${isAdmin ? "btn-dark" : "btn-outline-secondary"} btn-upload" onclick="toggleAdminMode()" title="${isAdmin ? "Выйти из режима администратора" : "Войти в режим администратора"}"><i class="fas fa-${isAdmin ? "user-shield" : "lock"}"></i><span class="btn-text ms-2">${isAdmin ? "Админ" : "Admin"}</span></button>`;
  renderEditPageAdminButtons();
}

function renderYearSwitcher() {
  const container = document.getElementById("yearSwitcher");
  const isMaster = currentView === "master";
  const years = [2026, 2025, 2024];
  let html = '<div class="d-flex gap-2 flex-wrap">';
  years.forEach((y) => {
    html += `<button class="btn ${currentYear === y && !isMaster ? "active" : ""}" onclick="switchYear(${y})">${y}</button>`;
  });
  html += `<button class="btn ${isMaster ? "active" : ""}" onclick="showMasterTable()"><i class="fas fa-table me-1"></i>Сводная</button>`;
  html += "</div>";
  container.innerHTML = html;
  container.style.display = "flex";
}

function switchYear(y) {
  currentYear = y;
  renderYearSwitcher();
  if (currentView === "teams") renderTeams(teamsData);
  else if (currentView === "competition") renderCompetition();
  else if (currentView === "master") showTeamsView();
}

function renderEditPageAdminButtons() {
  const container = document.getElementById("editPageAdminButtons");
  if (!container) return;
  container.innerHTML = isAdmin
    ? `<label for="fileInputEdit" class="btn btn-outline-primary btn-upload mb-0" title="Импортировать данные из JSON файла"><i class="fas fa-file-upload me-2"></i><span class="btn-text">Загрузить JSON</span></label><input type="file" id="fileInputEdit" accept=".json" class="d-none" onchange="handleEditPageFileUpload(event)">`
    : "";
}

function toggleAdminMode() {
  if (isAdmin) {
    isAdmin = false;
    localStorage.setItem(ADMIN_MODE_KEY, isAdmin);
    renderHeaderButtons();
    if (currentTeamId && document.getElementById("detailPage").classList.contains("active"))
      showTeamDetails(currentTeamId);
    showToast("Режим администратора выключен", "info");
  } else {
    document.getElementById("adminPasswordInput").value = "";
    document.getElementById("adminPasswordError").style.display = "none";
    const modal = new bootstrap.Modal(document.getElementById("adminPasswordModal"));
    modal.show();
    setTimeout(() => document.getElementById("adminPasswordInput").focus(), 300);
  }
}

function checkAdminPassword() {
  const input = document.getElementById("adminPasswordInput");
  const error = document.getElementById("adminPasswordError");
  if (input.value === ADMIN_PASSWORD) {
    isAdmin = true;
    localStorage.setItem(ADMIN_MODE_KEY, isAdmin);
    bootstrap.Modal.getInstance(document.getElementById("adminPasswordModal")).hide();
    renderHeaderButtons();
    if (currentTeamId && document.getElementById("detailPage").classList.contains("active"))
      showTeamDetails(currentTeamId);
    showToast("Режим администратора включён", "success");
  } else {
    error.style.display = "block";
    input.value = "";
    input.focus();
  }
}

document.addEventListener("DOMContentLoaded", function () {
  const pwdInput = document.getElementById("adminPasswordInput");
  if (pwdInput)
    pwdInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") checkAdminPassword();
    });
});

function sortTeamsByName(teams) {
  return [...teams].sort((a, b) =>
    getTeamDisplayName(a).toLowerCase().trim().localeCompare(getTeamDisplayName(b).toLowerCase().trim(), "ru"),
  );
}
function getTeamDisplayName(team) {
  const org = organizations.find((o) => o.id === team.orgId);
  if (org?.shortName) return org.shortName;
  if (team.shortName) return team.shortName;
  if (org) return org.fullName;
  return team.organization || "Без названия";
}
function getTeamFullName(team) {
  const org = organizations.find((o) => o.id === team.orgId);
  return org?.fullName || team.organization || "Без названия";
}
function getTeamCity(team) {
  const org = organizations.find((o) => o.id === team.orgId);
  return org?.city || team.city || "";
}

function toggleGrouping() {
  isGrouped = !isGrouped;
  renderTeams(teamsData);
}

function renderTeamCard(team) {
  const displayName = getTeamDisplayName(team);
  const city = getTeamCity(team);
  return `<div class="col-md-6 col-lg-4"><div class="card team-card h-100 p-3" onclick="showTeamDetails('${team.id}')"><div class="team-card-head mb-2"><div class="flex-grow-1"><div class="org-name">${displayName}</div><div class="team-meta">${city || "Город не указан"}</div></div>${getCategoryBadge(team.apparatusClass, "category-badge-card")}</div><div class="mt-auto pt-3 border-top"><div class="d-flex justify-content-between align-items-center"><span class="team-meta"><i class="fas fa-users me-2"></i> ${team.members?.length || 0} участн.</span><span class="team-meta"><i class="fas fa-user-tie me-2"></i> ${team.teamLeader?.split(" ")[0] || "—"}</span></div></div></div></div>`;
}

function renderTeams(teams) {
  const container = document.getElementById("teamsContainer");
  const filtered = teams.filter((t) => t.year === currentYear);
  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-12 text-center text-muted py-5">Нет команд для ${currentYear} года</div>`;
    return;
  }
  const sortedTeams = sortTeamsByName(filtered);
  let html = "";
  if (!isGrouped) {
    html += `<div class="row g-3">${sortedTeams.map((team) => renderTeamCard(team)).join("")}</div>`;
  } else {
    const yearSettings = competitionSettings[currentYear] || {};
    const groups = {};
    for (const key in yearSettings) groups[key] = {...yearSettings[key], id: key, teams: []};
    groups["other"] = {name: "Н/Д", color: "bg-secondary text-white", date: "", teams: []};

    sortedTeams.forEach((team) => {
      const val = String(team.apparatusClass || "").toLowerCase();
      let foundKey = null;
      for (const key in yearSettings) {
        if (val.includes(key.toLowerCase())) {
          foundKey = key;
          break;
        }
      }
      groups[foundKey || "other"].teams.push(team);
    });

    for (const key in groups) {
      if (groups[key].teams.length > 0) {
        const g = groups[key];
        const title = g.fullName || key.toUpperCase();
        html += `<div class="col-12 mt-4"><div class="group-header"><div class="group-header-left"><span class="badge category-badge ${g.color}" style="font-size:1rem;padding:0.5rem 0.85rem">${key.toUpperCase()}</span><span class="group-header-title">${title}</span></div>${g.date ? `<span class="group-date-badge">${g.date}</span>` : ""}</div></div><div class="row g-3 mb-4">${g.teams.map((team) => renderTeamCard(team)).join("")}</div>`;
      }
    }
  }
  container.innerHTML = html;
}

function hideAllPages() {
  [
    "listPage",
    "detailPage",
    "editPage",
    "competitionPage",
    "protocolPage",
    "masterPage",
    "orgManagerPage",
    "apparatusPage",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove("active");
      if (id === "listPage") el.classList.add("hidden");
    }
  });
}

function showListPage() {
  hideAllPages();
  document.getElementById("listPage").classList.remove("hidden");
  document.getElementById("headerButtons").style.display = "flex";
  document.getElementById("yearSwitcher").style.display = "flex";
  currentTeamId = null;
  isNewTeam = false;
}

function showTeamsView() {
  currentView = "teams";
  returnToView = "list";
  hideAllPages();
  document.getElementById("listPage").classList.remove("hidden");
  document.getElementById("headerButtons").style.display = "flex";
  document.getElementById("yearSwitcher").style.display = "flex";
  renderHeaderButtons();
  renderYearSwitcher();
  renderTeams(teamsData);
}

function showCompetitionView() {
  currentView = "competition";
  returnToView = "competition";
  hideAllPages();
  document.getElementById("competitionPage").classList.add("active");
  document.getElementById("headerButtons").style.display = "none";
  document.getElementById("yearSwitcher").style.display = "flex";
  renderHeaderButtons();
  renderYearSwitcher();
  renderCompetition();
}

function showProtocolPage(teamId) {
  currentProtocolTeamId = teamId;
  hideAllPages();
  document.getElementById("protocolPage").classList.add("active");
  document.getElementById("yearSwitcher").style.display = "none";
  renderProtocolForm(teamId);
}

function showDetailPage() {
  hideAllPages();
  document.getElementById("detailPage").classList.add("active");
  document.getElementById("headerButtons").style.display = "none";
  document.getElementById("yearSwitcher").style.display = "none";
}

function showEditPage() {
  hideAllPages();
  document.getElementById("editPage").classList.add("active");
  document.getElementById("headerButtons").style.display = "none";
  document.getElementById("yearSwitcher").style.display = "none";
}

function showMasterTable() {
  currentView = "master";
  hideAllPages();
  document.getElementById("masterPage").classList.add("active");
  document.getElementById("headerButtons").style.display = "none";
  document.getElementById("yearSwitcher").style.display = "flex";
  renderYearSwitcher();
  renderMasterTable();
}

function showOrgManager() {
  if (!isAdmin) {
    showToast("Доступно только администратору", "error");
    return;
  }
  currentView = "orgManager";
  hideAllPages();
  document.getElementById("orgManagerPage").classList.add("active");
  document.getElementById("headerButtons").style.display = "none";
  document.getElementById("yearSwitcher").style.display = "none";
  renderOrgManager();
}

function showApparatusManager() {
  if (!isAdmin) {
    showToast("Доступно только администратору", "error");
    return;
  }
  currentView = "apparatus";
  hideAllPages();
  document.getElementById("apparatusPage").classList.add("active");
  document.getElementById("headerButtons").style.display = "none";
  document.getElementById("yearSwitcher").style.display = "none";
  renderApparatusManager();
}

function goBack() {
  if (returnToView === "competition") showCompetitionView();
  else showTeamsView();
}

function showTeamDetails(teamId) {
  returnToView = currentView;
  returnToTeamId = teamId;
  currentTeamId = teamId;
  isNewTeam = false;
  const team = teamsData.find((t) => t.id === teamId);
  if (!team) return;
  const phoneLink = team.phone ? `<a href="tel:${team.phone.replace(/\s/g, "")}">${team.phone}</a>` : "—";
  const emailLink = team.email ? `<a href="mailto:${team.email}">${team.email}</a>` : "—";
  let sortedMembers = [...(team.members || [])];
  const leaderFio = (team.teamLeader || "").trim().toLowerCase();
  const captainIdx = sortedMembers.findIndex((m) => (m.fio || "").trim().toLowerCase() === leaderFio);
  if (captainIdx > 0) {
    sortedMembers.unshift(sortedMembers.splice(captainIdx, 1)[0]);
  }

  const membersTableHtml =
    sortedMembers.length > 0
      ? `<table class="members-table"><thead><tr><th class="col-fio">ФИО</th><th class="col-birth">Дата рождения</th><th class="col-passport">Паспорт/Св-во</th><th class="col-student">Студент</th><th class="col-order">Приказ о зачислении</th></tr></thead><tbody>${sortedMembers
          .map((m) => {
            const isCaptain = (m.fio || "").trim().toLowerCase() === leaderFio && leaderFio !== "";
            const captainBadge = isCaptain
              ? ' <span class="badge bg-primary" style="font-size:0.7rem;vertical-align:middle;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;padding:0">К</span>'
              : "";
            return `<tr><td>${formatFio(m.fio)}${captainBadge}</td><td>${formatDate(m.birth)}</td><td>${m.passport || "—"}</td><td>${m.isStudent === "Да" ? '<span class="badge badge-tnpa" style="font-size:0.75rem;padding:0.35em 0.65em">Да</span>' : "—"}</td><td>${m.isStudent === "Да" ? m.order || "—" : "—"}</td></tr>`;
          })
          .join("")}</tbody></table>`
      : '<div class="text-muted py-3">Состав команды не указан</div>';

  const membersCardsHtml =
    sortedMembers.length > 0
      ? sortedMembers
          .map((m) => {
            const isCaptain = (m.fio || "").trim().toLowerCase() === leaderFio && leaderFio !== "";
            const captainBadge = isCaptain
              ? '<span class="badge bg-primary ms-2" style="font-size:0.75rem;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;padding:0">К</span>'
              : "";
            return `<div class="member-card"><div class="member-fio">${m.fio}${captainBadge}</div><div class="member-info"><i class="fas fa-birthday-cake"></i> ${formatDate(m.birth)}</div><div class="member-info"><i class="fas fa-id-card"></i> ${m.passport || "Не указан"}</div>${m.isStudent === "Да" ? `<div class="member-info mt-2"><span class="badge badge-tnpa" style="font-size:0.75rem;padding:0.35em 0.65em">Студент</span></div><div class="member-info"><i class="fas fa-file-alt"></i> ${m.order || "—"}</div>` : ""}</div>`;
          })
          .join("")
      : '<div class="text-muted py-3">Состав команды не указан</div>';

  const descHtml = formatDescription(team.description);
  const photos = team.photos || [];
  let photosHtml;
  if (photos.length === 0)
    photosHtml = `<div class="detail-value text-muted" style="font-size:1rem">Фото не загружено</div>`;
  else {
    const gridClass = photos.length === 1 ? "apparatus-photo-grid single-photo" : "apparatus-photo-grid";
    const items = photos
      .map((src, idx) => {
        const isDirect = isDirectImageLink(src);
        if (isDirect)
          return `<div class="apparatus-photo-item"><img src="${src}" alt="Фото ${idx + 1}" onclick="openLightbox('${src.replace(/'/g, "\\'")}')" onerror="this.parentElement.innerHTML='<a href=\\'${src}\\' target=\\'_blank\\' class=\\'photo-link-card\\'><i class=\\'fas fa-image\\'></i><span>Фото ${idx + 1}</span></a>'"></div>`;
        else
          return `<div class="apparatus-photo-item"><a href="${src}" target="_blank" rel="noopener" class="photo-link-card"><i class="fas fa-external-link-alt"></i><span>Открыть фото ${idx + 1}</span></a></div>`;
      })
      .join("");
    photosHtml = `<div style="width:100%;max-width:100%;overflow:hidden;box-sizing:border-box"><div class="${gridClass}" style="width:100%;max-width:100%;overflow:hidden">${items}</div></div>`;
  }

  const displayName = getTeamDisplayName(team);
  const editButtonDesktop = isAdmin
    ? `<button class="btn btn-outline-primary btn-action edit-btn-desktop" onclick="editTeam('${team.id}')"><i class="fas fa-edit me-2"></i><span class="edit-btn-text">Редактировать</span></button>`
    : "";
  const editButtonMobile = isAdmin
    ? `<button class="btn btn-outline-primary btn-sm edit-btn-mobile" onclick="editTeam('${team.id}')" title="Редактировать" style="display:none"><i class="fas fa-edit"></i></button>`
    : "";

  document.getElementById("detailContent").innerHTML =
    `<div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2 print-header"><div class="d-flex align-items-center gap-3 flex-wrap"><h3 class="fw-bold mb-0" style="font-family:'Manrope',sans-serif;color:#0f172a;font-size:1.75rem">${displayName}</h3>${getCategoryBadge(team.apparatusClass, "category-badge-card")}<span class="badge bg-secondary ms-2">${team.year}</span></div><div class="d-flex gap-2">${editButtonDesktop}<button class="btn btn-outline-secondary btn-action edit-btn-desktop" onclick="window.print()"><i class="fas fa-print me-2"></i><span class="edit-btn-text">Печать</span></button></div></div><div class="d-flex gap-1 mb-2 print-header-mobile">${editButtonMobile}<button class="btn btn-outline-secondary btn-sm edit-btn-mobile" onclick="window.print()" title="Печать" style="display:none"><i class="fas fa-print"></i></button></div><div class="detail-section print-section-info"><div class="row g-4"><div class="col-md-6"><div class="detail-label">ID заявки</div><div class="detail-value">${team.id}</div></div><div class="col-md-6"><div class="detail-label">Дата заявки</div><div class="detail-value">${team.created}</div></div><div class="col-md-6"><div class="detail-label">Город / Населённый пункт</div><div class="detail-value">${getTeamCity(team) || "—"}</div></div><div class="col-md-6"><div class="detail-label">Республика / край / область</div><div class="detail-value">${team.region || "—"}</div></div><div class="col-md-6"><div class="detail-label">Почтовый индекс</div><div class="detail-value">${team.postalCode || "—"}</div></div><div class="col-md-6"><div class="detail-label">Адрес</div><div class="detail-value">${team.address || "—"}</div></div><div class="col-md-6"><div class="detail-label">Телефон / факс</div><div class="detail-value">${phoneLink}</div></div><div class="col-md-6"><div class="detail-label">Email</div><div class="detail-value">${emailLink}</div></div><div class="col-12"><div class="detail-label">ФИО руководителя организации</div><div class="detail-value">${team.orgLeader || "—"}</div></div></div></div><div class="detail-section print-section-apparatus"><div class="detail-section-head"><h5 class="detail-section-title">Аппарат</h5>${getCategoryBadge(team.apparatusClass, "category-badge-xl")}</div><div class="row g-4"><div class="col-12"><div class="detail-label">Класс аппарата</div><div class="detail-value">${team.apparatusClass || "—"}</div></div><div class="col-12"><div class="detail-label">Название аппарата</div><div class="detail-value">${team.apparatusName || "—"}</div></div><div class="col-12 print-hide-desc"><div class="detail-label">Краткое описание</div><div class="detail-value">${descHtml}</div></div><div class="col-12 print-hide-photos"><div class="detail-label">Фото аппарата (${photos.length})</div>${photosHtml}</div></div></div><div class="detail-section print-section-team"><h5 class="detail-section-title">Команда</h5><div class="row g-4"><div class="col-md-6"><div class="detail-label">ФИО руководителя</div><div class="detail-value">${team.teamLeader || "—"}</div></div><div class="col-md-6"><div class="detail-label">Контактный телефон</div><div class="detail-value"><a href="tel:${(team.teamLeaderPhone || "").replace(/\s/g, "")}">${team.teamLeaderPhone || "—"}</a></div></div></div></div><div class="detail-section print-section-members"><h5 class="detail-section-title">Участники (${sortedMembers.length})</h5><div class="members-table-desktop">${membersTableHtml}</div><div class="members-cards-mobile">${membersCardsHtml}</div></div>`;
  showDetailPage();
}

function openLightbox(src) {
  document.getElementById("lightboxImg").src = src;
  document.getElementById("lightbox").classList.add("active");
  document.body.style.overflow = "hidden";
}
function closeLightbox() {
  document.getElementById("lightbox").classList.remove("active");
  document.getElementById("lightboxImg").src = "";
  document.body.style.overflow = "";
}

function addPhotoLinkField(url = "") {
  const container = document.getElementById("photoLinksContainer");
  const field = document.createElement("div");
  field.className = "photo-link-field";
  field.innerHTML = `<img class="preview-thumb" src="${url}" alt="Превью" style="display:${url && isDirectImageLink(url) ? "block" : "none"}" onerror="this.style.display='none'"><input type="text" class="photo-link-input" placeholder="Вставьте ссылку на фото..." value="${url}" oninput="updatePhotoPreview(this)"><button type="button" class="remove-link-btn" onclick="this.closest('.photo-link-field').remove()" title="Удалить ссылку"><i class="fas fa-times"></i></button>`;
  container.appendChild(field);
}
function updatePhotoPreview(input) {
  const field = input.closest(".photo-link-field");
  const img = field.querySelector(".preview-thumb");
  const url = input.value.trim();
  if (url && isDirectImageLink(url)) {
    img.src = url;
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }
}
function getPhotoLinks() {
  return Array.from(document.querySelectorAll(".photo-link-input"))
    .map((input) => input.value.trim())
    .filter((url) => url.length > 0);
}

function createNewTeam() {
  currentTeamId = null;
  isNewTeam = true;
  returnToView = "list";
  document.getElementById("editFormTitle").textContent = `Новая команда (${currentYear})`;
  [
    "editOrgSearch",
    "editShortName",
    "editCity",
    "editRegion",
    "editPostalCode",
    "editAddress",
    "editPhone",
    "editEmail",
    "editOrgLeader",
    "editApparatusClass",
    "editApparatusName",
    "editDescription",
    "editTeamLeader",
    "editTeamLeaderPhone",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("editOrgId").value = "";
  document.getElementById("editYear").value = currentYear;
  document.getElementById("editId").value = "NEW_" + Date.now();
  const now = new Date();
  document.getElementById("editCreated").value =
    `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
  document.getElementById("photoLinksContainer").innerHTML = "";
  addPhotoLinkField();
  document.getElementById("editMembersContainer").innerHTML = "";
  addMemberField();
  document.getElementById("btnDeleteTeam").style.display = "none";
  updateOrgDatalist();
  showEditPage();
}

function editTeam(teamId) {
  const team = teamsData.find((t) => t.id === teamId);
  if (!team) return;
  currentTeamId = teamId;
  isNewTeam = false;
  returnToView = currentView === "competition" ? "competition" : "detail";
  returnToTeamId = teamId;
  document.getElementById("editFormTitle").textContent = "Редактирование команды";
  const org = organizations.find((o) => o.id === team.orgId);
  document.getElementById("editOrgSearch").value = org?.fullName || team.organization || "";
  document.getElementById("editOrgId").value = team.orgId || "";
  document.getElementById("editShortName").value = team.shortName || org?.shortName || "";
  document.getElementById("editYear").value = team.year || 2026;
  document.getElementById("editId").value = team.id;
  document.getElementById("editCreated").value = team.created;
  document.getElementById("editCity").value = team.city || org?.city || "";
  document.getElementById("editRegion").value = team.region;
  document.getElementById("editPostalCode").value = team.postalCode;
  document.getElementById("editAddress").value = team.address;
  document.getElementById("editPhone").value = team.phone;
  document.getElementById("editEmail").value = team.email;
  document.getElementById("editOrgLeader").value = team.orgLeader;
  document.getElementById("editApparatusClass").value = team.apparatusClass;
  document.getElementById("editApparatusName").value = team.apparatusName || "";
  document.getElementById("editDescription").value = team.description;
  document.getElementById("editTeamLeader").value = team.teamLeader;
  document.getElementById("editTeamLeaderPhone").value = team.teamLeaderPhone;
  document.getElementById("photoLinksContainer").innerHTML = "";
  (team.photos || []).length === 0 ? addPhotoLinkField() : team.photos.forEach((url) => addPhotoLinkField(url));
  document.getElementById("editMembersContainer").innerHTML = "";
  (team.members || []).forEach((m) => addMemberField(m));
  document.getElementById("btnDeleteTeam").style.display = "inline-flex";
  updateOrgDatalist();
  showEditPage();
}

function updateOrgDatalist() {
  const datalist = document.getElementById("orgDatalist");
  if (!datalist) return;
  datalist.innerHTML = organizations
    .map(
      (o) =>
        `<option value="${o.fullName}" data-id="${o.id}">${o.shortName ? o.shortName + " - " : ""}${o.fullName}</option>`,
    )
    .join("");
}

document.addEventListener("input", function (e) {
  if (e.target.id === "editOrgSearch") {
    const val = e.target.value.trim();
    const org = organizations.find((o) => o.fullName.toLowerCase() === val.toLowerCase());
    document.getElementById("editOrgId").value = org ? org.id : "";
  }
});

function addMemberField(member = null) {
  const container = document.getElementById("editMembersContainer");
  const idx = container.children.length;
  const div = document.createElement("div");
  div.className = "border rounded p-3 mb-3";
  div.style.borderColor = "#e2e8f0";
  div.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-3"><h6 class="mb-0 fw-bold" style="font-family:'Manrope',sans-serif;color:#0f172a">Участник ${idx + 1}</h6><button type="button" class="btn btn-outline-danger btn-sm" style="border-radius:6px" onclick="this.closest('.border').remove()"><i class="fas fa-trash"></i></button></div><div class="row g-3"><div class="col-md-6"><label class="form-label">ФИО</label><input type="text" class="form-control member-fio-input" value="${member?.fio || ""}"></div><div class="col-md-6"><label class="form-label">Дата рождения</label><input type="date" class="form-control member-birth-input" value="${member?.birth || ""}"></div><div class="col-md-6"><label class="form-label">Паспорт/Св-во</label><input type="text" class="form-control member-passport-input" value="${member?.passport || ""}"></div><div class="col-md-6"><label class="form-label">Студент</label><select class="form-select member-student-input"><option value="Нет" ${member?.isStudent !== "Да" ? "selected" : ""}>Нет</option><option value="Да" ${member?.isStudent === "Да" ? "selected" : ""}>Да</option></select></div><div class="col-12"><label class="form-label">Приказ о зачислении</label><input type="text" class="form-control member-order-input" value="${member?.order || ""}"></div></div>`;
  container.appendChild(div);
}

function renderCompetition() {
  const container = document.getElementById("competitionContent");
  const yearSettings = competitionSettings[currentYear] || {};
  let html = "";
  for (const classId in yearSettings) {
    const g = yearSettings[classId];
    const teams = teamsData.filter(
      (t) =>
        t.year === currentYear &&
        String(t.apparatusClass || "")
          .toLowerCase()
          .includes(classId.toLowerCase()),
    );
    if (teams.length === 0) continue;
    const parseTime = (t) => {
      if (!t) return 999999;
      const parts = String(t).split(":");
      if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      return parseFloat(t) || 999999;
    };
    const teamsWithTime = teams.filter((t) => t.protocol?.competition?.time);
    const sortedByTime = [...teamsWithTime].sort(
      (a, b) => parseTime(a.protocol.competition.time) - parseTime(b.protocol.competition.time),
    );
    sortedByTime.forEach((team, idx) => {
      if (!team.protocol) team.protocol = {};
      if (!team.protocol.competition) team.protocol.competition = {};
      if (!team.protocol.competition.timeScore || team.protocol.competition.timeScore === 0) {
        team.protocol.competition.timeScore = Math.max(1, 10 - idx);
      }
    });
    const title = g.fullName || classId.toUpperCase();
    html += `<div class="detail-section mb-4"><div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><h4 class="fw-bold mb-0" style="font-family:'Manrope',sans-serif;color:#0f172a">${title} <span class="badge bg-secondary ms-2" style="font-size:0.8rem">${g.date}</span></h4><span class="text-muted small">${teams.length} команд</span></div><div class="table-responsive"><table class="table table-hover align-middle competition-table" style="font-size:0.8rem"><thead class="table-light"><tr><th rowspan="2" style="width:35px;vertical-align:middle;text-align:center">№</th><th rowspan="2" style="vertical-align:middle;min-width:180px">Команда</th><th colspan="4" class="text-center bg-pres">Презентация</th><th colspan="4" class="text-center bg-qual">Квалификация</th><th colspan="6" class="text-center bg-comp">Конкурсное задание</th><th rowspan="2" style="vertical-align:middle;text-align:center">Доп.</th><th rowspan="2" style="vertical-align:middle;text-align:center">Σ</th><th rowspan="2" style="vertical-align:middle;text-align:center">🏆</th></tr><tr><th class="bg-pres" title="Структура">Структ.</th><th class="bg-pres" title="Сравнительный анализ">СА</th><th class="bg-pres" title="Новизна">Нов.</th><th class="bg-pres" title="Качество">Кач.</th><th class="bg-qual" title="Сумма размерений">Разм.</th><th class="bg-qual" title="Вес (кг)">Вес</th><th class="bg-qual" title="Штрафные баллы">Штраф</th><th class="bg-qual" title="Квалификационное задание выполнено">Квал. ✓</th><th class="bg-comp" title="Время (сек)">Т сек</th><th class="bg-comp" title="Балл за время">Т балл</th><th class="bg-comp" title="Прохождение ворот">Вор.</th><th class="bg-comp" title="Парковка">Парк.</th><th class="bg-comp" title="Нужный гараж">Гар.</th><th class="bg-comp" title="Штрафные баллы">Штраф</th></tr></thead><tbody>${teams
      .map((team) => {
        const p = team.protocol || {};
        const pres = p.presentation || {};
        const qual = p.qualification || {};
        const comp = p.competition || {};
        const presTotal = (pres.structure || 0) + (pres.analysis || 0) + (pres.novelty || 0) + (pres.quality || 0);
        const compTotal = (comp.timeScore || 0) + (comp.gates || 0) + (comp.parking || 0) + (comp.garage || 0);
        const total = Math.round(
          presTotal + compTotal + (p.extraBonus || 0) - (qual.penalty || 0) - (comp.penalty || 0),
        );
        const displayName = getTeamDisplayName(team);
        const fullName = getTeamFullName(team);
        const city = getTeamCity(team);
        return `<tr style="cursor:pointer" onclick="showProtocolPage('${team.id}')"><td style="text-align:center">${p.drawNumber || "—"}</td><td title="${fullName}${city ? ", " + city : ""}"><div class="fw-bold">${displayName}</div></td><td class="bg-pres-light">${pres.structure ?? "—"}</td><td class="bg-pres-light">${pres.analysis ?? "—"}</td><td class="bg-pres-light">${pres.novelty ?? "—"}</td><td class="bg-pres-light">${pres.quality ?? "—"}</td><td class="bg-qual-light">${p.dimensions ?? "—"}</td><td class="bg-qual-light">${p.weight ?? "—"}</td><td class="bg-qual-light">${qual.penalty ? "-" + qual.penalty : "—"}</td><td class="bg-qual-light" style="text-align:center">${qual.completed ? '<i class="fas fa-check text-success"></i>' : "—"}</td><td class="bg-comp-light">${comp.time ?? "—"}</td><td class="bg-comp-light">${comp.timeScore ?? "—"}</td><td class="bg-comp-light">${comp.gates ?? "—"}</td><td class="bg-comp-light">${comp.parking ?? "—"}</td><td class="bg-comp-light">${comp.garage ?? "—"}</td><td class="bg-comp-light">${comp.penalty ? "-" + comp.penalty : "—"}</td><td style="text-align:center">${p.extraBonus ?? "—"}</td><td class="fw-bold" style="text-align:center">${total > 0 ? total : "—"}</td><td style="text-align:center">${p.place ? `<span class="badge bg-primary">${p.place}</span>` : "—"}</td></tr>`;
      })
      .join("")}</tbody></table></div></div>`;
  }
  if (html === "") html = `<div class="col-12 text-center text-muted py-5">Нет команд для ${currentYear} года</div>`;
  container.innerHTML = html;
}

function renderProtocolForm(teamId) {
  const team = teamsData.find((t) => t.id === teamId);
  if (!team) return;
  const p = team.protocol || {};
  const pres = p.presentation || {};
  const qual = p.qualification || {};
  const comp = p.competition || {};
  const container = document.getElementById("protocolContent");
  const fullName = getTeamFullName(team);
  container.innerHTML = `<div class="detail-section"><h4 class="detail-section-title">Протокол команды (${team.year})</h4><div class="row g-3 mb-4"><div class="col-12"><div class="detail-label">Команда</div><div class="detail-value">${fullName}</div></div><div class="col-md-6"><div class="detail-label">Руководитель</div><div class="detail-value">${team.teamLeader || "—"}</div></div><div class="col-md-6"><div class="detail-label">Класс аппарата</div><div class="detail-value">${team.apparatusClass || "—"}</div></div></div></div><form id="protocolForm" class="edit-form"><div class="detail-section"><h5 class="detail-section-title">Жеребьёвка</h5><div class="row g-3"><div class="col-md-4"><label class="form-label">№ по жребию</label><input type="number" class="form-control" id="protoDrawNumber" value="${p.drawNumber || ""}"></div></div></div><div class="detail-section"><h5 class="detail-section-title">Презентация</h5><div class="row g-3"><div class="col-md-3"><label class="form-label">Структура</label><input type="number" step="1" min="0" class="form-control proto-calc" id="protoPresStructure" value="${pres.structure || ""}" placeholder="0"></div><div class="col-md-3"><label class="form-label">Сравн. анализ</label><input type="number" step="1" min="0" class="form-control proto-calc" id="protoPresAnalysis" value="${pres.analysis || ""}" placeholder="0"></div><div class="col-md-3"><label class="form-label">Новизна</label><input type="number" step="1" min="0" class="form-control proto-calc" id="protoPresNovelty" value="${pres.novelty || ""}" placeholder="0"></div><div class="col-md-3"><label class="form-label">Качество</label><input type="number" step="1" min="0" class="form-control proto-calc" id="protoPresQuality" value="${pres.quality || ""}" placeholder="0"></div><div class="col-12"><div class="alert alert-info py-2 mb-0"><strong>Сумма презентации:</strong> <span id="presTotal">${(pres.structure || 0) + (pres.analysis || 0) + (pres.novelty || 0) + (pres.quality || 0)}</span></div></div></div></div><div class="detail-section"><h5 class="detail-section-title">Квалификация</h5><div class="row g-3"><div class="col-md-3"><label class="form-label">Сумма размерений</label><input type="number" step="0.01" min="0" class="form-control proto-calc" id="protoDimensions" value="${p.dimensions || ""}" placeholder="0"></div><div class="col-md-3"><label class="form-label">Вес (кг)</label><input type="number" step="0.01" min="0" class="form-control proto-calc" id="protoWeight" value="${p.weight || ""}" placeholder="0"></div><div class="col-md-3"><label class="form-label">Штраф. баллы</label><input type="number" step="1" min="0" class="form-control proto-calc" id="protoQualPenalty" value="${qual.penalty || ""}" placeholder="0"></div><div class="col-md-3"><label class="form-label">Квал. задание выполнено</label><div class="form-check mt-2"><input class="form-check-input proto-calc" type="checkbox" id="protoQualCompleted" ${qual.completed ? "checked" : ""}><label class="form-check-label" for="protoQualCompleted">Да</label></div></div></div></div><div class="detail-section"><h5 class="detail-section-title">Конкурсное задание</h5><div class="row g-3"><div class="col-md-4"><label class="form-label">Время (сек)</label><input type="text" class="form-control" id="protoCompTime" value="${comp.time || ""}"></div><div class="col-md-4"><label class="form-label">Балл за время</label><input type="number" step="1" class="form-control proto-calc" id="protoCompTimeScore" value="${comp.timeScore || 0}"></div><div class="col-md-4"><label class="form-label">Прохождение ворот</label><input type="number" step="1" class="form-control proto-calc" id="protoCompGates" value="${comp.gates || 0}"></div><div class="col-md-4"><label class="form-label">Парковка</label><input type="number" step="1" class="form-control proto-calc" id="protoCompParking" value="${comp.parking || 0}"></div><div class="col-md-4"><label class="form-label">Нужный гараж</label><input type="number" step="1" class="form-control proto-calc" id="protoCompGarage" value="${comp.garage || 0}"></div><div class="col-md-4"><label class="form-label">Штрафные баллы</label><input type="number" step="1" class="form-control proto-calc" id="protoCompPenalty" value="${comp.penalty || 0}"></div><div class="col-12"><div class="alert alert-info py-2 mb-0"><strong>Сумма конкурса:</strong> <span id="compTotal">${(comp.timeScore || 0) + (comp.gates || 0) + (comp.parking || 0) + (comp.garage || 0)}</span></div></div></div></div><div class="detail-section"><h5 class="detail-section-title">Дополнительные баллы</h5><div class="row g-3"><div class="col-md-6"><label class="form-label">За внеконкурсное задание</label><input type="number" step="1" class="form-control proto-calc" id="protoExtraBonus" value="${p.extraBonus || 0}"></div></div></div><div class="detail-section" style="background:#f0f9ff;border:2px solid #3b82f6"><div class="row g-3 align-items-center"><div class="col-md-8"><div class="detail-label" style="font-size:1rem">ИТОГО БАЛЛОВ</div><div class="detail-value" style="font-size:2rem;font-weight:700;color:#1d4ed8" id="protoTotal">0</div></div><div class="col-md-4"><label class="form-label">Место</label><input type="number" class="form-control" id="protoPlace" value="${p.place || ""}" style="font-size:1.5rem;font-weight:700;text-align:center"></div></div></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-action px-4" onclick="saveProtocol()"><i class="fas fa-save me-2"></i>Сохранить протокол</button><button type="button" class="btn btn-outline-secondary btn-action" onclick="showCompetitionView()">Отмена</button></div></form>`;
  document.querySelectorAll(".proto-calc").forEach((input) => {
    input.addEventListener("input", updateProtocolTotals);
  });
  updateProtocolTotals();
}

function updateProtocolTotals() {
  const getVal = (id) => {
    const el = document.getElementById(id);
    if (!el) return 0;
    const val = parseFloat(el.value);
    return isNaN(val) ? 0 : val;
  };
  const pres =
    getVal("protoPresStructure") +
    getVal("protoPresAnalysis") +
    getVal("protoPresNovelty") +
    getVal("protoPresQuality");
  const comp =
    getVal("protoCompTimeScore") + getVal("protoCompGates") + getVal("protoCompParking") + getVal("protoCompGarage");
  const extra = getVal("protoExtraBonus");
  const qualPenalty = getVal("protoQualPenalty");
  const compPenalty = getVal("protoCompPenalty");
  const total = Math.round(pres + comp + extra - qualPenalty - compPenalty);
  document.getElementById("presTotal").textContent = pres;
  document.getElementById("compTotal").textContent = comp;
  document.getElementById("protoTotal").textContent = total;
}

function saveProtocol() {
  const team = teamsData.find((t) => t.id === currentProtocolTeamId);
  if (!team) return;
  const getVal = (id) => document.getElementById(id)?.value;
  const getNum = (id) => parseFloat(getVal(id)) || 0;
  team.protocol = {
    drawNumber: getVal("protoDrawNumber"),
    presentation: {
      structure: getNum("protoPresStructure"),
      analysis: getNum("protoPresAnalysis"),
      novelty: getNum("protoPresNovelty"),
      quality: getNum("protoPresQuality"),
    },
    dimensions: getNum("protoDimensions"),
    weight: getNum("protoWeight"),
    qualification: {
      penalty: getNum("protoQualPenalty"),
      completed: document.getElementById("protoQualCompleted")?.checked || false,
    },
    competition: {
      time: getVal("protoCompTime"),
      timeScore: getNum("protoCompTimeScore"),
      gates: getNum("protoCompGates"),
      parking: getNum("protoCompParking"),
      garage: getNum("protoCompGarage"),
      penalty: getNum("protoCompPenalty"),
    },
    extraBonus: getNum("protoExtraBonus"),
    place: parseInt(getVal("protoPlace")) || 0,
    totalScore: parseFloat(document.getElementById("protoTotal").textContent) || 0,
  };
  saveData();
  const ghSettings = getGitHubSettings();
  if (ghSettings?.owner && ghSettings?.repo && ghSettings?.token) {
    showToast("Сохранение в GitHub...", "info");
    commitToGitHub().then((result) => {
      showToast(result.message, result.success ? "success" : "error");
    });
  } else {
    showToast("Протокол сохранён локально", "success");
  }
  showCompetitionView();
}

function calculatePlaces() {
  if (!confirm("Автоматически рассчитать места по сумме баллов?")) return;
  const yearSettings = competitionSettings[currentYear] || {};
  const groups = Object.keys(yearSettings).map((classId) => ({
    classId,
    filter: (v) => v.includes(classId.toLowerCase()),
  }));
  groups.forEach((g) => {
    const teams = teamsData.filter(
      (t) => t.year === currentYear && g.filter(String(t.apparatusClass || "").toLowerCase()) && t.protocol,
    );
    const teamsWithTime = teams.filter((t) => t.protocol.competition?.time);
    const sortedByTime = [...teamsWithTime].sort((a, b) => {
      const parseTime = (t) => {
        if (!t) return 999999;
        const parts = String(t).split(":");
        if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        return parseFloat(t) || 999999;
      };
      return parseTime(a.protocol.competition.time) - parseTime(b.protocol.competition.time);
    });
    sortedByTime.forEach((team, idx) => {
      team.protocol.competition.timeScore = Math.max(1, 10 - idx);
    });
    teams.sort((a, b) => {
      const calc = (t) => {
        const pres =
          (t.protocol.presentation?.structure || 0) +
          (t.protocol.presentation?.analysis || 0) +
          (t.protocol.presentation?.novelty || 0) +
          (t.protocol.presentation?.quality || 0);
        const comp =
          (t.protocol.competition?.timeScore || 0) +
          (t.protocol.competition?.gates || 0) +
          (t.protocol.competition?.parking || 0) +
          (t.protocol.competition?.garage || 0);
        return Math.round(
          pres +
            comp +
            (t.protocol.extraBonus || 0) -
            (t.protocol.qualification?.penalty || 0) -
            (t.protocol.competition?.penalty || 0),
        );
      };
      return calc(b) - calc(a);
    });
    teams.forEach((team, idx) => {
      team.protocol.place = idx + 1;
    });
  });
  saveData();
  renderCompetition();
  showToast("Места рассчитаны", "success");
}

function renderMasterTable() {
  const container = document.getElementById("masterContent");
  const years = [2026, 2025, 2024];
  const orgStats = {};
  teamsData.forEach((team) => {
    if (!team.orgId) return;
    const org = organizations.find((o) => o.id === team.orgId);
    if (!org) return;
    if (!orgStats[team.orgId]) orgStats[team.orgId] = {org, years: {}};
    const yearData = orgStats[team.orgId].years[team.year];
    const place = team.protocol?.place || null;
    const score = team.protocol?.totalScore || null;
    if (!yearData || place < yearData.place || (place && yearData.place === null)) {
      orgStats[team.orgId].years[team.year] = {place, score};
    }
  });
  let html =
    '<div class="detail-section"><h4 class="detail-section-title">Сводная таблица результатов</h4><div class="table-responsive"><table class="table table-hover master-table"><thead><tr><th style="min-width:250px">Организация</th>';
  years.forEach((y) => {
    html += `<th>${y}</th>`;
  });
  html += "<th>Лучшее место</th></tr></thead><tbody>";
  const sortedOrgs = Object.values(orgStats).sort((a, b) => a.org.fullName.localeCompare(b.org.fullName, "ru"));
  sortedOrgs.forEach(({org, years: orgYears}) => {
    const displayName = org.shortName || org.fullName;
    html += `<tr><td><div class="fw-bold">${displayName}</div><div class="text-muted small">${org.city || ""}</div></td>`;
    let bestPlace = null;
    years.forEach((y) => {
      const yd = orgYears[y];
      if (yd && yd.place !== null) {
        if (bestPlace === null || yd.place < bestPlace) bestPlace = yd.place;
        html += `<td>${yd.place ? `<strong>${yd.place}</strong>` : "—"} / ${yd.score || "—"}</td>`;
      } else {
        html += `<td>—</td>`;
      }
    });
    html += `<td class="${bestPlace === 1 ? "best-place" : ""}">${bestPlace || "—"}</td></tr>`;
  });
  html += "</tbody></table></div></div>";
  if (sortedOrgs.length === 0)
    html = '<div class="col-12 text-center text-muted py-5">Нет данных для сводной таблицы</div>';
  container.innerHTML = html;
}

function renderOrgManager() {
  const container = document.getElementById("orgManagerContent");
  let html =
    '<div class="detail-section"><h4 class="detail-section-title">Справочник организаций</h4><p class="text-muted">Всего организаций: ' +
    organizations.length +
    "</p>";
  organizations
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((org) => {
      const teamCount = teamsData.filter((t) => t.orgId === org.id).length;
      html += `<div class="org-manager-item"><span class="org-id">${org.id}</span><div class="org-info"><div class="full-name">${org.fullName}</div><div class="meta">${org.shortName || "—"} | ${org.city || "—"} | Команд: ${teamCount}</div></div><button class="btn btn-outline-danger btn-sm" onclick="deleteOrganization('${org.id}')"><i class="fas fa-trash"></i></button></div>`;
    });
  html += "</div>";
  container.innerHTML = html;
}

function addOrganization() {
  const fullName = prompt("Полное название организации:");
  if (!fullName) return;
  const shortName = prompt("Краткое название (необязательно):") || "";
  const city = prompt("Город (необязательно):") || "";
  const org = findOrCreateOrg(fullName, shortName, city);
  saveData();
  renderOrgManager();
  updateOrgDatalist();
  showToast(`Организация "${org.shortName || org.fullName}" добавлена (ID: ${org.id})`, "success");
}

function deleteOrganization(orgId) {
  const teamCount = teamsData.filter((t) => t.orgId === orgId).length;
  if (teamCount > 0 && !confirm(`Эта организация используется в ${teamCount} командах. Удалить справочную запись?`))
    return;
  organizations = organizations.filter((o) => o.id !== orgId);
  saveData();
  renderOrgManager();
  updateOrgDatalist();
  showToast("Организация удалена", "success");
}

// =====================================================================
// ===== НОВЫЙ ВИЗУАЛЬНЫЙ РЕДАКТОР КРИТЕРИЕВ (БЕЗ JSON) =====
// =====================================================================

const CRITERIA_LIBRARY = {
  groups: [
    {
      id: "qualification",
      name: "Квалификация",
      fields: ["Сумма размерений", "Штрафные баллы", "Вес (кг)", "Бонусные баллы"],
    },
    {
      id: "presentation",
      name: "Презентация",
      fields: ["Структура", "Эффективность", "Новизна", "Перспектива", "Качество"],
    },
    {id: "task2", name: "Задание 2 (движение по траектории)", fields: ["Среднее отклонение", "Баллы"]},
    {id: "task3", name: "Задание 3 (растения на островах)", fields: ["Остров 1", "Остров 2", "Остров 3", "Баллы"]},
    {
      id: "task4",
      name: "Задание 4 (подводные объекты)",
      fields: ["Кол-во объектов", "Баллы", "Бонус за непрерывность"],
    },
    {
      id: "competition",
      name: "Конкурсное задание",
      fields: ["Время (сек)", "Балл за время", "Прохождение ворот", "Парковка", "Нужный гараж", "Штрафные баллы"],
    },
    {id: "extra", name: "Дополнительные баллы", fields: ["За внеконкурсное задание"]},
  ],
};

let currentCriteriaYear = null;
let currentCriteriaClass = null;
let tempCriteria = [];

function openCriteriaEditor(year, classId) {
  currentCriteriaYear = year;
  currentCriteriaClass = classId;
  const config = competitionSettings[year]?.[classId];
  tempCriteria = config?.criteria ? JSON.parse(JSON.stringify(config.criteria)) : [];
  renderCriteriaModal();
  new bootstrap.Modal(document.getElementById("criteriaModal")).show();
}

function renderCriteriaModal() {
  const body = document.getElementById("criteriaModalBody");
  let html = `<h6 class="text-muted mb-3">${currentCriteriaClass.toUpperCase()} — ${currentCriteriaYear} год</h6>`;

  if (tempCriteria.length === 0) {
    html += `<div class="alert alert-info"><i class="fas fa-info-circle me-2"></i>Критерии не заданы. Добавьте группы критериев ниже.</div>`;
  }

  tempCriteria.forEach((group, gIdx) => {
    html += `
      <div class="card mb-3 border-0 shadow-sm">
        <div class="card-header bg-light d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2 flex-grow-1">
            <span class="badge bg-primary">${gIdx + 1}</span>
            <strong>${group.section}</strong>
          </div>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-secondary" onclick="moveGroup(${gIdx}, -1)" ${gIdx === 0 ? "disabled" : ""}><i class="fas fa-chevron-up"></i></button>
            <button class="btn btn-sm btn-outline-secondary" onclick="moveGroup(${gIdx}, 1)" ${gIdx === tempCriteria.length - 1 ? "disabled" : ""}><i class="fas fa-chevron-down"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="removeGroup(${gIdx})"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <div class="card-body p-2">
          <div class="list-group list-group-flush">`;

    group.fields.forEach((field, fIdx) => {
      html += `<div class="list-group-item d-flex justify-content-between align-items-center py-2 px-3">
              <span><i class="fas fa-circle text-muted me-2" style="font-size:0.5rem"></i>${field}</span>
              <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="removeField(${gIdx}, ${fIdx})"><i class="fas fa-times"></i></button>
            </div>`;
    });

    html += `</div><div class="mt-2"><button class="btn btn-sm btn-outline-primary w-100" onclick="addFieldToGroup(${gIdx})"><i class="fas fa-plus me-1"></i>Добавить поле</button></div></div></div>`;
  });

  html += `<div class="dropdown w-100"><button class="btn btn-success w-100 dropdown-toggle" type="button" data-bs-toggle="dropdown"><i class="fas fa-plus me-2"></i>Добавить группу критериев</button><ul class="dropdown-menu w-100">`;

  CRITERIA_LIBRARY.groups.forEach((libGroup) => {
    const alreadyAdded = tempCriteria.some((g) => g.section === libGroup.name);
    html += `<li><a class="dropdown-item ${alreadyAdded ? "text-muted" : ""}" onclick="${alreadyAdded ? "" : `addGroupFromLibrary('${libGroup.id}')`}" ${alreadyAdded ? 'style="pointer-events:none"' : ""}><i class="fas fa-folder me-2"></i>${libGroup.name}${alreadyAdded ? '<span class="badge bg-secondary ms-2">добавлено</span>' : ""}</a></li>`;
  });

  html += `<li><hr class="dropdown-divider"></li><li><a class="dropdown-item" onclick="addCustomGroup()"><i class="fas fa-folder-plus me-2 text-success"></i>Создать свою группу...</a></li></ul></div>`;
  body.innerHTML = html;
}

function addGroupFromLibrary(libGroupId) {
  const libGroup = CRITERIA_LIBRARY.groups.find((g) => g.id === libGroupId);
  if (!libGroup) return;
  if (tempCriteria.some((g) => g.section === libGroup.name)) {
    showToast("Эта группа уже добавлена", "info");
    return;
  }
  tempCriteria.push({section: libGroup.name, fields: [...libGroup.fields]});
  renderCriteriaModal();
}

function addCustomGroup() {
  const name = prompt("Название новой группы критериев:");
  if (!name || !name.trim()) return;
  tempCriteria.push({section: name.trim(), fields: []});
  renderCriteriaModal();
}

function removeGroup(gIdx) {
  if (!confirm(`Удалить группу "${tempCriteria[gIdx].section}" со всеми полями?`)) return;
  tempCriteria.splice(gIdx, 1);
  renderCriteriaModal();
}

function moveGroup(gIdx, direction) {
  const newIdx = gIdx + direction;
  if (newIdx < 0 || newIdx >= tempCriteria.length) return;
  const temp = tempCriteria[gIdx];
  tempCriteria[gIdx] = tempCriteria[newIdx];
  tempCriteria[newIdx] = temp;
  renderCriteriaModal();
}

function addFieldToGroup(gIdx) {
  const group = tempCriteria[gIdx];
  const libGroup = CRITERIA_LIBRARY.groups.find((lg) => lg.name === group.section);
  let availableFields = libGroup ? libGroup.fields.filter((f) => !group.fields.includes(f)) : [];

  let optionsHtml = "";
  if (availableFields.length > 0) {
    optionsHtml = `\n\nДоступные поля из библиотеки:\n${availableFields.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n0 — ввести своё название`;
  }

  const fieldName = prompt(`Добавить поле в группу "${group.section}":${optionsHtml}`);
  if (!fieldName || !fieldName.trim()) return;

  const num = parseInt(fieldName);
  if (!isNaN(num) && num > 0 && num <= availableFields.length) {
    group.fields.push(availableFields[num - 1]);
  } else if (num === 0) {
    const customName = prompt("Введите название поля:");
    if (customName && customName.trim()) group.fields.push(customName.trim());
  } else {
    group.fields.push(fieldName.trim());
  }
  renderCriteriaModal();
}

function removeField(gIdx, fIdx) {
  tempCriteria[gIdx].fields.splice(fIdx, 1);
  renderCriteriaModal();
}

function saveCriteriaFromModal() {
  if (!competitionSettings[currentCriteriaYear]) competitionSettings[currentCriteriaYear] = {};
  if (!competitionSettings[currentCriteriaYear][currentCriteriaClass]) {
    competitionSettings[currentCriteriaYear][currentCriteriaClass] = {date: "", color: "badge-gray", criteria: []};
  }
  competitionSettings[currentCriteriaYear][currentCriteriaClass].criteria = tempCriteria;
  saveData();
  bootstrap.Modal.getInstance(document.getElementById("criteriaModal")).hide();
  renderApparatusManager();
  showToast("Критерии сохранены", "success");
}

function updateClassConfig(year, classId, field, value) {
  if (!competitionSettings[year]) competitionSettings[year] = {};
  if (!competitionSettings[year][classId])
    competitionSettings[year][classId] = {date: "", color: "badge-gray", criteria: []};
  competitionSettings[year][classId][field] = value;
  saveData();
  showToast("Настройки сохранены", "success");
}

function addNewClassToYear() {
  const year = prompt("Введите год (например, 2024):");
  if (!year || !/^\d{4}$/.test(year)) {
    alert("Некорректный год");
    return;
  }
  const classId = prompt("Введите ID класса (латиницей, без пробелов, например: anna):");
  if (!classId || !/^[a-z]+$/.test(classId)) {
    alert("Некорректный ID");
    return;
  }
  if (!competitionSettings[year]) competitionSettings[year] = {};
  if (competitionSettings[year][classId]) {
    alert("Такой класс уже есть в этом году");
    return;
  }
  competitionSettings[year][classId] = {date: "", color: "badge-gray", criteria: []};
  saveData();
  renderApparatusManager();
  showToast(`Класс ${classId.toUpperCase()} добавлен на ${year} год`, "success");
}

// =====================================================================
// ===== ФУНКЦИЯ ОТРИСОВКИ СТРАНИЦЫ НАСТРОЕК (С НОВОЙ КНОПКОЙ) =====
// =====================================================================
function renderApparatusManager() {
  const container = document.getElementById("apparatusContent");
  let html = '<div class="detail-section"><h4 class="detail-section-title">Настройки соревнований по годам</h4>';
  const years = Object.keys(competitionSettings).sort((a, b) => b - a);
  const colorOptions = [
    {val: "badge-bek", label: "🔵 Синий"},
    {val: "badge-tnpa", label: "🟢 Зелёный"},
    {val: "badge-anpa", label: "🟣 Фиолетовый"},
    {val: "badge-anna", label: "🟠 Оранжевый"},
    {val: "badge-red", label: "🔴 Красный"},
    {val: "badge-yellow", label: "🟡 Жёлтый"},
    {val: "badge-gray", label: "⚪ Серый"},
  ];
  years.forEach((year) => {
    html += `<h5 class="mt-4 mb-3 text-primary"><i class="fas fa-calendar me-2"></i>${year} год</h5><div class="row g-3">`;
    const classes = competitionSettings[year];
    for (const [classId, config] of Object.entries(classes)) {
      const teamCount = teamsData.filter(
        (t) => t.year == year && String(t.apparatusClass).toLowerCase().includes(classId),
      ).length;
      const colorSelect = `<select class="form-select form-select-sm" onchange="updateClassConfig('${year}', '${classId}', 'color', this.value)">${colorOptions.map((opt) => `<option value="${opt.val}" ${config.color === opt.val ? "selected" : ""}>${opt.label}</option>`).join("")}</select>`;
      html += `
        <div class="col-md-6 col-lg-4">
          <div class="card h-100 border-0 shadow-sm">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <h6 class="card-title fw-bold mb-0">${classId.toUpperCase()}</h6>
                <span class="badge ${config.color}">${classId.toUpperCase()}</span>
              </div>
              <div class="mb-2">
                <label class="form-label small text-muted mb-1">Дата соревнований</label>
                <input type="text" class="form-control form-control-sm" value="${config.date}" onchange="updateClassConfig('${year}', '${classId}', 'date', this.value)" placeholder="ДД.ММ.ГГГГ">
              </div>
              <div class="mb-2">
                <label class="form-label small text-muted mb-1">Цвет бейджа</label>
                ${colorSelect}
              </div>
              <div class="mt-3 pt-2 border-top">
                <small class="text-muted d-block mb-2">Команд в базе: ${teamCount}</small>
                <button class="btn btn-outline-primary btn-sm w-100" onclick="openCriteriaEditor('${year}', '${classId}')">
                  <i class="fas fa-list-check me-1"></i> Критерии оценки
                </button>
              </div>
            </div>
          </div>
        </div>`;
    }
    html += `</div>`;
  });
  html += `<div class="mt-4 pt-3 border-top"><button class="btn btn-success" onclick="addNewClassToYear()"><i class="fas fa-plus me-2"></i>Добавить новый класс аппаратов</button></div></div>`;
  container.innerHTML = html;
}

// =====================================================================
// ===== СОХРАНЕНИЕ / УДАЛЕНИЕ / ЭКСПОРТ / ИМПОРТ =====
// =====================================================================
async function saveEdit() {
  const orgSearch = document.getElementById("editOrgSearch").value.trim();
  if (!orgSearch) {
    showToast("Укажите название организации", "error");
    return;
  }
  const orgId = document.getElementById("editOrgId").value;
  const shortName = document.getElementById("editShortName").value.trim();
  const city = document.getElementById("editCity").value.trim();
  let org = orgId ? organizations.find((o) => o.id === orgId) : null;
  if (!org) org = findOrCreateOrg(orgSearch, shortName, city);
  else {
    if (shortName) org.shortName = shortName;
    if (city) org.city = city;
  }
  const year = parseInt(document.getElementById("editYear").value) || 2026;
  const photoLinks = getPhotoLinks();
  const memberDivs = document.querySelectorAll("#editMembersContainer .border");
  const members = [];
  memberDivs.forEach((div) => {
    const fio = div.querySelector(".member-fio-input").value.trim();
    if (fio)
      members.push({
        fio,
        birth: div.querySelector(".member-birth-input").value,
        passport: div.querySelector(".member-passport-input").value,
        isStudent: div.querySelector(".member-student-input").value,
        order: div.querySelector(".member-order-input").value,
      });
  });
  const teamData = {
    orgId: org.id,
    year,
    shortName,
    city,
    region: document.getElementById("editRegion").value,
    postalCode: document.getElementById("editPostalCode").value,
    address: document.getElementById("editAddress").value,
    phone: document.getElementById("editPhone").value,
    email: document.getElementById("editEmail").value,
    orgLeader: document.getElementById("editOrgLeader").value,
    apparatusClass: document.getElementById("editApparatusClass").value,
    apparatusName: document.getElementById("editApparatusName").value,
    description: document.getElementById("editDescription").value,
    teamLeader: document.getElementById("editTeamLeader").value,
    teamLeaderPhone: document.getElementById("editTeamLeaderPhone").value,
    photos: photoLinks,
    members,
  };
  if (isNewTeam || !currentTeamId) {
    const newTeam = {
      id: document.getElementById("editId").value,
      created: document.getElementById("editCreated").value,
      ...teamData,
    };
    teamsData.push(newTeam);
    currentTeamId = newTeam.id;
    isNewTeam = false;
  } else {
    const team = teamsData.find((t) => t.id === currentTeamId);
    if (team) Object.assign(team, teamData);
  }
  saveData();
  const ghSettings = getGitHubSettings();
  if (ghSettings?.owner && ghSettings?.repo && ghSettings?.token) {
    showToast("Сохранение в GitHub...", "info");
    const result = await commitToGitHub();
    showToast(result.message, result.success ? "success" : "error");
  } else {
    showToast("Данные сохранены локально", "success");
  }
  if (returnToView === "competition") showCompetitionView();
  else showTeamDetails(currentTeamId);
}

function deleteTeam() {
  if (!currentTeamId || isNewTeam) {
    showToast("Нечего удалять", "error");
    return;
  }
  const team = teamsData.find((t) => t.id === currentTeamId);
  if (!team) return;
  const displayName = getTeamDisplayName(team);
  if (!confirm(`Вы уверены, что хотите удалить команду "${displayName}"? Это действие необратимо.`)) return;
  teamsData = teamsData.filter((t) => t.id !== currentTeamId);
  saveData();
  const ghSettings = getGitHubSettings();
  if (ghSettings?.owner && ghSettings?.repo && ghSettings?.token) {
    showToast("Удаление команды...", "info");
    commitToGitHub().then((result) => {
      showToast(
        result.success ? `Команда "${displayName}" удалена` : result.message + " (удалено локально)",
        result.success ? "success" : "error",
      );
    });
  } else {
    showToast(`Команда "${displayName}" удалена`, "success");
  }
  showTeamsView();
}

function downloadJSON() {
  if (teamsData.length === 0 && organizations.length === 0) {
    showToast("Нет данных", "error");
    return;
  }
  const dataToSave = {organizations, competitionSettings, teams: teamsData};
  const dataStr = JSON.stringify(dataToSave, null, 2);
  const blob = new Blob([dataStr], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "teams.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function attachFileInputListener() {
  const input = document.getElementById("fileInput");
  if (!input) return;
  input.addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const rawData = JSON.parse(e.target.result);
        if (rawData.organizations && rawData.teams) {
          organizations = rawData.organizations || [];
          competitionSettings = rawData.competitionSettings || getDefaultCompetitionSettings();
          teamsData = rawData.teams || [];
          showToast("Данные загружены", "success");
        } else if (Array.isArray(rawData) && rawData.length > 0 && Array.isArray(rawData[0])) {
          teamsData = transformYandexFormsData(rawData);
          showToast("Данные загружены из формата Яндекс.Форм", "success");
        } else if (
          Array.isArray(rawData) &&
          rawData.length > 0 &&
          typeof rawData[0] === "object" &&
          rawData[0].organization
        ) {
          teamsData = rawData;
          showToast("Данные загружены", "success");
        } else {
          throw new Error("Неизвестный формат данных");
        }
        saveData();
        renderTeams(teamsData);
        showTeamsView();
      } catch (err) {
        showToast("Ошибка чтения JSON: " + err.message, "error");
        console.error(err);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  });
}

function handleEditPageFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const rawData = JSON.parse(e.target.result);
      if (rawData.organizations && rawData.teams) {
        organizations = rawData.organizations || [];
        competitionSettings = rawData.competitionSettings || getDefaultCompetitionSettings();
        teamsData = rawData.teams || [];
        showToast("Данные загружены", "success");
      } else if (Array.isArray(rawData) && rawData.length > 0 && Array.isArray(rawData[0])) {
        teamsData = transformYandexFormsData(rawData);
        showToast("Данные загружены из формата Яндекс.Форм", "success");
      } else if (
        Array.isArray(rawData) &&
        rawData.length > 0 &&
        typeof rawData[0] === "object" &&
        rawData[0].organization
      ) {
        teamsData = rawData;
        showToast("Данные загружены", "success");
      } else {
        throw new Error("Неизвестный формат данных");
      }
      saveData();
      renderTeams(teamsData);
      showTeamsView();
    } catch (err) {
      showToast("Ошибка чтения JSON: " + err.message, "error");
      console.error(err);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function runMigration() {
  bootstrap.Modal.getInstance(document.getElementById("migrationModal")).hide();
  const success = migrateData();
  if (success) {
    saveData();
    showToast("Миграция завершена успешно!", "success");
    loadData();
    renderTeams(teamsData);
    renderHeaderButtons();
    showTeamsView();
  } else {
    showToast("Миграция не удалась", "error");
  }
}

async function loadDefaultData() {
  if (loadData()) {
    renderTeams(teamsData);
    renderHeaderButtons();
    attachFileInputListener();
    return;
  }
  if (localStorage.getItem(STORAGE_KEY_OLD)) {
    new bootstrap.Modal(document.getElementById("migrationModal")).show();
    return;
  }
  try {
    const response = await fetch("data/teams.json");
    if (!response.ok) throw new Error("Файл не найден");
    const rawData = await response.json();
    if (rawData.organizations && rawData.teams) {
      organizations = rawData.organizations || [];
      competitionSettings = rawData.competitionSettings || getDefaultCompetitionSettings();
      teamsData = rawData.teams || [];
    } else if (Array.isArray(rawData) && rawData.length > 0 && Array.isArray(rawData[0])) {
      teamsData = transformYandexFormsData(rawData);
    } else if (
      Array.isArray(rawData) &&
      rawData.length > 0 &&
      typeof rawData[0] === "object" &&
      rawData[0].organization
    ) {
      teamsData = rawData;
    } else {
      throw new Error("Неизвестный формат данных");
    }
    saveData();
    renderTeams(teamsData);
  } catch (error) {
    document.getElementById("teamsContainer").innerHTML =
      `<div class="col-12 text-center text-muted py-5"><i class="fas fa-exclamation-triangle fa-2x mb-2" style="color:#f59e0b"></i><div>Не удалось загрузить <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">data/teams.json</code>.<br>Войдите в режим Админ и загрузите файл вручную.</div></div>`;
  }
  renderHeaderButtons();
  attachFileInputListener();
}

renderHeaderButtons();
loadDefaultData();
