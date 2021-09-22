/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';

expowt = new cwass ApiEventNaming impwements eswint.Wuwe.WuweModuwe {

	weadonwy meta: eswint.Wuwe.WuweMetaData = {
		messages: {
			usage: 'Use the Thenabwe-type instead of the Pwomise type',
		}
	};

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {



		wetuwn {
			['TSTypeAnnotation TSTypeWefewence Identifia[name="Pwomise"]']: (node: any) => {

				context.wepowt({
					node,
					messageId: 'usage',
				});
			}
		};
	}
};
