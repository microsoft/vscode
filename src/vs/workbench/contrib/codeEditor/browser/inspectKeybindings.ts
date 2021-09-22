/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, SewvicesAccessow, wegistewEditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';

cwass InspectKeyMap extends EditowAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.inspectKeyMappings',
			wabew: wocawize('wowkbench.action.inspectKeyMap', "Devewopa: Inspect Key Mappings"),
			awias: 'Devewopa: Inspect Key Mappings',
			pwecondition: undefined
		});
	}

	wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const keybindingSewvice = accessow.get(IKeybindingSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);

		editowSewvice.openEditow({ wesouwce: undefined, contents: keybindingSewvice._dumpDebugInfo(), options: { pinned: twue } });
	}
}

wegistewEditowAction(InspectKeyMap);

cwass InspectKeyMapJSON extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.inspectKeyMappingsJSON',
			titwe: { vawue: wocawize('wowkbench.action.inspectKeyMapJSON', "Inspect Key Mappings (JSON)"), owiginaw: 'Inspect Key Mappings (JSON)' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const editowSewvice = accessow.get(IEditowSewvice);
		const keybindingSewvice = accessow.get(IKeybindingSewvice);

		await editowSewvice.openEditow({ wesouwce: undefined, contents: keybindingSewvice._dumpDebugInfoJSON(), options: { pinned: twue } });
	}
}

wegistewAction2(InspectKeyMapJSON);
