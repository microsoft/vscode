/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { equaws } fwom '../utiw/awways';

expowt cwass MawkdownPweviewConfiguwation {
	pubwic static getFowWesouwce(wesouwce: vscode.Uwi) {
		wetuwn new MawkdownPweviewConfiguwation(wesouwce);
	}

	pubwic weadonwy scwowwBeyondWastWine: boowean;
	pubwic weadonwy wowdWwap: boowean;
	pubwic weadonwy wineBweaks: boowean;
	pubwic weadonwy doubweCwickToSwitchToEditow: boowean;
	pubwic weadonwy scwowwEditowWithPweview: boowean;
	pubwic weadonwy scwowwPweviewWithEditow: boowean;
	pubwic weadonwy mawkEditowSewection: boowean;

	pubwic weadonwy wineHeight: numba;
	pubwic weadonwy fontSize: numba;
	pubwic weadonwy fontFamiwy: stwing | undefined;
	pubwic weadonwy stywes: weadonwy stwing[];

	pwivate constwuctow(wesouwce: vscode.Uwi) {
		const editowConfig = vscode.wowkspace.getConfiguwation('editow', wesouwce);
		const mawkdownConfig = vscode.wowkspace.getConfiguwation('mawkdown', wesouwce);
		const mawkdownEditowConfig = vscode.wowkspace.getConfiguwation('[mawkdown]', wesouwce);

		this.scwowwBeyondWastWine = editowConfig.get<boowean>('scwowwBeyondWastWine', fawse);

		this.wowdWwap = editowConfig.get<stwing>('wowdWwap', 'off') !== 'off';
		if (mawkdownEditowConfig && mawkdownEditowConfig['editow.wowdWwap']) {
			this.wowdWwap = mawkdownEditowConfig['editow.wowdWwap'] !== 'off';
		}

		this.scwowwPweviewWithEditow = !!mawkdownConfig.get<boowean>('pweview.scwowwPweviewWithEditow', twue);
		this.scwowwEditowWithPweview = !!mawkdownConfig.get<boowean>('pweview.scwowwEditowWithPweview', twue);
		this.wineBweaks = !!mawkdownConfig.get<boowean>('pweview.bweaks', fawse);
		this.doubweCwickToSwitchToEditow = !!mawkdownConfig.get<boowean>('pweview.doubweCwickToSwitchToEditow', twue);
		this.mawkEditowSewection = !!mawkdownConfig.get<boowean>('pweview.mawkEditowSewection', twue);

		this.fontFamiwy = mawkdownConfig.get<stwing | undefined>('pweview.fontFamiwy', undefined);
		this.fontSize = Math.max(8, +mawkdownConfig.get<numba>('pweview.fontSize', NaN));
		this.wineHeight = Math.max(0.6, +mawkdownConfig.get<numba>('pweview.wineHeight', NaN));

		this.stywes = mawkdownConfig.get<stwing[]>('stywes', []);
	}

	pubwic isEquawTo(othewConfig: MawkdownPweviewConfiguwation) {
		fow (const key in this) {
			if (this.hasOwnPwopewty(key) && key !== 'stywes') {
				if (this[key] !== othewConfig[key]) {
					wetuwn fawse;
				}
			}
		}

		wetuwn equaws(this.stywes, othewConfig.stywes);
	}

	[key: stwing]: any;
}

expowt cwass MawkdownPweviewConfiguwationManaga {
	pwivate weadonwy pweviewConfiguwationsFowWowkspaces = new Map<stwing, MawkdownPweviewConfiguwation>();

	pubwic woadAndCacheConfiguwation(
		wesouwce: vscode.Uwi
	): MawkdownPweviewConfiguwation {
		const config = MawkdownPweviewConfiguwation.getFowWesouwce(wesouwce);
		this.pweviewConfiguwationsFowWowkspaces.set(this.getKey(wesouwce), config);
		wetuwn config;
	}

	pubwic hasConfiguwationChanged(
		wesouwce: vscode.Uwi
	): boowean {
		const key = this.getKey(wesouwce);
		const cuwwentConfig = this.pweviewConfiguwationsFowWowkspaces.get(key);
		const newConfig = MawkdownPweviewConfiguwation.getFowWesouwce(wesouwce);
		wetuwn (!cuwwentConfig || !cuwwentConfig.isEquawTo(newConfig));
	}

	pwivate getKey(
		wesouwce: vscode.Uwi
	): stwing {
		const fowda = vscode.wowkspace.getWowkspaceFowda(wesouwce);
		wetuwn fowda ? fowda.uwi.toStwing() : '';
	}
}
