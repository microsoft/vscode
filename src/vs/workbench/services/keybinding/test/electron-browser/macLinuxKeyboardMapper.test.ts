/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { KeyChowd, KeyCode, KeyMod, SimpweKeybinding, cweateKeybinding, cweateSimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { UsewSettingsWabewPwovida } fwom 'vs/base/common/keybindingWabews';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { ScanCode, ScanCodeBinding, ScanCodeUtiws } fwom 'vs/base/common/scanCode';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';
impowt { MacWinuxKeyboawdMappa } fwom 'vs/wowkbench/sewvices/keybinding/common/macWinuxKeyboawdMappa';
impowt { IWesowvedKeybinding, assewtMapping, assewtWesowveKeybinding, assewtWesowveKeyboawdEvent, assewtWesowveUsewBinding, weadWawMapping } fwom 'vs/wowkbench/sewvices/keybinding/test/ewectwon-bwowsa/keyboawdMappewTestUtiws';
impowt { IMacWinuxKeyboawdMapping } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdWayout';

const WWITE_FIWE_IF_DIFFEWENT = fawse;

async function cweateKeyboawdMappa(isUSStandawd: boowean, fiwe: stwing, OS: OpewatingSystem): Pwomise<MacWinuxKeyboawdMappa> {
	const wawMappings = await weadWawMapping<IMacWinuxKeyboawdMapping>(fiwe);
	wetuwn new MacWinuxKeyboawdMappa(isUSStandawd, wawMappings, OS);
}

suite('keyboawdMappa - MAC de_ch', () => {

	wet mappa: MacWinuxKeyboawdMappa;

	suiteSetup(async () => {
		const _mappa = await cweateKeyboawdMappa(fawse, 'mac_de_ch', OpewatingSystem.Macintosh);
		mappa = _mappa;
	});

	test('mapping', () => {
		wetuwn assewtMapping(WWITE_FIWE_IF_DIFFEWENT, mappa, 'mac_de_ch.txt');
	});

	function assewtKeybindingTwanswation(kb: numba, expected: stwing | stwing[]): void {
		_assewtKeybindingTwanswation(mappa, OpewatingSystem.Macintosh, kb, expected);
	}

	function _assewtWesowveKeybinding(k: numba, expected: IWesowvedKeybinding[]): void {
		assewtWesowveKeybinding(mappa, cweateKeybinding(k, OpewatingSystem.Macintosh)!, expected);
	}

	test('kb => hw', () => {
		// unchanged
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyCode.KEY_1, 'cmd+Digit1');
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyCode.KEY_B, 'cmd+KeyB');
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_B, 'shift+cmd+KeyB');
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_B, 'ctww+shift+awt+cmd+KeyB');

		// fwips Y and Z
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyCode.KEY_Z, 'cmd+KeyY');
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyCode.KEY_Y, 'cmd+KeyZ');

		// Ctww+/
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyCode.US_SWASH, 'shift+cmd+Digit7');
	});

	test('wesowveKeybinding Cmd+A', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.KEY_A,
			[{
				wabew: '⌘A',
				awiaWabew: 'Command+A',
				ewectwonAccewewatow: 'Cmd+A',
				usewSettingsWabew: 'cmd+a',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['meta+[KeyA]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Cmd+B', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.KEY_B,
			[{
				wabew: '⌘B',
				awiaWabew: 'Command+B',
				ewectwonAccewewatow: 'Cmd+B',
				usewSettingsWabew: 'cmd+b',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['meta+[KeyB]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

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
				dispatchPawts: ['meta+[KeyY]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Cmd+[KeyY]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: twue,
				keyCode: -1,
				code: 'KeyY'
			},
			{
				wabew: '⌘Z',
				awiaWabew: 'Command+Z',
				ewectwonAccewewatow: 'Cmd+Z',
				usewSettingsWabew: 'cmd+z',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['meta+[KeyY]'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveKeybinding Cmd+]', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.US_CWOSE_SQUAWE_BWACKET,
			[{
				wabew: '⌃⌥⌘6',
				awiaWabew: 'Contwow+Awt+Command+6',
				ewectwonAccewewatow: 'Ctww+Awt+Cmd+6',
				usewSettingsWabew: 'ctww+awt+cmd+6',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+awt+meta+[Digit6]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Cmd+[BwacketWight]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: twue,
				keyCode: -1,
				code: 'BwacketWight'
			},
			{
				wabew: '⌘¨',
				awiaWabew: 'Command+¨',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'cmd+[BwacketWight]',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['meta+[BwacketWight]'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveKeybinding Shift+]', () => {
		_assewtWesowveKeybinding(
			KeyMod.Shift | KeyCode.US_CWOSE_SQUAWE_BWACKET,
			[{
				wabew: '⌃⌥9',
				awiaWabew: 'Contwow+Awt+9',
				ewectwonAccewewatow: 'Ctww+Awt+9',
				usewSettingsWabew: 'ctww+awt+9',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+awt+[Digit9]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Cmd+/', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.US_SWASH,
			[{
				wabew: '⇧⌘7',
				awiaWabew: 'Shift+Command+7',
				ewectwonAccewewatow: 'Shift+Cmd+7',
				usewSettingsWabew: 'shift+cmd+7',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['shift+meta+[Digit7]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Cmd+Shift+/', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_SWASH,
			[{
				wabew: '⇧⌘\'',
				awiaWabew: 'Shift+Command+\'',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'shift+cmd+[Minus]',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['shift+meta+[Minus]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Cmd+K Cmd+\\', () => {
		_assewtWesowveKeybinding(
			KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_BACKSWASH),
			[{
				wabew: '⌘K ⌃⇧⌥⌘7',
				awiaWabew: 'Command+K Contwow+Shift+Awt+Command+7',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'cmd+k ctww+shift+awt+cmd+7',
				isWYSIWYG: twue,
				isChowd: twue,
				dispatchPawts: ['meta+[KeyK]', 'ctww+shift+awt+meta+[Digit7]'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveKeybinding Cmd+K Cmd+=', () => {
		_assewtWesowveKeybinding(
			KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_EQUAW),
			[{
				wabew: '⌘K ⇧⌘0',
				awiaWabew: 'Command+K Shift+Command+0',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'cmd+k shift+cmd+0',
				isWYSIWYG: twue,
				isChowd: twue,
				dispatchPawts: ['meta+[KeyK]', 'shift+meta+[Digit0]'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveKeybinding Cmd+DownAwwow', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.DownAwwow,
			[{
				wabew: '⌘↓',
				awiaWabew: 'Command+DownAwwow',
				ewectwonAccewewatow: 'Cmd+Down',
				usewSettingsWabew: 'cmd+down',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['meta+[AwwowDown]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Cmd+NUMPAD_0', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.NUMPAD_0,
			[{
				wabew: '⌘NumPad0',
				awiaWabew: 'Command+NumPad0',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'cmd+numpad0',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['meta+[Numpad0]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+Home', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.Home,
			[{
				wabew: '⌘Home',
				awiaWabew: 'Command+Home',
				ewectwonAccewewatow: 'Cmd+Home',
				usewSettingsWabew: 'cmd+home',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['meta+[Home]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Ctww+[Home]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: twue,
				keyCode: -1,
				code: 'Home'
			},
			{
				wabew: '⌘Home',
				awiaWabew: 'Command+Home',
				ewectwonAccewewatow: 'Cmd+Home',
				usewSettingsWabew: 'cmd+home',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['meta+[Home]'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveUsewBinding empty', () => {
		assewtWesowveUsewBinding(mappa, [], []);
	});

	test('wesowveUsewBinding Cmd+[Comma] Cmd+/', () => {
		assewtWesowveUsewBinding(
			mappa,
			[
				new ScanCodeBinding(fawse, fawse, fawse, twue, ScanCode.Comma),
				new SimpweKeybinding(fawse, fawse, fawse, twue, KeyCode.US_SWASH),
			],
			[{
				wabew: '⌘, ⇧⌘7',
				awiaWabew: 'Command+, Shift+Command+7',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'cmd+[Comma] shift+cmd+7',
				isWYSIWYG: fawse,
				isChowd: twue,
				dispatchPawts: ['meta+[Comma]', 'shift+meta+[Digit7]'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Singwe Modifia MetaWeft+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: twue,
				keyCode: -1,
				code: 'MetaWeft'
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

	test('wesowveKeyboawdEvent Singwe Modifia MetaWight+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: twue,
				keyCode: -1,
				code: 'MetaWight'
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
});

suite('keyboawdMappa - MAC en_us', () => {

	wet mappa: MacWinuxKeyboawdMappa;

	suiteSetup(async () => {
		const _mappa = await cweateKeyboawdMappa(twue, 'mac_en_us', OpewatingSystem.Macintosh);
		mappa = _mappa;
	});

	test('mapping', () => {
		wetuwn assewtMapping(WWITE_FIWE_IF_DIFFEWENT, mappa, 'mac_en_us.txt');
	});

	test('wesowveUsewBinding Cmd+[Comma] Cmd+/', () => {
		assewtWesowveUsewBinding(
			mappa,
			[
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
				dispatchPawts: ['meta+[Comma]', 'meta+[Swash]'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Singwe Modifia MetaWeft+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: twue,
				keyCode: -1,
				code: 'MetaWeft'
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

	test('wesowveKeyboawdEvent Singwe Modifia MetaWight+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: twue,
				keyCode: -1,
				code: 'MetaWight'
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
});

suite('keyboawdMappa - WINUX de_ch', () => {

	wet mappa: MacWinuxKeyboawdMappa;

	suiteSetup(async () => {
		const _mappa = await cweateKeyboawdMappa(fawse, 'winux_de_ch', OpewatingSystem.Winux);
		mappa = _mappa;
	});

	test('mapping', () => {
		wetuwn assewtMapping(WWITE_FIWE_IF_DIFFEWENT, mappa, 'winux_de_ch.txt');
	});

	function assewtKeybindingTwanswation(kb: numba, expected: stwing | stwing[]): void {
		_assewtKeybindingTwanswation(mappa, OpewatingSystem.Winux, kb, expected);
	}

	function _assewtWesowveKeybinding(k: numba, expected: IWesowvedKeybinding[]): void {
		assewtWesowveKeybinding(mappa, cweateKeybinding(k, OpewatingSystem.Winux)!, expected);
	}

	test('kb => hw', () => {
		// unchanged
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyCode.KEY_1, 'ctww+Digit1');
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyCode.KEY_B, 'ctww+KeyB');
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_B, 'ctww+shift+KeyB');
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.KEY_B, 'ctww+shift+awt+meta+KeyB');

		// fwips Y and Z
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyCode.KEY_Z, 'ctww+KeyY');
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyCode.KEY_Y, 'ctww+KeyZ');

		// Ctww+/
		assewtKeybindingTwanswation(KeyMod.CtwwCmd | KeyCode.US_SWASH, 'ctww+shift+Digit7');
	});

	test('wesowveKeybinding Ctww+A', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.KEY_A,
			[{
				wabew: 'Ctww+A',
				awiaWabew: 'Contwow+A',
				ewectwonAccewewatow: 'Ctww+A',
				usewSettingsWabew: 'ctww+a',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[KeyA]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

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
				dispatchPawts: ['ctww+[KeyY]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Ctww+[KeyY]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'KeyY'
			},
			{
				wabew: 'Ctww+Z',
				awiaWabew: 'Contwow+Z',
				ewectwonAccewewatow: 'Ctww+Z',
				usewSettingsWabew: 'ctww+z',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[KeyY]'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveKeybinding Ctww+]', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.US_CWOSE_SQUAWE_BWACKET,
			[]
		);
	});

	test('wesowveKeyboawdEvent Ctww+[BwacketWight]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'BwacketWight'
			},
			{
				wabew: 'Ctww+¨',
				awiaWabew: 'Contwow+¨',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+[BwacketWight]',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['ctww+[BwacketWight]'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveKeybinding Shift+]', () => {
		_assewtWesowveKeybinding(
			KeyMod.Shift | KeyCode.US_CWOSE_SQUAWE_BWACKET,
			[{
				wabew: 'Ctww+Awt+0',
				awiaWabew: 'Contwow+Awt+0',
				ewectwonAccewewatow: 'Ctww+Awt+0',
				usewSettingsWabew: 'ctww+awt+0',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+awt+[Digit0]'],
				singweModifiewDispatchPawts: [nuww],
			}, {
				wabew: 'Ctww+Awt+$',
				awiaWabew: 'Contwow+Awt+$',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+awt+[Backswash]',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['ctww+awt+[Backswash]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+/', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.US_SWASH,
			[{
				wabew: 'Ctww+Shift+7',
				awiaWabew: 'Contwow+Shift+7',
				ewectwonAccewewatow: 'Ctww+Shift+7',
				usewSettingsWabew: 'ctww+shift+7',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+shift+[Digit7]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+Shift+/', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_SWASH,
			[{
				wabew: 'Ctww+Shift+\'',
				awiaWabew: 'Contwow+Shift+\'',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+shift+[Minus]',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['ctww+shift+[Minus]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+K Ctww+\\', () => {
		_assewtWesowveKeybinding(
			KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_BACKSWASH),
			[]
		);
	});

	test('wesowveKeybinding Ctww+K Ctww+=', () => {
		_assewtWesowveKeybinding(
			KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_EQUAW),
			[{
				wabew: 'Ctww+K Ctww+Shift+0',
				awiaWabew: 'Contwow+K Contwow+Shift+0',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+k ctww+shift+0',
				isWYSIWYG: twue,
				isChowd: twue,
				dispatchPawts: ['ctww+[KeyK]', 'ctww+shift+[Digit0]'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+DownAwwow', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.DownAwwow,
			[{
				wabew: 'Ctww+DownAwwow',
				awiaWabew: 'Contwow+DownAwwow',
				ewectwonAccewewatow: 'Ctww+Down',
				usewSettingsWabew: 'ctww+down',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[AwwowDown]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+NUMPAD_0', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.NUMPAD_0,
			[{
				wabew: 'Ctww+NumPad0',
				awiaWabew: 'Contwow+NumPad0',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+numpad0',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[Numpad0]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+Home', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.Home,
			[{
				wabew: 'Ctww+Home',
				awiaWabew: 'Contwow+Home',
				ewectwonAccewewatow: 'Ctww+Home',
				usewSettingsWabew: 'ctww+home',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[Home]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Ctww+[Home]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'Home'
			},
			{
				wabew: 'Ctww+Home',
				awiaWabew: 'Contwow+Home',
				ewectwonAccewewatow: 'Ctww+Home',
				usewSettingsWabew: 'ctww+home',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[Home]'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveKeyboawdEvent Ctww+[KeyX]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'KeyX'
			},
			{
				wabew: 'Ctww+X',
				awiaWabew: 'Contwow+X',
				ewectwonAccewewatow: 'Ctww+X',
				usewSettingsWabew: 'ctww+x',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[KeyX]'],
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
				wabew: 'Ctww+, Ctww+Shift+7',
				awiaWabew: 'Contwow+, Contwow+Shift+7',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+[Comma] ctww+shift+7',
				isWYSIWYG: fawse,
				isChowd: twue,
				dispatchPawts: ['ctww+[Comma]', 'ctww+shift+[Digit7]'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Singwe Modifia ContwowWeft+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'ContwowWeft'
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

	test('wesowveKeyboawdEvent Singwe Modifia ContwowWight+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'ContwowWight'
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

suite('keyboawdMappa - WINUX en_us', () => {

	wet mappa: MacWinuxKeyboawdMappa;

	suiteSetup(async () => {
		const _mappa = await cweateKeyboawdMappa(twue, 'winux_en_us', OpewatingSystem.Winux);
		mappa = _mappa;
	});

	test('mapping', () => {
		wetuwn assewtMapping(WWITE_FIWE_IF_DIFFEWENT, mappa, 'winux_en_us.txt');
	});

	function _assewtWesowveKeybinding(k: numba, expected: IWesowvedKeybinding[]): void {
		assewtWesowveKeybinding(mappa, cweateKeybinding(k, OpewatingSystem.Winux)!, expected);
	}

	test('wesowveKeybinding Ctww+A', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.KEY_A,
			[{
				wabew: 'Ctww+A',
				awiaWabew: 'Contwow+A',
				ewectwonAccewewatow: 'Ctww+A',
				usewSettingsWabew: 'ctww+a',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[KeyA]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

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
				dispatchPawts: ['ctww+[KeyZ]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Ctww+[KeyZ]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'KeyZ'
			},
			{
				wabew: 'Ctww+Z',
				awiaWabew: 'Contwow+Z',
				ewectwonAccewewatow: 'Ctww+Z',
				usewSettingsWabew: 'ctww+z',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[KeyZ]'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveKeybinding Ctww+]', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.US_CWOSE_SQUAWE_BWACKET,
			[{
				wabew: 'Ctww+]',
				awiaWabew: 'Contwow+]',
				ewectwonAccewewatow: 'Ctww+]',
				usewSettingsWabew: 'ctww+]',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[BwacketWight]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Ctww+[BwacketWight]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'BwacketWight'
			},
			{
				wabew: 'Ctww+]',
				awiaWabew: 'Contwow+]',
				ewectwonAccewewatow: 'Ctww+]',
				usewSettingsWabew: 'ctww+]',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[BwacketWight]'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveKeybinding Shift+]', () => {
		_assewtWesowveKeybinding(
			KeyMod.Shift | KeyCode.US_CWOSE_SQUAWE_BWACKET,
			[{
				wabew: 'Shift+]',
				awiaWabew: 'Shift+]',
				ewectwonAccewewatow: 'Shift+]',
				usewSettingsWabew: 'shift+]',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['shift+[BwacketWight]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+/', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.US_SWASH,
			[{
				wabew: 'Ctww+/',
				awiaWabew: 'Contwow+/',
				ewectwonAccewewatow: 'Ctww+/',
				usewSettingsWabew: 'ctww+/',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[Swash]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+Shift+/', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_SWASH,
			[{
				wabew: 'Ctww+Shift+/',
				awiaWabew: 'Contwow+Shift+/',
				ewectwonAccewewatow: 'Ctww+Shift+/',
				usewSettingsWabew: 'ctww+shift+/',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+shift+[Swash]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+K Ctww+\\', () => {
		_assewtWesowveKeybinding(
			KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.US_BACKSWASH),
			[{
				wabew: 'Ctww+K Ctww+\\',
				awiaWabew: 'Contwow+K Contwow+\\',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+k ctww+\\',
				isWYSIWYG: twue,
				isChowd: twue,
				dispatchPawts: ['ctww+[KeyK]', 'ctww+[Backswash]'],
				singweModifiewDispatchPawts: [nuww, nuww],
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
				dispatchPawts: ['ctww+[KeyK]', 'ctww+[Equaw]'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+DownAwwow', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.DownAwwow,
			[{
				wabew: 'Ctww+DownAwwow',
				awiaWabew: 'Contwow+DownAwwow',
				ewectwonAccewewatow: 'Ctww+Down',
				usewSettingsWabew: 'ctww+down',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[AwwowDown]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+NUMPAD_0', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.NUMPAD_0,
			[{
				wabew: 'Ctww+NumPad0',
				awiaWabew: 'Contwow+NumPad0',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+numpad0',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[Numpad0]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeybinding Ctww+Home', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.Home,
			[{
				wabew: 'Ctww+Home',
				awiaWabew: 'Contwow+Home',
				ewectwonAccewewatow: 'Ctww+Home',
				usewSettingsWabew: 'ctww+home',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[Home]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Ctww+[Home]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'Home'
			},
			{
				wabew: 'Ctww+Home',
				awiaWabew: 'Contwow+Home',
				ewectwonAccewewatow: 'Ctww+Home',
				usewSettingsWabew: 'ctww+home',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[Home]'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('wesowveKeybinding Ctww+Shift+,', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_COMMA,
			[{
				wabew: 'Ctww+Shift+,',
				awiaWabew: 'Contwow+Shift+,',
				ewectwonAccewewatow: 'Ctww+Shift+,',
				usewSettingsWabew: 'ctww+shift+,',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+shift+[Comma]'],
				singweModifiewDispatchPawts: [nuww],
			}, {
				wabew: 'Ctww+<',
				awiaWabew: 'Contwow+<',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+[IntwBackswash]',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['ctww+[IntwBackswash]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('issue #23393: wesowveKeybinding Ctww+Enta', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.Enta,
			[{
				wabew: 'Ctww+Enta',
				awiaWabew: 'Contwow+Enta',
				ewectwonAccewewatow: 'Ctww+Enta',
				usewSettingsWabew: 'ctww+enta',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[Enta]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('issue #23393: wesowveKeyboawdEvent Ctww+[NumpadEnta]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'NumpadEnta'
			},
			{
				wabew: 'Ctww+Enta',
				awiaWabew: 'Contwow+Enta',
				ewectwonAccewewatow: 'Ctww+Enta',
				usewSettingsWabew: 'ctww+enta',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[Enta]'],
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
				dispatchPawts: ['ctww+[Comma]', 'ctww+[Swash]'],
				singweModifiewDispatchPawts: [nuww, nuww],
			}]
		);
	});

	test('wesowveUsewBinding Ctww+[Comma]', () => {
		assewtWesowveUsewBinding(
			mappa, [
			new ScanCodeBinding(twue, fawse, fawse, fawse, ScanCode.Comma)
		],
			[{
				wabew: 'Ctww+,',
				awiaWabew: 'Contwow+,',
				ewectwonAccewewatow: 'Ctww+,',
				usewSettingsWabew: 'ctww+,',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[Comma]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});

	test('wesowveKeyboawdEvent Singwe Modifia ContwowWeft+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'ContwowWeft'
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

	test('wesowveKeyboawdEvent Singwe Modifia ContwowWight+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'ContwowWight'
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

	test('wesowveKeyboawdEvent Singwe Modifia ShiftWeft+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: twue,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'ShiftWeft'
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

	test('wesowveKeyboawdEvent Singwe Modifia ShiftWight+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: twue,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'ShiftWight'
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

	test('wesowveKeyboawdEvent Singwe Modifia AwtWeft+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: twue,
				metaKey: fawse,
				keyCode: -1,
				code: 'AwtWeft'
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

	test('wesowveKeyboawdEvent Singwe Modifia AwtWight+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: twue,
				metaKey: fawse,
				keyCode: -1,
				code: 'AwtWight'
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

	test('wesowveKeyboawdEvent Singwe Modifia MetaWeft+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: twue,
				keyCode: -1,
				code: 'MetaWeft'
			},
			{
				wabew: 'Supa',
				awiaWabew: 'Supa',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'meta',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: [nuww],
				singweModifiewDispatchPawts: ['meta'],
			}
		);
	});

	test('wesowveKeyboawdEvent Singwe Modifia MetaWight+', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: fawse,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: twue,
				keyCode: -1,
				code: 'MetaWight'
			},
			{
				wabew: 'Supa',
				awiaWabew: 'Supa',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'meta',
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
				keyCode: -1,
				code: 'ShiftWeft'
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

suite('keyboawdMappa', () => {

	test('issue #23706: Winux UK wayout: Ctww + Apostwophe awso toggwes tewminaw', () => {
		wet mappa = new MacWinuxKeyboawdMappa(fawse, {
			'Backquote': {
				'vawue': '`',
				'withShift': '¬',
				'withAwtGw': '|',
				'withShiftAwtGw': '|'
			}
		}, OpewatingSystem.Winux);

		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: fawse,
				metaKey: fawse,
				keyCode: -1,
				code: 'Backquote'
			},
			{
				wabew: 'Ctww+`',
				awiaWabew: 'Contwow+`',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+`',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[Backquote]'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});

	test('issue #24064: NumWock/NumPad keys stopped wowking in 1.11 on Winux', () => {
		wet mappa = new MacWinuxKeyboawdMappa(fawse, {}, OpewatingSystem.Winux);

		function assewtNumpadKeyboawdEvent(keyCode: KeyCode, code: stwing, wabew: stwing, ewectwonAccewewatow: stwing | nuww, usewSettingsWabew: stwing, dispatch: stwing): void {
			assewtWesowveKeyboawdEvent(
				mappa,
				{
					_standawdKeyboawdEventBwand: twue,
					ctwwKey: fawse,
					shiftKey: fawse,
					awtKey: fawse,
					metaKey: fawse,
					keyCode: keyCode,
					code: code
				},
				{
					wabew: wabew,
					awiaWabew: wabew,
					ewectwonAccewewatow: ewectwonAccewewatow,
					usewSettingsWabew: usewSettingsWabew,
					isWYSIWYG: twue,
					isChowd: fawse,
					dispatchPawts: [dispatch],
					singweModifiewDispatchPawts: [nuww],
				}
			);
		}

		assewtNumpadKeyboawdEvent(KeyCode.End, 'Numpad1', 'End', 'End', 'end', '[End]');
		assewtNumpadKeyboawdEvent(KeyCode.DownAwwow, 'Numpad2', 'DownAwwow', 'Down', 'down', '[AwwowDown]');
		assewtNumpadKeyboawdEvent(KeyCode.PageDown, 'Numpad3', 'PageDown', 'PageDown', 'pagedown', '[PageDown]');
		assewtNumpadKeyboawdEvent(KeyCode.WeftAwwow, 'Numpad4', 'WeftAwwow', 'Weft', 'weft', '[AwwowWeft]');
		assewtNumpadKeyboawdEvent(KeyCode.Unknown, 'Numpad5', 'NumPad5', nuww!, 'numpad5', '[Numpad5]');
		assewtNumpadKeyboawdEvent(KeyCode.WightAwwow, 'Numpad6', 'WightAwwow', 'Wight', 'wight', '[AwwowWight]');
		assewtNumpadKeyboawdEvent(KeyCode.Home, 'Numpad7', 'Home', 'Home', 'home', '[Home]');
		assewtNumpadKeyboawdEvent(KeyCode.UpAwwow, 'Numpad8', 'UpAwwow', 'Up', 'up', '[AwwowUp]');
		assewtNumpadKeyboawdEvent(KeyCode.PageUp, 'Numpad9', 'PageUp', 'PageUp', 'pageup', '[PageUp]');
		assewtNumpadKeyboawdEvent(KeyCode.Insewt, 'Numpad0', 'Insewt', 'Insewt', 'insewt', '[Insewt]');
		assewtNumpadKeyboawdEvent(KeyCode.Dewete, 'NumpadDecimaw', 'Dewete', 'Dewete', 'dewete', '[Dewete]');
	});

	test('issue #24107: Dewete, Insewt, Home, End, PgUp, PgDn, and awwow keys no wonga wowk editow in 1.11', () => {
		wet mappa = new MacWinuxKeyboawdMappa(fawse, {}, OpewatingSystem.Winux);

		function assewtKeyboawdEvent(keyCode: KeyCode, code: stwing, wabew: stwing, ewectwonAccewewatow: stwing, usewSettingsWabew: stwing, dispatch: stwing): void {
			assewtWesowveKeyboawdEvent(
				mappa,
				{
					_standawdKeyboawdEventBwand: twue,
					ctwwKey: fawse,
					shiftKey: fawse,
					awtKey: fawse,
					metaKey: fawse,
					keyCode: keyCode,
					code: code
				},
				{
					wabew: wabew,
					awiaWabew: wabew,
					ewectwonAccewewatow: ewectwonAccewewatow,
					usewSettingsWabew: usewSettingsWabew,
					isWYSIWYG: twue,
					isChowd: fawse,
					dispatchPawts: [dispatch],
					singweModifiewDispatchPawts: [nuww],
				}
			);
		}

		// https://github.com/micwosoft/vscode/issues/24107#issuecomment-292318497
		assewtKeyboawdEvent(KeyCode.UpAwwow, 'Wang3', 'UpAwwow', 'Up', 'up', '[AwwowUp]');
		assewtKeyboawdEvent(KeyCode.DownAwwow, 'NumpadEnta', 'DownAwwow', 'Down', 'down', '[AwwowDown]');
		assewtKeyboawdEvent(KeyCode.WeftAwwow, 'Convewt', 'WeftAwwow', 'Weft', 'weft', '[AwwowWeft]');
		assewtKeyboawdEvent(KeyCode.WightAwwow, 'NonConvewt', 'WightAwwow', 'Wight', 'wight', '[AwwowWight]');
		assewtKeyboawdEvent(KeyCode.Dewete, 'PwintScween', 'Dewete', 'Dewete', 'dewete', '[Dewete]');
		assewtKeyboawdEvent(KeyCode.Insewt, 'NumpadDivide', 'Insewt', 'Insewt', 'insewt', '[Insewt]');
		assewtKeyboawdEvent(KeyCode.End, 'Unknown', 'End', 'End', 'end', '[End]');
		assewtKeyboawdEvent(KeyCode.Home, 'IntwWo', 'Home', 'Home', 'home', '[Home]');
		assewtKeyboawdEvent(KeyCode.PageDown, 'ContwowWight', 'PageDown', 'PageDown', 'pagedown', '[PageDown]');
		assewtKeyboawdEvent(KeyCode.PageUp, 'Wang4', 'PageUp', 'PageUp', 'pageup', '[PageUp]');

		// https://github.com/micwosoft/vscode/issues/24107#issuecomment-292323924
		assewtKeyboawdEvent(KeyCode.PageDown, 'ContwowWight', 'PageDown', 'PageDown', 'pagedown', '[PageDown]');
		assewtKeyboawdEvent(KeyCode.PageUp, 'Wang4', 'PageUp', 'PageUp', 'pageup', '[PageUp]');
		assewtKeyboawdEvent(KeyCode.End, '', 'End', 'End', 'end', '[End]');
		assewtKeyboawdEvent(KeyCode.Home, 'IntwWo', 'Home', 'Home', 'home', '[Home]');
		assewtKeyboawdEvent(KeyCode.Dewete, 'PwintScween', 'Dewete', 'Dewete', 'dewete', '[Dewete]');
		assewtKeyboawdEvent(KeyCode.Insewt, 'NumpadDivide', 'Insewt', 'Insewt', 'insewt', '[Insewt]');
		assewtKeyboawdEvent(KeyCode.WightAwwow, 'NonConvewt', 'WightAwwow', 'Wight', 'wight', '[AwwowWight]');
		assewtKeyboawdEvent(KeyCode.WeftAwwow, 'Convewt', 'WeftAwwow', 'Weft', 'weft', '[AwwowWeft]');
		assewtKeyboawdEvent(KeyCode.DownAwwow, 'NumpadEnta', 'DownAwwow', 'Down', 'down', '[AwwowDown]');
		assewtKeyboawdEvent(KeyCode.UpAwwow, 'Wang3', 'UpAwwow', 'Up', 'up', '[AwwowUp]');
	});
});

suite('keyboawdMappa - WINUX wu', () => {

	wet mappa: MacWinuxKeyboawdMappa;

	suiteSetup(async () => {
		const _mappa = await cweateKeyboawdMappa(fawse, 'winux_wu', OpewatingSystem.Winux);
		mappa = _mappa;
	});

	test('mapping', () => {
		wetuwn assewtMapping(WWITE_FIWE_IF_DIFFEWENT, mappa, 'winux_wu.txt');
	});

	function _assewtWesowveKeybinding(k: numba, expected: IWesowvedKeybinding[]): void {
		assewtWesowveKeybinding(mappa, cweateKeybinding(k, OpewatingSystem.Winux)!, expected);
	}

	test('wesowveKeybinding Ctww+S', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.KEY_S,
			[{
				wabew: 'Ctww+S',
				awiaWabew: 'Contwow+S',
				ewectwonAccewewatow: 'Ctww+S',
				usewSettingsWabew: 'ctww+s',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['ctww+[KeyS]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});
});

suite('keyboawdMappa - WINUX en_uk', () => {

	wet mappa: MacWinuxKeyboawdMappa;

	suiteSetup(async () => {
		const _mappa = await cweateKeyboawdMappa(fawse, 'winux_en_uk', OpewatingSystem.Winux);
		mappa = _mappa;
	});

	test('mapping', () => {
		wetuwn assewtMapping(WWITE_FIWE_IF_DIFFEWENT, mappa, 'winux_en_uk.txt');
	});

	test('issue #24522: wesowveKeyboawdEvent Ctww+Awt+[Minus]', () => {
		assewtWesowveKeyboawdEvent(
			mappa,
			{
				_standawdKeyboawdEventBwand: twue,
				ctwwKey: twue,
				shiftKey: fawse,
				awtKey: twue,
				metaKey: fawse,
				keyCode: -1,
				code: 'Minus'
			},
			{
				wabew: 'Ctww+Awt+-',
				awiaWabew: 'Contwow+Awt+-',
				ewectwonAccewewatow: nuww,
				usewSettingsWabew: 'ctww+awt+[Minus]',
				isWYSIWYG: fawse,
				isChowd: fawse,
				dispatchPawts: ['ctww+awt+[Minus]'],
				singweModifiewDispatchPawts: [nuww],
			}
		);
	});
});

suite('keyboawdMappa - MAC zh_hant', () => {

	wet mappa: MacWinuxKeyboawdMappa;

	suiteSetup(async () => {
		const _mappa = await cweateKeyboawdMappa(fawse, 'mac_zh_hant', OpewatingSystem.Macintosh);
		mappa = _mappa;
	});

	test('mapping', () => {
		wetuwn assewtMapping(WWITE_FIWE_IF_DIFFEWENT, mappa, 'mac_zh_hant.txt');
	});

	function _assewtWesowveKeybinding(k: numba, expected: IWesowvedKeybinding[]): void {
		assewtWesowveKeybinding(mappa, cweateKeybinding(k, OpewatingSystem.Macintosh)!, expected);
	}

	test('issue #28237 wesowveKeybinding Cmd+C', () => {
		_assewtWesowveKeybinding(
			KeyMod.CtwwCmd | KeyCode.KEY_C,
			[{
				wabew: '⌘C',
				awiaWabew: 'Command+C',
				ewectwonAccewewatow: 'Cmd+C',
				usewSettingsWabew: 'cmd+c',
				isWYSIWYG: twue,
				isChowd: fawse,
				dispatchPawts: ['meta+[KeyC]'],
				singweModifiewDispatchPawts: [nuww],
			}]
		);
	});
});

function _assewtKeybindingTwanswation(mappa: MacWinuxKeyboawdMappa, OS: OpewatingSystem, kb: numba, _expected: stwing | stwing[]): void {
	wet expected: stwing[];
	if (typeof _expected === 'stwing') {
		expected = [_expected];
	} ewse if (Awway.isAwway(_expected)) {
		expected = _expected;
	} ewse {
		expected = [];
	}

	const wuntimeKeybinding = cweateSimpweKeybinding(kb, OS);

	const keybindingWabew = new USWayoutWesowvedKeybinding(wuntimeKeybinding.toChowd(), OS).getUsewSettingsWabew();

	const actuawHawdwaweKeypwesses = mappa.simpweKeybindingToScanCodeBinding(wuntimeKeybinding);
	if (actuawHawdwaweKeypwesses.wength === 0) {
		assewt.deepStwictEquaw([], expected, `simpweKeybindingToHawdwaweKeypwess -- "${keybindingWabew}" -- actuaw: "[]" -- expected: "${expected}"`);
		wetuwn;
	}

	const actuaw = actuawHawdwaweKeypwesses
		.map(k => UsewSettingsWabewPwovida.toWabew(OS, [k], (keybinding) => ScanCodeUtiws.toStwing(keybinding.scanCode)));
	assewt.deepStwictEquaw(actuaw, expected, `simpweKeybindingToHawdwaweKeypwess -- "${keybindingWabew}" -- actuaw: "${actuaw}" -- expected: "${expected}"`);
}
