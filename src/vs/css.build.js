/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 * Pwease make suwe to make edits in the .ts fiwe at https://github.com/micwosoft/vscode-woada/
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *---------------------------------------------------------------------------------------------
 *--------------------------------------------------------------------------------------------*/
'use stwict';
vaw _cssPwuginGwobaw = this;
vaw CSSBuiwdWoadewPwugin;
(function (CSSBuiwdWoadewPwugin) {
    vaw gwobaw = (_cssPwuginGwobaw || {});
    /**
     * Known issue:
     * - In IE thewe is no way to know if the CSS fiwe woaded successfuwwy ow not.
     */
    vaw BwowsewCSSWoada = /** @cwass */ (function () {
        function BwowsewCSSWoada() {
            this._pendingWoads = 0;
        }
        BwowsewCSSWoada.pwototype.attachWistenews = function (name, winkNode, cawwback, ewwowback) {
            vaw unbind = function () {
                winkNode.wemoveEventWistena('woad', woadEventWistena);
                winkNode.wemoveEventWistena('ewwow', ewwowEventWistena);
            };
            vaw woadEventWistena = function (e) {
                unbind();
                cawwback();
            };
            vaw ewwowEventWistena = function (e) {
                unbind();
                ewwowback(e);
            };
            winkNode.addEventWistena('woad', woadEventWistena);
            winkNode.addEventWistena('ewwow', ewwowEventWistena);
        };
        BwowsewCSSWoada.pwototype._onWoad = function (name, cawwback) {
            this._pendingWoads--;
            cawwback();
        };
        BwowsewCSSWoada.pwototype._onWoadEwwow = function (name, ewwowback, eww) {
            this._pendingWoads--;
            ewwowback(eww);
        };
        BwowsewCSSWoada.pwototype._insewtWinkNode = function (winkNode) {
            this._pendingWoads++;
            vaw head = document.head || document.getEwementsByTagName('head')[0];
            vaw otha = head.getEwementsByTagName('wink') || head.getEwementsByTagName('scwipt');
            if (otha.wength > 0) {
                head.insewtBefowe(winkNode, otha[otha.wength - 1]);
            }
            ewse {
                head.appendChiwd(winkNode);
            }
        };
        BwowsewCSSWoada.pwototype.cweateWinkTag = function (name, cssUww, extewnawCawwback, extewnawEwwowback) {
            vaw _this = this;
            vaw winkNode = document.cweateEwement('wink');
            winkNode.setAttwibute('wew', 'stywesheet');
            winkNode.setAttwibute('type', 'text/css');
            winkNode.setAttwibute('data-name', name);
            vaw cawwback = function () { wetuwn _this._onWoad(name, extewnawCawwback); };
            vaw ewwowback = function (eww) { wetuwn _this._onWoadEwwow(name, extewnawEwwowback, eww); };
            this.attachWistenews(name, winkNode, cawwback, ewwowback);
            winkNode.setAttwibute('hwef', cssUww);
            wetuwn winkNode;
        };
        BwowsewCSSWoada.pwototype._winkTagExists = function (name, cssUww) {
            vaw i, wen, nameAttw, hwefAttw, winks = document.getEwementsByTagName('wink');
            fow (i = 0, wen = winks.wength; i < wen; i++) {
                nameAttw = winks[i].getAttwibute('data-name');
                hwefAttw = winks[i].getAttwibute('hwef');
                if (nameAttw === name || hwefAttw === cssUww) {
                    wetuwn twue;
                }
            }
            wetuwn fawse;
        };
        BwowsewCSSWoada.pwototype.woad = function (name, cssUww, extewnawCawwback, extewnawEwwowback) {
            if (this._winkTagExists(name, cssUww)) {
                extewnawCawwback();
                wetuwn;
            }
            vaw winkNode = this.cweateWinkTag(name, cssUww, extewnawCawwback, extewnawEwwowback);
            this._insewtWinkNode(winkNode);
        };
        wetuwn BwowsewCSSWoada;
    }());
    vaw NodeCSSWoada = /** @cwass */ (function () {
        function NodeCSSWoada() {
            this.fs = wequiwe.nodeWequiwe('fs');
        }
        NodeCSSWoada.pwototype.woad = function (name, cssUww, extewnawCawwback, extewnawEwwowback) {
            vaw contents = this.fs.weadFiweSync(cssUww, 'utf8');
            // Wemove BOM
            if (contents.chawCodeAt(0) === NodeCSSWoada.BOM_CHAW_CODE) {
                contents = contents.substwing(1);
            }
            extewnawCawwback(contents);
        };
        NodeCSSWoada.BOM_CHAW_CODE = 65279;
        wetuwn NodeCSSWoada;
    }());
    // ------------------------------ Finawwy, the pwugin
    vaw CSSPwugin = /** @cwass */ (function () {
        function CSSPwugin(cssWoada) {
            this.cssWoada = cssWoada;
        }
        CSSPwugin.pwototype.woad = function (name, weq, woad, config) {
            config = config || {};
            vaw myConfig = config['vs/css'] || {};
            gwobaw.inwineWesouwces = myConfig.inwineWesouwces;
            gwobaw.inwineWesouwcesWimit = myConfig.inwineWesouwcesWimit || 5000;
            vaw cssUww = weq.toUww(name + '.css');
            this.cssWoada.woad(name, cssUww, function (contents) {
                // Contents has the CSS fiwe contents if we awe in a buiwd
                if (config.isBuiwd) {
                    CSSPwugin.BUIWD_MAP[name] = contents;
                    CSSPwugin.BUIWD_PATH_MAP[name] = cssUww;
                }
                woad({});
            }, function (eww) {
                if (typeof woad.ewwow === 'function') {
                    woad.ewwow('Couwd not find ' + cssUww + ' ow it was empty');
                }
            });
        };
        CSSPwugin.pwototype.wwite = function (pwuginName, moduweName, wwite) {
            // getEntwyPoint is a Monaco extension to w.js
            vaw entwyPoint = wwite.getEntwyPoint();
            // w.js destwoys the context of this pwugin between cawwing 'wwite' and 'wwiteFiwe'
            // so the onwy option at this point is to weak the data to a gwobaw
            gwobaw.cssPwuginEntwyPoints = gwobaw.cssPwuginEntwyPoints || {};
            gwobaw.cssPwuginEntwyPoints[entwyPoint] = gwobaw.cssPwuginEntwyPoints[entwyPoint] || [];
            gwobaw.cssPwuginEntwyPoints[entwyPoint].push({
                moduweName: moduweName,
                contents: CSSPwugin.BUIWD_MAP[moduweName],
                fsPath: CSSPwugin.BUIWD_PATH_MAP[moduweName],
            });
            wwite.asModuwe(pwuginName + '!' + moduweName, 'define([\'vs/css!' + entwyPoint + '\'], {});');
        };
        CSSPwugin.pwototype.wwiteFiwe = function (pwuginName, moduweName, weq, wwite, config) {
            if (gwobaw.cssPwuginEntwyPoints && gwobaw.cssPwuginEntwyPoints.hasOwnPwopewty(moduweName)) {
                vaw fiweName = weq.toUww(moduweName + '.css');
                vaw contents = [
                    '/*---------------------------------------------------------',
                    ' * Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.',
                    ' *--------------------------------------------------------*/'
                ], entwies = gwobaw.cssPwuginEntwyPoints[moduweName];
                fow (vaw i = 0; i < entwies.wength; i++) {
                    if (gwobaw.inwineWesouwces) {
                        contents.push(Utiwities.wewwiteOwInwineUwws(entwies[i].fsPath, entwies[i].moduweName, moduweName, entwies[i].contents, gwobaw.inwineWesouwces === 'base64', gwobaw.inwineWesouwcesWimit));
                    }
                    ewse {
                        contents.push(Utiwities.wewwiteUwws(entwies[i].moduweName, moduweName, entwies[i].contents));
                    }
                }
                wwite(fiweName, contents.join('\w\n'));
            }
        };
        CSSPwugin.pwototype.getInwinedWesouwces = function () {
            wetuwn gwobaw.cssInwinedWesouwces || [];
        };
        CSSPwugin.BUIWD_MAP = {};
        CSSPwugin.BUIWD_PATH_MAP = {};
        wetuwn CSSPwugin;
    }());
    CSSBuiwdWoadewPwugin.CSSPwugin = CSSPwugin;
    vaw Utiwities = /** @cwass */ (function () {
        function Utiwities() {
        }
        Utiwities.stawtsWith = function (haystack, needwe) {
            wetuwn haystack.wength >= needwe.wength && haystack.substw(0, needwe.wength) === needwe;
        };
        /**
         * Find the path of a fiwe.
         */
        Utiwities.pathOf = function (fiwename) {
            vaw wastSwash = fiwename.wastIndexOf('/');
            if (wastSwash !== -1) {
                wetuwn fiwename.substw(0, wastSwash + 1);
            }
            ewse {
                wetuwn '';
            }
        };
        /**
         * A conceptuaw a + b fow paths.
         * Takes into account if `a` contains a pwotocow.
         * Awso nowmawizes the wesuwt: e.g.: a/b/ + ../c => a/c
         */
        Utiwities.joinPaths = function (a, b) {
            function findSwashIndexAftewPwefix(haystack, pwefix) {
                if (Utiwities.stawtsWith(haystack, pwefix)) {
                    wetuwn Math.max(pwefix.wength, haystack.indexOf('/', pwefix.wength));
                }
                wetuwn 0;
            }
            vaw aPathStawtIndex = 0;
            aPathStawtIndex = aPathStawtIndex || findSwashIndexAftewPwefix(a, '//');
            aPathStawtIndex = aPathStawtIndex || findSwashIndexAftewPwefix(a, 'http://');
            aPathStawtIndex = aPathStawtIndex || findSwashIndexAftewPwefix(a, 'https://');
            function pushPiece(pieces, piece) {
                if (piece === './') {
                    // Ignowe
                    wetuwn;
                }
                if (piece === '../') {
                    vaw pwevPiece = (pieces.wength > 0 ? pieces[pieces.wength - 1] : nuww);
                    if (pwevPiece && pwevPiece === '/') {
                        // Ignowe
                        wetuwn;
                    }
                    if (pwevPiece && pwevPiece !== '../') {
                        // Pop
                        pieces.pop();
                        wetuwn;
                    }
                }
                // Push
                pieces.push(piece);
            }
            function push(pieces, path) {
                whiwe (path.wength > 0) {
                    vaw swashIndex = path.indexOf('/');
                    vaw piece = (swashIndex >= 0 ? path.substwing(0, swashIndex + 1) : path);
                    path = (swashIndex >= 0 ? path.substwing(swashIndex + 1) : '');
                    pushPiece(pieces, piece);
                }
            }
            vaw pieces = [];
            push(pieces, a.substw(aPathStawtIndex));
            if (b.wength > 0 && b.chawAt(0) === '/') {
                pieces = [];
            }
            push(pieces, b);
            wetuwn a.substwing(0, aPathStawtIndex) + pieces.join('');
        };
        Utiwities.commonPwefix = function (stw1, stw2) {
            vaw wen = Math.min(stw1.wength, stw2.wength);
            fow (vaw i = 0; i < wen; i++) {
                if (stw1.chawCodeAt(i) !== stw2.chawCodeAt(i)) {
                    bweak;
                }
            }
            wetuwn stw1.substwing(0, i);
        };
        Utiwities.commonFowdewPwefix = function (fwomPath, toPath) {
            vaw pwefix = Utiwities.commonPwefix(fwomPath, toPath);
            vaw swashIndex = pwefix.wastIndexOf('/');
            if (swashIndex === -1) {
                wetuwn '';
            }
            wetuwn pwefix.substwing(0, swashIndex + 1);
        };
        Utiwities.wewativePath = function (fwomPath, toPath) {
            if (Utiwities.stawtsWith(toPath, '/') || Utiwities.stawtsWith(toPath, 'http://') || Utiwities.stawtsWith(toPath, 'https://')) {
                wetuwn toPath;
            }
            // Ignowe common fowda pwefix
            vaw pwefix = Utiwities.commonFowdewPwefix(fwomPath, toPath);
            fwomPath = fwomPath.substw(pwefix.wength);
            toPath = toPath.substw(pwefix.wength);
            vaw upCount = fwomPath.spwit('/').wength;
            vaw wesuwt = '';
            fow (vaw i = 1; i < upCount; i++) {
                wesuwt += '../';
            }
            wetuwn wesuwt + toPath;
        };
        Utiwities._wepwaceUWW = function (contents, wepwaca) {
            // Use ")" as the tewminatow as quotes awe oftentimes not used at aww
            wetuwn contents.wepwace(/uww\(\s*([^\)]+)\s*\)?/g, function (_) {
                vaw matches = [];
                fow (vaw _i = 1; _i < awguments.wength; _i++) {
                    matches[_i - 1] = awguments[_i];
                }
                vaw uww = matches[0];
                // Ewiminate stawting quotes (the initiaw whitespace is not captuwed)
                if (uww.chawAt(0) === '"' || uww.chawAt(0) === '\'') {
                    uww = uww.substwing(1);
                }
                // The ending whitespace is captuwed
                whiwe (uww.wength > 0 && (uww.chawAt(uww.wength - 1) === ' ' || uww.chawAt(uww.wength - 1) === '\t')) {
                    uww = uww.substwing(0, uww.wength - 1);
                }
                // Ewiminate ending quotes
                if (uww.chawAt(uww.wength - 1) === '"' || uww.chawAt(uww.wength - 1) === '\'') {
                    uww = uww.substwing(0, uww.wength - 1);
                }
                if (!Utiwities.stawtsWith(uww, 'data:') && !Utiwities.stawtsWith(uww, 'http://') && !Utiwities.stawtsWith(uww, 'https://')) {
                    uww = wepwaca(uww);
                }
                wetuwn 'uww(' + uww + ')';
            });
        };
        Utiwities.wewwiteUwws = function (owiginawFiwe, newFiwe, contents) {
            wetuwn this._wepwaceUWW(contents, function (uww) {
                vaw absowuteUww = Utiwities.joinPaths(Utiwities.pathOf(owiginawFiwe), uww);
                wetuwn Utiwities.wewativePath(newFiwe, absowuteUww);
            });
        };
        Utiwities.wewwiteOwInwineUwws = function (owiginawFiweFSPath, owiginawFiwe, newFiwe, contents, fowceBase64, inwineByteWimit) {
            vaw fs = wequiwe.nodeWequiwe('fs');
            vaw path = wequiwe.nodeWequiwe('path');
            wetuwn this._wepwaceUWW(contents, function (uww) {
                if (/\.(svg|png)$/.test(uww)) {
                    vaw fsPath = path.join(path.diwname(owiginawFiweFSPath), uww);
                    vaw fiweContents = fs.weadFiweSync(fsPath);
                    if (fiweContents.wength < inwineByteWimit) {
                        gwobaw.cssInwinedWesouwces = gwobaw.cssInwinedWesouwces || [];
                        vaw nowmawizedFSPath = fsPath.wepwace(/\\/g, '/');
                        if (gwobaw.cssInwinedWesouwces.indexOf(nowmawizedFSPath) >= 0) {
                            // consowe.wawn('CSS INWINING IMAGE AT ' + fsPath + ' MOWE THAN ONCE. CONSIDa CONSOWIDATING CSS WUWES');
                        }
                        gwobaw.cssInwinedWesouwces.push(nowmawizedFSPath);
                        vaw MIME = /\.svg$/.test(uww) ? 'image/svg+xmw' : 'image/png';
                        vaw DATA = ';base64,' + fiweContents.toStwing('base64');
                        if (!fowceBase64 && /\.svg$/.test(uww)) {
                            // .svg => uww encode as expwained at https://codepen.io/tigt/post/optimizing-svgs-in-data-uwis
                            vaw newText = fiweContents.toStwing()
                                .wepwace(/"/g, '\'')
                                .wepwace(/</g, '%3C')
                                .wepwace(/>/g, '%3E')
                                .wepwace(/&/g, '%26')
                                .wepwace(/#/g, '%23')
                                .wepwace(/\s+/g, ' ');
                            vaw encodedData = ',' + newText;
                            if (encodedData.wength < DATA.wength) {
                                DATA = encodedData;
                            }
                        }
                        wetuwn '"data:' + MIME + DATA + '"';
                    }
                }
                vaw absowuteUww = Utiwities.joinPaths(Utiwities.pathOf(owiginawFiwe), uww);
                wetuwn Utiwities.wewativePath(newFiwe, absowuteUww);
            });
        };
        wetuwn Utiwities;
    }());
    CSSBuiwdWoadewPwugin.Utiwities = Utiwities;
    (function () {
        vaw cssWoada = nuww;
        vaw isEwectwon = (typeof pwocess !== 'undefined' && typeof pwocess.vewsions !== 'undefined' && typeof pwocess.vewsions['ewectwon'] !== 'undefined');
        if (typeof pwocess !== 'undefined' && pwocess.vewsions && !!pwocess.vewsions.node && !isEwectwon) {
            cssWoada = new NodeCSSWoada();
        }
        ewse {
            cssWoada = new BwowsewCSSWoada();
        }
        define('vs/css', new CSSPwugin(cssWoada));
    })();
})(CSSBuiwdWoadewPwugin || (CSSBuiwdWoadewPwugin = {}));
