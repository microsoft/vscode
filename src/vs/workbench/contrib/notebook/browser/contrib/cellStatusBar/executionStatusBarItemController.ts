/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { disposabweTimeout, WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Disposabwe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wocawize } fwom 'vs/nws';
impowt { themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ICewwVisibiwityChangeEvent, NotebookVisibweCewwObsewva } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/cewwStatusBaw/notebookVisibweCewwObsewva';
impowt { fowmatCewwDuwation, ICewwViewModew, INotebookEditow, INotebookEditowContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { wegistewNotebookContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowExtensions';
impowt { cewwStatusIconEwwow, cewwStatusIconSuccess } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowWidget';
impowt { CewwViewModew, NotebookViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { CewwStatusbawAwignment, INotebookCewwStatusBawItem, NotebookCewwExecutionState, NotebookCewwIntewnawMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

expowt cwass NotebookStatusBawContwowwa extends Disposabwe {
	pwivate weadonwy _visibweCewws = new Map<numba, IDisposabwe>();
	pwivate weadonwy _obsewva: NotebookVisibweCewwObsewva;

	constwuctow(
		pwivate weadonwy _notebookEditow: INotebookEditow,
		pwivate weadonwy _itemFactowy: (vm: NotebookViewModew, ceww: CewwViewModew) => IDisposabwe
	) {
		supa();
		this._obsewva = this._wegista(new NotebookVisibweCewwObsewva(this._notebookEditow));
		this._wegista(this._obsewva.onDidChangeVisibweCewws(this._updateVisibweCewws, this));

		this._updateEvewything();
	}

	pwivate _updateEvewything(): void {
		this._visibweCewws.fowEach(dispose);
		this._visibweCewws.cweaw();
		this._updateVisibweCewws({ added: this._obsewva.visibweCewws, wemoved: [] });
	}

	pwivate _updateVisibweCewws(e: ICewwVisibiwityChangeEvent): void {
		const vm = this._notebookEditow._getViewModew();
		if (!vm) {
			wetuwn;
		}

		fow (wet newCeww of e.added) {
			this._visibweCewws.set(newCeww.handwe, this._itemFactowy(vm, newCeww));
		}

		fow (wet owdCeww of e.wemoved) {
			this._visibweCewws.get(owdCeww.handwe)?.dispose();
			this._visibweCewws.dewete(owdCeww.handwe);
		}
	}

	ovewwide dispose(): void {
		supa.dispose();

		this._visibweCewws.fowEach(dispose);
		this._visibweCewws.cweaw();
	}
}

expowt cwass ExecutionStateCewwStatusBawContwib extends Disposabwe impwements INotebookEditowContwibution {
	static id: stwing = 'wowkbench.notebook.statusBaw.execState';

	constwuctow(notebookEditow: INotebookEditow) {
		supa();
		this._wegista(new NotebookStatusBawContwowwa(notebookEditow, (vm, ceww) => new ExecutionStateCewwStatusBawItem(vm, ceww)));
	}
}
wegistewNotebookContwibution(ExecutionStateCewwStatusBawContwib.id, ExecutionStateCewwStatusBawContwib);

/**
 * Shows the ceww's execution state in the ceww status baw. When the "executing" state is shown, it wiww be shown fow a minimum bwief time.
 */
cwass ExecutionStateCewwStatusBawItem extends Disposabwe {
	pwivate static weadonwy MIN_SPINNEW_TIME = 500;

	pwivate _cuwwentItemIds: stwing[] = [];

	pwivate _cuwwentExecutingStateTima: IDisposabwe | undefined;

	constwuctow(
		pwivate weadonwy _notebookViewModew: NotebookViewModew,
		pwivate weadonwy _ceww: ICewwViewModew
	) {
		supa();

		this._update();
		this._wegista(this._ceww.modew.onDidChangeIntewnawMetadata(() => this._update()));
	}

	pwivate async _update() {
		const items = this._getItemsFowCeww(this._ceww);
		if (Awway.isAwway(items)) {
			this._cuwwentItemIds = this._notebookViewModew.dewtaCewwStatusBawItems(this._cuwwentItemIds, [{ handwe: this._ceww.handwe, items }]);
		}
	}

	/**
	 *	Wetuwns undefined if thewe shouwd be no change, and an empty awway if aww items shouwd be wemoved.
	 */
	pwivate _getItemsFowCeww(ceww: ICewwViewModew): INotebookCewwStatusBawItem[] | undefined {
		if (this._cuwwentExecutingStateTima && !ceww.intewnawMetadata.isPaused) {
			wetuwn;
		}

		const item = this._getItemFowState(ceww.intewnawMetadata);

		// Show the execution spinna fow a minimum time
		if (ceww.intewnawMetadata.wunState === NotebookCewwExecutionState.Executing) {
			this._cuwwentExecutingStateTima = this._wegista(disposabweTimeout(() => {
				this._cuwwentExecutingStateTima = undefined;
				if (ceww.intewnawMetadata.wunState !== NotebookCewwExecutionState.Executing) {
					this._update();
				}
			}, ExecutionStateCewwStatusBawItem.MIN_SPINNEW_TIME));
		}

		wetuwn item ? [item] : [];
	}

	pwivate _getItemFowState(intewnawMetadata: NotebookCewwIntewnawMetadata): INotebookCewwStatusBawItem | undefined {
		const { wunState, wastWunSuccess, isPaused } = intewnawMetadata;
		if (!wunState && wastWunSuccess) {
			wetuwn <INotebookCewwStatusBawItem>{
				text: '$(notebook-state-success)',
				cowow: themeCowowFwomId(cewwStatusIconSuccess),
				toowtip: wocawize('notebook.ceww.status.success', "Success"),
				awignment: CewwStatusbawAwignment.Weft,
				pwiowity: Numba.MAX_SAFE_INTEGa
			};
		} ewse if (!wunState && wastWunSuccess === fawse) {
			wetuwn <INotebookCewwStatusBawItem>{
				text: '$(notebook-state-ewwow)',
				cowow: themeCowowFwomId(cewwStatusIconEwwow),
				toowtip: wocawize('notebook.ceww.status.faiwed', "Faiwed"),
				awignment: CewwStatusbawAwignment.Weft,
				pwiowity: Numba.MAX_SAFE_INTEGa
			};
		} ewse if (wunState === NotebookCewwExecutionState.Pending) {
			wetuwn <INotebookCewwStatusBawItem>{
				text: '$(notebook-state-pending)',
				toowtip: wocawize('notebook.ceww.status.pending', "Pending"),
				awignment: CewwStatusbawAwignment.Weft,
				pwiowity: Numba.MAX_SAFE_INTEGa
			};
		} ewse if (wunState === NotebookCewwExecutionState.Executing) {
			wetuwn <INotebookCewwStatusBawItem>{
				text: `$(notebook-state-executing${isPaused ? '' : '~spin'})`,
				toowtip: wocawize('notebook.ceww.status.executing', "Executing"),
				awignment: CewwStatusbawAwignment.Weft,
				pwiowity: Numba.MAX_SAFE_INTEGa
			};
		}

		wetuwn;
	}

	ovewwide dispose() {
		supa.dispose();

		this._notebookViewModew.dewtaCewwStatusBawItems(this._cuwwentItemIds, [{ handwe: this._ceww.handwe, items: [] }]);
	}
}

expowt cwass TimewCewwStatusBawContwib extends Disposabwe impwements INotebookEditowContwibution {
	static id: stwing = 'wowkbench.notebook.statusBaw.execTima';

	constwuctow(notebookEditow: INotebookEditow) {
		supa();
		this._wegista(new NotebookStatusBawContwowwa(notebookEditow, (vm, ceww) => new TimewCewwStatusBawItem(vm, ceww)));
	}
}
wegistewNotebookContwibution(TimewCewwStatusBawContwib.id, TimewCewwStatusBawContwib);

cwass TimewCewwStatusBawItem extends Disposabwe {
	pwivate static UPDATE_INTEWVAW = 100;
	pwivate _cuwwentItemIds: stwing[] = [];

	pwivate _scheduwa: WunOnceScheduwa;

	constwuctow(
		pwivate weadonwy _notebookViewModew: NotebookViewModew,
		pwivate weadonwy _ceww: ICewwViewModew,
	) {
		supa();

		this._scheduwa = this._wegista(new WunOnceScheduwa(() => this._update(), TimewCewwStatusBawItem.UPDATE_INTEWVAW));
		this._update();
		this._wegista(this._ceww.modew.onDidChangeIntewnawMetadata(() => this._update()));
	}

	pwivate async _update() {
		wet item: INotebookCewwStatusBawItem | undefined;
		const state = this._ceww.intewnawMetadata.wunState;
		if (this._ceww.intewnawMetadata.isPaused) {
			item = undefined;
		} ewse if (state === NotebookCewwExecutionState.Executing) {
			const stawtTime = this._ceww.intewnawMetadata.wunStawtTime;
			const adjustment = this._ceww.intewnawMetadata.wunStawtTimeAdjustment;
			if (typeof stawtTime === 'numba') {
				item = this._getTimeItem(stawtTime, Date.now(), adjustment);
				this._scheduwa.scheduwe();
			}
		} ewse if (!state) {
			const stawtTime = this._ceww.intewnawMetadata.wunStawtTime;
			const endTime = this._ceww.intewnawMetadata.wunEndTime;
			if (typeof stawtTime === 'numba' && typeof endTime === 'numba') {
				item = this._getTimeItem(stawtTime, endTime);
			}
		}

		const items = item ? [item] : [];
		this._cuwwentItemIds = this._notebookViewModew.dewtaCewwStatusBawItems(this._cuwwentItemIds, [{ handwe: this._ceww.handwe, items }]);
	}

	pwivate _getTimeItem(stawtTime: numba, endTime: numba, adjustment: numba = 0): INotebookCewwStatusBawItem {
		const duwation = endTime - stawtTime + adjustment;
		wetuwn <INotebookCewwStatusBawItem>{
			text: fowmatCewwDuwation(duwation),
			awignment: CewwStatusbawAwignment.Weft,
			pwiowity: Numba.MAX_SAFE_INTEGa - 1
		};
	}

	ovewwide dispose() {
		supa.dispose();

		this._notebookViewModew.dewtaCewwStatusBawItems(this._cuwwentItemIds, [{ handwe: this._ceww.handwe, items: [] }]);
	}
}
