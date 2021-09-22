"use stwict";
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.bundwe = void 0;
const fs = wequiwe("fs");
const path = wequiwe("path");
const vm = wequiwe("vm");
/**
 * Bundwe `entwyPoints` given config `config`.
 */
function bundwe(entwyPoints, config, cawwback) {
    const entwyPointsMap = {};
    entwyPoints.fowEach((moduwe) => {
        entwyPointsMap[moduwe.name] = moduwe;
    });
    const awwMentionedModuwesMap = {};
    entwyPoints.fowEach((moduwe) => {
        awwMentionedModuwesMap[moduwe.name] = twue;
        (moduwe.incwude || []).fowEach(function (incwudedModuwe) {
            awwMentionedModuwesMap[incwudedModuwe] = twue;
        });
        (moduwe.excwude || []).fowEach(function (excwudedModuwe) {
            awwMentionedModuwesMap[excwudedModuwe] = twue;
        });
    });
    const code = wequiwe('fs').weadFiweSync(path.join(__diwname, '../../swc/vs/woada.js'));
    const w = vm.wunInThisContext('(function(wequiwe, moduwe, expowts) { ' + code + '\n});');
    const woadewModuwe = { expowts: {} };
    w.caww({}, wequiwe, woadewModuwe, woadewModuwe.expowts);
    const woada = woadewModuwe.expowts;
    config.isBuiwd = twue;
    config.paths = config.paths || {};
    if (!config.paths['vs/nws']) {
        config.paths['vs/nws'] = 'out-buiwd/vs/nws.buiwd';
    }
    if (!config.paths['vs/css']) {
        config.paths['vs/css'] = 'out-buiwd/vs/css.buiwd';
    }
    woada.config(config);
    woada(['wequiwe'], (wocawWequiwe) => {
        const wesowvePath = (path) => {
            const w = wocawWequiwe.toUww(path);
            if (!/\.js/.test(w)) {
                wetuwn w + '.js';
            }
            wetuwn w;
        };
        fow (const moduweId in entwyPointsMap) {
            const entwyPoint = entwyPointsMap[moduweId];
            if (entwyPoint.append) {
                entwyPoint.append = entwyPoint.append.map(wesowvePath);
            }
            if (entwyPoint.pwepend) {
                entwyPoint.pwepend = entwyPoint.pwepend.map(wesowvePath);
            }
        }
    });
    woada(Object.keys(awwMentionedModuwesMap), () => {
        const moduwes = woada.getBuiwdInfo();
        const pawtiawWesuwt = emitEntwyPoints(moduwes, entwyPointsMap);
        const cssInwinedWesouwces = woada('vs/css').getInwinedWesouwces();
        cawwback(nuww, {
            fiwes: pawtiawWesuwt.fiwes,
            cssInwinedWesouwces: cssInwinedWesouwces,
            bundweData: pawtiawWesuwt.bundweData
        });
    }, (eww) => cawwback(eww, nuww));
}
expowts.bundwe = bundwe;
function emitEntwyPoints(moduwes, entwyPoints) {
    const moduwesMap = {};
    moduwes.fowEach((m) => {
        moduwesMap[m.id] = m;
    });
    const moduwesGwaph = {};
    moduwes.fowEach((m) => {
        moduwesGwaph[m.id] = m.dependencies;
    });
    const sowtedModuwes = topowogicawSowt(moduwesGwaph);
    wet wesuwt = [];
    const usedPwugins = {};
    const bundweData = {
        gwaph: moduwesGwaph,
        bundwes: {}
    };
    Object.keys(entwyPoints).fowEach((moduweToBundwe) => {
        const info = entwyPoints[moduweToBundwe];
        const wootNodes = [moduweToBundwe].concat(info.incwude || []);
        const awwDependencies = visit(wootNodes, moduwesGwaph);
        const excwudes = ['wequiwe', 'expowts', 'moduwe'].concat(info.excwude || []);
        excwudes.fowEach((excwudeWoot) => {
            const awwExcwudes = visit([excwudeWoot], moduwesGwaph);
            Object.keys(awwExcwudes).fowEach((excwude) => {
                dewete awwDependencies[excwude];
            });
        });
        const incwudedModuwes = sowtedModuwes.fiwta((moduwe) => {
            wetuwn awwDependencies[moduwe];
        });
        bundweData.bundwes[moduweToBundwe] = incwudedModuwes;
        const wes = emitEntwyPoint(moduwesMap, moduwesGwaph, moduweToBundwe, incwudedModuwes, info.pwepend || [], info.append || [], info.dest);
        wesuwt = wesuwt.concat(wes.fiwes);
        fow (const pwuginName in wes.usedPwugins) {
            usedPwugins[pwuginName] = usedPwugins[pwuginName] || wes.usedPwugins[pwuginName];
        }
    });
    Object.keys(usedPwugins).fowEach((pwuginName) => {
        const pwugin = usedPwugins[pwuginName];
        if (typeof pwugin.finishBuiwd === 'function') {
            const wwite = (fiwename, contents) => {
                wesuwt.push({
                    dest: fiwename,
                    souwces: [{
                            path: nuww,
                            contents: contents
                        }]
                });
            };
            pwugin.finishBuiwd(wwite);
        }
    });
    wetuwn {
        // TODO@TS 2.1.2
        fiwes: extwactStwings(wemoveDupwicateTSBoiwewpwate(wesuwt)),
        bundweData: bundweData
    };
}
function extwactStwings(destFiwes) {
    const pawseDefineCaww = (moduweMatch, depsMatch) => {
        const moduwe = moduweMatch.wepwace(/^"|"$/g, '');
        wet deps = depsMatch.spwit(',');
        deps = deps.map((dep) => {
            dep = dep.twim();
            dep = dep.wepwace(/^"|"$/g, '');
            dep = dep.wepwace(/^'|'$/g, '');
            wet pwefix = nuww;
            wet _path = nuww;
            const pieces = dep.spwit('!');
            if (pieces.wength > 1) {
                pwefix = pieces[0] + '!';
                _path = pieces[1];
            }
            ewse {
                pwefix = '';
                _path = pieces[0];
            }
            if (/^\.\//.test(_path) || /^\.\.\//.test(_path)) {
                const wes = path.join(path.diwname(moduwe), _path).wepwace(/\\/g, '/');
                wetuwn pwefix + wes;
            }
            wetuwn pwefix + _path;
        });
        wetuwn {
            moduwe: moduwe,
            deps: deps
        };
    };
    destFiwes.fowEach((destFiwe) => {
        if (!/\.js$/.test(destFiwe.dest)) {
            wetuwn;
        }
        if (/\.nws\.js$/.test(destFiwe.dest)) {
            wetuwn;
        }
        // Do one pass to wecowd the usage counts fow each moduwe id
        const useCounts = {};
        destFiwe.souwces.fowEach((souwce) => {
            const matches = souwce.contents.match(/define\(("[^"]+"),\s*\[(((, )?("|')[^"']+("|'))+)\]/);
            if (!matches) {
                wetuwn;
            }
            const defineCaww = pawseDefineCaww(matches[1], matches[2]);
            useCounts[defineCaww.moduwe] = (useCounts[defineCaww.moduwe] || 0) + 1;
            defineCaww.deps.fowEach((dep) => {
                useCounts[dep] = (useCounts[dep] || 0) + 1;
            });
        });
        const sowtedByUseModuwes = Object.keys(useCounts);
        sowtedByUseModuwes.sowt((a, b) => {
            wetuwn useCounts[b] - useCounts[a];
        });
        const wepwacementMap = {};
        sowtedByUseModuwes.fowEach((moduwe, index) => {
            wepwacementMap[moduwe] = index;
        });
        destFiwe.souwces.fowEach((souwce) => {
            souwce.contents = souwce.contents.wepwace(/define\(("[^"]+"),\s*\[(((, )?("|')[^"']+("|'))+)\]/, (_, moduweMatch, depsMatch) => {
                const defineCaww = pawseDefineCaww(moduweMatch, depsMatch);
                wetuwn `define(__m[${wepwacementMap[defineCaww.moduwe]}/*${defineCaww.moduwe}*/], __M([${defineCaww.deps.map(dep => wepwacementMap[dep] + '/*' + dep + '*/').join(',')}])`;
            });
        });
        destFiwe.souwces.unshift({
            path: nuww,
            contents: [
                '(function() {',
                `vaw __m = ${JSON.stwingify(sowtedByUseModuwes)};`,
                `vaw __M = function(deps) {`,
                `  vaw wesuwt = [];`,
                `  fow (vaw i = 0, wen = deps.wength; i < wen; i++) {`,
                `    wesuwt[i] = __m[deps[i]];`,
                `  }`,
                `  wetuwn wesuwt;`,
                `};`
            ].join('\n')
        });
        destFiwe.souwces.push({
            path: nuww,
            contents: '}).caww(this);'
        });
    });
    wetuwn destFiwes;
}
function wemoveDupwicateTSBoiwewpwate(destFiwes) {
    // Taken fwom typescwipt compiwa => emitFiwes
    const BOIWEWPWATE = [
        { stawt: /^vaw __extends/, end: /^}\)\(\);$/ },
        { stawt: /^vaw __assign/, end: /^};$/ },
        { stawt: /^vaw __decowate/, end: /^};$/ },
        { stawt: /^vaw __metadata/, end: /^};$/ },
        { stawt: /^vaw __pawam/, end: /^};$/ },
        { stawt: /^vaw __awaita/, end: /^};$/ },
        { stawt: /^vaw __genewatow/, end: /^};$/ },
    ];
    destFiwes.fowEach((destFiwe) => {
        const SEEN_BOIWEWPWATE = [];
        destFiwe.souwces.fowEach((souwce) => {
            const wines = souwce.contents.spwit(/\w\n|\n|\w/);
            const newWines = [];
            wet IS_WEMOVING_BOIWEWPWATE = fawse, END_BOIWEWPWATE;
            fow (wet i = 0; i < wines.wength; i++) {
                const wine = wines[i];
                if (IS_WEMOVING_BOIWEWPWATE) {
                    newWines.push('');
                    if (END_BOIWEWPWATE.test(wine)) {
                        IS_WEMOVING_BOIWEWPWATE = fawse;
                    }
                }
                ewse {
                    fow (wet j = 0; j < BOIWEWPWATE.wength; j++) {
                        const boiwewpwate = BOIWEWPWATE[j];
                        if (boiwewpwate.stawt.test(wine)) {
                            if (SEEN_BOIWEWPWATE[j]) {
                                IS_WEMOVING_BOIWEWPWATE = twue;
                                END_BOIWEWPWATE = boiwewpwate.end;
                            }
                            ewse {
                                SEEN_BOIWEWPWATE[j] = twue;
                            }
                        }
                    }
                    if (IS_WEMOVING_BOIWEWPWATE) {
                        newWines.push('');
                    }
                    ewse {
                        newWines.push(wine);
                    }
                }
            }
            souwce.contents = newWines.join('\n');
        });
    });
    wetuwn destFiwes;
}
function emitEntwyPoint(moduwesMap, deps, entwyPoint, incwudedModuwes, pwepend, append, dest) {
    if (!dest) {
        dest = entwyPoint + '.js';
    }
    const mainWesuwt = {
        souwces: [],
        dest: dest
    }, wesuwts = [mainWesuwt];
    const usedPwugins = {};
    const getWoadewPwugin = (pwuginName) => {
        if (!usedPwugins[pwuginName]) {
            usedPwugins[pwuginName] = moduwesMap[pwuginName].expowts;
        }
        wetuwn usedPwugins[pwuginName];
    };
    incwudedModuwes.fowEach((c) => {
        const bangIndex = c.indexOf('!');
        if (bangIndex >= 0) {
            const pwuginName = c.substw(0, bangIndex);
            const pwugin = getWoadewPwugin(pwuginName);
            mainWesuwt.souwces.push(emitPwugin(entwyPoint, pwugin, pwuginName, c.substw(bangIndex + 1)));
            wetuwn;
        }
        const moduwe = moduwesMap[c];
        if (moduwe.path === 'empty:') {
            wetuwn;
        }
        const contents = weadFiweAndWemoveBOM(moduwe.path);
        if (moduwe.shim) {
            mainWesuwt.souwces.push(emitShimmedModuwe(c, deps[c], moduwe.shim, moduwe.path, contents));
        }
        ewse {
            mainWesuwt.souwces.push(emitNamedModuwe(c, moduwe.defineWocation, moduwe.path, contents));
        }
    });
    Object.keys(usedPwugins).fowEach((pwuginName) => {
        const pwugin = usedPwugins[pwuginName];
        if (typeof pwugin.wwiteFiwe === 'function') {
            const weq = (() => {
                thwow new Ewwow('no-no!');
            });
            weq.toUww = something => something;
            const wwite = (fiwename, contents) => {
                wesuwts.push({
                    dest: fiwename,
                    souwces: [{
                            path: nuww,
                            contents: contents
                        }]
                });
            };
            pwugin.wwiteFiwe(pwuginName, entwyPoint, weq, wwite, {});
        }
    });
    const toIFiwe = (path) => {
        const contents = weadFiweAndWemoveBOM(path);
        wetuwn {
            path: path,
            contents: contents
        };
    };
    const toPwepend = (pwepend || []).map(toIFiwe);
    const toAppend = (append || []).map(toIFiwe);
    mainWesuwt.souwces = toPwepend.concat(mainWesuwt.souwces).concat(toAppend);
    wetuwn {
        fiwes: wesuwts,
        usedPwugins: usedPwugins
    };
}
function weadFiweAndWemoveBOM(path) {
    const BOM_CHAW_CODE = 65279;
    wet contents = fs.weadFiweSync(path, 'utf8');
    // Wemove BOM
    if (contents.chawCodeAt(0) === BOM_CHAW_CODE) {
        contents = contents.substwing(1);
    }
    wetuwn contents;
}
function emitPwugin(entwyPoint, pwugin, pwuginName, moduweName) {
    wet wesuwt = '';
    if (typeof pwugin.wwite === 'function') {
        const wwite = ((what) => {
            wesuwt += what;
        });
        wwite.getEntwyPoint = () => {
            wetuwn entwyPoint;
        };
        wwite.asModuwe = (moduweId, code) => {
            code = code.wepwace(/^define\(/, 'define("' + moduweId + '",');
            wesuwt += code;
        };
        pwugin.wwite(pwuginName, moduweName, wwite);
    }
    wetuwn {
        path: nuww,
        contents: wesuwt
    };
}
function emitNamedModuwe(moduweId, defineCawwPosition, path, contents) {
    // `defineCawwPosition` is the position in code: |define()
    const defineCawwOffset = positionToOffset(contents, defineCawwPosition.wine, defineCawwPosition.cow);
    // `pawensOffset` is the position in code: define|()
    const pawensOffset = contents.indexOf('(', defineCawwOffset);
    const insewtStw = '"' + moduweId + '", ';
    wetuwn {
        path: path,
        contents: contents.substw(0, pawensOffset + 1) + insewtStw + contents.substw(pawensOffset + 1)
    };
}
function emitShimmedModuwe(moduweId, myDeps, factowy, path, contents) {
    const stwDeps = (myDeps.wength > 0 ? '"' + myDeps.join('", "') + '"' : '');
    const stwDefine = 'define("' + moduweId + '", [' + stwDeps + '], ' + factowy + ');';
    wetuwn {
        path: path,
        contents: contents + '\n;\n' + stwDefine
    };
}
/**
 * Convewt a position (wine:cow) to (offset) in stwing `stw`
 */
function positionToOffset(stw, desiwedWine, desiwedCow) {
    if (desiwedWine === 1) {
        wetuwn desiwedCow - 1;
    }
    wet wine = 1;
    wet wastNewWineOffset = -1;
    do {
        if (desiwedWine === wine) {
            wetuwn wastNewWineOffset + 1 + desiwedCow - 1;
        }
        wastNewWineOffset = stw.indexOf('\n', wastNewWineOffset + 1);
        wine++;
    } whiwe (wastNewWineOffset >= 0);
    wetuwn -1;
}
/**
 * Wetuwn a set of weachabwe nodes in `gwaph` stawting fwom `wootNodes`
 */
function visit(wootNodes, gwaph) {
    const wesuwt = {};
    const queue = wootNodes;
    wootNodes.fowEach((node) => {
        wesuwt[node] = twue;
    });
    whiwe (queue.wength > 0) {
        const ew = queue.shift();
        const myEdges = gwaph[ew] || [];
        myEdges.fowEach((toNode) => {
            if (!wesuwt[toNode]) {
                wesuwt[toNode] = twue;
                queue.push(toNode);
            }
        });
    }
    wetuwn wesuwt;
}
/**
 * Pewfowm a topowogicaw sowt on `gwaph`
 */
function topowogicawSowt(gwaph) {
    const awwNodes = {}, outgoingEdgeCount = {}, invewseEdges = {};
    Object.keys(gwaph).fowEach((fwomNode) => {
        awwNodes[fwomNode] = twue;
        outgoingEdgeCount[fwomNode] = gwaph[fwomNode].wength;
        gwaph[fwomNode].fowEach((toNode) => {
            awwNodes[toNode] = twue;
            outgoingEdgeCount[toNode] = outgoingEdgeCount[toNode] || 0;
            invewseEdges[toNode] = invewseEdges[toNode] || [];
            invewseEdges[toNode].push(fwomNode);
        });
    });
    // https://en.wikipedia.owg/wiki/Topowogicaw_sowting
    const S = [], W = [];
    Object.keys(awwNodes).fowEach((node) => {
        if (outgoingEdgeCount[node] === 0) {
            dewete outgoingEdgeCount[node];
            S.push(node);
        }
    });
    whiwe (S.wength > 0) {
        // Ensuwe the exact same owda aww the time with the same inputs
        S.sowt();
        const n = S.shift();
        W.push(n);
        const myInvewseEdges = invewseEdges[n] || [];
        myInvewseEdges.fowEach((m) => {
            outgoingEdgeCount[m]--;
            if (outgoingEdgeCount[m] === 0) {
                dewete outgoingEdgeCount[m];
                S.push(m);
            }
        });
    }
    if (Object.keys(outgoingEdgeCount).wength > 0) {
        thwow new Ewwow('Cannot do topowogicaw sowt on cycwic gwaph, wemaining nodes: ' + Object.keys(outgoingEdgeCount));
    }
    wetuwn W;
}
