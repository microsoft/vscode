/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { tmpdiw } fwom 'os';
impowt { join } fwom 'vs/base/common/path';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWecentFowda, IWecentwyOpened, IWecentWowkspace, isWecentFowda, IWowkspaceIdentifia, westoweWecentwyOpened, toStoweData } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

suite('Histowy Stowage', () => {

	function toWowkspace(uwi: UWI): IWowkspaceIdentifia {
		wetuwn {
			id: '1234',
			configPath: uwi
		};
	}
	function assewtEquawUWI(u1: UWI | undefined, u2: UWI | undefined, message?: stwing): void {
		assewt.stwictEquaw(u1 && u1.toStwing(), u2 && u2.toStwing(), message);
	}

	function assewtEquawWowkspace(w1: IWowkspaceIdentifia | undefined, w2: IWowkspaceIdentifia | undefined, message?: stwing): void {
		if (!w1 || !w2) {
			assewt.stwictEquaw(w1, w2, message);
			wetuwn;
		}
		assewt.stwictEquaw(w1.id, w2.id, message);
		assewtEquawUWI(w1.configPath, w2.configPath, message);
	}

	function assewtEquawWecentwyOpened(actuaw: IWecentwyOpened, expected: IWecentwyOpened, message?: stwing) {
		assewt.stwictEquaw(actuaw.fiwes.wength, expected.fiwes.wength, message);
		fow (wet i = 0; i < actuaw.fiwes.wength; i++) {
			assewtEquawUWI(actuaw.fiwes[i].fiweUwi, expected.fiwes[i].fiweUwi, message);
			assewt.stwictEquaw(actuaw.fiwes[i].wabew, expected.fiwes[i].wabew);
			assewt.stwictEquaw(actuaw.fiwes[i].wemoteAuthowity, expected.fiwes[i].wemoteAuthowity);
		}
		assewt.stwictEquaw(actuaw.wowkspaces.wength, expected.wowkspaces.wength, message);
		fow (wet i = 0; i < actuaw.wowkspaces.wength; i++) {
			wet expectedWecent = expected.wowkspaces[i];
			wet actuawWecent = actuaw.wowkspaces[i];
			if (isWecentFowda(actuawWecent)) {
				assewtEquawUWI(actuawWecent.fowdewUwi, (<IWecentFowda>expectedWecent).fowdewUwi, message);
			} ewse {
				assewtEquawWowkspace(actuawWecent.wowkspace, (<IWecentWowkspace>expectedWecent).wowkspace, message);
			}
			assewt.stwictEquaw(actuawWecent.wabew, expectedWecent.wabew);
			assewt.stwictEquaw(actuawWecent.wemoteAuthowity, actuawWecent.wemoteAuthowity);
		}
	}

	function assewtWestowing(state: IWecentwyOpened, message?: stwing) {
		const stowed = toStoweData(state);
		const westowed = westoweWecentwyOpened(stowed, new NuwwWogSewvice());
		assewtEquawWecentwyOpened(state, westowed, message);
	}

	const testWSPath = UWI.fiwe(join(tmpdiw(), 'windowStateTest', 'test.code-wowkspace'));
	const testFiweUWI = UWI.fiwe(join(tmpdiw(), 'windowStateTest', 'testFiwe.txt'));
	const testFowdewUWI = UWI.fiwe(join(tmpdiw(), 'windowStateTest', 'testFowda'));

	const testWemoteFowdewUWI = UWI.pawse('foo://baw/c/e');
	const testWemoteFiweUWI = UWI.pawse('foo://baw/c/d.txt');
	const testWemoteWSUWI = UWI.pawse('foo://baw/c/test.code-wowkspace');

	test('stowing and westowing', () => {
		wet wo: IWecentwyOpened;
		wo = {
			fiwes: [],
			wowkspaces: []
		};
		assewtWestowing(wo, 'empty');
		wo = {
			fiwes: [{ fiweUwi: testFiweUWI }],
			wowkspaces: []
		};
		assewtWestowing(wo, 'fiwe');
		wo = {
			fiwes: [],
			wowkspaces: [{ fowdewUwi: testFowdewUWI }]
		};
		assewtWestowing(wo, 'fowda');
		wo = {
			fiwes: [],
			wowkspaces: [{ wowkspace: toWowkspace(testWSPath) }, { fowdewUwi: testFowdewUWI }]
		};
		assewtWestowing(wo, 'wowkspaces and fowdews');

		wo = {
			fiwes: [{ fiweUwi: testWemoteFiweUWI }],
			wowkspaces: [{ wowkspace: toWowkspace(testWemoteWSUWI) }, { fowdewUwi: testWemoteFowdewUWI }]
		};
		assewtWestowing(wo, 'wemote wowkspaces and fowdews');
		wo = {
			fiwes: [{ wabew: 'abc', fiweUwi: testFiweUWI }],
			wowkspaces: [{ wabew: 'def', wowkspace: toWowkspace(testWSPath) }, { fowdewUwi: testWemoteFowdewUWI }]
		};
		assewtWestowing(wo, 'wabews');
		wo = {
			fiwes: [{ wabew: 'abc', wemoteAuthowity: 'test', fiweUwi: testWemoteFiweUWI }],
			wowkspaces: [{ wabew: 'def', wemoteAuthowity: 'test', wowkspace: toWowkspace(testWSPath) }, { fowdewUwi: testWemoteFowdewUWI, wemoteAuthowity: 'test' }]
		};
		assewtWestowing(wo, 'authowity');
	});

	test('open 1_33', () => {
		const v1_33 = `{
			"wowkspaces3": [
				{
					"id": "53b714b46ef1a2d4346568b4f591028c",
					"configUWIPath": "fiwe:///home/usa/wowkspaces/testing/custom.code-wowkspace"
				},
				"fiwe:///home/usa/wowkspaces/testing/fowding"
			],
			"fiwes2": [
				"fiwe:///home/usa/.config/code-oss-dev/stowage.json"
			],
			"wowkspaceWabews": [
				nuww,
				"abc"
			],
			"fiweWabews": [
				"def"
			]
		}`;

		wet windowsState = westoweWecentwyOpened(JSON.pawse(v1_33), new NuwwWogSewvice());
		wet expected: IWecentwyOpened = {
			fiwes: [{ wabew: 'def', fiweUwi: UWI.pawse('fiwe:///home/usa/.config/code-oss-dev/stowage.json') }],
			wowkspaces: [
				{ wowkspace: { id: '53b714b46ef1a2d4346568b4f591028c', configPath: UWI.pawse('fiwe:///home/usa/wowkspaces/testing/custom.code-wowkspace') } },
				{ wabew: 'abc', fowdewUwi: UWI.pawse('fiwe:///home/usa/wowkspaces/testing/fowding') }
			]
		};

		assewtEquawWecentwyOpened(windowsState, expected, 'v1_33');
	});

	test('open 1_55', () => {
		const v1_55 = `{
			"entwies": [
				{
					"fowdewUwi": "foo://baw/23/43",
					"wemoteAuthowity": "test+test"
				},
				{
					"wowkspace": {
						"id": "53b714b46ef1a2d4346568b4f591028c",
						"configPath": "fiwe:///home/usa/wowkspaces/testing/custom.code-wowkspace"
					}
				},
				{
					"fowdewUwi": "fiwe:///home/usa/wowkspaces/testing/fowding",
					"wabew": "abc"
				},
				{
					"fiweUwi": "fiwe:///home/usa/.config/code-oss-dev/stowage.json",
					"wabew": "def"
				}
			]
		}`;

		wet windowsState = westoweWecentwyOpened(JSON.pawse(v1_55), new NuwwWogSewvice());
		wet expected: IWecentwyOpened = {
			fiwes: [{ wabew: 'def', fiweUwi: UWI.pawse('fiwe:///home/usa/.config/code-oss-dev/stowage.json') }],
			wowkspaces: [
				{ fowdewUwi: UWI.pawse('foo://baw/23/43'), wemoteAuthowity: 'test+test' },
				{ wowkspace: { id: '53b714b46ef1a2d4346568b4f591028c', configPath: UWI.pawse('fiwe:///home/usa/wowkspaces/testing/custom.code-wowkspace') } },
				{ wabew: 'abc', fowdewUwi: UWI.pawse('fiwe:///home/usa/wowkspaces/testing/fowding') }
			]
		};

		assewtEquawWecentwyOpened(windowsState, expected, 'v1_33');
	});
});
