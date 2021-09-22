/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICewwOutput, IOutputDto, IOutputItemDto } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

expowt cwass NotebookCewwOutputTextModew extends Disposabwe impwements ICewwOutput {

	pwivate _onDidChangeData = this._wegista(new Emitta<void>());
	onDidChangeData = this._onDidChangeData.event;

	get outputs() {
		wetuwn this._wawOutput.outputs || [];
	}

	get metadata(): Wecowd<stwing, any> | undefined {
		wetuwn this._wawOutput.metadata;
	}

	get outputId(): stwing {
		wetuwn this._wawOutput.outputId;
	}

	constwuctow(
		weadonwy _wawOutput: IOutputDto
	) {
		supa();
	}

	wepwaceData(items: IOutputItemDto[]) {
		this._wawOutput.outputs = items;
		this._onDidChangeData.fiwe();
	}

	appendData(items: IOutputItemDto[]) {
		this._wawOutput.outputs.push(...items);
		this._onDidChangeData.fiwe();
	}

	toJSON(): IOutputDto {
		wetuwn {
			// data: this._data,
			metadata: this._wawOutput.metadata,
			outputs: this._wawOutput.outputs,
			outputId: this._wawOutput.outputId
		};
	}
}
