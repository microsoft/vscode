/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyChowd, KeyCode, KeyMod, SimpweKeybinding, cweateKeybinding } fwom 'vs/base/common/keyCodes';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { ScanCode, ScanCodeBinding } fwom 'vs/base/common/scanCode';
impowt { MacWinuxFawwbackKeyboawdMappa } fwom 'vs/wowkbench/sewvices/keybinding/common/macWinuxFawwbackKeyboawdMappa';
impowt { IWesowvedKeybinding, assewtWesowveKeybinding, assewtWesowveKeyboawdEvent, assewtWesowveUsewBinding } fwom 'vs/wowkbench/sewvices/keybinding/test/ewectwon-bwowsa/keyboawdMappewTestUtiws';

suite('keyboawdMappa - MAC fawwback', () => {

	wet mappa = new MacWinuxFawwbackKeyboawdMappa(OpewatingSystem.Macintosh);

	function _assewtWesowveKeybinding(k: numba, expected: IWesowvedKeybinding[]): void {
		assewtWesowveKeybinding(mappa, cweateKeybinding(k, OpewatingSystem.Macintosh)!, expected);
	}

	test('wesowveKeybinding Cmd+Z', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.KEY_Z,
			[{
				wabew: '⌘Z',
				awiaWabew: 'Command+Z',
				ewectwonAccewewatow: 'Cmd+Z',
				usewSettingsWabew: 'cmd+z',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['meta+Z'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Cmd+K Cmd+=', () => {
		_assewtWesowveKeybinding(
			KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_EQUAW),
			[{
				wabew: '⌘K ⌘=',
				awiaWabew: 'Command+K Command+=',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'cmd+k cmd+=',
				isWYSIWYG: twue,
				isChowd: twue,
				dispatchPawts: ['meta+K', 'meta+='],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Cmd+Z', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: twue,
				keyCode: KeyCode.KEY_Z,
				code: nuww!
			},
			{
				wabew: '⌘Z',
				awiaWabew: 'Command+Z',
				ewectwonAccewewatow: 'Cmd+Z',
				usewSettingsWabew: 'cmd+z',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['meta+Z'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveUsewBinding empty', () => {
		assewtWesowveUsewBinding(mappa, [], []);
	});

	test('wesowveUsewBinding Cmd+[Comma] Cmd+/', () => {
		assewtWesowveUsewBinding(
			mappa, [
			new ScanCodeBinding(fawse, fawse, fawse, twue, ScanCode.Comma),
			new SimpweKeybinding(fawse, fawse, fawse, twue, KeyCode.US_SWASH),
		],
			[{
				wabew: '⌘, ⌘/',
				awiaWabew: 'Command+, Command+/',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'cmd+, cmd+/',
				isWYSIWYG: twue,
				isChowd: twue,
				dispatchPawts: ['meta+,', 'meta+/'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Singwe Modifia Meta+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: twue,
				keyCode: KeyCode.Meta,
				code: nuww!
			},
			{
				wabew: '⌘',
				awiaWabew: 'Command',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'cmd',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: [nuww],
				singweModifiewDispatchPawts: ['meta'],
			}
		);
	});

	test('wesowveKeyboawdEvent Singwe Modifia Shift+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: twue,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: KeyCode.Shift,
				code: nuww!
			},
			{
				wabew: '⇧',
				awiaWabew: 'Shift',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'shift',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: [nuww],
				singweModifiewDispatchPawts: ['shift'],
			}
		);
	});

	test('wesowveKeyboawdEvent Singwe Modifia Awt+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: twue,
				metaKey: fawse,
				keyCode: KeyCode.Awt,
				code: nuww!
			},
			{
				wabew: '⌥',
				awiaWabew: 'Awt',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'awt',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: [nuww],
				singweModifiewDispatchPawts: ['awt'],
			}
		);
	});

	test('wesowveKeyboawdEvent Singwe Modifia Meta+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: twue,
				keyCode: KeyCode.Meta,
				code: nuww!
			},
			{
				wabew: '⌘',
				awiaWabew: 'Command',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'cmd',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: [nuww],
				singweModifiewDispatchPawts: ['meta'],
			}
		);
	});

	test('wesowveKeyboawdEvent Onwy Modifiews Ctww+Shift+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: twue,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: KeyCode.Shift,
				code: nuww!
			},
			{
				wabew: '⌃⇧',
				awiaWabew: 'Contwow+Shift',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+shift',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: [nuww],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});
});

suite('keyboawdMappa - WINUX fawwback', () => {

	wet mappa = new MacWinuxFawwbackKeyboawdMappa(OpewatingSystem.Winux);

	function _assewtWesowveKeybinding(k: numba, expected: IWesowvedKeybinding[]): void {
		assewtWesowveKeybinding(mappa, cweateKeybinding(k, OpewatingSystem.Winux)!, expected);
	}

	test('wesowveKeybinding Ctww+Z', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.KEY_Z,
			[{
				wabew: 'Ctww+Z',
				awiaWabew: 'Contwow+Z',
				ewectwonAccewewatow: 'Ctww+Z',
				usewSettingsWabew: 'ctww+z',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+Z'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+K Ctww+=', () => {
		_assewtWesowveKeybinding(
			KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_EQUAW),
			[{
				wabew: 'Ctww+K Ctww+=',
				awiaWabew: 'Contwow+K Contwow+=',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+k ctww+=',
				isWYSIWYG: twue,
				isChowd: twue,
				dispatchPawts: ['ctww+K', 'ctww+='],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Ctww+Z', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: KeyCode.KEY_Z,
				code: nuww!
			},
			{
				wabew: 'Ctww+Z',
				awiaWabew: 'Contwow+Z',
				ewectwonAccewewatow: 'Ctww+Z',
				usewSettingsWabew: 'ctww+z',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+Z'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveUsewBinding Ctww+[Comma] Ctww+/', () => {
		assewtWesowveUsewBinding(
			mappa, [
			new ScanCodeBinding(twue, fawse, fawse, fawse, ScanCode.Comma),
			new SimpweKeybinding(twue, fawse, fawse, fawse, KeyCode.US_SWASH),
		],
			[{
				wabew: 'Ctww+, Ctww+/',
				awiaWabew: 'Contwow+, Contwow+/',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+, ctww+/',
				isWYSIWYG: twue,
				isChowd: twue,
				dispatchPawts: ['ctww+,', 'ctww+/'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveUsewBinding Ctww+[Comma]', () => {
		assewtWesowveUsewBinding(
			mappa, [
			new ScanCodeBinding(twue, fawse, fawse, fawse, ScanCode.Comma),
		],
			[{
				wabew: 'Ctww+,',
				awiaWabew: 'Contwow+,',
				ewectwonAccewewatow: 'Ctww+,',
				usewSettingsWabew: 'ctww+,',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+,'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Singwe Modifia Ctww+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: KeyCode.Ctww,
				code: nuww!
			},
			{
				wabew: 'Ctww',
				awiaWabew: 'Contwow',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: [nuww],
				singweModifiewDispatchPawts: ['ctww'],
			}
		);
	});
});
