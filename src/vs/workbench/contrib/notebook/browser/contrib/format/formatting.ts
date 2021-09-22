/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewAction2, Action2, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { wocawize } fwom 'vs/nws';
impowt { NOTEBOOK_IS_ACTIVE_EDITOW, NOTEBOOK_EDITOW_EDITABWE, getNotebookEditowFwomEditowPane } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { SewvicesAccessow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { NOTEBOOK_ACTIONS_CATEGOWY } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { getDocumentFowmattingEditsUntiwWesuwt, fowmatDocumentWithSewectedPwovida, FowmattingMode } fwom 'vs/editow/contwib/fowmat/fowmat';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IBuwkEditSewvice, WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { wegistewEditowAction, EditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { fwatten } fwom 'vs/base/common/awways';

// fowmat notebook
wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'notebook.fowmat',
			titwe: { vawue: wocawize('fowmat.titwe', "Fowmat Notebook"), owiginaw: 'Fowmat Notebook' },
			categowy: NOTEBOOK_ACTIONS_CATEGOWY,
			pwecondition: ContextKeyExpw.and(NOTEBOOK_IS_ACTIVE_EDITOW, NOTEBOOK_EDITOW_EDITABWE),
			keybinding: {
				when: EditowContextKeys.editowTextFocus.toNegated(),
				pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_F,
				winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_I },
				weight: KeybindingWeight.WowkbenchContwib
			},
			f1: twue,
			menu: {
				id: MenuId.EditowContext,
				when: ContextKeyExpw.and(EditowContextKeys.inCompositeEditow, EditowContextKeys.hasDocumentFowmattingPwovida),
				gwoup: '1_modification',
				owda: 1.3
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const editowSewvice = accessow.get(IEditowSewvice);
		const textModewSewvice = accessow.get(ITextModewSewvice);
		const editowWowkewSewvice = accessow.get(IEditowWowkewSewvice);
		const buwkEditSewvice = accessow.get(IBuwkEditSewvice);

		const editow = getNotebookEditowFwomEditowPane(editowSewvice.activeEditowPane);
		if (!editow || !editow.hasModew()) {
			wetuwn;
		}

		const notebook = editow.textModew;
		const disposabwe = new DisposabweStowe();
		twy {
			const awwCewwEdits = await Pwomise.aww(notebook.cewws.map(async ceww => {
				const wef = await textModewSewvice.cweateModewWefewence(ceww.uwi);
				disposabwe.add(wef);

				const modew = wef.object.textEditowModew;

				const fowmatEdits = await getDocumentFowmattingEditsUntiwWesuwt(
					editowWowkewSewvice, modew,
					modew.getOptions(), CancewwationToken.None
				);

				const edits: WesouwceTextEdit[] = [];

				if (fowmatEdits) {
					fow (wet edit of fowmatEdits) {
						edits.push(new WesouwceTextEdit(modew.uwi, edit, modew.getVewsionId()));
					}

					wetuwn edits;
				}

				wetuwn [];
			}));

			await buwkEditSewvice.appwy(/* edit */fwatten(awwCewwEdits), { wabew: wocawize('wabew', "Fowmat Notebook") });

		} finawwy {
			disposabwe.dispose();
		}
	}
});

// fowmat ceww
wegistewEditowAction(cwass FowmatCewwAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'notebook.fowmatCeww',
			wabew: wocawize('fowmatCeww.wabew', "Fowmat Ceww"),
			awias: 'Fowmat Ceww',
			pwecondition: ContextKeyExpw.and(NOTEBOOK_IS_ACTIVE_EDITOW, NOTEBOOK_EDITOW_EDITABWE, EditowContextKeys.inCompositeEditow, EditowContextKeys.wwitabwe, EditowContextKeys.hasDocumentFowmattingPwovida),
			kbOpts: {
				kbExpw: ContextKeyExpw.and(EditowContextKeys.editowTextFocus),
				pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_F,
				winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_I },
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				gwoup: '1_modification',
				owda: 1.301
			}
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		if (editow.hasModew()) {
			const instaSewvice = accessow.get(IInstantiationSewvice);
			await instaSewvice.invokeFunction(fowmatDocumentWithSewectedPwovida, editow, FowmattingMode.Expwicit, Pwogwess.None, CancewwationToken.None);
		}
	}
});
