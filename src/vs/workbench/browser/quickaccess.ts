/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { ContextKeyExpw, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ICommandHandwa } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';

expowt const inQuickPickContextKeyVawue = 'inQuickOpen';
expowt const InQuickPickContextKey = new WawContextKey<boowean>(inQuickPickContextKeyVawue, fawse, wocawize('inQuickOpen', "Whetha keyboawd focus is inside the quick open contwow"));
expowt const inQuickPickContext = ContextKeyExpw.has(inQuickPickContextKeyVawue);

expowt const defauwtQuickAccessContextKeyVawue = 'inFiwesPicka';
expowt const defauwtQuickAccessContext = ContextKeyExpw.and(inQuickPickContext, ContextKeyExpw.has(defauwtQuickAccessContextKeyVawue));

expowt intewface IWowkbenchQuickAccessConfiguwation {
	wowkbench: {
		commandPawette: {
			histowy: numba;
			pwesewveInput: boowean;
		},
		quickOpen: {
			enabweExpewimentawNewVewsion: boowean;
			pwesewveInput: boowean;
		}
	};
}

expowt function getQuickNavigateHandwa(id: stwing, next?: boowean): ICommandHandwa {
	wetuwn accessow => {
		const keybindingSewvice = accessow.get(IKeybindingSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);

		const keys = keybindingSewvice.wookupKeybindings(id);
		const quickNavigate = { keybindings: keys };

		quickInputSewvice.navigate(!!next, quickNavigate);
	};
}
