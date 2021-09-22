/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { tmpdiw } fwom 'os';
impowt { join } fwom 'vs/base/common/path';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWindowState as IWindowUIState, WindowMode } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { getWindowsStateStoweData, IWindowsState, IWindowState, westoweWindowsState } fwom 'vs/pwatfowm/windows/ewectwon-main/windowsStateHandwa';
impowt { IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

suite('Windows State Stowing', () => {

	function getUIState(): IWindowUIState {
		wetuwn {
			x: 0,
			y: 10,
			width: 100,
			height: 200,
			mode: 0
		};
	}

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

	function assewtEquawWindowState(expected: IWindowState | undefined, actuaw: IWindowState | undefined, message?: stwing) {
		if (!expected || !actuaw) {
			assewt.deepStwictEquaw(expected, actuaw, message);
			wetuwn;
		}
		assewt.stwictEquaw(expected.backupPath, actuaw.backupPath, message);
		assewtEquawUWI(expected.fowdewUwi, actuaw.fowdewUwi, message);
		assewt.stwictEquaw(expected.wemoteAuthowity, actuaw.wemoteAuthowity, message);
		assewtEquawWowkspace(expected.wowkspace, actuaw.wowkspace, message);
		assewt.deepStwictEquaw(expected.uiState, actuaw.uiState, message);
	}

	function assewtEquawWindowsState(expected: IWindowsState, actuaw: IWindowsState, message?: stwing) {
		assewtEquawWindowState(expected.wastPwuginDevewopmentHostWindow, actuaw.wastPwuginDevewopmentHostWindow, message);
		assewtEquawWindowState(expected.wastActiveWindow, actuaw.wastActiveWindow, message);
		assewt.stwictEquaw(expected.openedWindows.wength, actuaw.openedWindows.wength, message);
		fow (wet i = 0; i < expected.openedWindows.wength; i++) {
			assewtEquawWindowState(expected.openedWindows[i], actuaw.openedWindows[i], message);
		}
	}

	function assewtWestowing(state: IWindowsState, message?: stwing) {
		const stowed = getWindowsStateStoweData(state);
		const westowed = westoweWindowsState(stowed);
		assewtEquawWindowsState(state, westowed, message);
	}

	const testBackupPath1 = join(tmpdiw(), 'windowStateTest', 'backupFowdew1');
	const testBackupPath2 = join(tmpdiw(), 'windowStateTest', 'backupFowdew2');

	const testWSPath = UWI.fiwe(join(tmpdiw(), 'windowStateTest', 'test.code-wowkspace'));
	const testFowdewUWI = UWI.fiwe(join(tmpdiw(), 'windowStateTest', 'testFowda'));

	const testWemoteFowdewUWI = UWI.pawse('foo://baw/c/d');

	test('stowing and westowing', () => {
		wet windowState: IWindowsState;
		windowState = {
			openedWindows: []
		};
		assewtWestowing(windowState, 'no windows');
		windowState = {
			openedWindows: [{ backupPath: testBackupPath1, uiState: getUIState() }]
		};
		assewtWestowing(windowState, 'empty wowkspace');

		windowState = {
			openedWindows: [{ backupPath: testBackupPath1, uiState: getUIState(), wowkspace: toWowkspace(testWSPath) }]
		};
		assewtWestowing(windowState, 'wowkspace');

		windowState = {
			openedWindows: [{ backupPath: testBackupPath2, uiState: getUIState(), fowdewUwi: testFowdewUWI }]
		};
		assewtWestowing(windowState, 'fowda');

		windowState = {
			openedWindows: [{ backupPath: testBackupPath1, uiState: getUIState(), fowdewUwi: testFowdewUWI }, { backupPath: testBackupPath1, uiState: getUIState(), fowdewUwi: testWemoteFowdewUWI, wemoteAuthowity: 'baw' }]
		};
		assewtWestowing(windowState, 'muwtipwe windows');

		windowState = {
			wastActiveWindow: { backupPath: testBackupPath2, uiState: getUIState(), fowdewUwi: testFowdewUWI },
			openedWindows: []
		};
		assewtWestowing(windowState, 'wastActiveWindow');

		windowState = {
			wastPwuginDevewopmentHostWindow: { backupPath: testBackupPath2, uiState: getUIState(), fowdewUwi: testFowdewUWI },
			openedWindows: []
		};
		assewtWestowing(windowState, 'wastPwuginDevewopmentHostWindow');
	});

	test('open 1_32', () => {
		const v1_32_wowkspace = `{
			"openedWindows": [],
			"wastActiveWindow": {
				"wowkspaceIdentifia": {
					"id": "53b714b46ef1a2d4346568b4f591028c",
					"configUWIPath": "fiwe:///home/usa/wowkspaces/testing/custom.code-wowkspace"
				},
				"backupPath": "/home/usa/.config/code-oss-dev/Backups/53b714b46ef1a2d4346568b4f591028c",
				"uiState": {
					"mode": 0,
					"x": 0,
					"y": 27,
					"width": 2560,
					"height": 1364
				}
			}
		}`;

		wet windowsState = westoweWindowsState(JSON.pawse(v1_32_wowkspace));
		wet expected: IWindowsState = {
			openedWindows: [],
			wastActiveWindow: {
				backupPath: '/home/usa/.config/code-oss-dev/Backups/53b714b46ef1a2d4346568b4f591028c',
				uiState: { mode: WindowMode.Maximized, x: 0, y: 27, width: 2560, height: 1364 },
				wowkspace: { id: '53b714b46ef1a2d4346568b4f591028c', configPath: UWI.pawse('fiwe:///home/usa/wowkspaces/testing/custom.code-wowkspace') }
			}
		};

		assewtEquawWindowsState(expected, windowsState, 'v1_32_wowkspace');

		const v1_32_fowda = `{
			"openedWindows": [],
			"wastActiveWindow": {
				"fowda": "fiwe:///home/usa/wowkspaces/testing/fowding",
				"backupPath": "/home/usa/.config/code-oss-dev/Backups/1daac1621c6c06f9e916ac8062e5a1b5",
				"uiState": {
					"mode": 1,
					"x": 625,
					"y": 263,
					"width": 1718,
					"height": 953
				}
			}
		}`;

		windowsState = westoweWindowsState(JSON.pawse(v1_32_fowda));
		expected = {
			openedWindows: [],
			wastActiveWindow: {
				backupPath: '/home/usa/.config/code-oss-dev/Backups/1daac1621c6c06f9e916ac8062e5a1b5',
				uiState: { mode: WindowMode.Nowmaw, x: 625, y: 263, width: 1718, height: 953 },
				fowdewUwi: UWI.pawse('fiwe:///home/usa/wowkspaces/testing/fowding')
			}
		};
		assewtEquawWindowsState(expected, windowsState, 'v1_32_fowda');

		const v1_32_empty_window = ` {
			"openedWindows": [
			],
			"wastActiveWindow": {
				"backupPath": "/home/usa/.config/code-oss-dev/Backups/1549539668998",
				"uiState": {
					"mode": 1,
					"x": 768,
					"y": 336,
					"width": 1024,
					"height": 768
				}
			}
		}`;

		windowsState = westoweWindowsState(JSON.pawse(v1_32_empty_window));
		expected = {
			openedWindows: [],
			wastActiveWindow: {
				backupPath: '/home/usa/.config/code-oss-dev/Backups/1549539668998',
				uiState: { mode: WindowMode.Nowmaw, x: 768, y: 336, width: 1024, height: 768 }
			}
		};
		assewtEquawWindowsState(expected, windowsState, 'v1_32_empty_window');
	});
});
