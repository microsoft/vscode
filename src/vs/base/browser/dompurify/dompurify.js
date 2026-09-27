/*! @license DOMPurify 3.4.15 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.15/LICENSE */

function _arrayLikeToArray(r, a) {
  (null == a || a > r.length) && (a = r.length);
  for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
  return n;
}
function _arrayWithHoles(r) {
  if (Array.isArray(r)) return r;
}
function _iterableToArrayLimit(r, l) {
  var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
  if (null != t) {
    var e,
      n,
      i,
      u,
      a = [],
      f = true,
      o = false;
    try {
      if (i = (t = t.call(r)).next, 0 === l) ; else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0);
    } catch (r) {
      o = true, n = r;
    } finally {
      try {
        if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return;
      } finally {
        if (o) throw n;
      }
    }
    return a;
  }
}
function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _slicedToArray(r, e) {
  return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
}
function _unsupportedIterableToArray(r, a) {
  if (r) {
    if ("string" == typeof r) return _arrayLikeToArray(r, a);
    var t = {}.toString.call(r).slice(8, -1);
    return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
  }
}

const entries = Object.entries,
  setPrototypeOf = Object.setPrototypeOf,
  isFrozen = Object.isFrozen,
  getPrototypeOf = Object.getPrototypeOf,
  getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
let freeze = Object.freeze,
  seal = Object.seal,
  create = Object.create; // eslint-disable-line import/no-mutable-exports
let _ref = typeof Reflect !== 'undefined' && Reflect,
  apply = _ref.apply,
  construct = _ref.construct;
if (!freeze) {
  freeze = function freeze(x) {
    return x;
  };
}
if (!seal) {
  seal = function seal(x) {
    return x;
  };
}
if (!apply) {
  apply = function apply(func, thisArg) {
    for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
      args[_key - 2] = arguments[_key];
    }
    return func.apply(thisArg, args);
  };
}
if (!construct) {
  construct = function construct(Func) {
    for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
      args[_key2 - 1] = arguments[_key2];
    }
    return new Func(...args);
  };
}
const arrayForEach = unapply(Array.prototype.forEach);
const arrayLastIndexOf = unapply(Array.prototype.lastIndexOf);
const arrayPop = unapply(Array.prototype.pop);
const arrayPush = unapply(Array.prototype.push);
const arraySplice = unapply(Array.prototype.splice);
const arrayIsArray = Array.isArray;
const stringToLowerCase = unapply(String.prototype.toLowerCase);
const stringToString = unapply(String.prototype.toString);
const stringMatch = unapply(String.prototype.match);
const stringReplace = unapply(String.prototype.replace);
const stringIndexOf = unapply(String.prototype.indexOf);
const stringTrim = unapply(String.prototype.trim);
const numberToString = unapply(Number.prototype.toString);
const booleanToString = unapply(Boolean.prototype.toString);
const bigintToString = typeof BigInt === 'undefined' ? null : unapply(BigInt.prototype.toString);
const symbolToString = typeof Symbol === 'undefined' ? null : unapply(Symbol.prototype.toString);
const objectHasOwnProperty = unapply(Object.prototype.hasOwnProperty);
const objectToString = unapply(Object.prototype.toString);
const regExpTest = unapply(RegExp.prototype.test);
const typeErrorCreate = unconstruct(TypeError);
/**
 * Creates a new function that calls the given function with a specified thisArg and arguments.
 *
 * @param func - The function to be wrapped and called.
 * @returns A new function that calls the given function with a specified thisArg and arguments.
 */
function unapply(func) {
  return function (thisArg) {
    if (thisArg instanceof RegExp) {
      thisArg.lastIndex = 0;
    }
    for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
      args[_key3 - 1] = arguments[_key3];
    }
    return apply(func, thisArg, args);
  };
}
/**
 * Creates a new function that constructs an instance of the given constructor function with the provided arguments.
 *
 * @param func - The constructor function to be wrapped and called.
 * @returns A new function that constructs an instance of the given constructor function with the provided arguments.
 */
function unconstruct(Func) {
  return function () {
    for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
      args[_key4] = arguments[_key4];
    }
    return construct(Func, args);
  };
}
/**
 * Add properties to a lookup table
 *
 * @param set - The set to which elements will be added.
 * @param array - The array containing elements to be added to the set.
 * @param transformCaseFunc - An optional function to transform the case of each element before adding to the set.
 * @returns The modified set with added elements.
 */
function addToSet(set, array) {
  let transformCaseFunc = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : stringToLowerCase;
  if (setPrototypeOf) {
    // Make 'in' and truthy checks like Boolean(set.constructor)
    // independent of any properties defined on Object.prototype.
    // Prevent prototype setters from intercepting set as a this value.
    setPrototypeOf(set, null);
  }
  if (!arrayIsArray(array)) {
    return set;
  }
  let l = array.length;
  while (l--) {
    let element = array[l];
    if (typeof element === 'string') {
      const lcElement = transformCaseFunc(element);
      if (lcElement !== element) {
        // Config presets (e.g. tags.js, attrs.js) are immutable.
        if (!isFrozen(array)) {
          array[l] = lcElement;
        }
        element = lcElement;
      }
    }
    set[element] = true;
  }
  return set;
}
/**
 * Clean up an array to harden against CSPP
 *
 * @param array - The array to be cleaned.
 * @returns The cleaned version of the array
 */
function cleanArray(array) {
  for (let index = 0; index < array.length; index++) {
    const isPropertyExist = objectHasOwnProperty(array, index);
    if (!isPropertyExist) {
      array[index] = null;
    }
  }
  return array;
}
/**
 * Shallow clone an object
 *
 * @param object - The object to be cloned.
 * @returns A new object that copies the original.
 */
function clone(object) {
  const newObject = create(null);
  for (const _ref2 of entries(object)) {
    var _ref3 = _slicedToArray(_ref2, 2);
    const property = _ref3[0];
    const value = _ref3[1];
    const isPropertyExist = objectHasOwnProperty(object, property);
    if (isPropertyExist) {
      if (arrayIsArray(value)) {
        newObject[property] = cleanArray(value);
      } else if (value && typeof value === 'object' && value.constructor === Object) {
        newObject[property] = clone(value);
      } else {
        newObject[property] = value;
      }
    }
  }
  return newObject;
}
/**
 * Convert non-node values into strings without depending on direct property access.
 *
 * @param value - The value to stringify.
 * @returns A string representation of the provided value.
 */
function stringifyValue(value) {
  switch (typeof value) {
    case 'string':
      {
        return value;
      }
    case 'number':
      {
        return numberToString(value);
      }
    case 'boolean':
      {
        return booleanToString(value);
      }
    case 'bigint':
      {
        return bigintToString ? bigintToString(value) : '0';
      }
    case 'symbol':
      {
        return symbolToString ? symbolToString(value) : 'Symbol()';
      }
    case 'undefined':
      {
        return objectToString(value);
      }
    case 'function':
    case 'object':
      {
        if (value === null) {
          return objectToString(value);
        }
        const valueAsRecord = value;
        const valueToString = lookupGetter(valueAsRecord, 'toString');
        if (typeof valueToString === 'function') {
          const stringified = valueToString(valueAsRecord);
          return typeof stringified === 'string' ? stringified : objectToString(stringified);
        }
        return objectToString(value);
      }
    default:
      {
        return objectToString(value);
      }
  }
}
/**
 * This method automatically checks if the prop is function or getter and behaves accordingly.
 *
 * @param object - The object to look up the getter function in its prototype chain.
 * @param prop - The property name for which to find the getter function.
 * @returns The getter function found in the prototype chain or a fallback function.
 */
function lookupGetter(object, prop) {
  while (object !== null) {
    const desc = getOwnPropertyDescriptor(object, prop);
    if (desc) {
      if (desc.get) {
        return unapply(desc.get);
      }
      if (typeof desc.value === 'function') {
        return unapply(desc.value);
      }
    }
    object = getPrototypeOf(object);
  }
  function fallbackValue() {
    return null;
  }
  return fallbackValue;
}
function isRegex(value) {
  try {
    regExpTest(value, '');
    return true;
  } catch (_unused) {
    return false;
  }
}

const html$1 = freeze(['a', 'abbr', 'acronym', 'address', 'area', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo', 'big', 'blink', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'content', 'data', 'datalist', 'dd', 'decorator', 'del', 'details', 'dfn', 'dialog', 'dir', 'div', 'dl', 'dt', 'element', 'em', 'fieldset', 'figcaption', 'figure', 'font', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'main', 'map', 'mark', 'marquee', 'menu', 'menuitem', 'meter', 'nav', 'nobr', 'ol', 'optgroup', 'option', 'output', 'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'search', 'section', 'select', 'shadow', 'slot', 'small', 'source', 'spacer', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'track', 'tt', 'u', 'ul', 'var', 'video', 'wbr']);
const svg$1 = freeze(['svg', 'a', 'altglyph', 'altglyphdef', 'altglyphitem', 'animatecolor', 'animatemotion', 'animatetransform', 'circle', 'clippath', 'defs', 'desc', 'ellipse', 'enterkeyhint', 'exportparts', 'filter', 'font', 'g', 'glyph', 'glyphref', 'hkern', 'image', 'inputmode', 'line', 'lineargradient', 'marker', 'mask', 'metadata', 'mpath', 'part', 'path', 'pattern', 'polygon', 'polyline', 'radialgradient', 'rect', 'stop', 'style', 'switch', 'symbol', 'text', 'textpath', 'title', 'tref', 'tspan', 'view', 'vkern']);
const svgFilters = freeze(['feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence']);
// List of SVG elements that are disallowed by default.
// We still need to know them so that we can do namespace
// checks properly in case one wants to add them to
// allow-list.
const svgDisallowed = freeze(['animate', 'color-profile', 'cursor', 'discard', 'font-face', 'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri', 'foreignobject', 'hatch', 'hatchpath', 'mesh', 'meshgradient', 'meshpatch', 'meshrow', 'missing-glyph', 'script', 'set', 'solidcolor', 'unknown', 'use']);
const mathMl$1 = freeze(['math', 'menclose', 'merror', 'mfenced', 'mfrac', 'mglyph', 'mi', 'mlabeledtr', 'mmultiscripts', 'mn', 'mo', 'mover', 'mpadded', 'mphantom', 'mroot', 'mrow', 'ms', 'mspace', 'msqrt', 'mstyle', 'msub', 'msup', 'msubsup', 'mtable', 'mtd', 'mtext', 'mtr', 'munder', 'munderover', 'mprescripts']);
// Similarly to SVG, we want to know all MathML elements,
// even those that we disallow by default.
const mathMlDisallowed = freeze(['maction', 'maligngroup', 'malignmark', 'mlongdiv', 'mscarries', 'mscarry', 'msgroup', 'mstack', 'msline', 'msrow', 'semantics', 'annotation', 'annotation-xml', 'mprescripts', 'none']);
const text = freeze(['#text']);

const html = freeze(['accept', 'action', 'align', 'alt', 'autocapitalize', 'autocomplete', 'autopictureinpicture', 'autoplay', 'background', 'bgcolor', 'border', 'capture', 'cellpadding', 'cellspacing', 'checked', 'cite', 'class', 'clear', 'color', 'cols', 'colspan', 'command', 'commandfor', 'controls', 'controlslist', 'coords', 'crossorigin', 'datetime', 'decoding', 'default', 'dir', 'disabled', 'disablepictureinpicture', 'disableremoteplayback', 'download', 'draggable', 'enctype', 'enterkeyhint', 'exportparts', 'face', 'for', 'headers', 'height', 'hidden', 'high', 'href', 'hreflang', 'id', 'inert', 'inputmode', 'integrity', 'ismap', 'kind', 'label', 'lang', 'list', 'loading', 'loop', 'low', 'max', 'maxlength', 'media', 'method', 'min', 'minlength', 'multiple', 'muted', 'name', 'nonce', 'noshade', 'novalidate', 'nowrap', 'open', 'optimum', 'part', 'pattern', 'placeholder', 'playsinline', 'popover', 'popovertarget', 'popovertargetaction', 'poster', 'preload', 'pubdate', 'radiogroup', 'readonly', 'rel', 'required', 'rev', 'reversed', 'role', 'rows', 'rowspan', 'spellcheck', 'scope', 'selected', 'shape', 'size', 'sizes', 'slot', 'span', 'srclang', 'start', 'src', 'srcset', 'step', 'style', 'summary', 'tabindex', 'title', 'translate', 'type', 'usemap', 'valign', 'value', 'width', 'wrap', 'xmlns']);
const svg = freeze(['accent-height', 'accumulate', 'additive', 'alignment-baseline', 'amplitude', 'ascent', 'attributename', 'attributetype', 'azimuth', 'basefrequency', 'baseline-shift', 'begin', 'bias', 'by', 'class', 'clip', 'clippathunits', 'clip-path', 'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'color-profile', 'color-rendering', 'cx', 'cy', 'd', 'dx', 'dy', 'diffuseconstant', 'direction', 'display', 'divisor', 'dominant-baseline', 'dur', 'edgemode', 'elevation', 'end', 'exponent', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'filterunits', 'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'fx', 'fy', 'g1', 'g2', 'glyph-name', 'glyphref', 'gradientunits', 'gradienttransform', 'height', 'href', 'id', 'image-rendering', 'in', 'in2', 'intercept', 'k', 'k1', 'k2', 'k3', 'k4', 'kerning', 'keypoints', 'keysplines', 'keytimes', 'lang', 'lengthadjust', 'letter-spacing', 'kernelmatrix', 'kernelunitlength', 'lighting-color', 'local', 'marker-end', 'marker-mid', 'marker-start', 'markerheight', 'markerunits', 'markerwidth', 'maskcontentunits', 'maskunits', 'max', 'mask', 'mask-type', 'media', 'method', 'mode', 'min', 'name', 'numoctaves', 'offset', 'operator', 'opacity', 'order', 'orient', 'orientation', 'origin', 'overflow', 'paint-order', 'path', 'pathlength', 'patterncontentunits', 'patterntransform', 'patternunits', 'pointer-events', 'points', 'preservealpha', 'preserveaspectratio', 'primitiveunits', 'r', 'rx', 'ry', 'radius', 'refx', 'refy', 'repeatcount', 'repeatdur', 'restart', 'result', 'rotate', 'scale', 'seed', 'shape-rendering', 'slope', 'specularconstant', 'specularexponent', 'spreadmethod', 'startoffset', 'stddeviation', 'stitchtiles', 'stop-color', 'stop-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke', 'stroke-width', 'style', 'surfacescale', 'systemlanguage', 'tabindex', 'tablevalues', 'targetx', 'targety', 'transform', 'transform-origin', 'text-anchor', 'text-decoration', 'text-orientation', 'text-rendering', 'textlength', 'type', 'u1', 'u2', 'unicode', 'values', 'vector-effect', 'viewbox', 'visibility', 'version', 'vert-adv-y', 'vert-origin-x', 'vert-origin-y', 'width', 'word-spacing', 'wrap', 'writing-mode', 'xchannelselector', 'ychannelselector', 'x', 'x1', 'x2', 'xmlns', 'y', 'y1', 'y2', 'z', 'zoomandpan']);
const mathMl = freeze(['accent', 'accentunder', 'align', 'bevelled', 'close', 'columnalign', 'columnlines', 'columnspacing', 'columnspan', 'denomalign', 'depth', 'dir', 'display', 'displaystyle', 'encoding', 'fence', 'frame', 'height', 'href', 'id', 'largeop', 'length', 'linethickness', 'lquote', 'lspace', 'mathbackground', 'mathcolor', 'mathsize', 'mathvariant', 'maxsize', 'minsize', 'movablelimits', 'notation', 'numalign', 'open', 'rowalign', 'rowlines', 'rowspacing', 'rowspan', 'rspace', 'rquote', 'scriptlevel', 'scriptminsize', 'scriptsizemultiplier', 'selection', 'separator', 'separators', 'stretchy', 'subscriptshift', 'supscriptshift', 'symmetric', 'voffset', 'width', 'xmlns']);
const xml = freeze(['xlink:href', 'xml:id', 'xlink:title', 'xml:space', 'xmlns:xlink']);

const MUSTACHE_EXPR = seal(/{{[\w\W]*|^[\w\W]*}}/g);
const ERB_EXPR = seal(/<%[\w\W]*|^[\w\W]*%>/g);
const TMPLIT_EXPR = seal(/\${[\w\W]*/g);
const DATA_ATTR = seal(/^data-[\-\w.\u00B7-\uFFFF]+$/); // eslint-disable-line no-useless-escape
const ARIA_ATTR = seal(/^aria-[\-\w]+$/); // eslint-disable-line no-useless-escape
const IS_ALLOWED_URI = seal(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i // eslint-disable-line no-useless-escape
);
const IS_SCRIPT_OR_DATA = seal(/^(?:\w+script|data):/i);
const ATTR_WHITESPACE = seal(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g // eslint-disable-line no-control-regex
);
const DOCTYPE_NAME = seal(/^html$/i);
const CUSTOM_ELEMENT = seal(/^[a-z][.\w]*(-[.\w]+)+$/i);
// Markup-significant character probes used by _sanitizeElements.
// Shared module-level instances are safe despite the sticky /g flags:
// unapply() resets lastIndex for RegExp receivers before every call.
const ELEMENT_MARKUP_PROBE = seal(/<[/\w!]/g);
const COMMENT_MARKUP_PROBE = seal(/<[/\w]/g);
const FALLBACK_TAG_CLOSE = seal(/<\/no(script|embed|frames)/i);
const SELF_CLOSING_TAG = seal(/\/>/i);

// https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
const NODE_TYPE = {
  element: 1,
  attribute: 2,
  text: 3,
  cdataSection: 4,
  entityReference: 5,
  // Deprecated
  entityNode: 6,
  // Deprecated
  processingInstruction: 7,
  comment: 8,
  document: 9,
  documentType: 10,
  documentFragment: 11,
  notation: 12 // Deprecated
};
/* HTML-namespace elements whose child text nodes are serialized *literally*
   (unescaped) by the HTML fragment-serialization algorithm. Two reparse-mXSS
   shapes ride on that literal serialization:
     (a) an element child - a tree the HTML parser can never build, but the DOM
         API and an XML/XHTML parse can - after which a `</tag>`-bearing text
         sibling breaks the element open on reparse; and
     (b) text-only content that already carries the element's OWN end tag, e.g.
         `<style>...</style><img onerror=x>` built as a node, which the literal
         serializer emits verbatim for the HTML parser to re-open.
   Shape (a) is handled by the firstElementChild branch in _isUnsafeNode; shape
   (b) by the LITERAL_TEXT_CLOSE probe. Both read textContent (the raw-serialized
   form for these elements) rather than innerHTML, because an XML/XHTML working
   document serializes innerHTML with `<` escaped, which silently blinds the
   innerHTML-based probes (rule 1's second probe and FALLBACK_TAG_CLOSE) there.
   `script` is never allow-listed, but is kept here so the guard matches the
   serializer's own literal-text list exactly. */
const LITERAL_TEXT_ELEMENT_NAMES = ['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext', 'noscript'];
const LITERAL_TEXT_ELEMENTS = freeze(addToSet({}, LITERAL_TEXT_ELEMENT_NAMES));
/* Per-element end-tag matcher. On an HTML reparse the ONLY token that
   terminates a literal-text element's raw content is its own end tag; a foreign
   literal-text close (e.g. `</xmp>` sitting inside `<style>`) does not break
   out, so matching is per-element, not a shared alternation. The lookahead
   requires an HTML tag-name terminator (whitespace, `/` or `>`) so a longer
   name such as `</styles` is not mistaken for `</style`. */
const LITERAL_TEXT_CLOSE = function () {
  const map = {};
  arrayForEach(LITERAL_TEXT_ELEMENT_NAMES, name => {
    map[name] = seal(new RegExp('</' + name + '(?=[\\t\\n\\f\\r />])', 'i'));
  });
  return freeze(map);
}();
const getGlobal = function getGlobal() {
  return typeof window === 'undefined' ? null : window;
};
/**
 * Creates a no-op policy for internal use only.
 * Don't export this function outside this module!
 * @param trustedTypes The policy factory.
 * @param purifyHostElement The Script element used to load DOMPurify (to determine policy name suffix).
 * @return The policy created (or null, if Trusted Types
 * are not supported or creating the policy failed).
 */
const _createTrustedTypesPolicy = function _createTrustedTypesPolicy(trustedTypes, purifyHostElement) {
  if (typeof trustedTypes !== 'object' || typeof trustedTypes.createPolicy !== 'function') {
    return null;
  }
  // Allow the callers to control the unique policy name
  // by adding a data-tt-policy-suffix to the script element with the DOMPurify.
  // Policy creation with duplicate names throws in Trusted Types.
  let suffix = null;
  const ATTR_NAME = 'data-tt-policy-suffix';
  if (purifyHostElement && purifyHostElement.hasAttribute(ATTR_NAME)) {
    suffix = purifyHostElement.getAttribute(ATTR_NAME);
  }
  const policyName = 'dompurify' + (suffix ? '#' + suffix : '');
  try {
    return trustedTypes.createPolicy(policyName, {
      createHTML(html) {
        return html;
      },
      createScriptURL(scriptUrl) {
        return scriptUrl;
      }
    });
  } catch (_) {
    // Policy creation failed (most likely another DOMPurify script has
    // already run). Skip creating the policy, as this will only cause errors
    // if TT are enforced.
    console.warn('TrustedTypes policy ' + policyName + ' could not be created.');
    return null;
  }
};
const _createHooksMap = function _createHooksMap() {
  return {
    afterSanitizeAttributes: [],
    afterSanitizeElements: [],
    afterSanitizeShadowDOM: [],
    beforeSanitizeAttributes: [],
    beforeSanitizeElements: [],
    beforeSanitizeShadowDOM: [],
    uponSanitizeAttribute: [],
    uponSanitizeElement: [],
    uponSanitizeShadowNode: []
  };
};
/**
 * Resolve a set-valued configuration option: a fresh set built from
 * cfg[key] when it is an own array property (seeded with a clone of
 * options.base when given, case-normalized via options.transform),
 * the fallback set otherwise.
 *
 * @param cfg the cloned, prototype-free configuration object
 * @param key the configuration property to read
 * @param fallback the set to use when the option is absent or not an array
 * @param options transform and optional base set to merge into
 * @returns the resolved set
 */
const _resolveSetOption = function _resolveSetOption(cfg, key, fallback, options) {
  return objectHasOwnProperty(cfg, key) && arrayIsArray(cfg[key]) ? addToSet(options.base ? clone(options.base) : {}, cfg[key], options.transform) : fallback;
};
/**
 * Resolve an object-valued configuration option: a prototype-free clone
 * of cfg[key] when it is an own, truthy object property, else a fresh
 * fallback built by makeFallback (fresh on every parse, so a previous
 * parse can never leak state into the next one).
 *
 * @param cfg the cloned, prototype-free configuration object
 * @param key the configuration property to read
 * @param makeFallback builds the fallback value when the option is absent
 * @returns the resolved object
 */
const _resolveObjectOption = function _resolveObjectOption(cfg, key, makeFallback) {
  const value = objectHasOwnProperty(cfg, key) ? cfg[key] : undefined;
  return value && typeof value === 'object' ? clone(value) : makeFallback();
};
function createDOMPurify() {
  let window = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : getGlobal();
  const DOMPurify = root => createDOMPurify(root);
  DOMPurify.version = '3.4.15';
  DOMPurify.removed = [];
  if (!window || !window.document || window.document.nodeType !== NODE_TYPE.document || !window.Element) {
    // Not running in a browser, provide a factory function
    // so that you can pass your own Window
    DOMPurify.isSupported = false;
    return DOMPurify;
  }
  let document = window.document;
  const originalDocument = document;
  const currentScript = originalDocument.currentScript;
  window.DocumentFragment;
    const HTMLTemplateElement = window.HTMLTemplateElement,
    Node = window.Node,
    Element = window.Element,
    NodeFilter = window.NodeFilter,
    _window$NamedNodeMap = window.NamedNodeMap;
    _window$NamedNodeMap === void 0 ? window.NamedNodeMap || window.MozNamedAttrMap : _window$NamedNodeMap;
    window.HTMLFormElement;
    const DOMParser = window.DOMParser,
    trustedTypes = window.trustedTypes;
  const ElementPrototype = Element.prototype;
  const cloneNode = lookupGetter(ElementPrototype, 'cloneNode');
  const remove = lookupGetter(ElementPrototype, 'remove');
  // Clobber-safe Attr-node removal. On an HTMLFormElement a descendant named
  // "removeAttributeNode" shadows the prototype method via
  // [LegacyOverrideBuiltIns], so element.removeAttributeNode(attr) throws.
  // Calling the cached Element.prototype method with the element as the
  // receiver removes the exact live Attr node regardless of the shadowing.
  const removeAttributeNode = lookupGetter(ElementPrototype, 'removeAttributeNode');
  const getNextSibling = lookupGetter(ElementPrototype, 'nextSibling');
  const getChildNodes = lookupGetter(ElementPrototype, 'childNodes');
  const getParentNode = lookupGetter(ElementPrototype, 'parentNode');
  const getShadowRoot = lookupGetter(ElementPrototype, 'shadowRoot');
  const getAttributes = lookupGetter(ElementPrototype, 'attributes');
  const getNodeType = Node && Node.prototype ? lookupGetter(Node.prototype, 'nodeType') : null;
  const getNodeName = Node && Node.prototype ? lookupGetter(Node.prototype, 'nodeName') : null;
  const getOwnerDocument = Node && Node.prototype ? lookupGetter(Node.prototype, 'ownerDocument') : null;
  /* Clobber-safe nodeType / nodeName reads through the cached Node.prototype
     getters, with a direct-property fallback for environments that lack
     Node.prototype. Sites that need a different fallback (e.g. _isClobbered
     returns early on a null name) intentionally keep their own reads. */
  const _readNodeType = function _readNodeType(node) {
    return getNodeType ? getNodeType(node) : node.nodeType;
  };
  const _readNodeName = function _readNodeName(node) {
    return getNodeName ? getNodeName(node) : node.nodeName;
  };
  // As per issue #47, the web-components registry is inherited by a
  // new document created via createHTMLDocument. As per the spec
  // (http://w3c.github.io/webcomponents/spec/custom/#creating-and-passing-registries)
  // a new empty registry is used when creating a template contents owner
  // document, so we use that as our parent document to ensure nothing
  // is inherited.
  if (typeof HTMLTemplateElement === 'function') {
    const template = document.createElement('template');
    if (template.content && template.content.ownerDocument) {
      document = template.content.ownerDocument;
    }
  }
  let trustedTypesPolicy;
  let emptyHTML = '';
  // The instance's own internal Trusted Types policy. Unlike a caller-supplied
  // `TRUSTED_TYPES_POLICY`, this is created at most once — Trusted Types throws
  // on duplicate policy names — and is the only policy allowed to persist
  // across configurations and survive `clearConfig()`.
  let defaultTrustedTypesPolicy;
  let defaultTrustedTypesPolicyResolved = false;
  // Tracks whether we are already inside a call to the configured Trusted Types
  // policy (`createHTML` or `createScriptURL`). If a supplied policy callback
  // itself calls `DOMPurify.sanitize` (the cause of #1422), `sanitize` would
  // re-enter the policy and recurse until the stack overflows. We detect that
  // re-entry and throw a clear, actionable error instead. The guard is shared
  // across both callbacks, because either one re-entering `sanitize` triggers
  // the same unbounded recursion.
  let IN_TRUSTED_TYPES_POLICY = 0;
  const _assertNotInTrustedTypesPolicy = function _assertNotInTrustedTypesPolicy() {
    if (IN_TRUSTED_TYPES_POLICY > 0) {
      throw typeErrorCreate('A configured TRUSTED_TYPES_POLICY callback (createHTML or ' + 'createScriptURL) must not call DOMPurify.sanitize, as that causes ' + 'infinite recursion. Do not pass a policy whose callbacks wrap ' + 'DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted ' + 'Types" section of the README.');
    }
  };
  const _createTrustedHTML = function _createTrustedHTML(html) {
    _assertNotInTrustedTypesPolicy();
    IN_TRUSTED_TYPES_POLICY++;
    try {
      return trustedTypesPolicy.createHTML(html);
    } finally {
      IN_TRUSTED_TYPES_POLICY--;
    }
  };
  const _createTrustedScriptURL = function _createTrustedScriptURL(scriptUrl) {
    _assertNotInTrustedTypesPolicy();
    IN_TRUSTED_TYPES_POLICY++;
    try {
      return trustedTypesPolicy.createScriptURL(scriptUrl);
    } finally {
      IN_TRUSTED_TYPES_POLICY--;
    }
  };
  // Lazily resolve (and cache) the instance's internal default policy.
  // Resolution is attempted at most once: a successful `createPolicy` cannot be
  // repeated (Trusted Types throws on duplicate names), and a failed or
  // unsupported attempt must not be retried on every parse.
  const _getDefaultTrustedTypesPolicy = function _getDefaultTrustedTypesPolicy() {
    if (!defaultTrustedTypesPolicyResolved) {
      defaultTrustedTypesPolicy = _createTrustedTypesPolicy(trustedTypes, currentScript);
      defaultTrustedTypesPolicyResolved = true;
    }
    return defaultTrustedTypesPolicy;
  };
  const _document = document,
    implementation = _document.implementation,
    createNodeIterator = _document.createNodeIterator,
    createDocumentFragment = _document.createDocumentFragment,
    getElementsByTagName = _document.getElementsByTagName;
  const importNode = originalDocument.importNode;
  let hooks = _createHooksMap();
  /**
   * Expose whether this browser supports running the full DOMPurify.
   */
  DOMPurify.isSupported = typeof entries === 'function' && typeof getParentNode === 'function' && implementation && implementation.createHTMLDocument !== undefined;
  const MUSTACHE_EXPR$1 = MUSTACHE_EXPR,
    ERB_EXPR$1 = ERB_EXPR,
    TMPLIT_EXPR$1 = TMPLIT_EXPR,
    DATA_ATTR$1 = DATA_ATTR,
    ARIA_ATTR$1 = ARIA_ATTR,
    IS_SCRIPT_OR_DATA$1 = IS_SCRIPT_OR_DATA,
    ATTR_WHITESPACE$1 = ATTR_WHITESPACE,
    CUSTOM_ELEMENT$1 = CUSTOM_ELEMENT;
  let IS_ALLOWED_URI$1 = IS_ALLOWED_URI;
  /**
   * We consider the elements and attributes below to be safe. Ideally
   * don't add any new ones but feel free to remove unwanted ones.
   */
  /* allowed element names */
  let ALLOWED_TAGS = null;
  const DEFAULT_ALLOWED_TAGS = addToSet({}, [...html$1, ...svg$1, ...svgFilters, ...mathMl$1, ...text]);
  /* Allowed attribute names */
  let ALLOWED_ATTR = null;
  const DEFAULT_ALLOWED_ATTR = addToSet({}, [...html, ...svg, ...mathMl, ...xml]);
  /*
   * Configure how DOMPurify should handle custom elements and their attributes as well as customized built-in elements.
   * @property {RegExp|Function|null} tagNameCheck one of [null, regexPattern, predicate]. Default: `null` (disallow any custom elements)
   * @property {RegExp|Function|null} attributeNameCheck one of [null, regexPattern, predicate]. Default: `null` (disallow any attributes not on the allow list)
   * @property {boolean} allowCustomizedBuiltInElements allow custom elements derived from built-ins if they pass CUSTOM_ELEMENT_HANDLING.tagNameCheck. Default: `false`.
   */
  let CUSTOM_ELEMENT_HANDLING = Object.seal(create(null, {
    tagNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    allowCustomizedBuiltInElements: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: false
    }
  }));
  /* Explicitly forbidden tags (overrides ALLOWED_TAGS/ADD_TAGS) */
  let FORBID_TAGS = null;
  /* Explicitly forbidden attributes (overrides ALLOWED_ATTR/ADD_ATTR) */
  let FORBID_ATTR = null;
  /* Config object to store ADD_TAGS/ADD_ATTR functions (when used as functions) */
  const EXTRA_ELEMENT_HANDLING = Object.seal(create(null, {
    tagCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    }
  }));
  /* Decide if ARIA attributes are okay */
  let ALLOW_ARIA_ATTR = true;
  /* Decide if custom data attributes are okay */
  let ALLOW_DATA_ATTR = true;
  /* Decide if unknown protocols are okay */
  let ALLOW_UNKNOWN_PROTOCOLS = false;
  /* Decide if self-closing tags in attributes are allowed.
   * Usually removed due to a mXSS issue in jQuery 3.0 */
  let ALLOW_SELF_CLOSE_IN_ATTR = true;
  /* Output should be safe for common template engines.
   * This means, DOMPurify removes data attributes, mustaches and ERB
   */
  let SAFE_FOR_TEMPLATES = false;
  /* Output should be safe even for XML used within HTML and alike.
   * This means, DOMPurify removes comments when containing risky content.
   */
  let SAFE_FOR_XML = true;
  /* Decide if document with <html>... should be returned */
  let WHOLE_DOCUMENT = false;
  /* Track whether config is already set on this instance of DOMPurify. */
  let SET_CONFIG = false;
  /* Pristine allowlist bindings captured at setConfig() time. On the
   * persistent-config path sanitize() restores the sets from these before
   * the per-walk hook clone-guard, so a hook's in-call widening cannot
   * carry across calls. Null until setConfig() is called; reset by
   * clearConfig(). */
  let SET_CONFIG_ALLOWED_TAGS = null;
  let SET_CONFIG_ALLOWED_ATTR = null;
  /* Decide if all elements (e.g. style, script) must be children of
   * document.body. By default, browsers might move them to document.head */
  let FORCE_BODY = false;
  /* Decide if a DOM `HTMLBodyElement` should be returned, instead of a html
   * string (or a TrustedHTML object if Trusted Types are supported).
   * If `WHOLE_DOCUMENT` is enabled a `HTMLHtmlElement` will be returned instead
   */
  let RETURN_DOM = false;
  /* Decide if a DOM `DocumentFragment` should be returned, instead of a html
   * string  (or a TrustedHTML object if Trusted Types are supported) */
  let RETURN_DOM_FRAGMENT = false;
  /* Try to return a Trusted Type object instead of a string, return a string in
   * case Trusted Types are not supported  */
  let RETURN_TRUSTED_TYPE = false;
  /* Output should be free from DOM clobbering attacks?
   * This sanitizes markups named with colliding, clobberable built-in DOM APIs.
   */
  let SANITIZE_DOM = true;
  /* Achieve full DOM Clobbering protection by isolating the namespace of named
   * properties and JS variables, mitigating attacks that abuse the HTML/DOM spec rules.
   *
   * HTML/DOM spec rules that enable DOM Clobbering:
   *   - Named Access on Window (§7.3.3)
   *   - DOM Tree Accessors (§3.1.5)
   *   - Form Element Parent-Child Relations (§4.10.3)
   *   - Iframe srcdoc / Nested WindowProxies (§4.8.5)
   *   - HTMLCollection (§4.2.10.2)
   *
   * Namespace isolation is implemented by prefixing `id` and `name` attributes
   * with a constant string, i.e., `user-content-`
   */
  let SANITIZE_NAMED_PROPS = false;
  const SANITIZE_NAMED_PROPS_PREFIX = 'user-content-';
  /* Keep element content when removing element? */
  let KEEP_CONTENT = true;
  /* If a `Node` is passed to sanitize(), then performs sanitization in-place instead
   * of importing it into a new Document and returning a sanitized copy */
  let IN_PLACE = false;
  /* Allow usage of profiles like html, svg and mathMl */
  let USE_PROFILES = {};
  /* Tags to ignore content of when KEEP_CONTENT is true */
  let FORBID_CONTENTS = null;
  const DEFAULT_FORBID_CONTENTS = addToSet({}, ['annotation-xml', 'audio', 'colgroup', 'desc', 'foreignobject', 'head', 'iframe', 'math', 'mi', 'mn', 'mo', 'ms', 'mtext', 'noembed', 'noframes', 'noscript', 'plaintext', 'script',
  // <selectedcontent> mirrors the selected <option>'s subtree, cloned by
  // the UA (customizable <select>) — including any on* handlers — and the
  // engine re-mirrors synchronously whenever a removal changes which
  // option/selectedcontent is current, even inside DOMPurify's inert
  // DOMParser document. Hoisting its children on removal re-inserts a fresh
  // mirror target ahead of the walk, which the engine refills, looping
  // forever (DoS) and amplifying output. Dropping its content on removal
  // (rather than hoisting) breaks that cascade; the content is a duplicate
  // of the option, which is sanitized on its own. See campaign-3 F1/F6.
  'selectedcontent', 'style', 'svg', 'template', 'thead', 'title', 'video', 'xmp']);
  /* Tags that are safe for data: URIs */
  let DATA_URI_TAGS = null;
  const DEFAULT_DATA_URI_TAGS = addToSet({}, ['audio', 'video', 'img', 'source', 'image', 'track']);
  /* Attributes safe for values like "javascript:" */
  let URI_SAFE_ATTRIBUTES = null;
  const DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, ['alt', 'class', 'for', 'id', 'label', 'name', 'pattern', 'placeholder', 'role', 'summary', 'title', 'value', 'style', 'xmlns']);
  const MATHML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
  /* Document namespace */
  let NAMESPACE = HTML_NAMESPACE;
  let IS_EMPTY_INPUT = false;
  /* Allowed XHTML+XML namespaces */
  let ALLOWED_NAMESPACES = null;
  const DEFAULT_ALLOWED_NAMESPACES = addToSet({}, [MATHML_NAMESPACE, SVG_NAMESPACE, HTML_NAMESPACE], stringToString);
  const DEFAULT_MATHML_TEXT_INTEGRATION_POINTS = freeze(['mi', 'mo', 'mn', 'ms', 'mtext']);
  let MATHML_TEXT_INTEGRATION_POINTS = addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS);
  const DEFAULT_HTML_INTEGRATION_POINTS = freeze(['annotation-xml']);
  let HTML_INTEGRATION_POINTS = addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS);
  // Certain elements are allowed in both SVG and HTML
  // namespace. We need to specify them explicitly
  // so that they don't get erroneously deleted from
  // HTML namespace.
  const COMMON_SVG_AND_HTML_ELEMENTS = addToSet({}, ['title', 'style', 'font', 'a', 'script']);
  /* Parsing of strict XHTML documents */
  let PARSER_MEDIA_TYPE = null;
  const SUPPORTED_PARSER_MEDIA_TYPES = ['application/xhtml+xml', 'text/html'];
  const DEFAULT_PARSER_MEDIA_TYPE = 'text/html';
  let transformCaseFunc = null;
  /* Keep a reference to config to pass to hooks */
  let CONFIG = null;
  /* Ideally, do not touch anything below this line */
  /* ______________________________________________ */
  const formElement = document.createElement('form');
  const isRegexOrFunction = function isRegexOrFunction(testValue) {
    return testValue instanceof RegExp || testValue instanceof Function;
  };
  /**
   * _parseConfig
   *
   * @param cfg optional config literal
   */
  // eslint-disable-next-line complexity
  const _parseConfig = function _parseConfig() {
    let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    if (CONFIG && CONFIG === cfg) {
      return;
    }
    /* Shield configuration object from tampering */
    if (!cfg || typeof cfg !== 'object') {
      cfg = {};
    }
    /* Shield configuration object from prototype pollution */
    cfg = clone(cfg);
    PARSER_MEDIA_TYPE =
    // eslint-disable-next-line unicorn/prefer-includes
    SUPPORTED_PARSER_MEDIA_TYPES.indexOf(cfg.PARSER_MEDIA_TYPE) === -1 ? DEFAULT_PARSER_MEDIA_TYPE : cfg.PARSER_MEDIA_TYPE;
    // HTML tags and attributes are not case-sensitive, converting to lowercase. Keeping XHTML as is.
    transformCaseFunc = PARSER_MEDIA_TYPE === 'application/xhtml+xml' ? stringToString : stringToLowerCase;
    /* Set configuration parameters */
    ALLOWED_TAGS = _resolveSetOption(cfg, 'ALLOWED_TAGS', DEFAULT_ALLOWED_TAGS, {
      transform: transformCaseFunc
    });
    ALLOWED_ATTR = _resolveSetOption(cfg, 'ALLOWED_ATTR', DEFAULT_ALLOWED_ATTR, {
      transform: transformCaseFunc
    });
    ALLOWED_NAMESPACES = _resolveSetOption(cfg, 'ALLOWED_NAMESPACES', DEFAULT_ALLOWED_NAMESPACES, {
      transform: stringToString
    });
    URI_SAFE_ATTRIBUTES = _resolveSetOption(cfg, 'ADD_URI_SAFE_ATTR', DEFAULT_URI_SAFE_ATTRIBUTES, {
      transform: transformCaseFunc,
      base: DEFAULT_URI_SAFE_ATTRIBUTES
    });
    DATA_URI_TAGS = _resolveSetOption(cfg, 'ADD_DATA_URI_TAGS', DEFAULT_DATA_URI_TAGS, {
      transform: transformCaseFunc,
      base: DEFAULT_DATA_URI_TAGS
    });
    FORBID_CONTENTS = _resolveSetOption(cfg, 'FORBID_CONTENTS', DEFAULT_FORBID_CONTENTS, {
      transform: transformCaseFunc
    });
    FORBID_TAGS = _resolveSetOption(cfg, 'FORBID_TAGS', clone({}), {
      transform: transformCaseFunc
    });
    FORBID_ATTR = _resolveSetOption(cfg, 'FORBID_ATTR', clone({}), {
      transform: transformCaseFunc
    });
    USE_PROFILES = objectHasOwnProperty(cfg, 'USE_PROFILES') ? cfg.USE_PROFILES && typeof cfg.USE_PROFILES === 'object' ? clone(cfg.USE_PROFILES) : cfg.USE_PROFILES : false;
    ALLOW_ARIA_ATTR = cfg.ALLOW_ARIA_ATTR !== false; // Default true
    ALLOW_DATA_ATTR = cfg.ALLOW_DATA_ATTR !== false; // Default true
    ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false; // Default false
    ALLOW_SELF_CLOSE_IN_ATTR = cfg.ALLOW_SELF_CLOSE_IN_ATTR !== false; // Default true
    SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false; // Default false
    SAFE_FOR_XML = cfg.SAFE_FOR_XML !== false; // Default true
    WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false; // Default false
    RETURN_DOM = cfg.RETURN_DOM || false; // Default false
    RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false; // Default false
    RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false; // Default false
    FORCE_BODY = cfg.FORCE_BODY || false; // Default false
    SANITIZE_DOM = cfg.SANITIZE_DOM !== false; // Default true
    SANITIZE_NAMED_PROPS = cfg.SANITIZE_NAMED_PROPS || false; // Default false
    KEEP_CONTENT = cfg.KEEP_CONTENT !== false; // Default true
    IN_PLACE = cfg.IN_PLACE || false; // Default false
    IS_ALLOWED_URI$1 = isRegex(cfg.ALLOWED_URI_REGEXP) ? cfg.ALLOWED_URI_REGEXP : IS_ALLOWED_URI; // Default regexp
    NAMESPACE = typeof cfg.NAMESPACE === 'string' ? cfg.NAMESPACE : HTML_NAMESPACE; // Default HTML namespace
    MATHML_TEXT_INTEGRATION_POINTS = _resolveObjectOption(cfg, 'MATHML_TEXT_INTEGRATION_POINTS', () => addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS) // Default built-in map
    );
    HTML_INTEGRATION_POINTS = _resolveObjectOption(cfg, 'HTML_INTEGRATION_POINTS', () => addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS) // Default built-in map
    );
    const customElementHandling = _resolveObjectOption(cfg, 'CUSTOM_ELEMENT_HANDLING', () => create(null));
    CUSTOM_ELEMENT_HANDLING = create(null);
    if (objectHasOwnProperty(customElementHandling, 'tagNameCheck') && isRegexOrFunction(customElementHandling.tagNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.tagNameCheck = customElementHandling.tagNameCheck; // Default undefined
    }
    if (objectHasOwnProperty(customElementHandling, 'attributeNameCheck') && isRegexOrFunction(customElementHandling.attributeNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.attributeNameCheck = customElementHandling.attributeNameCheck; // Default undefined
    }
    if (objectHasOwnProperty(customElementHandling, 'allowCustomizedBuiltInElements') && typeof customElementHandling.allowCustomizedBuiltInElements === 'boolean') {
      CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements = customElementHandling.allowCustomizedBuiltInElements; // Default undefined
    }
    seal(CUSTOM_ELEMENT_HANDLING);
    if (SAFE_FOR_TEMPLATES) {
      ALLOW_DATA_ATTR = false;
    }
    if (RETURN_DOM_FRAGMENT) {
      RETURN_DOM = true;
    }
    /* Parse profile info */
    if (USE_PROFILES) {
      ALLOWED_TAGS = addToSet({}, text);
      ALLOWED_ATTR = create(null);
      if (USE_PROFILES.html === true) {
        addToSet(ALLOWED_TAGS, html$1);
        addToSet(ALLOWED_ATTR, html);
      }
      if (USE_PROFILES.svg === true) {
        addToSet(ALLOWED_TAGS, svg$1);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }
      if (USE_PROFILES.svgFilters === true) {
        addToSet(ALLOWED_TAGS, svgFilters);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }
      if (USE_PROFILES.mathMl === true) {
        addToSet(ALLOWED_TAGS, mathMl$1);
        addToSet(ALLOWED_ATTR, mathMl);
        addToSet(ALLOWED_ATTR, xml);
      }
    }
    /* Always reset function-based ADD_TAGS / ADD_ATTR checks to prevent
     * leaking across calls when switching from function to array config */
    EXTRA_ELEMENT_HANDLING.tagCheck = null;
    EXTRA_ELEMENT_HANDLING.attributeCheck = null;
    /* Merge configuration parameters */
    if (objectHasOwnProperty(cfg, 'ADD_TAGS')) {
      if (typeof cfg.ADD_TAGS === 'function') {
        EXTRA_ELEMENT_HANDLING.tagCheck = cfg.ADD_TAGS;
      } else if (arrayIsArray(cfg.ADD_TAGS)) {
        if (ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS) {
          ALLOWED_TAGS = clone(ALLOWED_TAGS);
        }
        addToSet(ALLOWED_TAGS, cfg.ADD_TAGS, transformCaseFunc);
      }
    }
    if (objectHasOwnProperty(cfg, 'ADD_ATTR')) {
      if (typeof cfg.ADD_ATTR === 'function') {
        EXTRA_ELEMENT_HANDLING.attributeCheck = cfg.ADD_ATTR;
      } else if (arrayIsArray(cfg.ADD_ATTR)) {
        if (ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR) {
          ALLOWED_ATTR = clone(ALLOWED_ATTR);
        }
        addToSet(ALLOWED_ATTR, cfg.ADD_ATTR, transformCaseFunc);
      }
    }
    if (objectHasOwnProperty(cfg, 'ADD_FORBID_CONTENTS') && arrayIsArray(cfg.ADD_FORBID_CONTENTS)) {
      if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
        FORBID_CONTENTS = clone(FORBID_CONTENTS);
      }
      addToSet(FORBID_CONTENTS, cfg.ADD_FORBID_CONTENTS, transformCaseFunc);
    }
    /* Add #text in case KEEP_CONTENT is set to true */
    if (KEEP_CONTENT) {
      ALLOWED_TAGS['#text'] = true;
    }
    /* Add html, head and body to ALLOWED_TAGS in case WHOLE_DOCUMENT is true */
    if (WHOLE_DOCUMENT) {
      addToSet(ALLOWED_TAGS, ['html', 'head', 'body']);
    }
    /* Add tbody to ALLOWED_TAGS in case tables are permitted, see #286, #365 */
    if (ALLOWED_TAGS.table) {
      addToSet(ALLOWED_TAGS, ['tbody']);
      delete FORBID_TAGS.tbody;
    }
    // Re-derive the active Trusted Types policy from this configuration on
    // every parse. The active policy must never be sticky closure state that
    // outlives the config that set it: a caller-supplied policy left in place
    // after `clearConfig()` — or after a later call that supplied none, or
    // `TRUSTED_TYPES_POLICY: null` — could sign a subsequent "default"
    // `RETURN_TRUSTED_TYPE` result with a foreign, possibly unsafe policy.
    // See GHSA-vxr8-fq34-vvx9.
    if (cfg.TRUSTED_TYPES_POLICY) {
      if (typeof cfg.TRUSTED_TYPES_POLICY.createHTML !== 'function') {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');
      }
      if (typeof cfg.TRUSTED_TYPES_POLICY.createScriptURL !== 'function') {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');
      }
      // A caller-supplied policy applies to this configuration only.
      const previousTrustedTypesPolicy = trustedTypesPolicy;
      trustedTypesPolicy = cfg.TRUSTED_TYPES_POLICY;
      // Sign local variables required by `sanitize`. If the supplied policy's
      // `createHTML` is circular (i.e. it calls `DOMPurify.sanitize`), this
      // throws via the re-entrancy guard. Restore the previous policy first so
      // the instance is not left in a poisoned state. See #1422.
      try {
        emptyHTML = _createTrustedHTML('');
      } catch (error) {
        trustedTypesPolicy = previousTrustedTypesPolicy;
        throw error;
      }
    } else if (cfg.TRUSTED_TYPES_POLICY === null) {
      // Explicit opt-out for this call: perform no Trusted Types signing and
      // create nothing (so a strict `trusted-types` CSP that disallows a
      // `dompurify` policy can still call `sanitize` from inside its own
      // policy — see #1422). Resetting to `undefined` rather than a sticky
      // `null` also drops any previously retained caller policy, so it cannot
      // resurface on a later call, while still allowing the next config-less
      // call to restore the internal default policy. See GHSA-vxr8-fq34-vvx9.
      trustedTypesPolicy = undefined;
      emptyHTML = '';
    } else {
      // No policy supplied: keep the currently active policy if one is set — a
      // previously supplied policy is intentionally sticky across config-less
      // calls — otherwise fall back to the instance's own internal policy,
      // created at most once. (A policy supplied for a *single* call still
      // lingers by design; what must not linger is a policy whose configuration
      // has been torn down via `clearConfig()`, which restores the default.)
      if (trustedTypesPolicy === undefined) {
        trustedTypesPolicy = _getDefaultTrustedTypesPolicy();
      }
      // Sign internal variables only when a policy is active. A falsy policy
      // (Trusted Types unsupported, creation failed, or an explicit opt-out)
      // leaves `emptyHTML` as a plain string, so we never call `.createHTML` on
      // a non-policy and throw. See #1422.
      if (trustedTypesPolicy && typeof emptyHTML === 'string') {
        emptyHTML = _createTrustedHTML('');
      }
    }
    // Prevent further manipulation of configuration.
    // Not available in IE8, Safari 5, etc.
    if (freeze) {
      freeze(cfg);
    }
    CONFIG = cfg;
  };
  /* Keep track of all possible SVG and MathML tags
   * so that we can perform the namespace checks
   * correctly. */
  const ALL_SVG_TAGS = addToSet({}, [...svg$1, ...svgFilters, ...svgDisallowed]);
  const ALL_MATHML_TAGS = addToSet({}, [...mathMl$1, ...mathMlDisallowed]);
  /**
   * Namespace rules for an element in the SVG namespace.
   *
   * @param tagName the element's lowercase tag name
   * @param parent the (possibly simulated) parent node
   * @param parentTagName the parent's lowercase tag name
   * @returns true if a spec-compliant parser could produce this element
   */
  const _checkSvgNamespace = function _checkSvgNamespace(tagName, parent, parentTagName) {
    // The only way to switch from HTML namespace to SVG
    // is via <svg>. If it happens via any other tag, then
    // it should be killed.
    if (parent.namespaceURI === HTML_NAMESPACE) {
      return tagName === 'svg';
    }
    // The only way to switch from MathML to SVG is via <svg>
    // if the parent is either <annotation-xml> or a MathML
    // text integration point.
    if (parent.namespaceURI === MATHML_NAMESPACE) {
      return tagName === 'svg' && (parentTagName === 'annotation-xml' || MATHML_TEXT_INTEGRATION_POINTS[parentTagName]);
    }
    // We only allow elements that are defined in SVG
    // spec. All others are disallowed in SVG namespace.
    return Boolean(ALL_SVG_TAGS[tagName]);
  };
  /**
   * Namespace rules for an element in the MathML namespace.
   *
   * @param tagName the element's lowercase tag name
   * @param parent the (possibly simulated) parent node
   * @param parentTagName the parent's lowercase tag name
   * @returns true if a spec-compliant parser could produce this element
   */
  const _checkMathMlNamespace = function _checkMathMlNamespace(tagName, parent, parentTagName) {
    // The only way to switch from HTML namespace to MathML
    // is via <math>. If it happens via any other tag, then
    // it should be killed.
    if (parent.namespaceURI === HTML_NAMESPACE) {
      return tagName === 'math';
    }
    // The only way to switch from SVG to MathML is via
    // <math> and HTML integration points
    if (parent.namespaceURI === SVG_NAMESPACE) {
      return tagName === 'math' && HTML_INTEGRATION_POINTS[parentTagName];
    }
    // We only allow elements that are defined in MathML
    // spec. All others are disallowed in MathML namespace.
    return Boolean(ALL_MATHML_TAGS[tagName]);
  };
  /**
   * Namespace rules for an element in the HTML namespace.
   *
   * @param tagName the element's lowercase tag name
   * @param parent the (possibly simulated) parent node
   * @param parentTagName the parent's lowercase tag name
   * @returns true if a spec-compliant parser could produce this element
   */
  const _checkHtmlNamespace = function _checkHtmlNamespace(tagName, parent, parentTagName) {
    // The only way to switch from SVG to HTML is via
    // HTML integration points, and from MathML to HTML
    // is via MathML text integration points
    if (parent.namespaceURI === SVG_NAMESPACE && !HTML_INTEGRATION_POINTS[parentTagName]) {
      return false;
    }
    if (parent.namespaceURI === MATHML_NAMESPACE && !MATHML_TEXT_INTEGRATION_POINTS[parentTagName]) {
      return false;
    }
    // We disallow tags that are specific for MathML
    // or SVG and should never appear in HTML namespace
    return !ALL_MATHML_TAGS[tagName] && (COMMON_SVG_AND_HTML_ELEMENTS[tagName] || !ALL_SVG_TAGS[tagName]);
  };
  /**
   * @param element a DOM element whose namespace is being checked
   * @returns Return false if the element has a
   *  namespace that a spec-compliant parser would never
   *  return. Return true otherwise.
   */
  const _checkValidNamespace = function _checkValidNamespace(element) {
    let parent = getParentNode(element);
    // In JSDOM, if we're inside shadow DOM, then parentNode
    // can be null. We just simulate parent in this case.
    if (!parent || !parent.tagName) {
      parent = {
        namespaceURI: NAMESPACE,
        tagName: 'template'
      };
    }
    const tagName = stringToLowerCase(element.tagName);
    const parentTagName = stringToLowerCase(parent.tagName);
    if (!ALLOWED_NAMESPACES[element.namespaceURI]) {
      return false;
    }
    if (element.namespaceURI === SVG_NAMESPACE) {
      return _checkSvgNamespace(tagName, parent, parentTagName);
    }
    if (element.namespaceURI === MATHML_NAMESPACE) {
      return _checkMathMlNamespace(tagName, parent, parentTagName);
    }
    if (element.namespaceURI === HTML_NAMESPACE) {
      return _checkHtmlNamespace(tagName, parent, parentTagName);
    }
    // For XHTML and XML documents that support custom namespaces
    if (PARSER_MEDIA_TYPE === 'application/xhtml+xml' && ALLOWED_NAMESPACES[element.namespaceURI]) {
      return true;
    }
    // The code should never reach this place (this means
    // that the element somehow got namespace that is not
    // HTML, SVG, MathML or allowed via ALLOWED_NAMESPACES).
    // Return false just in case.
    return false;
  };
  /**
   * _forceRemove
   *
   * @param node a DOM node
   */
  const _forceRemove = function _forceRemove(node) {
    arrayPush(DOMPurify.removed, {
      element: node
    });
    try {
      // eslint-disable-next-line unicorn/prefer-dom-node-remove
      getParentNode(node).removeChild(node);
    } catch (_) {
      /* The normal detach failed — this is reached for a parentless node
         (getParentNode() is null, so .removeChild throws). Element.prototype
         .remove() is itself a spec no-op on a parentless node, so a recorded
         "removal" would otherwise hand the caller back an intact,
         payload-bearing node (e.g. a detached IN_PLACE root the mXSS canary or
         the style-with-element-child rule decided to kill). Fail closed by
         throwing — exactly as a clobbered root does at the IN_PLACE entry —
         rather than trying to "neutralize" the node via its own methods.
         Neutralizing would mean calling getAttributeNames()/removeAttribute()
         on the node, both of which a <form> root can clobber via a named child
         (and _isClobbered does not even probe getAttributeNames), so the
         neutralize step could itself be silently defeated, leaving the payload
         intact. A throw touches only the cached, clobber-safe remove() and
         getParentNode(). Generalizes GHSA-r47g-fvhr-h676 (clobbered-form root)
         to every root-kill reason. REPORT-3.
                This lives inside the catch, so it never fires for a normally-removed
         in-tree node: those have a parent, removeChild() succeeds, and the
         catch is not entered. Only a kept (parentless) root reaches here. */
      remove(node);
      if (!getParentNode(node)) {
        throw typeErrorCreate('a node selected for removal could not be detached from its tree ' + 'and cannot be safely returned; refusing to sanitize in place');
      }
    }
  };
  /**
   * _stripAttributeNode
   *
   * Remove a single Attr node case/namespace-exactly on an attribute-teardown
   * path. Name-based removeAttribute() ASCII-lowercases its lookup key for an
   * HTML element in an HTML document and so silently misses a case-preserved
   * handler (e.g. `ONERROR` off an XML/XHTML import) - the same defect
   * _removeAttribute() was fixed for, which a name-based call would reintroduce
   * on these IN_PLACE teardown paths. Unlike _removeAttribute this does not
   * record into DOMPurify.removed: the neutralize passes intentionally do not
   * book-keep. A clobbered/detached node falls back to best-effort name-based
   * removal.
   *
   * @param element the element to strip the attribute from
   * @param attribute the Attr node to remove
   * @param name the attribute's name, for the fallback path
   */
  const _stripAttributeNode = function _stripAttributeNode(element, attribute, name) {
    try {
      removeAttributeNode(element, attribute);
    } catch (_) {
      try {
        element.removeAttribute(name);
      } catch (_) {}
    }
  };
  /**
   * _neutralizeRoot
   *
   * Fail-closed teardown of an in-place root after the sanitize walk aborts
   * (campaign-3 F2). An internal throw mid-walk — e.g. a page-registered
   * custom element's reaction detaches a node so `_forceRemove`'s deliberate
   * parentless guard throws, or any other re-entrant engine mutation — would
   * otherwise leave the caller's *live* tree half-sanitized, with everything
   * after the abort point still carrying its handlers. There is no safe way
   * to resume the walk (the tree mutated under us), so we strip the root bare:
   * remove every child and every attribute, then let the caller's catch see
   * the original error. Clobber-safe (cached `remove`/`childNodes`/`attributes`
   * getters; the root was already clobber-pre-flighted at the IN_PLACE entry).
   *
   * @param root the in-place root to empty
   */
  const _neutralizeRoot = function _neutralizeRoot(root) {
    /* Strip every disallowed attribute (on* handlers included) off the whole
       subtree BEFORE detaching anything. Detaching first would hand back
       handler-bearing originals (e.g. an already-loading `<img onerror>`)
       whose queued resource event still fires in page scope after we throw.
       Clobber-safe reads; a doomed clobbered node's own attributes are
       irrelevant while its non-clobbered descendants are reached and scrubbed. */
    _neutralizeSubtree(root);
    const childNodes = getChildNodes(root);
    if (childNodes) {
      const snapshot = [];
      arrayForEach(childNodes, child => {
        arrayPush(snapshot, child);
      });
      arrayForEach(snapshot, child => {
        try {
          remove(child);
        } catch (_) {
          /* Best-effort teardown; a still-attached child is handled below */
        }
      });
    }
    const attributes = getAttributes(root);
    if (attributes) {
      for (let i = attributes.length - 1; i >= 0; --i) {
        const attribute = attributes[i];
        const name = attribute && attribute.name;
        if (typeof name === 'string') {
          _stripAttributeNode(root, attribute, name);
        }
      }
    }
  };
  /**
   * _removeAttribute
   *
   * Name-based getAttributeNode()/removeAttribute() ASCII-lowercase their
   * lookup key for HTML elements in an HTML document, so they silently miss an
   * attribute whose stored qualified name still contains uppercase ASCII
   * letters. That happens when the node came from a case-preserving source
   * (an XML/XHTML document imported via importNode(), or createAttributeNS()),
   * where e.g. `ONERROR` survives the walk: the policy check lowercases to
   * `onerror` and rejects it, but `removeAttribute('ONERROR')` looks up
   * `onerror` and finds nothing. Remove the exact Attr node instead, which is
   * case- and namespace-exact, and fall back to name-based removal only when
   * the caller could not supply the node.
   *
   * @param name an Attribute name
   * @param element a DOM node
   * @param attr the exact Attr node to remove, when the caller has it
   */
  const _removeAttribute = function _removeAttribute(name, element, attr) {
    if (!attr) {
      try {
        attr = element.getAttributeNode(name);
      } catch (_) {
        attr = null;
      }
    }
    arrayPush(DOMPurify.removed, {
      attribute: attr || null,
      from: element
    });
    try {
      if (attr) {
        removeAttributeNode(element, attr);
      } else {
        element.removeAttribute(name);
      }
    } catch (_) {
      /* Clobbered or already-detached node - best-effort fall back to a
         name-based removal so the "is" handling below still runs. Note this
         fallback ASCII-lowercases its lookup key in an HTML document and so
         cannot reach a case-preserved attribute name; the cached
         removeAttributeNode() above is what removes those, and a clobbered
         form is already removed wholesale by _isClobbered() before reaching
         here. */
      try {
        element.removeAttribute(name);
      } catch (_) {}
    }
    // We void attribute values for unremovable "is" attributes
    if (name === 'is') {
      if (RETURN_DOM || RETURN_DOM_FRAGMENT) {
        try {
          _forceRemove(element);
        } catch (_) {}
      } else {
        try {
          element.setAttribute(name, '');
        } catch (_) {}
      }
    }
  };
  /**
   * _stripDisallowedAttributes
   *
   * Removes every attribute the active configuration does not allow from a
   * single element, using the same allowlist as the main attribute pass (so
   * `on*` handlers go, but no `/^on/` blocklist is introduced). Used only to
   * neutralise nodes that are being discarded from an in-place tree.
   *
   * @param element the element to strip
   */
  const _stripDisallowedAttributes = function _stripDisallowedAttributes(element) {
    const attributes = getAttributes(element);
    if (!attributes) {
      return;
    }
    for (let i = attributes.length - 1; i >= 0; --i) {
      const attribute = attributes[i];
      const name = attribute && attribute.name;
      if (typeof name !== 'string' || ALLOWED_ATTR[transformCaseFunc(name)]) {
        continue;
      }
      _stripAttributeNode(element, attribute, name);
    }
  };
  /**
   * _neutralizeSubtree
   *
   * Completes the audit-5 F1 fix across every removal path. The KEEP_CONTENT
   * move-hoist neutralises only disallowed-tag removals; clobber, mXSS-canary,
   * namespace, comment, processing-instruction and KEEP_CONTENT:false removals
   * all drop their subtree wholesale via `_forceRemove`. On the IN_PLACE path
   * those dropped nodes are detached from the caller's LIVE tree but a
   * handler-bearing original among them (an `<img onerror>`/`<video>` that was
   * loading) keeps its queued resource event, which fires in page scope after
   * sanitize returns. This walks a removed subtree and strips every attribute
   * the active configuration does not allow — so `on*` handlers are cancelled
   * through the SAME allowlist that governs kept nodes, not a separate `/^on/`
   * blocklist. Run synchronously before sanitize returns, i.e. before any
   * queued event can fire. Hook-free by design: these nodes leave the output,
   * so firing attribute hooks for them would be surprising. Clobber-safe reads;
   * a doomed clobbered node may shadow `removeAttribute` (its own attributes are
   * irrelevant — it is discarded — while its non-clobbered descendants, e.g.
   * the `<img>`, are reached and scrubbed).
   *
   * @param root the root of a removed subtree to neutralise
   */
  const _neutralizeSubtree = function _neutralizeSubtree(root) {
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      const nodeType = _readNodeType(node);
      if (nodeType === NODE_TYPE.element) {
        _stripDisallowedAttributes(node);
      }
      const childNodes = getChildNodes(node);
      if (childNodes) {
        for (let i = childNodes.length - 1; i >= 0; --i) {
          stack.push(childNodes[i]);
        }
      }
    }
  };
  /**
   * _neutralizePatchLinkage
   *
   * IN_PLACE entry pre-pass (declarative-partial-updates / streaming
   * hardening, https://github.com/WICG/declarative-partial-updates).
   *
   * The main walk strips patch linkage (`for`/`patchsrc`) and removes range
   * markers (PIs / markup comments) node-by-node, in document order, AS it
   * reaches each node. On a live in-place root that leaves a window: from the
   * moment the root is connected until the walk arrives at a given node, that
   * node's linkage is live. A patch applied on connection/stream can fire as
   * a microtask during the walk and inject or teleport an unsanitized DOM
   * range into a region the iterator has already passed and will not revisit,
   * so the post-return "tree is sanitized" contract is violated. Sweep the
   * whole tree once up front and sever every linkage before the walk begins,
   * closing that window.
   *
   * This CANNOT undo a patch that already fired before sanitize ran — that is
   * the irreducible "do not IN_PLACE a live-connected attacker tree" caveat —
   * but it closes everything from sanitize-start onward. Gated on SAFE_FOR_XML
   * to group with the rest of the declarative-partial-updates handling and
   * stay overridable, consistent with the codebase.
   *
   * Clobber-safe traversal (cached childNodes getter); per-node try/catch so a
   * clobbered root cannot defeat the sweep of its non-clobbered descendants.
   *
   * NOTE (pending real-Chrome confirmation, see test/declarative-patch-probe
   * .html Q1): this mirrors the existing policy of keeping `for` on
   * <label>/<output>. If the shipping feature can drive a patch through a
   * surviving `for`-on-label/output + `id` pair, this pre-pass and the
   * attribute check at _isBasicCustomElement's caller must additionally drop
   * that pair on the IN_PLACE path. Left as-is until the taxonomy is verified.
   *
   * @param root the in-place root to sweep
   */
  /**
   * Central policy for declarative-partial-updates patch-linkage attributes,
   * shared by the _neutralizePatchLinkage pre-pass and _isValidAttribute so
   * the two sites cannot drift: `patchsrc` always links, `for` links
   * everywhere except on <label>/<output>, and the whole policy is gated on
   * SAFE_FOR_XML (see the rationale block in _isValidAttribute).
   *
   * @param lcName the transformCaseFunc'd attribute name
   * @param lcTag the transformCaseFunc'd tag name of the carrying element
   * @return true if the attribute is patch linkage and must be dropped
   */
  const _isPatchLinkageAttribute = function _isPatchLinkageAttribute(lcName, lcTag) {
    if (!SAFE_FOR_XML) {
      return false;
    }
    if (lcName === 'patchsrc') {
      return true;
    }
    return lcName === 'for' && lcTag !== 'label' && lcTag !== 'output';
  };
  const _neutralizePatchLinkage = function _neutralizePatchLinkage(root) {
    if (!SAFE_FOR_XML) {
      return;
    }
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      const nodeType = _readNodeType(node);
      /* Remove range markers (the target side of a patch linkage): every
         processing instruction, and any markup-bearing comment. */
      if (nodeType === NODE_TYPE.processingInstruction || nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, node.data)) {
        try {
          remove(node);
        } catch (_) {
          /* Best-effort */
        }
        continue;
      }
      /* Strip patch-source attributes (the source side) off elements. */
      if (nodeType === NODE_TYPE.element) {
        const element = node;
        const lcTag = transformCaseFunc(_readNodeName(node));
        try {
          if (element.hasAttribute && element.hasAttribute('patchsrc')) {
            element.removeAttribute('patchsrc');
          }
          if (element.hasAttribute && element.hasAttribute('for') && _isPatchLinkageAttribute('for', lcTag)) {
            element.removeAttribute('for');
          }
        } catch (_) {
          /* Clobbered removeAttribute/hasAttribute on a doomed node — ignore */
        }
      }
      const childNodes = getChildNodes(node);
      if (childNodes) {
        for (let i = childNodes.length - 1; i >= 0; --i) {
          stack.push(childNodes[i]);
        }
      }
    }
  };
  /**
   * _initDocument
   *
   * @param dirty - a string of dirty markup
   * @return a DOM, filled with the dirty markup
   */
  const _initDocument = function _initDocument(dirty) {
    /* Create a HTML document */
    let doc = null;
    let leadingWhitespace = null;
    if (FORCE_BODY) {
      dirty = '<remove></remove>' + dirty;
    } else {
      /* If FORCE_BODY isn't used, leading whitespace needs to be preserved manually */
      const matches = stringMatch(dirty, /^[\r\n\t ]+/);
      leadingWhitespace = matches && matches[0];
    }
    if (PARSER_MEDIA_TYPE === 'application/xhtml+xml' && NAMESPACE === HTML_NAMESPACE) {
      // Root of XHTML doc must contain xmlns declaration (see https://www.w3.org/TR/xhtml1/normative.html#strict)
      dirty = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + dirty + '</body></html>';
    }
    const dirtyPayload = trustedTypesPolicy ? _createTrustedHTML(dirty) : dirty;
    /*
     * Use the DOMParser API by default, fallback later if needs be
     * DOMParser not work for svg when has multiple root element.
     */
    if (NAMESPACE === HTML_NAMESPACE) {
      try {
        doc = new DOMParser().parseFromString(dirtyPayload, PARSER_MEDIA_TYPE);
      } catch (_) {}
    }
    /* Use createHTMLDocument in case DOMParser is not available */
    if (!doc || !doc.documentElement) {
      doc = implementation.createDocument(NAMESPACE, 'template', null);
      try {
        doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;
      } catch (_) {
        // Syntax error if dirtyPayload is invalid xml
      }
    }
    const body = doc.body || doc.documentElement;
    if (dirty && leadingWhitespace) {
      body.insertBefore(document.createTextNode(leadingWhitespace), body.childNodes[0] || null);
    }
    /* Work on whole document or just its body */
    if (NAMESPACE === HTML_NAMESPACE) {
      return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? 'html' : 'body')[0];
    }
    return WHOLE_DOCUMENT ? doc.documentElement : body;
  };
  /**
   * Creates a NodeIterator object that you can use to traverse filtered lists of nodes or elements in a document.
   *
   * @param root The root element or node to start traversing on.
   * @return The created NodeIterator
   */
  const _createNodeIterator = function _createNodeIterator(root) {
    /* Read ownerDocument through the cached Node.prototype getter, never the
       direct property. HTMLFormElement has [LegacyOverrideBuiltIns], so a
       clobbering child (<input name="ownerDocument"> or a form-associated
       external input) shadows the prototype getter and makes a direct read
       return that <input>. createNodeIterator.call(<input>, ...) then throws
       "Illegal invocation", and on the IN_PLACE path that throw lands before
       the walk's fail-closed barrier - leaving the caller's live tree, with
       any already-armed handler in it, un-neutralized. The cached getter
       returns the real Document regardless of the clobber. */
    const doc = getOwnerDocument ? getOwnerDocument(root) : root.ownerDocument;
    return createNodeIterator.call(doc || root, root,
    // eslint-disable-next-line no-bitwise
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION, null);
  };
  /**
   * Replace template expression syntax (mustache, ERB, template
   * literal) with a space; shared by all SAFE_FOR_TEMPLATES scrub
   * sites. Order matters: mustache, then ERB, then template literal.
   *
   * @param value the string to scrub
   * @returns the scrubbed string
   */
  const _stripTemplateExpressions = function _stripTemplateExpressions(value) {
    value = stringReplace(value, MUSTACHE_EXPR$1, ' ');
    value = stringReplace(value, ERB_EXPR$1, ' ');
    value = stringReplace(value, TMPLIT_EXPR$1, ' ');
    return value;
  };
  /**
   * Strip template-engine expressions ({{...}}, ${...}, <%...%>) from the
   * character data of an element subtree. Used as the final safety net for
   * SAFE_FOR_TEMPLATES on every DOM-returning code path so that expressions
   * which only form after text-node normalization (e.g. fragments split across
   * stripped elements) cannot survive into a template-evaluating framework.
   *
   * Walks text/comment/CDATA/processing-instruction nodes and mutates `.data`
   * in place rather than round-tripping through innerHTML. This preserves
   * descendant node references (important for IN_PLACE callers), avoids a
   * serialize/reparse cycle, and reads literal character data — which means
   * `<%...%>` in text content matches the ERB regex against its real bytes
   * instead of the HTML-entity-escaped form innerHTML would produce.
   *
   * Attribute values are not visited here; SAFE_FOR_TEMPLATES handling for
   * attributes is performed during the per-node `_sanitizeAttributes` pass.
   *
   * @param node The root element whose character data should be scrubbed.
   */
  const _scrubTemplateExpressions2 = function _scrubTemplateExpressions(node) {
    var _node$querySelectorAl;
    node.normalize();
    /* Clobber-safe ownerDocument read, same reasoning as _createNodeIterator:
       under SAFE_FOR_TEMPLATES this runs on the live IN_PLACE root, which may
       carry a form-named-getter override of ownerDocument. */
    const doc = getOwnerDocument ? getOwnerDocument(node) : node.ownerDocument;
    const walker = createNodeIterator.call(doc || node, node,
    // eslint-disable-next-line no-bitwise
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_CDATA_SECTION | NodeFilter.SHOW_PROCESSING_INSTRUCTION, null);
    let currentNode = walker.nextNode();
    while (currentNode) {
      currentNode.data = _stripTemplateExpressions(currentNode.data);
      currentNode = walker.nextNode();
    }
    // NodeIterator does not descend into <template>.content per the DOM spec,
    // so we must explicitly recurse into each template's content fragment,
    // mirroring the approach used by _sanitizeShadowDOM.
    const templates = (_node$querySelectorAl = node.querySelectorAll) === null || _node$querySelectorAl === void 0 ? void 0 : _node$querySelectorAl.call(node, 'template');
    if (templates) {
      arrayForEach(templates, tmpl => {
        if (_isDocumentFragment(tmpl.content)) {
          _scrubTemplateExpressions2(tmpl.content);
        }
      });
    }
  };
  /**
   * _isClobbered
   *
   * Detect DOM-clobbering on HTMLFormElement nodes. Form is the only HTML
   * interface with [LegacyOverrideBuiltIns]; a descendant element with a
   * `name` attribute matching a prototype property shadows that property
   * on direct reads. We use this check at the IN_PLACE entry-point and
   * during attribute sanitization to refuse clobbered forms.
   *
   * @param element element to check for clobbering attacks
   * @return true if clobbered, false if safe
   */
  const _isClobbered = function _isClobbered(element) {
    // Realm-independent tag-name probe. If we can't determine the tag
    // name at all, we can't reason about clobbering — return false
    // (the caller's other defences still apply).
    const realTagName = getNodeName ? getNodeName(element) : null;
    if (typeof realTagName !== 'string') {
      return false;
    }
    if (transformCaseFunc(realTagName) !== 'form') {
      return false;
    }
    return typeof element.nodeName !== 'string' || typeof element.textContent !== 'string' || typeof element.removeChild !== 'function' ||
    // Realm-safe NamedNodeMap detection: equality against the cached
    // prototype getter. Clobbered .attributes (e.g. <input name="attributes">)
    // makes the direct read diverge from the cached read; a clean form
    // (same-realm OR foreign-realm) has both reads pointing at the same
    // canonical NamedNodeMap.
    element.attributes !== getAttributes(element) || typeof element.removeAttribute !== 'function' ||
    // A form descendant named "removeAttributeNode" or "getAttributeNode"
    // shadows these Attr-node methods via [LegacyOverrideBuiltIns].
    // _removeAttribute() / _stripAttributeNode() reach for
    // element.removeAttributeNode(attr) first; when it is shadowed the call
    // throws and the name-based fallback element.removeAttribute(name)
    // ASCII-lowercases its lookup key in an HTML document, silently missing
    // a case-preserved event-handler attribute (e.g. an ONANIMATIONSTART
    // that reached the sanitizer through an XML/XHTML parse). Flag the form
    // so it is removed wholesale, exactly as for the other shadowed methods.
    typeof element.removeAttributeNode !== 'function' || typeof element.getAttributeNode !== 'function' || typeof element.setAttribute !== 'function' || typeof element.namespaceURI !== 'string' || typeof element.insertBefore !== 'function' || typeof element.hasChildNodes !== 'function' ||
    // NodeType clobbering probe. Cached Node.prototype.nodeType getter
    // returns the integer 1 for any Element regardless of realm; direct
    // read on a clobbered form (e.g. <input name="nodeType">) returns
    // the named child element. Cheap addition — nodeType is read from
    // an internal slot, no serialization cost — and removes a residual
    // clobbering surface used by several mXSS / PI / comment branches
    // in _sanitizeElements that compare currentNode.nodeType directly.
    element.nodeType !== getNodeType(element) ||
    // HTMLFormElement has [LegacyOverrideBuiltIns]: a descendant named
    // "childNodes" shadows the prototype getter. Direct reads of
    // form.childNodes from a clobbered form return the named child
    // instead of the real NodeList, so any walk that reads it directly
    // skips the form's real children. Compare the direct read to the
    // cached Node.prototype getter — when the form's named-property
    // getter intercepts the read, the two values differ and we flag
    // the form. This catches every clobbering child type (input,
    // select, etc.) regardless of whether the named child happens to
    // carry a numeric .length, which a typeof-based probe would miss
    // (e.g. HTMLSelectElement.length is a defined unsigned-long).
    element.childNodes !== getChildNodes(element);
  };
  /**
   * Checks whether the given value is a DocumentFragment from any realm.
   *
   * The realm-independent replacement reads `nodeType` through the cached
   * Node.prototype getter and compares to the DOCUMENT_FRAGMENT_NODE
   * constant (11). nodeType is a numeric value resolved from the node's
   * internal slot, identical across realms for the same kind of node.
   *
   * @param value object to check
   * @return true if value is a DocumentFragment-shaped node from any realm
   */
  const _isDocumentFragment = function _isDocumentFragment(value) {
    if (!getNodeType || typeof value !== 'object' || value === null) {
      return false;
    }
    try {
      return getNodeType(value) === NODE_TYPE.documentFragment;
    } catch (_) {
      return false;
    }
  };
  /**
   * Checks whether the given object is a DOM node, including nodes that
   * originate from a different window/realm (e.g. an iframe's
   * contentDocument). The previous `value instanceof Node` check was
   * realm-bound: nodes from a different window failed it, causing
   * sanitize() to silently stringify them and reset IN_PLACE to false,
   * returning the original node unsanitized. See GHSA-4w3q-35jp-p934.
   *
   * @param value object to check whether it's a DOM node
   * @return true if value is a DOM node from any realm
   */
  const _isNode = function _isNode(value) {
    if (!getNodeType || typeof value !== 'object' || value === null) {
      return false;
    }
    try {
      return typeof getNodeType(value) === 'number';
    } catch (_) {
      return false;
    }
  };
  function _executeHooks(hooks, currentNode, data) {
    if (hooks.length === 0) {
      return;
    }
    arrayForEach(hooks, hook => {
      hook.call(DOMPurify, currentNode, data, CONFIG);
    });
  }
  /**
   * Structural-threat checks that condemn a node regardless of the
   * allowlists: mXSS via namespace confusion, risky CSS construction,
   * processing instructions, markup-bearing comments. Pure predicate;
   * the caller removes. Check order is load-bearing.
   *
   * @param currentNode the node to inspect
   * @param tagName the node's transformCaseFunc'd tag name
   * @return true if the node must be removed
   */
  const _isUnsafeNode = function _isUnsafeNode(currentNode, tagName) {
    /* Detect mXSS attempts abusing namespace confusion */
    if (SAFE_FOR_XML && currentNode.hasChildNodes() && !_isNode(currentNode.firstElementChild) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.textContent) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.innerHTML)) {
      return true;
    }
    /* Remove rawtext/literal-text elements whose literal serialization
       re-opens markup on an HTML reparse - shapes (a) and (b) documented at
       LITERAL_TEXT_ELEMENTS. Both are invisible to rule 1 above (which
       self-disables once there is an element child, and whose second probe
       reads the innerHTML an XML/XHTML document serializes escaped), which
       is why both probes here read textContent instead. Previously only
       `style`-with-element-child was covered; every element in
       LITERAL_TEXT_ELEMENTS shares this literal serialization and is
       equally affected. */
    if (SAFE_FOR_XML && currentNode.namespaceURI === HTML_NAMESPACE && LITERAL_TEXT_ELEMENTS[tagName] && (_isNode(currentNode.firstElementChild) || typeof currentNode.textContent === 'string' && regExpTest(LITERAL_TEXT_CLOSE[tagName], currentNode.textContent))) {
      return true;
    }
    /* Remove any occurrence of processing instructions */
    if (currentNode.nodeType === NODE_TYPE.processingInstruction) {
      return true;
    }
    /* Remove any kind of possibly harmful comments */
    if (SAFE_FOR_XML && currentNode.nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, currentNode.data)) {
      return true;
    }
    return false;
  };
  /**
   * Evaluate a CUSTOM_ELEMENT_HANDLING check (a RegExp or a predicate
   * function, per the validation in _parseConfig) against a name.
   * Additional arguments are forwarded to predicate functions - the
   * attributeNameCheck predicate receives the tag name as its second
   * argument. A null/absent check never matches.
   *
   * @param check the configured tagNameCheck / attributeNameCheck value
   * @param name the name to test
   * @param args extra arguments forwarded to a predicate function
   * @return true if the check matches the name
   */
  const _matchesNameCheck = function _matchesNameCheck(check, name) {
    if (check instanceof RegExp) {
      return regExpTest(check, name);
    }
    if (check instanceof Function) {
      for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
        args[_key - 2] = arguments[_key];
      }
      return Boolean(check(name, ...args));
    }
    return false;
  };
  /**
   * Handle a node whose tag is forbidden or not allowlisted: keep
   * allowed custom elements (false return exits _sanitizeElements
   * early - the namespace and fallback-tag removal checks are
   * intentionally skipped for kept custom elements), else hoist
   * content per KEEP_CONTENT and remove.
   *
   * A kept custom element is the ONLY case in which this function
   * returns false, so the caller uses that return value to run the
   * afterSanitizeElements hook on the kept element and keep the
   * element-hook lifecycle consistent with normal allowlisted
   * elements (GHSA-c2j3-45gr-mqc4).
   *
   * @param currentNode the disallowed node
   * @param tagName the node's transformCaseFunc'd tag name
   * @return true if the node was removed, false if kept
   */
  const _sanitizeDisallowedNode = function _sanitizeDisallowedNode(currentNode, tagName, root) {
    /* Check if we have a custom element to handle */
    if (!FORBID_TAGS[tagName] && _isBasicCustomElement(tagName) && _matchesNameCheck(CUSTOM_ELEMENT_HANDLING.tagNameCheck, tagName)) {
      return false;
    }
    /* Keep content except for bad-listed elements.
         Use the cached prototype getters exclusively — the previous code
         had `|| currentNode.parentNode` / `|| currentNode.childNodes`
         fallbacks, but the cached getters always return the canonical
         value (or null for a real parent-less node), so the fallback
         path was dead in safe cases and a clobbering surface in unsafe
         ones. Falsy cached results stay falsy; the `if (childNodes &&
         parentNode)` check already gates correctly. */
    if (KEEP_CONTENT && !FORBID_CONTENTS[tagName]) {
      const parentNode = getParentNode(currentNode);
      const childNodes = getChildNodes(currentNode);
      if (childNodes && parentNode) {
        const childCount = childNodes.length;
        /* Hoist by moving each child up one level rather than deep-cloning
             it. Moving transfers every descendant exactly once, so a chain of
             nested disallowed elements costs O(n) instead of the O(n^2) that
             re-cloning the shrinking subtree at each level produced; it also
             empties the removed original, so `DOMPurify.removed` no longer
             pins whole subtrees. Moving preserves the in-place guarantee too:
             an original carrying already-queued resource events (`<img
             onerror>`, `<video>`/`<audio>` error, lazy/`onload`, …) is
             relocated and sanitised rather than left detached but still armed.
                      The sole case that must clone is removing the walk root itself.
             The result is serialised from the root's subtree, so a restrictive
             ALLOWED_TAGS that strips the root (`body` on the string path) must
             leave the content inside it, which only cloning does. In IN_PLACE
             the root is pre-validated as an allowed tag and so is never removed
             here, so that path always takes the move branch.
                      `childNodes` is live; a tail-to-head walk keeps `childNodes[i]`
             valid whether we move (drops the trailing entry) or clone (leaves
             the list intact). */
        for (let i = childCount - 1; i >= 0; --i) {
          const hoisted = currentNode === root ? cloneNode(childNodes[i], true) : childNodes[i];
          parentNode.insertBefore(hoisted, getNextSibling(currentNode));
        }
      }
    }
    _forceRemove(currentNode);
    return true;
  };
  /**
   * Fork a hook-mutable allowlist off its shared binding the first time a
   * (possibly lazily-installed) uponSanitize* hook is about to see it, so the
   * hook cannot widen the per-instance default or the setConfig binding by
   * reference and leak past the call. Returns the set unchanged once it is
   * already call-local, so repeated calls across elements are idempotent.
   *
   * @param hookList the uponSanitize* hook array for this event
   * @param set the current ALLOWED_TAGS / ALLOWED_ATTR binding
   * @param defaultSet the per-instance DEFAULT_ALLOWED_* constant
   * @param setConfigSet the captured setConfig() binding, or null
   * @return a call-local clone if a hook is present and set is still shared,
   *   else set unchanged
   */
  const _forkSharedAllowlist = function _forkSharedAllowlist(hookList, set, defaultSet, setConfigSet) {
    if (hookList.length === 0) {
      return set;
    }
    return set === defaultSet || set === setConfigSet ? clone(set) : set;
  };
  /**
   * Shared guard for a node that a hook has detached from the walk tree,
   * used after each element-hook site in _sanitizeElements. Detaching is a
   * long-standing user pattern (issue #469; draw.io-style foreignObject
   * filtering). Per the cached, unclobberable parentNode getter the node is
   * genuinely out of the tree, so it can reach neither the serialized
   * output nor an IN_PLACE live tree; treat it as removed and stop
   * processing it. Without this guard, the unsafe-node / namespace checks
   * would call _forceRemove on a parentless node and hit the REPORT-3
   * fail-closed throw — which exists for nodes DOMPurify wants gone but
   * *cannot* detach (clobbered / parentless roots), the opposite of a node
   * that is already safely gone. The walk root is exempt: a detached
   * IN_PLACE root is legitimate input and must still be fully sanitized,
   * and a kill-decision on it must keep hitting the REPORT-3 throw.
   *
   * Nodes detached by hooks stay the hook's responsibility for placement:
   * they are not recorded in DOMPurify.removed, so the post-walk IN_PLACE
   * pass (which iterates DOMPurify.removed) does not reach them. But a
   * hook-detached subtree can still hold a queued resource-event handler -
   * e.g. an <img onload> that began loading when the caller built the live
   * tree - which fires in page scope after sanitize returns even though the
   * handler never reached the returned tree. That is the audit-5 F1 hazard,
   * and the documented node.remove() hook pattern walks straight into it.
   * So on the IN_PLACE path we neutralize the detached subtree inline,
   * stripping its non-allow-listed attributes before returning, exactly as
   * the post-walk pass does for _forceRemove'd subtrees.
   *
   * @param currentNode the node a hook may have detached
   * @param root the current walk root
   * @return true if the node is detached and now handled, false otherwise
   */
  const _handleHookDetachedNode = function _handleHookDetachedNode(currentNode, root) {
    if (currentNode === root || getParentNode(currentNode) !== null) {
      return false;
    }
    if (IN_PLACE) {
      _neutralizeSubtree(currentNode);
    }
    return true;
  };
  /**
   * _sanitizeElements
   *
   * @protect nodeName
   * @protect textContent
   * @protect removeChild
   * @param currentNode to check for permission to exist
   * @return true if node was killed, false if left alive
   */
  const _sanitizeElements = function _sanitizeElements(currentNode, root) {
    /* Execute a hook if present */
    _executeHooks(hooks.beforeSanitizeElements, currentNode, null);
    /* A hook may have detached the node - treat it as removed (see
       _handleHookDetachedNode for the full rationale). */
    if (_handleHookDetachedNode(currentNode, root)) {
      return true;
    }
    /* Check if element is clobbered or can clobber */
    if (_isClobbered(currentNode)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Now let's check the element's type and name */
    const tagName = transformCaseFunc(_readNodeName(currentNode));
    /* Close the pre-walk clone-guard's timing gap: an uponSanitizeElement
       hook may have been installed after that guard sampled the hook arrays
       (e.g. lazily from beforeSanitizeElements), leaving ALLOWED_TAGS still
       aliasing a shared binding that a widening hook would mutate by
       reference. Fork it before exposing it to the hook. */
    ALLOWED_TAGS = _forkSharedAllowlist(hooks.uponSanitizeElement, ALLOWED_TAGS, DEFAULT_ALLOWED_TAGS, SET_CONFIG_ALLOWED_TAGS);
    /* Execute a hook if present */
    _executeHooks(hooks.uponSanitizeElement, currentNode, {
      tagName,
      allowedTags: ALLOWED_TAGS
    });
    /* The uponSanitizeElement hook may have detached the node, exactly as
       above (see _handleHookDetachedNode for the full rationale). */
    if (_handleHookDetachedNode(currentNode, root)) {
      return true;
    }
    /* Remove mXSS vectors, processing instructions and risky comments */
    if (_isUnsafeNode(currentNode, tagName)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Remove element if anything forbids its presence */
    if (FORBID_TAGS[tagName] || !(EXTRA_ELEMENT_HANDLING.tagCheck instanceof Function && EXTRA_ELEMENT_HANDLING.tagCheck(tagName)) && !ALLOWED_TAGS[tagName]) {
      const removed = _sanitizeDisallowedNode(currentNode, tagName, root);
      /* A false return means the node is a custom element kept via
         CUSTOM_ELEMENT_HANDLING - the only keep path through
         _sanitizeDisallowedNode. Run afterSanitizeElements on it so the
         element-hook lifecycle matches normal allowlisted elements: a
         security policy applied in this hook (e.g. stripping an attribute
         from every surviving element) must not silently skip kept custom
         elements (GHSA-c2j3-45gr-mqc4). This mirrors the normal-element
         tail below - the hook runs, then the walker's subsequent
         _sanitizeAttributes pass sanitizes the element's attributes. The
         deliberately skipped namespace and fallback-tag removal checks stay
         skipped; they are removal decisions, not the hook contract. */
      if (removed === false) {
        _executeHooks(hooks.afterSanitizeElements, currentNode, null);
      }
      return removed;
    }
    /* Check whether element has a valid namespace.
       Realm-safe check (GHSA-hpcv-96wg-7vj8): use the cached Node.prototype
       nodeType getter rather than `instanceof Element`, which is realm-
       bound and short-circuits to false for any node minted in a different
       realm — letting a foreign-realm element with a forbidden namespace
       slip past the namespace check entirely. */
    const nt = _readNodeType(currentNode);
    if (nt === NODE_TYPE.element && !_checkValidNamespace(currentNode)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Make sure that older browsers don't get fallback-tag mXSS */
    if ((tagName === 'noscript' || tagName === 'noembed' || tagName === 'noframes') && regExpTest(FALLBACK_TAG_CLOSE, currentNode.innerHTML)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Sanitize element content to be template-safe */
    if (SAFE_FOR_TEMPLATES && currentNode.nodeType === NODE_TYPE.text) {
      /* Get the element's text content */
      const content = _stripTemplateExpressions(currentNode.textContent);
      if (currentNode.textContent !== content) {
        arrayPush(DOMPurify.removed, {
          element: currentNode.cloneNode()
        });
        currentNode.textContent = content;
      }
    }
    /* Execute a hook if present */
    _executeHooks(hooks.afterSanitizeElements, currentNode, null);
    return false;
  };
  /**
   * _isValidAttribute
   *
   * @param lcTag Lowercase tag name of containing element.
   * @param lcName Lowercase attribute name.
   * @param value Attribute value.
   * @return Returns true if `value` is valid, otherwise false.
   */
  // eslint-disable-next-line complexity
  const _isValidAttribute = function _isValidAttribute(lcTag, lcName, value) {
    /* FORBID_ATTR must always win, even if ADD_ATTR predicate would allow it */
    if (FORBID_ATTR[lcName]) {
      return false;
    }
    /* Reject declarative-partial-updates patch-linkage attributes
       (https://github.com/WICG/declarative-partial-updates).
            Empirical note (Chrome 150, verified — see
       test/declarative-patch-probe-v3.html): expansion is NOT applied after
       sanitization. For the string path it fires during sanitize()'s own
       parse, so the walk sees and sanitizes the fully materialized expanded
       tree — teleports into MathML/SVG integration points included; a
       weaponized `<template for>`->`<img onerror>` comes back with the handler
       stripped. For the IN_PLACE path it fires on connection, before the walk.
       Either way DOMPurify is NOT blind to the patch.
            This removal is therefore defense-in-depth rather than the sole barrier:
       it prevents live linkage from surviving into the OUTPUT and re-expanding
       in the caller's context, and keeps behaviour deterministic if a future
       engine defers expansion. `for` is legitimate only on <label>/<output>;
       anywhere else (notably <template for>) it links the element to a patch
       target and teleports or removes an arbitrary DOM range by id/marker name.
       `patchsrc` fetches remote markup and is treated as a script-loading
       mechanism (CSP). Gated on SAFE_FOR_XML so the removal groups with the
       other structural-threat checks and stays overridable, consistent with
       the rest of the codebase. PI range markers are already removed by
       _isUnsafeNode. */
    if (_isPatchLinkageAttribute(lcName, lcTag)) {
      return false;
    }
    /* Make sure attribute cannot clobber */
    if (SANITIZE_DOM && (lcName === 'id' || lcName === 'name') && (value in document || value in formElement)) {
      return false;
    }
    const nameIsPermitted = ALLOWED_ATTR[lcName] || EXTRA_ELEMENT_HANDLING.attributeCheck instanceof Function && EXTRA_ELEMENT_HANDLING.attributeCheck(lcName, lcTag);
    /* Allow valid data-* attributes: At least one character after "-"
        (https://html.spec.whatwg.org/multipage/dom.html#embedding-custom-non-visible-data-with-the-data-*-attributes)
        XML-compatible (https://html.spec.whatwg.org/multipage/infrastructure.html#xml-compatible and http://www.w3.org/TR/xml/#d0e804)
        We don't need to check the value; it's always URI safe. */
    if (ALLOW_DATA_ATTR && regExpTest(DATA_ATTR$1, lcName)) {
      return true;
    }
    /* Allow valid aria-* attributes, the value is always URI safe */
    if (ALLOW_ARIA_ATTR && regExpTest(ARIA_ATTR$1, lcName)) {
      return true;
    }
    /* A name outside the allowlist is acceptable on custom-element terms
       only. The value checks below are intentionally skipped in that case:
       if the user supplied a tagNameCheck we also allow derived custom
       elements using the same test, and attributes passing the configured
       attributeNameCheck are allowed as custom elements define these at
       their own discretion. */
    if (!nameIsPermitted) {
      return (
        // Condition a) covers a basically valid custom element tag name whose
        // tag passes the configured tagNameCheck and whose attribute name
        // passes the configured attributeNameCheck ...
        _isBasicCustomElement(lcTag) && _matchesNameCheck(CUSTOM_ELEMENT_HANDLING.tagNameCheck, lcTag) && _matchesNameCheck(CUSTOM_ELEMENT_HANDLING.attributeNameCheck, lcName, lcTag) ||
        // Condition b) covers an `is` attribute whose value passes the
        // configured tagNameCheck while customized built-in elements are
        // allowed.
        lcName === 'is' && CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements && _matchesNameCheck(CUSTOM_ELEMENT_HANDLING.tagNameCheck, value)
      );
    }
    /* Check value is safe. First, is attr inert? If so, is safe */
    if (URI_SAFE_ATTRIBUTES[lcName]) {
      return true;
    }
    /* Check no script, data or unknown possibly unsafe URI
        unless we know URI values are safe for that attribute */
    if (regExpTest(IS_ALLOWED_URI$1, stringReplace(value, ATTR_WHITESPACE$1, ''))) {
      return true;
    }
    /* Keep image data URIs alive if src/xlink:href is allowed */
    /* Further prevent gadget XSS for dynamically built script tags */
    if ((lcName === 'src' || lcName === 'xlink:href' || lcName === 'href') && lcTag !== 'script' && stringIndexOf(value, 'data:') === 0 && DATA_URI_TAGS[lcTag]) {
      return true;
    }
    /* Allow unknown protocols: This provides support for links that
        are handled by protocol handlers which may be unknown ahead of
        time, e.g. fb:, spotify: */
    if (ALLOW_UNKNOWN_PROTOCOLS && !regExpTest(IS_SCRIPT_OR_DATA$1, stringReplace(value, ATTR_WHITESPACE$1, ''))) {
      return true;
    }
    /* Only an empty (binary) value remains safe at this point;
       anything else is presumed unsafe, do not add it back */
    return !value;
  };
  /* Names the HTML spec reserves from valid-custom-element-name; these must
   * never be treated as basic custom elements even when a permissive
   * CUSTOM_ELEMENT_HANDLING.tagNameCheck is configured. */
  const RESERVED_CUSTOM_ELEMENT_NAMES = addToSet({}, ['annotation-xml', 'color-profile', 'font-face', 'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri', 'missing-glyph']);
  /**
   * _isBasicCustomElement
   * checks if at least one dash is included in tagName, and it's not the first char
   * for more sophisticated checking see https://github.com/sindresorhus/validate-element-name
   *
   * @param tagName name of the tag of the node to sanitize
   * @returns Returns true if the tag name meets the basic criteria for a custom element, otherwise false.
   */
  const _isBasicCustomElement = function _isBasicCustomElement(tagName) {
    return !RESERVED_CUSTOM_ELEMENT_NAMES[stringToLowerCase(tagName)] && regExpTest(CUSTOM_ELEMENT$1, tagName);
  };
  /**
   * Wrap an attribute value in the matching Trusted Types object when
   * the active policy requires it. Namespaced attributes pass through
   * unchanged (no TT support yet, see
   * https://bugs.chromium.org/p/chromium/issues/detail?id=1305293).
   *
   * @param lcTag lowercase tag name of the containing element
   * @param lcName lowercase attribute name
   * @param namespaceURI the attribute's namespace, if any
   * @param value the attribute value to wrap
   * @return the value, wrapped when Trusted Types demand it
   */
  const _applyTrustedTypesToAttribute = function _applyTrustedTypesToAttribute(lcTag, lcName, namespaceURI, value) {
    if (trustedTypesPolicy && typeof trustedTypes === 'object' && typeof trustedTypes.getAttributeType === 'function' && !namespaceURI) {
      switch (trustedTypes.getAttributeType(lcTag, lcName)) {
        case 'TrustedHTML':
          {
            return _createTrustedHTML(value);
          }
        case 'TrustedScriptURL':
          {
            return _createTrustedScriptURL(value);
          }
      }
    }
    return value;
  };
  /**
   * Write a modified attribute value back onto the element. On
   * success, re-probe for clobbering introduced by the new value and
   * remove the element when found; otherwise, when this writeback is the
   * recreate half of the SANITIZE_NAMED_PROPS remove-and-recreate, pop the
   * removal entry that path recorded so it does not show as removed. On
   * failure, remove the attribute instead.
   *
   * Returns true only on a clean write (the value was set and the new value
   * introduced no clobbering). The caller uses that, together with its own
   * knowledge of whether this attribute pushed a DOMPurify.removed record, to
   * decide whether to pop that record. The pop must happen ONLY for the
   * named-prop remove-and-recreate; popping on any other value change (trim,
   * template scrubbing, Trusted Types) would consume an unrelated _forceRemove
   * subtree-cleanup record and let that detached subtree keep a live event
   * handler through the IN_PLACE neutralization pass (SO-001).
   *
   * @param currentNode the element carrying the attribute
   * @param name the attribute name as present on the element
   * @param namespaceURI the attribute's namespace, if any
   * @param value the new attribute value
   * @return true if the value was written without introducing clobbering
   */
  const _setAttributeValue = function _setAttributeValue(currentNode, name, namespaceURI, value) {
    try {
      if (namespaceURI) {
        currentNode.setAttributeNS(namespaceURI, name, value);
      } else {
        /* Fallback to setAttribute() for browser-unrecognized namespaces e.g. "x-schema". */
        currentNode.setAttribute(name, value);
      }
      if (_isClobbered(currentNode)) {
        _forceRemove(currentNode);
        return false;
      }
      return true;
    } catch (_) {
      _removeAttribute(name, currentNode);
      return false;
    }
  };
  /**
   * _sanitizeAttributes
   *
   * @protect attributes
   * @protect nodeName
   * @protect removeAttribute
   * @protect setAttribute
   *
   * @param currentNode to sanitize
   */
  // eslint-disable-next-line complexity
  const _sanitizeAttributes = function _sanitizeAttributes(currentNode) {
    /* Execute a hook if present */
    _executeHooks(hooks.beforeSanitizeAttributes, currentNode, null);
    const attributes = currentNode.attributes;
    /* Check if we have attributes; if not we might have a text node */
    if (!attributes || _isClobbered(currentNode)) {
      return;
    }
    /* Same lazy-install guard as uponSanitizeElement (see there): fork the
       attribute allowlist off its shared binding before a hook can see it. */
    ALLOWED_ATTR = _forkSharedAllowlist(hooks.uponSanitizeAttribute, ALLOWED_ATTR, DEFAULT_ALLOWED_ATTR, SET_CONFIG_ALLOWED_ATTR);
    const hookEvent = {
      attrName: '',
      attrValue: '',
      keepAttr: true,
      allowedAttributes: ALLOWED_ATTR,
      forceKeepAttr: undefined
    };
    let l = attributes.length;
    const lcTag = transformCaseFunc(currentNode.nodeName);
    /* Go backwards over all attributes; safely remove bad ones */
    while (l--) {
      const attr = attributes[l];
      const name = attr.name,
        namespaceURI = attr.namespaceURI,
        attrValue = attr.value;
      const lcName = transformCaseFunc(name);
      const initValue = attrValue;
      let value = name === 'value' ? initValue : stringTrim(initValue);
      /* Tracks whether this specific attribute pushed a DOMPurify.removed
         record that a later _setAttributeValue() writeback is expected to pop
         back off (the SANITIZE_NAMED_PROPS remove-and-recreate below is the
         only path that does). A value that merely changed via trim, template
         scrubbing, or Trusted Types pushes no such record, so its writeback
         must NOT pop — otherwise it consumes an unrelated _forceRemove subtree
         record and that detached subtree escapes the IN_PLACE handler-
         neutralization pass (SO-001). */
      let recreatedNamedProp = false;
      /* Execute a hook if present */
      hookEvent.attrName = lcName;
      hookEvent.attrValue = value;
      hookEvent.keepAttr = true;
      hookEvent.forceKeepAttr = undefined; // Allows developers to see this is a property they can set
      _executeHooks(hooks.uponSanitizeAttribute, currentNode, hookEvent);
      value = hookEvent.attrValue;
      /* Full DOM Clobbering protection via namespace isolation,
       * Prefix id and name attributes with `user-content-`
       */
      if (SANITIZE_NAMED_PROPS && (lcName === 'id' || lcName === 'name') && stringIndexOf(value, SANITIZE_NAMED_PROPS_PREFIX) !== 0) {
        // Remove the attribute with this value
        _removeAttribute(name, currentNode, attr);
        // Prefix the value and later re-create the attribute with the sanitized value
        value = SANITIZE_NAMED_PROPS_PREFIX + value;
        // This attribute owns the record just pushed; its recreate writeback
        // is the one allowed to pop it back off.
        recreatedNamedProp = true;
      }
      // Else: already prefixed, leave the attribute alone — the prefix is
      // itself the clobbering protection, and re-applying it is incorrect.
      /* Work around a security issue with comments inside attributes */
      if (SAFE_FOR_XML && regExpTest(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i, value)) {
        _removeAttribute(name, currentNode, attr);
        continue;
      }
      /* Make sure we cannot easily use animated hrefs, even if animations are allowed */
      if (lcName === 'attributename' && stringMatch(value, 'href')) {
        _removeAttribute(name, currentNode, attr);
        continue;
      }
      /* Did the hooks force-keep the attribute? */
      if (hookEvent.forceKeepAttr) {
        continue;
      }
      /* Did the hooks approve of the attribute? */
      if (!hookEvent.keepAttr) {
        _removeAttribute(name, currentNode, attr);
        continue;
      }
      /* Work around a security issue in jQuery 3.0 */
      if (!ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(SELF_CLOSING_TAG, value)) {
        _removeAttribute(name, currentNode, attr);
        continue;
      }
      /* Sanitize attribute content to be template-safe */
      if (SAFE_FOR_TEMPLATES) {
        value = _stripTemplateExpressions(value);
      }
      /* Is `value` valid for this attribute? */
      if (!_isValidAttribute(lcTag, lcName, value)) {
        _removeAttribute(name, currentNode, attr);
        continue;
      }
      /* Handle attributes that require Trusted Types */
      value = _applyTrustedTypesToAttribute(lcTag, lcName, namespaceURI, value);
      /* Handle invalid data-* attribute set by try-catching it */
      if (value !== initValue) {
        const cleanWrite = _setAttributeValue(currentNode, name, namespaceURI, value);
        /* Only the named-prop remove-and-recreate owns a DOMPurify.removed
           record to pop; a plain trim/template/Trusted-Types writeback owns
           none, so popping here would drop an unrelated subtree's cleanup
           record (SO-001). */
        if (cleanWrite && recreatedNamedProp) {
          arrayPop(DOMPurify.removed);
        }
      }
    }
    /* Execute a hook if present */
    _executeHooks(hooks.afterSanitizeAttributes, currentNode, null);
  };
  /**
   * _sanitizeShadowDOM
   *
   * @param fragment to iterate over recursively
   */
  const _sanitizeShadowDOM2 = function _sanitizeShadowDOM(fragment) {
    let shadowNode = null;
    const shadowIterator = _createNodeIterator(fragment);
    /* Execute a hook if present */
    _executeHooks(hooks.beforeSanitizeShadowDOM, fragment, null);
    while (shadowNode = shadowIterator.nextNode()) {
      /* Execute a hook if present */
      _executeHooks(hooks.uponSanitizeShadowNode, shadowNode, null);
      /* Sanitize tags and elements */
      _sanitizeElements(shadowNode, fragment);
      /* Check attributes next */
      _sanitizeAttributes(shadowNode);
      /* Deep shadow DOM detected.
         Realm-safe check (GHSA-hpcv-96wg-7vj8): use nodeType against the
         DOCUMENT_FRAGMENT_NODE constant rather than instanceof, so we
         recurse into <template>.content from foreign realms too. */
      if (_isDocumentFragment(shadowNode.content)) {
        _sanitizeShadowDOM2(shadowNode.content);
      }
      /* An element iterated here may itself host an attached
         shadow root. The default NodeIterator does not enter shadow
         trees, so a shadow root nested inside template.content was
         previously reached by no walk at all (the pre-pass at
         _sanitizeAttachedShadowRoots descends via childNodes, which
         doesn't enter template.content; the template-content recursion
         above iterates the content but never inspected shadowRoot).
         Walk it explicitly. The nodeType guard avoids reading
         shadowRoot off text / comment / CDATA / PI nodes that the
         iterator also surfaces. */
      if (_readNodeType(shadowNode) === NODE_TYPE.element) {
        const innerSr = getShadowRoot(shadowNode);
        if (_isDocumentFragment(innerSr)) {
          _sanitizeAttachedShadowRoots(innerSr);
          _sanitizeShadowDOM2(innerSr);
        }
      }
    }
    /* Execute a hook if present */
    _executeHooks(hooks.afterSanitizeShadowDOM, fragment, null);
  };
  /**
   * _sanitizeAttachedShadowRoots
   *
   * Walks `root` and feeds every attached shadow root we encounter into
   * the existing _sanitizeShadowDOM pipeline. The default node iterator
   * does not descend into shadow trees, so nodes inside an attached
   * shadow root would otherwise be skipped entirely.
   *
   * Two real input paths put attached shadow roots in front of us:
   *   1. IN_PLACE on a DOM node that already has shadow roots attached.
   *   2. DOM-node input where importNode(dirty, true) deep-clones the
   *      shadow root because it was created with `clonable: true`.
   *
   * This pass runs once, up front, so the main iteration loop (and the
   * existing _sanitizeShadowDOM template-content recursion) stay
   * untouched — string-input paths are not affected.
   *
   * @param root the subtree root to walk for attached shadow roots
   */
  const _sanitizeAttachedShadowRoots = function _sanitizeAttachedShadowRoots(root) {
    /* Iterative (explicit stack) rather than per-child recursion. DOM APIs
       impose no depth cap, so an attacker-shaped tree (JSON/CRDT/editor data
       built straight into the DOM — the IN_PLACE surface) deeper than the JS
       call-stack budget would otherwise overflow native recursion here and
       throw at the IN_PLACE entry pre-pass, before a single node is
       sanitized, leaving the caller's live tree untouched (fail-open). See
       campaign-3 F4. A heap stack keeps depth off the call stack.
            Each work item is either a node to descend into, or a deferred
       `_sanitizeShadowDOM` for an already-walked shadow root. The deferred
       form preserves the original post-order discipline: a shadow root's
       nested shadow roots are discovered before the outer shadow is
       sanitized (which may remove hosts). Pushes are in reverse of the
       desired processing order (LIFO): template content, then children, then
       the shadow-sanitize, then the shadow walk — so the order matches the
       previous recursion exactly. */
    const stack = [{
      node: root,
      shadow: null
    }];
    while (stack.length > 0) {
      const item = stack.pop();
      /* Deferred shadow-DOM sanitisation: runs after its subtree was walked. */
      if (item.shadow) {
        _sanitizeShadowDOM2(item.shadow);
        continue;
      }
      const node = item.node;
      const nodeType = _readNodeType(node);
      const isElement = nodeType === NODE_TYPE.element;
      /* (pushed last → processed first) Children, snapshotted in reverse so
         the first child is processed first. Snapshotting matters because a
         hook may detach siblings mid-walk. */
      const childNodes = getChildNodes(node);
      if (childNodes) {
        for (let i = childNodes.length - 1; i >= 0; --i) {
          stack.push({
            node: childNodes[i],
            shadow: null
          });
        }
      }
      /* (pushed before children → processed after them, matching the old
         "template content last" order) When the node is a <template>,
         descend into its content. */
      if (isElement) {
        const rootName = getNodeName ? getNodeName(node) : null;
        if (typeof rootName === 'string' && transformCaseFunc(rootName) === 'template') {
          const content = node.content;
          if (_isDocumentFragment(content)) {
            stack.push({
              node: content,
              shadow: null
            });
          }
        }
      }
      /* Shadow root (processed first): walk its subtree, then sanitise it.
         Realm-safe check (GHSA-hpcv-96wg-7vj8): nodeType-based detection
         rather than `instanceof DocumentFragment`, which is realm-bound and
         silently skipped foreign-realm shadow roots (e.g.
         iframe.contentDocument attachShadow). */
      if (isElement) {
        const sr = getShadowRoot(node);
        if (_isDocumentFragment(sr)) {
          /* Push the deferred sanitise first so it pops after the shadow
             walk we push next, i.e. nested shadow roots are discovered
             before this one is sanitised. */
          stack.push({
            node: null,
            shadow: sr
          }, {
            node: sr,
            shadow: null
          });
        }
      }
    }
  };
  // eslint-disable-next-line complexity
  DOMPurify.sanitize = function (dirty) {
    let cfg = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    let body = null;
    let importedNode = null;
    let currentNode = null;
    let returnNode = null;
    /* Make sure we have a string to sanitize.
      DO NOT return early, as this will return the wrong type if
      the user has requested a DOM object rather than a string */
    IS_EMPTY_INPUT = !dirty;
    if (IS_EMPTY_INPUT) {
      dirty = '<!-->';
    }
    /* Stringify, in case dirty is an object */
    if (typeof dirty !== 'string' && !_isNode(dirty)) {
      dirty = stringifyValue(dirty);
      if (typeof dirty !== 'string') {
        throw typeErrorCreate('dirty is not a string, aborting');
      }
    }
    /* Return dirty HTML if DOMPurify cannot run */
    if (!DOMPurify.isSupported) {
      return dirty;
    }
    /* Assign config vars */
    if (SET_CONFIG) {
      /* Persistent setConfig() path: _parseConfig is skipped, so the sets are
       * not re-derived per call. Restore them from the pristine bindings
       * captured at setConfig() time so a previous call's hook clone (mutated
       * below) does not carry over. */
      ALLOWED_TAGS = SET_CONFIG_ALLOWED_TAGS;
      ALLOWED_ATTR = SET_CONFIG_ALLOWED_ATTR;
    } else {
      _parseConfig(cfg);
    }
    /* Clone the hook-mutable allowlists before the walk whenever an
     * uponSanitize* hook is registered. The hook event exposes ALLOWED_TAGS
     * and ALLOWED_ATTR by reference (as allowedTags / allowedAttributes), so
     * a hook that widens them would otherwise mutate the shared set
     * permanently: across later calls and across every element. Cloning per
     * walk keeps documented in-call widening working while scoping it to the
     * call. A single guard for both config paths - the per-call path rebinds
     * the sets in _parseConfig each call, the persistent path restores them
     * from the captured bindings just above - so the two cannot diverge. */
    if (hooks.uponSanitizeElement.length > 0 || hooks.uponSanitizeAttribute.length > 0) {
      ALLOWED_TAGS = clone(ALLOWED_TAGS);
    }
    if (hooks.uponSanitizeAttribute.length > 0) {
      ALLOWED_ATTR = clone(ALLOWED_ATTR);
    }
    /* Clean up removed elements */
    DOMPurify.removed = [];
    /* Resolve IN_PLACE for this call without mutating persistent config.
       Writing the IN_PLACE closure variable here leaks under setConfig(),
       where _parseConfig is skipped on later calls: a single string call would
       disable in-place mode for every subsequent node call, returning a
       sanitized copy while leaving the caller's node — which in-place callers
       keep using and whose return value they ignore — unsanitized. REPORT-2. */
    const inPlace = IN_PLACE && typeof dirty !== 'string' && _isNode(dirty);
    if (inPlace) {
      /* Declarative-partial-updates / streaming pre-pass: sever every patch
         linkage across the live tree BEFORE the walk, so no patch can fire
         mid-walk and inject into an already-processed region. Runs first, so
         it also covers the forbidden/clobbered roots that throw below. */
      _neutralizePatchLinkage(dirty);
      /* Do some early pre-sanitization to avoid unsafe root nodes.
         Read nodeName through the cached prototype getter — a clobbering
         child named "nodeName" on the form root would otherwise shadow
         the property and let this check skip the root-allowlist
         validation entirely. */
      const nn = _readNodeName(dirty);
      if (typeof nn === 'string') {
        const tagName = transformCaseFunc(nn);
        if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
          /* Fail closed on a live root: neutralize handlers/children before
             throwing, exactly as the mid-walk abort path does. */
          _neutralizeRoot(dirty);
          throw typeErrorCreate('root node is forbidden and cannot be sanitized in-place');
        }
      }
      /* Pre-flight the root through _isClobbered. The iterator-driven
         removal path can not detach a parent-less root: _forceRemove
         falls through to Element.prototype.remove(), which per spec
         is a no-op on a node with no parent. A clobbered root would
         then survive the main loop with its attributes uninspected,
         because _sanitizeAttributes early-returns on _isClobbered. The
         result would be an attacker-controlled form, complete with any
         event-handler attributes the caller passed in, handed back to
         the application unsanitized. Refuse to sanitize such a root
         the same way we refuse a forbidden tag. GHSA-r47g-fvhr-h676. */
      if (_isClobbered(dirty)) {
        /* Fail closed on a live clobbered root before throwing.
           _neutralizeRoot's reads are clobber-safe (cached getters); the
           form's non-clobbered descendants, e.g. an armed <img>, are scrubbed. */
        _neutralizeRoot(dirty);
        throw typeErrorCreate('root node is clobbered and cannot be sanitized in-place');
      }
      /* Sanitize attached shadow roots before the main iterator runs.
         The iterator does not descend into shadow trees. Same fail-closed
         barrier as the main walk (campaign-3 F2): a custom-element reaction
         inside a shadow root could abort this pre-pass before the walk runs,
         which would otherwise leave the entire live tree unsanitized. */
      try {
        _sanitizeAttachedShadowRoots(dirty);
      } catch (error) {
        _neutralizeRoot(dirty);
        throw error;
      }
    } else if (_isNode(dirty)) {
      /* If dirty is a DOM element, append to an empty document to avoid
         elements being stripped by the parser */
      body = _initDocument('<!---->');
      importedNode = body.ownerDocument.importNode(dirty, true);
      if (importedNode.nodeType === NODE_TYPE.element && importedNode.nodeName === 'BODY') {
        /* Node is already a body, use as is */
        body = importedNode;
      } else if (importedNode.nodeName === 'HTML') {
        body = importedNode;
      } else {
        // eslint-disable-next-line unicorn/prefer-dom-node-append
        body.appendChild(importedNode);
      }
      /* Clonable shadow roots are deep-cloned by importNode(); sanitize
         them before the main iterator runs, since the iterator does not
         descend into shadow trees. The walk routes every read through a
         cached prototype getter so clobbering descendants on a form root
         cannot hide a shadow host from this pass.
                Traverse from `body`, not `importedNode`: when importedNode is a
         DocumentFragment, the appendChild() above moves its children into
         `body` and leaves the fragment empty, so walking importedNode would
         scan nothing and miss every attached shadow host now under `body`
         (SO-003). In the BODY/HTML branches `body === importedNode`, so this
         is equivalent there; in the element branch `body` contains the
         appended element and its descendants. `body` covers all three. */
      _sanitizeAttachedShadowRoots(body);
    } else {
      /* Exit directly if we have nothing to do */
      if (!RETURN_DOM && !SAFE_FOR_TEMPLATES && !WHOLE_DOCUMENT &&
      // eslint-disable-next-line unicorn/prefer-includes
      dirty.indexOf('<') === -1) {
        return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(dirty) : dirty;
      }
      /* Initialize the document to work on */
      body = _initDocument(dirty);
      /* Check we have a DOM node from the data */
      if (!body) {
        return RETURN_DOM ? null : RETURN_TRUSTED_TYPE ? emptyHTML : '';
      }
    }
    /* Remove first element node (ours) if FORCE_BODY is set */
    if (body && FORCE_BODY) {
      _forceRemove(body.firstChild);
    }
    /* Get node iterator */
    const walkRoot = inPlace ? dirty : body;
    /* Now start iterating over the created document.
       The walk runs inside an exception barrier (campaign-3 F2): a re-entrant
       engine/custom-element mutation can detach a node mid-walk so
       `_forceRemove`'s parentless guard throws, aborting the loop. Without the
       barrier the caller's in-place tree would be left half-sanitized with the
       unvisited tail still armed. _createNodeIterator itself is inside the
       barrier too: constructing the iterator dereferences the root's document,
       and any failure there (e.g. an exotic/clobbered root) must still fail
       closed rather than skip the neutralize. On any throw we fail closed -
       strip the in-place root bare - then rethrow so the existing throw
       contract is preserved. (String/DOM-copy paths never return the partial
       body, so the propagating throw is already fail-closed there.) */
    try {
      const nodeIterator = _createNodeIterator(walkRoot);
      while (currentNode = nodeIterator.nextNode()) {
        /* Sanitize tags and elements */
        _sanitizeElements(currentNode, walkRoot);
        /* Check attributes next */
        _sanitizeAttributes(currentNode);
        /* Shadow DOM detected, sanitize it.
           Realm-safe check (GHSA-hpcv-96wg-7vj8): nodeType-based detection
           instead of instanceof, so foreign-realm <template>.content is
           walked correctly. */
        if (_isDocumentFragment(currentNode.content)) {
          _sanitizeShadowDOM2(currentNode.content);
        }
      }
    } catch (error) {
      if (inPlace) {
        _neutralizeRoot(dirty);
        /* Nodes _forceRemove'd earlier in the aborted walk are already
           detached from the root, so _neutralizeRoot's subtree pass does not
           reach them. Defuse them too, mirroring the success-path loop below. */
        arrayForEach(DOMPurify.removed, entry => {
          if (entry.element) {
            _neutralizeSubtree(entry.element);
          }
        });
      }
      throw error;
    }
    /* If we sanitized `dirty` in-place, return it. */
    if (inPlace) {
      /* Fail-closed completion of the audit-5 F1 fix: every node removed from
         the caller's live tree is detached but may still hold a queued
         resource-event handler that fires in page scope after we return. The
         move-hoist covers only disallowed-tag KEEP_CONTENT removals; strip the
         non-allow-listed attributes off every other removed subtree (clobber,
         mXSS, namespace, comments, KEEP_CONTENT:false, …) so those handlers are
         cancelled before any event can fire. Runs synchronously, pre-return. */
      arrayForEach(DOMPurify.removed, entry => {
        if (entry.element) {
          _neutralizeSubtree(entry.element);
        }
      });
      if (SAFE_FOR_TEMPLATES) {
        _scrubTemplateExpressions2(dirty);
      }
      return dirty;
    }
    /* Return sanitized string or DOM */
    if (RETURN_DOM) {
      if (SAFE_FOR_TEMPLATES) {
        _scrubTemplateExpressions2(body);
      }
      if (RETURN_DOM_FRAGMENT) {
        returnNode = createDocumentFragment.call(body.ownerDocument);
        while (body.firstChild) {
          // eslint-disable-next-line unicorn/prefer-dom-node-append
          returnNode.appendChild(body.firstChild);
        }
      } else {
        returnNode = body;
      }
      if (ALLOWED_ATTR.shadowroot || ALLOWED_ATTR.shadowrootmode) {
        /*
          AdoptNode() is not used because internal state is not reset
          (e.g. the past names map of a HTMLFormElement), this is safe
          in theory but we would rather not risk another attack vector.
          The state that is cloned by importNode() is explicitly defined
          by the specs.
        */
        returnNode = importNode.call(originalDocument, returnNode, true);
      }
      return returnNode;
    }
    let serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
    /* Serialize doctype if allowed */
    if (WHOLE_DOCUMENT && ALLOWED_TAGS['!doctype'] && body.ownerDocument && body.ownerDocument.doctype && body.ownerDocument.doctype.name && regExpTest(DOCTYPE_NAME, body.ownerDocument.doctype.name)) {
      serializedHTML = '<!DOCTYPE ' + body.ownerDocument.doctype.name + '>\n' + serializedHTML;
    }
    /* Sanitize final string template-safe */
    if (SAFE_FOR_TEMPLATES) {
      serializedHTML = _stripTemplateExpressions(serializedHTML);
    }
    return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(serializedHTML) : serializedHTML;
  };
  DOMPurify.setConfig = function () {
    let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    _parseConfig(cfg);
    SET_CONFIG = true;
    SET_CONFIG_ALLOWED_TAGS = ALLOWED_TAGS;
    SET_CONFIG_ALLOWED_ATTR = ALLOWED_ATTR;
  };
  DOMPurify.clearConfig = function () {
    CONFIG = null;
    SET_CONFIG = false;
    SET_CONFIG_ALLOWED_TAGS = null;
    SET_CONFIG_ALLOWED_ATTR = null;
    // Drop any caller-supplied Trusted Types policy so it cannot poison later
    // `RETURN_TRUSTED_TYPE` output. The internal default policy (cached, and
    // never recreated — Trusted Types throws on duplicate names) is restored by
    // the next `_parseConfig`. See GHSA-vxr8-fq34-vvx9.
    trustedTypesPolicy = defaultTrustedTypesPolicy;
    emptyHTML = '';
  };
  DOMPurify.isValidAttribute = function (tag, attr, value) {
    /* Initialize shared config vars if necessary. */
    if (!CONFIG) {
      _parseConfig({});
    }
    const lcTag = transformCaseFunc(tag);
    const lcName = transformCaseFunc(attr);
    return _isValidAttribute(lcTag, lcName, value);
  };
  DOMPurify.addHook = function (entryPoint, hookFunction) {
    if (typeof hookFunction !== 'function') {
      return;
    }
    /* Reject unknown entry points. Without this, a non-hook key (e.g.
     * '__proto__') indexes off the prototype chain rather than a real
     * hook array, and arrayPush then writes to Object.prototype. Guard
     * with an own-property check against the known hook names. */
    if (!objectHasOwnProperty(hooks, entryPoint)) {
      return;
    }
    arrayPush(hooks[entryPoint], hookFunction);
  };
  DOMPurify.removeHook = function (entryPoint, hookFunction) {
    if (!objectHasOwnProperty(hooks, entryPoint)) {
      return undefined;
    }
    if (hookFunction !== undefined) {
      const index = arrayLastIndexOf(hooks[entryPoint], hookFunction);
      return index === -1 ? undefined : arraySplice(hooks[entryPoint], index, 1)[0];
    }
    return arrayPop(hooks[entryPoint]);
  };
  DOMPurify.removeHooks = function (entryPoint) {
    if (!objectHasOwnProperty(hooks, entryPoint)) {
      return;
    }
    hooks[entryPoint] = [];
  };
  DOMPurify.removeAllHooks = function () {
    hooks = _createHooksMap();
  };
  return DOMPurify;
}
var purify = createDOMPurify();

export { purify as default };
