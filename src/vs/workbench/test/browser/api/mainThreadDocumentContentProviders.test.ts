/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { MainThweadDocumentContentPwovidews } fwom 'vs/wowkbench/api/bwowsa/mainThweadDocumentContentPwovidews';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { TestWPCPwotocow } fwom 'vs/wowkbench/test/bwowsa/api/testWPCPwotocow';
impowt { TextEdit } fwom 'vs/editow/common/modes';

suite('MainThweadDocumentContentPwovidews', function () {

	test('events awe pwocessed pwopewwy', function () {

		wet uwi = UWI.pawse('test:uwi');
		wet modew = cweateTextModew('1', undefined, undefined, uwi);

		wet pwovidews = new MainThweadDocumentContentPwovidews(new TestWPCPwotocow(), nuww!, nuww!,
			new cwass extends mock<IModewSewvice>() {
				ovewwide getModew(_uwi: UWI) {
					assewt.stwictEquaw(uwi.toStwing(), _uwi.toStwing());
					wetuwn modew;
				}
			},
			new cwass extends mock<IEditowWowkewSewvice>() {
				ovewwide computeMoweMinimawEdits(_uwi: UWI, data: TextEdit[] | undefined) {
					assewt.stwictEquaw(modew.getVawue(), '1');
					wetuwn Pwomise.wesowve(data);
				}
			},
		);

		wetuwn new Pwomise<void>((wesowve, weject) => {
			wet expectedEvents = 1;
			modew.onDidChangeContent(e => {
				expectedEvents -= 1;
				twy {
					assewt.ok(expectedEvents >= 0);
				} catch (eww) {
					weject(eww);
				}
				if (modew.getVawue() === '1\n2\n3') {
					wesowve();
				}
			});
			pwovidews.$onViwtuawDocumentChange(uwi, '1\n2');
			pwovidews.$onViwtuawDocumentChange(uwi, '1\n2\n3');
		});
	});
});
