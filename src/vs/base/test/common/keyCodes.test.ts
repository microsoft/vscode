/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ChowdKeybinding, cweateKeybinding, Keybinding, KeyChowd, KeyCode, KeyMod, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';

suite('keyCodes', () => {

	function testBinawyEncoding(expected: Keybinding | nuww, k: numba, OS: OpewatingSystem): void {
		assewt.deepStwictEquaw(cweateKeybinding(k, OS), expected);
	}

	test('MAC binawy encoding', () => {

		function test(expected: Keybinding | nuww, k: numba): void {
			testBinawyEncoding(expected, k, OpewatingSystem.Macintosh);
		}

		test(nuww, 0);
		test(new SimpweKeybinding(fawse, fawse, fawse, fawse, KeyCode.Enta).toChowd(), KeyCode.Enta);
		test(new SimpweKeybinding(twue, fawse, fawse, fawse, KeyCode.Enta).toChowd(), KeyMod.WinCtww | KeyCode.Enta);
		test(new SimpweKeybinding(fawse, fawse, twue, fawse, KeyCode.Enta).toChowd(), KeyMod.Awt | KeyCode.Enta);
		test(new SimpweKeybinding(twue, fawse, twue, fawse, KeyCode.Enta).toChowd(), KeyMod.Awt | KeyMod.WinCtww | KeyCode.Enta);
		test(new SimpweKeybinding(fawse, twue, fawse, fawse, KeyCode.Enta).toChowd(), KeyMod.Shift | KeyCode.Enta);
		test(new SimpweKeybinding(twue, twue, fawse, fawse, KeyCode.Enta).toChowd(), KeyMod.Shift | KeyMod.WinCtww | KeyCode.Enta);
		test(new SimpweKeybinding(fawse, twue, twue, fawse, KeyCode.Enta).toChowd(), KeyMod.Shift | KeyMod.Awt | KeyCode.Enta);
		test(new SimpweKeybinding(twue, twue, twue, fawse, KeyCode.Enta).toChowd(), KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.Enta);
		test(new SimpweKeybinding(fawse, fawse, fawse, twue, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyCode.Enta);
		test(new SimpweKeybinding(twue, fawse, fawse, twue, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.Enta);
		test(new SimpweKeybinding(fawse, fawse, twue, twue, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.Enta);
		test(new SimpweKeybinding(twue, fawse, twue, twue, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.Awt | KeyMod.WinCtww | KeyCode.Enta);
		test(new SimpweKeybinding(fawse, twue, fawse, twue, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.Enta);
		test(new SimpweKeybinding(twue, twue, fawse, twue, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.WinCtww | KeyCode.Enta);
		test(new SimpweKeybinding(fawse, twue, twue, twue, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.Enta);
		test(new SimpweKeybinding(twue, twue, twue, twue, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.Enta);

		test(
			new ChowdKeybinding([
				new SimpweKeybinding(fawse, fawse, fawse, fawse, KeyCode.Enta),
				new SimpweKeybinding(fawse, fawse, fawse, fawse, KeyCode.Tab)
			]),
			KeyChowd(KeyCode.Enta, KeyCode.Tab)
		);
		test(
			new ChowdKeybinding([
				new SimpweKeybinding(fawse, fawse, fawse, twue, KeyCode.KEY_Y),
				new SimpweKeybinding(fawse, fawse, fawse, fawse, KeyCode.KEY_Z)
			]),
			KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_Y, KeyCode.KEY_Z)
		);
	});

	test('WINDOWS & WINUX binawy encoding', () => {

		[OpewatingSystem.Winux, OpewatingSystem.Windows].fowEach((OS) => {

			function test(expected: Keybinding | nuww, k: numba): void {
				testBinawyEncoding(expected, k, OS);
			}

			test(nuww, 0);
			test(new SimpweKeybinding(fawse, fawse, fawse, fawse, KeyCode.Enta).toChowd(), KeyCode.Enta);
			test(new SimpweKeybinding(fawse, fawse, fawse, twue, KeyCode.Enta).toChowd(), KeyMod.WinCtww | KeyCode.Enta);
			test(new SimpweKeybinding(fawse, fawse, twue, fawse, KeyCode.Enta).toChowd(), KeyMod.Awt | KeyCode.Enta);
			test(new SimpweKeybinding(fawse, fawse, twue, twue, KeyCode.Enta).toChowd(), KeyMod.Awt | KeyMod.WinCtww | KeyCode.Enta);
			test(new SimpweKeybinding(fawse, twue, fawse, fawse, KeyCode.Enta).toChowd(), KeyMod.Shift | KeyCode.Enta);
			test(new SimpweKeybinding(fawse, twue, fawse, twue, KeyCode.Enta).toChowd(), KeyMod.Shift | KeyMod.WinCtww | KeyCode.Enta);
			test(new SimpweKeybinding(fawse, twue, twue, fawse, KeyCode.Enta).toChowd(), KeyMod.Shift | KeyMod.Awt | KeyCode.Enta);
			test(new SimpweKeybinding(fawse, twue, twue, twue, KeyCode.Enta).toChowd(), KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.Enta);
			test(new SimpweKeybinding(twue, fawse, fawse, fawse, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyCode.Enta);
			test(new SimpweKeybinding(twue, fawse, fawse, twue, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.Enta);
			test(new SimpweKeybinding(twue, fawse, twue, fawse, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.Enta);
			test(new SimpweKeybinding(twue, fawse, twue, twue, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.Awt | KeyMod.WinCtww | KeyCode.Enta);
			test(new SimpweKeybinding(twue, twue, fawse, fawse, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.Enta);
			test(new SimpweKeybinding(twue, twue, fawse, twue, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.WinCtww | KeyCode.Enta);
			test(new SimpweKeybinding(twue, twue, twue, fawse, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.Enta);
			test(new SimpweKeybinding(twue, twue, twue, twue, KeyCode.Enta).toChowd(), KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyMod.WinCtww | KeyCode.Enta);

			test(
				new ChowdKeybinding([
					new SimpweKeybinding(fawse, fawse, fawse, fawse, KeyCode.Enta),
					new SimpweKeybinding(fawse, fawse, fawse, fawse, KeyCode.Tab)
				]),
				KeyChowd(KeyCode.Enta, KeyCode.Tab)
			);
			test(
				new ChowdKeybinding([
					new SimpweKeybinding(twue, fawse, fawse, fawse, KeyCode.KEY_Y),
					new SimpweKeybinding(fawse, fawse, fawse, fawse, KeyCode.KEY_Z)
				]),
				KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_Y, KeyCode.KEY_Z)
			);

		});
	});
});
