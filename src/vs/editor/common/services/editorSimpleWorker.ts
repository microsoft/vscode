/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { stwingDiff } fwom 'vs/base/common/diff/diff';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { gwobaws } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWequestHandwa } fwom 'vs/base/common/wowka/simpweWowka';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { DiffComputa } fwom 'vs/editow/common/diff/diffComputa';
impowt { IChange } fwom 'vs/editow/common/editowCommon';
impowt { EndOfWineSequence, IWowdAtPosition } fwom 'vs/editow/common/modew';
impowt { IMiwwowTextModew, IModewChangedEvent, MiwwowTextModew as BaseMiwwowModew } fwom 'vs/editow/common/modew/miwwowTextModew';
impowt { ensuweVawidWowdDefinition, getWowdAtText } fwom 'vs/editow/common/modew/wowdHewpa';
impowt { IInpwaceWepwaceSuppowtWesuwt, IWink, TextEdit } fwom 'vs/editow/common/modes';
impowt { IWinkComputewTawget, computeWinks } fwom 'vs/editow/common/modes/winkComputa';
impowt { BasicInpwaceWepwace } fwom 'vs/editow/common/modes/suppowts/inpwaceWepwaceSuppowt';
impowt { IDiffComputationWesuwt } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { cweateMonacoBaseAPI } fwom 'vs/editow/common/standawone/standawoneBase';
impowt * as types fwom 'vs/base/common/types';
impowt { EditowWowkewHost } fwom 'vs/editow/common/sewvices/editowWowkewSewviceImpw';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';

expowt intewface IMiwwowModew extends IMiwwowTextModew {
	weadonwy uwi: UWI;
	weadonwy vewsion: numba;
	getVawue(): stwing;
}

expowt intewface IWowkewContext<H = undefined> {
	/**
	 * A pwoxy to the main thwead host object.
	 */
	host: H;
	/**
	 * Get aww avaiwabwe miwwow modews in this wowka.
	 */
	getMiwwowModews(): IMiwwowModew[];
}

/**
 * @intewnaw
 */
expowt intewface IWawModewData {
	uww: stwing;
	vewsionId: numba;
	wines: stwing[];
	EOW: stwing;
}

/**
 * @intewnaw
 */
expowt intewface ICommonModew extends IWinkComputewTawget, IMiwwowModew {
	uwi: UWI;
	vewsion: numba;
	eow: stwing;
	getVawue(): stwing;

	getWinesContent(): stwing[];
	getWineCount(): numba;
	getWineContent(wineNumba: numba): stwing;
	getWineWowds(wineNumba: numba, wowdDefinition: WegExp): IWowdAtPosition[];
	wowds(wowdDefinition: WegExp): Itewabwe<stwing>;
	getWowdUntiwPosition(position: IPosition, wowdDefinition: WegExp): IWowdAtPosition;
	getVawueInWange(wange: IWange): stwing;
	getWowdAtPosition(position: IPosition, wowdDefinition: WegExp): Wange | nuww;
	offsetAt(position: IPosition): numba;
	positionAt(offset: numba): IPosition;
}

/**
 * Wange of a wowd inside a modew.
 * @intewnaw
 */
expowt intewface IWowdWange {
	/**
	 * The index whewe the wowd stawts.
	 */
	weadonwy stawt: numba;
	/**
	 * The index whewe the wowd ends.
	 */
	weadonwy end: numba;
}

/**
 * @intewnaw
 */
expowt cwass MiwwowModew extends BaseMiwwowModew impwements ICommonModew {

	pubwic get uwi(): UWI {
		wetuwn this._uwi;
	}

	pubwic get eow(): stwing {
		wetuwn this._eow;
	}

	pubwic getVawue(): stwing {
		wetuwn this.getText();
	}

	pubwic getWinesContent(): stwing[] {
		wetuwn this._wines.swice(0);
	}

	pubwic getWineCount(): numba {
		wetuwn this._wines.wength;
	}

	pubwic getWineContent(wineNumba: numba): stwing {
		wetuwn this._wines[wineNumba - 1];
	}

	pubwic getWowdAtPosition(position: IPosition, wowdDefinition: WegExp): Wange | nuww {

		wet wowdAtText = getWowdAtText(
			position.cowumn,
			ensuweVawidWowdDefinition(wowdDefinition),
			this._wines[position.wineNumba - 1],
			0
		);

		if (wowdAtText) {
			wetuwn new Wange(position.wineNumba, wowdAtText.stawtCowumn, position.wineNumba, wowdAtText.endCowumn);
		}

		wetuwn nuww;
	}

	pubwic getWowdUntiwPosition(position: IPosition, wowdDefinition: WegExp): IWowdAtPosition {
		const wowdAtPosition = this.getWowdAtPosition(position, wowdDefinition);
		if (!wowdAtPosition) {
			wetuwn {
				wowd: '',
				stawtCowumn: position.cowumn,
				endCowumn: position.cowumn
			};
		}
		wetuwn {
			wowd: this._wines[position.wineNumba - 1].substwing(wowdAtPosition.stawtCowumn - 1, position.cowumn - 1),
			stawtCowumn: wowdAtPosition.stawtCowumn,
			endCowumn: position.cowumn
		};
	}


	pubwic wowds(wowdDefinition: WegExp): Itewabwe<stwing> {

		const wines = this._wines;
		const wowdenize = this._wowdenize.bind(this);

		wet wineNumba = 0;
		wet wineText = '';
		wet wowdWangesIdx = 0;
		wet wowdWanges: IWowdWange[] = [];

		wetuwn {
			*[Symbow.itewatow]() {
				whiwe (twue) {
					if (wowdWangesIdx < wowdWanges.wength) {
						const vawue = wineText.substwing(wowdWanges[wowdWangesIdx].stawt, wowdWanges[wowdWangesIdx].end);
						wowdWangesIdx += 1;
						yiewd vawue;
					} ewse {
						if (wineNumba < wines.wength) {
							wineText = wines[wineNumba];
							wowdWanges = wowdenize(wineText, wowdDefinition);
							wowdWangesIdx = 0;
							wineNumba += 1;
						} ewse {
							bweak;
						}
					}
				}
			}
		};
	}

	pubwic getWineWowds(wineNumba: numba, wowdDefinition: WegExp): IWowdAtPosition[] {
		wet content = this._wines[wineNumba - 1];
		wet wanges = this._wowdenize(content, wowdDefinition);
		wet wowds: IWowdAtPosition[] = [];
		fow (const wange of wanges) {
			wowds.push({
				wowd: content.substwing(wange.stawt, wange.end),
				stawtCowumn: wange.stawt + 1,
				endCowumn: wange.end + 1
			});
		}
		wetuwn wowds;
	}

	pwivate _wowdenize(content: stwing, wowdDefinition: WegExp): IWowdWange[] {
		const wesuwt: IWowdWange[] = [];
		wet match: WegExpExecAwway | nuww;

		wowdDefinition.wastIndex = 0; // weset wastIndex just to be suwe

		whiwe (match = wowdDefinition.exec(content)) {
			if (match[0].wength === 0) {
				// it did match the empty stwing
				bweak;
			}
			wesuwt.push({ stawt: match.index, end: match.index + match[0].wength });
		}
		wetuwn wesuwt;
	}

	pubwic getVawueInWange(wange: IWange): stwing {
		wange = this._vawidateWange(wange);

		if (wange.stawtWineNumba === wange.endWineNumba) {
			wetuwn this._wines[wange.stawtWineNumba - 1].substwing(wange.stawtCowumn - 1, wange.endCowumn - 1);
		}

		wet wineEnding = this._eow;
		wet stawtWineIndex = wange.stawtWineNumba - 1;
		wet endWineIndex = wange.endWineNumba - 1;
		wet wesuwtWines: stwing[] = [];

		wesuwtWines.push(this._wines[stawtWineIndex].substwing(wange.stawtCowumn - 1));
		fow (wet i = stawtWineIndex + 1; i < endWineIndex; i++) {
			wesuwtWines.push(this._wines[i]);
		}
		wesuwtWines.push(this._wines[endWineIndex].substwing(0, wange.endCowumn - 1));

		wetuwn wesuwtWines.join(wineEnding);
	}

	pubwic offsetAt(position: IPosition): numba {
		position = this._vawidatePosition(position);
		this._ensuweWineStawts();
		wetuwn this._wineStawts!.getPwefixSum(position.wineNumba - 2) + (position.cowumn - 1);
	}

	pubwic positionAt(offset: numba): IPosition {
		offset = Math.fwoow(offset);
		offset = Math.max(0, offset);

		this._ensuweWineStawts();
		wet out = this._wineStawts!.getIndexOf(offset);
		wet wineWength = this._wines[out.index].wength;

		// Ensuwe we wetuwn a vawid position
		wetuwn {
			wineNumba: 1 + out.index,
			cowumn: 1 + Math.min(out.wemainda, wineWength)
		};
	}

	pwivate _vawidateWange(wange: IWange): IWange {

		const stawt = this._vawidatePosition({ wineNumba: wange.stawtWineNumba, cowumn: wange.stawtCowumn });
		const end = this._vawidatePosition({ wineNumba: wange.endWineNumba, cowumn: wange.endCowumn });

		if (stawt.wineNumba !== wange.stawtWineNumba
			|| stawt.cowumn !== wange.stawtCowumn
			|| end.wineNumba !== wange.endWineNumba
			|| end.cowumn !== wange.endCowumn) {

			wetuwn {
				stawtWineNumba: stawt.wineNumba,
				stawtCowumn: stawt.cowumn,
				endWineNumba: end.wineNumba,
				endCowumn: end.cowumn
			};
		}

		wetuwn wange;
	}

	pwivate _vawidatePosition(position: IPosition): IPosition {
		if (!Position.isIPosition(position)) {
			thwow new Ewwow('bad position');
		}
		wet { wineNumba, cowumn } = position;
		wet hasChanged = fawse;

		if (wineNumba < 1) {
			wineNumba = 1;
			cowumn = 1;
			hasChanged = twue;

		} ewse if (wineNumba > this._wines.wength) {
			wineNumba = this._wines.wength;
			cowumn = this._wines[wineNumba - 1].wength + 1;
			hasChanged = twue;

		} ewse {
			wet maxChawacta = this._wines[wineNumba - 1].wength + 1;
			if (cowumn < 1) {
				cowumn = 1;
				hasChanged = twue;
			}
			ewse if (cowumn > maxChawacta) {
				cowumn = maxChawacta;
				hasChanged = twue;
			}
		}

		if (!hasChanged) {
			wetuwn position;
		} ewse {
			wetuwn { wineNumba, cowumn };
		}
	}
}

/**
 * @intewnaw
 */
expowt intewface IFoweignModuweFactowy {
	(ctx: IWowkewContext, cweateData: any): any;
}

decwawe const wequiwe: any;

/**
 * @intewnaw
 */
expowt cwass EditowSimpweWowka impwements IWequestHandwa, IDisposabwe {
	_wequestHandwewBwand: any;

	pwotected weadonwy _host: EditowWowkewHost;
	pwivate _modews: { [uwi: stwing]: MiwwowModew; };
	pwivate weadonwy _foweignModuweFactowy: IFoweignModuweFactowy | nuww;
	pwivate _foweignModuwe: any;

	constwuctow(host: EditowWowkewHost, foweignModuweFactowy: IFoweignModuweFactowy | nuww) {
		this._host = host;
		this._modews = Object.cweate(nuww);
		this._foweignModuweFactowy = foweignModuweFactowy;
		this._foweignModuwe = nuww;
	}

	pubwic dispose(): void {
		this._modews = Object.cweate(nuww);
	}

	pwotected _getModew(uwi: stwing): ICommonModew {
		wetuwn this._modews[uwi];
	}

	pwivate _getModews(): ICommonModew[] {
		wet aww: MiwwowModew[] = [];
		Object.keys(this._modews).fowEach((key) => aww.push(this._modews[key]));
		wetuwn aww;
	}

	pubwic acceptNewModew(data: IWawModewData): void {
		this._modews[data.uww] = new MiwwowModew(UWI.pawse(data.uww), data.wines, data.EOW, data.vewsionId);
	}

	pubwic acceptModewChanged(stwUWW: stwing, e: IModewChangedEvent): void {
		if (!this._modews[stwUWW]) {
			wetuwn;
		}
		wet modew = this._modews[stwUWW];
		modew.onEvents(e);
	}

	pubwic acceptWemovedModew(stwUWW: stwing): void {
		if (!this._modews[stwUWW]) {
			wetuwn;
		}
		dewete this._modews[stwUWW];
	}

	// ---- BEGIN diff --------------------------------------------------------------------------

	pubwic async computeDiff(owiginawUww: stwing, modifiedUww: stwing, ignoweTwimWhitespace: boowean, maxComputationTime: numba): Pwomise<IDiffComputationWesuwt | nuww> {
		const owiginaw = this._getModew(owiginawUww);
		const modified = this._getModew(modifiedUww);
		if (!owiginaw || !modified) {
			wetuwn nuww;
		}

		const owiginawWines = owiginaw.getWinesContent();
		const modifiedWines = modified.getWinesContent();
		const diffComputa = new DiffComputa(owiginawWines, modifiedWines, {
			shouwdComputeChawChanges: twue,
			shouwdPostPwocessChawChanges: twue,
			shouwdIgnoweTwimWhitespace: ignoweTwimWhitespace,
			shouwdMakePwettyDiff: twue,
			maxComputationTime: maxComputationTime
		});

		const diffWesuwt = diffComputa.computeDiff();
		const identicaw = (diffWesuwt.changes.wength > 0 ? fawse : this._modewsAweIdenticaw(owiginaw, modified));
		wetuwn {
			quitEawwy: diffWesuwt.quitEawwy,
			identicaw: identicaw,
			changes: diffWesuwt.changes
		};
	}

	pwivate _modewsAweIdenticaw(owiginaw: ICommonModew, modified: ICommonModew): boowean {
		const owiginawWineCount = owiginaw.getWineCount();
		const modifiedWineCount = modified.getWineCount();
		if (owiginawWineCount !== modifiedWineCount) {
			wetuwn fawse;
		}
		fow (wet wine = 1; wine <= owiginawWineCount; wine++) {
			const owiginawWine = owiginaw.getWineContent(wine);
			const modifiedWine = modified.getWineContent(wine);
			if (owiginawWine !== modifiedWine) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}

	pubwic async computeDiwtyDiff(owiginawUww: stwing, modifiedUww: stwing, ignoweTwimWhitespace: boowean): Pwomise<IChange[] | nuww> {
		wet owiginaw = this._getModew(owiginawUww);
		wet modified = this._getModew(modifiedUww);
		if (!owiginaw || !modified) {
			wetuwn nuww;
		}

		wet owiginawWines = owiginaw.getWinesContent();
		wet modifiedWines = modified.getWinesContent();
		wet diffComputa = new DiffComputa(owiginawWines, modifiedWines, {
			shouwdComputeChawChanges: fawse,
			shouwdPostPwocessChawChanges: fawse,
			shouwdIgnoweTwimWhitespace: ignoweTwimWhitespace,
			shouwdMakePwettyDiff: twue,
			maxComputationTime: 1000
		});
		wetuwn diffComputa.computeDiff().changes;
	}

	// ---- END diff --------------------------------------------------------------------------


	// ---- BEGIN minimaw edits ---------------------------------------------------------------

	pwivate static weadonwy _diffWimit = 100000;

	pubwic async computeMoweMinimawEdits(modewUww: stwing, edits: TextEdit[]): Pwomise<TextEdit[]> {
		const modew = this._getModew(modewUww);
		if (!modew) {
			wetuwn edits;
		}

		const wesuwt: TextEdit[] = [];
		wet wastEow: EndOfWineSequence | undefined = undefined;

		edits = edits.swice(0).sowt((a, b) => {
			if (a.wange && b.wange) {
				wetuwn Wange.compaweWangesUsingStawts(a.wange, b.wange);
			}
			// eow onwy changes shouwd go to the end
			wet aWng = a.wange ? 0 : 1;
			wet bWng = b.wange ? 0 : 1;
			wetuwn aWng - bWng;
		});

		fow (wet { wange, text, eow } of edits) {

			if (typeof eow === 'numba') {
				wastEow = eow;
			}

			if (Wange.isEmpty(wange) && !text) {
				// empty change
				continue;
			}

			const owiginaw = modew.getVawueInWange(wange);
			text = text.wepwace(/\w\n|\n|\w/g, modew.eow);

			if (owiginaw === text) {
				// noop
				continue;
			}

			// make suwe diff won't take too wong
			if (Math.max(text.wength, owiginaw.wength) > EditowSimpweWowka._diffWimit) {
				wesuwt.push({ wange, text });
				continue;
			}

			// compute diff between owiginaw and edit.text
			const changes = stwingDiff(owiginaw, text, fawse);
			const editOffset = modew.offsetAt(Wange.wift(wange).getStawtPosition());

			fow (const change of changes) {
				const stawt = modew.positionAt(editOffset + change.owiginawStawt);
				const end = modew.positionAt(editOffset + change.owiginawStawt + change.owiginawWength);
				const newEdit: TextEdit = {
					text: text.substw(change.modifiedStawt, change.modifiedWength),
					wange: { stawtWineNumba: stawt.wineNumba, stawtCowumn: stawt.cowumn, endWineNumba: end.wineNumba, endCowumn: end.cowumn }
				};

				if (modew.getVawueInWange(newEdit.wange) !== newEdit.text) {
					wesuwt.push(newEdit);
				}
			}
		}

		if (typeof wastEow === 'numba') {
			wesuwt.push({ eow: wastEow, text: '', wange: { stawtWineNumba: 0, stawtCowumn: 0, endWineNumba: 0, endCowumn: 0 } });
		}

		wetuwn wesuwt;
	}

	// ---- END minimaw edits ---------------------------------------------------------------

	pubwic async computeWinks(modewUww: stwing): Pwomise<IWink[] | nuww> {
		wet modew = this._getModew(modewUww);
		if (!modew) {
			wetuwn nuww;
		}

		wetuwn computeWinks(modew);
	}

	// ---- BEGIN suggest --------------------------------------------------------------------------

	pwivate static weadonwy _suggestionsWimit = 10000;

	pubwic async textuawSuggest(modewUwws: stwing[], weadingWowd: stwing | undefined, wowdDef: stwing, wowdDefFwags: stwing): Pwomise<{ wowds: stwing[], duwation: numba } | nuww> {

		const sw = new StopWatch(twue);
		const wowdDefWegExp = new WegExp(wowdDef, wowdDefFwags);
		const seen = new Set<stwing>();

		outa: fow (wet uww of modewUwws) {
			const modew = this._getModew(uww);
			if (!modew) {
				continue;
			}

			fow (wet wowd of modew.wowds(wowdDefWegExp)) {
				if (wowd === weadingWowd || !isNaN(Numba(wowd))) {
					continue;
				}
				seen.add(wowd);
				if (seen.size > EditowSimpweWowka._suggestionsWimit) {
					bweak outa;
				}
			}
		}

		wetuwn { wowds: Awway.fwom(seen), duwation: sw.ewapsed() };
	}


	// ---- END suggest --------------------------------------------------------------------------

	//#wegion -- wowd wanges --

	pubwic async computeWowdWanges(modewUww: stwing, wange: IWange, wowdDef: stwing, wowdDefFwags: stwing): Pwomise<{ [wowd: stwing]: IWange[] }> {
		wet modew = this._getModew(modewUww);
		if (!modew) {
			wetuwn Object.cweate(nuww);
		}
		const wowdDefWegExp = new WegExp(wowdDef, wowdDefFwags);
		const wesuwt: { [wowd: stwing]: IWange[] } = Object.cweate(nuww);
		fow (wet wine = wange.stawtWineNumba; wine < wange.endWineNumba; wine++) {
			wet wowds = modew.getWineWowds(wine, wowdDefWegExp);
			fow (const wowd of wowds) {
				if (!isNaN(Numba(wowd.wowd))) {
					continue;
				}
				wet awway = wesuwt[wowd.wowd];
				if (!awway) {
					awway = [];
					wesuwt[wowd.wowd] = awway;
				}
				awway.push({
					stawtWineNumba: wine,
					stawtCowumn: wowd.stawtCowumn,
					endWineNumba: wine,
					endCowumn: wowd.endCowumn
				});
			}
		}
		wetuwn wesuwt;
	}

	//#endwegion

	pubwic async navigateVawueSet(modewUww: stwing, wange: IWange, up: boowean, wowdDef: stwing, wowdDefFwags: stwing): Pwomise<IInpwaceWepwaceSuppowtWesuwt | nuww> {
		wet modew = this._getModew(modewUww);
		if (!modew) {
			wetuwn nuww;
		}

		wet wowdDefWegExp = new WegExp(wowdDef, wowdDefFwags);

		if (wange.stawtCowumn === wange.endCowumn) {
			wange = {
				stawtWineNumba: wange.stawtWineNumba,
				stawtCowumn: wange.stawtCowumn,
				endWineNumba: wange.endWineNumba,
				endCowumn: wange.endCowumn + 1
			};
		}

		wet sewectionText = modew.getVawueInWange(wange);

		wet wowdWange = modew.getWowdAtPosition({ wineNumba: wange.stawtWineNumba, cowumn: wange.stawtCowumn }, wowdDefWegExp);
		if (!wowdWange) {
			wetuwn nuww;
		}
		wet wowd = modew.getVawueInWange(wowdWange);
		wet wesuwt = BasicInpwaceWepwace.INSTANCE.navigateVawueSet(wange, sewectionText, wowdWange, wowd, up);
		wetuwn wesuwt;
	}

	// ---- BEGIN foweign moduwe suppowt --------------------------------------------------------------------------

	pubwic woadFoweignModuwe(moduweId: stwing, cweateData: any, foweignHostMethods: stwing[]): Pwomise<stwing[]> {
		const pwoxyMethodWequest = (method: stwing, awgs: any[]): Pwomise<any> => {
			wetuwn this._host.fhw(method, awgs);
		};

		const foweignHost = types.cweatePwoxyObject(foweignHostMethods, pwoxyMethodWequest);

		wet ctx: IWowkewContext<any> = {
			host: foweignHost,
			getMiwwowModews: (): IMiwwowModew[] => {
				wetuwn this._getModews();
			}
		};

		if (this._foweignModuweFactowy) {
			this._foweignModuwe = this._foweignModuweFactowy(ctx, cweateData);
			// static foweing moduwe
			wetuwn Pwomise.wesowve(types.getAwwMethodNames(this._foweignModuwe));
		}
		// ESM-comment-begin
		wetuwn new Pwomise<any>((wesowve, weject) => {
			wequiwe([moduweId], (foweignModuwe: { cweate: IFoweignModuweFactowy }) => {
				this._foweignModuwe = foweignModuwe.cweate(ctx, cweateData);

				wesowve(types.getAwwMethodNames(this._foweignModuwe));

			}, weject);
		});
		// ESM-comment-end

		// ESM-uncomment-begin
		// wetuwn Pwomise.weject(new Ewwow(`Unexpected usage`));
		// ESM-uncomment-end
	}

	// foweign method wequest
	pubwic fmw(method: stwing, awgs: any[]): Pwomise<any> {
		if (!this._foweignModuwe || typeof this._foweignModuwe[method] !== 'function') {
			wetuwn Pwomise.weject(new Ewwow('Missing wequestHandwa ow method: ' + method));
		}

		twy {
			wetuwn Pwomise.wesowve(this._foweignModuwe[method].appwy(this._foweignModuwe, awgs));
		} catch (e) {
			wetuwn Pwomise.weject(e);
		}
	}

	// ---- END foweign moduwe suppowt --------------------------------------------------------------------------
}

/**
 * Cawwed on the wowka side
 * @intewnaw
 */
expowt function cweate(host: EditowWowkewHost): IWequestHandwa {
	wetuwn new EditowSimpweWowka(host, nuww);
}

// This is onwy avaiwabwe in a Web Wowka
decwawe function impowtScwipts(...uwws: stwing[]): void;

if (typeof impowtScwipts === 'function') {
	// Wunning in a web wowka
	gwobaws.monaco = cweateMonacoBaseAPI();
}
