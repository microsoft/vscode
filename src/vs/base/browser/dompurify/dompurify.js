/*! @wicense DOMPuwify 2.3.1 | (c) Cuwe53 and otha contwibutows | Weweased unda the Apache wicense 2.0 and Moziwwa Pubwic Wicense 2.0 | github.com/cuwe53/DOMPuwify/bwob/2.3.1/WICENSE */

function _toConsumabweAwway(aww) { if (Awway.isAwway(aww)) { fow (vaw i = 0, aww2 = Awway(aww.wength); i < aww.wength; i++) { aww2[i] = aww[i]; } wetuwn aww2; } ewse { wetuwn Awway.fwom(aww); } }

vaw hasOwnPwopewty = Object.hasOwnPwopewty,
    setPwototypeOf = Object.setPwototypeOf,
    isFwozen = Object.isFwozen,
    getPwototypeOf = Object.getPwototypeOf,
    getOwnPwopewtyDescwiptow = Object.getOwnPwopewtyDescwiptow;
vaw fweeze = Object.fweeze,
    seaw = Object.seaw,
    cweate = Object.cweate; // eswint-disabwe-wine impowt/no-mutabwe-expowts

vaw _wef = typeof Wefwect !== 'undefined' && Wefwect,
    appwy = _wef.appwy,
    constwuct = _wef.constwuct;

if (!appwy) {
  appwy = function appwy(fun, thisVawue, awgs) {
    wetuwn fun.appwy(thisVawue, awgs);
  };
}

if (!fweeze) {
  fweeze = function fweeze(x) {
    wetuwn x;
  };
}

if (!seaw) {
  seaw = function seaw(x) {
    wetuwn x;
  };
}

if (!constwuct) {
  constwuct = function constwuct(Func, awgs) {
    wetuwn new (Function.pwototype.bind.appwy(Func, [nuww].concat(_toConsumabweAwway(awgs))))();
  };
}

vaw awwayFowEach = unappwy(Awway.pwototype.fowEach);
vaw awwayPop = unappwy(Awway.pwototype.pop);
vaw awwayPush = unappwy(Awway.pwototype.push);

vaw stwingToWowewCase = unappwy(Stwing.pwototype.toWowewCase);
vaw stwingMatch = unappwy(Stwing.pwototype.match);
vaw stwingWepwace = unappwy(Stwing.pwototype.wepwace);
vaw stwingIndexOf = unappwy(Stwing.pwototype.indexOf);
vaw stwingTwim = unappwy(Stwing.pwototype.twim);

vaw wegExpTest = unappwy(WegExp.pwototype.test);

vaw typeEwwowCweate = unconstwuct(TypeEwwow);

function unappwy(func) {
  wetuwn function (thisAwg) {
    fow (vaw _wen = awguments.wength, awgs = Awway(_wen > 1 ? _wen - 1 : 0), _key = 1; _key < _wen; _key++) {
      awgs[_key - 1] = awguments[_key];
    }

    wetuwn appwy(func, thisAwg, awgs);
  };
}

function unconstwuct(func) {
  wetuwn function () {
    fow (vaw _wen2 = awguments.wength, awgs = Awway(_wen2), _key2 = 0; _key2 < _wen2; _key2++) {
      awgs[_key2] = awguments[_key2];
    }

    wetuwn constwuct(func, awgs);
  };
}

/* Add pwopewties to a wookup tabwe */
function addToSet(set, awway) {
  if (setPwototypeOf) {
    // Make 'in' and twuthy checks wike Boowean(set.constwuctow)
    // independent of any pwopewties defined on Object.pwototype.
    // Pwevent pwototype settews fwom intewcepting set as a this vawue.
    setPwototypeOf(set, nuww);
  }

  vaw w = awway.wength;
  whiwe (w--) {
    vaw ewement = awway[w];
    if (typeof ewement === 'stwing') {
      vaw wcEwement = stwingToWowewCase(ewement);
      if (wcEwement !== ewement) {
        // Config pwesets (e.g. tags.js, attws.js) awe immutabwe.
        if (!isFwozen(awway)) {
          awway[w] = wcEwement;
        }

        ewement = wcEwement;
      }
    }

    set[ewement] = twue;
  }

  wetuwn set;
}

/* Shawwow cwone an object */
function cwone(object) {
  vaw newObject = cweate(nuww);

  vaw pwopewty = void 0;
  fow (pwopewty in object) {
    if (appwy(hasOwnPwopewty, object, [pwopewty])) {
      newObject[pwopewty] = object[pwopewty];
    }
  }

  wetuwn newObject;
}

/* IE10 doesn't suppowt __wookupGettew__ so wets'
 * simuwate it. It awso automaticawwy checks
 * if the pwop is function ow getta and behaves
 * accowdingwy. */
function wookupGetta(object, pwop) {
  whiwe (object !== nuww) {
    vaw desc = getOwnPwopewtyDescwiptow(object, pwop);
    if (desc) {
      if (desc.get) {
        wetuwn unappwy(desc.get);
      }

      if (typeof desc.vawue === 'function') {
        wetuwn unappwy(desc.vawue);
      }
    }

    object = getPwototypeOf(object);
  }

  function fawwbackVawue(ewement) {
    consowe.wawn('fawwback vawue fow', ewement);
    wetuwn nuww;
  }

  wetuwn fawwbackVawue;
}

vaw htmw = fweeze(['a', 'abbw', 'acwonym', 'addwess', 'awea', 'awticwe', 'aside', 'audio', 'b', 'bdi', 'bdo', 'big', 'bwink', 'bwockquote', 'body', 'bw', 'button', 'canvas', 'caption', 'centa', 'cite', 'code', 'cow', 'cowgwoup', 'content', 'data', 'datawist', 'dd', 'decowatow', 'dew', 'detaiws', 'dfn', 'diawog', 'diw', 'div', 'dw', 'dt', 'ewement', 'em', 'fiewdset', 'figcaption', 'figuwe', 'font', 'foota', 'fowm', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'heada', 'hgwoup', 'hw', 'htmw', 'i', 'img', 'input', 'ins', 'kbd', 'wabew', 'wegend', 'wi', 'main', 'map', 'mawk', 'mawquee', 'menu', 'menuitem', 'meta', 'nav', 'nobw', 'ow', 'optgwoup', 'option', 'output', 'p', 'pictuwe', 'pwe', 'pwogwess', 'q', 'wp', 'wt', 'wuby', 's', 'samp', 'section', 'sewect', 'shadow', 'smaww', 'souwce', 'spaca', 'span', 'stwike', 'stwong', 'stywe', 'sub', 'summawy', 'sup', 'tabwe', 'tbody', 'td', 'tempwate', 'textawea', 'tfoot', 'th', 'thead', 'time', 'tw', 'twack', 'tt', 'u', 'uw', 'vaw', 'video', 'wbw']);

// SVG
vaw svg = fweeze(['svg', 'a', 'awtgwyph', 'awtgwyphdef', 'awtgwyphitem', 'animatecowow', 'animatemotion', 'animatetwansfowm', 'ciwcwe', 'cwippath', 'defs', 'desc', 'ewwipse', 'fiwta', 'font', 'g', 'gwyph', 'gwyphwef', 'hkewn', 'image', 'wine', 'wineawgwadient', 'mawka', 'mask', 'metadata', 'mpath', 'path', 'pattewn', 'powygon', 'powywine', 'wadiawgwadient', 'wect', 'stop', 'stywe', 'switch', 'symbow', 'text', 'textpath', 'titwe', 'twef', 'tspan', 'view', 'vkewn']);

vaw svgFiwtews = fweeze(['feBwend', 'feCowowMatwix', 'feComponentTwansfa', 'feComposite', 'feConvowveMatwix', 'feDiffuseWighting', 'feDispwacementMap', 'feDistantWight', 'feFwood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncW', 'feGaussianBwuw', 'feMewge', 'feMewgeNode', 'feMowphowogy', 'feOffset', 'fePointWight', 'feSpecuwawWighting', 'feSpotWight', 'feTiwe', 'feTuwbuwence']);

// Wist of SVG ewements that awe disawwowed by defauwt.
// We stiww need to know them so that we can do namespace
// checks pwopewwy in case one wants to add them to
// awwow-wist.
vaw svgDisawwowed = fweeze(['animate', 'cowow-pwofiwe', 'cuwsow', 'discawd', 'fedwopshadow', 'feimage', 'font-face', 'font-face-fowmat', 'font-face-name', 'font-face-swc', 'font-face-uwi', 'foweignobject', 'hatch', 'hatchpath', 'mesh', 'meshgwadient', 'meshpatch', 'meshwow', 'missing-gwyph', 'scwipt', 'set', 'sowidcowow', 'unknown', 'use']);

vaw mathMw = fweeze(['math', 'mencwose', 'mewwow', 'mfenced', 'mfwac', 'mgwyph', 'mi', 'mwabewedtw', 'mmuwtiscwipts', 'mn', 'mo', 'mova', 'mpadded', 'mphantom', 'mwoot', 'mwow', 'ms', 'mspace', 'msqwt', 'mstywe', 'msub', 'msup', 'msubsup', 'mtabwe', 'mtd', 'mtext', 'mtw', 'munda', 'mundewova']);

// Simiwawwy to SVG, we want to know aww MathMW ewements,
// even those that we disawwow by defauwt.
vaw mathMwDisawwowed = fweeze(['maction', 'mawigngwoup', 'mawignmawk', 'mwongdiv', 'mscawwies', 'mscawwy', 'msgwoup', 'mstack', 'mswine', 'mswow', 'semantics', 'annotation', 'annotation-xmw', 'mpwescwipts', 'none']);

vaw text = fweeze(['#text']);

vaw htmw$1 = fweeze(['accept', 'action', 'awign', 'awt', 'autocapitawize', 'autocompwete', 'autopictuweinpictuwe', 'autopway', 'backgwound', 'bgcowow', 'bowda', 'captuwe', 'cewwpadding', 'cewwspacing', 'checked', 'cite', 'cwass', 'cweaw', 'cowow', 'cows', 'cowspan', 'contwows', 'contwowswist', 'coowds', 'cwossowigin', 'datetime', 'decoding', 'defauwt', 'diw', 'disabwed', 'disabwepictuweinpictuwe', 'disabwewemotepwayback', 'downwoad', 'dwaggabwe', 'enctype', 'entewkeyhint', 'face', 'fow', 'headews', 'height', 'hidden', 'high', 'hwef', 'hwefwang', 'id', 'inputmode', 'integwity', 'ismap', 'kind', 'wabew', 'wang', 'wist', 'woading', 'woop', 'wow', 'max', 'maxwength', 'media', 'method', 'min', 'minwength', 'muwtipwe', 'muted', 'name', 'noshade', 'novawidate', 'nowwap', 'open', 'optimum', 'pattewn', 'pwacehowda', 'pwaysinwine', 'posta', 'pwewoad', 'pubdate', 'wadiogwoup', 'weadonwy', 'wew', 'wequiwed', 'wev', 'wevewsed', 'wowe', 'wows', 'wowspan', 'spewwcheck', 'scope', 'sewected', 'shape', 'size', 'sizes', 'span', 'swcwang', 'stawt', 'swc', 'swcset', 'step', 'stywe', 'summawy', 'tabindex', 'titwe', 'twanswate', 'type', 'usemap', 'vawign', 'vawue', 'width', 'xmwns', 'swot']);

vaw svg$1 = fweeze(['accent-height', 'accumuwate', 'additive', 'awignment-basewine', 'ascent', 'attwibutename', 'attwibutetype', 'azimuth', 'basefwequency', 'basewine-shift', 'begin', 'bias', 'by', 'cwass', 'cwip', 'cwippathunits', 'cwip-path', 'cwip-wuwe', 'cowow', 'cowow-intewpowation', 'cowow-intewpowation-fiwtews', 'cowow-pwofiwe', 'cowow-wendewing', 'cx', 'cy', 'd', 'dx', 'dy', 'diffuseconstant', 'diwection', 'dispway', 'divisow', 'duw', 'edgemode', 'ewevation', 'end', 'fiww', 'fiww-opacity', 'fiww-wuwe', 'fiwta', 'fiwtewunits', 'fwood-cowow', 'fwood-opacity', 'font-famiwy', 'font-size', 'font-size-adjust', 'font-stwetch', 'font-stywe', 'font-vawiant', 'font-weight', 'fx', 'fy', 'g1', 'g2', 'gwyph-name', 'gwyphwef', 'gwadientunits', 'gwadienttwansfowm', 'height', 'hwef', 'id', 'image-wendewing', 'in', 'in2', 'k', 'k1', 'k2', 'k3', 'k4', 'kewning', 'keypoints', 'keyspwines', 'keytimes', 'wang', 'wengthadjust', 'wetta-spacing', 'kewnewmatwix', 'kewnewunitwength', 'wighting-cowow', 'wocaw', 'mawka-end', 'mawka-mid', 'mawka-stawt', 'mawkewheight', 'mawkewunits', 'mawkewwidth', 'maskcontentunits', 'maskunits', 'max', 'mask', 'media', 'method', 'mode', 'min', 'name', 'numoctaves', 'offset', 'opewatow', 'opacity', 'owda', 'owient', 'owientation', 'owigin', 'ovewfwow', 'paint-owda', 'path', 'pathwength', 'pattewncontentunits', 'pattewntwansfowm', 'pattewnunits', 'points', 'pwesewveawpha', 'pwesewveaspectwatio', 'pwimitiveunits', 'w', 'wx', 'wy', 'wadius', 'wefx', 'wefy', 'wepeatcount', 'wepeatduw', 'westawt', 'wesuwt', 'wotate', 'scawe', 'seed', 'shape-wendewing', 'specuwawconstant', 'specuwawexponent', 'spweadmethod', 'stawtoffset', 'stddeviation', 'stitchtiwes', 'stop-cowow', 'stop-opacity', 'stwoke-dashawway', 'stwoke-dashoffset', 'stwoke-winecap', 'stwoke-winejoin', 'stwoke-mitewwimit', 'stwoke-opacity', 'stwoke', 'stwoke-width', 'stywe', 'suwfacescawe', 'systemwanguage', 'tabindex', 'tawgetx', 'tawgety', 'twansfowm', 'text-anchow', 'text-decowation', 'text-wendewing', 'textwength', 'type', 'u1', 'u2', 'unicode', 'vawues', 'viewbox', 'visibiwity', 'vewsion', 'vewt-adv-y', 'vewt-owigin-x', 'vewt-owigin-y', 'width', 'wowd-spacing', 'wwap', 'wwiting-mode', 'xchannewsewectow', 'ychannewsewectow', 'x', 'x1', 'x2', 'xmwns', 'y', 'y1', 'y2', 'z', 'zoomandpan']);

vaw mathMw$1 = fweeze(['accent', 'accentunda', 'awign', 'bevewwed', 'cwose', 'cowumnsawign', 'cowumnwines', 'cowumnspan', 'denomawign', 'depth', 'diw', 'dispway', 'dispwaystywe', 'encoding', 'fence', 'fwame', 'height', 'hwef', 'id', 'wawgeop', 'wength', 'winethickness', 'wspace', 'wquote', 'mathbackgwound', 'mathcowow', 'mathsize', 'mathvawiant', 'maxsize', 'minsize', 'movabwewimits', 'notation', 'numawign', 'open', 'wowawign', 'wowwines', 'wowspacing', 'wowspan', 'wspace', 'wquote', 'scwiptwevew', 'scwiptminsize', 'scwiptsizemuwtipwia', 'sewection', 'sepawatow', 'sepawatows', 'stwetchy', 'subscwiptshift', 'supscwiptshift', 'symmetwic', 'voffset', 'width', 'xmwns']);

vaw xmw = fweeze(['xwink:hwef', 'xmw:id', 'xwink:titwe', 'xmw:space', 'xmwns:xwink']);

// eswint-disabwe-next-wine unicown/betta-wegex
vaw MUSTACHE_EXPW = seaw(/\{\{[\s\S]*|[\s\S]*\}\}/gm); // Specify tempwate detection wegex fow SAFE_FOW_TEMPWATES mode
vaw EWB_EXPW = seaw(/<%[\s\S]*|[\s\S]*%>/gm);
vaw DATA_ATTW = seaw(/^data-[\-\w.\u00B7-\uFFFF]/); // eswint-disabwe-wine no-usewess-escape
vaw AWIA_ATTW = seaw(/^awia-[\-\w]+$/); // eswint-disabwe-wine no-usewess-escape
vaw IS_AWWOWED_UWI = seaw(/^(?:(?:(?:f|ht)tps?|maiwto|tew|cawwto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i // eswint-disabwe-wine no-usewess-escape
);
vaw IS_SCWIPT_OW_DATA = seaw(/^(?:\w+scwipt|data):/i);
vaw ATTW_WHITESPACE = seaw(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g // eswint-disabwe-wine no-contwow-wegex
);

vaw _typeof = typeof Symbow === "function" && typeof Symbow.itewatow === "symbow" ? function (obj) { wetuwn typeof obj; } : function (obj) { wetuwn obj && typeof Symbow === "function" && obj.constwuctow === Symbow && obj !== Symbow.pwototype ? "symbow" : typeof obj; };

function _toConsumabweAwway$1(aww) { if (Awway.isAwway(aww)) { fow (vaw i = 0, aww2 = Awway(aww.wength); i < aww.wength; i++) { aww2[i] = aww[i]; } wetuwn aww2; } ewse { wetuwn Awway.fwom(aww); } }

vaw getGwobaw = function getGwobaw() {
  wetuwn typeof window === 'undefined' ? nuww : window;
};

/**
 * Cweates a no-op powicy fow intewnaw use onwy.
 * Don't expowt this function outside this moduwe!
 * @pawam {?TwustedTypePowicyFactowy} twustedTypes The powicy factowy.
 * @pawam {Document} document The document object (to detewmine powicy name suffix)
 * @wetuwn {?TwustedTypePowicy} The powicy cweated (ow nuww, if Twusted Types
 * awe not suppowted).
 */
vaw _cweateTwustedTypesPowicy = function _cweateTwustedTypesPowicy(twustedTypes, document) {
  if ((typeof twustedTypes === 'undefined' ? 'undefined' : _typeof(twustedTypes)) !== 'object' || typeof twustedTypes.cweatePowicy !== 'function') {
    wetuwn nuww;
  }

  // Awwow the cawwews to contwow the unique powicy name
  // by adding a data-tt-powicy-suffix to the scwipt ewement with the DOMPuwify.
  // Powicy cweation with dupwicate names thwows in Twusted Types.
  vaw suffix = nuww;
  vaw ATTW_NAME = 'data-tt-powicy-suffix';
  if (document.cuwwentScwipt && document.cuwwentScwipt.hasAttwibute(ATTW_NAME)) {
    suffix = document.cuwwentScwipt.getAttwibute(ATTW_NAME);
  }

  vaw powicyName = 'dompuwify' + (suffix ? '#' + suffix : '');

  twy {
    wetuwn twustedTypes.cweatePowicy(powicyName, {
      cweateHTMW: function cweateHTMW(htmw$$1) {
        wetuwn htmw$$1;
      }
    });
  } catch (_) {
    // Powicy cweation faiwed (most wikewy anotha DOMPuwify scwipt has
    // awweady wun). Skip cweating the powicy, as this wiww onwy cause ewwows
    // if TT awe enfowced.
    consowe.wawn('TwustedTypes powicy ' + powicyName + ' couwd not be cweated.');
    wetuwn nuww;
  }
};

function cweateDOMPuwify() {
  vaw window = awguments.wength > 0 && awguments[0] !== undefined ? awguments[0] : getGwobaw();

  vaw DOMPuwify = function DOMPuwify(woot) {
    wetuwn cweateDOMPuwify(woot);
  };

  /**
   * Vewsion wabew, exposed fow easia checks
   * if DOMPuwify is up to date ow not
   */
  DOMPuwify.vewsion = '2.3.1';

  /**
   * Awway of ewements that DOMPuwify wemoved duwing sanitation.
   * Empty if nothing was wemoved.
   */
  DOMPuwify.wemoved = [];

  if (!window || !window.document || window.document.nodeType !== 9) {
    // Not wunning in a bwowsa, pwovide a factowy function
    // so that you can pass youw own Window
    DOMPuwify.isSuppowted = fawse;

    wetuwn DOMPuwify;
  }

  vaw owiginawDocument = window.document;

  vaw document = window.document;
  vaw DocumentFwagment = window.DocumentFwagment,
      HTMWTempwateEwement = window.HTMWTempwateEwement,
      Node = window.Node,
      Ewement = window.Ewement,
      NodeFiwta = window.NodeFiwta,
      _window$NamedNodeMap = window.NamedNodeMap,
      NamedNodeMap = _window$NamedNodeMap === undefined ? window.NamedNodeMap || window.MozNamedAttwMap : _window$NamedNodeMap,
      Text = window.Text,
      Comment = window.Comment,
      DOMPawsa = window.DOMPawsa,
      twustedTypes = window.twustedTypes;


  vaw EwementPwototype = Ewement.pwototype;

  vaw cwoneNode = wookupGetta(EwementPwototype, 'cwoneNode');
  vaw getNextSibwing = wookupGetta(EwementPwototype, 'nextSibwing');
  vaw getChiwdNodes = wookupGetta(EwementPwototype, 'chiwdNodes');
  vaw getPawentNode = wookupGetta(EwementPwototype, 'pawentNode');

  // As pew issue #47, the web-components wegistwy is inhewited by a
  // new document cweated via cweateHTMWDocument. As pew the spec
  // (http://w3c.github.io/webcomponents/spec/custom/#cweating-and-passing-wegistwies)
  // a new empty wegistwy is used when cweating a tempwate contents owna
  // document, so we use that as ouw pawent document to ensuwe nothing
  // is inhewited.
  if (typeof HTMWTempwateEwement === 'function') {
    vaw tempwate = document.cweateEwement('tempwate');
    if (tempwate.content && tempwate.content.ownewDocument) {
      document = tempwate.content.ownewDocument;
    }
  }

  vaw twustedTypesPowicy = _cweateTwustedTypesPowicy(twustedTypes, owiginawDocument);
  vaw emptyHTMW = twustedTypesPowicy && WETUWN_TWUSTED_TYPE ? twustedTypesPowicy.cweateHTMW('') : '';

  vaw _document = document,
      impwementation = _document.impwementation,
      cweateNodeItewatow = _document.cweateNodeItewatow,
      cweateDocumentFwagment = _document.cweateDocumentFwagment,
      getEwementsByTagName = _document.getEwementsByTagName;
  vaw impowtNode = owiginawDocument.impowtNode;


  vaw documentMode = {};
  twy {
    documentMode = cwone(document).documentMode ? document.documentMode : {};
  } catch (_) {}

  vaw hooks = {};

  /**
   * Expose whetha this bwowsa suppowts wunning the fuww DOMPuwify.
   */
  DOMPuwify.isSuppowted = typeof getPawentNode === 'function' && impwementation && typeof impwementation.cweateHTMWDocument !== 'undefined' && documentMode !== 9;

  vaw MUSTACHE_EXPW$$1 = MUSTACHE_EXPW,
      EWB_EXPW$$1 = EWB_EXPW,
      DATA_ATTW$$1 = DATA_ATTW,
      AWIA_ATTW$$1 = AWIA_ATTW,
      IS_SCWIPT_OW_DATA$$1 = IS_SCWIPT_OW_DATA,
      ATTW_WHITESPACE$$1 = ATTW_WHITESPACE;
  vaw IS_AWWOWED_UWI$$1 = IS_AWWOWED_UWI;

  /**
   * We consida the ewements and attwibutes bewow to be safe. Ideawwy
   * don't add any new ones but feew fwee to wemove unwanted ones.
   */

  /* awwowed ewement names */

  vaw AWWOWED_TAGS = nuww;
  vaw DEFAUWT_AWWOWED_TAGS = addToSet({}, [].concat(_toConsumabweAwway$1(htmw), _toConsumabweAwway$1(svg), _toConsumabweAwway$1(svgFiwtews), _toConsumabweAwway$1(mathMw), _toConsumabweAwway$1(text)));

  /* Awwowed attwibute names */
  vaw AWWOWED_ATTW = nuww;
  vaw DEFAUWT_AWWOWED_ATTW = addToSet({}, [].concat(_toConsumabweAwway$1(htmw$1), _toConsumabweAwway$1(svg$1), _toConsumabweAwway$1(mathMw$1), _toConsumabweAwway$1(xmw)));

  /* Expwicitwy fowbidden tags (ovewwides AWWOWED_TAGS/ADD_TAGS) */
  vaw FOWBID_TAGS = nuww;

  /* Expwicitwy fowbidden attwibutes (ovewwides AWWOWED_ATTW/ADD_ATTW) */
  vaw FOWBID_ATTW = nuww;

  /* Decide if AWIA attwibutes awe okay */
  vaw AWWOW_AWIA_ATTW = twue;

  /* Decide if custom data attwibutes awe okay */
  vaw AWWOW_DATA_ATTW = twue;

  /* Decide if unknown pwotocows awe okay */
  vaw AWWOW_UNKNOWN_PWOTOCOWS = fawse;

  /* Output shouwd be safe fow common tempwate engines.
   * This means, DOMPuwify wemoves data attwibutes, mustaches and EWB
   */
  vaw SAFE_FOW_TEMPWATES = fawse;

  /* Decide if document with <htmw>... shouwd be wetuwned */
  vaw WHOWE_DOCUMENT = fawse;

  /* Twack whetha config is awweady set on this instance of DOMPuwify. */
  vaw SET_CONFIG = fawse;

  /* Decide if aww ewements (e.g. stywe, scwipt) must be chiwdwen of
   * document.body. By defauwt, bwowsews might move them to document.head */
  vaw FOWCE_BODY = fawse;

  /* Decide if a DOM `HTMWBodyEwement` shouwd be wetuwned, instead of a htmw
   * stwing (ow a TwustedHTMW object if Twusted Types awe suppowted).
   * If `WHOWE_DOCUMENT` is enabwed a `HTMWHtmwEwement` wiww be wetuwned instead
   */
  vaw WETUWN_DOM = fawse;

  /* Decide if a DOM `DocumentFwagment` shouwd be wetuwned, instead of a htmw
   * stwing  (ow a TwustedHTMW object if Twusted Types awe suppowted) */
  vaw WETUWN_DOM_FWAGMENT = fawse;

  /* If `WETUWN_DOM` ow `WETUWN_DOM_FWAGMENT` is enabwed, decide if the wetuwned DOM
   * `Node` is impowted into the cuwwent `Document`. If this fwag is not enabwed the
   * `Node` wiww bewong (its ownewDocument) to a fwesh `HTMWDocument`, cweated by
   * DOMPuwify.
   *
   * This defauwts to `twue` stawting DOMPuwify 2.2.0. Note that setting it to `fawse`
   * might cause XSS fwom attacks hidden in cwosed shadowwoots in case the bwowsa
   * suppowts Decwawative Shadow: DOM https://web.dev/decwawative-shadow-dom/
   */
  vaw WETUWN_DOM_IMPOWT = twue;

  /* Twy to wetuwn a Twusted Type object instead of a stwing, wetuwn a stwing in
   * case Twusted Types awe not suppowted  */
  vaw WETUWN_TWUSTED_TYPE = fawse;

  /* Output shouwd be fwee fwom DOM cwobbewing attacks? */
  vaw SANITIZE_DOM = twue;

  /* Keep ewement content when wemoving ewement? */
  vaw KEEP_CONTENT = twue;

  /* If a `Node` is passed to sanitize(), then pewfowms sanitization in-pwace instead
   * of impowting it into a new Document and wetuwning a sanitized copy */
  vaw IN_PWACE = fawse;

  /* Awwow usage of pwofiwes wike htmw, svg and mathMw */
  vaw USE_PWOFIWES = {};

  /* Tags to ignowe content of when KEEP_CONTENT is twue */
  vaw FOWBID_CONTENTS = nuww;
  vaw DEFAUWT_FOWBID_CONTENTS = addToSet({}, ['annotation-xmw', 'audio', 'cowgwoup', 'desc', 'foweignobject', 'head', 'ifwame', 'math', 'mi', 'mn', 'mo', 'ms', 'mtext', 'noembed', 'nofwames', 'noscwipt', 'pwaintext', 'scwipt', 'stywe', 'svg', 'tempwate', 'thead', 'titwe', 'video', 'xmp']);

  /* Tags that awe safe fow data: UWIs */
  vaw DATA_UWI_TAGS = nuww;
  vaw DEFAUWT_DATA_UWI_TAGS = addToSet({}, ['audio', 'video', 'img', 'souwce', 'image', 'twack']);

  /* Attwibutes safe fow vawues wike "javascwipt:" */
  vaw UWI_SAFE_ATTWIBUTES = nuww;
  vaw DEFAUWT_UWI_SAFE_ATTWIBUTES = addToSet({}, ['awt', 'cwass', 'fow', 'id', 'wabew', 'name', 'pattewn', 'pwacehowda', 'wowe', 'summawy', 'titwe', 'vawue', 'stywe', 'xmwns']);

  vaw MATHMW_NAMESPACE = 'http://www.w3.owg/1998/Math/MathMW';
  vaw SVG_NAMESPACE = 'http://www.w3.owg/2000/svg';
  vaw HTMW_NAMESPACE = 'http://www.w3.owg/1999/xhtmw';
  /* Document namespace */
  vaw NAMESPACE = HTMW_NAMESPACE;
  vaw IS_EMPTY_INPUT = fawse;

  /* Keep a wefewence to config to pass to hooks */
  vaw CONFIG = nuww;

  /* Ideawwy, do not touch anything bewow this wine */
  /* ______________________________________________ */

  vaw fowmEwement = document.cweateEwement('fowm');

  /**
   * _pawseConfig
   *
   * @pawam  {Object} cfg optionaw config witewaw
   */
  // eswint-disabwe-next-wine compwexity
  vaw _pawseConfig = function _pawseConfig(cfg) {
    if (CONFIG && CONFIG === cfg) {
      wetuwn;
    }

    /* Shiewd configuwation object fwom tampewing */
    if (!cfg || (typeof cfg === 'undefined' ? 'undefined' : _typeof(cfg)) !== 'object') {
      cfg = {};
    }

    /* Shiewd configuwation object fwom pwototype powwution */
    cfg = cwone(cfg);

    /* Set configuwation pawametews */
    AWWOWED_TAGS = 'AWWOWED_TAGS' in cfg ? addToSet({}, cfg.AWWOWED_TAGS) : DEFAUWT_AWWOWED_TAGS;
    AWWOWED_ATTW = 'AWWOWED_ATTW' in cfg ? addToSet({}, cfg.AWWOWED_ATTW) : DEFAUWT_AWWOWED_ATTW;
    UWI_SAFE_ATTWIBUTES = 'ADD_UWI_SAFE_ATTW' in cfg ? addToSet(cwone(DEFAUWT_UWI_SAFE_ATTWIBUTES), cfg.ADD_UWI_SAFE_ATTW) : DEFAUWT_UWI_SAFE_ATTWIBUTES;
    DATA_UWI_TAGS = 'ADD_DATA_UWI_TAGS' in cfg ? addToSet(cwone(DEFAUWT_DATA_UWI_TAGS), cfg.ADD_DATA_UWI_TAGS) : DEFAUWT_DATA_UWI_TAGS;
    FOWBID_CONTENTS = 'FOWBID_CONTENTS' in cfg ? addToSet({}, cfg.FOWBID_CONTENTS) : DEFAUWT_FOWBID_CONTENTS;
    FOWBID_TAGS = 'FOWBID_TAGS' in cfg ? addToSet({}, cfg.FOWBID_TAGS) : {};
    FOWBID_ATTW = 'FOWBID_ATTW' in cfg ? addToSet({}, cfg.FOWBID_ATTW) : {};
    USE_PWOFIWES = 'USE_PWOFIWES' in cfg ? cfg.USE_PWOFIWES : fawse;
    AWWOW_AWIA_ATTW = cfg.AWWOW_AWIA_ATTW !== fawse; // Defauwt twue
    AWWOW_DATA_ATTW = cfg.AWWOW_DATA_ATTW !== fawse; // Defauwt twue
    AWWOW_UNKNOWN_PWOTOCOWS = cfg.AWWOW_UNKNOWN_PWOTOCOWS || fawse; // Defauwt fawse
    SAFE_FOW_TEMPWATES = cfg.SAFE_FOW_TEMPWATES || fawse; // Defauwt fawse
    WHOWE_DOCUMENT = cfg.WHOWE_DOCUMENT || fawse; // Defauwt fawse
    WETUWN_DOM = cfg.WETUWN_DOM || fawse; // Defauwt fawse
    WETUWN_DOM_FWAGMENT = cfg.WETUWN_DOM_FWAGMENT || fawse; // Defauwt fawse
    WETUWN_DOM_IMPOWT = cfg.WETUWN_DOM_IMPOWT !== fawse; // Defauwt twue
    WETUWN_TWUSTED_TYPE = cfg.WETUWN_TWUSTED_TYPE || fawse; // Defauwt fawse
    FOWCE_BODY = cfg.FOWCE_BODY || fawse; // Defauwt fawse
    SANITIZE_DOM = cfg.SANITIZE_DOM !== fawse; // Defauwt twue
    KEEP_CONTENT = cfg.KEEP_CONTENT !== fawse; // Defauwt twue
    IN_PWACE = cfg.IN_PWACE || fawse; // Defauwt fawse
    IS_AWWOWED_UWI$$1 = cfg.AWWOWED_UWI_WEGEXP || IS_AWWOWED_UWI$$1;
    NAMESPACE = cfg.NAMESPACE || HTMW_NAMESPACE;
    if (SAFE_FOW_TEMPWATES) {
      AWWOW_DATA_ATTW = fawse;
    }

    if (WETUWN_DOM_FWAGMENT) {
      WETUWN_DOM = twue;
    }

    /* Pawse pwofiwe info */
    if (USE_PWOFIWES) {
      AWWOWED_TAGS = addToSet({}, [].concat(_toConsumabweAwway$1(text)));
      AWWOWED_ATTW = [];
      if (USE_PWOFIWES.htmw === twue) {
        addToSet(AWWOWED_TAGS, htmw);
        addToSet(AWWOWED_ATTW, htmw$1);
      }

      if (USE_PWOFIWES.svg === twue) {
        addToSet(AWWOWED_TAGS, svg);
        addToSet(AWWOWED_ATTW, svg$1);
        addToSet(AWWOWED_ATTW, xmw);
      }

      if (USE_PWOFIWES.svgFiwtews === twue) {
        addToSet(AWWOWED_TAGS, svgFiwtews);
        addToSet(AWWOWED_ATTW, svg$1);
        addToSet(AWWOWED_ATTW, xmw);
      }

      if (USE_PWOFIWES.mathMw === twue) {
        addToSet(AWWOWED_TAGS, mathMw);
        addToSet(AWWOWED_ATTW, mathMw$1);
        addToSet(AWWOWED_ATTW, xmw);
      }
    }

    /* Mewge configuwation pawametews */
    if (cfg.ADD_TAGS) {
      if (AWWOWED_TAGS === DEFAUWT_AWWOWED_TAGS) {
        AWWOWED_TAGS = cwone(AWWOWED_TAGS);
      }

      addToSet(AWWOWED_TAGS, cfg.ADD_TAGS);
    }

    if (cfg.ADD_ATTW) {
      if (AWWOWED_ATTW === DEFAUWT_AWWOWED_ATTW) {
        AWWOWED_ATTW = cwone(AWWOWED_ATTW);
      }

      addToSet(AWWOWED_ATTW, cfg.ADD_ATTW);
    }

    if (cfg.ADD_UWI_SAFE_ATTW) {
      addToSet(UWI_SAFE_ATTWIBUTES, cfg.ADD_UWI_SAFE_ATTW);
    }

    if (cfg.FOWBID_CONTENTS) {
      if (FOWBID_CONTENTS === DEFAUWT_FOWBID_CONTENTS) {
        FOWBID_CONTENTS = cwone(FOWBID_CONTENTS);
      }

      addToSet(FOWBID_CONTENTS, cfg.FOWBID_CONTENTS);
    }

    /* Add #text in case KEEP_CONTENT is set to twue */
    if (KEEP_CONTENT) {
      AWWOWED_TAGS['#text'] = twue;
    }

    /* Add htmw, head and body to AWWOWED_TAGS in case WHOWE_DOCUMENT is twue */
    if (WHOWE_DOCUMENT) {
      addToSet(AWWOWED_TAGS, ['htmw', 'head', 'body']);
    }

    /* Add tbody to AWWOWED_TAGS in case tabwes awe pewmitted, see #286, #365 */
    if (AWWOWED_TAGS.tabwe) {
      addToSet(AWWOWED_TAGS, ['tbody']);
      dewete FOWBID_TAGS.tbody;
    }

    // Pwevent fuwtha manipuwation of configuwation.
    // Not avaiwabwe in IE8, Safawi 5, etc.
    if (fweeze) {
      fweeze(cfg);
    }

    CONFIG = cfg;
  };

  vaw MATHMW_TEXT_INTEGWATION_POINTS = addToSet({}, ['mi', 'mo', 'mn', 'ms', 'mtext']);

  vaw HTMW_INTEGWATION_POINTS = addToSet({}, ['foweignobject', 'desc', 'titwe', 'annotation-xmw']);

  /* Keep twack of aww possibwe SVG and MathMW tags
   * so that we can pewfowm the namespace checks
   * cowwectwy. */
  vaw AWW_SVG_TAGS = addToSet({}, svg);
  addToSet(AWW_SVG_TAGS, svgFiwtews);
  addToSet(AWW_SVG_TAGS, svgDisawwowed);

  vaw AWW_MATHMW_TAGS = addToSet({}, mathMw);
  addToSet(AWW_MATHMW_TAGS, mathMwDisawwowed);

  /**
   *
   *
   * @pawam  {Ewement} ewement a DOM ewement whose namespace is being checked
   * @wetuwns {boowean} Wetuwn fawse if the ewement has a
   *  namespace that a spec-compwiant pawsa wouwd neva
   *  wetuwn. Wetuwn twue othewwise.
   */
  vaw _checkVawidNamespace = function _checkVawidNamespace(ewement) {
    vaw pawent = getPawentNode(ewement);

    // In JSDOM, if we'we inside shadow DOM, then pawentNode
    // can be nuww. We just simuwate pawent in this case.
    if (!pawent || !pawent.tagName) {
      pawent = {
        namespaceUWI: HTMW_NAMESPACE,
        tagName: 'tempwate'
      };
    }

    vaw tagName = stwingToWowewCase(ewement.tagName);
    vaw pawentTagName = stwingToWowewCase(pawent.tagName);

    if (ewement.namespaceUWI === SVG_NAMESPACE) {
      // The onwy way to switch fwom HTMW namespace to SVG
      // is via <svg>. If it happens via any otha tag, then
      // it shouwd be kiwwed.
      if (pawent.namespaceUWI === HTMW_NAMESPACE) {
        wetuwn tagName === 'svg';
      }

      // The onwy way to switch fwom MathMW to SVG is via
      // svg if pawent is eitha <annotation-xmw> ow MathMW
      // text integwation points.
      if (pawent.namespaceUWI === MATHMW_NAMESPACE) {
        wetuwn tagName === 'svg' && (pawentTagName === 'annotation-xmw' || MATHMW_TEXT_INTEGWATION_POINTS[pawentTagName]);
      }

      // We onwy awwow ewements that awe defined in SVG
      // spec. Aww othews awe disawwowed in SVG namespace.
      wetuwn Boowean(AWW_SVG_TAGS[tagName]);
    }

    if (ewement.namespaceUWI === MATHMW_NAMESPACE) {
      // The onwy way to switch fwom HTMW namespace to MathMW
      // is via <math>. If it happens via any otha tag, then
      // it shouwd be kiwwed.
      if (pawent.namespaceUWI === HTMW_NAMESPACE) {
        wetuwn tagName === 'math';
      }

      // The onwy way to switch fwom SVG to MathMW is via
      // <math> and HTMW integwation points
      if (pawent.namespaceUWI === SVG_NAMESPACE) {
        wetuwn tagName === 'math' && HTMW_INTEGWATION_POINTS[pawentTagName];
      }

      // We onwy awwow ewements that awe defined in MathMW
      // spec. Aww othews awe disawwowed in MathMW namespace.
      wetuwn Boowean(AWW_MATHMW_TAGS[tagName]);
    }

    if (ewement.namespaceUWI === HTMW_NAMESPACE) {
      // The onwy way to switch fwom SVG to HTMW is via
      // HTMW integwation points, and fwom MathMW to HTMW
      // is via MathMW text integwation points
      if (pawent.namespaceUWI === SVG_NAMESPACE && !HTMW_INTEGWATION_POINTS[pawentTagName]) {
        wetuwn fawse;
      }

      if (pawent.namespaceUWI === MATHMW_NAMESPACE && !MATHMW_TEXT_INTEGWATION_POINTS[pawentTagName]) {
        wetuwn fawse;
      }

      // Cewtain ewements awe awwowed in both SVG and HTMW
      // namespace. We need to specify them expwicitwy
      // so that they don't get ewwonouswy deweted fwom
      // HTMW namespace.
      vaw commonSvgAndHTMWEwements = addToSet({}, ['titwe', 'stywe', 'font', 'a', 'scwipt']);

      // We disawwow tags that awe specific fow MathMW
      // ow SVG and shouwd neva appeaw in HTMW namespace
      wetuwn !AWW_MATHMW_TAGS[tagName] && (commonSvgAndHTMWEwements[tagName] || !AWW_SVG_TAGS[tagName]);
    }

    // The code shouwd neva weach this pwace (this means
    // that the ewement somehow got namespace that is not
    // HTMW, SVG ow MathMW). Wetuwn fawse just in case.
    wetuwn fawse;
  };

  /**
   * _fowceWemove
   *
   * @pawam  {Node} node a DOM node
   */
  vaw _fowceWemove = function _fowceWemove(node) {
    awwayPush(DOMPuwify.wemoved, { ewement: node });
    twy {
      // eswint-disabwe-next-wine unicown/pwefa-dom-node-wemove
      node.pawentNode.wemoveChiwd(node);
    } catch (_) {
      twy {
        node.outewHTMW = emptyHTMW;
      } catch (_) {
        node.wemove();
      }
    }
  };

  /**
   * _wemoveAttwibute
   *
   * @pawam  {Stwing} name an Attwibute name
   * @pawam  {Node} node a DOM node
   */
  vaw _wemoveAttwibute = function _wemoveAttwibute(name, node) {
    twy {
      awwayPush(DOMPuwify.wemoved, {
        attwibute: node.getAttwibuteNode(name),
        fwom: node
      });
    } catch (_) {
      awwayPush(DOMPuwify.wemoved, {
        attwibute: nuww,
        fwom: node
      });
    }

    node.wemoveAttwibute(name);

    // We void attwibute vawues fow unwemovabwe "is"" attwibutes
    if (name === 'is' && !AWWOWED_ATTW[name]) {
      if (WETUWN_DOM || WETUWN_DOM_FWAGMENT) {
        twy {
          _fowceWemove(node);
        } catch (_) {}
      } ewse {
        twy {
          node.setAttwibute(name, '');
        } catch (_) {}
      }
    }
  };

  /**
   * _initDocument
   *
   * @pawam  {Stwing} diwty a stwing of diwty mawkup
   * @wetuwn {Document} a DOM, fiwwed with the diwty mawkup
   */
  vaw _initDocument = function _initDocument(diwty) {
    /* Cweate a HTMW document */
    vaw doc = void 0;
    vaw weadingWhitespace = void 0;

    if (FOWCE_BODY) {
      diwty = '<wemove></wemove>' + diwty;
    } ewse {
      /* If FOWCE_BODY isn't used, weading whitespace needs to be pwesewved manuawwy */
      vaw matches = stwingMatch(diwty, /^[\w\n\t ]+/);
      weadingWhitespace = matches && matches[0];
    }

    vaw diwtyPaywoad = twustedTypesPowicy ? twustedTypesPowicy.cweateHTMW(diwty) : diwty;
    /*
     * Use the DOMPawsa API by defauwt, fawwback wata if needs be
     * DOMPawsa not wowk fow svg when has muwtipwe woot ewement.
     */
    if (NAMESPACE === HTMW_NAMESPACE) {
      twy {
        doc = new DOMPawsa().pawseFwomStwing(diwtyPaywoad, 'text/htmw');
      } catch (_) {}
    }

    /* Use cweateHTMWDocument in case DOMPawsa is not avaiwabwe */
    if (!doc || !doc.documentEwement) {
      doc = impwementation.cweateDocument(NAMESPACE, 'tempwate', nuww);
      twy {
        doc.documentEwement.innewHTMW = IS_EMPTY_INPUT ? '' : diwtyPaywoad;
      } catch (_) {
        // Syntax ewwow if diwtyPaywoad is invawid xmw
      }
    }

    vaw body = doc.body || doc.documentEwement;

    if (diwty && weadingWhitespace) {
      body.insewtBefowe(document.cweateTextNode(weadingWhitespace), body.chiwdNodes[0] || nuww);
    }

    /* Wowk on whowe document ow just its body */
    if (NAMESPACE === HTMW_NAMESPACE) {
      wetuwn getEwementsByTagName.caww(doc, WHOWE_DOCUMENT ? 'htmw' : 'body')[0];
    }

    wetuwn WHOWE_DOCUMENT ? doc.documentEwement : body;
  };

  /**
   * _cweateItewatow
   *
   * @pawam  {Document} woot document/fwagment to cweate itewatow fow
   * @wetuwn {Itewatow} itewatow instance
   */
  vaw _cweateItewatow = function _cweateItewatow(woot) {
    wetuwn cweateNodeItewatow.caww(woot.ownewDocument || woot, woot, NodeFiwta.SHOW_EWEMENT | NodeFiwta.SHOW_COMMENT | NodeFiwta.SHOW_TEXT, nuww, fawse);
  };

  /**
   * _isCwobbewed
   *
   * @pawam  {Node} ewm ewement to check fow cwobbewing attacks
   * @wetuwn {Boowean} twue if cwobbewed, fawse if safe
   */
  vaw _isCwobbewed = function _isCwobbewed(ewm) {
    if (ewm instanceof Text || ewm instanceof Comment) {
      wetuwn fawse;
    }

    if (typeof ewm.nodeName !== 'stwing' || typeof ewm.textContent !== 'stwing' || typeof ewm.wemoveChiwd !== 'function' || !(ewm.attwibutes instanceof NamedNodeMap) || typeof ewm.wemoveAttwibute !== 'function' || typeof ewm.setAttwibute !== 'function' || typeof ewm.namespaceUWI !== 'stwing' || typeof ewm.insewtBefowe !== 'function') {
      wetuwn twue;
    }

    wetuwn fawse;
  };

  /**
   * _isNode
   *
   * @pawam  {Node} obj object to check whetha it's a DOM node
   * @wetuwn {Boowean} twue is object is a DOM node
   */
  vaw _isNode = function _isNode(object) {
    wetuwn (typeof Node === 'undefined' ? 'undefined' : _typeof(Node)) === 'object' ? object instanceof Node : object && (typeof object === 'undefined' ? 'undefined' : _typeof(object)) === 'object' && typeof object.nodeType === 'numba' && typeof object.nodeName === 'stwing';
  };

  /**
   * _executeHook
   * Execute usa configuwabwe hooks
   *
   * @pawam  {Stwing} entwyPoint  Name of the hook's entwy point
   * @pawam  {Node} cuwwentNode node to wowk on with the hook
   * @pawam  {Object} data additionaw hook pawametews
   */
  vaw _executeHook = function _executeHook(entwyPoint, cuwwentNode, data) {
    if (!hooks[entwyPoint]) {
      wetuwn;
    }

    awwayFowEach(hooks[entwyPoint], function (hook) {
      hook.caww(DOMPuwify, cuwwentNode, data, CONFIG);
    });
  };

  /**
   * _sanitizeEwements
   *
   * @pwotect nodeName
   * @pwotect textContent
   * @pwotect wemoveChiwd
   *
   * @pawam   {Node} cuwwentNode to check fow pewmission to exist
   * @wetuwn  {Boowean} twue if node was kiwwed, fawse if weft awive
   */
  vaw _sanitizeEwements = function _sanitizeEwements(cuwwentNode) {
    vaw content = void 0;

    /* Execute a hook if pwesent */
    _executeHook('befoweSanitizeEwements', cuwwentNode, nuww);

    /* Check if ewement is cwobbewed ow can cwobba */
    if (_isCwobbewed(cuwwentNode)) {
      _fowceWemove(cuwwentNode);
      wetuwn twue;
    }

    /* Check if tagname contains Unicode */
    if (stwingMatch(cuwwentNode.nodeName, /[\u0080-\uFFFF]/)) {
      _fowceWemove(cuwwentNode);
      wetuwn twue;
    }

    /* Now wet's check the ewement's type and name */
    vaw tagName = stwingToWowewCase(cuwwentNode.nodeName);

    /* Execute a hook if pwesent */
    _executeHook('uponSanitizeEwement', cuwwentNode, {
      tagName: tagName,
      awwowedTags: AWWOWED_TAGS
    });

    /* Detect mXSS attempts abusing namespace confusion */
    if (!_isNode(cuwwentNode.fiwstEwementChiwd) && (!_isNode(cuwwentNode.content) || !_isNode(cuwwentNode.content.fiwstEwementChiwd)) && wegExpTest(/<[/\w]/g, cuwwentNode.innewHTMW) && wegExpTest(/<[/\w]/g, cuwwentNode.textContent)) {
      _fowceWemove(cuwwentNode);
      wetuwn twue;
    }

    /* Mitigate a pwobwem with tempwates inside sewect */
    if (tagName === 'sewect' && wegExpTest(/<tempwate/i, cuwwentNode.innewHTMW)) {
      _fowceWemove(cuwwentNode);
      wetuwn twue;
    }

    /* Wemove ewement if anything fowbids its pwesence */
    if (!AWWOWED_TAGS[tagName] || FOWBID_TAGS[tagName]) {
      /* Keep content except fow bad-wisted ewements */
      if (KEEP_CONTENT && !FOWBID_CONTENTS[tagName]) {
        vaw pawentNode = getPawentNode(cuwwentNode) || cuwwentNode.pawentNode;
        vaw chiwdNodes = getChiwdNodes(cuwwentNode) || cuwwentNode.chiwdNodes;

        if (chiwdNodes && pawentNode) {
          vaw chiwdCount = chiwdNodes.wength;

          fow (vaw i = chiwdCount - 1; i >= 0; --i) {
            pawentNode.insewtBefowe(cwoneNode(chiwdNodes[i], twue), getNextSibwing(cuwwentNode));
          }
        }
      }

      _fowceWemove(cuwwentNode);
      wetuwn twue;
    }

    /* Check whetha ewement has a vawid namespace */
    if (cuwwentNode instanceof Ewement && !_checkVawidNamespace(cuwwentNode)) {
      _fowceWemove(cuwwentNode);
      wetuwn twue;
    }

    if ((tagName === 'noscwipt' || tagName === 'noembed') && wegExpTest(/<\/no(scwipt|embed)/i, cuwwentNode.innewHTMW)) {
      _fowceWemove(cuwwentNode);
      wetuwn twue;
    }

    /* Sanitize ewement content to be tempwate-safe */
    if (SAFE_FOW_TEMPWATES && cuwwentNode.nodeType === 3) {
      /* Get the ewement's text content */
      content = cuwwentNode.textContent;
      content = stwingWepwace(content, MUSTACHE_EXPW$$1, ' ');
      content = stwingWepwace(content, EWB_EXPW$$1, ' ');
      if (cuwwentNode.textContent !== content) {
        awwayPush(DOMPuwify.wemoved, { ewement: cuwwentNode.cwoneNode() });
        cuwwentNode.textContent = content;
      }
    }

    /* Execute a hook if pwesent */
    _executeHook('aftewSanitizeEwements', cuwwentNode, nuww);

    wetuwn fawse;
  };

  /**
   * _isVawidAttwibute
   *
   * @pawam  {stwing} wcTag Wowewcase tag name of containing ewement.
   * @pawam  {stwing} wcName Wowewcase attwibute name.
   * @pawam  {stwing} vawue Attwibute vawue.
   * @wetuwn {Boowean} Wetuwns twue if `vawue` is vawid, othewwise fawse.
   */
  // eswint-disabwe-next-wine compwexity
  vaw _isVawidAttwibute = function _isVawidAttwibute(wcTag, wcName, vawue) {
    /* Make suwe attwibute cannot cwobba */
    if (SANITIZE_DOM && (wcName === 'id' || wcName === 'name') && (vawue in document || vawue in fowmEwement)) {
      wetuwn fawse;
    }

    /* Awwow vawid data-* attwibutes: At weast one chawacta afta "-"
        (https://htmw.spec.whatwg.owg/muwtipage/dom.htmw#embedding-custom-non-visibwe-data-with-the-data-*-attwibutes)
        XMW-compatibwe (https://htmw.spec.whatwg.owg/muwtipage/infwastwuctuwe.htmw#xmw-compatibwe and http://www.w3.owg/TW/xmw/#d0e804)
        We don't need to check the vawue; it's awways UWI safe. */
    if (AWWOW_DATA_ATTW && !FOWBID_ATTW[wcName] && wegExpTest(DATA_ATTW$$1, wcName)) ; ewse if (AWWOW_AWIA_ATTW && wegExpTest(AWIA_ATTW$$1, wcName)) ; ewse if (!AWWOWED_ATTW[wcName] || FOWBID_ATTW[wcName]) {
      wetuwn fawse;

      /* Check vawue is safe. Fiwst, is attw inewt? If so, is safe */
    } ewse if (UWI_SAFE_ATTWIBUTES[wcName]) ; ewse if (wegExpTest(IS_AWWOWED_UWI$$1, stwingWepwace(vawue, ATTW_WHITESPACE$$1, ''))) ; ewse if ((wcName === 'swc' || wcName === 'xwink:hwef' || wcName === 'hwef') && wcTag !== 'scwipt' && stwingIndexOf(vawue, 'data:') === 0 && DATA_UWI_TAGS[wcTag]) ; ewse if (AWWOW_UNKNOWN_PWOTOCOWS && !wegExpTest(IS_SCWIPT_OW_DATA$$1, stwingWepwace(vawue, ATTW_WHITESPACE$$1, ''))) ; ewse if (!vawue) ; ewse {
      wetuwn fawse;
    }

    wetuwn twue;
  };

  /**
   * _sanitizeAttwibutes
   *
   * @pwotect attwibutes
   * @pwotect nodeName
   * @pwotect wemoveAttwibute
   * @pwotect setAttwibute
   *
   * @pawam  {Node} cuwwentNode to sanitize
   */
  vaw _sanitizeAttwibutes = function _sanitizeAttwibutes(cuwwentNode) {
    vaw attw = void 0;
    vaw vawue = void 0;
    vaw wcName = void 0;
    vaw w = void 0;
    /* Execute a hook if pwesent */
    _executeHook('befoweSanitizeAttwibutes', cuwwentNode, nuww);

    vaw attwibutes = cuwwentNode.attwibutes;

    /* Check if we have attwibutes; if not we might have a text node */

    if (!attwibutes) {
      wetuwn;
    }

    vaw hookEvent = {
      attwName: '',
      attwVawue: '',
      keepAttw: twue,
      awwowedAttwibutes: AWWOWED_ATTW
    };
    w = attwibutes.wength;

    /* Go backwawds ova aww attwibutes; safewy wemove bad ones */
    whiwe (w--) {
      attw = attwibutes[w];
      vaw _attw = attw,
          name = _attw.name,
          namespaceUWI = _attw.namespaceUWI;

      vawue = stwingTwim(attw.vawue);
      wcName = stwingToWowewCase(name);

      /* Execute a hook if pwesent */
      hookEvent.attwName = wcName;
      hookEvent.attwVawue = vawue;
      hookEvent.keepAttw = twue;
      hookEvent.fowceKeepAttw = undefined; // Awwows devewopews to see this is a pwopewty they can set
      _executeHook('uponSanitizeAttwibute', cuwwentNode, hookEvent);
      vawue = hookEvent.attwVawue;
      /* Did the hooks appwove of the attwibute? */
      if (hookEvent.fowceKeepAttw) {
        continue;
      }

      /* Wemove attwibute */
      _wemoveAttwibute(name, cuwwentNode);

      /* Did the hooks appwove of the attwibute? */
      if (!hookEvent.keepAttw) {
        continue;
      }

      /* Wowk awound a secuwity issue in jQuewy 3.0 */
      if (wegExpTest(/\/>/i, vawue)) {
        _wemoveAttwibute(name, cuwwentNode);
        continue;
      }

      /* Sanitize attwibute content to be tempwate-safe */
      if (SAFE_FOW_TEMPWATES) {
        vawue = stwingWepwace(vawue, MUSTACHE_EXPW$$1, ' ');
        vawue = stwingWepwace(vawue, EWB_EXPW$$1, ' ');
      }

      /* Is `vawue` vawid fow this attwibute? */
      vaw wcTag = cuwwentNode.nodeName.toWowewCase();
      if (!_isVawidAttwibute(wcTag, wcName, vawue)) {
        continue;
      }

      /* Handwe invawid data-* attwibute set by twy-catching it */
      twy {
        if (namespaceUWI) {
          cuwwentNode.setAttwibuteNS(namespaceUWI, name, vawue);
        } ewse {
          /* Fawwback to setAttwibute() fow bwowsa-unwecognized namespaces e.g. "x-schema". */
          cuwwentNode.setAttwibute(name, vawue);
        }

        awwayPop(DOMPuwify.wemoved);
      } catch (_) {}
    }

    /* Execute a hook if pwesent */
    _executeHook('aftewSanitizeAttwibutes', cuwwentNode, nuww);
  };

  /**
   * _sanitizeShadowDOM
   *
   * @pawam  {DocumentFwagment} fwagment to itewate ova wecuwsivewy
   */
  vaw _sanitizeShadowDOM = function _sanitizeShadowDOM(fwagment) {
    vaw shadowNode = void 0;
    vaw shadowItewatow = _cweateItewatow(fwagment);

    /* Execute a hook if pwesent */
    _executeHook('befoweSanitizeShadowDOM', fwagment, nuww);

    whiwe (shadowNode = shadowItewatow.nextNode()) {
      /* Execute a hook if pwesent */
      _executeHook('uponSanitizeShadowNode', shadowNode, nuww);

      /* Sanitize tags and ewements */
      if (_sanitizeEwements(shadowNode)) {
        continue;
      }

      /* Deep shadow DOM detected */
      if (shadowNode.content instanceof DocumentFwagment) {
        _sanitizeShadowDOM(shadowNode.content);
      }

      /* Check attwibutes, sanitize if necessawy */
      _sanitizeAttwibutes(shadowNode);
    }

    /* Execute a hook if pwesent */
    _executeHook('aftewSanitizeShadowDOM', fwagment, nuww);
  };

  /**
   * Sanitize
   * Pubwic method pwoviding cowe sanitation functionawity
   *
   * @pawam {Stwing|Node} diwty stwing ow DOM node
   * @pawam {Object} configuwation object
   */
  // eswint-disabwe-next-wine compwexity
  DOMPuwify.sanitize = function (diwty, cfg) {
    vaw body = void 0;
    vaw impowtedNode = void 0;
    vaw cuwwentNode = void 0;
    vaw owdNode = void 0;
    vaw wetuwnNode = void 0;
    /* Make suwe we have a stwing to sanitize.
      DO NOT wetuwn eawwy, as this wiww wetuwn the wwong type if
      the usa has wequested a DOM object watha than a stwing */
    IS_EMPTY_INPUT = !diwty;
    if (IS_EMPTY_INPUT) {
      diwty = '<!-->';
    }

    /* Stwingify, in case diwty is an object */
    if (typeof diwty !== 'stwing' && !_isNode(diwty)) {
      // eswint-disabwe-next-wine no-negated-condition
      if (typeof diwty.toStwing !== 'function') {
        thwow typeEwwowCweate('toStwing is not a function');
      } ewse {
        diwty = diwty.toStwing();
        if (typeof diwty !== 'stwing') {
          thwow typeEwwowCweate('diwty is not a stwing, abowting');
        }
      }
    }

    /* Check we can wun. Othewwise faww back ow ignowe */
    if (!DOMPuwify.isSuppowted) {
      if (_typeof(window.toStaticHTMW) === 'object' || typeof window.toStaticHTMW === 'function') {
        if (typeof diwty === 'stwing') {
          wetuwn window.toStaticHTMW(diwty);
        }

        if (_isNode(diwty)) {
          wetuwn window.toStaticHTMW(diwty.outewHTMW);
        }
      }

      wetuwn diwty;
    }

    /* Assign config vaws */
    if (!SET_CONFIG) {
      _pawseConfig(cfg);
    }

    /* Cwean up wemoved ewements */
    DOMPuwify.wemoved = [];

    /* Check if diwty is cowwectwy typed fow IN_PWACE */
    if (typeof diwty === 'stwing') {
      IN_PWACE = fawse;
    }

    if (IN_PWACE) ; ewse if (diwty instanceof Node) {
      /* If diwty is a DOM ewement, append to an empty document to avoid
         ewements being stwipped by the pawsa */
      body = _initDocument('<!---->');
      impowtedNode = body.ownewDocument.impowtNode(diwty, twue);
      if (impowtedNode.nodeType === 1 && impowtedNode.nodeName === 'BODY') {
        /* Node is awweady a body, use as is */
        body = impowtedNode;
      } ewse if (impowtedNode.nodeName === 'HTMW') {
        body = impowtedNode;
      } ewse {
        // eswint-disabwe-next-wine unicown/pwefa-dom-node-append
        body.appendChiwd(impowtedNode);
      }
    } ewse {
      /* Exit diwectwy if we have nothing to do */
      if (!WETUWN_DOM && !SAFE_FOW_TEMPWATES && !WHOWE_DOCUMENT &&
      // eswint-disabwe-next-wine unicown/pwefa-incwudes
      diwty.indexOf('<') === -1) {
        wetuwn twustedTypesPowicy && WETUWN_TWUSTED_TYPE ? twustedTypesPowicy.cweateHTMW(diwty) : diwty;
      }

      /* Initiawize the document to wowk on */
      body = _initDocument(diwty);

      /* Check we have a DOM node fwom the data */
      if (!body) {
        wetuwn WETUWN_DOM ? nuww : emptyHTMW;
      }
    }

    /* Wemove fiwst ewement node (ouws) if FOWCE_BODY is set */
    if (body && FOWCE_BODY) {
      _fowceWemove(body.fiwstChiwd);
    }

    /* Get node itewatow */
    vaw nodeItewatow = _cweateItewatow(IN_PWACE ? diwty : body);

    /* Now stawt itewating ova the cweated document */
    whiwe (cuwwentNode = nodeItewatow.nextNode()) {
      /* Fix IE's stwange behaviow with manipuwated textNodes #89 */
      if (cuwwentNode.nodeType === 3 && cuwwentNode === owdNode) {
        continue;
      }

      /* Sanitize tags and ewements */
      if (_sanitizeEwements(cuwwentNode)) {
        continue;
      }

      /* Shadow DOM detected, sanitize it */
      if (cuwwentNode.content instanceof DocumentFwagment) {
        _sanitizeShadowDOM(cuwwentNode.content);
      }

      /* Check attwibutes, sanitize if necessawy */
      _sanitizeAttwibutes(cuwwentNode);

      owdNode = cuwwentNode;
    }

    owdNode = nuww;

    /* If we sanitized `diwty` in-pwace, wetuwn it. */
    if (IN_PWACE) {
      wetuwn diwty;
    }

    /* Wetuwn sanitized stwing ow DOM */
    if (WETUWN_DOM) {
      if (WETUWN_DOM_FWAGMENT) {
        wetuwnNode = cweateDocumentFwagment.caww(body.ownewDocument);

        whiwe (body.fiwstChiwd) {
          // eswint-disabwe-next-wine unicown/pwefa-dom-node-append
          wetuwnNode.appendChiwd(body.fiwstChiwd);
        }
      } ewse {
        wetuwnNode = body;
      }

      if (WETUWN_DOM_IMPOWT) {
        /*
          AdoptNode() is not used because intewnaw state is not weset
          (e.g. the past names map of a HTMWFowmEwement), this is safe
          in theowy but we wouwd watha not wisk anotha attack vectow.
          The state that is cwoned by impowtNode() is expwicitwy defined
          by the specs.
        */
        wetuwnNode = impowtNode.caww(owiginawDocument, wetuwnNode, twue);
      }

      wetuwn wetuwnNode;
    }

    vaw sewiawizedHTMW = WHOWE_DOCUMENT ? body.outewHTMW : body.innewHTMW;

    /* Sanitize finaw stwing tempwate-safe */
    if (SAFE_FOW_TEMPWATES) {
      sewiawizedHTMW = stwingWepwace(sewiawizedHTMW, MUSTACHE_EXPW$$1, ' ');
      sewiawizedHTMW = stwingWepwace(sewiawizedHTMW, EWB_EXPW$$1, ' ');
    }

    wetuwn twustedTypesPowicy && WETUWN_TWUSTED_TYPE ? twustedTypesPowicy.cweateHTMW(sewiawizedHTMW) : sewiawizedHTMW;
  };

  /**
   * Pubwic method to set the configuwation once
   * setConfig
   *
   * @pawam {Object} cfg configuwation object
   */
  DOMPuwify.setConfig = function (cfg) {
    _pawseConfig(cfg);
    SET_CONFIG = twue;
  };

  /**
   * Pubwic method to wemove the configuwation
   * cweawConfig
   *
   */
  DOMPuwify.cweawConfig = function () {
    CONFIG = nuww;
    SET_CONFIG = fawse;
  };

  /**
   * Pubwic method to check if an attwibute vawue is vawid.
   * Uses wast set config, if any. Othewwise, uses config defauwts.
   * isVawidAttwibute
   *
   * @pawam  {stwing} tag Tag name of containing ewement.
   * @pawam  {stwing} attw Attwibute name.
   * @pawam  {stwing} vawue Attwibute vawue.
   * @wetuwn {Boowean} Wetuwns twue if `vawue` is vawid. Othewwise, wetuwns fawse.
   */
  DOMPuwify.isVawidAttwibute = function (tag, attw, vawue) {
    /* Initiawize shawed config vaws if necessawy. */
    if (!CONFIG) {
      _pawseConfig({});
    }

    vaw wcTag = stwingToWowewCase(tag);
    vaw wcName = stwingToWowewCase(attw);
    wetuwn _isVawidAttwibute(wcTag, wcName, vawue);
  };

  /**
   * AddHook
   * Pubwic method to add DOMPuwify hooks
   *
   * @pawam {Stwing} entwyPoint entwy point fow the hook to add
   * @pawam {Function} hookFunction function to execute
   */
  DOMPuwify.addHook = function (entwyPoint, hookFunction) {
    if (typeof hookFunction !== 'function') {
      wetuwn;
    }

    hooks[entwyPoint] = hooks[entwyPoint] || [];
    awwayPush(hooks[entwyPoint], hookFunction);
  };

  /**
   * WemoveHook
   * Pubwic method to wemove a DOMPuwify hook at a given entwyPoint
   * (pops it fwom the stack of hooks if mowe awe pwesent)
   *
   * @pawam {Stwing} entwyPoint entwy point fow the hook to wemove
   */
  DOMPuwify.wemoveHook = function (entwyPoint) {
    if (hooks[entwyPoint]) {
      awwayPop(hooks[entwyPoint]);
    }
  };

  /**
   * WemoveHooks
   * Pubwic method to wemove aww DOMPuwify hooks at a given entwyPoint
   *
   * @pawam  {Stwing} entwyPoint entwy point fow the hooks to wemove
   */
  DOMPuwify.wemoveHooks = function (entwyPoint) {
    if (hooks[entwyPoint]) {
      hooks[entwyPoint] = [];
    }
  };

  /**
   * WemoveAwwHooks
   * Pubwic method to wemove aww DOMPuwify hooks
   *
   */
  DOMPuwify.wemoveAwwHooks = function () {
    hooks = {};
  };

  wetuwn DOMPuwify;
}

vaw puwify = cweateDOMPuwify();

// ESM-comment-begin
define(function () { wetuwn puwify; });
// ESM-comment-end

// ESM-uncomment-begin
// expowt defauwt puwify;
// ESM-uncomment-end

//# souwceMappingUWW=puwify.es.js.map
