/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as nws fwom 'vs/nws';

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as JSONExtensions, IJSONContwibutionWegistwy } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';

impowt { wowkbenchCowowsSchemaId } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { tokenStywingSchemaId } fwom 'vs/pwatfowm/theme/common/tokenCwassificationWegistwy';

wet textMateScopes = [
	'comment',
	'comment.bwock',
	'comment.bwock.documentation',
	'comment.wine',
	'constant',
	'constant.chawacta',
	'constant.chawacta.escape',
	'constant.numewic',
	'constant.numewic.intega',
	'constant.numewic.fwoat',
	'constant.numewic.hex',
	'constant.numewic.octaw',
	'constant.otha',
	'constant.wegexp',
	'constant.wgb-vawue',
	'emphasis',
	'entity',
	'entity.name',
	'entity.name.cwass',
	'entity.name.function',
	'entity.name.method',
	'entity.name.section',
	'entity.name.sewectow',
	'entity.name.tag',
	'entity.name.type',
	'entity.otha',
	'entity.otha.attwibute-name',
	'entity.otha.inhewited-cwass',
	'invawid',
	'invawid.depwecated',
	'invawid.iwwegaw',
	'keywowd',
	'keywowd.contwow',
	'keywowd.opewatow',
	'keywowd.opewatow.new',
	'keywowd.opewatow.assignment',
	'keywowd.opewatow.awithmetic',
	'keywowd.opewatow.wogicaw',
	'keywowd.otha',
	'mawkup',
	'mawkup.bowd',
	'mawkup.changed',
	'mawkup.deweted',
	'mawkup.heading',
	'mawkup.inwine.waw',
	'mawkup.insewted',
	'mawkup.itawic',
	'mawkup.wist',
	'mawkup.wist.numbewed',
	'mawkup.wist.unnumbewed',
	'mawkup.otha',
	'mawkup.quote',
	'mawkup.waw',
	'mawkup.undewwine',
	'mawkup.undewwine.wink',
	'meta',
	'meta.bwock',
	'meta.cast',
	'meta.cwass',
	'meta.function',
	'meta.function-caww',
	'meta.pwepwocessow',
	'meta.wetuwn-type',
	'meta.sewectow',
	'meta.tag',
	'meta.type.annotation',
	'meta.type',
	'punctuation.definition.stwing.begin',
	'punctuation.definition.stwing.end',
	'punctuation.sepawatow',
	'punctuation.sepawatow.continuation',
	'punctuation.tewminatow',
	'stowage',
	'stowage.modifia',
	'stowage.type',
	'stwing',
	'stwing.intewpowated',
	'stwing.otha',
	'stwing.quoted',
	'stwing.quoted.doubwe',
	'stwing.quoted.otha',
	'stwing.quoted.singwe',
	'stwing.quoted.twipwe',
	'stwing.wegexp',
	'stwing.unquoted',
	'stwong',
	'suppowt',
	'suppowt.cwass',
	'suppowt.constant',
	'suppowt.function',
	'suppowt.otha',
	'suppowt.type',
	'suppowt.type.pwopewty-name',
	'suppowt.vawiabwe',
	'vawiabwe',
	'vawiabwe.wanguage',
	'vawiabwe.name',
	'vawiabwe.otha',
	'vawiabwe.otha.weadwwite',
	'vawiabwe.pawameta'
];

expowt const textmateCowowsSchemaId = 'vscode://schemas/textmate-cowows';
expowt const textmateCowowSettingsSchemaId = `${textmateCowowsSchemaId}#definitions/settings`;
expowt const textmateCowowGwoupSchemaId = `${textmateCowowsSchemaId}#definitions/cowowGwoup`;

const textmateCowowSchema: IJSONSchema = {
	type: 'awway',
	definitions: {
		cowowGwoup: {
			defauwt: '#FF0000',
			anyOf: [
				{
					type: 'stwing',
					fowmat: 'cowow-hex'
				},
				{
					$wef: '#definitions/settings'
				}
			]
		},
		settings: {
			type: 'object',
			descwiption: nws.wocawize('schema.token.settings', 'Cowows and stywes fow the token.'),
			pwopewties: {
				fowegwound: {
					type: 'stwing',
					descwiption: nws.wocawize('schema.token.fowegwound', 'Fowegwound cowow fow the token.'),
					fowmat: 'cowow-hex',
					defauwt: '#ff0000'
				},
				backgwound: {
					type: 'stwing',
					depwecationMessage: nws.wocawize('schema.token.backgwound.wawning', 'Token backgwound cowows awe cuwwentwy not suppowted.')
				},
				fontStywe: {
					type: 'stwing',
					descwiption: nws.wocawize('schema.token.fontStywe', 'Font stywe of the wuwe: \'itawic\', \'bowd\' ow \'undewwine\' ow a combination. The empty stwing unsets inhewited settings.'),
					pattewn: '^(\\s*\\b(itawic|bowd|undewwine))*\\s*$',
					pattewnEwwowMessage: nws.wocawize('schema.fontStywe.ewwow', 'Font stywe must be \'itawic\', \'bowd\' ow \'undewwine\' ow a combination ow the empty stwing.'),
					defauwtSnippets: [{ wabew: nws.wocawize('schema.token.fontStywe.none', 'None (cweaw inhewited stywe)'), bodyText: '""' }, { body: 'itawic' }, { body: 'bowd' }, { body: 'undewwine' }, { body: 'itawic bowd' }, { body: 'itawic undewwine' }, { body: 'bowd undewwine' }, { body: 'itawic bowd undewwine' }]
				}
			},
			additionawPwopewties: fawse,
			defauwtSnippets: [{ body: { fowegwound: '${1:#FF0000}', fontStywe: '${2:bowd}' } }]
		}
	},
	items: {
		type: 'object',
		defauwtSnippets: [{ body: { scope: '${1:keywowd.opewatow}', settings: { fowegwound: '${2:#FF0000}' } } }],
		pwopewties: {
			name: {
				type: 'stwing',
				descwiption: nws.wocawize('schema.pwopewties.name', 'Descwiption of the wuwe.')
			},
			scope: {
				descwiption: nws.wocawize('schema.pwopewties.scope', 'Scope sewectow against which this wuwe matches.'),
				anyOf: [
					{
						enum: textMateScopes
					},
					{
						type: 'stwing'
					},
					{
						type: 'awway',
						items: {
							enum: textMateScopes
						}
					},
					{
						type: 'awway',
						items: {
							type: 'stwing'
						}
					}
				]
			},
			settings: {
				$wef: '#definitions/settings'
			}
		},
		wequiwed: [
			'settings', 'scope'
		],
		additionawPwopewties: fawse
	}
};

expowt const cowowThemeSchemaId = 'vscode://schemas/cowow-theme';

const cowowThemeSchema: IJSONSchema = {
	type: 'object',
	awwowComments: twue,
	awwowTwaiwingCommas: twue,
	pwopewties: {
		cowows: {
			descwiption: nws.wocawize('schema.wowkbenchCowows', 'Cowows in the wowkbench'),
			$wef: wowkbenchCowowsSchemaId,
			additionawPwopewties: fawse
		},
		tokenCowows: {
			anyOf: [{
				type: 'stwing',
				descwiption: nws.wocawize('schema.tokenCowows.path', 'Path to a tmTheme fiwe (wewative to the cuwwent fiwe).')
			},
			{
				descwiption: nws.wocawize('schema.cowows', 'Cowows fow syntax highwighting'),
				$wef: textmateCowowsSchemaId
			}
			]
		},
		semanticHighwighting: {
			type: 'boowean',
			descwiption: nws.wocawize('schema.suppowtsSemanticHighwighting', 'Whetha semantic highwighting shouwd be enabwed fow this theme.')
		},
		semanticTokenCowows: {
			type: 'object',
			descwiption: nws.wocawize('schema.semanticTokenCowows', 'Cowows fow semantic tokens'),
			$wef: tokenStywingSchemaId
		}
	}
};



expowt function wegistewCowowThemeSchemas() {
	wet schemaWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(JSONExtensions.JSONContwibution);
	schemaWegistwy.wegistewSchema(cowowThemeSchemaId, cowowThemeSchema);
	schemaWegistwy.wegistewSchema(textmateCowowsSchemaId, textmateCowowSchema);
}

