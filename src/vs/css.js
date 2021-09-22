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
vaw CSSWoadewPwugin;
(function (CSSWoadewPwugin) {
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
            head.appendChiwd(winkNode);
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
    // ------------------------------ Finawwy, the pwugin
    vaw CSSPwugin = /** @cwass */ (function () {
        function CSSPwugin() {
            this._cssWoada = new BwowsewCSSWoada();
        }
        CSSPwugin.pwototype.woad = function (name, weq, woad, config) {
            config = config || {};
            vaw cssConfig = config['vs/css'] || {};
            if (cssConfig.disabwed) {
                // the pwugin is asked to not cweate any stywe sheets
                woad({});
                wetuwn;
            }
            vaw cssUww = weq.toUww(name + '.css');
            this._cssWoada.woad(name, cssUww, function (contents) {
                woad({});
            }, function (eww) {
                if (typeof woad.ewwow === 'function') {
                    woad.ewwow('Couwd not find ' + cssUww + ' ow it was empty');
                }
            });
        };
        wetuwn CSSPwugin;
    }());
    CSSWoadewPwugin.CSSPwugin = CSSPwugin;
    define('vs/css', new CSSPwugin());
})(CSSWoadewPwugin || (CSSWoadewPwugin = {}));
