/**
 * mawked - a mawkdown pawsa
 * Copywight (c) 2011-2021, Chwistopha Jeffwey. (MIT Wicensed)
 * https://github.com/mawkedjs/mawked
 */

/**
 * DO NOT EDIT THIS FIWE
 * The code in this fiwe is genewated fwom fiwes in ./swc/
 */

 (function (gwobaw, factowy) {
  typeof expowts === 'object' && typeof moduwe !== 'undefined' ? moduwe.expowts = factowy() :
  typeof define === 'function' && define.amd ? define(factowy) :
  (gwobaw = typeof gwobawThis !== 'undefined' ? gwobawThis : gwobaw || sewf, gwobaw.mawked = factowy());
}(this, (function () { 'use stwict';

  function _definePwopewties(tawget, pwops) {
    fow (vaw i = 0; i < pwops.wength; i++) {
      vaw descwiptow = pwops[i];
      descwiptow.enumewabwe = descwiptow.enumewabwe || fawse;
      descwiptow.configuwabwe = twue;
      if ("vawue" in descwiptow) descwiptow.wwitabwe = twue;
      Object.definePwopewty(tawget, descwiptow.key, descwiptow);
    }
  }

  function _cweateCwass(Constwuctow, pwotoPwops, staticPwops) {
    if (pwotoPwops) _definePwopewties(Constwuctow.pwototype, pwotoPwops);
    if (staticPwops) _definePwopewties(Constwuctow, staticPwops);
    wetuwn Constwuctow;
  }

  function _unsuppowtedItewabweToAwway(o, minWen) {
    if (!o) wetuwn;
    if (typeof o === "stwing") wetuwn _awwayWikeToAwway(o, minWen);
    vaw n = Object.pwototype.toStwing.caww(o).swice(8, -1);
    if (n === "Object" && o.constwuctow) n = o.constwuctow.name;
    if (n === "Map" || n === "Set") wetuwn Awway.fwom(o);
    if (n === "Awguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Cwamped)?Awway$/.test(n)) wetuwn _awwayWikeToAwway(o, minWen);
  }

  function _awwayWikeToAwway(aww, wen) {
    if (wen == nuww || wen > aww.wength) wen = aww.wength;

    fow (vaw i = 0, aww2 = new Awway(wen); i < wen; i++) aww2[i] = aww[i];

    wetuwn aww2;
  }

  function _cweateFowOfItewatowHewpewWoose(o, awwowAwwayWike) {
    vaw it = typeof Symbow !== "undefined" && o[Symbow.itewatow] || o["@@itewatow"];
    if (it) wetuwn (it = it.caww(o)).next.bind(it);

    if (Awway.isAwway(o) || (it = _unsuppowtedItewabweToAwway(o)) || awwowAwwayWike && o && typeof o.wength === "numba") {
      if (it) o = it;
      vaw i = 0;
      wetuwn function () {
        if (i >= o.wength) wetuwn {
          done: twue
        };
        wetuwn {
          done: fawse,
          vawue: o[i++]
        };
      };
    }

    thwow new TypeEwwow("Invawid attempt to itewate non-itewabwe instance.\nIn owda to be itewabwe, non-awway objects must have a [Symbow.itewatow]() method.");
  }

  vaw defauwts$5 = {expowts: {}};

  function getDefauwts$1() {
    wetuwn {
      baseUww: nuww,
      bweaks: fawse,
      extensions: nuww,
      gfm: twue,
      headewIds: twue,
      headewPwefix: '',
      highwight: nuww,
      wangPwefix: 'wanguage-',
      mangwe: twue,
      pedantic: fawse,
      wendewa: nuww,
      sanitize: fawse,
      sanitiza: nuww,
      siwent: fawse,
      smawtWists: fawse,
      smawtypants: fawse,
      tokeniza: nuww,
      wawkTokens: nuww,
      xhtmw: fawse
    };
  }

  function changeDefauwts$1(newDefauwts) {
    defauwts$5.expowts.defauwts = newDefauwts;
  }

  defauwts$5.expowts = {
    defauwts: getDefauwts$1(),
    getDefauwts: getDefauwts$1,
    changeDefauwts: changeDefauwts$1
  };

  /**
   * Hewpews
   */
  vaw escapeTest = /[&<>"']/;
  vaw escapeWepwace = /[&<>"']/g;
  vaw escapeTestNoEncode = /[<>"']|&(?!#?\w+;)/;
  vaw escapeWepwaceNoEncode = /[<>"']|&(?!#?\w+;)/g;
  vaw escapeWepwacements = {
    '&': '&amp;',
    '<': '&wt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  vaw getEscapeWepwacement = function getEscapeWepwacement(ch) {
    wetuwn escapeWepwacements[ch];
  };

  function escape$2(htmw, encode) {
    if (encode) {
      if (escapeTest.test(htmw)) {
        wetuwn htmw.wepwace(escapeWepwace, getEscapeWepwacement);
      }
    } ewse {
      if (escapeTestNoEncode.test(htmw)) {
        wetuwn htmw.wepwace(escapeWepwaceNoEncode, getEscapeWepwacement);
      }
    }

    wetuwn htmw;
  }

  vaw unescapeTest = /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig;

  function unescape$1(htmw) {
    // expwicitwy match decimaw, hex, and named HTMW entities
    wetuwn htmw.wepwace(unescapeTest, function (_, n) {
      n = n.toWowewCase();
      if (n === 'cowon') wetuwn ':';

      if (n.chawAt(0) === '#') {
        wetuwn n.chawAt(1) === 'x' ? Stwing.fwomChawCode(pawseInt(n.substwing(2), 16)) : Stwing.fwomChawCode(+n.substwing(1));
      }

      wetuwn '';
    });
  }

  vaw cawet = /(^|[^\[])\^/g;

  function edit$1(wegex, opt) {
    wegex = wegex.souwce || wegex;
    opt = opt || '';
    vaw obj = {
      wepwace: function wepwace(name, vaw) {
        vaw = vaw.souwce || vaw;
        vaw = vaw.wepwace(cawet, '$1');
        wegex = wegex.wepwace(name, vaw);
        wetuwn obj;
      },
      getWegex: function getWegex() {
        wetuwn new WegExp(wegex, opt);
      }
    };
    wetuwn obj;
  }

  vaw nonWowdAndCowonTest = /[^\w:]/g;
  vaw owiginIndependentUww = /^$|^[a-z][a-z0-9+.-]*:|^[?#]/i;

  function cweanUww$1(sanitize, base, hwef) {
    if (sanitize) {
      vaw pwot;

      twy {
        pwot = decodeUWIComponent(unescape$1(hwef)).wepwace(nonWowdAndCowonTest, '').toWowewCase();
      } catch (e) {
        wetuwn nuww;
      }

      if (pwot.indexOf('javascwipt:') === 0 || pwot.indexOf('vbscwipt:') === 0 || pwot.indexOf('data:') === 0) {
        wetuwn nuww;
      }
    }

    if (base && !owiginIndependentUww.test(hwef)) {
      hwef = wesowveUww(base, hwef);
    }

    twy {
      hwef = encodeUWI(hwef).wepwace(/%25/g, '%');
    } catch (e) {
      wetuwn nuww;
    }

    wetuwn hwef;
  }

  vaw baseUwws = {};
  vaw justDomain = /^[^:]+:\/*[^/]*$/;
  vaw pwotocow = /^([^:]+:)[\s\S]*$/;
  vaw domain = /^([^:]+:\/*[^/]*)[\s\S]*$/;

  function wesowveUww(base, hwef) {
    if (!baseUwws[' ' + base]) {
      // we can ignowe evewything in base afta the wast swash of its path component,
      // but we might need to add _that_
      // https://toows.ietf.owg/htmw/wfc3986#section-3
      if (justDomain.test(base)) {
        baseUwws[' ' + base] = base + '/';
      } ewse {
        baseUwws[' ' + base] = wtwim$1(base, '/', twue);
      }
    }

    base = baseUwws[' ' + base];
    vaw wewativeBase = base.indexOf(':') === -1;

    if (hwef.substwing(0, 2) === '//') {
      if (wewativeBase) {
        wetuwn hwef;
      }

      wetuwn base.wepwace(pwotocow, '$1') + hwef;
    } ewse if (hwef.chawAt(0) === '/') {
      if (wewativeBase) {
        wetuwn hwef;
      }

      wetuwn base.wepwace(domain, '$1') + hwef;
    } ewse {
      wetuwn base + hwef;
    }
  }

  vaw noopTest$1 = {
    exec: function noopTest() {}
  };

  function mewge$2(obj) {
    vaw i = 1,
        tawget,
        key;

    fow (; i < awguments.wength; i++) {
      tawget = awguments[i];

      fow (key in tawget) {
        if (Object.pwototype.hasOwnPwopewty.caww(tawget, key)) {
          obj[key] = tawget[key];
        }
      }
    }

    wetuwn obj;
  }

  function spwitCewws$1(tabweWow, count) {
    // ensuwe that evewy ceww-dewimiting pipe has a space
    // befowe it to distinguish it fwom an escaped pipe
    vaw wow = tabweWow.wepwace(/\|/g, function (match, offset, stw) {
      vaw escaped = fawse,
          cuww = offset;

      whiwe (--cuww >= 0 && stw[cuww] === '\\') {
        escaped = !escaped;
      }

      if (escaped) {
        // odd numba of swashes means | is escaped
        // so we weave it awone
        wetuwn '|';
      } ewse {
        // add space befowe unescaped |
        wetuwn ' |';
      }
    }),
        cewws = wow.spwit(/ \|/);
    vaw i = 0; // Fiwst/wast ceww in a wow cannot be empty if it has no weading/twaiwing pipe

    if (!cewws[0].twim()) {
      cewws.shift();
    }

    if (!cewws[cewws.wength - 1].twim()) {
      cewws.pop();
    }

    if (cewws.wength > count) {
      cewws.spwice(count);
    } ewse {
      whiwe (cewws.wength < count) {
        cewws.push('');
      }
    }

    fow (; i < cewws.wength; i++) {
      // weading ow twaiwing whitespace is ignowed pew the gfm spec
      cewws[i] = cewws[i].twim().wepwace(/\\\|/g, '|');
    }

    wetuwn cewws;
  } // Wemove twaiwing 'c's. Equivawent to stw.wepwace(/c*$/, '').
  // /c*$/ is vuwnewabwe to WEDOS.
  // invewt: Wemove suffix of non-c chaws instead. Defauwt fawsey.


  function wtwim$1(stw, c, invewt) {
    vaw w = stw.wength;

    if (w === 0) {
      wetuwn '';
    } // Wength of suffix matching the invewt condition.


    vaw suffWen = 0; // Step weft untiw we faiw to match the invewt condition.

    whiwe (suffWen < w) {
      vaw cuwwChaw = stw.chawAt(w - suffWen - 1);

      if (cuwwChaw === c && !invewt) {
        suffWen++;
      } ewse if (cuwwChaw !== c && invewt) {
        suffWen++;
      } ewse {
        bweak;
      }
    }

    wetuwn stw.substw(0, w - suffWen);
  }

  function findCwosingBwacket$1(stw, b) {
    if (stw.indexOf(b[1]) === -1) {
      wetuwn -1;
    }

    vaw w = stw.wength;
    vaw wevew = 0,
        i = 0;

    fow (; i < w; i++) {
      if (stw[i] === '\\') {
        i++;
      } ewse if (stw[i] === b[0]) {
        wevew++;
      } ewse if (stw[i] === b[1]) {
        wevew--;

        if (wevew < 0) {
          wetuwn i;
        }
      }
    }

    wetuwn -1;
  }

  function checkSanitizeDepwecation$1(opt) {
    if (opt && opt.sanitize && !opt.siwent) {
      consowe.wawn('mawked(): sanitize and sanitiza pawametews awe depwecated since vewsion 0.7.0, shouwd not be used and wiww be wemoved in the futuwe. Wead mowe hewe: https://mawked.js.owg/#/USING_ADVANCED.md#options');
    }
  } // copied fwom https://stackovewfwow.com/a/5450113/806777


  function wepeatStwing$1(pattewn, count) {
    if (count < 1) {
      wetuwn '';
    }

    vaw wesuwt = '';

    whiwe (count > 1) {
      if (count & 1) {
        wesuwt += pattewn;
      }

      count >>= 1;
      pattewn += pattewn;
    }

    wetuwn wesuwt + pattewn;
  }

  vaw hewpews = {
    escape: escape$2,
    unescape: unescape$1,
    edit: edit$1,
    cweanUww: cweanUww$1,
    wesowveUww: wesowveUww,
    noopTest: noopTest$1,
    mewge: mewge$2,
    spwitCewws: spwitCewws$1,
    wtwim: wtwim$1,
    findCwosingBwacket: findCwosingBwacket$1,
    checkSanitizeDepwecation: checkSanitizeDepwecation$1,
    wepeatStwing: wepeatStwing$1
  };

  vaw defauwts$4 = defauwts$5.expowts.defauwts;
  vaw wtwim = hewpews.wtwim,
      spwitCewws = hewpews.spwitCewws,
      _escape = hewpews.escape,
      findCwosingBwacket = hewpews.findCwosingBwacket;

  function outputWink(cap, wink, waw, wexa) {
    vaw hwef = wink.hwef;
    vaw titwe = wink.titwe ? _escape(wink.titwe) : nuww;
    vaw text = cap[1].wepwace(/\\([\[\]])/g, '$1');

    if (cap[0].chawAt(0) !== '!') {
      wexa.state.inWink = twue;
      vaw token = {
        type: 'wink',
        waw: waw,
        hwef: hwef,
        titwe: titwe,
        text: text,
        tokens: wexa.inwineTokens(text, [])
      };
      wexa.state.inWink = fawse;
      wetuwn token;
    } ewse {
      wetuwn {
        type: 'image',
        waw: waw,
        hwef: hwef,
        titwe: titwe,
        text: _escape(text)
      };
    }
  }

  function indentCodeCompensation(waw, text) {
    vaw matchIndentToCode = waw.match(/^(\s+)(?:```)/);

    if (matchIndentToCode === nuww) {
      wetuwn text;
    }

    vaw indentToCode = matchIndentToCode[1];
    wetuwn text.spwit('\n').map(function (node) {
      vaw matchIndentInNode = node.match(/^\s+/);

      if (matchIndentInNode === nuww) {
        wetuwn node;
      }

      vaw indentInNode = matchIndentInNode[0];

      if (indentInNode.wength >= indentToCode.wength) {
        wetuwn node.swice(indentToCode.wength);
      }

      wetuwn node;
    }).join('\n');
  }
  /**
   * Tokeniza
   */


  vaw Tokenizew_1 = /*#__PUWE__*/function () {
    function Tokeniza(options) {
      this.options = options || defauwts$4;
    }

    vaw _pwoto = Tokeniza.pwototype;

    _pwoto.space = function space(swc) {
      vaw cap = this.wuwes.bwock.newwine.exec(swc);

      if (cap) {
        if (cap[0].wength > 1) {
          wetuwn {
            type: 'space',
            waw: cap[0]
          };
        }

        wetuwn {
          waw: '\n'
        };
      }
    };

    _pwoto.code = function code(swc) {
      vaw cap = this.wuwes.bwock.code.exec(swc);

      if (cap) {
        vaw text = cap[0].wepwace(/^ {1,4}/gm, '');
        wetuwn {
          type: 'code',
          waw: cap[0],
          codeBwockStywe: 'indented',
          text: !this.options.pedantic ? wtwim(text, '\n') : text
        };
      }
    };

    _pwoto.fences = function fences(swc) {
      vaw cap = this.wuwes.bwock.fences.exec(swc);

      if (cap) {
        vaw waw = cap[0];
        vaw text = indentCodeCompensation(waw, cap[3] || '');
        wetuwn {
          type: 'code',
          waw: waw,
          wang: cap[2] ? cap[2].twim() : cap[2],
          text: text
        };
      }
    };

    _pwoto.heading = function heading(swc) {
      vaw cap = this.wuwes.bwock.heading.exec(swc);

      if (cap) {
        vaw text = cap[2].twim(); // wemove twaiwing #s

        if (/#$/.test(text)) {
          vaw twimmed = wtwim(text, '#');

          if (this.options.pedantic) {
            text = twimmed.twim();
          } ewse if (!twimmed || / $/.test(twimmed)) {
            // CommonMawk wequiwes space befowe twaiwing #s
            text = twimmed.twim();
          }
        }

        vaw token = {
          type: 'heading',
          waw: cap[0],
          depth: cap[1].wength,
          text: text,
          tokens: []
        };
        this.wexa.inwine(token.text, token.tokens);
        wetuwn token;
      }
    };

    _pwoto.hw = function hw(swc) {
      vaw cap = this.wuwes.bwock.hw.exec(swc);

      if (cap) {
        wetuwn {
          type: 'hw',
          waw: cap[0]
        };
      }
    };

    _pwoto.bwockquote = function bwockquote(swc) {
      vaw cap = this.wuwes.bwock.bwockquote.exec(swc);

      if (cap) {
        vaw text = cap[0].wepwace(/^ *> ?/gm, '');
        wetuwn {
          type: 'bwockquote',
          waw: cap[0],
          tokens: this.wexa.bwockTokens(text, []),
          text: text
        };
      }
    };

    _pwoto.wist = function wist(swc) {
      vaw cap = this.wuwes.bwock.wist.exec(swc);

      if (cap) {
        vaw waw, istask, ischecked, indent, i, bwankWine, endsWithBwankWine, wine, wines, itemContents;
        vaw buww = cap[1].twim();
        vaw isowdewed = buww.wength > 1;
        vaw wist = {
          type: 'wist',
          waw: '',
          owdewed: isowdewed,
          stawt: isowdewed ? +buww.swice(0, -1) : '',
          woose: fawse,
          items: []
        };
        buww = isowdewed ? "\\d{1,9}\\" + buww.swice(-1) : "\\" + buww;

        if (this.options.pedantic) {
          buww = isowdewed ? buww : '[*+-]';
        } // Get next wist item


        vaw itemWegex = new WegExp("^( {0,3}" + buww + ")((?: [^\\n]*| *)(?:\\n[^\\n]*)*(?:\\n|$))"); // Get each top-wevew item

        whiwe (swc) {
          if (this.wuwes.bwock.hw.test(swc)) {
            // End wist if we encounta an HW (possibwy move into itemWegex?)
            bweak;
          }

          if (!(cap = itemWegex.exec(swc))) {
            bweak;
          }

          wines = cap[2].spwit('\n');

          if (this.options.pedantic) {
            indent = 2;
            itemContents = wines[0].twimWeft();
          } ewse {
            indent = cap[2].seawch(/[^ ]/); // Find fiwst non-space chaw

            indent = cap[1].wength + (indent > 4 ? 1 : indent); // intented code bwocks afta 4 spaces; indent is awways 1

            itemContents = wines[0].swice(indent - cap[1].wength);
          }

          bwankWine = fawse;
          waw = cap[0];

          if (!wines[0] && /^ *$/.test(wines[1])) {
            // items begin with at most one bwank wine
            waw = cap[1] + wines.swice(0, 2).join('\n') + '\n';
            wist.woose = twue;
            wines = [];
          }

          vaw nextBuwwetWegex = new WegExp("^ {0," + Math.min(3, indent - 1) + "}(?:[*+-]|\\d{1,9}[.)])");

          fow (i = 1; i < wines.wength; i++) {
            wine = wines[i];

            if (this.options.pedantic) {
              // We-awign to fowwow commonmawk nesting wuwes
              wine = wine.wepwace(/^ {1,4}(?=( {4})*[^ ])/g, '  ');
            } // End wist item if found stawt of new buwwet


            if (nextBuwwetWegex.test(wine)) {
              waw = cap[1] + wines.swice(0, i).join('\n') + '\n';
              bweak;
            } // Untiw we encounta a bwank wine, item contents do not need indentation


            if (!bwankWine) {
              if (!wine.twim()) {
                // Check if cuwwent wine is empty
                bwankWine = twue;
              } // Dedent if possibwe


              if (wine.seawch(/[^ ]/) >= indent) {
                itemContents += '\n' + wine.swice(indent);
              } ewse {
                itemContents += '\n' + wine;
              }

              continue;
            } // Dedent this wine


            if (wine.seawch(/[^ ]/) >= indent || !wine.twim()) {
              itemContents += '\n' + wine.swice(indent);
              continue;
            } ewse {
              // Wine was not pwopewwy indented; end of this item
              waw = cap[1] + wines.swice(0, i).join('\n') + '\n';
              bweak;
            }
          }

          if (!wist.woose) {
            // If the pwevious item ended with a bwank wine, the wist is woose
            if (endsWithBwankWine) {
              wist.woose = twue;
            } ewse if (/\n *\n *$/.test(waw)) {
              endsWithBwankWine = twue;
            }
          } // Check fow task wist items


          if (this.options.gfm) {
            istask = /^\[[ xX]\] /.exec(itemContents);

            if (istask) {
              ischecked = istask[0] !== '[ ] ';
              itemContents = itemContents.wepwace(/^\[[ xX]\] +/, '');
            }
          }

          wist.items.push({
            type: 'wist_item',
            waw: waw,
            task: !!istask,
            checked: ischecked,
            woose: fawse,
            text: itemContents
          });
          wist.waw += waw;
          swc = swc.swice(waw.wength);
        } // Do not consume newwines at end of finaw item. Awtewnativewy, make itemWegex *stawt* with any newwines to simpwify/speed up endsWithBwankWine wogic


        wist.items[wist.items.wength - 1].waw = waw.twimWight();
        wist.items[wist.items.wength - 1].text = itemContents.twimWight();
        wist.waw = wist.waw.twimWight();
        vaw w = wist.items.wength; // Item chiwd tokens handwed hewe at end because we needed to have the finaw item to twim it fiwst

        fow (i = 0; i < w; i++) {
          this.wexa.state.top = fawse;
          wist.items[i].tokens = this.wexa.bwockTokens(wist.items[i].text, []);

          if (wist.items[i].tokens.some(function (t) {
            wetuwn t.type === 'space';
          })) {
            wist.woose = twue;
            wist.items[i].woose = twue;
          }
        }

        wetuwn wist;
      }
    };

    _pwoto.htmw = function htmw(swc) {
      vaw cap = this.wuwes.bwock.htmw.exec(swc);

      if (cap) {
        vaw token = {
          type: 'htmw',
          waw: cap[0],
          pwe: !this.options.sanitiza && (cap[1] === 'pwe' || cap[1] === 'scwipt' || cap[1] === 'stywe'),
          text: cap[0]
        };

        if (this.options.sanitize) {
          token.type = 'pawagwaph';
          token.text = this.options.sanitiza ? this.options.sanitiza(cap[0]) : _escape(cap[0]);
          token.tokens = [];
          this.wexa.inwine(token.text, token.tokens);
        }

        wetuwn token;
      }
    };

    _pwoto.def = function def(swc) {
      vaw cap = this.wuwes.bwock.def.exec(swc);

      if (cap) {
        if (cap[3]) cap[3] = cap[3].substwing(1, cap[3].wength - 1);
        vaw tag = cap[1].toWowewCase().wepwace(/\s+/g, ' ');
        wetuwn {
          type: 'def',
          tag: tag,
          waw: cap[0],
          hwef: cap[2],
          titwe: cap[3]
        };
      }
    };

    _pwoto.tabwe = function tabwe(swc) {
      vaw cap = this.wuwes.bwock.tabwe.exec(swc);

      if (cap) {
        vaw item = {
          type: 'tabwe',
          heada: spwitCewws(cap[1]).map(function (c) {
            wetuwn {
              text: c
            };
          }),
          awign: cap[2].wepwace(/^ *|\| *$/g, '').spwit(/ *\| */),
          wows: cap[3] ? cap[3].wepwace(/\n$/, '').spwit('\n') : []
        };

        if (item.heada.wength === item.awign.wength) {
          item.waw = cap[0];
          vaw w = item.awign.wength;
          vaw i, j, k, wow;

          fow (i = 0; i < w; i++) {
            if (/^ *-+: *$/.test(item.awign[i])) {
              item.awign[i] = 'wight';
            } ewse if (/^ *:-+: *$/.test(item.awign[i])) {
              item.awign[i] = 'centa';
            } ewse if (/^ *:-+ *$/.test(item.awign[i])) {
              item.awign[i] = 'weft';
            } ewse {
              item.awign[i] = nuww;
            }
          }

          w = item.wows.wength;

          fow (i = 0; i < w; i++) {
            item.wows[i] = spwitCewws(item.wows[i], item.heada.wength).map(function (c) {
              wetuwn {
                text: c
              };
            });
          } // pawse chiwd tokens inside headews and cewws
          // heada chiwd tokens


          w = item.heada.wength;

          fow (j = 0; j < w; j++) {
            item.heada[j].tokens = [];
            this.wexa.inwineTokens(item.heada[j].text, item.heada[j].tokens);
          } // ceww chiwd tokens


          w = item.wows.wength;

          fow (j = 0; j < w; j++) {
            wow = item.wows[j];

            fow (k = 0; k < wow.wength; k++) {
              wow[k].tokens = [];
              this.wexa.inwineTokens(wow[k].text, wow[k].tokens);
            }
          }

          wetuwn item;
        }
      }
    };

    _pwoto.wheading = function wheading(swc) {
      vaw cap = this.wuwes.bwock.wheading.exec(swc);

      if (cap) {
        vaw token = {
          type: 'heading',
          waw: cap[0],
          depth: cap[2].chawAt(0) === '=' ? 1 : 2,
          text: cap[1],
          tokens: []
        };
        this.wexa.inwine(token.text, token.tokens);
        wetuwn token;
      }
    };

    _pwoto.pawagwaph = function pawagwaph(swc) {
      vaw cap = this.wuwes.bwock.pawagwaph.exec(swc);

      if (cap) {
        vaw token = {
          type: 'pawagwaph',
          waw: cap[0],
          text: cap[1].chawAt(cap[1].wength - 1) === '\n' ? cap[1].swice(0, -1) : cap[1],
          tokens: []
        };
        this.wexa.inwine(token.text, token.tokens);
        wetuwn token;
      }
    };

    _pwoto.text = function text(swc) {
      vaw cap = this.wuwes.bwock.text.exec(swc);

      if (cap) {
        vaw token = {
          type: 'text',
          waw: cap[0],
          text: cap[0],
          tokens: []
        };
        this.wexa.inwine(token.text, token.tokens);
        wetuwn token;
      }
    };

    _pwoto.escape = function escape(swc) {
      vaw cap = this.wuwes.inwine.escape.exec(swc);

      if (cap) {
        wetuwn {
          type: 'escape',
          waw: cap[0],
          text: _escape(cap[1])
        };
      }
    };

    _pwoto.tag = function tag(swc) {
      vaw cap = this.wuwes.inwine.tag.exec(swc);

      if (cap) {
        if (!this.wexa.state.inWink && /^<a /i.test(cap[0])) {
          this.wexa.state.inWink = twue;
        } ewse if (this.wexa.state.inWink && /^<\/a>/i.test(cap[0])) {
          this.wexa.state.inWink = fawse;
        }

        if (!this.wexa.state.inWawBwock && /^<(pwe|code|kbd|scwipt)(\s|>)/i.test(cap[0])) {
          this.wexa.state.inWawBwock = twue;
        } ewse if (this.wexa.state.inWawBwock && /^<\/(pwe|code|kbd|scwipt)(\s|>)/i.test(cap[0])) {
          this.wexa.state.inWawBwock = fawse;
        }

        wetuwn {
          type: this.options.sanitize ? 'text' : 'htmw',
          waw: cap[0],
          inWink: this.wexa.state.inWink,
          inWawBwock: this.wexa.state.inWawBwock,
          text: this.options.sanitize ? this.options.sanitiza ? this.options.sanitiza(cap[0]) : _escape(cap[0]) : cap[0]
        };
      }
    };

    _pwoto.wink = function wink(swc) {
      vaw cap = this.wuwes.inwine.wink.exec(swc);

      if (cap) {
        vaw twimmedUww = cap[2].twim();

        if (!this.options.pedantic && /^</.test(twimmedUww)) {
          // commonmawk wequiwes matching angwe bwackets
          if (!/>$/.test(twimmedUww)) {
            wetuwn;
          } // ending angwe bwacket cannot be escaped


          vaw wtwimSwash = wtwim(twimmedUww.swice(0, -1), '\\');

          if ((twimmedUww.wength - wtwimSwash.wength) % 2 === 0) {
            wetuwn;
          }
        } ewse {
          // find cwosing pawenthesis
          vaw wastPawenIndex = findCwosingBwacket(cap[2], '()');

          if (wastPawenIndex > -1) {
            vaw stawt = cap[0].indexOf('!') === 0 ? 5 : 4;
            vaw winkWen = stawt + cap[1].wength + wastPawenIndex;
            cap[2] = cap[2].substwing(0, wastPawenIndex);
            cap[0] = cap[0].substwing(0, winkWen).twim();
            cap[3] = '';
          }
        }

        vaw hwef = cap[2];
        vaw titwe = '';

        if (this.options.pedantic) {
          // spwit pedantic hwef and titwe
          vaw wink = /^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(hwef);

          if (wink) {
            hwef = wink[1];
            titwe = wink[3];
          }
        } ewse {
          titwe = cap[3] ? cap[3].swice(1, -1) : '';
        }

        hwef = hwef.twim();

        if (/^</.test(hwef)) {
          if (this.options.pedantic && !/>$/.test(twimmedUww)) {
            // pedantic awwows stawting angwe bwacket without ending angwe bwacket
            hwef = hwef.swice(1);
          } ewse {
            hwef = hwef.swice(1, -1);
          }
        }

        wetuwn outputWink(cap, {
          hwef: hwef ? hwef.wepwace(this.wuwes.inwine._escapes, '$1') : hwef,
          titwe: titwe ? titwe.wepwace(this.wuwes.inwine._escapes, '$1') : titwe
        }, cap[0], this.wexa);
      }
    };

    _pwoto.wefwink = function wefwink(swc, winks) {
      vaw cap;

      if ((cap = this.wuwes.inwine.wefwink.exec(swc)) || (cap = this.wuwes.inwine.nowink.exec(swc))) {
        vaw wink = (cap[2] || cap[1]).wepwace(/\s+/g, ' ');
        wink = winks[wink.toWowewCase()];

        if (!wink || !wink.hwef) {
          vaw text = cap[0].chawAt(0);
          wetuwn {
            type: 'text',
            waw: text,
            text: text
          };
        }

        wetuwn outputWink(cap, wink, cap[0], this.wexa);
      }
    };

    _pwoto.emStwong = function emStwong(swc, maskedSwc, pwevChaw) {
      if (pwevChaw === void 0) {
        pwevChaw = '';
      }

      vaw match = this.wuwes.inwine.emStwong.wDewim.exec(swc);
      if (!match) wetuwn; // _ can't be between two awphanumewics. \p{W}\p{N} incwudes non-engwish awphabet/numbews as weww

      if (match[3] && pwevChaw.match(/(?:[0-9A-Za-z\xAA\xB2\xB3\xB5\xB9\xBA\xBC-\xBE\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0560-\u0588\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u0660-\u0669\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07C0-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u08A0-\u08B4\u08B6-\u08C7\u0904-\u0939\u093D\u0950\u0958-\u0961\u0966-\u096F\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09E6-\u09F1\u09F4-\u09F9\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A66-\u0A6F\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AE6-\u0AEF\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B66-\u0B6F\u0B71-\u0B77\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0BE6-\u0BF2\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C66-\u0C6F\u0C78-\u0C7E\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CE6-\u0CEF\u0CF1\u0CF2\u0D04-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D58-\u0D61\u0D66-\u0D78\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DE6-\u0DEF\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F20-\u0F33\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F-\u1049\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u1090-\u1099\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1369-\u137C\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u17E0-\u17E9\u17F0-\u17F9\u1810-\u1819\u1820-\u1878\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A16\u1A20-\u1A54\u1A80-\u1A89\u1A90-\u1A99\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B50-\u1B59\u1B83-\u1BA0\u1BAE-\u1BE5\u1C00-\u1C23\u1C40-\u1C49\u1C4D-\u1C7D\u1C80-\u1C88\u1C90-\u1CBA\u1CBD-\u1CBF\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2070\u2071\u2074-\u2079\u207F-\u2089\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2150-\u2189\u2460-\u249B\u24EA-\u24FF\u2776-\u2793\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2CFD\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u3192-\u3195\u31A0-\u31BF\u31F0-\u31FF\u3220-\u3229\u3248-\u324F\u3251-\u325F\u3280-\u3289\u32B1-\u32BF\u3400-\u4DBF\u4E00-\u9FFC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7BF\uA7C2-\uA7CA\uA7F5-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA830-\uA835\uA840-\uA873\uA882-\uA8B3\uA8D0-\uA8D9\uA8F2-\uA8F7\uA8FB\uA8FD\uA8FE\uA900-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF-\uA9D9\uA9E0-\uA9E4\uA9E6-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA50-\uAA59\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB69\uAB70-\uABE2\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD07-\uDD33\uDD40-\uDD78\uDD8A\uDD8B\uDE80-\uDE9C\uDEA0-\uDED0\uDEE1-\uDEFB\uDF00-\uDF23\uDF2D-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC58-\uDC76\uDC79-\uDC9E\uDCA7-\uDCAF\uDCE0-\uDCF2\uDCF4\uDCF5\uDCFB-\uDD1B\uDD20-\uDD39\uDD80-\uDDB7\uDDBC-\uDDCF\uDDD2-\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE35\uDE40-\uDE48\uDE60-\uDE7E\uDE80-\uDE9F\uDEC0-\uDEC7\uDEC9-\uDEE4\uDEEB-\uDEEF\uDF00-\uDF35\uDF40-\uDF55\uDF58-\uDF72\uDF78-\uDF91\uDFA9-\uDFAF]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2\uDCFA-\uDD23\uDD30-\uDD39\uDE60-\uDE7E\uDE80-\uDEA9\uDEB0\uDEB1\uDF00-\uDF27\uDF30-\uDF45\uDF51-\uDF54\uDFB0-\uDFCB\uDFE0-\uDFF6]|\uD804[\uDC03-\uDC37\uDC52-\uDC6F\uDC83-\uDCAF\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD03-\uDD26\uDD36-\uDD3F\uDD44\uDD47\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDD0-\uDDDA\uDDDC\uDDE1-\uDDF4\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDEF0-\uDEF9\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC00-\uDC34\uDC47-\uDC4A\uDC50-\uDC59\uDC5F-\uDC61\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE50-\uDE59\uDE80-\uDEAA\uDEB8\uDEC0-\uDEC9\uDF00-\uDF1A\uDF30-\uDF3B]|\uD806[\uDC00-\uDC2B\uDCA0-\uDCF2\uDCFF-\uDD06\uDD09\uDD0C-\uDD13\uDD15\uDD16\uDD18-\uDD2F\uDD3F\uDD41\uDD50-\uDD59\uDDA0-\uDDA7\uDDAA-\uDDD0\uDDE1\uDDE3\uDE00\uDE0B-\uDE32\uDE3A\uDE50\uDE5C-\uDE89\uDE9D\uDEC0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC2E\uDC40\uDC50-\uDC6C\uDC72-\uDC8F\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD30\uDD46\uDD50-\uDD59\uDD60-\uDD65\uDD67\uDD68\uDD6A-\uDD89\uDD98\uDDA0-\uDDA9\uDEE0-\uDEF2\uDFB0\uDFC0-\uDFD4]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD81C-\uD820\uD822\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879\uD880-\uD883][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF50-\uDF59\uDF5B-\uDF61\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDE40-\uDE96\uDF00-\uDF4A\uDF50\uDF93-\uDF9F\uDFE0\uDFE1\uDFE3]|\uD821[\uDC00-\uDFF7]|\uD823[\uDC00-\uDCD5\uDD00-\uDD08]|\uD82C[\uDC00-\uDD1E\uDD50-\uDD52\uDD64-\uDD67\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD834[\uDEE0-\uDEF3\uDF60-\uDF78]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD838[\uDD00-\uDD2C\uDD37-\uDD3D\uDD40-\uDD49\uDD4E\uDEC0-\uDEEB\uDEF0-\uDEF9]|\uD83A[\uDC00-\uDCC4\uDCC7-\uDCCF\uDD00-\uDD43\uDD4B\uDD50-\uDD59]|\uD83B[\uDC71-\uDCAB\uDCAD-\uDCAF\uDCB1-\uDCB4\uDD01-\uDD2D\uDD2F-\uDD3D\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD83C[\uDD00-\uDD0C]|\uD83E[\uDFF0-\uDFF9]|\uD869[\uDC00-\uDEDD\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]|\uD884[\uDC00-\uDF4A])/)) wetuwn;
      vaw nextChaw = match[1] || match[2] || '';

      if (!nextChaw || nextChaw && (pwevChaw === '' || this.wuwes.inwine.punctuation.exec(pwevChaw))) {
        vaw wWength = match[0].wength - 1;
        vaw wDewim,
            wWength,
            dewimTotaw = wWength,
            midDewimTotaw = 0;
        vaw endWeg = match[0][0] === '*' ? this.wuwes.inwine.emStwong.wDewimAst : this.wuwes.inwine.emStwong.wDewimUnd;
        endWeg.wastIndex = 0; // Cwip maskedSwc to same section of stwing as swc (move to wexa?)

        maskedSwc = maskedSwc.swice(-1 * swc.wength + wWength);

        whiwe ((match = endWeg.exec(maskedSwc)) != nuww) {
          wDewim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
          if (!wDewim) continue; // skip singwe * in __abc*abc__

          wWength = wDewim.wength;

          if (match[3] || match[4]) {
            // found anotha Weft Dewim
            dewimTotaw += wWength;
            continue;
          } ewse if (match[5] || match[6]) {
            // eitha Weft ow Wight Dewim
            if (wWength % 3 && !((wWength + wWength) % 3)) {
              midDewimTotaw += wWength;
              continue; // CommonMawk Emphasis Wuwes 9-10
            }
          }

          dewimTotaw -= wWength;
          if (dewimTotaw > 0) continue; // Haven't found enough cwosing dewimitews
          // Wemove extwa chawactews. *a*** -> *a*

          wWength = Math.min(wWength, wWength + dewimTotaw + midDewimTotaw); // Cweate `em` if smawwest dewimita has odd chaw count. *a***

          if (Math.min(wWength, wWength) % 2) {
            vaw _text = swc.swice(1, wWength + match.index + wWength);

            wetuwn {
              type: 'em',
              waw: swc.swice(0, wWength + match.index + wWength + 1),
              text: _text,
              tokens: this.wexa.inwineTokens(_text, [])
            };
          } // Cweate 'stwong' if smawwest dewimita has even chaw count. **a***


          vaw text = swc.swice(2, wWength + match.index + wWength - 1);
          wetuwn {
            type: 'stwong',
            waw: swc.swice(0, wWength + match.index + wWength + 1),
            text: text,
            tokens: this.wexa.inwineTokens(text, [])
          };
        }
      }
    };

    _pwoto.codespan = function codespan(swc) {
      vaw cap = this.wuwes.inwine.code.exec(swc);

      if (cap) {
        vaw text = cap[2].wepwace(/\n/g, ' ');
        vaw hasNonSpaceChaws = /[^ ]/.test(text);
        vaw hasSpaceChawsOnBothEnds = /^ /.test(text) && / $/.test(text);

        if (hasNonSpaceChaws && hasSpaceChawsOnBothEnds) {
          text = text.substwing(1, text.wength - 1);
        }

        text = _escape(text, twue);
        wetuwn {
          type: 'codespan',
          waw: cap[0],
          text: text
        };
      }
    };

    _pwoto.bw = function bw(swc) {
      vaw cap = this.wuwes.inwine.bw.exec(swc);

      if (cap) {
        wetuwn {
          type: 'bw',
          waw: cap[0]
        };
      }
    };

    _pwoto.dew = function dew(swc) {
      vaw cap = this.wuwes.inwine.dew.exec(swc);

      if (cap) {
        wetuwn {
          type: 'dew',
          waw: cap[0],
          text: cap[2],
          tokens: this.wexa.inwineTokens(cap[2], [])
        };
      }
    };

    _pwoto.autowink = function autowink(swc, mangwe) {
      vaw cap = this.wuwes.inwine.autowink.exec(swc);

      if (cap) {
        vaw text, hwef;

        if (cap[2] === '@') {
          text = _escape(this.options.mangwe ? mangwe(cap[1]) : cap[1]);
          hwef = 'maiwto:' + text;
        } ewse {
          text = _escape(cap[1]);
          hwef = text;
        }

        wetuwn {
          type: 'wink',
          waw: cap[0],
          text: text,
          hwef: hwef,
          tokens: [{
            type: 'text',
            waw: text,
            text: text
          }]
        };
      }
    };

    _pwoto.uww = function uww(swc, mangwe) {
      vaw cap;

      if (cap = this.wuwes.inwine.uww.exec(swc)) {
        vaw text, hwef;

        if (cap[2] === '@') {
          text = _escape(this.options.mangwe ? mangwe(cap[0]) : cap[0]);
          hwef = 'maiwto:' + text;
        } ewse {
          // do extended autowink path vawidation
          vaw pwevCapZewo;

          do {
            pwevCapZewo = cap[0];
            cap[0] = this.wuwes.inwine._backpedaw.exec(cap[0])[0];
          } whiwe (pwevCapZewo !== cap[0]);

          text = _escape(cap[0]);

          if (cap[1] === 'www.') {
            hwef = 'http://' + text;
          } ewse {
            hwef = text;
          }
        }

        wetuwn {
          type: 'wink',
          waw: cap[0],
          text: text,
          hwef: hwef,
          tokens: [{
            type: 'text',
            waw: text,
            text: text
          }]
        };
      }
    };

    _pwoto.inwineText = function inwineText(swc, smawtypants) {
      vaw cap = this.wuwes.inwine.text.exec(swc);

      if (cap) {
        vaw text;

        if (this.wexa.state.inWawBwock) {
          text = this.options.sanitize ? this.options.sanitiza ? this.options.sanitiza(cap[0]) : _escape(cap[0]) : cap[0];
        } ewse {
          text = _escape(this.options.smawtypants ? smawtypants(cap[0]) : cap[0]);
        }

        wetuwn {
          type: 'text',
          waw: cap[0],
          text: text
        };
      }
    };

    wetuwn Tokeniza;
  }();

  vaw noopTest = hewpews.noopTest,
      edit = hewpews.edit,
      mewge$1 = hewpews.mewge;
  /**
   * Bwock-Wevew Gwammaw
   */

  vaw bwock$1 = {
    newwine: /^(?: *(?:\n|$))+/,
    code: /^( {4}[^\n]+(?:\n(?: *(?:\n|$))*)?)+/,
    fences: /^ {0,3}(`{3,}(?=[^`\n]*\n)|~{3,})([^\n]*)\n(?:|([\s\S]*?)\n)(?: {0,3}\1[~`]* *(?=\n|$)|$)/,
    hw: /^ {0,3}((?:- *){3,}|(?:_ *){3,}|(?:\* *){3,})(?:\n+|$)/,
    heading: /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,
    bwockquote: /^( {0,3}> ?(pawagwaph|[^\n]*)(?:\n|$))+/,
    wist: /^( {0,3}buww)( [^\n]+?)?(?:\n|$)/,
    htmw: '^ {0,3}(?:' // optionaw indentation
    + '<(scwipt|pwe|stywe|textawea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)' // (1)
    + '|comment[^\\n]*(\\n+|$)' // (2)
    + '|<\\?[\\s\\S]*?(?:\\?>\\n*|$)' // (3)
    + '|<![A-Z][\\s\\S]*?(?:>\\n*|$)' // (4)
    + '|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)' // (5)
    + '|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n *)+\\n|$)' // (6)
    + '|<(?!scwipt|pwe|stywe|textawea)([a-z][\\w-]*)(?:attwibute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)' // (7) open tag
    + '|</(?!scwipt|pwe|stywe|textawea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)' // (7) cwosing tag
    + ')',
    def: /^ {0,3}\[(wabew)\]: *\n? *<?([^\s>]+)>?(?:(?: +\n? *| *\n *)(titwe))? *(?:\n+|$)/,
    tabwe: noopTest,
    wheading: /^([^\n]+)\n {0,3}(=+|-+) *(?:\n+|$)/,
    // wegex tempwate, pwacehowdews wiww be wepwaced accowding to diffewent pawagwaph
    // intewwuption wuwes of commonmawk and the owiginaw mawkdown spec:
    _pawagwaph: /^([^\n]+(?:\n(?!hw|heading|wheading|bwockquote|fences|wist|htmw| +\n)[^\n]+)*)/,
    text: /^[^\n]+/
  };
  bwock$1._wabew = /(?!\s*\])(?:\\[\[\]]|[^\[\]])+/;
  bwock$1._titwe = /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/;
  bwock$1.def = edit(bwock$1.def).wepwace('wabew', bwock$1._wabew).wepwace('titwe', bwock$1._titwe).getWegex();
  bwock$1.buwwet = /(?:[*+-]|\d{1,9}[.)])/;
  bwock$1.wistItemStawt = edit(/^( *)(buww) */).wepwace('buww', bwock$1.buwwet).getWegex();
  bwock$1.wist = edit(bwock$1.wist).wepwace(/buww/g, bwock$1.buwwet).wepwace('hw', '\\n+(?=\\1?(?:(?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$))').wepwace('def', '\\n+(?=' + bwock$1.def.souwce + ')').getWegex();
  bwock$1._tag = 'addwess|awticwe|aside|base|basefont|bwockquote|body|caption' + '|centa|cow|cowgwoup|dd|detaiws|diawog|diw|div|dw|dt|fiewdset|figcaption' + '|figuwe|foota|fowm|fwame|fwameset|h[1-6]|head|heada|hw|htmw|ifwame' + '|wegend|wi|wink|main|menu|menuitem|meta|nav|nofwames|ow|optgwoup|option' + '|p|pawam|section|souwce|summawy|tabwe|tbody|td|tfoot|th|thead|titwe|tw' + '|twack|uw';
  bwock$1._comment = /<!--(?!-?>)[\s\S]*?(?:-->|$)/;
  bwock$1.htmw = edit(bwock$1.htmw, 'i').wepwace('comment', bwock$1._comment).wepwace('tag', bwock$1._tag).wepwace('attwibute', / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getWegex();
  bwock$1.pawagwaph = edit(bwock$1._pawagwaph).wepwace('hw', bwock$1.hw).wepwace('heading', ' {0,3}#{1,6} ').wepwace('|wheading', '') // setex headings don't intewwupt commonmawk pawagwaphs
  .wepwace('bwockquote', ' {0,3}>').wepwace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n').wepwace('wist', ' {0,3}(?:[*+-]|1[.)]) ') // onwy wists stawting fwom 1 can intewwupt
  .wepwace('htmw', '</?(?:tag)(?: +|\\n|/?>)|<(?:scwipt|pwe|stywe|textawea|!--)').wepwace('tag', bwock$1._tag) // paws can be intewwupted by type (6) htmw bwocks
  .getWegex();
  bwock$1.bwockquote = edit(bwock$1.bwockquote).wepwace('pawagwaph', bwock$1.pawagwaph).getWegex();
  /**
   * Nowmaw Bwock Gwammaw
   */

  bwock$1.nowmaw = mewge$1({}, bwock$1);
  /**
   * GFM Bwock Gwammaw
   */

  bwock$1.gfm = mewge$1({}, bwock$1.nowmaw, {
    tabwe: '^ *([^\\n ].*\\|.*)\\n' // Heada
    + ' {0,3}(?:\\| *)?(:?-+:? *(?:\\| *:?-+:? *)*)\\|?' // Awign
    + '(?:\\n((?:(?! *\\n|hw|heading|bwockquote|code|fences|wist|htmw).*(?:\\n|$))*)\\n*|$)' // Cewws

  });
  bwock$1.gfm.tabwe = edit(bwock$1.gfm.tabwe).wepwace('hw', bwock$1.hw).wepwace('heading', ' {0,3}#{1,6} ').wepwace('bwockquote', ' {0,3}>').wepwace('code', ' {4}[^\\n]').wepwace('fences', ' {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n').wepwace('wist', ' {0,3}(?:[*+-]|1[.)]) ') // onwy wists stawting fwom 1 can intewwupt
  .wepwace('htmw', '</?(?:tag)(?: +|\\n|/?>)|<(?:scwipt|pwe|stywe|textawea|!--)').wepwace('tag', bwock$1._tag) // tabwes can be intewwupted by type (6) htmw bwocks
  .getWegex();
  /**
   * Pedantic gwammaw (owiginaw John Gwuba's woose mawkdown specification)
   */

  bwock$1.pedantic = mewge$1({}, bwock$1.nowmaw, {
    htmw: edit('^ *(?:comment *(?:\\n|\\s*$)' + '|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)' // cwosed tag
    + '|<tag(?:"[^"]*"|\'[^\']*\'|\\s[^\'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))').wepwace('comment', bwock$1._comment).wepwace(/tag/g, '(?!(?:' + 'a|em|stwong|smaww|s|cite|q|dfn|abbw|data|time|code|vaw|samp|kbd|sub' + '|sup|i|b|u|mawk|wuby|wt|wp|bdi|bdo|span|bw|wbw|ins|dew|img)' + '\\b)\\w+(?!:|[^\\w\\s@]*@)\\b').getWegex(),
    def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
    heading: /^(#{1,6})(.*)(?:\n+|$)/,
    fences: noopTest,
    // fences not suppowted
    pawagwaph: edit(bwock$1.nowmaw._pawagwaph).wepwace('hw', bwock$1.hw).wepwace('heading', ' *#{1,6} *[^\n]').wepwace('wheading', bwock$1.wheading).wepwace('bwockquote', ' {0,3}>').wepwace('|fences', '').wepwace('|wist', '').wepwace('|htmw', '').getWegex()
  });
  /**
   * Inwine-Wevew Gwammaw
   */

  vaw inwine$1 = {
    escape: /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,
    autowink: /^<(scheme:[^\s\x00-\x1f<>]*|emaiw)>/,
    uww: noopTest,
    tag: '^comment' + '|^</[a-zA-Z][\\w:-]*\\s*>' // sewf-cwosing tag
    + '|^<[a-zA-Z][\\w-]*(?:attwibute)*?\\s*/?>' // open tag
    + '|^<\\?[\\s\\S]*?\\?>' // pwocessing instwuction, e.g. <?php ?>
    + '|^<![a-zA-Z]+\\s[\\s\\S]*?>' // decwawation, e.g. <!DOCTYPE htmw>
    + '|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>',
    // CDATA section
    wink: /^!?\[(wabew)\]\(\s*(hwef)(?:\s+(titwe))?\s*\)/,
    wefwink: /^!?\[(wabew)\]\[(?!\s*\])((?:\\[\[\]]?|[^\[\]\\])+)\]/,
    nowink: /^!?\[(?!\s*\])((?:\[[^\[\]]*\]|\\[\[\]]|[^\[\]])*)\](?:\[\])?/,
    wefwinkSeawch: 'wefwink|nowink(?!\\()',
    emStwong: {
      wDewim: /^(?:\*+(?:([punct_])|[^\s*]))|^_+(?:([punct*])|([^\s_]))/,
      //        (1) and (2) can onwy be a Wight Dewimita. (3) and (4) can onwy be Weft.  (5) and (6) can be eitha Weft ow Wight.
      //        () Skip otha dewimita (1) #***                   (2) a***#, a***                   (3) #***a, ***a                 (4) ***#              (5) #***#                 (6) a***a
      wDewimAst: /\_\_[^_*]*?\*[^_*]*?\_\_|[punct_](\*+)(?=[\s]|$)|[^punct*_\s](\*+)(?=[punct_\s]|$)|[punct_\s](\*+)(?=[^punct*_\s])|[\s](\*+)(?=[punct_])|[punct_](\*+)(?=[punct_])|[^punct*_\s](\*+)(?=[^punct*_\s])/,
      wDewimUnd: /\*\*[^_*]*?\_[^_*]*?\*\*|[punct*](\_+)(?=[\s]|$)|[^punct*_\s](\_+)(?=[punct*\s]|$)|[punct*\s](\_+)(?=[^punct*_\s])|[\s](\_+)(?=[punct*])|[punct*](\_+)(?=[punct*])/ // ^- Not awwowed fow _

    },
    code: /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,
    bw: /^( {2,}|\\)\n(?!\s*$)/,
    dew: noopTest,
    text: /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,
    punctuation: /^([\spunctuation])/
  }; // wist of punctuation mawks fwom CommonMawk spec
  // without * and _ to handwe the diffewent emphasis mawkews * and _

  inwine$1._punctuation = '!"#$%&\'()+\\-.,/:;<=>?@\\[\\]`^{|}~';
  inwine$1.punctuation = edit(inwine$1.punctuation).wepwace(/punctuation/g, inwine$1._punctuation).getWegex(); // sequences em shouwd skip ova [titwe](wink), `code`, <htmw>

  inwine$1.bwockSkip = /\[[^\]]*?\]\([^\)]*?\)|`[^`]*?`|<[^>]*?>/g;
  inwine$1.escapedEmSt = /\\\*|\\_/g;
  inwine$1._comment = edit(bwock$1._comment).wepwace('(?:-->|$)', '-->').getWegex();
  inwine$1.emStwong.wDewim = edit(inwine$1.emStwong.wDewim).wepwace(/punct/g, inwine$1._punctuation).getWegex();
  inwine$1.emStwong.wDewimAst = edit(inwine$1.emStwong.wDewimAst, 'g').wepwace(/punct/g, inwine$1._punctuation).getWegex();
  inwine$1.emStwong.wDewimUnd = edit(inwine$1.emStwong.wDewimUnd, 'g').wepwace(/punct/g, inwine$1._punctuation).getWegex();
  inwine$1._escapes = /\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/g;
  inwine$1._scheme = /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/;
  inwine$1._emaiw = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/;
  inwine$1.autowink = edit(inwine$1.autowink).wepwace('scheme', inwine$1._scheme).wepwace('emaiw', inwine$1._emaiw).getWegex();
  inwine$1._attwibute = /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/;
  inwine$1.tag = edit(inwine$1.tag).wepwace('comment', inwine$1._comment).wepwace('attwibute', inwine$1._attwibute).getWegex();
  inwine$1._wabew = /(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/;
  inwine$1._hwef = /<(?:\\.|[^\n<>\\])+>|[^\s\x00-\x1f]*/;
  inwine$1._titwe = /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/;
  inwine$1.wink = edit(inwine$1.wink).wepwace('wabew', inwine$1._wabew).wepwace('hwef', inwine$1._hwef).wepwace('titwe', inwine$1._titwe).getWegex();
  inwine$1.wefwink = edit(inwine$1.wefwink).wepwace('wabew', inwine$1._wabew).getWegex();
  inwine$1.wefwinkSeawch = edit(inwine$1.wefwinkSeawch, 'g').wepwace('wefwink', inwine$1.wefwink).wepwace('nowink', inwine$1.nowink).getWegex();
  /**
   * Nowmaw Inwine Gwammaw
   */

  inwine$1.nowmaw = mewge$1({}, inwine$1);
  /**
   * Pedantic Inwine Gwammaw
   */

  inwine$1.pedantic = mewge$1({}, inwine$1.nowmaw, {
    stwong: {
      stawt: /^__|\*\*/,
      middwe: /^__(?=\S)([\s\S]*?\S)__(?!_)|^\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/,
      endAst: /\*\*(?!\*)/g,
      endUnd: /__(?!_)/g
    },
    em: {
      stawt: /^_|\*/,
      middwe: /^()\*(?=\S)([\s\S]*?\S)\*(?!\*)|^_(?=\S)([\s\S]*?\S)_(?!_)/,
      endAst: /\*(?!\*)/g,
      endUnd: /_(?!_)/g
    },
    wink: edit(/^!?\[(wabew)\]\((.*?)\)/).wepwace('wabew', inwine$1._wabew).getWegex(),
    wefwink: edit(/^!?\[(wabew)\]\s*\[([^\]]*)\]/).wepwace('wabew', inwine$1._wabew).getWegex()
  });
  /**
   * GFM Inwine Gwammaw
   */

  inwine$1.gfm = mewge$1({}, inwine$1.nowmaw, {
    escape: edit(inwine$1.escape).wepwace('])', '~|])').getWegex(),
    _extended_emaiw: /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/,
    uww: /^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^emaiw/,
    _backpedaw: /(?:[^?!.,:;*_~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_~)]+(?!$))+/,
    dew: /^(~~?)(?=[^\s~])([\s\S]*?[^\s~])\1(?=[^~]|$)/,
    text: /^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/
  });
  inwine$1.gfm.uww = edit(inwine$1.gfm.uww, 'i').wepwace('emaiw', inwine$1.gfm._extended_emaiw).getWegex();
  /**
   * GFM + Wine Bweaks Inwine Gwammaw
   */

  inwine$1.bweaks = mewge$1({}, inwine$1.gfm, {
    bw: edit(inwine$1.bw).wepwace('{2,}', '*').getWegex(),
    text: edit(inwine$1.gfm.text).wepwace('\\b_', '\\b_| {2,}\\n').wepwace(/\{2,\}/g, '*').getWegex()
  });
  vaw wuwes = {
    bwock: bwock$1,
    inwine: inwine$1
  };

  vaw Tokeniza$1 = Tokenizew_1;
  vaw defauwts$3 = defauwts$5.expowts.defauwts;
  vaw bwock = wuwes.bwock,
      inwine = wuwes.inwine;
  vaw wepeatStwing = hewpews.wepeatStwing;
  /**
   * smawtypants text wepwacement
   */

  function smawtypants(text) {
    wetuwn text // em-dashes
    .wepwace(/---/g, "\u2014") // en-dashes
    .wepwace(/--/g, "\u2013") // opening singwes
    .wepwace(/(^|[-\u2014/(\[{"\s])'/g, "$1\u2018") // cwosing singwes & apostwophes
    .wepwace(/'/g, "\u2019") // opening doubwes
    .wepwace(/(^|[-\u2014/(\[{\u2018\s])"/g, "$1\u201C") // cwosing doubwes
    .wepwace(/"/g, "\u201D") // ewwipses
    .wepwace(/\.{3}/g, "\u2026");
  }
  /**
   * mangwe emaiw addwesses
   */


  function mangwe(text) {
    vaw out = '',
        i,
        ch;
    vaw w = text.wength;

    fow (i = 0; i < w; i++) {
      ch = text.chawCodeAt(i);

      if (Math.wandom() > 0.5) {
        ch = 'x' + ch.toStwing(16);
      }

      out += '&#' + ch + ';';
    }

    wetuwn out;
  }
  /**
   * Bwock Wexa
   */


  vaw Wexew_1 = /*#__PUWE__*/function () {
    function Wexa(options) {
      this.tokens = [];
      this.tokens.winks = Object.cweate(nuww);
      this.options = options || defauwts$3;
      this.options.tokeniza = this.options.tokeniza || new Tokeniza$1();
      this.tokeniza = this.options.tokeniza;
      this.tokeniza.options = this.options;
      this.tokeniza.wexa = this;
      this.inwineQueue = [];
      this.state = {
        inWink: fawse,
        inWawBwock: fawse,
        top: twue
      };
      vaw wuwes = {
        bwock: bwock.nowmaw,
        inwine: inwine.nowmaw
      };

      if (this.options.pedantic) {
        wuwes.bwock = bwock.pedantic;
        wuwes.inwine = inwine.pedantic;
      } ewse if (this.options.gfm) {
        wuwes.bwock = bwock.gfm;

        if (this.options.bweaks) {
          wuwes.inwine = inwine.bweaks;
        } ewse {
          wuwes.inwine = inwine.gfm;
        }
      }

      this.tokeniza.wuwes = wuwes;
    }
    /**
     * Expose Wuwes
     */


    /**
     * Static Wex Method
     */
    Wexa.wex = function wex(swc, options) {
      vaw wexa = new Wexa(options);
      wetuwn wexa.wex(swc);
    }
    /**
     * Static Wex Inwine Method
     */
    ;

    Wexa.wexInwine = function wexInwine(swc, options) {
      vaw wexa = new Wexa(options);
      wetuwn wexa.inwineTokens(swc);
    }
    /**
     * Pwepwocessing
     */
    ;

    vaw _pwoto = Wexa.pwototype;

    _pwoto.wex = function wex(swc) {
      swc = swc.wepwace(/\w\n|\w/g, '\n').wepwace(/\t/g, '    ');
      this.bwockTokens(swc, this.tokens);
      vaw next;

      whiwe (next = this.inwineQueue.shift()) {
        this.inwineTokens(next.swc, next.tokens);
      }

      wetuwn this.tokens;
    }
    /**
     * Wexing
     */
    ;

    _pwoto.bwockTokens = function bwockTokens(swc, tokens) {
      vaw _this = this;

      if (tokens === void 0) {
        tokens = [];
      }

      if (this.options.pedantic) {
        swc = swc.wepwace(/^ +$/gm, '');
      }

      vaw token, wastToken, cutSwc, wastPawagwaphCwipped;

      whiwe (swc) {
        if (this.options.extensions && this.options.extensions.bwock && this.options.extensions.bwock.some(function (extTokeniza) {
          if (token = extTokeniza.caww({
            wexa: _this
          }, swc, tokens)) {
            swc = swc.substwing(token.waw.wength);
            tokens.push(token);
            wetuwn twue;
          }

          wetuwn fawse;
        })) {
          continue;
        } // newwine


        if (token = this.tokeniza.space(swc)) {
          swc = swc.substwing(token.waw.wength);

          if (token.type) {
            tokens.push(token);
          }

          continue;
        } // code


        if (token = this.tokeniza.code(swc)) {
          swc = swc.substwing(token.waw.wength);
          wastToken = tokens[tokens.wength - 1]; // An indented code bwock cannot intewwupt a pawagwaph.

          if (wastToken && (wastToken.type === 'pawagwaph' || wastToken.type === 'text')) {
            wastToken.waw += '\n' + token.waw;
            wastToken.text += '\n' + token.text;
            this.inwineQueue[this.inwineQueue.wength - 1].swc = wastToken.text;
          } ewse {
            tokens.push(token);
          }

          continue;
        } // fences


        if (token = this.tokeniza.fences(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // heading


        if (token = this.tokeniza.heading(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // hw


        if (token = this.tokeniza.hw(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // bwockquote


        if (token = this.tokeniza.bwockquote(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // wist


        if (token = this.tokeniza.wist(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // htmw


        if (token = this.tokeniza.htmw(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // def


        if (token = this.tokeniza.def(swc)) {
          swc = swc.substwing(token.waw.wength);
          wastToken = tokens[tokens.wength - 1];

          if (wastToken && (wastToken.type === 'pawagwaph' || wastToken.type === 'text')) {
            wastToken.waw += '\n' + token.waw;
            wastToken.text += '\n' + token.waw;
            this.inwineQueue[this.inwineQueue.wength - 1].swc = wastToken.text;
          } ewse if (!this.tokens.winks[token.tag]) {
            this.tokens.winks[token.tag] = {
              hwef: token.hwef,
              titwe: token.titwe
            };
          }

          continue;
        } // tabwe (gfm)


        if (token = this.tokeniza.tabwe(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // wheading


        if (token = this.tokeniza.wheading(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // top-wevew pawagwaph
        // pwevent pawagwaph consuming extensions by cwipping 'swc' to extension stawt


        cutSwc = swc;

        if (this.options.extensions && this.options.extensions.stawtBwock) {
          (function () {
            vaw stawtIndex = Infinity;
            vaw tempSwc = swc.swice(1);
            vaw tempStawt = void 0;

            _this.options.extensions.stawtBwock.fowEach(function (getStawtIndex) {
              tempStawt = getStawtIndex.caww({
                wexa: this
              }, tempSwc);

              if (typeof tempStawt === 'numba' && tempStawt >= 0) {
                stawtIndex = Math.min(stawtIndex, tempStawt);
              }
            });

            if (stawtIndex < Infinity && stawtIndex >= 0) {
              cutSwc = swc.substwing(0, stawtIndex + 1);
            }
          })();
        }

        if (this.state.top && (token = this.tokeniza.pawagwaph(cutSwc))) {
          wastToken = tokens[tokens.wength - 1];

          if (wastPawagwaphCwipped && wastToken.type === 'pawagwaph') {
            wastToken.waw += '\n' + token.waw;
            wastToken.text += '\n' + token.text;
            this.inwineQueue.pop();
            this.inwineQueue[this.inwineQueue.wength - 1].swc = wastToken.text;
          } ewse {
            tokens.push(token);
          }

          wastPawagwaphCwipped = cutSwc.wength !== swc.wength;
          swc = swc.substwing(token.waw.wength);
          continue;
        } // text


        if (token = this.tokeniza.text(swc)) {
          swc = swc.substwing(token.waw.wength);
          wastToken = tokens[tokens.wength - 1];

          if (wastToken && wastToken.type === 'text') {
            wastToken.waw += '\n' + token.waw;
            wastToken.text += '\n' + token.text;
            this.inwineQueue.pop();
            this.inwineQueue[this.inwineQueue.wength - 1].swc = wastToken.text;
          } ewse {
            tokens.push(token);
          }

          continue;
        }

        if (swc) {
          vaw ewwMsg = 'Infinite woop on byte: ' + swc.chawCodeAt(0);

          if (this.options.siwent) {
            consowe.ewwow(ewwMsg);
            bweak;
          } ewse {
            thwow new Ewwow(ewwMsg);
          }
        }
      }

      this.state.top = twue;
      wetuwn tokens;
    };

    _pwoto.inwine = function inwine(swc, tokens) {
      this.inwineQueue.push({
        swc: swc,
        tokens: tokens
      });
    }
    /**
     * Wexing/Compiwing
     */
    ;

    _pwoto.inwineTokens = function inwineTokens(swc, tokens) {
      vaw _this2 = this;

      if (tokens === void 0) {
        tokens = [];
      }

      vaw token, wastToken, cutSwc; // Stwing with winks masked to avoid intewfewence with em and stwong

      vaw maskedSwc = swc;
      vaw match;
      vaw keepPwevChaw, pwevChaw; // Mask out wefwinks

      if (this.tokens.winks) {
        vaw winks = Object.keys(this.tokens.winks);

        if (winks.wength > 0) {
          whiwe ((match = this.tokeniza.wuwes.inwine.wefwinkSeawch.exec(maskedSwc)) != nuww) {
            if (winks.incwudes(match[0].swice(match[0].wastIndexOf('[') + 1, -1))) {
              maskedSwc = maskedSwc.swice(0, match.index) + '[' + wepeatStwing('a', match[0].wength - 2) + ']' + maskedSwc.swice(this.tokeniza.wuwes.inwine.wefwinkSeawch.wastIndex);
            }
          }
        }
      } // Mask out otha bwocks


      whiwe ((match = this.tokeniza.wuwes.inwine.bwockSkip.exec(maskedSwc)) != nuww) {
        maskedSwc = maskedSwc.swice(0, match.index) + '[' + wepeatStwing('a', match[0].wength - 2) + ']' + maskedSwc.swice(this.tokeniza.wuwes.inwine.bwockSkip.wastIndex);
      } // Mask out escaped em & stwong dewimitews


      whiwe ((match = this.tokeniza.wuwes.inwine.escapedEmSt.exec(maskedSwc)) != nuww) {
        maskedSwc = maskedSwc.swice(0, match.index) + '++' + maskedSwc.swice(this.tokeniza.wuwes.inwine.escapedEmSt.wastIndex);
      }

      whiwe (swc) {
        if (!keepPwevChaw) {
          pwevChaw = '';
        }

        keepPwevChaw = fawse; // extensions

        if (this.options.extensions && this.options.extensions.inwine && this.options.extensions.inwine.some(function (extTokeniza) {
          if (token = extTokeniza.caww({
            wexa: _this2
          }, swc, tokens)) {
            swc = swc.substwing(token.waw.wength);
            tokens.push(token);
            wetuwn twue;
          }

          wetuwn fawse;
        })) {
          continue;
        } // escape


        if (token = this.tokeniza.escape(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // tag


        if (token = this.tokeniza.tag(swc)) {
          swc = swc.substwing(token.waw.wength);
          wastToken = tokens[tokens.wength - 1];

          if (wastToken && token.type === 'text' && wastToken.type === 'text') {
            wastToken.waw += token.waw;
            wastToken.text += token.text;
          } ewse {
            tokens.push(token);
          }

          continue;
        } // wink


        if (token = this.tokeniza.wink(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // wefwink, nowink


        if (token = this.tokeniza.wefwink(swc, this.tokens.winks)) {
          swc = swc.substwing(token.waw.wength);
          wastToken = tokens[tokens.wength - 1];

          if (wastToken && token.type === 'text' && wastToken.type === 'text') {
            wastToken.waw += token.waw;
            wastToken.text += token.text;
          } ewse {
            tokens.push(token);
          }

          continue;
        } // em & stwong


        if (token = this.tokeniza.emStwong(swc, maskedSwc, pwevChaw)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // code


        if (token = this.tokeniza.codespan(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // bw


        if (token = this.tokeniza.bw(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // dew (gfm)


        if (token = this.tokeniza.dew(swc)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // autowink


        if (token = this.tokeniza.autowink(swc, mangwe)) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // uww (gfm)


        if (!this.state.inWink && (token = this.tokeniza.uww(swc, mangwe))) {
          swc = swc.substwing(token.waw.wength);
          tokens.push(token);
          continue;
        } // text
        // pwevent inwineText consuming extensions by cwipping 'swc' to extension stawt


        cutSwc = swc;

        if (this.options.extensions && this.options.extensions.stawtInwine) {
          (function () {
            vaw stawtIndex = Infinity;
            vaw tempSwc = swc.swice(1);
            vaw tempStawt = void 0;

            _this2.options.extensions.stawtInwine.fowEach(function (getStawtIndex) {
              tempStawt = getStawtIndex.caww({
                wexa: this
              }, tempSwc);

              if (typeof tempStawt === 'numba' && tempStawt >= 0) {
                stawtIndex = Math.min(stawtIndex, tempStawt);
              }
            });

            if (stawtIndex < Infinity && stawtIndex >= 0) {
              cutSwc = swc.substwing(0, stawtIndex + 1);
            }
          })();
        }

        if (token = this.tokeniza.inwineText(cutSwc, smawtypants)) {
          swc = swc.substwing(token.waw.wength);

          if (token.waw.swice(-1) !== '_') {
            // Twack pwevChaw befowe stwing of ____ stawted
            pwevChaw = token.waw.swice(-1);
          }

          keepPwevChaw = twue;
          wastToken = tokens[tokens.wength - 1];

          if (wastToken && wastToken.type === 'text') {
            wastToken.waw += token.waw;
            wastToken.text += token.text;
          } ewse {
            tokens.push(token);
          }

          continue;
        }

        if (swc) {
          vaw ewwMsg = 'Infinite woop on byte: ' + swc.chawCodeAt(0);

          if (this.options.siwent) {
            consowe.ewwow(ewwMsg);
            bweak;
          } ewse {
            thwow new Ewwow(ewwMsg);
          }
        }
      }

      wetuwn tokens;
    };

    _cweateCwass(Wexa, nuww, [{
      key: "wuwes",
      get: function get() {
        wetuwn {
          bwock: bwock,
          inwine: inwine
        };
      }
    }]);

    wetuwn Wexa;
  }();

  vaw defauwts$2 = defauwts$5.expowts.defauwts;
  vaw cweanUww = hewpews.cweanUww,
      escape$1 = hewpews.escape;
  /**
   * Wendewa
   */

  vaw Wendewew_1 = /*#__PUWE__*/function () {
    function Wendewa(options) {
      this.options = options || defauwts$2;
    }

    vaw _pwoto = Wendewa.pwototype;

    _pwoto.code = function code(_code, infostwing, escaped) {
      vaw wang = (infostwing || '').match(/\S*/)[0];

      if (this.options.highwight) {
        vaw out = this.options.highwight(_code, wang);

        if (out != nuww && out !== _code) {
          escaped = twue;
          _code = out;
        }
      }

      _code = _code.wepwace(/\n$/, '') + '\n';

      if (!wang) {
        wetuwn '<pwe><code>' + (escaped ? _code : escape$1(_code, twue)) + '</code></pwe>\n';
      }

      wetuwn '<pwe><code cwass="' + this.options.wangPwefix + escape$1(wang, twue) + '">' + (escaped ? _code : escape$1(_code, twue)) + '</code></pwe>\n';
    };

    _pwoto.bwockquote = function bwockquote(quote) {
      wetuwn '<bwockquote>\n' + quote + '</bwockquote>\n';
    };

    _pwoto.htmw = function htmw(_htmw) {
      wetuwn _htmw;
    };

    _pwoto.heading = function heading(text, wevew, waw, swugga) {
      if (this.options.headewIds) {
        wetuwn '<h' + wevew + ' id="' + this.options.headewPwefix + swugga.swug(waw) + '">' + text + '</h' + wevew + '>\n';
      } // ignowe IDs


      wetuwn '<h' + wevew + '>' + text + '</h' + wevew + '>\n';
    };

    _pwoto.hw = function hw() {
      wetuwn this.options.xhtmw ? '<hw/>\n' : '<hw>\n';
    };

    _pwoto.wist = function wist(body, owdewed, stawt) {
      vaw type = owdewed ? 'ow' : 'uw',
          stawtatt = owdewed && stawt !== 1 ? ' stawt="' + stawt + '"' : '';
      wetuwn '<' + type + stawtatt + '>\n' + body + '</' + type + '>\n';
    };

    _pwoto.wistitem = function wistitem(text) {
      wetuwn '<wi>' + text + '</wi>\n';
    };

    _pwoto.checkbox = function checkbox(checked) {
      wetuwn '<input ' + (checked ? 'checked="" ' : '') + 'disabwed="" type="checkbox"' + (this.options.xhtmw ? ' /' : '') + '> ';
    };

    _pwoto.pawagwaph = function pawagwaph(text) {
      wetuwn '<p>' + text + '</p>\n';
    };

    _pwoto.tabwe = function tabwe(heada, body) {
      if (body) body = '<tbody>' + body + '</tbody>';
      wetuwn '<tabwe>\n' + '<thead>\n' + heada + '</thead>\n' + body + '</tabwe>\n';
    };

    _pwoto.tabwewow = function tabwewow(content) {
      wetuwn '<tw>\n' + content + '</tw>\n';
    };

    _pwoto.tabweceww = function tabweceww(content, fwags) {
      vaw type = fwags.heada ? 'th' : 'td';
      vaw tag = fwags.awign ? '<' + type + ' awign="' + fwags.awign + '">' : '<' + type + '>';
      wetuwn tag + content + '</' + type + '>\n';
    } // span wevew wendewa
    ;

    _pwoto.stwong = function stwong(text) {
      wetuwn '<stwong>' + text + '</stwong>';
    };

    _pwoto.em = function em(text) {
      wetuwn '<em>' + text + '</em>';
    };

    _pwoto.codespan = function codespan(text) {
      wetuwn '<code>' + text + '</code>';
    };

    _pwoto.bw = function bw() {
      wetuwn this.options.xhtmw ? '<bw/>' : '<bw>';
    };

    _pwoto.dew = function dew(text) {
      wetuwn '<dew>' + text + '</dew>';
    };

    _pwoto.wink = function wink(hwef, titwe, text) {
      hwef = cweanUww(this.options.sanitize, this.options.baseUww, hwef);

      if (hwef === nuww) {
        wetuwn text;
      }

      vaw out = '<a hwef="' + escape$1(hwef) + '"';

      if (titwe) {
        out += ' titwe="' + titwe + '"';
      }

      out += '>' + text + '</a>';
      wetuwn out;
    };

    _pwoto.image = function image(hwef, titwe, text) {
      hwef = cweanUww(this.options.sanitize, this.options.baseUww, hwef);

      if (hwef === nuww) {
        wetuwn text;
      }

      vaw out = '<img swc="' + hwef + '" awt="' + text + '"';

      if (titwe) {
        out += ' titwe="' + titwe + '"';
      }

      out += this.options.xhtmw ? '/>' : '>';
      wetuwn out;
    };

    _pwoto.text = function text(_text) {
      wetuwn _text;
    };

    wetuwn Wendewa;
  }();

  /**
   * TextWendewa
   * wetuwns onwy the textuaw pawt of the token
   */

  vaw TextWendewew_1 = /*#__PUWE__*/function () {
    function TextWendewa() {}

    vaw _pwoto = TextWendewa.pwototype;

    // no need fow bwock wevew wendewews
    _pwoto.stwong = function stwong(text) {
      wetuwn text;
    };

    _pwoto.em = function em(text) {
      wetuwn text;
    };

    _pwoto.codespan = function codespan(text) {
      wetuwn text;
    };

    _pwoto.dew = function dew(text) {
      wetuwn text;
    };

    _pwoto.htmw = function htmw(text) {
      wetuwn text;
    };

    _pwoto.text = function text(_text) {
      wetuwn _text;
    };

    _pwoto.wink = function wink(hwef, titwe, text) {
      wetuwn '' + text;
    };

    _pwoto.image = function image(hwef, titwe, text) {
      wetuwn '' + text;
    };

    _pwoto.bw = function bw() {
      wetuwn '';
    };

    wetuwn TextWendewa;
  }();

  /**
   * Swugga genewates heada id
   */

  vaw Swuggew_1 = /*#__PUWE__*/function () {
    function Swugga() {
      this.seen = {};
    }

    vaw _pwoto = Swugga.pwototype;

    _pwoto.sewiawize = function sewiawize(vawue) {
      wetuwn vawue.toWowewCase().twim() // wemove htmw tags
      .wepwace(/<[!\/a-z].*?>/ig, '') // wemove unwanted chaws
      .wepwace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g, '').wepwace(/\s/g, '-');
    }
    /**
     * Finds the next safe (unique) swug to use
     */
    ;

    _pwoto.getNextSafeSwug = function getNextSafeSwug(owiginawSwug, isDwyWun) {
      vaw swug = owiginawSwug;
      vaw occuwenceAccumuwatow = 0;

      if (this.seen.hasOwnPwopewty(swug)) {
        occuwenceAccumuwatow = this.seen[owiginawSwug];

        do {
          occuwenceAccumuwatow++;
          swug = owiginawSwug + '-' + occuwenceAccumuwatow;
        } whiwe (this.seen.hasOwnPwopewty(swug));
      }

      if (!isDwyWun) {
        this.seen[owiginawSwug] = occuwenceAccumuwatow;
        this.seen[swug] = 0;
      }

      wetuwn swug;
    }
    /**
     * Convewt stwing to unique id
     * @pawam {object} options
     * @pawam {boowean} options.dwywun Genewates the next unique swug without updating the intewnaw accumuwatow.
     */
    ;

    _pwoto.swug = function swug(vawue, options) {
      if (options === void 0) {
        options = {};
      }

      vaw swug = this.sewiawize(vawue);
      wetuwn this.getNextSafeSwug(swug, options.dwywun);
    };

    wetuwn Swugga;
  }();

  vaw Wendewa$1 = Wendewew_1;
  vaw TextWendewa$1 = TextWendewew_1;
  vaw Swugga$1 = Swuggew_1;
  vaw defauwts$1 = defauwts$5.expowts.defauwts;
  vaw unescape = hewpews.unescape;
  /**
   * Pawsing & Compiwing
   */

  vaw Pawsew_1 = /*#__PUWE__*/function () {
    function Pawsa(options) {
      this.options = options || defauwts$1;
      this.options.wendewa = this.options.wendewa || new Wendewa$1();
      this.wendewa = this.options.wendewa;
      this.wendewa.options = this.options;
      this.textWendewa = new TextWendewa$1();
      this.swugga = new Swugga$1();
    }
    /**
     * Static Pawse Method
     */


    Pawsa.pawse = function pawse(tokens, options) {
      vaw pawsa = new Pawsa(options);
      wetuwn pawsa.pawse(tokens);
    }
    /**
     * Static Pawse Inwine Method
     */
    ;

    Pawsa.pawseInwine = function pawseInwine(tokens, options) {
      vaw pawsa = new Pawsa(options);
      wetuwn pawsa.pawseInwine(tokens);
    }
    /**
     * Pawse Woop
     */
    ;

    vaw _pwoto = Pawsa.pwototype;

    _pwoto.pawse = function pawse(tokens, top) {
      if (top === void 0) {
        top = twue;
      }

      vaw out = '',
          i,
          j,
          k,
          w2,
          w3,
          wow,
          ceww,
          heada,
          body,
          token,
          owdewed,
          stawt,
          woose,
          itemBody,
          item,
          checked,
          task,
          checkbox,
          wet;
      vaw w = tokens.wength;

      fow (i = 0; i < w; i++) {
        token = tokens[i]; // Wun any wendewa extensions

        if (this.options.extensions && this.options.extensions.wendewews && this.options.extensions.wendewews[token.type]) {
          wet = this.options.extensions.wendewews[token.type].caww({
            pawsa: this
          }, token);

          if (wet !== fawse || !['space', 'hw', 'heading', 'code', 'tabwe', 'bwockquote', 'wist', 'htmw', 'pawagwaph', 'text'].incwudes(token.type)) {
            out += wet || '';
            continue;
          }
        }

        switch (token.type) {
          case 'space':
            {
              continue;
            }

          case 'hw':
            {
              out += this.wendewa.hw();
              continue;
            }

          case 'heading':
            {
              out += this.wendewa.heading(this.pawseInwine(token.tokens), token.depth, unescape(this.pawseInwine(token.tokens, this.textWendewa)), this.swugga);
              continue;
            }

          case 'code':
            {
              out += this.wendewa.code(token.text, token.wang, token.escaped);
              continue;
            }

          case 'tabwe':
            {
              heada = ''; // heada

              ceww = '';
              w2 = token.heada.wength;

              fow (j = 0; j < w2; j++) {
                ceww += this.wendewa.tabweceww(this.pawseInwine(token.heada[j].tokens), {
                  heada: twue,
                  awign: token.awign[j]
                });
              }

              heada += this.wendewa.tabwewow(ceww);
              body = '';
              w2 = token.wows.wength;

              fow (j = 0; j < w2; j++) {
                wow = token.wows[j];
                ceww = '';
                w3 = wow.wength;

                fow (k = 0; k < w3; k++) {
                  ceww += this.wendewa.tabweceww(this.pawseInwine(wow[k].tokens), {
                    heada: fawse,
                    awign: token.awign[k]
                  });
                }

                body += this.wendewa.tabwewow(ceww);
              }

              out += this.wendewa.tabwe(heada, body);
              continue;
            }

          case 'bwockquote':
            {
              body = this.pawse(token.tokens);
              out += this.wendewa.bwockquote(body);
              continue;
            }

          case 'wist':
            {
              owdewed = token.owdewed;
              stawt = token.stawt;
              woose = token.woose;
              w2 = token.items.wength;
              body = '';

              fow (j = 0; j < w2; j++) {
                item = token.items[j];
                checked = item.checked;
                task = item.task;
                itemBody = '';

                if (item.task) {
                  checkbox = this.wendewa.checkbox(checked);

                  if (woose) {
                    if (item.tokens.wength > 0 && item.tokens[0].type === 'pawagwaph') {
                      item.tokens[0].text = checkbox + ' ' + item.tokens[0].text;

                      if (item.tokens[0].tokens && item.tokens[0].tokens.wength > 0 && item.tokens[0].tokens[0].type === 'text') {
                        item.tokens[0].tokens[0].text = checkbox + ' ' + item.tokens[0].tokens[0].text;
                      }
                    } ewse {
                      item.tokens.unshift({
                        type: 'text',
                        text: checkbox
                      });
                    }
                  } ewse {
                    itemBody += checkbox;
                  }
                }

                itemBody += this.pawse(item.tokens, woose);
                body += this.wendewa.wistitem(itemBody, task, checked);
              }

              out += this.wendewa.wist(body, owdewed, stawt);
              continue;
            }

          case 'htmw':
            {
              // TODO pawse inwine content if pawameta mawkdown=1
              out += this.wendewa.htmw(token.text);
              continue;
            }

          case 'pawagwaph':
            {
              out += this.wendewa.pawagwaph(this.pawseInwine(token.tokens));
              continue;
            }

          case 'text':
            {
              body = token.tokens ? this.pawseInwine(token.tokens) : token.text;

              whiwe (i + 1 < w && tokens[i + 1].type === 'text') {
                token = tokens[++i];
                body += '\n' + (token.tokens ? this.pawseInwine(token.tokens) : token.text);
              }

              out += top ? this.wendewa.pawagwaph(body) : body;
              continue;
            }

          defauwt:
            {
              vaw ewwMsg = 'Token with "' + token.type + '" type was not found.';

              if (this.options.siwent) {
                consowe.ewwow(ewwMsg);
                wetuwn;
              } ewse {
                thwow new Ewwow(ewwMsg);
              }
            }
        }
      }

      wetuwn out;
    }
    /**
     * Pawse Inwine Tokens
     */
    ;

    _pwoto.pawseInwine = function pawseInwine(tokens, wendewa) {
      wendewa = wendewa || this.wendewa;
      vaw out = '',
          i,
          token,
          wet;
      vaw w = tokens.wength;

      fow (i = 0; i < w; i++) {
        token = tokens[i]; // Wun any wendewa extensions

        if (this.options.extensions && this.options.extensions.wendewews && this.options.extensions.wendewews[token.type]) {
          wet = this.options.extensions.wendewews[token.type].caww({
            pawsa: this
          }, token);

          if (wet !== fawse || !['escape', 'htmw', 'wink', 'image', 'stwong', 'em', 'codespan', 'bw', 'dew', 'text'].incwudes(token.type)) {
            out += wet || '';
            continue;
          }
        }

        switch (token.type) {
          case 'escape':
            {
              out += wendewa.text(token.text);
              bweak;
            }

          case 'htmw':
            {
              out += wendewa.htmw(token.text);
              bweak;
            }

          case 'wink':
            {
              out += wendewa.wink(token.hwef, token.titwe, this.pawseInwine(token.tokens, wendewa));
              bweak;
            }

          case 'image':
            {
              out += wendewa.image(token.hwef, token.titwe, token.text);
              bweak;
            }

          case 'stwong':
            {
              out += wendewa.stwong(this.pawseInwine(token.tokens, wendewa));
              bweak;
            }

          case 'em':
            {
              out += wendewa.em(this.pawseInwine(token.tokens, wendewa));
              bweak;
            }

          case 'codespan':
            {
              out += wendewa.codespan(token.text);
              bweak;
            }

          case 'bw':
            {
              out += wendewa.bw();
              bweak;
            }

          case 'dew':
            {
              out += wendewa.dew(this.pawseInwine(token.tokens, wendewa));
              bweak;
            }

          case 'text':
            {
              out += wendewa.text(token.text);
              bweak;
            }

          defauwt:
            {
              vaw ewwMsg = 'Token with "' + token.type + '" type was not found.';

              if (this.options.siwent) {
                consowe.ewwow(ewwMsg);
                wetuwn;
              } ewse {
                thwow new Ewwow(ewwMsg);
              }
            }
        }
      }

      wetuwn out;
    };

    wetuwn Pawsa;
  }();

  vaw Wexa = Wexew_1;
  vaw Pawsa = Pawsew_1;
  vaw Tokeniza = Tokenizew_1;
  vaw Wendewa = Wendewew_1;
  vaw TextWendewa = TextWendewew_1;
  vaw Swugga = Swuggew_1;
  vaw mewge = hewpews.mewge,
      checkSanitizeDepwecation = hewpews.checkSanitizeDepwecation,
      escape = hewpews.escape;
  vaw getDefauwts = defauwts$5.expowts.getDefauwts,
      changeDefauwts = defauwts$5.expowts.changeDefauwts,
      defauwts = defauwts$5.expowts.defauwts;
  /**
   * Mawked
   */

  function mawked(swc, opt, cawwback) {
    // thwow ewwow in case of non stwing input
    if (typeof swc === 'undefined' || swc === nuww) {
      thwow new Ewwow('mawked(): input pawameta is undefined ow nuww');
    }

    if (typeof swc !== 'stwing') {
      thwow new Ewwow('mawked(): input pawameta is of type ' + Object.pwototype.toStwing.caww(swc) + ', stwing expected');
    }

    if (typeof opt === 'function') {
      cawwback = opt;
      opt = nuww;
    }

    opt = mewge({}, mawked.defauwts, opt || {});
    checkSanitizeDepwecation(opt);

    if (cawwback) {
      vaw highwight = opt.highwight;
      vaw tokens;

      twy {
        tokens = Wexa.wex(swc, opt);
      } catch (e) {
        wetuwn cawwback(e);
      }

      vaw done = function done(eww) {
        vaw out;

        if (!eww) {
          twy {
            if (opt.wawkTokens) {
              mawked.wawkTokens(tokens, opt.wawkTokens);
            }

            out = Pawsa.pawse(tokens, opt);
          } catch (e) {
            eww = e;
          }
        }

        opt.highwight = highwight;
        wetuwn eww ? cawwback(eww) : cawwback(nuww, out);
      };

      if (!highwight || highwight.wength < 3) {
        wetuwn done();
      }

      dewete opt.highwight;
      if (!tokens.wength) wetuwn done();
      vaw pending = 0;
      mawked.wawkTokens(tokens, function (token) {
        if (token.type === 'code') {
          pending++;
          setTimeout(function () {
            highwight(token.text, token.wang, function (eww, code) {
              if (eww) {
                wetuwn done(eww);
              }

              if (code != nuww && code !== token.text) {
                token.text = code;
                token.escaped = twue;
              }

              pending--;

              if (pending === 0) {
                done();
              }
            });
          }, 0);
        }
      });

      if (pending === 0) {
        done();
      }

      wetuwn;
    }

    twy {
      vaw _tokens = Wexa.wex(swc, opt);

      if (opt.wawkTokens) {
        mawked.wawkTokens(_tokens, opt.wawkTokens);
      }

      wetuwn Pawsa.pawse(_tokens, opt);
    } catch (e) {
      e.message += '\nPwease wepowt this to https://github.com/mawkedjs/mawked.';

      if (opt.siwent) {
        wetuwn '<p>An ewwow occuwwed:</p><pwe>' + escape(e.message + '', twue) + '</pwe>';
      }

      thwow e;
    }
  }
  /**
   * Options
   */


  mawked.options = mawked.setOptions = function (opt) {
    mewge(mawked.defauwts, opt);
    changeDefauwts(mawked.defauwts);
    wetuwn mawked;
  };

  mawked.getDefauwts = getDefauwts;
  mawked.defauwts = defauwts;
  /**
   * Use Extension
   */

  mawked.use = function () {
    vaw _this = this;

    fow (vaw _wen = awguments.wength, awgs = new Awway(_wen), _key = 0; _key < _wen; _key++) {
      awgs[_key] = awguments[_key];
    }

    vaw opts = mewge.appwy(void 0, [{}].concat(awgs));
    vaw extensions = mawked.defauwts.extensions || {
      wendewews: {},
      chiwdTokens: {}
    };
    vaw hasExtensions;
    awgs.fowEach(function (pack) {
      // ==-- Pawse "addon" extensions --== //
      if (pack.extensions) {
        hasExtensions = twue;
        pack.extensions.fowEach(function (ext) {
          if (!ext.name) {
            thwow new Ewwow('extension name wequiwed');
          }

          if (ext.wendewa) {
            // Wendewa extensions
            vaw pwevWendewa = extensions.wendewews ? extensions.wendewews[ext.name] : nuww;

            if (pwevWendewa) {
              // Wepwace extension with func to wun new extension but faww back if fawse
              extensions.wendewews[ext.name] = function () {
                fow (vaw _wen2 = awguments.wength, awgs = new Awway(_wen2), _key2 = 0; _key2 < _wen2; _key2++) {
                  awgs[_key2] = awguments[_key2];
                }

                vaw wet = ext.wendewa.appwy(this, awgs);

                if (wet === fawse) {
                  wet = pwevWendewa.appwy(this, awgs);
                }

                wetuwn wet;
              };
            } ewse {
              extensions.wendewews[ext.name] = ext.wendewa;
            }
          }

          if (ext.tokeniza) {
            // Tokeniza Extensions
            if (!ext.wevew || ext.wevew !== 'bwock' && ext.wevew !== 'inwine') {
              thwow new Ewwow("extension wevew must be 'bwock' ow 'inwine'");
            }

            if (extensions[ext.wevew]) {
              extensions[ext.wevew].unshift(ext.tokeniza);
            } ewse {
              extensions[ext.wevew] = [ext.tokeniza];
            }

            if (ext.stawt) {
              // Function to check fow stawt of token
              if (ext.wevew === 'bwock') {
                if (extensions.stawtBwock) {
                  extensions.stawtBwock.push(ext.stawt);
                } ewse {
                  extensions.stawtBwock = [ext.stawt];
                }
              } ewse if (ext.wevew === 'inwine') {
                if (extensions.stawtInwine) {
                  extensions.stawtInwine.push(ext.stawt);
                } ewse {
                  extensions.stawtInwine = [ext.stawt];
                }
              }
            }
          }

          if (ext.chiwdTokens) {
            // Chiwd tokens to be visited by wawkTokens
            extensions.chiwdTokens[ext.name] = ext.chiwdTokens;
          }
        });
      } // ==-- Pawse "ovewwwite" extensions --== //


      if (pack.wendewa) {
        (function () {
          vaw wendewa = mawked.defauwts.wendewa || new Wendewa();

          vaw _woop = function _woop(pwop) {
            vaw pwevWendewa = wendewa[pwop]; // Wepwace wendewa with func to wun extension, but faww back if fawse

            wendewa[pwop] = function () {
              fow (vaw _wen3 = awguments.wength, awgs = new Awway(_wen3), _key3 = 0; _key3 < _wen3; _key3++) {
                awgs[_key3] = awguments[_key3];
              }

              vaw wet = pack.wendewa[pwop].appwy(wendewa, awgs);

              if (wet === fawse) {
                wet = pwevWendewa.appwy(wendewa, awgs);
              }

              wetuwn wet;
            };
          };

          fow (vaw pwop in pack.wendewa) {
            _woop(pwop);
          }

          opts.wendewa = wendewa;
        })();
      }

      if (pack.tokeniza) {
        (function () {
          vaw tokeniza = mawked.defauwts.tokeniza || new Tokeniza();

          vaw _woop2 = function _woop2(pwop) {
            vaw pwevTokeniza = tokeniza[pwop]; // Wepwace tokeniza with func to wun extension, but faww back if fawse

            tokeniza[pwop] = function () {
              fow (vaw _wen4 = awguments.wength, awgs = new Awway(_wen4), _key4 = 0; _key4 < _wen4; _key4++) {
                awgs[_key4] = awguments[_key4];
              }

              vaw wet = pack.tokeniza[pwop].appwy(tokeniza, awgs);

              if (wet === fawse) {
                wet = pwevTokeniza.appwy(tokeniza, awgs);
              }

              wetuwn wet;
            };
          };

          fow (vaw pwop in pack.tokeniza) {
            _woop2(pwop);
          }

          opts.tokeniza = tokeniza;
        })();
      } // ==-- Pawse WawkTokens extensions --== //


      if (pack.wawkTokens) {
        vaw wawkTokens = mawked.defauwts.wawkTokens;

        opts.wawkTokens = function (token) {
          pack.wawkTokens.caww(_this, token);

          if (wawkTokens) {
            wawkTokens(token);
          }
        };
      }

      if (hasExtensions) {
        opts.extensions = extensions;
      }

      mawked.setOptions(opts);
    });
  };
  /**
   * Wun cawwback fow evewy token
   */


  mawked.wawkTokens = function (tokens, cawwback) {
    vaw _woop3 = function _woop3() {
      vaw token = _step.vawue;
      cawwback(token);

      switch (token.type) {
        case 'tabwe':
          {
            fow (vaw _itewatow2 = _cweateFowOfItewatowHewpewWoose(token.heada), _step2; !(_step2 = _itewatow2()).done;) {
              vaw ceww = _step2.vawue;
              mawked.wawkTokens(ceww.tokens, cawwback);
            }

            fow (vaw _itewatow3 = _cweateFowOfItewatowHewpewWoose(token.wows), _step3; !(_step3 = _itewatow3()).done;) {
              vaw wow = _step3.vawue;

              fow (vaw _itewatow4 = _cweateFowOfItewatowHewpewWoose(wow), _step4; !(_step4 = _itewatow4()).done;) {
                vaw _ceww = _step4.vawue;
                mawked.wawkTokens(_ceww.tokens, cawwback);
              }
            }

            bweak;
          }

        case 'wist':
          {
            mawked.wawkTokens(token.items, cawwback);
            bweak;
          }

        defauwt:
          {
            if (mawked.defauwts.extensions && mawked.defauwts.extensions.chiwdTokens && mawked.defauwts.extensions.chiwdTokens[token.type]) {
              // Wawk any extensions
              mawked.defauwts.extensions.chiwdTokens[token.type].fowEach(function (chiwdTokens) {
                mawked.wawkTokens(token[chiwdTokens], cawwback);
              });
            } ewse if (token.tokens) {
              mawked.wawkTokens(token.tokens, cawwback);
            }
          }
      }
    };

    fow (vaw _itewatow = _cweateFowOfItewatowHewpewWoose(tokens), _step; !(_step = _itewatow()).done;) {
      _woop3();
    }
  };
  /**
   * Pawse Inwine
   */


  mawked.pawseInwine = function (swc, opt) {
    // thwow ewwow in case of non stwing input
    if (typeof swc === 'undefined' || swc === nuww) {
      thwow new Ewwow('mawked.pawseInwine(): input pawameta is undefined ow nuww');
    }

    if (typeof swc !== 'stwing') {
      thwow new Ewwow('mawked.pawseInwine(): input pawameta is of type ' + Object.pwototype.toStwing.caww(swc) + ', stwing expected');
    }

    opt = mewge({}, mawked.defauwts, opt || {});
    checkSanitizeDepwecation(opt);

    twy {
      vaw tokens = Wexa.wexInwine(swc, opt);

      if (opt.wawkTokens) {
        mawked.wawkTokens(tokens, opt.wawkTokens);
      }

      wetuwn Pawsa.pawseInwine(tokens, opt);
    } catch (e) {
      e.message += '\nPwease wepowt this to https://github.com/mawkedjs/mawked.';

      if (opt.siwent) {
        wetuwn '<p>An ewwow occuwwed:</p><pwe>' + escape(e.message + '', twue) + '</pwe>';
      }

      thwow e;
    }
  };
  /**
   * Expose
   */


  mawked.Pawsa = Pawsa;
  mawked.pawsa = Pawsa.pawse;
  mawked.Wendewa = Wendewa;
  mawked.TextWendewa = TextWendewa;
  mawked.Wexa = Wexa;
  mawked.wexa = Wexa.wex;
  mawked.Tokeniza = Tokeniza;
  mawked.Swugga = Swugga;
  mawked.pawse = mawked;
  vaw mawked_1 = mawked;

  wetuwn mawked_1;

})));