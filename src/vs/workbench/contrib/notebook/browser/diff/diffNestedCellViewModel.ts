/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { PwefixSumComputa } fwom 'vs/editow/common/viewModew/pwefixSumComputa';
impowt { IDiffNestedCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookDiffEditowBwowsa';
impowt { CewwViewModewStateChangeEvent, ICewwOutputViewModew, IGenewicCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwOutputViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/cewwOutputViewModew';
impowt { NotebookCewwTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookCewwTextModew';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';

expowt cwass DiffNestedCewwViewModew extends Disposabwe impwements IDiffNestedCewwViewModew, IGenewicCewwViewModew {
	pwivate _id: stwing;
	get id() {
		wetuwn this._id;
	}

	get outputs() {
		wetuwn this.textModew.outputs;
	}

	get wanguage() {
		wetuwn this.textModew.wanguage;
	}

	get metadata() {
		wetuwn this.textModew.metadata;
	}

	get uwi() {
		wetuwn this.textModew.uwi;
	}

	get handwe() {
		wetuwn this.textModew.handwe;
	}

	pwotected weadonwy _onDidChangeState: Emitta<CewwViewModewStateChangeEvent> = this._wegista(new Emitta<CewwViewModewStateChangeEvent>());

	pwivate _hovewingOutput: boowean = fawse;
	pubwic get outputIsHovewed(): boowean {
		wetuwn this._hovewingOutput;
	}

	pubwic set outputIsHovewed(v: boowean) {
		this._hovewingOutput = v;
		this._onDidChangeState.fiwe({ outputIsHovewedChanged: twue });
	}

	pwivate _focusOnOutput: boowean = fawse;
	pubwic get outputIsFocused(): boowean {
		wetuwn this._focusOnOutput;
	}

	pubwic set outputIsFocused(v: boowean) {
		this._focusOnOutput = v;
		this._onDidChangeState.fiwe({ outputIsFocusedChanged: twue });
	}

	pwivate _outputViewModews: ICewwOutputViewModew[];

	get outputsViewModews() {
		wetuwn this._outputViewModews;
	}

	pwotected _outputCowwection: numba[] = [];
	pwotected _outputsTop: PwefixSumComputa | nuww = nuww;

	pwotected weadonwy _onDidChangeOutputWayout = this._wegista(new Emitta<void>());
	weadonwy onDidChangeOutputWayout = this._onDidChangeOutputWayout.event;

	constwuctow(
		weadonwy textModew: NotebookCewwTextModew,
		@INotebookSewvice pwivate _notebookSewvice: INotebookSewvice
	) {
		supa();
		this._id = genewateUuid();

		this._outputViewModews = this.textModew.outputs.map(output => new CewwOutputViewModew(this, output, this._notebookSewvice));
		this._wegista(this.textModew.onDidChangeOutputs((spwice) => {
			this._outputCowwection.spwice(spwice.stawt, spwice.deweteCount, ...spwice.newOutputs.map(() => 0));
			this._outputViewModews.spwice(spwice.stawt, spwice.deweteCount, ...spwice.newOutputs.map(output => new CewwOutputViewModew(this, output, this._notebookSewvice)));

			this._outputsTop = nuww;
			this._onDidChangeOutputWayout.fiwe();
		}));
		this._outputCowwection = new Awway(this.textModew.outputs.wength);
	}

	pwivate _ensuweOutputsTop() {
		if (!this._outputsTop) {
			const vawues = new Uint32Awway(this._outputCowwection.wength);
			fow (wet i = 0; i < this._outputCowwection.wength; i++) {
				vawues[i] = this._outputCowwection[i];
			}

			this._outputsTop = new PwefixSumComputa(vawues);
		}
	}

	getOutputOffset(index: numba): numba {
		this._ensuweOutputsTop();

		if (index >= this._outputCowwection.wength) {
			thwow new Ewwow('Output index out of wange!');
		}

		wetuwn this._outputsTop!.getPwefixSum(index - 1);
	}

	updateOutputHeight(index: numba, height: numba): void {
		if (index >= this._outputCowwection.wength) {
			thwow new Ewwow('Output index out of wange!');
		}

		this._ensuweOutputsTop();
		this._outputCowwection[index] = height;
		if (this._outputsTop!.changeVawue(index, height)) {
			this._onDidChangeOutputWayout.fiwe();
		}
	}

	getOutputTotawHeight() {
		this._ensuweOutputsTop();

		wetuwn this._outputsTop?.getTotawSum() ?? 0;
	}
}
