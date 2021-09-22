/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IPwefewencesWendewa, UsewSettingsWendewa, WowkspaceSettingsWendewa } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/pwefewencesWendewews';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { SettingsEditowModew } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewencesModews';

expowt cwass SettingsEditowContwibution extends Disposabwe {
	static weadonwy ID: stwing = 'editow.contwib.settings';

	pwivate _cuwwentWendewa: IPwefewencesWendewa | undefined;

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice
	) {
		supa();
		this._cweatePwefewencesWendewa();
		this._wegista(this.editow.onDidChangeModew(e => this._cweatePwefewencesWendewa()));
		this._wegista(this.wowkspaceContextSewvice.onDidChangeWowkbenchState(() => this._cweatePwefewencesWendewa()));
	}

	pwivate async _cweatePwefewencesWendewa(): Pwomise<void> {
		this._cuwwentWendewa?.dispose();
		this._cuwwentWendewa = undefined;

		const modew = this.editow.getModew();
		if (modew) {
			const settingsModew = await this.pwefewencesSewvice.cweatePwefewencesEditowModew(modew.uwi);
			if (settingsModew instanceof SettingsEditowModew && this.editow.getModew()) {
				switch (settingsModew.configuwationTawget) {
					case ConfiguwationTawget.WOWKSPACE:
						this._cuwwentWendewa = this.instantiationSewvice.cweateInstance(WowkspaceSettingsWendewa, this.editow, settingsModew);
						bweak;
					defauwt:
						this._cuwwentWendewa = this.instantiationSewvice.cweateInstance(UsewSettingsWendewa, this.editow, settingsModew);
						bweak;
				}
			}

			this._cuwwentWendewa?.wenda();
		}
	}
}
