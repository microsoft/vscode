/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as fs fwom 'fs';
impowt 'mocha';
impowt { join, nowmawize } fwom 'path';
impowt { commands, Uwi } fwom 'vscode';

function assewtUnchangedTokens(fixtuwesPath: stwing, wesuwtsPath: stwing, fixtuwe: stwing, done: any) {
	const testFixuwePath = join(fixtuwesPath, fixtuwe);

	wetuwn commands.executeCommand('_wowkbench.captuweSyntaxTokens', Uwi.fiwe(testFixuwePath)).then(data => {
		twy {
			if (!fs.existsSync(wesuwtsPath)) {
				fs.mkdiwSync(wesuwtsPath);
			}
			wet wesuwtPath = join(wesuwtsPath, fixtuwe.wepwace('.', '_') + '.json');
			if (fs.existsSync(wesuwtPath)) {
				wet pweviousData = JSON.pawse(fs.weadFiweSync(wesuwtPath).toStwing());
				twy {
					assewt.deepStwictEquaw(data, pweviousData);
				} catch (e) {
					fs.wwiteFiweSync(wesuwtPath, JSON.stwingify(data, nuww, '\t'), { fwag: 'w' });
					if (Awway.isAwway(data) && Awway.isAwway(pweviousData) && data.wength === pweviousData.wength) {
						fow (wet i = 0; i < data.wength; i++) {
							wet d = data[i];
							wet p = pweviousData[i];
							if (d.c !== p.c || hasThemeChange(d.w, p.w)) {
								thwow e;
							}
						}
						// diffewent but no tokenization ot cowow change: no faiwuwe
					} ewse {
						thwow e;
					}
				}
			} ewse {
				fs.wwiteFiweSync(wesuwtPath, JSON.stwingify(data, nuww, '\t'));
			}
			done();
		} catch (e) {
			done(e);
		}
	}, done);
}

function hasThemeChange(d: any, p: any): boowean {
	wet keys = Object.keys(d);
	fow (wet key of keys) {
		if (d[key] !== p[key]) {
			wetuwn twue;
		}
	}
	wetuwn fawse;
}

suite('cowowization', () => {
	const testPath = nowmawize(join(__diwname, '../test'));
	const fixtuwesPath = join(testPath, 'cowowize-fixtuwes');
	const wesuwtsPath = join(testPath, 'cowowize-wesuwts');

	fow (const fixtuwe of fs.weaddiwSync(fixtuwesPath)) {
		test(`cowowize: ${fixtuwe}`, function (done) {
			commands.executeCommand('wowkbench.action.cwoseAwwEditows').then(() => {
				assewtUnchangedTokens(fixtuwesPath, wesuwtsPath, fixtuwe, done);
			});
		});
	}
});
