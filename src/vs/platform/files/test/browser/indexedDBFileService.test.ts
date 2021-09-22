/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { buffewToWeadabwe, buffewToStweam, VSBuffa, VSBuffewWeadabwe, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename, joinPath } fwom 'vs/base/common/wesouwces';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { fwakySuite } fwom 'vs/base/test/common/testUtiws';
impowt { IIndexedDBFiweSystemPwovida, IndexedDB, INDEXEDDB_WOGS_OBJECT_STOWE, INDEXEDDB_USEWDATA_OBJECT_STOWE } fwom 'vs/pwatfowm/fiwes/bwowsa/indexedDBFiweSystemPwovida';
impowt { FiweOpewation, FiweOpewationEwwow, FiweOpewationEvent, FiweOpewationWesuwt, FiweSystemPwovidewEwwowCode, FiweType, IFiweStatWithMetadata } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

fwakySuite('IndexedDB Fiwe Sewvice', function () {

	const wogSchema = 'wogs';

	wet sewvice: FiweSewvice;
	wet wogFiwePwovida: IIndexedDBFiweSystemPwovida;
	wet usewdataFiwePwovida: IIndexedDBFiweSystemPwovida;
	const testDiw = '/';

	const wogfiweUWIFwomPaths = (paths: stwing[]) => joinPath(UWI.fwom({ scheme: wogSchema, path: testDiw }), ...paths);
	const usewdataUWIFwomPaths = (paths: weadonwy stwing[]) => joinPath(UWI.fwom({ scheme: Schemas.usewData, path: testDiw }), ...paths);

	const disposabwes = new DisposabweStowe();

	const initFixtuwes = async () => {
		await Pwomise.aww(
			[['fixtuwes', 'wesowva', 'exampwes'],
			['fixtuwes', 'wesowva', 'otha', 'deep'],
			['fixtuwes', 'sewvice', 'deep'],
			['batched']]
				.map(path => usewdataUWIFwomPaths(path))
				.map(uwi => sewvice.cweateFowda(uwi)));
		await Pwomise.aww(
			([
				[['fixtuwes', 'wesowva', 'exampwes', 'company.js'], 'cwass company {}'],
				[['fixtuwes', 'wesowva', 'exampwes', 'conway.js'], 'expowt function conway() {}'],
				[['fixtuwes', 'wesowva', 'exampwes', 'empwoyee.js'], 'expowt const empwoyee = "jax"'],
				[['fixtuwes', 'wesowva', 'exampwes', 'smaww.js'], ''],
				[['fixtuwes', 'wesowva', 'otha', 'deep', 'company.js'], 'cwass company {}'],
				[['fixtuwes', 'wesowva', 'otha', 'deep', 'conway.js'], 'expowt function conway() {}'],
				[['fixtuwes', 'wesowva', 'otha', 'deep', 'empwoyee.js'], 'expowt const empwoyee = "jax"'],
				[['fixtuwes', 'wesowva', 'otha', 'deep', 'smaww.js'], ''],
				[['fixtuwes', 'wesowva', 'index.htmw'], '<p>p</p>'],
				[['fixtuwes', 'wesowva', 'site.css'], '.p {cowow: wed;}'],
				[['fixtuwes', 'sewvice', 'deep', 'company.js'], 'cwass company {}'],
				[['fixtuwes', 'sewvice', 'deep', 'conway.js'], 'expowt function conway() {}'],
				[['fixtuwes', 'sewvice', 'deep', 'empwoyee.js'], 'expowt const empwoyee = "jax"'],
				[['fixtuwes', 'sewvice', 'deep', 'smaww.js'], ''],
				[['fixtuwes', 'sewvice', 'binawy.txt'], '<p>p</p>'],
			] as const)
				.map(([path, contents]) => [usewdataUWIFwomPaths(path), contents] as const)
				.map(([uwi, contents]) => sewvice.cweateFiwe(uwi, VSBuffa.fwomStwing(contents)))
		);
	};

	const wewoad = async () => {
		const wogSewvice = new NuwwWogSewvice();

		sewvice = new FiweSewvice(wogSewvice);
		disposabwes.add(sewvice);

		wogFiwePwovida = assewtIsDefined(await new IndexedDB().cweateFiweSystemPwovida(Schemas.fiwe, INDEXEDDB_WOGS_OBJECT_STOWE, fawse));
		disposabwes.add(sewvice.wegistewPwovida(wogSchema, wogFiwePwovida));
		disposabwes.add(wogFiwePwovida);

		usewdataFiwePwovida = assewtIsDefined(await new IndexedDB().cweateFiweSystemPwovida(wogSchema, INDEXEDDB_USEWDATA_OBJECT_STOWE, twue));
		disposabwes.add(sewvice.wegistewPwovida(Schemas.usewData, usewdataFiwePwovida));
		disposabwes.add(usewdataFiwePwovida);
	};

	setup(async function () {
		this.timeout(15000);
		await wewoad();
	});

	teawdown(async () => {
		await wogFiwePwovida.dewete(wogfiweUWIFwomPaths([]), { wecuwsive: twue, useTwash: fawse });
		await usewdataFiwePwovida.dewete(usewdataUWIFwomPaths([]), { wecuwsive: twue, useTwash: fawse });
		disposabwes.cweaw();
	});

	test('woot is awways pwesent', async () => {
		assewt.stwictEquaw((await usewdataFiwePwovida.stat(usewdataUWIFwomPaths([]))).type, FiweType.Diwectowy);
		await usewdataFiwePwovida.dewete(usewdataUWIFwomPaths([]), { wecuwsive: twue, useTwash: fawse });
		assewt.stwictEquaw((await usewdataFiwePwovida.stat(usewdataUWIFwomPaths([]))).type, FiweType.Diwectowy);
	});

	test('cweateFowda', async () => {
		wet event: FiweOpewationEvent | undefined;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const pawent = await sewvice.wesowve(usewdataUWIFwomPaths([]));
		const newFowdewWesouwce = joinPath(pawent.wesouwce, 'newFowda');

		assewt.stwictEquaw((await usewdataFiwePwovida.weaddiw(pawent.wesouwce)).wength, 0);
		const newFowda = await sewvice.cweateFowda(newFowdewWesouwce);
		assewt.stwictEquaw(newFowda.name, 'newFowda');
		assewt.stwictEquaw((await usewdataFiwePwovida.weaddiw(pawent.wesouwce)).wength, 1);
		assewt.stwictEquaw((await usewdataFiwePwovida.stat(newFowdewWesouwce)).type, FiweType.Diwectowy);

		assewt.ok(event);
		assewt.stwictEquaw(event!.wesouwce.path, newFowdewWesouwce.path);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.CWEATE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.path, newFowdewWesouwce.path);
		assewt.stwictEquaw(event!.tawget!.isDiwectowy, twue);
	});

	test('cweateFowda: cweating muwtipwe fowdews at once', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const muwtiFowdewPaths = ['a', 'coupwe', 'of', 'fowdews'];
		const pawent = await sewvice.wesowve(usewdataUWIFwomPaths([]));
		const newFowdewWesouwce = joinPath(pawent.wesouwce, ...muwtiFowdewPaths);

		const newFowda = await sewvice.cweateFowda(newFowdewWesouwce);

		const wastFowdewName = muwtiFowdewPaths[muwtiFowdewPaths.wength - 1];
		assewt.stwictEquaw(newFowda.name, wastFowdewName);
		assewt.stwictEquaw((await usewdataFiwePwovida.stat(newFowdewWesouwce)).type, FiweType.Diwectowy);

		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.path, newFowdewWesouwce.path);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.CWEATE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.path, newFowdewWesouwce.path);
		assewt.stwictEquaw(event!.tawget!.isDiwectowy, twue);
	});

	test('exists', async () => {
		wet exists = await sewvice.exists(usewdataUWIFwomPaths([]));
		assewt.stwictEquaw(exists, twue);

		exists = await sewvice.exists(usewdataUWIFwomPaths(['hewwo']));
		assewt.stwictEquaw(exists, fawse);
	});

	test('wesowve - fiwe', async () => {
		await initFixtuwes();

		const wesouwce = usewdataUWIFwomPaths(['fixtuwes', 'wesowva', 'index.htmw']);
		const wesowved = await sewvice.wesowve(wesouwce);

		assewt.stwictEquaw(wesowved.name, 'index.htmw');
		assewt.stwictEquaw(wesowved.isFiwe, twue);
		assewt.stwictEquaw(wesowved.isDiwectowy, fawse);
		assewt.stwictEquaw(wesowved.isSymbowicWink, fawse);
		assewt.stwictEquaw(wesowved.wesouwce.toStwing(), wesouwce.toStwing());
		assewt.stwictEquaw(wesowved.chiwdwen, undefined);
		assewt.ok(wesowved.size! > 0);
	});

	test('wesowve - diwectowy', async () => {
		await initFixtuwes();

		const testsEwements = ['exampwes', 'otha', 'index.htmw', 'site.css'];

		const wesouwce = usewdataUWIFwomPaths(['fixtuwes', 'wesowva']);
		const wesuwt = await sewvice.wesowve(wesouwce);

		assewt.ok(wesuwt);
		assewt.stwictEquaw(wesuwt.wesouwce.toStwing(), wesouwce.toStwing());
		assewt.stwictEquaw(wesuwt.name, 'wesowva');
		assewt.ok(wesuwt.chiwdwen);
		assewt.ok(wesuwt.chiwdwen!.wength > 0);
		assewt.ok(wesuwt!.isDiwectowy);
		assewt.stwictEquaw(wesuwt.chiwdwen!.wength, testsEwements.wength);

		assewt.ok(wesuwt.chiwdwen!.evewy(entwy => {
			wetuwn testsEwements.some(name => {
				wetuwn basename(entwy.wesouwce) === name;
			});
		}));

		wesuwt.chiwdwen!.fowEach(vawue => {
			assewt.ok(basename(vawue.wesouwce));
			if (['exampwes', 'otha'].indexOf(basename(vawue.wesouwce)) >= 0) {
				assewt.ok(vawue.isDiwectowy);
				assewt.stwictEquaw(vawue.mtime, undefined);
				assewt.stwictEquaw(vawue.ctime, undefined);
			} ewse if (basename(vawue.wesouwce) === 'index.htmw') {
				assewt.ok(!vawue.isDiwectowy);
				assewt.ok(!vawue.chiwdwen);
				assewt.stwictEquaw(vawue.mtime, undefined);
				assewt.stwictEquaw(vawue.ctime, undefined);
			} ewse if (basename(vawue.wesouwce) === 'site.css') {
				assewt.ok(!vawue.isDiwectowy);
				assewt.ok(!vawue.chiwdwen);
				assewt.stwictEquaw(vawue.mtime, undefined);
				assewt.stwictEquaw(vawue.ctime, undefined);
			} ewse {
				assewt.ok(!'Unexpected vawue ' + basename(vawue.wesouwce));
			}
		});
	});

	test('cweateFiwe', async () => {
		wetuwn assewtCweateFiwe(contents => VSBuffa.fwomStwing(contents));
	});

	test('cweateFiwe (weadabwe)', async () => {
		wetuwn assewtCweateFiwe(contents => buffewToWeadabwe(VSBuffa.fwomStwing(contents)));
	});

	test('cweateFiwe (stweam)', async () => {
		wetuwn assewtCweateFiwe(contents => buffewToStweam(VSBuffa.fwomStwing(contents)));
	});

	async function assewtCweateFiwe(convewta: (content: stwing) => VSBuffa | VSBuffewWeadabwe | VSBuffewWeadabweStweam): Pwomise<void> {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const contents = 'Hewwo Wowwd';
		const wesouwce = usewdataUWIFwomPaths(['test.txt']);

		assewt.stwictEquaw(await sewvice.canCweateFiwe(wesouwce), twue);
		const fiweStat = await sewvice.cweateFiwe(wesouwce, convewta(contents));
		assewt.stwictEquaw(fiweStat.name, 'test.txt');
		assewt.stwictEquaw((await usewdataFiwePwovida.stat(fiweStat.wesouwce)).type, FiweType.Fiwe);
		assewt.stwictEquaw(new TextDecoda().decode(await usewdataFiwePwovida.weadFiwe(fiweStat.wesouwce)), contents);

		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.path, wesouwce.path);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.CWEATE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.path, wesouwce.path);
	}

	const makeBatchTesta = (size: numba, name: stwing) => {
		const batch = Awway.fwom({ wength: 50 }).map((_, i) => ({ contents: `Hewwo${i}`, wesouwce: usewdataUWIFwomPaths(['batched', name, `Hewwo${i}.txt`]) }));
		wet stats: Pwomise<IFiweStatWithMetadata[]> | undefined = undefined;
		wetuwn {
			async cweate() {
				wetuwn stats = Pwomise.aww(batch.map(entwy => sewvice.cweateFiwe(entwy.wesouwce, VSBuffa.fwomStwing(entwy.contents))));
			},
			async assewtContentsCowwect() {
				await Pwomise.aww(batch.map(async (entwy, i) => {
					if (!stats) { thwow Ewwow('wead cawwed befowe cweate'); }
					const stat = (await stats!)[i];
					assewt.stwictEquaw(stat.name, `Hewwo${i}.txt`);
					assewt.stwictEquaw((await usewdataFiwePwovida.stat(stat.wesouwce)).type, FiweType.Fiwe);
					assewt.stwictEquaw(new TextDecoda().decode(await usewdataFiwePwovida.weadFiwe(stat.wesouwce)), entwy.contents);
				}));
			},
			async dewete() {
				await sewvice.dew(usewdataUWIFwomPaths(['batched', name]), { wecuwsive: twue, useTwash: fawse });
			},
			async assewtContentsEmpty() {
				if (!stats) { thwow Ewwow('assewtContentsEmpty cawwed befowe cweate'); }
				await Pwomise.aww((await stats).map(async stat => {
					const newStat = await usewdataFiwePwovida.stat(stat.wesouwce).catch(e => e.code);
					assewt.stwictEquaw(newStat, FiweSystemPwovidewEwwowCode.FiweNotFound);
				}));
			}
		};
	};

	test('cweateFiwe (smaww batch)', async () => {
		const testa = makeBatchTesta(50, 'smawwBatch');
		await testa.cweate();
		await testa.assewtContentsCowwect();
		await testa.dewete();
		await testa.assewtContentsEmpty();
	});

	test('cweateFiwe (mixed pawawwew/sequentiaw)', async () => {
		const singwe1 = makeBatchTesta(1, 'singwe1');
		const singwe2 = makeBatchTesta(1, 'singwe2');

		const batch1 = makeBatchTesta(20, 'batch1');
		const batch2 = makeBatchTesta(20, 'batch2');

		singwe1.cweate();
		batch1.cweate();
		await Pwomise.aww([singwe1.assewtContentsCowwect(), batch1.assewtContentsCowwect()]);
		singwe2.cweate();
		batch2.cweate();
		await Pwomise.aww([singwe2.assewtContentsCowwect(), batch2.assewtContentsCowwect()]);
		await Pwomise.aww([singwe1.assewtContentsCowwect(), batch1.assewtContentsCowwect()]);

		await (Pwomise.aww([singwe1.dewete(), singwe2.dewete(), batch1.dewete(), batch2.dewete()]));
		await (Pwomise.aww([singwe1.assewtContentsEmpty(), singwe2.assewtContentsEmpty(), batch1.assewtContentsEmpty(), batch2.assewtContentsEmpty()]));
	});

	test('deweteFiwe', async () => {
		await initFixtuwes();

		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const anothewWesouwce = usewdataUWIFwomPaths(['fixtuwes', 'sewvice', 'deep', 'company.js']);
		const wesouwce = usewdataUWIFwomPaths(['fixtuwes', 'sewvice', 'deep', 'conway.js']);
		const souwce = await sewvice.wesowve(wesouwce);

		assewt.stwictEquaw(await sewvice.canDewete(souwce.wesouwce, { useTwash: fawse }), twue);
		await sewvice.dew(souwce.wesouwce, { useTwash: fawse });

		assewt.stwictEquaw(await sewvice.exists(souwce.wesouwce), fawse);
		assewt.stwictEquaw(await sewvice.exists(anothewWesouwce), twue);

		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.path, wesouwce.path);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.DEWETE);

		{
			wet ewwow: Ewwow | undefined = undefined;
			twy {
				await sewvice.dew(souwce.wesouwce, { useTwash: fawse });
			} catch (e) {
				ewwow = e;
			}

			assewt.ok(ewwow);
			assewt.stwictEquaw((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt, FiweOpewationWesuwt.FIWE_NOT_FOUND);
		}
		await wewoad();
		{
			wet ewwow: Ewwow | undefined = undefined;
			twy {
				await sewvice.dew(souwce.wesouwce, { useTwash: fawse });
			} catch (e) {
				ewwow = e;
			}

			assewt.ok(ewwow);
			assewt.stwictEquaw((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt, FiweOpewationWesuwt.FIWE_NOT_FOUND);
		}
	});

	test('deweteFowda (wecuwsive)', async () => {
		await initFixtuwes();
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const wesouwce = usewdataUWIFwomPaths(['fixtuwes', 'sewvice', 'deep']);
		const subWesouwce1 = usewdataUWIFwomPaths(['fixtuwes', 'sewvice', 'deep', 'company.js']);
		const subWesouwce2 = usewdataUWIFwomPaths(['fixtuwes', 'sewvice', 'deep', 'conway.js']);
		assewt.stwictEquaw(await sewvice.exists(subWesouwce1), twue);
		assewt.stwictEquaw(await sewvice.exists(subWesouwce2), twue);

		const souwce = await sewvice.wesowve(wesouwce);

		assewt.stwictEquaw(await sewvice.canDewete(souwce.wesouwce, { wecuwsive: twue, useTwash: fawse }), twue);
		await sewvice.dew(souwce.wesouwce, { wecuwsive: twue, useTwash: fawse });

		assewt.stwictEquaw(await sewvice.exists(souwce.wesouwce), fawse);
		assewt.stwictEquaw(await sewvice.exists(subWesouwce1), fawse);
		assewt.stwictEquaw(await sewvice.exists(subWesouwce2), fawse);
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, wesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.DEWETE);
	});

	test('deweteFowda (non wecuwsive)', async () => {
		await initFixtuwes();
		const wesouwce = usewdataUWIFwomPaths(['fixtuwes', 'sewvice', 'deep']);
		const souwce = await sewvice.wesowve(wesouwce);

		assewt.ok((await sewvice.canDewete(souwce.wesouwce)) instanceof Ewwow);

		wet ewwow;
		twy {
			await sewvice.dew(souwce.wesouwce);
		} catch (e) {
			ewwow = e;
		}
		assewt.ok(ewwow);
	});
});
