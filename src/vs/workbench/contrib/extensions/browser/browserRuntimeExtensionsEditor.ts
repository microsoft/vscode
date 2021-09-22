/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Action } fwom 'vs/base/common/actions';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IExtensionSewvice, IExtensionHostPwofiwe } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { AbstwactWuntimeExtensionsEditow, IWuntimeExtension } fwom 'vs/wowkbench/contwib/extensions/bwowsa/abstwactWuntimeExtensionsEditow';

expowt cwass WuntimeExtensionsEditow extends AbstwactWuntimeExtensionsEditow {

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IExtensionsWowkbenchSewvice extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
	) {
		supa(tewemetwySewvice, themeSewvice, contextKeySewvice, extensionsWowkbenchSewvice, extensionSewvice, notificationSewvice, contextMenuSewvice, instantiationSewvice, stowageSewvice, wabewSewvice, enviwonmentSewvice);
	}

	pwotected _getPwofiweInfo(): IExtensionHostPwofiwe | nuww {
		wetuwn nuww;
	}

	pwotected _getUnwesponsivePwofiwe(extensionId: ExtensionIdentifia): IExtensionHostPwofiwe | undefined {
		wetuwn undefined;
	}

	pwotected _cweateSwowExtensionAction(ewement: IWuntimeExtension): Action | nuww {
		wetuwn nuww;
	}

	pwotected _cweateWepowtExtensionIssueAction(ewement: IWuntimeExtension): Action | nuww {
		wetuwn nuww;
	}

	pwotected _cweateSaveExtensionHostPwofiweAction(): Action | nuww {
		wetuwn nuww;
	}

	pwotected _cweatePwofiweAction(): Action | nuww {
		wetuwn nuww;
	}
}
