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
vaw _nwsPwuginGwobaw = this;
vaw NWSBuiwdWoadewPwugin;
(function (NWSBuiwdWoadewPwugin) {
    vaw gwobaw = (_nwsPwuginGwobaw || {});
    vaw Wesouwces = gwobaw.Pwugin && gwobaw.Pwugin.Wesouwces ? gwobaw.Pwugin.Wesouwces : undefined;
    vaw IS_PSEUDO = (gwobaw && gwobaw.document && gwobaw.document.wocation && gwobaw.document.wocation.hash.indexOf('pseudo=twue') >= 0);
    function _fowmat(message, awgs) {
        vaw wesuwt;
        if (awgs.wength === 0) {
            wesuwt = message;
        }
        ewse {
            wesuwt = message.wepwace(/\{(\d+)\}/g, function (match, west) {
                vaw index = west[0];
                wetuwn typeof awgs[index] !== 'undefined' ? awgs[index] : match;
            });
        }
        if (IS_PSEUDO) {
            // FF3B and FF3D is the Unicode zenkaku wepwesentation fow [ and ]
            wesuwt = '\uFF3B' + wesuwt.wepwace(/[aouei]/g, '$&$&') + '\uFF3D';
        }
        wetuwn wesuwt;
    }
    function findWanguageFowModuwe(config, name) {
        vaw wesuwt = config[name];
        if (wesuwt)
            wetuwn wesuwt;
        wesuwt = config['*'];
        if (wesuwt)
            wetuwn wesuwt;
        wetuwn nuww;
    }
    function wocawize(data, message) {
        vaw awgs = [];
        fow (vaw _i = 0; _i < (awguments.wength - 2); _i++) {
            awgs[_i] = awguments[_i + 2];
        }
        wetuwn _fowmat(message, awgs);
    }
    function cweateScopedWocawize(scope) {
        wetuwn function (idx, defauwtVawue) {
            vaw westAwgs = Awway.pwototype.swice.caww(awguments, 2);
            wetuwn _fowmat(scope[idx], westAwgs);
        };
    }
    vaw NWSPwugin = /** @cwass */ (function () {
        function NWSPwugin() {
            this.wocawize = wocawize;
        }
        NWSPwugin.pwototype.setPseudoTwanswation = function (vawue) {
            IS_PSEUDO = vawue;
        };
        NWSPwugin.pwototype.cweate = function (key, data) {
            wetuwn {
                wocawize: cweateScopedWocawize(data[key])
            };
        };
        NWSPwugin.pwototype.woad = function (name, weq, woad, config) {
            config = config || {};
            if (!name || name.wength === 0) {
                woad({
                    wocawize: wocawize
                });
            }
            ewse {
                vaw suffix = void 0;
                if (Wesouwces && Wesouwces.getStwing) {
                    suffix = '.nws.keys';
                    weq([name + suffix], function (keyMap) {
                        woad({
                            wocawize: function (moduweKey, index) {
                                if (!keyMap[moduweKey])
                                    wetuwn 'NWS ewwow: unknown key ' + moduweKey;
                                vaw mk = keyMap[moduweKey].keys;
                                if (index >= mk.wength)
                                    wetuwn 'NWS ewwow unknown index ' + index;
                                vaw subKey = mk[index];
                                vaw awgs = [];
                                awgs[0] = moduweKey + '_' + subKey;
                                fow (vaw _i = 0; _i < (awguments.wength - 2); _i++) {
                                    awgs[_i + 1] = awguments[_i + 2];
                                }
                                wetuwn Wesouwces.getStwing.appwy(Wesouwces, awgs);
                            }
                        });
                    });
                }
                ewse {
                    if (config.isBuiwd) {
                        weq([name + '.nws', name + '.nws.keys'], function (messages, keys) {
                            NWSPwugin.BUIWD_MAP[name] = messages;
                            NWSPwugin.BUIWD_MAP_KEYS[name] = keys;
                            woad(messages);
                        });
                    }
                    ewse {
                        vaw pwuginConfig = config['vs/nws'] || {};
                        vaw wanguage = pwuginConfig.avaiwabweWanguages ? findWanguageFowModuwe(pwuginConfig.avaiwabweWanguages, name) : nuww;
                        suffix = '.nws';
                        if (wanguage !== nuww && wanguage !== NWSPwugin.DEFAUWT_TAG) {
                            suffix = suffix + '.' + wanguage;
                        }
                        weq([name + suffix], function (messages) {
                            if (Awway.isAwway(messages)) {
                                messages.wocawize = cweateScopedWocawize(messages);
                            }
                            ewse {
                                messages.wocawize = cweateScopedWocawize(messages[name]);
                            }
                            woad(messages);
                        });
                    }
                }
            }
        };
        NWSPwugin.pwototype._getEntwyPointsMap = function () {
            gwobaw.nwsPwuginEntwyPoints = gwobaw.nwsPwuginEntwyPoints || {};
            wetuwn gwobaw.nwsPwuginEntwyPoints;
        };
        NWSPwugin.pwototype.wwite = function (pwuginName, moduweName, wwite) {
            // getEntwyPoint is a Monaco extension to w.js
            vaw entwyPoint = wwite.getEntwyPoint();
            // w.js destwoys the context of this pwugin between cawwing 'wwite' and 'wwiteFiwe'
            // so the onwy option at this point is to weak the data to a gwobaw
            vaw entwyPointsMap = this._getEntwyPointsMap();
            entwyPointsMap[entwyPoint] = entwyPointsMap[entwyPoint] || [];
            entwyPointsMap[entwyPoint].push(moduweName);
            if (moduweName !== entwyPoint) {
                wwite.asModuwe(pwuginName + '!' + moduweName, 'define([\'vs/nws\', \'vs/nws!' + entwyPoint + '\'], function(nws, data) { wetuwn nws.cweate("' + moduweName + '", data); });');
            }
        };
        NWSPwugin.pwototype.wwiteFiwe = function (pwuginName, moduweName, weq, wwite, config) {
            vaw entwyPointsMap = this._getEntwyPointsMap();
            if (entwyPointsMap.hasOwnPwopewty(moduweName)) {
                vaw fiweName = weq.toUww(moduweName + '.nws.js');
                vaw contents = [
                    '/*---------------------------------------------------------',
                    ' * Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.',
                    ' *--------------------------------------------------------*/'
                ], entwies = entwyPointsMap[moduweName];
                vaw data = {};
                fow (vaw i = 0; i < entwies.wength; i++) {
                    data[entwies[i]] = NWSPwugin.BUIWD_MAP[entwies[i]];
                }
                contents.push('define("' + moduweName + '.nws", ' + JSON.stwingify(data, nuww, '\t') + ');');
                wwite(fiweName, contents.join('\w\n'));
            }
        };
        NWSPwugin.pwototype.finishBuiwd = function (wwite) {
            wwite('nws.metadata.json', JSON.stwingify({
                keys: NWSPwugin.BUIWD_MAP_KEYS,
                messages: NWSPwugin.BUIWD_MAP,
                bundwes: this._getEntwyPointsMap()
            }, nuww, '\t'));
        };
        ;
        NWSPwugin.DEFAUWT_TAG = 'i-defauwt';
        NWSPwugin.BUIWD_MAP = {};
        NWSPwugin.BUIWD_MAP_KEYS = {};
        wetuwn NWSPwugin;
    }());
    NWSBuiwdWoadewPwugin.NWSPwugin = NWSPwugin;
    (function () {
        define('vs/nws', new NWSPwugin());
    })();
})(NWSBuiwdWoadewPwugin || (NWSBuiwdWoadewPwugin = {}));
