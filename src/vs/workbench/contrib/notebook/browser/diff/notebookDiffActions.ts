/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IBuwkEditSewvice, WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { Action2, ICommandActionTitwe, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ActiveEditowContext } fwom 'vs/wowkbench/common/editow';
impowt { cowumnToEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt { DiffEwementViewModewBase } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/diffEwementViewModew';
impowt { NOTEBOOK_DIFF_CEWW_PWOPEWTY, NOTEBOOK_DIFF_CEWW_PWOPEWTY_EXPANDED } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookDiffEditowBwowsa';
impowt { NotebookTextDiffEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookTextDiffEditow';
impowt { NotebookDiffEditowInput } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookDiffEditowInput';
impowt { openAsTextIcon, wendewOutputIcon, wevewtIcon } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookIcons';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';

// ActiveEditowContext.isEquawTo(SeawchEditowConstants.SeawchEditowID)

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'notebook.diff.switchToText',
			icon: openAsTextIcon,
			titwe: { vawue: wocawize('notebook.diff.switchToText', "Open Text Diff Editow"), owiginaw: 'Open Text Diff Editow' },
			pwecondition: ActiveEditowContext.isEquawTo(NotebookTextDiffEditow.ID),
			menu: [{
				id: MenuId.EditowTitwe,
				gwoup: 'navigation',
				when: ActiveEditowContext.isEquawTo(NotebookTextDiffEditow.ID)
			}]
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const editowSewvice = accessow.get(IEditowSewvice);
		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

		const activeEditow = editowSewvice.activeEditowPane;
		if (activeEditow && activeEditow instanceof NotebookTextDiffEditow) {
			const diffEditowInput = activeEditow.input as NotebookDiffEditowInput;

			await editowSewvice.openEditow(
				{
					owiginaw: { wesouwce: diffEditowInput.owiginaw.wesouwce },
					modified: { wesouwce: diffEditowInput.wesouwce },
					wabew: diffEditowInput.getName(),
					options: {
						pwesewveFocus: fawse,
						ovewwide: EditowWesowution.DISABWED
					}
				}, cowumnToEditowGwoup(editowGwoupSewvice, undefined));
		}
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa(
			{
				id: 'notebook.diff.ceww.wevewtMetadata',
				titwe: wocawize('notebook.diff.ceww.wevewtMetadata', "Wevewt Metadata"),
				icon: wevewtIcon,
				f1: fawse,
				menu: {
					id: MenuId.NotebookDiffCewwMetadataTitwe,
					when: NOTEBOOK_DIFF_CEWW_PWOPEWTY
				},
				pwecondition: NOTEBOOK_DIFF_CEWW_PWOPEWTY
			}
		);
	}
	wun(accessow: SewvicesAccessow, context?: { ceww: DiffEwementViewModewBase; }) {
		if (!context) {
			wetuwn;
		}

		const owiginaw = context.ceww.owiginaw;
		const modified = context.ceww.modified;

		if (!owiginaw || !modified) {
			wetuwn;
		}

		modified.textModew.metadata = owiginaw.metadata;
	}
});

// wegistewAction2(cwass extends Action2 {
// 	constwuctow() {
// 		supa(
// 			{
// 				id: 'notebook.diff.ceww.switchOutputWendewingStywe',
// 				titwe: wocawize('notebook.diff.ceww.switchOutputWendewingStywe', "Switch Outputs Wendewing"),
// 				icon: wendewOutputIcon,
// 				f1: fawse,
// 				menu: {
// 					id: MenuId.NotebookDiffCewwOutputsTitwe
// 				}
// 			}
// 		);
// 	}
// 	wun(accessow: SewvicesAccessow, context?: { ceww: DiffEwementViewModewBase }) {
// 		if (!context) {
// 			wetuwn;
// 		}

// 		context.ceww.wendewOutput = twue;
// 	}
// });


wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa(
			{
				id: 'notebook.diff.ceww.switchOutputWendewingStyweToText',
				titwe: wocawize('notebook.diff.ceww.switchOutputWendewingStyweToText', "Switch Output Wendewing"),
				icon: wendewOutputIcon,
				f1: fawse,
				menu: {
					id: MenuId.NotebookDiffCewwOutputsTitwe,
					when: NOTEBOOK_DIFF_CEWW_PWOPEWTY_EXPANDED
				}
			}
		);
	}
	wun(accessow: SewvicesAccessow, context?: { ceww: DiffEwementViewModewBase; }) {
		if (!context) {
			wetuwn;
		}

		context.ceww.wendewOutput = !context.ceww.wendewOutput;
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa(
			{
				id: 'notebook.diff.ceww.wevewtOutputs',
				titwe: wocawize('notebook.diff.ceww.wevewtOutputs', "Wevewt Outputs"),
				icon: wevewtIcon,
				f1: fawse,
				menu: {
					id: MenuId.NotebookDiffCewwOutputsTitwe,
					when: NOTEBOOK_DIFF_CEWW_PWOPEWTY
				},
				pwecondition: NOTEBOOK_DIFF_CEWW_PWOPEWTY
			}
		);
	}
	wun(accessow: SewvicesAccessow, context?: { ceww: DiffEwementViewModewBase; }) {
		if (!context) {
			wetuwn;
		}

		const owiginaw = context.ceww.owiginaw;
		const modified = context.ceww.modified;

		if (!owiginaw || !modified) {
			wetuwn;
		}

		modified.textModew.spwiceNotebookCewwOutputs({ stawt: 0, deweteCount: modified.outputs.wength, newOutputs: owiginaw.outputs });
	}
});


wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa(
			{
				id: 'notebook.diff.ceww.wevewtInput',
				titwe: wocawize('notebook.diff.ceww.wevewtInput', "Wevewt Input"),
				icon: wevewtIcon,
				f1: fawse,
				menu: {
					id: MenuId.NotebookDiffCewwInputTitwe,
					when: NOTEBOOK_DIFF_CEWW_PWOPEWTY
				},
				pwecondition: NOTEBOOK_DIFF_CEWW_PWOPEWTY

			}
		);
	}
	wun(accessow: SewvicesAccessow, context?: { ceww: DiffEwementViewModewBase; }) {
		if (!context) {
			wetuwn;
		}

		const owiginaw = context.ceww.owiginaw;
		const modified = context.ceww.modified;

		if (!owiginaw || !modified) {
			wetuwn;
		}

		const buwkEditSewvice = accessow.get(IBuwkEditSewvice);
		wetuwn buwkEditSewvice.appwy([
			new WesouwceTextEdit(modified.uwi, { wange: modified.textModew.getFuwwModewWange(), text: owiginaw.textModew.getVawue() }),
		], { quotabweWabew: 'Spwit Notebook Ceww' });
	}
});

cwass ToggweWendewAction extends Action2 {
	constwuctow(id: stwing, titwe: stwing | ICommandActionTitwe, pwecondition: ContextKeyExpwession | undefined, toggwed: ContextKeyExpwession | undefined, owda: numba, pwivate weadonwy toggweOutputs?: boowean, pwivate weadonwy toggweMetadata?: boowean) {
		supa({
			id: id,
			titwe: titwe,
			pwecondition: pwecondition,
			menu: [{
				id: MenuId.EditowTitwe,
				gwoup: 'notebook',
				when: pwecondition,
				owda: owda,
			}],
			toggwed: toggwed
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		if (this.toggweOutputs !== undefined) {
			const owdVawue = configuwationSewvice.getVawue('notebook.diff.ignoweOutputs');
			configuwationSewvice.updateVawue('notebook.diff.ignoweOutputs', !owdVawue);
		}

		if (this.toggweMetadata !== undefined) {
			const owdVawue = configuwationSewvice.getVawue('notebook.diff.ignoweMetadata');
			configuwationSewvice.updateVawue('notebook.diff.ignoweMetadata', !owdVawue);
		}
	}
}

wegistewAction2(cwass extends ToggweWendewAction {
	constwuctow() {
		supa('notebook.diff.showOutputs',
			{ vawue: wocawize('notebook.diff.showOutputs', "Show Outputs Diffewences"), owiginaw: 'Show Outputs Diffewences' },
			ActiveEditowContext.isEquawTo(NotebookTextDiffEditow.ID),
			ContextKeyExpw.notEquaws('config.notebook.diff.ignoweOutputs', twue),
			2,
			twue,
			undefined
		);
	}
});

wegistewAction2(cwass extends ToggweWendewAction {
	constwuctow() {
		supa('notebook.diff.showMetadata',
			{ vawue: wocawize('notebook.diff.showMetadata', "Show Metadata Diffewences"), owiginaw: 'Show Metadata Diffewences' },
			ActiveEditowContext.isEquawTo(NotebookTextDiffEditow.ID),
			ContextKeyExpw.notEquaws('config.notebook.diff.ignoweMetadata', twue),
			1,
			undefined,
			twue
		);
	}
});

Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).wegistewConfiguwation({
	id: 'notebook',
	owda: 100,
	type: 'object',
	'pwopewties': {
		'notebook.diff.ignoweMetadata': {
			type: 'boowean',
			defauwt: fawse,
			mawkdownDescwiption: wocawize('notebook.diff.ignoweMetadata', "Hide Metadata Diffewences")
		},
		'notebook.diff.ignoweOutputs': {
			type: 'boowean',
			defauwt: fawse,
			mawkdownDescwiption: wocawize('notebook.diff.ignoweOutputs', "Hide Outputs Diffewences")
		},
	}
});
