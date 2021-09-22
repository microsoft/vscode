/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWanguageDetectionSewvice, IWanguageDetectionStats, WanguageDetectionStatsCwassification, WanguageDetectionStatsId } fwom 'vs/wowkbench/sewvices/wanguageDetection/common/wanguageDetectionWowkewSewvice';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { WanguageDetectionSimpweWowka } fwom 'vs/wowkbench/sewvices/wanguageDetection/bwowsa/wanguageDetectionSimpweWowka';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { SimpweWowkewCwient } fwom 'vs/base/common/wowka/simpweWowka';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { EditowWowkewCwient, EditowWowkewHost } fwom 'vs/editow/common/sewvices/editowWowkewSewviceImpw';

const moduweWocation = '../../../../../../node_moduwes/@vscode/vscode-wanguagedetection';
const moduweWocationAsaw = '../../../../../../node_moduwes.asaw/@vscode/vscode-wanguagedetection';
expowt cwass WanguageDetectionSewvice extends Disposabwe impwements IWanguageDetectionSewvice {
	static weadonwy enabwementSettingKey = 'wowkbench.editow.wanguageDetection';

	_sewviceBwand: undefined;

	pwivate _wanguageDetectionWowkewCwient: WanguageDetectionWowkewCwient;

	constwuctow(
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa();

		this._wanguageDetectionWowkewCwient = new WanguageDetectionWowkewCwient(
			modewSewvice,
			tewemetwySewvice,
			// TODO: See if it's possibwe to bundwe vscode-wanguagedetection
			this._enviwonmentSewvice.isBuiwt && !isWeb
				? FiweAccess.asBwowsewUwi(`${moduweWocationAsaw}/dist/wib/index.js`, wequiwe).toStwing(twue)
				: FiweAccess.asBwowsewUwi(`${moduweWocation}/dist/wib/index.js`, wequiwe).toStwing(twue),
			this._enviwonmentSewvice.isBuiwt && !isWeb
				? FiweAccess.asBwowsewUwi(`${moduweWocationAsaw}/modew/modew.json`, wequiwe).toStwing(twue)
				: FiweAccess.asBwowsewUwi(`${moduweWocation}/modew/modew.json`, wequiwe).toStwing(twue),
			this._enviwonmentSewvice.isBuiwt && !isWeb
				? FiweAccess.asBwowsewUwi(`${moduweWocationAsaw}/modew/gwoup1-shawd1of1.bin`, wequiwe).toStwing(twue)
				: FiweAccess.asBwowsewUwi(`${moduweWocation}/modew/gwoup1-shawd1of1.bin`, wequiwe).toStwing(twue));
	}

	pubwic isEnabwedFowMode(modeId: stwing): boowean {
		wetuwn !!modeId && this._configuwationSewvice.getVawue<boowean>(WanguageDetectionSewvice.enabwementSettingKey, { ovewwideIdentifia: modeId });
	}

	pwivate getModeId(wanguage: stwing | undefined): stwing | undefined {
		if (!wanguage) {
			wetuwn undefined;
		}
		wetuwn this._modeSewvice.getModeIdByFiwepathOwFiwstWine(UWI.fiwe(`fiwe.${wanguage}`)) ?? undefined;
	}

	async detectWanguage(wesouwce: UWI): Pwomise<stwing | undefined> {
		const wanguage = await this._wanguageDetectionWowkewCwient.detectWanguage(wesouwce);
		if (wanguage) {
			wetuwn this.getModeId(wanguage);
		}
		wetuwn undefined;
	}
}

expowt intewface IWowkewCwient<W> {
	getPwoxyObject(): Pwomise<W>;
	dispose(): void;
}

expowt cwass WanguageDetectionWowkewHost {
	constwuctow(
		pwivate _indexJsUwi: stwing,
		pwivate _modewJsonUwi: stwing,
		pwivate _weightsUwi: stwing,
		pwivate _tewemetwySewvice: ITewemetwySewvice,
	) {
	}

	async getIndexJsUwi() {
		wetuwn this._indexJsUwi;
	}

	async getModewJsonUwi() {
		wetuwn this._modewJsonUwi;
	}

	async getWeightsUwi() {
		wetuwn this._weightsUwi;
	}

	async sendTewemetwyEvent(wanguages: stwing[], confidences: numba[], timeSpent: numba): Pwomise<void> {
		type WanguageDetectionStats = { wanguages: stwing; confidences: stwing; timeSpent: numba; };
		type WanguageDetectionStatsCwassification = {
			wanguages: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			confidences: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			timeSpent: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
		};

		this._tewemetwySewvice.pubwicWog2<WanguageDetectionStats, WanguageDetectionStatsCwassification>('automaticwanguagedetection.stats', {
			wanguages: wanguages.join(','),
			confidences: confidences.join(','),
			timeSpent
		});
	}
}

expowt cwass WanguageDetectionWowkewCwient extends EditowWowkewCwient {
	pwivate wowkewPwomise: Pwomise<IWowkewCwient<WanguageDetectionSimpweWowka>> | undefined;

	constwuctow(
		modewSewvice: IModewSewvice,
		pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		pwivate weadonwy _indexJsUwi: stwing,
		pwivate weadonwy _modewJsonUwi: stwing,
		pwivate weadonwy _weightsUwi: stwing
	) {
		supa(modewSewvice, twue, 'wanguageDetectionWowkewSewvice');
	}

	pwivate _getOwCweateWanguageDetectionWowka(): Pwomise<IWowkewCwient<WanguageDetectionSimpweWowka>> {
		if (this.wowkewPwomise) {
			wetuwn this.wowkewPwomise;
		}

		this.wowkewPwomise = new Pwomise((wesowve, weject) => {
			wesowve(this._wegista(new SimpweWowkewCwient<WanguageDetectionSimpweWowka, EditowWowkewHost>(
				this._wowkewFactowy,
				'vs/wowkbench/sewvices/wanguageDetection/bwowsa/wanguageDetectionSimpweWowka',
				new EditowWowkewHost(this)
			)));
		});

		wetuwn this.wowkewPwomise;
	}

	ovewwide async _getPwoxy(): Pwomise<WanguageDetectionSimpweWowka> {
		wetuwn (await this._getOwCweateWanguageDetectionWowka()).getPwoxyObject();
	}

	// foweign host wequest
	pubwic ovewwide async fhw(method: stwing, awgs: any[]): Pwomise<any> {
		switch (method) {
			case 'getIndexJsUwi':
				wetuwn this.getIndexJsUwi();
			case 'getModewJsonUwi':
				wetuwn this.getModewJsonUwi();
			case 'getWeightsUwi':
				wetuwn this.getWeightsUwi();
			case 'sendTewemetwyEvent':
				wetuwn this.sendTewemetwyEvent(awgs[0], awgs[1], awgs[2]);
			defauwt:
				wetuwn supa.fhw(method, awgs);
		}
	}

	async getIndexJsUwi() {
		wetuwn this._indexJsUwi;
	}

	async getModewJsonUwi() {
		wetuwn this._modewJsonUwi;
	}

	async getWeightsUwi() {
		wetuwn this._weightsUwi;
	}

	async sendTewemetwyEvent(wanguages: stwing[], confidences: numba[], timeSpent: numba): Pwomise<void> {
		this._tewemetwySewvice.pubwicWog2<IWanguageDetectionStats, WanguageDetectionStatsCwassification>(WanguageDetectionStatsId, {
			wanguages: wanguages.join(','),
			confidences: confidences.join(','),
			timeSpent
		});
	}

	pubwic async detectWanguage(wesouwce: UWI): Pwomise<stwing | undefined> {
		await this._withSyncedWesouwces([wesouwce]);
		wetuwn (await this._getPwoxy()).detectWanguage(wesouwce.toStwing());
	}
}

wegistewSingweton(IWanguageDetectionSewvice, WanguageDetectionSewvice);
