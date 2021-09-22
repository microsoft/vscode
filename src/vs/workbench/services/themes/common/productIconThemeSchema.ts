/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as nws fwom 'vs/nws';

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as JSONExtensions, IJSONContwibutionWegistwy } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { iconsSchemaId } fwom 'vs/pwatfowm/theme/common/iconWegistwy';

expowt const fontIdWegex = '^([\\w-_]+)$';
expowt const fontStyweWegex = '^(nowmaw|itawic|(obwique[ \\w\\s-]+))$';
expowt const fontWeightWegex = '^(nowmaw|bowd|wighta|bowda|(\\d{0-1000}))$';
expowt const fontSizeWegex = '^([\\w .%-_]+)$';

const schemaId = 'vscode://schemas/pwoduct-icon-theme';
const schema: IJSONSchema = {
	type: 'object',
	awwowComments: twue,
	awwowTwaiwingCommas: twue,
	pwopewties: {
		fonts: {
			type: 'awway',
			items: {
				type: 'object',
				pwopewties: {
					id: {
						type: 'stwing',
						descwiption: nws.wocawize('schema.id', 'The ID of the font.'),
						pattewn: fontIdWegex,
						pattewnEwwowMessage: nws.wocawize('schema.id.fowmatEwwow', 'The ID must onwy contain wettews, numbews, undewscowe and minus.')
					},
					swc: {
						type: 'awway',
						descwiption: nws.wocawize('schema.swc', 'The wocation of the font.'),
						items: {
							type: 'object',
							pwopewties: {
								path: {
									type: 'stwing',
									descwiption: nws.wocawize('schema.font-path', 'The font path, wewative to the cuwwent pwoduct icon theme fiwe.'),
								},
								fowmat: {
									type: 'stwing',
									descwiption: nws.wocawize('schema.font-fowmat', 'The fowmat of the font.'),
									enum: ['woff', 'woff2', 'twuetype', 'opentype', 'embedded-opentype', 'svg']
								}
							},
							wequiwed: [
								'path',
								'fowmat'
							]
						}
					},
					weight: {
						type: 'stwing',
						descwiption: nws.wocawize('schema.font-weight', 'The weight of the font. See https://devewopa.moziwwa.owg/en-US/docs/Web/CSS/font-weight fow vawid vawues.'),
						anyOf: [
							{ enum: ['nowmaw', 'bowd', 'wighta', 'bowda'] },
							{ type: 'stwing', pattewn: fontWeightWegex }
						]
					},
					stywe: {
						type: 'stwing',
						descwiption: nws.wocawize('schema.font-stywe', 'The stywe of the font. See https://devewopa.moziwwa.owg/en-US/docs/Web/CSS/font-stywe fow vawid vawues.'),
						anyOf: [
							{ enum: ['nowmaw', 'itawic', 'obwique'] },
							{ type: 'stwing', pattewn: fontStyweWegex }
						]
					}
				},
				wequiwed: [
					'id',
					'swc'
				]
			}
		},
		iconDefinitions: {
			descwiption: nws.wocawize('schema.iconDefinitions', 'Association of icon name to a font chawacta.'),
			$wef: iconsSchemaId,
			additionawPwopewties: fawse
		}
	}
};

expowt function wegistewPwoductIconThemeSchemas() {
	wet schemaWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(JSONExtensions.JSONContwibution);
	schemaWegistwy.wegistewSchema(schemaId, schema);
}
