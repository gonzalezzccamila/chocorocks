/* Chocorocks: catálogo y pedido por WhatsApp.
   Los productos y precios salen de la hoja "Catálogo web" publicada como CSV.
   Para cambiar precios o productos se edita el Sheet, nunca este archivo. */

const CONFIG = {
  csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQNuXYt6_YuWe5-LYQ01ZZwf5EnLYTA2pSgpDP7eFhSVclMC9QmAK9DgTQMvBPw71Uq4gEdIrT4zQ2v/pub?gid=4002&single=true&output=csv",
  whatsapp: "5491165421200",
  instagramUrl: "https://www.instagram.com/chocorocks_/",
  horariosRetiro: "", // ej.: "Lunes a sábado de 10 a 20 hs · Domingos cerrado". Vacío = no se muestra.
  timeoutMs: 6000,

  // Portada: archivo dentro de fotos/ (o URL) y su texto alternativo.
  portada: "fotos/portada.jpg?v=3",
  portadaAlt: "Logo CR by Chocorocks sobre una mesa de madera, con cookies de chocolate",

  // Frase debajo del nombre, sobre quién hace las tortas. Hasta 2 líneas en celular. Vacío = no se muestra.
  firma: "Pastelería de Victoria · Atención de Camila",

  // "Qué pasa después", debajo del botón de WhatsApp en el pedido. Vacío ([]) = no se muestra.
  pasosDespues: [
    "Te respondemos en menos de 24 horas para confirmar la fecha.",
    "Reservás con una seña del 50% por transferencia en las 5 horas siguientes a la confirmación.",
    "Retirás en Belgrano o lo mandás a buscar por app.",
  ],
};

const CATEGORIES = [
  { name: "Tortas y postres", id: "tortas", intro: "Tortas enteras, tartas y budines para la mesa grande." },
  { name: "Pavlovas", id: "pavlovas", intro: "Merengue crocante por fuera y suave por dentro." },
  { name: "Por unidad", id: "por-unidad", intro: "En cajas de 6 o de 12. Para regalar, o para no compartir." },
];
const TOP = { name: "Nuestras favoritas", id: "favoritas", intro: "Si es tu primera vez, arrancá por acá." };
const SPECIAL = { name: "Sin TACC, veganas y sin azúcar", id: "especiales", intro: "Cada una lleva su etiqueta, así sabés qué estás pidiendo." };
const BUILDER = { id: "arma-tu-torta", tab: "Torta para tu evento", title: "Armá tu torta para tu evento" };

/* ---------- utilidades ---------- */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Math.round(n).toLocaleString("es-AR");
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const norm = (s) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const uniq = (list) => [...new Set(list)];
const cm = (s) => parseFloat(s) || 0;

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
  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  // Si el último separador tiene 1 o 2 dígitos después, son decimales: se cortan.
  if (lastSep >= 0 && /^\d{1,2}$/.test(s.slice(lastSep + 1))) s = s.slice(0, lastSep);
  return Math.round(Number(s.replace(/[.,]/g, ""))) || 0;
}

/* Tipos de opción que pueden valer $0 porque se suman a otra. */
const ADDON = /pisos|capas|relleno|sabor|torre/i;

/* "a.jpg, b.jpg" → ["a.jpg", "b.jpg"]. El orden es el de la galería; la primera va en la tarjeta. */
const splitFotos = (raw) => String(raw ?? "").split(",").map((f) => f.trim()).filter(Boolean);

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
      id: get(r, c.id), fotos: splitFotos(get(r, c.foto)), rank: Number(get(r, c.rank)) || 0,
    }))
    .filter((r) => r.prod && r.id && r.disp === "si" && (r.precio > 0 || ADDON.test(r.tipo)));
}

/* ---------- modelo ---------- */
let PRODUCTS = [];
const BY_ID = new Map();

function kindOf(t) {
  const n = norm(t);
  if (n.startsWith("decoracion")) return "deco";
  if (n.startsWith("pisos") || n.startsWith("capas")) return "capas";
  if (n.startsWith("relleno")) return "relleno";
  if (n.startsWith("sabor")) return "sabor";
  if (n.startsWith("torre")) return "torre";
  if (n.startsWith("tamano") || n.startsWith("caja")) return "size";
  return "unica";
}

function buildProducts(rows) {
  const map = new Map();
  BY_ID.clear();
  for (const r of rows) {
    r.kind = kindOf(r.tipo);
    BY_ID.set(r.id, r);
    if (!map.has(r.prod)) map.set(r.prod, { name: r.prod, cat: r.cat, desc: r.desc, tags: [], fotos: [], rank: 0, rows: [] });
    const p = map.get(r.prod);
    p.rows.push(r);
    if (r.rank > 0 && (!p.rank || r.rank < p.rank)) p.rank = r.rank;
    r.tags.forEach((t) => p.tags.includes(t) || p.tags.push(t));
    if (!p.fotos.length && r.fotos.length) p.fotos = r.fotos;
  }
  const order = [...map.values()];
  // Los más pedidos van primero dentro de su categoría; el resto mantiene el orden del Sheet.
  const byRank = (a, b) => (a.rank || Infinity) - (b.rank || Infinity) || order.indexOf(a) - order.indexOf(b);
  return order.sort(byRank).map((p) => {
    p.id = slug(p.name);
    p.foto = p.fotos[0] || ""; // la de la tarjeta
    const of = (k) => p.rows.filter((r) => r.kind === k);
    p.decos = of("deco"); p.capas = of("capas"); p.rellenos = of("relleno"); p.sabores = of("sabor");
    p.torre = of("torre")[0] || null;
    p.sizes = of("size"); p.unica = of("unica");
    p.cfgSizes = uniq(p.decos.map((r) => r.size)).sort((a, b) => cm(a) - cm(b));
    p.sizes.sort((a, b) => (/\bcm$/.test(a.size) && /\bcm$/.test(b.size) ? cm(a.size) - cm(b.size) : 0));
    p.base = p.decos.length ? p.decos : p.sizes.length ? p.sizes : p.unica;
    p.builder = p.rellenos.length > 0;
    if (!(p.torre && p.cfgSizes.length > 1)) p.torre = null;
    return p;
  }).filter((p) => p.base.length);
}

function minPrice(p) { return Math.min(...p.base.map((r) => r.precio)); }

function metaText(p) {
  if (p.cfgSizes.length > 1) return p.cfgSizes.join(" o ") + (p.torre ? " · o en torre" : "");
  if (p.sizes.length > 1 && p.sizes.every((r) => /\bcm$/.test(r.size))) return p.sizes.map((r) => r.size).join(" o ");
  if (p.sizes.length > 1) return p.sizes.map((r) => r.size).join(" o ").replace(/ o Caja de /g, " o de ");
  const r = p.base[0];
  return [/^enter/i.test(r.size) ? "" : r.size, r.por].filter(Boolean).join(" · ");
}

/* ---------- catálogo ---------- */
const fotoUrl = (f) => (/^https?:\/\//.test(f) ? f : "fotos/" + f + "?v=3");
const photoSrc = (p) => fotoUrl(p.foto);
const priceHTML = (p) => (p.base.length > 1 ? `<small>desde</small> ${money(minPrice(p))}` : money(p.base[0].precio));

function tileHTML(p) {
  const photo = p.foto
    ? `<img src="${esc(photoSrc(p))}" alt="" loading="lazy" onerror="this.remove()">`
    : "";
  const tags = p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const meta = metaText(p);
  return `
    <button class="tile" type="button" data-product="${esc(p.id)}">
      <span class="tile-photo${p.foto ? "" : " tile-photo-empty"}">${photo}${tags ? `<span class="tile-tags">${tags}</span>` : ""}</span>
      <span class="tile-body">
        <span class="tile-name">${esc(p.name)}</span>
        ${meta ? `<span class="tile-meta">${esc(meta)}</span>` : ""}
        <span class="price">${priceHTML(p)}</span>
      </span>
    </button>`;
}

function rowHTML(p) {
  const meta = metaText(p);
  const tags = p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  return `
    <li><button class="row" type="button" data-product="${esc(p.id)}">
      <span class="row-text">
        <span class="row-name">${esc(p.name)}</span>
        ${meta ? `<span class="row-meta">${esc(meta)}</span>` : ""}
        ${tags ? `<span class="tags">${tags}</span>` : ""}
      </span>
      <span class="price">${priceHTML(p)}</span>
      <span class="row-chev" aria-hidden="true">›</span>
    </button></li>`;
}

/* Las que tienen foto van en tarjetas; las que no, en lista compacta debajo. */
function listHTML(list, carousel) {
  if (carousel) return `<div class="carousel">${list.map(tileHTML).join("")}</div>`;
  const withPhoto = list.filter((p) => p.foto), without = list.filter((p) => !p.foto);
  return (withPhoto.length ? `<div class="grid">${withPhoto.map(tileHTML).join("")}</div>` : "")
    + (without.length ? `<ul class="rows">${without.map(rowHTML).join("")}</ul>` : "");
}

function builderHTML(p) {
  return `
    <section class="cat" id="${BUILDER.id}">
      <button class="builder" type="button" data-product="${esc(p.id)}">
        ${p.foto ? `<span class="builder-photo"><img src="${esc(photoSrc(p))}" alt="" onerror="this.parentNode.remove()"></span>` : ""}
        <span class="builder-body">
          <span class="kicker">Torta personalizada</span>
          <span class="builder-title">${BUILDER.title}</span>
          <span class="builder-desc">Contanos qué festejás y la armamos a tu medida: elegís el sabor, los rellenos y la decoración. Si la mesa es grande, va en torre de 2 pisos.</span>
          <span class="builder-foot">
            <span class="price"><small>desde</small> ${money(minPrice(p))}</span>
            <span class="btn btn-primary">Empezar</span>
          </span>
        </span>
      </button>
    </section>`;
}

function render() {
  const main = $("#catalogo");
  const builder = PRODUCTS.find((p) => p.builder);
  const top = PRODUCTS.filter((p) => p.rank > 0 && p !== builder).slice(0, 6);
  const rest = PRODUCTS.filter((p) => p !== builder);
  const special = rest.filter((p) => p.tags.length);
  const regular = rest.filter((p) => !p.tags.length);
  const sections = [];
  if (top.length) sections.push({ ...TOP, list: top, carousel: true });
  const known = new Set(CATEGORIES.map((c) => c.name));
  const extra = uniq(regular.map((p) => p.cat)).filter((c) => !known.has(c)).map((name) => ({ name, id: slug(name), intro: "" }));
  for (const cat of [...CATEGORIES, ...extra]) {
    const list = regular.filter((p) => p.cat === cat.name);
    if (list.length) sections.push({ ...cat, list });
  }
  if (special.length) sections.push({ ...SPECIAL, list: special });

  if (!sections.length && !builder) {
    main.innerHTML = `<p class="loading">Estamos actualizando el catálogo. Escribinos por WhatsApp y te contamos qué hay.</p>`;
    $("#tabs").innerHTML = "";
    return;
  }
  const sectionHTML = (s) => `
    <section class="cat" id="${esc(s.id)}">
      <h2>${esc(s.name)} <span class="count">(${s.list.length})</span></h2>
      ${s.intro ? `<p class="cat-intro">${esc(s.intro)}</p>` : ""}
      ${listHTML(s.list, s.carousel)}
    </section>`;
  // Orden: primero las favoritas (las clásicas), después la torta personalizada y el resto.
  const first = sections[0] && sections[0].carousel ? [sections.shift()] : [];
  main.innerHTML = first.map(sectionHTML).join("") + (builder ? builderHTML(builder) : "") + sections.map(sectionHTML).join("");
  const tabs = [...first, ...(builder ? [{ id: BUILDER.id, name: BUILDER.tab }] : []), ...sections];
  $("#tabs").innerHTML = tabs.map((s) => `<a class="tab" href="#${esc(s.id)}">${esc(s.name)}</a>`).join("");
}

/* ---------- elegir opciones ----------
   La selección se guarda por nombre de opción, no por ID: así la misma elección
   vale para 22 cm, 26 cm o la torre (que suma las dos). */
let current = null; // { product, sel, qty }

const LIST = { deco: "decos", capas: "capas", relleno: "rellenos", sabor: "sabores" };
const activeSizes = (p, sel) => (sel.torre ? [...p.cfgSizes].reverse() : [sel.size]);
const findRow = (p, kind, size, nombre) => p[LIST[kind]].find((r) => r.size === size && r.nombre === nombre);
const groupPrice = (p, kind, nombre, sizes) => sizes.reduce((s, z) => s + (findRow(p, kind, z, nombre)?.precio || 0), 0);

/* Opciones de un grupo que existen en todos los tamaños activos, de la más barata a la más cara. */
function optionNames(p, kind, sizes) {
  const names = uniq(p[LIST[kind]].map((r) => r.nombre)).filter((n) => sizes.every((z) => findRow(p, kind, z, n)));
  return names.map((n, i) => ({ n, i, price: groupPrice(p, kind, n, sizes) }))
    .sort((a, b) => a.price - b.price || a.i - b.i);
}

function rellenoCount(p, sel) {
  if (!p.rellenos.length) return 0;
  if (!p.capas.length) return 1;
  return Math.max(1, (parseInt(sel.capas, 10) || 2) - 1);
}

/* Deja la selección siempre válida para los tamaños activos. */
function normalize() {
  const { product: p, sel } = current;
  if (!p.decos.length) return;
  if (!p.cfgSizes.includes(sel.size)) sel.size = p.cfgSizes[0];
  if (!p.torre) sel.torre = false;
  const sizes = activeSizes(p, sel);
  for (const kind of ["deco", "sabor", "capas"]) {
    const opts = optionNames(p, kind, sizes);
    if (opts.length && !opts.some((o) => o.n === sel[kind])) sel[kind] = opts[0].n;
  }
  const rell = optionNames(p, "relleno", sizes);
  const n = rellenoCount(p, sel);
  sel.rellenos = sel.rellenos.filter((x) => rell.some((o) => o.n === x)).slice(0, n);
  if (!sel.touchedRellenos) while (sel.rellenos.length < n && rell.length) sel.rellenos.push(sel.rellenos[0] || rell[0].n);
}

function missingRellenos() {
  const { product: p, sel } = current;
  return p.decos.length ? rellenoCount(p, sel) - sel.rellenos.length : 0;
}

function selectedIds() {
  const { product: p, sel } = current;
  if (!p.decos.length) return [sel.sizeRow || p.base[0].id];
  const ids = [];
  for (const z of activeSizes(p, sel)) {
    for (const kind of ["deco", "sabor", "capas"]) {
      const r = sel[kind] && findRow(p, kind, z, sel[kind]);
      if (r) ids.push(r.id);
    }
    for (const n of sel.rellenos) { const r = findRow(p, "relleno", z, n); if (r) ids.push(r.id); }
  }
  if (sel.torre && p.torre) ids.push(p.torre.id);
  return ids;
}

const plus = (n) => (n > 0 ? "+" + money(n) : "incluido");
const decoLabel = (n) => n.replace(/^decoraci[oó]n\s+/i, "").replace(/^./, (c) => c.toUpperCase());
const porciones = (p, sizes) => {
  const total = sizes.reduce((s, z) => s + (parseInt(p.decos.find((r) => r.size === z)?.por, 10) || 0), 0);
  return total ? `${total} porciones` : "";
};

function radioHTML(name, value, label, sub, priceText, checked) {
  return `
    <label class="opt">
      <input type="radio" name="${name}" value="${esc(value)}" ${checked ? "checked" : ""}>
      <span class="opt-text"><span>${esc(label)}</span>${sub ? `<span class="opt-sub">${esc(sub)}</span>` : ""}</span>
      ${priceText ? `<span class="opt-price">${esc(priceText)}</span>` : ""}
    </label>`;
}

function stepsHTML() {
  const { product: p, sel } = current;
  const out = [];
  const step = (title, hint, body) => `<fieldset class="step"><legend>${esc(title)}${hint ? `<span>${esc(hint)}</span>` : ""}</legend><div class="opts">${body}</div></fieldset>`;

  if (!p.decos.length) {
    if (p.sizes.length > 1) {
      const cajas = p.sizes.every((r) => /^caja/i.test(norm(r.tipo)));
      out.push(step(cajas ? "Caja" : "Tamaño", "",
        p.sizes.map((r) => radioHTML("sizeRow", r.id, r.size, r.por, money(r.precio), sel.sizeRow === r.id)).join("")));
    }
    return out.join("");
  }

  const sizes = activeSizes(p, sel);
  const minDeco = (zs) => Math.min(...optionNames(p, "deco", zs).map((o) => o.price));

  if (p.torre) {
    const all = [...p.cfgSizes].reverse();
    out.push(step("Formato", "",
      radioHTML("formato", "simple", "Un piso", p.cfgSizes.join(" o "), "desde " + money(minDeco([p.cfgSizes[0]])), !sel.torre) +
      radioHTML("formato", "torre", "Torre de 2 pisos", `${all.join(" abajo y ")} arriba · ${porciones(p, all)}`,
        "desde " + money(minDeco(all) + p.torre.precio), sel.torre)));
  }
  if (!sel.torre && p.cfgSizes.length > 1) {
    out.push(step("Tamaño", "",
      p.cfgSizes.map((z) => radioHTML("size", z, z, porciones(p, [z]), "desde " + money(minDeco([z])), sel.size === z)).join("")));
  }

  const group = (kind, title, label = (n) => n) => {
    const opts = optionNames(p, kind, sizes);
    if (opts.length < 2) return;
    out.push(step(title, "", opts.map((o) => radioHTML(kind, o.n, label(o.n), "", plus(o.price - opts[0].price), sel[kind] === o.n)).join("")));
  };
  group("sabor", "Sabor del bizcochuelo");
  group("capas", "Capas");

  const rell = optionNames(p, "relleno", sizes);
  const n = rellenoCount(p, sel);
  if (rell.length > 1 && n === 1) {
    out.push(step("Relleno", "", rell.map((o) => radioHTML("relleno", o.n, o.n, "", plus(o.price), sel.rellenos[0] === o.n)).join("")));
  } else if (rell.length > 1) {
    const full = sel.rellenos.length >= n;
    out.push(step("Rellenos", `Elegí ${n}. Podés repetir.`, rell.map((o) => {
      const count = sel.rellenos.filter((x) => x === o.n).length;
      return `
        <div class="opt opt-count${count ? " is-on" : ""}">
          <span class="opt-text"><span>${esc(o.n)}</span><span class="opt-sub">${o.price > 0 ? "+" + money(o.price) + " por capa" : "incluido"}</span></span>
          <span class="counter">
            ${count ? `<button type="button" class="counter-btn" data-relleno="${esc(o.n)}" data-step="-1" aria-label="Quitar ${esc(o.n)}">−</button><output>${count}</output>` : ""}
            <button type="button" class="counter-btn${full ? " is-swap" : ""}" data-relleno="${esc(o.n)}" data-step="1" aria-label="Agregar ${esc(o.n)}">+</button>
          </span>
        </div>`;
    }).join("")));
  }
  group("deco", "Decoración", decoLabel);
  return out.join("");
}

function unitPrice(ids) { return ids.reduce((sum, id) => sum + (BY_ID.get(id)?.precio || 0), 0); }

function refreshConfig() {
  normalize();
  $("#config-steps").innerHTML = stepsHTML();
  $("#config-qty").textContent = current.qty;
  const missing = missingRellenos();
  const add = $("#config-add");
  add.disabled = missing > 0;
  add.innerHTML = missing > 0
    ? `Te falta elegir ${missing} ${missing === 1 ? "relleno" : "rellenos"}`
    : `Agregar · <span>${money(unitPrice(selectedIds()) * current.qty)}</span>`;
}

function openConfig(p) {
  const sel = { torre: false, size: p.cfgSizes[0] || null, sabor: null, capas: null, rellenos: [], deco: null, sizeRow: null, touchedRellenos: false };
  if (!p.decos.length && p.sizes.length) sel.sizeRow = p.sizes[0].id;
  current = { product: p, sel, qty: 1 };
  $("#config-title").textContent = p.builder ? BUILDER.title : p.name;
  $("#config-desc").textContent = p.desc;
  const multi = p.base.length > 1;
  const meta = multi ? "" : metaText(p);
  $("#config-from").textContent = (multi ? "Desde " + money(minPrice(p)) : money(p.base[0].precio)) + (meta ? " · " + meta : "");
  renderGallery(p);
  $("#config-tags").innerHTML = p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  refreshConfig();
  showDialog($("#config"));
  $("#config").scrollTop = 0;
}

/* ---------- galería de fotos de la ficha ----------
   0 fotos: no hay área de imagen. 1: foto sola. 2 o más: carrusel con puntos.
   Si una foto no carga se saca y se recalculan los puntos; si fallan todas, queda como 0. */
const gallery = $("#config-photo");
const track = $("#gallery-track");
const dots = $("#gallery-dots");

function renderGallery(p) {
  const total = p.fotos.length;
  gallery.hidden = total === 0;
  track.scrollLeft = 0;
  track.innerHTML = p.fotos.map((f, i) => `
    <div class="slide"><img src="${esc(fotoUrl(f))}" alt="${esc(total > 1 ? `${p.name}, foto ${i + 1} de ${total}` : p.name)}"
      ${i === 0 ? "" : 'loading="lazy"'} decoding="async"></div>`).join("");
  track.querySelectorAll("img").forEach((img) => img.addEventListener("error", () => {
    img.parentNode.remove();
    relabelGallery(p.name);
  }, { once: true }));
  relabelGallery(p.name);
}

function relabelGallery(name) {
  const imgs = [...track.querySelectorAll("img")];
  const total = imgs.length;
  gallery.hidden = total === 0;
  gallery.classList.toggle("is-multi", total > 1);
  imgs.forEach((img, i) => { img.alt = total > 1 ? `${name}, foto ${i + 1} de ${total}` : name; });
  dots.hidden = total < 2;
  dots.innerHTML = total < 2 ? "" : imgs.map((_, i) =>
    `<button type="button" class="dot" data-slide="${i}" aria-label="Ver foto ${i + 1} de ${total}"><span></span></button>`).join("");
  updateDots();
}

function currentSlide() {
  const w = track.clientWidth || 1;
  return Math.round(track.scrollLeft / w);
}

function updateDots() {
  const all = [...dots.querySelectorAll(".dot")];
  if (!all.length) return;
  const i = Math.min(currentSlide(), all.length - 1);
  all.forEach((d, k) => d.setAttribute("aria-current", k === i ? "true" : "false"));
  dots.setAttribute("aria-label", `Foto ${i + 1} de ${all.length}`);
}

let dotsFrame = 0;
track.addEventListener("scroll", () => { cancelAnimationFrame(dotsFrame); dotsFrame = requestAnimationFrame(updateDots); }, { passive: true });
dots.addEventListener("click", (e) => {
  const b = e.target.closest(".dot");
  if (b) track.scrollTo({ left: Number(b.dataset.slide) * track.clientWidth, behavior: "smooth" });
});

$("#config-steps").addEventListener("change", (e) => {
  const t = e.target;
  if (!current || t.type !== "radio") return;
  const { sel } = current;
  if (t.name === "formato") sel.torre = t.value === "torre";
  else if (t.name === "relleno") sel.rellenos = [t.value];
  else if (t.name in sel) sel[t.name] = t.value;
  if (t.name === "capas") sel.touchedRellenos = false; // al cambiar las capas se completa solo
  refreshConfig();
});

$("#config-steps").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-relleno]");
  if (!b || !current) return;
  const { product: p, sel } = current;
  const name = b.dataset.relleno;
  const n = rellenoCount(p, sel);
  sel.touchedRellenos = true;
  if (b.dataset.step === "-1") {
    const i = sel.rellenos.lastIndexOf(name);
    if (i >= 0) sel.rellenos.splice(i, 1);
  } else {
    // Si ya están todos elegidos, el nuevo reemplaza al más viejo que sea distinto.
    if (sel.rellenos.length >= n) {
      const i = sel.rellenos.findIndex((x) => x !== name);
      if (i < 0) return;
      sel.rellenos.splice(i, 1);
    }
    sel.rellenos.push(name);
  }
  refreshConfig();
});

document.querySelectorAll("#config .qty-btn").forEach((b) => b.addEventListener("click", () => {
  if (!current) return;
  current.qty = Math.min(20, Math.max(1, current.qty + Number(b.dataset.qty)));
  refreshConfig();
}));

$("#config-add").addEventListener("click", () => {
  if (!current || missingRellenos() > 0) return;
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
  let rows = ids.map((id) => BY_ID.get(id)).filter(Boolean);
  const p = PRODUCTS.find((x) => x.name === rows[0]?.prod);
  const parts = [];
  const torre = rows.some((r) => r.kind === "torre");
  if (torre) {
    // En la torre las dos tortas llevan lo mismo: se describe una sola vez.
    const sizes = uniq(rows.filter((r) => r.kind === "deco").map((r) => r.size));
    parts.push(`torre de 2 pisos (${sizes.join(" abajo y ")} arriba)`);
    rows = rows.filter((r) => r.kind !== "torre" && r.size === sizes[0]);
  }
  const rellenos = [];
  let deco = "";
  for (const r of rows) {
    if (r.kind === "deco") { if (!torre && p && p.cfgSizes.length > 1) parts.unshift(r.size); deco = lowerFirst(r.nombre); }
    else if (r.kind === "sabor") parts.push("bizcochuelo de " + lowerFirst(r.nombre));
    else if (r.kind === "capas") parts.push(lowerFirst(r.nombre.split("·")[0].trim()));
    else if (r.kind === "relleno") rellenos.push(lowerFirst(r.nombre));
    else if (r.kind === "size" && p && p.sizes.length > 1) parts.push(lowerFirst(r.size));
  }
  if (rellenos.length === 1) parts.push("relleno: " + rellenos[0]);
  else if (rellenos.length > 1) {
    parts.push("rellenos: " + uniq(rellenos).map((x) => {
      const n = rellenos.filter((y) => y === x).length;
      return n > 1 ? `${n} capas de ${x}` : x;
    }).join(" y "));
  }
  if (deco) parts.push(deco);
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
  const b = e.target.closest("[data-product]");
  if (!b) return;
  const p = PRODUCTS.find((x) => x.id === b.dataset.product);
  if (p) openConfig(p);
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

/* Textos que se editan solo en CONFIG: portada, firma y "qué pasa después". */
function applyConfigTexts() {
  const cover = $("#cover");
  if (CONFIG.portada) { cover.src = CONFIG.portada; cover.alt = CONFIG.portadaAlt || ""; cover.hidden = false; }
  const firma = $("#firma");
  firma.textContent = CONFIG.firma || "";
  firma.hidden = !CONFIG.firma;
  const pasos = (CONFIG.pasosDespues || []).filter(Boolean);
  $("#after-list").innerHTML = pasos.map((t) => `<li>${esc(t)}</li>`).join("");
  $("#after").hidden = !pasos.length;
}
applyConfigTexts();

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
