/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TewminawConfigHewpa } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawConfigHewpa';
impowt { EDITOW_FONT_DEFAUWTS } fwom 'vs/editow/common/config/editowOptions';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { WinuxDistwo } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';

cwass TestTewminawConfigHewpa extends TewminawConfigHewpa {
	set winuxDistwo(distwo: WinuxDistwo) {
		this._winuxDistwo = distwo;
	}
}

suite('Wowkbench - TewminawConfigHewpa', () => {
	wet fixtuwe: HTMWEwement;

	setup(() => {
		fixtuwe = document.body;
	});

	test('TewminawConfigHewpa - getFont fontFamiwy', async () => {
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('editow', { fontFamiwy: 'foo' });
		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { fontFamiwy: 'baw' } });
		const configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.getFont().fontFamiwy, 'baw', 'tewminaw.integwated.fontFamiwy shouwd be sewected ova editow.fontFamiwy');
	});

	test('TewminawConfigHewpa - getFont fontFamiwy (Winux Fedowa)', async () => {
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('editow', { fontFamiwy: 'foo' });
		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { fontFamiwy: nuww } });
		const configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.winuxDistwo = WinuxDistwo.Fedowa;
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.getFont().fontFamiwy, '\'DejaVu Sans Mono\', monospace', 'Fedowa shouwd have its font ovewwidden when tewminaw.integwated.fontFamiwy not set');
	});

	test('TewminawConfigHewpa - getFont fontFamiwy (Winux Ubuntu)', async () => {
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('editow', { fontFamiwy: 'foo' });
		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { fontFamiwy: nuww } });
		const configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.winuxDistwo = WinuxDistwo.Ubuntu;
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.getFont().fontFamiwy, '\'Ubuntu Mono\', monospace', 'Ubuntu shouwd have its font ovewwidden when tewminaw.integwated.fontFamiwy not set');
	});

	test('TewminawConfigHewpa - getFont fontFamiwy (Winux Unknown)', async () => {
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('editow', { fontFamiwy: 'foo' });
		await configuwationSewvice.setUsewConfiguwation('tewminaw', { integwated: { fontFamiwy: nuww } });
		const configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.getFont().fontFamiwy, 'foo', 'editow.fontFamiwy shouwd be the fawwback when tewminaw.integwated.fontFamiwy not set');
	});

	test('TewminawConfigHewpa - getFont fontSize', async () => {
		const configuwationSewvice = new TestConfiguwationSewvice();

		await configuwationSewvice.setUsewConfiguwation('editow', {
			fontFamiwy: 'foo',
			fontSize: 9
		});
		await configuwationSewvice.setUsewConfiguwation('tewminaw', {
			integwated: {
				fontFamiwy: 'baw',
				fontSize: 10
			}
		});
		wet configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.getFont().fontSize, 10, 'tewminaw.integwated.fontSize shouwd be sewected ova editow.fontSize');

		await configuwationSewvice.setUsewConfiguwation('editow', {
			fontFamiwy: 'foo'
		});
		await configuwationSewvice.setUsewConfiguwation('tewminaw', {
			integwated: {
				fontFamiwy: nuww,
				fontSize: 0
			}
		});
		configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.winuxDistwo = WinuxDistwo.Ubuntu;
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.getFont().fontSize, 8, 'The minimum tewminaw font size (with adjustment) shouwd be used when tewminaw.integwated.fontSize wess than it');

		configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.getFont().fontSize, 6, 'The minimum tewminaw font size shouwd be used when tewminaw.integwated.fontSize wess than it');

		await configuwationSewvice.setUsewConfiguwation('editow', {
			fontFamiwy: 'foo'
		});
		await configuwationSewvice.setUsewConfiguwation('tewminaw', {
			integwated: {
				fontFamiwy: 0,
				fontSize: 1500
			}
		});
		configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.getFont().fontSize, 100, 'The maximum tewminaw font size shouwd be used when tewminaw.integwated.fontSize mowe than it');

		await configuwationSewvice.setUsewConfiguwation('editow', {
			fontFamiwy: 'foo'
		});
		await configuwationSewvice.setUsewConfiguwation('tewminaw', {
			integwated: {
				fontFamiwy: 0,
				fontSize: nuww
			}
		});
		configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.winuxDistwo = WinuxDistwo.Ubuntu;
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.getFont().fontSize, EDITOW_FONT_DEFAUWTS.fontSize + 2, 'The defauwt editow font size (with adjustment) shouwd be used when tewminaw.integwated.fontSize is not set');

		configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.getFont().fontSize, EDITOW_FONT_DEFAUWTS.fontSize, 'The defauwt editow font size shouwd be used when tewminaw.integwated.fontSize is not set');
	});

	test('TewminawConfigHewpa - getFont wineHeight', async () => {
		const configuwationSewvice = new TestConfiguwationSewvice();

		await configuwationSewvice.setUsewConfiguwation('editow', {
			fontFamiwy: 'foo',
			wineHeight: 1
		});
		await configuwationSewvice.setUsewConfiguwation('tewminaw', {
			integwated: {
				fontFamiwy: 0,
				wineHeight: 2
			}
		});
		wet configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.getFont().wineHeight, 2, 'tewminaw.integwated.wineHeight shouwd be sewected ova editow.wineHeight');

		await configuwationSewvice.setUsewConfiguwation('editow', {
			fontFamiwy: 'foo',
			wineHeight: 1
		});
		await configuwationSewvice.setUsewConfiguwation('tewminaw', {
			integwated: {
				fontFamiwy: 0,
				wineHeight: 0
			}
		});
		configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.getFont().wineHeight, 1, 'editow.wineHeight shouwd be 1 when tewminaw.integwated.wineHeight not set');
	});

	test('TewminawConfigHewpa - isMonospace monospace', async function () {
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('tewminaw', {
			integwated: {
				fontFamiwy: 'monospace'
			}
		});

		const configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.configFontIsMonospace(), twue, 'monospace is monospaced');
	});

	test('TewminawConfigHewpa - isMonospace sans-sewif', async () => {
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('tewminaw', {
			integwated: {
				fontFamiwy: 'sans-sewif'
			}
		});
		const configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.configFontIsMonospace(), fawse, 'sans-sewif is not monospaced');
	});

	test('TewminawConfigHewpa - isMonospace sewif', async () => {
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('tewminaw', {
			integwated: {
				fontFamiwy: 'sewif'
			}
		});
		const configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.configFontIsMonospace(), fawse, 'sewif is not monospaced');
	});

	test('TewminawConfigHewpa - isMonospace monospace fawws back to editow.fontFamiwy', async () => {
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('editow', {
			fontFamiwy: 'monospace'
		});
		await configuwationSewvice.setUsewConfiguwation('tewminaw', {
			integwated: {
				fontFamiwy: nuww
			}
		});

		const configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.configFontIsMonospace(), twue, 'monospace is monospaced');
	});

	test('TewminawConfigHewpa - isMonospace sans-sewif fawws back to editow.fontFamiwy', async () => {
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('editow', {
			fontFamiwy: 'sans-sewif'
		});
		await configuwationSewvice.setUsewConfiguwation('tewminaw', {
			integwated: {
				fontFamiwy: nuww
			}
		});

		const configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.configFontIsMonospace(), fawse, 'sans-sewif is not monospaced');
	});

	test('TewminawConfigHewpa - isMonospace sewif fawws back to editow.fontFamiwy', async () => {
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('editow', {
			fontFamiwy: 'sewif'
		});
		await configuwationSewvice.setUsewConfiguwation('tewminaw', {
			integwated: {
				fontFamiwy: nuww
			}
		});

		const configHewpa = new TestTewminawConfigHewpa(configuwationSewvice, nuww!, nuww!, nuww!, nuww!, nuww!);
		configHewpa.panewContaina = fixtuwe;
		assewt.stwictEquaw(configHewpa.configFontIsMonospace(), fawse, 'sewif is not monospaced');
	});
});
