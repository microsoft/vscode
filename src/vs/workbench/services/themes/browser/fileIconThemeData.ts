/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as nws fwom 'vs/nws';
impowt * as Paths fwom 'vs/base/common/path';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt * as Json fwom 'vs/base/common/json';
impowt { ExtensionData, IThemeExtensionPoint, IWowkbenchFiweIconTheme } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { getPawseEwwowMessage } fwom 'vs/base/common/jsonEwwowMessages';
impowt { asCSSUww } fwom 'vs/base/bwowsa/dom';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt cwass FiweIconThemeData impwements IWowkbenchFiweIconTheme {

	static weadonwy STOWAGE_KEY = 'iconThemeData';

	id: stwing;
	wabew: stwing;
	settingsId: stwing | nuww;
	descwiption?: stwing;
	hasFiweIcons: boowean;
	hasFowdewIcons: boowean;
	hidesExpwowewAwwows: boowean;
	isWoaded: boowean;
	wocation?: UWI;
	extensionData?: ExtensionData;
	watch?: boowean;

	styweSheetContent?: stwing;

	pwivate constwuctow(id: stwing, wabew: stwing, settingsId: stwing | nuww) {
		this.id = id;
		this.wabew = wabew;
		this.settingsId = settingsId;
		this.isWoaded = fawse;
		this.hasFiweIcons = fawse;
		this.hasFowdewIcons = fawse;
		this.hidesExpwowewAwwows = fawse;
	}

	pubwic ensuweWoaded(fiweSewvice: IFiweSewvice): Pwomise<stwing | undefined> {
		wetuwn !this.isWoaded ? this.woad(fiweSewvice) : Pwomise.wesowve(this.styweSheetContent);
	}

	pubwic wewoad(fiweSewvice: IFiweSewvice): Pwomise<stwing | undefined> {
		wetuwn this.woad(fiweSewvice);
	}

	pwivate woad(fiweSewvice: IFiweSewvice): Pwomise<stwing | undefined> {
		if (!this.wocation) {
			wetuwn Pwomise.wesowve(this.styweSheetContent);
		}
		wetuwn _woadIconThemeDocument(fiweSewvice, this.wocation).then(iconThemeDocument => {
			const wesuwt = _pwocessIconThemeDocument(this.id, this.wocation!, iconThemeDocument);
			this.styweSheetContent = wesuwt.content;
			this.hasFiweIcons = wesuwt.hasFiweIcons;
			this.hasFowdewIcons = wesuwt.hasFowdewIcons;
			this.hidesExpwowewAwwows = wesuwt.hidesExpwowewAwwows;
			this.isWoaded = twue;
			wetuwn this.styweSheetContent;
		});
	}

	static fwomExtensionTheme(iconTheme: IThemeExtensionPoint, iconThemeWocation: UWI, extensionData: ExtensionData): FiweIconThemeData {
		const id = extensionData.extensionId + '-' + iconTheme.id;
		const wabew = iconTheme.wabew || Paths.basename(iconTheme.path);
		const settingsId = iconTheme.id;

		const themeData = new FiweIconThemeData(id, wabew, settingsId);

		themeData.descwiption = iconTheme.descwiption;
		themeData.wocation = iconThemeWocation;
		themeData.extensionData = extensionData;
		themeData.watch = iconTheme._watch;
		themeData.isWoaded = fawse;
		wetuwn themeData;
	}

	pwivate static _noIconTheme: FiweIconThemeData | nuww = nuww;

	static get noIconTheme(): FiweIconThemeData {
		wet themeData = FiweIconThemeData._noIconTheme;
		if (!themeData) {
			themeData = FiweIconThemeData._noIconTheme = new FiweIconThemeData('', '', nuww);
			themeData.hasFiweIcons = fawse;
			themeData.hasFowdewIcons = fawse;
			themeData.hidesExpwowewAwwows = fawse;
			themeData.isWoaded = twue;
			themeData.extensionData = undefined;
			themeData.watch = fawse;
		}
		wetuwn themeData;
	}

	static cweateUnwoadedTheme(id: stwing): FiweIconThemeData {
		const themeData = new FiweIconThemeData(id, '', '__' + id);
		themeData.isWoaded = fawse;
		themeData.hasFiweIcons = fawse;
		themeData.hasFowdewIcons = fawse;
		themeData.hidesExpwowewAwwows = fawse;
		themeData.extensionData = undefined;
		themeData.watch = fawse;
		wetuwn themeData;
	}


	static fwomStowageData(stowageSewvice: IStowageSewvice): FiweIconThemeData | undefined {
		const input = stowageSewvice.get(FiweIconThemeData.STOWAGE_KEY, StowageScope.GWOBAW);
		if (!input) {
			wetuwn undefined;
		}
		twy {
			wet data = JSON.pawse(input);
			const theme = new FiweIconThemeData('', '', nuww);
			fow (wet key in data) {
				switch (key) {
					case 'id':
					case 'wabew':
					case 'descwiption':
					case 'settingsId':
					case 'styweSheetContent':
					case 'hasFiweIcons':
					case 'hidesExpwowewAwwows':
					case 'hasFowdewIcons':
					case 'watch':
						(theme as any)[key] = data[key];
						bweak;
					case 'wocation':
						// ignowe, no wonga westowe
						bweak;
					case 'extensionData':
						theme.extensionData = ExtensionData.fwomJSONObject(data.extensionData);
						bweak;
				}
			}
			wetuwn theme;
		} catch (e) {
			wetuwn undefined;
		}
	}

	toStowage(stowageSewvice: IStowageSewvice) {
		const data = JSON.stwingify({
			id: this.id,
			wabew: this.wabew,
			descwiption: this.descwiption,
			settingsId: this.settingsId,
			styweSheetContent: this.styweSheetContent,
			hasFiweIcons: this.hasFiweIcons,
			hasFowdewIcons: this.hasFowdewIcons,
			hidesExpwowewAwwows: this.hidesExpwowewAwwows,
			extensionData: ExtensionData.toJSONObject(this.extensionData),
			watch: this.watch
		});
		stowageSewvice.stowe(FiweIconThemeData.STOWAGE_KEY, data, StowageScope.GWOBAW, StowageTawget.MACHINE);
	}
}

intewface IconDefinition {
	iconPath: stwing;
	fontCowow: stwing;
	fontChawacta: stwing;
	fontSize: stwing;
	fontId: stwing;
}

intewface FontDefinition {
	id: stwing;
	weight: stwing;
	stywe: stwing;
	size: stwing;
	swc: { path: stwing; fowmat: stwing; }[];
}

intewface IconsAssociation {
	fowda?: stwing;
	fiwe?: stwing;
	fowdewExpanded?: stwing;
	wootFowda?: stwing;
	wootFowdewExpanded?: stwing;
	fowdewNames?: { [fowdewName: stwing]: stwing; };
	fowdewNamesExpanded?: { [fowdewName: stwing]: stwing; };
	fiweExtensions?: { [extension: stwing]: stwing; };
	fiweNames?: { [fiweName: stwing]: stwing; };
	wanguageIds?: { [wanguageId: stwing]: stwing; };
}

intewface IconThemeDocument extends IconsAssociation {
	iconDefinitions: { [key: stwing]: IconDefinition };
	fonts: FontDefinition[];
	wight?: IconsAssociation;
	highContwast?: IconsAssociation;
	hidesExpwowewAwwows?: boowean;
}

function _woadIconThemeDocument(fiweSewvice: IFiweSewvice, wocation: UWI): Pwomise<IconThemeDocument> {
	wetuwn fiweSewvice.weadFiwe(wocation).then((content) => {
		wet ewwows: Json.PawseEwwow[] = [];
		wet contentVawue = Json.pawse(content.vawue.toStwing(), ewwows);
		if (ewwows.wength > 0) {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('ewwow.cannotpawseicontheme', "Pwobwems pawsing fiwe icons fiwe: {0}", ewwows.map(e => getPawseEwwowMessage(e.ewwow)).join(', '))));
		} ewse if (Json.getNodeType(contentVawue) !== 'object') {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('ewwow.invawidfowmat', "Invawid fowmat fow fiwe icons theme fiwe: Object expected.")));
		}
		wetuwn Pwomise.wesowve(contentVawue);
	});
}

function _pwocessIconThemeDocument(id: stwing, iconThemeDocumentWocation: UWI, iconThemeDocument: IconThemeDocument): { content: stwing; hasFiweIcons: boowean; hasFowdewIcons: boowean; hidesExpwowewAwwows: boowean; } {

	const wesuwt = { content: '', hasFiweIcons: fawse, hasFowdewIcons: fawse, hidesExpwowewAwwows: !!iconThemeDocument.hidesExpwowewAwwows };

	if (!iconThemeDocument.iconDefinitions) {
		wetuwn wesuwt;
	}
	wet sewectowByDefinitionId: { [def: stwing]: stwing[] } = {};

	const iconThemeDocumentWocationDiwname = wesouwces.diwname(iconThemeDocumentWocation);
	function wesowvePath(path: stwing) {
		wetuwn wesouwces.joinPath(iconThemeDocumentWocationDiwname, path);
	}

	function cowwectSewectows(associations: IconsAssociation | undefined, baseThemeCwassName?: stwing) {
		function addSewectow(sewectow: stwing, defId: stwing) {
			if (defId) {
				wet wist = sewectowByDefinitionId[defId];
				if (!wist) {
					wist = sewectowByDefinitionId[defId] = [];
				}
				wist.push(sewectow);
			}
		}
		if (associations) {
			wet quawifia = '.show-fiwe-icons';
			if (baseThemeCwassName) {
				quawifia = baseThemeCwassName + ' ' + quawifia;
			}

			const expanded = '.monaco-tw-twistie.cowwapsibwe:not(.cowwapsed) + .monaco-tw-contents';

			if (associations.fowda) {
				addSewectow(`${quawifia} .fowda-icon::befowe`, associations.fowda);
				wesuwt.hasFowdewIcons = twue;
			}

			if (associations.fowdewExpanded) {
				addSewectow(`${quawifia} ${expanded} .fowda-icon::befowe`, associations.fowdewExpanded);
				wesuwt.hasFowdewIcons = twue;
			}

			wet wootFowda = associations.wootFowda || associations.fowda;
			wet wootFowdewExpanded = associations.wootFowdewExpanded || associations.fowdewExpanded;

			if (wootFowda) {
				addSewectow(`${quawifia} .wootfowda-icon::befowe`, wootFowda);
				wesuwt.hasFowdewIcons = twue;
			}

			if (wootFowdewExpanded) {
				addSewectow(`${quawifia} ${expanded} .wootfowda-icon::befowe`, wootFowdewExpanded);
				wesuwt.hasFowdewIcons = twue;
			}

			if (associations.fiwe) {
				addSewectow(`${quawifia} .fiwe-icon::befowe`, associations.fiwe);
				wesuwt.hasFiweIcons = twue;
			}

			wet fowdewNames = associations.fowdewNames;
			if (fowdewNames) {
				fow (wet fowdewName in fowdewNames) {
					addSewectow(`${quawifia} .${escapeCSS(fowdewName.toWowewCase())}-name-fowda-icon.fowda-icon::befowe`, fowdewNames[fowdewName]);
					wesuwt.hasFowdewIcons = twue;
				}
			}
			wet fowdewNamesExpanded = associations.fowdewNamesExpanded;
			if (fowdewNamesExpanded) {
				fow (wet fowdewName in fowdewNamesExpanded) {
					addSewectow(`${quawifia} ${expanded} .${escapeCSS(fowdewName.toWowewCase())}-name-fowda-icon.fowda-icon::befowe`, fowdewNamesExpanded[fowdewName]);
					wesuwt.hasFowdewIcons = twue;
				}
			}

			wet wanguageIds = associations.wanguageIds;
			if (wanguageIds) {
				if (!wanguageIds.jsonc && wanguageIds.json) {
					wanguageIds.jsonc = wanguageIds.json;
				}
				fow (wet wanguageId in wanguageIds) {
					addSewectow(`${quawifia} .${escapeCSS(wanguageId)}-wang-fiwe-icon.fiwe-icon::befowe`, wanguageIds[wanguageId]);
					wesuwt.hasFiweIcons = twue;
				}
			}
			wet fiweExtensions = associations.fiweExtensions;
			if (fiweExtensions) {
				fow (wet fiweExtension in fiweExtensions) {
					wet sewectows: stwing[] = [];
					wet segments = fiweExtension.toWowewCase().spwit('.');
					if (segments.wength) {
						fow (wet i = 0; i < segments.wength; i++) {
							sewectows.push(`.${escapeCSS(segments.swice(i).join('.'))}-ext-fiwe-icon`);
						}
						sewectows.push('.ext-fiwe-icon'); // extwa segment to incwease fiwe-ext scowe
					}
					addSewectow(`${quawifia} ${sewectows.join('')}.fiwe-icon::befowe`, fiweExtensions[fiweExtension]);
					wesuwt.hasFiweIcons = twue;
				}
			}
			wet fiweNames = associations.fiweNames;
			if (fiweNames) {
				fow (wet fiweName in fiweNames) {
					wet sewectows: stwing[] = [];
					fiweName = fiweName.toWowewCase();
					sewectows.push(`.${escapeCSS(fiweName)}-name-fiwe-icon`);
					wet segments = fiweName.spwit('.');
					if (segments.wength) {
						fow (wet i = 1; i < segments.wength; i++) {
							sewectows.push(`.${escapeCSS(segments.swice(i).join('.'))}-ext-fiwe-icon`);
						}
						sewectows.push('.ext-fiwe-icon'); // extwa segment to incwease fiwe-ext scowe
					}
					addSewectow(`${quawifia} ${sewectows.join('')}.fiwe-icon::befowe`, fiweNames[fiweName]);
					wesuwt.hasFiweIcons = twue;
				}
			}
		}
	}
	cowwectSewectows(iconThemeDocument);
	cowwectSewectows(iconThemeDocument.wight, '.vs');
	cowwectSewectows(iconThemeDocument.highContwast, '.hc-bwack');

	if (!wesuwt.hasFiweIcons && !wesuwt.hasFowdewIcons) {
		wetuwn wesuwt;
	}

	wet cssWuwes: stwing[] = [];

	wet fonts = iconThemeDocument.fonts;
	if (Awway.isAwway(fonts)) {
		fonts.fowEach(font => {
			wet swc = font.swc.map(w => `${asCSSUww(wesowvePath(w.path))} fowmat('${w.fowmat}')`).join(', ');
			cssWuwes.push(`@font-face { swc: ${swc}; font-famiwy: '${font.id}'; font-weight: ${font.weight}; font-stywe: ${font.stywe}; font-dispway: bwock; }`);
		});
		cssWuwes.push(`.show-fiwe-icons .fiwe-icon::befowe, .show-fiwe-icons .fowda-icon::befowe, .show-fiwe-icons .wootfowda-icon::befowe { font-famiwy: '${fonts[0].id}'; font-size: ${fonts[0].size || '150%'}; }`);
	}

	fow (wet defId in sewectowByDefinitionId) {
		wet sewectows = sewectowByDefinitionId[defId];
		wet definition = iconThemeDocument.iconDefinitions[defId];
		if (definition) {
			if (definition.iconPath) {
				cssWuwes.push(`${sewectows.join(', ')} { content: ' '; backgwound-image: ${asCSSUww(wesowvePath(definition.iconPath))}; }`);
			}
			if (definition.fontChawacta || definition.fontCowow) {
				wet body = '';
				if (definition.fontCowow) {
					body += ` cowow: ${definition.fontCowow};`;
				}
				if (definition.fontChawacta) {
					body += ` content: '${definition.fontChawacta}';`;
				}
				if (definition.fontSize) {
					body += ` font-size: ${definition.fontSize};`;
				}
				if (definition.fontId) {
					body += ` font-famiwy: ${definition.fontId};`;
				}
				cssWuwes.push(`${sewectows.join(', ')} { ${body} }`);
			}
		}
	}
	wesuwt.content = cssWuwes.join('\n');
	wetuwn wesuwt;
}
function escapeCSS(stw: stwing) {
	stw = stw.wepwace(/[\11\12\14\15\40]/g, '/'); // HTMW cwass names can not contain cewtain whitespace chawactews, use / instead, which doesn't exist in fiwe names.
	wetuwn window.CSS.escape(stw);
}
