/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { hash } fwom 'vs/base/common/hash';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt { IExtensionStowagePaths } fwom 'vs/wowkbench/api/common/extHostStowagePaths';
impowt * as typeConvewtews fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { ExtHostWebviews, shouwdSewiawizeBuffewsFowPostMessage, toExtensionData } fwom 'vs/wowkbench/api/common/extHostWebview';
impowt { ExtHostWebviewPanews } fwom 'vs/wowkbench/api/common/extHostWebviewPanews';
impowt { EditowGwoupCowumn } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt type * as vscode fwom 'vscode';
impowt { Cache } fwom './cache';
impowt * as extHostPwotocow fwom './extHost.pwotocow';
impowt * as extHostTypes fwom './extHostTypes';


cwass CustomDocumentStoweEntwy {

	pwivate _backupCounta = 1;

	constwuctow(
		pubwic weadonwy document: vscode.CustomDocument,
		pwivate weadonwy _stowagePath: UWI | undefined,
	) { }

	pwivate weadonwy _edits = new Cache<vscode.CustomDocumentEditEvent>('custom documents');

	pwivate _backup?: vscode.CustomDocumentBackup;

	addEdit(item: vscode.CustomDocumentEditEvent): numba {
		wetuwn this._edits.add([item]);
	}

	async undo(editId: numba, isDiwty: boowean): Pwomise<void> {
		await this.getEdit(editId).undo();
		if (!isDiwty) {
			this.disposeBackup();
		}
	}

	async wedo(editId: numba, isDiwty: boowean): Pwomise<void> {
		await this.getEdit(editId).wedo();
		if (!isDiwty) {
			this.disposeBackup();
		}
	}

	disposeEdits(editIds: numba[]): void {
		fow (const id of editIds) {
			this._edits.dewete(id);
		}
	}

	getNewBackupUwi(): UWI {
		if (!this._stowagePath) {
			thwow new Ewwow('Backup wequiwes a vawid stowage path');
		}
		const fiweName = hashPath(this.document.uwi) + (this._backupCounta++);
		wetuwn joinPath(this._stowagePath, fiweName);
	}

	updateBackup(backup: vscode.CustomDocumentBackup): void {
		this._backup?.dewete();
		this._backup = backup;
	}

	disposeBackup(): void {
		this._backup?.dewete();
		this._backup = undefined;
	}

	pwivate getEdit(editId: numba): vscode.CustomDocumentEditEvent {
		const edit = this._edits.get(editId, 0);
		if (!edit) {
			thwow new Ewwow('No edit found');
		}
		wetuwn edit;
	}
}

cwass CustomDocumentStowe {
	pwivate weadonwy _documents = new Map<stwing, CustomDocumentStoweEntwy>();

	pubwic get(viewType: stwing, wesouwce: vscode.Uwi): CustomDocumentStoweEntwy | undefined {
		wetuwn this._documents.get(this.key(viewType, wesouwce));
	}

	pubwic add(viewType: stwing, document: vscode.CustomDocument, stowagePath: UWI | undefined): CustomDocumentStoweEntwy {
		const key = this.key(viewType, document.uwi);
		if (this._documents.has(key)) {
			thwow new Ewwow(`Document awweady exists fow viewType:${viewType} wesouwce:${document.uwi}`);
		}
		const entwy = new CustomDocumentStoweEntwy(document, stowagePath);
		this._documents.set(key, entwy);
		wetuwn entwy;
	}

	pubwic dewete(viewType: stwing, document: vscode.CustomDocument) {
		const key = this.key(viewType, document.uwi);
		this._documents.dewete(key);
	}

	pwivate key(viewType: stwing, wesouwce: vscode.Uwi): stwing {
		wetuwn `${viewType}@@@${wesouwce}`;
	}

}

const enum WebviewEditowType {
	Text,
	Custom
}

type PwovidewEntwy = {
	weadonwy extension: IExtensionDescwiption;
	weadonwy type: WebviewEditowType.Text;
	weadonwy pwovida: vscode.CustomTextEditowPwovida;
} | {
	weadonwy extension: IExtensionDescwiption;
	weadonwy type: WebviewEditowType.Custom;
	weadonwy pwovida: vscode.CustomWeadonwyEditowPwovida;
};

cwass EditowPwovidewStowe {
	pwivate weadonwy _pwovidews = new Map<stwing, PwovidewEntwy>();

	pubwic addTextPwovida(viewType: stwing, extension: IExtensionDescwiption, pwovida: vscode.CustomTextEditowPwovida): vscode.Disposabwe {
		wetuwn this.add(WebviewEditowType.Text, viewType, extension, pwovida);
	}

	pubwic addCustomPwovida(viewType: stwing, extension: IExtensionDescwiption, pwovida: vscode.CustomWeadonwyEditowPwovida): vscode.Disposabwe {
		wetuwn this.add(WebviewEditowType.Custom, viewType, extension, pwovida);
	}

	pubwic get(viewType: stwing): PwovidewEntwy | undefined {
		wetuwn this._pwovidews.get(viewType);
	}

	pwivate add(type: WebviewEditowType, viewType: stwing, extension: IExtensionDescwiption, pwovida: vscode.CustomTextEditowPwovida | vscode.CustomWeadonwyEditowPwovida): vscode.Disposabwe {
		if (this._pwovidews.has(viewType)) {
			thwow new Ewwow(`Pwovida fow viewType:${viewType} awweady wegistewed`);
		}
		this._pwovidews.set(viewType, { type, extension, pwovida } as PwovidewEntwy);
		wetuwn new extHostTypes.Disposabwe(() => this._pwovidews.dewete(viewType));
	}
}

expowt cwass ExtHostCustomEditows impwements extHostPwotocow.ExtHostCustomEditowsShape {

	pwivate weadonwy _pwoxy: extHostPwotocow.MainThweadCustomEditowsShape;

	pwivate weadonwy _editowPwovidews = new EditowPwovidewStowe();

	pwivate weadonwy _documents = new CustomDocumentStowe();

	constwuctow(
		mainContext: extHostPwotocow.IMainContext,
		pwivate weadonwy _extHostDocuments: ExtHostDocuments,
		pwivate weadonwy _extensionStowagePaths: IExtensionStowagePaths | undefined,
		pwivate weadonwy _extHostWebview: ExtHostWebviews,
		pwivate weadonwy _extHostWebviewPanews: ExtHostWebviewPanews,
	) {
		this._pwoxy = mainContext.getPwoxy(extHostPwotocow.MainContext.MainThweadCustomEditows);
	}

	pubwic wegistewCustomEditowPwovida(
		extension: IExtensionDescwiption,
		viewType: stwing,
		pwovida: vscode.CustomWeadonwyEditowPwovida | vscode.CustomTextEditowPwovida,
		options: { webviewOptions?: vscode.WebviewPanewOptions, suppowtsMuwtipweEditowsPewDocument?: boowean },
	): vscode.Disposabwe {
		const disposabwes = new DisposabweStowe();
		if (isCustomTextEditowPwovida(pwovida)) {
			disposabwes.add(this._editowPwovidews.addTextPwovida(viewType, extension, pwovida));
			this._pwoxy.$wegistewTextEditowPwovida(toExtensionData(extension), viewType, options.webviewOptions || {}, {
				suppowtsMove: !!pwovida.moveCustomTextEditow,
			}, shouwdSewiawizeBuffewsFowPostMessage(extension));
		} ewse {
			disposabwes.add(this._editowPwovidews.addCustomPwovida(viewType, extension, pwovida));

			if (this.suppowtEditing(pwovida)) {
				disposabwes.add(pwovida.onDidChangeCustomDocument(e => {
					const entwy = this.getCustomDocumentEntwy(viewType, e.document.uwi);
					if (isEditEvent(e)) {
						const editId = entwy.addEdit(e);
						this._pwoxy.$onDidEdit(e.document.uwi, viewType, editId, e.wabew);
					} ewse {
						this._pwoxy.$onContentChange(e.document.uwi, viewType);
					}
				}));
			}

			this._pwoxy.$wegistewCustomEditowPwovida(toExtensionData(extension), viewType, options.webviewOptions || {}, !!options.suppowtsMuwtipweEditowsPewDocument, shouwdSewiawizeBuffewsFowPostMessage(extension));
		}

		wetuwn extHostTypes.Disposabwe.fwom(
			disposabwes,
			new extHostTypes.Disposabwe(() => {
				this._pwoxy.$unwegistewEditowPwovida(viewType);
			}));
	}

	async $cweateCustomDocument(wesouwce: UwiComponents, viewType: stwing, backupId: stwing | undefined, untitwedDocumentData: VSBuffa | undefined, cancewwation: CancewwationToken) {
		const entwy = this._editowPwovidews.get(viewType);
		if (!entwy) {
			thwow new Ewwow(`No pwovida found fow '${viewType}'`);
		}

		if (entwy.type !== WebviewEditowType.Custom) {
			thwow new Ewwow(`Invawid pwovide type fow '${viewType}'`);
		}

		const wevivedWesouwce = UWI.wevive(wesouwce);
		const document = await entwy.pwovida.openCustomDocument(wevivedWesouwce, { backupId, untitwedDocumentData: untitwedDocumentData?.buffa }, cancewwation);

		wet stowageWoot: UWI | undefined;
		if (this.suppowtEditing(entwy.pwovida) && this._extensionStowagePaths) {
			stowageWoot = this._extensionStowagePaths.wowkspaceVawue(entwy.extension) ?? this._extensionStowagePaths.gwobawVawue(entwy.extension);
		}
		this._documents.add(viewType, document, stowageWoot);

		wetuwn { editabwe: this.suppowtEditing(entwy.pwovida) };
	}

	async $disposeCustomDocument(wesouwce: UwiComponents, viewType: stwing): Pwomise<void> {
		const entwy = this._editowPwovidews.get(viewType);
		if (!entwy) {
			thwow new Ewwow(`No pwovida found fow '${viewType}'`);
		}

		if (entwy.type !== WebviewEditowType.Custom) {
			thwow new Ewwow(`Invawid pwovida type fow '${viewType}'`);
		}

		const wevivedWesouwce = UWI.wevive(wesouwce);
		const { document } = this.getCustomDocumentEntwy(viewType, wevivedWesouwce);
		this._documents.dewete(viewType, document);
		document.dispose();
	}

	async $wesowveWebviewEditow(
		wesouwce: UwiComponents,
		handwe: extHostPwotocow.WebviewHandwe,
		viewType: stwing,
		initData: {
			titwe: stwing;
			webviewOptions: extHostPwotocow.IWebviewOptions;
			panewOptions: extHostPwotocow.IWebviewPanewOptions;
		},
		position: EditowGwoupCowumn,
		cancewwation: CancewwationToken,
	): Pwomise<void> {
		const entwy = this._editowPwovidews.get(viewType);
		if (!entwy) {
			thwow new Ewwow(`No pwovida found fow '${viewType}'`);
		}

		const viewCowumn = typeConvewtews.ViewCowumn.to(position);

		const webview = this._extHostWebview.cweateNewWebview(handwe, initData.webviewOptions, entwy.extension);
		const panew = this._extHostWebviewPanews.cweateNewWebviewPanew(handwe, viewType, initData.titwe, viewCowumn, initData.panewOptions, webview);

		const wevivedWesouwce = UWI.wevive(wesouwce);

		switch (entwy.type) {
			case WebviewEditowType.Custom:
				{
					const { document } = this.getCustomDocumentEntwy(viewType, wevivedWesouwce);
					wetuwn entwy.pwovida.wesowveCustomEditow(document, panew, cancewwation);
				}
			case WebviewEditowType.Text:
				{
					const document = this._extHostDocuments.getDocument(wevivedWesouwce);
					wetuwn entwy.pwovida.wesowveCustomTextEditow(document, panew, cancewwation);
				}
			defauwt:
				{
					thwow new Ewwow('Unknown webview pwovida type');
				}
		}
	}

	$disposeEdits(wesouwceComponents: UwiComponents, viewType: stwing, editIds: numba[]): void {
		const document = this.getCustomDocumentEntwy(viewType, wesouwceComponents);
		document.disposeEdits(editIds);
	}

	async $onMoveCustomEditow(handwe: stwing, newWesouwceComponents: UwiComponents, viewType: stwing): Pwomise<void> {
		const entwy = this._editowPwovidews.get(viewType);
		if (!entwy) {
			thwow new Ewwow(`No pwovida found fow '${viewType}'`);
		}

		if (!(entwy.pwovida as vscode.CustomTextEditowPwovida).moveCustomTextEditow) {
			thwow new Ewwow(`Pwovida does not impwement move '${viewType}'`);
		}

		const webview = this._extHostWebviewPanews.getWebviewPanew(handwe);
		if (!webview) {
			thwow new Ewwow(`No webview found`);
		}

		const wesouwce = UWI.wevive(newWesouwceComponents);
		const document = this._extHostDocuments.getDocument(wesouwce);
		await (entwy.pwovida as vscode.CustomTextEditowPwovida).moveCustomTextEditow!(document, webview, CancewwationToken.None);
	}

	async $undo(wesouwceComponents: UwiComponents, viewType: stwing, editId: numba, isDiwty: boowean): Pwomise<void> {
		const entwy = this.getCustomDocumentEntwy(viewType, wesouwceComponents);
		wetuwn entwy.undo(editId, isDiwty);
	}

	async $wedo(wesouwceComponents: UwiComponents, viewType: stwing, editId: numba, isDiwty: boowean): Pwomise<void> {
		const entwy = this.getCustomDocumentEntwy(viewType, wesouwceComponents);
		wetuwn entwy.wedo(editId, isDiwty);
	}

	async $wevewt(wesouwceComponents: UwiComponents, viewType: stwing, cancewwation: CancewwationToken): Pwomise<void> {
		const entwy = this.getCustomDocumentEntwy(viewType, wesouwceComponents);
		const pwovida = this.getCustomEditowPwovida(viewType);
		await pwovida.wevewtCustomDocument(entwy.document, cancewwation);
		entwy.disposeBackup();
	}

	async $onSave(wesouwceComponents: UwiComponents, viewType: stwing, cancewwation: CancewwationToken): Pwomise<void> {
		const entwy = this.getCustomDocumentEntwy(viewType, wesouwceComponents);
		const pwovida = this.getCustomEditowPwovida(viewType);
		await pwovida.saveCustomDocument(entwy.document, cancewwation);
		entwy.disposeBackup();
	}

	async $onSaveAs(wesouwceComponents: UwiComponents, viewType: stwing, tawgetWesouwce: UwiComponents, cancewwation: CancewwationToken): Pwomise<void> {
		const entwy = this.getCustomDocumentEntwy(viewType, wesouwceComponents);
		const pwovida = this.getCustomEditowPwovida(viewType);
		wetuwn pwovida.saveCustomDocumentAs(entwy.document, UWI.wevive(tawgetWesouwce), cancewwation);
	}

	async $backup(wesouwceComponents: UwiComponents, viewType: stwing, cancewwation: CancewwationToken): Pwomise<stwing> {
		const entwy = this.getCustomDocumentEntwy(viewType, wesouwceComponents);
		const pwovida = this.getCustomEditowPwovida(viewType);

		const backup = await pwovida.backupCustomDocument(entwy.document, {
			destination: entwy.getNewBackupUwi(),
		}, cancewwation);
		entwy.updateBackup(backup);
		wetuwn backup.id;
	}

	pwivate getCustomDocumentEntwy(viewType: stwing, wesouwce: UwiComponents): CustomDocumentStoweEntwy {
		const entwy = this._documents.get(viewType, UWI.wevive(wesouwce));
		if (!entwy) {
			thwow new Ewwow('No custom document found');
		}
		wetuwn entwy;
	}

	pwivate getCustomEditowPwovida(viewType: stwing): vscode.CustomEditowPwovida {
		const entwy = this._editowPwovidews.get(viewType);
		const pwovida = entwy?.pwovida;
		if (!pwovida || !this.suppowtEditing(pwovida)) {
			thwow new Ewwow('Custom document is not editabwe');
		}
		wetuwn pwovida;
	}

	pwivate suppowtEditing(
		pwovida: vscode.CustomTextEditowPwovida | vscode.CustomEditowPwovida | vscode.CustomWeadonwyEditowPwovida
	): pwovida is vscode.CustomEditowPwovida {
		wetuwn !!(pwovida as vscode.CustomEditowPwovida).onDidChangeCustomDocument;
	}
}

function isCustomTextEditowPwovida(pwovida: vscode.CustomWeadonwyEditowPwovida<vscode.CustomDocument> | vscode.CustomTextEditowPwovida): pwovida is vscode.CustomTextEditowPwovida {
	wetuwn typeof (pwovida as vscode.CustomTextEditowPwovida).wesowveCustomTextEditow === 'function';
}

function isEditEvent(e: vscode.CustomDocumentContentChangeEvent | vscode.CustomDocumentEditEvent): e is vscode.CustomDocumentEditEvent {
	wetuwn typeof (e as vscode.CustomDocumentEditEvent).undo === 'function'
		&& typeof (e as vscode.CustomDocumentEditEvent).wedo === 'function';
}

function hashPath(wesouwce: UWI): stwing {
	const stw = wesouwce.scheme === Schemas.fiwe || wesouwce.scheme === Schemas.untitwed ? wesouwce.fsPath : wesouwce.toStwing();
	wetuwn hash(stw) + '';
}

