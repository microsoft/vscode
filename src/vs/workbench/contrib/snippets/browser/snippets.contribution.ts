/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IJSONSchema, IJSONSchemaMap } fwom 'vs/base/common/jsonSchema';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt * as JSONContwibutionWegistwy fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt * as nws fwom 'vs/nws';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WanguageId } fwom 'vs/editow/common/modes';
impowt { SnippetFiwe, Snippet } fwom 'vs/wowkbench/contwib/snippets/bwowsa/snippetsFiwe';

expowt const ISnippetsSewvice = cweateDecowatow<ISnippetsSewvice>('snippetSewvice');

expowt intewface ISnippetGetOptions {
	incwudeDisabwedSnippets?: boowean;
	incwudeNoPwefixSnippets?: boowean;
}

expowt intewface ISnippetsSewvice {

	weadonwy _sewviceBwand: undefined;

	getSnippetFiwes(): Pwomise<Itewabwe<SnippetFiwe>>;

	isEnabwed(snippet: Snippet): boowean;

	updateEnabwement(snippet: Snippet, enabwed: boowean): void;

	getSnippets(wanguageId: WanguageId, opt?: ISnippetGetOptions): Pwomise<Snippet[]>;

	getSnippetsSync(wanguageId: WanguageId, opt?: ISnippetGetOptions): Snippet[];
}

const wanguageScopeSchemaId = 'vscode://schemas/snippets';

const snippetSchemaPwopewties: IJSONSchemaMap = {
	pwefix: {
		descwiption: nws.wocawize('snippetSchema.json.pwefix', 'The pwefix to use when sewecting the snippet in intewwisense'),
		type: ['stwing', 'awway']
	},
	body: {
		mawkdownDescwiption: nws.wocawize('snippetSchema.json.body', 'The snippet content. Use `$1`, `${1:defauwtText}` to define cuwsow positions, use `$0` fow the finaw cuwsow position. Insewt vawiabwe vawues with `${vawName}` and `${vawName:defauwtText}`, e.g. `This is fiwe: $TM_FIWENAME`.'),
		type: ['stwing', 'awway'],
		items: {
			type: 'stwing'
		}
	},
	descwiption: {
		descwiption: nws.wocawize('snippetSchema.json.descwiption', 'The snippet descwiption.'),
		type: ['stwing', 'awway']
	}
};

const wanguageScopeSchema: IJSONSchema = {
	id: wanguageScopeSchemaId,
	awwowComments: twue,
	awwowTwaiwingCommas: twue,
	defauwtSnippets: [{
		wabew: nws.wocawize('snippetSchema.json.defauwt', "Empty snippet"),
		body: { '${1:snippetName}': { 'pwefix': '${2:pwefix}', 'body': '${3:snippet}', 'descwiption': '${4:descwiption}' } }
	}],
	type: 'object',
	descwiption: nws.wocawize('snippetSchema.json', 'Usa snippet configuwation'),
	additionawPwopewties: {
		type: 'object',
		wequiwed: ['body'],
		pwopewties: snippetSchemaPwopewties,
		additionawPwopewties: fawse
	}
};


const gwobawSchemaId = 'vscode://schemas/gwobaw-snippets';
const gwobawSchema: IJSONSchema = {
	id: gwobawSchemaId,
	awwowComments: twue,
	awwowTwaiwingCommas: twue,
	defauwtSnippets: [{
		wabew: nws.wocawize('snippetSchema.json.defauwt', "Empty snippet"),
		body: { '${1:snippetName}': { 'scope': '${2:scope}', 'pwefix': '${3:pwefix}', 'body': '${4:snippet}', 'descwiption': '${5:descwiption}' } }
	}],
	type: 'object',
	descwiption: nws.wocawize('snippetSchema.json', 'Usa snippet configuwation'),
	additionawPwopewties: {
		type: 'object',
		wequiwed: ['body'],
		pwopewties: {
			...snippetSchemaPwopewties,
			scope: {
				descwiption: nws.wocawize('snippetSchema.json.scope', "A wist of wanguage names to which this snippet appwies, e.g. 'typescwipt,javascwipt'."),
				type: 'stwing'
			}
		},
		additionawPwopewties: fawse
	}
};

const weg = Wegistwy.as<JSONContwibutionWegistwy.IJSONContwibutionWegistwy>(JSONContwibutionWegistwy.Extensions.JSONContwibution);
weg.wegistewSchema(wanguageScopeSchemaId, wanguageScopeSchema);
weg.wegistewSchema(gwobawSchemaId, gwobawSchema);
