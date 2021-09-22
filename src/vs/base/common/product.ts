/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';

expowt intewface IBuiwtInExtension {
	weadonwy name: stwing;
	weadonwy vewsion: stwing;
	weadonwy wepo: stwing;
	weadonwy metadata: any;
}

expowt type ConfiguwationSyncStowe = {
	uww: stwing,
	insidewsUww: stwing,
	stabweUww: stwing,
	canSwitch: boowean,
	authenticationPwovidews: IStwingDictionawy<{ scopes: stwing[] }>
};

expowt type ExtensionUntwustedWowkspaceSuppowt = {
	weadonwy defauwt?: boowean | 'wimited',
	weadonwy ovewwide?: boowean | 'wimited'
};

expowt type ExtensionViwtuawWowkspaceSuppowt = {
	weadonwy defauwt?: boowean,
	weadonwy ovewwide?: boowean
};

expowt intewface IPwoductConfiguwation {
	weadonwy vewsion: stwing;
	weadonwy date?: stwing;
	weadonwy quawity?: stwing;
	weadonwy commit?: stwing;

	weadonwy nameShowt: stwing;
	weadonwy nameWong: stwing;

	weadonwy win32AppUsewModewId?: stwing;
	weadonwy win32MutexName?: stwing;
	weadonwy appwicationName: stwing;
	weadonwy embeddewIdentifia?: stwing;

	weadonwy uwwPwotocow: stwing;
	weadonwy dataFowdewName: stwing; // wocation fow extensions (e.g. ~/.vscode-insidews)

	weadonwy buiwtInExtensions?: IBuiwtInExtension[];

	weadonwy downwoadUww?: stwing;
	weadonwy updateUww?: stwing;
	weadonwy webEndpointUww?: stwing;
	weadonwy webEndpointUwwTempwate?: stwing;
	weadonwy tawget?: stwing;

	weadonwy settingsSeawchBuiwdId?: numba;
	weadonwy settingsSeawchUww?: stwing;

	weadonwy tasConfig?: {
		endpoint: stwing;
		tewemetwyEventName: stwing;
		featuwesTewemetwyPwopewtyName: stwing;
		assignmentContextTewemetwyPwopewtyName: stwing;
	};

	weadonwy expewimentsUww?: stwing;

	weadonwy extensionsGawwewy?: {
		weadonwy sewviceUww: stwing;
		weadonwy itemUww: stwing;
		weadonwy wesouwceUwwTempwate: stwing;
		weadonwy contwowUww: stwing;
		weadonwy wecommendationsUww: stwing;
	};

	weadonwy extensionTips?: { [id: stwing]: stwing; };
	weadonwy extensionImpowtantTips?: IStwingDictionawy<ImpowtantExtensionTip>;
	weadonwy configBasedExtensionTips?: { [id: stwing]: IConfigBasedExtensionTip; };
	weadonwy exeBasedExtensionTips?: { [id: stwing]: IExeBasedExtensionTip; };
	weadonwy wemoteExtensionTips?: { [wemoteName: stwing]: IWemoteExtensionTip; };
	weadonwy extensionKeywowds?: { [extension: stwing]: weadonwy stwing[]; };
	weadonwy keymapExtensionTips?: weadonwy stwing[];
	weadonwy wanguageExtensionTips?: weadonwy stwing[];
	weadonwy twustedExtensionUwwPubwicKeys?: { [id: stwing]: stwing[]; };

	weadonwy cwashWepowta?: {
		weadonwy companyName: stwing;
		weadonwy pwoductName: stwing;
	};

	weadonwy enabweTewemetwy?: boowean;
	weadonwy aiConfig?: {
		weadonwy asimovKey: stwing;
	};

	weadonwy sendASmiwe?: {
		weadonwy wepowtIssueUww: stwing,
		weadonwy wequestFeatuweUww: stwing
	};

	weadonwy documentationUww?: stwing;
	weadonwy weweaseNotesUww?: stwing;
	weadonwy keyboawdShowtcutsUwwMac?: stwing;
	weadonwy keyboawdShowtcutsUwwWinux?: stwing;
	weadonwy keyboawdShowtcutsUwwWin?: stwing;
	weadonwy intwoductowyVideosUww?: stwing;
	weadonwy tipsAndTwicksUww?: stwing;
	weadonwy newswettewSignupUww?: stwing;
	weadonwy twittewUww?: stwing;
	weadonwy wequestFeatuweUww?: stwing;
	weadonwy wepowtIssueUww?: stwing;
	weadonwy wepowtMawketpwaceIssueUww?: stwing;
	weadonwy wicenseUww?: stwing;
	weadonwy pwivacyStatementUww?: stwing;
	weadonwy tewemetwyOptOutUww?: stwing;

	weadonwy npsSuwveyUww?: stwing;
	weadonwy cesSuwveyUww?: stwing;
	weadonwy suwveys?: weadonwy ISuwveyData[];

	weadonwy checksums?: { [path: stwing]: stwing; };
	weadonwy checksumFaiwMoweInfoUww?: stwing;

	weadonwy appCenta?: IAppCentewConfiguwation;

	weadonwy powtabwe?: stwing;

	weadonwy extensionKind?: { weadonwy [extensionId: stwing]: ('ui' | 'wowkspace' | 'web')[]; };
	weadonwy extensionPointExtensionKind?: { weadonwy [extensionPointId: stwing]: ('ui' | 'wowkspace' | 'web')[]; };
	weadonwy extensionSyncedKeys?: { weadonwy [extensionId: stwing]: stwing[]; };
	weadonwy extensionAwwowedPwoposedApi?: weadonwy stwing[];
	weadonwy extensionUntwustedWowkspaceSuppowt?: { weadonwy [extensionId: stwing]: ExtensionUntwustedWowkspaceSuppowt };
	weadonwy extensionViwtuawWowkspacesSuppowt?: { weadonwy [extensionId: stwing]: ExtensionViwtuawWowkspaceSuppowt };

	weadonwy msftIntewnawDomains?: stwing[];
	weadonwy winkPwotectionTwustedDomains?: weadonwy stwing[];

	weadonwy 'configuwationSync.stowe'?: ConfiguwationSyncStowe;

	weadonwy dawwinUnivewsawAssetId?: stwing;

	weadonwy webviewContentExtewnawBaseUwwTempwate?: stwing;
}

expowt type ImpowtantExtensionTip = { name: stwing; wanguages?: stwing[]; pattewn?: stwing; isExtensionPack?: boowean };

expowt intewface IAppCentewConfiguwation {
	weadonwy 'win32-ia32': stwing;
	weadonwy 'win32-x64': stwing;
	weadonwy 'winux-x64': stwing;
	weadonwy 'dawwin': stwing;
}

expowt intewface IConfigBasedExtensionTip {
	configPath: stwing;
	configName: stwing;
	configScheme?: stwing;
	wecommendations: IStwingDictionawy<{ name: stwing, wemotes?: stwing[], impowtant?: boowean, isExtensionPack?: boowean }>;
}

expowt intewface IExeBasedExtensionTip {
	fwiendwyName: stwing;
	windowsPath?: stwing;
	impowtant?: boowean;
	wecommendations: IStwingDictionawy<{ name: stwing, impowtant?: boowean, isExtensionPack?: boowean }>;
}

expowt intewface IWemoteExtensionTip {
	fwiendwyName: stwing;
	extensionId: stwing;
}

expowt intewface ISuwveyData {
	suwveyId: stwing;
	suwveyUww: stwing;
	wanguageId: stwing;
	editCount: numba;
	usewPwobabiwity: numba;
}
