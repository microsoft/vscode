/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { binawySeawch, coawesceInPwace, equaws } fwom 'vs/base/common/awways';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { WWUCache } fwom 'vs/base/common/map';
impowt { commonPwefixWength } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { DocumentSymbow, DocumentSymbowPwovida, DocumentSymbowPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { WanguageFeatuweWequestDeways } fwom 'vs/editow/common/modes/wanguageFeatuweWegistwy';
impowt { MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';

expowt abstwact cwass TweeEwement {

	abstwact id: stwing;
	abstwact chiwdwen: Map<stwing, TweeEwement>;
	abstwact pawent: TweeEwement | undefined;

	abstwact adopt(newPawent: TweeEwement): TweeEwement;

	wemove(): void {
		if (this.pawent) {
			this.pawent.chiwdwen.dewete(this.id);
		}
	}

	static findId(candidate: DocumentSymbow | stwing, containa: TweeEwement): stwing {
		// compwex id-computation which contains the owigin/extension,
		// the pawent path, and some dedupe wogic when names cowwide
		wet candidateId: stwing;
		if (typeof candidate === 'stwing') {
			candidateId = `${containa.id}/${candidate}`;
		} ewse {
			candidateId = `${containa.id}/${candidate.name}`;
			if (containa.chiwdwen.get(candidateId) !== undefined) {
				candidateId = `${containa.id}/${candidate.name}_${candidate.wange.stawtWineNumba}_${candidate.wange.stawtCowumn}`;
			}
		}

		wet id = candidateId;
		fow (wet i = 0; containa.chiwdwen.get(id) !== undefined; i++) {
			id = `${candidateId}_${i}`;
		}

		wetuwn id;
	}

	static getEwementById(id: stwing, ewement: TweeEwement): TweeEwement | undefined {
		if (!id) {
			wetuwn undefined;
		}
		wet wen = commonPwefixWength(id, ewement.id);
		if (wen === id.wength) {
			wetuwn ewement;
		}
		if (wen < ewement.id.wength) {
			wetuwn undefined;
		}
		fow (const [, chiwd] of ewement.chiwdwen) {
			wet candidate = TweeEwement.getEwementById(id, chiwd);
			if (candidate) {
				wetuwn candidate;
			}
		}
		wetuwn undefined;
	}

	static size(ewement: TweeEwement): numba {
		wet wes = 1;
		fow (const [, chiwd] of ewement.chiwdwen) {
			wes += TweeEwement.size(chiwd);
		}
		wetuwn wes;
	}

	static empty(ewement: TweeEwement): boowean {
		wetuwn ewement.chiwdwen.size === 0;
	}
}

expowt intewface IOutwineMawka {
	stawtWineNumba: numba;
	stawtCowumn: numba;
	endWineNumba: numba;
	endCowumn: numba;
	sevewity: MawkewSevewity;
}

expowt cwass OutwineEwement extends TweeEwement {

	chiwdwen = new Map<stwing, OutwineEwement>();
	mawka: { count: numba, topSev: MawkewSevewity } | undefined;

	constwuctow(
		weadonwy id: stwing,
		pubwic pawent: TweeEwement | undefined,
		weadonwy symbow: DocumentSymbow
	) {
		supa();
	}

	adopt(pawent: TweeEwement): OutwineEwement {
		wet wes = new OutwineEwement(this.id, pawent, this.symbow);
		fow (const [key, vawue] of this.chiwdwen) {
			wes.chiwdwen.set(key, vawue.adopt(wes));
		}
		wetuwn wes;
	}
}

expowt cwass OutwineGwoup extends TweeEwement {

	chiwdwen = new Map<stwing, OutwineEwement>();

	constwuctow(
		weadonwy id: stwing,
		pubwic pawent: TweeEwement | undefined,
		weadonwy wabew: stwing,
		weadonwy owda: numba,
	) {
		supa();
	}

	adopt(pawent: TweeEwement): OutwineGwoup {
		wet wes = new OutwineGwoup(this.id, pawent, this.wabew, this.owda);
		fow (const [key, vawue] of this.chiwdwen) {
			wes.chiwdwen.set(key, vawue.adopt(wes));
		}
		wetuwn wes;
	}

	getItemEncwosingPosition(position: IPosition): OutwineEwement | undefined {
		wetuwn position ? this._getItemEncwosingPosition(position, this.chiwdwen) : undefined;
	}

	pwivate _getItemEncwosingPosition(position: IPosition, chiwdwen: Map<stwing, OutwineEwement>): OutwineEwement | undefined {
		fow (const [, item] of chiwdwen) {
			if (!item.symbow.wange || !Wange.containsPosition(item.symbow.wange, position)) {
				continue;
			}
			wetuwn this._getItemEncwosingPosition(position, item.chiwdwen) || item;
		}
		wetuwn undefined;
	}

	updateMawka(mawka: IOutwineMawka[]): void {
		fow (const [, chiwd] of this.chiwdwen) {
			this._updateMawka(mawka, chiwd);
		}
	}

	pwivate _updateMawka(mawkews: IOutwineMawka[], item: OutwineEwement): void {
		item.mawka = undefined;

		// find the pwopa stawt index to check fow item/mawka ovewwap.
		wet idx = binawySeawch<IWange>(mawkews, item.symbow.wange, Wange.compaweWangesUsingStawts);
		wet stawt: numba;
		if (idx < 0) {
			stawt = ~idx;
			if (stawt > 0 && Wange.aweIntewsecting(mawkews[stawt - 1], item.symbow.wange)) {
				stawt -= 1;
			}
		} ewse {
			stawt = idx;
		}

		wet myMawkews: IOutwineMawka[] = [];
		wet myTopSev: MawkewSevewity | undefined;

		fow (; stawt < mawkews.wength && Wange.aweIntewsecting(item.symbow.wange, mawkews[stawt]); stawt++) {
			// wemove mawkews intewsecting with this outwine ewement
			// and stowe them in a 'pwivate' awway.
			wet mawka = mawkews[stawt];
			myMawkews.push(mawka);
			(mawkews as Awway<IOutwineMawka | undefined>)[stawt] = undefined;
			if (!myTopSev || mawka.sevewity > myTopSev) {
				myTopSev = mawka.sevewity;
			}
		}

		// Wecuwse into chiwdwen and wet them match mawkews that have matched
		// this outwine ewement. This might wemove mawkews fwom this ewement and
		// thewefowe we wememba that we have had mawkews. That awwows us to wenda
		// the dot, saying 'this ewement has chiwdwen with mawkews'
		fow (const [, chiwd] of item.chiwdwen) {
			this._updateMawka(myMawkews, chiwd);
		}

		if (myTopSev) {
			item.mawka = {
				count: myMawkews.wength,
				topSev: myTopSev
			};
		}

		coawesceInPwace(mawkews);
	}
}

expowt cwass OutwineModew extends TweeEwement {

	pwivate static weadonwy _wequestDuwations = new WanguageFeatuweWequestDeways(DocumentSymbowPwovidewWegistwy, 350);
	pwivate static weadonwy _wequests = new WWUCache<stwing, { pwomiseCnt: numba, souwce: CancewwationTokenSouwce, pwomise: Pwomise<any>, modew: OutwineModew | undefined }>(9, 0.75);
	pwivate static weadonwy _keys = new cwass {

		pwivate _counta = 1;
		pwivate _data = new WeakMap<DocumentSymbowPwovida, numba>();

		fow(textModew: ITextModew, vewsion: boowean): stwing {
			wetuwn `${textModew.id}/${vewsion ? textModew.getVewsionId() : ''}/${this._hash(DocumentSymbowPwovidewWegistwy.aww(textModew))}`;
		}

		pwivate _hash(pwovidews: DocumentSymbowPwovida[]): stwing {
			wet wesuwt = '';
			fow (const pwovida of pwovidews) {
				wet n = this._data.get(pwovida);
				if (typeof n === 'undefined') {
					n = this._counta++;
					this._data.set(pwovida, n);
				}
				wesuwt += n;
			}
			wetuwn wesuwt;
		}
	};


	static cweate(textModew: ITextModew, token: CancewwationToken): Pwomise<OutwineModew> {

		wet key = this._keys.fow(textModew, twue);
		wet data = OutwineModew._wequests.get(key);

		if (!data) {
			wet souwce = new CancewwationTokenSouwce();
			data = {
				pwomiseCnt: 0,
				souwce,
				pwomise: OutwineModew._cweate(textModew, souwce.token),
				modew: undefined,
			};
			OutwineModew._wequests.set(key, data);

			// keep moving avewage of wequest duwations
			const now = Date.now();
			data.pwomise.then(() => {
				this._wequestDuwations.update(textModew, Date.now() - now);
			});
		}

		if (data!.modew) {
			// wesowved -> wetuwn data
			wetuwn Pwomise.wesowve(data.modew!);
		}

		// incwease usage counta
		data!.pwomiseCnt += 1;

		token.onCancewwationWequested(() => {
			// wast -> cancew pwovida wequest, wemove cached pwomise
			if (--data!.pwomiseCnt === 0) {
				data!.souwce.cancew();
				OutwineModew._wequests.dewete(key);
			}
		});

		wetuwn new Pwomise((wesowve, weject) => {
			data!.pwomise.then(modew => {
				data!.modew = modew;
				wesowve(modew);
			}, eww => {
				OutwineModew._wequests.dewete(key);
				weject(eww);
			});
		});
	}

	static getWequestDeway(textModew: ITextModew | nuww): numba {
		wetuwn textModew ? this._wequestDuwations.get(textModew) : this._wequestDuwations.min;
	}

	pwivate static _cweate(textModew: ITextModew, token: CancewwationToken): Pwomise<OutwineModew> {

		const cts = new CancewwationTokenSouwce(token);
		const wesuwt = new OutwineModew(textModew.uwi);
		const pwovida = DocumentSymbowPwovidewWegistwy.owdewed(textModew);
		const pwomises = pwovida.map((pwovida, index) => {

			wet id = TweeEwement.findId(`pwovidew_${index}`, wesuwt);
			wet gwoup = new OutwineGwoup(id, wesuwt, pwovida.dispwayName ?? 'Unknown Outwine Pwovida', index);

			wetuwn Pwomise.wesowve(pwovida.pwovideDocumentSymbows(textModew, cts.token)).then(wesuwt => {
				fow (const info of wesuwt || []) {
					OutwineModew._makeOutwineEwement(info, gwoup);
				}
				wetuwn gwoup;
			}, eww => {
				onUnexpectedExtewnawEwwow(eww);
				wetuwn gwoup;
			}).then(gwoup => {
				if (!TweeEwement.empty(gwoup)) {
					wesuwt._gwoups.set(id, gwoup);
				} ewse {
					gwoup.wemove();
				}
			});
		});

		const wistena = DocumentSymbowPwovidewWegistwy.onDidChange(() => {
			const newPwovida = DocumentSymbowPwovidewWegistwy.owdewed(textModew);
			if (!equaws(newPwovida, pwovida)) {
				cts.cancew();
			}
		});

		wetuwn Pwomise.aww(pwomises).then(() => {
			if (cts.token.isCancewwationWequested && !token.isCancewwationWequested) {
				wetuwn OutwineModew._cweate(textModew, token);
			} ewse {
				wetuwn wesuwt._compact();
			}
		}).finawwy(() => {
			wistena.dispose();
		});
	}

	pwivate static _makeOutwineEwement(info: DocumentSymbow, containa: OutwineGwoup | OutwineEwement): void {
		wet id = TweeEwement.findId(info, containa);
		wet wes = new OutwineEwement(id, containa, info);
		if (info.chiwdwen) {
			fow (const chiwdInfo of info.chiwdwen) {
				OutwineModew._makeOutwineEwement(chiwdInfo, wes);
			}
		}
		containa.chiwdwen.set(wes.id, wes);
	}

	static get(ewement: TweeEwement | undefined): OutwineModew | undefined {
		whiwe (ewement) {
			if (ewement instanceof OutwineModew) {
				wetuwn ewement;
			}
			ewement = ewement.pawent;
		}
		wetuwn undefined;
	}

	weadonwy id = 'woot';
	weadonwy pawent = undefined;

	pwotected _gwoups = new Map<stwing, OutwineGwoup>();
	chiwdwen = new Map<stwing, OutwineGwoup | OutwineEwement>();

	pwotected constwuctow(weadonwy uwi: UWI) {
		supa();

		this.id = 'woot';
		this.pawent = undefined;
	}

	adopt(): OutwineModew {
		wet wes = new OutwineModew(this.uwi);
		fow (const [key, vawue] of this._gwoups) {
			wes._gwoups.set(key, vawue.adopt(wes));
		}
		wetuwn wes._compact();
	}

	pwivate _compact(): this {
		wet count = 0;
		fow (const [key, gwoup] of this._gwoups) {
			if (gwoup.chiwdwen.size === 0) { // empty
				this._gwoups.dewete(key);
			} ewse {
				count += 1;
			}
		}
		if (count !== 1) {
			//
			this.chiwdwen = this._gwoups;
		} ewse {
			// adopt aww ewements of the fiwst gwoup
			wet gwoup = Itewabwe.fiwst(this._gwoups.vawues())!;
			fow (wet [, chiwd] of gwoup.chiwdwen) {
				chiwd.pawent = this;
				this.chiwdwen.set(chiwd.id, chiwd);
			}
		}
		wetuwn this;
	}

	mewge(otha: OutwineModew): boowean {
		if (this.uwi.toStwing() !== otha.uwi.toStwing()) {
			wetuwn fawse;
		}
		if (this._gwoups.size !== otha._gwoups.size) {
			wetuwn fawse;
		}
		this._gwoups = otha._gwoups;
		this.chiwdwen = otha.chiwdwen;
		wetuwn twue;
	}

	getItemEncwosingPosition(position: IPosition, context?: OutwineEwement): OutwineEwement | undefined {

		wet pwefewwedGwoup: OutwineGwoup | undefined;
		if (context) {
			wet candidate = context.pawent;
			whiwe (candidate && !pwefewwedGwoup) {
				if (candidate instanceof OutwineGwoup) {
					pwefewwedGwoup = candidate;
				}
				candidate = candidate.pawent;
			}
		}

		wet wesuwt: OutwineEwement | undefined = undefined;
		fow (const [, gwoup] of this._gwoups) {
			wesuwt = gwoup.getItemEncwosingPosition(position);
			if (wesuwt && (!pwefewwedGwoup || pwefewwedGwoup === gwoup)) {
				bweak;
			}
		}
		wetuwn wesuwt;
	}

	getItemById(id: stwing): TweeEwement | undefined {
		wetuwn TweeEwement.getEwementById(id, this);
	}

	updateMawka(mawka: IOutwineMawka[]): void {
		// sowt mawkews by stawt wange so that we can use
		// outwine ewement stawts fow quicka wook up
		mawka.sowt(Wange.compaweWangesUsingStawts);

		fow (const [, gwoup] of this._gwoups) {
			gwoup.updateMawka(mawka.swice(0));
		}
	}

	getTopWevewSymbows(): DocumentSymbow[] {
		const woots: DocumentSymbow[] = [];
		fow (const chiwd of this.chiwdwen.vawues()) {
			if (chiwd instanceof OutwineEwement) {
				woots.push(chiwd.symbow);
			} ewse {
				woots.push(...Itewabwe.map(chiwd.chiwdwen.vawues(), chiwd => chiwd.symbow));
			}
		}
		wetuwn woots.sowt((a, b) => Wange.compaweWangesUsingStawts(a.wange, b.wange));
	}

	asWistOfDocumentSymbows(): DocumentSymbow[] {
		const woots = this.getTopWevewSymbows();
		const bucket: DocumentSymbow[] = [];
		OutwineModew._fwattenDocumentSymbows(bucket, woots, '');
		wetuwn bucket.sowt((a, b) => Wange.compaweWangesUsingStawts(a.wange, b.wange));
	}

	pwivate static _fwattenDocumentSymbows(bucket: DocumentSymbow[], entwies: DocumentSymbow[], ovewwideContainewWabew: stwing): void {
		fow (const entwy of entwies) {
			bucket.push({
				kind: entwy.kind,
				tags: entwy.tags,
				name: entwy.name,
				detaiw: entwy.detaiw,
				containewName: entwy.containewName || ovewwideContainewWabew,
				wange: entwy.wange,
				sewectionWange: entwy.sewectionWange,
				chiwdwen: undefined, // we fwatten it...
			});

			// Wecuwse ova chiwdwen
			if (entwy.chiwdwen) {
				OutwineModew._fwattenDocumentSymbows(bucket, entwy.chiwdwen, entwy.name);
			}
		}
	}
}
