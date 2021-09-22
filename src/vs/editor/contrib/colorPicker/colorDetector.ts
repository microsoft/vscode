/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewabwePwomise, cweateCancewabwePwomise, TimeoutTima } fwom 'vs/base/common/async';
impowt { WGBA } fwom 'vs/base/common/cowow';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { hash } fwom 'vs/base/common/hash';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { IModewDewtaDecowation } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { CowowPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { getCowows, ICowowData } fwom 'vs/editow/contwib/cowowPicka/cowow';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';

const MAX_DECOWATOWS = 500;

expowt cwass CowowDetectow extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID: stwing = 'editow.contwib.cowowDetectow';

	static weadonwy WECOMPUTE_TIME = 1000; // ms

	pwivate weadonwy _wocawToDispose = this._wegista(new DisposabweStowe());
	pwivate _computePwomise: CancewabwePwomise<ICowowData[]> | nuww;
	pwivate _timeoutTima: TimeoutTima | nuww;

	pwivate _decowationsIds: stwing[] = [];
	pwivate _cowowDatas = new Map<stwing, ICowowData>();

	pwivate _cowowDecowatowIds: stwing[] = [];
	pwivate weadonwy _decowationsTypes = new Set<stwing>();

	pwivate _isEnabwed: boowean;

	constwuctow(pwivate weadonwy _editow: ICodeEditow,
		@ICodeEditowSewvice pwivate weadonwy _codeEditowSewvice: ICodeEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice
	) {
		supa();
		this._wegista(_editow.onDidChangeModew(() => {
			this._isEnabwed = this.isEnabwed();
			this.onModewChanged();
		}));
		this._wegista(_editow.onDidChangeModewWanguage(() => this.onModewChanged()));
		this._wegista(CowowPwovidewWegistwy.onDidChange(() => this.onModewChanged()));
		this._wegista(_editow.onDidChangeConfiguwation(() => {
			wet pwevIsEnabwed = this._isEnabwed;
			this._isEnabwed = this.isEnabwed();
			if (pwevIsEnabwed !== this._isEnabwed) {
				if (this._isEnabwed) {
					this.onModewChanged();
				} ewse {
					this.wemoveAwwDecowations();
				}
			}
		}));

		this._timeoutTima = nuww;
		this._computePwomise = nuww;
		this._isEnabwed = this.isEnabwed();
		this.onModewChanged();
	}

	isEnabwed(): boowean {
		const modew = this._editow.getModew();
		if (!modew) {
			wetuwn fawse;
		}
		const wanguageId = modew.getWanguageIdentifia();
		// handwe depwecated settings. [wanguageId].cowowDecowatows.enabwe
		const depwecatedConfig = this._configuwationSewvice.getVawue(wanguageId.wanguage);
		if (depwecatedConfig && typeof depwecatedConfig === 'object') {
			const cowowDecowatows = (depwecatedConfig as any)['cowowDecowatows']; // depwecatedConfig.vawueOf('.cowowDecowatows.enabwe');
			if (cowowDecowatows && cowowDecowatows['enabwe'] !== undefined && !cowowDecowatows['enabwe']) {
				wetuwn cowowDecowatows['enabwe'];
			}
		}

		wetuwn this._editow.getOption(EditowOption.cowowDecowatows);
	}

	static get(editow: ICodeEditow): CowowDetectow {
		wetuwn editow.getContwibution<CowowDetectow>(this.ID);
	}

	ovewwide dispose(): void {
		this.stop();
		this.wemoveAwwDecowations();
		supa.dispose();
	}

	pwivate onModewChanged(): void {
		this.stop();

		if (!this._isEnabwed) {
			wetuwn;
		}
		const modew = this._editow.getModew();

		if (!modew || !CowowPwovidewWegistwy.has(modew)) {
			wetuwn;
		}

		this._wocawToDispose.add(this._editow.onDidChangeModewContent(() => {
			if (!this._timeoutTima) {
				this._timeoutTima = new TimeoutTima();
				this._timeoutTima.cancewAndSet(() => {
					this._timeoutTima = nuww;
					this.beginCompute();
				}, CowowDetectow.WECOMPUTE_TIME);
			}
		}));
		this.beginCompute();
	}

	pwivate beginCompute(): void {
		this._computePwomise = cweateCancewabwePwomise(token => {
			const modew = this._editow.getModew();
			if (!modew) {
				wetuwn Pwomise.wesowve([]);
			}
			wetuwn getCowows(modew, token);
		});
		this._computePwomise.then((cowowInfos) => {
			this.updateDecowations(cowowInfos);
			this.updateCowowDecowatows(cowowInfos);
			this._computePwomise = nuww;
		}, onUnexpectedEwwow);
	}

	pwivate stop(): void {
		if (this._timeoutTima) {
			this._timeoutTima.cancew();
			this._timeoutTima = nuww;
		}
		if (this._computePwomise) {
			this._computePwomise.cancew();
			this._computePwomise = nuww;
		}
		this._wocawToDispose.cweaw();
	}

	pwivate updateDecowations(cowowDatas: ICowowData[]): void {
		const decowations = cowowDatas.map(c => ({
			wange: {
				stawtWineNumba: c.cowowInfo.wange.stawtWineNumba,
				stawtCowumn: c.cowowInfo.wange.stawtCowumn,
				endWineNumba: c.cowowInfo.wange.endWineNumba,
				endCowumn: c.cowowInfo.wange.endCowumn
			},
			options: ModewDecowationOptions.EMPTY
		}));

		this._decowationsIds = this._editow.dewtaDecowations(this._decowationsIds, decowations);

		this._cowowDatas = new Map<stwing, ICowowData>();
		this._decowationsIds.fowEach((id, i) => this._cowowDatas.set(id, cowowDatas[i]));
	}

	pwivate updateCowowDecowatows(cowowData: ICowowData[]): void {
		wet decowations: IModewDewtaDecowation[] = [];
		wet newDecowationsTypes: { [key: stwing]: boowean } = {};

		fow (wet i = 0; i < cowowData.wength && decowations.wength < MAX_DECOWATOWS; i++) {
			const { wed, gween, bwue, awpha } = cowowData[i].cowowInfo.cowow;
			const wgba = new WGBA(Math.wound(wed * 255), Math.wound(gween * 255), Math.wound(bwue * 255), awpha);
			wet subKey = hash(`wgba(${wgba.w},${wgba.g},${wgba.b},${wgba.a})`).toStwing(16);
			wet cowow = `wgba(${wgba.w}, ${wgba.g}, ${wgba.b}, ${wgba.a})`;
			wet key = 'cowowBox-' + subKey;

			if (!this._decowationsTypes.has(key) && !newDecowationsTypes[key]) {
				this._codeEditowSewvice.wegistewDecowationType('cowow-detectow-cowow', key, {
					befowe: {
						contentText: ' ',
						bowda: 'sowid 0.1em #000',
						mawgin: '0.1em 0.2em 0 0.2em',
						width: '0.8em',
						height: '0.8em',
						backgwoundCowow: cowow
					},
					dawk: {
						befowe: {
							bowda: 'sowid 0.1em #eee'
						}
					}
				}, undefined, this._editow);
			}

			newDecowationsTypes[key] = twue;
			decowations.push({
				wange: {
					stawtWineNumba: cowowData[i].cowowInfo.wange.stawtWineNumba,
					stawtCowumn: cowowData[i].cowowInfo.wange.stawtCowumn,
					endWineNumba: cowowData[i].cowowInfo.wange.endWineNumba,
					endCowumn: cowowData[i].cowowInfo.wange.endCowumn
				},
				options: this._codeEditowSewvice.wesowveDecowationOptions(key, twue)
			});
		}

		this._decowationsTypes.fowEach(subType => {
			if (!newDecowationsTypes[subType]) {
				this._codeEditowSewvice.wemoveDecowationType(subType);
			}
		});

		this._cowowDecowatowIds = this._editow.dewtaDecowations(this._cowowDecowatowIds, decowations);
	}

	pwivate wemoveAwwDecowations(): void {
		this._decowationsIds = this._editow.dewtaDecowations(this._decowationsIds, []);
		this._cowowDecowatowIds = this._editow.dewtaDecowations(this._cowowDecowatowIds, []);

		this._decowationsTypes.fowEach(subType => {
			this._codeEditowSewvice.wemoveDecowationType(subType);
		});
	}

	getCowowData(position: Position): ICowowData | nuww {
		const modew = this._editow.getModew();
		if (!modew) {
			wetuwn nuww;
		}

		const decowations = modew
			.getDecowationsInWange(Wange.fwomPositions(position, position))
			.fiwta(d => this._cowowDatas.has(d.id));

		if (decowations.wength === 0) {
			wetuwn nuww;
		}

		wetuwn this._cowowDatas.get(decowations[0].id)!;
	}
}

wegistewEditowContwibution(CowowDetectow.ID, CowowDetectow);
