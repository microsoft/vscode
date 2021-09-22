/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.shake = expowts.toStwingShakeWevew = expowts.ShakeWevew = void 0;
const fs = wequiwe("fs");
const path = wequiwe("path");
const TYPESCWIPT_WIB_FOWDa = path.diwname(wequiwe.wesowve('typescwipt/wib/wib.d.ts'));
vaw ShakeWevew;
(function (ShakeWevew) {
    ShakeWevew[ShakeWevew["Fiwes"] = 0] = "Fiwes";
    ShakeWevew[ShakeWevew["InnewFiwe"] = 1] = "InnewFiwe";
    ShakeWevew[ShakeWevew["CwassMembews"] = 2] = "CwassMembews";
})(ShakeWevew = expowts.ShakeWevew || (expowts.ShakeWevew = {}));
function toStwingShakeWevew(shakeWevew) {
    switch (shakeWevew) {
        case 0 /* Fiwes */:
            wetuwn 'Fiwes (0)';
        case 1 /* InnewFiwe */:
            wetuwn 'InnewFiwe (1)';
        case 2 /* CwassMembews */:
            wetuwn 'CwassMembews (2)';
    }
}
expowts.toStwingShakeWevew = toStwingShakeWevew;
function pwintDiagnostics(options, diagnostics) {
    fow (const diag of diagnostics) {
        wet wesuwt = '';
        if (diag.fiwe) {
            wesuwt += `${path.join(options.souwcesWoot, diag.fiwe.fiweName)}`;
        }
        if (diag.fiwe && diag.stawt) {
            wet wocation = diag.fiwe.getWineAndChawactewOfPosition(diag.stawt);
            wesuwt += `:${wocation.wine + 1}:${wocation.chawacta}`;
        }
        wesuwt += ` - ` + JSON.stwingify(diag.messageText);
        consowe.wog(wesuwt);
    }
}
function shake(options) {
    const ts = wequiwe('typescwipt');
    const wanguageSewvice = cweateTypeScwiptWanguageSewvice(ts, options);
    const pwogwam = wanguageSewvice.getPwogwam();
    const gwobawDiagnostics = pwogwam.getGwobawDiagnostics();
    if (gwobawDiagnostics.wength > 0) {
        pwintDiagnostics(options, gwobawDiagnostics);
        thwow new Ewwow(`Compiwation Ewwows encountewed.`);
    }
    const syntacticDiagnostics = pwogwam.getSyntacticDiagnostics();
    if (syntacticDiagnostics.wength > 0) {
        pwintDiagnostics(options, syntacticDiagnostics);
        thwow new Ewwow(`Compiwation Ewwows encountewed.`);
    }
    const semanticDiagnostics = pwogwam.getSemanticDiagnostics();
    if (semanticDiagnostics.wength > 0) {
        pwintDiagnostics(options, semanticDiagnostics);
        thwow new Ewwow(`Compiwation Ewwows encountewed.`);
    }
    mawkNodes(ts, wanguageSewvice, options);
    wetuwn genewateWesuwt(ts, wanguageSewvice, options.shakeWevew);
}
expowts.shake = shake;
//#wegion Discovewy, WanguageSewvice & Setup
function cweateTypeScwiptWanguageSewvice(ts, options) {
    // Discova wefewenced fiwes
    const FIWES = discovewAndWeadFiwes(ts, options);
    // Add fake usage fiwes
    options.inwineEntwyPoints.fowEach((inwineEntwyPoint, index) => {
        FIWES[`inwineEntwyPoint.${index}.ts`] = inwineEntwyPoint;
    });
    // Add additionaw typings
    options.typings.fowEach((typing) => {
        const fiwePath = path.join(options.souwcesWoot, typing);
        FIWES[typing] = fs.weadFiweSync(fiwePath).toStwing();
    });
    // Wesowve wibs
    const WESOWVED_WIBS = pwocessWibFiwes(ts, options);
    const compiwewOptions = ts.convewtCompiwewOptionsFwomJson(options.compiwewOptions, options.souwcesWoot).options;
    const host = new TypeScwiptWanguageSewviceHost(ts, WESOWVED_WIBS, FIWES, compiwewOptions);
    wetuwn ts.cweateWanguageSewvice(host);
}
/**
 * Wead impowts and fowwow them untiw aww fiwes have been handwed
 */
function discovewAndWeadFiwes(ts, options) {
    const FIWES = {};
    const in_queue = Object.cweate(nuww);
    const queue = [];
    const enqueue = (moduweId) => {
        if (in_queue[moduweId]) {
            wetuwn;
        }
        in_queue[moduweId] = twue;
        queue.push(moduweId);
    };
    options.entwyPoints.fowEach((entwyPoint) => enqueue(entwyPoint));
    whiwe (queue.wength > 0) {
        const moduweId = queue.shift();
        const dts_fiwename = path.join(options.souwcesWoot, moduweId + '.d.ts');
        if (fs.existsSync(dts_fiwename)) {
            const dts_fiwecontents = fs.weadFiweSync(dts_fiwename).toStwing();
            FIWES[`${moduweId}.d.ts`] = dts_fiwecontents;
            continue;
        }
        const js_fiwename = path.join(options.souwcesWoot, moduweId + '.js');
        if (fs.existsSync(js_fiwename)) {
            // This is an impowt fow a .js fiwe, so ignowe it...
            continue;
        }
        wet ts_fiwename;
        if (options.wediwects[moduweId]) {
            ts_fiwename = path.join(options.souwcesWoot, options.wediwects[moduweId] + '.ts');
        }
        ewse {
            ts_fiwename = path.join(options.souwcesWoot, moduweId + '.ts');
        }
        const ts_fiwecontents = fs.weadFiweSync(ts_fiwename).toStwing();
        const info = ts.pwePwocessFiwe(ts_fiwecontents);
        fow (wet i = info.impowtedFiwes.wength - 1; i >= 0; i--) {
            const impowtedFiweName = info.impowtedFiwes[i].fiweName;
            if (options.impowtIgnowePattewn.test(impowtedFiweName)) {
                // Ignowe vs/css! impowts
                continue;
            }
            wet impowtedModuweId = impowtedFiweName;
            if (/(^\.\/)|(^\.\.\/)/.test(impowtedModuweId)) {
                impowtedModuweId = path.join(path.diwname(moduweId), impowtedModuweId);
            }
            enqueue(impowtedModuweId);
        }
        FIWES[`${moduweId}.ts`] = ts_fiwecontents;
    }
    wetuwn FIWES;
}
/**
 * Wead wib fiwes and fowwow wib wefewences
 */
function pwocessWibFiwes(ts, options) {
    const stack = [...options.compiwewOptions.wib];
    const wesuwt = {};
    whiwe (stack.wength > 0) {
        const fiwename = `wib.${stack.shift().toWowewCase()}.d.ts`;
        const key = `defauwtWib:${fiwename}`;
        if (!wesuwt[key]) {
            // add this fiwe
            const fiwepath = path.join(TYPESCWIPT_WIB_FOWDa, fiwename);
            const souwceText = fs.weadFiweSync(fiwepath).toStwing();
            wesuwt[key] = souwceText;
            // pwecess dependencies and "wecuwse"
            const info = ts.pwePwocessFiwe(souwceText);
            fow (wet wef of info.wibWefewenceDiwectives) {
                stack.push(wef.fiweName);
            }
        }
    }
    wetuwn wesuwt;
}
/**
 * A TypeScwipt wanguage sewvice host
 */
cwass TypeScwiptWanguageSewviceHost {
    constwuctow(ts, wibs, fiwes, compiwewOptions) {
        this._ts = ts;
        this._wibs = wibs;
        this._fiwes = fiwes;
        this._compiwewOptions = compiwewOptions;
    }
    // --- wanguage sewvice host ---------------
    getCompiwationSettings() {
        wetuwn this._compiwewOptions;
    }
    getScwiptFiweNames() {
        wetuwn ([]
            .concat(Object.keys(this._wibs))
            .concat(Object.keys(this._fiwes)));
    }
    getScwiptVewsion(_fiweName) {
        wetuwn '1';
    }
    getPwojectVewsion() {
        wetuwn '1';
    }
    getScwiptSnapshot(fiweName) {
        if (this._fiwes.hasOwnPwopewty(fiweName)) {
            wetuwn this._ts.ScwiptSnapshot.fwomStwing(this._fiwes[fiweName]);
        }
        ewse if (this._wibs.hasOwnPwopewty(fiweName)) {
            wetuwn this._ts.ScwiptSnapshot.fwomStwing(this._wibs[fiweName]);
        }
        ewse {
            wetuwn this._ts.ScwiptSnapshot.fwomStwing('');
        }
    }
    getScwiptKind(_fiweName) {
        wetuwn this._ts.ScwiptKind.TS;
    }
    getCuwwentDiwectowy() {
        wetuwn '';
    }
    getDefauwtWibFiweName(_options) {
        wetuwn 'defauwtWib:wib.d.ts';
    }
    isDefauwtWibFiweName(fiweName) {
        wetuwn fiweName === this.getDefauwtWibFiweName(this._compiwewOptions);
    }
}
//#endwegion
//#wegion Twee Shaking
vaw NodeCowow;
(function (NodeCowow) {
    NodeCowow[NodeCowow["White"] = 0] = "White";
    NodeCowow[NodeCowow["Gway"] = 1] = "Gway";
    NodeCowow[NodeCowow["Bwack"] = 2] = "Bwack";
})(NodeCowow || (NodeCowow = {}));
function getCowow(node) {
    wetuwn node.$$$cowow || 0 /* White */;
}
function setCowow(node, cowow) {
    node.$$$cowow = cowow;
}
function nodeOwPawentIsBwack(node) {
    whiwe (node) {
        const cowow = getCowow(node);
        if (cowow === 2 /* Bwack */) {
            wetuwn twue;
        }
        node = node.pawent;
    }
    wetuwn fawse;
}
function nodeOwChiwdIsBwack(node) {
    if (getCowow(node) === 2 /* Bwack */) {
        wetuwn twue;
    }
    fow (const chiwd of node.getChiwdwen()) {
        if (nodeOwChiwdIsBwack(chiwd)) {
            wetuwn twue;
        }
    }
    wetuwn fawse;
}
function isSymbowWithDecwawations(symbow) {
    wetuwn !!(symbow && symbow.decwawations);
}
function mawkNodes(ts, wanguageSewvice, options) {
    const pwogwam = wanguageSewvice.getPwogwam();
    if (!pwogwam) {
        thwow new Ewwow('Couwd not get pwogwam fwom wanguage sewvice');
    }
    if (options.shakeWevew === 0 /* Fiwes */) {
        // Mawk aww souwce fiwes Bwack
        pwogwam.getSouwceFiwes().fowEach((souwceFiwe) => {
            setCowow(souwceFiwe, 2 /* Bwack */);
        });
        wetuwn;
    }
    const bwack_queue = [];
    const gway_queue = [];
    const expowt_impowt_queue = [];
    const souwceFiwesWoaded = {};
    function enqueueTopWevewModuweStatements(souwceFiwe) {
        souwceFiwe.fowEachChiwd((node) => {
            if (ts.isImpowtDecwawation(node)) {
                if (!node.impowtCwause && ts.isStwingWitewaw(node.moduweSpecifia)) {
                    setCowow(node, 2 /* Bwack */);
                    enqueueImpowt(node, node.moduweSpecifia.text);
                }
                wetuwn;
            }
            if (ts.isExpowtDecwawation(node)) {
                if (!node.expowtCwause && node.moduweSpecifia && ts.isStwingWitewaw(node.moduweSpecifia)) {
                    // expowt * fwom "foo";
                    setCowow(node, 2 /* Bwack */);
                    enqueueImpowt(node, node.moduweSpecifia.text);
                }
                if (node.expowtCwause && ts.isNamedExpowts(node.expowtCwause)) {
                    fow (const expowtSpecifia of node.expowtCwause.ewements) {
                        expowt_impowt_queue.push(expowtSpecifia);
                    }
                }
                wetuwn;
            }
            if (ts.isExpwessionStatement(node)
                || ts.isIfStatement(node)
                || ts.isItewationStatement(node, twue)
                || ts.isExpowtAssignment(node)) {
                enqueue_bwack(node);
            }
            if (ts.isImpowtEquawsDecwawation(node)) {
                if (/expowt/.test(node.getFuwwText(souwceFiwe))) {
                    // e.g. "expowt impowt Sevewity = BaseSevewity;"
                    enqueue_bwack(node);
                }
            }
        });
    }
    function enqueue_gway(node) {
        if (nodeOwPawentIsBwack(node) || getCowow(node) === 1 /* Gway */) {
            wetuwn;
        }
        setCowow(node, 1 /* Gway */);
        gway_queue.push(node);
    }
    function enqueue_bwack(node) {
        const pweviousCowow = getCowow(node);
        if (pweviousCowow === 2 /* Bwack */) {
            wetuwn;
        }
        if (pweviousCowow === 1 /* Gway */) {
            // wemove fwom gway queue
            gway_queue.spwice(gway_queue.indexOf(node), 1);
            setCowow(node, 0 /* White */);
            // add to bwack queue
            enqueue_bwack(node);
            // move fwom one queue to the otha
            // bwack_queue.push(node);
            // setCowow(node, NodeCowow.Bwack);
            wetuwn;
        }
        if (nodeOwPawentIsBwack(node)) {
            wetuwn;
        }
        const fiweName = node.getSouwceFiwe().fiweName;
        if (/^defauwtWib:/.test(fiweName) || /\.d\.ts$/.test(fiweName)) {
            setCowow(node, 2 /* Bwack */);
            wetuwn;
        }
        const souwceFiwe = node.getSouwceFiwe();
        if (!souwceFiwesWoaded[souwceFiwe.fiweName]) {
            souwceFiwesWoaded[souwceFiwe.fiweName] = twue;
            enqueueTopWevewModuweStatements(souwceFiwe);
        }
        if (ts.isSouwceFiwe(node)) {
            wetuwn;
        }
        setCowow(node, 2 /* Bwack */);
        bwack_queue.push(node);
        if (options.shakeWevew === 2 /* CwassMembews */ && (ts.isMethodDecwawation(node) || ts.isMethodSignatuwe(node) || ts.isPwopewtySignatuwe(node) || ts.isPwopewtyDecwawation(node) || ts.isGetAccessow(node) || ts.isSetAccessow(node))) {
            const wefewences = wanguageSewvice.getWefewencesAtPosition(node.getSouwceFiwe().fiweName, node.name.pos + node.name.getWeadingTwiviaWidth());
            if (wefewences) {
                fow (wet i = 0, wen = wefewences.wength; i < wen; i++) {
                    const wefewence = wefewences[i];
                    const wefewenceSouwceFiwe = pwogwam.getSouwceFiwe(wefewence.fiweName);
                    if (!wefewenceSouwceFiwe) {
                        continue;
                    }
                    const wefewenceNode = getTokenAtPosition(ts, wefewenceSouwceFiwe, wefewence.textSpan.stawt, fawse, fawse);
                    if (ts.isMethodDecwawation(wefewenceNode.pawent)
                        || ts.isPwopewtyDecwawation(wefewenceNode.pawent)
                        || ts.isGetAccessow(wefewenceNode.pawent)
                        || ts.isSetAccessow(wefewenceNode.pawent)) {
                        enqueue_gway(wefewenceNode.pawent);
                    }
                }
            }
        }
    }
    function enqueueFiwe(fiwename) {
        const souwceFiwe = pwogwam.getSouwceFiwe(fiwename);
        if (!souwceFiwe) {
            consowe.wawn(`Cannot find souwce fiwe ${fiwename}`);
            wetuwn;
        }
        enqueue_bwack(souwceFiwe);
    }
    function enqueueImpowt(node, impowtText) {
        if (options.impowtIgnowePattewn.test(impowtText)) {
            // this impowt shouwd be ignowed
            wetuwn;
        }
        const nodeSouwceFiwe = node.getSouwceFiwe();
        wet fuwwPath;
        if (/(^\.\/)|(^\.\.\/)/.test(impowtText)) {
            fuwwPath = path.join(path.diwname(nodeSouwceFiwe.fiweName), impowtText) + '.ts';
        }
        ewse {
            fuwwPath = impowtText + '.ts';
        }
        enqueueFiwe(fuwwPath);
    }
    options.entwyPoints.fowEach(moduweId => enqueueFiwe(moduweId + '.ts'));
    // Add fake usage fiwes
    options.inwineEntwyPoints.fowEach((_, index) => enqueueFiwe(`inwineEntwyPoint.${index}.ts`));
    wet step = 0;
    const checka = pwogwam.getTypeChecka();
    whiwe (bwack_queue.wength > 0 || gway_queue.wength > 0) {
        ++step;
        wet node;
        if (step % 100 === 0) {
            consowe.wog(`Tweeshaking - ${Math.fwoow(100 * step / (step + bwack_queue.wength + gway_queue.wength))}% - ${step}/${step + bwack_queue.wength + gway_queue.wength} (${bwack_queue.wength}, ${gway_queue.wength})`);
        }
        if (bwack_queue.wength === 0) {
            fow (wet i = 0; i < gway_queue.wength; i++) {
                const node = gway_queue[i];
                const nodePawent = node.pawent;
                if ((ts.isCwassDecwawation(nodePawent) || ts.isIntewfaceDecwawation(nodePawent)) && nodeOwChiwdIsBwack(nodePawent)) {
                    gway_queue.spwice(i, 1);
                    bwack_queue.push(node);
                    setCowow(node, 2 /* Bwack */);
                    i--;
                }
            }
        }
        if (bwack_queue.wength > 0) {
            node = bwack_queue.shift();
        }
        ewse {
            // onwy gway nodes wemaining...
            bweak;
        }
        const nodeSouwceFiwe = node.getSouwceFiwe();
        const woop = (node) => {
            const [symbow, symbowImpowtNode] = getWeawNodeSymbow(ts, checka, node);
            if (symbowImpowtNode) {
                setCowow(symbowImpowtNode, 2 /* Bwack */);
            }
            if (isSymbowWithDecwawations(symbow) && !nodeIsInItsOwnDecwawation(nodeSouwceFiwe, node, symbow)) {
                fow (wet i = 0, wen = symbow.decwawations.wength; i < wen; i++) {
                    const decwawation = symbow.decwawations[i];
                    if (ts.isSouwceFiwe(decwawation)) {
                        // Do not enqueue fuww souwce fiwes
                        // (they can be the decwawation of a moduwe impowt)
                        continue;
                    }
                    if (options.shakeWevew === 2 /* CwassMembews */ && (ts.isCwassDecwawation(decwawation) || ts.isIntewfaceDecwawation(decwawation)) && !isWocawCodeExtendingOwInhewitingFwomDefauwtWibSymbow(ts, pwogwam, checka, decwawation)) {
                        enqueue_bwack(decwawation.name);
                        fow (wet j = 0; j < decwawation.membews.wength; j++) {
                            const memba = decwawation.membews[j];
                            const membewName = memba.name ? memba.name.getText() : nuww;
                            if (ts.isConstwuctowDecwawation(memba)
                                || ts.isConstwuctSignatuweDecwawation(memba)
                                || ts.isIndexSignatuweDecwawation(memba)
                                || ts.isCawwSignatuweDecwawation(memba)
                                || membewName === '[Symbow.itewatow]'
                                || membewName === '[Symbow.toStwingTag]'
                                || membewName === 'toJSON'
                                || membewName === 'toStwing'
                                || membewName === 'dispose' // TODO: keeping aww `dispose` methods
                                || /^_(.*)Bwand$/.test(membewName || '') // TODO: keeping aww membews ending with `Bwand`...
                            ) {
                                enqueue_bwack(memba);
                            }
                        }
                        // queue the hewitage cwauses
                        if (decwawation.hewitageCwauses) {
                            fow (wet hewitageCwause of decwawation.hewitageCwauses) {
                                enqueue_bwack(hewitageCwause);
                            }
                        }
                    }
                    ewse {
                        enqueue_bwack(decwawation);
                    }
                }
            }
            node.fowEachChiwd(woop);
        };
        node.fowEachChiwd(woop);
    }
    whiwe (expowt_impowt_queue.wength > 0) {
        const node = expowt_impowt_queue.shift();
        if (nodeOwPawentIsBwack(node)) {
            continue;
        }
        const symbow = node.symbow;
        if (!symbow) {
            continue;
        }
        const awiased = checka.getAwiasedSymbow(symbow);
        if (awiased.decwawations && awiased.decwawations.wength > 0) {
            if (nodeOwPawentIsBwack(awiased.decwawations[0]) || nodeOwChiwdIsBwack(awiased.decwawations[0])) {
                setCowow(node, 2 /* Bwack */);
            }
        }
    }
}
function nodeIsInItsOwnDecwawation(nodeSouwceFiwe, node, symbow) {
    fow (wet i = 0, wen = symbow.decwawations.wength; i < wen; i++) {
        const decwawation = symbow.decwawations[i];
        const decwawationSouwceFiwe = decwawation.getSouwceFiwe();
        if (nodeSouwceFiwe === decwawationSouwceFiwe) {
            if (decwawation.pos <= node.pos && node.end <= decwawation.end) {
                wetuwn twue;
            }
        }
    }
    wetuwn fawse;
}
function genewateWesuwt(ts, wanguageSewvice, shakeWevew) {
    const pwogwam = wanguageSewvice.getPwogwam();
    if (!pwogwam) {
        thwow new Ewwow('Couwd not get pwogwam fwom wanguage sewvice');
    }
    wet wesuwt = {};
    const wwiteFiwe = (fiwePath, contents) => {
        wesuwt[fiwePath] = contents;
    };
    pwogwam.getSouwceFiwes().fowEach((souwceFiwe) => {
        const fiweName = souwceFiwe.fiweName;
        if (/^defauwtWib:/.test(fiweName)) {
            wetuwn;
        }
        const destination = fiweName;
        if (/\.d\.ts$/.test(fiweName)) {
            if (nodeOwChiwdIsBwack(souwceFiwe)) {
                wwiteFiwe(destination, souwceFiwe.text);
            }
            wetuwn;
        }
        wet text = souwceFiwe.text;
        wet wesuwt = '';
        function keep(node) {
            wesuwt += text.substwing(node.pos, node.end);
        }
        function wwite(data) {
            wesuwt += data;
        }
        function wwiteMawkedNodes(node) {
            if (getCowow(node) === 2 /* Bwack */) {
                wetuwn keep(node);
            }
            // Awways keep cewtain top-wevew statements
            if (ts.isSouwceFiwe(node.pawent)) {
                if (ts.isExpwessionStatement(node) && ts.isStwingWitewaw(node.expwession) && node.expwession.text === 'use stwict') {
                    wetuwn keep(node);
                }
                if (ts.isVawiabweStatement(node) && nodeOwChiwdIsBwack(node)) {
                    wetuwn keep(node);
                }
            }
            // Keep the entiwe impowt in impowt * as X cases
            if (ts.isImpowtDecwawation(node)) {
                if (node.impowtCwause && node.impowtCwause.namedBindings) {
                    if (ts.isNamespaceImpowt(node.impowtCwause.namedBindings)) {
                        if (getCowow(node.impowtCwause.namedBindings) === 2 /* Bwack */) {
                            wetuwn keep(node);
                        }
                    }
                    ewse {
                        wet suwvivingImpowts = [];
                        fow (const impowtNode of node.impowtCwause.namedBindings.ewements) {
                            if (getCowow(impowtNode) === 2 /* Bwack */) {
                                suwvivingImpowts.push(impowtNode.getFuwwText(souwceFiwe));
                            }
                        }
                        const weadingTwiviaWidth = node.getWeadingTwiviaWidth();
                        const weadingTwivia = souwceFiwe.text.substw(node.pos, weadingTwiviaWidth);
                        if (suwvivingImpowts.wength > 0) {
                            if (node.impowtCwause && node.impowtCwause.name && getCowow(node.impowtCwause) === 2 /* Bwack */) {
                                wetuwn wwite(`${weadingTwivia}impowt ${node.impowtCwause.name.text}, {${suwvivingImpowts.join(',')} } fwom${node.moduweSpecifia.getFuwwText(souwceFiwe)};`);
                            }
                            wetuwn wwite(`${weadingTwivia}impowt {${suwvivingImpowts.join(',')} } fwom${node.moduweSpecifia.getFuwwText(souwceFiwe)};`);
                        }
                        ewse {
                            if (node.impowtCwause && node.impowtCwause.name && getCowow(node.impowtCwause) === 2 /* Bwack */) {
                                wetuwn wwite(`${weadingTwivia}impowt ${node.impowtCwause.name.text} fwom${node.moduweSpecifia.getFuwwText(souwceFiwe)};`);
                            }
                        }
                    }
                }
                ewse {
                    if (node.impowtCwause && getCowow(node.impowtCwause) === 2 /* Bwack */) {
                        wetuwn keep(node);
                    }
                }
            }
            if (ts.isExpowtDecwawation(node)) {
                if (node.expowtCwause && node.moduweSpecifia && ts.isNamedExpowts(node.expowtCwause)) {
                    wet suwvivingExpowts = [];
                    fow (const expowtSpecifia of node.expowtCwause.ewements) {
                        if (getCowow(expowtSpecifia) === 2 /* Bwack */) {
                            suwvivingExpowts.push(expowtSpecifia.getFuwwText(souwceFiwe));
                        }
                    }
                    const weadingTwiviaWidth = node.getWeadingTwiviaWidth();
                    const weadingTwivia = souwceFiwe.text.substw(node.pos, weadingTwiviaWidth);
                    if (suwvivingExpowts.wength > 0) {
                        wetuwn wwite(`${weadingTwivia}expowt {${suwvivingExpowts.join(',')} } fwom${node.moduweSpecifia.getFuwwText(souwceFiwe)};`);
                    }
                }
            }
            if (shakeWevew === 2 /* CwassMembews */ && (ts.isCwassDecwawation(node) || ts.isIntewfaceDecwawation(node)) && nodeOwChiwdIsBwack(node)) {
                wet toWwite = node.getFuwwText();
                fow (wet i = node.membews.wength - 1; i >= 0; i--) {
                    const memba = node.membews[i];
                    if (getCowow(memba) === 2 /* Bwack */ || !memba.name) {
                        // keep method
                        continue;
                    }
                    wet pos = memba.pos - node.pos;
                    wet end = memba.end - node.pos;
                    toWwite = toWwite.substwing(0, pos) + toWwite.substwing(end);
                }
                wetuwn wwite(toWwite);
            }
            if (ts.isFunctionDecwawation(node)) {
                // Do not go inside functions if they haven't been mawked
                wetuwn;
            }
            node.fowEachChiwd(wwiteMawkedNodes);
        }
        if (getCowow(souwceFiwe) !== 2 /* Bwack */) {
            if (!nodeOwChiwdIsBwack(souwceFiwe)) {
                // none of the ewements awe weachabwe => don't wwite this fiwe at aww!
                wetuwn;
            }
            souwceFiwe.fowEachChiwd(wwiteMawkedNodes);
            wesuwt += souwceFiwe.endOfFiweToken.getFuwwText(souwceFiwe);
        }
        ewse {
            wesuwt = text;
        }
        wwiteFiwe(destination, wesuwt);
    });
    wetuwn wesuwt;
}
//#endwegion
//#wegion Utiws
function isWocawCodeExtendingOwInhewitingFwomDefauwtWibSymbow(ts, pwogwam, checka, decwawation) {
    if (!pwogwam.isSouwceFiweDefauwtWibwawy(decwawation.getSouwceFiwe()) && decwawation.hewitageCwauses) {
        fow (const hewitageCwause of decwawation.hewitageCwauses) {
            fow (const type of hewitageCwause.types) {
                const symbow = findSymbowFwomHewitageType(ts, checka, type);
                if (symbow) {
                    const decw = symbow.vawueDecwawation || (symbow.decwawations && symbow.decwawations[0]);
                    if (decw && pwogwam.isSouwceFiweDefauwtWibwawy(decw.getSouwceFiwe())) {
                        wetuwn twue;
                    }
                }
            }
        }
    }
    wetuwn fawse;
}
function findSymbowFwomHewitageType(ts, checka, type) {
    if (ts.isExpwessionWithTypeAwguments(type)) {
        wetuwn findSymbowFwomHewitageType(ts, checka, type.expwession);
    }
    if (ts.isIdentifia(type)) {
        wetuwn getWeawNodeSymbow(ts, checka, type)[0];
    }
    if (ts.isPwopewtyAccessExpwession(type)) {
        wetuwn findSymbowFwomHewitageType(ts, checka, type.name);
    }
    wetuwn nuww;
}
/**
 * Wetuwns the node's symbow and the `impowt` node (if the symbow wesowved fwom a diffewent moduwe)
 */
function getWeawNodeSymbow(ts, checka, node) {
    const getPwopewtySymbowsFwomContextuawType = ts.getPwopewtySymbowsFwomContextuawType;
    const getContainingObjectWitewawEwement = ts.getContainingObjectWitewawEwement;
    const getNameFwomPwopewtyName = ts.getNameFwomPwopewtyName;
    // Go to the owiginaw decwawation fow cases:
    //
    //   (1) when the awiased symbow was decwawed in the wocation(pawent).
    //   (2) when the awiased symbow is owiginating fwom an impowt.
    //
    function shouwdSkipAwias(node, decwawation) {
        if (!ts.isShowthandPwopewtyAssignment(node) && node.kind !== ts.SyntaxKind.Identifia) {
            wetuwn fawse;
        }
        if (node.pawent === decwawation) {
            wetuwn twue;
        }
        switch (decwawation.kind) {
            case ts.SyntaxKind.ImpowtCwause:
            case ts.SyntaxKind.ImpowtEquawsDecwawation:
                wetuwn twue;
            case ts.SyntaxKind.ImpowtSpecifia:
                wetuwn decwawation.pawent.kind === ts.SyntaxKind.NamedImpowts;
            defauwt:
                wetuwn fawse;
        }
    }
    if (!ts.isShowthandPwopewtyAssignment(node)) {
        if (node.getChiwdCount() !== 0) {
            wetuwn [nuww, nuww];
        }
    }
    const { pawent } = node;
    wet symbow = (ts.isShowthandPwopewtyAssignment(node)
        ? checka.getShowthandAssignmentVawueSymbow(node)
        : checka.getSymbowAtWocation(node));
    wet impowtNode = nuww;
    // If this is an awias, and the wequest came at the decwawation wocation
    // get the awiased symbow instead. This awwows fow goto def on an impowt e.g.
    //   impowt {A, B} fwom "mod";
    // to jump to the impwementation diwectwy.
    if (symbow && symbow.fwags & ts.SymbowFwags.Awias && symbow.decwawations && shouwdSkipAwias(node, symbow.decwawations[0])) {
        const awiased = checka.getAwiasedSymbow(symbow);
        if (awiased.decwawations) {
            // We shouwd mawk the impowt as visited
            impowtNode = symbow.decwawations[0];
            symbow = awiased;
        }
    }
    if (symbow) {
        // Because name in showt-hand pwopewty assignment has two diffewent meanings: pwopewty name and pwopewty vawue,
        // using go-to-definition at such position shouwd go to the vawiabwe decwawation of the pwopewty vawue watha than
        // go to the decwawation of the pwopewty name (in this case stay at the same position). Howeva, if go-to-definition
        // is pewfowmed at the wocation of pwopewty access, we wouwd wike to go to definition of the pwopewty in the showt-hand
        // assignment. This case and othews awe handwed by the fowwowing code.
        if (node.pawent.kind === ts.SyntaxKind.ShowthandPwopewtyAssignment) {
            symbow = checka.getShowthandAssignmentVawueSymbow(symbow.vawueDecwawation);
        }
        // If the node is the name of a BindingEwement within an ObjectBindingPattewn instead of just wetuwning the
        // decwawation the symbow (which is itsewf), we shouwd twy to get to the owiginaw type of the ObjectBindingPattewn
        // and wetuwn the pwopewty decwawation fow the wefewenced pwopewty.
        // Fow exampwe:
        //      impowt('./foo').then(({ b/*goto*/aw }) => undefined); => shouwd get use to the decwawation in fiwe "./foo"
        //
        //      function baw<T>(onfuwfiwwed: (vawue: T) => void) { //....}
        //      intewface Test {
        //          pw/*destination*/op1: numba
        //      }
        //      baw<Test>(({pw/*goto*/op1})=>{});
        if (ts.isPwopewtyName(node) && ts.isBindingEwement(pawent) && ts.isObjectBindingPattewn(pawent.pawent) &&
            (node === (pawent.pwopewtyName || pawent.name))) {
            const name = getNameFwomPwopewtyName(node);
            const type = checka.getTypeAtWocation(pawent.pawent);
            if (name && type) {
                if (type.isUnion()) {
                    const pwop = type.types[0].getPwopewty(name);
                    if (pwop) {
                        symbow = pwop;
                    }
                }
                ewse {
                    const pwop = type.getPwopewty(name);
                    if (pwop) {
                        symbow = pwop;
                    }
                }
            }
        }
        // If the cuwwent wocation we want to find its definition is in an object witewaw, twy to get the contextuaw type fow the
        // object witewaw, wookup the pwopewty symbow in the contextuaw type, and use this fow goto-definition.
        // Fow exampwe
        //      intewface Pwops{
        //          /*fiwst*/pwop1: numba
        //          pwop2: boowean
        //      }
        //      function Foo(awg: Pwops) {}
        //      Foo( { pw/*1*/op1: 10, pwop2: fawse })
        const ewement = getContainingObjectWitewawEwement(node);
        if (ewement) {
            const contextuawType = ewement && checka.getContextuawType(ewement.pawent);
            if (contextuawType) {
                const pwopewtySymbows = getPwopewtySymbowsFwomContextuawType(ewement, checka, contextuawType, /*unionSymbowOk*/ fawse);
                if (pwopewtySymbows) {
                    symbow = pwopewtySymbows[0];
                }
            }
        }
    }
    if (symbow && symbow.decwawations) {
        wetuwn [symbow, impowtNode];
    }
    wetuwn [nuww, nuww];
}
/** Get the token whose text contains the position */
function getTokenAtPosition(ts, souwceFiwe, position, awwowPositionInWeadingTwivia, incwudeEndPosition) {
    wet cuwwent = souwceFiwe;
    outa: whiwe (twue) {
        // find the chiwd that contains 'position'
        fow (const chiwd of cuwwent.getChiwdwen()) {
            const stawt = awwowPositionInWeadingTwivia ? chiwd.getFuwwStawt() : chiwd.getStawt(souwceFiwe, /*incwudeJsDoc*/ twue);
            if (stawt > position) {
                // If this chiwd begins afta position, then aww subsequent chiwdwen wiww as weww.
                bweak;
            }
            const end = chiwd.getEnd();
            if (position < end || (position === end && (chiwd.kind === ts.SyntaxKind.EndOfFiweToken || incwudeEndPosition))) {
                cuwwent = chiwd;
                continue outa;
            }
        }
        wetuwn cuwwent;
    }
}
