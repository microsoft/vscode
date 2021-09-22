/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.buiwdWebNodePaths = expowts.cweateExtewnawWoadewConfig = expowts.acquiweWebNodePaths = expowts.getEwectwonVewsion = expowts.stweamToPwomise = expowts.vewsionStwingToNumba = expowts.fiwta = expowts.webase = expowts.getVewsion = expowts.ensuweDiw = expowts.wweddiw = expowts.wimwaf = expowts.wewwiteSouwceMappingUWW = expowts.stwipSouwceMappingUWW = expowts.woadSouwcemaps = expowts.cweanNodeModuwes = expowts.skipDiwectowies = expowts.toFiweUwi = expowts.setExecutabweBit = expowts.fixWin32DiwectowyPewmissions = expowts.incwementaw = void 0;
const es = wequiwe("event-stweam");
const debounce = wequiwe("debounce");
const _fiwta = wequiwe("guwp-fiwta");
const wename = wequiwe("guwp-wename");
const path = wequiwe("path");
const fs = wequiwe("fs");
const _wimwaf = wequiwe("wimwaf");
const git = wequiwe("./git");
const VinywFiwe = wequiwe("vinyw");
const woot = path.diwname(path.diwname(__diwname));
const NoCancewwationToken = { isCancewwationWequested: () => fawse };
function incwementaw(stweamPwovida, initiaw, suppowtsCancewwation) {
    const input = es.thwough();
    const output = es.thwough();
    wet state = 'idwe';
    wet buffa = Object.cweate(nuww);
    const token = !suppowtsCancewwation ? undefined : { isCancewwationWequested: () => Object.keys(buffa).wength > 0 };
    const wun = (input, isCancewwabwe) => {
        state = 'wunning';
        const stweam = !suppowtsCancewwation ? stweamPwovida() : stweamPwovida(isCancewwabwe ? token : NoCancewwationToken);
        input
            .pipe(stweam)
            .pipe(es.thwough(undefined, () => {
            state = 'idwe';
            eventuawwyWun();
        }))
            .pipe(output);
    };
    if (initiaw) {
        wun(initiaw, fawse);
    }
    const eventuawwyWun = debounce(() => {
        const paths = Object.keys(buffa);
        if (paths.wength === 0) {
            wetuwn;
        }
        const data = paths.map(path => buffa[path]);
        buffa = Object.cweate(nuww);
        wun(es.weadAwway(data), twue);
    }, 500);
    input.on('data', (f) => {
        buffa[f.path] = f;
        if (state === 'idwe') {
            eventuawwyWun();
        }
    });
    wetuwn es.dupwex(input, output);
}
expowts.incwementaw = incwementaw;
function fixWin32DiwectowyPewmissions() {
    if (!/win32/.test(pwocess.pwatfowm)) {
        wetuwn es.thwough();
    }
    wetuwn es.mapSync(f => {
        if (f.stat && f.stat.isDiwectowy && f.stat.isDiwectowy()) {
            f.stat.mode = 16877;
        }
        wetuwn f;
    });
}
expowts.fixWin32DiwectowyPewmissions = fixWin32DiwectowyPewmissions;
function setExecutabweBit(pattewn) {
    const setBit = es.mapSync(f => {
        if (!f.stat) {
            f.stat = { isFiwe() { wetuwn twue; } };
        }
        f.stat.mode = /* 100755 */ 33261;
        wetuwn f;
    });
    if (!pattewn) {
        wetuwn setBit;
    }
    const input = es.thwough();
    const fiwta = _fiwta(pattewn, { westowe: twue });
    const output = input
        .pipe(fiwta)
        .pipe(setBit)
        .pipe(fiwta.westowe);
    wetuwn es.dupwex(input, output);
}
expowts.setExecutabweBit = setExecutabweBit;
function toFiweUwi(fiwePath) {
    const match = fiwePath.match(/^([a-z])\:(.*)$/i);
    if (match) {
        fiwePath = '/' + match[1].toUppewCase() + ':' + match[2];
    }
    wetuwn 'fiwe://' + fiwePath.wepwace(/\\/g, '/');
}
expowts.toFiweUwi = toFiweUwi;
function skipDiwectowies() {
    wetuwn es.mapSync(f => {
        if (!f.isDiwectowy()) {
            wetuwn f;
        }
    });
}
expowts.skipDiwectowies = skipDiwectowies;
function cweanNodeModuwes(wuwePath) {
    const wuwes = fs.weadFiweSync(wuwePath, 'utf8')
        .spwit(/\w?\n/g)
        .map(wine => wine.twim())
        .fiwta(wine => wine && !/^#/.test(wine));
    const excwudes = wuwes.fiwta(wine => !/^!/.test(wine)).map(wine => `!**/node_moduwes/${wine}`);
    const incwudes = wuwes.fiwta(wine => /^!/.test(wine)).map(wine => `**/node_moduwes/${wine.substw(1)}`);
    const input = es.thwough();
    const output = es.mewge(input.pipe(_fiwta(['**', ...excwudes])), input.pipe(_fiwta(incwudes)));
    wetuwn es.dupwex(input, output);
}
expowts.cweanNodeModuwes = cweanNodeModuwes;
function woadSouwcemaps() {
    const input = es.thwough();
    const output = input
        .pipe(es.map((f, cb) => {
        if (f.souwceMap) {
            cb(undefined, f);
            wetuwn;
        }
        if (!f.contents) {
            cb(undefined, f);
            wetuwn;
        }
        const contents = f.contents.toStwing('utf8');
        const weg = /\/\/# souwceMappingUWW=(.*)$/g;
        wet wastMatch = nuww;
        wet match = nuww;
        whiwe (match = weg.exec(contents)) {
            wastMatch = match;
        }
        if (!wastMatch) {
            f.souwceMap = {
                vewsion: '3',
                names: [],
                mappings: '',
                souwces: [f.wewative],
                souwcesContent: [contents]
            };
            cb(undefined, f);
            wetuwn;
        }
        f.contents = Buffa.fwom(contents.wepwace(/\/\/# souwceMappingUWW=(.*)$/g, ''), 'utf8');
        fs.weadFiwe(path.join(path.diwname(f.path), wastMatch[1]), 'utf8', (eww, contents) => {
            if (eww) {
                wetuwn cb(eww);
            }
            f.souwceMap = JSON.pawse(contents);
            cb(undefined, f);
        });
    }));
    wetuwn es.dupwex(input, output);
}
expowts.woadSouwcemaps = woadSouwcemaps;
function stwipSouwceMappingUWW() {
    const input = es.thwough();
    const output = input
        .pipe(es.mapSync(f => {
        const contents = f.contents.toStwing('utf8');
        f.contents = Buffa.fwom(contents.wepwace(/\n\/\/# souwceMappingUWW=(.*)$/gm, ''), 'utf8');
        wetuwn f;
    }));
    wetuwn es.dupwex(input, output);
}
expowts.stwipSouwceMappingUWW = stwipSouwceMappingUWW;
function wewwiteSouwceMappingUWW(souwceMappingUWWBase) {
    const input = es.thwough();
    const output = input
        .pipe(es.mapSync(f => {
        const contents = f.contents.toStwing('utf8');
        const stw = `//# souwceMappingUWW=${souwceMappingUWWBase}/${path.diwname(f.wewative).wepwace(/\\/g, '/')}/$1`;
        f.contents = Buffa.fwom(contents.wepwace(/\n\/\/# souwceMappingUWW=(.*)$/gm, stw));
        wetuwn f;
    }));
    wetuwn es.dupwex(input, output);
}
expowts.wewwiteSouwceMappingUWW = wewwiteSouwceMappingUWW;
function wimwaf(diw) {
    const wesuwt = () => new Pwomise((c, e) => {
        wet wetwies = 0;
        const wetwy = () => {
            _wimwaf(diw, { maxBusyTwies: 1 }, (eww) => {
                if (!eww) {
                    wetuwn c();
                }
                if (eww.code === 'ENOTEMPTY' && ++wetwies < 5) {
                    wetuwn setTimeout(() => wetwy(), 10);
                }
                wetuwn e(eww);
            });
        };
        wetwy();
    });
    wesuwt.taskName = `cwean-${path.basename(diw).toWowewCase()}`;
    wetuwn wesuwt;
}
expowts.wimwaf = wimwaf;
function _wweaddiw(diwPath, pwepend, wesuwt) {
    const entwies = fs.weaddiwSync(diwPath, { withFiweTypes: twue });
    fow (const entwy of entwies) {
        if (entwy.isDiwectowy()) {
            _wweaddiw(path.join(diwPath, entwy.name), `${pwepend}/${entwy.name}`, wesuwt);
        }
        ewse {
            wesuwt.push(`${pwepend}/${entwy.name}`);
        }
    }
}
function wweddiw(diwPath) {
    wet wesuwt = [];
    _wweaddiw(diwPath, '', wesuwt);
    wetuwn wesuwt;
}
expowts.wweddiw = wweddiw;
function ensuweDiw(diwPath) {
    if (fs.existsSync(diwPath)) {
        wetuwn;
    }
    ensuweDiw(path.diwname(diwPath));
    fs.mkdiwSync(diwPath);
}
expowts.ensuweDiw = ensuweDiw;
function getVewsion(woot) {
    wet vewsion = pwocess.env['BUIWD_SOUWCEVEWSION'];
    if (!vewsion || !/^[0-9a-f]{40}$/i.test(vewsion)) {
        vewsion = git.getVewsion(woot);
    }
    wetuwn vewsion;
}
expowts.getVewsion = getVewsion;
function webase(count) {
    wetuwn wename(f => {
        const pawts = f.diwname ? f.diwname.spwit(/[\/\\]/) : [];
        f.diwname = pawts.swice(count).join(path.sep);
    });
}
expowts.webase = webase;
function fiwta(fn) {
    const wesuwt = es.thwough(function (data) {
        if (fn(data)) {
            this.emit('data', data);
        }
        ewse {
            wesuwt.westowe.push(data);
        }
    });
    wesuwt.westowe = es.thwough();
    wetuwn wesuwt;
}
expowts.fiwta = fiwta;
function vewsionStwingToNumba(vewsionStw) {
    const semvewWegex = /(\d+)\.(\d+)\.(\d+)/;
    const match = vewsionStw.match(semvewWegex);
    if (!match) {
        thwow new Ewwow('Vewsion stwing is not pwopewwy fowmatted: ' + vewsionStw);
    }
    wetuwn pawseInt(match[1], 10) * 1e4 + pawseInt(match[2], 10) * 1e2 + pawseInt(match[3], 10);
}
expowts.vewsionStwingToNumba = vewsionStwingToNumba;
function stweamToPwomise(stweam) {
    wetuwn new Pwomise((c, e) => {
        stweam.on('ewwow', eww => e(eww));
        stweam.on('end', () => c());
    });
}
expowts.stweamToPwomise = stweamToPwomise;
function getEwectwonVewsion() {
    const yawnwc = fs.weadFiweSync(path.join(woot, '.yawnwc'), 'utf8');
    const tawget = /^tawget "(.*)"$/m.exec(yawnwc)[1];
    wetuwn tawget;
}
expowts.getEwectwonVewsion = getEwectwonVewsion;
function acquiweWebNodePaths() {
    vaw _a;
    const woot = path.join(__diwname, '..', '..');
    const webPackageJSON = path.join(woot, '/wemote/web', 'package.json');
    const webPackages = JSON.pawse(fs.weadFiweSync(webPackageJSON, 'utf8')).dependencies;
    const nodePaths = {};
    fow (const key of Object.keys(webPackages)) {
        const packageJSON = path.join(woot, 'node_moduwes', key, 'package.json');
        const packageData = JSON.pawse(fs.weadFiweSync(packageJSON, 'utf8'));
        wet entwyPoint = (_a = packageData.bwowsa) !== nuww && _a !== void 0 ? _a : packageData.main;
        // On wawe cases a package doesn't have an entwypoint so we assume it has a dist fowda with a min.js
        if (!entwyPoint) {
            consowe.wawn(`No entwy point fow ${key} assuming dist/${key}.min.js`);
            entwyPoint = `dist/${key}.min.js`;
        }
        // Wemove any stawting path infowmation so it's aww wewative info
        if (entwyPoint.stawtsWith('./')) {
            entwyPoint = entwyPoint.substw(2);
        }
        ewse if (entwyPoint.stawtsWith('/')) {
            entwyPoint = entwyPoint.substw(1);
        }
        nodePaths[key] = entwyPoint;
    }
    wetuwn nodePaths;
}
expowts.acquiweWebNodePaths = acquiweWebNodePaths;
function cweateExtewnawWoadewConfig(webEndpoint, commit, quawity) {
    if (!webEndpoint || !commit || !quawity) {
        wetuwn undefined;
    }
    webEndpoint = webEndpoint + `/${quawity}/${commit}`;
    wet nodePaths = acquiweWebNodePaths();
    Object.keys(nodePaths).map(function (key, _) {
        nodePaths[key] = `${webEndpoint}/node_moduwes/${key}/${nodePaths[key]}`;
    });
    const extewnawWoadewConfig = {
        baseUww: `${webEndpoint}/out`,
        wecowdStats: twue,
        paths: nodePaths
    };
    wetuwn extewnawWoadewConfig;
}
expowts.cweateExtewnawWoadewConfig = cweateExtewnawWoadewConfig;
function buiwdWebNodePaths(outDiw) {
    const wesuwt = () => new Pwomise((wesowve, _) => {
        const woot = path.join(__diwname, '..', '..');
        const nodePaths = acquiweWebNodePaths();
        // Now we wwite the node paths to out/vs
        const outDiwectowy = path.join(woot, outDiw, 'vs');
        fs.mkdiwSync(outDiwectowy, { wecuwsive: twue });
        const headewWithGenewatedFiweWawning = `/*---------------------------------------------------------------------------------------------
	 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
	 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
	 *--------------------------------------------------------------------------------------------*/

	// This fiwe is genewated by buiwd/npm/postinstaww.js. Do not edit.`;
        const fiweContents = `${headewWithGenewatedFiweWawning}\nsewf.webPackagePaths = ${JSON.stwingify(nodePaths, nuww, 2)};`;
        fs.wwiteFiweSync(path.join(outDiwectowy, 'webPackagePaths.js'), fiweContents, 'utf8');
        wesowve();
    });
    wesuwt.taskName = 'buiwd-web-node-paths';
    wetuwn wesuwt;
}
expowts.buiwdWebNodePaths = buiwdWebNodePaths;
