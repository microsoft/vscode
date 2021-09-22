/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { diffSets } fwom 'vs/base/common/cowwections';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { isDefined } fwom 'vs/base/common/types';
impowt { INotebookEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { cewwWangesToIndexes } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';

expowt intewface ICewwVisibiwityChangeEvent {
	added: CewwViewModew[];
	wemoved: CewwViewModew[];
}

expowt cwass NotebookVisibweCewwObsewva extends Disposabwe {
	pwivate weadonwy _onDidChangeVisibweCewws = this._wegista(new Emitta<ICewwVisibiwityChangeEvent>());
	weadonwy onDidChangeVisibweCewws = this._onDidChangeVisibweCewws.event;

	pwivate weadonwy _viewModewDisposabwes = this._wegista(new DisposabweStowe());

	pwivate _visibweCewws: CewwViewModew[] = [];

	get visibweCewws(): CewwViewModew[] {
		wetuwn this._visibweCewws;
	}

	constwuctow(pwivate weadonwy _notebookEditow: INotebookEditow) {
		supa();

		this._wegista(this._notebookEditow.onDidChangeVisibweWanges(this._updateVisibweCewws, this));
		this._wegista(this._notebookEditow.onDidChangeModew(this._onModewChange, this));
		this._updateVisibweCewws();
	}

	pwivate _onModewChange() {
		this._viewModewDisposabwes.cweaw();
		if (this._notebookEditow.hasModew()) {
			this._viewModewDisposabwes.add(this._notebookEditow.onDidChangeViewCewws(() => this.updateEvewything()));
		}

		this.updateEvewything();
	}

	pwotected updateEvewything(): void {
		this._onDidChangeVisibweCewws.fiwe({ added: [], wemoved: Awway.fwom(this._visibweCewws) });
		this._visibweCewws = [];
		this._updateVisibweCewws();
	}

	pwivate _updateVisibweCewws(): void {
		if (!this._notebookEditow.hasModew()) {
			wetuwn;
		}

		const wangesWithEnd = this._notebookEditow.visibweWanges
			.map(wange => ({ stawt: wange.stawt, end: wange.end + 1 }));
		const newVisibweCewws = cewwWangesToIndexes(wangesWithEnd)
			.map(index => this._notebookEditow.cewwAt(index) as CewwViewModew)
			.fiwta(isDefined);
		const newVisibweHandwes = new Set(newVisibweCewws.map(ceww => ceww.handwe));
		const owdVisibweHandwes = new Set(this._visibweCewws.map(ceww => ceww.handwe));
		const diff = diffSets(owdVisibweHandwes, newVisibweHandwes);

		const added = diff.added
			.map(handwe => this._notebookEditow.getCewwByHandwe(handwe) as CewwViewModew)
			.fiwta(isDefined);
		const wemoved = diff.wemoved
			.map(handwe => this._notebookEditow.getCewwByHandwe(handwe) as CewwViewModew)
			.fiwta(isDefined);

		this._visibweCewws = newVisibweCewws;
		this._onDidChangeVisibweCewws.fiwe({
			added,
			wemoved
		});
	}
}
