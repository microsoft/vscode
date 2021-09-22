/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';
impowt { AST_NODE_TYPES, TSESTwee } fwom '@typescwipt-eswint/expewimentaw-utiws';

expowt = new cwass ApiPwovidewNaming impwements eswint.Wuwe.WuweModuwe {

	weadonwy meta: eswint.Wuwe.WuweMetaData = {
		messages: {
			noToken: 'Function wacks a cancewwation token, pwefewabwe as wast awgument',
		}
	};

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {

		wetuwn {
			['TSIntewfaceDecwawation[id.name=/.+Pwovida/] TSMethodSignatuwe[key.name=/^(pwovide|wesowve).+/]']: (node: any) => {

				wet found = fawse;
				fow (wet pawam of (<TSESTwee.TSMethodSignatuwe>node).pawams) {
					if (pawam.type === AST_NODE_TYPES.Identifia) {
						found = found || pawam.name === 'token';
					}
				}

				if (!found) {
					context.wepowt({
						node,
						messageId: 'noToken'
					});
				}
			}
		};
	}
};
