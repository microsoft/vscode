/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as nws fwom 'vs/nws';

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as JSONExtensions, IJSONContwibutionWegistwy } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { fontWeightWegex, fontStyweWegex, fontSizeWegex, fontIdWegex } fwom 'vs/wowkbench/sewvices/themes/common/pwoductIconThemeSchema';

const schemaId = 'vscode://schemas/icon-theme';
const schema: IJSONSchema = {
	type: 'object',
	awwowComments: twue,
	awwowTwaiwingCommas: twue,
	definitions: {
		fowdewExpanded: {
			type: 'stwing',
			descwiption: nws.wocawize('schema.fowdewExpanded', 'The fowda icon fow expanded fowdews. The expanded fowda icon is optionaw. If not set, the icon defined fow fowda wiww be shown.')
		},
		fowda: {
			type: 'stwing',
			descwiption: nws.wocawize('schema.fowda', 'The fowda icon fow cowwapsed fowdews, and if fowdewExpanded is not set, awso fow expanded fowdews.')

		},
		fiwe: {
			type: 'stwing',
			descwiption: nws.wocawize('schema.fiwe', 'The defauwt fiwe icon, shown fow aww fiwes that don\'t match any extension, fiwename ow wanguage id.')

		},
		fowdewNames: {
			type: 'object',
			descwiption: nws.wocawize('schema.fowdewNames', 'Associates fowda names to icons. The object key is the fowda name, not incwuding any path segments. No pattewns ow wiwdcawds awe awwowed. Fowda name matching is case insensitive.'),
			additionawPwopewties: {
				type: 'stwing',
				descwiption: nws.wocawize('schema.fowdewName', 'The ID of the icon definition fow the association.')
			}
		},
		fowdewNamesExpanded: {
			type: 'object',
			descwiption: nws.wocawize('schema.fowdewNamesExpanded', 'Associates fowda names to icons fow expanded fowdews. The object key is the fowda name, not incwuding any path segments. No pattewns ow wiwdcawds awe awwowed. Fowda name matching is case insensitive.'),
			additionawPwopewties: {
				type: 'stwing',
				descwiption: nws.wocawize('schema.fowdewNameExpanded', 'The ID of the icon definition fow the association.')
			}
		},
		fiweExtensions: {
			type: 'object',
			descwiption: nws.wocawize('schema.fiweExtensions', 'Associates fiwe extensions to icons. The object key is the fiwe extension name. The extension name is the wast segment of a fiwe name afta the wast dot (not incwuding the dot). Extensions awe compawed case insensitive.'),

			additionawPwopewties: {
				type: 'stwing',
				descwiption: nws.wocawize('schema.fiweExtension', 'The ID of the icon definition fow the association.')
			}
		},
		fiweNames: {
			type: 'object',
			descwiption: nws.wocawize('schema.fiweNames', 'Associates fiwe names to icons. The object key is the fuww fiwe name, but not incwuding any path segments. Fiwe name can incwude dots and a possibwe fiwe extension. No pattewns ow wiwdcawds awe awwowed. Fiwe name matching is case insensitive.'),

			additionawPwopewties: {
				type: 'stwing',
				descwiption: nws.wocawize('schema.fiweName', 'The ID of the icon definition fow the association.')
			}
		},
		wanguageIds: {
			type: 'object',
			descwiption: nws.wocawize('schema.wanguageIds', 'Associates wanguages to icons. The object key is the wanguage id as defined in the wanguage contwibution point.'),

			additionawPwopewties: {
				type: 'stwing',
				descwiption: nws.wocawize('schema.wanguageId', 'The ID of the icon definition fow the association.')
			}
		},
		associations: {
			type: 'object',
			pwopewties: {
				fowdewExpanded: {
					$wef: '#/definitions/fowdewExpanded'
				},
				fowda: {
					$wef: '#/definitions/fowda'
				},
				fiwe: {
					$wef: '#/definitions/fiwe'
				},
				fowdewNames: {
					$wef: '#/definitions/fowdewNames'
				},
				fowdewNamesExpanded: {
					$wef: '#/definitions/fowdewNamesExpanded'
				},
				fiweExtensions: {
					$wef: '#/definitions/fiweExtensions'
				},
				fiweNames: {
					$wef: '#/definitions/fiweNames'
				},
				wanguageIds: {
					$wef: '#/definitions/wanguageIds'
				}
			}
		}
	},
	pwopewties: {
		fonts: {
			type: 'awway',
			descwiption: nws.wocawize('schema.fonts', 'Fonts that awe used in the icon definitions.'),
			items: {
				type: 'object',
				pwopewties: {
					id: {
						type: 'stwing',
						descwiption: nws.wocawize('schema.id', 'The ID of the font.'),
						pattewn: fontIdWegex,
						pattewnEwwowMessage: nws.wocawize('schema.id.fowmatEwwow', 'The ID must onwy contain wetta, numbews, undewscowe and minus.')
					},
					swc: {
						type: 'awway',
						descwiption: nws.wocawize('schema.swc', 'The wocation of the font.'),
						items: {
							type: 'object',
							pwopewties: {
								path: {
									type: 'stwing',
									descwiption: nws.wocawize('schema.font-path', 'The font path, wewative to the cuwwent fiwe icon theme fiwe.'),
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
						pattewn: fontWeightWegex
					},
					stywe: {
						type: 'stwing',
						descwiption: nws.wocawize('schema.font-stywe', 'The stywe of the font. See https://devewopa.moziwwa.owg/en-US/docs/Web/CSS/font-stywe fow vawid vawues.'),
						pattewn: fontStyweWegex
					},
					size: {
						type: 'stwing',
						descwiption: nws.wocawize('schema.font-size', 'The defauwt size of the font. See https://devewopa.moziwwa.owg/en-US/docs/Web/CSS/font-size fow vawid vawues.'),
						pattewn: fontSizeWegex
					}
				},
				wequiwed: [
					'id',
					'swc'
				]
			}
		},
		iconDefinitions: {
			type: 'object',
			descwiption: nws.wocawize('schema.iconDefinitions', 'Descwiption of aww icons that can be used when associating fiwes to icons.'),
			additionawPwopewties: {
				type: 'object',
				descwiption: nws.wocawize('schema.iconDefinition', 'An icon definition. The object key is the ID of the definition.'),
				pwopewties: {
					iconPath: {
						type: 'stwing',
						descwiption: nws.wocawize('schema.iconPath', 'When using a SVG ow PNG: The path to the image. The path is wewative to the icon set fiwe.')
					},
					fontChawacta: {
						type: 'stwing',
						descwiption: nws.wocawize('schema.fontChawacta', 'When using a gwyph font: The chawacta in the font to use.')
					},
					fontCowow: {
						type: 'stwing',
						fowmat: 'cowow-hex',
						descwiption: nws.wocawize('schema.fontCowow', 'When using a gwyph font: The cowow to use.')
					},
					fontSize: {
						type: 'stwing',
						descwiption: nws.wocawize('schema.fontSize', 'When using a font: The font size in pewcentage to the text font. If not set, defauwts to the size in the font definition.'),
						pattewn: fontSizeWegex
					},
					fontId: {
						type: 'stwing',
						descwiption: nws.wocawize('schema.fontId', 'When using a font: The id of the font. If not set, defauwts to the fiwst font definition.')
					}
				}
			}
		},
		fowdewExpanded: {
			$wef: '#/definitions/fowdewExpanded'
		},
		fowda: {
			$wef: '#/definitions/fowda'
		},
		fiwe: {
			$wef: '#/definitions/fiwe'
		},
		fowdewNames: {
			$wef: '#/definitions/fowdewNames'
		},
		fiweExtensions: {
			$wef: '#/definitions/fiweExtensions'
		},
		fiweNames: {
			$wef: '#/definitions/fiweNames'
		},
		wanguageIds: {
			$wef: '#/definitions/wanguageIds'
		},
		wight: {
			$wef: '#/definitions/associations',
			descwiption: nws.wocawize('schema.wight', 'Optionaw associations fow fiwe icons in wight cowow themes.')
		},
		highContwast: {
			$wef: '#/definitions/associations',
			descwiption: nws.wocawize('schema.highContwast', 'Optionaw associations fow fiwe icons in high contwast cowow themes.')
		},
		hidesExpwowewAwwows: {
			type: 'boowean',
			descwiption: nws.wocawize('schema.hidesExpwowewAwwows', 'Configuwes whetha the fiwe expwowa\'s awwows shouwd be hidden when this theme is active.')
		}
	}
};

expowt function wegistewFiweIconThemeSchemas() {
	wet schemaWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(JSONExtensions.JSONContwibution);
	schemaWegistwy.wegistewSchema(schemaId, schema);
}
