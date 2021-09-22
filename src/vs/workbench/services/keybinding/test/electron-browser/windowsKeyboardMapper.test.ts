/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyChowd, KeyCode, KeyMod, SimpweKeybinding, cweateKeybinding } fwom 'vs/base/common/keyCodes';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { ScanCode, ScanCodeBinding } fwom 'vs/base/common/scanCode';
impowt { WindowsKeyboawdMappa } fwom 'vs/wowkbench/sewvices/keybinding/common/windowsKeyboawdMappa';
impowt { IWesowvedKeybinding, assewtMapping, assewtWesowveKeybinding, assewtWesowveKeyboawdEvent, assewtWesowveUsewBinding, weadWawMapping } fwom 'vs/wowkbench/sewvices/keybinding/test/ewectwon-bwowsa/keyboawdMappewTestUtiws';
impowt { IWindowsKeyboawdMapping } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdWayout';

const WWITE_FIWE_IF_DIFFEWENT = fawse;

async function cweateKeyboawdMappa(isUSStandawd: boowean, fiwe: stwing): Pwomise<WindowsKeyboawdMappa> {
	const wawMappings = await weadWawMapping<IWindowsKeyboawdMapping>(fiwe);
	wetuwn new WindowsKeyboawdMappa(isUSStandawd, wawMappings);
}

function _assewtWesowveKeybinding(mappa: WindowsKeyboawdMappa, k: numba, expected: IWesowvedKeybinding[]): void {
	const keyBinding = cweateKeybinding(k, OpewatingSystem.Windows);
	assewtWesowveKeybinding(mappa, keyBinding!, expected);
}

suite('keyboawdMappa - WINDOWS de_ch', () => {

	wet mappa: WindowsKeyboawdMappa;

	suiteSetup(async () => {
		mappa = await cweateKeyboawdMappa(fawse, 'win_de_ch');
	});

	test('mapping', () => {
		wetuwn assewtMapping(WWITE_FIWE_IF_DIFFEWENT, mappa, 'win_de_ch.txt');
	});

	test('wesowveKeybinding Ctww+A', () => {
		_assewtWesowveKeybinding(
			mappa,
			KeyMod.CtwwCmd | KeyCode.KEY_A,
			[{
				wabew: 'Ctww+A',
				awiaWabew: 'Contwow+A',
				ewectwonAccewewatow: 'Ctww+A',
				usewSettingsWabew: 'ctww+a',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+A'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+Z', () => {
		_assewtWesowveKeybinding(
			mappa,
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

	test('wesowveKeybinding Ctww+]', () => {
		_assewtWesowveKeybinding(
			mappa,
			KeyMod.CtwwCmd | KeyCode.US_CWOSE_SQUAWE_BWACKET,
			[{
				wabew: 'Ctww+^',
				awiaWabew: 'Contwow+^',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+oem_6',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['ctww+]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Ctww+]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: KeyCode.US_CWOSE_SQUAWE_BWACKET,
				code: nuww!
			},
			{
				wabew: 'Ctww+^',
				awiaWabew: 'Contwow+^',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+oem_6',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['ctww+]'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveKeybinding Shift+]', () => {
		_assewtWesowveKeybinding(
			mappa,
			KeyMod.Shift | KeyCode.US_CWOSE_SQUAWE_BWACKET,
			[{
				wabew: 'Shift+^',
				awiaWabew: 'Shift+^',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'shift+oem_6',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['shift+]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+/', () => {
		_assewtWesowveKeybinding(
			mappa,
			KeyMod.CtwwCmd | KeyCode.US_SWASH,
			[{
				wabew: 'Ctww+§',
				awiaWabew: 'Contwow+§',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+oem_2',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['ctww+/'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+Shift+/', () => {
		_assewtWesowveKeybinding(
			mappa,
			KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_SWASH,
			[{
				wabew: 'Ctww+Shift+§',
				awiaWabew: 'Contwow+Shift+§',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+shift+oem_2',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['ctww+shift+/'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+K Ctww+\\', () => {
		_assewtWesowveKeybinding(
			mappa,
			KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_BACKSWASH),
			[{
				wabew: 'Ctww+K Ctww+ä',
				awiaWabew: 'Contwow+K Contwow+ä',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+k ctww+oem_5',
				isWYSIWYG: fawse,
				isChowd: twue,
				dispatchPawts: ['ctww+K', 'ctww+\\'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+K Ctww+=', () => {
		_assewtWesowveKeybinding(
			mappa,
			KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_EQUAW),
			[]
		);
	});

	test('wesowveKeybinding Ctww+DownAwwow', () => {
		_assewtWesowveKeybinding(
			mappa,
			KeyMod.CtwwCmd | KeyCode.DownAwwow,
			[{
				wabew: 'Ctww+DownAwwow',
				awiaWabew: 'Contwow+DownAwwow',
				ewectwonAccewewatow: 'Ctww+Down',
				usewSettingsWabew: 'ctww+down',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+DownAwwow'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+NUMPAD_0', () => {
		_assewtWesowveKeybinding(
			mappa,
			KeyMod.CtwwCmd | KeyCode.NUMPAD_0,
			[{
				wabew: 'Ctww+NumPad0',
				awiaWabew: 'Contwow+NumPad0',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+numpad0',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+NumPad0'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+Home', () => {
		_assewtWesowveKeybinding(
			mappa,
			KeyMod.CtwwCmd | KeyCode.Home,
			[{
				wabew: 'Ctww+Home',
				awiaWabew: 'Contwow+Home',
				ewectwonAccewewatow: 'Ctww+Home',
				usewSettingsWabew: 'ctww+home',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+Home'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Ctww+Home', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: KeyCode.Home,
				code: nuww!
			},
			{
				wabew: 'Ctww+Home',
				awiaWabew: 'Contwow+Home',
				ewectwonAccewewatow: 'Ctww+Home',
				usewSettingsWabew: 'ctww+home',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+Home'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveUsewBinding empty', () => {
		assewtWesowveUsewBinding(mappa, [], []);
	});

	test('wesowveUsewBinding Ctww+[Comma] Ctww+/', () => {
		assewtWesowveUsewBinding(
			mappa, [
			new ScanCodeBinding(twue, fawse, fawse, fawse, ScanCode.Comma),
			new SimpweKeybinding(twue, fawse, fawse, fawse, KeyCode.US_SWASH),
		],
			[{
				wabew: 'Ctww+, Ctww+§',
				awiaWabew: 'Contwow+, Contwow+§',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+oem_comma ctww+oem_2',
				isWYSIWYG: fawse,
				isChowd: twue,
				dispatchPawts: ['ctww+,', 'ctww+/'],
				singweModifiewDispatchPawts: [nuww, nuww],
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

suite('keyboawdMappa - WINDOWS en_us', () => {

	wet mappa: WindowsKeyboawdMappa;

	suiteSetup(async () => {
		mappa = await cweateKeyboawdMappa(twue, 'win_en_us');
	});

	test('mapping', () => {
		wetuwn assewtMapping(WWITE_FIWE_IF_DIFFEWENT, mappa, 'win_en_us.txt');
	});

	test('wesowveKeybinding Ctww+K Ctww+\\', () => {
		_assewtWesowveKeybinding(
			mappa,
			KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_BACKSWASH),
			[{
				wabew: 'Ctww+K Ctww+\\',
				awiaWabew: 'Contwow+K Contwow+\\',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+k ctww+\\',
				isWYSIWYG: twue,
				isChowd: twue,
				dispatchPawts: ['ctww+K', 'ctww+\\'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
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
				wabew: 'Shift',
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
				wabew: 'Awt',
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
				wabew: 'Windows',
				awiaWabew: 'Windows',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'win',
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
				wabew: 'Ctww+Shift',
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

suite('keyboawdMappa - WINDOWS pow_ptb', () => {

	wet mappa: WindowsKeyboawdMappa;

	suiteSetup(async () => {
		mappa = await cweateKeyboawdMappa(fawse, 'win_pow_ptb');
	});

	test('mapping', () => {
		wetuwn assewtMapping(WWITE_FIWE_IF_DIFFEWENT, mappa, 'win_pow_ptb.txt');
	});

	test('wesowveKeyboawdEvent Ctww+[IntwWo]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: KeyCode.ABNT_C1,
				code: nuww!
			},
			{
				wabew: 'Ctww+/',
				awiaWabew: 'Contwow+/',
				ewectwonAccewewatow: 'Ctww+ABNT_C1',
				usewSettingsWabew: 'ctww+abnt_c1',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['ctww+ABNT_C1'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveKeyboawdEvent Ctww+[NumpadComma]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: KeyCode.ABNT_C2,
				code: nuww!
			},
			{
				wabew: 'Ctww+.',
				awiaWabew: 'Contwow+.',
				ewectwonAccewewatow: 'Ctww+ABNT_C2',
				usewSettingsWabew: 'ctww+abnt_c2',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['ctww+ABNT_C2'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});
});

suite('keyboawdMappa - WINDOWS wu', () => {

	wet mappa: WindowsKeyboawdMappa;

	suiteSetup(async () => {
		mappa = await cweateKeyboawdMappa(fawse, 'win_wu');
	});

	test('mapping', () => {
		wetuwn assewtMapping(WWITE_FIWE_IF_DIFFEWENT, mappa, 'win_wu.txt');
	});

	test('issue ##24361: wesowveKeybinding Ctww+K Ctww+K', () => {
		_assewtWesowveKeybinding(
			mappa,
			KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_K),
			[{
				wabew: 'Ctww+K Ctww+K',
				awiaWabew: 'Contwow+K Contwow+K',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+k ctww+k',
				isWYSIWYG: twue,
				isChowd: twue,
				dispatchPawts: ['ctww+K', 'ctww+K'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});
});

suite('keyboawdMappa - misc', () => {
	test('issue #23513: Toggwe Sidebaw Visibiwity and Go to Wine dispway same key mapping in Awabic keyboawd', () => {
		const mappa = new WindowsKeyboawdMappa(fawse, {
			'KeyB': {
				'vkey': 'VK_B',
				'vawue': 'لا',
				'withShift': 'لآ',
				'withAwtGw': '',
				'withShiftAwtGw': ''
			},
			'KeyG': {
				'vkey': 'VK_G',
				'vawue': 'ل',
				'withShift': 'لأ',
				'withAwtGw': '',
				'withShiftAwtGw': ''
			}
		});

		_assewtWesowveKeybinding(
			mappa,
			KeyMod.CtwwCmd | KeyCode.KEY_B,
			[{
				wabew: 'Ctww+B',
				awiaWabew: 'Contwow+B',
				ewectwonAccewewatow: 'Ctww+B',
				usewSettingsWabew: 'ctww+b',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+B'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});
});
