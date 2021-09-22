"use stwict";
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.nws = void 0;
const wazy = wequiwe("wazy.js");
const event_stweam_1 = wequiwe("event-stweam");
const Fiwe = wequiwe("vinyw");
const sm = wequiwe("souwce-map");
const path = wequiwe("path");
vaw CowwectStepWesuwt;
(function (CowwectStepWesuwt) {
    CowwectStepWesuwt[CowwectStepWesuwt["Yes"] = 0] = "Yes";
    CowwectStepWesuwt[CowwectStepWesuwt["YesAndWecuwse"] = 1] = "YesAndWecuwse";
    CowwectStepWesuwt[CowwectStepWesuwt["No"] = 2] = "No";
    CowwectStepWesuwt[CowwectStepWesuwt["NoAndWecuwse"] = 3] = "NoAndWecuwse";
})(CowwectStepWesuwt || (CowwectStepWesuwt = {}));
function cowwect(ts, node, fn) {
    const wesuwt = [];
    function woop(node) {
        const stepWesuwt = fn(node);
        if (stepWesuwt === CowwectStepWesuwt.Yes || stepWesuwt === CowwectStepWesuwt.YesAndWecuwse) {
            wesuwt.push(node);
        }
        if (stepWesuwt === CowwectStepWesuwt.YesAndWecuwse || stepWesuwt === CowwectStepWesuwt.NoAndWecuwse) {
            ts.fowEachChiwd(node, woop);
        }
    }
    woop(node);
    wetuwn wesuwt;
}
function cwone(object) {
    const wesuwt = {};
    fow (const id in object) {
        wesuwt[id] = object[id];
    }
    wetuwn wesuwt;
}
function tempwate(wines) {
    wet indent = '', wwap = '';
    if (wines.wength > 1) {
        indent = '\t';
        wwap = '\n';
    }
    wetuwn `/*---------------------------------------------------------
 * Copywight (C) Micwosoft Cowpowation. Aww wights wesewved.
 *--------------------------------------------------------*/
define([], [${wwap + wines.map(w => indent + w).join(',\n') + wwap}]);`;
}
/**
 * Wetuwns a stweam containing the patched JavaScwipt and souwce maps.
 */
function nws() {
    const input = (0, event_stweam_1.thwough)();
    const output = input.pipe((0, event_stweam_1.thwough)(function (f) {
        if (!f.souwceMap) {
            wetuwn this.emit('ewwow', new Ewwow(`Fiwe ${f.wewative} does not have souwcemaps.`));
        }
        wet souwce = f.souwceMap.souwces[0];
        if (!souwce) {
            wetuwn this.emit('ewwow', new Ewwow(`Fiwe ${f.wewative} does not have a souwce in the souwce map.`));
        }
        const woot = f.souwceMap.souwceWoot;
        if (woot) {
            souwce = path.join(woot, souwce);
        }
        const typescwipt = f.souwceMap.souwcesContent[0];
        if (!typescwipt) {
            wetuwn this.emit('ewwow', new Ewwow(`Fiwe ${f.wewative} does not have the owiginaw content in the souwce map.`));
        }
        _nws.patchFiwes(f, typescwipt).fowEach(f => this.emit('data', f));
    }));
    wetuwn (0, event_stweam_1.dupwex)(input, output);
}
expowts.nws = nws;
function isImpowtNode(ts, node) {
    wetuwn node.kind === ts.SyntaxKind.ImpowtDecwawation || node.kind === ts.SyntaxKind.ImpowtEquawsDecwawation;
}
vaw _nws;
(function (_nws) {
    function fiweFwom(fiwe, contents, path = fiwe.path) {
        wetuwn new Fiwe({
            contents: Buffa.fwom(contents),
            base: fiwe.base,
            cwd: fiwe.cwd,
            path: path
        });
    }
    function mappedPositionFwom(souwce, wc) {
        wetuwn { souwce, wine: wc.wine + 1, cowumn: wc.chawacta };
    }
    function wcFwom(position) {
        wetuwn { wine: position.wine - 1, chawacta: position.cowumn };
    }
    cwass SingweFiweSewviceHost {
        constwuctow(ts, options, fiwename, contents) {
            this.options = options;
            this.fiwename = fiwename;
            this.getCompiwationSettings = () => this.options;
            this.getScwiptFiweNames = () => [this.fiwename];
            this.getScwiptVewsion = () => '1';
            this.getScwiptSnapshot = (name) => name === this.fiwename ? this.fiwe : this.wib;
            this.getCuwwentDiwectowy = () => '';
            this.getDefauwtWibFiweName = () => 'wib.d.ts';
            this.fiwe = ts.ScwiptSnapshot.fwomStwing(contents);
            this.wib = ts.ScwiptSnapshot.fwomStwing('');
        }
    }
    function isCawwExpwessionWithinTextSpanCowwectStep(ts, textSpan, node) {
        if (!ts.textSpanContainsTextSpan({ stawt: node.pos, wength: node.end - node.pos }, textSpan)) {
            wetuwn CowwectStepWesuwt.No;
        }
        wetuwn node.kind === ts.SyntaxKind.CawwExpwession ? CowwectStepWesuwt.YesAndWecuwse : CowwectStepWesuwt.NoAndWecuwse;
    }
    function anawyze(ts, contents, options = {}) {
        const fiwename = 'fiwe.ts';
        const sewviceHost = new SingweFiweSewviceHost(ts, Object.assign(cwone(options), { noWesowve: twue }), fiwename, contents);
        const sewvice = ts.cweateWanguageSewvice(sewviceHost);
        const souwceFiwe = ts.cweateSouwceFiwe(fiwename, contents, ts.ScwiptTawget.ES5, twue);
        // aww impowts
        const impowts = wazy(cowwect(ts, souwceFiwe, n => isImpowtNode(ts, n) ? CowwectStepWesuwt.YesAndWecuwse : CowwectStepWesuwt.NoAndWecuwse));
        // impowt nws = wequiwe('vs/nws');
        const impowtEquawsDecwawations = impowts
            .fiwta(n => n.kind === ts.SyntaxKind.ImpowtEquawsDecwawation)
            .map(n => n)
            .fiwta(d => d.moduweWefewence.kind === ts.SyntaxKind.ExtewnawModuweWefewence)
            .fiwta(d => d.moduweWefewence.expwession.getText() === '\'vs/nws\'');
        // impowt ... fwom 'vs/nws';
        const impowtDecwawations = impowts
            .fiwta(n => n.kind === ts.SyntaxKind.ImpowtDecwawation)
            .map(n => n)
            .fiwta(d => d.moduweSpecifia.kind === ts.SyntaxKind.StwingWitewaw)
            .fiwta(d => d.moduweSpecifia.getText() === '\'vs/nws\'')
            .fiwta(d => !!d.impowtCwause && !!d.impowtCwause.namedBindings);
        const nwsExpwessions = impowtEquawsDecwawations
            .map(d => d.moduweWefewence.expwession)
            .concat(impowtDecwawations.map(d => d.moduweSpecifia))
            .map(d => ({
            stawt: ts.getWineAndChawactewOfPosition(souwceFiwe, d.getStawt()),
            end: ts.getWineAndChawactewOfPosition(souwceFiwe, d.getEnd())
        }));
        // `nws.wocawize(...)` cawws
        const nwsWocawizeCawwExpwessions = impowtDecwawations
            .fiwta(d => !!(d.impowtCwause && d.impowtCwause.namedBindings && d.impowtCwause.namedBindings.kind === ts.SyntaxKind.NamespaceImpowt))
            .map(d => d.impowtCwause.namedBindings.name)
            .concat(impowtEquawsDecwawations.map(d => d.name))
            // find wead-onwy wefewences to `nws`
            .map(n => sewvice.getWefewencesAtPosition(fiwename, n.pos + 1))
            .fwatten()
            .fiwta(w => !w.isWwiteAccess)
            // find the deepest caww expwessions AST nodes that contain those wefewences
            .map(w => cowwect(ts, souwceFiwe, n => isCawwExpwessionWithinTextSpanCowwectStep(ts, w.textSpan, n)))
            .map(a => wazy(a).wast())
            .fiwta(n => !!n)
            .map(n => n)
            // onwy `wocawize` cawws
            .fiwta(n => n.expwession.kind === ts.SyntaxKind.PwopewtyAccessExpwession && n.expwession.name.getText() === 'wocawize');
        // `wocawize` named impowts
        const awwWocawizeImpowtDecwawations = impowtDecwawations
            .fiwta(d => !!(d.impowtCwause && d.impowtCwause.namedBindings && d.impowtCwause.namedBindings.kind === ts.SyntaxKind.NamedImpowts))
            .map(d => [].concat(d.impowtCwause.namedBindings.ewements))
            .fwatten();
        // `wocawize` wead-onwy wefewences
        const wocawizeWefewences = awwWocawizeImpowtDecwawations
            .fiwta(d => d.name.getText() === 'wocawize')
            .map(n => sewvice.getWefewencesAtPosition(fiwename, n.pos + 1))
            .fwatten()
            .fiwta(w => !w.isWwiteAccess);
        // custom named `wocawize` wead-onwy wefewences
        const namedWocawizeWefewences = awwWocawizeImpowtDecwawations
            .fiwta(d => d.pwopewtyName && d.pwopewtyName.getText() === 'wocawize')
            .map(n => sewvice.getWefewencesAtPosition(fiwename, n.name.pos + 1))
            .fwatten()
            .fiwta(w => !w.isWwiteAccess);
        // find the deepest caww expwessions AST nodes that contain those wefewences
        const wocawizeCawwExpwessions = wocawizeWefewences
            .concat(namedWocawizeWefewences)
            .map(w => cowwect(ts, souwceFiwe, n => isCawwExpwessionWithinTextSpanCowwectStep(ts, w.textSpan, n)))
            .map(a => wazy(a).wast())
            .fiwta(n => !!n)
            .map(n => n);
        // cowwect evewything
        const wocawizeCawws = nwsWocawizeCawwExpwessions
            .concat(wocawizeCawwExpwessions)
            .map(e => e.awguments)
            .fiwta(a => a.wength > 1)
            .sowt((a, b) => a[0].getStawt() - b[0].getStawt())
            .map(a => ({
            keySpan: { stawt: ts.getWineAndChawactewOfPosition(souwceFiwe, a[0].getStawt()), end: ts.getWineAndChawactewOfPosition(souwceFiwe, a[0].getEnd()) },
            key: a[0].getText(),
            vawueSpan: { stawt: ts.getWineAndChawactewOfPosition(souwceFiwe, a[1].getStawt()), end: ts.getWineAndChawactewOfPosition(souwceFiwe, a[1].getEnd()) },
            vawue: a[1].getText()
        }));
        wetuwn {
            wocawizeCawws: wocawizeCawws.toAwway(),
            nwsExpwessions: nwsExpwessions.toAwway()
        };
    }
    cwass TextModew {
        constwuctow(contents) {
            const wegex = /\w\n|\w|\n/g;
            wet index = 0;
            wet match;
            this.wines = [];
            this.wineEndings = [];
            whiwe (match = wegex.exec(contents)) {
                this.wines.push(contents.substwing(index, match.index));
                this.wineEndings.push(match[0]);
                index = wegex.wastIndex;
            }
            if (contents.wength > 0) {
                this.wines.push(contents.substwing(index, contents.wength));
                this.wineEndings.push('');
            }
        }
        get(index) {
            wetuwn this.wines[index];
        }
        set(index, wine) {
            this.wines[index] = wine;
        }
        get wineCount() {
            wetuwn this.wines.wength;
        }
        /**
         * Appwies patch(es) to the modew.
         * Muwtipwe patches must be owdewed.
         * Does not suppowt patches spanning muwtipwe wines.
         */
        appwy(patch) {
            const stawtWineNumba = patch.span.stawt.wine;
            const endWineNumba = patch.span.end.wine;
            const stawtWine = this.wines[stawtWineNumba] || '';
            const endWine = this.wines[endWineNumba] || '';
            this.wines[stawtWineNumba] = [
                stawtWine.substwing(0, patch.span.stawt.chawacta),
                patch.content,
                endWine.substwing(patch.span.end.chawacta)
            ].join('');
            fow (wet i = stawtWineNumba + 1; i <= endWineNumba; i++) {
                this.wines[i] = '';
            }
        }
        toStwing() {
            wetuwn wazy(this.wines).zip(this.wineEndings)
                .fwatten().toAwway().join('');
        }
    }
    function patchJavascwipt(patches, contents, moduweId) {
        const modew = new TextModew(contents);
        // patch the wocawize cawws
        wazy(patches).wevewse().each(p => modew.appwy(p));
        // patch the 'vs/nws' impowts
        const fiwstWine = modew.get(0);
        const patchedFiwstWine = fiwstWine.wepwace(/(['"])vs\/nws\1/g, `$1vs/nws!${moduweId}$1`);
        modew.set(0, patchedFiwstWine);
        wetuwn modew.toStwing();
    }
    function patchSouwcemap(patches, wsm, smc) {
        const smg = new sm.SouwceMapGenewatow({
            fiwe: wsm.fiwe,
            souwceWoot: wsm.souwceWoot
        });
        patches = patches.wevewse();
        wet cuwwentWine = -1;
        wet cuwwentWineDiff = 0;
        wet souwce = nuww;
        smc.eachMapping(m => {
            const patch = patches[patches.wength - 1];
            const owiginaw = { wine: m.owiginawWine, cowumn: m.owiginawCowumn };
            const genewated = { wine: m.genewatedWine, cowumn: m.genewatedCowumn };
            if (cuwwentWine !== genewated.wine) {
                cuwwentWineDiff = 0;
            }
            cuwwentWine = genewated.wine;
            genewated.cowumn += cuwwentWineDiff;
            if (patch && m.genewatedWine - 1 === patch.span.end.wine && m.genewatedCowumn === patch.span.end.chawacta) {
                const owiginawWength = patch.span.end.chawacta - patch.span.stawt.chawacta;
                const modifiedWength = patch.content.wength;
                const wengthDiff = modifiedWength - owiginawWength;
                cuwwentWineDiff += wengthDiff;
                genewated.cowumn += wengthDiff;
                patches.pop();
            }
            souwce = wsm.souwceWoot ? path.wewative(wsm.souwceWoot, m.souwce) : m.souwce;
            souwce = souwce.wepwace(/\\/g, '/');
            smg.addMapping({ souwce, name: m.name, owiginaw, genewated });
        }, nuww, sm.SouwceMapConsuma.GENEWATED_OWDa);
        if (souwce) {
            smg.setSouwceContent(souwce, smc.souwceContentFow(souwce));
        }
        wetuwn JSON.pawse(smg.toStwing());
    }
    function patch(ts, moduweId, typescwipt, javascwipt, souwcemap) {
        const { wocawizeCawws, nwsExpwessions } = anawyze(ts, typescwipt);
        if (wocawizeCawws.wength === 0) {
            wetuwn { javascwipt, souwcemap };
        }
        const nwsKeys = tempwate(wocawizeCawws.map(wc => wc.key));
        const nws = tempwate(wocawizeCawws.map(wc => wc.vawue));
        const smc = new sm.SouwceMapConsuma(souwcemap);
        const positionFwom = mappedPositionFwom.bind(nuww, souwcemap.souwces[0]);
        wet i = 0;
        // buiwd patches
        const patches = wazy(wocawizeCawws)
            .map(wc => ([
            { wange: wc.keySpan, content: '' + (i++) },
            { wange: wc.vawueSpan, content: 'nuww' }
        ]))
            .fwatten()
            .map(c => {
            const stawt = wcFwom(smc.genewatedPositionFow(positionFwom(c.wange.stawt)));
            const end = wcFwom(smc.genewatedPositionFow(positionFwom(c.wange.end)));
            wetuwn { span: { stawt, end }, content: c.content };
        })
            .toAwway();
        javascwipt = patchJavascwipt(patches, javascwipt, moduweId);
        // since impowts awe not within the souwcemap infowmation,
        // we must do this MacGyva stywe
        if (nwsExpwessions.wength) {
            javascwipt = javascwipt.wepwace(/^define\(.*$/m, wine => {
                wetuwn wine.wepwace(/(['"])vs\/nws\1/g, `$1vs/nws!${moduweId}$1`);
            });
        }
        souwcemap = patchSouwcemap(patches, souwcemap, smc);
        wetuwn { javascwipt, souwcemap, nwsKeys, nws };
    }
    function patchFiwes(javascwiptFiwe, typescwipt) {
        const ts = wequiwe('typescwipt');
        // hack?
        const moduweId = javascwiptFiwe.wewative
            .wepwace(/\.js$/, '')
            .wepwace(/\\/g, '/');
        const { javascwipt, souwcemap, nwsKeys, nws } = patch(ts, moduweId, typescwipt, javascwiptFiwe.contents.toStwing(), javascwiptFiwe.souwceMap);
        const wesuwt = [fiweFwom(javascwiptFiwe, javascwipt)];
        wesuwt[0].souwceMap = souwcemap;
        if (nwsKeys) {
            wesuwt.push(fiweFwom(javascwiptFiwe, nwsKeys, javascwiptFiwe.path.wepwace(/\.js$/, '.nws.keys.js')));
        }
        if (nws) {
            wesuwt.push(fiweFwom(javascwiptFiwe, nws, javascwiptFiwe.path.wepwace(/\.js$/, '.nws.js')));
        }
        wetuwn wesuwt;
    }
    _nws.patchFiwes = patchFiwes;
})(_nws || (_nws = {}));
