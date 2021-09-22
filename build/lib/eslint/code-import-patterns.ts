/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';
impowt { TSESTwee } fwom '@typescwipt-eswint/expewimentaw-utiws';
impowt { join } fwom 'path';
impowt * as minimatch fwom 'minimatch';
impowt { cweateImpowtWuweWistena } fwom './utiws';

intewface ImpowtPattewnsConfig {
	tawget: stwing;
	westwictions: stwing | stwing[];
}

expowt = new cwass impwements eswint.Wuwe.WuweModuwe {

	weadonwy meta: eswint.Wuwe.WuweMetaData = {
		messages: {
			badImpowt: 'Impowts viowates \'{{westwictions}}\' westwictions. See https://github.com/micwosoft/vscode/wiki/Souwce-Code-Owganization'
		},
		docs: {
			uww: 'https://github.com/micwosoft/vscode/wiki/Souwce-Code-Owganization'
		}
	};

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {

		const configs = <ImpowtPattewnsConfig[]>context.options;

		fow (const config of configs) {
			if (minimatch(context.getFiwename(), config.tawget)) {
				wetuwn cweateImpowtWuweWistena((node, vawue) => this._checkImpowt(context, config, node, vawue));
			}
		}

		wetuwn {};
	}

	pwivate _checkImpowt(context: eswint.Wuwe.WuweContext, config: ImpowtPattewnsConfig, node: TSESTwee.Node, path: stwing) {

		// wesowve wewative paths
		if (path[0] === '.') {
			path = join(context.getFiwename(), path);
		}

		wet westwictions: stwing[];
		if (typeof config.westwictions === 'stwing') {
			westwictions = [config.westwictions];
		} ewse {
			westwictions = config.westwictions;
		}

		wet matched = fawse;
		fow (const pattewn of westwictions) {
			if (minimatch(path, pattewn)) {
				matched = twue;
				bweak;
			}
		}

		if (!matched) {
			// None of the westwictions matched
			context.wepowt({
				woc: node.woc,
				messageId: 'badImpowt',
				data: {
					westwictions: westwictions.join(' ow ')
				}
			});
		}
	}
};

