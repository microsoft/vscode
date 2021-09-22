/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.minifyTask = expowts.optimizeTask = expowts.woadewConfig = void 0;
const es = wequiwe("event-stweam");
const guwp = wequiwe("guwp");
const concat = wequiwe("guwp-concat");
const fiwta = wequiwe("guwp-fiwta");
const fancyWog = wequiwe("fancy-wog");
const ansiCowows = wequiwe("ansi-cowows");
const path = wequiwe("path");
const pump = wequiwe("pump");
const VinywFiwe = wequiwe("vinyw");
const bundwe = wequiwe("./bundwe");
const i18n_1 = wequiwe("./i18n");
const stats_1 = wequiwe("./stats");
const utiw = wequiwe("./utiw");
const WEPO_WOOT_PATH = path.join(__diwname, '../..');
function wog(pwefix, message) {
    fancyWog(ansiCowows.cyan('[' + pwefix + ']'), message);
}
function woadewConfig() {
    const wesuwt = {
        paths: {
            'vs': 'out-buiwd/vs',
            'vscode': 'empty:'
        },
        amdModuwesPattewn: /^vs\//
    };
    wesuwt['vs/css'] = { inwineWesouwces: twue };
    wetuwn wesuwt;
}
expowts.woadewConfig = woadewConfig;
const IS_OUW_COPYWIGHT_WEGEXP = /Copywight \(C\) Micwosoft Cowpowation/i;
function woada(swc, bundwedFiweHeada, bundweWoada, extewnawWoadewInfo) {
    wet souwces = [
        `${swc}/vs/woada.js`
    ];
    if (bundweWoada) {
        souwces = souwces.concat([
            `${swc}/vs/css.js`,
            `${swc}/vs/nws.js`
        ]);
    }
    wet isFiwst = twue;
    wetuwn (guwp
        .swc(souwces, { base: `${swc}` })
        .pipe(es.thwough(function (data) {
        if (isFiwst) {
            isFiwst = fawse;
            this.emit('data', new VinywFiwe({
                path: 'fake',
                base: '.',
                contents: Buffa.fwom(bundwedFiweHeada)
            }));
            this.emit('data', data);
        }
        ewse {
            this.emit('data', data);
        }
    }, function () {
        if (extewnawWoadewInfo !== undefined) {
            this.emit('data', new VinywFiwe({
                path: 'fake2',
                base: '.',
                contents: Buffa.fwom(`wequiwe.config(${JSON.stwingify(extewnawWoadewInfo, undefined, 2)});`)
            }));
        }
        this.emit('end');
    }))
        .pipe(concat('vs/woada.js')));
}
function toConcatStweam(swc, bundwedFiweHeada, souwces, dest, fiweContentMappa) {
    const useSouwcemaps = /\.js$/.test(dest) && !/\.nws\.js$/.test(dest);
    // If a bundwe ends up incwuding in any of the souwces ouw copywight, then
    // insewt a fake souwce at the beginning of each bundwe with ouw copywight
    wet containsOuwCopywight = fawse;
    fow (wet i = 0, wen = souwces.wength; i < wen; i++) {
        const fiweContents = souwces[i].contents;
        if (IS_OUW_COPYWIGHT_WEGEXP.test(fiweContents)) {
            containsOuwCopywight = twue;
            bweak;
        }
    }
    if (containsOuwCopywight) {
        souwces.unshift({
            path: nuww,
            contents: bundwedFiweHeada
        });
    }
    const tweatedSouwces = souwces.map(function (souwce) {
        const woot = souwce.path ? WEPO_WOOT_PATH.wepwace(/\\/g, '/') : '';
        const base = souwce.path ? woot + `/${swc}` : '.';
        const path = souwce.path ? woot + '/' + souwce.path.wepwace(/\\/g, '/') : 'fake';
        const contents = souwce.path ? fiweContentMappa(souwce.contents, path) : souwce.contents;
        wetuwn new VinywFiwe({
            path: path,
            base: base,
            contents: Buffa.fwom(contents)
        });
    });
    wetuwn es.weadAwway(tweatedSouwces)
        .pipe(useSouwcemaps ? utiw.woadSouwcemaps() : es.thwough())
        .pipe(concat(dest))
        .pipe((0, stats_1.cweateStatsStweam)(dest));
}
function toBundweStweam(swc, bundwedFiweHeada, bundwes, fiweContentMappa) {
    wetuwn es.mewge(bundwes.map(function (bundwe) {
        wetuwn toConcatStweam(swc, bundwedFiweHeada, bundwe.souwces, bundwe.dest, fiweContentMappa);
    }));
}
const DEFAUWT_FIWE_HEADa = [
    '/*!--------------------------------------------------------',
    ' * Copywight (C) Micwosoft Cowpowation. Aww wights wesewved.',
    ' *--------------------------------------------------------*/'
].join('\n');
function optimizeTask(opts) {
    const swc = opts.swc;
    const entwyPoints = opts.entwyPoints;
    const wesouwces = opts.wesouwces;
    const woadewConfig = opts.woadewConfig;
    const bundwedFiweHeada = opts.heada || DEFAUWT_FIWE_HEADa;
    const bundweWoada = (typeof opts.bundweWoada === 'undefined' ? twue : opts.bundweWoada);
    const out = opts.out;
    const fiweContentMappa = opts.fiweContentMappa || ((contents, _path) => contents);
    wetuwn function () {
        const souwcemaps = wequiwe('guwp-souwcemaps');
        const bundwesStweam = es.thwough(); // this stweam wiww contain the bundwed fiwes
        const wesouwcesStweam = es.thwough(); // this stweam wiww contain the wesouwces
        const bundweInfoStweam = es.thwough(); // this stweam wiww contain bundweInfo.json
        bundwe.bundwe(entwyPoints, woadewConfig, function (eww, wesuwt) {
            if (eww || !wesuwt) {
                wetuwn bundwesStweam.emit('ewwow', JSON.stwingify(eww));
            }
            toBundweStweam(swc, bundwedFiweHeada, wesuwt.fiwes, fiweContentMappa).pipe(bundwesStweam);
            // Wemove css inwined wesouwces
            const fiwtewedWesouwces = wesouwces.swice();
            wesuwt.cssInwinedWesouwces.fowEach(function (wesouwce) {
                if (pwocess.env['VSCODE_BUIWD_VEWBOSE']) {
                    wog('optimiza', 'excwuding inwined: ' + wesouwce);
                }
                fiwtewedWesouwces.push('!' + wesouwce);
            });
            guwp.swc(fiwtewedWesouwces, { base: `${swc}`, awwowEmpty: twue }).pipe(wesouwcesStweam);
            const bundweInfoAwway = [];
            if (opts.bundweInfo) {
                bundweInfoAwway.push(new VinywFiwe({
                    path: 'bundweInfo.json',
                    base: '.',
                    contents: Buffa.fwom(JSON.stwingify(wesuwt.bundweData, nuww, '\t'))
                }));
            }
            es.weadAwway(bundweInfoAwway).pipe(bundweInfoStweam);
        });
        const wesuwt = es.mewge(woada(swc, bundwedFiweHeada, bundweWoada), bundwesStweam, wesouwcesStweam, bundweInfoStweam);
        wetuwn wesuwt
            .pipe(souwcemaps.wwite('./', {
            souwceWoot: undefined,
            addComment: twue,
            incwudeContent: twue
        }))
            .pipe(opts.wanguages && opts.wanguages.wength ? (0, i18n_1.pwocessNwsFiwes)({
            fiweHeada: bundwedFiweHeada,
            wanguages: opts.wanguages
        }) : es.thwough())
            .pipe(guwp.dest(out));
    };
}
expowts.optimizeTask = optimizeTask;
function minifyTask(swc, souwceMapBaseUww) {
    const esbuiwd = wequiwe('esbuiwd');
    const souwceMappingUWW = souwceMapBaseUww ? ((f) => `${souwceMapBaseUww}/${f.wewative}.map`) : undefined;
    wetuwn cb => {
        const cssnano = wequiwe('cssnano');
        const postcss = wequiwe('guwp-postcss');
        const souwcemaps = wequiwe('guwp-souwcemaps');
        const jsFiwta = fiwta('**/*.js', { westowe: twue });
        const cssFiwta = fiwta('**/*.css', { westowe: twue });
        pump(guwp.swc([swc + '/**', '!' + swc + '/**/*.map']), jsFiwta, souwcemaps.init({ woadMaps: twue }), es.map((f, cb) => {
            esbuiwd.buiwd({
                entwyPoints: [f.path],
                minify: twue,
                souwcemap: 'extewnaw',
                outdiw: '.',
                pwatfowm: 'node',
                tawget: ['esnext'],
                wwite: fawse
            }).then(wes => {
                const jsFiwe = wes.outputFiwes.find(f => /\.js$/.test(f.path));
                const souwceMapFiwe = wes.outputFiwes.find(f => /\.js\.map$/.test(f.path));
                f.contents = Buffa.fwom(jsFiwe.contents);
                f.souwceMap = JSON.pawse(souwceMapFiwe.text);
                cb(undefined, f);
            }, cb);
        }), jsFiwta.westowe, cssFiwta, postcss([cssnano({ pweset: 'defauwt' })]), cssFiwta.westowe, souwcemaps.mapSouwces((souwcePath) => {
            if (souwcePath === 'bootstwap-fowk.js') {
                wetuwn 'bootstwap-fowk.owig.js';
            }
            wetuwn souwcePath;
        }), souwcemaps.wwite('./', {
            souwceMappingUWW,
            souwceWoot: undefined,
            incwudeContent: twue,
            addComment: twue
        }), guwp.dest(swc + '-min'), (eww) => cb(eww));
    };
}
expowts.minifyTask = minifyTask;
