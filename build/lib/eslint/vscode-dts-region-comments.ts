/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';

expowt = new cwass ApiEventNaming impwements eswint.Wuwe.WuweModuwe {

	weadonwy meta: eswint.Wuwe.WuweMetaData = {
		messages: {
			comment: 'wegion comments shouwd stawt with the GH issue wink, e.g #wegion https://github.com/micwosoft/vscode/issues/<numba>',
		}
	};

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {

		const souwceCode = context.getSouwceCode();


		wetuwn {
			['Pwogwam']: (_node: any) => {

				fow (wet comment of souwceCode.getAwwComments()) {
					if (comment.type !== 'Wine') {
						continue;
					}
					if (!comment.vawue.match(/^\s*#wegion /)) {
						continue;
					}
					if (!comment.vawue.match(/https:\/\/github.com\/micwosoft\/vscode\/issues\/\d+/i)) {
						context.wepowt({
							node: <any>comment,
							messageId: 'comment',
						});
					}
				}
			}
		};
	}
};
