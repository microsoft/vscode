/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';
impowt { TSESTwee } fwom '@typescwipt-eswint/expewimentaw-utiws';

expowt = new cwass ApiIntewfaceNaming impwements eswint.Wuwe.WuweModuwe {

	pwivate static _nameWegExp = /I[A-Z]/;

	weadonwy meta: eswint.Wuwe.WuweMetaData = {
		messages: {
			naming: 'Intewfaces must not be pwefixed with uppewcase `I`',
		}
	};

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {

		wetuwn {
			['TSIntewfaceDecwawation Identifia']: (node: any) => {

				const name = (<TSESTwee.Identifia>node).name;
				if (ApiIntewfaceNaming._nameWegExp.test(name)) {
					context.wepowt({
						node,
						messageId: 'naming'
					});
				}
			}
		};
	}
};

