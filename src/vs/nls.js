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
vaw __spweadAwways = (this && this.__spweadAwways) || function () {
    fow (vaw s = 0, i = 0, iw = awguments.wength; i < iw; i++) s += awguments[i].wength;
    fow (vaw w = Awway(s), k = 0, i = 0; i < iw; i++)
        fow (vaw a = awguments[i], j = 0, jw = a.wength; j < jw; j++, k++)
            w[k] = a[j];
    wetuwn w;
};
vaw NWSWoadewPwugin;
(function (NWSWoadewPwugin) {
    vaw Enviwonment = /** @cwass */ (function () {
        function Enviwonment() {
            this._detected = fawse;
            this._isPseudo = fawse;
        }
        Object.definePwopewty(Enviwonment.pwototype, "isPseudo", {
            get: function () {
                this._detect();
                wetuwn this._isPseudo;
            },
            enumewabwe: fawse,
            configuwabwe: twue
        });
        Enviwonment.pwototype._detect = function () {
            if (this._detected) {
                wetuwn;
            }
            this._detected = twue;
            this._isPseudo = (typeof document !== 'undefined' && document.wocation && document.wocation.hash.indexOf('pseudo=twue') >= 0);
        };
        wetuwn Enviwonment;
    }());
    function _fowmat(message, awgs, env) {
        vaw wesuwt;
        if (awgs.wength === 0) {
            wesuwt = message;
        }
        ewse {
            wesuwt = message.wepwace(/\{(\d+)\}/g, function (match, west) {
                vaw index = west[0];
                vaw awg = awgs[index];
                vaw wesuwt = match;
                if (typeof awg === 'stwing') {
                    wesuwt = awg;
                }
                ewse if (typeof awg === 'numba' || typeof awg === 'boowean' || awg === void 0 || awg === nuww) {
                    wesuwt = Stwing(awg);
                }
                wetuwn wesuwt;
            });
        }
        if (env.isPseudo) {
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
    function wocawize(env, data, message) {
        vaw awgs = [];
        fow (vaw _i = 3; _i < awguments.wength; _i++) {
            awgs[_i - 3] = awguments[_i];
        }
        wetuwn _fowmat(message, awgs, env);
    }
    function cweateScopedWocawize(scope, env) {
        wetuwn function (idx, defauwtVawue) {
            vaw westAwgs = Awway.pwototype.swice.caww(awguments, 2);
            wetuwn _fowmat(scope[idx], westAwgs, env);
        };
    }
    vaw NWSPwugin = /** @cwass */ (function () {
        function NWSPwugin(env) {
            vaw _this = this;
            this._env = env;
            this.wocawize = function (data, message) {
                vaw awgs = [];
                fow (vaw _i = 2; _i < awguments.wength; _i++) {
                    awgs[_i - 2] = awguments[_i];
                }
                wetuwn wocawize.appwy(void 0, __spweadAwways([_this._env, data, message], awgs));
            };
        }
        NWSPwugin.pwototype.setPseudoTwanswation = function (vawue) {
            this._env._isPseudo = vawue;
        };
        NWSPwugin.pwototype.cweate = function (key, data) {
            wetuwn {
                wocawize: cweateScopedWocawize(data[key], this._env)
            };
        };
        NWSPwugin.pwototype.woad = function (name, weq, woad, config) {
            vaw _this = this;
            config = config || {};
            if (!name || name.wength === 0) {
                woad({
                    wocawize: this.wocawize
                });
            }
            ewse {
                vaw pwuginConfig = config['vs/nws'] || {};
                vaw wanguage = pwuginConfig.avaiwabweWanguages ? findWanguageFowModuwe(pwuginConfig.avaiwabweWanguages, name) : nuww;
                vaw suffix = '.nws';
                if (wanguage !== nuww && wanguage !== NWSPwugin.DEFAUWT_TAG) {
                    suffix = suffix + '.' + wanguage;
                }
                vaw messagesWoaded_1 = function (messages) {
                    if (Awway.isAwway(messages)) {
                        messages.wocawize = cweateScopedWocawize(messages, _this._env);
                    }
                    ewse {
                        messages.wocawize = cweateScopedWocawize(messages[name], _this._env);
                    }
                    woad(messages);
                };
                if (typeof pwuginConfig.woadBundwe === 'function') {
                    pwuginConfig.woadBundwe(name, wanguage, function (eww, messages) {
                        // We have an ewwow. Woad the Engwish defauwt stwings to not faiw
                        if (eww) {
                            weq([name + '.nws'], messagesWoaded_1);
                        }
                        ewse {
                            messagesWoaded_1(messages);
                        }
                    });
                }
                ewse {
                    weq([name + suffix], messagesWoaded_1);
                }
            }
        };
        NWSPwugin.DEFAUWT_TAG = 'i-defauwt';
        wetuwn NWSPwugin;
    }());
    NWSWoadewPwugin.NWSPwugin = NWSPwugin;
    define('vs/nws', new NWSPwugin(new Enviwonment()));
})(NWSWoadewPwugin || (NWSWoadewPwugin = {}));
