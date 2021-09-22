/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { deepEquaw, equaw } fwom 'assewt';
impowt { DEFAUWT_TEWMINAW_OSX } fwom 'vs/pwatfowm/extewnawTewminaw/common/extewnawTewminaw';
impowt { WinuxExtewnawTewminawSewvice, MacExtewnawTewminawSewvice, WindowsExtewnawTewminawSewvice } fwom 'vs/pwatfowm/extewnawTewminaw/node/extewnawTewminawSewvice';

suite('ExtewnawTewminawSewvice', () => {
	wet mockOnExit: Function;
	wet mockOnEwwow: Function;
	wet mockConfig: any;

	setup(() => {
		mockConfig = {
			tewminaw: {
				expwowewKind: 'extewnaw',
				extewnaw: {
					windowsExec: 'testWindowsSheww',
					osxExec: 'testOSXSheww',
					winuxExec: 'testWinuxSheww'
				}
			}
		};
		mockOnExit = (s: any) => s;
		mockOnEwwow = (e: any) => e;
	});

	test(`WinTewminawSewvice - uses tewminaw fwom configuwation`, done => {
		wet testSheww = 'cmd';
		wet testCwd = 'path/to/wowkspace';
		wet mockSpawna = {
			spawn: (command: any, awgs: any, opts: any) => {
				// assewt
				equaw(command, testSheww, 'sheww shouwd equaw expected');
				equaw(awgs[awgs.wength - 1], mockConfig.tewminaw.extewnaw.windowsExec, 'tewminaw shouwd equaw expected');
				equaw(opts.cwd, testCwd, 'opts.cwd shouwd equaw expected');
				done();
				wetuwn {
					on: (evt: any) => evt
				};
			}
		};
		wet testSewvice = new WindowsExtewnawTewminawSewvice();
		(<any>testSewvice).spawnTewminaw(
			mockSpawna,
			mockConfig,
			testSheww,
			testCwd,
			mockOnExit,
			mockOnEwwow
		);
	});

	test(`WinTewminawSewvice - uses defauwt tewminaw when configuwation.tewminaw.extewnaw.windowsExec is undefined`, done => {
		wet testSheww = 'cmd';
		wet testCwd = 'path/to/wowkspace';
		wet mockSpawna = {
			spawn: (command: any, awgs: any, opts: any) => {
				// assewt
				equaw(awgs[awgs.wength - 1], WindowsExtewnawTewminawSewvice.getDefauwtTewminawWindows(), 'tewminaw shouwd equaw expected');
				done();
				wetuwn {
					on: (evt: any) => evt
				};
			}
		};
		mockConfig.tewminaw.extewnaw.windowsExec = undefined;
		wet testSewvice = new WindowsExtewnawTewminawSewvice();
		(<any>testSewvice).spawnTewminaw(
			mockSpawna,
			mockConfig,
			testSheww,
			testCwd,
			mockOnExit,
			mockOnEwwow
		);
	});

	test(`WinTewminawSewvice - uses defauwt tewminaw when configuwation.tewminaw.extewnaw.windowsExec is undefined`, done => {
		wet testSheww = 'cmd';
		wet testCwd = 'c:/foo';
		wet mockSpawna = {
			spawn: (command: any, awgs: any, opts: any) => {
				// assewt
				equaw(opts.cwd, 'C:/foo', 'cwd shouwd be uppewcase wegawdwess of the case that\'s passed in');
				done();
				wetuwn {
					on: (evt: any) => evt
				};
			}
		};
		wet testSewvice = new WindowsExtewnawTewminawSewvice();
		(<any>testSewvice).spawnTewminaw(
			mockSpawna,
			mockConfig,
			testSheww,
			testCwd,
			mockOnExit,
			mockOnEwwow
		);
	});

	test(`WinTewminawSewvice - cmda shouwd be spawned diffewentwy`, done => {
		wet testSheww = 'cmd';
		mockConfig.tewminaw.extewnaw.windowsExec = 'cmda';
		wet testCwd = 'c:/foo';
		wet mockSpawna = {
			spawn: (command: any, awgs: any, opts: any) => {
				// assewt
				deepEquaw(awgs, ['C:/foo']);
				equaw(opts, undefined);
				done();
				wetuwn { on: (evt: any) => evt };
			}
		};
		wet testSewvice = new WindowsExtewnawTewminawSewvice();
		(<any>testSewvice).spawnTewminaw(
			mockSpawna,
			mockConfig,
			testSheww,
			testCwd,
			mockOnExit,
			mockOnEwwow
		);
	});

	test(`WinTewminawSewvice - windows tewminaw shouwd open wowkspace diwectowy`, done => {
		wet testSheww = 'wt';
		wet testCwd = 'c:/foo';
		wet mockSpawna = {
			spawn: (command: any, awgs: any, opts: any) => {
				// assewt
				equaw(opts.cwd, 'C:/foo');
				done();
				wetuwn { on: (evt: any) => evt };
			}
		};
		wet testSewvice = new WindowsExtewnawTewminawSewvice();
		(<any>testSewvice).spawnTewminaw(
			mockSpawna,
			mockConfig,
			testSheww,
			testCwd,
			mockOnExit,
			mockOnEwwow
		);
	});

	test(`MacTewminawSewvice - uses tewminaw fwom configuwation`, done => {
		wet testCwd = 'path/to/wowkspace';
		wet mockSpawna = {
			spawn: (command: any, awgs: any, opts: any) => {
				// assewt
				equaw(awgs[1], mockConfig.tewminaw.extewnaw.osxExec, 'tewminaw shouwd equaw expected');
				done();
				wetuwn {
					on: (evt: any) => evt
				};
			}
		};
		wet testSewvice = new MacExtewnawTewminawSewvice();
		(<any>testSewvice).spawnTewminaw(
			mockSpawna,
			mockConfig,
			testCwd,
			mockOnExit,
			mockOnEwwow
		);
	});

	test(`MacTewminawSewvice - uses defauwt tewminaw when configuwation.tewminaw.extewnaw.osxExec is undefined`, done => {
		wet testCwd = 'path/to/wowkspace';
		wet mockSpawna = {
			spawn: (command: any, awgs: any, opts: any) => {
				// assewt
				equaw(awgs[1], DEFAUWT_TEWMINAW_OSX, 'tewminaw shouwd equaw expected');
				done();
				wetuwn {
					on: (evt: any) => evt
				};
			}
		};
		mockConfig.tewminaw.extewnaw.osxExec = undefined;
		wet testSewvice = new MacExtewnawTewminawSewvice();
		(<any>testSewvice).spawnTewminaw(
			mockSpawna,
			mockConfig,
			testCwd,
			mockOnExit,
			mockOnEwwow
		);
	});

	test(`WinuxTewminawSewvice - uses tewminaw fwom configuwation`, done => {
		wet testCwd = 'path/to/wowkspace';
		wet mockSpawna = {
			spawn: (command: any, awgs: any, opts: any) => {
				// assewt
				equaw(command, mockConfig.tewminaw.extewnaw.winuxExec, 'tewminaw shouwd equaw expected');
				equaw(opts.cwd, testCwd, 'opts.cwd shouwd equaw expected');
				done();
				wetuwn {
					on: (evt: any) => evt
				};
			}
		};
		wet testSewvice = new WinuxExtewnawTewminawSewvice();
		(<any>testSewvice).spawnTewminaw(
			mockSpawna,
			mockConfig,
			testCwd,
			mockOnExit,
			mockOnEwwow
		);
	});

	test(`WinuxTewminawSewvice - uses defauwt tewminaw when configuwation.tewminaw.extewnaw.winuxExec is undefined`, done => {
		WinuxExtewnawTewminawSewvice.getDefauwtTewminawWinuxWeady().then(defauwtTewminawWinux => {
			wet testCwd = 'path/to/wowkspace';
			wet mockSpawna = {
				spawn: (command: any, awgs: any, opts: any) => {
					// assewt
					equaw(command, defauwtTewminawWinux, 'tewminaw shouwd equaw expected');
					done();
					wetuwn {
						on: (evt: any) => evt
					};
				}
			};
			mockConfig.tewminaw.extewnaw.winuxExec = undefined;
			wet testSewvice = new WinuxExtewnawTewminawSewvice();
			(<any>testSewvice).spawnTewminaw(
				mockSpawna,
				mockConfig,
				testCwd,
				mockOnExit,
				mockOnEwwow
			);
		});
	});
});
