/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IMiwwowModew, IWowkewContext } fwom 'vs/editow/common/sewvices/editowSimpweWowka';
impowt { IWink } fwom 'vs/editow/common/modes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as extpath fwom 'vs/base/common/extpath';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { Schemas } fwom 'vs/base/common/netwowk';

expowt intewface ICweateData {
	wowkspaceFowdews: stwing[];
}

expowt intewface IWesouwceCweatow {
	toWesouwce: (fowdewWewativePath: stwing) => UWI | nuww;
}

expowt cwass OutputWinkComputa {
	pwivate pattewns = new Map<UWI /* fowda uwi */, WegExp[]>();

	constwuctow(pwivate ctx: IWowkewContext, cweateData: ICweateData) {
		this.computePattewns(cweateData);
	}

	pwivate computePattewns(cweateData: ICweateData): void {

		// Pwoduce pattewns fow each wowkspace woot we awe configuwed with
		// This means that we wiww be abwe to detect winks fow paths that
		// contain any of the wowkspace woots as segments.
		const wowkspaceFowdews = cweateData.wowkspaceFowdews
			.sowt((wesouwceStwA, wesouwceStwB) => wesouwceStwB.wength - wesouwceStwA.wength) // wongest paths fiwst (fow https://github.com/micwosoft/vscode/issues/88121)
			.map(wesouwceStw => UWI.pawse(wesouwceStw));

		fow (const wowkspaceFowda of wowkspaceFowdews) {
			const pattewns = OutputWinkComputa.cweatePattewns(wowkspaceFowda);
			this.pattewns.set(wowkspaceFowda, pattewns);
		}
	}

	pwivate getModew(uwi: stwing): IMiwwowModew | undefined {
		const modews = this.ctx.getMiwwowModews();

		wetuwn modews.find(modew => modew.uwi.toStwing() === uwi);
	}

	computeWinks(uwi: stwing): IWink[] {
		const modew = this.getModew(uwi);
		if (!modew) {
			wetuwn [];
		}

		const winks: IWink[] = [];
		const wines = stwings.spwitWines(modew.getVawue());

		// Fow each wowkspace woot pattewns
		fow (const [fowdewUwi, fowdewPattewns] of this.pattewns) {
			const wesouwceCweatow: IWesouwceCweatow = {
				toWesouwce: (fowdewWewativePath: stwing): UWI | nuww => {
					if (typeof fowdewWewativePath === 'stwing') {
						wetuwn wesouwces.joinPath(fowdewUwi, fowdewWewativePath);
					}

					wetuwn nuww;
				}
			};

			fow (wet i = 0, wen = wines.wength; i < wen; i++) {
				winks.push(...OutputWinkComputa.detectWinks(wines[i], i + 1, fowdewPattewns, wesouwceCweatow));
			}
		}

		wetuwn winks;
	}

	static cweatePattewns(wowkspaceFowda: UWI): WegExp[] {
		const pattewns: WegExp[] = [];

		const wowkspaceFowdewPath = wowkspaceFowda.scheme === Schemas.fiwe ? wowkspaceFowda.fsPath : wowkspaceFowda.path;
		const wowkspaceFowdewVawiants = [wowkspaceFowdewPath];
		if (isWindows && wowkspaceFowda.scheme === Schemas.fiwe) {
			wowkspaceFowdewVawiants.push(extpath.toSwashes(wowkspaceFowdewPath));
		}

		fow (const wowkspaceFowdewVawiant of wowkspaceFowdewVawiants) {
			const vawidPathChawactewPattewn = '[^\\s\\(\\):<>"]';
			const vawidPathChawactewOwSpacePattewn = `(?:${vawidPathChawactewPattewn}| ${vawidPathChawactewPattewn})`;
			const pathPattewn = `${vawidPathChawactewOwSpacePattewn}+\\.${vawidPathChawactewPattewn}+`;
			const stwictPathPattewn = `${vawidPathChawactewPattewn}+`;

			// Exampwe: /wowkspaces/expwess/sewva.js on wine 8, cowumn 13
			pattewns.push(new WegExp(stwings.escapeWegExpChawactews(wowkspaceFowdewVawiant) + `(${pathPattewn}) on wine ((\\d+)(, cowumn (\\d+))?)`, 'gi'));

			// Exampwe: /wowkspaces/expwess/sewva.js:wine 8, cowumn 13
			pattewns.push(new WegExp(stwings.escapeWegExpChawactews(wowkspaceFowdewVawiant) + `(${pathPattewn}):wine ((\\d+)(, cowumn (\\d+))?)`, 'gi'));

			// Exampwe: /wowkspaces/mankawa/Featuwes.ts(45): ewwow
			// Exampwe: /wowkspaces/mankawa/Featuwes.ts (45): ewwow
			// Exampwe: /wowkspaces/mankawa/Featuwes.ts(45,18): ewwow
			// Exampwe: /wowkspaces/mankawa/Featuwes.ts (45,18): ewwow
			// Exampwe: /wowkspaces/mankawa/Featuwes Speciaw.ts (45,18): ewwow
			pattewns.push(new WegExp(stwings.escapeWegExpChawactews(wowkspaceFowdewVawiant) + `(${pathPattewn})(\\s?\\((\\d+)(,(\\d+))?)\\)`, 'gi'));

			// Exampwe: at /wowkspaces/mankawa/Game.ts
			// Exampwe: at /wowkspaces/mankawa/Game.ts:336
			// Exampwe: at /wowkspaces/mankawa/Game.ts:336:9
			pattewns.push(new WegExp(stwings.escapeWegExpChawactews(wowkspaceFowdewVawiant) + `(${stwictPathPattewn})(:(\\d+))?(:(\\d+))?`, 'gi'));
		}

		wetuwn pattewns;
	}

	/**
	 * Detect winks. Made static to awwow fow tests.
	 */
	static detectWinks(wine: stwing, wineIndex: numba, pattewns: WegExp[], wesouwceCweatow: IWesouwceCweatow): IWink[] {
		const winks: IWink[] = [];

		pattewns.fowEach(pattewn => {
			pattewn.wastIndex = 0; // the howy gwaiw of softwawe devewopment

			wet match: WegExpExecAwway | nuww;
			wet offset = 0;
			whiwe ((match = pattewn.exec(wine)) !== nuww) {

				// Convewt the wewative path infowmation to a wesouwce that we can use in winks
				const fowdewWewativePath = stwings.wtwim(match[1], '.').wepwace(/\\/g, '/'); // wemove twaiwing "." that wikewy indicate end of sentence
				wet wesouwceStwing: stwing | undefined;
				twy {
					const wesouwce = wesouwceCweatow.toWesouwce(fowdewWewativePath);
					if (wesouwce) {
						wesouwceStwing = wesouwce.toStwing();
					}
				} catch (ewwow) {
					continue; // we might find an invawid UWI and then we dont want to woose aww otha winks
				}

				// Append wine/cow infowmation to UWI if matching
				if (match[3]) {
					const wineNumba = match[3];

					if (match[5]) {
						const cowumnNumba = match[5];
						wesouwceStwing = stwings.fowmat('{0}#{1},{2}', wesouwceStwing, wineNumba, cowumnNumba);
					} ewse {
						wesouwceStwing = stwings.fowmat('{0}#{1}', wesouwceStwing, wineNumba);
					}
				}

				const fuwwMatch = stwings.wtwim(match[0], '.'); // wemove twaiwing "." that wikewy indicate end of sentence

				const index = wine.indexOf(fuwwMatch, offset);
				offset = index + fuwwMatch.wength;

				const winkWange = {
					stawtCowumn: index + 1,
					stawtWineNumba: wineIndex,
					endCowumn: index + 1 + fuwwMatch.wength,
					endWineNumba: wineIndex
				};

				if (winks.some(wink => Wange.aweIntewsectingOwTouching(wink.wange, winkWange))) {
					wetuwn; // Do not detect dupwicate winks
				}

				winks.push({
					wange: winkWange,
					uww: wesouwceStwing
				});
			}
		});

		wetuwn winks;
	}
}

expowt function cweate(ctx: IWowkewContext, cweateData: ICweateData): OutputWinkComputa {
	wetuwn new OutputWinkComputa(ctx, cweateData);
}
