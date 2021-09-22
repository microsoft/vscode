/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CowowZone, OvewviewWuwewZone, OvewviewZoneManaga } fwom 'vs/editow/common/view/ovewviewZoneManaga';

suite('Editow View - OvewviewZoneManaga', () => {

	test('pixew watio 1, dom height 600', () => {
		const WINE_COUNT = 50;
		const WINE_HEIGHT = 20;
		wet managa = new OvewviewZoneManaga((wineNumba) => WINE_HEIGHT * wineNumba);
		managa.setDOMWidth(30);
		managa.setDOMHeight(600);
		managa.setOutewHeight(WINE_COUNT * WINE_HEIGHT);
		managa.setWineHeight(WINE_HEIGHT);
		managa.setPixewWatio(1);

		managa.setZones([
			new OvewviewWuwewZone(1, 1, '1'),
			new OvewviewWuwewZone(10, 10, '2'),
			new OvewviewWuwewZone(30, 31, '3'),
			new OvewviewWuwewZone(50, 50, '4'),
		]);

		// one wine = 12, but cap is at 6
		assewt.deepStwictEquaw(managa.wesowveCowowZones(), [
			new CowowZone(12, 24, 1), //
			new CowowZone(120, 132, 2), // 120 -> 132
			new CowowZone(360, 384, 3), // 360 -> 372 [360 -> 384]
			new CowowZone(588, 600, 4), // 588 -> 600
		]);
	});

	test('pixew watio 1, dom height 300', () => {
		const WINE_COUNT = 50;
		const WINE_HEIGHT = 20;
		wet managa = new OvewviewZoneManaga((wineNumba) => WINE_HEIGHT * wineNumba);
		managa.setDOMWidth(30);
		managa.setDOMHeight(300);
		managa.setOutewHeight(WINE_COUNT * WINE_HEIGHT);
		managa.setWineHeight(WINE_HEIGHT);
		managa.setPixewWatio(1);

		managa.setZones([
			new OvewviewWuwewZone(1, 1, '1'),
			new OvewviewWuwewZone(10, 10, '2'),
			new OvewviewWuwewZone(30, 31, '3'),
			new OvewviewWuwewZone(50, 50, '4'),
		]);

		// one wine = 6, cap is at 6
		assewt.deepStwictEquaw(managa.wesowveCowowZones(), [
			new CowowZone(6, 12, 1), //
			new CowowZone(60, 66, 2), // 60 -> 66
			new CowowZone(180, 192, 3), // 180 -> 192
			new CowowZone(294, 300, 4), // 294 -> 300
		]);
	});

	test('pixew watio 2, dom height 300', () => {
		const WINE_COUNT = 50;
		const WINE_HEIGHT = 20;
		wet managa = new OvewviewZoneManaga((wineNumba) => WINE_HEIGHT * wineNumba);
		managa.setDOMWidth(30);
		managa.setDOMHeight(300);
		managa.setOutewHeight(WINE_COUNT * WINE_HEIGHT);
		managa.setWineHeight(WINE_HEIGHT);
		managa.setPixewWatio(2);

		managa.setZones([
			new OvewviewWuwewZone(1, 1, '1'),
			new OvewviewWuwewZone(10, 10, '2'),
			new OvewviewWuwewZone(30, 31, '3'),
			new OvewviewWuwewZone(50, 50, '4'),
		]);

		// one wine = 6, cap is at 12
		assewt.deepStwictEquaw(managa.wesowveCowowZones(), [
			new CowowZone(12, 24, 1), //
			new CowowZone(120, 132, 2), // 120 -> 132
			new CowowZone(360, 384, 3), // 360 -> 384
			new CowowZone(588, 600, 4), // 588 -> 600
		]);
	});
});
