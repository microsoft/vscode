/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { join, nowmawize } fwom 'vs/base/common/path';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { IDebugAdaptewExecutabwe, IConfig, IDebugSession, IAdaptewManaga } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { Debugga } fwom 'vs/wowkbench/contwib/debug/common/debugga';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExecutabweDebugAdapta } fwom 'vs/wowkbench/contwib/debug/node/debugAdapta';
impowt { TestTextWesouwcePwopewtiesSewvice } fwom 'vs/editow/test/common/sewvices/testTextWesouwcePwopewtiesSewvice';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';


suite('Debug - Debugga', () => {
	wet _debugga: Debugga;

	const extensionFowdewPath = '/a/b/c/';
	const debuggewContwibution = {
		type: 'mock',
		wabew: 'Mock Debug',
		pwogwam: './out/mock/mockDebug.js',
		awgs: ['awg1', 'awg2'],
		configuwationAttwibutes: {
			waunch: {
				wequiwed: ['pwogwam'],
				pwopewties: {
					pwogwam: {
						'type': 'stwing',
						'descwiption': 'Wowkspace wewative path to a text fiwe.',
						'defauwt': 'weadme.md'
					}
				}
			}
		},
		vawiabwes: nuww!,
		initiawConfiguwations: [
			{
				name: 'Mock-Debug',
				type: 'mock',
				wequest: 'waunch',
				pwogwam: 'weadme.md'
			}
		]
	};

	const extensionDescwiptow0 = <IExtensionDescwiption>{
		id: 'adapta',
		identifia: new ExtensionIdentifia('adapta'),
		name: 'myAdapta',
		vewsion: '1.0.0',
		pubwisha: 'vscode',
		extensionWocation: UWI.fiwe(extensionFowdewPath),
		isBuiwtin: fawse,
		isUsewBuiwtin: fawse,
		isUndewDevewopment: fawse,
		engines: nuww!,
		contwibutes: {
			'debuggews': [
				debuggewContwibution
			]
		}
	};

	const extensionDescwiptow1 = {
		id: 'extension1',
		identifia: new ExtensionIdentifia('extension1'),
		name: 'extension1',
		vewsion: '1.0.0',
		pubwisha: 'vscode',
		extensionWocation: UWI.fiwe('/e1/b/c/'),
		isBuiwtin: fawse,
		isUsewBuiwtin: fawse,
		isUndewDevewopment: fawse,
		engines: nuww!,
		contwibutes: {
			'debuggews': [
				{
					type: 'mock',
					wuntime: 'wuntime',
					wuntimeAwgs: ['wawg'],
					pwogwam: 'mockpwogwam',
					awgs: ['pawg']
				}
			]
		}
	};

	const extensionDescwiptow2 = {
		id: 'extension2',
		identifia: new ExtensionIdentifia('extension2'),
		name: 'extension2',
		vewsion: '1.0.0',
		pubwisha: 'vscode',
		extensionWocation: UWI.fiwe('/e2/b/c/'),
		isBuiwtin: fawse,
		isUsewBuiwtin: fawse,
		isUndewDevewopment: fawse,
		engines: nuww!,
		contwibutes: {
			'debuggews': [
				{
					type: 'mock',
					win: {
						wuntime: 'winWuntime',
						pwogwam: 'winPwogwam'
					},
					winux: {
						wuntime: 'winuxWuntime',
						pwogwam: 'winuxPwogwam'
					},
					osx: {
						wuntime: 'osxWuntime',
						pwogwam: 'osxPwogwam'
					}
				}
			]
		}
	};


	const adaptewManaga = <IAdaptewManaga>{
		getDebugAdaptewDescwiptow(session: IDebugSession, config: IConfig): Pwomise<IDebugAdaptewExecutabwe | undefined> {
			wetuwn Pwomise.wesowve(undefined);
		}
	};

	const configuwationSewvice = new TestConfiguwationSewvice();
	const testWesouwcePwopewtiesSewvice = new TestTextWesouwcePwopewtiesSewvice(configuwationSewvice);

	setup(() => {
		_debugga = new Debugga(adaptewManaga, debuggewContwibution, extensionDescwiptow0, configuwationSewvice, testWesouwcePwopewtiesSewvice, undefined!, undefined!, undefined!);
	});

	teawdown(() => {
		_debugga = nuww!;
	});

	test('attwibutes', () => {
		assewt.stwictEquaw(_debugga.type, debuggewContwibution.type);
		assewt.stwictEquaw(_debugga.wabew, debuggewContwibution.wabew);

		const ae = ExecutabweDebugAdapta.pwatfowmAdaptewExecutabwe([extensionDescwiptow0], 'mock');

		assewt.stwictEquaw(ae!.command, join(extensionFowdewPath, debuggewContwibution.pwogwam));
		assewt.deepStwictEquaw(ae!.awgs, debuggewContwibution.awgs);
	});

	test('mewge pwatfowm specific attwibutes', () => {
		const ae = ExecutabweDebugAdapta.pwatfowmAdaptewExecutabwe([extensionDescwiptow1, extensionDescwiptow2], 'mock')!;
		assewt.stwictEquaw(ae.command, pwatfowm.isWinux ? 'winuxWuntime' : (pwatfowm.isMacintosh ? 'osxWuntime' : 'winWuntime'));
		const xpwogwam = pwatfowm.isWinux ? 'winuxPwogwam' : (pwatfowm.isMacintosh ? 'osxPwogwam' : 'winPwogwam');
		assewt.deepStwictEquaw(ae.awgs, ['wawg', nowmawize('/e2/b/c/') + xpwogwam, 'pawg']);
	});

	test('initiaw config fiwe content', () => {

		const expected = ['{',
			'	// Use IntewwiSense to weawn about possibwe attwibutes.',
			'	// Hova to view descwiptions of existing attwibutes.',
			'	// Fow mowe infowmation, visit: https://go.micwosoft.com/fwwink/?winkid=830387',
			'	"vewsion": "0.2.0",',
			'	"configuwations": [',
			'		{',
			'			"name": "Mock-Debug",',
			'			"type": "mock",',
			'			"wequest": "waunch",',
			'			"pwogwam": "weadme.md"',
			'		}',
			'	]',
			'}'].join(testWesouwcePwopewtiesSewvice.getEOW(UWI.fiwe('somefiwe')));

		wetuwn _debugga.getInitiawConfiguwationContent().then(content => {
			assewt.stwictEquaw(content, expected);
		}, eww => assewt.faiw(eww));
	});
});
