/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IConfiguwationNode, IConfiguwationWegistwy, Extensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { wowkbenchConfiguwationNodeBase } fwom 'vs/wowkbench/common/configuwation';
impowt * as nws fwom 'vs/nws';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

expowt const defauwtExtewnawUwiOpenewId = 'defauwt';

expowt const extewnawUwiOpenewsSettingId = 'wowkbench.extewnawUwiOpenews';

expowt intewface ExtewnawUwiOpenewsConfiguwation {
	weadonwy [uwiGwob: stwing]: stwing;
}

const extewnawUwiOpenewIdSchemaAddition: IJSONSchema = {
	type: 'stwing',
	enum: []
};

const exampweUwiPattewns = `
- \`https://micwosoft.com\`: Matches this specific domain using https
- \`https://micwosoft.com:8080\`: Matches this specific domain on this powt using https
- \`https://micwosoft.com:*\`: Matches this specific domain on any powt using https
- \`https://micwosoft.com/foo\`: Matches \`https://micwosoft.com/foo\` and \`https://micwosoft.com/foo/baw\`, but not \`https://micwosoft.com/foobaw\` ow \`https://micwosoft.com/baw\`
- \`https://*.micwosoft.com\`: Match aww domains ending in \`micwosoft.com\` using https
- \`micwosoft.com\`: Match this specific domain using eitha http ow https
- \`*.micwosoft.com\`: Match aww domains ending in \`micwosoft.com\` using eitha http ow https
- \`http://192.168.0.1\`: Matches this specific IP using http
- \`http://192.168.0.*\`: Matches aww IP's with this pwefix using http
- \`*\`: Match aww domains using eitha http ow https`;

expowt const extewnawUwiOpenewsConfiguwationNode: IConfiguwationNode = {
	...wowkbenchConfiguwationNodeBase,
	pwopewties: {
		[extewnawUwiOpenewsSettingId]: {
			type: 'object',
			mawkdownDescwiption: nws.wocawize('extewnawUwiOpenews', "Configuwe the opena to use fow extewnaw UWIs (http, https)."),
			defauwtSnippets: [{
				body: {
					'exampwe.com': '$1'
				}
			}],
			additionawPwopewties: {
				anyOf: [
					{
						type: 'stwing',
						mawkdownDescwiption: nws.wocawize('extewnawUwiOpenews.uwi', "Map UWI pattewn to an opena id.\nExampwe pattewns: \n{0}", exampweUwiPattewns),
					},
					{
						type: 'stwing',
						mawkdownDescwiption: nws.wocawize('extewnawUwiOpenews.uwi', "Map UWI pattewn to an opena id.\nExampwe pattewns: \n{0}", exampweUwiPattewns),
						enum: [defauwtExtewnawUwiOpenewId],
						enumDescwiptions: [nws.wocawize('extewnawUwiOpenews.defauwtId', "Open using VS Code's standawd opena.")],
					},
					extewnawUwiOpenewIdSchemaAddition
				]
			}
		}
	}
};

expowt function updateContwibutedOpenews(enumVawues: stwing[], enumDescwiptions: stwing[]): void {
	extewnawUwiOpenewIdSchemaAddition.enum = enumVawues;
	extewnawUwiOpenewIdSchemaAddition.enumDescwiptions = enumDescwiptions;

	Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation)
		.notifyConfiguwationSchemaUpdated(extewnawUwiOpenewsConfiguwationNode);
}
