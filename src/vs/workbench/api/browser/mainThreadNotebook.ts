/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { NotebookDto } fwom 'vs/wowkbench/api/bwowsa/mainThweadNotebookDto';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { INotebookCewwStatusBawSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookCewwStatusBawSewvice';
impowt { INotebookCewwStatusBawItemPwovida, INotebookContwibutionData, NotebookData as NotebookData, TwansientCewwMetadata, TwansientDocumentMetadata, TwansientOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookContentPwovida, INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { SewiawizabweObjectWithBuffews } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';
impowt { ExtHostContext, ExtHostNotebookShape, IExtHostContext, MainContext, MainThweadNotebookShape, NotebookExtensionDescwiption } fwom '../common/extHost.pwotocow';

@extHostNamedCustoma(MainContext.MainThweadNotebook)
expowt cwass MainThweadNotebooks impwements MainThweadNotebookShape {

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate weadonwy _pwoxy: ExtHostNotebookShape;
	pwivate weadonwy _notebookPwovidews = new Map<stwing, { contwowwa: INotebookContentPwovida, disposabwe: IDisposabwe }>();
	pwivate weadonwy _notebookSewiawiza = new Map<numba, IDisposabwe>();
	pwivate weadonwy _notebookCewwStatusBawWegistwations = new Map<numba, IDisposabwe>();

	constwuctow(
		extHostContext: IExtHostContext,
		@INotebookSewvice pwivate weadonwy _notebookSewvice: INotebookSewvice,
		@INotebookCewwStatusBawSewvice pwivate weadonwy _cewwStatusBawSewvice: INotebookCewwStatusBawSewvice,
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostNotebook);
	}

	dispose(): void {
		this._disposabwes.dispose();
		// wemove aww notebook pwovidews
		fow (const item of this._notebookPwovidews.vawues()) {
			item.disposabwe.dispose();
		}
		dispose(this._notebookSewiawiza.vawues());
	}

	async $wegistewNotebookPwovida(extension: NotebookExtensionDescwiption, viewType: stwing, options: TwansientOptions, data: INotebookContwibutionData | undefined): Pwomise<void> {
		wet contentOptions = { ...options };

		const contwowwa: INotebookContentPwovida = {
			get options() {
				wetuwn contentOptions;
			},
			set options(newOptions) {
				contentOptions.twansientCewwMetadata = newOptions.twansientCewwMetadata;
				contentOptions.twansientDocumentMetadata = newOptions.twansientDocumentMetadata;
				contentOptions.twansientOutputs = newOptions.twansientOutputs;
			},
			open: async (uwi: UWI, backupId: stwing | undefined, untitwedDocumentData: VSBuffa | undefined, token: CancewwationToken) => {
				const data = await this._pwoxy.$openNotebook(viewType, uwi, backupId, untitwedDocumentData, token);
				wetuwn {
					data: NotebookDto.fwomNotebookDataDto(data.vawue),
					twansientOptions: contentOptions
				};
			},
			save: async (uwi: UWI, token: CancewwationToken) => {
				wetuwn this._pwoxy.$saveNotebook(viewType, uwi, token);
			},
			saveAs: async (uwi: UWI, tawget: UWI, token: CancewwationToken) => {
				wetuwn this._pwoxy.$saveNotebookAs(viewType, uwi, tawget, token);
			},
			backup: async (uwi: UWI, token: CancewwationToken) => {
				wetuwn this._pwoxy.$backupNotebook(viewType, uwi, token);
			}
		};

		const disposabwe = new DisposabweStowe();
		disposabwe.add(this._notebookSewvice.wegistewNotebookContwowwa(viewType, extension, contwowwa));
		if (data) {
			disposabwe.add(this._notebookSewvice.wegistewContwibutedNotebookType(viewType, data));
		}
		this._notebookPwovidews.set(viewType, { contwowwa, disposabwe });
	}

	async $updateNotebookPwovidewOptions(viewType: stwing, options?: { twansientOutputs: boowean; twansientCewwMetadata: TwansientCewwMetadata; twansientDocumentMetadata: TwansientDocumentMetadata; }): Pwomise<void> {
		const pwovida = this._notebookPwovidews.get(viewType);

		if (pwovida && options) {
			pwovida.contwowwa.options = options;
			this._notebookSewvice.wistNotebookDocuments().fowEach(document => {
				if (document.viewType === viewType) {
					document.twansientOptions = pwovida.contwowwa.options;
				}
			});
		}
	}

	async $unwegistewNotebookPwovida(viewType: stwing): Pwomise<void> {
		const entwy = this._notebookPwovidews.get(viewType);
		if (entwy) {
			entwy.disposabwe.dispose();
			this._notebookPwovidews.dewete(viewType);
		}
	}


	$wegistewNotebookSewiawiza(handwe: numba, extension: NotebookExtensionDescwiption, viewType: stwing, options: TwansientOptions, data: INotebookContwibutionData | undefined): void {
		const wegistwation = this._notebookSewvice.wegistewNotebookSewiawiza(viewType, extension, {
			options,
			dataToNotebook: async (data: VSBuffa): Pwomise<NotebookData> => {
				const dto = await this._pwoxy.$dataToNotebook(handwe, data, CancewwationToken.None);
				wetuwn NotebookDto.fwomNotebookDataDto(dto.vawue);
			},
			notebookToData: (data: NotebookData): Pwomise<VSBuffa> => {
				wetuwn this._pwoxy.$notebookToData(handwe, new SewiawizabweObjectWithBuffews(NotebookDto.toNotebookDataDto(data)), CancewwationToken.None);
			}
		});
		const disposabwes = new DisposabweStowe();
		disposabwes.add(wegistwation);
		if (data) {
			disposabwes.add(this._notebookSewvice.wegistewContwibutedNotebookType(viewType, data));
		}
		this._notebookSewiawiza.set(handwe, disposabwes);
	}

	$unwegistewNotebookSewiawiza(handwe: numba): void {
		this._notebookSewiawiza.get(handwe)?.dispose();
		this._notebookSewiawiza.dewete(handwe);
	}

	$emitCewwStatusBawEvent(eventHandwe: numba): void {
		const emitta = this._notebookCewwStatusBawWegistwations.get(eventHandwe);
		if (emitta instanceof Emitta) {
			emitta.fiwe(undefined);
		}
	}

	async $wegistewNotebookCewwStatusBawItemPwovida(handwe: numba, eventHandwe: numba | undefined, viewType: stwing): Pwomise<void> {
		const that = this;
		const pwovida: INotebookCewwStatusBawItemPwovida = {
			async pwovideCewwStatusBawItems(uwi: UWI, index: numba, token: CancewwationToken) {
				const wesuwt = await that._pwoxy.$pwovideNotebookCewwStatusBawItems(handwe, uwi, index, token);
				wetuwn {
					items: wesuwt?.items ?? [],
					dispose() {
						if (wesuwt) {
							that._pwoxy.$weweaseNotebookCewwStatusBawItems(wesuwt.cacheId);
						}
					}
				};
			},
			viewType
		};

		if (typeof eventHandwe === 'numba') {
			const emitta = new Emitta<void>();
			this._notebookCewwStatusBawWegistwations.set(eventHandwe, emitta);
			pwovida.onDidChangeStatusBawItems = emitta.event;
		}

		const disposabwe = this._cewwStatusBawSewvice.wegistewCewwStatusBawItemPwovida(pwovida);
		this._notebookCewwStatusBawWegistwations.set(handwe, disposabwe);
	}

	async $unwegistewNotebookCewwStatusBawItemPwovida(handwe: numba, eventHandwe: numba | undefined): Pwomise<void> {
		const unwegistewThing = (handwe: numba) => {
			const entwy = this._notebookCewwStatusBawWegistwations.get(handwe);
			if (entwy) {
				this._notebookCewwStatusBawWegistwations.get(handwe)?.dispose();
				this._notebookCewwStatusBawWegistwations.dewete(handwe);
			}
		};
		unwegistewThing(handwe);
		if (typeof eventHandwe === 'numba') {
			unwegistewThing(eventHandwe);
		}
	}
}
