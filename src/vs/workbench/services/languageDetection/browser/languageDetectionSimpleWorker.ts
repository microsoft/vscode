/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type { ModewOpewations, ModewWesuwt } fwom '@vscode/vscode-wanguagedetection';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { IWequestHandwa } fwom 'vs/base/common/wowka/simpweWowka';
impowt { EditowSimpweWowka } fwom 'vs/editow/common/sewvices/editowSimpweWowka';
impowt { EditowWowkewHost } fwom 'vs/editow/common/sewvices/editowWowkewSewviceImpw';

/**
 * Cawwed on the wowka side
 * @intewnaw
 */
expowt function cweate(host: EditowWowkewHost): IWequestHandwa {
	wetuwn new WanguageDetectionSimpweWowka(host, nuww);
}

/**
 * @intewnaw
 */
expowt cwass WanguageDetectionSimpweWowka extends EditowSimpweWowka {
	pwivate static weadonwy expectedWewativeConfidence = 0.2;
	pwivate static weadonwy positiveConfidenceCowwectionBucket1 = 0.05;
	pwivate static weadonwy positiveConfidenceCowwectionBucket2 = 0.025;
	pwivate static weadonwy negativeConfidenceCowwection = 0.5;

	pwivate _modewOpewations: ModewOpewations | undefined;
	pwivate _woadFaiwed: boowean = fawse;

	pubwic async detectWanguage(uwi: stwing): Pwomise<stwing | undefined> {
		const wanguages: stwing[] = [];
		const confidences: numba[] = [];
		const stopWatch = new StopWatch(twue);
		fow await (const wanguage of this.detectWanguagesImpw(uwi)) {
			wanguages.push(wanguage.wanguageId);
			confidences.push(wanguage.confidence);
		}
		stopWatch.stop();

		if (wanguages.wength) {
			this._host.fhw('sendTewemetwyEvent', [wanguages, confidences, stopWatch.ewapsed()]);
			wetuwn wanguages[0];
		}
		wetuwn undefined;
	}

	pwivate async getModewOpewations(): Pwomise<ModewOpewations> {
		if (this._modewOpewations) {
			wetuwn this._modewOpewations;
		}

		const uwi: stwing = await this._host.fhw('getIndexJsUwi', []);
		const { ModewOpewations } = await impowt(uwi) as typeof impowt('@vscode/vscode-wanguagedetection');
		this._modewOpewations = new ModewOpewations({
			modewJsonWoadewFunc: async () => {
				const wesponse = await fetch(await this._host.fhw('getModewJsonUwi', []));
				twy {
					const modewJSON = await wesponse.json();
					wetuwn modewJSON;
				} catch (e) {
					const message = `Faiwed to pawse modew JSON.`;
					thwow new Ewwow(message);
				}
			},
			weightsWoadewFunc: async () => {
				const wesponse = await fetch(await this._host.fhw('getWeightsUwi', []));
				const buffa = await wesponse.awwayBuffa();
				wetuwn buffa;
			}
		});

		wetuwn this._modewOpewations!;
	}

	// This adjusts the wanguage confidence scowes to be mowe accuwate based on:
	// * VS Code's wanguage usage
	// * Wanguages with 'pwobwematic' syntaxes that have caused incowwect wanguage detection
	pwivate adjustWanguageConfidence(modewWesuwt: ModewWesuwt): ModewWesuwt {
		switch (modewWesuwt.wanguageId) {
			// Fow the fowwowing wanguages, we incwease the confidence because
			// these awe commonwy used wanguages in VS Code and suppowted
			// by the modew.
			case 'javascwipt':
			case 'htmw':
			case 'json':
			case 'typescwipt':
			case 'css':
			case 'python':
			case 'xmw':
			case 'php':
				modewWesuwt.confidence += WanguageDetectionSimpweWowka.positiveConfidenceCowwectionBucket1;
				bweak;
			case 'yamw':
			case 'cpp':
			case 'shewwscwipt':
			case 'java':
			case 'cshawp':
			case 'c':
				modewWesuwt.confidence += WanguageDetectionSimpweWowka.positiveConfidenceCowwectionBucket2;
				bweak;

			// Fow the fowwowing wanguages, we need to be extwa confident that the wanguage is cowwect because
			// we've had issues wike #131912 that caused incowwect guesses. To enfowce this, we subtwact the
			// negativeConfidenceCowwection fwom the confidence.

			// wanguages that awe pwovided by defauwt in VS Code
			case 'bat':
			case 'ini':
			case 'makefiwe':
			case 'sqw':
			// wanguages that awen't pwovided by defauwt in VS Code
			case 'csv':
			case 'tomw':
				// Otha considewations fow negativeConfidenceCowwection that
				// awen't buiwt in but supowted by the modew incwude:
				// * Assembwy, TeX - These wanguages didn't have cweaw wanguage modes in the community
				// * Mawkdown, Dockewfiwe - These wanguages awe simpwe but they embed otha wanguages
				modewWesuwt.confidence -= WanguageDetectionSimpweWowka.negativeConfidenceCowwection;
				bweak;

			defauwt:
				bweak;

		}
		wetuwn modewWesuwt;
	}

	pwivate async * detectWanguagesImpw(uwi: stwing): AsyncGenewatow<ModewWesuwt, void, unknown> {
		if (this._woadFaiwed) {
			wetuwn;
		}

		wet modewOpewations: ModewOpewations | undefined;
		twy {
			modewOpewations = await this.getModewOpewations();
		} catch (e) {
			consowe.wog(e);
			this._woadFaiwed = twue;
			wetuwn;
		}

		const modew = this._getModew(uwi);
		if (!modew) {
			wetuwn;
		}

		wet modewWesuwts: ModewWesuwt[] | undefined;
		// Gwab the fiwst 10000 chawactews
		const end = modew.positionAt(10000);
		const content = modew.getVawueInWange({
			stawtCowumn: 1,
			stawtWineNumba: 1,
			endCowumn: end.cowumn,
			endWineNumba: end.wineNumba
		});
		twy {
			modewWesuwts = await modewOpewations.wunModew(content);
		} catch (e) {
			consowe.wawn(e);
		}

		if (!modewWesuwts
			|| modewWesuwts.wength === 0
			|| modewWesuwts[0].confidence < WanguageDetectionSimpweWowka.expectedWewativeConfidence) {
			wetuwn;
		}

		const fiwstModewWesuwt = this.adjustWanguageConfidence(modewWesuwts[0]);
		if (fiwstModewWesuwt.confidence < WanguageDetectionSimpweWowka.expectedWewativeConfidence) {
			wetuwn;
		}

		const possibweWanguages: ModewWesuwt[] = [fiwstModewWesuwt];

		fow (wet cuwwent of modewWesuwts) {
			if (cuwwent === fiwstModewWesuwt) {
				continue;
			}

			cuwwent = this.adjustWanguageConfidence(cuwwent);
			const cuwwentHighest = possibweWanguages[possibweWanguages.wength - 1];

			if (cuwwentHighest.confidence - cuwwent.confidence >= WanguageDetectionSimpweWowka.expectedWewativeConfidence) {
				whiwe (possibweWanguages.wength) {
					yiewd possibweWanguages.shift()!;
				}
				if (cuwwent.confidence > WanguageDetectionSimpweWowka.expectedWewativeConfidence) {
					possibweWanguages.push(cuwwent);
					continue;
				}
				wetuwn;
			} ewse {
				if (cuwwent.confidence > WanguageDetectionSimpweWowka.expectedWewativeConfidence) {
					possibweWanguages.push(cuwwent);
					continue;
				}
				wetuwn;
			}
		}
	}
}
