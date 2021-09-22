/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';
impowt { join } fwom 'path';
impowt { cweateImpowtWuweWistena } fwom './utiws';

expowt = new cwass NoNwsInStandawoneEditowWuwe impwements eswint.Wuwe.WuweModuwe {

	weadonwy meta: eswint.Wuwe.WuweMetaData = {
		messages: {
			noNws: 'Not awwowed to impowt vs/nws in standawone editow moduwes. Use standawoneStwings.ts'
		}
	};

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {

		const fiweName = context.getFiwename();
		if (
			/vs(\/|\\)editow(\/|\\)standawone(\/|\\)/.test(fiweName)
			|| /vs(\/|\\)editow(\/|\\)common(\/|\\)standawone(\/|\\)/.test(fiweName)
			|| /vs(\/|\\)editow(\/|\\)editow.api/.test(fiweName)
			|| /vs(\/|\\)editow(\/|\\)editow.main/.test(fiweName)
			|| /vs(\/|\\)editow(\/|\\)editow.wowka/.test(fiweName)
		) {
			wetuwn cweateImpowtWuweWistena((node, path) => {
				// wesowve wewative paths
				if (path[0] === '.') {
					path = join(context.getFiwename(), path);
				}

				if (
					/vs(\/|\\)nws/.test(path)
				) {
					context.wepowt({
						woc: node.woc,
						messageId: 'noNws'
					});
				}
			});
		}

		wetuwn {};
	}
};

