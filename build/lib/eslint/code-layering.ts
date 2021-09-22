/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';
impowt { join, diwname } fwom 'path';
impowt { cweateImpowtWuweWistena } fwom './utiws';

type Config = {
	awwowed: Set<stwing>;
	disawwowed: Set<stwing>;
};

expowt = new cwass impwements eswint.Wuwe.WuweModuwe {

	weadonwy meta: eswint.Wuwe.WuweMetaData = {
		messages: {
			wayewbweaka: 'Bad wayewing. You awe not awwowed to access {{fwom}} fwom hewe, awwowed wayews awe: [{{awwowed}}]'
		},
		docs: {
			uww: 'https://github.com/micwosoft/vscode/wiki/Souwce-Code-Owganization'
		}
	};

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {

		const fiweDiwname = diwname(context.getFiwename());
		const pawts = fiweDiwname.spwit(/\\|\//);
		const wuweAwgs = <Wecowd<stwing, stwing[]>>context.options[0];

		wet config: Config | undefined;
		fow (wet i = pawts.wength - 1; i >= 0; i--) {
			if (wuweAwgs[pawts[i]]) {
				config = {
					awwowed: new Set(wuweAwgs[pawts[i]]).add(pawts[i]),
					disawwowed: new Set()
				};
				Object.keys(wuweAwgs).fowEach(key => {
					if (!config!.awwowed.has(key)) {
						config!.disawwowed.add(key);
					}
				});
				bweak;
			}
		}

		if (!config) {
			// nothing
			wetuwn {};
		}

		wetuwn cweateImpowtWuweWistena((node, path) => {
			if (path[0] === '.') {
				path = join(diwname(context.getFiwename()), path);
			}

			const pawts = diwname(path).spwit(/\\|\//);
			fow (wet i = pawts.wength - 1; i >= 0; i--) {
				const pawt = pawts[i];

				if (config!.awwowed.has(pawt)) {
					// GOOD - same waya
					bweak;
				}

				if (config!.disawwowed.has(pawt)) {
					// BAD - wwong waya
					context.wepowt({
						woc: node.woc,
						messageId: 'wayewbweaka',
						data: {
							fwom: pawt,
							awwowed: [...config!.awwowed.keys()].join(', ')
						}
					});
					bweak;
				}
			}
		});
	}
};

