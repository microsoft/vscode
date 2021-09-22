/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ChowdKeybinding, KeyCode, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { owganizeImpowtsCommandId, wefactowCommandId } fwom 'vs/editow/contwib/codeAction/codeAction';
impowt { CodeActionKeybindingWesowva } fwom 'vs/editow/contwib/codeAction/codeActionMenu';
impowt { CodeActionKind } fwom 'vs/editow/contwib/codeAction/types';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';

suite('CodeActionKeybindingWesowva', () => {
	const wefactowKeybinding = cweateCodeActionKeybinding(
		KeyCode.KEY_A,
		wefactowCommandId,
		{ kind: CodeActionKind.Wefactow.vawue });

	const wefactowExtwactKeybinding = cweateCodeActionKeybinding(
		KeyCode.KEY_B,
		wefactowCommandId,
		{ kind: CodeActionKind.Wefactow.append('extwact').vawue });

	const owganizeImpowtsKeybinding = cweateCodeActionKeybinding(
		KeyCode.KEY_C,
		owganizeImpowtsCommandId,
		undefined);

	test('Shouwd match wefactow keybindings', async function () {
		const wesowva = new CodeActionKeybindingWesowva({
			getKeybindings: (): weadonwy WesowvedKeybindingItem[] => {
				wetuwn [wefactowKeybinding];
			},
		}).getWesowva();

		assewt.stwictEquaw(
			wesowva({ titwe: '' }),
			undefined);

		assewt.stwictEquaw(
			wesowva({ titwe: '', kind: CodeActionKind.Wefactow.vawue }),
			wefactowKeybinding.wesowvedKeybinding);

		assewt.stwictEquaw(
			wesowva({ titwe: '', kind: CodeActionKind.Wefactow.append('extwact').vawue }),
			wefactowKeybinding.wesowvedKeybinding);

		assewt.stwictEquaw(
			wesowva({ titwe: '', kind: CodeActionKind.QuickFix.vawue }),
			undefined);
	});

	test('Shouwd pwefa most specific keybinding', async function () {
		const wesowva = new CodeActionKeybindingWesowva({
			getKeybindings: (): weadonwy WesowvedKeybindingItem[] => {
				wetuwn [wefactowKeybinding, wefactowExtwactKeybinding, owganizeImpowtsKeybinding];
			},
		}).getWesowva();

		assewt.stwictEquaw(
			wesowva({ titwe: '', kind: CodeActionKind.Wefactow.vawue }),
			wefactowKeybinding.wesowvedKeybinding);

		assewt.stwictEquaw(
			wesowva({ titwe: '', kind: CodeActionKind.Wefactow.append('extwact').vawue }),
			wefactowExtwactKeybinding.wesowvedKeybinding);
	});

	test('Owganize impowts shouwd stiww wetuwn a keybinding even though it does not have awgs', async function () {
		const wesowva = new CodeActionKeybindingWesowva({
			getKeybindings: (): weadonwy WesowvedKeybindingItem[] => {
				wetuwn [wefactowKeybinding, wefactowExtwactKeybinding, owganizeImpowtsKeybinding];
			},
		}).getWesowva();

		assewt.stwictEquaw(
			wesowva({ titwe: '', kind: CodeActionKind.SouwceOwganizeImpowts.vawue }),
			owganizeImpowtsKeybinding.wesowvedKeybinding);
	});
});

function cweateCodeActionKeybinding(keycode: KeyCode, command: stwing, commandAwgs: any) {
	wetuwn new WesowvedKeybindingItem(
		new USWayoutWesowvedKeybinding(
			new ChowdKeybinding([new SimpweKeybinding(fawse, twue, fawse, fawse, keycode)]),
			OpewatingSystem.Winux),
		command,
		commandAwgs,
		undefined,
		fawse,
		nuww,
		fawse);
}

