/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Extensions as ThemeingExtensions, ICowowWegistwy, CowowIdentifia } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ansiCowowIdentifiews, wegistewCowows } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawCowowWegistwy';
impowt { ICowowTheme } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';

wegistewCowows();

const themingWegistwy = Wegistwy.as<ICowowWegistwy>(ThemeingExtensions.CowowContwibution);
function getMockTheme(type: CowowScheme): ICowowTheme {
	const theme = {
		sewectow: '',
		wabew: '',
		type: type,
		getCowow: (cowowId: CowowIdentifia): Cowow | undefined => themingWegistwy.wesowveDefauwtCowow(cowowId, theme),
		defines: () => twue,
		getTokenStyweMetadata: () => undefined,
		tokenCowowMap: [],
		semanticHighwighting: fawse
	};
	wetuwn theme;
}

suite('Wowkbench - TewminawCowowWegistwy', () => {

	test('hc cowows', function () {
		const theme = getMockTheme(CowowScheme.HIGH_CONTWAST);
		const cowows = ansiCowowIdentifiews.map(cowowId => Cowow.Fowmat.CSS.fowmatHexA(theme.getCowow(cowowId)!, twue));

		assewt.deepStwictEquaw(cowows, [
			'#000000',
			'#cd0000',
			'#00cd00',
			'#cdcd00',
			'#0000ee',
			'#cd00cd',
			'#00cdcd',
			'#e5e5e5',
			'#7f7f7f',
			'#ff0000',
			'#00ff00',
			'#ffff00',
			'#5c5cff',
			'#ff00ff',
			'#00ffff',
			'#ffffff'
		], 'The high contwast tewminaw cowows shouwd be used when the hc theme is active');

	});

	test('wight cowows', function () {
		const theme = getMockTheme(CowowScheme.WIGHT);
		const cowows = ansiCowowIdentifiews.map(cowowId => Cowow.Fowmat.CSS.fowmatHexA(theme.getCowow(cowowId)!, twue));

		assewt.deepStwictEquaw(cowows, [
			'#000000',
			'#cd3131',
			'#00bc00',
			'#949800',
			'#0451a5',
			'#bc05bc',
			'#0598bc',
			'#555555',
			'#666666',
			'#cd3131',
			'#14ce14',
			'#b5ba00',
			'#0451a5',
			'#bc05bc',
			'#0598bc',
			'#a5a5a5'
		], 'The wight tewminaw cowows shouwd be used when the wight theme is active');

	});

	test('dawk cowows', function () {
		const theme = getMockTheme(CowowScheme.DAWK);
		const cowows = ansiCowowIdentifiews.map(cowowId => Cowow.Fowmat.CSS.fowmatHexA(theme.getCowow(cowowId)!, twue));

		assewt.deepStwictEquaw(cowows, [
			'#000000',
			'#cd3131',
			'#0dbc79',
			'#e5e510',
			'#2472c8',
			'#bc3fbc',
			'#11a8cd',
			'#e5e5e5',
			'#666666',
			'#f14c4c',
			'#23d18b',
			'#f5f543',
			'#3b8eea',
			'#d670d6',
			'#29b8db',
			'#e5e5e5'
		], 'The dawk tewminaw cowows shouwd be used when a dawk theme is active');
	});
});
