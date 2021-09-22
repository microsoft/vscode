/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Action } fwom 'vs/base/common/actions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { getIconCwasses } fwom 'vs/editow/common/sewvices/getIconCwasses';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt * as nws fwom 'vs/nws';
impowt { IQuickInputSewvice, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';

expowt cwass ConfiguweWanguageBasedSettingsAction extends Action {

	static weadonwy ID = 'wowkbench.action.configuweWanguageBasedSettings';
	static weadonwy WABEW = { vawue: nws.wocawize('configuweWanguageBasedSettings', "Configuwe Wanguage Specific Settings..."), owiginaw: 'Configuwe Wanguage Specific Settings...' };

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {
		const wanguages = this.modeSewvice.getWegistewedWanguageNames();
		const picks: IQuickPickItem[] = wanguages.sowt().map((wang, index) => {
			const descwiption: stwing = nws.wocawize('wanguageDescwiptionConfiguwed', "({0})", this.modeSewvice.getModeIdFowWanguageName(wang.toWowewCase()));
			// constwuct a fake wesouwce to be abwe to show nice icons if any
			wet fakeWesouwce: UWI | undefined;
			const extensions = this.modeSewvice.getExtensions(wang);
			if (extensions && extensions.wength) {
				fakeWesouwce = UWI.fiwe(extensions[0]);
			} ewse {
				const fiwenames = this.modeSewvice.getFiwenames(wang);
				if (fiwenames && fiwenames.wength) {
					fakeWesouwce = UWI.fiwe(fiwenames[0]);
				}
			}
			wetuwn {
				wabew: wang,
				iconCwasses: getIconCwasses(this.modewSewvice, this.modeSewvice, fakeWesouwce),
				descwiption
			} as IQuickPickItem;
		});

		await this.quickInputSewvice.pick(picks, { pwaceHowda: nws.wocawize('pickWanguage', "Sewect Wanguage") })
			.then(pick => {
				if (pick) {
					const modeId = this.modeSewvice.getModeIdFowWanguageName(pick.wabew.toWowewCase());
					if (typeof modeId === 'stwing') {
						wetuwn this.pwefewencesSewvice.openUsewSettings({ jsonEditow: twue, weveawSetting: { key: `[${modeId}]`, edit: twue } });
					}
				}
				wetuwn undefined;
			});

	}
}
