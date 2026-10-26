/* adahome.ca page runtime.
 * Renders the site's page templates (holes, sc-for, sc-if, dc-import) from a JSON tree,
 * to an HTML string at build time (Node) and to the live DOM in the browser,
 * where it patches the pre-rendered markup in place and wires up events and forms.
 * No dependencies. */
(function (root) {
  'use strict';
  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var ONE = /^\{\{\s*([^}]+?)\s*\}\}$/;

  // ---------- template evaluation ----------
  function get(scope, path) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.'), v = scope;
    for (var i = 0; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function str(v) { return v == null || v === false ? '' : String(v); }
  function interp(s, scope) {
    var m = ONE.exec(s);
    if (m) return get(scope, m[1]);
    return s.replace(HOLE, function (_, p) { return str(get(scope, p)); });
  }

  var LINKS = {};          // 'Steps' -> '/buying-selling/'
  function mapHref(h) {
    if (typeof h !== 'string') return h;
    var m = /^\/?([\w-]+)\.dc\.html(#.*)?$/.exec(h);
    if (!m) return h;
    var u = LINKS[m[1]];
    return u ? u + (m[2] || '') : h;
  }

  // vnode: string | {tag, props, kids}
  function build(nodes, scope, ctx, out) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.t === 'text') { out.push(str(interp(n.v, scope))); continue; }
      if (n.t === 'for') {
        var list = interp(n.list, scope) || [];
        for (var j = 0; j < list.length; j++) {
          var s2 = Object.create(scope); s2[n.as] = list[j]; s2.$index = j;
          build(n.kids, s2, ctx, out);
        }
        continue;
      }
      if (n.t === 'if') { if (interp(n.value, scope)) build(n.kids, scope, ctx, out); continue; }
      if (n.t === 'imp') {
        var props = {};
        for (var a = 0; a < n.attrs.length; a++) {
          var k = n.attrs[a][0];
          if (k === 'name' || k.indexOf('hint-') === 0) continue;
          props[k.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })] = interp(n.attrs[a][1], scope);
        }
        out.push(ctx.child(n.name, props, ctx.path + '/' + n.name + (ctx.seq[n.name] = (ctx.seq[n.name] || 0) + 1)));
        continue;
      }
      var p = {};
      for (var b = 0; b < n.attrs.length; b++) {
        var nm = n.attrs[b][0], val = n.attrs[b][1];
        var v = val == null ? true : interp(val, scope);
        if (nm === 'href') v = mapHref(v);
        p[nm] = v;
      }
      var kids = [];
      build(n.kids, scope, ctx, kids);
      out.push({ tag: n.tag, props: p, kids: norm(kids) });
    }
    return out;
  }
  // flatten nested arrays (component output), merge adjacent strings, drop empty strings
  function norm(kids) {
    var out = [];
    (function walk(a) {
      for (var i = 0; i < a.length; i++) {
        var k = a[i];
        if (Array.isArray(k)) { walk(k); continue; }
        if (typeof k === 'string') {
          if (k === '') continue;
          if (typeof out[out.length - 1] === 'string') out[out.length - 1] += k; else out.push(k);
        } else out.push(k);
      }
    })(kids);
    return out;
  }

  // ---------- components ----------
  function makeBase(onUpdate) {
    function DCLogic(props) { this.props = props || {}; this.state = {}; }
    DCLogic.prototype.setState = function (patch) {
      var p = typeof patch === 'function' ? patch(this.state, this.props) : patch;
      this.state = Object.assign({}, this.state, p);
      onUpdate();
    };
    DCLogic.prototype.forceUpdate = function () { onUpdate(); };
    return DCLogic;
  }

  // defs: { Name: { tree: [...], src: 'class Component extends DCLogic {...}' } }
  function App(defs, rootName, rootProps, onUpdate) {
    var self = this;
    this.defs = defs; this.instances = {};
    var DCLogic = makeBase(function () { if (onUpdate) onUpdate(self); });
    this.classes = {};
    Object.keys(defs).forEach(function (k) {
      /* jshint evil:true */
      self.classes[k] = new Function('DCLogic', defs[k].src + '\n;return Component;')(DCLogic);
    });
    this.rootName = rootName; this.rootProps = rootProps || {};
  }
  App.prototype.render = function () {
    var self = this;
    function renderComp(name, props, path) {
      var inst = self.instances[path];
      if (!inst) { inst = self.instances[path] = new self.classes[name](props); if (!inst.state) inst.state = {}; }
      else inst.props = props;
      var vals = inst.renderVals ? inst.renderVals() : {};
      var ctx = { path: path, seq: {}, child: renderComp };
      return norm(build(self.defs[name].tree, vals, ctx, []));
    }
    return renderComp(this.rootName, this.rootProps, this.rootName);
  };

  // ---------- HTML string (build time) ----------
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escA(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function toHTML(v) {
    if (Array.isArray(v)) return v.map(toHTML).join('');
    if (typeof v === 'string') return esc(v);
    var s = '<' + v.tag;
    for (var k in v.props) {
      var val = v.props[k];
      if (typeof val === 'function' || val == null || val === false) continue;
      if (/^on[A-Z]/.test(k)) continue;
      s += val === true ? ' ' + k : ' ' + k + '="' + escA(val) + '"';
    }
    s += '>';
    if (VOID[v.tag.toLowerCase()]) return s;
    return s + toHTML(v.kids) + '</' + v.tag + '>';
  }

  // ---------- DOM patching (browser) ----------
  function evName(k, el) {
    var e = k.slice(2).toLowerCase();
    if (e === 'change') {
      var t = (el.getAttribute('type') || '').toLowerCase();
      var tag = el.tagName;
      if ((tag === 'INPUT' && t !== 'checkbox' && t !== 'radio') || tag === 'TEXTAREA') return 'input';
    }
    if (e === 'doubleclick') return 'dblclick';
    return e;
  }
  function dispatch(e) { var h = e.currentTarget.__h && e.currentTarget.__h[e.type]; if (h) return h(e); }
  function setProps(el, props, isSvg) {
    var old = el.__p || {};
    var k;
    for (k in old) if (!(k in props)) {
      if (/^on[A-Z]/.test(k)) { var en = evName(k, el); if (el.__h) el.__h[en] = null; }
      else el.removeAttribute(k);
    }
    for (k in props) {
      var v = props[k];
      if (/^on[A-Z]/.test(k)) {
        var ev = evName(k, el);
        el.__h = el.__h || {};
        if (!el.__l || !el.__l[ev]) { el.addEventListener(ev, dispatch); (el.__l = el.__l || {})[ev] = 1; }
        el.__h[ev] = wrapHandler(el, k, v);
        continue;
      }
      if (k === 'value' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        var sv = str(v);
        if (el.value !== sv && !(document.activeElement === el && old.value === v)) el.value = sv;
        el.setAttribute('value', sv);
        continue;
      }
      if (k === 'checked' && el.tagName === 'INPUT') { el.checked = !!v && v !== 'false'; continue; }
      if (v == null || v === false) { el.removeAttribute(k); continue; }
      var s = v === true ? '' : String(v);
      if (el.getAttribute(k) !== s) el.setAttribute(k, s);
    }
    el.__p = props;
  }
  function create(v, isSvg) {
    if (typeof v === 'string') return document.createTextNode(v);
    var svg = isSvg || v.tag === 'svg';
    var el = svg ? document.createElementNS(SVGNS, v.tag) : document.createElement(v.tag);
    setProps(el, v.props, svg);
    for (var i = 0; i < v.kids.length; i++) el.appendChild(create(v.kids[i], svg && v.tag !== 'foreignObject'));
    return el;
  }
  function patchKids(parent, vkids, isSvg) {
    var dom = parent.childNodes;
    // drop comments so indexes line up with vnodes
    for (var c = dom.length - 1; c >= 0; c--) if (dom[c].nodeType === 8) parent.removeChild(dom[c]);
    for (var i = 0; i < vkids.length; i++) {
      var v = vkids[i], d = dom[i];
      if (!d) { parent.appendChild(create(v, isSvg)); continue; }
      if (typeof v === 'string') {
        if (d.nodeType === 3) { if (d.nodeValue !== v) d.nodeValue = v; }
        else parent.replaceChild(document.createTextNode(v), d);
        continue;
      }
      if (d.nodeType === 1 && d.tagName.toLowerCase() === v.tag.toLowerCase()) {
        var svg = isSvg || v.tag === 'svg';
        setProps(d, v.props, svg);
        if (!VOID[v.tag.toLowerCase()]) patchKids(d, v.kids, svg && v.tag !== 'foreignObject');
      } else parent.replaceChild(create(v, isSvg), d);
    }
    while (dom.length > vkids.length) parent.removeChild(dom[dom.length - 1]);
  }

  // ---------- forms ----------
  var FORM = { endpoint: 'https://api.web3forms.com/submit', key: '', site: 'adahome.ca' };
  var SUBJECTS = {
    'consultation': 'New consultation request',
    'home-brief': 'New home brief',
    'valuation': 'New home valuation request',
    'showing': 'New showing request',
    'newsletter': 'New monthly market update subscriber'
  };
  function collect(form) {
    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (v, k) { data[k] = data[k] ? data[k] + ', ' + v : v; });
    // chip groups (buttons with aria-pressed) are not form fields: read them from the page
    var pressed = form.querySelectorAll('button[aria-pressed="true"]');
    for (var i = 0; i < pressed.length; i++) {
      var b = pressed[i], group = b.parentElement && b.parentElement.previousElementSibling;
      var label = group ? (group.firstChild && group.firstChild.nodeValue || group.textContent) : 'Choice';
      label = String(label).replace(/·.*/, '').trim() || 'Choice';
      var txt = b.textContent.trim();
      data[label] = data[label] ? data[label] + ', ' + txt : txt;
    }
    return data;
  }
  function send(form) {
    if (!FORM.key) { if (window.console) console.warn('Form key missing'); return; }
    var kind = form.getAttribute('data-form') || 'form';
    var data = collect(form);
    data.access_key = FORM.key;
    data.subject = (SUBJECTS[kind] || 'New message') + ' · ' + FORM.site;
    data.from_name = 'adahome.ca website';
    data.Page = location.pathname;
    if (data.Email && !data.replyto) data.replyto = data.Email;
    try {
      fetch(FORM.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
        .catch(function () {});
    } catch (e) {}
  }
  function wrapHandler(el, k, fn) {
    if (typeof fn !== 'function') return null;
    if (k === 'onClick' && el.tagName === 'BUTTON' && (el.getAttribute('type') || '').toLowerCase() === 'submit') {
      return function (e) {
        var form = el.form;
        if (form && form.checkValidity()) send(form);
        return fn(e);
      };
    }
    return fn;
  }

  // ---------- public ----------
  var DC = {
    links: function (map) { LINKS = map; },
    formKey: function (k) { FORM.key = k; },
    renderToString: function (defs, name, props) { return toHTML(new App(defs, name, props).render()); },
    mount: function (rootEl, defs, name, props) {
      var pending = false;
      var app = new App(defs, name, props, function () {
        if (pending) return; pending = true;
        (window.requestAnimationFrame || setTimeout)(function () { pending = false; patchKids(rootEl, app.render(), false); });
      });
      patchKids(rootEl, app.render(), false);
      // lifecycle: let components start timers etc. once they're on the page
      Object.keys(app.instances).forEach(function (k) { var i = app.instances[k]; if (i.componentDidMount && !i.__mounted) { i.__mounted = true; i.componentDidMount(); } });
      return app;
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DC; else root.DC = DC;
})(typeof window !== 'undefined' ? window : this);
