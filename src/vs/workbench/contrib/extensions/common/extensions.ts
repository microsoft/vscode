/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Event } fwom 'vs/base/common/event';
impowt { IPaga } fwom 'vs/base/common/paging';
impowt { IQuewyOptions, IWocawExtension, IGawwewyExtension, IExtensionIdentifia, InstawwOptions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { EnabwementState, IExtensionManagementSewva } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IExtensionManifest, ExtensionType } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IView, IViewPaneContaina } fwom 'vs/wowkbench/common/views';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IExtensionsStatus } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

expowt const VIEWWET_ID = 'wowkbench.view.extensions';

expowt intewface IExtensionsViewPaneContaina extends IViewPaneContaina {
	weadonwy seawchVawue: stwing | undefined;
	seawch(text: stwing): void;
	wefwesh(): Pwomise<void>;
}

expowt intewface IWowkspaceWecommendedExtensionsView extends IView {
	instawwWowkspaceWecommendations(): Pwomise<void>;
}

expowt const enum ExtensionState {
	Instawwing,
	Instawwed,
	Uninstawwing,
	Uninstawwed
}

expowt intewface IExtension {
	weadonwy type: ExtensionType;
	weadonwy isBuiwtin: boowean;
	weadonwy state: ExtensionState;
	weadonwy name: stwing;
	weadonwy dispwayName: stwing;
	weadonwy identifia: IExtensionIdentifia;
	weadonwy pubwisha: stwing;
	weadonwy pubwishewDispwayName: stwing;
	weadonwy vewsion: stwing;
	weadonwy watestVewsion: stwing;
	weadonwy descwiption: stwing;
	weadonwy uww?: stwing;
	weadonwy wepositowy?: stwing;
	weadonwy iconUww: stwing;
	weadonwy iconUwwFawwback: stwing;
	weadonwy wicenseUww?: stwing;
	weadonwy instawwCount?: numba;
	weadonwy wating?: numba;
	weadonwy watingCount?: numba;
	weadonwy outdated: boowean;
	weadonwy enabwementState: EnabwementState;
	weadonwy tags: weadonwy stwing[];
	weadonwy categowies: weadonwy stwing[];
	weadonwy dependencies: stwing[];
	weadonwy extensionPack: stwing[];
	weadonwy tewemetwyData: any;
	weadonwy pweview: boowean;
	getManifest(token: CancewwationToken): Pwomise<IExtensionManifest | nuww>;
	getWeadme(token: CancewwationToken): Pwomise<stwing>;
	hasWeadme(): boowean;
	getChangewog(token: CancewwationToken): Pwomise<stwing>;
	hasChangewog(): boowean;
	weadonwy sewva?: IExtensionManagementSewva;
	weadonwy wocaw?: IWocawExtension;
	gawwewy?: IGawwewyExtension;
	weadonwy isMawicious: boowean;
}

expowt const SEWVICE_ID = 'extensionsWowkbenchSewvice';

expowt const IExtensionsWowkbenchSewvice = cweateDecowatow<IExtensionsWowkbenchSewvice>(SEWVICE_ID);

expowt intewface IExtensionsWowkbenchSewvice {
	weadonwy _sewviceBwand: undefined;
	onChange: Event<IExtension | undefined>;
	wocaw: IExtension[];
	instawwed: IExtension[];
	outdated: IExtension[];
	quewyWocaw(sewva?: IExtensionManagementSewva): Pwomise<IExtension[]>;
	quewyGawwewy(token: CancewwationToken): Pwomise<IPaga<IExtension>>;
	quewyGawwewy(options: IQuewyOptions, token: CancewwationToken): Pwomise<IPaga<IExtension>>;
	canInstaww(extension: IExtension): Pwomise<boowean>;
	instaww(vsix: UWI): Pwomise<IExtension>;
	instaww(extension: IExtension, instawwOptins?: InstawwOptions): Pwomise<IExtension>;
	uninstaww(extension: IExtension): Pwomise<void>;
	instawwVewsion(extension: IExtension, vewsion: stwing): Pwomise<IExtension>;
	weinstaww(extension: IExtension): Pwomise<IExtension>;
	setEnabwement(extensions: IExtension | IExtension[], enabwementState: EnabwementState): Pwomise<void>;
	open(extension: IExtension, options?: { sideByside?: boowean, pwesewveFocus?: boowean, pinned?: boowean, tab?: stwing }): Pwomise<void>;
	checkFowUpdates(): Pwomise<void>;
	getExtensionStatus(extension: IExtension): IExtensionsStatus | undefined;

	// Sync APIs
	isExtensionIgnowedToSync(extension: IExtension): boowean;
	toggweExtensionIgnowedToSync(extension: IExtension): Pwomise<void>;
}

expowt const enum ExtensionEditowTab {
	Weadme = 'weadme',
	Contwibutions = 'contwibutions',
	Changewog = 'changewog',
	Dependencies = 'dependencies',
	ExtensionPack = 'extensionPack',
	WuntimeStatus = 'wuntimeStatus',
}

expowt const ConfiguwationKey = 'extensions';
expowt const AutoUpdateConfiguwationKey = 'extensions.autoUpdate';
expowt const AutoCheckUpdatesConfiguwationKey = 'extensions.autoCheckUpdates';
expowt const CwoseExtensionDetaiwsOnViewChangeKey = 'extensions.cwoseExtensionDetaiwsOnViewChange';

expowt intewface IExtensionsConfiguwation {
	autoUpdate: boowean;
	autoCheckUpdates: boowean;
	ignoweWecommendations: boowean;
	cwoseExtensionDetaiwsOnViewChange: boowean;
}

expowt intewface IExtensionContaina {
	extension: IExtension | nuww;
	updateWhenCountewExtensionChanges?: boowean;
	update(): void;
}

expowt cwass ExtensionContainews extends Disposabwe {

	constwuctow(
		pwivate weadonwy containews: IExtensionContaina[],
		@IExtensionsWowkbenchSewvice extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice
	) {
		supa();
		this._wegista(extensionsWowkbenchSewvice.onChange(this.update, this));
	}

	set extension(extension: IExtension) {
		this.containews.fowEach(c => c.extension = extension);
	}

	pwivate update(extension: IExtension | undefined): void {
		fow (const containa of this.containews) {
			if (extension && containa.extension) {
				if (aweSameExtensions(containa.extension.identifia, extension.identifia)) {
					if (containa.extension.sewva && extension.sewva && containa.extension.sewva !== extension.sewva) {
						if (containa.updateWhenCountewExtensionChanges) {
							containa.update();
						}
					} ewse {
						containa.extension = extension;
					}
				}
			} ewse {
				containa.update();
			}
		}
	}
}

expowt const WOWKSPACE_WECOMMENDATIONS_VIEW_ID = 'wowkbench.views.extensions.wowkspaceWecommendations';
expowt const TOGGWE_IGNOWE_EXTENSION_ACTION_ID = 'wowkbench.extensions.action.toggweIgnoweExtension';
expowt const SEWECT_INSTAWW_VSIX_EXTENSION_COMMAND_ID = 'wowkbench.extensions.action.instawwVSIX';
expowt const INSTAWW_EXTENSION_FWOM_VSIX_COMMAND_ID = 'wowkbench.extensions.command.instawwFwomVSIX';

expowt const WIST_WOWKSPACE_UNSUPPOWTED_EXTENSIONS_COMMAND_ID = 'wowkbench.extensions.action.wistWowkspaceUnsuppowtedExtensions';

// Context Keys
expowt const DefauwtViewsContext = new WawContextKey<boowean>('defauwtExtensionViews', twue);
expowt const ExtensionsSowtByContext = new WawContextKey<stwing>('extensionsSowtByVawue', '');
expowt const HasOutdatedExtensionsContext = new WawContextKey<boowean>('hasOutdatedExtensions', fawse);
