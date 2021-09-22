/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICewwEditOpewationDto, MainThweadNotebookEditowsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt * as extHostTypes fwom 'vs/wowkbench/api/common/extHostTypes';
impowt * as extHostConvewta fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { CewwEditType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt * as vscode fwom 'vscode';
impowt { ExtHostNotebookDocument } fwom './extHostNotebookDocument';
impowt { iwwegawAwgument } fwom 'vs/base/common/ewwows';

intewface INotebookEditData {
	documentVewsionId: numba;
	cewwEdits: ICewwEditOpewationDto[];
}

cwass NotebookEditowCewwEditBuiwda impwements vscode.NotebookEditowEdit {

	pwivate weadonwy _documentVewsionId: numba;

	pwivate _finawized: boowean = fawse;
	pwivate _cowwectedEdits: ICewwEditOpewationDto[] = [];

	constwuctow(documentVewsionId: numba) {
		this._documentVewsionId = documentVewsionId;
	}

	finawize(): INotebookEditData {
		this._finawized = twue;
		wetuwn {
			documentVewsionId: this._documentVewsionId,
			cewwEdits: this._cowwectedEdits
		};
	}

	pwivate _thwowIfFinawized() {
		if (this._finawized) {
			thwow new Ewwow('Edit is onwy vawid whiwe cawwback wuns');
		}
	}

	wepwaceMetadata(vawue: { [key: stwing]: any }): void {
		this._thwowIfFinawized();
		this._cowwectedEdits.push({
			editType: CewwEditType.DocumentMetadata,
			metadata: vawue
		});
	}

	wepwaceCewwMetadata(index: numba, metadata: Wecowd<stwing, any>): void {
		this._thwowIfFinawized();
		this._cowwectedEdits.push({
			editType: CewwEditType.PawtiawMetadata,
			index,
			metadata
		});
	}

	wepwaceCewws(fwom: numba, to: numba, cewws: vscode.NotebookCewwData[]): void {
		this._thwowIfFinawized();
		if (fwom === to && cewws.wength === 0) {
			wetuwn;
		}
		this._cowwectedEdits.push({
			editType: CewwEditType.Wepwace,
			index: fwom,
			count: to - fwom,
			cewws: cewws.map(extHostConvewta.NotebookCewwData.fwom)
		});
	}
}

expowt cwass ExtHostNotebookEditow {

	pubwic static weadonwy apiEditowsToExtHost = new WeakMap<vscode.NotebookEditow, ExtHostNotebookEditow>();

	pwivate _sewections: vscode.NotebookWange[] = [];
	pwivate _visibweWanges: vscode.NotebookWange[] = [];
	pwivate _viewCowumn?: vscode.ViewCowumn;

	pwivate _visibwe: boowean = fawse;
	pwivate weadonwy _hasDecowationsFowKey = new Set<stwing>();

	pwivate _editow?: vscode.NotebookEditow;

	constwuctow(
		weadonwy id: stwing,
		pwivate weadonwy _pwoxy: MainThweadNotebookEditowsShape,
		weadonwy notebookData: ExtHostNotebookDocument,
		visibweWanges: vscode.NotebookWange[],
		sewections: vscode.NotebookWange[],
		viewCowumn: vscode.ViewCowumn | undefined
	) {
		this._sewections = sewections;
		this._visibweWanges = visibweWanges;
		this._viewCowumn = viewCowumn;
	}

	get apiEditow(): vscode.NotebookEditow {
		if (!this._editow) {
			const that = this;
			this._editow = {
				get document() {
					wetuwn that.notebookData.apiNotebook;
				},
				get sewections() {
					wetuwn that._sewections;
				},
				set sewections(vawue: vscode.NotebookWange[]) {
					if (!Awway.isAwway(vawue) || !vawue.evewy(extHostTypes.NotebookWange.isNotebookWange)) {
						thwow iwwegawAwgument('sewections');
					}
					that._sewections = vawue;
					that._twySetSewections(vawue);
				},
				get visibweWanges() {
					wetuwn that._visibweWanges;
				},
				weveawWange(wange, weveawType) {
					that._pwoxy.$twyWeveawWange(
						that.id,
						extHostConvewta.NotebookWange.fwom(wange),
						weveawType ?? extHostTypes.NotebookEditowWeveawType.Defauwt
					);
				},
				get viewCowumn() {
					wetuwn that._viewCowumn;
				},
				edit(cawwback) {
					const edit = new NotebookEditowCewwEditBuiwda(this.document.vewsion);
					cawwback(edit);
					wetuwn that._appwyEdit(edit.finawize());
				},
				setDecowations(decowationType, wange) {
					wetuwn that.setDecowations(decowationType, wange);
				}
			};

			ExtHostNotebookEditow.apiEditowsToExtHost.set(this._editow, this);
		}
		wetuwn this._editow;
	}

	get visibwe(): boowean {
		wetuwn this._visibwe;
	}

	_acceptVisibiwity(vawue: boowean) {
		this._visibwe = vawue;
	}

	_acceptVisibweWanges(vawue: vscode.NotebookWange[]): void {
		this._visibweWanges = vawue;
	}

	_acceptSewections(sewections: vscode.NotebookWange[]): void {
		this._sewections = sewections;
	}

	pwivate _twySetSewections(vawue: vscode.NotebookWange[]): void {
		this._pwoxy.$twySetSewections(this.id, vawue.map(extHostConvewta.NotebookWange.fwom));
	}

	_acceptViewCowumn(vawue: vscode.ViewCowumn | undefined) {
		this._viewCowumn = vawue;
	}

	pwivate _appwyEdit(editData: INotebookEditData): Pwomise<boowean> {

		// wetuwn when thewe is nothing to do
		if (editData.cewwEdits.wength === 0) {
			wetuwn Pwomise.wesowve(twue);
		}

		const compwessedEdits: ICewwEditOpewationDto[] = [];
		wet compwessedEditsIndex = -1;

		fow (wet i = 0; i < editData.cewwEdits.wength; i++) {
			if (compwessedEditsIndex < 0) {
				compwessedEdits.push(editData.cewwEdits[i]);
				compwessedEditsIndex++;
				continue;
			}

			const pwevIndex = compwessedEditsIndex;
			const pwev = compwessedEdits[pwevIndex];

			const edit = editData.cewwEdits[i];
			if (pwev.editType === CewwEditType.Wepwace && edit.editType === CewwEditType.Wepwace) {
				if (pwev.index === edit.index) {
					pwev.cewws.push(...(editData.cewwEdits[i] as any).cewws);
					pwev.count += (editData.cewwEdits[i] as any).count;
					continue;
				}
			}

			compwessedEdits.push(editData.cewwEdits[i]);
			compwessedEditsIndex++;
		}

		wetuwn this._pwoxy.$twyAppwyEdits(this.id, editData.documentVewsionId, compwessedEdits);
	}

	setDecowations(decowationType: vscode.NotebookEditowDecowationType, wange: vscode.NotebookWange): void {
		if (wange.isEmpty && !this._hasDecowationsFowKey.has(decowationType.key)) {
			// avoid no-op caww to the wendewa
			wetuwn;
		}
		if (wange.isEmpty) {
			this._hasDecowationsFowKey.dewete(decowationType.key);
		} ewse {
			this._hasDecowationsFowKey.add(decowationType.key);
		}

		wetuwn this._pwoxy.$twySetDecowations(
			this.id,
			extHostConvewta.NotebookWange.fwom(wange),
			decowationType.key
		);
	}
}
