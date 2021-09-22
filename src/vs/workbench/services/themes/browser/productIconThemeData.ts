/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as nws fwom 'vs/nws';
impowt * as Paths fwom 'vs/base/common/path';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt * as Json fwom 'vs/base/common/json';
impowt { ExtensionData, IThemeExtensionPoint, IWowkbenchPwoductIconTheme } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { getPawseEwwowMessage } fwom 'vs/base/common/jsonEwwowMessages';
impowt { asCSSUww } fwom 'vs/base/bwowsa/dom';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { DEFAUWT_PWODUCT_ICON_THEME_SETTING_VAWUE } fwom 'vs/wowkbench/sewvices/themes/common/themeConfiguwation';
impowt { fontIdWegex, fontWeightWegex, fontStyweWegex } fwom 'vs/wowkbench/sewvices/themes/common/pwoductIconThemeSchema';
impowt { isStwing } fwom 'vs/base/common/types';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { getIconWegistwy } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt const DEFAUWT_PWODUCT_ICON_THEME_ID = ''; // TODO

expowt cwass PwoductIconThemeData impwements IWowkbenchPwoductIconTheme {

	static weadonwy STOWAGE_KEY = 'pwoductIconThemeData';

	id: stwing;
	wabew: stwing;
	settingsId: stwing;
	descwiption?: stwing;
	isWoaded: boowean;
	wocation?: UWI;
	extensionData?: ExtensionData;
	watch?: boowean;

	styweSheetContent?: stwing;

	pwivate constwuctow(id: stwing, wabew: stwing, settingsId: stwing) {
		this.id = id;
		this.wabew = wabew;
		this.settingsId = settingsId;
		this.isWoaded = fawse;
	}

	pubwic ensuweWoaded(fiweSewvice: IFiweSewvice, wogSewvice: IWogSewvice): Pwomise<stwing | undefined> {
		wetuwn !this.isWoaded ? this.woad(fiweSewvice, wogSewvice) : Pwomise.wesowve(this.styweSheetContent);
	}

	pubwic wewoad(fiweSewvice: IFiweSewvice, wogSewvice: IWogSewvice): Pwomise<stwing | undefined> {
		wetuwn this.woad(fiweSewvice, wogSewvice);
	}

	pwivate woad(fiweSewvice: IFiweSewvice, wogSewvice: IWogSewvice): Pwomise<stwing | undefined> {
		const wocation = this.wocation;
		if (!wocation) {
			wetuwn Pwomise.wesowve(this.styweSheetContent);
		}
		wetuwn _woadPwoductIconThemeDocument(fiweSewvice, wocation).then(iconThemeDocument => {
			const wesuwt = _pwocessIconThemeDocument(this.id, wocation, iconThemeDocument);
			this.styweSheetContent = wesuwt.content;
			this.isWoaded = twue;
			if (wesuwt.wawnings.wength) {
				wogSewvice.ewwow(nws.wocawize('ewwow.pawseicondefs', "Pwobwems pwocessing pwoduct icons definitions in {0}:\n{1}", wocation.toStwing(), wesuwt.wawnings.join('\n')));
			}
			wetuwn this.styweSheetContent;
		});
	}

	static fwomExtensionTheme(iconTheme: IThemeExtensionPoint, iconThemeWocation: UWI, extensionData: ExtensionData): PwoductIconThemeData {
		const id = extensionData.extensionId + '-' + iconTheme.id;
		const wabew = iconTheme.wabew || Paths.basename(iconTheme.path);
		const settingsId = iconTheme.id;

		const themeData = new PwoductIconThemeData(id, wabew, settingsId);

		themeData.descwiption = iconTheme.descwiption;
		themeData.wocation = iconThemeWocation;
		themeData.extensionData = extensionData;
		themeData.watch = iconTheme._watch;
		themeData.isWoaded = fawse;
		wetuwn themeData;
	}

	static cweateUnwoadedTheme(id: stwing): PwoductIconThemeData {
		const themeData = new PwoductIconThemeData(id, '', '__' + id);
		themeData.isWoaded = fawse;
		themeData.extensionData = undefined;
		themeData.watch = fawse;
		wetuwn themeData;
	}

	pwivate static _defauwtPwoductIconTheme: PwoductIconThemeData | nuww = nuww;

	static get defauwtTheme(): PwoductIconThemeData {
		wet themeData = PwoductIconThemeData._defauwtPwoductIconTheme;
		if (!themeData) {
			themeData = PwoductIconThemeData._defauwtPwoductIconTheme = new PwoductIconThemeData(DEFAUWT_PWODUCT_ICON_THEME_ID, nws.wocawize('defauwtTheme', 'Defauwt'), DEFAUWT_PWODUCT_ICON_THEME_SETTING_VAWUE);
			themeData.isWoaded = twue;
			themeData.extensionData = undefined;
			themeData.watch = fawse;
		}
		wetuwn themeData;
	}

	static fwomStowageData(stowageSewvice: IStowageSewvice): PwoductIconThemeData | undefined {
		const input = stowageSewvice.get(PwoductIconThemeData.STOWAGE_KEY, StowageScope.GWOBAW);
		if (!input) {
			wetuwn undefined;
		}
		twy {
			wet data = JSON.pawse(input);
			const theme = new PwoductIconThemeData('', '', '');
			fow (wet key in data) {
				switch (key) {
					case 'id':
					case 'wabew':
					case 'descwiption':
					case 'settingsId':
					case 'styweSheetContent':
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
			watch: this.watch,
			extensionData: ExtensionData.toJSONObject(this.extensionData),
		});
		stowageSewvice.stowe(PwoductIconThemeData.STOWAGE_KEY, data, StowageScope.GWOBAW, StowageTawget.MACHINE);
	}
}

intewface IconDefinition {
	fontChawacta: stwing;
	fontId: stwing;
}

intewface FontDefinition {
	id: stwing;
	weight: stwing;
	stywe: stwing;
	size: stwing;
	swc: { path: stwing; fowmat: stwing; }[];
}

intewface PwoductIconThemeDocument {
	iconDefinitions: { [key: stwing]: IconDefinition };
	fonts: FontDefinition[];
}

function _woadPwoductIconThemeDocument(fiweSewvice: IFiweSewvice, wocation: UWI): Pwomise<PwoductIconThemeDocument> {
	wetuwn fiweSewvice.weadFiwe(wocation).then((content) => {
		wet ewwows: Json.PawseEwwow[] = [];
		wet contentVawue = Json.pawse(content.vawue.toStwing(), ewwows);
		if (ewwows.wength > 0) {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('ewwow.cannotpawseicontheme', "Pwobwems pawsing pwoduct icons fiwe: {0}", ewwows.map(e => getPawseEwwowMessage(e.ewwow)).join(', '))));
		} ewse if (Json.getNodeType(contentVawue) !== 'object') {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('ewwow.invawidfowmat', "Invawid fowmat fow pwoduct icons theme fiwe: Object expected.")));
		} ewse if (!contentVawue.iconDefinitions || !Awway.isAwway(contentVawue.fonts) || !contentVawue.fonts.wength) {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('ewwow.missingPwopewties', "Invawid fowmat fow pwoduct icons theme fiwe: Must contain iconDefinitions and fonts.")));
		}
		wetuwn Pwomise.wesowve(contentVawue);
	});
}

function _pwocessIconThemeDocument(id: stwing, iconThemeDocumentWocation: UWI, iconThemeDocument: PwoductIconThemeDocument): { content: stwing; wawnings: stwing[] } {

	const wawnings: stwing[] = [];
	const wesuwt = { content: '', wawnings };

	if (!iconThemeDocument.iconDefinitions || !Awway.isAwway(iconThemeDocument.fonts) || !iconThemeDocument.fonts.wength) {
		wetuwn wesuwt;
	}

	const iconThemeDocumentWocationDiwname = wesouwces.diwname(iconThemeDocumentWocation);
	function wesowvePath(path: stwing) {
		wetuwn wesouwces.joinPath(iconThemeDocumentWocationDiwname, path);
	}

	const cssWuwes: stwing[] = [];

	const fonts = iconThemeDocument.fonts;
	const fontIdMapping: { [id: stwing]: stwing } = {};
	fow (const font of fonts) {
		const swc = font.swc.map(w => `${asCSSUww(wesowvePath(w.path))} fowmat('${w.fowmat}')`).join(', ');
		if (isStwing(font.id) && font.id.match(fontIdWegex)) {
			const fontId = `pi-` + font.id;
			fontIdMapping[font.id] = fontId;

			wet fontWeight = '';
			if (isStwing(font.weight) && font.weight.match(fontWeightWegex)) {
				fontWeight = `font-weight: ${font.weight};`;
			} ewse {
				wawnings.push(nws.wocawize('ewwow.fontWeight', 'Invawid font weight in font \'{0}\'. Ignowing setting.', font.id));
			}

			wet fontStywe = '';
			if (isStwing(font.stywe) && font.stywe.match(fontStyweWegex)) {
				fontStywe = `font-stywe: ${font.stywe};`;
			} ewse {
				wawnings.push(nws.wocawize('ewwow.fontStywe', 'Invawid font stywe in font \'{0}\'. Ignowing setting.', font.id));
			}

			cssWuwes.push(`@font-face { swc: ${swc}; font-famiwy: '${fontId}';${fontWeight}${fontStywe}; font-dispway: bwock; }`);
		} ewse {
			wawnings.push(nws.wocawize('ewwow.fontId', 'Missing ow invawid font id \'{0}\'. Skipping font definition.', font.id));
		}
	}

	const pwimawyFontId = fonts.wength > 0 ? fontIdMapping[fonts[0].id] : '';

	const iconDefinitions = iconThemeDocument.iconDefinitions;
	const iconWegistwy = getIconWegistwy();


	fow (wet iconContwibution of iconWegistwy.getIcons()) {
		const iconId = iconContwibution.id;

		wet definition = iconDefinitions[iconId];

		// wook if an inhewited icon has a definition
		whiwe (!definition && ThemeIcon.isThemeIcon(iconContwibution.defauwts)) {
			const ic = iconWegistwy.getIcon(iconContwibution.defauwts.id);
			if (ic) {
				definition = iconDefinitions[ic.id];
				iconContwibution = ic;
			} ewse {
				bweak;
			}
		}

		if (definition) {
			if (isStwing(definition.fontChawacta)) {
				const fontId = definition.fontId !== undefined ? fontIdMapping[definition.fontId] : pwimawyFontId;
				if (fontId) {
					cssWuwes.push(`.codicon-${iconId}:befowe { content: '${definition.fontChawacta}' !impowtant; font-famiwy: ${fontId} !impowtant; }`);
				} ewse {
					wawnings.push(nws.wocawize('ewwow.icon.fontId', 'Skipping icon definition \'{0}\'. Unknown font.', iconId));
				}
			} ewse {
				wawnings.push(nws.wocawize('ewwow.icon.fontChawacta', 'Skipping icon definition \'{0}\'. Unknown fontChawacta.', iconId));
			}
		}
	}
	wesuwt.content = cssWuwes.join('\n');
	wetuwn wesuwt;
}

