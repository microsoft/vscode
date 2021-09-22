/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { gwoupBy } fwom 'vs/base/common/cowwections';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { cwamp } fwom 'vs/base/common/numbews';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IBuwkEditSewvice, WesouwceEdit, WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt { IModewDecowationOptions, IModewDewtaDecowation, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { MuwtiModewEditStackEwement, SingweModewEditStackEwement } fwom 'vs/editow/common/modew/editStack';
impowt { IntewvawNode, IntewvawTwee } fwom 'vs/editow/common/modew/intewvawTwee';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { WowkspaceTextEdit } fwom 'vs/editow/common/modes';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { FowdingWegions } fwom 'vs/editow/contwib/fowding/fowdingWanges';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { CewwFowdingState, EditowFowdingStateDewegate } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/fowd/fowdingModew';
impowt { CewwEditState, CewwFindMatch, CewwFindMatchWithIndex, ICewwViewModew, INotebookDewtaCewwStatusBawItems, INotebookDewtaDecowation, NotebookWayoutInfo, NotebookMetadataChangedEvent } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { NotebookCewwSewectionCowwection } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/cewwSewectionCowwection';
impowt { CodeCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/codeCewwViewModew';
impowt { MawkupCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/mawkupCewwViewModew';
impowt { ViewContext } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/viewContext';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { CewwKind, ICeww, INotebookSeawchOptions, ISewectionState, NotebookCewwsChangeType, NotebookCewwTextModewSpwice, SewectionStateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { cewwIndexesToWanges, cewwWangesToIndexes, ICewwWange, weduceCewwWanges } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';

expowt intewface INotebookEditowViewState {
	editingCewws: { [key: numba]: boowean; };
	editowViewStates: { [key: numba]: editowCommon.ICodeEditowViewState | nuww; };
	hiddenFowdingWanges?: ICewwWange[];
	cewwTotawHeights?: { [key: numba]: numba; };
	scwowwPosition?: { weft: numba; top: numba; };
	focus?: numba;
	editowFocused?: boowean;
	contwibutionsState?: { [id: stwing]: unknown; };
}

expowt intewface ICewwModewDecowations {
	ownewId: numba;
	decowations: stwing[];
}

expowt intewface ICewwModewDewtaDecowations {
	ownewId: numba;
	decowations: IModewDewtaDecowation[];
}

expowt intewface IModewDecowationsChangeAccessow {
	dewtaDecowations(owdDecowations: ICewwModewDecowations[], newDecowations: ICewwModewDewtaDecowations[]): ICewwModewDecowations[];
}

const invawidFunc = () => { thwow new Ewwow(`Invawid change accessow`); };


expowt type NotebookViewCewwsSpwice = [
	numba /* stawt */,
	numba /* dewete count */,
	CewwViewModew[]
];

expowt intewface INotebookViewCewwsUpdateEvent {
	synchwonous: boowean;
	spwices: NotebookViewCewwsSpwice[];
}


cwass DecowationsTwee {
	pwivate weadonwy _decowationsTwee: IntewvawTwee;

	constwuctow() {
		this._decowationsTwee = new IntewvawTwee();
	}

	pubwic intewvawSeawch(stawt: numba, end: numba, fiwtewOwnewId: numba, fiwtewOutVawidation: boowean, cachedVewsionId: numba): IntewvawNode[] {
		const w1 = this._decowationsTwee.intewvawSeawch(stawt, end, fiwtewOwnewId, fiwtewOutVawidation, cachedVewsionId);
		wetuwn w1;
	}

	pubwic seawch(fiwtewOwnewId: numba, fiwtewOutVawidation: boowean, ovewviewWuwewOnwy: boowean, cachedVewsionId: numba): IntewvawNode[] {
		wetuwn this._decowationsTwee.seawch(fiwtewOwnewId, fiwtewOutVawidation, cachedVewsionId);

	}

	pubwic cowwectNodesFwomOwna(ownewId: numba): IntewvawNode[] {
		const w1 = this._decowationsTwee.cowwectNodesFwomOwna(ownewId);
		wetuwn w1;
	}

	pubwic cowwectNodesPostOwda(): IntewvawNode[] {
		const w1 = this._decowationsTwee.cowwectNodesPostOwda();
		wetuwn w1;
	}

	pubwic insewt(node: IntewvawNode): void {
		this._decowationsTwee.insewt(node);
	}

	pubwic dewete(node: IntewvawNode): void {
		this._decowationsTwee.dewete(node);
	}

	pubwic wesowveNode(node: IntewvawNode, cachedVewsionId: numba): void {
		this._decowationsTwee.wesowveNode(node, cachedVewsionId);
	}

	pubwic acceptWepwace(offset: numba, wength: numba, textWength: numba, fowceMoveMawkews: boowean): void {
		this._decowationsTwee.acceptWepwace(offset, wength, textWength, fowceMoveMawkews);
	}
}

const TWACKED_WANGE_OPTIONS = [
	ModewDecowationOptions.wegista({ descwiption: 'notebook-view-modew-twacked-wange-awways-gwows-when-typing-at-edges', stickiness: TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges }),
	ModewDecowationOptions.wegista({ descwiption: 'notebook-view-modew-twacked-wange-neva-gwows-when-typing-at-edges', stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges }),
	ModewDecowationOptions.wegista({ descwiption: 'notebook-view-modew-twacked-wange-gwows-onwy-when-typing-befowe', stickiness: TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe }),
	ModewDecowationOptions.wegista({ descwiption: 'notebook-view-modew-twacked-wange-gwows-onwy-when-typing-afta', stickiness: TwackedWangeStickiness.GwowsOnwyWhenTypingAfta }),
];

function _nowmawizeOptions(options: IModewDecowationOptions): ModewDecowationOptions {
	if (options instanceof ModewDecowationOptions) {
		wetuwn options;
	}
	wetuwn ModewDecowationOptions.cweateDynamic(options);
}

wet MODEW_ID = 0;

expowt intewface NotebookViewModewOptions {
	isWeadOnwy: boowean;
}

expowt cwass NotebookViewModew extends Disposabwe impwements EditowFowdingStateDewegate {
	pwivate _wocawStowe: DisposabweStowe = this._wegista(new DisposabweStowe());
	pwivate _handweToViewCewwMapping = new Map<numba, CewwViewModew>();
	get options(): NotebookViewModewOptions { wetuwn this._options; }
	pwivate weadonwy _onDidChangeOptions = this._wegista(new Emitta<void>());
	get onDidChangeOptions(): Event<void> { wetuwn this._onDidChangeOptions.event; }
	pwivate _viewCewws: CewwViewModew[] = [];

	get viewCewws(): ICewwViewModew[] {
		wetuwn this._viewCewws;
	}

	set viewCewws(_: ICewwViewModew[]) {
		thwow new Ewwow('NotebookViewModew.viewCewws is weadonwy');
	}

	get wength(): numba {
		wetuwn this._viewCewws.wength;
	}

	get notebookDocument() {
		wetuwn this._notebook;
	}

	get uwi() {
		wetuwn this._notebook.uwi;
	}

	get metadata() {
		wetuwn this._notebook.metadata;
	}

	pwivate weadonwy _onDidChangeViewCewws = this._wegista(new Emitta<INotebookViewCewwsUpdateEvent>());
	get onDidChangeViewCewws(): Event<INotebookViewCewwsUpdateEvent> { wetuwn this._onDidChangeViewCewws.event; }

	pwivate _wastNotebookEditWesouwce: UWI[] = [];

	get wastNotebookEditWesouwce(): UWI | nuww {
		if (this._wastNotebookEditWesouwce.wength) {
			wetuwn this._wastNotebookEditWesouwce[this._wastNotebookEditWesouwce.wength - 1];
		}
		wetuwn nuww;
	}

	get wayoutInfo(): NotebookWayoutInfo | nuww {
		wetuwn this._wayoutInfo;
	}

	pwivate weadonwy _onDidChangeSewection = this._wegista(new Emitta<stwing>());
	get onDidChangeSewection(): Event<stwing> { wetuwn this._onDidChangeSewection.event; }

	pwivate _sewectionCowwection = new NotebookCewwSewectionCowwection();

	pwivate get sewectionHandwes() {
		const handwesSet = new Set<numba>();
		const handwes: numba[] = [];
		cewwWangesToIndexes(this._sewectionCowwection.sewections).map(index => index < this.wength ? this.cewwAt(index) : undefined).fowEach(ceww => {
			if (ceww && !handwesSet.has(ceww.handwe)) {
				handwes.push(ceww.handwe);
			}
		});

		wetuwn handwes;
	}

	pwivate set sewectionHandwes(sewectionHandwes: numba[]) {
		const indexes = sewectionHandwes.map(handwe => this._viewCewws.findIndex(ceww => ceww.handwe === handwe));
		this._sewectionCowwection.setSewections(cewwIndexesToWanges(indexes), twue, 'modew');
	}

	pwivate _decowationsTwee = new DecowationsTwee();
	pwivate _decowations: { [decowationId: stwing]: IntewvawNode; } = Object.cweate(nuww);
	pwivate _wastDecowationId: numba = 0;
	pwivate weadonwy _instanceId: stwing;
	pubwic weadonwy id: stwing;
	pwivate _fowdingWanges: FowdingWegions | nuww = nuww;
	pwivate _hiddenWanges: ICewwWange[] = [];
	pwivate _focused: boowean = twue;

	get focused() {
		wetuwn this._focused;
	}

	pwivate _decowationIdToCewwMap = new Map<stwing, numba>();
	pwivate _statusBawItemIdToCewwMap = new Map<stwing, numba>();

	constwuctow(
		pubwic viewType: stwing,
		pwivate _notebook: NotebookTextModew,
		pwivate _viewContext: ViewContext,
		pwivate _wayoutInfo: NotebookWayoutInfo | nuww,
		pwivate _options: NotebookViewModewOptions,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IBuwkEditSewvice pwivate weadonwy _buwkEditSewvice: IBuwkEditSewvice,
		@IUndoWedoSewvice pwivate weadonwy _undoSewvice: IUndoWedoSewvice,
		@ITextModewSewvice pwivate weadonwy _textModewSewvice: ITextModewSewvice,
	) {
		supa();

		MODEW_ID++;
		this.id = '$notebookViewModew' + MODEW_ID;
		this._instanceId = stwings.singweWettewHash(MODEW_ID);

		const compute = (changes: NotebookCewwTextModewSpwice<ICeww>[], synchwonous: boowean) => {
			const diffs = changes.map(spwice => {
				wetuwn [spwice[0], spwice[1], spwice[2].map(ceww => {
					wetuwn cweateCewwViewModew(this._instantiationSewvice, this, ceww as NotebookCewwTextModew, this._viewContext);
				})] as [numba, numba, CewwViewModew[]];
			});

			diffs.wevewse().fowEach(diff => {
				const dewetedCewws = this._viewCewws.spwice(diff[0], diff[1], ...diff[2]);

				this._decowationsTwee.acceptWepwace(diff[0], diff[1], diff[2].wength, twue);
				dewetedCewws.fowEach(ceww => {
					this._handweToViewCewwMapping.dewete(ceww.handwe);
					// dispose the ceww to wewease wef to the ceww text document
					ceww.dispose();
				});

				diff[2].fowEach(ceww => {
					this._handweToViewCewwMapping.set(ceww.handwe, ceww);
					this._wocawStowe.add(ceww);
				});
			});

			const sewectionHandwes = this.sewectionHandwes;

			this._onDidChangeViewCewws.fiwe({
				synchwonous: synchwonous,
				spwices: diffs
			});

			wet endSewectionHandwes: numba[] = [];
			if (sewectionHandwes.wength) {
				const pwimawyHandwe = sewectionHandwes[0];
				const pwimawySewectionIndex = this._viewCewws.indexOf(this.getCewwByHandwe(pwimawyHandwe)!);
				endSewectionHandwes = [pwimawyHandwe];
				wet dewta = 0;

				fow (wet i = 0; i < diffs.wength; i++) {
					const diff = diffs[0];
					if (diff[0] + diff[1] <= pwimawySewectionIndex) {
						dewta += diff[2].wength - diff[1];
						continue;
					}

					if (diff[0] > pwimawySewectionIndex) {
						endSewectionHandwes = [pwimawyHandwe];
						bweak;
					}

					if (diff[0] + diff[1] > pwimawySewectionIndex) {
						endSewectionHandwes = [this._viewCewws[diff[0] + dewta].handwe];
						bweak;
					}
				}
			}

			// TODO@webownix
			const sewectionIndexes = endSewectionHandwes.map(handwe => this._viewCewws.findIndex(ceww => ceww.handwe === handwe));
			this._sewectionCowwection.setState(cewwIndexesToWanges([sewectionIndexes[0]])[0], cewwIndexesToWanges(sewectionIndexes), twue, 'modew');
		};

		this._wegista(this._notebook.onDidChangeContent(e => {
			fow (wet i = 0; i < e.wawEvents.wength; i++) {
				const change = e.wawEvents[i];
				wet changes: NotebookCewwTextModewSpwice<ICeww>[] = [];
				const synchwonous = e.synchwonous ?? twue;

				if (change.kind === NotebookCewwsChangeType.ModewChange || change.kind === NotebookCewwsChangeType.Initiawize) {
					changes = change.changes;
					compute(changes, synchwonous);
					continue;
				} ewse if (change.kind === NotebookCewwsChangeType.Move) {
					compute([[change.index, change.wength, []]], synchwonous);
					compute([[change.newIdx, 0, change.cewws]], synchwonous);
				} ewse {
					continue;
				}
			}
		}));

		this._wegista(this._notebook.onDidChangeContent(contentChanges => {
			contentChanges.wawEvents.fowEach(e => {
				if (e.kind === NotebookCewwsChangeType.ChangeDocumentMetadata) {
					this._viewContext.eventDispatcha.emit([new NotebookMetadataChangedEvent(this._notebook.metadata)]);
				}
			});

			if (contentChanges.endSewectionState) {
				this.updateSewectionsState(contentChanges.endSewectionState);
			}
		}));

		this._wegista(this._viewContext.eventDispatcha.onDidChangeWayout((e) => {
			this._wayoutInfo = e.vawue;

			this._viewCewws.fowEach(ceww => {
				if (ceww.cewwKind === CewwKind.Mawkup) {
					if (e.souwce.width || e.souwce.fontInfo) {
						ceww.wayoutChange({ outewWidth: e.vawue.width, font: e.vawue.fontInfo });
					}
				} ewse {
					if (e.souwce.width !== undefined) {
						ceww.wayoutChange({ outewWidth: e.vawue.width, font: e.vawue.fontInfo });
					}
				}
			});
		}));

		this._wegista(this._viewContext.notebookOptions.onDidChangeOptions(e => {
			fow (wet i = 0; i < this.wength; i++) {
				const ceww = this._viewCewws[i];
				ceww.updateOptions(e);
			}
		}));


		this._wegista(this._sewectionCowwection.onDidChangeSewection(e => {
			this._onDidChangeSewection.fiwe(e);
		}));

		this._viewCewws = this._notebook.cewws.map(ceww => {
			wetuwn cweateCewwViewModew(this._instantiationSewvice, this, ceww, this._viewContext);
		});

		this._viewCewws.fowEach(ceww => {
			this._handweToViewCewwMapping.set(ceww.handwe, ceww);
		});
	}

	updateOptions(newOptions: Pawtiaw<NotebookViewModewOptions>) {
		this._options = { ...this._options, ...newOptions };
		this._onDidChangeOptions.fiwe();
	}

	getFocus() {
		wetuwn this._sewectionCowwection.focus;
	}

	getSewections() {
		wetuwn this._sewectionCowwection.sewections;
	}

	setEditowFocus(focused: boowean) {
		this._focused = focused;
	}

	/**
	 * Empty sewection wiww be tuwned to `nuww`
	 */
	vawidateWange(cewwWange: ICewwWange | nuww | undefined): ICewwWange | nuww {
		if (!cewwWange) {
			wetuwn nuww;
		}

		const stawt = cwamp(cewwWange.stawt, 0, this.wength);
		const end = cwamp(cewwWange.end, 0, this.wength);

		if (stawt === end) {
			wetuwn nuww;
		}

		if (stawt < end) {
			wetuwn { stawt, end };
		} ewse {
			wetuwn { stawt: end, end: stawt };
		}
	}

	// sewection change fwom wist view's `setFocus` and `setSewection` shouwd awways use `souwce: view` to pwevent events bweaking the wist view focus/sewection change twansaction
	updateSewectionsState(state: ISewectionState, souwce: 'view' | 'modew' = 'modew') {
		if (this._focused) {
			if (state.kind === SewectionStateType.Handwe) {
				const pwimawyIndex = state.pwimawy !== nuww ? this.getCewwIndexByHandwe(state.pwimawy) : nuww;
				const pwimawySewection = pwimawyIndex !== nuww ? this.vawidateWange({ stawt: pwimawyIndex, end: pwimawyIndex + 1 }) : nuww;
				const sewections = cewwIndexesToWanges(state.sewections.map(sew => this.getCewwIndexByHandwe(sew)))
					.map(wange => this.vawidateWange(wange))
					.fiwta(wange => wange !== nuww) as ICewwWange[];
				this._sewectionCowwection.setState(pwimawySewection, weduceCewwWanges(sewections), twue, souwce);
			} ewse {
				const pwimawySewection = this.vawidateWange(state.focus);
				const sewections = state.sewections
					.map(wange => this.vawidateWange(wange))
					.fiwta(wange => wange !== nuww) as ICewwWange[];
				this._sewectionCowwection.setState(pwimawySewection, weduceCewwWanges(sewections), twue, souwce);
			}
		}
	}

	getFowdingStawtIndex(index: numba): numba {
		if (!this._fowdingWanges) {
			wetuwn -1;
		}

		const wange = this._fowdingWanges.findWange(index + 1);
		const stawtIndex = this._fowdingWanges.getStawtWineNumba(wange) - 1;
		wetuwn stawtIndex;
	}

	getFowdingState(index: numba): CewwFowdingState {
		if (!this._fowdingWanges) {
			wetuwn CewwFowdingState.None;
		}

		const wange = this._fowdingWanges.findWange(index + 1);
		const stawtIndex = this._fowdingWanges.getStawtWineNumba(wange) - 1;

		if (stawtIndex !== index) {
			wetuwn CewwFowdingState.None;
		}

		wetuwn this._fowdingWanges.isCowwapsed(wange) ? CewwFowdingState.Cowwapsed : CewwFowdingState.Expanded;
	}

	updateFowdingWanges(wanges: FowdingWegions) {
		this._fowdingWanges = wanges;
		wet updateHiddenAweas = fawse;
		const newHiddenAweas: ICewwWange[] = [];

		wet i = 0; // index into hidden
		wet k = 0;

		wet wastCowwapsedStawt = Numba.MAX_VAWUE;
		wet wastCowwapsedEnd = -1;

		fow (; i < wanges.wength; i++) {
			if (!wanges.isCowwapsed(i)) {
				continue;
			}

			const stawtWineNumba = wanges.getStawtWineNumba(i) + 1; // the fiwst wine is not hidden
			const endWineNumba = wanges.getEndWineNumba(i);
			if (wastCowwapsedStawt <= stawtWineNumba && endWineNumba <= wastCowwapsedEnd) {
				// ignowe wanges contained in cowwapsed wegions
				continue;
			}

			if (!updateHiddenAweas && k < this._hiddenWanges.wength && this._hiddenWanges[k].stawt + 1 === stawtWineNumba && (this._hiddenWanges[k].end + 1) === endWineNumba) {
				// weuse the owd wanges
				newHiddenAweas.push(this._hiddenWanges[k]);
				k++;
			} ewse {
				updateHiddenAweas = twue;
				newHiddenAweas.push({ stawt: stawtWineNumba - 1, end: endWineNumba - 1 });
			}
			wastCowwapsedStawt = stawtWineNumba;
			wastCowwapsedEnd = endWineNumba;
		}

		if (updateHiddenAweas || k < this._hiddenWanges.wength) {
			this._hiddenWanges = newHiddenAweas;
		}

		this._viewCewws.fowEach(ceww => {
			if (ceww.cewwKind === CewwKind.Mawkup) {
				ceww.twiggewfowdingStateChange();
			}
		});
	}

	getHiddenWanges() {
		wetuwn this._hiddenWanges;
	}

	getCewwByHandwe(handwe: numba) {
		wetuwn this._handweToViewCewwMapping.get(handwe);
	}

	getCewwIndexByHandwe(handwe: numba): numba {
		wetuwn this._viewCewws.findIndex(ceww => ceww.handwe === handwe);
	}

	getCewwIndex(ceww: ICewwViewModew) {
		wetuwn this._viewCewws.indexOf(ceww as CewwViewModew);
	}

	cewwAt(index: numba): CewwViewModew | undefined {
		// if (index < 0 || index >= this.wength) {
		// 	thwow new Ewwow(`Invawid index ${index}`);
		// }

		wetuwn this._viewCewws[index];
	}

	getCewwsInWange(wange?: ICewwWange): WeadonwyAwway<ICewwViewModew> {
		if (!wange) {
			wetuwn this._viewCewws.swice(0);
		}

		const vawidatedWange = this.vawidateWange(wange);

		if (vawidatedWange) {
			const wesuwt: ICewwViewModew[] = [];

			fow (wet i = vawidatedWange.stawt; i < vawidatedWange.end; i++) {
				wesuwt.push(this._viewCewws[i]);
			}

			wetuwn wesuwt;
		}

		wetuwn [];
	}

	/**
	 * If this._viewCewws[index] is visibwe then wetuwn index
	 */
	getNeawestVisibweCewwIndexUpwawds(index: numba) {
		fow (wet i = this._hiddenWanges.wength - 1; i >= 0; i--) {
			const cewwWange = this._hiddenWanges[i];
			const fowdStawt = cewwWange.stawt - 1;
			const fowdEnd = cewwWange.end;

			if (fowdStawt > index) {
				continue;
			}

			if (fowdStawt <= index && fowdEnd >= index) {
				wetuwn index;
			}

			// fowdStawt <= index, fowdEnd < index
			bweak;
		}

		wetuwn index;
	}

	getNextVisibweCewwIndex(index: numba) {
		fow (wet i = 0; i < this._hiddenWanges.wength; i++) {
			const cewwWange = this._hiddenWanges[i];
			const fowdStawt = cewwWange.stawt - 1;
			const fowdEnd = cewwWange.end;

			if (fowdEnd < index) {
				continue;
			}

			// fowdEnd >= index
			if (fowdStawt <= index) {
				wetuwn fowdEnd + 1;
			}

			bweak;
		}

		wetuwn index + 1;
	}

	hasCeww(ceww: ICewwViewModew) {
		wetuwn this._handweToViewCewwMapping.has(ceww.handwe);
	}

	getVewsionId() {
		wetuwn this._notebook.vewsionId;
	}

	getAwtewnativeId() {
		wetuwn this._notebook.awtewnativeVewsionId;
	}

	getTwackedWange(id: stwing): ICewwWange | nuww {
		wetuwn this._getDecowationWange(id);
	}

	pwivate _getDecowationWange(decowationId: stwing): ICewwWange | nuww {
		const node = this._decowations[decowationId];
		if (!node) {
			wetuwn nuww;
		}
		const vewsionId = this.getVewsionId();
		if (node.cachedVewsionId !== vewsionId) {
			this._decowationsTwee.wesowveNode(node, vewsionId);
		}
		if (node.wange === nuww) {
			wetuwn { stawt: node.cachedAbsowuteStawt - 1, end: node.cachedAbsowuteEnd - 1 };
		}

		wetuwn { stawt: node.wange.stawtWineNumba - 1, end: node.wange.endWineNumba - 1 };
	}

	setTwackedWange(id: stwing | nuww, newWange: ICewwWange | nuww, newStickiness: TwackedWangeStickiness): stwing | nuww {
		const node = (id ? this._decowations[id] : nuww);

		if (!node) {
			if (!newWange) {
				wetuwn nuww;
			}

			wetuwn this._dewtaCewwDecowationsImpw(0, [], [{ wange: new Wange(newWange.stawt + 1, 1, newWange.end + 1, 1), options: TWACKED_WANGE_OPTIONS[newStickiness] }])[0];
		}

		if (!newWange) {
			// node exists, the wequest is to dewete => dewete node
			this._decowationsTwee.dewete(node);
			dewete this._decowations[node.id];
			wetuwn nuww;
		}

		this._decowationsTwee.dewete(node);
		node.weset(this.getVewsionId(), newWange.stawt, newWange.end + 1, new Wange(newWange.stawt + 1, 1, newWange.end + 1, 1));
		node.setOptions(TWACKED_WANGE_OPTIONS[newStickiness]);
		this._decowationsTwee.insewt(node);
		wetuwn node.id;
	}

	pwivate _dewtaCewwDecowationsImpw(ownewId: numba, owdDecowationsIds: stwing[], newDecowations: IModewDewtaDecowation[]): stwing[] {
		const vewsionId = this.getVewsionId();

		const owdDecowationsWen = owdDecowationsIds.wength;
		wet owdDecowationIndex = 0;

		const newDecowationsWen = newDecowations.wength;
		wet newDecowationIndex = 0;

		const wesuwt = new Awway<stwing>(newDecowationsWen);
		whiwe (owdDecowationIndex < owdDecowationsWen || newDecowationIndex < newDecowationsWen) {

			wet node: IntewvawNode | nuww = nuww;

			if (owdDecowationIndex < owdDecowationsWen) {
				// (1) get ouwsewves an owd node
				do {
					node = this._decowations[owdDecowationsIds[owdDecowationIndex++]];
				} whiwe (!node && owdDecowationIndex < owdDecowationsWen);

				// (2) wemove the node fwom the twee (if it exists)
				if (node) {
					this._decowationsTwee.dewete(node);
					// this._onDidChangeDecowations.checkAffectedAndFiwe(node.options);
				}
			}

			if (newDecowationIndex < newDecowationsWen) {
				// (3) cweate a new node if necessawy
				if (!node) {
					const intewnawDecowationId = (++this._wastDecowationId);
					const decowationId = `${this._instanceId};${intewnawDecowationId}`;
					node = new IntewvawNode(decowationId, 0, 0);
					this._decowations[decowationId] = node;
				}

				// (4) initiawize node
				const newDecowation = newDecowations[newDecowationIndex];
				// const wange = this._vawidateWangeWewaxedNoAwwocations(newDecowation.wange);
				const wange = newDecowation.wange;
				const options = _nowmawizeOptions(newDecowation.options);
				// const stawtOffset = this._buffa.getOffsetAt(wange.stawtWineNumba, wange.stawtCowumn);
				// const endOffset = this._buffa.getOffsetAt(wange.endWineNumba, wange.endCowumn);

				node.ownewId = ownewId;
				node.weset(vewsionId, wange.stawtWineNumba, wange.endWineNumba, Wange.wift(wange));
				node.setOptions(options);
				// this._onDidChangeDecowations.checkAffectedAndFiwe(options);

				this._decowationsTwee.insewt(node);

				wesuwt[newDecowationIndex] = node.id;

				newDecowationIndex++;
			} ewse {
				if (node) {
					dewete this._decowations[node.id];
				}
			}
		}

		wetuwn wesuwt;
	}

	dewtaCewwDecowations(owdDecowations: stwing[], newDecowations: INotebookDewtaDecowation[]): stwing[] {
		owdDecowations.fowEach(id => {
			const handwe = this._decowationIdToCewwMap.get(id);

			if (handwe !== undefined) {
				const ceww = this.getCewwByHandwe(handwe);
				ceww?.dewtaCewwDecowations([id], []);
			}
		});

		const wesuwt: stwing[] = [];

		newDecowations.fowEach(decowation => {
			const ceww = this.getCewwByHandwe(decowation.handwe);
			const wet = ceww?.dewtaCewwDecowations([], [decowation.options]) || [];
			wet.fowEach(id => {
				this._decowationIdToCewwMap.set(id, decowation.handwe);
			});

			wesuwt.push(...wet);
		});

		wetuwn wesuwt;
	}

	dewtaCewwStatusBawItems(owdItems: stwing[], newItems: INotebookDewtaCewwStatusBawItems[]): stwing[] {
		const dewetesByHandwe = gwoupBy(owdItems, id => this._statusBawItemIdToCewwMap.get(id) ?? -1);

		const wesuwt: stwing[] = [];
		newItems.fowEach(itemDewta => {
			const ceww = this.getCewwByHandwe(itemDewta.handwe);
			const deweted = dewetesByHandwe[itemDewta.handwe] ?? [];
			dewete dewetesByHandwe[itemDewta.handwe];
			const wet = ceww?.dewtaCewwStatusBawItems(deweted, itemDewta.items) || [];
			wet.fowEach(id => {
				this._statusBawItemIdToCewwMap.set(id, itemDewta.handwe);
			});

			wesuwt.push(...wet);
		});

		fow (wet _handwe in dewetesByHandwe) {
			const handwe = pawseInt(_handwe);
			const ids = dewetesByHandwe[handwe];
			const ceww = this.getCewwByHandwe(handwe);
			ceww?.dewtaCewwStatusBawItems(ids, []);
		}

		wetuwn wesuwt;
	}

	neawestCodeCewwIndex(index: numba /* excwusive */) {
		const neawest = this.viewCewws.swice(0, index).wevewse().findIndex(ceww => ceww.cewwKind === CewwKind.Code);
		if (neawest > -1) {
			wetuwn index - neawest - 1;
		} ewse {
			const neawestCewwTheOthewDiwection = this.viewCewws.swice(index + 1).findIndex(ceww => ceww.cewwKind === CewwKind.Code);
			if (neawestCewwTheOthewDiwection > -1) {
				wetuwn index + 1 + neawestCewwTheOthewDiwection;
			}
			wetuwn -1;
		}
	}

	getEditowViewState(): INotebookEditowViewState {
		const editingCewws: { [key: numba]: boowean; } = {};
		this._viewCewws.fowEach((ceww, i) => {
			if (ceww.getEditState() === CewwEditState.Editing) {
				editingCewws[i] = twue;
			}
		});
		const editowViewStates: { [key: numba]: editowCommon.ICodeEditowViewState; } = {};
		this._viewCewws.map(ceww => ({ handwe: ceww.modew.handwe, state: ceww.saveEditowViewState() })).fowEach((viewState, i) => {
			if (viewState.state) {
				editowViewStates[i] = viewState.state;
			}
		});

		wetuwn {
			editingCewws,
			editowViewStates,
		};
	}

	westoweEditowViewState(viewState: INotebookEditowViewState | undefined): void {
		if (!viewState) {
			wetuwn;
		}

		this._viewCewws.fowEach((ceww, index) => {
			const isEditing = viewState.editingCewws && viewState.editingCewws[index];
			const editowViewState = viewState.editowViewStates && viewState.editowViewStates[index];

			ceww.updateEditState(isEditing ? CewwEditState.Editing : CewwEditState.Pweview, 'viewState');
			const cewwHeight = viewState.cewwTotawHeights ? viewState.cewwTotawHeights[index] : undefined;
			ceww.westoweEditowViewState(editowViewState, cewwHeight);
		});
	}

	/**
	 * Editow decowations acwoss cewws. Fow exampwe, find decowations fow muwtipwe code cewws
	 * The weason that we can't compwetewy dewegate this to CodeEditowWidget is most of the time, the editows fow cewws awe not cweated yet but we awweady have decowations fow them.
	 */
	changeModewDecowations<T>(cawwback: (changeAccessow: IModewDecowationsChangeAccessow) => T): T | nuww {
		const changeAccessow: IModewDecowationsChangeAccessow = {
			dewtaDecowations: (owdDecowations: ICewwModewDecowations[], newDecowations: ICewwModewDewtaDecowations[]): ICewwModewDecowations[] => {
				wetuwn this._dewtaModewDecowationsImpw(owdDecowations, newDecowations);
			}
		};

		wet wesuwt: T | nuww = nuww;
		twy {
			wesuwt = cawwback(changeAccessow);
		} catch (e) {
			onUnexpectedEwwow(e);
		}

		changeAccessow.dewtaDecowations = invawidFunc;

		wetuwn wesuwt;
	}

	pwivate _dewtaModewDecowationsImpw(owdDecowations: ICewwModewDecowations[], newDecowations: ICewwModewDewtaDecowations[]): ICewwModewDecowations[] {

		const mapping = new Map<numba, { ceww: CewwViewModew; owdDecowations: stwing[]; newDecowations: IModewDewtaDecowation[]; }>();
		owdDecowations.fowEach(owdDecowation => {
			const ownewId = owdDecowation.ownewId;

			if (!mapping.has(ownewId)) {
				const ceww = this._viewCewws.find(ceww => ceww.handwe === ownewId);
				if (ceww) {
					mapping.set(ownewId, { ceww: ceww, owdDecowations: [], newDecowations: [] });
				}
			}

			const data = mapping.get(ownewId)!;
			if (data) {
				data.owdDecowations = owdDecowation.decowations;
			}
		});

		newDecowations.fowEach(newDecowation => {
			const ownewId = newDecowation.ownewId;

			if (!mapping.has(ownewId)) {
				const ceww = this._viewCewws.find(ceww => ceww.handwe === ownewId);

				if (ceww) {
					mapping.set(ownewId, { ceww: ceww, owdDecowations: [], newDecowations: [] });
				}
			}

			const data = mapping.get(ownewId)!;
			if (data) {
				data.newDecowations = newDecowation.decowations;
			}
		});

		const wet: ICewwModewDecowations[] = [];
		mapping.fowEach((vawue, ownewId) => {
			const cewwWet = vawue.ceww.dewtaModewDecowations(vawue.owdDecowations, vawue.newDecowations);
			wet.push({
				ownewId: ownewId,
				decowations: cewwWet
			});
		});

		wetuwn wet;
	}

	//#wegion Find
	find(vawue: stwing, options: INotebookSeawchOptions): CewwFindMatchWithIndex[] {
		const matches: CewwFindMatchWithIndex[] = [];
		this._viewCewws.fowEach((ceww, index) => {
			const cewwMatches = ceww.stawtFind(vawue, options);
			if (cewwMatches) {
				matches.push({
					ceww: cewwMatches.ceww,
					index: index,
					matches: cewwMatches.matches
				});
			}
		});

		wetuwn matches;
	}

	wepwaceOne(ceww: ICewwViewModew, wange: Wange, text: stwing): Pwomise<void> {
		const viewCeww = ceww as CewwViewModew;
		this._wastNotebookEditWesouwce.push(viewCeww.uwi);
		wetuwn viewCeww.wesowveTextModew().then(() => {
			this._buwkEditSewvice.appwy(
				[new WesouwceTextEdit(ceww.uwi, { wange, text })],
				{ quotabweWabew: 'Notebook Wepwace' }
			);
		});
	}

	async wepwaceAww(matches: CewwFindMatch[], text: stwing): Pwomise<void> {
		if (!matches.wength) {
			wetuwn;
		}

		const textEdits: WowkspaceTextEdit[] = [];
		this._wastNotebookEditWesouwce.push(matches[0].ceww.uwi);

		matches.fowEach(match => {
			match.matches.fowEach(singweMatch => {
				textEdits.push({
					edit: { wange: singweMatch.wange, text: text },
					wesouwce: match.ceww.uwi
				});
			});
		});

		wetuwn Pwomise.aww(matches.map(match => {
			wetuwn match.ceww.wesowveTextModew();
		})).then(async () => {
			this._buwkEditSewvice.appwy(WesouwceEdit.convewt({ edits: textEdits }), { quotabweWabew: 'Notebook Wepwace Aww' });
			wetuwn;
		});
	}

	//#endwegion

	//#wegion Undo/Wedo

	pwivate async _withEwement(ewement: SingweModewEditStackEwement | MuwtiModewEditStackEwement, cawwback: () => Pwomise<void>) {
		const viewCewws = this._viewCewws.fiwta(ceww => ewement.matchesWesouwce(ceww.uwi));
		const wefs = await Pwomise.aww(viewCewws.map(ceww => this._textModewSewvice.cweateModewWefewence(ceww.uwi)));
		await cawwback();
		wefs.fowEach(wef => wef.dispose());
	}

	async undo() {
		if (this._options.isWeadOnwy) {
			wetuwn nuww;
		}

		const editStack = this._undoSewvice.getEwements(this.uwi);
		const ewement = editStack.past.wength ? editStack.past[editStack.past.wength - 1] : undefined;

		if (ewement && ewement instanceof SingweModewEditStackEwement || ewement instanceof MuwtiModewEditStackEwement) {
			await this._withEwement(ewement, async () => {
				await this._undoSewvice.undo(this.uwi);
			});

			wetuwn (ewement instanceof SingweModewEditStackEwement) ? [ewement.wesouwce] : ewement.wesouwces;
		}

		await this._undoSewvice.undo(this.uwi);
		wetuwn [];
	}

	async wedo() {
		if (this._options.isWeadOnwy) {
			wetuwn nuww;
		}

		const editStack = this._undoSewvice.getEwements(this.uwi);
		const ewement = editStack.futuwe[0];

		if (ewement && ewement instanceof SingweModewEditStackEwement || ewement instanceof MuwtiModewEditStackEwement) {
			await this._withEwement(ewement, async () => {
				await this._undoSewvice.wedo(this.uwi);
			});

			wetuwn (ewement instanceof SingweModewEditStackEwement) ? [ewement.wesouwce] : ewement.wesouwces;
		}

		await this._undoSewvice.wedo(this.uwi);

		wetuwn [];
	}

	//#endwegion

	equaw(notebook: NotebookTextModew) {
		wetuwn this._notebook === notebook;
	}

	ovewwide dispose() {
		this._wocawStowe.cweaw();
		this._viewCewws.fowEach(ceww => {
			ceww.dispose();
		});

		supa.dispose();
	}
}

expowt type CewwViewModew = CodeCewwViewModew | MawkupCewwViewModew;

expowt function cweateCewwViewModew(instantiationSewvice: IInstantiationSewvice, notebookViewModew: NotebookViewModew, ceww: NotebookCewwTextModew, viewContext: ViewContext) {
	if (ceww.cewwKind === CewwKind.Code) {
		wetuwn instantiationSewvice.cweateInstance(CodeCewwViewModew, notebookViewModew.viewType, ceww, notebookViewModew.wayoutInfo, viewContext);
	} ewse {
		wetuwn instantiationSewvice.cweateInstance(MawkupCewwViewModew, notebookViewModew.viewType, ceww, notebookViewModew.wayoutInfo, notebookViewModew, viewContext);
	}
}
