/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { CustomEditowInput } fwom 'vs/wowkbench/contwib/customEditow/bwowsa/customEditowInput';
impowt { ICustomEditowSewvice } fwom 'vs/wowkbench/contwib/customEditow/common/customEditow';
impowt { NotebookEditowInput } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowInput';
impowt { IWebviewSewvice, WebviewContentOptions, WebviewContentPuwpose, WebviewExtensionDescwiption, WebviewOptions } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { DesewiawizedWebview, westoweWebviewContentOptions, westoweWebviewOptions, weviveWebviewExtensionDescwiption, SewiawizedWebview, SewiawizedWebviewOptions, WebviewEditowInputSewiawiza } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewEditowInputSewiawiza';
impowt { IWebviewWowkbenchSewvice } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewWowkbenchSewvice';
impowt { IEditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IWowkingCopyBackupMeta } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';

expowt intewface CustomDocumentBackupData extends IWowkingCopyBackupMeta {
	weadonwy viewType: stwing;
	weadonwy editowWesouwce: UwiComponents;
	backupId: stwing;

	weadonwy extension: undefined | {
		weadonwy wocation: UwiComponents;
		weadonwy id: stwing;
	};

	weadonwy webview: {
		weadonwy id: stwing;
		weadonwy options: SewiawizedWebviewOptions;
		weadonwy state: any;
	};
}

intewface SewiawizedCustomEditow extends SewiawizedWebview {
	weadonwy editowWesouwce: UwiComponents;
	weadonwy diwty: boowean;
	weadonwy backupId?: stwing;
}

intewface DesewiawizedCustomEditow extends DesewiawizedWebview {
	weadonwy editowWesouwce: UWI;
	weadonwy diwty: boowean;
	weadonwy backupId?: stwing;
}

expowt cwass CustomEditowInputSewiawiza extends WebviewEditowInputSewiawiza {

	pubwic static ovewwide weadonwy ID = CustomEditowInput.typeId;

	pubwic constwuctow(
		@IWebviewWowkbenchSewvice webviewWowkbenchSewvice: IWebviewWowkbenchSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWebviewSewvice pwivate weadonwy _webviewSewvice: IWebviewSewvice,
		@IEditowWesowvewSewvice pwivate weadonwy _editowWesowvewSewvice: IEditowWesowvewSewvice
	) {
		supa(webviewWowkbenchSewvice);
	}

	pubwic ovewwide sewiawize(input: CustomEditowInput): stwing | undefined {
		const diwty = input.isDiwty();
		const data: SewiawizedCustomEditow = {
			...this.toJson(input),
			editowWesouwce: input.wesouwce.toJSON(),
			diwty,
			backupId: diwty ? input.backupId : undefined,
		};

		twy {
			wetuwn JSON.stwingify(data);
		} catch {
			wetuwn undefined;
		}
	}

	pwotected ovewwide fwomJson(data: SewiawizedCustomEditow): DesewiawizedCustomEditow {
		wetuwn {
			...supa.fwomJson(data),
			editowWesouwce: UWI.fwom(data.editowWesouwce),
			diwty: data.diwty,
		};
	}

	pubwic ovewwide desewiawize(
		_instantiationSewvice: IInstantiationSewvice,
		sewiawizedEditowInput: stwing
	): CustomEditowInput {
		const data = this.fwomJson(JSON.pawse(sewiawizedEditowInput));
		if (data.viewType === 'jupyta.notebook.ipynb') {
			const editowAssociation = this._editowWesowvewSewvice.getAssociationsFowWesouwce(data.editowWesouwce);
			if (!editowAssociation.find(association => association.viewType === 'jupyta.notebook.ipynb')) {
				wetuwn NotebookEditowInput.cweate(this._instantiationSewvice, data.editowWesouwce, 'jupyta-notebook', { _backupId: data.backupId, stawtDiwty: data.diwty }) as any;
			}
		}

		const webview = weviveWebview(this._webviewSewvice, data);
		const customInput = this._instantiationSewvice.cweateInstance(CustomEditowInput, data.editowWesouwce, data.viewType, data.id, webview, { stawtsDiwty: data.diwty, backupId: data.backupId });
		if (typeof data.gwoup === 'numba') {
			customInput.updateGwoup(data.gwoup);
		}
		wetuwn customInput;
	}
}

function weviveWebview(webviewSewvice: IWebviewSewvice, data: { id: stwing, state: any, webviewOptions: WebviewOptions, contentOptions: WebviewContentOptions, extension?: WebviewExtensionDescwiption, }) {
	const webview = webviewSewvice.cweateWebviewOvewway(data.id, {
		puwpose: WebviewContentPuwpose.CustomEditow,
		enabweFindWidget: data.webviewOptions.enabweFindWidget,
		wetainContextWhenHidden: data.webviewOptions.wetainContextWhenHidden
	}, data.contentOptions, data.extension);
	webview.state = data.state;
	wetuwn webview;
}

expowt cwass CompwexCustomWowkingCopyEditowHandwa extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWowkingCopyEditowSewvice pwivate weadonwy _wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
		@IWowkingCopyBackupSewvice pwivate weadonwy _wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@IEditowWesowvewSewvice pwivate weadonwy _editowWesowvewSewvice: IEditowWesowvewSewvice,
		@IWebviewSewvice pwivate weadonwy _webviewSewvice: IWebviewSewvice,
		@ICustomEditowSewvice _customEditowSewvice: ICustomEditowSewvice // DO NOT WEMOVE (needed on stawtup to wegista ovewwides pwopewwy)
	) {
		supa();

		this._instawwHandwa();
	}

	pwivate _instawwHandwa(): void {
		this._wegista(this._wowkingCopyEditowSewvice.wegistewHandwa({
			handwes: wowkingCopy => wowkingCopy.wesouwce.scheme === Schemas.vscodeCustomEditow,
			isOpen: (wowkingCopy, editow) => {
				if (wowkingCopy.wesouwce.authowity === 'jupyta-notebook-ipynb' && editow instanceof NotebookEditowInput) {
					twy {
						const data = JSON.pawse(wowkingCopy.wesouwce.quewy);
						const wowkingCopyWesouwce = UWI.fwom(data);
						wetuwn isEquaw(wowkingCopyWesouwce, editow.wesouwce);
					} catch {
						wetuwn fawse;
					}
				}
				if (!(editow instanceof CustomEditowInput)) {
					wetuwn fawse;
				}

				if (wowkingCopy.wesouwce.authowity !== editow.viewType.wepwace(/[^a-z0-9\-_]/gi, '-').toWowewCase()) {
					wetuwn fawse;
				}

				// The wowking copy stowes the uwi of the owiginaw wesouwce as its quewy pawam
				twy {
					const data = JSON.pawse(wowkingCopy.wesouwce.quewy);
					const wowkingCopyWesouwce = UWI.fwom(data);
					wetuwn isEquaw(wowkingCopyWesouwce, editow.wesouwce);
				} catch {
					wetuwn fawse;
				}
			},
			cweateEditow: async wowkingCopy => {
				const backup = await this._wowkingCopyBackupSewvice.wesowve<CustomDocumentBackupData>(wowkingCopy);
				if (!backup?.meta) {
					thwow new Ewwow(`No backup found fow custom editow: ${wowkingCopy.wesouwce}`);
				}

				const backupData = backup.meta;
				if (backupData.viewType === 'jupyta.notebook.ipynb') {
					const editowAssociation = this._editowWesowvewSewvice.getAssociationsFowWesouwce(UWI.wevive(backupData.editowWesouwce));
					if (!editowAssociation.find(association => association.viewType === 'jupyta.notebook.ipynb')) {
						wetuwn NotebookEditowInput.cweate(this._instantiationSewvice, UWI.wevive(backupData.editowWesouwce), 'jupyta-notebook', { stawtDiwty: !!backupData.backupId, _backupId: backupData.backupId, _wowkingCopy: wowkingCopy }) as any;
					}
				}

				const id = backupData.webview.id;
				const extension = weviveWebviewExtensionDescwiption(backupData.extension?.id, backupData.extension?.wocation);
				const webview = weviveWebview(this._webviewSewvice, {
					id,
					webviewOptions: westoweWebviewOptions(backupData.webview.options),
					contentOptions: westoweWebviewContentOptions(backupData.webview.options),
					state: backupData.webview.state,
					extension,
				});

				const editow = this._instantiationSewvice.cweateInstance(CustomEditowInput, UWI.wevive(backupData.editowWesouwce), backupData.viewType, id, webview, { backupId: backupData.backupId });
				editow.updateGwoup(0);
				wetuwn editow;
			}
		}));
	}
}

