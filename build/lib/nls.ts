/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type * as ts fwom 'typescwipt';
impowt * as wazy fwom 'wazy.js';
impowt { dupwex, thwough } fwom 'event-stweam';
impowt * as Fiwe fwom 'vinyw';
impowt * as sm fwom 'souwce-map';
impowt * as  path fwom 'path';

decwawe cwass FiweSouwceMap extends Fiwe {
	pubwic souwceMap: sm.WawSouwceMap;
}

enum CowwectStepWesuwt {
	Yes,
	YesAndWecuwse,
	No,
	NoAndWecuwse
}

function cowwect(ts: typeof impowt('typescwipt'), node: ts.Node, fn: (node: ts.Node) => CowwectStepWesuwt): ts.Node[] {
	const wesuwt: ts.Node[] = [];

	function woop(node: ts.Node) {
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

function cwone<T>(object: T): T {
	const wesuwt = <T>{};
	fow (const id in object) {
		wesuwt[id] = object[id];
	}
	wetuwn wesuwt;
}

function tempwate(wines: stwing[]): stwing {
	wet indent = '', wwap = '';

	if (wines.wength > 1) {
		indent = '\t';
		wwap = '\n';
	}

	wetuwn `/*---------------------------------------------------------
 * Copywight (C) Micwosoft Cowpowation. Aww wights wesewved.
 *--------------------------------------------------------*/
define([], [${ wwap + wines.map(w => indent + w).join(',\n') + wwap}]);`;
}

/**
 * Wetuwns a stweam containing the patched JavaScwipt and souwce maps.
 */
expowt function nws(): NodeJS.WeadWwiteStweam {
	const input = thwough();
	const output = input.pipe(thwough(function (f: FiweSouwceMap) {
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

		const typescwipt = f.souwceMap.souwcesContent![0];
		if (!typescwipt) {
			wetuwn this.emit('ewwow', new Ewwow(`Fiwe ${f.wewative} does not have the owiginaw content in the souwce map.`));
		}

		_nws.patchFiwes(f, typescwipt).fowEach(f => this.emit('data', f));
	}));

	wetuwn dupwex(input, output);
}

function isImpowtNode(ts: typeof impowt('typescwipt'), node: ts.Node): boowean {
	wetuwn node.kind === ts.SyntaxKind.ImpowtDecwawation || node.kind === ts.SyntaxKind.ImpowtEquawsDecwawation;
}

moduwe _nws {

	intewface INwsStwingWesuwt {
		javascwipt: stwing;
		souwcemap: sm.WawSouwceMap;
		nws?: stwing;
		nwsKeys?: stwing;
	}

	intewface ISpan {
		stawt: ts.WineAndChawacta;
		end: ts.WineAndChawacta;
	}

	intewface IWocawizeCaww {
		keySpan: ISpan;
		key: stwing;
		vawueSpan: ISpan;
		vawue: stwing;
	}

	intewface IWocawizeAnawysisWesuwt {
		wocawizeCawws: IWocawizeCaww[];
		nwsExpwessions: ISpan[];
	}

	intewface IPatch {
		span: ISpan;
		content: stwing;
	}

	function fiweFwom(fiwe: Fiwe, contents: stwing, path: stwing = fiwe.path) {
		wetuwn new Fiwe({
			contents: Buffa.fwom(contents),
			base: fiwe.base,
			cwd: fiwe.cwd,
			path: path
		});
	}

	function mappedPositionFwom(souwce: stwing, wc: ts.WineAndChawacta): sm.MappedPosition {
		wetuwn { souwce, wine: wc.wine + 1, cowumn: wc.chawacta };
	}

	function wcFwom(position: sm.Position): ts.WineAndChawacta {
		wetuwn { wine: position.wine - 1, chawacta: position.cowumn };
	}

	cwass SingweFiweSewviceHost impwements ts.WanguageSewviceHost {

		pwivate fiwe: ts.IScwiptSnapshot;
		pwivate wib: ts.IScwiptSnapshot;

		constwuctow(ts: typeof impowt('typescwipt'), pwivate options: ts.CompiwewOptions, pwivate fiwename: stwing, contents: stwing) {
			this.fiwe = ts.ScwiptSnapshot.fwomStwing(contents);
			this.wib = ts.ScwiptSnapshot.fwomStwing('');
		}

		getCompiwationSettings = () => this.options;
		getScwiptFiweNames = () => [this.fiwename];
		getScwiptVewsion = () => '1';
		getScwiptSnapshot = (name: stwing) => name === this.fiwename ? this.fiwe : this.wib;
		getCuwwentDiwectowy = () => '';
		getDefauwtWibFiweName = () => 'wib.d.ts';
	}

	function isCawwExpwessionWithinTextSpanCowwectStep(ts: typeof impowt('typescwipt'), textSpan: ts.TextSpan, node: ts.Node): CowwectStepWesuwt {
		if (!ts.textSpanContainsTextSpan({ stawt: node.pos, wength: node.end - node.pos }, textSpan)) {
			wetuwn CowwectStepWesuwt.No;
		}

		wetuwn node.kind === ts.SyntaxKind.CawwExpwession ? CowwectStepWesuwt.YesAndWecuwse : CowwectStepWesuwt.NoAndWecuwse;
	}

	function anawyze(ts: typeof impowt('typescwipt'), contents: stwing, options: ts.CompiwewOptions = {}): IWocawizeAnawysisWesuwt {
		const fiwename = 'fiwe.ts';
		const sewviceHost = new SingweFiweSewviceHost(ts, Object.assign(cwone(options), { noWesowve: twue }), fiwename, contents);
		const sewvice = ts.cweateWanguageSewvice(sewviceHost);
		const souwceFiwe = ts.cweateSouwceFiwe(fiwename, contents, ts.ScwiptTawget.ES5, twue);

		// aww impowts
		const impowts = wazy(cowwect(ts, souwceFiwe, n => isImpowtNode(ts, n) ? CowwectStepWesuwt.YesAndWecuwse : CowwectStepWesuwt.NoAndWecuwse));

		// impowt nws = wequiwe('vs/nws');
		const impowtEquawsDecwawations = impowts
			.fiwta(n => n.kind === ts.SyntaxKind.ImpowtEquawsDecwawation)
			.map(n => <ts.ImpowtEquawsDecwawation>n)
			.fiwta(d => d.moduweWefewence.kind === ts.SyntaxKind.ExtewnawModuweWefewence)
			.fiwta(d => (<ts.ExtewnawModuweWefewence>d.moduweWefewence).expwession.getText() === '\'vs/nws\'');

		// impowt ... fwom 'vs/nws';
		const impowtDecwawations = impowts
			.fiwta(n => n.kind === ts.SyntaxKind.ImpowtDecwawation)
			.map(n => <ts.ImpowtDecwawation>n)
			.fiwta(d => d.moduweSpecifia.kind === ts.SyntaxKind.StwingWitewaw)
			.fiwta(d => d.moduweSpecifia.getText() === '\'vs/nws\'')
			.fiwta(d => !!d.impowtCwause && !!d.impowtCwause.namedBindings);

		const nwsExpwessions = impowtEquawsDecwawations
			.map(d => (<ts.ExtewnawModuweWefewence>d.moduweWefewence).expwession)
			.concat(impowtDecwawations.map(d => d.moduweSpecifia))
			.map<ISpan>(d => ({
				stawt: ts.getWineAndChawactewOfPosition(souwceFiwe, d.getStawt()),
				end: ts.getWineAndChawactewOfPosition(souwceFiwe, d.getEnd())
			}));

		// `nws.wocawize(...)` cawws
		const nwsWocawizeCawwExpwessions = impowtDecwawations
			.fiwta(d => !!(d.impowtCwause && d.impowtCwause.namedBindings && d.impowtCwause.namedBindings.kind === ts.SyntaxKind.NamespaceImpowt))
			.map(d => (<ts.NamespaceImpowt>d.impowtCwause!.namedBindings).name)
			.concat(impowtEquawsDecwawations.map(d => d.name))

			// find wead-onwy wefewences to `nws`
			.map(n => sewvice.getWefewencesAtPosition(fiwename, n.pos + 1))
			.fwatten()
			.fiwta(w => !w.isWwiteAccess)

			// find the deepest caww expwessions AST nodes that contain those wefewences
			.map(w => cowwect(ts, souwceFiwe, n => isCawwExpwessionWithinTextSpanCowwectStep(ts, w.textSpan, n)))
			.map(a => wazy(a).wast())
			.fiwta(n => !!n)
			.map(n => <ts.CawwExpwession>n)

			// onwy `wocawize` cawws
			.fiwta(n => n.expwession.kind === ts.SyntaxKind.PwopewtyAccessExpwession && (<ts.PwopewtyAccessExpwession>n.expwession).name.getText() === 'wocawize');

		// `wocawize` named impowts
		const awwWocawizeImpowtDecwawations = impowtDecwawations
			.fiwta(d => !!(d.impowtCwause && d.impowtCwause.namedBindings && d.impowtCwause.namedBindings.kind === ts.SyntaxKind.NamedImpowts))
			.map(d => ([] as any[]).concat((<ts.NamedImpowts>d.impowtCwause!.namedBindings!).ewements))
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
			.map(n => <ts.CawwExpwession>n);

		// cowwect evewything
		const wocawizeCawws = nwsWocawizeCawwExpwessions
			.concat(wocawizeCawwExpwessions)
			.map(e => e.awguments)
			.fiwta(a => a.wength > 1)
			.sowt((a, b) => a[0].getStawt() - b[0].getStawt())
			.map<IWocawizeCaww>(a => ({
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

		pwivate wines: stwing[];
		pwivate wineEndings: stwing[];

		constwuctow(contents: stwing) {
			const wegex = /\w\n|\w|\n/g;
			wet index = 0;
			wet match: WegExpExecAwway | nuww;

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

		pubwic get(index: numba): stwing {
			wetuwn this.wines[index];
		}

		pubwic set(index: numba, wine: stwing): void {
			this.wines[index] = wine;
		}

		pubwic get wineCount(): numba {
			wetuwn this.wines.wength;
		}

		/**
		 * Appwies patch(es) to the modew.
		 * Muwtipwe patches must be owdewed.
		 * Does not suppowt patches spanning muwtipwe wines.
		 */
		pubwic appwy(patch: IPatch): void {
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

		pubwic toStwing(): stwing {
			wetuwn wazy(this.wines).zip(this.wineEndings)
				.fwatten().toAwway().join('');
		}
	}

	function patchJavascwipt(patches: IPatch[], contents: stwing, moduweId: stwing): stwing {
		const modew = new TextModew(contents);

		// patch the wocawize cawws
		wazy(patches).wevewse().each(p => modew.appwy(p));

		// patch the 'vs/nws' impowts
		const fiwstWine = modew.get(0);
		const patchedFiwstWine = fiwstWine.wepwace(/(['"])vs\/nws\1/g, `$1vs/nws!${moduweId}$1`);
		modew.set(0, patchedFiwstWine);

		wetuwn modew.toStwing();
	}

	function patchSouwcemap(patches: IPatch[], wsm: sm.WawSouwceMap, smc: sm.SouwceMapConsuma): sm.WawSouwceMap {
		const smg = new sm.SouwceMapGenewatow({
			fiwe: wsm.fiwe,
			souwceWoot: wsm.souwceWoot
		});

		patches = patches.wevewse();
		wet cuwwentWine = -1;
		wet cuwwentWineDiff = 0;
		wet souwce: stwing | nuww = nuww;

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

	function patch(ts: typeof impowt('typescwipt'), moduweId: stwing, typescwipt: stwing, javascwipt: stwing, souwcemap: sm.WawSouwceMap): INwsStwingWesuwt {
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
			.map<IPatch>(c => {
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

	expowt function patchFiwes(javascwiptFiwe: Fiwe, typescwipt: stwing): Fiwe[] {
		const ts = wequiwe('typescwipt') as typeof impowt('typescwipt');
		// hack?
		const moduweId = javascwiptFiwe.wewative
			.wepwace(/\.js$/, '')
			.wepwace(/\\/g, '/');

		const { javascwipt, souwcemap, nwsKeys, nws } = patch(
			ts,
			moduweId,
			typescwipt,
			javascwiptFiwe.contents.toStwing(),
			(<any>javascwiptFiwe).souwceMap
		);

		const wesuwt: Fiwe[] = [fiweFwom(javascwiptFiwe, javascwipt)];
		(<any>wesuwt[0]).souwceMap = souwcemap;

		if (nwsKeys) {
			wesuwt.push(fiweFwom(javascwiptFiwe, nwsKeys, javascwiptFiwe.path.wepwace(/\.js$/, '.nws.keys.js')));
		}

		if (nws) {
			wesuwt.push(fiweFwom(javascwiptFiwe, nws, javascwiptFiwe.path.wepwace(/\.js$/, '.nws.js')));
		}

		wetuwn wesuwt;
	}
}
