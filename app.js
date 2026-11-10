let teamsData = [];
let organizations = [];
let competitionSettings = {};
let apparatusClasses = [];
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
      bek: {date: "28.11.2026", criteria: []},
      tnpa: {date: "28.11.2026", criteria: []},
      anpa: {date: "29.11.2026", criteria: []},
      anna: {date: "29.11.2026", criteria: []},
    },
    2025: {
      bek: {date: "28.11.2025", criteria: []},
      tnpa: {date: "28.11.2025", criteria: []},
      anpa: {date: "29.11.2025", criteria: []},
    },
    2024: {
      anna: {
        date: "01.11.2024",
        criteria: [
          {
            section: "Квалификация",
            fields: [
              {name: "Сумма размерений", short: "Разм."},
              {name: "Штрафные баллы", short: "Штраф"},
              {name: "Вес (кг)", short: "Вес"},
              {name: "Бонусные баллы", short: "Бонус"},
            ],
          },
          {
            section: "Презентация",
            fields: [
              {name: "Структура", short: "Структ."},
              {name: "Эффективность", short: "Эффект."},
              {name: "Новизна", short: "Нов."},
              {name: "Перспектива", short: "Персп."},
              {name: "Качество", short: "Кач."},
            ],
          },
          {
            section: "Задание 2 (траектория)",
            fields: [
              {name: "Среднее отклонение", short: "Отклон."},
              {name: "Баллы", short: "Баллы"},
            ],
          },
          {
            section: "Задание 3 (растения)",
            fields: [
              {name: "Остров 1", short: "Остр. 1"},
              {name: "Остров 2", short: "Остр. 2"},
              {name: "Остров 3", short: "Остр. 3"},
              {name: "Баллы", short: "Баллы"},
            ],
          },
          {
            section: "Задание 4 (объекты)",
            fields: [
              {name: "Кол-во объектов", short: "Объекты"},
              {name: "Баллы", short: "Баллы"},
              {name: "Бонус за непрерывность", short: "Бонус"},
            ],
          },
        ],
      },
    },
  };
}

// ===== СПРАВОЧНИК КЛАССОВ: СПРАВОЧНЫЕ ДАННЫЕ =====
const DEFAULT_CLASS_NAMES = {bek: "БЭК", tnpa: "ТНПА", anpa: "АНПА", anna: "АННА"};
const DEFAULT_CLASS_COLORS = {bek: "badge-bek", tnpa: "badge-tnpa", anpa: "badge-anpa", anna: "badge-anna"};

// Собирает справочник классов из сохранённых данных или из настроек по умолчанию
function ensureApparatusClasses() {
  if (Array.isArray(apparatusClasses) && apparatusClasses.length > 0) {
    apparatusClasses.forEach((c) => {
      if (!c.name) c.name = DEFAULT_CLASS_NAMES[c.id] || c.id.toUpperCase();
      if (!c.color) c.color = "badge-gray";
    });
    return;
  }
  const map = {};
  Object.entries(DEFAULT_CLASS_NAMES).forEach(([id, name]) => {
    map[id] = {id, name, color: DEFAULT_CLASS_COLORS[id] || "badge-gray"};
  });
  for (const year in competitionSettings) {
    for (const key in competitionSettings[year]) {
      if (!map[key]) {
        const cfg = competitionSettings[year][key];
        map[key] = {
          id: key,
          name: cfg.name || DEFAULT_CLASS_NAMES[key] || key.toUpperCase(),
          color: cfg.color || "badge-gray",
        };
      }
    }
  }
  apparatusClasses = Object.values(map);
}

function getClassInfo(classId) {
  return (
    apparatusClasses.find((c) => c.id === classId) || {
      id: classId,
      name: DEFAULT_CLASS_NAMES[classId] || String(classId).toUpperCase(),
      color: "badge-gray",
    }
  );
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
      showToast(`✓ Подключено: ${(await res.json()).full_name}`, "success");
    } else {
      showToast(`✗ Ошибка: ${(await res.json()).message}`, "error");
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
  const dataToSave = {organizations, apparatusClasses, competitionSettings, teams: teamsData};
  const jsonStr = JSON.stringify(dataToSave, null, 2);
  const content = btoa(unescape(encodeURIComponent(jsonStr)));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let sha = null;
      const getRes = await fetch(`${apiUrl}?ref=${settings.branch}`, {headers});
      if (getRes.ok) {
        sha = (await getRes.json()).sha;
      } else if (getRes.status !== 404) {
        return {success: false, message: `Ошибка чтения файла: ${(await getRes.json()).message}`};
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

// ===== БЕЙДЖ КЛАССА (берёт имя и цвет из справочника классов) =====
function getCategoryBadge(apparatusClass, extraClass = "", year = currentYear) {
  const value = String(apparatusClass || "")
    .trim()
    .toLowerCase();
  const info = apparatusClasses.find((c) => value.includes(c.id) || value.includes(c.name.toLowerCase()));
  if (!info) return `<span class="badge category-badge ${extraClass} bg-secondary text-white">Н/Д</span>`;
  return `<span class="badge category-badge ${extraClass} ${info.color}">${info.name}</span>`;
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

// ===== МИГРАЦИЯ СТАРЫХ ДАННЫХ =====
function migrateData() {
  const oldData = localStorage.getItem(STORAGE_KEY_OLD);
  if (!oldData) return false;
  try {
    const oldTeams = JSON.parse(oldData);
    if (!Array.isArray(oldTeams) || oldTeams.length === 0) return false;
    organizations = [];
    competitionSettings = getDefaultCompetitionSettings();
    apparatusClasses = [];
    ensureApparatusClasses();
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
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({organizations, apparatusClasses, competitionSettings, teams: teamsData}),
    );
    localStorage.removeItem(STORAGE_KEY_OLD);
    return true;
  } catch (e) {
    console.error("Ошибка миграции:", e);
    return false;
  }
}

function saveData() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({organizations, apparatusClasses, competitionSettings, teams: teamsData}),
    );
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
      competitionSettings = normalizeCompetitionSettings(parsed.competitionSettings || getDefaultCompetitionSettings());
      apparatusClasses = parsed.apparatusClasses || [];
      ensureApparatusClasses();
      teamsData = parsed.teams || [];
      return true;
    }
  } catch (e) {
    console.warn("Ошибка чтения:", e);
  }
  return false;
}

// ===== ШАПКА =====
function renderHeaderButtons() {
  const container = document.getElementById("headerButtons");
  const adminButtons = isAdmin
    ? `<div class="dropdown">
         <button class="btn btn-outline-primary btn-upload dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="fas fa-folder-open"></i><span class="btn-text ms-2">Проект</span></button>
         <ul class="dropdown-menu dropdown-menu-end">
           <li><label for="fileInput" class="dropdown-item" style="cursor:pointer"><i class="fas fa-file-upload me-2 text-primary"></i>Загрузить JSON</label></li>
           <li><a class="dropdown-item" href="#" onclick="downloadJSON(); return false;"><i class="fas fa-download me-2 text-success"></i>Скачать JSON</a></li>
           <li><hr class="dropdown-divider"></li>
           <li><a class="dropdown-item" href="#" onclick="commitToGitHubManual(); return false;"><i class="fab fa-github me-2"></i>Отправить данные на GitHub</a></li>
           <li><a class="dropdown-item" href="#" onclick="openGitHubSettings(); return false;"><i class="fas fa-cog me-2 text-muted"></i>Настройки GitHub…</a></li>
         </ul>
       </div>
       <div class="dropdown">
         <button class="btn btn-outline-info btn-upload dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="fas fa-book"></i><span class="btn-text ms-2">Справочники</span></button>
         <ul class="dropdown-menu dropdown-menu-end">
           <li><a class="dropdown-item" href="#" onclick="showOrgManager(); return false;"><i class="fas fa-building me-2 text-primary"></i>Организации</a></li>
           <li><a class="dropdown-item" href="#" onclick="showApparatusManager(); return false;"><i class="fas fa-robot me-2 text-warning"></i>Классы аппаратов</a></li>
         </ul>
       </div>
       <button class="btn btn-primary btn-upload" onclick="createNewTeam()"><i class="fas fa-plus"></i><span class="btn-text ms-2">Команда</span></button>`
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

async function commitToGitHubManual() {
  const settings = getGitHubSettings();
  if (!settings?.owner || !settings?.repo || !settings?.token) {
    showToast("Сначала настройте подключение к GitHub", "error");
    openGitHubSettings();
    return;
  }
  showToast("Отправка данных на GitHub...", "info");
  const result = await commitToGitHub();
  showToast(result.message, result.success ? "success" : "error");
}

function renderYearSwitcher() {
  const container = document.getElementById("yearSwitcher");
  const isMaster = currentView === "master";
  const years = [2026, 2025, 2024];
  container.innerHTML = `<div class="toolbar-row">
    <span class="toolbar-label">Год</span>
    <select class="form-select year-select" onchange="switchYear(parseInt(this.value, 10))" ${isMaster ? "disabled" : ""}>
      ${years.map((y) => `<option value="${y}" ${currentYear === y ? "selected" : ""}>${y}</option>`).join("")}
    </select>
    <button type="button" class="toolbar-master ${isMaster ? "active" : ""}" onclick="showMasterTable()">
      <i class="fas fa-table me-1"></i>Сводная таблица
    </button>
  </div>`;
  container.style.display = "block";
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

// ===== УТИЛИТЫ КОМАНД =====
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

// ===== СПИСКИ КОМАНД =====
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
    for (const key in yearSettings) {
      const info = getClassInfo(key);
      groups[key] = {...yearSettings[key], id: key, name: info.name, color: info.color, teams: []};
    }
    groups["other"] = {name: "Н/Д", color: "bg-secondary text-white", date: "", teams: []};

    sortedTeams.forEach((team) => {
      const val = String(team.apparatusClass || "").toLowerCase();
      let foundKey = null;
      for (const key in yearSettings) {
        const info = getClassInfo(key);
        if (val.includes(key.toLowerCase()) || val.includes(info.name.toLowerCase())) {
          foundKey = key;
          break;
        }
      }
      groups[foundKey || "other"].teams.push(team);
    });

    for (const key in groups) {
      if (groups[key].teams.length > 0) {
        const g = groups[key];
        html += `<div class="col-12 mt-4"><div class="group-header"><div class="group-header-left"><span class="badge category-badge ${g.color}" style="font-size:1rem;padding:0.5rem 0.85rem">${g.name}</span><span class="group-header-title">${g.name}</span></div>${g.date ? `<span class="group-date-badge">${g.date}</span>` : ""}</div></div><div class="row g-3 mb-4">${g.teams.map((team) => renderTeamCard(team)).join("")}</div>`;
      }
    }
  }
  container.innerHTML = html;
}

// ===== НАВИГАЦИЯ =====
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

// ===== ДЕТАЛИ КОМАНДЫ =====
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

// ===== РЕДАКТИРОВАНИЕ КОМАНДЫ =====
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
  const now = new Date();
  document.getElementById("editCreated").value =
    `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
  document.getElementById("photoLinksContainer").innerHTML = "";
  addPhotoLinkField();
  document.getElementById("editMembersContainer").innerHTML = "";
  addMemberField();
  document.getElementById("btnDeleteTeam").style.display = "none";
  updateOrgDatalist();
  updateClassDatalist();
  updateTeamIdPreview();
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
  updateClassDatalist();
  updateTeamIdPreview();
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
    if (org && org.shortName) document.getElementById("editShortName").value = org.shortName;
    updateTeamIdPreview();
  }
  if (e.target.id === "editApparatusClass") {
    updateTeamIdPreview();
  }
});

// ===== ID КОМАНДЫ И СПИСКИ ПОДСТАНОВКИ =====
function normalizeCompetitionSettings(settings) {
  for (const year in settings) {
    for (const key in settings[year]) {
      const cfg = settings[year][key];
      if (!cfg.name) cfg.name = DEFAULT_CLASS_NAMES[key] || key.toUpperCase();
      if (!cfg.color) cfg.color = DEFAULT_CLASS_COLORS[key] || "badge-gray";
      if (!Array.isArray(cfg.criteria)) cfg.criteria = [];
    }
  }
  return settings;
}

function getClassIdByValue(apparatusClass, year = currentYear) {
  const value = String(apparatusClass || "")
    .trim()
    .toLowerCase();
  const yearSettings = competitionSettings[year] || {};
  for (const key in yearSettings) {
    const info = getClassInfo(key);
    if (value.includes(key.toLowerCase()) || value.includes(info.name.toLowerCase())) return key;
  }
  return "na";
}

// Формат: IDорг-Год-Класс(лат)-[номер при дубле]
function generateTeamId(orgId, year, classId) {
  const base = `${orgId}-${year}-${classId || "na"}`;
  let id = base;
  let n = 2;
  while (teamsData.some((t) => t.id === id)) {
    id = `${base}-${n}`;
    n++;
  }
  return id;
}

function updateTeamIdPreview() {
  const idEl = document.getElementById("editId");
  const orgViewEl = document.getElementById("editOrgIdView");
  if (!idEl) return;
  const year = parseInt(document.getElementById("editYear").value) || currentYear;
  const orgId = document.getElementById("editOrgId").value;
  const displayOrgId = orgId || getNextOrgId();
  if (orgViewEl) orgViewEl.value = displayOrgId;
  if (!isNewTeam && currentTeamId) return; // при редактировании существующей команды ID не меняем
  const classId = getClassIdByValue(document.getElementById("editApparatusClass").value, year);
  idEl.value = generateTeamId(displayOrgId, year, classId);
}

function updateClassDatalist() {
  const datalist = document.getElementById("classDatalist");
  if (!datalist) return;
  const year = parseInt(document.getElementById("editYear").value) || currentYear;
  const yearSettings = competitionSettings[year] || {};
  datalist.innerHTML = Object.keys(yearSettings)
    .map((key) => `<option value="${getClassInfo(key).name}"></option>`)
    .join("");
}

function onEditYearChange() {
  updateClassDatalist();
  updateTeamIdPreview();
}

function addMemberField(member = null) {
  const container = document.getElementById("editMembersContainer");
  const idx = container.children.length;
  const div = document.createElement("div");
  div.className = "border rounded p-3 mb-3";
  div.style.borderColor = "#e2e8f0";
  div.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-3"><h6 class="mb-0 fw-bold" style="font-family:'Manrope',sans-serif;color:#0f172a">Участник ${idx + 1}</h6><button type="button" class="btn btn-outline-danger btn-sm" style="border-radius:6px" onclick="this.closest('.border').remove()"><i class="fas fa-trash"></i></button></div><div class="row g-3"><div class="col-md-6"><label class="form-label">ФИО</label><input type="text" class="form-control member-fio-input" value="${member?.fio || ""}"></div><div class="col-md-6"><label class="form-label">Дата рождения</label><input type="date" class="form-control member-birth-input" value="${member?.birth || ""}"></div><div class="col-md-6"><label class="form-label">Паспорт/Св-во</label><input type="text" class="form-control member-passport-input" value="${member?.passport || ""}"></div><div class="col-md-6"><label class="form-label">Студент</label><select class="form-select member-student-input"><option value="Нет" ${member?.isStudent !== "Да" ? "selected" : ""}>Нет</option><option value="Да" ${member?.isStudent === "Да" ? "selected" : ""}>Да</option></select></div><div class="col-12"><label class="form-label">Приказ о зачислении</label><input type="text" class="form-control member-order-input" value="${member?.order || ""}"></div></div>`;
  container.appendChild(div);
}

// ===== СОРЕВНОВАНИЯ =====
function renderCompetition() {
  const container = document.getElementById("competitionContent");
  const yearSettings = competitionSettings[currentYear] || {};
  let html = "";
  for (const classId in yearSettings) {
    const g = yearSettings[classId];
    const info = getClassInfo(classId);
    const teams = teamsData.filter(
      (t) =>
        (t.year === currentYear &&
          String(t.apparatusClass || "")
            .toLowerCase()
            .includes(classId.toLowerCase())) ||
        (t.year === currentYear &&
          String(t.apparatusClass || "")
            .toLowerCase()
            .includes(info.name.toLowerCase())),
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
    const title = info.name;
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

// ===== ПРОТОКОЛ =====
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
  const groups = Object.keys(yearSettings).map((classId) => {
    const info = getClassInfo(classId);
    return {classId, filter: (v) => v.includes(classId.toLowerCase()) || v.includes(info.name.toLowerCase())};
  });
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

// ===== СВОДНАЯ ТАБЛИЦА =====
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

// ===== РУЧНОЕ ОБЪЕДИНЕНИЕ ОРГАНИЗАЦИЙ =====

function toggleMergeMode() {
  mergeMode = !mergeMode;
  mergeSelectedIds = [];
  mergeEditor = null;
  renderOrgManager();
}

function toggleMergeSelection(orgId) {
  const i = mergeSelectedIds.indexOf(orgId);
  if (i >= 0) mergeSelectedIds.splice(i, 1);
  else mergeSelectedIds.push(orgId);
  renderOrgManager();
}

function openMergeEditor() {
  if (mergeSelectedIds.length < 2) {
    showToast("Отметьте минимум две записи", "error");
    return;
  }
  const orgs = mergeSelectedIds.map((id) => organizations.find((o) => o.id === id)).filter(Boolean);
  const longest = orgs.reduce((a, b) => ((b.fullName || "").length > (a.fullName || "").length ? b : a));
  const firstNonEmpty = (f) => {
    for (const o of orgs) {
      if (o[f]) return o[f];
    }
    return "";
  };
  mergeEditor = {
    ids: mergeSelectedIds.slice(),
    keepId: longest.id,
    choices: {fullName: longest.fullName || "", shortName: firstNonEmpty("shortName"), city: firstNonEmpty("city")},
  };
  renderOrgManager();
}

function cancelMergeEditor() {
  mergeEditor = null;
  renderOrgManager();
}

function setMergeChoice(field, value) {
  if (mergeEditor) mergeEditor.choices[field] = value;
}

function setMergeKeep(id) {
  if (mergeEditor) {
    mergeEditor.keepId = id;
    renderOrgManager();
  }
}

function applyMerge() {
  if (!mergeEditor) return;
  const kept = organizations.find((o) => o.id === mergeEditor.keepId);
  if (!kept) {
    showToast("Оставляемая запись не найдена", "error");
    return;
  }
  if (!mergeEditor.choices.fullName || !mergeEditor.choices.fullName.trim()) {
    showToast("Укажите полное название", "error");
    return;
  }
  const removeIds = mergeEditor.ids.filter((id) => id !== mergeEditor.keepId);
  const moved = removeIds.reduce((s, id) => s + teamsData.filter((t) => t.orgId === id).length, 0);
  if (
    !confirm(
      `Объединить записи?\n\nОстанется: ${mergeEditor.keepId} — «${mergeEditor.choices.fullName}»\nБудут удалены: ${removeIds.join(", ") || "—"}\nКоманд будет перенесено: ${moved}\n\nПродолжить?`,
    )
  )
    return;
  kept.fullName = mergeEditor.choices.fullName.trim();
  kept.shortName = (mergeEditor.choices.shortName || "").trim();
  kept.city = (mergeEditor.choices.city || "").trim();
  teamsData.forEach((t) => {
    if (removeIds.includes(t.orgId)) t.orgId = kept.id;
  });
  organizations = organizations.filter((o) => !removeIds.includes(o.id));
  mergeEditor = null;
  mergeMode = false;
  mergeSelectedIds = [];
  saveData();
  renderOrgManager();
  updateOrgDatalist();
  showToast(`Записи объединены. Команд перенесено: ${moved}.`, "success");
}

// ===== РУЧНОЕ ОБЪЕДИНЕНИЕ ОРГАНИЗАЦИЙ =====
let mergeMode = false;
let mergeSelectedIds = [];
let mergeEditor = null;

function toggleMergeMode() {
  mergeMode = !mergeMode;
  mergeSelectedIds = [];
  mergeEditor = null;
  renderOrgManager();
}

function toggleMergeSelection(orgId) {
  const i = mergeSelectedIds.indexOf(orgId);
  if (i >= 0) mergeSelectedIds.splice(i, 1);
  else mergeSelectedIds.push(orgId);
  renderOrgManager();
}

function openMergeEditor() {
  if (mergeSelectedIds.length < 2) {
    showToast("Отметьте минимум две записи", "error");
    return;
  }
  const orgs = mergeSelectedIds.map((id) => organizations.find((o) => o.id === id)).filter(Boolean);
  const longest = orgs.reduce((a, b) => ((b.fullName || "").length > (a.fullName || "").length ? b : a));
  const firstNonEmpty = (f) => {
    for (const o of orgs) {
      if (o[f]) return o[f];
    }
    return "";
  };
  mergeEditor = {
    ids: mergeSelectedIds.slice(),
    keepId: longest.id,
    choices: {fullName: longest.fullName || "", shortName: firstNonEmpty("shortName"), city: firstNonEmpty("city")},
  };
  renderOrgManager();
}

function cancelMergeEditor() {
  mergeEditor = null;
  renderOrgManager();
}

function setMergeChoice(field, value) {
  if (mergeEditor) mergeEditor.choices[field] = value;
}

function setMergeKeep(id) {
  if (mergeEditor) {
    mergeEditor.keepId = id;
    renderOrgManager();
  }
}

function applyMerge() {
  if (!mergeEditor) return;
  const kept = organizations.find((o) => o.id === mergeEditor.keepId);
  if (!kept) {
    showToast("Оставляемая запись не найдена", "error");
    return;
  }
  if (!mergeEditor.choices.fullName || !mergeEditor.choices.fullName.trim()) {
    showToast("Укажите полное название", "error");
    return;
  }
  const removeIds = mergeEditor.ids.filter((id) => id !== mergeEditor.keepId);
  const moved = removeIds.reduce((s, id) => s + teamsData.filter((t) => t.orgId === id).length, 0);
  if (
    !confirm(
      `Объединить записи?\n\nОстанется: ${mergeEditor.keepId} — «${mergeEditor.choices.fullName}»\nБудут удалены: ${removeIds.join(", ") || "—"}\nКоманд будет перенесено: ${moved}\n\nПродолжить?`,
    )
  )
    return;
  kept.fullName = mergeEditor.choices.fullName.trim();
  kept.shortName = (mergeEditor.choices.shortName || "").trim();
  kept.city = (mergeEditor.choices.city || "").trim();
  teamsData.forEach((t) => {
    if (removeIds.includes(t.orgId)) t.orgId = kept.id;
  });
  organizations = organizations.filter((o) => !removeIds.includes(o.id));
  mergeEditor = null;
  mergeMode = false;
  mergeSelectedIds = [];
  saveData();
  renderOrgManager();
  updateOrgDatalist();
  showToast(`Записи объединены. Команд перенесено: ${moved}.`, "success");
}

function renderOrgManager() {
  const container = document.getElementById("orgManagerContent");

  // ----- Режим редактора объединения -----
  if (mergeEditor) {
    const orgs = mergeEditor.ids.map((id) => organizations.find((o) => o.id === id)).filter(Boolean);
    let html = `<div class="detail-section"><h4 class="detail-section-title">Объединение записей организаций</h4>
      <p class="text-muted small">Выберите, какие значения сохранить в каждом поле. Запись с выбранным ID останется, остальные будут удалены, а их команды привязаны к оставленной.</p>`;

    html += `<h6 class="mb-2">Оставить ID записи:</h6><div class="mb-3">`;
    orgs.forEach((o) => {
      const cnt = teamsData.filter((t) => t.orgId === o.id).length;
      html += `<div class="form-check form-check-inline">
        <input class="form-check-input" type="radio" name="mergeKeep" id="keep_${o.id}" ${mergeEditor.keepId === o.id ? "checked" : ""} onchange="setMergeKeep('${o.id}')">
        <label class="form-check-label" for="keep_${o.id}"><code>${o.id}</code> (команд: ${cnt})</label>
      </div>`;
    });
    html += `</div>`;

    const fields = [
      {key: "fullName", label: "Полное название", required: true},
      {key: "shortName", label: "Краткое название", required: false},
      {key: "city", label: "Город", required: false},
    ];
    fields.forEach((f) => {
      const values = [];
      orgs.forEach((o) => {
        const v = o[f.key] || "";
        if (!values.includes(v)) values.push(v);
      });
      if (!f.required && !values.includes("")) values.push("");
      html += `<div class="mb-3"><h6 class="mb-2">${f.label}:</h6>`;
      values.forEach((v, i) => {
        html += `<div class="form-check">
          <input class="form-check-input" type="radio" name="merge_${f.key}" id="mf_${f.key}_${i}" ${mergeEditor.choices[f.key] === v ? "checked" : ""} onchange="setMergeChoice('${f.key}', this.value)" value="${v.replace(/"/g, "&quot;")}">
          <label class="form-check-label" for="mf_${f.key}_${i}">${v ? v : "<em class='text-muted'>(не указано)</em>"}</label>
        </div>`;
      });
      html += `</div>`;
    });

    const removeIds = mergeEditor.ids.filter((id) => id !== mergeEditor.keepId);
    const movedPreview = removeIds.reduce((s, id) => s + teamsData.filter((t) => t.orgId === id).length, 0);
    html += `<div class="alert alert-warning small"><i class="fas fa-exclamation-triangle me-2"></i>Будет удалено записей: <strong>${removeIds.length}</strong> (${removeIds.map((id) => `<code>${id}</code>`).join(", ") || "—"}). Команд будет привязано к оставленной записи: <strong>${movedPreview}</strong>.</div>
      <div class="d-flex gap-2">
        <button class="btn btn-primary" onclick="applyMerge()"><i class="fas fa-code-merge me-2"></i>Объединить</button>
        <button class="btn btn-outline-secondary" onclick="cancelMergeEditor()">Отмена</button>
      </div></div>`;
    container.innerHTML = html;
    return;
  }

  // ----- Обычный список -----
  let html =
    '<div class="detail-section"><h4 class="detail-section-title">Справочник организаций</h4><div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><p class="text-muted mb-0">Всего организаций: ' +
    organizations.length +
    '</p><div class="d-flex gap-2"><button class="btn btn-outline-warning btn-sm" onclick="mergeDuplicateOrganizations()"><i class="fas fa-wand-magic-sparkles me-1"></i>Убрать дубликаты (авто)</button><button class="btn btn-outline-secondary btn-sm" onclick="toggleMergeMode()"><i class="fas fa-code-merge me-1"></i>' +
    (mergeMode ? "Отменить объединение" : "Объединить записи…") +
    "</button></div></div>";

  if (mergeMode) {
    html += `<div class="alert alert-info py-2 small"><i class="fas fa-info-circle me-2"></i>Отметьте галочками записи, которые нужно объединить.${mergeSelectedIds.length >= 2 ? ` <button class="btn btn-primary btn-sm ms-2" onclick="openMergeEditor()">Объединить выбранные (${mergeSelectedIds.length})</button>` : ""}</div>`;
  }

  organizations
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((org) => {
      const teamCount = teamsData.filter((t) => t.orgId === org.id).length;
      const checked = mergeSelectedIds.includes(org.id);
      const checkbox = mergeMode
        ? `<input class="form-check-input me-2" type="checkbox" style="min-width:20px" ${checked ? "checked" : ""} onchange="toggleMergeSelection('${org.id}')">`
        : "";
      html += `<div class="org-manager-item" ${checked ? 'style="border-color:#0d6efd;background:#f8f9ff"' : ""}><span class="org-id">${org.id}</span>${checkbox}<div class="org-info"><div class="full-name">${org.fullName}</div><div class="meta">${org.shortName || "—"} | ${org.city || "—"} | Команд: ${teamCount}</div></div><button class="btn btn-outline-danger btn-sm" onclick="deleteOrganization('${org.id}')"><i class="fas fa-trash"></i></button></div>`;
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

// ===== СЛИЯНИЕ ДУБЛИКАТОВ ОРГАНИЗАЦИЙ =====
function mergeDuplicateOrganizations() {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const n = organizations.length;
  const parent = organizations.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = organizations[i],
        b = organizations[j];
      const af = norm(a.fullName),
        bf = norm(b.fullName);
      const as = norm(a.shortName),
        bs = norm(b.shortName);
      const isDup =
        (af && af === bf) || // одинаковые полные названия
        (as && bs && as === bs) || // одинаковые краткие названия
        (as && as === bf) || // краткое одной = полное другой
        (bs && bs === af);
      if (isDup) union(i, j);
    }
  }

  const clusters = {};
  for (let i = 0; i < n; i++) {
    const r = find(i);
    (clusters[r] = clusters[r] || []).push(i);
  }
  const merges = Object.values(clusters).filter((c) => c.length > 1);
  if (merges.length === 0) {
    showToast("Дубликаты не найдены", "info");
    return;
  }

  const report = merges.map((c) => c.map((i) => `«${organizations[i].fullName}»`).join("  =  ")).join("\n");
  if (
    !confirm(
      `Будут объединены дубликаты:\n\n${report}\n\nОстанется запись с самым полным названием, все команды будут привязаны к ней. Продолжить?`,
    )
  )
    return;

  const removeIds = new Set();
  merges.forEach((c) => {
    const keepIdx = c.reduce(
      (best, i) => (organizations[i].fullName.length > organizations[best].fullName.length ? i : best),
      c[0],
    );
    const keep = organizations[keepIdx];
    c.forEach((i) => {
      if (i === keepIdx) return;
      const dup = organizations[i];
      teamsData.forEach((t) => {
        if (t.orgId === dup.id) t.orgId = keep.id;
      });
      if (!keep.shortName && dup.shortName) keep.shortName = dup.shortName;
      if (!keep.city && dup.city) keep.city = dup.city;
      removeIds.add(dup.id);
    });
  });
  organizations = organizations.filter((o) => !removeIds.has(o.id));
  saveData();
  renderOrgManager();
  updateOrgDatalist();
  showToast("Дубликаты объединены", "success");
}

// ===== СТРАНИЦА НАСТРОЕК СОРЕВНОВАНИЙ (НОВЫЙ ВИД) =====

function renderApparatusManager() {
  const container = document.getElementById("apparatusContent");
  let html = `
    <div class="detail-section">
      <h4 class="detail-section-title">Справочник классов аппаратов</h4>
      <p class="text-muted small">Название и цвет бейджа задаются здесь и используются во всех карточках и таблицах. ID класса (латиницей) входит в состав ID команд.</p>
      <div class="table-responsive">
        <table class="table align-middle mb-0" style="font-size:0.9rem">
          <thead>
            <tr>
              <th style="width:80px">ID</th>
              <th>Название класса</th>
              <th style="width:200px">Цвет бейджа</th>
              <th style="width:110px">Команд</th>
              <th style="width:60px"></th>
            </tr>
          </thead>
          <tbody>`;
  apparatusClasses.forEach((info, idx) => {
    const totalTeams = teamsData.filter((t) => getClassIdByValue(t.apparatusClass, t.year) === info.id).length;
    html += `
            <tr>
              <td><code>${info.id}</code></td>
              <td><input type="text" class="form-control form-control-sm" value="${info.name}" onchange="updateApparatusClass(${idx}, 'name', this.value)"></td>
              <td><select class="form-select form-select-sm" onchange="updateApparatusClass(${idx}, 'color', this.value)">${classColorOptions(info.color)}</select></td>
              <td class="text-muted">${totalTeams}</td>
              <td class="text-end"><button class="btn btn-sm btn-outline-danger" onclick="deleteApparatusClass(${idx})" title="Удалить класс"><i class="fas fa-trash"></i></button></td>
            </tr>`;
  });
  html += `
          </tbody>
        </table>
      </div>
      <button class="btn btn-success btn-sm mt-3" onclick="addApparatusClass()"><i class="fas fa-plus me-2"></i>Добавить класс</button>
    </div>
    <div class="detail-section">
      <h4 class="detail-section-title">Участие классов в соревнованиях по годам</h4>
      <p class="text-muted small">Отметьте классы, участвующие в каждом году, и укажите даты проведения. Критерии оценки настраиваются отдельно.</p>`;

  const years = Object.keys(competitionSettings).sort((a, b) => b - a);
  years.forEach((year) => {
    html += `<h5 class="mt-4 mb-2 text-primary"><i class="fas fa-calendar me-2"></i>${year} год</h5><div class="list-group mb-4 shadow-sm">`;
    apparatusClasses.forEach((info) => {
      const cfg = competitionSettings[year]?.[info.id];
      const active = !!cfg;
      const teamCount = teamsData.filter(
        (t) => t.year == year && getClassIdByValue(t.apparatusClass, year) === info.id,
      ).length;
      html += `
        <div class="list-group-item d-flex align-items-center gap-3 py-3">
          <div class="form-check form-switch mb-0" style="min-width:44px">
            <input class="form-check-input" type="checkbox" role="switch" ${active ? "checked" : ""} onchange="toggleYearClass('${year}', '${info.id}', this.checked)">
          </div>
          <span class="badge category-badge ${info.color}" style="min-width:70px">${info.name}</span>
          <div class="flex-grow-1">
            <div class="fw-semibold ${active ? "" : "text-muted"}">${info.name}</div>
            <div class="small text-muted">${active ? `Участвует · команд в базе: ${teamCount}` : "Не участвует в этом году"}</div>
          </div>
          ${
            active
              ? `<div style="width:170px"><label class="form-label small mb-1">Дата соревнований</label><input type="text" class="form-control form-control-sm" value="${cfg.date || ""}" placeholder="ДД.ММ.ГГГГ" onchange="updateYearClassDate('${year}', '${info.id}', this.value)"></div>
               <button class="btn btn-outline-primary btn-sm" style="min-width:180px" onclick="openCriteriaEditor('${year}', '${info.id}')"><i class="fas fa-list-check me-1"></i>Критерии оценки</button>`
              : `<span class="text-muted small me-2">—</span>`
          }
        </div>`;
    });
    html += `</div>`;
  });
  html += `</div>`;
  container.innerHTML = html;
}

function toggleYearClass(year, classId, checked) {
  if (!competitionSettings[year]) competitionSettings[year] = {};
  if (checked) {
    if (!competitionSettings[year][classId]) competitionSettings[year][classId] = {date: "", criteria: []};
  } else {
    const teamCount = teamsData.filter(
      (t) => t.year == year && getClassIdByValue(t.apparatusClass, year) === classId,
    ).length;
    if (
      teamCount > 0 &&
      !confirm(
        `За ${year} год в классе ${getClassInfo(classId).name} есть команды (${teamCount}). Отключить класс? Команды останутся в базе, но класс исчезнет из таблиц этого года.`,
      )
    ) {
      renderApparatusManager();
      return;
    }
    delete competitionSettings[year][classId];
  }
  saveData();
  renderApparatusManager();
}

function updateYearClassDate(year, classId, value) {
  if (competitionSettings[year]?.[classId]) {
    competitionSettings[year][classId].date = value;
    saveData();
    showToast("Дата сохранена", "success");
  }
}

// Добавление класса в глобальный справочник (цвет закрепляется здесь один раз)
function classColorOptions(selected) {
  const opts = [
    {val: "badge-bek", label: "Синий"},
    {val: "badge-tnpa", label: "Зелёный"},
    {val: "badge-anpa", label: "Фиолетовый"},
    {val: "badge-anna", label: "Оранжевый"},
    {val: "badge-red", label: "Красный"},
    {val: "badge-yellow", label: "Жёлтый"},
    {val: "badge-gray", label: "Серый"},
  ];
  return opts
    .map((o) => `<option value="${o.val}" ${o.val === selected ? "selected" : ""}>${o.label}</option>`)
    .join("");
}

function updateApparatusClass(idx, field, value) {
  const info = apparatusClasses[idx];
  if (!info) return;
  if (field === "name") {
    const v = value.trim();
    if (!v) {
      renderApparatusManager();
      return;
    }
    info.name = v.toUpperCase();
  } else {
    info[field] = value;
  }
  saveData();
  renderApparatusManager();
  showToast("Справочник классов обновлён", "success");
}

function addApparatusClass() {
  const rawId = prompt(
    "ID нового класса (латинскими буквами, без пробелов,\nнапример: mrs — будет использоваться в ID команд):",
  );
  if (!rawId) return;
  const id = rawId.trim().toLowerCase();
  if (!/^[a-z]+$/.test(id)) {
    alert("ID должен состоять только из латинских букв без пробелов");
    return;
  }
  if (apparatusClasses.some((c) => c.id === id)) {
    alert("Класс с таким ID уже существует");
    return;
  }
  apparatusClasses.push({id, name: id.toUpperCase(), color: "badge-gray"});
  saveData();
  renderApparatusManager();
  showToast(`Класс "${id.toUpperCase()}" добавлен — укажите название и цвет в таблице`, "success");
}

function deleteApparatusClass(idx) {
  const info = apparatusClasses[idx];
  if (!info) return;
  const usedYears = Object.keys(competitionSettings).filter((y) => competitionSettings[y][info.id]);
  const teamCount = teamsData.filter((t) => getClassIdByValue(t.apparatusClass, t.year) === info.id).length;
  if (usedYears.length > 0 || teamCount > 0) {
    if (
      !confirm(
        `Класс "${info.name}" используется:\n· настройки годов: ${usedYears.join(", ") || "—"}\n· команд в базе: ${teamCount}\n\nУдалить класс из справочника и из настроек годов?`,
      )
    )
      return;
    usedYears.forEach((y) => delete competitionSettings[y][info.id]);
  }
  apparatusClasses.splice(idx, 1);
  saveData();
  renderApparatusManager();
  showToast("Класс удалён из справочника", "success");
}

// Алиас для кнопки в шапке страницы настроек
function addNewClassToYear() {
  addApparatusClass();
}

// ===== РЕДАКТОР КРИТЕРИЕВ (OFFCANVAS) =====
const CRITERIA_LIBRARY = {
  groups: [
    {
      id: "qualification",
      name: "Квалификация",
      short: "Квал.",
      fields: [
        {name: "Сумма размерений", short: "Разм."},
        {name: "Штрафные баллы", short: "Штраф"},
        {name: "Вес (кг)", short: "Вес"},
        {name: "Бонусные баллы", short: "Бонус"},
      ],
    },
    {
      id: "presentation",
      name: "Презентация",
      short: "През.",
      fields: [
        {name: "Структура", short: "Структ."},
        {name: "Эффективность", short: "Эффект."},
        {name: "Новизна", short: "Нов."},
        {name: "Перспектива", short: "Персп."},
        {name: "Качество", short: "Кач."},
      ],
    },
    {
      id: "task2",
      name: "Задание 2 (движение по траектории)",
      short: "Зад. 2",
      fields: [
        {name: "Среднее отклонение", short: "Отклон."},
        {name: "Баллы", short: "Баллы"},
      ],
    },
    {
      id: "task3",
      name: "Задание 3 (растения на островах)",
      short: "Зад. 3",
      fields: [
        {name: "Остров 1", short: "Остр. 1"},
        {name: "Остров 2", short: "Остр. 2"},
        {name: "Остров 3", short: "Остр. 3"},
        {name: "Баллы", short: "Баллы"},
      ],
    },
    {
      id: "task4",
      name: "Задание 4 (подводные объекты)",
      short: "Зад. 4",
      fields: [
        {name: "Кол-во объектов", short: "Объекты"},
        {name: "Баллы", short: "Баллы"},
        {name: "Бонус за непрерывность", short: "Бонус"},
      ],
    },
    {
      id: "competition",
      name: "Конкурсное задание",
      short: "Конкурс",
      fields: [
        {name: "Время (сек)", short: "Время"},
        {name: "Балл за время", short: "Б. времени"},
        {name: "Прохождение ворот", short: "Ворота"},
        {name: "Парковка", short: "Парковка"},
        {name: "Нужный гараж", short: "Гараж"},
        {name: "Штрафные баллы", short: "Штраф"},
      ],
    },
    {
      id: "extra",
      name: "Дополнительные баллы",
      short: "Доп.",
      fields: [{name: "За внеконкурсное задание", short: "Внеконкурс"}],
    },
  ],
};

let currentCriteriaYear = null;
let currentCriteriaClass = null;
let tempCriteria = [];

function normalizeCriteria(criteria) {
  if (!Array.isArray(criteria)) return [];
  return criteria.map((g) => {
    const isObj = typeof g === "object" && g !== null;
    const section = isObj ? g.section || g.name || "Группа" : String(g);
    const sectionShort = isObj ? g.sectionShort || g.short || "" : "";
    const rawFields = isObj ? g.fields || [] : [];
    const fields = rawFields.map((f) =>
      typeof f === "object" && f !== null
        ? {name: f.name || String(f), short: f.short || ""}
        : {name: String(f), short: ""},
    );
    return {section, sectionShort, fields};
  });
}

function openCriteriaEditor(year, classId) {
  currentCriteriaYear = year;
  currentCriteriaClass = classId;
  const config = competitionSettings[year]?.[classId];
  tempCriteria = normalizeCriteria(config?.criteria || []);
  renderCriteriaOffcanvas();
  new bootstrap.Offcanvas(document.getElementById("criteriaOffcanvas")).show();
}

function renderCriteriaOffcanvas() {
  const body = document.getElementById("criteriaOffcanvasBody");
  const title = `${getClassInfo(currentCriteriaClass).name} — ${currentCriteriaYear} год`;

  let html = `
    <div class="alert alert-info d-flex align-items-start py-2">
      <i class="fas fa-info-circle me-2 mt-1"></i>
      <div class="small">
        <strong>Настройка критериев:</strong> ${title}<br>
        Редактируйте названия групп и полей, указывайте сокращения для компактных таблиц (полное название появится в подсказке при наведении).
      </div>
    </div>`;

  if (tempCriteria.length === 0) {
    html += `<div class="alert alert-light text-center py-4"><i class="fas fa-clipboard-list fa-2x text-muted mb-2 d-block"></i><p class="mb-0 small">Критерии не заданы. Добавьте группы ниже.</p></div>`;
  }

  tempCriteria.forEach((group, gIdx) => {
    html += `
      <div class="card mb-3 border shadow-sm">
        <div class="card-header bg-white d-flex justify-content-between align-items-center py-2">
          <div class="d-flex align-items-center gap-2 flex-grow-1 me-3">
            <span class="badge bg-primary rounded-pill">${gIdx + 1}</span>
            <div class="flex-grow-1">
              <input type="text" class="form-control form-control-sm fw-bold border-0 bg-transparent p-0" value="${group.section}" oninput="tempCriteria[${gIdx}].section = this.value" placeholder="Название группы">
              <input type="text" class="form-control form-control-sm text-muted border-0 bg-transparent p-0" value="${group.sectionShort || ""}" oninput="tempCriteria[${gIdx}].sectionShort = this.value" placeholder="Сокращение группы (необязательно)">
            </div>
          </div>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-secondary" onclick="moveGroup(${gIdx}, -1)" ${gIdx === 0 ? "disabled" : ""} title="Вверх"><i class="fas fa-chevron-up"></i></button>
            <button class="btn btn-sm btn-outline-secondary" onclick="moveGroup(${gIdx}, 1)" ${gIdx === tempCriteria.length - 1 ? "disabled" : ""} title="Вниз"><i class="fas fa-chevron-down"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="removeGroup(${gIdx})" title="Удалить группу"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <div class="card-body p-0">
          <div class="list-group list-group-flush">`;

    group.fields.forEach((field, fIdx) => {
      const fName = typeof field === "object" ? field.name || "" : String(field);
      const fShort = typeof field === "object" ? field.short || "" : "";
      html += `
            <div class="list-group-item d-flex align-items-center gap-2 py-2 px-3">
              <span class="badge bg-light text-dark rounded-circle flex-shrink-0" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:0.7rem">${fIdx + 1}</span>
              <div class="flex-grow-1 row g-1">
                <div class="col-8">
                  <input type="text" class="form-control form-control-sm" value="${fName}" oninput="updateFieldName(${gIdx}, ${fIdx}, this.value)" placeholder="Полное название поля">
                </div>
                <div class="col-3">
                  <input type="text" class="form-control form-control-sm" value="${fShort}" oninput="updateFieldShort(${gIdx}, ${fIdx}, this.value)" placeholder="Сокр.">
                </div>
                <div class="col-1 text-end">
                  <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="removeField(${gIdx}, ${fIdx})" title="Удалить"><i class="fas fa-times"></i></button>
                </div>
              </div>
            </div>`;
    });

    html += `</div><div class="p-2 bg-light border-top"><button class="btn btn-sm btn-outline-primary w-100" onclick="addFieldToGroup(${gIdx})"><i class="fas fa-plus me-1"></i>Добавить поле</button></div></div></div>`;
  });

  html += `
    <div class="card border-dashed border-2 bg-light">
      <div class="card-body text-center py-3">
        <div class="row g-2 justify-content-center">
          <div class="col-md-8">
            <div class="dropdown w-100">
              <button class="btn btn-success w-100 dropdown-toggle" type="button" data-bs-toggle="dropdown"><i class="fas fa-book me-2"></i>Добавить из библиотеки</button>
              <ul class="dropdown-menu w-100" style="max-height:250px;overflow-y:auto">`;

  CRITERIA_LIBRARY.groups.forEach((libGroup) => {
    html += `<li><a class="dropdown-item" href="#" onclick="addGroupFromLibrary('${libGroup.id}'); return false;"><i class="fas fa-folder me-2 text-primary"></i>${libGroup.name}<span class="badge bg-light text-dark ms-2">${libGroup.fields.length} полей</span></a></li>`;
  });

  html += `</ul></div></div>
          <div class="col-md-4"><button class="btn btn-outline-primary w-100" onclick="addCustomGroup()"><i class="fas fa-folder-plus me-2"></i>Своя группа</button></div>
        </div>
      </div>
    </div>`;

  body.innerHTML = html;
}

function updateFieldName(gIdx, fIdx, value) {
  if (typeof tempCriteria[gIdx].fields[fIdx] === "string") tempCriteria[gIdx].fields[fIdx] = {name: value, short: ""};
  else tempCriteria[gIdx].fields[fIdx].name = value;
}

function updateFieldShort(gIdx, fIdx, value) {
  if (typeof tempCriteria[gIdx].fields[fIdx] === "string")
    tempCriteria[gIdx].fields[fIdx] = {name: tempCriteria[gIdx].fields[fIdx], short: value};
  else tempCriteria[gIdx].fields[fIdx].short = value;
}

function addGroupFromLibrary(libGroupId) {
  const libGroup = CRITERIA_LIBRARY.groups.find((g) => g.id === libGroupId);
  if (!libGroup) return;
  tempCriteria.push({
    section: libGroup.name,
    sectionShort: libGroup.short || "",
    fields: libGroup.fields.map((f) => ({name: f.name, short: f.short})),
  });
  renderCriteriaOffcanvas();
}

function addCustomGroup() {
  tempCriteria.push({section: "Новая группа", sectionShort: "", fields: []});
  renderCriteriaOffcanvas();
}

function removeGroup(gIdx) {
  if (!confirm(`Удалить группу "${tempCriteria[gIdx].section}" со всеми полями?`)) return;
  tempCriteria.splice(gIdx, 1);
  renderCriteriaOffcanvas();
}

function moveGroup(gIdx, direction) {
  const newIdx = gIdx + direction;
  if (newIdx < 0 || newIdx >= tempCriteria.length) return;
  const temp = tempCriteria[gIdx];
  tempCriteria[gIdx] = tempCriteria[newIdx];
  tempCriteria[newIdx] = temp;
  renderCriteriaOffcanvas();
}

function addFieldToGroup(gIdx) {
  tempCriteria[gIdx].fields.push({name: "Новое поле", short: ""});
  renderCriteriaOffcanvas();
}

function removeField(gIdx, fIdx) {
  tempCriteria[gIdx].fields.splice(fIdx, 1);
  renderCriteriaOffcanvas();
}

function saveCriteriaFromOffcanvas() {
  if (!competitionSettings[currentCriteriaYear]) competitionSettings[currentCriteriaYear] = {};
  if (!competitionSettings[currentCriteriaYear][currentCriteriaClass]) {
    competitionSettings[currentCriteriaYear][currentCriteriaClass] = {date: "", criteria: []};
  }
  competitionSettings[currentCriteriaYear][currentCriteriaClass].criteria = tempCriteria;
  saveData();
  const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById("criteriaOffcanvas"));
  if (offcanvas) offcanvas.hide();
  renderApparatusManager();
  showToast("Критерии сохранены", "success");
}

// ===== СОХРАНЕНИЕ / УДАЛЕНИЕ =====
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
      id: generateTeamId(org.id, year, getClassIdByValue(teamData.apparatusClass, year)),
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

// ===== ЭКСПОРТ / ИМПОРТ =====
function downloadJSON() {
  if (teamsData.length === 0 && organizations.length === 0) {
    showToast("Нет данных", "error");
    return;
  }
  const dataToSave = {organizations, apparatusClasses, competitionSettings, teams: teamsData};
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
          competitionSettings = normalizeCompetitionSettings(
            rawData.competitionSettings || getDefaultCompetitionSettings(),
          );
          apparatusClasses = rawData.apparatusClasses || [];
          ensureApparatusClasses();
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
        competitionSettings = normalizeCompetitionSettings(
          rawData.competitionSettings || getDefaultCompetitionSettings(),
        );
        apparatusClasses = rawData.apparatusClasses || [];
        ensureApparatusClasses();
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
    renderYearSwitcher();
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
      competitionSettings = normalizeCompetitionSettings(
        rawData.competitionSettings || getDefaultCompetitionSettings(),
      );
      apparatusClasses = rawData.apparatusClasses || [];
      ensureApparatusClasses();
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
renderYearSwitcher();
attachFileInputListener();
