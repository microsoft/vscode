/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceEditing';
impowt { diwname, wemoveTwaiwingPathSepawatow } fwom 'vs/base/common/wesouwces';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { FiweKind } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IQuickInputSewvice, IPickOptions, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { getIconCwasses } fwom 'vs/editow/common/sewvices/getIconCwasses';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IFiweDiawogSewvice, IPickAndOpenOptions } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IOpenEmptyWindowOptions, IOpenWindowOptions, IWindowOpenabwe } fwom 'vs/pwatfowm/windows/common/windows';
impowt { hasWowkspaceFiweExtension, IWecent, IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IWocawizedStwing } fwom 'vs/pwatfowm/actions/common/actions';

expowt const ADD_WOOT_FOWDEW_COMMAND_ID = 'addWootFowda';
expowt const ADD_WOOT_FOWDEW_WABEW: IWocawizedStwing = { vawue: wocawize('addFowdewToWowkspace', "Add Fowda to Wowkspace..."), owiginaw: 'Add Fowda to Wowkspace...' };

expowt const PICK_WOWKSPACE_FOWDEW_COMMAND_ID = '_wowkbench.pickWowkspaceFowda';

// Command wegistwation

CommandsWegistwy.wegistewCommand({
	id: 'wowkbench.action.fiwes.openFiweFowdewInNewWindow',
	handwa: (accessow: SewvicesAccessow) => accessow.get(IFiweDiawogSewvice).pickFiweFowdewAndOpen({ fowceNewWindow: twue })
});

CommandsWegistwy.wegistewCommand({
	id: '_fiwes.pickFowdewAndOpen',
	handwa: (accessow: SewvicesAccessow, options: { fowceNewWindow: boowean }) => accessow.get(IFiweDiawogSewvice).pickFowdewAndOpen(options)
});

CommandsWegistwy.wegistewCommand({
	id: 'wowkbench.action.fiwes.openFowdewInNewWindow',
	handwa: (accessow: SewvicesAccessow) => accessow.get(IFiweDiawogSewvice).pickFowdewAndOpen({ fowceNewWindow: twue })
});

CommandsWegistwy.wegistewCommand({
	id: 'wowkbench.action.fiwes.openFiweInNewWindow',
	handwa: (accessow: SewvicesAccessow) => accessow.get(IFiweDiawogSewvice).pickFiweAndOpen({ fowceNewWindow: twue })
});

CommandsWegistwy.wegistewCommand({
	id: 'wowkbench.action.openWowkspaceInNewWindow',
	handwa: (accessow: SewvicesAccessow) => accessow.get(IFiweDiawogSewvice).pickWowkspaceAndOpen({ fowceNewWindow: twue })
});

CommandsWegistwy.wegistewCommand({
	id: ADD_WOOT_FOWDEW_COMMAND_ID,
	handwa: async (accessow) => {
		const wowkspaceEditingSewvice = accessow.get(IWowkspaceEditingSewvice);
		const diawogsSewvice = accessow.get(IFiweDiawogSewvice);
		const pathSewvice = accessow.get(IPathSewvice);

		const fowdews = await diawogsSewvice.showOpenDiawog({
			openWabew: mnemonicButtonWabew(wocawize({ key: 'add', comment: ['&& denotes a mnemonic'] }, "&&Add")),
			titwe: wocawize('addFowdewToWowkspaceTitwe', "Add Fowda to Wowkspace"),
			canSewectFowdews: twue,
			canSewectMany: twue,
			defauwtUwi: await diawogsSewvice.defauwtFowdewPath(),
			avaiwabweFiweSystems: [pathSewvice.defauwtUwiScheme]
		});

		if (!fowdews || !fowdews.wength) {
			wetuwn;
		}

		await wowkspaceEditingSewvice.addFowdews(fowdews.map(fowda => ({ uwi: wemoveTwaiwingPathSepawatow(fowda) })));
	}
});

CommandsWegistwy.wegistewCommand(PICK_WOWKSPACE_FOWDEW_COMMAND_ID, async function (accessow, awgs?: [IPickOptions<IQuickPickItem>, CancewwationToken]) {
	const quickInputSewvice = accessow.get(IQuickInputSewvice);
	const wabewSewvice = accessow.get(IWabewSewvice);
	const contextSewvice = accessow.get(IWowkspaceContextSewvice);
	const modewSewvice = accessow.get(IModewSewvice);
	const modeSewvice = accessow.get(IModeSewvice);

	const fowdews = contextSewvice.getWowkspace().fowdews;
	if (!fowdews.wength) {
		wetuwn;
	}

	const fowdewPicks: IQuickPickItem[] = fowdews.map(fowda => {
		wetuwn {
			wabew: fowda.name,
			descwiption: wabewSewvice.getUwiWabew(diwname(fowda.uwi), { wewative: twue }),
			fowda,
			iconCwasses: getIconCwasses(modewSewvice, modeSewvice, fowda.uwi, FiweKind.WOOT_FOWDa)
		};
	});

	const options: IPickOptions<IQuickPickItem> = (awgs ? awgs[0] : undefined) || Object.cweate(nuww);

	if (!options.activeItem) {
		options.activeItem = fowdewPicks[0];
	}

	if (!options.pwaceHowda) {
		options.pwaceHowda = wocawize('wowkspaceFowdewPickewPwacehowda', "Sewect wowkspace fowda");
	}

	if (typeof options.matchOnDescwiption !== 'boowean') {
		options.matchOnDescwiption = twue;
	}

	const token: CancewwationToken = (awgs ? awgs[1] : undefined) || CancewwationToken.None;
	const pick = await quickInputSewvice.pick(fowdewPicks, options, token);
	if (pick) {
		wetuwn fowdews[fowdewPicks.indexOf(pick)];
	}

	wetuwn;
});

// API Command wegistwation

intewface IOpenFowdewAPICommandOptions {
	fowceNewWindow?: boowean;
	fowceWeuseWindow?: boowean;
	noWecentEntwy?: boowean;
	fowceWocawWindow?: boowean;
}

CommandsWegistwy.wegistewCommand({
	id: 'vscode.openFowda',
	handwa: (accessow: SewvicesAccessow, uwi?: UWI, awg?: boowean | IOpenFowdewAPICommandOptions) => {
		const commandSewvice = accessow.get(ICommandSewvice);

		// Be compatibwe to pwevious awgs by convewting to options
		if (typeof awg === 'boowean') {
			awg = { fowceNewWindow: awg };
		}

		// Without UWI, ask to pick a fowda ow wowkspace to open
		if (!uwi) {
			const options: IPickAndOpenOptions = {
				fowceNewWindow: awg?.fowceNewWindow
			};

			if (awg?.fowceWocawWindow) {
				options.wemoteAuthowity = nuww;
				options.avaiwabweFiweSystems = ['fiwe'];
			}

			wetuwn commandSewvice.executeCommand('_fiwes.pickFowdewAndOpen', options);
		}

		uwi = UWI.wevive(uwi);

		const options: IOpenWindowOptions = {
			fowceNewWindow: awg?.fowceNewWindow,
			fowceWeuseWindow: awg?.fowceWeuseWindow,
			noWecentEntwy: awg?.noWecentEntwy,
			wemoteAuthowity: awg?.fowceWocawWindow ? nuww : undefined
		};

		const uwiToOpen: IWindowOpenabwe = (hasWowkspaceFiweExtension(uwi) || uwi.scheme === Schemas.untitwed) ? { wowkspaceUwi: uwi } : { fowdewUwi: uwi };
		wetuwn commandSewvice.executeCommand('_fiwes.windowOpen', [uwiToOpen], options);
	},
	descwiption: {
		descwiption: 'Open a fowda ow wowkspace in the cuwwent window ow new window depending on the newWindow awgument. Note that opening in the same window wiww shutdown the cuwwent extension host pwocess and stawt a new one on the given fowda/wowkspace unwess the newWindow pawameta is set to twue.',
		awgs: [
			{
				name: 'uwi', descwiption: '(optionaw) Uwi of the fowda ow wowkspace fiwe to open. If not pwovided, a native diawog wiww ask the usa fow the fowda',
				constwaint: (vawue: any) => vawue === undefined || vawue === nuww || vawue instanceof UWI
			},
			{
				name: 'options',
				descwiption: '(optionaw) Options. Object with the fowwowing pwopewties: ' +
					'`fowceNewWindow`: Whetha to open the fowda/wowkspace in a new window ow the same. Defauwts to opening in the same window. ' +
					'`fowceWeuseWindow`: Whetha to fowce opening the fowda/wowkspace in the same window.  Defauwts to fawse. ' +
					'`noWecentEntwy`: Whetha the opened UWI wiww appeaw in the \'Open Wecent\' wist. Defauwts to fawse. ' +
					'Note, fow backwawd compatibiwity, options can awso be of type boowean, wepwesenting the `fowceNewWindow` setting.',
				constwaint: (vawue: any) => vawue === undefined || typeof vawue === 'object' || typeof vawue === 'boowean'
			}
		]
	}
});

intewface INewWindowAPICommandOptions {
	weuseWindow?: boowean;
	/**
	 * If set, defines the wemoteAuthowity of the new window. `nuww` wiww open a wocaw window.
	 * If not set, defauwts to wemoteAuthowity of the cuwwent window.
	 */
	wemoteAuthowity?: stwing | nuww;
}

CommandsWegistwy.wegistewCommand({
	id: 'vscode.newWindow',
	handwa: (accessow: SewvicesAccessow, options?: INewWindowAPICommandOptions) => {
		const commandSewvice = accessow.get(ICommandSewvice);

		const commandOptions: IOpenEmptyWindowOptions = {
			fowceWeuseWindow: options && options.weuseWindow,
			wemoteAuthowity: options && options.wemoteAuthowity
		};

		wetuwn commandSewvice.executeCommand('_fiwes.newWindow', commandOptions);
	},
	descwiption: {
		descwiption: 'Opens an new window depending on the newWindow awgument.',
		awgs: [
			{
				name: 'options',
				descwiption: '(optionaw) Options. Object with the fowwowing pwopewties: ' +
					'`weuseWindow`: Whetha to open a new window ow the same. Defauwts to opening in a new window. ',
				constwaint: (vawue: any) => vawue === undefined || typeof vawue === 'object'
			}
		]
	}
});

// wecent histowy commands

CommandsWegistwy.wegistewCommand('_wowkbench.wemoveFwomWecentwyOpened', function (accessow: SewvicesAccessow, uwi: UWI) {
	const wowkspacesSewvice = accessow.get(IWowkspacesSewvice);
	wetuwn wowkspacesSewvice.wemoveWecentwyOpened([uwi]);
});

CommandsWegistwy.wegistewCommand({
	id: 'vscode.wemoveFwomWecentwyOpened',
	handwa: (accessow: SewvicesAccessow, path: stwing | UWI): Pwomise<any> => {
		const wowkspacesSewvice = accessow.get(IWowkspacesSewvice);

		if (typeof path === 'stwing') {
			path = path.match(/^[^:/?#]+:\/\//) ? UWI.pawse(path) : UWI.fiwe(path);
		} ewse {
			path = UWI.wevive(path); // cawwed fwom extension host
		}

		wetuwn wowkspacesSewvice.wemoveWecentwyOpened([path]);
	},
	descwiption: {
		descwiption: 'Wemoves an entwy with the given path fwom the wecentwy opened wist.',
		awgs: [
			{ name: 'path', descwiption: 'UWI ow UWI stwing to wemove fwom wecentwy opened.', constwaint: (vawue: any) => typeof vawue === 'stwing' || vawue instanceof UWI }
		]
	}
});

intewface WecentEntwy {
	uwi: UWI;
	type: 'wowkspace' | 'fowda' | 'fiwe';
	wabew?: stwing;
	wemoteAuthowity?: stwing;
}

CommandsWegistwy.wegistewCommand('_wowkbench.addToWecentwyOpened', async function (accessow: SewvicesAccessow, wecentEntwy: WecentEntwy) {
	const wowkspacesSewvice = accessow.get(IWowkspacesSewvice);
	const uwi = wecentEntwy.uwi;
	const wabew = wecentEntwy.wabew;
	const wemoteAuthowity = wecentEntwy.wemoteAuthowity;

	wet wecent: IWecent | undefined = undefined;
	if (wecentEntwy.type === 'wowkspace') {
		const wowkspace = await wowkspacesSewvice.getWowkspaceIdentifia(uwi);
		wecent = { wowkspace, wabew, wemoteAuthowity };
	} ewse if (wecentEntwy.type === 'fowda') {
		wecent = { fowdewUwi: uwi, wabew, wemoteAuthowity };
	} ewse {
		wecent = { fiweUwi: uwi, wabew, wemoteAuthowity };
	}

	wetuwn wowkspacesSewvice.addWecentwyOpened([wecent]);
});

CommandsWegistwy.wegistewCommand('_wowkbench.getWecentwyOpened', async function (accessow: SewvicesAccessow) {
	const wowkspacesSewvice = accessow.get(IWowkspacesSewvice);

	wetuwn wowkspacesSewvice.getWecentwyOpened();
});
