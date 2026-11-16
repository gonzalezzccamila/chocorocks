/* Chocorocks: catálogo y pedido por WhatsApp.
   Los productos y precios salen de la hoja "Catálogo web" publicada como CSV.
   Para cambiar precios o productos se edita el Sheet, nunca este archivo. */

const CONFIG = {
  csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQNuXYt6_YuWe5-LYQ01ZZwf5EnLYTA2pSgpDP7eFhSVclMC9QmAK9DgTQMvBPw71Uq4gEdIrT4zQ2v/pub?gid=4002&single=true&output=csv",
  whatsapp: "5491165421200",
  instagramUrl: "https://www.instagram.com/_chocorocks/",
  horariosRetiro: "", // ej.: "Lunes a sábado de 10 a 20 hs · Domingos cerrado". Vacío = no se muestra.
  timeoutMs: 6000,
};

const CATEGORIES = [
  { name: "Tortas y postres", id: "tortas", intro: "Tortas enteras, tartas y budines para la mesa grande." },
  { name: "Pavlovas", id: "pavlovas", intro: "Merengue crocante por fuera y suave por dentro." },
  { name: "Por unidad", id: "por-unidad", intro: "En cajas de 6 o de 12. Para regalar, o para no compartir." },
];
const TOP = { name: "Para empezar", id: "para-empezar", kicker: "Nuestras favoritas", intro: "Si es tu primera vez, arrancá por acá." };
const SPECIAL = { name: "Sin TACC, veganas y sin azúcar", id: "especiales", intro: "Cada una lleva su etiqueta, así sabés qué estás pidiendo." };

/* ---------- utilidades ---------- */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Math.round(n).toLocaleString("es-AR");
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const norm = (s) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* "$20,000.00", "$20,000", "20.000", "20000" → 20000. Los centavos se descartan:
   en el Sheet los precios ya vienen redondeados hacia arriba de a $500. */
function parsePrice(raw) {
  let s = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!s) return 0;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);
  // Si el último separador tiene 1 o 2 dígitos después, son decimales: se cortan.
  if (lastSep >= 0 && /^\d{1,2}$/.test(s.slice(lastSep + 1))) s = s.slice(0, lastSep);
  return Math.round(Number(s.replace(/[.,]/g, ""))) || 0;
}

function toCatalog(text) {
  const table = parseCSV(text || "");
  const h = table.findIndex((r) => norm(r[0]) === "categoria");
  if (h < 0) return [];
  const head = table[h].map(norm);
  const col = (name) => head.indexOf(norm(name));
  const c = {
    cat: col("Categoría"), prod: col("Producto"), desc: col("Descripción corta"),
    size: col("Tamaño o presentación"), por: col("Porciones o unidades"), tipo: col("Tipo de opción"),
    nombre: col("Nombre que ve el cliente"), precio: col("Precio"), disp: col("Disponible"),
    tags: col("Etiquetas"), id: col("ID opción"), foto: col("Foto"),
    rank: col("Favoritas") >= 0 ? col("Favoritas") : col("Más pedidos"),
  };
  const get = (r, i) => (i >= 0 && r[i] != null ? String(r[i]).trim() : "");
  return table.slice(h + 1)
    .map((r) => ({
      cat: get(r, c.cat), prod: get(r, c.prod), desc: get(r, c.desc), size: get(r, c.size),
      por: get(r, c.por), tipo: get(r, c.tipo), nombre: get(r, c.nombre),
      precio: parsePrice(get(r, c.precio)),
      disp: norm(get(r, c.disp)), tags: get(r, c.tags).split(",").map((t) => t.trim()).filter(Boolean),
      id: get(r, c.id), foto: get(r, c.foto), rank: Number(get(r, c.rank)) || 0,
    }))
    .filter((r) => r.prod && r.id && (r.disp === "si") && (r.precio > 0 || /pisos|relleno/i.test(r.tipo)));
}

/* ---------- modelo ---------- */
let PRODUCTS = [];
const BY_ID = new Map();

function kindOf(t) {
  const n = norm(t);
  if (n.startsWith("decoracion")) return "deco";
  if (n.startsWith("pisos")) return "pisos";
  if (n.startsWith("relleno")) return "relleno";
  if (n.startsWith("tamano") || n.startsWith("caja")) return "size";
  return "unica";
}

function buildProducts(rows) {
  const map = new Map();
  BY_ID.clear();
  for (const r of rows) {
    r.kind = kindOf(r.tipo);
    BY_ID.set(r.id, r);
    if (!map.has(r.prod)) map.set(r.prod, { name: r.prod, cat: r.cat, desc: r.desc, tags: [], foto: "", rank: 0, rows: [] });
    const p = map.get(r.prod);
    p.rows.push(r);
    if (r.rank > 0 && (!p.rank || r.rank < p.rank)) p.rank = r.rank;
    r.tags.forEach((t) => p.tags.includes(t) || p.tags.push(t));
    if (!p.foto && r.foto) p.foto = r.foto;
  }
  const order = [...map.values()];
  // Los más pedidos van primero dentro de su categoría; el resto mantiene el orden del Sheet.
  const byRank = (a, b) => (a.rank || Infinity) - (b.rank || Infinity) || order.indexOf(a) - order.indexOf(b);
  return order.sort(byRank).map((p) => {
    p.id = slug(p.name);
    p.decos = p.rows.filter((r) => r.kind === "deco");
    p.pisos = p.rows.filter((r) => r.kind === "pisos");
    p.rellenos = p.rows.filter((r) => r.kind === "relleno");
    p.sizes = p.rows.filter((r) => r.kind === "size");
    p.unica = p.rows.filter((r) => r.kind === "unica");
    p.decoSizes = [...new Set(p.decos.map((r) => r.size))].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
    p.sizes.sort((a, b) => (/\bcm$/.test(a.size) && /\bcm$/.test(b.size) ? parseFloat(a.size) - parseFloat(b.size) : 0));
    p.base = p.decos.length ? p.decos : p.sizes.length ? p.sizes : p.unica;
    p.hasOptions = p.base.length > 1 || p.pisos.length > 0;
    return p;
  }).filter((p) => p.base.length);
}

function minPrice(p) { return Math.min(...p.base.map((r) => r.precio)); }

function metaText(p) {
  if (p.decoSizes.length > 1) {
    return p.decoSizes.map((s) => {
      const r = p.decos.find((d) => d.size === s);
      return r && r.por ? `${s} (${r.por})` : s;
    }).join(" o ");
  }
  if (p.pisos.length && p.decos[0]) return [p.decos[0].size, p.decos[0].por].filter(Boolean).join(" · ");
  if (p.sizes.length > 1 && p.sizes.every((r) => /\bcm$/.test(r.size))) {
    return p.sizes.map((r) => (r.por ? `${r.size} (${r.por})` : r.size)).join(" o ");
  }
  if (p.sizes.length) return p.sizes.map((r) => r.size).join(" · ");
  const r = p.base[0];
  return [/^enter/i.test(r.size) ? "" : r.size, r.por].filter(Boolean).join(" · ");
}

/* ---------- catálogo ---------- */
function photoHTML(p) {
  if (!p.foto) return "";
  const src = /^https?:\/\//.test(p.foto) ? p.foto : "fotos/" + p.foto;
  return `<div class="card-photo"><img src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" onerror="this.parentNode.remove()"></div>`;
}

function cardHTML(p) {
  const price = p.base.length > 1 ? `<small>desde</small> ${money(minPrice(p))}` : money(p.base[0].precio);
  const tags = p.tags.length ? `<div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : "";
  const meta = metaText(p);
  return `
    <article class="card">
      ${photoHTML(p)}
      ${tags}
      <h3>${esc(p.name)}</h3>
      ${p.desc ? `<p class="card-desc">${esc(p.desc)}</p>` : ""}
      ${meta ? `<p class="card-meta">${esc(meta)}</p>` : ""}
      <div class="card-foot">
        <span class="price">${price}</span>
        <button class="btn ${p.hasOptions ? "btn-ghost" : "btn-primary"}" type="button" data-product="${esc(p.id)}">${p.hasOptions ? "Elegir" : "Agregar"}</button>
      </div>
    </article>`;
}

function render() {
  const main = $("#catalogo");
  const special = PRODUCTS.filter((p) => p.tags.length);
  const regular = PRODUCTS.filter((p) => !p.tags.length);
  const sections = [];
  const top = PRODUCTS.filter((p) => p.rank > 0).slice(0, 3);
  if (top.length) sections.push({ ...TOP, list: top });
  const known = new Set(CATEGORIES.map((c) => c.name));
  const extra = [...new Set(regular.map((p) => p.cat))].filter((c) => !known.has(c))
    .map((name) => ({ name, id: slug(name), intro: "" }));
  for (const cat of [...CATEGORIES, ...extra]) {
    const list = regular.filter((p) => p.cat === cat.name);
    if (list.length) sections.push({ ...cat, list });
  }
  if (special.length) sections.push({ ...SPECIAL, list: special });

  if (!sections.length) {
    main.innerHTML = `<p class="loading">Estamos actualizando el catálogo. Escribinos por WhatsApp y te contamos qué hay.</p>`;
    $("#tabs").innerHTML = "";
    return;
  }
  main.innerHTML = sections.map((s) => `
    <section class="cat" id="${esc(s.id)}">
      ${s.kicker ? `<p class="kicker">${esc(s.kicker)}</p>` : ""}
      <h2>${esc(s.name)}</h2>
      ${s.intro ? `<p class="cat-intro">${esc(s.intro)}</p>` : ""}
      <div class="grid">${s.list.map(cardHTML).join("")}</div>
    </section>`).join("");
  $("#tabs").innerHTML = sections.map((s) => `<a class="tab" href="#${esc(s.id)}">${esc(s.name)}</a>`).join("");
}

/* ---------- elegir opciones ---------- */
let current = null; // { product, sel: {deco, size, pisos, rellenos: []}, qty }

function rellenoCount(sel) {
  const r = BY_ID.get(sel.pisos);
  const n = r ? parseInt(r.nombre, 10) || parseInt(r.size, 10) : 2;
  return Math.max(1, (n || 2) - 1);
}

/* Pisos y rellenos dependen del tamaño elegido cuando la torta tiene varios. */
function sizeRows(p, sel, list) {
  if (p.decoSizes.length < 2) return list;
  const same = list.filter((r) => r.size === sel.size);
  return same.length ? same : list;
}

function selectedIds() {
  const { product: p, sel } = current;
  if (p.pisos.length) return [sel.deco, sel.pisos, ...sel.rellenos.slice(0, rellenoCount(sel))].filter(Boolean);
  if (p.decos.length) return [sel.deco].filter(Boolean);
  return [sel.size || p.base[0].id];
}

function optHTML(name, r, label, sub, priceText, checked) {
  return `
    <label class="opt">
      <input type="radio" name="${name}" value="${esc(r.id)}" ${checked ? "checked" : ""}>
      <span class="opt-text"><span>${esc(label)}</span>${sub ? `<span class="opt-sub">${esc(sub)}</span>` : ""}</span>
      <span class="opt-price">${esc(priceText)}</span>
    </label>`;
}
const plus = (n) => (n > 0 ? "+" + money(n) : "incluido");
const decoLabel = (r) => r.nombre.replace(/^decoraci[oó]n\s+/i, "").replace(/^./, (c) => c.toUpperCase());

function stepsHTML() {
  const { product: p, sel } = current;
  const out = [];
  let n = 1;
  const step = (title, hint, body) => `<fieldset class="step"><legend>${n++}. ${esc(title)}${hint ? `<span>${esc(hint)}</span>` : ""}</legend>${body}</fieldset>`;

  // Todas las opciones se muestran como "+$X" sobre el precio "desde".
  const from = minPrice(p);
  const minOf = (rows) => Math.min(...rows.map((d) => d.precio));
  // Orden de los pasos: tamaño, pisos, relleno y, al final, decoración.
  let decoBase = from;
  if (p.decos.length && p.decoSizes.length > 1) {
    out.push(step("Tamaño", "", p.decoSizes.map((s) => {
      const ds = p.decos.filter((d) => d.size === s);
      return optHTML("size", { id: s }, s, ds[0].por, plus(minOf(ds) - from), sel.size === s);
    }).join("")));
    decoBase = minOf(p.decos.filter((d) => d.size === sel.size));
  }
  if (p.pisos.length) {
    out.push(step("Pisos", "", sizeRows(p, sel, p.pisos).map((r) => optHTML("pisos", r, r.nombre, "", plus(r.precio), sel.pisos === r.id)).join("")));
    const count = rellenoCount(sel);
    const rellenos = sizeRows(p, sel, p.rellenos);
    for (let i = 0; i < count; i++) {
      out.push(step(count > 1 ? `Relleno ${i + 1}` : "Relleno", count > 1 ? (i === 0 ? "capa de abajo" : "capa de arriba") : "",
        rellenos.map((r) => optHTML("relleno" + i, r, r.nombre, "", plus(r.precio), sel.rellenos[i] === r.id)).join("")));
    }
  }
  if (p.decos.length) {
    const decos = p.decoSizes.length > 1 ? p.decos.filter((d) => d.size === sel.size) : p.decos;
    out.push(step("Decoración", "", decos.map((r) => optHTML("deco", r, decoLabel(r), "", plus(r.precio - decoBase), sel.deco === r.id)).join("")));
  }
  if (!p.decos.length && p.sizes.length > 1) {
    out.push(step(p.sizes.every((r) => r.kind === "size" && /^caja/i.test(norm(r.tipo))) ? "Caja" : "Tamaño", "",
      p.sizes.map((r) => optHTML("sizeRow", r, r.size, r.por, plus(r.precio - from), sel.size === r.id)).join("")));
  }
  return out.join("");
}

function unitPrice(ids) { return ids.reduce((sum, id) => sum + (BY_ID.get(id)?.precio || 0), 0); }

function refreshConfig() {
  $("#config-steps").innerHTML = stepsHTML();
  $("#config-qty").textContent = current.qty;
  $("#config-total").textContent = money(unitPrice(selectedIds()) * current.qty);
}

function openConfig(p) {
  const sel = { deco: null, size: null, pisos: null, rellenos: [] };
  if (p.decos.length) {
    if (p.decoSizes.length > 1) sel.size = p.decoSizes[0];
    sel.deco = (p.decoSizes.length > 1 ? p.decos.find((d) => d.size === sel.size) : p.decos[0]).id;
  }
  if (p.pisos.length) {
    sel.pisos = sizeRows(p, sel, p.pisos)[0].id;
    const r0 = sizeRows(p, sel, p.rellenos)[0]?.id;
    sel.rellenos = [r0, r0].filter(Boolean);
  }
  if (!p.decos.length && p.sizes.length) sel.size = p.sizes[0].id;
  current = { product: p, sel, qty: 1 };
  $("#config-title").textContent = p.name;
  $("#config-desc").textContent = p.desc;
  $("#config-from").textContent = p.hasOptions ? "Desde " + money(minPrice(p)) : "";
  refreshConfig();
  showDialog($("#config"));
}

$("#config-steps").addEventListener("change", (e) => {
  const t = e.target;
  if (!current || t.type !== "radio") return;
  const { product: p, sel } = current;
  if (t.name === "size") {
    sel.size = t.value;
    const prev = BY_ID.get(sel.deco);
    const match = p.decos.find((d) => d.size === sel.size && prev && d.nombre === prev.nombre) || p.decos.find((d) => d.size === sel.size);
    sel.deco = match?.id || null;
    // Mismos pisos y rellenos, en el tamaño nuevo.
    const remap = (id, list) => {
      const old = BY_ID.get(id);
      const rows = sizeRows(p, sel, list);
      return (old && rows.find((r) => r.nombre === old.nombre) || rows[0])?.id || null;
    };
    if (p.pisos.length) {
      sel.pisos = remap(sel.pisos, p.pisos);
      sel.rellenos = sel.rellenos.map((id) => remap(id, p.rellenos));
    }
  } else if (t.name === "deco") sel.deco = t.value;
  else if (t.name === "pisos") {
    sel.pisos = t.value;
    while (sel.rellenos.length < rellenoCount(sel)) sel.rellenos.push(sel.rellenos[0] || p.rellenos[0]?.id);
  } else if (t.name.startsWith("relleno")) sel.rellenos[Number(t.name.slice(7))] = t.value;
  else if (t.name === "sizeRow") sel.size = t.value;
  refreshConfig();
});

document.querySelectorAll("#config .qty-btn").forEach((b) => b.addEventListener("click", () => {
  if (!current) return;
  current.qty = Math.min(20, Math.max(1, current.qty + Number(b.dataset.qty)));
  refreshConfig();
}));

$("#config-add").addEventListener("click", () => {
  if (!current) return;
  addToOrder(selectedIds(), current.qty);
  closeDialog($("#config"));
});

/* ---------- pedido ---------- */
const STORE_KEY = "chocorocks-pedido";
let ORDER = []; // [{ ids: [...], qty }]

function loadOrder() {
  try { ORDER = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { ORDER = []; }
  if (!Array.isArray(ORDER)) ORDER = [];
  ORDER = ORDER.filter((it) => Array.isArray(it.ids) && it.ids.length && it.ids.every((id) => BY_ID.has(id)) && it.qty > 0);
}
function saveOrder() { try { localStorage.setItem(STORE_KEY, JSON.stringify(ORDER)); } catch { /* sin almacenamiento: no pasa nada */ } }

function addToOrder(ids, qty) {
  const key = ids.join("|");
  const found = ORDER.find((it) => it.ids.join("|") === key);
  if (found) found.qty = Math.min(20, found.qty + qty); else ORDER.push({ ids, qty });
  saveOrder();
  renderOrder();
  toast(`Agregado al pedido: ${describe(ids).name}`);
}

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

function describe(ids) {
  const rows = ids.map((id) => BY_ID.get(id)).filter(Boolean);
  const p = PRODUCTS.find((x) => x.name === rows[0]?.prod);
  const parts = [];
  const rellenos = [];
  for (const r of rows) {
    if (r.kind === "deco") { if (p && (p.decoSizes.length > 1 || p.pisos.length)) parts.push(r.size); parts.push(lowerFirst(r.nombre)); }
    else if (r.kind === "pisos") parts.push(lowerFirst(r.nombre));
    else if (r.kind === "relleno") rellenos.push(lowerFirst(r.nombre));
    else if (r.kind === "size" && p && p.sizes.length > 1) parts.push(lowerFirst(r.size));
  }
  if (rellenos.length === 1) parts.push("relleno: " + rellenos[0]);
  if (rellenos.length > 1) parts.push(rellenos.map((x, i) => `relleno ${i + 1}: ${x}`).join(", "));
  return { name: rows[0]?.prod || "", parts };
}

function orderTotal() { return ORDER.reduce((s, it) => s + unitPrice(it.ids) * it.qty, 0); }

/* Fecha mínima: dentro de 72 horas. */
const pad = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function minDate() { return isoDate(new Date(Date.now() + 72 * 3600 * 1000)); }
function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "long" });
  return `${day} ${pad(d)}/${pad(m)}`;
}
function orderForm() {
  const date = $("#order-date").value;
  const delivery = document.querySelector('input[name="delivery"]:checked')?.value || "";
  const note = $("#order-note").value.trim();
  let error = "";
  if (!ORDER.length) error = "Todavía no agregaste nada.";
  else if (!date) error = "Elegí la fecha para la que lo necesitás.";
  else if (date < minDate()) error = "Necesitamos al menos 72 horas. Elegí una fecha a partir del " + prettyDate(minDate()) + ".";
  return { date, delivery, note, error };
}

function whatsappLink() {
  const f = orderForm();
  const lines = ORDER.map((it) => {
    const d = describe(it.ids);
    return `- ${it.qty} × ${d.name}${d.parts.length ? ` (${d.parts.join(", ")})` : ""}: ${money(unitPrice(it.ids) * it.qty)}`;
  });
  const extra = [
    f.date ? `Fecha: ${prettyDate(f.date)}` : "",
    f.delivery ? `Entrega: ${f.delivery}` : "",
    f.note ? `Comentario: ${f.note}` : "",
  ].filter(Boolean).join("\n");
  const text = `Hola, Chocorocks. Quiero hacer este pedido:\n\n${lines.join("\n")}\n\nTotal: ${money(orderTotal())}\n\n${extra}\n\n¿Tienen lugar para esa fecha?`;
  return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
}

function updateSend() {
  const send = $("#send-order");
  const ok = !orderForm().error;
  send.href = ok ? whatsappLink() : "#";
  send.setAttribute("aria-disabled", ORDER.length ? "false" : "true");
  if (ok) $("#order-error").hidden = true;
}

function renderOrder() {
  const count = ORDER.reduce((s, it) => s + it.qty, 0);
  $("#orderbar").hidden = count === 0;
  $("#orderbar-count").textContent = `Ver pedido · ${count} ${count === 1 ? "producto" : "productos"}`;
  $("#orderbar-total").textContent = money(orderTotal());
  $("#order-total").textContent = money(orderTotal());
  $("#order-list").innerHTML = ORDER.length ? ORDER.map((it, i) => {
    const d = describe(it.ids);
    return `
      <li class="order-item">
        <h3>${esc(d.name)}</h3>
        ${d.parts.length ? `<p>${esc(d.parts.join(" · "))}</p>` : ""}
        <div class="order-row">
          <div class="qty" aria-label="Cantidad">
            <button type="button" class="qty-btn" data-item="${i}" data-step="-1" aria-label="Uno menos">−</button>
            <output>${it.qty}</output>
            <button type="button" class="qty-btn" data-item="${i}" data-step="1" aria-label="Uno más">+</button>
          </div>
          <strong>${money(unitPrice(it.ids) * it.qty)}</strong>
        </div>
        <button type="button" class="remove" data-remove="${i}">Quitar</button>
      </li>`;
  }).join("") : `<li class="empty">Todavía no agregaste nada.</li>`;
  updateSend();
}

$("#order-list").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.remove != null) ORDER.splice(Number(b.dataset.remove), 1);
  else if (b.dataset.item != null) {
    const it = ORDER[Number(b.dataset.item)];
    it.qty = Math.min(20, it.qty + Number(b.dataset.step));
    if (it.qty <= 0) ORDER.splice(Number(b.dataset.item), 1);
  }
  saveOrder();
  renderOrder();
});
$("#send-order").addEventListener("click", (e) => {
  const f = orderForm();
  if (!f.error) { $("#send-order").href = whatsappLink(); return; }
  e.preventDefault();
  if (!ORDER.length) return;
  const err = $("#order-error");
  err.textContent = f.error;
  err.hidden = false;
  $("#order-date").focus();
});
["input", "change"].forEach((ev) => $("#order").addEventListener(ev, (e) => {
  if (e.target.closest(".field, .step")) updateSend();
}));
$("#open-order").addEventListener("click", () => {
  $("#order-date").min = minDate();
  renderOrder();
  showDialog($("#order"));
});

/* ---------- diálogos ---------- */
function showDialog(d) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
function closeDialog(d) { if (typeof d.close === "function") d.close(); else d.removeAttribute("open"); }
document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) closeDialog(d); }));

/* ---------- tarjetas ---------- */
$("#catalogo").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-product]");
  if (!b) return;
  const p = PRODUCTS.find((x) => x.id === b.dataset.product);
  if (!p) return;
  if (p.hasOptions) { openConfig(p); return; }
  addToOrder([p.base[0].id], 1);
});

/* ---------- arranque ---------- */
async function fetchLive() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.timeoutMs);
  try {
    const res = await fetch(CONFIG.csvUrl, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) return [];
    return toCatalog(await res.text());
  } catch { return []; }
  finally { clearTimeout(timer); }
}

let shownCSV = "";
function show(rows, signature) {
  shownCSV = signature;
  PRODUCTS = buildProducts(rows);
  render();
  loadOrder();
  renderOrder();
  if (current) {
    const fresh = PRODUCTS.find((p) => p.name === current.product.name);
    if (fresh) current.product = fresh;
    if ($("#config").open) refreshConfig();
  }
}

async function init() {
  if (CONFIG.instagramUrl) { const ig = $("#btn-instagram"); ig.href = CONFIG.instagramUrl; ig.hidden = false; }
  if (CONFIG.horariosRetiro) { const h = $("#pickup-hours"); h.textContent = CONFIG.horariosRetiro; h.hidden = false; }
  // 1) Se muestra al instante la copia incluida en la página.
  let backup = [];
  try { backup = toCatalog(window.CATALOGO_RESPALDO || ""); } catch { backup = []; }
  if (backup.length) show(backup, JSON.stringify(backup));
  // 2) Cuando responde el Sheet, se reemplaza solo si algo cambió.
  const live = await fetchLive();
  const sig = JSON.stringify(live);
  if (live.length && sig !== shownCSV) show(live, sig);
  else if (!backup.length) show(live, sig);
}
init();
