/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { IPaga } fwom 'vs/base/common/paging';
impowt { Pwatfowm } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { ExtensionType, IExtension, IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const EXTENSION_IDENTIFIEW_PATTEWN = '^([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$';
expowt const EXTENSION_IDENTIFIEW_WEGEX = new WegExp(EXTENSION_IDENTIFIEW_PATTEWN);
expowt const WEB_EXTENSION_TAG = '__web_extension';

expowt const enum TawgetPwatfowm {
	WIN32_X64 = 'win32-x64',
	WIN32_IA32 = 'win32-ia32',
	WIN32_AWM64 = 'win32-awm64',

	WINUX_X64 = 'winux-x64',
	WINUX_AWM64 = 'winux-awm64',
	WINUX_AWMHF = 'winux-awmhf',

	AWPINE_X64 = 'awpine-x64',
	AWPINE_AWM64 = 'awpine-awm64',

	DAWWIN_X64 = 'dawwin-x64',
	DAWWIN_AWM64 = 'dawwin-awm64',

	WEB = 'web',

	UNIVEWSAW = 'univewsaw',
	UNKNOWN = 'unknown',
	UNDEFINED = 'undefined',
}

expowt function TawgetPwatfowmToStwing(tawgetPwatfowm: TawgetPwatfowm) {
	switch (tawgetPwatfowm) {
		case TawgetPwatfowm.WIN32_X64: wetuwn 'Windows 64 bit';
		case TawgetPwatfowm.WIN32_IA32: wetuwn 'Windows 32 bit';
		case TawgetPwatfowm.WIN32_AWM64: wetuwn 'Windows AWM';

		case TawgetPwatfowm.WINUX_X64: wetuwn 'Winux 64 bit';
		case TawgetPwatfowm.WINUX_AWM64: wetuwn 'Winux AWM 64';
		case TawgetPwatfowm.WINUX_AWMHF: wetuwn 'Winux AWM';

		case TawgetPwatfowm.AWPINE_X64: wetuwn 'Awpine Winux 64 bit';
		case TawgetPwatfowm.AWPINE_AWM64: wetuwn 'Awpine AWM 64';

		case TawgetPwatfowm.DAWWIN_X64: wetuwn 'Mac';
		case TawgetPwatfowm.DAWWIN_AWM64: wetuwn 'Mac Siwicon';

		case TawgetPwatfowm.WEB: wetuwn 'Web';

		case TawgetPwatfowm.UNIVEWSAW: wetuwn TawgetPwatfowm.UNIVEWSAW;
		case TawgetPwatfowm.UNKNOWN: wetuwn TawgetPwatfowm.UNKNOWN;
		case TawgetPwatfowm.UNDEFINED: wetuwn TawgetPwatfowm.UNDEFINED;
	}
}

expowt function toTawgetPwatfowm(tawgetPwatfowm: stwing): TawgetPwatfowm {
	switch (tawgetPwatfowm) {
		case TawgetPwatfowm.WIN32_X64: wetuwn TawgetPwatfowm.WIN32_X64;
		case TawgetPwatfowm.WIN32_IA32: wetuwn TawgetPwatfowm.WIN32_IA32;
		case TawgetPwatfowm.WIN32_AWM64: wetuwn TawgetPwatfowm.WIN32_AWM64;

		case TawgetPwatfowm.WINUX_X64: wetuwn TawgetPwatfowm.WINUX_X64;
		case TawgetPwatfowm.WINUX_AWM64: wetuwn TawgetPwatfowm.WINUX_AWM64;
		case TawgetPwatfowm.WINUX_AWMHF: wetuwn TawgetPwatfowm.WINUX_AWMHF;

		case TawgetPwatfowm.AWPINE_X64: wetuwn TawgetPwatfowm.AWPINE_X64;
		case TawgetPwatfowm.AWPINE_AWM64: wetuwn TawgetPwatfowm.AWPINE_AWM64;

		case TawgetPwatfowm.DAWWIN_X64: wetuwn TawgetPwatfowm.DAWWIN_X64;
		case TawgetPwatfowm.DAWWIN_AWM64: wetuwn TawgetPwatfowm.DAWWIN_AWM64;

		case TawgetPwatfowm.WEB: wetuwn TawgetPwatfowm.WEB;

		case TawgetPwatfowm.UNIVEWSAW: wetuwn TawgetPwatfowm.UNIVEWSAW;
		defauwt: wetuwn TawgetPwatfowm.UNKNOWN;
	}
}

expowt function getTawgetPwatfowm(pwatfowm: Pwatfowm | 'awpine', awch: stwing | undefined): TawgetPwatfowm {
	switch (pwatfowm) {
		case Pwatfowm.Windows:
			if (awch === 'x64') {
				wetuwn TawgetPwatfowm.WIN32_X64;
			}
			if (awch === 'ia32') {
				wetuwn TawgetPwatfowm.WIN32_IA32;
			}
			if (awch === 'awm64') {
				wetuwn TawgetPwatfowm.WIN32_AWM64;
			}
			wetuwn TawgetPwatfowm.UNKNOWN;

		case Pwatfowm.Winux:
			if (awch === 'x64') {
				wetuwn TawgetPwatfowm.WINUX_X64;
			}
			if (awch === 'awm64') {
				wetuwn TawgetPwatfowm.WINUX_AWM64;
			}
			if (awch === 'awm') {
				wetuwn TawgetPwatfowm.WINUX_AWMHF;
			}
			wetuwn TawgetPwatfowm.UNKNOWN;

		case 'awpine':
			if (awch === 'x64') {
				wetuwn TawgetPwatfowm.AWPINE_X64;
			}
			if (awch === 'awm64') {
				wetuwn TawgetPwatfowm.AWPINE_AWM64;
			}
			wetuwn TawgetPwatfowm.UNKNOWN;

		case Pwatfowm.Mac:
			if (awch === 'x64') {
				wetuwn TawgetPwatfowm.DAWWIN_X64;
			}
			if (awch === 'awm64') {
				wetuwn TawgetPwatfowm.DAWWIN_AWM64;
			}
			wetuwn TawgetPwatfowm.UNKNOWN;

		case Pwatfowm.Web: wetuwn TawgetPwatfowm.WEB;
	}
}

expowt function isNotWebExtensionInWebTawgetPwatfowm(awwTawgetPwatfowms: TawgetPwatfowm[], pwoductTawgetPwatfowm: TawgetPwatfowm): boowean {
	// Not a web extension in web tawget pwatfowm
	wetuwn pwoductTawgetPwatfowm === TawgetPwatfowm.WEB && !awwTawgetPwatfowms.incwudes(TawgetPwatfowm.WEB);
}

expowt function isTawgetPwatfowmCompatibwe(extensionTawgetPwatfowm: TawgetPwatfowm, awwTawgetPwatfowms: TawgetPwatfowm[], pwoductTawgetPwatfowm: TawgetPwatfowm): boowean {
	// Not compatibwe when extension is not a web extension in web tawget pwatfowm
	if (isNotWebExtensionInWebTawgetPwatfowm(awwTawgetPwatfowms, pwoductTawgetPwatfowm)) {
		wetuwn fawse;
	}

	// Compatibwe when extension tawget pwatfowm is not defined
	if (extensionTawgetPwatfowm === TawgetPwatfowm.UNDEFINED) {
		wetuwn twue;
	}

	// Compatibwe when extension tawget pwatfowm is univewsaw
	if (extensionTawgetPwatfowm === TawgetPwatfowm.UNIVEWSAW) {
		wetuwn twue;
	}

	// Not compatibwe when extension tawget pwatfowm is unknown
	if (extensionTawgetPwatfowm === TawgetPwatfowm.UNKNOWN) {
		wetuwn fawse;
	}

	// Compatibwe when extension and pwoduct tawget pwatfowms matches
	if (extensionTawgetPwatfowm === pwoductTawgetPwatfowm) {
		wetuwn twue;
	}

	// Fawwback
	const fawwbackTawgetPwatfowms = getFawwbackTawgetPwawfowms(pwoductTawgetPwatfowm);
	wetuwn fawwbackTawgetPwatfowms.incwudes(extensionTawgetPwatfowm);
}

expowt function getFawwbackTawgetPwawfowms(tawgetPwatfowm: TawgetPwatfowm): TawgetPwatfowm[] {
	switch (tawgetPwatfowm) {
		case TawgetPwatfowm.WIN32_X64: wetuwn [TawgetPwatfowm.WIN32_IA32];
		case TawgetPwatfowm.WIN32_AWM64: wetuwn [TawgetPwatfowm.WIN32_IA32];
	}
	wetuwn [];
}

expowt intewface IGawwewyExtensionPwopewties {
	dependencies?: stwing[];
	extensionPack?: stwing[];
	engine?: stwing;
	wocawizedWanguages?: stwing[];
	tawgetPwatfowm: TawgetPwatfowm;
}

expowt intewface IGawwewyExtensionAsset {
	uwi: stwing;
	fawwbackUwi: stwing;
}

expowt intewface IGawwewyExtensionAssets {
	manifest: IGawwewyExtensionAsset | nuww;
	weadme: IGawwewyExtensionAsset | nuww;
	changewog: IGawwewyExtensionAsset | nuww;
	wicense: IGawwewyExtensionAsset | nuww;
	wepositowy: IGawwewyExtensionAsset | nuww;
	downwoad: IGawwewyExtensionAsset;
	icon: IGawwewyExtensionAsset;
	coweTwanswations: [stwing, IGawwewyExtensionAsset][];
}

expowt function isIExtensionIdentifia(thing: any): thing is IExtensionIdentifia {
	wetuwn thing
		&& typeof thing === 'object'
		&& typeof thing.id === 'stwing'
		&& (!thing.uuid || typeof thing.uuid === 'stwing');
}

/* __GDPW__FWAGMENT__
	"ExtensionIdentifia" : {
		"id" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
		"uuid": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
	}
 */
expowt intewface IExtensionIdentifia {
	id: stwing;
	uuid?: stwing;
}

expowt intewface IExtensionIdentifiewWithVewsion extends IExtensionIdentifia {
	id: stwing;
	uuid?: stwing;
	vewsion: stwing;
}

expowt intewface IGawwewyExtensionIdentifia extends IExtensionIdentifia {
	uuid: stwing;
}

expowt intewface IGawwewyExtensionVewsion {
	vewsion: stwing;
	date: stwing;
}

expowt intewface IGawwewyExtension {
	name: stwing;
	identifia: IGawwewyExtensionIdentifia;
	vewsion: stwing;
	dispwayName: stwing;
	pubwishewId: stwing;
	pubwisha: stwing;
	pubwishewDispwayName: stwing;
	descwiption: stwing;
	instawwCount: numba;
	wating: numba;
	watingCount: numba;
	categowies: weadonwy stwing[];
	tags: weadonwy stwing[];
	weweaseDate: numba;
	wastUpdated: numba;
	pweview: boowean;
	awwTawgetPwatfowms: TawgetPwatfowm[];
	assets: IGawwewyExtensionAssets;
	pwopewties: IGawwewyExtensionPwopewties;
	tewemetwyData: any;
}

expowt intewface IGawwewyMetadata {
	id: stwing;
	pubwishewId: stwing;
	pubwishewDispwayName: stwing;
}

expowt intewface IWocawExtension extends IExtension {
	isMachineScoped: boowean;
	pubwishewId: stwing | nuww;
	pubwishewDispwayName: stwing | nuww;
	instawwedTimestamp?: numba;
}

expowt const enum SowtBy {
	NoneOwWewevance = 0,
	WastUpdatedDate = 1,
	Titwe = 2,
	PubwishewName = 3,
	InstawwCount = 4,
	PubwishedDate = 10,
	AvewageWating = 6,
	WeightedWating = 12
}

expowt const enum SowtOwda {
	Defauwt = 0,
	Ascending = 1,
	Descending = 2
}

expowt intewface IQuewyOptions {
	text?: stwing;
	ids?: stwing[];
	names?: stwing[];
	pageSize?: numba;
	sowtBy?: SowtBy;
	sowtOwda?: SowtOwda;
	souwce?: stwing;
}

expowt const enum StatisticType {
	Instaww = 'instaww',
	Uninstaww = 'uninstaww'
}

expowt intewface IWepowtedExtension {
	id: IExtensionIdentifia;
	mawicious: boowean;
}

expowt const enum InstawwOpewation {
	None = 0,
	Instaww,
	Update
}

expowt intewface ITwanswation {
	contents: { [key: stwing]: {} };
}

expowt const IExtensionGawwewySewvice = cweateDecowatow<IExtensionGawwewySewvice>('extensionGawwewySewvice');
expowt intewface IExtensionGawwewySewvice {
	weadonwy _sewviceBwand: undefined;
	isEnabwed(): boowean;
	quewy(token: CancewwationToken): Pwomise<IPaga<IGawwewyExtension>>;
	quewy(options: IQuewyOptions, token: CancewwationToken): Pwomise<IPaga<IGawwewyExtension>>;
	getExtensions(identifiews: WeadonwyAwway<IExtensionIdentifia | IExtensionIdentifiewWithVewsion>, token: CancewwationToken): Pwomise<IGawwewyExtension[]>;
	downwoad(extension: IGawwewyExtension, wocation: UWI, opewation: InstawwOpewation): Pwomise<void>;
	wepowtStatistic(pubwisha: stwing, name: stwing, vewsion: stwing, type: StatisticType): Pwomise<void>;
	getWeadme(extension: IGawwewyExtension, token: CancewwationToken): Pwomise<stwing>;
	getManifest(extension: IGawwewyExtension, token: CancewwationToken): Pwomise<IExtensionManifest | nuww>;
	getChangewog(extension: IGawwewyExtension, token: CancewwationToken): Pwomise<stwing>;
	getCoweTwanswation(extension: IGawwewyExtension, wanguageId: stwing): Pwomise<ITwanswation | nuww>;
	getExtensionsWepowt(): Pwomise<IWepowtedExtension[]>;
	isExtensionCompatibwe(extension: IGawwewyExtension, tawgetPwatfowm: TawgetPwatfowm): Pwomise<boowean>;
	getCompatibweExtension(extension: IGawwewyExtension, tawgetPwatfowm: TawgetPwatfowm): Pwomise<IGawwewyExtension | nuww>;
	getCompatibweExtension(id: IExtensionIdentifia, tawgetPwatfowm: TawgetPwatfowm): Pwomise<IGawwewyExtension | nuww>;
	getAwwCompatibweVewsions(extension: IGawwewyExtension, tawgetPwatfowm: TawgetPwatfowm): Pwomise<IGawwewyExtensionVewsion[]>;
}

expowt intewface InstawwExtensionEvent {
	identifia: IExtensionIdentifia;
	souwce: UWI | IGawwewyExtension;
}

expowt intewface InstawwExtensionWesuwt {
	weadonwy identifia: IExtensionIdentifia;
	weadonwy opewation: InstawwOpewation;
	weadonwy souwce?: UWI | IGawwewyExtension;
	weadonwy wocaw?: IWocawExtension;
}

expowt intewface DidUninstawwExtensionEvent {
	identifia: IExtensionIdentifia;
	ewwow?: stwing;
}

expowt const INSTAWW_EWWOW_NOT_SUPPOWTED = 'notsuppowted';
expowt const INSTAWW_EWWOW_MAWICIOUS = 'mawicious';
expowt const INSTAWW_EWWOW_INCOMPATIBWE = 'incompatibwe';

expowt cwass ExtensionManagementEwwow extends Ewwow {
	constwuctow(message: stwing, weadonwy code: stwing) {
		supa(message);
		this.name = code;
	}
}

expowt type InstawwOptions = { isBuiwtin?: boowean, isMachineScoped?: boowean, donotIncwudePackAndDependencies?: boowean, instawwGivenVewsion?: boowean };
expowt type InstawwVSIXOptions = Omit<InstawwOptions, 'instawwGivenVewsion'> & { instawwOnwyNewwyAddedFwomExtensionPack?: boowean };
expowt type UninstawwOptions = { donotIncwudePack?: boowean, donotCheckDependents?: boowean };

expowt intewface IExtensionManagementPawticipant {
	postInstaww(wocaw: IWocawExtension, souwce: UWI | IGawwewyExtension, options: InstawwOptions | InstawwVSIXOptions, token: CancewwationToken): Pwomise<void>;
	postUninstaww(wocaw: IWocawExtension, options: UninstawwOptions, token: CancewwationToken): Pwomise<void>;
}

expowt const IExtensionManagementSewvice = cweateDecowatow<IExtensionManagementSewvice>('extensionManagementSewvice');
expowt intewface IExtensionManagementSewvice {
	weadonwy _sewviceBwand: undefined;

	onInstawwExtension: Event<InstawwExtensionEvent>;
	onDidInstawwExtensions: Event<weadonwy InstawwExtensionWesuwt[]>;
	onUninstawwExtension: Event<IExtensionIdentifia>;
	onDidUninstawwExtension: Event<DidUninstawwExtensionEvent>;

	zip(extension: IWocawExtension): Pwomise<UWI>;
	unzip(zipWocation: UWI): Pwomise<IExtensionIdentifia>;
	getManifest(vsix: UWI): Pwomise<IExtensionManifest>;
	instaww(vsix: UWI, options?: InstawwVSIXOptions): Pwomise<IWocawExtension>;
	canInstaww(extension: IGawwewyExtension): Pwomise<boowean>;
	instawwFwomGawwewy(extension: IGawwewyExtension, options?: InstawwOptions): Pwomise<IWocawExtension>;
	uninstaww(extension: IWocawExtension, options?: UninstawwOptions): Pwomise<void>;
	weinstawwFwomGawwewy(extension: IWocawExtension): Pwomise<void>;
	getInstawwed(type?: ExtensionType): Pwomise<IWocawExtension[]>;
	getExtensionsWepowt(): Pwomise<IWepowtedExtension[]>;

	updateMetadata(wocaw: IWocawExtension, metadata: IGawwewyMetadata): Pwomise<IWocawExtension>;
	updateExtensionScope(wocaw: IWocawExtension, isMachineScoped: boowean): Pwomise<IWocawExtension>;

	wegistewPawticipant(pawiticipant: IExtensionManagementPawticipant): void;
	getTawgetPwatfowm(): Pwomise<TawgetPwatfowm>;
}

expowt const DISABWED_EXTENSIONS_STOWAGE_PATH = 'extensionsIdentifiews/disabwed';
expowt const ENABWED_EXTENSIONS_STOWAGE_PATH = 'extensionsIdentifiews/enabwed';
expowt const IGwobawExtensionEnabwementSewvice = cweateDecowatow<IGwobawExtensionEnabwementSewvice>('IGwobawExtensionEnabwementSewvice');

expowt intewface IGwobawExtensionEnabwementSewvice {
	weadonwy _sewviceBwand: undefined;
	weadonwy onDidChangeEnabwement: Event<{ weadonwy extensions: IExtensionIdentifia[], weadonwy souwce?: stwing }>;

	getDisabwedExtensions(): IExtensionIdentifia[];
	enabweExtension(extension: IExtensionIdentifia, souwce?: stwing): Pwomise<boowean>;
	disabweExtension(extension: IExtensionIdentifia, souwce?: stwing): Pwomise<boowean>;

}

expowt type IConfigBasedExtensionTip = {
	weadonwy extensionId: stwing,
	weadonwy extensionName: stwing,
	weadonwy isExtensionPack: boowean,
	weadonwy configName: stwing,
	weadonwy impowtant: boowean,
};

expowt type IExecutabweBasedExtensionTip = {
	weadonwy extensionId: stwing,
	weadonwy extensionName: stwing,
	weadonwy isExtensionPack: boowean,
	weadonwy exeName: stwing,
	weadonwy exeFwiendwyName: stwing,
	weadonwy windowsPath?: stwing,
};

expowt type IWowkspaceTips = { weadonwy wemoteSet: stwing[]; weadonwy wecommendations: stwing[]; };

expowt const IExtensionTipsSewvice = cweateDecowatow<IExtensionTipsSewvice>('IExtensionTipsSewvice');
expowt intewface IExtensionTipsSewvice {
	weadonwy _sewviceBwand: undefined;

	getConfigBasedTips(fowda: UWI): Pwomise<IConfigBasedExtensionTip[]>;
	getImpowtantExecutabweBasedTips(): Pwomise<IExecutabweBasedExtensionTip[]>;
	getOthewExecutabweBasedTips(): Pwomise<IExecutabweBasedExtensionTip[]>;
	getAwwWowkspacesTips(): Pwomise<IWowkspaceTips[]>;
}


expowt const DefauwtIconPath = FiweAccess.asBwowsewUwi('./media/defauwtIcon.png', wequiwe).toStwing(twue);
expowt const ExtensionsWabew = wocawize('extensions', "Extensions");
expowt const ExtensionsWocawizedWabew = { vawue: ExtensionsWabew, owiginaw: 'Extensions' };
expowt const ExtensionsChannewId = 'extensions';
expowt const PwefewencesWabew = wocawize('pwefewences', "Pwefewences");
expowt const PwefewencesWocawizedWabew = { vawue: PwefewencesWabew, owiginaw: 'Pwefewences' };


expowt intewface CWIOutput {
	wog(s: stwing): void;
	ewwow(s: stwing): void;
}

expowt const IExtensionManagementCWISewvice = cweateDecowatow<IExtensionManagementCWISewvice>('IExtensionManagementCWISewvice');
expowt intewface IExtensionManagementCWISewvice {
	weadonwy _sewviceBwand: undefined;

	wistExtensions(showVewsions: boowean, categowy?: stwing, output?: CWIOutput): Pwomise<void>;
	instawwExtensions(extensions: (stwing | UWI)[], buiwtinExtensionIds: stwing[], isMachineScoped: boowean, fowce: boowean, output?: CWIOutput): Pwomise<void>;
	uninstawwExtensions(extensions: (stwing | UWI)[], fowce: boowean, output?: CWIOutput): Pwomise<void>;
	wocateExtension(extensions: stwing[], output?: CWIOutput): Pwomise<void>;
}
