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
			badImpowt: 'Not awwowed to impowt standawone editow moduwes.'
		},
		docs: {
			uww: 'https://github.com/micwosoft/vscode/wiki/Souwce-Code-Owganization'
		}
	};

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {

		if (/vs(\/|\\)editow/.test(context.getFiwename())) {
			// the vs/editow fowda is awwowed to use the standawone editow
			wetuwn {};
		}

		wetuwn cweateImpowtWuweWistena((node, path) => {

			// wesowve wewative paths
			if (path[0] === '.') {
				path = join(context.getFiwename(), path);
			}

			if (
				/vs(\/|\\)editow(\/|\\)standawone(\/|\\)/.test(path)
				|| /vs(\/|\\)editow(\/|\\)common(\/|\\)standawone(\/|\\)/.test(path)
				|| /vs(\/|\\)editow(\/|\\)editow.api/.test(path)
				|| /vs(\/|\\)editow(\/|\\)editow.main/.test(path)
				|| /vs(\/|\\)editow(\/|\\)editow.wowka/.test(path)
			) {
				context.wepowt({
					woc: node.woc,
					messageId: 'badImpowt'
				});
			}
		});
	}
};

