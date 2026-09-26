/* Mathlib Explorer: the page. It lays out what the build wrote (data/), which the suite's tools
   computed; it decides nothing about the mathematics or the code. */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const main = $('#main');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const FLAG = {BASIC: 1, DOC: 2, DEPRECATED: 4, UPSTREAM: 8, FAMOUS: 16, ROUTINE: 32, FORMULA: 64};
const KIND_WORDS = {
  definition: ['Definition', 'A new notion, defined in terms of earlier ones.'],
  structure: ['Structure', 'A notion made of several pieces of data bundled together, like a group: a set, an operation, and the axioms.'],
  class: ['Class', 'A structure that Lean finds by itself when it is needed (for example, that the real numbers form a field).'],
  'inductive type': ['Inductive type', 'A notion defined by the ways its elements are built, like the natural numbers from zero and successor.'],
  theorem: ['Theorem', 'A statement proved in Mathlib.'],
  lemma: ['Lemma', 'A statement proved in Mathlib, usually a step towards others.'],
  instance: ['Instance', 'A proof, which Lean finds by itself when needed, that some object is an example of a class.'],
  axiom: ['Axiom', 'A statement assumed without proof.'],
};
let S = null;                       // data/site.json
const cache = new Map();
function fetchJSON(path) {
  if (!cache.has(path)) cache.set(path, fetch('data/' + path).then(r => { if (!r.ok) throw new Error(path + ': ' + r.status); return r.json(); }));
  return cache.get(path);
}

/* ---------- data ---------- */
async function node(id) {
  const rows = await fetchJSON(`nodes/${Math.floor(id / S.shards.nodes)}.json`);
  const r = rows[id % S.shards.nodes];
  return r && {id, name: r[0], title: r[1], kind: r[2], mid: r[3], flags: r[4], imp: r[5]};
}
const nodesOf = ids => Promise.all([...new Set(ids)].map(node));
function fnv(name) {
  let h = 0x811C9DC5;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % S.shards.names;
}
async function idOf(name) {
  const rows = await fetchJSON(`names/${fnv(name)}.json`).catch(() => []);
  const hit = rows.find(r => r[1] === name);
  return hit ? hit[0] : null;
}
const moduleData = mid => fetchJSON(`m/${mid}.json`);
const graphShard = mid => fetchJSON(`g/${mid}.json`);
const moduleRow = mid => S.modules[mid] && {id: mid, name: S.modules[mid][0], title: S.modules[mid][1], summary: S.modules[mid][2], decls: S.modules[mid][3]};

/* ---------- text ---------- */
// Docstrings: Markdown with LaTeX math; a name in backquotes becomes a link to it.
function md(text, inline = false, names = null) {
  if (!text) return '';
  const math = [];
  let t = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, m => m.replace(/\$/g, '\u0000'));   // no math inside code
  t = t.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (m, d, i) => { math.push([d ?? i, d != null]); return `\u0001${math.length - 1}\u0001`; });
  t = t.replace(/\u0000/g, '$');
  let html = inline ? marked.parseInline(t) : marked.parse(t);
  html = DOMPurify.sanitize(html);
  html = html.replace(/\u0001(\d+)\u0001/g, (m, k) => {
    const [tex, display] = math[+k];
    try { return katex.renderToString(tex, {displayMode: display, throwOnError: false}); } catch (e) { return esc(tex); }
  });
  // A name in backquotes links to the declaration the tools resolved it to.
  if (!names) return html;
  return html.replace(/<code>([^<]+)<\/code>/g, (m, written) => {
    const name = names[written.replace(/&amp;/g, '&').replace(/&#39;/g, "'")];
    return name ? `<a class="codelink" href="#/d/${encodeURIComponent(name)}" data-name="${esc(name)}"><code>${written}</code></a>` : m;
  });
}
// Lean text, with every constant it names explained on hover and linked.
function lean(text, refs) {
  if (!text) return '';
  let out = '', at = 0;
  for (const [a, b, name] of [...(refs || [])].sort((x, y) => x[0] - y[0])) {
    if (a < at) continue;
    out += esc(text.slice(at, a)) + `<a class="ref" href="#/d/${encodeURIComponent(name)}" data-name="${esc(name)}">${esc(text.slice(a, b))}</a>`;
    at = b;
  }
  return out + esc(text.slice(at));
}
const shortName = name => name.split('.').slice(-2).join('.');
function label(n, max = 90) {
  if (!n) return '';
  const t = n.title || '';
  if (!t) return `<span class="mono">${esc(shortName(n.name))}</span>`;
  if (n.flags & FLAG.FORMULA) return `<span class="mono">${esc(t.length > max ? t.slice(0, max) + '…' : t)}</span>`;
  return md(t.length > max * 1.6 ? t.slice(0, max * 1.6) + '…' : t, true);
}
function itemHtml(n) {
  return `<li><a href="#/d/${encodeURIComponent(n.name)}" data-id="${n.id}"><span class="item-title${n.flags & FLAG.FORMULA ? ' formula' : ''}">${label(n)}</span>` +
    `<span class="item-sub">${esc(n.name)}</span></a></li>`;
}
function chipHtml(n, extra = '') {
  const text = n.title && !(n.flags & FLAG.FORMULA) && n.title.length < 60 ? md(n.title, true) : esc(shortName(n.name));
  return `<a class="chip ${esc(n.kind)} ${extra}" href="#/d/${encodeURIComponent(n.name)}" data-id="${n.id}">${text}</a>`;
}
// Lean's own notions, as a mathematician would name them; the pure plumbing is not shown.
const BASIC_WORDS = {Eq: 'equality', Ne: '≠', Nat: 'natural numbers ℕ', Int: 'integers ℤ', HMul: 'multiplication', Mul: 'multiplication',
  HAdd: 'addition', Add: 'addition', HSub: 'subtraction', Sub: 'subtraction', HDiv: 'division', Div: 'division', HPow: 'powers', Pow: 'powers',
  Neg: 'negation', Inv: 'inverse', Zero: 'zero', One: 'one', OfNat: 'numerals', LE: '≤', LT: '<', Exists: 'there exists', And: 'and', Or: 'or',
  Not: 'not', Iff: 'if and only if', Membership: '∈', HSMul: 'scalar multiplication', SMul: 'scalar multiplication', Prod: 'pairs', Subtype: 'subsets as types',
  List: 'lists', Array: 'arrays', Bool: 'booleans', String: 'strings', Fin: 'Fin n', Option: 'optional values', True: 'true', False: 'false',
  Function: 'functions', Unit: 'unit', Sum: 'disjoint union', Sigma: 'dependent pairs', Quotient: 'quotients', Setoid: 'equivalence relations',
  NatCast: 'ℕ → R', IntCast: 'ℤ → R', HEq: 'equality', Decidable: '', DecidableEq: '', DecidablePred: '', DecidableRel: '', outParam: '', semiOutParam: '',
  Inhabited: '', Nonempty: 'nonempty', id: 'identity', ite: 'if … then … else', dite: 'if … then … else', Classical: '', optParam: '', autoParam: ''};
function basicChips(nodes) {
  const seen = new Set();
  return nodes.map(n => {
    const w = n.name in BASIC_WORDS ? BASIC_WORDS[n.name] : shortName(n.name);
    if (!w || seen.has(w)) return '';
    seen.add(w);
    return `<a class="chip basic" href="#/d/${encodeURIComponent(n.name)}" data-id="${n.id}">${esc(w)}</a>`;
  }).join(' ');
}
const plural = (n, one, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const wikipedia = q => `https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/${encodeURIComponent(q)}`;

/* ---------- pages ---------- */
function setNav(which) { document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#/' + which)); }
function crumbsFor(moduleName, extra = []) {
  const parts = moduleName.split('.').slice(1, -1);
  const links = ['<a href="#/subjects">Mathlib</a>'];
  for (let k = 0; k < parts.length; k++) links.push(`<a href="#/s/${encodeURIComponent(parts.slice(0, k + 1).join('.'))}">${esc(subjectTitle(parts.slice(0, k + 1).join('.')))}</a>`);
  return `<div class="crumbs">${[...links, ...extra].join('<span class="sep">›</span>')}</div>`;
}
const subjectIndex = new Map();
function indexSubjects(node) { subjectIndex.set(node.key, node); node.children.forEach(indexSubjects); }
const subjectTitle = key => (subjectIndex.get(key) || {}).title || key.split('.').pop();

async function viewHome() {
  setNav('');
  const c = S.counts, top = S.subjects.children.filter(s => !s.tooling);
  const cat = await fetchJSON('catalogs.json');
  const famous = cat.hundred.filter(e => e.decls.length).length, thousand = cat.thousand.filter(e => e.decls.length).length;
  const ug = countTree(cat.undergrad);
  main.innerHTML = `
    <h1>Explore the mathematics in Mathlib</h1>
    <p class="lede">Mathlib is a library of mathematics written in the Lean proof assistant, where every definition is precise and every theorem is checked by computer. This site lets you find what it contains, read what each notion means, see what it is built from, and follow how each theorem is proved, without knowing Lean.</p>
    <div class="stats">
      <div class="stat"><b>${(c.concepts || 0).toLocaleString()}</b><span>concepts defined</span></div>
      <div class="stat"><b>${(c.results || 0).toLocaleString()}</b><span>theorems proved</span></div>
      <div class="stat"><b>${(c.modules || 0).toLocaleString()}</b><span>files</span></div>
      <div class="stat"><b>${famous + thousand}</b><span>famous theorems</span></div>
    </div>
    <div class="cards">
      <a class="card" href="#/subjects"><h3>Subjects</h3><p>From algebra and analysis to probability and category theory, organized as Mathlib is.</p></a>
      <a class="card" href="#/famous"><h3>Famous theorems</h3><p>${famous} of Freek Wiedijk's 100 theorems, and ${thousand} of the 1000+ list, with who formalized them.</p></a>
      <a class="card" href="#/curriculum"><h3>Undergraduate curriculum</h3><p>${ug.done} of ${ug.all} topics of a mathematics degree, and what is still missing.</p></a>
      <a class="card" href="#/overview"><h3>Mathlib's overview</h3><p>The library's own tour of its main notions, area by area.</p></a>
      <a class="card" href="#/books"><h3>Books and papers</h3><p>${plural(c.books || 0, 'reference')} Mathlib's files cite, and where each is used.</p></a>
      <a class="card" href="#/map"><h3>The map</h3><p>How the subjects of Mathlib build on one another.</p></a>
    </div>
    <h2>Subjects</h2>
    <div class="cards">${top.map(s => `<a class="card" href="#/s/${encodeURIComponent(s.key)}"><h3>${esc(s.title)}</h3><p class="num">${plural(s.decls, 'declaration')}</p></a>`).join('')}</div>
    <h2>How to read a page</h2>
    <p class="prose">Every concept and theorem has a page. It starts with what it means, in words, then shows it in Lean. Two maps answer two questions: the <b>concept map</b> shows what a notion is built from (or, for a theorem, what it talks about); the <b>proof map</b> shows the results a proof uses, which you can unfold step by step. Notions so common they are used everywhere, like equality or the natural numbers, are listed apart as <i>basic notions</i>, and the routine steps of proofs are counted rather than listed. See <a href="#/about">About</a> for the words Lean uses.</p>`;
}
function countTree(t) {
  let all = 0, done = 0;
  (function walk(n) { for (const e of n.entries) { all++; if (e.decls.length) done++; } n.children.forEach(walk); })(t);
  return {all, done};
}

async function viewSubjects() {
  setNav('subjects');
  const render = n => `<li><a href="#/s/${encodeURIComponent(n.key)}">${esc(n.title)}</a> <span class="faint">${n.decls.toLocaleString()}</span>` +
    (n.children.length && n.key.split('.').length < 2 ? `<ul>${n.children.map(render).join('')}</ul>` : '') + '</li>';
  main.innerHTML = `<h1>Subjects</h1><p class="lede">Mathlib is organized in folders by subject. Each subject lists its main notions and results, its files, and its subtopics.</p>
    <ul class="tree">${S.subjects.children.map(render).join('')}</ul>`;
}

async function viewSubject(key) {
  setNav('subjects');
  const s = subjectIndex.get(key);
  if (!s) { main.innerHTML = `<p class="empty">No subject ${esc(key)}.</p>`; return; }
  const [concepts, results] = await Promise.all([nodesOf(s.keyConcepts), nodesOf(s.keyResults)]);
  const parts = key.split('.');
  const crumbs = ['<a href="#/subjects">Mathlib</a>', ...parts.slice(0, -1).map((p, k) => `<a href="#/s/${encodeURIComponent(parts.slice(0, k + 1).join('.'))}">${esc(subjectTitle(parts.slice(0, k + 1).join('.')))}</a>`)];
  const files = s.modules.map(moduleRow).filter(Boolean);
  main.innerHTML = `<div class="crumbs">${crumbs.join('<span class="sep">›</span>')}</div>
    <span class="kind subject">Subject</span><h1>${esc(s.title)}</h1>
    <p class="muted">${plural(s.decls, 'declaration')}${s.children.length ? ` · ${plural(s.children.length, 'subtopic')}` : ''}${files.length ? ` · ${plural(files.length, 'file')}` : ''}</p>
    <div class="two">
      <div class="section"><h2>Main notions</h2><p class="hint">The concepts of this subject that most of Mathlib builds on.</p><ul class="list">${concepts.map(itemHtml).join('')}</ul></div>
      <div class="section"><h2>Main results</h2><p class="hint">Its most used, documented or famous theorems.</p><ul class="list">${results.map(itemHtml).join('')}</ul></div>
    </div>
    ${s.children.length ? `<div class="section"><h2>Subtopics</h2><div class="chips">${[...s.children].sort((a, b) => b.decls - a.decls).map(c => `<a class="chip" href="#/s/${encodeURIComponent(c.key)}">${esc(c.title)} <span class="faint">${c.decls.toLocaleString()}</span></a>`).join('')}</div></div>` : ''}
    ${files.length ? `<div class="section"><h2>Files</h2><ul class="list">${files.map(f => `<li><a href="#/m/${encodeURIComponent(f.name)}"><span class="item-title">${esc(f.title)}</span><span class="item-sub">${esc(f.name)} · ${f.decls}</span></a>${f.summary ? `<div class="muted" style="font-size:14px">${md(f.summary, true)}</div>` : ''}</li>`).join('')}</ul></div>` : ''}`;
}

async function viewModule(name) {
  setNav('subjects');
  const mid = S.modules.findIndex(r => r[0] === name);
  if (mid < 0) { main.innerHTML = `<p class="empty">No file ${esc(name)} in Mathlib at this version.</p>`; return; }
  const m = await moduleData(mid), row = moduleRow(mid);
  const doc = m.doc || {};
  const decls = m.decls;
  const group = kinds => decls.filter(e => kinds.includes(e.kind));
  const books = doc.references && doc.references.length ? await fetchJSON('books.json') : {};
  const importedBy = (S.importedBy[String(mid)] || []).map(moduleRow);
  const entryItem = e => `<li><a href="#/d/${encodeURIComponent(e.name)}" data-id="${e.id}"><span class="item-title">${e.title ? md(e.title, true) : `<span class="mono">${esc(shortName(e.name))}</span>`}</span><span class="item-sub">${esc(e.name)}</span></a></li>`;
  main.innerHTML = `${crumbsFor(name)}
    <span class="kind file">File</span><h1>${esc(row.title)}</h1>
    <div class="leanname">${esc(name)} · <a href="${esc(m.url)}">source on GitHub</a></div>
    ${m.docText ? `<div class="section"><div class="prose">${md(m.docText.replace(/^\s*#\s.*$/m, ''), false, doc.names)}</div></div>` : '<p class="empty">This file has no description.</p>'}
    ${doc.tags && doc.tags.length ? `<div class="section"><h3>Keywords</h3><div class="chips">${doc.tags.map(t => `<a class="chip" href="#/search/${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div></div>` : ''}
    ${doc.references && doc.references.length ? `<div class="section"><h3>References</h3><ul class="list">${doc.references.map(k => books[k] ? `<li><a href="#/book/${encodeURIComponent(k)}">${esc(books[k].cite)}</a></li>` : `<li class="faint">${esc(k)}</li>`).join('')}</ul></div>` : ''}
    <div class="two">
      <div class="section"><h2>Concepts <span class="count">${group(['definition', 'structure', 'class', 'inductive type', 'axiom']).length}</span></h2><ul class="list">${group(['definition', 'structure', 'class', 'inductive type', 'axiom']).map(entryItem).join('') || '<li class="faint">None</li>'}</ul></div>
      <div class="section"><h2>Results <span class="count">${group(['theorem', 'lemma']).length}</span></h2><ul class="list">${group(['theorem', 'lemma']).slice(0, 200).map(entryItem).join('') || '<li class="faint">None</li>'}</ul>${group(['theorem', 'lemma']).length > 200 ? `<p class="faint">and ${group(['theorem', 'lemma']).length - 200} more</p>` : ''}</div>
    </div>
    ${group(['instance']).length ? `<details class="more"><summary>${plural(group(['instance']).length, 'instance')}</summary><ul class="list">${group(['instance']).map(entryItem).join('')}</ul></details>` : ''}
    <div class="two">
      <div class="section"><h3>Builds on</h3><ul class="list">${m.imports.map(moduleRow).filter(Boolean).map(f => `<li><a href="#/m/${encodeURIComponent(f.name)}">${esc(f.title)}</a></li>`).join('') || '<li class="faint">Only Lean itself</li>'}</ul></div>
      <div class="section"><h3>Used by <span class="count faint">${importedBy.length}</span></h3><ul class="list">${importedBy.slice(0, 40).map(f => `<li><a href="#/m/${encodeURIComponent(f.name)}">${esc(f.title)}</a></li>`).join('') || '<li class="faint">No other file</li>'}</ul></div>
    </div>`;
}

async function viewDecl(name) {
  const id = await idOf(name);
  if (id == null) { main.innerHTML = `<h1 class="mono">${esc(name)}</h1><p class="empty">This name is not a declaration of Mathlib at this version. <a href="#/search/${encodeURIComponent(name)}">Search for it</a>.</p>`; return; }
  const n = await node(id);
  let e = null, m = null;
  if (n.mid >= 0 && !(n.flags & FLAG.UPSTREAM)) { m = await moduleData(n.mid); e = m.decls.find(x => x.id === id); }
  if (!e) {
    main.innerHTML = `<h1 class="mono">${esc(name)}</h1><div class="prose">${n.title ? md(n.title) : ''}</div>
      <p class="empty">${n.flags & FLAG.UPSTREAM ? 'This is part of Lean itself (or a library below Mathlib), not of Mathlib.' : n.flags & FLAG.DEPRECATED ? 'This is a deprecated name, kept for compatibility.' : 'This is a technical declaration that this site does not show on its own.'}</p>`;
    return;
  }
  const ids = [...(e.built || []), ...(e.basic || []), ...(e.about || []), ...(e.facts || []), ...(e.examples || []), ...(e.builtOn || []), ...(e.uses || []), ...(e.usedIn || [])];
  const got = new Map((await nodesOf(ids)).map(x => [x.id, x]));
  const N = xs => (xs || []).map(i => got.get(i)).filter(Boolean);
  const isResult = e.kind === 'theorem' || e.kind === 'lemma', isInstance = e.kind === 'instance';
  const cls = isResult ? 'result' : isInstance ? 'instance' : 'concept';
  const [kw, kwTip] = KIND_WORDS[e.kind] || [e.kind, ''];
  const row = moduleRow(n.mid);
  const links = e.links || {};
  const badges = [
    ...(e.famous || []).map(f => `<span class="badge famous">★ ${f.list === '100' ? `No. ${esc(f.id)} of the 100 theorems` : 'On the 1000+ theorems list'}${f.authors ? ` · formalized by ${esc(f.authors)}` : ''}${f.date ? `, ${esc(f.date)}` : ''}</span>`),
    ...(links.wikidata || []).map(q => `<span class="badge"><a href="${wikipedia(q)}">Wikipedia ↗</a></span>`),
    ...(e.famous || []).filter(f => f.wikidata && !(links.wikidata || []).includes(f.wikidata)).map(f => `<span class="badge"><a href="${wikipedia(f.wikidata)}">Wikipedia ↗</a></span>`),
    ...(links.stacks || []).map(t => `<span class="badge"><a href="https://stacks.math.columbia.edu/tag/${encodeURIComponent(t.tag)}">Stacks project, tag ${esc(t.tag)} ↗</a>${t.comment ? ` <span class="faint">${esc(t.comment)}</span>` : ''}</span>`),
    ...(links.kerodon || []).map(t => `<span class="badge"><a href="https://kerodon.net/tag/${encodeURIComponent(t.tag)}">Kerodon, tag ${esc(t.tag)} ↗</a></span>`),
  ];
  const title = e.title ? md(e.title, true) : e.concl && isResult ? `<span class="mono" style="font-size:.8em">${lean(e.concl[0], e.concl[1])}</span>` : `<span class="mono">${esc(shortName(e.name))}</span>`;
  const list = (xs, total, emptyText) => xs.length ? `<ul class="list">${N(xs).map(itemHtml).join('')}</ul>${total > xs.length ? `<p class="faint" style="font-size:13.5px">and ${(total - xs.length).toLocaleString()} more</p>` : ''}` : `<p class="faint">${emptyText}</p>`;
  const chips = xs => `<div class="chips">${N(xs).map(x => chipHtml(x)).join('')}</div>`;
  const basicHtml = e.basic && e.basic.length ? basicChips(N(e.basic)) : '';
  const basic = basicHtml ? `<p class="hint" style="margin-top:8px">Basic notions: ${basicHtml}</p>` : '';
  let body = '';
  if (cls === 'concept') {
    body = `
      <div class="section"><h2>What it is built from <span class="count">${(e.built || []).length}</span></h2>
        <p class="hint">The notions its definition uses directly. Open the concept map to follow them further down.</p>
        ${(e.built || []).length ? chips(e.built) : '<p class="faint">Only basic notions.</p>'}${basic}
        <p><button class="btn" id="open-map">Show the concept map</button></p><div id="map-slot"></div></div>
      ${e.nExamples ? `<div class="section"><h2>Examples <span class="count">${e.nExamples.toLocaleString()}</span></h2><p class="hint">Objects Mathlib shows to be ${esc(article(e.title || shortName(e.name)))}: the instances of this class.</p>${list(e.examples, e.nExamples, '')}</div>` : ''}
      <div class="two">
        <div class="section"><h2>What Mathlib proves about it <span class="count">${(e.nFacts || 0).toLocaleString()}</span></h2>${list(e.facts || [], e.nFacts || 0, 'No theorem is about it yet.')}</div>
        <div class="section"><h2>Built on it <span class="count">${(e.nBuiltOn || 0).toLocaleString()}</span></h2><p class="hint">Notions defined using this one.</p>${list(e.builtOn || [], e.nBuiltOn || 0, 'Nothing is defined from it yet.')}</div>
      </div>`;
  } else if (isResult) {
    body = `
      <div class="section"><h2>What it is about</h2>
        ${(e.about || []).length ? chips(e.about) : '<p class="faint">Only basic notions.</p>'}${basic}</div>
      <div class="section"><h2>How it is proved <span class="count">${plural(e.nUses || 0, 'result')} used${e.nRoutine ? `, and ${plural(e.nRoutine, 'routine step')}` : ''}</span></h2>
        <p class="hint">The results its proof relies on, the most telling first. Routine steps (like <i>x · 1 = x</i>) and the workings of automatic tactics are counted, not listed. The proof map lets you unfold each step into its own proof.</p>
        ${list(e.uses || [], e.nUses || 0, 'Its proof uses no other result of Mathlib (only routine steps).')}
        ${(e.uses || []).length ? `<p><button class="btn" id="open-map">Show the proof map</button></p><div id="map-slot"></div>` : ''}</div>
      <div class="section"><h2>Used to prove <span class="count">${(e.nUsedIn || 0).toLocaleString()}</span></h2>${list(e.usedIn || [], e.nUsedIn || 0, 'No other result uses it yet.')}</div>`;
  } else {
    body = `<div class="section"><h2>What it is about</h2>${chips(e.about || [])}</div>`;
  }
  const neighbours = m.decls.filter(x => x.id !== id && x.kind !== 'instance').slice(0, 400);
  main.innerHTML = `${crumbsFor(m.name, [`<a href="#/m/${encodeURIComponent(m.name)}">${esc(row.title)}</a>`])}
    <span class="kind ${cls}" title="${esc(kwTip)}">${esc(kw)}</span>
    <h1>${title}</h1>
    <div class="leanname">${esc(e.name)} <button id="copy" title="Copy the Lean name">copy</button></div>
    ${badges.length ? `<div class="badges">${badges.join('')}</div>` : ''}
    ${e.doc ? `<div class="section prose">${md(e.doc, false, e.names)}</div>` : e.main ? `<div class="section prose">${md(e.main)}</div><p class="faint" style="font-size:13px">From the description of its file.</p>` : isResult ? '' : '<p class="faint">Mathlib gives no explanation of it in words.</p>'}
    <div class="section"><h3>In Lean</h3>
      ${e.sig ? `<div class="lean">${lean(e.sig[0], e.sig[1])}${fieldsHtml(e.fields)}</div>` : ''}
      ${e.value ? `<details class="more"><summary>How it is defined</summary><div class="lean">${lean(e.value[0], e.value[1])}</div></details>` : ''}
      <p class="faint" style="font-size:13px">Hover over a name to see what it is; click to open it. <a href="${esc(m.url)}#L${e.line ? e.line[0] : ''}${e.line ? '-L' + e.line[1] : ''}">Source on GitHub</a>.</p></div>
    ${body}
    <details class="more section"><summary>In the same file: ${esc(row.title)}</summary><ul class="list">${neighbours.map(x => `<li><a href="#/d/${encodeURIComponent(x.name)}">${x.title ? md(x.title, true) : `<span class="mono">${esc(shortName(x.name))}</span>`}</a></li>`).join('')}</ul></details>`;
  $('#copy').addEventListener('click', () => navigator.clipboard && navigator.clipboard.writeText(e.name).then(() => { $('#copy').textContent = 'copied'; }));
  const open = $('#open-map');
  if (open) open.addEventListener('click', () => { open.remove(); drawMap($('#map-slot'), id, isResult ? 'proof' : 'concept'); });
}
// A structure's or class's fields: first the structures it extends, then its data and axioms.
function fieldsHtml(fields) {
  if (!fields || !fields.length) return '';
  const parents = fields.filter(f => /^to[A-Z]/.test(f[0])), own = fields.filter(f => !/^to[A-Z]/.test(f[0]));
  return (parents.length ? `\n<span class="faint">extends</span> ${parents.map(f => lean(f[1], f[2])).join(', ')}` : '') +
    (own.length ? `\n<span class="faint">with</span>\n${own.map(f => `  ${esc(f[0])} : ${lean(f[1], f[2])}`).join('\n')}` : '');
}
const article = t => { const w = String(t).replace(/<[^>]+>/g, '').trim(); return (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w.charAt(0).toLowerCase() + w.slice(1); };

/* ---------- the maps ---------- */
async function drawMap(slot, rootId, mode) {
  slot.innerHTML = `<div class="graph" id="graph"></div><p class="graph-note">${mode === 'proof'
    ? 'The theorem on the left; to its right, the results its proof uses. Click a result to unfold its own proof; double-click to open its page. Drag to move, scroll to zoom.'
    : 'The notion on the left; to its right, what it is built from. Click a notion to unfold what it is built from; double-click to open its page. Drag to move, scroll to zoom.'}</p>`;
  if (typeof cytoscape === 'undefined') { slot.innerHTML = '<p class="faint">The map needs a library that did not load.</p>'; return; }
  if (window.cytoscapeDagre) try { cytoscape.use(window.cytoscapeDagre); } catch (e) { }
  const css = getComputedStyle(document.documentElement);
  const col = v => css.getPropertyValue(v).trim();
  const cy = cytoscape({
    container: $('#graph'), wheelSensitivity: 0.2, minZoom: 0.2, maxZoom: 2.5,
    style: [
      {selector: 'node', style: {'label': 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 190, 'font-size': 12, 'font-family': 'Inter, sans-serif',
        'color': col('--ink'), 'text-valign': 'center', 'text-halign': 'center', 'shape': 'round-rectangle', 'width': 'label', 'height': 'label',
        'padding': 8, 'background-color': col('--surface'), 'border-width': 1.5, 'border-color': col('--concept')}},
      {selector: 'node.result', style: {'border-color': col('--result')}},
      {selector: 'node.root', style: {'border-width': 3, 'font-weight': 600}},
      {selector: 'node.famous', style: {'border-color': col('--gold')}},
      {selector: 'node.open', style: {'background-color': col('--accent-soft')}},
      {selector: 'edge', style: {'width': 1.2, 'line-color': col('--line'), 'target-arrow-shape': 'triangle', 'target-arrow-color': col('--faint'),
        'arrow-scale': 0.8, 'curve-style': 'bezier'}},
    ],
  });
  const added = new Set(), opened = new Set();
  const addNode = (n, root = false) => {
    if (added.has(n.id)) return;
    added.add(n.id);
    const t = n.title && n.title.length <= 60 ? n.title.replace(/[`*$\\]/g, '') : shortName(n.name);
    cy.add({data: {id: String(n.id), label: t, name: n.name}, classes: [n.kind, root ? 'root' : '', n.flags & FLAG.FAMOUS ? 'famous' : ''].join(' ')});
  };
  const expand = async (id, depth) => {
    if (opened.has(id)) return;
    opened.add(id);
    const n = await node(id);
    if (n.mid < 0) return;
    const shard = await graphShard(n.mid).catch(() => ({}));
    const edges = shard[String(id)] || [[], []];
    const next = (mode === 'proof' ? edges[1] : edges[0]).slice(0, depth > 1 ? 7 : 5);
    const kids = await nodesOf(next);
    for (const k of kids) { addNode(k); cy.add({data: {source: String(id), target: String(k.id)}}); }
    cy.getElementById(String(id)).addClass('open');
    if (depth > 1) await Promise.all(kids.map(k => expand(k.id, depth - 1)));
  };
  addNode(await node(rootId), true);
  await expand(rootId, 2);
  const layout = () => {
    cy.layout({name: window.cytoscapeDagre ? 'dagre' : 'breadthfirst', rankDir: 'LR', nodeSep: 10, rankSep: 60, directed: true, animate: false}).run();
    cy.fit(undefined, 24);
    if (cy.zoom() < 0.75) { cy.zoom(0.75); cy.center(cy.getElementById(String(rootId))); cy.panBy({x: cy.width() * 0.35, y: 0}); }
  };
  layout();
  cy.on('tap', 'node', async ev => { await expand(+ev.target.id(), 1); layout(); });
  cy.on('dbltap', 'node', ev => { location.hash = '#/d/' + encodeURIComponent(ev.target.data('name')); });
}

/* ---------- search ---------- */
let searchRows = null;
async function viewSearch(q) {
  setNav('');
  $('#q').value = q;
  main.innerHTML = `<h1>Search</h1><p class="loading">Searching…</p>`;
  if (!searchRows) searchRows = await fetchJSON('search.json');
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) { main.innerHTML = '<h1>Search</h1><p class="empty">Type a concept, a theorem or a subject above.</p>'; return; }
  const plain = s => String(s || '').toLowerCase().replace(/[`*$\\{}]/g, '');
  const need = Math.max(1, Math.ceil(tokens.length * 0.5));
  const re = tokens.map(t => new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // Each word of the query found in the title (as a word, best), in the Lean name, or in the file's
  // keywords; most of the words must be found; then the more important first.
  const score = (title, extra, name, imp) => {
    const t = plain(title), x = plain(extra), nm = name.toLowerCase();
    let s = 0, found = 0;
    tokens.forEach((tok, k) => {
      const w = re[k].test(t) ? 6 : t.includes(tok) ? 3 : nm.includes(tok) ? 2 : x.includes(tok) ? 1 : 0;
      if (w) found++;
      s += w;
    });
    if (found < need) return -1;
    if (found === tokens.length) s += 8;
    if (t.replace(/[.\s]+$/, '') === tokens.join(' ')) s += 20;
    return s + 0.4 * imp - (t.length > 90 ? 2 : 0);
  };
  const decls = [];
  for (const r of searchRows) { const s = score(r[1], r[2], r[4] || '', r[3]); if (s >= 0) decls.push([s, r[0]]); }
  decls.sort((a, b) => b[0] - a[0]);
  const top = await nodesOf(decls.slice(0, 60).map(x => x[1]));
  const concepts = top.filter(n => n.kind === 'concept'), results = top.filter(n => n.kind === 'result');
  const subjects = [...subjectIndex.values()].filter(s => s.key && tokens.every(t => plain(s.title).includes(t))).slice(0, 12);
  const files = S.modules.map((r, i) => [r, i]).filter(([r]) => tokens.every(t => plain(r[1]).includes(t) || r[0].toLowerCase().includes(t))).slice(0, 15);
  main.innerHTML = `<h1>Search: ${esc(q)}</h1>
    <p class="muted">${plural(decls.length, 'match', 'matches')}${decls.length > 60 ? ', the 60 best shown' : ''}.</p>
    ${subjects.length ? `<div class="results-group"><h3>Subjects</h3><div class="chips">${subjects.map(s => `<a class="chip" href="#/s/${encodeURIComponent(s.key)}">${esc(s.title)}</a>`).join('')}</div></div>` : ''}
    <div class="two">
      <div class="results-group"><h3>Concepts</h3><ul class="list">${concepts.map(itemHtml).join('') || '<li class="faint">None</li>'}</ul></div>
      <div class="results-group"><h3>Theorems</h3><ul class="list">${results.map(itemHtml).join('') || '<li class="faint">None</li>'}</ul></div>
    </div>
    ${files.length ? `<div class="results-group"><h3>Files</h3><ul class="list">${files.map(([r]) => `<li><a href="#/m/${encodeURIComponent(r[0])}"><span class="item-title">${esc(r[1])}</span><span class="item-sub">${esc(r[0])}</span></a></li>`).join('')}</ul></div>` : ''}
    ${/[._]|^[A-Z]/.test(q.trim()) ? `<p class="faint">Looking for a Lean name? <a href="#/d/${encodeURIComponent(q.trim())}">Open ${esc(q.trim())}</a> directly.</p>` : ''}`;
}

/* ---------- catalogues ---------- */
async function viewFamous(which = '100') {
  setNav('famous');
  const cat = await fetchJSON('catalogs.json');
  const rows = which === '100' ? cat.hundred : cat.thousand;
  const done = rows.filter(r => r.decls.length).length;
  const names = new Map((await nodesOf(rows.flatMap(r => r.decls))).map(n => [n.id, n]));
  main.innerHTML = `<h1>Famous theorems</h1>
    <p class="lede">${which === '100' ? "Freek Wiedijk's list of 100 theorems, a classic benchmark of what proof assistants can do." : 'The 1000+ theorems project: famous theorems with a Wikipedia article.'} Mathlib has ${done} of ${rows.length}.</p>
    <div class="tabs"><a href="#/famous" class="${which === '100' ? 'on' : ''}">100 theorems</a><a href="#/famous/1000" class="${which === '1000' ? 'on' : ''}">1000+ theorems</a></div>
    <div class="bar"><i style="width:${Math.round(100 * done / Math.max(rows.length, 1))}%"></i></div>
    <table class="tbl"><thead><tr><th>${which === '100' ? 'No.' : ''}</th><th>Theorem</th><th>In Mathlib</th><th>Formalized by</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="faint">${which === '100' ? esc(r.id) : r.wikidata ? `<a href="${wikipedia(r.wikidata)}" title="Wikipedia">W</a>` : ''}</td>
      <td>${esc(r.title)}</td>
      <td>${r.decls.length ? r.decls.map(i => names.get(i)).filter(Boolean).map(n => `<a href="#/d/${encodeURIComponent(n.name)}" class="mono" style="font-size:12.5px">${esc(shortName(n.name))}</a>`).join('<br>')
        : (r.missing && r.missing.length) || r.url || r.links ? `<span class="status no" title="Formalized outside Mathlib, or under a name it no longer has">elsewhere</span>` : r.statement ? '<span class="status no">stated only</span>' : '<span class="status no">not yet</span>'}</td>
      <td class="muted" style="font-size:13.5px">${esc(r.authors || '')}${r.date ? `, ${esc(r.date)}` : ''}</td></tr>`).join('')}
    </tbody></table>`;
}

async function viewTree(which) {
  setNav(which === 'overview' ? 'curriculum' : 'curriculum');
  const cat = await fetchJSON('catalogs.json');
  const t = which === 'overview' ? cat.overview : cat.undergrad;
  const names = new Map((await nodesOf(collectIds(t))).map(n => [n.id, n]));
  const {all, done} = countTree(t);
  const render = (n, depth) => `<li>${depth ? `<b>${esc(n.title)}</b>` : ''}${n.entries.length ? `<ul>${n.entries.map(e => `<li>${e.decls.length
      ? `<a href="#/d/${encodeURIComponent(names.get(e.decls[0]).name)}">${esc(e.title)}</a>` : `${esc(e.title)} <span class="status no">not yet</span>`}</li>`).join('')}</ul>` : ''}` +
    (n.children.length ? `<ul>${n.children.map(c => render(c, depth + 1)).join('')}</ul>` : '') + '</li>';
  main.innerHTML = `<h1>${which === 'overview' ? "Mathlib's overview" : 'Undergraduate curriculum'}</h1>
    <p class="lede">${which === 'overview' ? 'Mathlib\'s own tour of its main notions, area by area (docs/overview.yaml).' : 'The topics of an undergraduate mathematics degree (after the French agrégation syllabus, docs/undergrad.yaml), and the declaration formalizing each.'} ${done} of ${all} are in Mathlib.</p>
    <div class="tabs"><a href="#/curriculum" class="${which !== 'overview' ? 'on' : ''}">Undergraduate curriculum</a><a href="#/overview" class="${which === 'overview' ? 'on' : ''}">Overview</a></div>
    <div class="bar"><i style="width:${Math.round(100 * done / Math.max(all, 1))}%"></i></div>
    <ul class="tree">${t.children.map(c => render(c, 1)).join('')}</ul>`;
}
function collectIds(t) { const out = []; (function w(n) { n.entries.forEach(e => out.push(...e.decls.slice(0, 1))); n.children.forEach(w); })(t); return out; }

async function viewBooks() {
  setNav('books');
  const books = await fetchJSON('books.json');
  const rows = Object.entries(books).sort((a, b) => b[1].modules.length - a[1].modules.length || a[1].cite.localeCompare(b[1].cite));
  main.innerHTML = `<h1>Books and papers</h1><p class="lede">The ${rows.length} references Mathlib's files cite (docs/references.bib), with how many files cite each.</p>
    <input class="search" id="bookq" style="max-width:420px;font:inherit;padding:7px 11px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink)" placeholder="Filter by author or title">
    <ul class="list" id="booklist"></ul>`;
  const draw = f => { $('#booklist').innerHTML = rows.filter(([, b]) => !f || b.cite.toLowerCase().includes(f)).map(([k, b]) =>
    `<li><a href="#/book/${encodeURIComponent(k)}"><span class="item-title">${esc(b.cite)}</span></a> <span class="faint">${b.modules.length ? plural(b.modules.length, 'file') : 'not cited by a file'}</span></li>`).join(''); };
  draw('');
  $('#bookq').addEventListener('input', ev => draw(ev.target.value.toLowerCase().trim()));
}
async function viewBook(key) {
  setNav('books');
  const b = (await fetchJSON('books.json'))[key];
  if (!b) { main.innerHTML = `<p class="empty">No reference ${esc(key)}.</p>`; return; }
  const link = b.url || (b.doi ? `https://doi.org/${b.doi}` : b.eprint ? `https://arxiv.org/abs/${b.eprint}` : '');
  main.innerHTML = `<div class="crumbs"><a href="#/books">Books and papers</a></div><h1>${esc(b.title || key)}</h1>
    <p class="lede">${esc((b.authors || b.editors || []).join(', '))}${b.year ? ` (${esc(b.year)})` : ''}${b.publisher ? ` · ${esc(b.publisher)}` : ''}${b.journal ? ` · ${esc(b.journal)}` : ''}</p>
    ${link ? `<p><a href="${esc(link)}">${esc(link)}</a></p>` : ''}
    <h2>Files citing it <span class="count faint">${b.modules.length}</span></h2>
    <ul class="list">${b.modules.map(moduleRow).map(f => `<li><a href="#/m/${encodeURIComponent(f.name)}"><span class="item-title">${esc(f.title)}</span><span class="item-sub">${esc(f.name)}</span></a></li>`).join('') || '<li class="faint">None</li>'}</ul>`;
}

async function viewMap() {
  setNav('map');
  const areas = S.map.areas.filter(a => !a.tooling);
  main.innerHTML = `<h1>The map of Mathlib</h1><p class="lede">Each subject, sized by how much it contains; an arrow from one to another when the first builds its notions on the second's, the thicker the more. Click a subject to open it.</p>
    <div class="graph" id="graph" style="height:620px"></div>`;
  if (typeof cytoscape === 'undefined') return;
  const css = getComputedStyle(document.documentElement), col = v => css.getPropertyValue(v).trim();
  const keys = new Set(areas.map(a => a.key));
  const max = Math.max(...areas.map(a => a.size));
  const edges = S.map.edges.filter(([a, b]) => keys.has(a) && keys.has(b)).slice(0, 70);
  const wmax = Math.max(1, ...edges.map(e => e[2]));
  const cy = cytoscape({container: $('#graph'), minZoom: 0.3, maxZoom: 2,
    elements: [...areas.map(a => ({data: {id: a.key, label: a.title, size: 30 + 90 * Math.sqrt(a.size / max)}})),
      ...edges.map(([a, b, w]) => ({data: {source: a, target: b, w: 0.6 + 5 * Math.log1p(w) / Math.log1p(wmax)}}))],
    style: [{selector: 'node', style: {'label': 'data(label)', 'width': 'data(size)', 'height': 'data(size)', 'background-color': col('--accent-soft'),
      'border-width': 1.5, 'border-color': col('--accent'), 'font-size': 12, 'color': col('--ink'), 'text-valign': 'center', 'text-wrap': 'wrap', 'text-max-width': 110}},
      {selector: 'edge', style: {'width': 'data(w)', 'line-color': col('--line'), 'target-arrow-shape': 'triangle', 'target-arrow-color': col('--faint'), 'curve-style': 'bezier', 'opacity': 0.8}}],
    layout: {name: 'cose', animate: false, nodeRepulsion: 90000, idealEdgeLength: 140, padding: 20}});
  cy.on('tap', 'node', ev => { location.hash = '#/s/' + encodeURIComponent(ev.target.id()); });
}

function viewAbout() {
  setNav('about');
  const m = S.mathlib;
  main.innerHTML = `<h1>About</h1>
    <div class="prose"><p><a href="https://github.com/leanprover-community/mathlib4">Mathlib</a> is a library of mathematics for the Lean proof assistant, written by hundreds of mathematicians and computer scientists. Lean checks every proof, down to the axioms. This site shows what Mathlib contains to readers who do not know Lean.</p>
    <p>Everything shown comes from Mathlib itself: the explanations are its documentation, the titles of famous theorems and curriculum topics are its own catalogues, the references are its bibliography, and the links to Wikipedia and the Stacks project are its own attributes. What each notion is built from, and what each proof uses, is read from the compiled library.</p>
    <p>This version shows Mathlib at commit <a href="https://github.com/${esc(m.repo)}/tree/${esc(m.commit)}" class="mono">${esc(m.commit.slice(0, 10))}</a> (Lean ${esc(m.toolchain)}), read by ${esc(m.producer)}. It is built by the <a href="https://github.com/LeanTrustBuilders">LeanTrustBuilders</a> tools: <a href="https://github.com/LeanTrustBuilders/extractor">trust-extract</a> reads the library, <a href="https://github.com/LeanTrustBuilders/evidence-core">evidence-core</a> reads its documentation and catalogues and summarizes its graphs, and <a href="https://github.com/LeanTrustBuilders/mathlib-explorer">mathlib-explorer</a> lays out these pages.</p></div>
    <h2>The words Lean uses</h2>
    <dl class="glossary">
      ${Object.entries(KIND_WORDS).map(([, [w, t]]) => `<dt>${esc(w)}</dt><dd>${esc(t)}</dd>`).join('')}
      <dt>Type</dt><dd>What Lean calls a set or a kind of object: ℕ, ℝ, the groups, the continuous functions from ℝ to ℝ.</dd>
      <dt>Proposition</dt><dd>A statement that can be true or false; a proof of it is an object of that type.</dd>
      <dt>Namespace</dt><dd>The prefix of a name, like <code>Nat.</code> in <code>Nat.Prime</code>: it groups declarations about the same thing.</dd>
      <dt>Concept map</dt><dd>What a notion is built from, or what a theorem talks about: the notions its definition or statement uses, and theirs in turn.</dd>
      <dt>Proof map</dt><dd>The results a proof uses, and the results their proofs use in turn.</dd>
      <dt>Basic notions and routine steps</dt><dd>Notions from Lean itself (equality, numbers, notation), and results used in a large share of all proofs (like <i>x + 0 = x</i>) or by automatic tactics: they are counted, not listed.</dd>
    </dl>`;
}

/* ---------- hover ---------- */
const tip = $('#tip');
let tipFor = null;
document.addEventListener('mouseover', async ev => {
  const a = ev.target.closest('a[data-name], a[data-id]');
  if (!a || a === tipFor) return;
  tipFor = a;
  const id = a.dataset.id != null ? +a.dataset.id : await idOf(a.dataset.name);
  if (tipFor !== a) return;
  if (id == null) { tip.innerHTML = `<div class="t-name">${esc(a.dataset.name)}</div><div class="faint">Part of Lean's machinery.</div>`; }
  else {
    const n = await node(id);
    if (tipFor !== a || !n) return;
    const kind = {concept: 'Concept', result: 'Result', instance: 'Instance'}[n.kind] || '';
    tip.innerHTML = `<div class="t-name">${esc(n.name)}${kind ? ` · ${kind}` : ''}${n.flags & FLAG.UPSTREAM ? ' · from Lean' : ''}</div>${n.title ? `<div class="t-title">${label(n, 200)}</div>` : ''}`;
  }
  const r = a.getBoundingClientRect();
  tip.hidden = false;
  tip.style.left = Math.min(r.left, innerWidth - 400) + 'px';
  tip.style.top = (r.bottom + 8 + 200 > innerHeight ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + 'px';
});
document.addEventListener('mouseout', ev => { if (tipFor && !tipFor.contains(ev.relatedTarget)) { tip.hidden = true; tipFor = null; } });

/* ---------- routing ---------- */
async function route() {
  tip.hidden = true; tipFor = null;
  const h = decodeURIComponent(location.hash.slice(1) || '/');
  const [, page, ...rest] = h.split('/');
  const arg = rest.join('/');
  try {
    if (!page) await viewHome();
    else if (page === 'd') await viewDecl(arg);
    else if (page === 'm') await viewModule(arg);
    else if (page === 's') await viewSubject(arg);
    else if (page === 'subjects') await viewSubjects();
    else if (page === 'search') await viewSearch(arg);
    else if (page === 'famous') await viewFamous(arg || '100');
    else if (page === 'curriculum') await viewTree('undergrad');
    else if (page === 'overview') await viewTree('overview');
    else if (page === 'books') await viewBooks();
    else if (page === 'book') await viewBook(arg);
    else if (page === 'map') await viewMap();
    else if (page === 'about') viewAbout();
    else main.innerHTML = '<p class="empty">No such page.</p>';
  } catch (e) {
    console.error(e);
    main.innerHTML = `<p class="empty">This page could not be loaded (${esc(e.message)}).</p>`;
  }
  window.scrollTo(0, 0);
  main.focus({preventScroll: true});
}
$('#search-form').addEventListener('submit', ev => { ev.preventDefault(); const q = $('#q').value.trim(); if (q) location.hash = '#/search/' + encodeURIComponent(q); });
$('#theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('mx-theme', document.documentElement.dataset.theme); } catch (e) { }
});
try { const t = localStorage.getItem('mx-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { }
window.addEventListener('hashchange', route);
(async () => {
  S = await fetchJSON('site.json');
  indexSubjects(S.subjects);
  $('#foot').innerHTML = `Mathlib at <a class="mono" href="https://github.com/${esc(S.mathlib.repo)}/tree/${esc(S.mathlib.commit)}">${esc(S.mathlib.commit.slice(0, 10))}</a> · built ${esc(S.generated.slice(0, 10))} by the <a href="https://github.com/LeanTrustBuilders">LeanTrustBuilders</a> tools · <a href="#/about">About</a>`;
  route();
})();
