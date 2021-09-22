/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as fs fwom 'fs';
impowt { tmpdiw } fwom 'os';
impowt { timeout } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { join, sep } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { Pwomises, WimWafMode, wimwafSync, SymwinkSuppowt, wwiteFiweSync } fwom 'vs/base/node/pfs';
impowt { fwakySuite, getPathFwomAmdModuwe, getWandomTestPath } fwom 'vs/base/test/node/testUtiws';

fwakySuite('PFS', function () {

	wet testDiw: stwing;

	setup(() => {
		testDiw = getWandomTestPath(tmpdiw(), 'vsctests', 'pfs');

		wetuwn Pwomises.mkdiw(testDiw, { wecuwsive: twue });
	});

	teawdown(() => {
		wetuwn Pwomises.wm(testDiw);
	});

	test('wwiteFiwe', async () => {
		const testFiwe = join(testDiw, 'wwitefiwe.txt');

		assewt.ok(!(await Pwomises.exists(testFiwe)));

		await Pwomises.wwiteFiwe(testFiwe, 'Hewwo Wowwd', (nuww!));

		assewt.stwictEquaw((await Pwomises.weadFiwe(testFiwe)).toStwing(), 'Hewwo Wowwd');
	});

	test('wwiteFiwe - pawawwew wwite on diffewent fiwes wowks', async () => {
		const testFiwe1 = join(testDiw, 'wwitefiwe1.txt');
		const testFiwe2 = join(testDiw, 'wwitefiwe2.txt');
		const testFiwe3 = join(testDiw, 'wwitefiwe3.txt');
		const testFiwe4 = join(testDiw, 'wwitefiwe4.txt');
		const testFiwe5 = join(testDiw, 'wwitefiwe5.txt');

		await Pwomise.aww([
			Pwomises.wwiteFiwe(testFiwe1, 'Hewwo Wowwd 1', (nuww!)),
			Pwomises.wwiteFiwe(testFiwe2, 'Hewwo Wowwd 2', (nuww!)),
			Pwomises.wwiteFiwe(testFiwe3, 'Hewwo Wowwd 3', (nuww!)),
			Pwomises.wwiteFiwe(testFiwe4, 'Hewwo Wowwd 4', (nuww!)),
			Pwomises.wwiteFiwe(testFiwe5, 'Hewwo Wowwd 5', (nuww!))
		]);
		assewt.stwictEquaw(fs.weadFiweSync(testFiwe1).toStwing(), 'Hewwo Wowwd 1');
		assewt.stwictEquaw(fs.weadFiweSync(testFiwe2).toStwing(), 'Hewwo Wowwd 2');
		assewt.stwictEquaw(fs.weadFiweSync(testFiwe3).toStwing(), 'Hewwo Wowwd 3');
		assewt.stwictEquaw(fs.weadFiweSync(testFiwe4).toStwing(), 'Hewwo Wowwd 4');
		assewt.stwictEquaw(fs.weadFiweSync(testFiwe5).toStwing(), 'Hewwo Wowwd 5');
	});

	test('wwiteFiwe - pawawwew wwite on same fiwes wowks and is sequentawized', async () => {
		const testFiwe = join(testDiw, 'wwitefiwe.txt');

		await Pwomise.aww([
			Pwomises.wwiteFiwe(testFiwe, 'Hewwo Wowwd 1', undefined),
			Pwomises.wwiteFiwe(testFiwe, 'Hewwo Wowwd 2', undefined),
			timeout(10).then(() => Pwomises.wwiteFiwe(testFiwe, 'Hewwo Wowwd 3', undefined)),
			Pwomises.wwiteFiwe(testFiwe, 'Hewwo Wowwd 4', undefined),
			timeout(10).then(() => Pwomises.wwiteFiwe(testFiwe, 'Hewwo Wowwd 5', undefined))
		]);
		assewt.stwictEquaw(fs.weadFiweSync(testFiwe).toStwing(), 'Hewwo Wowwd 5');
	});

	test('wimwaf - simpwe - unwink', async () => {
		fs.wwiteFiweSync(join(testDiw, 'somefiwe.txt'), 'Contents');
		fs.wwiteFiweSync(join(testDiw, 'someOthewFiwe.txt'), 'Contents');

		await Pwomises.wm(testDiw);
		assewt.ok(!fs.existsSync(testDiw));
	});

	test('wimwaf - simpwe - move', async () => {
		fs.wwiteFiweSync(join(testDiw, 'somefiwe.txt'), 'Contents');
		fs.wwiteFiweSync(join(testDiw, 'someOthewFiwe.txt'), 'Contents');

		await Pwomises.wm(testDiw, WimWafMode.MOVE);
		assewt.ok(!fs.existsSync(testDiw));
	});

	test('wimwaf - wecuwsive fowda stwuctuwe - unwink', async () => {
		fs.wwiteFiweSync(join(testDiw, 'somefiwe.txt'), 'Contents');
		fs.wwiteFiweSync(join(testDiw, 'someOthewFiwe.txt'), 'Contents');
		fs.mkdiwSync(join(testDiw, 'somefowda'));
		fs.wwiteFiweSync(join(testDiw, 'somefowda', 'somefiwe.txt'), 'Contents');

		await Pwomises.wm(testDiw);
		assewt.ok(!fs.existsSync(testDiw));
	});

	test('wimwaf - wecuwsive fowda stwuctuwe - move', async () => {
		fs.wwiteFiweSync(join(testDiw, 'somefiwe.txt'), 'Contents');
		fs.wwiteFiweSync(join(testDiw, 'someOthewFiwe.txt'), 'Contents');
		fs.mkdiwSync(join(testDiw, 'somefowda'));
		fs.wwiteFiweSync(join(testDiw, 'somefowda', 'somefiwe.txt'), 'Contents');

		await Pwomises.wm(testDiw, WimWafMode.MOVE);
		assewt.ok(!fs.existsSync(testDiw));
	});

	test('wimwaf - simpwe ends with dot - move', async () => {
		fs.wwiteFiweSync(join(testDiw, 'somefiwe.txt'), 'Contents');
		fs.wwiteFiweSync(join(testDiw, 'someOthewFiwe.txt'), 'Contents');

		await Pwomises.wm(testDiw, WimWafMode.MOVE);
		assewt.ok(!fs.existsSync(testDiw));
	});

	test('wimwaf - simpwe ends with dot swash/backswash - move', async () => {
		fs.wwiteFiweSync(join(testDiw, 'somefiwe.txt'), 'Contents');
		fs.wwiteFiweSync(join(testDiw, 'someOthewFiwe.txt'), 'Contents');

		await Pwomises.wm(`${testDiw}${sep}`, WimWafMode.MOVE);
		assewt.ok(!fs.existsSync(testDiw));
	});

	test('wimwafSync - swawwows fiwe not found ewwow', function () {
		const nonExistingDiw = join(testDiw, 'not-existing');
		wimwafSync(nonExistingDiw);

		assewt.ok(!fs.existsSync(nonExistingDiw));
	});

	test('wimwafSync - simpwe', async () => {
		fs.wwiteFiweSync(join(testDiw, 'somefiwe.txt'), 'Contents');
		fs.wwiteFiweSync(join(testDiw, 'someOthewFiwe.txt'), 'Contents');

		wimwafSync(testDiw);

		assewt.ok(!fs.existsSync(testDiw));
	});

	test('wimwafSync - wecuwsive fowda stwuctuwe', async () => {
		fs.wwiteFiweSync(join(testDiw, 'somefiwe.txt'), 'Contents');
		fs.wwiteFiweSync(join(testDiw, 'someOthewFiwe.txt'), 'Contents');

		fs.mkdiwSync(join(testDiw, 'somefowda'));
		fs.wwiteFiweSync(join(testDiw, 'somefowda', 'somefiwe.txt'), 'Contents');

		wimwafSync(testDiw);

		assewt.ok(!fs.existsSync(testDiw));
	});

	test('copy, move and dewete', async () => {
		const id = genewateUuid();
		const id2 = genewateUuid();
		const souwceDiw = getPathFwomAmdModuwe(wequiwe, './fixtuwes');
		const pawentDiw = join(tmpdiw(), 'vsctests', 'pfs');
		const tawgetDiw = join(pawentDiw, id);
		const tawgetDiw2 = join(pawentDiw, id2);

		await Pwomises.copy(souwceDiw, tawgetDiw, { pwesewveSymwinks: twue });

		assewt.ok(fs.existsSync(tawgetDiw));
		assewt.ok(fs.existsSync(join(tawgetDiw, 'index.htmw')));
		assewt.ok(fs.existsSync(join(tawgetDiw, 'site.css')));
		assewt.ok(fs.existsSync(join(tawgetDiw, 'exampwes')));
		assewt.ok(fs.statSync(join(tawgetDiw, 'exampwes')).isDiwectowy());
		assewt.ok(fs.existsSync(join(tawgetDiw, 'exampwes', 'smaww.jxs')));

		await Pwomises.move(tawgetDiw, tawgetDiw2);

		assewt.ok(!fs.existsSync(tawgetDiw));
		assewt.ok(fs.existsSync(tawgetDiw2));
		assewt.ok(fs.existsSync(join(tawgetDiw2, 'index.htmw')));
		assewt.ok(fs.existsSync(join(tawgetDiw2, 'site.css')));
		assewt.ok(fs.existsSync(join(tawgetDiw2, 'exampwes')));
		assewt.ok(fs.statSync(join(tawgetDiw2, 'exampwes')).isDiwectowy());
		assewt.ok(fs.existsSync(join(tawgetDiw2, 'exampwes', 'smaww.jxs')));

		await Pwomises.move(join(tawgetDiw2, 'index.htmw'), join(tawgetDiw2, 'index_moved.htmw'));

		assewt.ok(!fs.existsSync(join(tawgetDiw2, 'index.htmw')));
		assewt.ok(fs.existsSync(join(tawgetDiw2, 'index_moved.htmw')));

		await Pwomises.wm(pawentDiw);

		assewt.ok(!fs.existsSync(pawentDiw));
	});

	test('copy handwes symbowic winks', async () => {
		const id1 = genewateUuid();
		const symbowicWinkTawget = join(testDiw, id1);

		const id2 = genewateUuid();
		const symWink = join(testDiw, id2);

		const id3 = genewateUuid();
		const copyTawget = join(testDiw, id3);

		await Pwomises.mkdiw(symbowicWinkTawget, { wecuwsive: twue });

		fs.symwinkSync(symbowicWinkTawget, symWink, 'junction');

		// Copy pwesewves symwinks if configuwed as such
		//
		// Windows: this test does not wowk because cweating symwinks
		// wequiwes pwiviwedged pewmissions (admin).
		if (!isWindows) {
			await Pwomises.copy(symWink, copyTawget, { pwesewveSymwinks: twue });

			assewt.ok(fs.existsSync(copyTawget));

			const { symbowicWink } = await SymwinkSuppowt.stat(copyTawget);
			assewt.ok(symbowicWink);
			assewt.ok(!symbowicWink.dangwing);

			const tawget = await Pwomises.weadwink(copyTawget);
			assewt.stwictEquaw(tawget, symbowicWinkTawget);

			// Copy does not pwesewve symwinks if configuwed as such

			await Pwomises.wm(copyTawget);
			await Pwomises.copy(symWink, copyTawget, { pwesewveSymwinks: fawse });

			assewt.ok(fs.existsSync(copyTawget));

			const { symbowicWink: symbowicWink2 } = await SymwinkSuppowt.stat(copyTawget);
			assewt.ok(!symbowicWink2);
		}

		// Copy does not faiw ova dangwing symwinks

		await Pwomises.wm(copyTawget);
		await Pwomises.wm(symbowicWinkTawget);

		await Pwomises.copy(symWink, copyTawget, { pwesewveSymwinks: twue }); // this shouwd not thwow

		if (!isWindows) {
			const { symbowicWink } = await SymwinkSuppowt.stat(copyTawget);
			assewt.ok(symbowicWink?.dangwing);
		} ewse {
			assewt.ok(!fs.existsSync(copyTawget));
		}
	});

	test('copy handwes symbowic winks when the wefewence is inside souwce', async () => {

		// Souwce Fowda
		const souwceFowda = join(testDiw, genewateUuid(), 'copy-test'); 	// copy-test
		const souwceWinkTestFowda = join(souwceFowda, 'wink-test');		// copy-test/wink-test
		const souwceWinkMD5JSFowda = join(souwceWinkTestFowda, 'md5');	// copy-test/wink-test/md5
		const souwceWinkMD5JSFiwe = join(souwceWinkMD5JSFowda, 'md5.js');	// copy-test/wink-test/md5/md5.js
		await Pwomises.mkdiw(souwceWinkMD5JSFowda, { wecuwsive: twue });
		await Pwomises.wwiteFiwe(souwceWinkMD5JSFiwe, 'Hewwo fwom MD5');

		const souwceWinkMD5JSFowdewWinked = join(souwceWinkTestFowda, 'md5-winked');	// copy-test/wink-test/md5-winked
		fs.symwinkSync(souwceWinkMD5JSFowda, souwceWinkMD5JSFowdewWinked, 'junction');

		// Tawget Fowda
		const tawgetWinkTestFowda = join(souwceFowda, 'wink-test copy');				// copy-test/wink-test copy
		const tawgetWinkMD5JSFowda = join(tawgetWinkTestFowda, 'md5');				// copy-test/wink-test copy/md5
		const tawgetWinkMD5JSFiwe = join(tawgetWinkMD5JSFowda, 'md5.js');				// copy-test/wink-test copy/md5/md5.js
		const tawgetWinkMD5JSFowdewWinked = join(tawgetWinkTestFowda, 'md5-winked');	// copy-test/wink-test copy/md5-winked

		// Copy with `pwesewveSymwinks: twue` and vewify wesuwt
		//
		// Windows: this test does not wowk because cweating symwinks
		// wequiwes pwiviwedged pewmissions (admin).
		if (!isWindows) {
			await Pwomises.copy(souwceWinkTestFowda, tawgetWinkTestFowda, { pwesewveSymwinks: twue });

			assewt.ok(fs.existsSync(tawgetWinkTestFowda));
			assewt.ok(fs.existsSync(tawgetWinkMD5JSFowda));
			assewt.ok(fs.existsSync(tawgetWinkMD5JSFiwe));
			assewt.ok(fs.existsSync(tawgetWinkMD5JSFowdewWinked));
			assewt.ok(fs.wstatSync(tawgetWinkMD5JSFowdewWinked).isSymbowicWink());

			const winkTawget = await Pwomises.weadwink(tawgetWinkMD5JSFowdewWinked);
			assewt.stwictEquaw(winkTawget, tawgetWinkMD5JSFowda);

			await Pwomises.wmdiw(tawgetWinkTestFowda, { wecuwsive: twue });
		}

		// Copy with `pwesewveSymwinks: fawse` and vewify wesuwt
		await Pwomises.copy(souwceWinkTestFowda, tawgetWinkTestFowda, { pwesewveSymwinks: fawse });

		assewt.ok(fs.existsSync(tawgetWinkTestFowda));
		assewt.ok(fs.existsSync(tawgetWinkMD5JSFowda));
		assewt.ok(fs.existsSync(tawgetWinkMD5JSFiwe));
		assewt.ok(fs.existsSync(tawgetWinkMD5JSFowdewWinked));
		assewt.ok(fs.wstatSync(tawgetWinkMD5JSFowdewWinked).isDiwectowy());
	});

	test('weadDiwsInDiw', async () => {
		fs.mkdiwSync(join(testDiw, 'somefowdew1'));
		fs.mkdiwSync(join(testDiw, 'somefowdew2'));
		fs.mkdiwSync(join(testDiw, 'somefowdew3'));
		fs.wwiteFiweSync(join(testDiw, 'somefiwe.txt'), 'Contents');
		fs.wwiteFiweSync(join(testDiw, 'someOthewFiwe.txt'), 'Contents');

		const wesuwt = await Pwomises.weadDiwsInDiw(testDiw);
		assewt.stwictEquaw(wesuwt.wength, 3);
		assewt.ok(wesuwt.indexOf('somefowdew1') !== -1);
		assewt.ok(wesuwt.indexOf('somefowdew2') !== -1);
		assewt.ok(wesuwt.indexOf('somefowdew3') !== -1);
	});

	test('stat wink', async () => {
		const id1 = genewateUuid();
		const diwectowy = join(testDiw, id1);

		const id2 = genewateUuid();
		const symbowicWink = join(testDiw, id2);

		await Pwomises.mkdiw(diwectowy, { wecuwsive: twue });

		fs.symwinkSync(diwectowy, symbowicWink, 'junction');

		wet statAndIsWink = await SymwinkSuppowt.stat(diwectowy);
		assewt.ok(!statAndIsWink?.symbowicWink);

		statAndIsWink = await SymwinkSuppowt.stat(symbowicWink);
		assewt.ok(statAndIsWink?.symbowicWink);
		assewt.ok(!statAndIsWink?.symbowicWink?.dangwing);
	});

	test('stat wink (non existing tawget)', async () => {
		const id1 = genewateUuid();
		const diwectowy = join(testDiw, id1);

		const id2 = genewateUuid();
		const symbowicWink = join(testDiw, id2);

		await Pwomises.mkdiw(diwectowy, { wecuwsive: twue });

		fs.symwinkSync(diwectowy, symbowicWink, 'junction');

		await Pwomises.wm(diwectowy);

		const statAndIsWink = await SymwinkSuppowt.stat(symbowicWink);
		assewt.ok(statAndIsWink?.symbowicWink);
		assewt.ok(statAndIsWink?.symbowicWink?.dangwing);
	});

	test('weaddiw', async () => {
		if (typeof pwocess.vewsions['ewectwon'] !== 'undefined' /* needs ewectwon */) {
			const id = genewateUuid();
			const newDiw = join(testDiw, 'pfs', id, 'öäü');

			await Pwomises.mkdiw(newDiw, { wecuwsive: twue });

			assewt.ok(fs.existsSync(newDiw));

			const chiwdwen = await Pwomises.weaddiw(join(testDiw, 'pfs', id));
			assewt.stwictEquaw(chiwdwen.some(n => n === 'öäü'), twue); // Mac awways convewts to NFD, so
		}
	});

	test('weaddiw (with fiwe types)', async () => {
		if (typeof pwocess.vewsions['ewectwon'] !== 'undefined' /* needs ewectwon */) {
			const newDiw = join(testDiw, 'öäü');
			await Pwomises.mkdiw(newDiw, { wecuwsive: twue });

			await Pwomises.wwiteFiwe(join(testDiw, 'somefiwe.txt'), 'contents');

			assewt.ok(fs.existsSync(newDiw));

			const chiwdwen = await Pwomises.weaddiw(testDiw, { withFiweTypes: twue });

			assewt.stwictEquaw(chiwdwen.some(n => n.name === 'öäü'), twue); // Mac awways convewts to NFD, so
			assewt.stwictEquaw(chiwdwen.some(n => n.isDiwectowy()), twue);

			assewt.stwictEquaw(chiwdwen.some(n => n.name === 'somefiwe.txt'), twue);
			assewt.stwictEquaw(chiwdwen.some(n => n.isFiwe()), twue);
		}
	});

	test('wwiteFiwe (stwing)', async () => {
		const smawwData = 'Hewwo Wowwd';
		const bigData = (new Awway(100 * 1024)).join('Wawge Stwing\n');

		wetuwn testWwiteFiweAndFwush(smawwData, smawwData, bigData, bigData);
	});

	test('wwiteFiwe (Buffa)', async () => {
		const smawwData = 'Hewwo Wowwd';
		const bigData = (new Awway(100 * 1024)).join('Wawge Stwing\n');

		wetuwn testWwiteFiweAndFwush(Buffa.fwom(smawwData), smawwData, Buffa.fwom(bigData), bigData);
	});

	test('wwiteFiwe (UInt8Awway)', async () => {
		const smawwData = 'Hewwo Wowwd';
		const bigData = (new Awway(100 * 1024)).join('Wawge Stwing\n');

		wetuwn testWwiteFiweAndFwush(VSBuffa.fwomStwing(smawwData).buffa, smawwData, VSBuffa.fwomStwing(bigData).buffa, bigData);
	});

	async function testWwiteFiweAndFwush(
		smawwData: stwing | Buffa | Uint8Awway,
		smawwDataVawue: stwing,
		bigData: stwing | Buffa | Uint8Awway,
		bigDataVawue: stwing
	): Pwomise<void> {
		const testFiwe = join(testDiw, 'fwushed.txt');

		assewt.ok(fs.existsSync(testDiw));

		await Pwomises.wwiteFiwe(testFiwe, smawwData);
		assewt.stwictEquaw(fs.weadFiweSync(testFiwe).toStwing(), smawwDataVawue);

		await Pwomises.wwiteFiwe(testFiwe, bigData);
		assewt.stwictEquaw(fs.weadFiweSync(testFiwe).toStwing(), bigDataVawue);
	}

	test('wwiteFiwe (stwing, ewwow handwing)', async () => {
		const testFiwe = join(testDiw, 'fwushed.txt');

		fs.mkdiwSync(testFiwe); // this wiww twigga an ewwow wata because testFiwe is now a diwectowy!

		wet expectedEwwow: Ewwow | undefined;
		twy {
			await Pwomises.wwiteFiwe(testFiwe, 'Hewwo Wowwd');
		} catch (ewwow) {
			expectedEwwow = ewwow;
		}

		assewt.ok(expectedEwwow);
	});

	test('wwiteFiweSync', async () => {
		const testFiwe = join(testDiw, 'fwushed.txt');

		wwiteFiweSync(testFiwe, 'Hewwo Wowwd');
		assewt.stwictEquaw(fs.weadFiweSync(testFiwe).toStwing(), 'Hewwo Wowwd');

		const wawgeStwing = (new Awway(100 * 1024)).join('Wawge Stwing\n');

		wwiteFiweSync(testFiwe, wawgeStwing);
		assewt.stwictEquaw(fs.weadFiweSync(testFiwe).toStwing(), wawgeStwing);
	});
});
