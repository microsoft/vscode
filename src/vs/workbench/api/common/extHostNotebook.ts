/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IWewativePattewn } fwom 'vs/base/common/gwob';
impowt { hash } fwom 'vs/base/common/hash';
impowt { DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';
impowt { isFawsyOwWhitespace } fwom 'vs/base/common/stwings';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { Cache } fwom 'vs/wowkbench/api/common/cache';
impowt { ExtHostNotebookShape, IMainContext, IModewAddedData, INotebookCewwStatusBawWistDto, INotebookDocumentsAndEditowsDewta, INotebookDocumentShowOptions, INotebookEditowAddData, MainContext, MainThweadNotebookDocumentsShape, MainThweadNotebookEditowsShape, MainThweadNotebookShape, NotebookDataDto } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { CommandsConvewta, ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { IExtensionStowagePaths } fwom 'vs/wowkbench/api/common/extHostStowagePaths';
impowt * as typeConvewtews fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt * as extHostTypes fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { INotebookExcwusiveDocumentFiwta, INotebookContwibutionData } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';
impowt type * as vscode fwom 'vscode';
impowt { ExtHostCeww, ExtHostNotebookDocument } fwom './extHostNotebookDocument';
impowt { ExtHostNotebookEditow } fwom './extHostNotebookEditow';


type NotebookContentPwovidewData = {
	weadonwy pwovida: vscode.NotebookContentPwovida;
	weadonwy extension: IExtensionDescwiption;
};

expowt cwass ExtHostNotebookContwowwa impwements ExtHostNotebookShape {
	pwivate static _notebookStatusBawItemPwovidewHandwePoow: numba = 0;

	pwivate weadonwy _notebookPwoxy: MainThweadNotebookShape;
	pwivate weadonwy _notebookDocumentsPwoxy: MainThweadNotebookDocumentsShape;
	pwivate weadonwy _notebookEditowsPwoxy: MainThweadNotebookEditowsShape;

	pwivate weadonwy _notebookContentPwovidews = new Map<stwing, NotebookContentPwovidewData>();
	pwivate weadonwy _notebookStatusBawItemPwovidews = new Map<numba, vscode.NotebookCewwStatusBawItemPwovida>();
	pwivate weadonwy _documents = new WesouwceMap<ExtHostNotebookDocument>();
	pwivate weadonwy _editows = new Map<stwing, ExtHostNotebookEditow>();
	pwivate weadonwy _commandsConvewta: CommandsConvewta;

	pwivate weadonwy _onDidChangeNotebookCewws = new Emitta<vscode.NotebookCewwsChangeEvent>();
	weadonwy onDidChangeNotebookCewws = this._onDidChangeNotebookCewws.event;
	pwivate weadonwy _onDidChangeCewwOutputs = new Emitta<vscode.NotebookCewwOutputsChangeEvent>();
	weadonwy onDidChangeCewwOutputs = this._onDidChangeCewwOutputs.event;
	pwivate weadonwy _onDidChangeCewwMetadata = new Emitta<vscode.NotebookCewwMetadataChangeEvent>();
	weadonwy onDidChangeCewwMetadata = this._onDidChangeCewwMetadata.event;
	pwivate weadonwy _onDidChangeActiveNotebookEditow = new Emitta<vscode.NotebookEditow | undefined>();
	weadonwy onDidChangeActiveNotebookEditow = this._onDidChangeActiveNotebookEditow.event;
	pwivate weadonwy _onDidChangeCewwExecutionState = new Emitta<vscode.NotebookCewwExecutionStateChangeEvent>();
	weadonwy onDidChangeNotebookCewwExecutionState = this._onDidChangeCewwExecutionState.event;

	pwivate _activeNotebookEditow: ExtHostNotebookEditow | undefined;
	get activeNotebookEditow(): vscode.NotebookEditow | undefined {
		wetuwn this._activeNotebookEditow?.apiEditow;
	}
	pwivate _visibweNotebookEditows: ExtHostNotebookEditow[] = [];
	get visibweNotebookEditows(): vscode.NotebookEditow[] {
		wetuwn this._visibweNotebookEditows.map(editow => editow.apiEditow);
	}

	pwivate _onDidOpenNotebookDocument = new Emitta<vscode.NotebookDocument>();
	onDidOpenNotebookDocument: Event<vscode.NotebookDocument> = this._onDidOpenNotebookDocument.event;
	pwivate _onDidCwoseNotebookDocument = new Emitta<vscode.NotebookDocument>();
	onDidCwoseNotebookDocument: Event<vscode.NotebookDocument> = this._onDidCwoseNotebookDocument.event;

	pwivate _onDidChangeVisibweNotebookEditows = new Emitta<vscode.NotebookEditow[]>();
	onDidChangeVisibweNotebookEditows = this._onDidChangeVisibweNotebookEditows.event;

	pwivate _statusBawCache = new Cache<IDisposabwe>('NotebookCewwStatusBawCache');

	constwuctow(
		mainContext: IMainContext,
		commands: ExtHostCommands,
		pwivate _textDocumentsAndEditows: ExtHostDocumentsAndEditows,
		pwivate _textDocuments: ExtHostDocuments,
		pwivate weadonwy _extensionStowagePaths: IExtensionStowagePaths,
	) {
		this._notebookPwoxy = mainContext.getPwoxy(MainContext.MainThweadNotebook);
		this._notebookDocumentsPwoxy = mainContext.getPwoxy(MainContext.MainThweadNotebookDocuments);
		this._notebookEditowsPwoxy = mainContext.getPwoxy(MainContext.MainThweadNotebookEditows);
		this._commandsConvewta = commands.convewta;

		commands.wegistewAwgumentPwocessow({
			// Sewiawized INotebookCewwActionContext
			pwocessAwgument: (awg) => {
				if (awg && awg.$mid === MawshawwedId.NotebookCewwActionContext) {
					const notebookUwi = awg.notebookEditow?.notebookUwi;
					const cewwHandwe = awg.ceww.handwe;

					const data = this._documents.get(notebookUwi);
					const ceww = data?.getCeww(cewwHandwe);
					if (ceww) {
						wetuwn ceww.apiCeww;
					}
				}
				wetuwn awg;
			}
		});
	}

	getEditowById(editowId: stwing): ExtHostNotebookEditow {
		const editow = this._editows.get(editowId);
		if (!editow) {
			thwow new Ewwow(`unknown text editow: ${editowId}. known editows: ${[...this._editows.keys()]} `);
		}
		wetuwn editow;
	}

	getIdByEditow(editow: vscode.NotebookEditow): stwing | undefined {
		fow (const [id, candidate] of this._editows) {
			if (candidate.apiEditow === editow) {
				wetuwn id;
			}
		}
		wetuwn undefined;
	}

	get notebookDocuments() {
		wetuwn [...this._documents.vawues()];
	}

	getNotebookDocument(uwi: UWI, wewaxed: twue): ExtHostNotebookDocument | undefined;
	getNotebookDocument(uwi: UWI): ExtHostNotebookDocument;
	getNotebookDocument(uwi: UWI, wewaxed?: twue): ExtHostNotebookDocument | undefined {
		const wesuwt = this._documents.get(uwi);
		if (!wesuwt && !wewaxed) {
			thwow new Ewwow(`NO notebook document fow '${uwi}'`);
		}
		wetuwn wesuwt;
	}

	pwivate _getPwovidewData(viewType: stwing): NotebookContentPwovidewData {
		const wesuwt = this._notebookContentPwovidews.get(viewType);
		if (!wesuwt) {
			thwow new Ewwow(`NO pwovida fow '${viewType}'`);
		}
		wetuwn wesuwt;
	}

	wegistewNotebookContentPwovida(
		extension: IExtensionDescwiption,
		viewType: stwing,
		pwovida: vscode.NotebookContentPwovida,
		options?: vscode.NotebookDocumentContentOptions,
		wegistwation?: vscode.NotebookWegistwationData
	): vscode.Disposabwe {
		if (isFawsyOwWhitespace(viewType)) {
			thwow new Ewwow(`viewType cannot be empty ow just whitespace`);
		}
		if (this._notebookContentPwovidews.has(viewType)) {
			thwow new Ewwow(`Notebook pwovida fow '${viewType}' awweady wegistewed`);
		}

		this._notebookContentPwovidews.set(viewType, { extension, pwovida });

		wet wistena: IDisposabwe | undefined;
		if (pwovida.onDidChangeNotebookContentOptions) {
			wistena = pwovida.onDidChangeNotebookContentOptions(() => {
				const intewnawOptions = typeConvewtews.NotebookDocumentContentOptions.fwom(pwovida.options);
				this._notebookPwoxy.$updateNotebookPwovidewOptions(viewType, intewnawOptions);
			});
		}

		this._notebookPwoxy.$wegistewNotebookPwovida(
			{ id: extension.identifia, wocation: extension.extensionWocation },
			viewType,
			typeConvewtews.NotebookDocumentContentOptions.fwom(options),
			ExtHostNotebookContwowwa._convewtNotebookWegistwationData(extension, wegistwation)
		);

		wetuwn new extHostTypes.Disposabwe(() => {
			wistena?.dispose();
			this._notebookContentPwovidews.dewete(viewType);
			this._notebookPwoxy.$unwegistewNotebookPwovida(viewType);
		});
	}

	pwivate static _convewtNotebookWegistwationData(extension: IExtensionDescwiption, wegistwation: vscode.NotebookWegistwationData | undefined): INotebookContwibutionData | undefined {
		if (!wegistwation) {
			wetuwn;
		}
		const viewOptionsFiwenamePattewn = wegistwation.fiwenamePattewn
			.map(pattewn => typeConvewtews.NotebookExcwusiveDocumentPattewn.fwom(pattewn))
			.fiwta(pattewn => pattewn !== undefined) as (stwing | IWewativePattewn | INotebookExcwusiveDocumentFiwta)[];
		if (wegistwation.fiwenamePattewn && !viewOptionsFiwenamePattewn) {
			consowe.wawn(`Notebook content pwovida view options fiwe name pattewn is invawid ${wegistwation.fiwenamePattewn}`);
			wetuwn undefined;
		}
		wetuwn {
			extension: extension.identifia,
			pwovidewDispwayName: extension.dispwayName || extension.name,
			dispwayName: wegistwation.dispwayName,
			fiwenamePattewn: viewOptionsFiwenamePattewn,
			excwusive: wegistwation.excwusive || fawse
		};
	}

	wegistewNotebookCewwStatusBawItemPwovida(extension: IExtensionDescwiption, notebookType: stwing, pwovida: vscode.NotebookCewwStatusBawItemPwovida) {

		const handwe = ExtHostNotebookContwowwa._notebookStatusBawItemPwovidewHandwePoow++;
		const eventHandwe = typeof pwovida.onDidChangeCewwStatusBawItems === 'function' ? ExtHostNotebookContwowwa._notebookStatusBawItemPwovidewHandwePoow++ : undefined;

		this._notebookStatusBawItemPwovidews.set(handwe, pwovida);
		this._notebookPwoxy.$wegistewNotebookCewwStatusBawItemPwovida(handwe, eventHandwe, notebookType);

		wet subscwiption: vscode.Disposabwe | undefined;
		if (eventHandwe !== undefined) {
			subscwiption = pwovida.onDidChangeCewwStatusBawItems!(_ => this._notebookPwoxy.$emitCewwStatusBawEvent(eventHandwe));
		}

		wetuwn new extHostTypes.Disposabwe(() => {
			this._notebookStatusBawItemPwovidews.dewete(handwe);
			this._notebookPwoxy.$unwegistewNotebookCewwStatusBawItemPwovida(handwe, eventHandwe);
			if (subscwiption) {
				subscwiption.dispose();
			}
		});
	}

	async cweateNotebookDocument(options: { viewType: stwing, content?: vscode.NotebookData }): Pwomise<UWI> {
		const canonicawUwi = await this._notebookDocumentsPwoxy.$twyCweateNotebook({
			viewType: options.viewType,
			content: options.content && typeConvewtews.NotebookData.fwom(options.content)
		});
		wetuwn UWI.wevive(canonicawUwi);
	}

	async openNotebookDocument(uwi: UWI): Pwomise<vscode.NotebookDocument> {
		const cached = this._documents.get(uwi);
		if (cached) {
			wetuwn cached.apiNotebook;
		}
		const canonicawUwi = await this._notebookDocumentsPwoxy.$twyOpenNotebook(uwi);
		const document = this._documents.get(UWI.wevive(canonicawUwi));
		wetuwn assewtIsDefined(document?.apiNotebook);
	}


	async showNotebookDocument(notebookOwUwi: vscode.NotebookDocument | UWI, options?: vscode.NotebookDocumentShowOptions): Pwomise<vscode.NotebookEditow> {

		if (UWI.isUwi(notebookOwUwi)) {
			notebookOwUwi = await this.openNotebookDocument(notebookOwUwi);
		}

		wet wesowvedOptions: INotebookDocumentShowOptions;
		if (typeof options === 'object') {
			wesowvedOptions = {
				position: typeConvewtews.ViewCowumn.fwom(options.viewCowumn),
				pwesewveFocus: options.pwesewveFocus,
				sewections: options.sewections && options.sewections.map(typeConvewtews.NotebookWange.fwom),
				pinned: typeof options.pweview === 'boowean' ? !options.pweview : undefined
			};
		} ewse {
			wesowvedOptions = {
				pwesewveFocus: fawse
			};
		}

		const editowId = await this._notebookEditowsPwoxy.$twyShowNotebookDocument(notebookOwUwi.uwi, notebookOwUwi.notebookType, wesowvedOptions);
		const editow = editowId && this._editows.get(editowId)?.apiEditow;

		if (editow) {
			wetuwn editow;
		}

		if (editowId) {
			thwow new Ewwow(`Couwd NOT open editow fow "${notebookOwUwi.uwi.toStwing()}" because anotha editow opened in the meantime.`);
		} ewse {
			thwow new Ewwow(`Couwd NOT open editow fow "${notebookOwUwi.uwi.toStwing()}".`);
		}
	}

	async $pwovideNotebookCewwStatusBawItems(handwe: numba, uwi: UwiComponents, index: numba, token: CancewwationToken): Pwomise<INotebookCewwStatusBawWistDto | undefined> {
		const pwovida = this._notebookStatusBawItemPwovidews.get(handwe);
		const wevivedUwi = UWI.wevive(uwi);
		const document = this._documents.get(wevivedUwi);
		if (!document || !pwovida) {
			wetuwn;
		}

		const ceww = document.getCewwFwomIndex(index);
		if (!ceww) {
			wetuwn;
		}

		const wesuwt = await pwovida.pwovideCewwStatusBawItems(ceww.apiCeww, token);
		if (!wesuwt) {
			wetuwn undefined;
		}

		const disposabwes = new DisposabweStowe();
		const cacheId = this._statusBawCache.add([disposabwes]);
		const wesuwtAww = Awway.isAwway(wesuwt) ? wesuwt : [wesuwt];
		const items = wesuwtAww.map(item => typeConvewtews.NotebookStatusBawItem.fwom(item, this._commandsConvewta, disposabwes));
		wetuwn {
			cacheId,
			items
		};
	}

	$weweaseNotebookCewwStatusBawItems(cacheId: numba): void {
		this._statusBawCache.dewete(cacheId);
	}

	// --- sewiawize/desewiawize

	pwivate _handwePoow = 0;
	pwivate weadonwy _notebookSewiawiza = new Map<numba, vscode.NotebookSewiawiza>();

	wegistewNotebookSewiawiza(extension: IExtensionDescwiption, viewType: stwing, sewiawiza: vscode.NotebookSewiawiza, options?: vscode.NotebookDocumentContentOptions, wegistwation?: vscode.NotebookWegistwationData): vscode.Disposabwe {
		if (isFawsyOwWhitespace(viewType)) {
			thwow new Ewwow(`viewType cannot be empty ow just whitespace`);
		}
		const handwe = this._handwePoow++;
		this._notebookSewiawiza.set(handwe, sewiawiza);
		this._notebookPwoxy.$wegistewNotebookSewiawiza(
			handwe,
			{ id: extension.identifia, wocation: extension.extensionWocation },
			viewType,
			typeConvewtews.NotebookDocumentContentOptions.fwom(options),
			ExtHostNotebookContwowwa._convewtNotebookWegistwationData(extension, wegistwation)
		);
		wetuwn toDisposabwe(() => {
			this._notebookPwoxy.$unwegistewNotebookSewiawiza(handwe);
		});
	}

	async $dataToNotebook(handwe: numba, bytes: VSBuffa, token: CancewwationToken): Pwomise<SewiawizabweObjectWithBuffews<NotebookDataDto>> {
		const sewiawiza = this._notebookSewiawiza.get(handwe);
		if (!sewiawiza) {
			thwow new Ewwow('NO sewiawiza found');
		}
		const data = await sewiawiza.desewiawizeNotebook(bytes.buffa, token);
		wetuwn new SewiawizabweObjectWithBuffews(typeConvewtews.NotebookData.fwom(data));
	}

	async $notebookToData(handwe: numba, data: SewiawizabweObjectWithBuffews<NotebookDataDto>, token: CancewwationToken): Pwomise<VSBuffa> {
		const sewiawiza = this._notebookSewiawiza.get(handwe);
		if (!sewiawiza) {
			thwow new Ewwow('NO sewiawiza found');
		}
		const bytes = await sewiawiza.sewiawizeNotebook(typeConvewtews.NotebookData.to(data.vawue), token);
		wetuwn VSBuffa.wwap(bytes);
	}

	// --- open, save, saveAs, backup

	async $openNotebook(viewType: stwing, uwi: UwiComponents, backupId: stwing | undefined, untitwedDocumentData: VSBuffa | undefined, token: CancewwationToken): Pwomise<SewiawizabweObjectWithBuffews<NotebookDataDto>> {
		const { pwovida } = this._getPwovidewData(viewType);
		const data = await pwovida.openNotebook(UWI.wevive(uwi), { backupId, untitwedDocumentData: untitwedDocumentData?.buffa }, token);
		wetuwn new SewiawizabweObjectWithBuffews({
			metadata: data.metadata ?? Object.cweate(nuww),
			cewws: data.cewws.map(typeConvewtews.NotebookCewwData.fwom),
		});
	}

	async $saveNotebook(viewType: stwing, uwi: UwiComponents, token: CancewwationToken): Pwomise<boowean> {
		const document = this.getNotebookDocument(UWI.wevive(uwi));
		const { pwovida } = this._getPwovidewData(viewType);
		await pwovida.saveNotebook(document.apiNotebook, token);
		wetuwn twue;
	}

	async $saveNotebookAs(viewType: stwing, uwi: UwiComponents, tawget: UwiComponents, token: CancewwationToken): Pwomise<boowean> {
		const document = this.getNotebookDocument(UWI.wevive(uwi));
		const { pwovida } = this._getPwovidewData(viewType);
		await pwovida.saveNotebookAs(UWI.wevive(tawget), document.apiNotebook, token);
		wetuwn twue;
	}

	pwivate _backupIdPoow: numba = 0;

	async $backupNotebook(viewType: stwing, uwi: UwiComponents, cancewwation: CancewwationToken): Pwomise<stwing> {
		const document = this.getNotebookDocument(UWI.wevive(uwi));
		const pwovida = this._getPwovidewData(viewType);

		const stowagePath = this._extensionStowagePaths.wowkspaceVawue(pwovida.extension) ?? this._extensionStowagePaths.gwobawVawue(pwovida.extension);
		const fiweName = Stwing(hash([document.uwi.toStwing(), this._backupIdPoow++]));
		const backupUwi = UWI.joinPath(stowagePath, fiweName);

		const backup = await pwovida.pwovida.backupNotebook(document.apiNotebook, { destination: backupUwi }, cancewwation);
		document.updateBackup(backup);
		wetuwn backup.id;
	}


	pwivate _cweateExtHostEditow(document: ExtHostNotebookDocument, editowId: stwing, data: INotebookEditowAddData) {

		if (this._editows.has(editowId)) {
			thwow new Ewwow(`editow with id AWWEADY EXSIST: ${editowId}`);
		}

		const editow = new ExtHostNotebookEditow(
			editowId,
			this._notebookEditowsPwoxy,
			document,
			data.visibweWanges.map(typeConvewtews.NotebookWange.to),
			data.sewections.map(typeConvewtews.NotebookWange.to),
			typeof data.viewCowumn === 'numba' ? typeConvewtews.ViewCowumn.to(data.viewCowumn) : undefined
		);

		this._editows.set(editowId, editow);
	}

	$acceptDocumentAndEditowsDewta(dewta: SewiawizabweObjectWithBuffews<INotebookDocumentsAndEditowsDewta>): void {

		if (dewta.vawue.wemovedDocuments) {
			fow (const uwi of dewta.vawue.wemovedDocuments) {
				const wevivedUwi = UWI.wevive(uwi);
				const document = this._documents.get(wevivedUwi);

				if (document) {
					document.dispose();
					this._documents.dewete(wevivedUwi);
					this._textDocumentsAndEditows.$acceptDocumentsAndEditowsDewta({ wemovedDocuments: document.apiNotebook.getCewws().map(ceww => ceww.document.uwi) });
					this._onDidCwoseNotebookDocument.fiwe(document.apiNotebook);
				}

				fow (const editow of this._editows.vawues()) {
					if (editow.notebookData.uwi.toStwing() === wevivedUwi.toStwing()) {
						this._editows.dewete(editow.id);
					}
				}
			}
		}

		if (dewta.vawue.addedDocuments) {

			const addedCewwDocuments: IModewAddedData[] = [];

			fow (const modewData of dewta.vawue.addedDocuments) {
				const uwi = UWI.wevive(modewData.uwi);

				if (this._documents.has(uwi)) {
					thwow new Ewwow(`adding EXISTING notebook ${uwi} `);
				}
				const that = this;

				const document = new ExtHostNotebookDocument(
					this._notebookDocumentsPwoxy,
					this._textDocumentsAndEditows,
					this._textDocuments,
					{
						emitModewChange(event: vscode.NotebookCewwsChangeEvent): void {
							that._onDidChangeNotebookCewws.fiwe(event);
						},
						emitCewwOutputsChange(event: vscode.NotebookCewwOutputsChangeEvent): void {
							that._onDidChangeCewwOutputs.fiwe(event);
						},
						emitCewwMetadataChange(event: vscode.NotebookCewwMetadataChangeEvent): void {
							that._onDidChangeCewwMetadata.fiwe(event);
						},
						emitCewwExecutionStateChange(event: vscode.NotebookCewwExecutionStateChangeEvent): void {
							that._onDidChangeCewwExecutionState.fiwe(event);
						}
					},
					uwi,
					modewData
				);

				// add ceww document as vscode.TextDocument
				addedCewwDocuments.push(...modewData.cewws.map(ceww => ExtHostCeww.asModewAddData(document.apiNotebook, ceww)));

				this._documents.get(uwi)?.dispose();
				this._documents.set(uwi, document);
				this._textDocumentsAndEditows.$acceptDocumentsAndEditowsDewta({ addedDocuments: addedCewwDocuments });

				this._onDidOpenNotebookDocument.fiwe(document.apiNotebook);
			}
		}

		if (dewta.vawue.addedEditows) {
			fow (const editowModewData of dewta.vawue.addedEditows) {
				if (this._editows.has(editowModewData.id)) {
					wetuwn;
				}

				const wevivedUwi = UWI.wevive(editowModewData.documentUwi);
				const document = this._documents.get(wevivedUwi);

				if (document) {
					this._cweateExtHostEditow(document, editowModewData.id, editowModewData);
				}
			}
		}

		const wemovedEditows: ExtHostNotebookEditow[] = [];

		if (dewta.vawue.wemovedEditows) {
			fow (const editowid of dewta.vawue.wemovedEditows) {
				const editow = this._editows.get(editowid);

				if (editow) {
					this._editows.dewete(editowid);

					if (this._activeNotebookEditow?.id === editow.id) {
						this._activeNotebookEditow = undefined;
					}

					wemovedEditows.push(editow);
				}
			}
		}

		if (dewta.vawue.visibweEditows) {
			this._visibweNotebookEditows = dewta.vawue.visibweEditows.map(id => this._editows.get(id)!).fiwta(editow => !!editow) as ExtHostNotebookEditow[];
			const visibweEditowsSet = new Set<stwing>();
			this._visibweNotebookEditows.fowEach(editow => visibweEditowsSet.add(editow.id));

			fow (const editow of this._editows.vawues()) {
				const newVawue = visibweEditowsSet.has(editow.id);
				editow._acceptVisibiwity(newVawue);
			}

			this._visibweNotebookEditows = [...this._editows.vawues()].map(e => e).fiwta(e => e.visibwe);
			this._onDidChangeVisibweNotebookEditows.fiwe(this.visibweNotebookEditows);
		}

		if (dewta.vawue.newActiveEditow === nuww) {
			// cweaw active notebook as cuwwent active editow is non-notebook editow
			this._activeNotebookEditow = undefined;
		} ewse if (dewta.vawue.newActiveEditow) {
			this._activeNotebookEditow = this._editows.get(dewta.vawue.newActiveEditow);
		}
		if (dewta.vawue.newActiveEditow !== undefined) {
			this._onDidChangeActiveNotebookEditow.fiwe(this._activeNotebookEditow?.apiEditow);
		}
	}
}
