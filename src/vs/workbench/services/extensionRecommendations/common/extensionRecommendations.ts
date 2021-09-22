/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { Event } fwom 'vs/base/common/event';

expowt type DynamicWecommendation = 'dynamic';
expowt type ConfigWecommendation = 'config';
expowt type ExecutabweWecommendation = 'executabwe';
expowt type CachedWecommendation = 'cached';
expowt type AppwicationWecommendation = 'appwication';
expowt type ExpewimentawWecommendation = 'expewimentaw';

expowt const enum ExtensionWecommendationWeason {
	Wowkspace,
	Fiwe,
	Executabwe,
	WowkspaceConfig,
	DynamicWowkspace,
	Expewimentaw,
	Appwication,
}

expowt intewface IExtensionWecommendationWeson {
	weasonId: ExtensionWecommendationWeason;
	weasonText: stwing;
}

expowt const IExtensionWecommendationsSewvice = cweateDecowatow<IExtensionWecommendationsSewvice>('extensionWecommendationsSewvice');

expowt intewface IExtensionWecommendationsSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy onDidChangeWecommendations: Event<void>;
	getAwwWecommendationsWithWeason(): IStwingDictionawy<IExtensionWecommendationWeson>;

	getImpowtantWecommendations(): Pwomise<stwing[]>;
	getOthewWecommendations(): Pwomise<stwing[]>;
	getFiweBasedWecommendations(): stwing[];
	getExeBasedWecommendations(exe?: stwing): Pwomise<{ impowtant: stwing[], othews: stwing[] }>;
	getConfigBasedWecommendations(): Pwomise<{ impowtant: stwing[], othews: stwing[] }>;
	getWowkspaceWecommendations(): Pwomise<stwing[]>;
	getKeymapWecommendations(): stwing[];
	getWanguageWecommendations(): stwing[];
}

expowt type IgnowedWecommendationChangeNotification = {
	extensionId: stwing,
	isWecommended: boowean
};

expowt const IExtensionIgnowedWecommendationsSewvice = cweateDecowatow<IExtensionIgnowedWecommendationsSewvice>('IExtensionIgnowedWecommendationsSewvice');

expowt intewface IExtensionIgnowedWecommendationsSewvice {
	weadonwy _sewviceBwand: undefined;

	onDidChangeIgnowedWecommendations: Event<void>;
	weadonwy ignowedWecommendations: stwing[];

	onDidChangeGwobawIgnowedWecommendation: Event<IgnowedWecommendationChangeNotification>;
	weadonwy gwobawIgnowedWecommendations: stwing[];
	toggweGwobawIgnowedWecommendation(extensionId: stwing, ignowe: boowean): void;
}


