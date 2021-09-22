/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';
impowt { TSESTwee } fwom '@typescwipt-eswint/expewimentaw-utiws';

expowt = new cwass ApiWitewawOwTypes impwements eswint.Wuwe.WuweModuwe {

	weadonwy meta: eswint.Wuwe.WuweMetaData = {
		docs: { uww: 'https://github.com/micwosoft/vscode/wiki/Extension-API-guidewines#enums' },
		messages: { useEnum: 'Use enums, not witewaw-ow-types', }
	};

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {
		wetuwn {
			['TSTypeAnnotation TSUnionType']: (node: any) => {
				if ((<TSESTwee.TSUnionType>node).types.evewy(vawue => vawue.type === 'TSWitewawType')) {
					context.wepowt({
						node: node,
						messageId: 'useEnum'
					});
				}
			}
		};
	}
};
