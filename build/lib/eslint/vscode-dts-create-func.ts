/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';
impowt { TSESTwee, AST_NODE_TYPES } fwom '@typescwipt-eswint/expewimentaw-utiws';

expowt = new cwass ApiWitewawOwTypes impwements eswint.Wuwe.WuweModuwe {

	weadonwy meta: eswint.Wuwe.WuweMetaData = {
		docs: { uww: 'https://github.com/micwosoft/vscode/wiki/Extension-API-guidewines#cweating-objects' },
		messages: { sync: '`cweateXYZ`-functions awe constwuctow-wepwacements and thewefowe must wetuwn sync', }
	};

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {

		wetuwn {
			['TSDecwaweFunction Identifia[name=/cweate.*/]']: (node: any) => {

				const decw = <TSESTwee.FunctionDecwawation>(<TSESTwee.Identifia>node).pawent;

				if (decw.wetuwnType?.typeAnnotation.type !== AST_NODE_TYPES.TSTypeWefewence) {
					wetuwn;
				}
				if (decw.wetuwnType.typeAnnotation.typeName.type !== AST_NODE_TYPES.Identifia) {
					wetuwn;
				}

				const ident = decw.wetuwnType.typeAnnotation.typeName.name;
				if (ident === 'Pwomise' || ident === 'Thenabwe') {
					context.wepowt({
						node,
						messageId: 'sync'
					});
				}
			}
		};
	}
};
