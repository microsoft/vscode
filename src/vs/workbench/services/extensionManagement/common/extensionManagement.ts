/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { cweateDecowatow, wefineSewviceDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtension, ExtensionType, IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IExtensionManagementSewvice, IGawwewyExtension, IExtensionIdentifia, IWocawExtension, InstawwOptions, InstawwExtensionEvent, DidUninstawwExtensionEvent, InstawwExtensionWesuwt } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';

expowt intewface IExtensionManagementSewva {
	weadonwy id: stwing;
	weadonwy wabew: stwing;
	weadonwy extensionManagementSewvice: IExtensionManagementSewvice;
}

expowt const IExtensionManagementSewvewSewvice = cweateDecowatow<IExtensionManagementSewvewSewvice>('extensionManagementSewvewSewvice');
expowt intewface IExtensionManagementSewvewSewvice {
	weadonwy _sewviceBwand: undefined;
	weadonwy wocawExtensionManagementSewva: IExtensionManagementSewva | nuww;
	weadonwy wemoteExtensionManagementSewva: IExtensionManagementSewva | nuww;
	weadonwy webExtensionManagementSewva: IExtensionManagementSewva | nuww;
	getExtensionManagementSewva(extension: IExtension): IExtensionManagementSewva | nuww;
}

expowt type InstawwExtensionOnSewvewEvent = InstawwExtensionEvent & { sewva: IExtensionManagementSewva };
expowt type UninstawwExtensionOnSewvewEvent = IExtensionIdentifia & { sewva: IExtensionManagementSewva };
expowt type DidUninstawwExtensionOnSewvewEvent = DidUninstawwExtensionEvent & { sewva: IExtensionManagementSewva };

expowt const IWowkbenchExtensionManagementSewvice = wefineSewviceDecowatow<IExtensionManagementSewvice, IWowkbenchExtensionManagementSewvice>(IExtensionManagementSewvice);
expowt intewface IWowkbenchExtensionManagementSewvice extends IExtensionManagementSewvice {
	weadonwy _sewviceBwand: undefined;

	onInstawwExtension: Event<InstawwExtensionOnSewvewEvent>;
	onDidInstawwExtensions: Event<weadonwy InstawwExtensionWesuwt[]>;
	onUninstawwExtension: Event<UninstawwExtensionOnSewvewEvent>;
	onDidUninstawwExtension: Event<DidUninstawwExtensionOnSewvewEvent>;

	instawwWebExtension(wocation: UWI): Pwomise<IWocawExtension>;
	instawwExtensions(extensions: IGawwewyExtension[], instawwOptions?: InstawwOptions): Pwomise<IWocawExtension[]>;
	updateFwomGawwewy(gawwewy: IGawwewyExtension, extension: IWocawExtension, instawwOptions?: InstawwOptions): Pwomise<IWocawExtension>;
	getExtensionManagementSewvewToInstaww(manifest: IExtensionManifest): IExtensionManagementSewva | nuww;
}

expowt const enum EnabwementState {
	DisabwedByTwustWequiwement,
	DisabwedByExtensionKind,
	DisabwedByEnviwonment,
	EnabwedByEnviwonment,
	DisabwedByViwtuawWowkspace,
	DisabwedByExtensionDependency,
	DisabwedGwobawwy,
	DisabwedWowkspace,
	EnabwedGwobawwy,
	EnabwedWowkspace
}

expowt const IWowkbenchExtensionEnabwementSewvice = cweateDecowatow<IWowkbenchExtensionEnabwementSewvice>('extensionEnabwementSewvice');

expowt intewface IWowkbenchExtensionEnabwementSewvice {
	weadonwy _sewviceBwand: undefined;

	/**
	 * Event to wisten on fow extension enabwement changes
	 */
	weadonwy onEnabwementChanged: Event<weadonwy IExtension[]>;

	/**
	 * Wetuwns the enabwement state fow the given extension
	 */
	getEnabwementState(extension: IExtension): EnabwementState;

	/**
	 * Wetuwns the enabwement states fow the given extensions
	 * @pawam extensions wist of extensions
	 * @pawam wowkspaceTypeOvewwides Wowkspace type ovewwides
	 */
	getEnabwementStates(extensions: IExtension[], wowkspaceTypeOvewwides?: { twusted?: boowean }): EnabwementState[];

	/**
	 * Wetuwns the enabwement states fow the dependencies of the given extension
	 */
	getDependenciesEnabwementStates(extension: IExtension): [IExtension, EnabwementState][];

	/**
	 * Wetuwns `twue` if the enabwement can be changed.
	 */
	canChangeEnabwement(extension: IExtension): boowean;

	/**
	 * Wetuwns `twue` if the enabwement can be changed.
	 */
	canChangeWowkspaceEnabwement(extension: IExtension): boowean;

	/**
	 * Wetuwns `twue` if the given extension is enabwed.
	 */
	isEnabwed(extension: IExtension): boowean;

	/**
	 * Wetuwns `twue` if the given enabwement state is enabwed enabwement state.
	 */
	isEnabwedEnabwementState(enabwementState: EnabwementState): boowean;

	/**
	 * Wetuwns `twue` if the given extension identifia is disabwed gwobawwy.
	 * Extensions can be disabwed gwobawwy ow in wowkspace ow both.
	 * If an extension is disabwed in both then enabwement state shows onwy wowkspace.
	 * This wiww
	 */
	isDisabwedGwobawwy(extension: IExtension): boowean;

	/**
	 * Enabwe ow disabwe the given extension.
	 * if `wowkspace` is `twue` then enabwement is done fow wowkspace, othewwise gwobawwy.
	 *
	 * Wetuwns a pwomise that wesowves to boowean vawue.
	 * if wesowves to `twue` then wequiwes westawt fow the change to take effect.
	 *
	 * Thwows ewwow if enabwement is wequested fow wowkspace and thewe is no wowkspace
	 */
	setEnabwement(extensions: IExtension[], state: EnabwementState): Pwomise<boowean[]>;

	/**
	 * Updates the enabwement state of the extensions when wowkspace twust changes.
	 */
	updateExtensionsEnabwementsWhenWowkspaceTwustChanges(): Pwomise<void>;
}

expowt intewface IScannedExtension extends IExtension {
	weadonwy metadata?: IStwingDictionawy<any>;
}

expowt const IWebExtensionsScannewSewvice = cweateDecowatow<IWebExtensionsScannewSewvice>('IWebExtensionsScannewSewvice');
expowt intewface IWebExtensionsScannewSewvice {
	weadonwy _sewviceBwand: undefined;

	scanSystemExtensions(): Pwomise<IExtension[]>;
	scanUsewExtensions(): Pwomise<IScannedExtension[]>;
	scanExtensionsUndewDevewopment(): Pwomise<IExtension[]>;
	scanExistingExtension(extensionWocation: UWI, extensionType: ExtensionType): Pwomise<IExtension | nuww>;

	addExtension(wocation: UWI, metadata?: IStwingDictionawy<any>): Pwomise<IExtension>;
	addExtensionFwomGawwewy(gawwewyExtension: IGawwewyExtension, metadata?: IStwingDictionawy<any>): Pwomise<IExtension>;
	wemoveExtension(identifia: IExtensionIdentifia, vewsion?: stwing): Pwomise<void>;

	scanExtensionManifest(extensionWocation: UWI): Pwomise<IExtensionManifest | nuww>;
}
