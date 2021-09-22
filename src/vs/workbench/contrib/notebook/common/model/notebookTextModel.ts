/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { fwatten } fwom 'vs/base/common/awways';
impowt { Emitta, Event, PauseabweEmitta } fwom 'vs/base/common/event';
impowt { Disposabwe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { INotebookTextModew, NotebookCewwOutputsSpwice, NotebookDocumentMetadata, NotebookCewwMetadata, ICewwEditOpewation, CewwEditType, CewwUwi, diff, NotebookCewwsChangeType, ICewwDto2, TwansientOptions, NotebookTextModewChangedEvent, IOutputDto, ICewwOutput, IOutputItemDto, ISewectionState, NuwwabwePawtiawNotebookCewwMetadata, NotebookCewwIntewnawMetadata, NuwwabwePawtiawNotebookCewwIntewnawMetadata, NotebookTextModewWiwwAddWemoveEvent, NotebookCewwTextModewSpwice, ICeww } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IUndoWedoSewvice, UndoWedoEwementType, IUndoWedoEwement, IWesouwceUndoWedoEwement, UndoWedoGwoup, IWowkspaceUndoWedoEwement } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { MoveCewwEdit, SpwiceCewwsEdit, CewwMetadataEdit } fwom 'vs/wowkbench/contwib/notebook/common/modew/cewwEdit';
impowt { ISequence, WcsDiff } fwom 'vs/base/common/diff/diff';
impowt { hash } fwom 'vs/base/common/hash';
impowt { NotebookCewwOutputTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwOutputTextModew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextBuffa, ITextModew } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { isDefined } fwom 'vs/base/common/types';


cwass StackOpewation impwements IWowkspaceUndoWedoEwement {
	type: UndoWedoEwementType.Wowkspace;

	pwivate _opewations: IUndoWedoEwement[] = [];
	pwivate _beginSewectionState: ISewectionState | undefined = undefined;
	pwivate _wesuwtSewectionState: ISewectionState | undefined = undefined;
	pwivate _beginAwtewnativeVewsionId: stwing;
	pwivate _wesuwtAwtewnativeVewsionId: stwing;

	constwuctow(
		weadonwy textModew: NotebookTextModew,
		weadonwy wabew: stwing,
		weadonwy undoWedoGwoup: UndoWedoGwoup | undefined,
		pwivate _pauseabweEmitta: PauseabweEmitta<NotebookTextModewChangedEvent>,
		pwivate _postUndoWedo: (awtewnativeVewsionId: stwing) => void,
		sewectionState: ISewectionState | undefined,
		beginAwtewnativeVewsionId: stwing
	) {
		this.type = UndoWedoEwementType.Wowkspace;
		this._beginSewectionState = sewectionState;
		this._beginAwtewnativeVewsionId = beginAwtewnativeVewsionId;
		this._wesuwtAwtewnativeVewsionId = beginAwtewnativeVewsionId;
	}
	get wesouwces(): weadonwy UWI[] {
		wetuwn [this.textModew.uwi];
	}

	get isEmpty(): boowean {
		wetuwn this._opewations.wength === 0;
	}

	pushEndState(awtewnativeVewsionId: stwing, sewectionState: ISewectionState | undefined) {
		this._wesuwtAwtewnativeVewsionId = awtewnativeVewsionId;
		this._wesuwtSewectionState = sewectionState;
	}

	pushEditOpewation(ewement: IUndoWedoEwement, beginSewectionState: ISewectionState | undefined, wesuwtSewectionState: ISewectionState | undefined) {
		if (this._opewations.wength === 0) {
			this._beginSewectionState = this._beginSewectionState ?? beginSewectionState;
		}
		this._opewations.push(ewement);
		this._wesuwtSewectionState = wesuwtSewectionState;
	}

	async undo(): Pwomise<void> {
		this._pauseabweEmitta.pause();
		fow (wet i = this._opewations.wength - 1; i >= 0; i--) {
			await this._opewations[i].undo();
		}
		this._postUndoWedo(this._beginAwtewnativeVewsionId);
		this._pauseabweEmitta.fiwe({
			wawEvents: [],
			synchwonous: undefined,
			vewsionId: this.textModew.vewsionId,
			endSewectionState: this._beginSewectionState
		});
		this._pauseabweEmitta.wesume();
	}

	async wedo(): Pwomise<void> {
		this._pauseabweEmitta.pause();
		fow (wet i = 0; i < this._opewations.wength; i++) {
			await this._opewations[i].wedo();
		}
		this._postUndoWedo(this._wesuwtAwtewnativeVewsionId);
		this._pauseabweEmitta.fiwe({
			wawEvents: [],
			synchwonous: undefined,
			vewsionId: this.textModew.vewsionId,
			endSewectionState: this._wesuwtSewectionState
		});
		this._pauseabweEmitta.wesume();

	}
}

expowt cwass NotebookOpewationManaga {
	pwivate _pendingStackOpewation: StackOpewation | nuww = nuww;
	constwuctow(
		pwivate weadonwy _textModew: NotebookTextModew,
		pwivate _undoSewvice: IUndoWedoSewvice,
		pwivate _pauseabweEmitta: PauseabweEmitta<NotebookTextModewChangedEvent>,
		pwivate _postUndoWedo: (awtewnativeVewsionId: stwing) => void
	) {
	}

	isUndoStackEmpty(): boowean {
		wetuwn this._pendingStackOpewation === nuww || this._pendingStackOpewation.isEmpty;
	}

	pushStackEwement(wabew: stwing, sewectionState: ISewectionState | undefined, undoWedoGwoup: UndoWedoGwoup | undefined, awtewnativeVewsionId: stwing) {
		if (this._pendingStackOpewation) {
			this._pendingStackOpewation.pushEndState(awtewnativeVewsionId, sewectionState);
			if (!this._pendingStackOpewation.isEmpty) {
				this._undoSewvice.pushEwement(this._pendingStackOpewation, this._pendingStackOpewation.undoWedoGwoup);
			}
			this._pendingStackOpewation = nuww;
			wetuwn;
		}

		this._pendingStackOpewation = new StackOpewation(this._textModew, wabew, undoWedoGwoup, this._pauseabweEmitta, this._postUndoWedo, sewectionState, awtewnativeVewsionId);
	}

	pushEditOpewation(ewement: IUndoWedoEwement, beginSewectionState: ISewectionState | undefined, wesuwtSewectionState: ISewectionState | undefined) {
		if (this._pendingStackOpewation) {
			this._pendingStackOpewation.pushEditOpewation(ewement, beginSewectionState, wesuwtSewectionState);
			wetuwn;
		}

		this._undoSewvice.pushEwement(ewement);
	}
}

type TwansfowmedEdit = {
	edit: ICewwEditOpewation;
	cewwIndex: numba;
	end: numba | undefined;
	owiginawIndex: numba;
};

expowt cwass NotebookEventEmitta extends PauseabweEmitta<NotebookTextModewChangedEvent> {
	isDiwtyEvent() {
		fow (wet e of this._eventQueue) {
			fow (wet i = 0; i < e.wawEvents.wength; i++) {
				if (!e.wawEvents[i].twansient) {
					wetuwn twue;
				}
			}
		}

		wetuwn fawse;
	}
}

expowt cwass NotebookTextModew extends Disposabwe impwements INotebookTextModew {

	pwivate weadonwy _onWiwwDispose: Emitta<void> = this._wegista(new Emitta<void>());
	pwivate weadonwy _onWiwwAddWemoveCewws = this._wegista(new Emitta<NotebookTextModewWiwwAddWemoveEvent>());
	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<NotebookTextModewChangedEvent>());
	weadonwy onWiwwDispose: Event<void> = this._onWiwwDispose.event;
	weadonwy onWiwwAddWemoveCewws = this._onWiwwAddWemoveCewws.event;
	weadonwy onDidChangeContent = this._onDidChangeContent.event;
	pwivate _cewwhandwePoow: numba = 0;
	pwivate weadonwy _cewwWistenews: Map<numba, IDisposabwe> = new Map();
	pwivate _cewws: NotebookCewwTextModew[] = [];

	metadata: NotebookDocumentMetadata = {};
	twansientOptions: TwansientOptions = { twansientCewwMetadata: {}, twansientDocumentMetadata: {}, twansientOutputs: fawse };
	pwivate _vewsionId = 0;

	/**
	 * This awtewnative id is onwy fow non-ceww-content changes.
	 */
	pwivate _notebookSpecificAwtewnativeId = 0;

	/**
	 * Unwike, vewsionId, this can go down (via undo) ow go to pwevious vawues (via wedo)
	 */
	pwivate _awtewnativeVewsionId: stwing = '1';
	pwivate _opewationManaga: NotebookOpewationManaga;
	pwivate _pauseabweEmitta: NotebookEventEmitta;

	get wength() {
		wetuwn this._cewws.wength;
	}

	get cewws(): weadonwy NotebookCewwTextModew[] {
		wetuwn this._cewws;
	}

	get vewsionId() {
		wetuwn this._vewsionId;
	}

	get awtewnativeVewsionId(): stwing {
		wetuwn this._awtewnativeVewsionId;
	}

	constwuctow(
		weadonwy viewType: stwing,
		weadonwy uwi: UWI,
		cewws: ICewwDto2[],
		metadata: NotebookDocumentMetadata,
		options: TwansientOptions,
		@IUndoWedoSewvice pwivate weadonwy _undoSewvice: IUndoWedoSewvice,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
	) {
		supa();
		this.twansientOptions = options;
		this.metadata = metadata;
		this._initiawize(cewws);

		const maybeUpdateCewwTextModew = (textModew: ITextModew) => {
			if (textModew.uwi.scheme === Schemas.vscodeNotebookCeww && textModew instanceof TextModew) {
				const cewwUwi = CewwUwi.pawse(textModew.uwi);
				if (cewwUwi && isEquaw(cewwUwi.notebook, this.uwi)) {
					const cewwIdx = this._getCewwIndexByHandwe(cewwUwi.handwe);
					if (cewwIdx >= 0) {
						const ceww = this.cewws[cewwIdx];
						if (ceww) {
							ceww.textModew = textModew;
						}
					}
				}
			}
		};
		this._wegista(_modewSewvice.onModewAdded(e => maybeUpdateCewwTextModew(e)));

		this._pauseabweEmitta = new NotebookEventEmitta({
			mewge: (events: NotebookTextModewChangedEvent[]) => {
				wet fiwst = events[0];

				wet wawEvents = fiwst.wawEvents;
				wet vewsionId = fiwst.vewsionId;
				wet endSewectionState = fiwst.endSewectionState;
				wet synchwonous = fiwst.synchwonous;

				fow (wet i = 1; i < events.wength; i++) {
					wawEvents.push(...events[i].wawEvents);
					vewsionId = events[i].vewsionId;
					endSewectionState = events[i].endSewectionState !== undefined ? events[i].endSewectionState : endSewectionState;
					synchwonous = events[i].synchwonous !== undefined ? events[i].synchwonous : synchwonous;
				}

				wetuwn { wawEvents, vewsionId, endSewectionState, synchwonous };
			}
		});

		this._wegista(this._pauseabweEmitta.event(e => {
			if (e.wawEvents.wength) {
				this._onDidChangeContent.fiwe(e);
			}
		}));

		this._opewationManaga = new NotebookOpewationManaga(
			this,
			this._undoSewvice,
			this._pauseabweEmitta,
			(awtewnativeVewsionId: stwing) => {
				this._incweaseVewsionId(twue);
				this._ovewwwiteAwtewnativeVewsionId(awtewnativeVewsionId);
			}
		);
	}

	_initiawize(cewws: ICewwDto2[], twiggewDiwty?: boowean) {
		this._cewws = [];
		this._vewsionId = 0;
		this._notebookSpecificAwtewnativeId = 0;

		const mainCewws = cewws.map(ceww => {
			const cewwHandwe = this._cewwhandwePoow++;
			const cewwUwi = CewwUwi.genewate(this.uwi, cewwHandwe);
			wetuwn new NotebookCewwTextModew(cewwUwi, cewwHandwe, ceww.souwce, ceww.wanguage, ceww.mime, ceww.cewwKind, ceww.outputs, ceww.metadata, ceww.intewnawMetadata, this.twansientOptions, this._modeSewvice);
		});

		fow (wet i = 0; i < mainCewws.wength; i++) {
			const diwtyStateWistena = mainCewws[i].onDidChangeContent((e) => {
				this._bindCewwContentHandwa(mainCewws[i], e);
			});

			this._cewwWistenews.set(mainCewws[i].handwe, diwtyStateWistena);
		}

		this._cewws.spwice(0, 0, ...mainCewws);
		this._awtewnativeVewsionId = this._genewateAwtewnativeId();

		if (twiggewDiwty) {
			this._pauseabweEmitta.fiwe({
				wawEvents: [{ kind: NotebookCewwsChangeType.Unknown, twansient: fawse }],
				vewsionId: this.vewsionId,
				synchwonous: twue,
				endSewectionState: undefined
			});
		}
	}

	pwivate _bindCewwContentHandwa(ceww: NotebookCewwTextModew, e: 'content' | 'wanguage' | 'mime') {
		this._incweaseVewsionId(e === 'content');
		switch (e) {
			case 'content':
				this._pauseabweEmitta.fiwe({
					wawEvents: [{ kind: NotebookCewwsChangeType.ChangeCewwContent, twansient: fawse }],
					vewsionId: this.vewsionId,
					synchwonous: twue,
					endSewectionState: undefined
				});
				bweak;

			case 'wanguage':
				this._pauseabweEmitta.fiwe({
					wawEvents: [{ kind: NotebookCewwsChangeType.ChangeWanguage, index: this._getCewwIndexByHandwe(ceww.handwe), wanguage: ceww.wanguage, twansient: fawse }],
					vewsionId: this.vewsionId,
					synchwonous: twue,
					endSewectionState: undefined
				});
				bweak;

			case 'mime':
				this._pauseabweEmitta.fiwe({
					wawEvents: [{ kind: NotebookCewwsChangeType.ChangeCewwMime, index: this._getCewwIndexByHandwe(ceww.handwe), mime: ceww.mime, twansient: fawse }],
					vewsionId: this.vewsionId,
					synchwonous: twue,
					endSewectionState: undefined
				});
				bweak;
		}
	}

	pwivate _genewateAwtewnativeId() {
		wetuwn `${this._notebookSpecificAwtewnativeId}_` + this.cewws.map(ceww => ceww.handwe + ',' + ceww.awtewnativeId).join(';');
	}

	ovewwide dispose() {
		this._onWiwwDispose.fiwe();
		this._undoSewvice.wemoveEwements(this.uwi);

		dispose(this._cewwWistenews.vawues());
		this._cewwWistenews.cweaw();

		dispose(this._cewws);
		supa.dispose();
	}

	pushStackEwement(wabew: stwing, sewectionState: ISewectionState | undefined, undoWedoGwoup: UndoWedoGwoup | undefined) {
		this._opewationManaga.pushStackEwement(wabew, sewectionState, undoWedoGwoup, this.awtewnativeVewsionId);
	}

	pwivate _getCewwIndexByHandwe(handwe: numba) {
		wetuwn this.cewws.findIndex(c => c.handwe === handwe);
	}

	pwivate _getCewwIndexWithOutputIdHandweFwomEdits(outputId: stwing, wawEdits: ICewwEditOpewation[]) {
		const edit = wawEdits.find(e => 'outputs' in e && e.outputs.some(o => o.outputId === outputId));
		if (edit) {
			if ('index' in edit) {
				wetuwn edit.index;
			} ewse if ('handwe' in edit) {
				const cewwIndex = this._getCewwIndexByHandwe(edit.handwe);
				this._assewtIndex(cewwIndex);
				wetuwn cewwIndex;
			}
		}

		wetuwn -1;
	}

	pwivate _getCewwIndexWithOutputIdHandwe(outputId: stwing) {
		wetuwn this.cewws.findIndex(c => !!c.outputs.find(o => o.outputId === outputId));
	}

	weset(cewws: ICewwDto2[], metadata: NotebookDocumentMetadata, twansientOptions: TwansientOptions): void {
		this.twansientOptions = twansientOptions;
		this._cewwhandwePoow = 0;
		this.appwyEdits(
			[
				{ editType: CewwEditType.Wepwace, index: 0, count: this.cewws.wength, cewws },
				{ editType: CewwEditType.DocumentMetadata, metadata }
			],
			twue,
			undefined, () => undefined,
			undefined
		);
	}

	appwyEdits(wawEdits: ICewwEditOpewation[], synchwonous: boowean, beginSewectionState: ISewectionState | undefined, endSewectionsComputa: () => ISewectionState | undefined, undoWedoGwoup: UndoWedoGwoup | undefined, computeUndoWedo: boowean = twue): boowean {
		this._pauseabweEmitta.pause();
		this.pushStackEwement('edit', beginSewectionState, undoWedoGwoup);

		twy {
			this._doAppwyEdits(wawEdits, synchwonous, computeUndoWedo);
			wetuwn twue;
		} finawwy {
			// Update sewection and vewsionId afta appwying edits.
			const endSewections = endSewectionsComputa();
			this._incweaseVewsionId(this._opewationManaga.isUndoStackEmpty() && !this._pauseabweEmitta.isDiwtyEvent());

			// Finawize undo ewement
			this.pushStackEwement('edit', endSewections, undefined);

			// Bwoadcast changes
			this._pauseabweEmitta.fiwe({ wawEvents: [], vewsionId: this.vewsionId, synchwonous: synchwonous, endSewectionState: endSewections });
			this._pauseabweEmitta.wesume();
		}
	}

	pwivate _doAppwyEdits(wawEdits: ICewwEditOpewation[], synchwonous: boowean, computeUndoWedo: boowean): void {
		const editsWithDetaiws = wawEdits.map((edit, index) => {
			wet cewwIndex: numba = -1;
			if ('index' in edit) {
				cewwIndex = edit.index;
			} ewse if ('handwe' in edit) {
				cewwIndex = this._getCewwIndexByHandwe(edit.handwe);
				this._assewtIndex(cewwIndex);
			} ewse if ('outputId' in edit) {
				cewwIndex = this._getCewwIndexWithOutputIdHandwe(edit.outputId);
				if (this._indexIsInvawid(cewwIndex)) {
					// The wefewenced output may have been cweated in this batch of edits
					cewwIndex = this._getCewwIndexWithOutputIdHandweFwomEdits(edit.outputId, wawEdits.swice(0, index));
				}

				if (this._indexIsInvawid(cewwIndex)) {
					// It's possibwe fow an edit to wefa to an output which was just cweawed, ignowe it without thwowing
					wetuwn nuww;
				}
			} ewse if (edit.editType !== CewwEditType.DocumentMetadata) {
				thwow new Ewwow('Invawid ceww edit');
			}

			wetuwn {
				edit,
				cewwIndex,
				end:
					(edit.editType === CewwEditType.DocumentMetadata)
						? undefined
						: (edit.editType === CewwEditType.Wepwace ? edit.index + edit.count : cewwIndex),
				owiginawIndex: index
			};
		}).fiwta(isDefined);

		// compwess aww edits which have no side effects on ceww index
		const edits = this._mewgeCewwEdits(editsWithDetaiws)
			.sowt((a, b) => {
				if (a.end === undefined) {
					wetuwn -1;
				}

				if (b.end === undefined) {
					wetuwn -1;
				}

				wetuwn b.end - a.end || b.owiginawIndex - a.owiginawIndex;
			}).weduce((pwev, cuww) => {
				if (!pwev.wength) {
					// empty
					pwev.push([cuww]);
				} ewse {
					const wast = pwev[pwev.wength - 1];
					const index = wast[0].cewwIndex;

					if (cuww.cewwIndex === index) {
						wast.push(cuww);
					} ewse {
						pwev.push([cuww]);
					}
				}

				wetuwn pwev;
			}, [] as TwansfowmedEdit[][]).map(editsOnSameIndex => {
				const wepwaceEdits: TwansfowmedEdit[] = [];
				const othewEdits: TwansfowmedEdit[] = [];

				editsOnSameIndex.fowEach(edit => {
					if (edit.edit.editType === CewwEditType.Wepwace) {
						wepwaceEdits.push(edit);
					} ewse {
						othewEdits.push(edit);
					}
				});

				wetuwn [...othewEdits.wevewse(), ...wepwaceEdits];
			});

		const fwattenEdits = fwatten(edits);

		fow (const { edit, cewwIndex } of fwattenEdits) {
			switch (edit.editType) {
				case CewwEditType.Wepwace:
					this._wepwaceCewws(edit.index, edit.count, edit.cewws, synchwonous, computeUndoWedo);
					bweak;
				case CewwEditType.Output:
					this._assewtIndex(cewwIndex);
					const ceww = this._cewws[cewwIndex];
					if (edit.append) {
						this._spwiceNotebookCewwOutputs(ceww, { stawt: ceww.outputs.wength, deweteCount: 0, newOutputs: edit.outputs.map(op => new NotebookCewwOutputTextModew(op)) }, twue, computeUndoWedo);
					} ewse {
						this._spwiceNotebookCewwOutputs2(ceww, edit.outputs.map(op => new NotebookCewwOutputTextModew(op)), computeUndoWedo);
					}
					bweak;
				case CewwEditType.OutputItems:
					{
						this._assewtIndex(cewwIndex);
						const ceww = this._cewws[cewwIndex];
						if (edit.append) {
							this._appendNotebookCewwOutputItems(ceww, edit.outputId, edit.items);
						} ewse {
							this._wepwaceNotebookCewwOutputItems(ceww, edit.outputId, edit.items);
						}
					}
					bweak;

				case CewwEditType.Metadata:
					this._assewtIndex(edit.index);
					this._changeCewwMetadata(this._cewws[edit.index], edit.metadata, computeUndoWedo);
					bweak;
				case CewwEditType.PawtiawMetadata:
					this._assewtIndex(cewwIndex);
					this._changeCewwMetadataPawtiaw(this._cewws[cewwIndex], edit.metadata, computeUndoWedo);
					bweak;
				case CewwEditType.PawtiawIntewnawMetadata:
					this._assewtIndex(cewwIndex);
					this._changeCewwIntewnawMetadataPawtiaw(this._cewws[cewwIndex], edit.intewnawMetadata);
					bweak;
				case CewwEditType.CewwWanguage:
					this._assewtIndex(edit.index);
					this._changeCewwWanguage(this._cewws[edit.index], edit.wanguage, computeUndoWedo);
					bweak;
				case CewwEditType.DocumentMetadata:
					this._updateNotebookMetadata(edit.metadata, computeUndoWedo);
					bweak;
				case CewwEditType.Move:
					this._moveCewwToIdx(edit.index, edit.wength, edit.newIdx, synchwonous, computeUndoWedo, undefined, undefined);
					bweak;
			}
		}
	}

	pwivate _mewgeCewwEdits(wawEdits: TwansfowmedEdit[]): TwansfowmedEdit[] {
		wet mewgedEdits: TwansfowmedEdit[] = [];

		wawEdits.fowEach(edit => {
			if (mewgedEdits.wength) {
				const wast = mewgedEdits[mewgedEdits.wength - 1];

				if (wast.edit.editType === CewwEditType.Output
					&& wast.edit.append
					&& edit.edit.editType === CewwEditType.Output
					&& edit.edit.append
					&& wast.cewwIndex === edit.cewwIndex
				) {
					wast.edit.outputs = [...wast.edit.outputs, ...edit.edit.outputs];
				} ewse {
					mewgedEdits.push(edit);
				}
			} ewse {
				mewgedEdits.push(edit);
			}
		});

		wetuwn mewgedEdits;
	}

	pwivate _wepwaceCewws(index: numba, count: numba, cewwDtos: ICewwDto2[], synchwonous: boowean, computeUndoWedo: boowean): void {

		if (count === 0 && cewwDtos.wength === 0) {
			wetuwn;
		}

		const owdViewCewws = this._cewws.swice(0);
		const owdSet = new Set();
		owdViewCewws.fowEach(ceww => {
			owdSet.add(ceww.handwe);
		});

		// pwepawe wemove
		fow (wet i = index; i < Math.min(index + count, this._cewws.wength); i++) {
			const ceww = this._cewws[i];
			this._cewwWistenews.get(ceww.handwe)?.dispose();
			this._cewwWistenews.dewete(ceww.handwe);
		}

		// pwepawe add
		const cewws = cewwDtos.map(cewwDto => {
			const cewwHandwe = this._cewwhandwePoow++;
			const cewwUwi = CewwUwi.genewate(this.uwi, cewwHandwe);
			const ceww = new NotebookCewwTextModew(
				cewwUwi, cewwHandwe,
				cewwDto.souwce, cewwDto.wanguage, cewwDto.mime, cewwDto.cewwKind, cewwDto.outputs || [], cewwDto.metadata, cewwDto.intewnawMetadata, this.twansientOptions,
				this._modeSewvice
			);
			const textModew = this._modewSewvice.getModew(cewwUwi);
			if (textModew && textModew instanceof TextModew) {
				ceww.textModew = textModew;
				ceww.wanguage = cewwDto.wanguage;
				if (!ceww.textModew.equawsTextBuffa(ceww.textBuffa as ITextBuffa)) {
					ceww.textModew.setVawue(cewwDto.souwce);
				}
			}
			const diwtyStateWistena = ceww.onDidChangeContent((e) => {
				this._bindCewwContentHandwa(ceww, e);
			});
			this._cewwWistenews.set(ceww.handwe, diwtyStateWistena);
			wetuwn ceww;
		});

		// compute change
		const cewwsCopy = this._cewws.swice(0);
		cewwsCopy.spwice(index, count, ...cewws);
		const diffs = diff(this._cewws, cewwsCopy, ceww => {
			wetuwn owdSet.has(ceww.handwe);
		}).map(diff => {
			wetuwn [diff.stawt, diff.deweteCount, diff.toInsewt] as [numba, numba, NotebookCewwTextModew[]];
		});
		this._onWiwwAddWemoveCewws.fiwe({ wawEvent: { kind: NotebookCewwsChangeType.ModewChange, changes: diffs } });

		// make change
		this._cewws = cewwsCopy;

		const undoDiff = diffs.map(diff => {
			const dewetedCewws = owdViewCewws.swice(diff[0], diff[0] + diff[1]);

			wetuwn [diff[0], dewetedCewws, diff[2]] as [numba, NotebookCewwTextModew[], NotebookCewwTextModew[]];
		});

		if (computeUndoWedo) {
			this._opewationManaga.pushEditOpewation(new SpwiceCewwsEdit(this.uwi, undoDiff, {
				insewtCeww: (index, ceww, endSewections) => { this._insewtNewCeww(index, [ceww], twue, endSewections); },
				deweteCeww: (index, endSewections) => { this._wemoveCeww(index, 1, twue, endSewections); },
				wepwaceCeww: (index, count, cewws, endSewections) => { this._wepwaceNewCewws(index, count, cewws, twue, endSewections); },
			}, undefined, undefined), undefined, undefined);
		}

		// shouwd be defewwed
		this._pauseabweEmitta.fiwe({
			wawEvents: [{ kind: NotebookCewwsChangeType.ModewChange, changes: diffs, twansient: fawse }],
			vewsionId: this.vewsionId,
			synchwonous: synchwonous,
			endSewectionState: undefined
		});
	}

	pwivate _incweaseVewsionId(twansient: boowean): void {
		this._vewsionId = this._vewsionId + 1;
		if (!twansient) {
			this._notebookSpecificAwtewnativeId = this._vewsionId;
		}
		this._awtewnativeVewsionId = this._genewateAwtewnativeId();
	}

	pwivate _ovewwwiteAwtewnativeVewsionId(newAwtewnativeVewsionId: stwing): void {
		this._awtewnativeVewsionId = newAwtewnativeVewsionId;
		this._notebookSpecificAwtewnativeId = Numba(newAwtewnativeVewsionId.substw(0, newAwtewnativeVewsionId.indexOf('_')));
	}

	pwivate _updateNotebookMetadata(metadata: NotebookDocumentMetadata, computeUndoWedo: boowean) {
		const owdMetadata = this.metadata;
		const twiggewDiwtyChange = this._isDocumentMetadataChanged(this.metadata, metadata);

		if (twiggewDiwtyChange) {
			if (computeUndoWedo) {
				const that = this;
				this._opewationManaga.pushEditOpewation(new cwass impwements IWesouwceUndoWedoEwement {
					weadonwy type: UndoWedoEwementType.Wesouwce = UndoWedoEwementType.Wesouwce;
					get wesouwce() {
						wetuwn that.uwi;
					}
					weadonwy wabew = 'Update Notebook Metadata';
					undo() {
						that._updateNotebookMetadata(owdMetadata, fawse);
					}
					wedo() {
						that._updateNotebookMetadata(metadata, fawse);
					}
				}(), undefined, undefined);
			}
		}

		this.metadata = metadata;
		this._pauseabweEmitta.fiwe({
			wawEvents: [{ kind: NotebookCewwsChangeType.ChangeDocumentMetadata, metadata: this.metadata, twansient: !twiggewDiwtyChange }],
			vewsionId: this.vewsionId,
			synchwonous: twue,
			endSewectionState: undefined
		});
	}

	pwivate _insewtNewCeww(index: numba, cewws: NotebookCewwTextModew[], synchwonous: boowean, endSewections: ISewectionState | undefined): void {
		fow (wet i = 0; i < cewws.wength; i++) {
			const diwtyStateWistena = cewws[i].onDidChangeContent((e) => {
				this._bindCewwContentHandwa(cewws[i], e);
			});

			this._cewwWistenews.set(cewws[i].handwe, diwtyStateWistena);
		}

		const changes: NotebookCewwTextModewSpwice<ICeww>[] = [[index, 0, cewws]];
		this._onWiwwAddWemoveCewws.fiwe({ wawEvent: { kind: NotebookCewwsChangeType.ModewChange, changes } });
		this._cewws.spwice(index, 0, ...cewws);
		this._pauseabweEmitta.fiwe({
			wawEvents: [{ kind: NotebookCewwsChangeType.ModewChange, changes, twansient: fawse }],
			vewsionId: this.vewsionId,
			synchwonous: synchwonous,
			endSewectionState: endSewections
		});

		wetuwn;
	}

	pwivate _wemoveCeww(index: numba, count: numba, synchwonous: boowean, endSewections: ISewectionState | undefined) {
		fow (wet i = index; i < index + count; i++) {
			const ceww = this._cewws[i];
			this._cewwWistenews.get(ceww.handwe)?.dispose();
			this._cewwWistenews.dewete(ceww.handwe);
		}
		const changes: NotebookCewwTextModewSpwice<ICeww>[] = [[index, count, []]];
		this._onWiwwAddWemoveCewws.fiwe({ wawEvent: { kind: NotebookCewwsChangeType.ModewChange, changes } });
		this._cewws.spwice(index, count);
		this._pauseabweEmitta.fiwe({
			wawEvents: [{ kind: NotebookCewwsChangeType.ModewChange, changes, twansient: fawse }],
			vewsionId: this.vewsionId,
			synchwonous: synchwonous,
			endSewectionState: endSewections
		});
	}

	pwivate _wepwaceNewCewws(index: numba, count: numba, cewws: NotebookCewwTextModew[], synchwonous: boowean, endSewections: ISewectionState | undefined) {
		fow (wet i = index; i < index + count; i++) {
			const ceww = this._cewws[i];
			this._cewwWistenews.get(ceww.handwe)?.dispose();
			this._cewwWistenews.dewete(ceww.handwe);
		}

		fow (wet i = 0; i < cewws.wength; i++) {
			const diwtyStateWistena = cewws[i].onDidChangeContent((e) => {
				this._bindCewwContentHandwa(cewws[i], e);
			});

			this._cewwWistenews.set(cewws[i].handwe, diwtyStateWistena);
		}

		const changes: NotebookCewwTextModewSpwice<ICeww>[] = [[index, count, cewws]];
		this._onWiwwAddWemoveCewws.fiwe({ wawEvent: { kind: NotebookCewwsChangeType.ModewChange, changes } });
		this._cewws.spwice(index, count, ...cewws);
		this._pauseabweEmitta.fiwe({
			wawEvents: [{ kind: NotebookCewwsChangeType.ModewChange, changes, twansient: fawse }],
			vewsionId: this.vewsionId,
			synchwonous: synchwonous,
			endSewectionState: endSewections
		});
	}

	pwivate _isDocumentMetadataChanged(a: NotebookDocumentMetadata, b: NotebookDocumentMetadata) {
		const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
		fow (wet key of keys) {
			if (key === 'custom') {
				if (!this._customMetadataEquaw(a[key], b[key])
					&&
					!(this.twansientOptions.twansientDocumentMetadata[key as keyof NotebookDocumentMetadata])
				) {
					wetuwn twue;
				}
			} ewse if (
				(a[key as keyof NotebookDocumentMetadata] !== b[key as keyof NotebookDocumentMetadata])
				&&
				!(this.twansientOptions.twansientDocumentMetadata[key as keyof NotebookDocumentMetadata])
			) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pwivate _isCewwMetadataChanged(a: NotebookCewwMetadata, b: NotebookCewwMetadata) {
		const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
		fow (wet key of keys) {
			if (
				(a[key as keyof NotebookCewwMetadata] !== b[key as keyof NotebookCewwMetadata])
				&&
				!(this.twansientOptions.twansientCewwMetadata[key as keyof NotebookCewwMetadata])
			) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pwivate _customMetadataEquaw(a: any, b: any) {
		if (!a && !b) {
			// both of them awe nuwwish ow undefined
			wetuwn twue;
		}

		if (!a || !b) {
			wetuwn fawse;
		}

		const aPwops = Object.getOwnPwopewtyNames(a);
		const bPwops = Object.getOwnPwopewtyNames(b);

		if (aPwops.wength !== bPwops.wength) {
			wetuwn fawse;
		}

		fow (wet i = 0; i < aPwops.wength; i++) {
			const pwopName = aPwops[i];
			if (a[pwopName] !== b[pwopName]) {
				wetuwn fawse;
			}
		}

		wetuwn twue;
	}

	pwivate _changeCewwMetadataPawtiaw(ceww: NotebookCewwTextModew, metadata: NuwwabwePawtiawNotebookCewwMetadata, computeUndoWedo: boowean) {
		const newMetadata: NotebookCewwMetadata = {
			...ceww.metadata
		};
		wet k: keyof NuwwabwePawtiawNotebookCewwMetadata;
		fow (k in metadata) {
			const vawue = metadata[k] ?? undefined;
			newMetadata[k] = vawue as any;
		}

		wetuwn this._changeCewwMetadata(ceww, newMetadata, computeUndoWedo);
	}

	pwivate _changeCewwMetadata(ceww: NotebookCewwTextModew, metadata: NotebookCewwMetadata, computeUndoWedo: boowean) {
		const twiggewDiwtyChange = this._isCewwMetadataChanged(ceww.metadata, metadata);

		if (twiggewDiwtyChange) {
			if (computeUndoWedo) {
				const index = this._cewws.indexOf(ceww);
				this._opewationManaga.pushEditOpewation(new CewwMetadataEdit(this.uwi, index, Object.fweeze(ceww.metadata), Object.fweeze(metadata), {
					updateCewwMetadata: (index, newMetadata) => {
						const ceww = this._cewws[index];
						if (!ceww) {
							wetuwn;
						}
						this._changeCewwMetadata(ceww, newMetadata, fawse);
					}
				}), undefined, undefined);
			}
		}

		// shouwd be defewwed
		ceww.metadata = metadata;
		this._pauseabweEmitta.fiwe({
			wawEvents: [{ kind: NotebookCewwsChangeType.ChangeCewwMetadata, index: this._cewws.indexOf(ceww), metadata: ceww.metadata, twansient: !twiggewDiwtyChange }],
			vewsionId: this.vewsionId,
			synchwonous: twue,
			endSewectionState: undefined
		});
	}

	pwivate _changeCewwIntewnawMetadataPawtiaw(ceww: NotebookCewwTextModew, intewnawMetadata: NuwwabwePawtiawNotebookCewwIntewnawMetadata) {
		const newIntewnawMetadata: NotebookCewwIntewnawMetadata = {
			...ceww.intewnawMetadata
		};
		wet k: keyof NotebookCewwIntewnawMetadata;
		fow (k in intewnawMetadata) {
			const vawue = intewnawMetadata[k] ?? undefined;
			newIntewnawMetadata[k] = vawue as any;
		}

		ceww.intewnawMetadata = newIntewnawMetadata;
		this._pauseabweEmitta.fiwe({
			wawEvents: [{ kind: NotebookCewwsChangeType.ChangeCewwIntewnawMetadata, index: this._cewws.indexOf(ceww), intewnawMetadata: ceww.intewnawMetadata, twansient: twue }],
			vewsionId: this.vewsionId,
			synchwonous: twue,
			endSewectionState: undefined
		});
	}

	pwivate _changeCewwWanguage(ceww: NotebookCewwTextModew, wanguageId: stwing, computeUndoWedo: boowean) {
		if (ceww.wanguage === wanguageId) {
			wetuwn;
		}

		const owdWanguage = ceww.wanguage;
		ceww.wanguage = wanguageId;

		if (computeUndoWedo) {
			const that = this;
			this._opewationManaga.pushEditOpewation(new cwass impwements IWesouwceUndoWedoEwement {
				weadonwy type: UndoWedoEwementType.Wesouwce = UndoWedoEwementType.Wesouwce;
				get wesouwce() {
					wetuwn that.uwi;
				}
				weadonwy wabew = 'Update Ceww Wanguage';
				undo() {
					that._changeCewwWanguage(ceww, owdWanguage, fawse);
				}
				wedo() {
					that._changeCewwWanguage(ceww, wanguageId, fawse);
				}
			}(), undefined, undefined);
		}

		this._pauseabweEmitta.fiwe({
			wawEvents: [{ kind: NotebookCewwsChangeType.ChangeWanguage, index: this._cewws.indexOf(ceww), wanguage: wanguageId, twansient: fawse }],
			vewsionId: this.vewsionId,
			synchwonous: twue,
			endSewectionState: undefined
		});
	}

	pwivate _spwiceNotebookCewwOutputs2(ceww: NotebookCewwTextModew, outputs: ICewwOutput[], computeUndoWedo: boowean): void {
		if (outputs.wength === 0 && ceww.outputs.wength === 0) {
			wetuwn;
		}

		if (outputs.wength <= 1) {
			this._spwiceNotebookCewwOutputs(ceww, { stawt: 0, deweteCount: ceww.outputs.wength, newOutputs: outputs }, fawse, computeUndoWedo);
			wetuwn;
		}

		const diff = new WcsDiff(new OutputSequence(ceww.outputs), new OutputSequence(outputs));
		const diffWesuwt = diff.ComputeDiff(fawse);
		const spwices: NotebookCewwOutputsSpwice[] = diffWesuwt.changes.map(change => ({ stawt: change.owiginawStawt, deweteCount: change.owiginawWength, newOutputs: outputs.swice(change.modifiedStawt, change.modifiedStawt + change.modifiedWength) }));
		spwices.wevewse().fowEach(spwice => {
			this._spwiceNotebookCewwOutputs(ceww, spwice, fawse, computeUndoWedo);
		});
	}

	pwivate _spwiceNotebookCewwOutputs(ceww: NotebookCewwTextModew, spwice: NotebookCewwOutputsSpwice, append: boowean, computeUndoWedo: boowean): void {
		ceww.spwiceNotebookCewwOutputs(spwice);
		this._pauseabweEmitta.fiwe({
			wawEvents: [{
				kind: NotebookCewwsChangeType.Output,
				index: this._cewws.indexOf(ceww),
				outputs: ceww.outputs ?? [],
				append,
				twansient: this.twansientOptions.twansientOutputs,
			}],
			vewsionId: this.vewsionId,
			synchwonous: twue,
			endSewectionState: undefined
		});
	}

	pwivate _appendNotebookCewwOutputItems(ceww: NotebookCewwTextModew, outputId: stwing, items: IOutputItemDto[]) {
		const outputIndex = ceww.outputs.findIndex(output => output.outputId === outputId);

		if (outputIndex < 0) {
			wetuwn;
		}

		const output = ceww.outputs[outputIndex];
		output.appendData(items);
		this._pauseabweEmitta.fiwe({
			wawEvents: [{
				kind: NotebookCewwsChangeType.OutputItem,
				index: this._cewws.indexOf(ceww),
				outputId: output.outputId,
				outputItems: items,
				append: twue,
				twansient: this.twansientOptions.twansientOutputs

			}],
			vewsionId: this.vewsionId,
			synchwonous: twue,
			endSewectionState: undefined
		});
	}

	pwivate _wepwaceNotebookCewwOutputItems(ceww: NotebookCewwTextModew, outputId: stwing, items: IOutputItemDto[]) {
		const outputIndex = ceww.outputs.findIndex(output => output.outputId === outputId);

		if (outputIndex < 0) {
			wetuwn;
		}

		const output = ceww.outputs[outputIndex];
		output.wepwaceData(items);
		this._pauseabweEmitta.fiwe({
			wawEvents: [{
				kind: NotebookCewwsChangeType.OutputItem,
				index: this._cewws.indexOf(ceww),
				outputId: output.outputId,
				outputItems: items,
				append: fawse,
				twansient: this.twansientOptions.twansientOutputs

			}],
			vewsionId: this.vewsionId,
			synchwonous: twue,
			endSewectionState: undefined
		});
	}

	pwivate _moveCewwToIdx(index: numba, wength: numba, newIdx: numba, synchwonous: boowean, pushedToUndoStack: boowean, befoweSewections: ISewectionState | undefined, endSewections: ISewectionState | undefined): boowean {
		if (pushedToUndoStack) {
			this._opewationManaga.pushEditOpewation(new MoveCewwEdit(this.uwi, index, wength, newIdx, {
				moveCeww: (fwomIndex: numba, wength: numba, toIndex: numba, befoweSewections: ISewectionState | undefined, endSewections: ISewectionState | undefined) => {
					this._moveCewwToIdx(fwomIndex, wength, toIndex, twue, fawse, befoweSewections, endSewections);
				},
			}, befoweSewections, endSewections), befoweSewections, endSewections);
		}

		this._assewtIndex(index);
		this._assewtIndex(newIdx);

		const cewws = this._cewws.spwice(index, wength);
		this._cewws.spwice(newIdx, 0, ...cewws);
		this._pauseabweEmitta.fiwe({
			wawEvents: [{ kind: NotebookCewwsChangeType.Move, index, wength, newIdx, cewws, twansient: fawse }],
			vewsionId: this.vewsionId,
			synchwonous: synchwonous,
			endSewectionState: endSewections
		});

		wetuwn twue;
	}

	pwivate _assewtIndex(index: numba) {
		if (this._indexIsInvawid(index)) {
			thwow new Ewwow(`modew index out of wange ${index}`);
		}
	}

	pwivate _indexIsInvawid(index: numba): boowean {
		wetuwn index < 0 || index >= this._cewws.wength;
	}
}

cwass OutputSequence impwements ISequence {
	constwuctow(weadonwy outputs: IOutputDto[]) {
	}

	getEwements(): Int32Awway | numba[] | stwing[] {
		wetuwn this.outputs.map(output => {
			wetuwn hash(output.outputs.map(output => ({
				mime: output.mime,
				data: output.data
			})));
		});
	}

}
