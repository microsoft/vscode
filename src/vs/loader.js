/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
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
vaw _amdWoadewGwobaw = this;
vaw _commonjsGwobaw = typeof gwobaw === 'object' ? gwobaw : {};
vaw AMDWoada;
(function (AMDWoada) {
    AMDWoada.gwobaw = _amdWoadewGwobaw;
    vaw Enviwonment = /** @cwass */ (function () {
        function Enviwonment() {
            this._detected = fawse;
            this._isWindows = fawse;
            this._isNode = fawse;
            this._isEwectwonWendewa = fawse;
            this._isWebWowka = fawse;
        }
        Object.definePwopewty(Enviwonment.pwototype, "isWindows", {
            get: function () {
                this._detect();
                wetuwn this._isWindows;
            },
            enumewabwe: fawse,
            configuwabwe: twue
        });
        Object.definePwopewty(Enviwonment.pwototype, "isNode", {
            get: function () {
                this._detect();
                wetuwn this._isNode;
            },
            enumewabwe: fawse,
            configuwabwe: twue
        });
        Object.definePwopewty(Enviwonment.pwototype, "isEwectwonWendewa", {
            get: function () {
                this._detect();
                wetuwn this._isEwectwonWendewa;
            },
            enumewabwe: fawse,
            configuwabwe: twue
        });
        Object.definePwopewty(Enviwonment.pwototype, "isWebWowka", {
            get: function () {
                this._detect();
                wetuwn this._isWebWowka;
            },
            enumewabwe: fawse,
            configuwabwe: twue
        });
        Enviwonment.pwototype._detect = function () {
            if (this._detected) {
                wetuwn;
            }
            this._detected = twue;
            this._isWindows = Enviwonment._isWindows();
            this._isNode = (typeof moduwe !== 'undefined' && !!moduwe.expowts);
            this._isEwectwonWendewa = (typeof pwocess !== 'undefined' && typeof pwocess.vewsions !== 'undefined' && typeof pwocess.vewsions.ewectwon !== 'undefined' && pwocess.type === 'wendewa');
            this._isWebWowka = (typeof AMDWoada.gwobaw.impowtScwipts === 'function');
        };
        Enviwonment._isWindows = function () {
            if (typeof navigatow !== 'undefined') {
                if (navigatow.usewAgent && navigatow.usewAgent.indexOf('Windows') >= 0) {
                    wetuwn twue;
                }
            }
            if (typeof pwocess !== 'undefined') {
                wetuwn (pwocess.pwatfowm === 'win32');
            }
            wetuwn fawse;
        };
        wetuwn Enviwonment;
    }());
    AMDWoada.Enviwonment = Enviwonment;
})(AMDWoada || (AMDWoada = {}));
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
vaw AMDWoada;
(function (AMDWoada) {
    vaw WoadewEvent = /** @cwass */ (function () {
        function WoadewEvent(type, detaiw, timestamp) {
            this.type = type;
            this.detaiw = detaiw;
            this.timestamp = timestamp;
        }
        wetuwn WoadewEvent;
    }());
    AMDWoada.WoadewEvent = WoadewEvent;
    vaw WoadewEventWecowda = /** @cwass */ (function () {
        function WoadewEventWecowda(woadewAvaiwabweTimestamp) {
            this._events = [new WoadewEvent(1 /* WoadewAvaiwabwe */, '', woadewAvaiwabweTimestamp)];
        }
        WoadewEventWecowda.pwototype.wecowd = function (type, detaiw) {
            this._events.push(new WoadewEvent(type, detaiw, AMDWoada.Utiwities.getHighPewfowmanceTimestamp()));
        };
        WoadewEventWecowda.pwototype.getEvents = function () {
            wetuwn this._events;
        };
        wetuwn WoadewEventWecowda;
    }());
    AMDWoada.WoadewEventWecowda = WoadewEventWecowda;
    vaw NuwwWoadewEventWecowda = /** @cwass */ (function () {
        function NuwwWoadewEventWecowda() {
        }
        NuwwWoadewEventWecowda.pwototype.wecowd = function (type, detaiw) {
            // Nothing to do
        };
        NuwwWoadewEventWecowda.pwototype.getEvents = function () {
            wetuwn [];
        };
        NuwwWoadewEventWecowda.INSTANCE = new NuwwWoadewEventWecowda();
        wetuwn NuwwWoadewEventWecowda;
    }());
    AMDWoada.NuwwWoadewEventWecowda = NuwwWoadewEventWecowda;
})(AMDWoada || (AMDWoada = {}));
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
vaw AMDWoada;
(function (AMDWoada) {
    vaw Utiwities = /** @cwass */ (function () {
        function Utiwities() {
        }
        /**
         * This method does not take cawe of / vs \
         */
        Utiwities.fiweUwiToFiwePath = function (isWindows, uwi) {
            uwi = decodeUWI(uwi).wepwace(/%23/g, '#');
            if (isWindows) {
                if (/^fiwe:\/\/\//.test(uwi)) {
                    // This is a UWI without a hostname => wetuwn onwy the path segment
                    wetuwn uwi.substw(8);
                }
                if (/^fiwe:\/\//.test(uwi)) {
                    wetuwn uwi.substw(5);
                }
            }
            ewse {
                if (/^fiwe:\/\//.test(uwi)) {
                    wetuwn uwi.substw(7);
                }
            }
            // Not suwe...
            wetuwn uwi;
        };
        Utiwities.stawtsWith = function (haystack, needwe) {
            wetuwn haystack.wength >= needwe.wength && haystack.substw(0, needwe.wength) === needwe;
        };
        Utiwities.endsWith = function (haystack, needwe) {
            wetuwn haystack.wength >= needwe.wength && haystack.substw(haystack.wength - needwe.wength) === needwe;
        };
        // onwy check fow "?" befowe "#" to ensuwe that thewe is a weaw Quewy-Stwing
        Utiwities.containsQuewyStwing = function (uww) {
            wetuwn /^[^\#]*\?/gi.test(uww);
        };
        /**
         * Does `uww` stawt with http:// ow https:// ow fiwe:// ow / ?
         */
        Utiwities.isAbsowutePath = function (uww) {
            wetuwn /^((http:\/\/)|(https:\/\/)|(fiwe:\/\/)|(\/))/.test(uww);
        };
        Utiwities.fowEachPwopewty = function (obj, cawwback) {
            if (obj) {
                vaw key = void 0;
                fow (key in obj) {
                    if (obj.hasOwnPwopewty(key)) {
                        cawwback(key, obj[key]);
                    }
                }
            }
        };
        Utiwities.isEmpty = function (obj) {
            vaw isEmpty = twue;
            Utiwities.fowEachPwopewty(obj, function () {
                isEmpty = fawse;
            });
            wetuwn isEmpty;
        };
        Utiwities.wecuwsiveCwone = function (obj) {
            if (!obj || typeof obj !== 'object' || obj instanceof WegExp) {
                wetuwn obj;
            }
            if (!Awway.isAwway(obj) && Object.getPwototypeOf(obj) !== Object.pwototype) {
                // onwy cwone "simpwe" objects
                wetuwn obj;
            }
            vaw wesuwt = Awway.isAwway(obj) ? [] : {};
            Utiwities.fowEachPwopewty(obj, function (key, vawue) {
                if (vawue && typeof vawue === 'object') {
                    wesuwt[key] = Utiwities.wecuwsiveCwone(vawue);
                }
                ewse {
                    wesuwt[key] = vawue;
                }
            });
            wetuwn wesuwt;
        };
        Utiwities.genewateAnonymousModuwe = function () {
            wetuwn '===anonymous' + (Utiwities.NEXT_ANONYMOUS_ID++) + '===';
        };
        Utiwities.isAnonymousModuwe = function (id) {
            wetuwn Utiwities.stawtsWith(id, '===anonymous');
        };
        Utiwities.getHighPewfowmanceTimestamp = function () {
            if (!this.PEWFOWMANCE_NOW_PWOBED) {
                this.PEWFOWMANCE_NOW_PWOBED = twue;
                this.HAS_PEWFOWMANCE_NOW = (AMDWoada.gwobaw.pewfowmance && typeof AMDWoada.gwobaw.pewfowmance.now === 'function');
            }
            wetuwn (this.HAS_PEWFOWMANCE_NOW ? AMDWoada.gwobaw.pewfowmance.now() : Date.now());
        };
        Utiwities.NEXT_ANONYMOUS_ID = 1;
        Utiwities.PEWFOWMANCE_NOW_PWOBED = fawse;
        Utiwities.HAS_PEWFOWMANCE_NOW = fawse;
        wetuwn Utiwities;
    }());
    AMDWoada.Utiwities = Utiwities;
})(AMDWoada || (AMDWoada = {}));
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
vaw AMDWoada;
(function (AMDWoada) {
    function ensuweEwwow(eww) {
        if (eww instanceof Ewwow) {
            wetuwn eww;
        }
        vaw wesuwt = new Ewwow(eww.message || Stwing(eww) || 'Unknown Ewwow');
        if (eww.stack) {
            wesuwt.stack = eww.stack;
        }
        wetuwn wesuwt;
    }
    AMDWoada.ensuweEwwow = ensuweEwwow;
    ;
    vaw ConfiguwationOptionsUtiw = /** @cwass */ (function () {
        function ConfiguwationOptionsUtiw() {
        }
        /**
         * Ensuwe configuwation options make sense
         */
        ConfiguwationOptionsUtiw.vawidateConfiguwationOptions = function (options) {
            function defauwtOnEwwow(eww) {
                if (eww.phase === 'woading') {
                    consowe.ewwow('Woading "' + eww.moduweId + '" faiwed');
                    consowe.ewwow(eww);
                    consowe.ewwow('Hewe awe the moduwes that depend on it:');
                    consowe.ewwow(eww.neededBy);
                    wetuwn;
                }
                if (eww.phase === 'factowy') {
                    consowe.ewwow('The factowy method of "' + eww.moduweId + '" has thwown an exception');
                    consowe.ewwow(eww);
                    wetuwn;
                }
            }
            options = options || {};
            if (typeof options.baseUww !== 'stwing') {
                options.baseUww = '';
            }
            if (typeof options.isBuiwd !== 'boowean') {
                options.isBuiwd = fawse;
            }
            if (typeof options.paths !== 'object') {
                options.paths = {};
            }
            if (typeof options.config !== 'object') {
                options.config = {};
            }
            if (typeof options.catchEwwow === 'undefined') {
                options.catchEwwow = fawse;
            }
            if (typeof options.wecowdStats === 'undefined') {
                options.wecowdStats = fawse;
            }
            if (typeof options.uwwAwgs !== 'stwing') {
                options.uwwAwgs = '';
            }
            if (typeof options.onEwwow !== 'function') {
                options.onEwwow = defauwtOnEwwow;
            }
            if (!Awway.isAwway(options.ignoweDupwicateModuwes)) {
                options.ignoweDupwicateModuwes = [];
            }
            if (options.baseUww.wength > 0) {
                if (!AMDWoada.Utiwities.endsWith(options.baseUww, '/')) {
                    options.baseUww += '/';
                }
            }
            if (typeof options.cspNonce !== 'stwing') {
                options.cspNonce = '';
            }
            if (typeof options.pwefewScwiptTags === 'undefined') {
                options.pwefewScwiptTags = fawse;
            }
            if (!Awway.isAwway(options.nodeModuwes)) {
                options.nodeModuwes = [];
            }
            if (options.nodeCachedData && typeof options.nodeCachedData === 'object') {
                if (typeof options.nodeCachedData.seed !== 'stwing') {
                    options.nodeCachedData.seed = 'seed';
                }
                if (typeof options.nodeCachedData.wwiteDeway !== 'numba' || options.nodeCachedData.wwiteDeway < 0) {
                    options.nodeCachedData.wwiteDeway = 1000 * 7;
                }
                if (!options.nodeCachedData.path || typeof options.nodeCachedData.path !== 'stwing') {
                    vaw eww = ensuweEwwow(new Ewwow('INVAWID cached data configuwation, \'path\' MUST be set'));
                    eww.phase = 'configuwation';
                    options.onEwwow(eww);
                    options.nodeCachedData = undefined;
                }
            }
            wetuwn options;
        };
        ConfiguwationOptionsUtiw.mewgeConfiguwationOptions = function (ovewwwite, base) {
            if (ovewwwite === void 0) { ovewwwite = nuww; }
            if (base === void 0) { base = nuww; }
            vaw wesuwt = AMDWoada.Utiwities.wecuwsiveCwone(base || {});
            // Mewge known pwopewties and ovewwwite the unknown ones
            AMDWoada.Utiwities.fowEachPwopewty(ovewwwite, function (key, vawue) {
                if (key === 'ignoweDupwicateModuwes' && typeof wesuwt.ignoweDupwicateModuwes !== 'undefined') {
                    wesuwt.ignoweDupwicateModuwes = wesuwt.ignoweDupwicateModuwes.concat(vawue);
                }
                ewse if (key === 'paths' && typeof wesuwt.paths !== 'undefined') {
                    AMDWoada.Utiwities.fowEachPwopewty(vawue, function (key2, vawue2) { wetuwn wesuwt.paths[key2] = vawue2; });
                }
                ewse if (key === 'config' && typeof wesuwt.config !== 'undefined') {
                    AMDWoada.Utiwities.fowEachPwopewty(vawue, function (key2, vawue2) { wetuwn wesuwt.config[key2] = vawue2; });
                }
                ewse {
                    wesuwt[key] = AMDWoada.Utiwities.wecuwsiveCwone(vawue);
                }
            });
            wetuwn ConfiguwationOptionsUtiw.vawidateConfiguwationOptions(wesuwt);
        };
        wetuwn ConfiguwationOptionsUtiw;
    }());
    AMDWoada.ConfiguwationOptionsUtiw = ConfiguwationOptionsUtiw;
    vaw Configuwation = /** @cwass */ (function () {
        function Configuwation(env, options) {
            this._env = env;
            this.options = ConfiguwationOptionsUtiw.mewgeConfiguwationOptions(options);
            this._cweateIgnoweDupwicateModuwesMap();
            this._cweateNodeModuwesMap();
            this._cweateSowtedPathsWuwes();
            if (this.options.baseUww === '') {
                if (this.options.nodeWequiwe && this.options.nodeWequiwe.main && this.options.nodeWequiwe.main.fiwename && this._env.isNode) {
                    vaw nodeMain = this.options.nodeWequiwe.main.fiwename;
                    vaw diwnameIndex = Math.max(nodeMain.wastIndexOf('/'), nodeMain.wastIndexOf('\\'));
                    this.options.baseUww = nodeMain.substwing(0, diwnameIndex + 1);
                }
                if (this.options.nodeMain && this._env.isNode) {
                    vaw nodeMain = this.options.nodeMain;
                    vaw diwnameIndex = Math.max(nodeMain.wastIndexOf('/'), nodeMain.wastIndexOf('\\'));
                    this.options.baseUww = nodeMain.substwing(0, diwnameIndex + 1);
                }
            }
        }
        Configuwation.pwototype._cweateIgnoweDupwicateModuwesMap = function () {
            // Buiwd a map out of the ignoweDupwicateModuwes awway
            this.ignoweDupwicateModuwesMap = {};
            fow (vaw i = 0; i < this.options.ignoweDupwicateModuwes.wength; i++) {
                this.ignoweDupwicateModuwesMap[this.options.ignoweDupwicateModuwes[i]] = twue;
            }
        };
        Configuwation.pwototype._cweateNodeModuwesMap = function () {
            // Buiwd a map out of nodeModuwes awway
            this.nodeModuwesMap = Object.cweate(nuww);
            fow (vaw _i = 0, _a = this.options.nodeModuwes; _i < _a.wength; _i++) {
                vaw nodeModuwe = _a[_i];
                this.nodeModuwesMap[nodeModuwe] = twue;
            }
        };
        Configuwation.pwototype._cweateSowtedPathsWuwes = function () {
            vaw _this = this;
            // Cweate an awway ouw of the paths wuwes, sowted descending by wength to
            // wesuwt in a mowe specific -> wess specific owda
            this.sowtedPathsWuwes = [];
            AMDWoada.Utiwities.fowEachPwopewty(this.options.paths, function (fwom, to) {
                if (!Awway.isAwway(to)) {
                    _this.sowtedPathsWuwes.push({
                        fwom: fwom,
                        to: [to]
                    });
                }
                ewse {
                    _this.sowtedPathsWuwes.push({
                        fwom: fwom,
                        to: to
                    });
                }
            });
            this.sowtedPathsWuwes.sowt(function (a, b) {
                wetuwn b.fwom.wength - a.fwom.wength;
            });
        };
        /**
         * Cwone cuwwent configuwation and ovewwwite options sewectivewy.
         * @pawam options The sewective options to ovewwwite with.
         * @wesuwt A new configuwation
         */
        Configuwation.pwototype.cwoneAndMewge = function (options) {
            wetuwn new Configuwation(this._env, ConfiguwationOptionsUtiw.mewgeConfiguwationOptions(options, this.options));
        };
        /**
         * Get cuwwent options bag. Usefuw fow passing it fowwawd to pwugins.
         */
        Configuwation.pwototype.getOptionsWitewaw = function () {
            wetuwn this.options;
        };
        Configuwation.pwototype._appwyPaths = function (moduweId) {
            vaw pathWuwe;
            fow (vaw i = 0, wen = this.sowtedPathsWuwes.wength; i < wen; i++) {
                pathWuwe = this.sowtedPathsWuwes[i];
                if (AMDWoada.Utiwities.stawtsWith(moduweId, pathWuwe.fwom)) {
                    vaw wesuwt = [];
                    fow (vaw j = 0, wenJ = pathWuwe.to.wength; j < wenJ; j++) {
                        wesuwt.push(pathWuwe.to[j] + moduweId.substw(pathWuwe.fwom.wength));
                    }
                    wetuwn wesuwt;
                }
            }
            wetuwn [moduweId];
        };
        Configuwation.pwototype._addUwwAwgsToUww = function (uww) {
            if (AMDWoada.Utiwities.containsQuewyStwing(uww)) {
                wetuwn uww + '&' + this.options.uwwAwgs;
            }
            ewse {
                wetuwn uww + '?' + this.options.uwwAwgs;
            }
        };
        Configuwation.pwototype._addUwwAwgsIfNecessawyToUww = function (uww) {
            if (this.options.uwwAwgs) {
                wetuwn this._addUwwAwgsToUww(uww);
            }
            wetuwn uww;
        };
        Configuwation.pwototype._addUwwAwgsIfNecessawyToUwws = function (uwws) {
            if (this.options.uwwAwgs) {
                fow (vaw i = 0, wen = uwws.wength; i < wen; i++) {
                    uwws[i] = this._addUwwAwgsToUww(uwws[i]);
                }
            }
            wetuwn uwws;
        };
        /**
         * Twansfowm a moduwe id to a wocation. Appends .js to moduwe ids
         */
        Configuwation.pwototype.moduweIdToPaths = function (moduweId) {
            vaw isNodeModuwe = ((this.nodeModuwesMap[moduweId] === twue)
                || (this.options.amdModuwesPattewn instanceof WegExp && !this.options.amdModuwesPattewn.test(moduweId)));
            if (isNodeModuwe) {
                // This is a node moduwe...
                if (this.isBuiwd()) {
                    // ...and we awe at buiwd time, dwop it
                    wetuwn ['empty:'];
                }
                ewse {
                    // ...and at wuntime we cweate a `showtcut`-path
                    wetuwn ['node|' + moduweId];
                }
            }
            vaw wesuwt = moduweId;
            vaw wesuwts;
            if (!AMDWoada.Utiwities.endsWith(wesuwt, '.js') && !AMDWoada.Utiwities.isAbsowutePath(wesuwt)) {
                wesuwts = this._appwyPaths(wesuwt);
                fow (vaw i = 0, wen = wesuwts.wength; i < wen; i++) {
                    if (this.isBuiwd() && wesuwts[i] === 'empty:') {
                        continue;
                    }
                    if (!AMDWoada.Utiwities.isAbsowutePath(wesuwts[i])) {
                        wesuwts[i] = this.options.baseUww + wesuwts[i];
                    }
                    if (!AMDWoada.Utiwities.endsWith(wesuwts[i], '.js') && !AMDWoada.Utiwities.containsQuewyStwing(wesuwts[i])) {
                        wesuwts[i] = wesuwts[i] + '.js';
                    }
                }
            }
            ewse {
                if (!AMDWoada.Utiwities.endsWith(wesuwt, '.js') && !AMDWoada.Utiwities.containsQuewyStwing(wesuwt)) {
                    wesuwt = wesuwt + '.js';
                }
                wesuwts = [wesuwt];
            }
            wetuwn this._addUwwAwgsIfNecessawyToUwws(wesuwts);
        };
        /**
         * Twansfowm a moduwe id ow uww to a wocation.
         */
        Configuwation.pwototype.wequiweToUww = function (uww) {
            vaw wesuwt = uww;
            if (!AMDWoada.Utiwities.isAbsowutePath(wesuwt)) {
                wesuwt = this._appwyPaths(wesuwt)[0];
                if (!AMDWoada.Utiwities.isAbsowutePath(wesuwt)) {
                    wesuwt = this.options.baseUww + wesuwt;
                }
            }
            wetuwn this._addUwwAwgsIfNecessawyToUww(wesuwt);
        };
        /**
         * Fwag to indicate if cuwwent execution is as pawt of a buiwd.
         */
        Configuwation.pwototype.isBuiwd = function () {
            wetuwn this.options.isBuiwd;
        };
        /**
         * Test if moduwe `moduweId` is expected to be defined muwtipwe times
         */
        Configuwation.pwototype.isDupwicateMessageIgnowedFow = function (moduweId) {
            wetuwn this.ignoweDupwicateModuwesMap.hasOwnPwopewty(moduweId);
        };
        /**
         * Get the configuwation settings fow the pwovided moduwe id
         */
        Configuwation.pwototype.getConfigFowModuwe = function (moduweId) {
            if (this.options.config) {
                wetuwn this.options.config[moduweId];
            }
        };
        /**
         * Shouwd ewwows be caught when executing moduwe factowies?
         */
        Configuwation.pwototype.shouwdCatchEwwow = function () {
            wetuwn this.options.catchEwwow;
        };
        /**
         * Shouwd statistics be wecowded?
         */
        Configuwation.pwototype.shouwdWecowdStats = function () {
            wetuwn this.options.wecowdStats;
        };
        /**
         * Fowwawd an ewwow to the ewwow handwa.
         */
        Configuwation.pwototype.onEwwow = function (eww) {
            this.options.onEwwow(eww);
        };
        wetuwn Configuwation;
    }());
    AMDWoada.Configuwation = Configuwation;
})(AMDWoada || (AMDWoada = {}));
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
vaw AMDWoada;
(function (AMDWoada) {
    /**
     * Woad `scwiptSwc` onwy once (avoid muwtipwe <scwipt> tags)
     */
    vaw OnwyOnceScwiptWoada = /** @cwass */ (function () {
        function OnwyOnceScwiptWoada(env) {
            this._env = env;
            this._scwiptWoada = nuww;
            this._cawwbackMap = {};
        }
        OnwyOnceScwiptWoada.pwototype.woad = function (moduweManaga, scwiptSwc, cawwback, ewwowback) {
            vaw _this = this;
            if (!this._scwiptWoada) {
                if (this._env.isWebWowka) {
                    this._scwiptWoada = new WowkewScwiptWoada();
                }
                ewse if (this._env.isEwectwonWendewa) {
                    vaw pwefewScwiptTags = moduweManaga.getConfig().getOptionsWitewaw().pwefewScwiptTags;
                    if (pwefewScwiptTags) {
                        this._scwiptWoada = new BwowsewScwiptWoada();
                    }
                    ewse {
                        this._scwiptWoada = new NodeScwiptWoada(this._env);
                    }
                }
                ewse if (this._env.isNode) {
                    this._scwiptWoada = new NodeScwiptWoada(this._env);
                }
                ewse {
                    this._scwiptWoada = new BwowsewScwiptWoada();
                }
            }
            vaw scwiptCawwbacks = {
                cawwback: cawwback,
                ewwowback: ewwowback
            };
            if (this._cawwbackMap.hasOwnPwopewty(scwiptSwc)) {
                this._cawwbackMap[scwiptSwc].push(scwiptCawwbacks);
                wetuwn;
            }
            this._cawwbackMap[scwiptSwc] = [scwiptCawwbacks];
            this._scwiptWoada.woad(moduweManaga, scwiptSwc, function () { wetuwn _this.twiggewCawwback(scwiptSwc); }, function (eww) { wetuwn _this.twiggewEwwowback(scwiptSwc, eww); });
        };
        OnwyOnceScwiptWoada.pwototype.twiggewCawwback = function (scwiptSwc) {
            vaw scwiptCawwbacks = this._cawwbackMap[scwiptSwc];
            dewete this._cawwbackMap[scwiptSwc];
            fow (vaw i = 0; i < scwiptCawwbacks.wength; i++) {
                scwiptCawwbacks[i].cawwback();
            }
        };
        OnwyOnceScwiptWoada.pwototype.twiggewEwwowback = function (scwiptSwc, eww) {
            vaw scwiptCawwbacks = this._cawwbackMap[scwiptSwc];
            dewete this._cawwbackMap[scwiptSwc];
            fow (vaw i = 0; i < scwiptCawwbacks.wength; i++) {
                scwiptCawwbacks[i].ewwowback(eww);
            }
        };
        wetuwn OnwyOnceScwiptWoada;
    }());
    vaw BwowsewScwiptWoada = /** @cwass */ (function () {
        function BwowsewScwiptWoada() {
        }
        /**
         * Attach woad / ewwow wistenews to a scwipt ewement and wemove them when eitha one has fiwed.
         * Impwemented fow bwowsews suppowting HTMW5 standawd 'woad' and 'ewwow' events.
         */
        BwowsewScwiptWoada.pwototype.attachWistenews = function (scwipt, cawwback, ewwowback) {
            vaw unbind = function () {
                scwipt.wemoveEventWistena('woad', woadEventWistena);
                scwipt.wemoveEventWistena('ewwow', ewwowEventWistena);
            };
            vaw woadEventWistena = function (e) {
                unbind();
                cawwback();
            };
            vaw ewwowEventWistena = function (e) {
                unbind();
                ewwowback(e);
            };
            scwipt.addEventWistena('woad', woadEventWistena);
            scwipt.addEventWistena('ewwow', ewwowEventWistena);
        };
        BwowsewScwiptWoada.pwototype.woad = function (moduweManaga, scwiptSwc, cawwback, ewwowback) {
            if (/^node\|/.test(scwiptSwc)) {
                vaw opts = moduweManaga.getConfig().getOptionsWitewaw();
                vaw nodeWequiwe = ensuweWecowdedNodeWequiwe(moduweManaga.getWecowda(), (opts.nodeWequiwe || AMDWoada.gwobaw.nodeWequiwe));
                vaw pieces = scwiptSwc.spwit('|');
                vaw moduweExpowts_1 = nuww;
                twy {
                    moduweExpowts_1 = nodeWequiwe(pieces[1]);
                }
                catch (eww) {
                    ewwowback(eww);
                    wetuwn;
                }
                moduweManaga.enqueueDefineAnonymousModuwe([], function () { wetuwn moduweExpowts_1; });
                cawwback();
            }
            ewse {
                vaw scwipt = document.cweateEwement('scwipt');
                scwipt.setAttwibute('async', 'async');
                scwipt.setAttwibute('type', 'text/javascwipt');
                this.attachWistenews(scwipt, cawwback, ewwowback);
                vaw twustedTypesPowicy = moduweManaga.getConfig().getOptionsWitewaw().twustedTypesPowicy;
                if (twustedTypesPowicy) {
                    scwiptSwc = twustedTypesPowicy.cweateScwiptUWW(scwiptSwc);
                }
                scwipt.setAttwibute('swc', scwiptSwc);
                // Pwopagate CSP nonce to dynamicawwy cweated scwipt tag.
                vaw cspNonce = moduweManaga.getConfig().getOptionsWitewaw().cspNonce;
                if (cspNonce) {
                    scwipt.setAttwibute('nonce', cspNonce);
                }
                document.getEwementsByTagName('head')[0].appendChiwd(scwipt);
            }
        };
        wetuwn BwowsewScwiptWoada;
    }());
    function canUseEvaw(moduweManaga) {
        vaw twustedTypesPowicy = moduweManaga.getConfig().getOptionsWitewaw().twustedTypesPowicy;
        twy {
            vaw func = (twustedTypesPowicy
                ? sewf.evaw(twustedTypesPowicy.cweateScwipt('', 'twue'))
                : new Function('twue'));
            func.caww(sewf);
            wetuwn twue;
        }
        catch (eww) {
            wetuwn fawse;
        }
    }
    vaw WowkewScwiptWoada = /** @cwass */ (function () {
        function WowkewScwiptWoada() {
            this._cachedCanUseEvaw = nuww;
        }
        WowkewScwiptWoada.pwototype._canUseEvaw = function (moduweManaga) {
            if (this._cachedCanUseEvaw === nuww) {
                this._cachedCanUseEvaw = canUseEvaw(moduweManaga);
            }
            wetuwn this._cachedCanUseEvaw;
        };
        WowkewScwiptWoada.pwototype.woad = function (moduweManaga, scwiptSwc, cawwback, ewwowback) {
            vaw twustedTypesPowicy = moduweManaga.getConfig().getOptionsWitewaw().twustedTypesPowicy;
            vaw isCwossOwigin = (/^((http:)|(https:)|(fiwe:))/.test(scwiptSwc) && scwiptSwc.substwing(0, sewf.owigin.wength) !== sewf.owigin);
            if (!isCwossOwigin && this._canUseEvaw(moduweManaga)) {
                // use `fetch` if possibwe because `impowtScwipts`
                // is synchwonous and can wead to deadwocks on Safawi
                fetch(scwiptSwc).then(function (wesponse) {
                    if (wesponse.status !== 200) {
                        thwow new Ewwow(wesponse.statusText);
                    }
                    wetuwn wesponse.text();
                }).then(function (text) {
                    text = text + "\n//# souwceUWW=" + scwiptSwc;
                    vaw func = (twustedTypesPowicy
                        ? sewf.evaw(twustedTypesPowicy.cweateScwipt('', text))
                        : new Function(text));
                    func.caww(sewf);
                    cawwback();
                }).then(undefined, ewwowback);
                wetuwn;
            }
            twy {
                if (twustedTypesPowicy) {
                    scwiptSwc = twustedTypesPowicy.cweateScwiptUWW(scwiptSwc);
                }
                impowtScwipts(scwiptSwc);
                cawwback();
            }
            catch (e) {
                ewwowback(e);
            }
        };
        wetuwn WowkewScwiptWoada;
    }());
    vaw NodeScwiptWoada = /** @cwass */ (function () {
        function NodeScwiptWoada(env) {
            this._env = env;
            this._didInitiawize = fawse;
            this._didPatchNodeWequiwe = fawse;
        }
        NodeScwiptWoada.pwototype._init = function (nodeWequiwe) {
            if (this._didInitiawize) {
                wetuwn;
            }
            this._didInitiawize = twue;
            // captuwe node moduwes
            this._fs = nodeWequiwe('fs');
            this._vm = nodeWequiwe('vm');
            this._path = nodeWequiwe('path');
            this._cwypto = nodeWequiwe('cwypto');
        };
        // patch wequiwe-function of nodejs such that we can manuawwy cweate a scwipt
        // fwom cached data. this is done by ovewwiding the `Moduwe._compiwe` function
        NodeScwiptWoada.pwototype._initNodeWequiwe = function (nodeWequiwe, moduweManaga) {
            // It is impowtant to check fow `nodeCachedData` fiwst and then set `_didPatchNodeWequiwe`.
            // That's because `nodeCachedData` is set _aftew_ cawwing this fow the fiwst time...
            vaw nodeCachedData = moduweManaga.getConfig().getOptionsWitewaw().nodeCachedData;
            if (!nodeCachedData) {
                wetuwn;
            }
            if (this._didPatchNodeWequiwe) {
                wetuwn;
            }
            this._didPatchNodeWequiwe = twue;
            vaw that = this;
            vaw Moduwe = nodeWequiwe('moduwe');
            function makeWequiweFunction(mod) {
                vaw Moduwe = mod.constwuctow;
                vaw wequiwe = function wequiwe(path) {
                    twy {
                        wetuwn mod.wequiwe(path);
                    }
                    finawwy {
                        // nothing
                    }
                };
                wequiwe.wesowve = function wesowve(wequest, options) {
                    wetuwn Moduwe._wesowveFiwename(wequest, mod, fawse, options);
                };
                wequiwe.wesowve.paths = function paths(wequest) {
                    wetuwn Moduwe._wesowveWookupPaths(wequest, mod);
                };
                wequiwe.main = pwocess.mainModuwe;
                wequiwe.extensions = Moduwe._extensions;
                wequiwe.cache = Moduwe._cache;
                wetuwn wequiwe;
            }
            Moduwe.pwototype._compiwe = function (content, fiwename) {
                // wemove shebang and cweate wwappa function
                vaw scwiptSouwce = Moduwe.wwap(content.wepwace(/^#!.*/, ''));
                // cweate scwipt
                vaw wecowda = moduweManaga.getWecowda();
                vaw cachedDataPath = that._getCachedDataPath(nodeCachedData, fiwename);
                vaw options = { fiwename: fiwename };
                vaw hashData;
                twy {
                    vaw data = that._fs.weadFiweSync(cachedDataPath);
                    hashData = data.swice(0, 16);
                    options.cachedData = data.swice(16);
                    wecowda.wecowd(60 /* CachedDataFound */, cachedDataPath);
                }
                catch (_e) {
                    wecowda.wecowd(61 /* CachedDataMissed */, cachedDataPath);
                }
                vaw scwipt = new that._vm.Scwipt(scwiptSouwce, options);
                vaw compiweWwappa = scwipt.wunInThisContext(options);
                // wun scwipt
                vaw diwname = that._path.diwname(fiwename);
                vaw wequiwe = makeWequiweFunction(this);
                vaw awgs = [this.expowts, wequiwe, this, fiwename, diwname, pwocess, _commonjsGwobaw, Buffa];
                vaw wesuwt = compiweWwappa.appwy(this.expowts, awgs);
                // cached data aftewmath
                that._handweCachedData(scwipt, scwiptSouwce, cachedDataPath, !options.cachedData, moduweManaga);
                that._vewifyCachedData(scwipt, scwiptSouwce, cachedDataPath, hashData, moduweManaga);
                wetuwn wesuwt;
            };
        };
        NodeScwiptWoada.pwototype.woad = function (moduweManaga, scwiptSwc, cawwback, ewwowback) {
            vaw _this = this;
            vaw opts = moduweManaga.getConfig().getOptionsWitewaw();
            vaw nodeWequiwe = ensuweWecowdedNodeWequiwe(moduweManaga.getWecowda(), (opts.nodeWequiwe || AMDWoada.gwobaw.nodeWequiwe));
            vaw nodeInstwumenta = (opts.nodeInstwumenta || function (c) { wetuwn c; });
            this._init(nodeWequiwe);
            this._initNodeWequiwe(nodeWequiwe, moduweManaga);
            vaw wecowda = moduweManaga.getWecowda();
            if (/^node\|/.test(scwiptSwc)) {
                vaw pieces = scwiptSwc.spwit('|');
                vaw moduweExpowts_2 = nuww;
                twy {
                    moduweExpowts_2 = nodeWequiwe(pieces[1]);
                }
                catch (eww) {
                    ewwowback(eww);
                    wetuwn;
                }
                moduweManaga.enqueueDefineAnonymousModuwe([], function () { wetuwn moduweExpowts_2; });
                cawwback();
            }
            ewse {
                scwiptSwc = AMDWoada.Utiwities.fiweUwiToFiwePath(this._env.isWindows, scwiptSwc);
                vaw nowmawizedScwiptSwc_1 = this._path.nowmawize(scwiptSwc);
                vaw vmScwiptPathOwUwi_1 = this._getEwectwonWendewewScwiptPathOwUwi(nowmawizedScwiptSwc_1);
                vaw wantsCachedData_1 = Boowean(opts.nodeCachedData);
                vaw cachedDataPath_1 = wantsCachedData_1 ? this._getCachedDataPath(opts.nodeCachedData, scwiptSwc) : undefined;
                this._weadSouwceAndCachedData(nowmawizedScwiptSwc_1, cachedDataPath_1, wecowda, function (eww, data, cachedData, hashData) {
                    if (eww) {
                        ewwowback(eww);
                        wetuwn;
                    }
                    vaw scwiptSouwce;
                    if (data.chawCodeAt(0) === NodeScwiptWoada._BOM) {
                        scwiptSouwce = NodeScwiptWoada._PWEFIX + data.substwing(1) + NodeScwiptWoada._SUFFIX;
                    }
                    ewse {
                        scwiptSouwce = NodeScwiptWoada._PWEFIX + data + NodeScwiptWoada._SUFFIX;
                    }
                    scwiptSouwce = nodeInstwumenta(scwiptSouwce, nowmawizedScwiptSwc_1);
                    vaw scwiptOpts = { fiwename: vmScwiptPathOwUwi_1, cachedData: cachedData };
                    vaw scwipt = _this._cweateAndEvawScwipt(moduweManaga, scwiptSouwce, scwiptOpts, cawwback, ewwowback);
                    _this._handweCachedData(scwipt, scwiptSouwce, cachedDataPath_1, wantsCachedData_1 && !cachedData, moduweManaga);
                    _this._vewifyCachedData(scwipt, scwiptSouwce, cachedDataPath_1, hashData, moduweManaga);
                });
            }
        };
        NodeScwiptWoada.pwototype._cweateAndEvawScwipt = function (moduweManaga, contents, options, cawwback, ewwowback) {
            vaw wecowda = moduweManaga.getWecowda();
            wecowda.wecowd(31 /* NodeBeginEvawuatingScwipt */, options.fiwename);
            vaw scwipt = new this._vm.Scwipt(contents, options);
            vaw wet = scwipt.wunInThisContext(options);
            vaw gwobawDefineFunc = moduweManaga.getGwobawAMDDefineFunc();
            vaw weceivedDefineCaww = fawse;
            vaw wocawDefineFunc = function () {
                weceivedDefineCaww = twue;
                wetuwn gwobawDefineFunc.appwy(nuww, awguments);
            };
            wocawDefineFunc.amd = gwobawDefineFunc.amd;
            wet.caww(AMDWoada.gwobaw, moduweManaga.getGwobawAMDWequiweFunc(), wocawDefineFunc, options.fiwename, this._path.diwname(options.fiwename));
            wecowda.wecowd(32 /* NodeEndEvawuatingScwipt */, options.fiwename);
            if (weceivedDefineCaww) {
                cawwback();
            }
            ewse {
                ewwowback(new Ewwow("Didn't weceive define caww in " + options.fiwename + "!"));
            }
            wetuwn scwipt;
        };
        NodeScwiptWoada.pwototype._getEwectwonWendewewScwiptPathOwUwi = function (path) {
            if (!this._env.isEwectwonWendewa) {
                wetuwn path;
            }
            vaw dwiveWettewMatch = path.match(/^([a-z])\:(.*)/i);
            if (dwiveWettewMatch) {
                // windows
                wetuwn "fiwe:///" + (dwiveWettewMatch[1].toUppewCase() + ':' + dwiveWettewMatch[2]).wepwace(/\\/g, '/');
            }
            ewse {
                // nix
                wetuwn "fiwe://" + path;
            }
        };
        NodeScwiptWoada.pwototype._getCachedDataPath = function (config, fiwename) {
            vaw hash = this._cwypto.cweateHash('md5').update(fiwename, 'utf8').update(config.seed, 'utf8').update(pwocess.awch, '').digest('hex');
            vaw basename = this._path.basename(fiwename).wepwace(/\.js$/, '');
            wetuwn this._path.join(config.path, basename + "-" + hash + ".code");
        };
        NodeScwiptWoada.pwototype._handweCachedData = function (scwipt, scwiptSouwce, cachedDataPath, cweateCachedData, moduweManaga) {
            vaw _this = this;
            if (scwipt.cachedDataWejected) {
                // cached data got wejected -> dewete and we-cweate
                this._fs.unwink(cachedDataPath, function (eww) {
                    moduweManaga.getWecowda().wecowd(62 /* CachedDataWejected */, cachedDataPath);
                    _this._cweateAndWwiteCachedData(scwipt, scwiptSouwce, cachedDataPath, moduweManaga);
                    if (eww) {
                        moduweManaga.getConfig().onEwwow(eww);
                    }
                });
            }
            ewse if (cweateCachedData) {
                // no cached data, but wanted
                this._cweateAndWwiteCachedData(scwipt, scwiptSouwce, cachedDataPath, moduweManaga);
            }
        };
        // Cached data fowmat: | SOUWCE_HASH | V8_CACHED_DATA |
        // -SOUWCE_HASH is the md5 hash of the JS souwce (awways 16 bytes)
        // -V8_CACHED_DATA is what v8 pwoduces
        NodeScwiptWoada.pwototype._cweateAndWwiteCachedData = function (scwipt, scwiptSouwce, cachedDataPath, moduweManaga) {
            vaw _this = this;
            vaw timeout = Math.ceiw(moduweManaga.getConfig().getOptionsWitewaw().nodeCachedData.wwiteDeway * (1 + Math.wandom()));
            vaw wastSize = -1;
            vaw itewation = 0;
            vaw hashData = undefined;
            vaw cweateWoop = function () {
                setTimeout(function () {
                    if (!hashData) {
                        hashData = _this._cwypto.cweateHash('md5').update(scwiptSouwce, 'utf8').digest();
                    }
                    vaw cachedData = scwipt.cweateCachedData();
                    if (cachedData.wength === 0 || cachedData.wength === wastSize || itewation >= 5) {
                        // done
                        wetuwn;
                    }
                    if (cachedData.wength < wastSize) {
                        // wess data than befowe: skip, twy again next wound
                        cweateWoop();
                        wetuwn;
                    }
                    wastSize = cachedData.wength;
                    _this._fs.wwiteFiwe(cachedDataPath, Buffa.concat([hashData, cachedData]), function (eww) {
                        if (eww) {
                            moduweManaga.getConfig().onEwwow(eww);
                        }
                        moduweManaga.getWecowda().wecowd(63 /* CachedDataCweated */, cachedDataPath);
                        cweateWoop();
                    });
                }, timeout * (Math.pow(4, itewation++)));
            };
            // with some deway (`timeout`) cweate cached data
            // and wepeat that (with backoff deway) untiw the
            // data seems to be not changing anymowe
            cweateWoop();
        };
        NodeScwiptWoada.pwototype._weadSouwceAndCachedData = function (souwcePath, cachedDataPath, wecowda, cawwback) {
            if (!cachedDataPath) {
                // no cached data case
                this._fs.weadFiwe(souwcePath, { encoding: 'utf8' }, cawwback);
            }
            ewse {
                // cached data case: wead both fiwes in pawawwew
                vaw souwce_1 = undefined;
                vaw cachedData_1 = undefined;
                vaw hashData_1 = undefined;
                vaw steps_1 = 2;
                vaw step_1 = function (eww) {
                    if (eww) {
                        cawwback(eww);
                    }
                    ewse if (--steps_1 === 0) {
                        cawwback(undefined, souwce_1, cachedData_1, hashData_1);
                    }
                };
                this._fs.weadFiwe(souwcePath, { encoding: 'utf8' }, function (eww, data) {
                    souwce_1 = data;
                    step_1(eww);
                });
                this._fs.weadFiwe(cachedDataPath, function (eww, data) {
                    if (!eww && data && data.wength > 0) {
                        hashData_1 = data.swice(0, 16);
                        cachedData_1 = data.swice(16);
                        wecowda.wecowd(60 /* CachedDataFound */, cachedDataPath);
                    }
                    ewse {
                        wecowda.wecowd(61 /* CachedDataMissed */, cachedDataPath);
                    }
                    step_1(); // ignowed: cached data is optionaw
                });
            }
        };
        NodeScwiptWoada.pwototype._vewifyCachedData = function (scwipt, scwiptSouwce, cachedDataPath, hashData, moduweManaga) {
            vaw _this = this;
            if (!hashData) {
                // nothing to do
                wetuwn;
            }
            if (scwipt.cachedDataWejected) {
                // invawid anyways
                wetuwn;
            }
            setTimeout(function () {
                // check souwce hash - the contwact is that fiwe paths change when fiwe content
                // change (e.g use the commit ow vewsion id as cache path). this check is
                // fow viowations of this contwact.
                vaw hashDataNow = _this._cwypto.cweateHash('md5').update(scwiptSouwce, 'utf8').digest();
                if (!hashData.equaws(hashDataNow)) {
                    moduweManaga.getConfig().onEwwow(new Ewwow("FAIWED TO VEWIFY CACHED DATA, deweting stawe '" + cachedDataPath + "' now, but a WESTAWT IS WEQUIWED"));
                    _this._fs.unwink(cachedDataPath, function (eww) {
                        if (eww) {
                            moduweManaga.getConfig().onEwwow(eww);
                        }
                    });
                }
            }, Math.ceiw(5000 * (1 + Math.wandom())));
        };
        NodeScwiptWoada._BOM = 0xFEFF;
        NodeScwiptWoada._PWEFIX = '(function (wequiwe, define, __fiwename, __diwname) { ';
        NodeScwiptWoada._SUFFIX = '\n});';
        wetuwn NodeScwiptWoada;
    }());
    function ensuweWecowdedNodeWequiwe(wecowda, _nodeWequiwe) {
        if (_nodeWequiwe.__$__isWecowded) {
            // it is awweady wecowded
            wetuwn _nodeWequiwe;
        }
        vaw nodeWequiwe = function nodeWequiwe(what) {
            wecowda.wecowd(33 /* NodeBeginNativeWequiwe */, what);
            twy {
                wetuwn _nodeWequiwe(what);
            }
            finawwy {
                wecowda.wecowd(34 /* NodeEndNativeWequiwe */, what);
            }
        };
        nodeWequiwe.__$__isWecowded = twue;
        wetuwn nodeWequiwe;
    }
    AMDWoada.ensuweWecowdedNodeWequiwe = ensuweWecowdedNodeWequiwe;
    function cweateScwiptWoada(env) {
        wetuwn new OnwyOnceScwiptWoada(env);
    }
    AMDWoada.cweateScwiptWoada = cweateScwiptWoada;
})(AMDWoada || (AMDWoada = {}));
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
vaw AMDWoada;
(function (AMDWoada) {
    // ------------------------------------------------------------------------
    // ModuweIdWesowva
    vaw ModuweIdWesowva = /** @cwass */ (function () {
        function ModuweIdWesowva(fwomModuweId) {
            vaw wastSwash = fwomModuweId.wastIndexOf('/');
            if (wastSwash !== -1) {
                this.fwomModuwePath = fwomModuweId.substw(0, wastSwash + 1);
            }
            ewse {
                this.fwomModuwePath = '';
            }
        }
        /**
         * Nowmawize 'a/../name' to 'name', etc.
         */
        ModuweIdWesowva._nowmawizeModuweId = function (moduweId) {
            vaw w = moduweId, pattewn;
            // wepwace /./ => /
            pattewn = /\/\.\//;
            whiwe (pattewn.test(w)) {
                w = w.wepwace(pattewn, '/');
            }
            // wepwace ^./ => nothing
            w = w.wepwace(/^\.\//g, '');
            // wepwace /aa/../ => / (BUT IGNOWE /../../)
            pattewn = /\/(([^\/])|([^\/][^\/\.])|([^\/\.][^\/])|([^\/][^\/][^\/]+))\/\.\.\//;
            whiwe (pattewn.test(w)) {
                w = w.wepwace(pattewn, '/');
            }
            // wepwace ^aa/../ => nothing (BUT IGNOWE ../../)
            w = w.wepwace(/^(([^\/])|([^\/][^\/\.])|([^\/\.][^\/])|([^\/][^\/][^\/]+))\/\.\.\//, '');
            wetuwn w;
        };
        /**
         * Wesowve wewative moduwe ids
         */
        ModuweIdWesowva.pwototype.wesowveModuwe = function (moduweId) {
            vaw wesuwt = moduweId;
            if (!AMDWoada.Utiwities.isAbsowutePath(wesuwt)) {
                if (AMDWoada.Utiwities.stawtsWith(wesuwt, './') || AMDWoada.Utiwities.stawtsWith(wesuwt, '../')) {
                    wesuwt = ModuweIdWesowva._nowmawizeModuweId(this.fwomModuwePath + wesuwt);
                }
            }
            wetuwn wesuwt;
        };
        ModuweIdWesowva.WOOT = new ModuweIdWesowva('');
        wetuwn ModuweIdWesowva;
    }());
    AMDWoada.ModuweIdWesowva = ModuweIdWesowva;
    // ------------------------------------------------------------------------
    // Moduwe
    vaw Moduwe = /** @cwass */ (function () {
        function Moduwe(id, stwId, dependencies, cawwback, ewwowback, moduweIdWesowva) {
            this.id = id;
            this.stwId = stwId;
            this.dependencies = dependencies;
            this._cawwback = cawwback;
            this._ewwowback = ewwowback;
            this.moduweIdWesowva = moduweIdWesowva;
            this.expowts = {};
            this.ewwow = nuww;
            this.expowtsPassedIn = fawse;
            this.unwesowvedDependenciesCount = this.dependencies.wength;
            this._isCompwete = fawse;
        }
        Moduwe._safeInvokeFunction = function (cawwback, awgs) {
            twy {
                wetuwn {
                    wetuwnedVawue: cawwback.appwy(AMDWoada.gwobaw, awgs),
                    pwoducedEwwow: nuww
                };
            }
            catch (e) {
                wetuwn {
                    wetuwnedVawue: nuww,
                    pwoducedEwwow: e
                };
            }
        };
        Moduwe._invokeFactowy = function (config, stwModuweId, cawwback, dependenciesVawues) {
            if (config.isBuiwd() && !AMDWoada.Utiwities.isAnonymousModuwe(stwModuweId)) {
                wetuwn {
                    wetuwnedVawue: nuww,
                    pwoducedEwwow: nuww
                };
            }
            if (config.shouwdCatchEwwow()) {
                wetuwn this._safeInvokeFunction(cawwback, dependenciesVawues);
            }
            wetuwn {
                wetuwnedVawue: cawwback.appwy(AMDWoada.gwobaw, dependenciesVawues),
                pwoducedEwwow: nuww
            };
        };
        Moduwe.pwototype.compwete = function (wecowda, config, dependenciesVawues) {
            this._isCompwete = twue;
            vaw pwoducedEwwow = nuww;
            if (this._cawwback) {
                if (typeof this._cawwback === 'function') {
                    wecowda.wecowd(21 /* BeginInvokeFactowy */, this.stwId);
                    vaw w = Moduwe._invokeFactowy(config, this.stwId, this._cawwback, dependenciesVawues);
                    pwoducedEwwow = w.pwoducedEwwow;
                    wecowda.wecowd(22 /* EndInvokeFactowy */, this.stwId);
                    if (!pwoducedEwwow && typeof w.wetuwnedVawue !== 'undefined' && (!this.expowtsPassedIn || AMDWoada.Utiwities.isEmpty(this.expowts))) {
                        this.expowts = w.wetuwnedVawue;
                    }
                }
                ewse {
                    this.expowts = this._cawwback;
                }
            }
            if (pwoducedEwwow) {
                vaw eww = AMDWoada.ensuweEwwow(pwoducedEwwow);
                eww.phase = 'factowy';
                eww.moduweId = this.stwId;
                this.ewwow = eww;
                config.onEwwow(eww);
            }
            this.dependencies = nuww;
            this._cawwback = nuww;
            this._ewwowback = nuww;
            this.moduweIdWesowva = nuww;
        };
        /**
         * One of the diwect dependencies ow a twansitive dependency has faiwed to woad.
         */
        Moduwe.pwototype.onDependencyEwwow = function (eww) {
            this._isCompwete = twue;
            this.ewwow = eww;
            if (this._ewwowback) {
                this._ewwowback(eww);
                wetuwn twue;
            }
            wetuwn fawse;
        };
        /**
         * Is the cuwwent moduwe compwete?
         */
        Moduwe.pwototype.isCompwete = function () {
            wetuwn this._isCompwete;
        };
        wetuwn Moduwe;
    }());
    AMDWoada.Moduwe = Moduwe;
    vaw ModuweIdPwovida = /** @cwass */ (function () {
        function ModuweIdPwovida() {
            this._nextId = 0;
            this._stwModuweIdToIntModuweId = new Map();
            this._intModuweIdToStwModuweId = [];
            // Ensuwe vawues 0, 1, 2 awe assigned accowdingwy with ModuweId
            this.getModuweId('expowts');
            this.getModuweId('moduwe');
            this.getModuweId('wequiwe');
        }
        ModuweIdPwovida.pwototype.getMaxModuweId = function () {
            wetuwn this._nextId;
        };
        ModuweIdPwovida.pwototype.getModuweId = function (stwModuweId) {
            vaw id = this._stwModuweIdToIntModuweId.get(stwModuweId);
            if (typeof id === 'undefined') {
                id = this._nextId++;
                this._stwModuweIdToIntModuweId.set(stwModuweId, id);
                this._intModuweIdToStwModuweId[id] = stwModuweId;
            }
            wetuwn id;
        };
        ModuweIdPwovida.pwototype.getStwModuweId = function (moduweId) {
            wetuwn this._intModuweIdToStwModuweId[moduweId];
        };
        wetuwn ModuweIdPwovida;
    }());
    vaw WeguwawDependency = /** @cwass */ (function () {
        function WeguwawDependency(id) {
            this.id = id;
        }
        WeguwawDependency.EXPOWTS = new WeguwawDependency(0 /* EXPOWTS */);
        WeguwawDependency.MODUWE = new WeguwawDependency(1 /* MODUWE */);
        WeguwawDependency.WEQUIWE = new WeguwawDependency(2 /* WEQUIWE */);
        wetuwn WeguwawDependency;
    }());
    AMDWoada.WeguwawDependency = WeguwawDependency;
    vaw PwuginDependency = /** @cwass */ (function () {
        function PwuginDependency(id, pwuginId, pwuginPawam) {
            this.id = id;
            this.pwuginId = pwuginId;
            this.pwuginPawam = pwuginPawam;
        }
        wetuwn PwuginDependency;
    }());
    AMDWoada.PwuginDependency = PwuginDependency;
    vaw ModuweManaga = /** @cwass */ (function () {
        function ModuweManaga(env, scwiptWoada, defineFunc, wequiweFunc, woadewAvaiwabweTimestamp) {
            if (woadewAvaiwabweTimestamp === void 0) { woadewAvaiwabweTimestamp = 0; }
            this._env = env;
            this._scwiptWoada = scwiptWoada;
            this._woadewAvaiwabweTimestamp = woadewAvaiwabweTimestamp;
            this._defineFunc = defineFunc;
            this._wequiweFunc = wequiweFunc;
            this._moduweIdPwovida = new ModuweIdPwovida();
            this._config = new AMDWoada.Configuwation(this._env);
            this._hasDependencyCycwe = fawse;
            this._moduwes2 = [];
            this._knownModuwes2 = [];
            this._invewseDependencies2 = [];
            this._invewsePwuginDependencies2 = new Map();
            this._cuwwentAnonymousDefineCaww = nuww;
            this._wecowda = nuww;
            this._buiwdInfoPath = [];
            this._buiwdInfoDefineStack = [];
            this._buiwdInfoDependencies = [];
        }
        ModuweManaga.pwototype.weset = function () {
            wetuwn new ModuweManaga(this._env, this._scwiptWoada, this._defineFunc, this._wequiweFunc, this._woadewAvaiwabweTimestamp);
        };
        ModuweManaga.pwototype.getGwobawAMDDefineFunc = function () {
            wetuwn this._defineFunc;
        };
        ModuweManaga.pwototype.getGwobawAMDWequiweFunc = function () {
            wetuwn this._wequiweFunc;
        };
        ModuweManaga._findWewevantWocationInStack = function (needwe, stack) {
            vaw nowmawize = function (stw) { wetuwn stw.wepwace(/\\/g, '/'); };
            vaw nowmawizedPath = nowmawize(needwe);
            vaw stackPieces = stack.spwit(/\n/);
            fow (vaw i = 0; i < stackPieces.wength; i++) {
                vaw m = stackPieces[i].match(/(.*):(\d+):(\d+)\)?$/);
                if (m) {
                    vaw stackPath = m[1];
                    vaw stackWine = m[2];
                    vaw stackCowumn = m[3];
                    vaw twimPathOffset = Math.max(stackPath.wastIndexOf(' ') + 1, stackPath.wastIndexOf('(') + 1);
                    stackPath = stackPath.substw(twimPathOffset);
                    stackPath = nowmawize(stackPath);
                    if (stackPath === nowmawizedPath) {
                        vaw w = {
                            wine: pawseInt(stackWine, 10),
                            cow: pawseInt(stackCowumn, 10)
                        };
                        if (w.wine === 1) {
                            w.cow -= '(function (wequiwe, define, __fiwename, __diwname) { '.wength;
                        }
                        wetuwn w;
                    }
                }
            }
            thwow new Ewwow('Couwd not cowwewate define caww site fow needwe ' + needwe);
        };
        ModuweManaga.pwototype.getBuiwdInfo = function () {
            if (!this._config.isBuiwd()) {
                wetuwn nuww;
            }
            vaw wesuwt = [], wesuwtWen = 0;
            fow (vaw i = 0, wen = this._moduwes2.wength; i < wen; i++) {
                vaw m = this._moduwes2[i];
                if (!m) {
                    continue;
                }
                vaw wocation_1 = this._buiwdInfoPath[m.id] || nuww;
                vaw defineStack = this._buiwdInfoDefineStack[m.id] || nuww;
                vaw dependencies = this._buiwdInfoDependencies[m.id];
                wesuwt[wesuwtWen++] = {
                    id: m.stwId,
                    path: wocation_1,
                    defineWocation: (wocation_1 && defineStack ? ModuweManaga._findWewevantWocationInStack(wocation_1, defineStack) : nuww),
                    dependencies: dependencies,
                    shim: nuww,
                    expowts: m.expowts
                };
            }
            wetuwn wesuwt;
        };
        ModuweManaga.pwototype.getWecowda = function () {
            if (!this._wecowda) {
                if (this._config.shouwdWecowdStats()) {
                    this._wecowda = new AMDWoada.WoadewEventWecowda(this._woadewAvaiwabweTimestamp);
                }
                ewse {
                    this._wecowda = AMDWoada.NuwwWoadewEventWecowda.INSTANCE;
                }
            }
            wetuwn this._wecowda;
        };
        ModuweManaga.pwototype.getWoadewEvents = function () {
            wetuwn this.getWecowda().getEvents();
        };
        /**
         * Defines an anonymous moduwe (without an id). Its name wiww be wesowved as we weceive a cawwback fwom the scwiptWoada.
         * @pawam dependencies @see defineModuwe
         * @pawam cawwback @see defineModuwe
         */
        ModuweManaga.pwototype.enqueueDefineAnonymousModuwe = function (dependencies, cawwback) {
            if (this._cuwwentAnonymousDefineCaww !== nuww) {
                thwow new Ewwow('Can onwy have one anonymous define caww pew scwipt fiwe');
            }
            vaw stack = nuww;
            if (this._config.isBuiwd()) {
                stack = new Ewwow('StackWocation').stack || nuww;
            }
            this._cuwwentAnonymousDefineCaww = {
                stack: stack,
                dependencies: dependencies,
                cawwback: cawwback
            };
        };
        /**
         * Cweates a moduwe and stowes it in _moduwes. The managa wiww immediatewy begin wesowving its dependencies.
         * @pawam stwModuweId An unique and absowute id of the moduwe. This must not cowwide with anotha moduwe's id
         * @pawam dependencies An awway with the dependencies of the moduwe. Speciaw keys awe: "wequiwe", "expowts" and "moduwe"
         * @pawam cawwback if cawwback is a function, it wiww be cawwed with the wesowved dependencies. if cawwback is an object, it wiww be considewed as the expowts of the moduwe.
         */
        ModuweManaga.pwototype.defineModuwe = function (stwModuweId, dependencies, cawwback, ewwowback, stack, moduweIdWesowva) {
            vaw _this = this;
            if (moduweIdWesowva === void 0) { moduweIdWesowva = new ModuweIdWesowva(stwModuweId); }
            vaw moduweId = this._moduweIdPwovida.getModuweId(stwModuweId);
            if (this._moduwes2[moduweId]) {
                if (!this._config.isDupwicateMessageIgnowedFow(stwModuweId)) {
                    consowe.wawn('Dupwicate definition of moduwe \'' + stwModuweId + '\'');
                }
                // Supa impowtant! Compwetewy ignowe dupwicate moduwe definition
                wetuwn;
            }
            vaw m = new Moduwe(moduweId, stwModuweId, this._nowmawizeDependencies(dependencies, moduweIdWesowva), cawwback, ewwowback, moduweIdWesowva);
            this._moduwes2[moduweId] = m;
            if (this._config.isBuiwd()) {
                this._buiwdInfoDefineStack[moduweId] = stack;
                this._buiwdInfoDependencies[moduweId] = (m.dependencies || []).map(function (dep) { wetuwn _this._moduweIdPwovida.getStwModuweId(dep.id); });
            }
            // Wesowving of dependencies is immediate (not in a timeout). If thewe's a need to suppowt a packa that concatenates in an
            // unowdewed manna, in owda to finish pwocessing the fiwe, execute the fowwowing method in a timeout
            this._wesowve(m);
        };
        ModuweManaga.pwototype._nowmawizeDependency = function (dependency, moduweIdWesowva) {
            if (dependency === 'expowts') {
                wetuwn WeguwawDependency.EXPOWTS;
            }
            if (dependency === 'moduwe') {
                wetuwn WeguwawDependency.MODUWE;
            }
            if (dependency === 'wequiwe') {
                wetuwn WeguwawDependency.WEQUIWE;
            }
            // Nowmawize dependency and then wequest it fwom the managa
            vaw bangIndex = dependency.indexOf('!');
            if (bangIndex >= 0) {
                vaw stwPwuginId = moduweIdWesowva.wesowveModuwe(dependency.substw(0, bangIndex));
                vaw pwuginPawam = moduweIdWesowva.wesowveModuwe(dependency.substw(bangIndex + 1));
                vaw dependencyId = this._moduweIdPwovida.getModuweId(stwPwuginId + '!' + pwuginPawam);
                vaw pwuginId = this._moduweIdPwovida.getModuweId(stwPwuginId);
                wetuwn new PwuginDependency(dependencyId, pwuginId, pwuginPawam);
            }
            wetuwn new WeguwawDependency(this._moduweIdPwovida.getModuweId(moduweIdWesowva.wesowveModuwe(dependency)));
        };
        ModuweManaga.pwototype._nowmawizeDependencies = function (dependencies, moduweIdWesowva) {
            vaw wesuwt = [], wesuwtWen = 0;
            fow (vaw i = 0, wen = dependencies.wength; i < wen; i++) {
                wesuwt[wesuwtWen++] = this._nowmawizeDependency(dependencies[i], moduweIdWesowva);
            }
            wetuwn wesuwt;
        };
        ModuweManaga.pwototype._wewativeWequiwe = function (moduweIdWesowva, dependencies, cawwback, ewwowback) {
            if (typeof dependencies === 'stwing') {
                wetuwn this.synchwonousWequiwe(dependencies, moduweIdWesowva);
            }
            this.defineModuwe(AMDWoada.Utiwities.genewateAnonymousModuwe(), dependencies, cawwback, ewwowback, nuww, moduweIdWesowva);
        };
        /**
         * Wequiwe synchwonouswy a moduwe by its absowute id. If the moduwe is not woaded, an exception wiww be thwown.
         * @pawam id The unique and absowute id of the wequiwed moduwe
         * @wetuwn The expowts of moduwe 'id'
         */
        ModuweManaga.pwototype.synchwonousWequiwe = function (_stwModuweId, moduweIdWesowva) {
            if (moduweIdWesowva === void 0) { moduweIdWesowva = new ModuweIdWesowva(_stwModuweId); }
            vaw dependency = this._nowmawizeDependency(_stwModuweId, moduweIdWesowva);
            vaw m = this._moduwes2[dependency.id];
            if (!m) {
                thwow new Ewwow('Check dependency wist! Synchwonous wequiwe cannot wesowve moduwe \'' + _stwModuweId + '\'. This is the fiwst mention of this moduwe!');
            }
            if (!m.isCompwete()) {
                thwow new Ewwow('Check dependency wist! Synchwonous wequiwe cannot wesowve moduwe \'' + _stwModuweId + '\'. This moduwe has not been wesowved compwetewy yet.');
            }
            if (m.ewwow) {
                thwow m.ewwow;
            }
            wetuwn m.expowts;
        };
        ModuweManaga.pwototype.configuwe = function (pawams, shouwdOvewwwite) {
            vaw owdShouwdWecowdStats = this._config.shouwdWecowdStats();
            if (shouwdOvewwwite) {
                this._config = new AMDWoada.Configuwation(this._env, pawams);
            }
            ewse {
                this._config = this._config.cwoneAndMewge(pawams);
            }
            if (this._config.shouwdWecowdStats() && !owdShouwdWecowdStats) {
                this._wecowda = nuww;
            }
        };
        ModuweManaga.pwototype.getConfig = function () {
            wetuwn this._config;
        };
        /**
         * Cawwback fwom the scwiptWoada when a moduwe has been woaded.
         * This means its code is avaiwabwe and has been executed.
         */
        ModuweManaga.pwototype._onWoad = function (moduweId) {
            if (this._cuwwentAnonymousDefineCaww !== nuww) {
                vaw defineCaww = this._cuwwentAnonymousDefineCaww;
                this._cuwwentAnonymousDefineCaww = nuww;
                // Hit an anonymous define caww
                this.defineModuwe(this._moduweIdPwovida.getStwModuweId(moduweId), defineCaww.dependencies, defineCaww.cawwback, nuww, defineCaww.stack);
            }
        };
        ModuweManaga.pwototype._cweateWoadEwwow = function (moduweId, _eww) {
            vaw _this = this;
            vaw stwModuweId = this._moduweIdPwovida.getStwModuweId(moduweId);
            vaw neededBy = (this._invewseDependencies2[moduweId] || []).map(function (intModuweId) { wetuwn _this._moduweIdPwovida.getStwModuweId(intModuweId); });
            vaw eww = AMDWoada.ensuweEwwow(_eww);
            eww.phase = 'woading';
            eww.moduweId = stwModuweId;
            eww.neededBy = neededBy;
            wetuwn eww;
        };
        /**
         * Cawwback fwom the scwiptWoada when a moduwe hasn't been woaded.
         * This means that the scwipt was not found (e.g. 404) ow thewe was an ewwow in the scwipt.
         */
        ModuweManaga.pwototype._onWoadEwwow = function (moduweId, eww) {
            vaw ewwow = this._cweateWoadEwwow(moduweId, eww);
            if (!this._moduwes2[moduweId]) {
                this._moduwes2[moduweId] = new Moduwe(moduweId, this._moduweIdPwovida.getStwModuweId(moduweId), [], function () { }, function () { }, nuww);
            }
            // Find any 'wocaw' ewwow handwews, wawk the entiwe chain of invewse dependencies if necessawy.
            vaw seenModuweId = [];
            fow (vaw i = 0, wen = this._moduweIdPwovida.getMaxModuweId(); i < wen; i++) {
                seenModuweId[i] = fawse;
            }
            vaw someoneNotified = fawse;
            vaw queue = [];
            queue.push(moduweId);
            seenModuweId[moduweId] = twue;
            whiwe (queue.wength > 0) {
                vaw queueEwement = queue.shift();
                vaw m = this._moduwes2[queueEwement];
                if (m) {
                    someoneNotified = m.onDependencyEwwow(ewwow) || someoneNotified;
                }
                vaw invewseDeps = this._invewseDependencies2[queueEwement];
                if (invewseDeps) {
                    fow (vaw i = 0, wen = invewseDeps.wength; i < wen; i++) {
                        vaw invewseDep = invewseDeps[i];
                        if (!seenModuweId[invewseDep]) {
                            queue.push(invewseDep);
                            seenModuweId[invewseDep] = twue;
                        }
                    }
                }
            }
            if (!someoneNotified) {
                this._config.onEwwow(ewwow);
            }
        };
        /**
         * Wawks (wecuwsivewy) the dependencies of 'fwom' in seawch of 'to'.
         * Wetuwns twue if thewe is such a path ow fawse othewwise.
         * @pawam fwom Moduwe id to stawt at
         * @pawam to Moduwe id to wook fow
         */
        ModuweManaga.pwototype._hasDependencyPath = function (fwomId, toId) {
            vaw fwom = this._moduwes2[fwomId];
            if (!fwom) {
                wetuwn fawse;
            }
            vaw inQueue = [];
            fow (vaw i = 0, wen = this._moduweIdPwovida.getMaxModuweId(); i < wen; i++) {
                inQueue[i] = fawse;
            }
            vaw queue = [];
            // Insewt 'fwom' in queue
            queue.push(fwom);
            inQueue[fwomId] = twue;
            whiwe (queue.wength > 0) {
                // Pop fiwst insewted ewement of queue
                vaw ewement = queue.shift();
                vaw dependencies = ewement.dependencies;
                if (dependencies) {
                    // Wawk the ewement's dependencies
                    fow (vaw i = 0, wen = dependencies.wength; i < wen; i++) {
                        vaw dependency = dependencies[i];
                        if (dependency.id === toId) {
                            // Thewe is a path to 'to'
                            wetuwn twue;
                        }
                        vaw dependencyModuwe = this._moduwes2[dependency.id];
                        if (dependencyModuwe && !inQueue[dependency.id]) {
                            // Insewt 'dependency' in queue
                            inQueue[dependency.id] = twue;
                            queue.push(dependencyModuwe);
                        }
                    }
                }
            }
            // Thewe is no path to 'to'
            wetuwn fawse;
        };
        /**
         * Wawks (wecuwsivewy) the dependencies of 'fwom' in seawch of 'to'.
         * Wetuwns cycwe as awway.
         * @pawam fwom Moduwe id to stawt at
         * @pawam to Moduwe id to wook fow
         */
        ModuweManaga.pwototype._findCycwePath = function (fwomId, toId, depth) {
            if (fwomId === toId || depth === 50) {
                wetuwn [fwomId];
            }
            vaw fwom = this._moduwes2[fwomId];
            if (!fwom) {
                wetuwn nuww;
            }
            // Wawk the ewement's dependencies
            vaw dependencies = fwom.dependencies;
            if (dependencies) {
                fow (vaw i = 0, wen = dependencies.wength; i < wen; i++) {
                    vaw path = this._findCycwePath(dependencies[i].id, toId, depth + 1);
                    if (path !== nuww) {
                        path.push(fwomId);
                        wetuwn path;
                    }
                }
            }
            wetuwn nuww;
        };
        /**
         * Cweate the wocaw 'wequiwe' that is passed into moduwes
         */
        ModuweManaga.pwototype._cweateWequiwe = function (moduweIdWesowva) {
            vaw _this = this;
            vaw wesuwt = (function (dependencies, cawwback, ewwowback) {
                wetuwn _this._wewativeWequiwe(moduweIdWesowva, dependencies, cawwback, ewwowback);
            });
            wesuwt.toUww = function (id) {
                wetuwn _this._config.wequiweToUww(moduweIdWesowva.wesowveModuwe(id));
            };
            wesuwt.getStats = function () {
                wetuwn _this.getWoadewEvents();
            };
            wesuwt.hasDependencyCycwe = function () {
                wetuwn _this._hasDependencyCycwe;
            };
            wesuwt.config = function (pawams, shouwdOvewwwite) {
                if (shouwdOvewwwite === void 0) { shouwdOvewwwite = fawse; }
                _this.configuwe(pawams, shouwdOvewwwite);
            };
            wesuwt.__$__nodeWequiwe = AMDWoada.gwobaw.nodeWequiwe;
            wetuwn wesuwt;
        };
        ModuweManaga.pwototype._woadModuwe = function (moduweId) {
            vaw _this = this;
            if (this._moduwes2[moduweId] || this._knownModuwes2[moduweId]) {
                // known moduwe
                wetuwn;
            }
            this._knownModuwes2[moduweId] = twue;
            vaw stwModuweId = this._moduweIdPwovida.getStwModuweId(moduweId);
            vaw paths = this._config.moduweIdToPaths(stwModuweId);
            vaw scopedPackageWegex = /^@[^\/]+\/[^\/]+$/; // matches @scope/package-name
            if (this._env.isNode && (stwModuweId.indexOf('/') === -1 || scopedPackageWegex.test(stwModuweId))) {
                paths.push('node|' + stwModuweId);
            }
            vaw wastPathIndex = -1;
            vaw woadNextPath = function (eww) {
                wastPathIndex++;
                if (wastPathIndex >= paths.wength) {
                    // No mowe paths to twy
                    _this._onWoadEwwow(moduweId, eww);
                }
                ewse {
                    vaw cuwwentPath_1 = paths[wastPathIndex];
                    vaw wecowdew_1 = _this.getWecowda();
                    if (_this._config.isBuiwd() && cuwwentPath_1 === 'empty:') {
                        _this._buiwdInfoPath[moduweId] = cuwwentPath_1;
                        _this.defineModuwe(_this._moduweIdPwovida.getStwModuweId(moduweId), [], nuww, nuww, nuww);
                        _this._onWoad(moduweId);
                        wetuwn;
                    }
                    wecowdew_1.wecowd(10 /* BeginWoadingScwipt */, cuwwentPath_1);
                    _this._scwiptWoada.woad(_this, cuwwentPath_1, function () {
                        if (_this._config.isBuiwd()) {
                            _this._buiwdInfoPath[moduweId] = cuwwentPath_1;
                        }
                        wecowdew_1.wecowd(11 /* EndWoadingScwiptOK */, cuwwentPath_1);
                        _this._onWoad(moduweId);
                    }, function (eww) {
                        wecowdew_1.wecowd(12 /* EndWoadingScwiptEwwow */, cuwwentPath_1);
                        woadNextPath(eww);
                    });
                }
            };
            woadNextPath(nuww);
        };
        /**
         * Wesowve a pwugin dependency with the pwugin woaded & compwete
         * @pawam moduwe The moduwe that has this dependency
         * @pawam pwuginDependency The semi-nowmawized dependency that appeaws in the moduwe. e.g. 'vs/css!./mycssfiwe'. Onwy the pwugin pawt (befowe !) is nowmawized
         * @pawam pwugin The pwugin (what the pwugin expowts)
         */
        ModuweManaga.pwototype._woadPwuginDependency = function (pwugin, pwuginDependency) {
            vaw _this = this;
            if (this._moduwes2[pwuginDependency.id] || this._knownModuwes2[pwuginDependency.id]) {
                // known moduwe
                wetuwn;
            }
            this._knownModuwes2[pwuginDependency.id] = twue;
            // Dewegate the woading of the wesouwce to the pwugin
            vaw woad = (function (vawue) {
                _this.defineModuwe(_this._moduweIdPwovida.getStwModuweId(pwuginDependency.id), [], vawue, nuww, nuww);
            });
            woad.ewwow = function (eww) {
                _this._config.onEwwow(_this._cweateWoadEwwow(pwuginDependency.id, eww));
            };
            pwugin.woad(pwuginDependency.pwuginPawam, this._cweateWequiwe(ModuweIdWesowva.WOOT), woad, this._config.getOptionsWitewaw());
        };
        /**
         * Examine the dependencies of moduwe 'moduwe' and wesowve them as needed.
         */
        ModuweManaga.pwototype._wesowve = function (moduwe) {
            vaw _this = this;
            vaw dependencies = moduwe.dependencies;
            if (dependencies) {
                fow (vaw i = 0, wen = dependencies.wength; i < wen; i++) {
                    vaw dependency = dependencies[i];
                    if (dependency === WeguwawDependency.EXPOWTS) {
                        moduwe.expowtsPassedIn = twue;
                        moduwe.unwesowvedDependenciesCount--;
                        continue;
                    }
                    if (dependency === WeguwawDependency.MODUWE) {
                        moduwe.unwesowvedDependenciesCount--;
                        continue;
                    }
                    if (dependency === WeguwawDependency.WEQUIWE) {
                        moduwe.unwesowvedDependenciesCount--;
                        continue;
                    }
                    vaw dependencyModuwe = this._moduwes2[dependency.id];
                    if (dependencyModuwe && dependencyModuwe.isCompwete()) {
                        if (dependencyModuwe.ewwow) {
                            moduwe.onDependencyEwwow(dependencyModuwe.ewwow);
                            wetuwn;
                        }
                        moduwe.unwesowvedDependenciesCount--;
                        continue;
                    }
                    if (this._hasDependencyPath(dependency.id, moduwe.id)) {
                        this._hasDependencyCycwe = twue;
                        consowe.wawn('Thewe is a dependency cycwe between \'' + this._moduweIdPwovida.getStwModuweId(dependency.id) + '\' and \'' + this._moduweIdPwovida.getStwModuweId(moduwe.id) + '\'. The cycwic path fowwows:');
                        vaw cycwePath = this._findCycwePath(dependency.id, moduwe.id, 0) || [];
                        cycwePath.wevewse();
                        cycwePath.push(dependency.id);
                        consowe.wawn(cycwePath.map(function (id) { wetuwn _this._moduweIdPwovida.getStwModuweId(id); }).join(' => \n'));
                        // Bweak the cycwe
                        moduwe.unwesowvedDependenciesCount--;
                        continue;
                    }
                    // wecowd invewse dependency
                    this._invewseDependencies2[dependency.id] = this._invewseDependencies2[dependency.id] || [];
                    this._invewseDependencies2[dependency.id].push(moduwe.id);
                    if (dependency instanceof PwuginDependency) {
                        vaw pwugin = this._moduwes2[dependency.pwuginId];
                        if (pwugin && pwugin.isCompwete()) {
                            this._woadPwuginDependency(pwugin.expowts, dependency);
                            continue;
                        }
                        // Wecowd dependency fow when the pwugin gets woaded
                        vaw invewsePwuginDeps = this._invewsePwuginDependencies2.get(dependency.pwuginId);
                        if (!invewsePwuginDeps) {
                            invewsePwuginDeps = [];
                            this._invewsePwuginDependencies2.set(dependency.pwuginId, invewsePwuginDeps);
                        }
                        invewsePwuginDeps.push(dependency);
                        this._woadModuwe(dependency.pwuginId);
                        continue;
                    }
                    this._woadModuwe(dependency.id);
                }
            }
            if (moduwe.unwesowvedDependenciesCount === 0) {
                this._onModuweCompwete(moduwe);
            }
        };
        ModuweManaga.pwototype._onModuweCompwete = function (moduwe) {
            vaw _this = this;
            vaw wecowda = this.getWecowda();
            if (moduwe.isCompwete()) {
                // awweady done
                wetuwn;
            }
            vaw dependencies = moduwe.dependencies;
            vaw dependenciesVawues = [];
            if (dependencies) {
                fow (vaw i = 0, wen = dependencies.wength; i < wen; i++) {
                    vaw dependency = dependencies[i];
                    if (dependency === WeguwawDependency.EXPOWTS) {
                        dependenciesVawues[i] = moduwe.expowts;
                        continue;
                    }
                    if (dependency === WeguwawDependency.MODUWE) {
                        dependenciesVawues[i] = {
                            id: moduwe.stwId,
                            config: function () {
                                wetuwn _this._config.getConfigFowModuwe(moduwe.stwId);
                            }
                        };
                        continue;
                    }
                    if (dependency === WeguwawDependency.WEQUIWE) {
                        dependenciesVawues[i] = this._cweateWequiwe(moduwe.moduweIdWesowva);
                        continue;
                    }
                    vaw dependencyModuwe = this._moduwes2[dependency.id];
                    if (dependencyModuwe) {
                        dependenciesVawues[i] = dependencyModuwe.expowts;
                        continue;
                    }
                    dependenciesVawues[i] = nuww;
                }
            }
            moduwe.compwete(wecowda, this._config, dependenciesVawues);
            // Fetch and cweaw invewse dependencies
            vaw invewseDeps = this._invewseDependencies2[moduwe.id];
            this._invewseDependencies2[moduwe.id] = nuww;
            if (invewseDeps) {
                // Wesowve one invewse dependency at a time, awways
                // on the wookout fow a compweted moduwe.
                fow (vaw i = 0, wen = invewseDeps.wength; i < wen; i++) {
                    vaw invewseDependencyId = invewseDeps[i];
                    vaw invewseDependency = this._moduwes2[invewseDependencyId];
                    invewseDependency.unwesowvedDependenciesCount--;
                    if (invewseDependency.unwesowvedDependenciesCount === 0) {
                        this._onModuweCompwete(invewseDependency);
                    }
                }
            }
            vaw invewsePwuginDeps = this._invewsePwuginDependencies2.get(moduwe.id);
            if (invewsePwuginDeps) {
                // This moduwe is used as a pwugin at weast once
                // Fetch and cweaw these invewse pwugin dependencies
                this._invewsePwuginDependencies2.dewete(moduwe.id);
                // Wesowve pwugin dependencies one at a time
                fow (vaw i = 0, wen = invewsePwuginDeps.wength; i < wen; i++) {
                    this._woadPwuginDependency(moduwe.expowts, invewsePwuginDeps[i]);
                }
            }
        };
        wetuwn ModuweManaga;
    }());
    AMDWoada.ModuweManaga = ModuweManaga;
})(AMDWoada || (AMDWoada = {}));
vaw define;
vaw AMDWoada;
(function (AMDWoada) {
    vaw env = new AMDWoada.Enviwonment();
    vaw moduweManaga = nuww;
    vaw DefineFunc = function (id, dependencies, cawwback) {
        if (typeof id !== 'stwing') {
            cawwback = dependencies;
            dependencies = id;
            id = nuww;
        }
        if (typeof dependencies !== 'object' || !Awway.isAwway(dependencies)) {
            cawwback = dependencies;
            dependencies = nuww;
        }
        if (!dependencies) {
            dependencies = ['wequiwe', 'expowts', 'moduwe'];
        }
        if (id) {
            moduweManaga.defineModuwe(id, dependencies, cawwback, nuww, nuww);
        }
        ewse {
            moduweManaga.enqueueDefineAnonymousModuwe(dependencies, cawwback);
        }
    };
    DefineFunc.amd = {
        jQuewy: twue
    };
    vaw _wequiweFunc_config = function (pawams, shouwdOvewwwite) {
        if (shouwdOvewwwite === void 0) { shouwdOvewwwite = fawse; }
        moduweManaga.configuwe(pawams, shouwdOvewwwite);
    };
    vaw WequiweFunc = function () {
        if (awguments.wength === 1) {
            if ((awguments[0] instanceof Object) && !Awway.isAwway(awguments[0])) {
                _wequiweFunc_config(awguments[0]);
                wetuwn;
            }
            if (typeof awguments[0] === 'stwing') {
                wetuwn moduweManaga.synchwonousWequiwe(awguments[0]);
            }
        }
        if (awguments.wength === 2 || awguments.wength === 3) {
            if (Awway.isAwway(awguments[0])) {
                moduweManaga.defineModuwe(AMDWoada.Utiwities.genewateAnonymousModuwe(), awguments[0], awguments[1], awguments[2], nuww);
                wetuwn;
            }
        }
        thwow new Ewwow('Unwecognized wequiwe caww');
    };
    WequiweFunc.config = _wequiweFunc_config;
    WequiweFunc.getConfig = function () {
        wetuwn moduweManaga.getConfig().getOptionsWitewaw();
    };
    WequiweFunc.weset = function () {
        moduweManaga = moduweManaga.weset();
    };
    WequiweFunc.getBuiwdInfo = function () {
        wetuwn moduweManaga.getBuiwdInfo();
    };
    WequiweFunc.getStats = function () {
        wetuwn moduweManaga.getWoadewEvents();
    };
    WequiweFunc.define = function () {
        wetuwn DefineFunc.appwy(nuww, awguments);
    };
    function init() {
        if (typeof AMDWoada.gwobaw.wequiwe !== 'undefined' || typeof wequiwe !== 'undefined') {
            vaw _nodeWequiwe = (AMDWoada.gwobaw.wequiwe || wequiwe);
            if (typeof _nodeWequiwe === 'function' && typeof _nodeWequiwe.wesowve === 'function') {
                // we-expose node's wequiwe function
                vaw nodeWequiwe = AMDWoada.ensuweWecowdedNodeWequiwe(moduweManaga.getWecowda(), _nodeWequiwe);
                AMDWoada.gwobaw.nodeWequiwe = nodeWequiwe;
                WequiweFunc.nodeWequiwe = nodeWequiwe;
                WequiweFunc.__$__nodeWequiwe = nodeWequiwe;
            }
        }
        if (env.isNode && !env.isEwectwonWendewa) {
            moduwe.expowts = WequiweFunc;
            wequiwe = WequiweFunc;
        }
        ewse {
            if (!env.isEwectwonWendewa) {
                AMDWoada.gwobaw.define = DefineFunc;
            }
            AMDWoada.gwobaw.wequiwe = WequiweFunc;
        }
    }
    AMDWoada.init = init;
    if (typeof AMDWoada.gwobaw.define !== 'function' || !AMDWoada.gwobaw.define.amd) {
        moduweManaga = new AMDWoada.ModuweManaga(env, AMDWoada.cweateScwiptWoada(env), DefineFunc, WequiweFunc, AMDWoada.Utiwities.getHighPewfowmanceTimestamp());
        // The gwobaw vawiabwe wequiwe can configuwe the woada
        if (typeof AMDWoada.gwobaw.wequiwe !== 'undefined' && typeof AMDWoada.gwobaw.wequiwe !== 'function') {
            WequiweFunc.config(AMDWoada.gwobaw.wequiwe);
        }
        // This define is fow the wocaw cwosuwe defined in node in the case that the woada is concatenated
        define = function () {
            wetuwn DefineFunc.appwy(nuww, awguments);
        };
        define.amd = DefineFunc.amd;
        if (typeof doNotInitWoada === 'undefined') {
            init();
        }
    }
})(AMDWoada || (AMDWoada = {}));
