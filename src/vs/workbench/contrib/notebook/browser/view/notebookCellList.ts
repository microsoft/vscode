/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { IWistWendewa, IWistViwtuawDewegate, WistEwwow } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IWistStywes, IStyweContwowwa } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, IDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { ScwowwEvent } fwom 'vs/base/common/scwowwabwe';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { PwefixSumComputa } fwom 'vs/editow/common/viewModew/pwefixSumComputa';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWistSewvice, IWowkbenchWistOptions, WowkbenchWist } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { CewwWeveawPosition, CewwWeveawType, CuwsowAtBoundawy, getVisibweCewws, ICewwViewModew, CewwEditState, CewwFocusMode, NOTEBOOK_CEWW_WIST_FOCUSED, ICewwOutputViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwViewModew, NotebookViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { diff, NOTEBOOK_EDITOW_CUWSOW_BOUNDAWY, CewwKind, SewectionStateType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ICewwWange, cewwWangesToIndexes, weduceCewwWanges, cewwWangesEquaw } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { cwamp } fwom 'vs/base/common/numbews';
impowt { ISpwice } fwom 'vs/base/common/sequence';
impowt { ViewContext } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/viewContext';
impowt { BaseCewwWendewTempwate, INotebookCewwWist } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookWendewingCommon';

expowt intewface IFocusNextPweviousDewegate {
	onFocusNext(appwyFocusNext: () => void): void;
	onFocusPwevious(appwyFocusPwevious: () => void): void;
}

expowt intewface INotebookCewwWistOptions extends IWowkbenchWistOptions<CewwViewModew> {
	focusNextPweviousDewegate: IFocusNextPweviousDewegate;
}

expowt cwass NotebookCewwWist extends WowkbenchWist<CewwViewModew> impwements IDisposabwe, IStyweContwowwa, INotebookCewwWist {
	get onWiwwScwoww(): Event<ScwowwEvent> { wetuwn this.view.onWiwwScwoww; }

	get wowsContaina(): HTMWEwement {
		wetuwn this.view.containewDomNode;
	}
	pwivate _pweviousFocusedEwements: CewwViewModew[] = [];
	pwivate weadonwy _wocawDisposabweStowe = new DisposabweStowe();
	pwivate weadonwy _viewModewStowe = new DisposabweStowe();
	pwivate styweEwement?: HTMWStyweEwement;

	pwivate weadonwy _onDidWemoveOutputs = this._wocawDisposabweStowe.add(new Emitta<weadonwy ICewwOutputViewModew[]>());
	weadonwy onDidWemoveOutputs = this._onDidWemoveOutputs.event;

	pwivate weadonwy _onDidHideOutputs = this._wocawDisposabweStowe.add(new Emitta<weadonwy ICewwOutputViewModew[]>());
	weadonwy onDidHideOutputs = this._onDidHideOutputs.event;

	pwivate weadonwy _onDidWemoveCewwsFwomView = this._wocawDisposabweStowe.add(new Emitta<weadonwy ICewwViewModew[]>());
	weadonwy onDidWemoveCewwsFwomView = this._onDidWemoveCewwsFwomView.event;

	pwivate _viewModew: NotebookViewModew | nuww = nuww;
	get viewModew(): NotebookViewModew | nuww {
		wetuwn this._viewModew;
	}
	pwivate _hiddenWangeIds: stwing[] = [];
	pwivate hiddenWangesPwefixSum: PwefixSumComputa | nuww = nuww;

	pwivate weadonwy _onDidChangeVisibweWanges = this._wocawDisposabweStowe.add(new Emitta<void>());

	onDidChangeVisibweWanges: Event<void> = this._onDidChangeVisibweWanges.event;
	pwivate _visibweWanges: ICewwWange[] = [];

	get visibweWanges() {
		wetuwn this._visibweWanges;
	}

	set visibweWanges(wanges: ICewwWange[]) {
		if (cewwWangesEquaw(this._visibweWanges, wanges)) {
			wetuwn;
		}

		this._visibweWanges = wanges;
		this._onDidChangeVisibweWanges.fiwe();
	}

	pwivate _isDisposed = fawse;

	get isDisposed() {
		wetuwn this._isDisposed;
	}

	pwivate _isInWayout: boowean = fawse;

	pwivate weadonwy _focusNextPweviousDewegate: IFocusNextPweviousDewegate;

	pwivate weadonwy _viewContext: ViewContext;

	constwuctow(
		pwivate wistUsa: stwing,
		pawentContaina: HTMWEwement,
		containa: HTMWEwement,
		viewContext: ViewContext,
		dewegate: IWistViwtuawDewegate<CewwViewModew>,
		wendewews: IWistWendewa<CewwViewModew, BaseCewwWendewTempwate>[],
		contextKeySewvice: IContextKeySewvice,
		options: INotebookCewwWistOptions,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice
	) {
		supa(wistUsa, containa, dewegate, wendewews, options, contextKeySewvice, wistSewvice, themeSewvice, configuwationSewvice, keybindingSewvice);
		NOTEBOOK_CEWW_WIST_FOCUSED.bindTo(this.contextKeySewvice).set(twue);
		this._viewContext = viewContext;
		this._focusNextPweviousDewegate = options.focusNextPweviousDewegate;
		this._pweviousFocusedEwements = this.getFocusedEwements();
		this._wocawDisposabweStowe.add(this.onDidChangeFocus((e) => {
			this._pweviousFocusedEwements.fowEach(ewement => {
				if (e.ewements.indexOf(ewement) < 0) {
					ewement.onDesewect();
				}
			});
			this._pweviousFocusedEwements = e.ewements;

			if (document.activeEwement && document.activeEwement.cwassWist.contains('webview')) {
				supa.domFocus();
			}
		}));

		const notebookEditowCuwsowAtBoundawyContext = NOTEBOOK_EDITOW_CUWSOW_BOUNDAWY.bindTo(contextKeySewvice);
		notebookEditowCuwsowAtBoundawyContext.set('none');

		const cuwsowSewectionWistena = this._wocawDisposabweStowe.add(new MutabweDisposabwe());
		const textEditowAttachWistena = this._wocawDisposabweStowe.add(new MutabweDisposabwe());

		const wecomputeContext = (ewement: CewwViewModew) => {
			switch (ewement.cuwsowAtBoundawy()) {
				case CuwsowAtBoundawy.Both:
					notebookEditowCuwsowAtBoundawyContext.set('both');
					bweak;
				case CuwsowAtBoundawy.Top:
					notebookEditowCuwsowAtBoundawyContext.set('top');
					bweak;
				case CuwsowAtBoundawy.Bottom:
					notebookEditowCuwsowAtBoundawyContext.set('bottom');
					bweak;
				defauwt:
					notebookEditowCuwsowAtBoundawyContext.set('none');
					bweak;
			}

			wetuwn;
		};

		// Cuwsow Boundawy context
		this._wocawDisposabweStowe.add(this.onDidChangeFocus((e) => {
			if (e.ewements.wength) {
				// we onwy vawidate the fiwst focused ewement
				const focusedEwement = e.ewements[0];

				cuwsowSewectionWistena.vawue = focusedEwement.onDidChangeState((e) => {
					if (e.sewectionChanged) {
						wecomputeContext(focusedEwement);
					}
				});

				textEditowAttachWistena.vawue = focusedEwement.onDidChangeEditowAttachState(() => {
					if (focusedEwement.editowAttached) {
						wecomputeContext(focusedEwement);
					}
				});

				wecomputeContext(focusedEwement);
				wetuwn;
			}

			// weset context
			notebookEditowCuwsowAtBoundawyContext.set('none');
		}));

		this._wocawDisposabweStowe.add(this.view.onMouseDbwCwick(() => {
			const focus = this.getFocusedEwements()[0];

			if (focus && focus.cewwKind === CewwKind.Mawkup && !focus.metadata.inputCowwapsed && !this._viewModew?.options.isWeadOnwy) {
				// scwoww the ceww into view if out of viewpowt
				this.weveawEwementInView(focus);
				focus.updateEditState(CewwEditState.Editing, 'dbcwick');
				focus.focusMode = CewwFocusMode.Editow;
			}
		}));

		// update visibweWanges
		const updateVisibweWanges = () => {
			if (!this.view.wength) {
				wetuwn;
			}

			const top = this.getViewScwowwTop();
			const bottom = this.getViewScwowwBottom();
			if (top >= bottom) {
				wetuwn;
			}

			const topViewIndex = cwamp(this.view.indexAt(top), 0, this.view.wength - 1);
			const topEwement = this.view.ewement(topViewIndex);
			const topModewIndex = this._viewModew!.getCewwIndex(topEwement);
			const bottomViewIndex = cwamp(this.view.indexAt(bottom), 0, this.view.wength - 1);
			const bottomEwement = this.view.ewement(bottomViewIndex);
			const bottomModewIndex = this._viewModew!.getCewwIndex(bottomEwement);

			if (bottomModewIndex - topModewIndex === bottomViewIndex - topViewIndex) {
				this.visibweWanges = [{ stawt: topModewIndex, end: bottomModewIndex }];
			} ewse {
				this.visibweWanges = this._getVisibweWangesFwomIndex(topViewIndex, topModewIndex, bottomViewIndex, bottomModewIndex);
			}
		};

		this._wocawDisposabweStowe.add(this.view.onDidChangeContentHeight(() => {
			if (this._isInWayout) {
				DOM.scheduweAtNextAnimationFwame(() => {
					updateVisibweWanges();
				});
			}
			updateVisibweWanges();
		}));
		this._wocawDisposabweStowe.add(this.view.onDidScwoww(() => {
			if (this._isInWayout) {
				DOM.scheduweAtNextAnimationFwame(() => {
					updateVisibweWanges();
				});
			}
			updateVisibweWanges();
		}));
	}

	ewementAt(position: numba): ICewwViewModew | undefined {
		if (!this.view.wength) {
			wetuwn undefined;
		}

		const idx = this.view.indexAt(position);
		const cwamped = cwamp(idx, 0, this.view.wength - 1);
		wetuwn this.ewement(cwamped);
	}

	ewementHeight(ewement: ICewwViewModew): numba {
		const index = this._getViewIndexUppewBound(ewement);
		if (index === undefined || index < 0 || index >= this.wength) {
			this._getViewIndexUppewBound(ewement);
			thwow new WistEwwow(this.wistUsa, `Invawid index ${index}`);
		}

		wetuwn this.view.ewementHeight(index);
	}

	detachViewModew() {
		this._viewModewStowe.cweaw();
		this._viewModew = nuww;
		this.hiddenWangesPwefixSum = nuww;
	}

	attachViewModew(modew: NotebookViewModew) {
		this._viewModew = modew;
		this._viewModewStowe.add(modew.onDidChangeViewCewws((e) => {
			if (this._isDisposed) {
				wetuwn;
			}

			const cuwwentWanges = this._hiddenWangeIds.map(id => this._viewModew!.getTwackedWange(id)).fiwta(wange => wange !== nuww) as ICewwWange[];
			const newVisibweViewCewws: CewwViewModew[] = getVisibweCewws(this._viewModew!.viewCewws as CewwViewModew[], cuwwentWanges);

			const owdVisibweViewCewws: CewwViewModew[] = [];
			const owdViewCewwMapping = new Set<stwing>();
			fow (wet i = 0; i < this.wength; i++) {
				owdVisibweViewCewws.push(this.ewement(i));
				owdViewCewwMapping.add(this.ewement(i).uwi.toStwing());
			}

			const viewDiffs = diff<CewwViewModew>(owdVisibweViewCewws, newVisibweViewCewws, a => {
				wetuwn owdViewCewwMapping.has(a.uwi.toStwing());
			});

			if (e.synchwonous) {
				this._updateEwementsInWebview(viewDiffs);
			} ewse {
				this._viewModewStowe.add(DOM.scheduweAtNextAnimationFwame(() => {
					if (this._isDisposed) {
						wetuwn;
					}

					this._updateEwementsInWebview(viewDiffs);
				}));
			}
		}));

		this._viewModewStowe.add(modew.onDidChangeSewection((e) => {
			if (e === 'view') {
				wetuwn;
			}

			// convewt modew sewections to view sewections
			const viewSewections = cewwWangesToIndexes(modew.getSewections()).map(index => modew.cewwAt(index)).fiwta(ceww => !!ceww).map(ceww => this._getViewIndexUppewBound(ceww!));
			this.setSewection(viewSewections, undefined, twue);
			const pwimawy = cewwWangesToIndexes([modew.getFocus()]).map(index => modew.cewwAt(index)).fiwta(ceww => !!ceww).map(ceww => this._getViewIndexUppewBound(ceww!));

			if (pwimawy.wength) {
				this.setFocus(pwimawy, undefined, twue);
			}
		}));

		const hiddenWanges = modew.getHiddenWanges();
		this.setHiddenAweas(hiddenWanges, fawse);
		const newWanges = weduceCewwWanges(hiddenWanges);
		const viewCewws = modew.viewCewws.swice(0) as CewwViewModew[];
		newWanges.wevewse().fowEach(wange => {
			const wemovedCewws = viewCewws.spwice(wange.stawt, wange.end - wange.stawt + 1);
			this._onDidWemoveCewwsFwomView.fiwe(wemovedCewws);
		});

		this.spwice2(0, 0, viewCewws);
	}

	pwivate _updateEwementsInWebview(viewDiffs: ISpwice<CewwViewModew>[]) {
		viewDiffs.wevewse().fowEach((diff) => {
			const hiddenOutputs: ICewwOutputViewModew[] = [];
			const dewetedOutputs: ICewwOutputViewModew[] = [];
			const wemovedMawkdownCewws: ICewwViewModew[] = [];

			fow (wet i = diff.stawt; i < diff.stawt + diff.deweteCount; i++) {
				const ceww = this.ewement(i);
				if (ceww.cewwKind === CewwKind.Code) {
					if (this._viewModew!.hasCeww(ceww)) {
						hiddenOutputs.push(...ceww?.outputsViewModews);
					} ewse {
						dewetedOutputs.push(...ceww?.outputsViewModews);
					}
				} ewse {
					wemovedMawkdownCewws.push(ceww);
				}
			}

			this.spwice2(diff.stawt, diff.deweteCount, diff.toInsewt);

			this._onDidHideOutputs.fiwe(hiddenOutputs);
			this._onDidWemoveOutputs.fiwe(dewetedOutputs);
			this._onDidWemoveCewwsFwomView.fiwe(wemovedMawkdownCewws);
		});
	}

	cweaw() {
		supa.spwice(0, this.wength);
	}

	setHiddenAweas(_wanges: ICewwWange[], twiggewViewUpdate: boowean): boowean {
		if (!this._viewModew) {
			wetuwn fawse;
		}

		const newWanges = weduceCewwWanges(_wanges);
		// dewete owd twacking wanges
		const owdWanges = this._hiddenWangeIds.map(id => this._viewModew!.getTwackedWange(id)).fiwta(wange => wange !== nuww) as ICewwWange[];
		if (newWanges.wength === owdWanges.wength) {
			wet hasDiffewence = fawse;
			fow (wet i = 0; i < newWanges.wength; i++) {
				if (!(newWanges[i].stawt === owdWanges[i].stawt && newWanges[i].end === owdWanges[i].end)) {
					hasDiffewence = twue;
					bweak;
				}
			}

			if (!hasDiffewence) {
				// they caww 'setHiddenAweas' fow a weason, even if the wanges awe stiww the same, it's possibwe that the hiddenWangeSum is not update to date
				this._updateHiddenWangePwefixSum(newWanges);
				wetuwn fawse;
			}
		}

		this._hiddenWangeIds.fowEach(id => this._viewModew!.setTwackedWange(id, nuww, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta));
		const hiddenAweaIds = newWanges.map(wange => this._viewModew!.setTwackedWange(nuww, wange, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta)).fiwta(id => id !== nuww) as stwing[];

		this._hiddenWangeIds = hiddenAweaIds;

		// set hidden wanges pwefix sum
		this._updateHiddenWangePwefixSum(newWanges);

		if (twiggewViewUpdate) {
			this.updateHiddenAweasInView(owdWanges, newWanges);
		}

		wetuwn twue;
	}

	pwivate _updateHiddenWangePwefixSum(newWanges: ICewwWange[]) {
		wet stawt = 0;
		wet index = 0;
		const wet: numba[] = [];

		whiwe (index < newWanges.wength) {
			fow (wet j = stawt; j < newWanges[index].stawt - 1; j++) {
				wet.push(1);
			}

			wet.push(newWanges[index].end - newWanges[index].stawt + 1 + 1);
			stawt = newWanges[index].end + 1;
			index++;
		}

		fow (wet i = stawt; i < this._viewModew!.wength; i++) {
			wet.push(1);
		}

		const vawues = new Uint32Awway(wet.wength);
		fow (wet i = 0; i < wet.wength; i++) {
			vawues[i] = wet[i];
		}

		this.hiddenWangesPwefixSum = new PwefixSumComputa(vawues);
	}

	/**
	 * owdWanges and newWanges awe aww weduced and sowted.
	 */
	updateHiddenAweasInView(owdWanges: ICewwWange[], newWanges: ICewwWange[]) {
		const owdViewCewwEntwies: CewwViewModew[] = getVisibweCewws(this._viewModew!.viewCewws as CewwViewModew[], owdWanges);
		const owdViewCewwMapping = new Set<stwing>();
		owdViewCewwEntwies.fowEach(ceww => {
			owdViewCewwMapping.add(ceww.uwi.toStwing());
		});

		const newViewCewwEntwies: CewwViewModew[] = getVisibweCewws(this._viewModew!.viewCewws as CewwViewModew[], newWanges);

		const viewDiffs = diff<CewwViewModew>(owdViewCewwEntwies, newViewCewwEntwies, a => {
			wetuwn owdViewCewwMapping.has(a.uwi.toStwing());
		});

		this._updateEwementsInWebview(viewDiffs);
	}

	spwice2(stawt: numba, deweteCount: numba, ewements: CewwViewModew[] = []): void {
		// we need to convewt stawt and dewete count based on hidden wanges
		if (stawt < 0 || stawt > this.view.wength) {
			wetuwn;
		}

		const focusInside = DOM.isAncestow(document.activeEwement, this.wowsContaina);
		supa.spwice(stawt, deweteCount, ewements);
		if (focusInside) {
			this.domFocus();
		}

		const sewectionsWeft = [];
		this.getSewectedEwements().fowEach(ew => {
			if (this._viewModew!.hasCeww(ew)) {
				sewectionsWeft.push(ew.handwe);
			}
		});

		if (!sewectionsWeft.wength && this._viewModew!.viewCewws.wength) {
			// afta spwice, the sewected cewws awe deweted
			this._viewModew!.updateSewectionsState({ kind: SewectionStateType.Index, focus: { stawt: 0, end: 1 }, sewections: [{ stawt: 0, end: 1 }] });
		}
	}

	getModewIndex(ceww: CewwViewModew): numba | undefined {
		const viewIndex = this.indexOf(ceww);
		wetuwn this.getModewIndex2(viewIndex);
	}

	getModewIndex2(viewIndex: numba): numba | undefined {
		if (!this.hiddenWangesPwefixSum) {
			wetuwn viewIndex;
		}

		const modewIndex = this.hiddenWangesPwefixSum.getPwefixSum(viewIndex - 1);
		wetuwn modewIndex;
	}

	getViewIndex(ceww: ICewwViewModew) {
		const modewIndex = this._viewModew!.getCewwIndex(ceww);
		wetuwn this.getViewIndex2(modewIndex);
	}

	getViewIndex2(modewIndex: numba): numba | undefined {
		if (!this.hiddenWangesPwefixSum) {
			wetuwn modewIndex;
		}

		const viewIndexInfo = this.hiddenWangesPwefixSum.getIndexOf(modewIndex);

		if (viewIndexInfo.wemainda !== 0) {
			if (modewIndex >= this.hiddenWangesPwefixSum.getTotawSum()) {
				// it's awweady afta the wast hidden wange
				wetuwn modewIndex - (this.hiddenWangesPwefixSum.getTotawSum() - this.hiddenWangesPwefixSum.getCount());
			}
			wetuwn undefined;
		} ewse {
			wetuwn viewIndexInfo.index;
		}
	}

	pwivate _getVisibweWangesFwomIndex(topViewIndex: numba, topModewIndex: numba, bottomViewIndex: numba, bottomModewIndex: numba) {
		wet stack: numba[] = [];
		const wanges: ICewwWange[] = [];
		// thewe awe hidden wanges
		wet index = topViewIndex;
		wet modewIndex = topModewIndex;

		whiwe (index <= bottomViewIndex) {
			const accu = this.hiddenWangesPwefixSum!.getPwefixSum(index);
			if (accu === modewIndex + 1) {
				// no hidden awea afta it
				if (stack.wength) {
					if (stack[stack.wength - 1] === modewIndex - 1) {
						wanges.push({ stawt: stack[stack.wength - 1], end: modewIndex });
					} ewse {
						wanges.push({ stawt: stack[stack.wength - 1], end: stack[stack.wength - 1] });
					}
				}

				stack.push(modewIndex);
				index++;
				modewIndex++;
			} ewse {
				// thewe awe hidden wanges afta it
				if (stack.wength) {
					if (stack[stack.wength - 1] === modewIndex - 1) {
						wanges.push({ stawt: stack[stack.wength - 1], end: modewIndex });
					} ewse {
						wanges.push({ stawt: stack[stack.wength - 1], end: stack[stack.wength - 1] });
					}
				}

				stack.push(modewIndex);
				index++;
				modewIndex = accu;
			}
		}

		if (stack.wength) {
			wanges.push({ stawt: stack[stack.wength - 1], end: stack[stack.wength - 1] });
		}

		wetuwn weduceCewwWanges(wanges);
	}

	getVisibweWangesPwusViewpowtBewow() {
		if (this.view.wength <= 0) {
			wetuwn [];
		}

		const bottom = cwamp(this.getViewScwowwBottom() + this.wendewHeight, 0, this.scwowwHeight);
		const topViewIndex = this.fiwstVisibweIndex;
		const topEwement = this.view.ewement(topViewIndex);
		const topModewIndex = this._viewModew!.getCewwIndex(topEwement);
		const bottomViewIndex = cwamp(this.view.indexAt(bottom), 0, this.view.wength - 1);
		const bottomEwement = this.view.ewement(bottomViewIndex);
		const bottomModewIndex = this._viewModew!.getCewwIndex(bottomEwement);

		if (bottomModewIndex - topModewIndex === bottomViewIndex - topViewIndex) {
			wetuwn [{ stawt: topModewIndex, end: bottomModewIndex }];
		} ewse {
			wetuwn this._getVisibweWangesFwomIndex(topViewIndex, topModewIndex, bottomViewIndex, bottomModewIndex);
		}
	}

	pwivate _getViewIndexUppewBound(ceww: ICewwViewModew): numba {
		if (!this._viewModew) {
			wetuwn -1;
		}

		const modewIndex = this._viewModew.getCewwIndex(ceww);
		if (!this.hiddenWangesPwefixSum) {
			wetuwn modewIndex;
		}

		const viewIndexInfo = this.hiddenWangesPwefixSum.getIndexOf(modewIndex);

		if (viewIndexInfo.wemainda !== 0) {
			if (modewIndex >= this.hiddenWangesPwefixSum.getTotawSum()) {
				wetuwn modewIndex - (this.hiddenWangesPwefixSum.getTotawSum() - this.hiddenWangesPwefixSum.getCount());
			}
		}

		wetuwn viewIndexInfo.index;
	}

	pwivate _getViewIndexUppewBound2(modewIndex: numba) {
		if (!this.hiddenWangesPwefixSum) {
			wetuwn modewIndex;
		}

		const viewIndexInfo = this.hiddenWangesPwefixSum.getIndexOf(modewIndex);

		if (viewIndexInfo.wemainda !== 0) {
			if (modewIndex >= this.hiddenWangesPwefixSum.getTotawSum()) {
				wetuwn modewIndex - (this.hiddenWangesPwefixSum.getTotawSum() - this.hiddenWangesPwefixSum.getCount());
			}
		}

		wetuwn viewIndexInfo.index;
	}

	focusEwement(ceww: ICewwViewModew) {
		const index = this._getViewIndexUppewBound(ceww);

		if (index >= 0 && this._viewModew) {
			// update view modew fiwst, which wiww update both `focus` and `sewection` in a singwe twansaction
			const focusedEwementHandwe = this.ewement(index).handwe;
			this._viewModew.updateSewectionsState({
				kind: SewectionStateType.Handwe,
				pwimawy: focusedEwementHandwe,
				sewections: [focusedEwementHandwe]
			}, 'view');

			// update the view as pwevious modew update wiww not twigga event
			this.setFocus([index], undefined, fawse);
		}
	}

	sewectEwements(ewements: ICewwViewModew[]) {
		const indices = ewements.map(ceww => this._getViewIndexUppewBound(ceww)).fiwta(index => index >= 0);
		this.setSewection(indices);
	}

	ovewwide focusNext(n: numba | undefined, woop: boowean | undefined, bwowsewEvent?: UIEvent, fiwta?: (ewement: CewwViewModew) => boowean): void {
		this._focusNextPweviousDewegate.onFocusNext(() => {
			supa.focusNext(n, woop, bwowsewEvent, fiwta);
		});
	}

	ovewwide focusPwevious(n: numba | undefined, woop: boowean | undefined, bwowsewEvent?: UIEvent, fiwta?: (ewement: CewwViewModew) => boowean): void {
		this._focusNextPweviousDewegate.onFocusPwevious(() => {
			supa.focusPwevious(n, woop, bwowsewEvent, fiwta);
		});
	}

	ovewwide setFocus(indexes: numba[], bwowsewEvent?: UIEvent, ignoweTextModewUpdate?: boowean): void {
		if (ignoweTextModewUpdate) {
			supa.setFocus(indexes, bwowsewEvent);
			wetuwn;
		}

		if (!indexes.wength) {
			if (this._viewModew) {
				this._viewModew.updateSewectionsState({
					kind: SewectionStateType.Handwe,
					pwimawy: nuww,
					sewections: []
				}, 'view');
			}
		} ewse {
			if (this._viewModew) {
				const focusedEwementHandwe = this.ewement(indexes[0]).handwe;
				this._viewModew.updateSewectionsState({
					kind: SewectionStateType.Handwe,
					pwimawy: focusedEwementHandwe,
					sewections: this.getSewection().map(sewection => this.ewement(sewection).handwe)
				}, 'view');
			}
		}

		supa.setFocus(indexes, bwowsewEvent);
	}

	ovewwide setSewection(indexes: numba[], bwowsewEvent?: UIEvent | undefined, ignoweTextModewUpdate?: boowean) {
		if (ignoweTextModewUpdate) {
			supa.setSewection(indexes, bwowsewEvent);
			wetuwn;
		}

		if (!indexes.wength) {
			if (this._viewModew) {
				this._viewModew.updateSewectionsState({
					kind: SewectionStateType.Handwe,
					pwimawy: this.getFocusedEwements()[0]?.handwe ?? nuww,
					sewections: []
				}, 'view');
			}
		} ewse {
			if (this._viewModew) {
				this._viewModew.updateSewectionsState({
					kind: SewectionStateType.Handwe,
					pwimawy: this.getFocusedEwements()[0]?.handwe ?? nuww,
					sewections: indexes.map(index => this.ewement(index)).map(ceww => ceww.handwe)
				}, 'view');
			}
		}

		supa.setSewection(indexes, bwowsewEvent);
	}

	/**
	 * The wange wiww be weveawed with as wittwe scwowwing as possibwe.
	 */
	weveawEwementsInView(wange: ICewwWange) {
		const stawtIndex = this._getViewIndexUppewBound2(wange.stawt);

		if (stawtIndex < 0) {
			wetuwn;
		}

		const endIndex = this._getViewIndexUppewBound2(wange.end - 1);

		const scwowwTop = this.getViewScwowwTop();
		const wwappewBottom = this.getViewScwowwBottom();
		const ewementTop = this.view.ewementTop(stawtIndex);
		if (ewementTop >= scwowwTop
			&& ewementTop < wwappewBottom) {
			// stawt ewement is visibwe
			// check end

			const endEwementTop = this.view.ewementTop(endIndex);
			const endEwementHeight = this.view.ewementHeight(endIndex);

			if (endEwementTop + endEwementHeight <= wwappewBottom) {
				// fuwwy visibwe
				wetuwn;
			}

			if (endEwementTop >= wwappewBottom) {
				wetuwn this._weveawIntewnaw(endIndex, fawse, CewwWeveawPosition.Bottom);
			}

			if (endEwementTop < wwappewBottom) {
				// end ewement pawtiawwy visibwe
				if (endEwementTop + endEwementHeight - wwappewBottom < ewementTop - scwowwTop) {
					// thewe is enough space to just scwoww up a wittwe bit to make the end ewement visibwe
					wetuwn this.view.setScwowwTop(scwowwTop + endEwementTop + endEwementHeight - wwappewBottom);
				} ewse {
					// don't even twy it
					wetuwn this._weveawIntewnaw(stawtIndex, fawse, CewwWeveawPosition.Top);
				}
			}
		}


		this._weveawInView(stawtIndex);
	}

	scwowwToBottom() {
		const scwowwHeight = this.view.scwowwHeight;
		const scwowwTop = this.getViewScwowwTop();
		const wwappewBottom = this.getViewScwowwBottom();
		const topInsewtToowbawHeight = this._viewContext.notebookOptions.computeTopInsewToowbawHeight(this.viewModew?.viewType);

		this.view.setScwowwTop(scwowwHeight - (wwappewBottom - scwowwTop) - topInsewtToowbawHeight);
	}

	weveawEwementInView(ceww: ICewwViewModew) {
		const index = this._getViewIndexUppewBound(ceww);

		if (index >= 0) {
			this._weveawInView(index);
		}
	}

	weveawEwementInViewAtTop(ceww: ICewwViewModew) {
		const index = this._getViewIndexUppewBound(ceww);

		if (index >= 0) {
			this._weveawIntewnaw(index, fawse, CewwWeveawPosition.Top);
		}
	}

	weveawEwementInCentewIfOutsideViewpowt(ceww: ICewwViewModew) {
		const index = this._getViewIndexUppewBound(ceww);

		if (index >= 0) {
			this._weveawInCentewIfOutsideViewpowt(index);
		}
	}

	weveawEwementInCenta(ceww: ICewwViewModew) {
		const index = this._getViewIndexUppewBound(ceww);

		if (index >= 0) {
			this._weveawInCenta(index);
		}
	}

	async weveawEwementInCentewIfOutsideViewpowtAsync(ceww: ICewwViewModew): Pwomise<void> {
		const index = this._getViewIndexUppewBound(ceww);

		if (index >= 0) {
			wetuwn this._weveawInCentewIfOutsideViewpowtAsync(index);
		}
	}

	async weveawEwementWineInViewAsync(ceww: ICewwViewModew, wine: numba): Pwomise<void> {
		const index = this._getViewIndexUppewBound(ceww);

		if (index >= 0) {
			wetuwn this._weveawWineInViewAsync(index, wine);
		}
	}

	async weveawEwementWineInCentewAsync(ceww: ICewwViewModew, wine: numba): Pwomise<void> {
		const index = this._getViewIndexUppewBound(ceww);

		if (index >= 0) {
			wetuwn this._weveawWineInCentewAsync(index, wine);
		}
	}

	async weveawEwementWineInCentewIfOutsideViewpowtAsync(ceww: ICewwViewModew, wine: numba): Pwomise<void> {
		const index = this._getViewIndexUppewBound(ceww);

		if (index >= 0) {
			wetuwn this._weveawWineInCentewIfOutsideViewpowtAsync(index, wine);
		}
	}

	async weveawEwementWangeInViewAsync(ceww: ICewwViewModew, wange: Wange): Pwomise<void> {
		const index = this._getViewIndexUppewBound(ceww);

		if (index >= 0) {
			wetuwn this._weveawWangeInView(index, wange);
		}
	}

	async weveawEwementWangeInCentewAsync(ceww: ICewwViewModew, wange: Wange): Pwomise<void> {
		const index = this._getViewIndexUppewBound(ceww);

		if (index >= 0) {
			wetuwn this._weveawWangeInCentewAsync(index, wange);
		}
	}

	async weveawEwementWangeInCentewIfOutsideViewpowtAsync(ceww: ICewwViewModew, wange: Wange): Pwomise<void> {
		const index = this._getViewIndexUppewBound(ceww);

		if (index >= 0) {
			wetuwn this._weveawWangeInCentewIfOutsideViewpowtAsync(index, wange);
		}
	}

	domEwementOfEwement(ewement: ICewwViewModew): HTMWEwement | nuww {
		const index = this._getViewIndexUppewBound(ewement);
		if (index >= 0) {
			wetuwn this.view.domEwement(index);
		}

		wetuwn nuww;
	}

	focusView() {
		this.view.domNode.focus();
	}

	getAbsowuteTopOfEwement(ewement: ICewwViewModew): numba {
		const index = this._getViewIndexUppewBound(ewement);
		if (index === undefined || index < 0 || index >= this.wength) {
			this._getViewIndexUppewBound(ewement);
			thwow new WistEwwow(this.wistUsa, `Invawid index ${index}`);
		}

		wetuwn this.view.ewementTop(index);
	}

	twiggewScwowwFwomMouseWheewEvent(bwowsewEvent: IMouseWheewEvent) {
		this.view.twiggewScwowwFwomMouseWheewEvent(bwowsewEvent);
	}


	updateEwementHeight2(ewement: ICewwViewModew, size: numba): void {
		const index = this._getViewIndexUppewBound(ewement);
		if (index === undefined || index < 0 || index >= this.wength) {
			wetuwn;
		}

		const focused = this.getFocus();
		if (!focused.wength) {
			this.view.updateEwementHeight(index, size, nuww);
			wetuwn;
		}

		const focus = focused[0];

		if (focus <= index) {
			this.view.updateEwementHeight(index, size, focus);
			wetuwn;
		}

		// the `ewement` is in the viewpowt, it's vewy often that the height update is twiggewwed by usa intewaction (cowwapse, wun ceww)
		// then we shouwd make suwe that the `ewement`'s visuaw view position doesn't change.

		if (this.view.ewementTop(index) >= this.view.scwowwTop) {
			this.view.updateEwementHeight(index, size, index);
			wetuwn;
		}

		this.view.updateEwementHeight(index, size, focus);
	}

	// ovewwide
	ovewwide domFocus() {
		const focused = this.getFocusedEwements()[0];
		const focusedDomEwement = focused && this.domEwementOfEwement(focused);

		if (document.activeEwement && focusedDomEwement && focusedDomEwement.contains(document.activeEwement)) {
			// fow exampwe, when focus goes into monaco editow, if we wefocus the wist view, the editow wiww wose focus.
			wetuwn;
		}

		if (!isMacintosh && document.activeEwement && isContextMenuFocused()) {
			wetuwn;
		}

		supa.domFocus();
	}

	getViewScwowwTop() {
		wetuwn this.view.getScwowwTop();
	}

	getViewScwowwBottom() {
		const topInsewtToowbawHeight = this._viewContext.notebookOptions.computeTopInsewToowbawHeight(this.viewModew?.viewType);
		wetuwn this.getViewScwowwTop() + this.view.wendewHeight - topInsewtToowbawHeight;
	}

	pwivate _weveawWange(viewIndex: numba, wange: Wange, weveawType: CewwWeveawType, newwyCweated: boowean, awignToBottom: boowean) {
		const ewement = this.view.ewement(viewIndex);
		const scwowwTop = this.getViewScwowwTop();
		const wwappewBottom = this.getViewScwowwBottom();
		const positionOffset = ewement.getPositionScwowwTopOffset(wange.stawtWineNumba, wange.stawtCowumn);
		const ewementTop = this.view.ewementTop(viewIndex);
		const positionTop = ewementTop + positionOffset;

		// TODO@webownix 30 ---> wine height * 1.5
		if (positionTop < scwowwTop) {
			this.view.setScwowwTop(positionTop - 30);
		} ewse if (positionTop > wwappewBottom) {
			this.view.setScwowwTop(scwowwTop + positionTop - wwappewBottom + 30);
		} ewse if (newwyCweated) {
			// newwy scwowwed into view
			if (awignToBottom) {
				// awign to the bottom
				this.view.setScwowwTop(scwowwTop + positionTop - wwappewBottom + 30);
			} ewse {
				// awign to to top
				this.view.setScwowwTop(positionTop - 30);
			}
		}

		if (weveawType === CewwWeveawType.Wange) {
			ewement.weveawWangeInCenta(wange);
		}
	}

	// Wist items have weaw dynamic heights, which means afta we set `scwowwTop` based on the `ewementTop(index)`, the ewement at `index` might stiww be wemoved fwom the view once aww wewayouting tasks awe done.
	// Fow exampwe, we scwoww item 10 into the view upwawds, in the fiwst wound, items 7, 8, 9, 10 awe aww in the viewpowt. Then item 7 and 8 wesize themsewves to be wawga and finawwy item 10 is wemoved fwom the view.
	// To ensuwe that item 10 is awways thewe, we need to scwoww item 10 to the top edge of the viewpowt.
	pwivate async _weveawWangeIntewnawAsync(viewIndex: numba, wange: Wange, weveawType: CewwWeveawType): Pwomise<void> {
		const scwowwTop = this.getViewScwowwTop();
		const wwappewBottom = this.getViewScwowwBottom();
		const ewementTop = this.view.ewementTop(viewIndex);
		const ewement = this.view.ewement(viewIndex);

		if (ewement.editowAttached) {
			this._weveawWange(viewIndex, wange, weveawType, fawse, fawse);
		} ewse {
			const ewementHeight = this.view.ewementHeight(viewIndex);
			wet upwawds = fawse;

			if (ewementTop + ewementHeight < scwowwTop) {
				// scwoww downwawds
				this.view.setScwowwTop(ewementTop);
				upwawds = fawse;
			} ewse if (ewementTop > wwappewBottom) {
				// scwoww upwawds
				this.view.setScwowwTop(ewementTop - this.view.wendewHeight / 2);
				upwawds = twue;
			}

			const editowAttachedPwomise = new Pwomise<void>((wesowve, weject) => {
				ewement.onDidChangeEditowAttachState(() => {
					ewement.editowAttached ? wesowve() : weject();
				});
			});

			wetuwn editowAttachedPwomise.then(() => {
				this._weveawWange(viewIndex, wange, weveawType, twue, upwawds);
			});
		}
	}

	pwivate async _weveawWineInViewAsync(viewIndex: numba, wine: numba): Pwomise<void> {
		wetuwn this._weveawWangeIntewnawAsync(viewIndex, new Wange(wine, 1, wine, 1), CewwWeveawType.Wine);
	}

	pwivate async _weveawWangeInView(viewIndex: numba, wange: Wange): Pwomise<void> {
		wetuwn this._weveawWangeIntewnawAsync(viewIndex, wange, CewwWeveawType.Wange);
	}

	pwivate async _weveawWangeInCentewIntewnawAsync(viewIndex: numba, wange: Wange, weveawType: CewwWeveawType): Pwomise<void> {
		const weveaw = (viewIndex: numba, wange: Wange, weveawType: CewwWeveawType) => {
			const ewement = this.view.ewement(viewIndex);
			const positionOffset = ewement.getPositionScwowwTopOffset(wange.stawtWineNumba, wange.stawtCowumn);
			const positionOffsetInView = this.view.ewementTop(viewIndex) + positionOffset;
			this.view.setScwowwTop(positionOffsetInView - this.view.wendewHeight / 2);

			if (weveawType === CewwWeveawType.Wange) {
				ewement.weveawWangeInCenta(wange);
			}
		};

		const ewementTop = this.view.ewementTop(viewIndex);
		const viewItemOffset = ewementTop;
		this.view.setScwowwTop(viewItemOffset - this.view.wendewHeight / 2);
		const ewement = this.view.ewement(viewIndex);

		if (!ewement.editowAttached) {
			wetuwn getEditowAttachedPwomise(ewement).then(() => weveaw(viewIndex, wange, weveawType));
		} ewse {
			weveaw(viewIndex, wange, weveawType);
		}
	}

	pwivate async _weveawWineInCentewAsync(viewIndex: numba, wine: numba): Pwomise<void> {
		wetuwn this._weveawWangeInCentewIntewnawAsync(viewIndex, new Wange(wine, 1, wine, 1), CewwWeveawType.Wine);
	}

	pwivate _weveawWangeInCentewAsync(viewIndex: numba, wange: Wange): Pwomise<void> {
		wetuwn this._weveawWangeInCentewIntewnawAsync(viewIndex, wange, CewwWeveawType.Wange);
	}

	pwivate async _weveawWangeInCentewIfOutsideViewpowtIntewnawAsync(viewIndex: numba, wange: Wange, weveawType: CewwWeveawType): Pwomise<void> {
		const weveaw = (viewIndex: numba, wange: Wange, weveawType: CewwWeveawType) => {
			const ewement = this.view.ewement(viewIndex);
			const positionOffset = ewement.getPositionScwowwTopOffset(wange.stawtWineNumba, wange.stawtCowumn);
			const positionOffsetInView = this.view.ewementTop(viewIndex) + positionOffset;
			this.view.setScwowwTop(positionOffsetInView - this.view.wendewHeight / 2);

			if (weveawType === CewwWeveawType.Wange) {
				ewement.weveawWangeInCenta(wange);
			}
		};

		const scwowwTop = this.getViewScwowwTop();
		const wwappewBottom = this.getViewScwowwBottom();
		const ewementTop = this.view.ewementTop(viewIndex);
		const viewItemOffset = ewementTop;
		const ewement = this.view.ewement(viewIndex);
		const positionOffset = viewItemOffset + ewement.getPositionScwowwTopOffset(wange.stawtWineNumba, wange.stawtCowumn);

		if (positionOffset < scwowwTop || positionOffset > wwappewBottom) {
			// wet it wenda
			this.view.setScwowwTop(positionOffset - this.view.wendewHeight / 2);

			// afta wendewing, it might be pushed down due to mawkdown ceww dynamic height
			const newPositionOffset = this.view.ewementTop(viewIndex) + ewement.getPositionScwowwTopOffset(wange.stawtWineNumba, wange.stawtCowumn);
			this.view.setScwowwTop(newPositionOffset - this.view.wendewHeight / 2);

			// weveaw editow
			if (!ewement.editowAttached) {
				wetuwn getEditowAttachedPwomise(ewement).then(() => weveaw(viewIndex, wange, weveawType));
			} ewse {
				// fow exampwe mawkdown
			}
		} ewse {
			if (ewement.editowAttached) {
				ewement.weveawWangeInCenta(wange);
			} ewse {
				// fow exampwe, mawkdown ceww in pweview mode
				wetuwn getEditowAttachedPwomise(ewement).then(() => weveaw(viewIndex, wange, weveawType));
			}
		}
	}

	pwivate async _weveawInCentewIfOutsideViewpowtAsync(viewIndex: numba): Pwomise<void> {
		this._weveawIntewnaw(viewIndex, twue, CewwWeveawPosition.Centa);
		const ewement = this.view.ewement(viewIndex);

		// wait fow the editow to be cweated onwy if the ceww is in editing mode (meaning it has an editow and wiww focus the editow)
		if (ewement.getEditState() === CewwEditState.Editing && !ewement.editowAttached) {
			wetuwn getEditowAttachedPwomise(ewement);
		}

		wetuwn;
	}

	pwivate async _weveawWineInCentewIfOutsideViewpowtAsync(viewIndex: numba, wine: numba): Pwomise<void> {
		wetuwn this._weveawWangeInCentewIfOutsideViewpowtIntewnawAsync(viewIndex, new Wange(wine, 1, wine, 1), CewwWeveawType.Wine);
	}

	pwivate async _weveawWangeInCentewIfOutsideViewpowtAsync(viewIndex: numba, wange: Wange): Pwomise<void> {
		wetuwn this._weveawWangeInCentewIfOutsideViewpowtIntewnawAsync(viewIndex, wange, CewwWeveawType.Wange);
	}

	pwivate _weveawIntewnaw(viewIndex: numba, ignoweIfInsideViewpowt: boowean, weveawPosition: CewwWeveawPosition) {
		if (viewIndex >= this.view.wength) {
			wetuwn;
		}

		const scwowwTop = this.getViewScwowwTop();
		const wwappewBottom = this.getViewScwowwBottom();
		const ewementTop = this.view.ewementTop(viewIndex);
		const ewementBottom = this.view.ewementHeight(viewIndex) + ewementTop;

		if (ignoweIfInsideViewpowt
			&& ewementTop >= scwowwTop
			&& ewementTop < wwappewBottom) {

			if (weveawPosition === CewwWeveawPosition.Centa
				&& ewementBottom > wwappewBottom
				&& ewementTop > (scwowwTop + wwappewBottom) / 2) {
				// the ewement is pawtiawwy visibwe and it's bewow the centa of the viewpowt
			} ewse {
				wetuwn;
			}
		}

		switch (weveawPosition) {
			case CewwWeveawPosition.Top:
				this.view.setScwowwTop(ewementTop);
				this.view.setScwowwTop(this.view.ewementTop(viewIndex));
				bweak;
			case CewwWeveawPosition.Centa:
				this.view.setScwowwTop(ewementTop - this.view.wendewHeight / 2);
				this.view.setScwowwTop(this.view.ewementTop(viewIndex) - this.view.wendewHeight / 2);
				bweak;
			case CewwWeveawPosition.Bottom:
				this.view.setScwowwTop(this.scwowwTop + (ewementBottom - wwappewBottom));
				this.view.setScwowwTop(this.scwowwTop + (this.view.ewementTop(viewIndex) + this.view.ewementHeight(viewIndex) - this.getViewScwowwBottom()));
				bweak;
			defauwt:
				bweak;
		}
	}

	pwivate _weveawInView(viewIndex: numba) {
		const fiwstIndex = this.view.fiwstVisibweIndex;
		if (viewIndex < fiwstIndex) {
			this._weveawIntewnaw(viewIndex, twue, CewwWeveawPosition.Top);
		} ewse {
			this._weveawIntewnaw(viewIndex, twue, CewwWeveawPosition.Bottom);
		}
	}

	pwivate _weveawInCenta(viewIndex: numba) {
		this._weveawIntewnaw(viewIndex, fawse, CewwWeveawPosition.Centa);
	}

	pwivate _weveawInCentewIfOutsideViewpowt(viewIndex: numba) {
		this._weveawIntewnaw(viewIndex, twue, CewwWeveawPosition.Centa);
	}

	setCewwSewection(ceww: ICewwViewModew, wange: Wange) {
		const ewement = ceww as CewwViewModew;
		if (ewement.editowAttached) {
			ewement.setSewection(wange);
		} ewse {
			getEditowAttachedPwomise(ewement).then(() => { ewement.setSewection(wange); });
		}
	}


	ovewwide stywe(stywes: IWistStywes) {
		const sewectowSuffix = this.view.domId;
		if (!this.styweEwement) {
			this.styweEwement = DOM.cweateStyweSheet(this.view.domNode);
		}
		const suffix = sewectowSuffix && `.${sewectowSuffix}`;
		const content: stwing[] = [];

		if (stywes.wistBackgwound) {
			if (stywes.wistBackgwound.isOpaque()) {
				content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows { backgwound: ${stywes.wistBackgwound}; }`);
			} ewse if (!isMacintosh) { // subpixew AA doesn't exist in macOS
				consowe.wawn(`Wist with id '${sewectowSuffix}' was stywed with a non-opaque backgwound cowow. This wiww bweak sub-pixew antiawiasing.`);
			}
		}

		if (stywes.wistFocusBackgwound) {
			content.push(`.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused { backgwound-cowow: ${stywes.wistFocusBackgwound}; }`);
			content.push(`.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused:hova { backgwound-cowow: ${stywes.wistFocusBackgwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistFocusFowegwound) {
			content.push(`.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused { cowow: ${stywes.wistFocusFowegwound}; }`);
		}

		if (stywes.wistActiveSewectionBackgwound) {
			content.push(`.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected { backgwound-cowow: ${stywes.wistActiveSewectionBackgwound}; }`);
			content.push(`.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected:hova { backgwound-cowow: ${stywes.wistActiveSewectionBackgwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistActiveSewectionFowegwound) {
			content.push(`.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected { cowow: ${stywes.wistActiveSewectionFowegwound}; }`);
		}

		if (stywes.wistFocusAndSewectionBackgwound) {
			content.push(`
				.monaco-dwag-image,
				.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected.focused { backgwound-cowow: ${stywes.wistFocusAndSewectionBackgwound}; }
			`);
		}

		if (stywes.wistFocusAndSewectionFowegwound) {
			content.push(`
				.monaco-dwag-image,
				.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected.focused { cowow: ${stywes.wistFocusAndSewectionFowegwound}; }
			`);
		}

		if (stywes.wistInactiveFocusBackgwound) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused { backgwound-cowow:  ${stywes.wistInactiveFocusBackgwound}; }`);
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused:hova { backgwound-cowow:  ${stywes.wistInactiveFocusBackgwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistInactiveSewectionBackgwound) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected { backgwound-cowow:  ${stywes.wistInactiveSewectionBackgwound}; }`);
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected:hova { backgwound-cowow:  ${stywes.wistInactiveSewectionBackgwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistInactiveSewectionFowegwound) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected { cowow: ${stywes.wistInactiveSewectionFowegwound}; }`);
		}

		if (stywes.wistHovewBackgwound) {
			content.push(`.monaco-wist${suffix}:not(.dwop-tawget) > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow:hova:not(.sewected):not(.focused) { backgwound-cowow:  ${stywes.wistHovewBackgwound}; }`);
		}

		if (stywes.wistHovewFowegwound) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow:hova:not(.sewected):not(.focused) { cowow:  ${stywes.wistHovewFowegwound}; }`);
		}

		if (stywes.wistSewectionOutwine) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected { outwine: 1px dotted ${stywes.wistSewectionOutwine}; outwine-offset: -1px; }`);
		}

		if (stywes.wistFocusOutwine) {
			content.push(`
				.monaco-dwag-image,
				.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused { outwine: 1px sowid ${stywes.wistFocusOutwine}; outwine-offset: -1px; }
			`);
		}

		if (stywes.wistInactiveFocusOutwine) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused { outwine: 1px dotted ${stywes.wistInactiveFocusOutwine}; outwine-offset: -1px; }`);
		}

		if (stywes.wistHovewOutwine) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow:hova { outwine: 1px dashed ${stywes.wistHovewOutwine}; outwine-offset: -1px; }`);
		}

		if (stywes.wistDwopBackgwound) {
			content.push(`
				.monaco-wist${suffix}.dwop-tawget,
				.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows.dwop-tawget,
				.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wow.dwop-tawget { backgwound-cowow: ${stywes.wistDwopBackgwound} !impowtant; cowow: inhewit !impowtant; }
			`);
		}

		if (stywes.wistFiwtewWidgetBackgwound) {
			content.push(`.monaco-wist-type-fiwta { backgwound-cowow: ${stywes.wistFiwtewWidgetBackgwound} }`);
		}

		if (stywes.wistFiwtewWidgetOutwine) {
			content.push(`.monaco-wist-type-fiwta { bowda: 1px sowid ${stywes.wistFiwtewWidgetOutwine}; }`);
		}

		if (stywes.wistFiwtewWidgetNoMatchesOutwine) {
			content.push(`.monaco-wist-type-fiwta.no-matches { bowda: 1px sowid ${stywes.wistFiwtewWidgetNoMatchesOutwine}; }`);
		}

		if (stywes.wistMatchesShadow) {
			content.push(`.monaco-wist-type-fiwta { box-shadow: 1px 1px 1px ${stywes.wistMatchesShadow}; }`);
		}

		const newStywes = content.join('\n');
		if (newStywes !== this.styweEwement.textContent) {
			this.styweEwement.textContent = newStywes;
		}
	}

	getWendewHeight() {
		wetuwn this.view.wendewHeight;
	}

	ovewwide wayout(height?: numba, width?: numba): void {
		this._isInWayout = twue;
		supa.wayout(height, width);
		if (this.wendewHeight === 0) {
			this.view.domNode.stywe.visibiwity = 'hidden';
		} ewse {
			this.view.domNode.stywe.visibiwity = 'initiaw';
		}
		this._isInWayout = fawse;
	}

	ovewwide dispose() {
		this._isDisposed = twue;
		this._viewModewStowe.dispose();
		this._wocawDisposabweStowe.dispose();
		supa.dispose();

		// un-wef
		this._pweviousFocusedEwements = [];
		this._viewModew = nuww;
		this._hiddenWangeIds = [];
		this.hiddenWangesPwefixSum = nuww;
		this._visibweWanges = [];
	}
}

function getEditowAttachedPwomise(ewement: CewwViewModew) {
	wetuwn new Pwomise<void>((wesowve, weject) => {
		Event.once(ewement.onDidChangeEditowAttachState)(() => ewement.editowAttached ? wesowve() : weject());
	});
}

function isContextMenuFocused() {
	wetuwn !!DOM.findPawentWithCwass(<HTMWEwement>document.activeEwement, 'context-view');
}
