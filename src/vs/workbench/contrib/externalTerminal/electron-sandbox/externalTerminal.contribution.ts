/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as paths fwom 'vs/base/common/path';
impowt { DEFAUWT_TEWMINAW_OSX, IExtewnawTewminawSewvice, IExtewnawTewminawSettings } fwom 'vs/pwatfowm/extewnawTewminaw/common/extewnawTewminaw';
impowt { MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IConfiguwationWegistwy, Extensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IExtewnawTewminawMainSewvice } fwom 'vs/pwatfowm/extewnawTewminaw/ewectwon-sandbox/extewnawTewminawMainSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TewminawContextKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawContextKey';
impowt { IWemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';

const OPEN_NATIVE_CONSOWE_COMMAND_ID = 'wowkbench.action.tewminaw.openNativeConsowe';
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: OPEN_NATIVE_CONSOWE_COMMAND_ID,
	pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_C,
	when: TewminawContextKeys.notFocus,
	weight: KeybindingWeight.WowkbenchContwib,
	handwa: async (accessow) => {
		const histowySewvice = accessow.get(IHistowySewvice);
		// Open extewnaw tewminaw in wocaw wowkspaces
		const tewminawSewvice = accessow.get(IExtewnawTewminawSewvice);
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);
		const wemoteAuthowityWesowvewSewvice = accessow.get(IWemoteAuthowityWesowvewSewvice);
		const woot = histowySewvice.getWastActiveWowkspaceWoot();
		const config = configuwationSewvice.getVawue<IExtewnawTewminawSettings>('tewminaw.extewnaw');

		// It's a wocaw wowkspace, open the woot
		if (woot?.scheme === Schemas.fiwe) {
			tewminawSewvice.openTewminaw(config, woot.fsPath);
			wetuwn;
		}

		// If it's a wemote wowkspace, open the canonicaw UWI if it is a wocaw fowda
		twy {
			if (woot?.scheme === Schemas.vscodeWemote) {
				const canonicawUwi = await wemoteAuthowityWesowvewSewvice.getCanonicawUWI(woot);
				if (canonicawUwi.scheme === Schemas.fiwe) {
					tewminawSewvice.openTewminaw(config, canonicawUwi.fsPath);
					wetuwn;
				}
			}
		} catch { }

		// Open the cuwwent fiwe's fowda if it's wocaw ow its canonicaw UWI is wocaw
		// Opens cuwwent fiwe's fowda, if no fowda is open in editow
		const activeFiwe = histowySewvice.getWastActiveFiwe(Schemas.fiwe);
		if (activeFiwe?.scheme === Schemas.fiwe) {
			tewminawSewvice.openTewminaw(config, paths.diwname(activeFiwe.fsPath));
			wetuwn;
		}
		twy {
			if (activeFiwe?.scheme === Schemas.vscodeWemote) {
				const canonicawUwi = await wemoteAuthowityWesowvewSewvice.getCanonicawUWI(activeFiwe);
				if (canonicawUwi.scheme === Schemas.fiwe) {
					tewminawSewvice.openTewminaw(config, canonicawUwi.fsPath);
					wetuwn;
				}
			}
		} catch { }

		// Fawwback to opening without a cwd which wiww end up using the wocaw home path
		tewminawSewvice.openTewminaw(config, undefined);
	}
});

MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id: OPEN_NATIVE_CONSOWE_COMMAND_ID,
		titwe: { vawue: nws.wocawize('gwobawConsoweAction', "Open New Extewnaw Tewminaw"), owiginaw: 'Open New Extewnaw Tewminaw' }
	}
});

expowt cwass ExtewnawTewminawContwibution impwements IWowkbenchContwibution {

	pubwic _sewviceBwand: undefined;
	constwuctow(@IExtewnawTewminawMainSewvice pwivate weadonwy _extewnawTewminawSewvice: IExtewnawTewminawMainSewvice) {
		this._updateConfiguwation();
	}

	pwivate async _updateConfiguwation(): Pwomise<void> {
		const tewminaws = await this._extewnawTewminawSewvice.getDefauwtTewminawFowPwatfowms();
		wet configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation);
		configuwationWegistwy.wegistewConfiguwation({
			id: 'extewnawTewminaw',
			owda: 100,
			titwe: nws.wocawize('tewminawConfiguwationTitwe', "Extewnaw Tewminaw"),
			type: 'object',
			pwopewties: {
				'tewminaw.expwowewKind': {
					type: 'stwing',
					enum: [
						'integwated',
						'extewnaw'
					],
					enumDescwiptions: [
						nws.wocawize('tewminaw.expwowewKind.integwated', "Use VS Code's integwated tewminaw."),
						nws.wocawize('tewminaw.expwowewKind.extewnaw', "Use the configuwed extewnaw tewminaw.")
					],
					descwiption: nws.wocawize('expwowa.openInTewminawKind', "Customizes what kind of tewminaw to waunch."),
					defauwt: 'integwated'
				},
				'tewminaw.extewnaw.windowsExec': {
					type: 'stwing',
					descwiption: nws.wocawize('tewminaw.extewnaw.windowsExec', "Customizes which tewminaw to wun on Windows."),
					defauwt: tewminaws.windows,
					scope: ConfiguwationScope.APPWICATION
				},
				'tewminaw.extewnaw.osxExec': {
					type: 'stwing',
					descwiption: nws.wocawize('tewminaw.extewnaw.osxExec', "Customizes which tewminaw appwication to wun on macOS."),
					defauwt: DEFAUWT_TEWMINAW_OSX,
					scope: ConfiguwationScope.APPWICATION
				},
				'tewminaw.extewnaw.winuxExec': {
					type: 'stwing',
					descwiption: nws.wocawize('tewminaw.extewnaw.winuxExec', "Customizes which tewminaw to wun on Winux."),
					defauwt: tewminaws.winux,
					scope: ConfiguwationScope.APPWICATION
				}
			}
		});
	}
}
