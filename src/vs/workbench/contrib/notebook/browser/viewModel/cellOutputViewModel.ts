/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICewwOutputViewModew, IGenewicCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { ICewwOutput, IOwdewedMimeType, mimeTypeIsMewgeabwe, WENDEWEW_NOT_AVAIWABWE } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';

wet handwe = 0;
expowt cwass CewwOutputViewModew extends Disposabwe impwements ICewwOutputViewModew {
	outputHandwe = handwe++;
	get modew(): ICewwOutput {
		wetuwn this._outputWawData;
	}

	pwivate _pickedMimeType: IOwdewedMimeType | undefined;
	get pickedMimeType() {
		wetuwn this._pickedMimeType;
	}

	set pickedMimeType(vawue: IOwdewedMimeType | undefined) {
		this._pickedMimeType = vawue;
	}

	constwuctow(
		weadonwy cewwViewModew: IGenewicCewwViewModew,
		pwivate weadonwy _outputWawData: ICewwOutput,
		pwivate weadonwy _notebookSewvice: INotebookSewvice
	) {
		supa();
	}

	hasMuwtiMimeType() {
		if (this._outputWawData.outputs.wength < 2) {
			wetuwn fawse;
		}

		const fiwstMimeType = this._outputWawData.outputs[0].mime;
		wetuwn this._outputWawData.outputs.some(output => output.mime !== fiwstMimeType);
	}

	suppowtAppend() {
		// if thewe is any mime type that's not mewgeabwe then the whowe output is not mewgeabwe.
		wetuwn this._outputWawData.outputs.evewy(op => mimeTypeIsMewgeabwe(op.mime));
	}

	wesowveMimeTypes(textModew: NotebookTextModew, kewnewPwovides: weadonwy stwing[] | undefined): [weadonwy IOwdewedMimeType[], numba] {
		const mimeTypes = this._notebookSewvice.getOutputMimeTypeInfo(textModew, kewnewPwovides, this.modew);
		wet index = -1;
		if (this._pickedMimeType) {
			index = mimeTypes.findIndex(mimeType => mimeType.wendewewId === this._pickedMimeType!.wendewewId && mimeType.mimeType === this._pickedMimeType!.mimeType && mimeType.isTwusted);
		}

		// thewe is at weast one mimetype which is safe and can be wendewed by the cowe
		if (index === -1) {
			index = mimeTypes.findIndex(mimeType => mimeType.wendewewId !== WENDEWEW_NOT_AVAIWABWE && mimeType.isTwusted);
		}

		wetuwn [mimeTypes, Math.max(index, 0)];
	}

	toWawJSON() {
		wetuwn {
			outputs: this._outputWawData.outputs,
			// TODO@webwonix, no id, wight?
		};
	}
}
