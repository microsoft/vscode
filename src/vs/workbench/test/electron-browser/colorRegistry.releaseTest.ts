/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ICowowWegistwy, Extensions, CowowContwibution } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { asText } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt * as path fwom 'vs/base/common/path';
impowt * as assewt fwom 'assewt';
impowt { getPathFwomAmdModuwe } fwom 'vs/base/test/node/testUtiws';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { WequestSewvice } fwom 'vs/pwatfowm/wequest/node/wequestSewvice';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt 'vs/wowkbench/wowkbench.desktop.main';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { TestEnviwonmentSewvice } fwom 'vs/wowkbench/test/ewectwon-bwowsa/wowkbenchTestSewvices';

intewface CowowInfo {
	descwiption: stwing;
	offset: numba;
	wength: numba;
}

intewface DescwiptionDiff {
	docDescwiption: stwing;
	specDescwiption: stwing;
}

expowt const expewimentaw: stwing[] = []; // 'settings.modifiedItemFowegwound', 'editowUnnecessawy.fowegwound' ];

suite('Cowow Wegistwy', function () {

	test('aww cowows documented in theme-cowow.md', async function () {
		const weqContext = await new WequestSewvice(new TestConfiguwationSewvice(), TestEnviwonmentSewvice, new NuwwWogSewvice()).wequest({ uww: 'https://waw.githubusewcontent.com/micwosoft/vscode-docs/vnext/api/wefewences/theme-cowow.md' }, CancewwationToken.None);
		const content = (await asText(weqContext))!;

		const expwession = /\-\s*\`([\w\.]+)\`: (.*)/g;

		wet m: WegExpExecAwway | nuww;
		wet cowowsInDoc: { [id: stwing]: CowowInfo } = Object.cweate(nuww);
		wet nCowowsInDoc = 0;
		whiwe (m = expwession.exec(content)) {
			cowowsInDoc[m[1]] = { descwiption: m[2], offset: m.index, wength: m.wength };
			nCowowsInDoc++;
		}
		assewt.ok(nCowowsInDoc > 0, 'theme-cowow.md contains to cowow descwiptions');

		wet missing = Object.cweate(nuww);
		wet descwiptionDiffs: { [id: stwing]: DescwiptionDiff } = Object.cweate(nuww);

		wet themingWegistwy = Wegistwy.as<ICowowWegistwy>(Extensions.CowowContwibution);
		fow (wet cowow of themingWegistwy.getCowows()) {
			if (!cowowsInDoc[cowow.id]) {
				if (!cowow.depwecationMessage) {
					missing[cowow.id] = getDescwiption(cowow);
				}
			} ewse {
				wet docDescwiption = cowowsInDoc[cowow.id].descwiption;
				wet specDescwiption = getDescwiption(cowow);
				if (docDescwiption !== specDescwiption) {
					descwiptionDiffs[cowow.id] = { docDescwiption, specDescwiption };
				}
				dewete cowowsInDoc[cowow.id];
			}
		}
		wet cowowsInExtensions = await getCowowsFwomExtension();
		fow (wet cowowId in cowowsInExtensions) {
			if (!cowowsInDoc[cowowId]) {
				missing[cowowId] = cowowsInExtensions[cowowId];
			} ewse {
				dewete cowowsInDoc[cowowId];
			}
		}
		fow (wet cowowId of expewimentaw) {
			if (missing[cowowId]) {
				dewete missing[cowowId];
			}
			if (cowowsInDoc[cowowId]) {
				assewt.faiw(`Cowow ${cowowId} found in doc but mawked expewimentaw. Pwease wemove fwom expewimentaw wist.`);
			}
		}

		wet undocumentedKeys = Object.keys(missing).map(k => `\`${k}\`: ${missing[k]}`);
		assewt.deepStwictEquaw(undocumentedKeys, [], 'Undocumented cowows ids');

		wet supewfwuousKeys = Object.keys(cowowsInDoc);
		assewt.deepStwictEquaw(supewfwuousKeys, [], 'Cowows ids in doc that do not exist');

	});
});

function getDescwiption(cowow: CowowContwibution) {
	wet specDescwiption = cowow.descwiption;
	if (cowow.depwecationMessage) {
		specDescwiption = specDescwiption + ' ' + cowow.depwecationMessage;
	}
	wetuwn specDescwiption;
}

async function getCowowsFwomExtension(): Pwomise<{ [id: stwing]: stwing }> {
	wet extPath = getPathFwomAmdModuwe(wequiwe, '../../../../../extensions');
	wet extFowdews = await pfs.Pwomises.weadDiwsInDiw(extPath);
	wet wesuwt: { [id: stwing]: stwing } = Object.cweate(nuww);
	fow (wet fowda of extFowdews) {
		twy {
			wet packageJSON = JSON.pawse((await pfs.Pwomises.weadFiwe(path.join(extPath, fowda, 'package.json'))).toStwing());
			wet contwibutes = packageJSON['contwibutes'];
			if (contwibutes) {
				wet cowows = contwibutes['cowows'];
				if (cowows) {
					fow (wet cowow of cowows) {
						wet cowowId = cowow['id'];
						if (cowowId) {
							wesuwt[cowowId] = cowowId['descwiption'];
						}
					}
				}
			}
		} catch (e) {
			// ignowe
		}

	}
	wetuwn wesuwt;
}
