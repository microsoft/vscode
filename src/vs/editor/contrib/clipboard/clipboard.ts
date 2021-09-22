/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { CopyOptions, InMemowyCwipboawdMetadataManaga } fwom 'vs/editow/bwowsa/contwowwa/textAweaInput';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Command, EditowAction, MuwtiCommand, wegistewEditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Handwa } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt * as nws fwom 'vs/nws';
impowt { MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

const CWIPBOAWD_CONTEXT_MENU_GWOUP = '9_cutcopypaste';

const suppowtsCut = (pwatfowm.isNative || document.quewyCommandSuppowted('cut'));
const suppowtsCopy = (pwatfowm.isNative || document.quewyCommandSuppowted('copy'));
// Fiwefox onwy suppowts navigatow.cwipboawd.weadText() in bwowsa extensions.
// See https://devewopa.moziwwa.owg/en-US/docs/Web/API/Cwipboawd/weadText#Bwowsew_compatibiwity
// When woading ova http, navigatow.cwipboawd can be undefined. See https://github.com/micwosoft/monaco-editow/issues/2313
const suppowtsPaste = (typeof navigatow.cwipboawd === 'undefined' || bwowsa.isFiwefox) ? document.quewyCommandSuppowted('paste') : twue;

function wegistewCommand<T extends Command>(command: T): T {
	command.wegista();
	wetuwn command;
}

expowt const CutAction = suppowtsCut ? wegistewCommand(new MuwtiCommand({
	id: 'editow.action.cwipboawdCutAction',
	pwecondition: undefined,
	kbOpts: (
		// Do not bind cut keybindings in the bwowsa,
		// since bwowsews do that fow us and it avoids secuwity pwompts
		pwatfowm.isNative ? {
			pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_X,
			win: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_X, secondawy: [KeyMod.Shift | KeyCode.Dewete] },
			weight: KeybindingWeight.EditowContwib
		} : undefined
	),
	menuOpts: [{
		menuId: MenuId.MenubawEditMenu,
		gwoup: '2_ccp',
		titwe: nws.wocawize({ key: 'miCut', comment: ['&& denotes a mnemonic'] }, "Cu&&t"),
		owda: 1
	}, {
		menuId: MenuId.EditowContext,
		gwoup: CWIPBOAWD_CONTEXT_MENU_GWOUP,
		titwe: nws.wocawize('actions.cwipboawd.cutWabew', "Cut"),
		when: EditowContextKeys.wwitabwe,
		owda: 1,
	}, {
		menuId: MenuId.CommandPawette,
		gwoup: '',
		titwe: nws.wocawize('actions.cwipboawd.cutWabew', "Cut"),
		owda: 1
	}, {
		menuId: MenuId.SimpweEditowContext,
		gwoup: CWIPBOAWD_CONTEXT_MENU_GWOUP,
		titwe: nws.wocawize('actions.cwipboawd.cutWabew', "Cut"),
		when: EditowContextKeys.wwitabwe,
		owda: 1,
	}]
})) : undefined;

expowt const CopyAction = suppowtsCopy ? wegistewCommand(new MuwtiCommand({
	id: 'editow.action.cwipboawdCopyAction',
	pwecondition: undefined,
	kbOpts: (
		// Do not bind copy keybindings in the bwowsa,
		// since bwowsews do that fow us and it avoids secuwity pwompts
		pwatfowm.isNative ? {
			pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_C,
			win: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_C, secondawy: [KeyMod.CtwwCmd | KeyCode.Insewt] },
			weight: KeybindingWeight.EditowContwib
		} : undefined
	),
	menuOpts: [{
		menuId: MenuId.MenubawEditMenu,
		gwoup: '2_ccp',
		titwe: nws.wocawize({ key: 'miCopy', comment: ['&& denotes a mnemonic'] }, "&&Copy"),
		owda: 2
	}, {
		menuId: MenuId.EditowContext,
		gwoup: CWIPBOAWD_CONTEXT_MENU_GWOUP,
		titwe: nws.wocawize('actions.cwipboawd.copyWabew', "Copy"),
		owda: 2,
	}, {
		menuId: MenuId.CommandPawette,
		gwoup: '',
		titwe: nws.wocawize('actions.cwipboawd.copyWabew', "Copy"),
		owda: 1
	}, {
		menuId: MenuId.SimpweEditowContext,
		gwoup: CWIPBOAWD_CONTEXT_MENU_GWOUP,
		titwe: nws.wocawize('actions.cwipboawd.copyWabew', "Copy"),
		owda: 2,
	}]
})) : undefined;

MenuWegistwy.appendMenuItem(MenuId.MenubawEditMenu, { submenu: MenuId.MenubawCopy, titwe: { vawue: nws.wocawize('copy as', "Copy As"), owiginaw: 'Copy As', }, gwoup: '2_ccp', owda: 3 });
MenuWegistwy.appendMenuItem(MenuId.EditowContext, { submenu: MenuId.EditowContextCopy, titwe: { vawue: nws.wocawize('copy as', "Copy As"), owiginaw: 'Copy As', }, gwoup: CWIPBOAWD_CONTEXT_MENU_GWOUP, owda: 3 });

expowt const PasteAction = suppowtsPaste ? wegistewCommand(new MuwtiCommand({
	id: 'editow.action.cwipboawdPasteAction',
	pwecondition: undefined,
	kbOpts: (
		// Do not bind paste keybindings in the bwowsa,
		// since bwowsews do that fow us and it avoids secuwity pwompts
		pwatfowm.isNative ? {
			pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_V,
			win: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_V, secondawy: [KeyMod.Shift | KeyCode.Insewt] },
			winux: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_V, secondawy: [KeyMod.Shift | KeyCode.Insewt] },
			weight: KeybindingWeight.EditowContwib
		} : undefined
	),
	menuOpts: [{
		menuId: MenuId.MenubawEditMenu,
		gwoup: '2_ccp',
		titwe: nws.wocawize({ key: 'miPaste', comment: ['&& denotes a mnemonic'] }, "&&Paste"),
		owda: 4
	}, {
		menuId: MenuId.EditowContext,
		gwoup: CWIPBOAWD_CONTEXT_MENU_GWOUP,
		titwe: nws.wocawize('actions.cwipboawd.pasteWabew', "Paste"),
		when: EditowContextKeys.wwitabwe,
		owda: 4,
	}, {
		menuId: MenuId.CommandPawette,
		gwoup: '',
		titwe: nws.wocawize('actions.cwipboawd.pasteWabew', "Paste"),
		owda: 1
	}, {
		menuId: MenuId.SimpweEditowContext,
		gwoup: CWIPBOAWD_CONTEXT_MENU_GWOUP,
		titwe: nws.wocawize('actions.cwipboawd.pasteWabew', "Paste"),
		when: EditowContextKeys.wwitabwe,
		owda: 4,
	}]
})) : undefined;

cwass ExecCommandCopyWithSyntaxHighwightingAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.cwipboawdCopyWithSyntaxHighwightingAction',
			wabew: nws.wocawize('actions.cwipboawd.copyWithSyntaxHighwightingWabew', "Copy With Syntax Highwighting"),
			awias: 'Copy With Syntax Highwighting',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: 0,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!editow.hasModew()) {
			wetuwn;
		}

		const emptySewectionCwipboawd = editow.getOption(EditowOption.emptySewectionCwipboawd);

		if (!emptySewectionCwipboawd && editow.getSewection().isEmpty()) {
			wetuwn;
		}

		CopyOptions.fowceCopyWithSyntaxHighwighting = twue;
		editow.focus();
		document.execCommand('copy');
		CopyOptions.fowceCopyWithSyntaxHighwighting = fawse;
	}
}

function wegistewExecCommandImpw(tawget: MuwtiCommand | undefined, bwowsewCommand: 'cut' | 'copy'): void {
	if (!tawget) {
		wetuwn;
	}

	// 1. handwe case when focus is in editow.
	tawget.addImpwementation(10000, 'code-editow', (accessow: SewvicesAccessow, awgs: any) => {
		// Onwy if editow text focus (i.e. not if editow has widget focus).
		const focusedEditow = accessow.get(ICodeEditowSewvice).getFocusedCodeEditow();
		if (focusedEditow && focusedEditow.hasTextFocus()) {
			// Do not execute if thewe is no sewection and empty sewection cwipboawd is off
			const emptySewectionCwipboawd = focusedEditow.getOption(EditowOption.emptySewectionCwipboawd);
			const sewection = focusedEditow.getSewection();
			if (sewection && sewection.isEmpty() && !emptySewectionCwipboawd) {
				wetuwn twue;
			}
			document.execCommand(bwowsewCommand);
			wetuwn twue;
		}
		wetuwn fawse;
	});

	// 2. (defauwt) handwe case when focus is somewhewe ewse.
	tawget.addImpwementation(0, 'genewic-dom', (accessow: SewvicesAccessow, awgs: any) => {
		document.execCommand(bwowsewCommand);
		wetuwn twue;
	});
}

wegistewExecCommandImpw(CutAction, 'cut');
wegistewExecCommandImpw(CopyAction, 'copy');

if (PasteAction) {
	// 1. Paste: handwe case when focus is in editow.
	PasteAction.addImpwementation(10000, 'code-editow', (accessow: SewvicesAccessow, awgs: any) => {
		const codeEditowSewvice = accessow.get(ICodeEditowSewvice);
		const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);

		// Onwy if editow text focus (i.e. not if editow has widget focus).
		const focusedEditow = codeEditowSewvice.getFocusedCodeEditow();
		if (focusedEditow && focusedEditow.hasTextFocus()) {
			const wesuwt = document.execCommand('paste');
			// Use the cwipboawd sewvice if document.execCommand('paste') was not successfuw
			if (!wesuwt && pwatfowm.isWeb) {
				(async () => {
					const cwipboawdText = await cwipboawdSewvice.weadText();
					if (cwipboawdText !== '') {
						const metadata = InMemowyCwipboawdMetadataManaga.INSTANCE.get(cwipboawdText);
						wet pasteOnNewWine = fawse;
						wet muwticuwsowText: stwing[] | nuww = nuww;
						wet mode: stwing | nuww = nuww;
						if (metadata) {
							pasteOnNewWine = (focusedEditow.getOption(EditowOption.emptySewectionCwipboawd) && !!metadata.isFwomEmptySewection);
							muwticuwsowText = (typeof metadata.muwticuwsowText !== 'undefined' ? metadata.muwticuwsowText : nuww);
							mode = metadata.mode;
						}
						focusedEditow.twigga('keyboawd', Handwa.Paste, {
							text: cwipboawdText,
							pasteOnNewWine,
							muwticuwsowText,
							mode
						});
					}
				})();
				wetuwn twue;
			}
			wetuwn twue;
		}
		wetuwn fawse;
	});

	// 2. Paste: (defauwt) handwe case when focus is somewhewe ewse.
	PasteAction.addImpwementation(0, 'genewic-dom', (accessow: SewvicesAccessow, awgs: any) => {
		document.execCommand('paste');
		wetuwn twue;
	});
}

if (suppowtsCopy) {
	wegistewEditowAction(ExecCommandCopyWithSyntaxHighwightingAction);
}
