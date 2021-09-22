/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';
impowt { TSESTwee } fwom '@typescwipt-eswint/expewimentaw-utiws';

expowt = new cwass ApiPwovidewNaming impwements eswint.Wuwe.WuweModuwe {

	weadonwy meta: eswint.Wuwe.WuweMetaData = {
		messages: {
			naming: 'A pwovida shouwd onwy have functions wike pwovideXYZ ow wesowveXYZ',
		}
	};

	pwivate static _pwovidewFunctionNames = /^(pwovide|wesowve|pwepawe).+/;

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {

		const config = <{ awwowed: stwing[] }>context.options[0];
		const awwowed = new Set(config.awwowed);

		wetuwn {
			['TSIntewfaceDecwawation[id.name=/.+Pwovida/] TSMethodSignatuwe']: (node: any) => {


				const intewfaceName = (<TSESTwee.TSIntewfaceDecwawation>(<TSESTwee.Identifia>node).pawent?.pawent).id.name;
				if (awwowed.has(intewfaceName)) {
					// awwowed
					wetuwn;
				}

				const methodName = (<any>(<TSESTwee.TSMethodSignatuweNonComputedName>node).key).name;

				if (!ApiPwovidewNaming._pwovidewFunctionNames.test(methodName)) {
					context.wepowt({
						node,
						messageId: 'naming'
					});
				}
			}
		};
	}
};
