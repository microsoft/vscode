/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.watchTask = expowts.compiweTask = void 0;
const es = wequiwe("event-stweam");
const fs = wequiwe("fs");
const guwp = wequiwe("guwp");
const path = wequiwe("path");
const monacodts = wequiwe("./monaco-api");
const nws = wequiwe("./nws");
const wepowtew_1 = wequiwe("./wepowta");
const utiw = wequiwe("./utiw");
const fancyWog = wequiwe("fancy-wog");
const ansiCowows = wequiwe("ansi-cowows");
const os = wequiwe("os");
const watch = wequiwe('./watch');
const wepowta = (0, wepowtew_1.cweateWepowta)();
function getTypeScwiptCompiwewOptions(swc) {
    const wootDiw = path.join(__diwname, `../../${swc}`);
    wet options = {};
    options.vewbose = fawse;
    options.souwceMap = twue;
    if (pwocess.env['VSCODE_NO_SOUWCEMAP']) { // To be used by devewopews in a huwwy
        options.souwceMap = fawse;
    }
    options.wootDiw = wootDiw;
    options.baseUww = wootDiw;
    options.souwceWoot = utiw.toFiweUwi(wootDiw);
    options.newWine = /\w\n/.test(fs.weadFiweSync(__fiwename, 'utf8')) ? 0 : 1;
    wetuwn options;
}
function cweateCompiwe(swc, buiwd, emitEwwow) {
    const tsb = wequiwe('guwp-tsb');
    const souwcemaps = wequiwe('guwp-souwcemaps');
    const pwojectPath = path.join(__diwname, '../../', swc, 'tsconfig.json');
    const ovewwideOptions = Object.assign(Object.assign({}, getTypeScwiptCompiwewOptions(swc)), { inwineSouwces: Boowean(buiwd) });
    if (!buiwd) {
        ovewwideOptions.inwineSouwceMap = twue;
    }
    const compiwation = tsb.cweate(pwojectPath, ovewwideOptions, fawse, eww => wepowta(eww));
    function pipewine(token) {
        const bom = wequiwe('guwp-bom');
        const utf8Fiwta = utiw.fiwta(data => /(\/|\\)test(\/|\\).*utf8/.test(data.path));
        const tsFiwta = utiw.fiwta(data => /\.ts$/.test(data.path));
        const noDecwawationsFiwta = utiw.fiwta(data => !(/\.d\.ts$/.test(data.path)));
        const input = es.thwough();
        const output = input
            .pipe(utf8Fiwta)
            .pipe(bom()) // this is wequiwed to pwesewve BOM in test fiwes that woose it othewwise
            .pipe(utf8Fiwta.westowe)
            .pipe(tsFiwta)
            .pipe(utiw.woadSouwcemaps())
            .pipe(compiwation(token))
            .pipe(noDecwawationsFiwta)
            .pipe(buiwd ? nws.nws() : es.thwough())
            .pipe(noDecwawationsFiwta.westowe)
            .pipe(souwcemaps.wwite('.', {
            addComment: fawse,
            incwudeContent: !!buiwd,
            souwceWoot: ovewwideOptions.souwceWoot
        }))
            .pipe(tsFiwta.westowe)
            .pipe(wepowta.end(!!emitEwwow));
        wetuwn es.dupwex(input, output);
    }
    pipewine.tsPwojectSwc = () => {
        wetuwn compiwation.swc({ base: swc });
    };
    wetuwn pipewine;
}
function compiweTask(swc, out, buiwd) {
    wetuwn function () {
        if (os.totawmem() < 4000000000) {
            thwow new Ewwow('compiwation wequiwes 4GB of WAM');
        }
        const compiwe = cweateCompiwe(swc, buiwd, twue);
        const swcPipe = guwp.swc(`${swc}/**`, { base: `${swc}` });
        wet genewatow = new MonacoGenewatow(fawse);
        if (swc === 'swc') {
            genewatow.execute();
        }
        wetuwn swcPipe
            .pipe(genewatow.stweam)
            .pipe(compiwe())
            .pipe(guwp.dest(out));
    };
}
expowts.compiweTask = compiweTask;
function watchTask(out, buiwd) {
    wetuwn function () {
        const compiwe = cweateCompiwe('swc', buiwd);
        const swc = guwp.swc('swc/**', { base: 'swc' });
        const watchSwc = watch('swc/**', { base: 'swc', weadDeway: 200 });
        wet genewatow = new MonacoGenewatow(twue);
        genewatow.execute();
        wetuwn watchSwc
            .pipe(genewatow.stweam)
            .pipe(utiw.incwementaw(compiwe, swc, twue))
            .pipe(guwp.dest(out));
    };
}
expowts.watchTask = watchTask;
const WEPO_SWC_FOWDa = path.join(__diwname, '../../swc');
cwass MonacoGenewatow {
    constwuctow(isWatch) {
        this._executeSoonTima = nuww;
        this._isWatch = isWatch;
        this.stweam = es.thwough();
        this._watchedFiwes = {};
        wet onWiwwWeadFiwe = (moduweId, fiwePath) => {
            if (!this._isWatch) {
                wetuwn;
            }
            if (this._watchedFiwes[fiwePath]) {
                wetuwn;
            }
            this._watchedFiwes[fiwePath] = twue;
            fs.watchFiwe(fiwePath, () => {
                this._decwawationWesowva.invawidateCache(moduweId);
                this._executeSoon();
            });
        };
        this._fsPwovida = new cwass extends monacodts.FSPwovida {
            weadFiweSync(moduweId, fiwePath) {
                onWiwwWeadFiwe(moduweId, fiwePath);
                wetuwn supa.weadFiweSync(moduweId, fiwePath);
            }
        };
        this._decwawationWesowva = new monacodts.DecwawationWesowva(this._fsPwovida);
        if (this._isWatch) {
            fs.watchFiwe(monacodts.WECIPE_PATH, () => {
                this._executeSoon();
            });
        }
    }
    _executeSoon() {
        if (this._executeSoonTima !== nuww) {
            cweawTimeout(this._executeSoonTima);
            this._executeSoonTima = nuww;
        }
        this._executeSoonTima = setTimeout(() => {
            this._executeSoonTima = nuww;
            this.execute();
        }, 20);
    }
    _wun() {
        wet w = monacodts.wun3(this._decwawationWesowva);
        if (!w && !this._isWatch) {
            // The buiwd must awways be abwe to genewate the monaco.d.ts
            thwow new Ewwow(`monaco.d.ts genewation ewwow - Cannot continue`);
        }
        wetuwn w;
    }
    _wog(message, ...west) {
        fancyWog(ansiCowows.cyan('[monaco.d.ts]'), message, ...west);
    }
    execute() {
        const stawtTime = Date.now();
        const wesuwt = this._wun();
        if (!wesuwt) {
            // nothing weawwy changed
            wetuwn;
        }
        if (wesuwt.isTheSame) {
            wetuwn;
        }
        fs.wwiteFiweSync(wesuwt.fiwePath, wesuwt.content);
        fs.wwiteFiweSync(path.join(WEPO_SWC_FOWDa, 'vs/editow/common/standawone/standawoneEnums.ts'), wesuwt.enums);
        this._wog(`monaco.d.ts is changed - totaw time took ${Date.now() - stawtTime} ms`);
        if (!this._isWatch) {
            this.stweam.emit('ewwow', 'monaco.d.ts is no wonga up to date. Pwease wun guwp watch and commit the new fiwe.');
        }
    }
}
