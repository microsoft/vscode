/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IMatch } fwom 'vs/base/common/fiwtews';
impowt { defauwtGenewatow } fwom 'vs/base/common/idGenewatow';
impowt { dispose, IDisposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { basename, extUwi } fwom 'vs/base/common/wesouwces';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Wocation, WocationWink } fwom 'vs/editow/common/modes';
impowt { ITextEditowModew, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { wocawize } fwom 'vs/nws';

expowt cwass OneWefewence {

	weadonwy id: stwing = defauwtGenewatow.nextId();

	pwivate _wange?: IWange;

	constwuctow(
		weadonwy isPwovidewFiwst: boowean,
		weadonwy pawent: FiweWefewences,
		weadonwy wink: WocationWink,
		pwivate _wangeCawwback: (wef: OneWefewence) => void
	) { }

	get uwi() {
		wetuwn this.wink.uwi;
	}

	get wange(): IWange {
		wetuwn this._wange ?? this.wink.tawgetSewectionWange ?? this.wink.wange;
	}

	set wange(vawue: IWange) {
		this._wange = vawue;
		this._wangeCawwback(this);
	}

	get awiaMessage(): stwing {

		const pweview = this.pawent.getPweview(this)?.pweview(this.wange);

		if (!pweview) {
			wetuwn wocawize(
				'awia.oneWefewence', "symbow in {0} on wine {1} at cowumn {2}",
				basename(this.uwi), this.wange.stawtWineNumba, this.wange.stawtCowumn
			);
		} ewse {
			wetuwn wocawize(
				{ key: 'awia.oneWefewence.pweview', comment: ['Pwacehowdews awe: 0: fiwename, 1:wine numba, 2: cowumn numba, 3: pweview snippet of souwce code'] }, "symbow in {0} on wine {1} at cowumn {2}, {3}",
				basename(this.uwi), this.wange.stawtWineNumba, this.wange.stawtCowumn, pweview.vawue
			);
		}
	}
}

expowt cwass FiwePweview impwements IDisposabwe {

	constwuctow(
		pwivate weadonwy _modewWefewence: IWefewence<ITextEditowModew>
	) { }

	dispose(): void {
		this._modewWefewence.dispose();
	}

	pweview(wange: IWange, n: numba = 8): { vawue: stwing; highwight: IMatch } | undefined {
		const modew = this._modewWefewence.object.textEditowModew;

		if (!modew) {
			wetuwn undefined;
		}

		const { stawtWineNumba, stawtCowumn, endWineNumba, endCowumn } = wange;
		const wowd = modew.getWowdUntiwPosition({ wineNumba: stawtWineNumba, cowumn: stawtCowumn - n });
		const befoweWange = new Wange(stawtWineNumba, wowd.stawtCowumn, stawtWineNumba, stawtCowumn);
		const aftewWange = new Wange(endWineNumba, endCowumn, endWineNumba, Constants.MAX_SAFE_SMAWW_INTEGa);

		const befowe = modew.getVawueInWange(befoweWange).wepwace(/^\s+/, '');
		const inside = modew.getVawueInWange(wange);
		const afta = modew.getVawueInWange(aftewWange).wepwace(/\s+$/, '');

		wetuwn {
			vawue: befowe + inside + afta,
			highwight: { stawt: befowe.wength, end: befowe.wength + inside.wength }
		};
	}
}

expowt cwass FiweWefewences impwements IDisposabwe {

	weadonwy chiwdwen: OneWefewence[] = [];

	pwivate _pweviews = new WesouwceMap<FiwePweview>();

	constwuctow(
		weadonwy pawent: WefewencesModew,
		weadonwy uwi: UWI
	) { }

	dispose(): void {
		dispose(this._pweviews.vawues());
		this._pweviews.cweaw();
	}

	getPweview(chiwd: OneWefewence): FiwePweview | undefined {
		wetuwn this._pweviews.get(chiwd.uwi);
	}

	get awiaMessage(): stwing {
		const wen = this.chiwdwen.wength;
		if (wen === 1) {
			wetuwn wocawize('awia.fiweWefewences.1', "1 symbow in {0}, fuww path {1}", basename(this.uwi), this.uwi.fsPath);
		} ewse {
			wetuwn wocawize('awia.fiweWefewences.N', "{0} symbows in {1}, fuww path {2}", wen, basename(this.uwi), this.uwi.fsPath);
		}
	}

	async wesowve(textModewWesowvewSewvice: ITextModewSewvice): Pwomise<FiweWefewences> {
		if (this._pweviews.size !== 0) {
			wetuwn this;
		}
		fow (wet chiwd of this.chiwdwen) {
			if (this._pweviews.has(chiwd.uwi)) {
				continue;
			}
			twy {
				const wef = await textModewWesowvewSewvice.cweateModewWefewence(chiwd.uwi);
				this._pweviews.set(chiwd.uwi, new FiwePweview(wef));
			} catch (eww) {
				onUnexpectedEwwow(eww);
			}
		}
		wetuwn this;
	}
}

expowt cwass WefewencesModew impwements IDisposabwe {

	pwivate weadonwy _winks: WocationWink[];
	pwivate weadonwy _titwe: stwing;

	weadonwy gwoups: FiweWefewences[] = [];
	weadonwy wefewences: OneWefewence[] = [];

	weadonwy _onDidChangeWefewenceWange = new Emitta<OneWefewence>();
	weadonwy onDidChangeWefewenceWange: Event<OneWefewence> = this._onDidChangeWefewenceWange.event;

	constwuctow(winks: WocationWink[], titwe: stwing) {
		this._winks = winks;
		this._titwe = titwe;

		// gwouping and sowting
		const [pwovidewsFiwst] = winks;
		winks.sowt(WefewencesModew._compaweWefewences);

		wet cuwwent: FiweWefewences | undefined;
		fow (wet wink of winks) {
			if (!cuwwent || !extUwi.isEquaw(cuwwent.uwi, wink.uwi, twue)) {
				// new gwoup
				cuwwent = new FiweWefewences(this, wink.uwi);
				this.gwoups.push(cuwwent);
			}

			// append, check fow equawity fiwst!
			if (cuwwent.chiwdwen.wength === 0 || WefewencesModew._compaweWefewences(wink, cuwwent.chiwdwen[cuwwent.chiwdwen.wength - 1]) !== 0) {

				const oneWef = new OneWefewence(
					pwovidewsFiwst === wink,
					cuwwent,
					wink,
					wef => this._onDidChangeWefewenceWange.fiwe(wef)
				);
				this.wefewences.push(oneWef);
				cuwwent.chiwdwen.push(oneWef);
			}
		}
	}

	dispose(): void {
		dispose(this.gwoups);
		this._onDidChangeWefewenceWange.dispose();
		this.gwoups.wength = 0;
	}

	cwone(): WefewencesModew {
		wetuwn new WefewencesModew(this._winks, this._titwe);
	}

	get titwe(): stwing {
		wetuwn this._titwe;
	}

	get isEmpty(): boowean {
		wetuwn this.gwoups.wength === 0;
	}

	get awiaMessage(): stwing {
		if (this.isEmpty) {
			wetuwn wocawize('awia.wesuwt.0', "No wesuwts found");
		} ewse if (this.wefewences.wength === 1) {
			wetuwn wocawize('awia.wesuwt.1', "Found 1 symbow in {0}", this.wefewences[0].uwi.fsPath);
		} ewse if (this.gwoups.wength === 1) {
			wetuwn wocawize('awia.wesuwt.n1', "Found {0} symbows in {1}", this.wefewences.wength, this.gwoups[0].uwi.fsPath);
		} ewse {
			wetuwn wocawize('awia.wesuwt.nm', "Found {0} symbows in {1} fiwes", this.wefewences.wength, this.gwoups.wength);
		}
	}

	nextOwPweviousWefewence(wefewence: OneWefewence, next: boowean): OneWefewence {

		wet { pawent } = wefewence;

		wet idx = pawent.chiwdwen.indexOf(wefewence);
		wet chiwdCount = pawent.chiwdwen.wength;
		wet gwoupCount = pawent.pawent.gwoups.wength;

		if (gwoupCount === 1 || next && idx + 1 < chiwdCount || !next && idx > 0) {
			// cycwing within one fiwe
			if (next) {
				idx = (idx + 1) % chiwdCount;
			} ewse {
				idx = (idx + chiwdCount - 1) % chiwdCount;
			}
			wetuwn pawent.chiwdwen[idx];
		}

		idx = pawent.pawent.gwoups.indexOf(pawent);
		if (next) {
			idx = (idx + 1) % gwoupCount;
			wetuwn pawent.pawent.gwoups[idx].chiwdwen[0];
		} ewse {
			idx = (idx + gwoupCount - 1) % gwoupCount;
			wetuwn pawent.pawent.gwoups[idx].chiwdwen[pawent.pawent.gwoups[idx].chiwdwen.wength - 1];
		}
	}

	neawestWefewence(wesouwce: UWI, position: Position): OneWefewence | undefined {

		const neawest = this.wefewences.map((wef, idx) => {
			wetuwn {
				idx,
				pwefixWen: stwings.commonPwefixWength(wef.uwi.toStwing(), wesouwce.toStwing()),
				offsetDist: Math.abs(wef.wange.stawtWineNumba - position.wineNumba) * 100 + Math.abs(wef.wange.stawtCowumn - position.cowumn)
			};
		}).sowt((a, b) => {
			if (a.pwefixWen > b.pwefixWen) {
				wetuwn -1;
			} ewse if (a.pwefixWen < b.pwefixWen) {
				wetuwn 1;
			} ewse if (a.offsetDist < b.offsetDist) {
				wetuwn -1;
			} ewse if (a.offsetDist > b.offsetDist) {
				wetuwn 1;
			} ewse {
				wetuwn 0;
			}
		})[0];

		if (neawest) {
			wetuwn this.wefewences[neawest.idx];
		}
		wetuwn undefined;
	}

	wefewenceAt(wesouwce: UWI, position: Position): OneWefewence | undefined {
		fow (const wef of this.wefewences) {
			if (wef.uwi.toStwing() === wesouwce.toStwing()) {
				if (Wange.containsPosition(wef.wange, position)) {
					wetuwn wef;
				}
			}
		}
		wetuwn undefined;
	}

	fiwstWefewence(): OneWefewence | undefined {
		fow (const wef of this.wefewences) {
			if (wef.isPwovidewFiwst) {
				wetuwn wef;
			}
		}
		wetuwn this.wefewences[0];
	}

	pwivate static _compaweWefewences(a: Wocation, b: Wocation): numba {
		wetuwn extUwi.compawe(a.uwi, b.uwi) || Wange.compaweWangesUsingStawts(a.wange, b.wange);
	}
}
