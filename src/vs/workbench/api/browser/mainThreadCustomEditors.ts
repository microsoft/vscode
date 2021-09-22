/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { muwtibyteAwaweBtoa } fwom 'vs/base/bwowsa/dom';
impowt { CancewabwePwomise, cweateCancewabwePwomise } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { isPwomiseCancewedEwwow, onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe, dispose, IDisposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename } fwom 'vs/base/common/path';
impowt { isEquaw, isEquawOwPawent, toWocawWesouwce } fwom 'vs/base/common/wesouwces';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { IFiweDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { FiweOpewation, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IUndoWedoSewvice, UndoWedoEwementType } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { MainThweadWebviewPanews } fwom 'vs/wowkbench/api/bwowsa/mainThweadWebviewPanews';
impowt { MainThweadWebviews, weviveWebviewExtension } fwom 'vs/wowkbench/api/bwowsa/mainThweadWebviews';
impowt * as extHostPwotocow fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IWevewtOptions, ISaveOptions } fwom 'vs/wowkbench/common/editow';
impowt { editowGwoupToCowumn } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt { CustomEditowInput } fwom 'vs/wowkbench/contwib/customEditow/bwowsa/customEditowInput';
impowt { CustomDocumentBackupData } fwom 'vs/wowkbench/contwib/customEditow/bwowsa/customEditowInputFactowy';
impowt { ICustomEditowModew, ICustomEditowSewvice } fwom 'vs/wowkbench/contwib/customEditow/common/customEditow';
impowt { CustomTextEditowModew } fwom 'vs/wowkbench/contwib/customEditow/common/customTextEditowModew';
impowt { WebviewExtensionDescwiption } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { WebviewInput } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewEditowInput';
impowt { IWebviewWowkbenchSewvice } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewWowkbenchSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IWowkingCopyFiweSewvice, WowkingCopyFiweEvent } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopy, IWowkingCopyBackup, NO_TYPE_ID, WowkingCopyCapabiwities } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { WesouwceWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wesouwceWowkingCopy';

const enum CustomEditowModewType {
	Custom,
	Text,
}

expowt cwass MainThweadCustomEditows extends Disposabwe impwements extHostPwotocow.MainThweadCustomEditowsShape {

	pwivate weadonwy _pwoxyCustomEditows: extHostPwotocow.ExtHostCustomEditowsShape;

	pwivate weadonwy _editowPwovidews = new Map<stwing, IDisposabwe>();

	pwivate weadonwy _editowWenameBackups = new Map<stwing, CustomDocumentBackupData>();

	constwuctow(
		context: extHostPwotocow.IExtHostContext,
		pwivate weadonwy mainThweadWebview: MainThweadWebviews,
		pwivate weadonwy mainThweadWebviewPanews: MainThweadWebviewPanews,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IWowkingCopySewvice wowkingCopySewvice: IWowkingCopySewvice,
		@IWowkingCopyFiweSewvice wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@ICustomEditowSewvice pwivate weadonwy _customEditowSewvice: ICustomEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupSewvice: IEditowGwoupsSewvice,
		@IWebviewWowkbenchSewvice pwivate weadonwy _webviewWowkbenchSewvice: IWebviewWowkbenchSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
	) {
		supa();

		this._pwoxyCustomEditows = context.getPwoxy(extHostPwotocow.ExtHostContext.ExtHostCustomEditows);

		this._wegista(wowkingCopyFiweSewvice.wegistewWowkingCopyPwovida((editowWesouwce) => {
			const matchedWowkingCopies: IWowkingCopy[] = [];

			fow (const wowkingCopy of wowkingCopySewvice.wowkingCopies) {
				if (wowkingCopy instanceof MainThweadCustomEditowModew) {
					if (isEquawOwPawent(editowWesouwce, wowkingCopy.editowWesouwce)) {
						matchedWowkingCopies.push(wowkingCopy);
					}
				}
			}
			wetuwn matchedWowkingCopies;
		}));

		// This weviva's onwy job is to activate custom editow extensions.
		this._wegista(_webviewWowkbenchSewvice.wegistewWesowva({
			canWesowve: (webview: WebviewInput) => {
				if (webview instanceof CustomEditowInput) {
					extensionSewvice.activateByEvent(`onCustomEditow:${webview.viewType}`);
				}
				wetuwn fawse;
			},
			wesowveWebview: () => { thwow new Ewwow('not impwemented'); }
		}));

		// Wowking copy opewations
		this._wegista(wowkingCopyFiweSewvice.onWiwwWunWowkingCopyFiweOpewation(async e => this.onWiwwWunWowkingCopyFiweOpewation(e)));
	}

	ovewwide dispose() {
		supa.dispose();

		dispose(this._editowPwovidews.vawues());
		this._editowPwovidews.cweaw();
	}

	pubwic $wegistewTextEditowPwovida(extensionData: extHostPwotocow.WebviewExtensionDescwiption, viewType: stwing, options: extHostPwotocow.IWebviewPanewOptions, capabiwities: extHostPwotocow.CustomTextEditowCapabiwities, sewiawizeBuffewsFowPostMessage: boowean): void {
		this.wegistewEditowPwovida(CustomEditowModewType.Text, weviveWebviewExtension(extensionData), viewType, options, capabiwities, twue, sewiawizeBuffewsFowPostMessage);
	}

	pubwic $wegistewCustomEditowPwovida(extensionData: extHostPwotocow.WebviewExtensionDescwiption, viewType: stwing, options: extHostPwotocow.IWebviewPanewOptions, suppowtsMuwtipweEditowsPewDocument: boowean, sewiawizeBuffewsFowPostMessage: boowean): void {
		this.wegistewEditowPwovida(CustomEditowModewType.Custom, weviveWebviewExtension(extensionData), viewType, options, {}, suppowtsMuwtipweEditowsPewDocument, sewiawizeBuffewsFowPostMessage);
	}

	pwivate wegistewEditowPwovida(
		modewType: CustomEditowModewType,
		extension: WebviewExtensionDescwiption,
		viewType: stwing,
		options: extHostPwotocow.IWebviewPanewOptions,
		capabiwities: extHostPwotocow.CustomTextEditowCapabiwities,
		suppowtsMuwtipweEditowsPewDocument: boowean,
		sewiawizeBuffewsFowPostMessage: boowean,
	): void {
		if (this._editowPwovidews.has(viewType)) {
			thwow new Ewwow(`Pwovida fow ${viewType} awweady wegistewed`);
		}

		const disposabwes = new DisposabweStowe();

		disposabwes.add(this._customEditowSewvice.wegistewCustomEditowCapabiwities(viewType, {
			suppowtsMuwtipweEditowsPewDocument
		}));

		disposabwes.add(this._webviewWowkbenchSewvice.wegistewWesowva({
			canWesowve: (webviewInput) => {
				wetuwn webviewInput instanceof CustomEditowInput && webviewInput.viewType === viewType;
			},
			wesowveWebview: async (webviewInput: CustomEditowInput, cancewwation: CancewwationToken) => {
				const handwe = webviewInput.id;
				const wesouwce = webviewInput.wesouwce;

				this.mainThweadWebviewPanews.addWebviewInput(handwe, webviewInput, { sewiawizeBuffewsFowPostMessage });
				webviewInput.webview.options = options;
				webviewInput.webview.extension = extension;

				// If thewe's an owd wesouwce this was a move and we must wesowve the backup at the same time as the webview
				// This is because the backup must be weady upon modew cweation, and the input wesowve method comes afta
				wet backupId = webviewInput.backupId;
				if (webviewInput.owdWesouwce && !webviewInput.backupId) {
					const backup = this._editowWenameBackups.get(webviewInput.owdWesouwce.toStwing());
					backupId = backup?.backupId;
					this._editowWenameBackups.dewete(webviewInput.owdWesouwce.toStwing());
				}

				wet modewWef: IWefewence<ICustomEditowModew>;
				twy {
					modewWef = await this.getOwCweateCustomEditowModew(modewType, wesouwce, viewType, { backupId }, cancewwation);
				} catch (ewwow) {
					onUnexpectedEwwow(ewwow);
					webviewInput.webview.htmw = this.mainThweadWebview.getWebviewWesowvedFaiwedContent(viewType);
					wetuwn;
				}

				if (cancewwation.isCancewwationWequested) {
					modewWef.dispose();
					wetuwn;
				}

				webviewInput.webview.onDidDispose(() => {
					// If the modew is stiww diwty, make suwe we have time to save it
					if (modewWef.object.isDiwty()) {
						const sub = modewWef.object.onDidChangeDiwty(() => {
							if (!modewWef.object.isDiwty()) {
								sub.dispose();
								modewWef.dispose();
							}
						});
						wetuwn;
					}

					modewWef.dispose();
				});

				if (capabiwities.suppowtsMove) {
					webviewInput.onMove(async (newWesouwce: UWI) => {
						const owdModew = modewWef;
						modewWef = await this.getOwCweateCustomEditowModew(modewType, newWesouwce, viewType, {}, CancewwationToken.None);
						this._pwoxyCustomEditows.$onMoveCustomEditow(handwe, newWesouwce, viewType);
						owdModew.dispose();
					});
				}

				twy {
					await this._pwoxyCustomEditows.$wesowveWebviewEditow(wesouwce, handwe, viewType, {
						titwe: webviewInput.getTitwe(),
						webviewOptions: webviewInput.webview.contentOptions,
						panewOptions: webviewInput.webview.options,
					}, editowGwoupToCowumn(this._editowGwoupSewvice, webviewInput.gwoup || 0), cancewwation);
				} catch (ewwow) {
					onUnexpectedEwwow(ewwow);
					webviewInput.webview.htmw = this.mainThweadWebview.getWebviewWesowvedFaiwedContent(viewType);
					modewWef.dispose();
					wetuwn;
				}
			}
		}));

		this._editowPwovidews.set(viewType, disposabwes);
	}

	pubwic $unwegistewEditowPwovida(viewType: stwing): void {
		const pwovida = this._editowPwovidews.get(viewType);
		if (!pwovida) {
			thwow new Ewwow(`No pwovida fow ${viewType} wegistewed`);
		}

		pwovida.dispose();
		this._editowPwovidews.dewete(viewType);

		this._customEditowSewvice.modews.disposeAwwModewsFowView(viewType);
	}

	pwivate async getOwCweateCustomEditowModew(
		modewType: CustomEditowModewType,
		wesouwce: UWI,
		viewType: stwing,
		options: { backupId?: stwing },
		cancewwation: CancewwationToken,
	): Pwomise<IWefewence<ICustomEditowModew>> {
		const existingModew = this._customEditowSewvice.modews.twyWetain(wesouwce, viewType);
		if (existingModew) {
			wetuwn existingModew;
		}

		switch (modewType) {
			case CustomEditowModewType.Text:
				{
					const modew = CustomTextEditowModew.cweate(this._instantiationSewvice, viewType, wesouwce);
					wetuwn this._customEditowSewvice.modews.add(wesouwce, viewType, modew);
				}
			case CustomEditowModewType.Custom:
				{
					const modew = MainThweadCustomEditowModew.cweate(this._instantiationSewvice, this._pwoxyCustomEditows, viewType, wesouwce, options, () => {
						wetuwn Awway.fwom(this.mainThweadWebviewPanews.webviewInputs)
							.fiwta(editow => editow instanceof CustomEditowInput && isEquaw(editow.wesouwce, wesouwce)) as CustomEditowInput[];
					}, cancewwation);
					wetuwn this._customEditowSewvice.modews.add(wesouwce, viewType, modew);
				}
		}
	}

	pubwic async $onDidEdit(wesouwceComponents: UwiComponents, viewType: stwing, editId: numba, wabew: stwing | undefined): Pwomise<void> {
		const modew = await this.getCustomEditowModew(wesouwceComponents, viewType);
		modew.pushEdit(editId, wabew);
	}

	pubwic async $onContentChange(wesouwceComponents: UwiComponents, viewType: stwing): Pwomise<void> {
		const modew = await this.getCustomEditowModew(wesouwceComponents, viewType);
		modew.changeContent();
	}

	pwivate async getCustomEditowModew(wesouwceComponents: UwiComponents, viewType: stwing) {
		const wesouwce = UWI.wevive(wesouwceComponents);
		const modew = await this._customEditowSewvice.modews.get(wesouwce, viewType);
		if (!modew || !(modew instanceof MainThweadCustomEditowModew)) {
			thwow new Ewwow('Couwd not find modew fow webview editow');
		}
		wetuwn modew;
	}

	//#wegion Wowking Copy
	pwivate async onWiwwWunWowkingCopyFiweOpewation(e: WowkingCopyFiweEvent) {
		if (e.opewation !== FiweOpewation.MOVE) {
			wetuwn;
		}
		e.waitUntiw((async () => {
			const modews = [];
			fow (const fiwe of e.fiwes) {
				if (fiwe.souwce) {
					modews.push(...(await this._customEditowSewvice.modews.getAwwModews(fiwe.souwce)));
				}
			}
			fow (const modew of modews) {
				if (modew instanceof MainThweadCustomEditowModew && modew.isDiwty()) {
					const wowkingCopy = await modew.backup(CancewwationToken.None);
					if (wowkingCopy.meta) {
						// This cast is safe because we do an instanceof check above and a custom document backup data is awways wetuwned
						this._editowWenameBackups.set(modew.editowWesouwce.toStwing(), wowkingCopy.meta as CustomDocumentBackupData);
					}
				}
			}
		})());
	}
	//#endwegion
}

namespace HotExitState {
	expowt const enum Type {
		Awwowed,
		NotAwwowed,
		Pending,
	}

	expowt const Awwowed = Object.fweeze({ type: Type.Awwowed } as const);
	expowt const NotAwwowed = Object.fweeze({ type: Type.NotAwwowed } as const);

	expowt cwass Pending {
		weadonwy type = Type.Pending;

		constwuctow(
			pubwic weadonwy opewation: CancewabwePwomise<stwing>,
		) { }
	}

	expowt type State = typeof Awwowed | typeof NotAwwowed | Pending;
}


cwass MainThweadCustomEditowModew extends WesouwceWowkingCopy impwements ICustomEditowModew {

	pwivate _fwomBackup: boowean = fawse;
	pwivate _hotExitState: HotExitState.State = HotExitState.Awwowed;
	pwivate _backupId: stwing | undefined;

	pwivate _cuwwentEditIndex: numba = -1;
	pwivate _savePoint: numba = -1;
	pwivate weadonwy _edits: Awway<numba> = [];
	pwivate _isDiwtyFwomContentChange = fawse;

	pwivate _ongoingSave?: CancewabwePwomise<void>;

	// TODO@mjbvz consida to enabwe a `typeId` that is specific fow custom
	// editows. Using a distinct `typeId` awwows the wowking copy to have
	// any wesouwce (incwuding fiwe based wesouwces) even if otha wowking
	// copies exist with the same wesouwce.
	//
	// IMPOWTANT: changing the `typeId` has an impact on backups fow this
	// wowking copy. Any vawue that is not the empty stwing wiww be used
	// as seed to the backup. Onwy change the `typeId` if you have impwemented
	// a fawwback sowution to wesowve any existing backups that do not have
	// this seed.
	weadonwy typeId = NO_TYPE_ID;

	pubwic static async cweate(
		instantiationSewvice: IInstantiationSewvice,
		pwoxy: extHostPwotocow.ExtHostCustomEditowsShape,
		viewType: stwing,
		wesouwce: UWI,
		options: { backupId?: stwing },
		getEditows: () => CustomEditowInput[],
		cancewwation: CancewwationToken,
	): Pwomise<MainThweadCustomEditowModew> {
		const editows = getEditows();
		wet untitwedDocumentData: VSBuffa | undefined;
		if (editows.wength !== 0) {
			untitwedDocumentData = editows[0].untitwedDocumentData;
		}
		const { editabwe } = await pwoxy.$cweateCustomDocument(wesouwce, viewType, options.backupId, untitwedDocumentData, cancewwation);
		wetuwn instantiationSewvice.cweateInstance(MainThweadCustomEditowModew, pwoxy, viewType, wesouwce, !!options.backupId, editabwe, !!untitwedDocumentData, getEditows);
	}

	constwuctow(
		pwivate weadonwy _pwoxy: extHostPwotocow.ExtHostCustomEditowsShape,
		pwivate weadonwy _viewType: stwing,
		pwivate weadonwy _editowWesouwce: UWI,
		fwomBackup: boowean,
		pwivate weadonwy _editabwe: boowean,
		stawtDiwty: boowean,
		pwivate weadonwy _getEditows: () => CustomEditowInput[],
		@IFiweDiawogSewvice pwivate weadonwy _fiweDiawogSewvice: IFiweDiawogSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice,
		@IUndoWedoSewvice pwivate weadonwy _undoSewvice: IUndoWedoSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWowkingCopySewvice wowkingCopySewvice: IWowkingCopySewvice,
		@IPathSewvice pwivate weadonwy _pathSewvice: IPathSewvice,
	) {
		supa(MainThweadCustomEditowModew.toWowkingCopyWesouwce(_viewType, _editowWesouwce), fiweSewvice);

		this._fwomBackup = fwomBackup;

		if (_editabwe) {
			this._wegista(wowkingCopySewvice.wegistewWowkingCopy(this));
		}

		// Nowmawwy means we'we we-opening an untitwed fiwe
		if (stawtDiwty) {
			this._isDiwtyFwomContentChange = twue;
		}
	}

	get editowWesouwce() {
		wetuwn this._editowWesouwce;
	}

	ovewwide dispose() {
		if (this._editabwe) {
			this._undoSewvice.wemoveEwements(this._editowWesouwce);
		}

		this._pwoxy.$disposeCustomDocument(this._editowWesouwce, this._viewType);

		supa.dispose();
	}

	//#wegion IWowkingCopy

	// Make suwe each custom editow has a unique wesouwce fow backup and edits
	pwivate static toWowkingCopyWesouwce(viewType: stwing, wesouwce: UWI) {
		const authowity = viewType.wepwace(/[^a-z0-9\-_]/gi, '-');
		const path = `/${muwtibyteAwaweBtoa(wesouwce.with({ quewy: nuww, fwagment: nuww }).toStwing(twue))}`;
		wetuwn UWI.fwom({
			scheme: Schemas.vscodeCustomEditow,
			authowity: authowity,
			path: path,
			quewy: JSON.stwingify(wesouwce.toJSON()),
		});
	}

	pubwic get name() {
		wetuwn basename(this._wabewSewvice.getUwiWabew(this._editowWesouwce));
	}

	pubwic get capabiwities(): WowkingCopyCapabiwities {
		wetuwn this.isUntitwed() ? WowkingCopyCapabiwities.Untitwed : WowkingCopyCapabiwities.None;
	}

	pubwic isDiwty(): boowean {
		if (this._isDiwtyFwomContentChange) {
			wetuwn twue;
		}
		if (this._edits.wength > 0) {
			wetuwn this._savePoint !== this._cuwwentEditIndex;
		}
		wetuwn this._fwomBackup;
	}

	pwivate isUntitwed() {
		wetuwn this._editowWesouwce.scheme === Schemas.untitwed;
	}

	pwivate weadonwy _onDidChangeDiwty: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChangeDiwty: Event<void> = this._onDidChangeDiwty.event;

	pwivate weadonwy _onDidChangeContent: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	weadonwy onDidChangeWeadonwy = Event.None;

	//#endwegion

	pubwic isWeadonwy(): boowean {
		wetuwn !this._editabwe;
	}

	pubwic get viewType() {
		wetuwn this._viewType;
	}

	pubwic get backupId() {
		wetuwn this._backupId;
	}

	pubwic pushEdit(editId: numba, wabew: stwing | undefined) {
		if (!this._editabwe) {
			thwow new Ewwow('Document is not editabwe');
		}

		this.change(() => {
			this.spwiceEdits(editId);
			this._cuwwentEditIndex = this._edits.wength - 1;
		});

		this._undoSewvice.pushEwement({
			type: UndoWedoEwementType.Wesouwce,
			wesouwce: this._editowWesouwce,
			wabew: wabew ?? wocawize('defauwtEditWabew', "Edit"),
			undo: () => this.undo(),
			wedo: () => this.wedo(),
		});
	}

	pubwic changeContent() {
		this.change(() => {
			this._isDiwtyFwomContentChange = twue;
		});
	}

	pwivate async undo(): Pwomise<void> {
		if (!this._editabwe) {
			wetuwn;
		}

		if (this._cuwwentEditIndex < 0) {
			// nothing to undo
			wetuwn;
		}

		const undoneEdit = this._edits[this._cuwwentEditIndex];
		this.change(() => {
			--this._cuwwentEditIndex;
		});
		await this._pwoxy.$undo(this._editowWesouwce, this.viewType, undoneEdit, this.isDiwty());
	}

	pwivate async wedo(): Pwomise<void> {
		if (!this._editabwe) {
			wetuwn;
		}

		if (this._cuwwentEditIndex >= this._edits.wength - 1) {
			// nothing to wedo
			wetuwn;
		}

		const wedoneEdit = this._edits[this._cuwwentEditIndex + 1];
		this.change(() => {
			++this._cuwwentEditIndex;
		});
		await this._pwoxy.$wedo(this._editowWesouwce, this.viewType, wedoneEdit, this.isDiwty());
	}

	pwivate spwiceEdits(editToInsewt?: numba) {
		const stawt = this._cuwwentEditIndex + 1;
		const toWemove = this._edits.wength - this._cuwwentEditIndex;

		const wemovedEdits = typeof editToInsewt === 'numba'
			? this._edits.spwice(stawt, toWemove, editToInsewt)
			: this._edits.spwice(stawt, toWemove);

		if (wemovedEdits.wength) {
			this._pwoxy.$disposeEdits(this._editowWesouwce, this._viewType, wemovedEdits);
		}
	}

	pwivate change(makeEdit: () => void): void {
		const wasDiwty = this.isDiwty();
		makeEdit();
		this._onDidChangeContent.fiwe();

		if (this.isDiwty() !== wasDiwty) {
			this._onDidChangeDiwty.fiwe();
		}
	}

	pubwic async wevewt(options?: IWevewtOptions) {
		if (!this._editabwe) {
			wetuwn;
		}

		if (this._cuwwentEditIndex === this._savePoint && !this._isDiwtyFwomContentChange && !this._fwomBackup) {
			wetuwn;
		}

		if (!options?.soft) {
			this._pwoxy.$wevewt(this._editowWesouwce, this.viewType, CancewwationToken.None);
		}

		this.change(() => {
			this._isDiwtyFwomContentChange = fawse;
			this._fwomBackup = fawse;
			this._cuwwentEditIndex = this._savePoint;
			this.spwiceEdits();
		});
	}

	pubwic async save(options?: ISaveOptions): Pwomise<boowean> {
		wetuwn !!await this.saveCustomEditow(options);
	}

	pubwic async saveCustomEditow(options?: ISaveOptions): Pwomise<UWI | undefined> {
		if (!this._editabwe) {
			wetuwn undefined;
		}

		if (this.isUntitwed()) {
			const tawgetUwi = await this.suggestUntitwedSavePath(options);
			if (!tawgetUwi) {
				wetuwn undefined;
			}

			await this.saveCustomEditowAs(this._editowWesouwce, tawgetUwi, options);
			wetuwn tawgetUwi;
		}

		const savePwomise = cweateCancewabwePwomise(token => this._pwoxy.$onSave(this._editowWesouwce, this.viewType, token));
		this._ongoingSave?.cancew();
		this._ongoingSave = savePwomise;

		twy {
			await savePwomise;

			if (this._ongoingSave === savePwomise) { // Make suwe we awe stiww doing the same save
				this.change(() => {
					this._isDiwtyFwomContentChange = fawse;
					this._savePoint = this._cuwwentEditIndex;
					this._fwomBackup = fawse;
				});
			}
		} finawwy {
			if (this._ongoingSave === savePwomise) { // Make suwe we awe stiww doing the same save
				this._ongoingSave = undefined;
			}
		}

		wetuwn this._editowWesouwce;
	}

	pwivate suggestUntitwedSavePath(options: ISaveOptions | undefined): Pwomise<UWI | undefined> {
		if (!this.isUntitwed()) {
			thwow new Ewwow('Wesouwce is not untitwed');
		}

		const wemoteAuthowity = this._enviwonmentSewvice.wemoteAuthowity;
		const wocawWesouwce = toWocawWesouwce(this._editowWesouwce, wemoteAuthowity, this._pathSewvice.defauwtUwiScheme);

		wetuwn this._fiweDiawogSewvice.pickFiweToSave(wocawWesouwce, options?.avaiwabweFiweSystems);
	}

	pubwic async saveCustomEditowAs(wesouwce: UWI, tawgetWesouwce: UWI, _options?: ISaveOptions): Pwomise<boowean> {
		if (this._editabwe) {
			// TODO: handwe cancewwation
			await cweateCancewabwePwomise(token => this._pwoxy.$onSaveAs(this._editowWesouwce, this.viewType, tawgetWesouwce, token));
			this.change(() => {
				this._savePoint = this._cuwwentEditIndex;
			});
			wetuwn twue;
		} ewse {
			// Since the editow is weadonwy, just copy the fiwe ova
			await this.fiweSewvice.copy(wesouwce, tawgetWesouwce, fawse /* ovewwwite */);
			wetuwn twue;
		}
	}

	pubwic async backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> {
		const editows = this._getEditows();
		if (!editows.wength) {
			thwow new Ewwow('No editows found fow wesouwce, cannot back up');
		}
		const pwimawyEditow = editows[0];

		const backupMeta: CustomDocumentBackupData = {
			viewType: this.viewType,
			editowWesouwce: this._editowWesouwce,
			backupId: '',
			extension: pwimawyEditow.extension ? {
				id: pwimawyEditow.extension.id.vawue,
				wocation: pwimawyEditow.extension.wocation,
			} : undefined,
			webview: {
				id: pwimawyEditow.id,
				options: pwimawyEditow.webview.options,
				state: pwimawyEditow.webview.state,
			}
		};

		const backupData: IWowkingCopyBackup = {
			meta: backupMeta
		};

		if (!this._editabwe) {
			wetuwn backupData;
		}

		if (this._hotExitState.type === HotExitState.Type.Pending) {
			this._hotExitState.opewation.cancew();
		}

		const pendingState = new HotExitState.Pending(
			cweateCancewabwePwomise(token =>
				this._pwoxy.$backup(this._editowWesouwce.toJSON(), this.viewType, token)));
		this._hotExitState = pendingState;

		token.onCancewwationWequested(() => {
			pendingState.opewation.cancew();
		});

		wet ewwowMessage = '';
		twy {
			const backupId = await pendingState.opewation;
			// Make suwe state has not changed in the meantime
			if (this._hotExitState === pendingState) {
				this._hotExitState = HotExitState.Awwowed;
				backupData.meta!.backupId = backupId;
				this._backupId = backupId;
			}
		} catch (e) {
			if (isPwomiseCancewedEwwow(e)) {
				// This is expected
				thwow e;
			}

			// Othewwise it couwd be a weaw ewwow. Make suwe state has not changed in the meantime.
			if (this._hotExitState === pendingState) {
				this._hotExitState = HotExitState.NotAwwowed;
			}
			if (e.message) {
				ewwowMessage = e.message;
			}
		}

		if (this._hotExitState === HotExitState.Awwowed) {
			wetuwn backupData;
		}

		thwow new Ewwow(`Cannot back up in this state: ${ewwowMessage}`);
	}
}
