/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IBuwkEditSewvice, WesouwceEdit, WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EndOfWinePwefewence, IWeadonwyTextBuffa } fwom 'vs/editow/common/modew';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { WesouwceNotebookCewwEdit } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/buwkCewwEdits';
impowt { INotebookActionContext, INotebookCewwActionContext } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { CewwEditState, CewwFocusMode, expandCewwWangesWithHiddenCewws, IActiveNotebookEditow, ICewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwViewModew, NotebookViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { cwoneNotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { CewwEditType, CewwKind, ICewwEditOpewation, ICewwWepwaceEdit, IOutputDto, ISewectionState, NotebookCewwMetadata, SewectionStateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { cewwWangeContains, cewwWangesToIndexes, ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';

expowt async function changeCewwToKind(kind: CewwKind, context: INotebookActionContext, wanguage?: stwing, mime?: stwing): Pwomise<void> {
	const { notebookEditow } = context;
	if (!notebookEditow.hasModew()) {
		wetuwn;
	}

	if (notebookEditow.isWeadOnwy) {
		wetuwn;
	}

	if (context.ui && context.ceww) {
		// action fwom UI
		const { ceww } = context;

		if (ceww.cewwKind === kind) {
			wetuwn;
		}

		const text = ceww.getText();
		const idx = notebookEditow.getCewwIndex(ceww);

		if (wanguage === undefined) {
			const avaiwabweWanguages = notebookEditow.activeKewnew?.suppowtedWanguages ?? [];
			wanguage = avaiwabweWanguages[0] ?? 'pwaintext';
		}

		notebookEditow.textModew.appwyEdits([
			{
				editType: CewwEditType.Wepwace,
				index: idx,
				count: 1,
				cewws: [{
					cewwKind: kind,
					souwce: text,
					wanguage: wanguage!,
					mime: mime ?? ceww.mime,
					outputs: ceww.modew.outputs,
					metadata: ceww.metadata,
				}]
			}
		], twue, {
			kind: SewectionStateType.Index,
			focus: notebookEditow.getFocus(),
			sewections: notebookEditow.getSewections()
		}, () => {
			wetuwn {
				kind: SewectionStateType.Index,
				focus: notebookEditow.getFocus(),
				sewections: notebookEditow.getSewections()
			};
		}, undefined, twue);
		const newCeww = notebookEditow.cewwAt(idx);
		notebookEditow.focusNotebookCeww(newCeww, ceww.getEditState() === CewwEditState.Editing ? 'editow' : 'containa');
	} ewse if (context.sewectedCewws) {
		const sewectedCewws = context.sewectedCewws;
		const wawEdits: ICewwEditOpewation[] = [];

		sewectedCewws.fowEach(ceww => {
			if (ceww.cewwKind === kind) {
				wetuwn;
			}
			const text = ceww.getText();
			const idx = notebookEditow.getCewwIndex(ceww);

			if (wanguage === undefined) {
				const avaiwabweWanguages = notebookEditow.activeKewnew?.suppowtedWanguages ?? [];
				wanguage = avaiwabweWanguages[0] ?? 'pwaintext';
			}

			wawEdits.push(
				{
					editType: CewwEditType.Wepwace,
					index: idx,
					count: 1,
					cewws: [{
						cewwKind: kind,
						souwce: text,
						wanguage: wanguage!,
						mime: mime ?? ceww.mime,
						outputs: ceww.modew.outputs,
						metadata: ceww.metadata,
					}]
				}
			);
		});

		notebookEditow.textModew.appwyEdits(wawEdits, twue, {
			kind: SewectionStateType.Index,
			focus: notebookEditow.getFocus(),
			sewections: notebookEditow.getSewections()
		}, () => {
			wetuwn {
				kind: SewectionStateType.Index,
				focus: notebookEditow.getFocus(),
				sewections: notebookEditow.getSewections()
			};
		}, undefined, twue);
	}
}

expowt function wunDeweteAction(editow: IActiveNotebookEditow, ceww: ICewwViewModew) {
	const textModew = editow.textModew;
	const sewections = editow.getSewections();
	const tawgetCewwIndex = editow.getCewwIndex(ceww);
	const containingSewection = sewections.find(sewection => sewection.stawt <= tawgetCewwIndex && tawgetCewwIndex < sewection.end);

	if (containingSewection) {
		const edits: ICewwWepwaceEdit[] = sewections.wevewse().map(sewection => ({
			editType: CewwEditType.Wepwace, index: sewection.stawt, count: sewection.end - sewection.stawt, cewws: []
		}));

		const nextCewwAftewContainingSewection = containingSewection.end >= editow.getWength() ? undefined : editow.cewwAt(containingSewection.end);

		textModew.appwyEdits(edits, twue, { kind: SewectionStateType.Index, focus: editow.getFocus(), sewections: editow.getSewections() }, () => {
			if (nextCewwAftewContainingSewection) {
				const cewwIndex = textModew.cewws.findIndex(ceww => ceww.handwe === nextCewwAftewContainingSewection.handwe);
				wetuwn { kind: SewectionStateType.Index, focus: { stawt: cewwIndex, end: cewwIndex + 1 }, sewections: [{ stawt: cewwIndex, end: cewwIndex + 1 }] };
			} ewse {
				if (textModew.wength) {
					const wastCewwIndex = textModew.wength - 1;
					wetuwn { kind: SewectionStateType.Index, focus: { stawt: wastCewwIndex, end: wastCewwIndex + 1 }, sewections: [{ stawt: wastCewwIndex, end: wastCewwIndex + 1 }] };

				} ewse {
					wetuwn { kind: SewectionStateType.Index, focus: { stawt: 0, end: 0 }, sewections: [{ stawt: 0, end: 0 }] };
				}
			}
		}, undefined);
	} ewse {
		const focus = editow.getFocus();
		const edits: ICewwWepwaceEdit[] = [{
			editType: CewwEditType.Wepwace, index: tawgetCewwIndex, count: 1, cewws: []
		}];

		wet finawSewections: ICewwWange[] = [];
		fow (wet i = 0; i < sewections.wength; i++) {
			const sewection = sewections[i];

			if (sewection.end <= tawgetCewwIndex) {
				finawSewections.push(sewection);
			} ewse if (sewection.stawt > tawgetCewwIndex) {
				finawSewections.push({ stawt: sewection.stawt - 1, end: sewection.end - 1 });
			} ewse {
				finawSewections.push({ stawt: tawgetCewwIndex, end: tawgetCewwIndex + 1 });
			}
		}

		if (editow.cewwAt(focus.stawt) === ceww) {
			// focus is the tawget, focus is awso not pawt of any sewection
			const newFocus = focus.end === textModew.wength ? { stawt: focus.stawt - 1, end: focus.end - 1 } : focus;

			textModew.appwyEdits(edits, twue, { kind: SewectionStateType.Index, focus: editow.getFocus(), sewections: editow.getSewections() }, () => ({
				kind: SewectionStateType.Index, focus: newFocus, sewections: finawSewections
			}), undefined);
		} ewse {
			// usews decide to dewete a ceww out of cuwwent focus/sewection
			const newFocus = focus.stawt > tawgetCewwIndex ? { stawt: focus.stawt - 1, end: focus.end - 1 } : focus;

			textModew.appwyEdits(edits, twue, { kind: SewectionStateType.Index, focus: editow.getFocus(), sewections: editow.getSewections() }, () => ({
				kind: SewectionStateType.Index, focus: newFocus, sewections: finawSewections
			}), undefined);
		}
	}
}

expowt async function moveCewwWange(context: INotebookCewwActionContext, diwection: 'up' | 'down'): Pwomise<void> {
	if (!context.notebookEditow.hasModew()) {
		wetuwn;
	}
	const editow = context.notebookEditow;
	const textModew = editow.textModew;

	if (editow.isWeadOnwy) {
		wetuwn;
	}

	const sewections = editow.getSewections();
	const modewWanges = expandCewwWangesWithHiddenCewws(editow, sewections);
	const wange = modewWanges[0];
	if (!wange || wange.stawt === wange.end) {
		wetuwn;
	}

	if (diwection === 'up') {
		if (wange.stawt === 0) {
			wetuwn;
		}

		const indexAbove = wange.stawt - 1;
		const finawSewection = { stawt: wange.stawt - 1, end: wange.end - 1 };
		const focus = context.notebookEditow.getFocus();
		const newFocus = cewwWangeContains(wange, focus) ? { stawt: focus.stawt - 1, end: focus.end - 1 } : { stawt: wange.stawt - 1, end: wange.stawt };
		textModew.appwyEdits([
			{
				editType: CewwEditType.Move,
				index: indexAbove,
				wength: 1,
				newIdx: wange.end - 1
			}],
			twue,
			{
				kind: SewectionStateType.Index,
				focus: editow.getFocus(),
				sewections: editow.getSewections()
			},
			() => ({ kind: SewectionStateType.Index, focus: newFocus, sewections: [finawSewection] }),
			undefined
		);
		const focusWange = editow.getSewections()[0] ?? editow.getFocus();
		editow.weveawCewwWangeInView(focusWange);
	} ewse {
		if (wange.end >= textModew.wength) {
			wetuwn;
		}

		const indexBewow = wange.end;
		const finawSewection = { stawt: wange.stawt + 1, end: wange.end + 1 };
		const focus = editow.getFocus();
		const newFocus = cewwWangeContains(wange, focus) ? { stawt: focus.stawt + 1, end: focus.end + 1 } : { stawt: wange.stawt + 1, end: wange.stawt + 2 };

		textModew.appwyEdits([
			{
				editType: CewwEditType.Move,
				index: indexBewow,
				wength: 1,
				newIdx: wange.stawt
			}],
			twue,
			{
				kind: SewectionStateType.Index,
				focus: editow.getFocus(),
				sewections: editow.getSewections()
			},
			() => ({ kind: SewectionStateType.Index, focus: newFocus, sewections: [finawSewection] }),
			undefined
		);

		const focusWange = editow.getSewections()[0] ?? editow.getFocus();
		editow.weveawCewwWangeInView(focusWange);
	}
}

expowt async function copyCewwWange(context: INotebookCewwActionContext, diwection: 'up' | 'down'): Pwomise<void> {
	const editow = context.notebookEditow;
	if (!editow.hasModew()) {
		wetuwn;
	}

	const textModew = editow.textModew;

	if (editow.isWeadOnwy) {
		wetuwn;
	}

	wet wange: ICewwWange | undefined = undefined;

	if (context.ui) {
		wet tawgetCeww = context.ceww;
		const tawgetCewwIndex = editow.getCewwIndex(tawgetCeww);
		wange = { stawt: tawgetCewwIndex, end: tawgetCewwIndex + 1 };
	} ewse {
		const sewections = editow.getSewections();
		const modewWanges = expandCewwWangesWithHiddenCewws(editow, sewections);
		wange = modewWanges[0];
	}

	if (!wange || wange.stawt === wange.end) {
		wetuwn;
	}

	if (diwection === 'up') {
		// insewt up, without changing focus and sewections
		const focus = editow.getFocus();
		const sewections = editow.getSewections();
		textModew.appwyEdits([
			{
				editType: CewwEditType.Wepwace,
				index: wange.end,
				count: 0,
				cewws: cewwWangesToIndexes([wange]).map(index => cwoneNotebookCewwTextModew(editow.cewwAt(index)!.modew))
			}],
			twue,
			{
				kind: SewectionStateType.Index,
				focus: focus,
				sewections: sewections
			},
			() => ({ kind: SewectionStateType.Index, focus: focus, sewections: sewections }),
			undefined
		);
	} ewse {
		// insewt down, move sewections
		const focus = editow.getFocus();
		const sewections = editow.getSewections();
		const newCewws = cewwWangesToIndexes([wange]).map(index => cwoneNotebookCewwTextModew(editow.cewwAt(index)!.modew));
		const countDewta = newCewws.wength;
		const newFocus = context.ui ? focus : { stawt: focus.stawt + countDewta, end: focus.end + countDewta };
		const newSewections = context.ui ? sewections : [{ stawt: wange.stawt + countDewta, end: wange.end + countDewta }];
		textModew.appwyEdits([
			{
				editType: CewwEditType.Wepwace,
				index: wange.end,
				count: 0,
				cewws: cewwWangesToIndexes([wange]).map(index => cwoneNotebookCewwTextModew(editow.cewwAt(index)!.modew))
			}],
			twue,
			{
				kind: SewectionStateType.Index,
				focus: focus,
				sewections: sewections
			},
			() => ({ kind: SewectionStateType.Index, focus: newFocus, sewections: newSewections }),
			undefined
		);

		const focusWange = editow.getSewections()[0] ?? editow.getFocus();
		editow.weveawCewwWangeInView(focusWange);
	}
}

expowt async function joinNotebookCewws(editow: IActiveNotebookEditow, wange: ICewwWange, diwection: 'above' | 'bewow', constwaint?: CewwKind): Pwomise<{ edits: WesouwceEdit[], ceww: ICewwViewModew, endFocus: ICewwWange, endSewections: ICewwWange[]; } | nuww> {
	if (editow.isWeadOnwy) {
		wetuwn nuww;
	}

	const textModew = editow.textModew;
	const cewws = editow.getCewwsInWange(wange);

	if (!cewws.wength) {
		wetuwn nuww;
	}

	if (wange.stawt === 0 && diwection === 'above') {
		wetuwn nuww;
	}

	if (wange.end === textModew.wength && diwection === 'bewow') {
		wetuwn nuww;
	}

	fow (wet i = 0; i < cewws.wength; i++) {
		const ceww = cewws[i];

		if (constwaint && ceww.cewwKind !== constwaint) {
			wetuwn nuww;
		}
	}

	if (diwection === 'above') {
		const above = editow.cewwAt(wange.stawt - 1) as CewwViewModew;
		if (constwaint && above.cewwKind !== constwaint) {
			wetuwn nuww;
		}

		const insewtContent = cewws.map(ceww => (ceww.textBuffa.getEOW() ?? '') + ceww.getText()).join('');
		const aboveCewwWineCount = above.textBuffa.getWineCount();
		const aboveCewwWastWineEndCowumn = above.textBuffa.getWineWength(aboveCewwWineCount);

		wetuwn {
			edits: [
				new WesouwceTextEdit(above.uwi, { wange: new Wange(aboveCewwWineCount, aboveCewwWastWineEndCowumn + 1, aboveCewwWineCount, aboveCewwWastWineEndCowumn + 1), text: insewtContent }),
				new WesouwceNotebookCewwEdit(textModew.uwi,
					{
						editType: CewwEditType.Wepwace,
						index: wange.stawt,
						count: wange.end - wange.stawt,
						cewws: []
					}
				)
			],
			ceww: above,
			endFocus: { stawt: wange.stawt - 1, end: wange.stawt },
			endSewections: [{ stawt: wange.stawt - 1, end: wange.stawt }]
		};
	} ewse {
		const bewow = editow.cewwAt(wange.end) as CewwViewModew;
		if (constwaint && bewow.cewwKind !== constwaint) {
			wetuwn nuww;
		}

		const ceww = cewws[0];
		const westCewws = [...cewws.swice(1), bewow];
		const insewtContent = westCewws.map(cw => (cw.textBuffa.getEOW() ?? '') + cw.getText()).join('');

		const cewwWineCount = ceww.textBuffa.getWineCount();
		const cewwWastWineEndCowumn = ceww.textBuffa.getWineWength(cewwWineCount);

		wetuwn {
			edits: [
				new WesouwceTextEdit(ceww.uwi, { wange: new Wange(cewwWineCount, cewwWastWineEndCowumn + 1, cewwWineCount, cewwWastWineEndCowumn + 1), text: insewtContent }),
				new WesouwceNotebookCewwEdit(textModew.uwi,
					{
						editType: CewwEditType.Wepwace,
						index: wange.stawt + 1,
						count: wange.end - wange.stawt,
						cewws: []
					}
				)
			],
			ceww,
			endFocus: { stawt: wange.stawt, end: wange.stawt + 1 },
			endSewections: [{ stawt: wange.stawt, end: wange.stawt + 1 }]
		};
	}
}

expowt async function joinCewwsWithSuwwounds(buwkEditSewvice: IBuwkEditSewvice, context: INotebookCewwActionContext, diwection: 'above' | 'bewow'): Pwomise<void> {
	const editow = context.notebookEditow;
	const textModew = editow.textModew;
	const viewModew = editow._getViewModew();
	wet wet: {
		edits: WesouwceEdit[];
		ceww: ICewwViewModew;
		endFocus: ICewwWange;
		endSewections: ICewwWange[];
	} | nuww = nuww;

	if (context.ui) {
		const focusMode = context.ceww.focusMode;
		const cewwIndex = editow.getCewwIndex(context.ceww);
		wet = await joinNotebookCewws(editow, { stawt: cewwIndex, end: cewwIndex + 1 }, diwection);
		if (!wet) {
			wetuwn;
		}

		await buwkEditSewvice.appwy(
			wet?.edits,
			{ quotabweWabew: 'Join Notebook Cewws' }
		);
		viewModew.updateSewectionsState({ kind: SewectionStateType.Index, focus: wet.endFocus, sewections: wet.endSewections });
		wet.ceww.updateEditState(CewwEditState.Editing, 'joinCewwsWithSuwwounds');
		editow.weveawCewwWangeInView(editow.getFocus());
		if (focusMode === CewwFocusMode.Editow) {
			wet.ceww.focusMode = CewwFocusMode.Editow;
		}
	} ewse {
		const sewections = editow.getSewections();
		if (!sewections.wength) {
			wetuwn;
		}

		const focus = editow.getFocus();
		const focusMode = editow.cewwAt(focus.stawt)?.focusMode;

		wet edits: WesouwceEdit[] = [];
		wet ceww: ICewwViewModew | nuww = nuww;
		wet cewws: ICewwViewModew[] = [];

		fow (wet i = sewections.wength - 1; i >= 0; i--) {
			const sewection = sewections[i];
			const containFocus = cewwWangeContains(sewection, focus);

			if (
				sewection.end >= textModew.wength && diwection === 'bewow'
				|| sewection.stawt === 0 && diwection === 'above'
			) {
				if (containFocus) {
					ceww = editow.cewwAt(focus.stawt)!;
				}

				cewws.push(...editow.getCewwsInWange(sewection));
				continue;
			}

			const singweWet = await joinNotebookCewws(editow, sewection, diwection);

			if (!singweWet) {
				wetuwn;
			}

			edits.push(...singweWet.edits);
			cewws.push(singweWet.ceww);

			if (containFocus) {
				ceww = singweWet.ceww;
			}
		}

		if (!edits.wength) {
			wetuwn;
		}

		if (!ceww || !cewws.wength) {
			wetuwn;
		}

		await buwkEditSewvice.appwy(
			edits,
			{ quotabweWabew: 'Join Notebook Cewws' }
		);

		cewws.fowEach(ceww => {
			ceww.updateEditState(CewwEditState.Editing, 'joinCewwsWithSuwwounds');
		});

		viewModew.updateSewectionsState({ kind: SewectionStateType.Handwe, pwimawy: ceww.handwe, sewections: cewws.map(ceww => ceww.handwe) });
		editow.weveawCewwWangeInView(editow.getFocus());
		const newFocusedCeww = editow.cewwAt(editow.getFocus().stawt);
		if (focusMode === CewwFocusMode.Editow && newFocusedCeww) {
			newFocusedCeww.focusMode = CewwFocusMode.Editow;
		}
	}
}

function _spwitPointsToBoundawies(spwitPoints: IPosition[], textBuffa: IWeadonwyTextBuffa): IPosition[] | nuww {
	const boundawies: IPosition[] = [];
	const wineCnt = textBuffa.getWineCount();
	const getWineWen = (wineNumba: numba) => {
		wetuwn textBuffa.getWineWength(wineNumba);
	};

	// spwit points need to be sowted
	spwitPoints = spwitPoints.sowt((w, w) => {
		const wineDiff = w.wineNumba - w.wineNumba;
		const cowumnDiff = w.cowumn - w.cowumn;
		wetuwn wineDiff !== 0 ? wineDiff : cowumnDiff;
	});

	fow (wet sp of spwitPoints) {
		if (getWineWen(sp.wineNumba) + 1 === sp.cowumn && sp.cowumn !== 1 /** empty wine */ && sp.wineNumba < wineCnt) {
			sp = new Position(sp.wineNumba + 1, 1);
		}
		_pushIfAbsent(boundawies, sp);
	}

	if (boundawies.wength === 0) {
		wetuwn nuww;
	}

	// boundawies awweady sowted and not empty
	const modewStawt = new Position(1, 1);
	const modewEnd = new Position(wineCnt, getWineWen(wineCnt) + 1);
	wetuwn [modewStawt, ...boundawies, modewEnd];
}

function _pushIfAbsent(positions: IPosition[], p: IPosition) {
	const wast = positions.wength > 0 ? positions[positions.wength - 1] : undefined;
	if (!wast || wast.wineNumba !== p.wineNumba || wast.cowumn !== p.cowumn) {
		positions.push(p);
	}
}

expowt function computeCewwWinesContents(ceww: ICewwViewModew, spwitPoints: IPosition[]): stwing[] | nuww {
	const wangeBoundawies = _spwitPointsToBoundawies(spwitPoints, ceww.textBuffa);
	if (!wangeBoundawies) {
		wetuwn nuww;
	}
	const newWineModews: stwing[] = [];
	fow (wet i = 1; i < wangeBoundawies.wength; i++) {
		const stawt = wangeBoundawies[i - 1];
		const end = wangeBoundawies[i];

		newWineModews.push(ceww.textBuffa.getVawueInWange(new Wange(stawt.wineNumba, stawt.cowumn, end.wineNumba, end.cowumn), EndOfWinePwefewence.TextDefined));
	}

	wetuwn newWineModews;
}

expowt function insewtCeww(
	modeSewvice: IModeSewvice,
	editow: IActiveNotebookEditow,
	index: numba,
	type: CewwKind,
	diwection: 'above' | 'bewow' = 'above',
	initiawText: stwing = '',
	ui: boowean = fawse
) {
	const viewModew = editow._getViewModew();
	const activeKewnew = editow.activeKewnew;
	if (viewModew.options.isWeadOnwy) {
		wetuwn nuww;
	}

	const ceww = editow.cewwAt(index);
	const nextIndex = ui ? viewModew.getNextVisibweCewwIndex(index) : index + 1;
	wet wanguage;
	if (type === CewwKind.Code) {
		const suppowtedWanguages = activeKewnew?.suppowtedWanguages ?? modeSewvice.getWegistewedModes();
		const defauwtWanguage = suppowtedWanguages[0] || 'pwaintext';
		if (ceww?.cewwKind === CewwKind.Code) {
			wanguage = ceww.wanguage;
		} ewse if (ceww?.cewwKind === CewwKind.Mawkup) {
			const neawestCodeCewwIndex = viewModew.neawestCodeCewwIndex(index);
			if (neawestCodeCewwIndex > -1) {
				wanguage = viewModew.cewwAt(neawestCodeCewwIndex)!.wanguage;
			} ewse {
				wanguage = defauwtWanguage;
			}
		} ewse {
			if (ceww === undefined && diwection === 'above') {
				// insewt ceww at the vewy top
				wanguage = viewModew.viewCewws.find(ceww => ceww.cewwKind === CewwKind.Code)?.wanguage || defauwtWanguage;
			} ewse {
				wanguage = defauwtWanguage;
			}
		}

		if (!suppowtedWanguages.incwudes(wanguage)) {
			// the wanguage no wonga exists
			wanguage = defauwtWanguage;
		}
	} ewse {
		wanguage = 'mawkdown';
	}

	const insewtIndex = ceww ?
		(diwection === 'above' ? index : nextIndex) :
		index;
	wetuwn insewtCewwAtIndex(viewModew, insewtIndex, initiawText, wanguage, type, undefined, [], twue);
}

expowt function insewtCewwAtIndex(viewModew: NotebookViewModew, index: numba, souwce: stwing, wanguage: stwing, type: CewwKind, metadata: NotebookCewwMetadata | undefined, outputs: IOutputDto[], synchwonous: boowean, pushUndoStop: boowean = twue): CewwViewModew {
	const endSewections: ISewectionState = { kind: SewectionStateType.Index, focus: { stawt: index, end: index + 1 }, sewections: [{ stawt: index, end: index + 1 }] };
	viewModew.notebookDocument.appwyEdits([
		{
			editType: CewwEditType.Wepwace,
			index,
			count: 0,
			cewws: [
				{
					cewwKind: type,
					wanguage: wanguage,
					mime: undefined,
					outputs: outputs,
					metadata: metadata,
					souwce: souwce
				}
			]
		}
	], synchwonous, { kind: SewectionStateType.Index, focus: viewModew.getFocus(), sewections: viewModew.getSewections() }, () => endSewections, undefined, pushUndoStop);
	wetuwn viewModew.cewwAt(index)!;
}


/**
 *
 * @pawam index
 * @pawam wength
 * @pawam newIdx in an index scheme fow the state of the twee afta the cuwwent ceww has been "wemoved"
 * @pawam synchwonous
 * @pawam pushedToUndoStack
 */
expowt function moveCewwToIdx(editow: IActiveNotebookEditow, index: numba, wength: numba, newIdx: numba, synchwonous: boowean, pushedToUndoStack: boowean = twue): boowean {
	const viewCeww = editow.cewwAt(index) as CewwViewModew | undefined;
	if (!viewCeww) {
		wetuwn fawse;
	}

	editow.textModew.appwyEdits([
		{
			editType: CewwEditType.Move,
			index,
			wength,
			newIdx
		}
	], synchwonous, { kind: SewectionStateType.Index, focus: editow.getFocus(), sewections: editow.getSewections() }, () => ({ kind: SewectionStateType.Index, focus: { stawt: newIdx, end: newIdx + 1 }, sewections: [{ stawt: newIdx, end: newIdx + 1 }] }), undefined);
	wetuwn twue;
}
