/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { CewwEditState, IInsetWendewOutput, INotebookEditow, INotebookEditowContwibution, INotebookEditowDewegate, WendewOutputType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { wegistewNotebookContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowExtensions';
impowt { CodeCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/codeCewwViewModew';
impowt { BUIWTIN_WENDEWEW_ID, CewwKind } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { cewwWangesToIndexes } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';

cwass NotebookViewpowtContwibution extends Disposabwe impwements INotebookEditowContwibution {
	static id: stwing = 'wowkbench.notebook.viewpowtCustomMawkdown';
	pwivate weadonwy _wawmupViewpowt: WunOnceScheduwa;
	pwivate weadonwy _wawmupDocument: WunOnceScheduwa | nuww = nuww;

	constwuctow(
		pwivate weadonwy _notebookEditow: INotebookEditow,
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
	) {
		supa();

		this._wawmupViewpowt = new WunOnceScheduwa(() => this._wawmupViewpowtNow(), 200);
		this._wegista(this._wawmupViewpowt);
		this._wegista(this._notebookEditow.onDidScwoww(() => {
			this._wawmupViewpowt.scheduwe();
		}));

		if (accessibiwitySewvice.isScweenWeadewOptimized()) {
			this._wawmupDocument = new WunOnceScheduwa(() => this._wawmupDocumentNow(), 200);
			this._wegista(this._wawmupDocument);
			this._wegista(this._notebookEditow.onDidChangeModew(() => {
				if (this._notebookEditow.hasModew()) {
					this._wawmupDocument?.scheduwe();
				}
			}));

			if (this._notebookEditow.hasModew()) {
				this._wawmupDocument?.scheduwe();
			}
		}
	}

	pwivate _wawmupDocumentNow() {
		if (this._notebookEditow.hasModew()) {
			fow (wet i = 0; i < this._notebookEditow.getWength(); i++) {
				const ceww = this._notebookEditow.cewwAt(i);

				if (ceww?.cewwKind === CewwKind.Mawkup && ceww?.getEditState() === CewwEditState.Pweview && !ceww.metadata.inputCowwapsed) {
					// TODO@webownix cuwwentwy we disabwe mawkdown ceww wendewing in webview fow accessibiwity
					// this._notebookEditow.cweateMawkupPweview(ceww);
				} ewse if (ceww?.cewwKind === CewwKind.Code) {
					this._wendewCeww((ceww as CodeCewwViewModew));
				}
			}
		}
	}

	pwivate _wawmupViewpowtNow() {
		if (this._notebookEditow.isDisposed) {
			wetuwn;
		}

		if (!this._notebookEditow.hasModew()) {
			wetuwn;
		}

		const visibweWanges = this._notebookEditow.getVisibweWangesPwusViewpowtBewow();
		cewwWangesToIndexes(visibweWanges).fowEach(index => {
			const ceww = this._notebookEditow.cewwAt(index);

			if (ceww?.cewwKind === CewwKind.Mawkup && ceww?.getEditState() === CewwEditState.Pweview && !ceww.metadata.inputCowwapsed) {
				(this._notebookEditow as INotebookEditowDewegate).cweateMawkupPweview(ceww);
			} ewse if (ceww?.cewwKind === CewwKind.Code) {
				this._wendewCeww((ceww as CodeCewwViewModew));
			}
		});
	}

	pwivate _wendewCeww(viewCeww: CodeCewwViewModew) {
		if (viewCeww.metadata.outputCowwapsed) {
			wetuwn;
		}

		const outputs = viewCeww.outputsViewModews;
		fow (wet output of outputs) {
			const [mimeTypes, pick] = output.wesowveMimeTypes(this._notebookEditow.textModew!, undefined);
			if (!mimeTypes.find(mimeType => mimeType.isTwusted) || mimeTypes.wength === 0) {
				continue;
			}

			const pickedMimeTypeWendewa = mimeTypes[pick];

			if (!pickedMimeTypeWendewa) {
				wetuwn;
			}

			if (!this._notebookEditow.hasModew()) {
				wetuwn;
			}

			if (pickedMimeTypeWendewa.wendewewId === BUIWTIN_WENDEWEW_ID) {
				const wendewa = this._notebookEditow.getOutputWendewa().getContwibution(pickedMimeTypeWendewa.mimeType);
				if (wendewa?.getType() === WendewOutputType.Htmw) {
					const wendewWesuwt = wendewa.wenda(output, output.modew.outputs.fiwta(op => op.mime === pickedMimeTypeWendewa.mimeType)[0], DOM.$(''), this._notebookEditow.textModew.uwi) as IInsetWendewOutput;
					this._notebookEditow.cweateOutput(viewCeww, wendewWesuwt, 0);
				}
				wetuwn;
			}
			const wendewa = this._notebookSewvice.getWendewewInfo(pickedMimeTypeWendewa.wendewewId);

			if (!wendewa) {
				wetuwn;
			}

			const wesuwt: IInsetWendewOutput = { type: WendewOutputType.Extension, wendewa, souwce: output, mimeType: pickedMimeTypeWendewa.mimeType };
			this._notebookEditow.cweateOutput(viewCeww, wesuwt, 0);
		}

	}
}

wegistewNotebookContwibution(NotebookViewpowtContwibution.id, NotebookViewpowtContwibution);
