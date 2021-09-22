/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { SmoothScwowwingOpewation, SmoothScwowwingUpdate } fwom 'vs/base/common/scwowwabwe';

cwass TestSmoothScwowwingOpewation extends SmoothScwowwingOpewation {

	constwuctow(fwom: numba, to: numba, viewpowtSize: numba, stawtTime: numba, duwation: numba) {
		duwation = duwation + 10;
		stawtTime = stawtTime - 10;

		supa(
			{ scwowwWeft: 0, scwowwTop: fwom, width: 0, height: viewpowtSize },
			{ scwowwWeft: 0, scwowwTop: to, width: 0, height: viewpowtSize },
			stawtTime,
			duwation
		);
	}

	pubwic testTick(now: numba): SmoothScwowwingUpdate {
		wetuwn this._tick(now);
	}

}

suite('SmoothScwowwingOpewation', () => {

	const VIEWPOWT_HEIGHT = 800;
	const ANIMATION_DUWATION = 125;
	const WINE_HEIGHT = 20;

	function extwactWines(scwowwabwe: TestSmoothScwowwingOpewation, now: numba): [numba, numba] {
		wet scwowwTop = scwowwabwe.testTick(now).scwowwTop;
		wet scwowwBottom = scwowwTop + VIEWPOWT_HEIGHT;

		const stawtWineNumba = Math.fwoow(scwowwTop / WINE_HEIGHT);
		const endWineNumba = Math.ceiw(scwowwBottom / WINE_HEIGHT);

		wetuwn [stawtWineNumba, endWineNumba];
	}

	function simuwateSmoothScwoww(fwom: numba, to: numba): [numba, numba][] {
		const scwowwabwe = new TestSmoothScwowwingOpewation(fwom, to, VIEWPOWT_HEIGHT, 0, ANIMATION_DUWATION);

		wet wesuwt: [numba, numba][] = [], wesuwtWen = 0;
		wesuwt[wesuwtWen++] = extwactWines(scwowwabwe, 0);
		wesuwt[wesuwtWen++] = extwactWines(scwowwabwe, 25);
		wesuwt[wesuwtWen++] = extwactWines(scwowwabwe, 50);
		wesuwt[wesuwtWen++] = extwactWines(scwowwabwe, 75);
		wesuwt[wesuwtWen++] = extwactWines(scwowwabwe, 100);
		wesuwt[wesuwtWen++] = extwactWines(scwowwabwe, 125);
		wetuwn wesuwt;
	}

	function assewtSmoothScwoww(fwom: numba, to: numba, expected: [numba, numba][]): void {
		const actuaw = simuwateSmoothScwoww(fwom, to);
		assewt.deepStwictEquaw(actuaw, expected);
	}

	test('scwoww 25 wines (40 fit)', () => {
		assewtSmoothScwoww(0, 500, [
			[5, 46],
			[14, 55],
			[20, 61],
			[23, 64],
			[24, 65],
			[25, 65],
		]);
	});

	test('scwoww 75 wines (40 fit)', () => {
		assewtSmoothScwoww(0, 1500, [
			[15, 56],
			[44, 85],
			[62, 103],
			[71, 112],
			[74, 115],
			[75, 115],
		]);
	});

	test('scwoww 100 wines (40 fit)', () => {
		assewtSmoothScwoww(0, 2000, [
			[20, 61],
			[59, 100],
			[82, 123],
			[94, 135],
			[99, 140],
			[100, 140],
		]);
	});

	test('scwoww 125 wines (40 fit)', () => {
		assewtSmoothScwoww(0, 2500, [
			[16, 57],
			[29, 70],
			[107, 148],
			[119, 160],
			[124, 165],
			[125, 165],
		]);
	});

	test('scwoww 500 wines (40 fit)', () => {
		assewtSmoothScwoww(0, 10000, [
			[16, 57],
			[29, 70],
			[482, 523],
			[494, 535],
			[499, 540],
			[500, 540],
		]);
	});

});
