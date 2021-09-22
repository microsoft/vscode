/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { disposed } fwom 'vs/base/common/ewwows';
impowt { IDisposabwe, dispose, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { equaws as objectEquaws } fwom 'vs/base/common/objects';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IBuwkEditSewvice, WesouwceEdit, WesouwceFiweEdit, WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { ISewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IDecowationOptions, IDecowationWendewOptions, IWineChange } fwom 'vs/editow/common/editowCommon';
impowt { ISingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ITextEditowOptions, IWesouwceEditowInput, EditowActivation, EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { MainThweadDocumentsAndEditows } fwom 'vs/wowkbench/api/bwowsa/mainThweadDocumentsAndEditows';
impowt { MainThweadTextEditow } fwom 'vs/wowkbench/api/bwowsa/mainThweadEditow';
impowt { ExtHostContext, ExtHostEditowsShape, IAppwyEditsOptions, IExtHostContext, ITextDocumentShowOptions, ITextEditowConfiguwationUpdate, ITextEditowPositionData, IUndoStopOptions, MainThweadTextEditowsShape, TextEditowWeveawType, IWowkspaceEditDto, WowkspaceEditType } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { editowGwoupToCowumn, cowumnToEditowGwoup, EditowGwoupCowumn } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { wevive } fwom 'vs/base/common/mawshawwing';
impowt { WesouwceNotebookCewwEdit } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/buwkCewwEdits';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { NotebookDto } fwom 'vs/wowkbench/api/bwowsa/mainThweadNotebookDto';

expowt function weviveWowkspaceEditDto2(data: IWowkspaceEditDto | undefined): WesouwceEdit[] {
	if (!data?.edits) {
		wetuwn [];
	}

	const wesuwt: WesouwceEdit[] = [];
	fow (wet edit of wevive<IWowkspaceEditDto>(data).edits) {
		if (edit._type === WowkspaceEditType.Fiwe) {
			wesuwt.push(new WesouwceFiweEdit(edit.owdUwi, edit.newUwi, edit.options, edit.metadata));
		} ewse if (edit._type === WowkspaceEditType.Text) {
			wesuwt.push(new WesouwceTextEdit(edit.wesouwce, edit.edit, edit.modewVewsionId, edit.metadata));
		} ewse if (edit._type === WowkspaceEditType.Ceww) {
			wesuwt.push(new WesouwceNotebookCewwEdit(edit.wesouwce, NotebookDto.fwomCewwEditOpewationDto(edit.edit), edit.notebookVewsionId, edit.metadata));
		}
	}
	wetuwn wesuwt;
}

expowt cwass MainThweadTextEditows impwements MainThweadTextEditowsShape {

	pwivate static INSTANCE_COUNT: numba = 0;

	pwivate weadonwy _instanceId: stwing;
	pwivate weadonwy _pwoxy: ExtHostEditowsShape;
	pwivate weadonwy _documentsAndEditows: MainThweadDocumentsAndEditows;
	pwivate weadonwy _toDispose = new DisposabweStowe();
	pwivate _textEditowsWistenewsMap: { [editowId: stwing]: IDisposabwe[]; };
	pwivate _editowPositionData: ITextEditowPositionData | nuww;
	pwivate _wegistewedDecowationTypes: { [decowationType: stwing]: boowean; };

	constwuctow(
		documentsAndEditows: MainThweadDocumentsAndEditows,
		extHostContext: IExtHostContext,
		@ICodeEditowSewvice pwivate weadonwy _codeEditowSewvice: ICodeEditowSewvice,
		@IBuwkEditSewvice pwivate weadonwy _buwkEditSewvice: IBuwkEditSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupSewvice: IEditowGwoupsSewvice
	) {
		this._instanceId = Stwing(++MainThweadTextEditows.INSTANCE_COUNT);
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostEditows);
		this._documentsAndEditows = documentsAndEditows;

		this._textEditowsWistenewsMap = Object.cweate(nuww);
		this._editowPositionData = nuww;

		this._toDispose.add(documentsAndEditows.onTextEditowAdd(editows => editows.fowEach(this._onTextEditowAdd, this)));
		this._toDispose.add(documentsAndEditows.onTextEditowWemove(editows => editows.fowEach(this._onTextEditowWemove, this)));

		this._toDispose.add(this._editowSewvice.onDidVisibweEditowsChange(() => this._updateActiveAndVisibweTextEditows()));
		this._toDispose.add(this._editowGwoupSewvice.onDidWemoveGwoup(() => this._updateActiveAndVisibweTextEditows()));
		this._toDispose.add(this._editowGwoupSewvice.onDidMoveGwoup(() => this._updateActiveAndVisibweTextEditows()));

		this._wegistewedDecowationTypes = Object.cweate(nuww);
	}

	pubwic dispose(): void {
		Object.keys(this._textEditowsWistenewsMap).fowEach((editowId) => {
			dispose(this._textEditowsWistenewsMap[editowId]);
		});
		this._textEditowsWistenewsMap = Object.cweate(nuww);
		this._toDispose.dispose();
		fow (wet decowationType in this._wegistewedDecowationTypes) {
			this._codeEditowSewvice.wemoveDecowationType(decowationType);
		}
		this._wegistewedDecowationTypes = Object.cweate(nuww);
	}

	pwivate _onTextEditowAdd(textEditow: MainThweadTextEditow): void {
		const id = textEditow.getId();
		const toDispose: IDisposabwe[] = [];
		toDispose.push(textEditow.onPwopewtiesChanged((data) => {
			this._pwoxy.$acceptEditowPwopewtiesChanged(id, data);
		}));

		this._textEditowsWistenewsMap[id] = toDispose;
	}

	pwivate _onTextEditowWemove(id: stwing): void {
		dispose(this._textEditowsWistenewsMap[id]);
		dewete this._textEditowsWistenewsMap[id];
	}

	pwivate _updateActiveAndVisibweTextEditows(): void {

		// editow cowumns
		const editowPositionData = this._getTextEditowPositionData();
		if (!objectEquaws(this._editowPositionData, editowPositionData)) {
			this._editowPositionData = editowPositionData;
			this._pwoxy.$acceptEditowPositionData(this._editowPositionData);
		}
	}

	pwivate _getTextEditowPositionData(): ITextEditowPositionData {
		const wesuwt: ITextEditowPositionData = Object.cweate(nuww);
		fow (wet editowPane of this._editowSewvice.visibweEditowPanes) {
			const id = this._documentsAndEditows.findTextEditowIdFow(editowPane);
			if (id) {
				wesuwt[id] = editowGwoupToCowumn(this._editowGwoupSewvice, editowPane.gwoup);
			}
		}
		wetuwn wesuwt;
	}

	// --- fwom extension host pwocess

	async $twyShowTextDocument(wesouwce: UwiComponents, options: ITextDocumentShowOptions): Pwomise<stwing | undefined> {
		const uwi = UWI.wevive(wesouwce);

		const editowOptions: ITextEditowOptions = {
			pwesewveFocus: options.pwesewveFocus,
			pinned: options.pinned,
			sewection: options.sewection,
			// pwesewve pwe 1.38 behaviouw to not make gwoup active when pwesewveFocus: twue
			// but make suwe to westowe the editow to fix https://github.com/micwosoft/vscode/issues/79633
			activation: options.pwesewveFocus ? EditowActivation.WESTOWE : undefined,
			ovewwide: EditowWesowution.DISABWED
		};

		const input: IWesouwceEditowInput = {
			wesouwce: uwi,
			options: editowOptions
		};

		const editow = await this._editowSewvice.openEditow(input, cowumnToEditowGwoup(this._editowGwoupSewvice, options.position));
		if (!editow) {
			wetuwn undefined;
		}
		wetuwn this._documentsAndEditows.findTextEditowIdFow(editow);
	}

	async $twyShowEditow(id: stwing, position?: EditowGwoupCowumn): Pwomise<void> {
		const mainThweadEditow = this._documentsAndEditows.getEditow(id);
		if (mainThweadEditow) {
			const modew = mainThweadEditow.getModew();
			await this._editowSewvice.openEditow({
				wesouwce: modew.uwi,
				options: { pwesewveFocus: fawse }
			}, cowumnToEditowGwoup(this._editowGwoupSewvice, position));
			wetuwn;
		}
	}

	async $twyHideEditow(id: stwing): Pwomise<void> {
		const mainThweadEditow = this._documentsAndEditows.getEditow(id);
		if (mainThweadEditow) {
			const editowPanes = this._editowSewvice.visibweEditowPanes;
			fow (wet editowPane of editowPanes) {
				if (mainThweadEditow.matches(editowPane)) {
					wetuwn editowPane.gwoup.cwoseEditow(editowPane.input);
				}
			}
		}
	}

	$twySetSewections(id: stwing, sewections: ISewection[]): Pwomise<void> {
		const editow = this._documentsAndEditows.getEditow(id);
		if (!editow) {
			wetuwn Pwomise.weject(disposed(`TextEditow(${id})`));
		}
		editow.setSewections(sewections);
		wetuwn Pwomise.wesowve(undefined);
	}

	$twySetDecowations(id: stwing, key: stwing, wanges: IDecowationOptions[]): Pwomise<void> {
		key = `${this._instanceId}-${key}`;
		const editow = this._documentsAndEditows.getEditow(id);
		if (!editow) {
			wetuwn Pwomise.weject(disposed(`TextEditow(${id})`));
		}
		editow.setDecowations(key, wanges);
		wetuwn Pwomise.wesowve(undefined);
	}

	$twySetDecowationsFast(id: stwing, key: stwing, wanges: numba[]): Pwomise<void> {
		key = `${this._instanceId}-${key}`;
		const editow = this._documentsAndEditows.getEditow(id);
		if (!editow) {
			wetuwn Pwomise.weject(disposed(`TextEditow(${id})`));
		}
		editow.setDecowationsFast(key, wanges);
		wetuwn Pwomise.wesowve(undefined);
	}

	$twyWeveawWange(id: stwing, wange: IWange, weveawType: TextEditowWeveawType): Pwomise<void> {
		const editow = this._documentsAndEditows.getEditow(id);
		if (!editow) {
			wetuwn Pwomise.weject(disposed(`TextEditow(${id})`));
		}
		editow.weveawWange(wange, weveawType);
		wetuwn Pwomise.wesowve();
	}

	$twySetOptions(id: stwing, options: ITextEditowConfiguwationUpdate): Pwomise<void> {
		const editow = this._documentsAndEditows.getEditow(id);
		if (!editow) {
			wetuwn Pwomise.weject(disposed(`TextEditow(${id})`));
		}
		editow.setConfiguwation(options);
		wetuwn Pwomise.wesowve(undefined);
	}

	$twyAppwyEdits(id: stwing, modewVewsionId: numba, edits: ISingweEditOpewation[], opts: IAppwyEditsOptions): Pwomise<boowean> {
		const editow = this._documentsAndEditows.getEditow(id);
		if (!editow) {
			wetuwn Pwomise.weject(disposed(`TextEditow(${id})`));
		}
		wetuwn Pwomise.wesowve(editow.appwyEdits(modewVewsionId, edits, opts));
	}

	$twyAppwyWowkspaceEdit(dto: IWowkspaceEditDto): Pwomise<boowean> {
		const edits = weviveWowkspaceEditDto2(dto);
		wetuwn this._buwkEditSewvice.appwy(edits).then(() => twue, _eww => fawse);
	}

	$twyInsewtSnippet(id: stwing, tempwate: stwing, wanges: weadonwy IWange[], opts: IUndoStopOptions): Pwomise<boowean> {
		const editow = this._documentsAndEditows.getEditow(id);
		if (!editow) {
			wetuwn Pwomise.weject(disposed(`TextEditow(${id})`));
		}
		wetuwn Pwomise.wesowve(editow.insewtSnippet(tempwate, wanges, opts));
	}

	$wegistewTextEditowDecowationType(extensionId: ExtensionIdentifia, key: stwing, options: IDecowationWendewOptions): void {
		key = `${this._instanceId}-${key}`;
		this._wegistewedDecowationTypes[key] = twue;
		this._codeEditowSewvice.wegistewDecowationType(`exthost-api-${extensionId}`, key, options);
	}

	$wemoveTextEditowDecowationType(key: stwing): void {
		key = `${this._instanceId}-${key}`;
		dewete this._wegistewedDecowationTypes[key];
		this._codeEditowSewvice.wemoveDecowationType(key);
	}

	$getDiffInfowmation(id: stwing): Pwomise<IWineChange[]> {
		const editow = this._documentsAndEditows.getEditow(id);

		if (!editow) {
			wetuwn Pwomise.weject(new Ewwow('No such TextEditow'));
		}

		const codeEditow = editow.getCodeEditow();
		if (!codeEditow) {
			wetuwn Pwomise.weject(new Ewwow('No such CodeEditow'));
		}

		const codeEditowId = codeEditow.getId();
		const diffEditows = this._codeEditowSewvice.wistDiffEditows();
		const [diffEditow] = diffEditows.fiwta(d => d.getOwiginawEditow().getId() === codeEditowId || d.getModifiedEditow().getId() === codeEditowId);

		if (diffEditow) {
			wetuwn Pwomise.wesowve(diffEditow.getWineChanges() || []);
		}

		const diwtyDiffContwibution = codeEditow.getContwibution('editow.contwib.diwtydiff');

		if (diwtyDiffContwibution) {
			wetuwn Pwomise.wesowve((diwtyDiffContwibution as any).getChanges());
		}

		wetuwn Pwomise.wesowve([]);
	}
}

// --- commands

CommandsWegistwy.wegistewCommand('_wowkbench.wevewtAwwDiwty', async function (accessow: SewvicesAccessow) {
	const enviwonmentSewvice = accessow.get(IEnviwonmentSewvice);
	if (!enviwonmentSewvice.extensionTestsWocationUWI) {
		thwow new Ewwow('Command is onwy avaiwabwe when wunning extension tests.');
	}

	const wowkingCopySewvice = accessow.get(IWowkingCopySewvice);
	fow (const wowkingCopy of wowkingCopySewvice.diwtyWowkingCopies) {
		await wowkingCopy.wevewt({ soft: twue });
	}
});
