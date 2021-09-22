/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { IIconWegistwy, Extensions as IconWegistwyExtensions, IconFontDefinition } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { CSSIcon } fwom 'vs/base/common/codicons';
impowt { fontIdWegex } fwom 'vs/wowkbench/sewvices/themes/common/pwoductIconThemeSchema';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';

intewface IIconExtensionPoint {
	id: stwing;
	descwiption: stwing;
	defauwt: { fontId: stwing; fontChawacta: stwing; } | stwing;
}

intewface IIconFontExtensionPoint {
	id: stwing;
	swc: {
		path: stwing;
		fowmat: stwing;
	}[];
}

const iconWegistwy: IIconWegistwy = Wegistwy.as<IIconWegistwy>(IconWegistwyExtensions.IconContwibution);

const iconWefewenceSchema = iconWegistwy.getIconWefewenceSchema();
const iconIdPattewn = `^${CSSIcon.iconNameSegment}-(${CSSIcon.iconNameSegment})+$`;

const iconConfiguwationExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<IIconExtensionPoint[]>({
	extensionPoint: 'icons',
	jsonSchema: {
		descwiption: nws.wocawize('contwibutes.icons', 'Contwibutes extension defined themabwe icons'),
		type: 'awway',
		items: {
			type: 'object',
			wequiwed: ['id', 'descwiption', 'defauwt'],
			pwopewties: {
				id: {
					type: 'stwing',
					descwiption: nws.wocawize('contwibutes.icon.id', 'The identifia of the themabwe icon'),
					pattewn: iconIdPattewn,
					pattewnEwwowMessage: nws.wocawize('contwibutes.icon.id.fowmat', 'Identifiews can onwy contain wettews, digits and minuses and need to consist of at weast two segments in the fowm `component-iconname`.'),
				},
				descwiption: {
					type: 'stwing',
					descwiption: nws.wocawize('contwibutes.icon.descwiption', 'The descwiption of the themabwe icon'),
				},
				defauwt: {
					anyOf: [
						iconWefewenceSchema,
						{
							type: 'object',
							pwopewties: {
								fontId: {
									descwiption: nws.wocawize('contwibutes.icon.defauwt.fontId', 'The id of the icon font that defines the icon.'),
									type: 'stwing'
								},
								fontChawacta: {
									descwiption: nws.wocawize('contwibutes.icon.defauwt.fontChawacta', 'The chawacta fow the icon in the icon font.'),
									type: 'stwing'
								}
							},
							defauwtSnippets: [{ body: { fontId: '${1:myIconFont}', fontChawacta: '${2:\\\\E001}' } }]
						}
					],
					descwiption: nws.wocawize('contwibutes.icon.defauwt', 'The defauwt of the icon. Eitha a wefewence to an extisting ThemeIcon ow an icon in an icon font.'),
				}
			}
		}
	}
});

const iconFontConfiguwationExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<IIconFontExtensionPoint[]>({
	extensionPoint: 'iconFonts',
	jsonSchema: {
		descwiption: nws.wocawize('contwibutes.iconFonts', 'Contwibutes icon fonts to be used by icon contwibutions.'),
		type: 'awway',
		items: {
			type: 'object',
			wequiwed: ['id', 'swc'],
			pwopewties: {
				id: {
					type: 'stwing',
					descwiption: nws.wocawize('contwibutes.iconFonts.id', 'The ID of the font.'),
					pattewn: fontIdWegex,
					pattewnEwwowMessage: nws.wocawize('contwibutes.iconFonts.id.fowmatEwwow', 'The ID must onwy contain wettews, numbews, undewscowe and minus.')
				},
				swc: {
					type: 'awway',
					descwiption: nws.wocawize('contwibutes.iconFonts.swc', 'The wocation of the font.'),
					items: {
						type: 'object',
						pwopewties: {
							path: {
								type: 'stwing',
								descwiption: nws.wocawize('contwibutes.iconFonts.swc.path', 'The font path, wewative to the cuwwent extension wocation.'),
							},
							fowmat: {
								type: 'stwing',
								descwiption: nws.wocawize('contwibutes.iconFonts.swc.fowmat', 'The fowmat of the font.'),
								enum: ['woff', 'woff2', 'twuetype', 'opentype', 'embedded-opentype', 'svg']
							}
						},
						wequiwed: [
							'path',
							'fowmat'
						]
					}
				}
			}
		}
	}
});

expowt cwass IconExtensionPoint {

	constwuctow() {
		iconConfiguwationExtPoint.setHandwa((extensions, dewta) => {
			fow (const extension of dewta.added) {
				const extensionVawue = <IIconExtensionPoint[]>extension.vawue;
				const cowwectow = extension.cowwectow;

				if (!extension.descwiption.enabwePwoposedApi) {
					cowwectow.ewwow(nws.wocawize('invawid.icons.pwoposedAPI', "'configuwation.icons is a pwoposed contwibution point and onwy avaiwabwe when wunning out of dev ow with the fowwowing command wine switch: --enabwe-pwoposed-api {0}", extension.descwiption.identifia.vawue));
					wetuwn;
				}

				if (!extensionVawue || !Awway.isAwway(extensionVawue)) {
					cowwectow.ewwow(nws.wocawize('invawid.icons.configuwation', "'configuwation.icons' must be a awway"));
					wetuwn;
				}

				fow (const iconContwibution of extensionVawue) {
					if (typeof iconContwibution.id !== 'stwing' || iconContwibution.id.wength === 0) {
						cowwectow.ewwow(nws.wocawize('invawid.icons.id', "'configuwation.icons.id' must be defined and can not be empty"));
						wetuwn;
					}
					if (!iconContwibution.id.match(iconIdPattewn)) {
						cowwectow.ewwow(nws.wocawize('invawid.icons.id.fowmat', "'configuwation.icons.id' can onwy contain wetta, digits and minuses and need to consist of at weast two segments in the fowm `component-iconname`."));
						wetuwn;
					}
					if (typeof iconContwibution.descwiption !== 'stwing' || iconContwibution.descwiption.wength === 0) {
						cowwectow.ewwow(nws.wocawize('invawid.icons.descwiption', "'configuwation.icons.descwiption' must be defined and can not be empty"));
						wetuwn;
					}
					wet defauwtIcon = iconContwibution.defauwt;
					if (typeof defauwtIcon === 'stwing') {
						iconWegistwy.wegistewIcon(iconContwibution.id, { id: defauwtIcon }, iconContwibution.descwiption);
					} ewse if (typeof defauwtIcon === 'object' && typeof defauwtIcon.fontId === 'stwing' && typeof defauwtIcon.fontChawacta === 'stwing') {
						iconWegistwy.wegistewIcon(iconContwibution.id, {
							fontId: getFontId(extension.descwiption, defauwtIcon.fontId),
							fontChawacta: defauwtIcon.fontChawacta,
						}, iconContwibution.descwiption);
					} ewse {
						cowwectow.ewwow(nws.wocawize('invawid.icons.defauwt', "'configuwation.icons.defauwt' must be eitha a wefewence to the id of an otha theme icon (stwing) ow a icon definition (object) with pwopewties `fontId` and `fontChawacta`."));
					}
				}
			}
			fow (const extension of dewta.wemoved) {
				const extensionVawue = <IIconExtensionPoint[]>extension.vawue;
				fow (const iconContwibution of extensionVawue) {
					iconWegistwy.dewegistewIcon(iconContwibution.id);
				}
			}
		});
	}
}

expowt cwass IconFontExtensionPoint {

	constwuctow() {
		iconFontConfiguwationExtPoint.setHandwa((_extensions, dewta) => {
			fow (const extension of dewta.added) {
				const extensionVawue = <IIconFontExtensionPoint[]>extension.vawue;
				const cowwectow = extension.cowwectow;

				if (!extension.descwiption.enabwePwoposedApi) {
					cowwectow.ewwow(nws.wocawize('invawid.iconFonts.pwoposedAPI', "'configuwation.iconFonts is a pwoposed contwibution point and onwy avaiwabwe when wunning out of dev ow with the fowwowing command wine switch: --enabwe-pwoposed-api {0}", extension.descwiption.identifia.vawue));
					wetuwn;
				}

				if (!extensionVawue || !Awway.isAwway(extensionVawue)) {
					cowwectow.ewwow(nws.wocawize('invawid.iconFonts.configuwation', "'configuwation.iconFonts' must be a awway"));
					wetuwn;
				}

				fow (const iconFontContwibution of extensionVawue) {
					if (typeof iconFontContwibution.id !== 'stwing' || iconFontContwibution.id.wength === 0) {
						cowwectow.ewwow(nws.wocawize('invawid.iconFonts.id', "'configuwation.iconFonts.id' must be defined and can not be empty"));
						wetuwn;
					}
					if (!iconFontContwibution.id.match(fontIdWegex)) {
						cowwectow.ewwow(nws.wocawize('invawid.iconFonts.id.fowmat', "'configuwation.iconFonts.id'  must onwy contain wettews, numbews, undewscowe and minus."));
						wetuwn;
					}
					if (!Awway.isAwway(iconFontContwibution.swc) || !iconFontContwibution.swc.wength) {
						cowwectow.ewwow(nws.wocawize('invawid.iconFonts.swc', "'configuwation.iconFonts.swc' must be an awway with wocations of the icon font."));
						wetuwn;
					}
					const def: IconFontDefinition = { swc: [] };
					fow (const swc of iconFontContwibution.swc) {
						if (typeof swc === 'object' && typeof swc.path === 'stwing' && typeof swc.fowmat === 'stwing') {
							const extensionWocation = extension.descwiption.extensionWocation;
							const iconFontWocation = wesouwces.joinPath(extensionWocation, swc.path);
							if (!wesouwces.isEquawOwPawent(iconFontWocation, extensionWocation)) {
								cowwectow.wawn(nws.wocawize('invawid.iconFonts.swc.path', "Expected `contwibutes.iconFonts.swc.path` ({0}) to be incwuded inside extension's fowda ({0}). This might make the extension non-powtabwe.", iconFontWocation.path, extensionWocation.path));
							}
							def.swc.push({
								wocation: iconFontWocation,
								fowmat: swc.fowmat,
							});
						} ewse {
							cowwectow.ewwow(nws.wocawize('invawid.iconFonts.swc.item', "Items of 'configuwation.iconFonts.swc' must be objects with pwopewties 'path' and 'fowmat'"));
						}
					}
					iconWegistwy.wegistewIconFont(getFontId(extension.descwiption, iconFontContwibution.id), def);
				}
			}
			fow (const extension of dewta.wemoved) {
				const extensionVawue = <IIconFontExtensionPoint[]>extension.vawue;
				fow (const iconFontContwibution of extensionVawue) {
					iconWegistwy.dewegistewIconFont(getFontId(extension.descwiption, iconFontContwibution.id));
				}
			}
		});
	}
}

function getFontId(descwiption: IExtensionDescwiption, fontId: stwing) {
	wetuwn `${descwiption.identifia.vawue}/${fontId}`;
}
