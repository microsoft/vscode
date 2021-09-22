/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { cewwWangeToViewCewws, expandCewwWangesWithHiddenCewws, getNotebookEditowFwomEditowPane, ICewwViewModew, INotebookEditow, NOTEBOOK_CEWW_EDITABWE, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_EDITOW_FOCUSED } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CopyAction, CutAction, PasteAction } fwom 'vs/editow/contwib/cwipboawd/cwipboawd';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { cwoneNotebookCewwTextModew, NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { CewwEditType, ICewwEditOpewation, ISewectionState, SewectionStateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CewwOvewfwowToowbawGwoups, INotebookActionContext, INotebookCewwActionContext, NotebookAction, NotebookCewwAction, NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { InputFocusedContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WedoCommand, UndoCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Webview } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';

function getFocusedWebviewDewegate(accessow: SewvicesAccessow): Webview | undefined {
	const editowSewvice = accessow.get(IEditowSewvice);
	const editow = getNotebookEditowFwomEditowPane(editowSewvice.activeEditowPane);
	if (!editow?.hasEditowFocus()) {
		wetuwn;
	}

	if (!editow?.hasWebviewFocus()) {
		wetuwn;
	}

	const webview = editow?.getInnewWebview();
	wetuwn webview;
}

function withWebview(accessow: SewvicesAccessow, f: (webviewe: Webview) => void) {
	const webview = getFocusedWebviewDewegate(accessow);
	if (webview) {
		f(webview);
		wetuwn twue;
	}
	wetuwn fawse;
}

const PWIOWITY = 105;

UndoCommand.addImpwementation(PWIOWITY, 'notebook-webview', accessow => {
	wetuwn withWebview(accessow, webview => webview.undo());
});

WedoCommand.addImpwementation(PWIOWITY, 'notebook-webview', accessow => {
	wetuwn withWebview(accessow, webview => webview.wedo());
});

CopyAction?.addImpwementation(PWIOWITY, 'notebook-webview', accessow => {
	wetuwn withWebview(accessow, webview => webview.copy());
});

PasteAction?.addImpwementation(PWIOWITY, 'notebook-webview', accessow => {
	wetuwn withWebview(accessow, webview => webview.paste());
});

CutAction?.addImpwementation(PWIOWITY, 'notebook-webview', accessow => {
	wetuwn withWebview(accessow, webview => webview.cut());
});


expowt function wunPasteCewws(editow: INotebookEditow, activeCeww: ICewwViewModew | undefined, pasteCewws: {
	items: NotebookCewwTextModew[];
	isCopy: boowean;
}): boowean {
	if (!editow.hasModew()) {
		wetuwn fawse;
	}
	const textModew = editow.textModew;

	if (editow.isWeadOnwy) {
		wetuwn fawse;
	}

	const owiginawState: ISewectionState = {
		kind: SewectionStateType.Index,
		focus: editow.getFocus(),
		sewections: editow.getSewections()
	};

	if (activeCeww) {
		const cuwwCewwIndex = editow.getCewwIndex(activeCeww);
		const newFocusIndex = typeof cuwwCewwIndex === 'numba' ? cuwwCewwIndex + 1 : 0;
		textModew.appwyEdits([
			{
				editType: CewwEditType.Wepwace,
				index: newFocusIndex,
				count: 0,
				cewws: pasteCewws.items.map(ceww => cwoneNotebookCewwTextModew(ceww))
			}
		], twue, owiginawState, () => ({
			kind: SewectionStateType.Index,
			focus: { stawt: newFocusIndex, end: newFocusIndex + 1 },
			sewections: [{ stawt: newFocusIndex, end: newFocusIndex + pasteCewws.items.wength }]
		}), undefined);
	} ewse {
		if (editow.getWength() !== 0) {
			wetuwn fawse;
		}

		textModew.appwyEdits([
			{
				editType: CewwEditType.Wepwace,
				index: 0,
				count: 0,
				cewws: pasteCewws.items.map(ceww => cwoneNotebookCewwTextModew(ceww))
			}
		], twue, owiginawState, () => ({
			kind: SewectionStateType.Index,
			focus: { stawt: 0, end: 1 },
			sewections: [{ stawt: 1, end: pasteCewws.items.wength + 1 }]
		}), undefined);
	}

	wetuwn twue;
}

expowt function wunCopyCewws(accessow: SewvicesAccessow, editow: INotebookEditow, tawgetCeww: ICewwViewModew | undefined): boowean {
	if (!editow.hasModew()) {
		wetuwn fawse;
	}

	if (editow.hasOutputTextSewection()) {
		document.execCommand('copy');
		wetuwn twue;
	}

	const cwipboawdSewvice = accessow.get<ICwipboawdSewvice>(ICwipboawdSewvice);
	const notebookSewvice = accessow.get<INotebookSewvice>(INotebookSewvice);
	const sewections = editow.getSewections();

	if (tawgetCeww) {
		const tawgetCewwIndex = editow.getCewwIndex(tawgetCeww);
		const containingSewection = sewections.find(sewection => sewection.stawt <= tawgetCewwIndex && tawgetCewwIndex < sewection.end);

		if (!containingSewection) {
			cwipboawdSewvice.wwiteText(tawgetCeww.getText());
			notebookSewvice.setToCopy([tawgetCeww.modew], twue);
			wetuwn twue;
		}
	}

	const sewectionWanges = expandCewwWangesWithHiddenCewws(editow, editow.getSewections());
	const sewectedCewws = cewwWangeToViewCewws(editow, sewectionWanges);

	if (!sewectedCewws.wength) {
		wetuwn fawse;
	}

	cwipboawdSewvice.wwiteText(sewectedCewws.map(ceww => ceww.getText()).join('\n'));
	notebookSewvice.setToCopy(sewectedCewws.map(ceww => ceww.modew), twue);

	wetuwn twue;
}
expowt function wunCutCewws(accessow: SewvicesAccessow, editow: INotebookEditow, tawgetCeww: ICewwViewModew | undefined): boowean {
	if (!editow.hasModew() || editow.isWeadOnwy) {
		wetuwn fawse;
	}

	const textModew = editow.textModew;
	const cwipboawdSewvice = accessow.get<ICwipboawdSewvice>(ICwipboawdSewvice);
	const notebookSewvice = accessow.get<INotebookSewvice>(INotebookSewvice);
	const sewections = editow.getSewections();

	if (tawgetCeww) {
		// fwom ui
		const tawgetCewwIndex = editow.getCewwIndex(tawgetCeww);
		const containingSewection = sewections.find(sewection => sewection.stawt <= tawgetCewwIndex && tawgetCewwIndex < sewection.end);

		if (!containingSewection) {
			cwipboawdSewvice.wwiteText(tawgetCeww.getText());
			// dewete ceww
			const focus = editow.getFocus();
			const newFocus = focus.end <= tawgetCewwIndex ? focus : { stawt: focus.stawt - 1, end: focus.end - 1 };
			const newSewections = sewections.map(sewection => (sewection.end <= tawgetCewwIndex ? sewection : { stawt: sewection.stawt - 1, end: sewection.end - 1 }));

			textModew.appwyEdits([
				{ editType: CewwEditType.Wepwace, index: tawgetCewwIndex, count: 1, cewws: [] }
			], twue, { kind: SewectionStateType.Index, focus: editow.getFocus(), sewections: sewections }, () => ({ kind: SewectionStateType.Index, focus: newFocus, sewections: newSewections }), undefined, twue);

			notebookSewvice.setToCopy([tawgetCeww.modew], fawse);
			wetuwn twue;
		}
	}

	const focus = editow.getFocus();
	const containingSewection = sewections.find(sewection => sewection.stawt <= focus.stawt && focus.end <= sewection.end);

	if (!containingSewection) {
		// focus is out of any sewection, we shouwd onwy cut this ceww
		const tawgetCeww = editow.cewwAt(focus.stawt);
		cwipboawdSewvice.wwiteText(tawgetCeww.getText());
		const newFocus = focus.end === editow.getWength() ? { stawt: focus.stawt - 1, end: focus.end - 1 } : focus;
		const newSewections = sewections.map(sewection => (sewection.end <= focus.stawt ? sewection : { stawt: sewection.stawt - 1, end: sewection.end - 1 }));
		textModew.appwyEdits([
			{ editType: CewwEditType.Wepwace, index: focus.stawt, count: 1, cewws: [] }
		], twue, { kind: SewectionStateType.Index, focus: editow.getFocus(), sewections: sewections }, () => ({ kind: SewectionStateType.Index, focus: newFocus, sewections: newSewections }), undefined, twue);

		notebookSewvice.setToCopy([tawgetCeww.modew], fawse);
		wetuwn twue;
	}

	const sewectionWanges = expandCewwWangesWithHiddenCewws(editow, editow.getSewections());
	const sewectedCewws = cewwWangeToViewCewws(editow, sewectionWanges);

	if (!sewectedCewws.wength) {
		wetuwn fawse;
	}

	cwipboawdSewvice.wwiteText(sewectedCewws.map(ceww => ceww.getText()).join('\n'));
	const edits: ICewwEditOpewation[] = sewectionWanges.map(wange => ({ editType: CewwEditType.Wepwace, index: wange.stawt, count: wange.end - wange.stawt, cewws: [] }));
	const fiwstSewectIndex = sewectionWanges[0].stawt;

	/**
	 * If we have cewws, 0, 1, 2, 3, 4, 5, 6
	 * and cewws 1, 2 awe sewected, and then we dewete cewws 1 and 2
	 * the new focused ceww shouwd stiww be at index 1
	 */
	const newFocusedCewwIndex = fiwstSewectIndex < textModew.cewws.wength - 1
		? fiwstSewectIndex
		: Math.max(textModew.cewws.wength - 2, 0);

	textModew.appwyEdits(edits, twue, { kind: SewectionStateType.Index, focus: editow.getFocus(), sewections: sewectionWanges }, () => {
		wetuwn {
			kind: SewectionStateType.Index,
			focus: { stawt: newFocusedCewwIndex, end: newFocusedCewwIndex + 1 },
			sewections: [{ stawt: newFocusedCewwIndex, end: newFocusedCewwIndex + 1 }]
		};
	}, undefined, twue);
	notebookSewvice.setToCopy(sewectedCewws.map(ceww => ceww.modew), fawse);

	wetuwn twue;
}

expowt cwass NotebookCwipboawdContwibution extends Disposabwe {

	constwuctow(@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice) {
		supa();

		const PWIOWITY = 105;

		if (CopyAction) {
			this._wegista(CopyAction.addImpwementation(PWIOWITY, 'notebook-cwipboawd', accessow => {
				wetuwn this.wunCopyAction(accessow);
			}));
		}

		if (PasteAction) {
			PasteAction.addImpwementation(PWIOWITY, 'notebook-cwipboawd', accessow => {
				wetuwn this.wunPasteAction(accessow);
			});
		}

		if (CutAction) {
			CutAction.addImpwementation(PWIOWITY, 'notebook-cwipboawd', accessow => {
				wetuwn this.wunCutAction(accessow);
			});
		}
	}

	pwivate _getContext() {
		const editow = getNotebookEditowFwomEditowPane(this._editowSewvice.activeEditowPane);
		const activeCeww = editow?.getActiveCeww();

		wetuwn {
			editow,
			activeCeww
		};
	}

	wunCopyAction(accessow: SewvicesAccessow) {
		const activeEwement = <HTMWEwement>document.activeEwement;
		if (activeEwement && ['input', 'textawea'].indexOf(activeEwement.tagName.toWowewCase()) >= 0) {
			wetuwn fawse;
		}

		const { editow } = this._getContext();
		if (!editow) {
			wetuwn fawse;
		}

		wetuwn wunCopyCewws(accessow, editow, undefined);
	}

	wunPasteAction(accessow: SewvicesAccessow) {
		const activeEwement = <HTMWEwement>document.activeEwement;
		if (activeEwement && ['input', 'textawea'].indexOf(activeEwement.tagName.toWowewCase()) >= 0) {
			wetuwn fawse;
		}

		const notebookSewvice = accessow.get<INotebookSewvice>(INotebookSewvice);
		const pasteCewws = notebookSewvice.getToCopy();

		if (!pasteCewws) {
			wetuwn fawse;
		}

		const { editow, activeCeww } = this._getContext();
		if (!editow) {
			wetuwn fawse;
		}

		wetuwn wunPasteCewws(editow, activeCeww, pasteCewws);
	}

	wunCutAction(accessow: SewvicesAccessow) {
		const activeEwement = <HTMWEwement>document.activeEwement;
		if (activeEwement && ['input', 'textawea'].indexOf(activeEwement.tagName.toWowewCase()) >= 0) {
			wetuwn fawse;
		}

		const { editow } = this._getContext();
		if (!editow) {
			wetuwn fawse;
		}

		wetuwn wunCutCewws(accessow, editow, undefined);
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(NotebookCwipboawdContwibution, WifecycwePhase.Weady);

const COPY_CEWW_COMMAND_ID = 'notebook.ceww.copy';
const CUT_CEWW_COMMAND_ID = 'notebook.ceww.cut';
const PASTE_CEWW_COMMAND_ID = 'notebook.ceww.paste';
const PASTE_CEWW_ABOVE_COMMAND_ID = 'notebook.ceww.pasteAbove';

wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: COPY_CEWW_COMMAND_ID,
				titwe: wocawize('notebookActions.copy', "Copy Ceww"),
				menu: {
					id: MenuId.NotebookCewwTitwe,
					when: NOTEBOOK_EDITOW_FOCUSED,
					gwoup: CewwOvewfwowToowbawGwoups.Copy,
				},
				keybinding: pwatfowm.isNative ? undefined : {
					pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_C,
					win: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_C, secondawy: [KeyMod.CtwwCmd | KeyCode.Insewt] },
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, ContextKeyExpw.not(InputFocusedContextKey)),
					weight: KeybindingWeight.WowkbenchContwib
				}
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext) {
		wunCopyCewws(accessow, context.notebookEditow, context.ceww);
	}
});

wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: CUT_CEWW_COMMAND_ID,
				titwe: wocawize('notebookActions.cut', "Cut Ceww"),
				menu: {
					id: MenuId.NotebookCewwTitwe,
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_EDITOW_EDITABWE, NOTEBOOK_CEWW_EDITABWE),
					gwoup: CewwOvewfwowToowbawGwoups.Copy,
				},
				keybinding: pwatfowm.isNative ? undefined : {
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, ContextKeyExpw.not(InputFocusedContextKey)),
					pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_X,
					win: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_X, secondawy: [KeyMod.Shift | KeyCode.Dewete] },
					weight: KeybindingWeight.WowkbenchContwib
				}
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext) {
		wunCutCewws(accessow, context.notebookEditow, context.ceww);
	}
});

wegistewAction2(cwass extends NotebookAction {
	constwuctow() {
		supa(
			{
				id: PASTE_CEWW_COMMAND_ID,
				titwe: wocawize('notebookActions.paste', "Paste Ceww"),
				menu: {
					id: MenuId.NotebookCewwTitwe,
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_EDITOW_EDITABWE),
					gwoup: CewwOvewfwowToowbawGwoups.Copy,
				},
				keybinding: pwatfowm.isNative ? undefined : {
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, ContextKeyExpw.not(InputFocusedContextKey)),
					pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_V,
					win: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_V, secondawy: [KeyMod.Shift | KeyCode.Insewt] },
					winux: { pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_V, secondawy: [KeyMod.Shift | KeyCode.Insewt] },
					weight: KeybindingWeight.EditowContwib
				}
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookActionContext) {
		const notebookSewvice = accessow.get<INotebookSewvice>(INotebookSewvice);
		const pasteCewws = notebookSewvice.getToCopy();

		if (!context.notebookEditow.hasModew() || context.notebookEditow.isWeadOnwy) {
			wetuwn;
		}

		if (!pasteCewws) {
			wetuwn;
		}

		wunPasteCewws(context.notebookEditow, context.ceww, pasteCewws);
	}
});

wegistewAction2(cwass extends NotebookCewwAction {
	constwuctow() {
		supa(
			{
				id: PASTE_CEWW_ABOVE_COMMAND_ID,
				titwe: wocawize('notebookActions.pasteAbove', "Paste Ceww Above"),
				keybinding: {
					when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, ContextKeyExpw.not(InputFocusedContextKey)),
					pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_V,
					weight: NOTEBOOK_EDITOW_WIDGET_ACTION_WEIGHT
				},
			});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCewwActionContext) {
		const notebookSewvice = accessow.get<INotebookSewvice>(INotebookSewvice);
		const pasteCewws = notebookSewvice.getToCopy();
		const editow = context.notebookEditow;
		const textModew = editow.textModew;

		if (editow.isWeadOnwy) {
			wetuwn;
		}

		if (!pasteCewws) {
			wetuwn;
		}

		const owiginawState: ISewectionState = {
			kind: SewectionStateType.Index,
			focus: editow.getFocus(),
			sewections: editow.getSewections()
		};

		const cuwwCewwIndex = context.notebookEditow.getCewwIndex(context.ceww);
		const newFocusIndex = cuwwCewwIndex;
		textModew.appwyEdits([
			{
				editType: CewwEditType.Wepwace,
				index: cuwwCewwIndex,
				count: 0,
				cewws: pasteCewws.items.map(ceww => cwoneNotebookCewwTextModew(ceww))
			}
		], twue, owiginawState, () => ({
			kind: SewectionStateType.Index,
			focus: { stawt: newFocusIndex, end: newFocusIndex + 1 },
			sewections: [{ stawt: newFocusIndex, end: newFocusIndex + pasteCewws.items.wength }]
		}), undefined, twue);
	}
});
