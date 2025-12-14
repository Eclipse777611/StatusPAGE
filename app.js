const CONFIG_PATH = "./status.config.json";

const grid = document.getElementById("grid");
const hoverPanel = document.getElementById("hoverPanel");
const hpName = document.getElementById("hpName");
const hpBadge = document.getElementById("hpBadge");
const hpList = document.getElementById("hpList");

const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");
const lastUpdatedEl = document.getElementById("lastUpdated");
const overallEl = document.getElementById("overall");
const boot = document.getElementById("boot");

let cfg = null;
let mouseX = 0, mouseY = 0;
let rafPending = false;

function setCssVar(name, value){
  document.documentElement.style.setProperty(name, value);
}

function applyTheme(theme, ui){
  if(theme){
    if(theme.accent)  setCssVar("--accent", theme.accent);
    if(theme.accent2) setCssVar("--accent2", theme.accent2);
    if(theme.text)    setCssVar("--text", theme.text);
    if(theme.muted)   setCssVar("--muted", theme.muted);
    if(theme.bg)      setCssVar("--bg", theme.bg);
    if(theme.surface) setCssVar("--surface", theme.surface);
    if(theme.border)  setCssVar("--border", theme.border);
  }
  if(ui){
    setCssVar("--cols", String(ui.columns ?? 2));
    setCssVar("--anim", ui.animations ? "1" : "0");
  }
}

function badgeClass(tone){
  return ["green","orange","red","gray"].includes(tone) ? tone : "gray";
}

function setOverall(overall){
  const label = overall?.label ?? "Operational";
  const tone  = badgeClass(overall?.tone ?? "green");
  overallEl.textContent = label;
  overallEl.className = `overall ${tone}`;
}

function clampToViewport(x, y, w, h, pad=12){
  const maxX = window.innerWidth - w - pad;
  const maxY = window.innerHeight - h - pad;
  return {
    x: Math.max(pad, Math.min(x, maxX)),
    y: Math.max(pad, Math.min(y, maxY)),
  };
}

function schedulePanelMove(){
  if(rafPending) return;
  rafPending = true;

  requestAnimationFrame(() => {
    rafPending = false;

    const rect = hoverPanel.getBoundingClientRect();
    const pos = clampToViewport(mouseX + 14, mouseY + 14, rect.width, rect.height);

    hoverPanel.style.left = `${pos.x}px`;
    hoverPanel.style.top  = `${pos.y}px`;
  });
}

window.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if(hoverPanel.classList.contains("show")) schedulePanelMove();
});

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function showPanel(product){
  const editsCount = cfg?.ui?.showEditsCount ?? 3;

  hpName.textContent = product.name ?? "Product";
  hpBadge.textContent = product.status?.label ?? "Unknown";
  hpBadge.className = `badge ${badgeClass(product.status?.tone)}`;

  hpList.innerHTML = "";
  const edits = (product.edits ?? []).slice(0, editsCount);

  if(edits.length === 0){
    hpList.innerHTML = `<div class="hpItem"><div class="hpWhat">No edits yet.</div></div>`;
  } else {
    for(const e of edits){
      const item = document.createElement("div");
      item.className = "hpItem";
      item.innerHTML = `
        <div class="hpLine1">
          <div class="hpWhat">${escapeHtml(e.what)}</div>
          <div class="hpWhen">${escapeHtml(e.when)}</div>
        </div>
      `;
      hpList.appendChild(item);
    }
  }

  hoverPanel.classList.add("show");
  hoverPanel.setAttribute("aria-hidden", "false");
  schedulePanelMove();
}

function hidePanel(){
  hoverPanel.classList.remove("show");
  hoverPanel.setAttribute("aria-hidden", "true");
}

function setLastUpdated(){
  const now = new Date();
  lastUpdatedEl.textContent = "Last updated: " + now.toLocaleString();
}

/**
 * Render cards. Each product may have:
 * - name, desc
 * - status: { label, tone }
 * - preview: "images/xxx.png"  (optional)
 */
function render(products){
  grid.innerHTML = "";

  // auto adjust columns to reduce vertical height (helps no-scroll)
  const baseCols = cfg?.ui?.columns ?? 2;
  const suggestedCols = Math.min(4, Math.max(baseCols, Math.ceil((products.length || 1) / 4)));
  setCssVar("--cols", String(suggestedCols));

  for(const p of products){
    const card = document.createElement("div");
    card.className = "card";

    // Preview image CSS var
    const preview = (p.preview || "").trim();
    if(preview){
      card.style.setProperty("--preview", `url("${preview}")`);
    } else {
      card.classList.add("noPreview");
      card.style.setProperty("--preview", "none");
    }

    card.innerHTML = `
      <div class="cardBg"></div>
      <div class="cardShade"></div>

      <div class="cardContent">
        <div class="rowTop">
          <div class="name">${escapeHtml(p.name)}</div>
          <span class="badge ${badgeClass(p.status?.tone)}">${escapeHtml(p.status?.label ?? "Unknown")}</span>
        </div>
        <div class="desc">${escapeHtml(p.desc ?? "")}</div>
      </div>
    `;

    card.addEventListener("mouseenter", () => showPanel(p));
    card.addEventListener("mouseleave", hidePanel);
    card.addEventListener("mousemove", schedulePanelMove);

    grid.appendChild(card);
  }
}

async function loadConfig(){
  const res = await fetch(CONFIG_PATH, { cache: "no-store" });
  if(!res.ok) throw new Error(`Failed to load ${CONFIG_PATH}: HTTP ${res.status}`);
  return await res.json();
}

async function init(){
  try{
    cfg = await loadConfig();

    // title/subtitle
    titleEl.textContent = cfg.page?.title ?? "Status";
    subtitleEl.textContent = cfg.page?.subtitle ?? "";

    // theme/ui
    applyTheme(cfg.theme, cfg.ui);

    // overall
    setOverall(cfg.overall);

    // products
    render(cfg.products ?? []);
    setLastUpdated();

    boot?.remove();

    // optional refresh
    const refreshMs = cfg.ui?.refreshMs;
    if(Number.isFinite(refreshMs) && refreshMs > 1000){
      setInterval(async () => {
        cfg = await loadConfig();
        applyTheme(cfg.theme, cfg.ui);
        setOverall(cfg.overall);
        render(cfg.products ?? []);
        setLastUpdated();
      }, refreshMs);
    }
  } catch (err){
    boot?.remove();
    grid.innerHTML = `
      <div class="card">
        <div class="cardContent">
          <div class="rowTop">
            <div class="name">Config / Load error</div>
            <span class="badge red">Error</span>
          </div>
          <div class="desc">${escapeHtml(err.message)}</div>
          <div class="desc">Check filenames + case: <b>status.config.json</b>, <b>app.js</b>, <b>styles.css</b>.</div>
        </div>
      </div>
    `;
  }
}

init();
