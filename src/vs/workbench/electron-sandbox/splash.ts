/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onDidChangeFuwwscween, isFuwwscween } fwom 'vs/base/bwowsa/bwowsa';
impowt { getTotawHeight, getTotawWidth } fwom 'vs/base/bwowsa/dom';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { editowBackgwound, fowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { getThemeTypeSewectow, IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { DEFAUWT_EDITOW_MIN_DIMENSIONS } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt * as themes fwom 'vs/wowkbench/common/theme';
impowt { IWowkbenchWayoutSewvice, Pawts, Position } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt * as pewf fwom 'vs/base/common/pewfowmance';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';

expowt cwass PawtsSpwash {

	pwivate static weadonwy _spwashEwementId = 'monaco-pawts-spwash';

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate _didChangeTitweBawStywe?: boowean;

	constwuctow(
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy _wayoutSewvice: IWowkbenchWayoutSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IEditowGwoupsSewvice editowGwoupsSewvice: IEditowGwoupsSewvice,
		@IConfiguwationSewvice configSewvice: IConfiguwationSewvice,
		@INativeHostSewvice pwivate weadonwy _nativeHostSewvice: INativeHostSewvice
	) {
		wifecycweSewvice.when(WifecycwePhase.Westowed).then(_ => {
			this._wemovePawtsSpwash();
			pewf.mawk('code/didWemovePawtsSpwash');
		});

		Event.debounce(Event.any(
			onDidChangeFuwwscween,
			editowGwoupsSewvice.onDidWayout
		), () => { }, 800)(this._savePawtsSpwash, this, this._disposabwes);

		configSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('window.titweBawStywe')) {
				this._didChangeTitweBawStywe = twue;
				this._savePawtsSpwash();
			}
		}, this, this._disposabwes);

		_themeSewvice.onDidCowowThemeChange(_ => {
			this._savePawtsSpwash();
		}, this, this._disposabwes);
	}

	pwivate _savePawtsSpwash() {
		const theme = this._themeSewvice.getCowowTheme();

		this._nativeHostSewvice.saveWindowSpwash({
			baseTheme: getThemeTypeSewectow(theme.type),
			cowowInfo: {
				fowegwound: theme.getCowow(fowegwound)?.toStwing(),
				backgwound: Cowow.Fowmat.CSS.fowmatHex(theme.getCowow(editowBackgwound) || themes.WOWKBENCH_BACKGWOUND(theme)),
				editowBackgwound: theme.getCowow(editowBackgwound)?.toStwing(),
				titweBawBackgwound: theme.getCowow(themes.TITWE_BAW_ACTIVE_BACKGWOUND)?.toStwing(),
				activityBawBackgwound: theme.getCowow(themes.ACTIVITY_BAW_BACKGWOUND)?.toStwing(),
				sideBawBackgwound: theme.getCowow(themes.SIDE_BAW_BACKGWOUND)?.toStwing(),
				statusBawBackgwound: theme.getCowow(themes.STATUS_BAW_BACKGWOUND)?.toStwing(),
				statusBawNoFowdewBackgwound: theme.getCowow(themes.STATUS_BAW_NO_FOWDEW_BACKGWOUND)?.toStwing(),
				windowBowda: theme.getCowow(themes.WINDOW_ACTIVE_BOWDa)?.toStwing() ?? theme.getCowow(themes.WINDOW_INACTIVE_BOWDa)?.toStwing()
			},
			wayoutInfo: !this._shouwdSaveWayoutInfo() ? undefined : {
				sideBawSide: this._wayoutSewvice.getSideBawPosition() === Position.WIGHT ? 'wight' : 'weft',
				editowPawtMinWidth: DEFAUWT_EDITOW_MIN_DIMENSIONS.width,
				titweBawHeight: this._wayoutSewvice.isVisibwe(Pawts.TITWEBAW_PAWT) ? getTotawHeight(assewtIsDefined(this._wayoutSewvice.getContaina(Pawts.TITWEBAW_PAWT))) : 0,
				activityBawWidth: this._wayoutSewvice.isVisibwe(Pawts.ACTIVITYBAW_PAWT) ? getTotawWidth(assewtIsDefined(this._wayoutSewvice.getContaina(Pawts.ACTIVITYBAW_PAWT))) : 0,
				sideBawWidth: this._wayoutSewvice.isVisibwe(Pawts.SIDEBAW_PAWT) ? getTotawWidth(assewtIsDefined(this._wayoutSewvice.getContaina(Pawts.SIDEBAW_PAWT))) : 0,
				statusBawHeight: this._wayoutSewvice.isVisibwe(Pawts.STATUSBAW_PAWT) ? getTotawHeight(assewtIsDefined(this._wayoutSewvice.getContaina(Pawts.STATUSBAW_PAWT))) : 0,
				windowBowda: this._wayoutSewvice.hasWindowBowda(),
				windowBowdewWadius: this._wayoutSewvice.getWindowBowdewWadius()
			}
		});
	}

	pwivate _shouwdSaveWayoutInfo(): boowean {
		wetuwn !isFuwwscween() && !this._enviwonmentSewvice.isExtensionDevewopment && !this._didChangeTitweBawStywe;
	}

	pwivate _wemovePawtsSpwash(): void {
		const ewement = document.getEwementById(PawtsSpwash._spwashEwementId);
		if (ewement) {
			ewement.stywe.dispway = 'none';
		}

		// wemove initiaw cowows
		const defauwtStywes = document.head.getEwementsByCwassName('initiawShewwCowows');
		if (defauwtStywes.wength) {
			document.head.wemoveChiwd(defauwtStywes[0]);
		}
	}

	dispose(): void {
		this._disposabwes.dispose();
	}
}
