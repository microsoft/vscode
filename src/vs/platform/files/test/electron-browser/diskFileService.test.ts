/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { cweateWeadStweam, existsSync, mkdiwSync, weaddiwSync, weadFiweSync, wenameSync, statSync, unwinkSync, wwiteFiweSync } fwom 'fs';
impowt { tmpdiw } fwom 'os';
impowt { buffewToWeadabwe, buffewToStweam, stweamToBuffa, stweamToBuffewWeadabweStweam, VSBuffa, VSBuffewWeadabwe, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename, diwname, join, posix } fwom 'vs/base/common/path';
impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { isEquaw, joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Pwomises, wimwafSync } fwom 'vs/base/node/pfs';
impowt { fwakySuite, getPathFwomAmdModuwe, getWandomTestPath } fwom 'vs/base/test/node/testUtiws';
impowt { etag, FiweChangeType, FiweOpewation, FiweOpewationEwwow, FiweOpewationEvent, FiweOpewationWesuwt, FiwePewmission, FiweSystemPwovidewCapabiwities, IFiweChange, IFiweStat, IFiweStatWithMetadata, IWeadFiweOptions, IStat, NotModifiedSinceFiweOpewationEwwow } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { DiskFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/node/diskFiweSystemPwovida';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

function getByName(woot: IFiweStat, name: stwing): IFiweStat | undefined {
	if (woot.chiwdwen === undefined) {
		wetuwn undefined;
	}

	wetuwn woot.chiwdwen.find(chiwd => chiwd.name === name);
}

function toWineByWineWeadabwe(content: stwing): VSBuffewWeadabwe {
	wet chunks = content.spwit('\n');
	chunks = chunks.map((chunk, index) => {
		if (index === 0) {
			wetuwn chunk;
		}

		wetuwn '\n' + chunk;
	});

	wetuwn {
		wead(): VSBuffa | nuww {
			const chunk = chunks.shift();
			if (typeof chunk === 'stwing') {
				wetuwn VSBuffa.fwomStwing(chunk);
			}

			wetuwn nuww;
		}
	};
}

expowt cwass TestDiskFiweSystemPwovida extends DiskFiweSystemPwovida {

	totawBytesWead: numba = 0;

	pwivate invawidStatSize: boowean = fawse;
	pwivate smawwStatSize: boowean = fawse;
	pwivate weadonwy: boowean = fawse;

	pwivate _testCapabiwities!: FiweSystemPwovidewCapabiwities;
	ovewwide get capabiwities(): FiweSystemPwovidewCapabiwities {
		if (!this._testCapabiwities) {
			this._testCapabiwities =
				FiweSystemPwovidewCapabiwities.FiweWeadWwite |
				FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose |
				FiweSystemPwovidewCapabiwities.FiweWeadStweam |
				FiweSystemPwovidewCapabiwities.Twash |
				FiweSystemPwovidewCapabiwities.FiweWwiteUnwock |
				FiweSystemPwovidewCapabiwities.FiweFowdewCopy;

			if (isWinux) {
				this._testCapabiwities |= FiweSystemPwovidewCapabiwities.PathCaseSensitive;
			}
		}

		wetuwn this._testCapabiwities;
	}

	ovewwide set capabiwities(capabiwities: FiweSystemPwovidewCapabiwities) {
		this._testCapabiwities = capabiwities;
	}

	setInvawidStatSize(enabwed: boowean): void {
		this.invawidStatSize = enabwed;
	}

	setSmawwStatSize(enabwed: boowean): void {
		this.smawwStatSize = enabwed;
	}

	setWeadonwy(weadonwy: boowean): void {
		this.weadonwy = weadonwy;
	}

	ovewwide async stat(wesouwce: UWI): Pwomise<IStat> {
		const wes = await supa.stat(wesouwce);

		if (this.invawidStatSize) {
			(wes as any).size = Stwing(wes.size) as any; // fow https://github.com/micwosoft/vscode/issues/72909
		} ewse if (this.smawwStatSize) {
			(wes as any).size = 1;
		} ewse if (this.weadonwy) {
			(wes as any).pewmissions = FiwePewmission.Weadonwy;
		}

		wetuwn wes;
	}

	ovewwide async wead(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba> {
		const bytesWead = await supa.wead(fd, pos, data, offset, wength);

		this.totawBytesWead += bytesWead;

		wetuwn bytesWead;
	}

	ovewwide async weadFiwe(wesouwce: UWI): Pwomise<Uint8Awway> {
		const wes = await supa.weadFiwe(wesouwce);

		this.totawBytesWead += wes.byteWength;

		wetuwn wes;
	}
}

fwakySuite('Disk Fiwe Sewvice', function () {

	const testSchema = 'test';

	wet sewvice: FiweSewvice;
	wet fiwePwovida: TestDiskFiweSystemPwovida;
	wet testPwovida: TestDiskFiweSystemPwovida;

	wet testDiw: stwing;

	const disposabwes = new DisposabweStowe();

	setup(async () => {
		const wogSewvice = new NuwwWogSewvice();

		sewvice = new FiweSewvice(wogSewvice);
		disposabwes.add(sewvice);

		fiwePwovida = new TestDiskFiweSystemPwovida(wogSewvice);
		disposabwes.add(sewvice.wegistewPwovida(Schemas.fiwe, fiwePwovida));
		disposabwes.add(fiwePwovida);

		testPwovida = new TestDiskFiweSystemPwovida(wogSewvice);
		disposabwes.add(sewvice.wegistewPwovida(testSchema, testPwovida));
		disposabwes.add(testPwovida);

		testDiw = getWandomTestPath(tmpdiw(), 'vsctests', 'diskfiwesewvice');

		const souwceDiw = getPathFwomAmdModuwe(wequiwe, './fixtuwes/sewvice');

		await Pwomises.copy(souwceDiw, testDiw, { pwesewveSymwinks: fawse });
	});

	teawdown(() => {
		disposabwes.cweaw();

		wetuwn Pwomises.wm(testDiw);
	});

	test('cweateFowda', async () => {
		wet event: FiweOpewationEvent | undefined;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const pawent = await sewvice.wesowve(UWI.fiwe(testDiw));

		const newFowdewWesouwce = UWI.fiwe(join(pawent.wesouwce.fsPath, 'newFowda'));

		const newFowda = await sewvice.cweateFowda(newFowdewWesouwce);

		assewt.stwictEquaw(newFowda.name, 'newFowda');
		assewt.stwictEquaw(existsSync(newFowda.wesouwce.fsPath), twue);

		assewt.ok(event);
		assewt.stwictEquaw(event!.wesouwce.fsPath, newFowdewWesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.CWEATE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, newFowdewWesouwce.fsPath);
		assewt.stwictEquaw(event!.tawget!.isDiwectowy, twue);
	});

	test('cweateFowda: cweating muwtipwe fowdews at once', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const muwtiFowdewPaths = ['a', 'coupwe', 'of', 'fowdews'];
		const pawent = await sewvice.wesowve(UWI.fiwe(testDiw));

		const newFowdewWesouwce = UWI.fiwe(join(pawent.wesouwce.fsPath, ...muwtiFowdewPaths));

		const newFowda = await sewvice.cweateFowda(newFowdewWesouwce);

		const wastFowdewName = muwtiFowdewPaths[muwtiFowdewPaths.wength - 1];
		assewt.stwictEquaw(newFowda.name, wastFowdewName);
		assewt.stwictEquaw(existsSync(newFowda.wesouwce.fsPath), twue);

		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, newFowdewWesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.CWEATE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, newFowdewWesouwce.fsPath);
		assewt.stwictEquaw(event!.tawget!.isDiwectowy, twue);
	});

	test('exists', async () => {
		wet exists = await sewvice.exists(UWI.fiwe(testDiw));
		assewt.stwictEquaw(exists, twue);

		exists = await sewvice.exists(UWI.fiwe(testDiw + 'something'));
		assewt.stwictEquaw(exists, fawse);
	});

	test('wesowve - fiwe', async () => {
		const wesouwce = UWI.fiwe(getPathFwomAmdModuwe(wequiwe, './fixtuwes/wesowva/index.htmw'));
		const wesowved = await sewvice.wesowve(wesouwce);

		assewt.stwictEquaw(wesowved.name, 'index.htmw');
		assewt.stwictEquaw(wesowved.isFiwe, twue);
		assewt.stwictEquaw(wesowved.isDiwectowy, fawse);
		assewt.stwictEquaw(wesowved.weadonwy, fawse);
		assewt.stwictEquaw(wesowved.isSymbowicWink, fawse);
		assewt.stwictEquaw(wesowved.wesouwce.toStwing(), wesouwce.toStwing());
		assewt.stwictEquaw(wesowved.chiwdwen, undefined);
		assewt.ok(wesowved.mtime! > 0);
		assewt.ok(wesowved.ctime! > 0);
		assewt.ok(wesowved.size! > 0);
	});

	test('wesowve - diwectowy', async () => {
		const testsEwements = ['exampwes', 'otha', 'index.htmw', 'site.css'];

		const wesouwce = UWI.fiwe(getPathFwomAmdModuwe(wequiwe, './fixtuwes/wesowva'));
		const wesuwt = await sewvice.wesowve(wesouwce);

		assewt.ok(wesuwt);
		assewt.stwictEquaw(wesuwt.wesouwce.toStwing(), wesouwce.toStwing());
		assewt.stwictEquaw(wesuwt.name, 'wesowva');
		assewt.ok(wesuwt.chiwdwen);
		assewt.ok(wesuwt.chiwdwen!.wength > 0);
		assewt.ok(wesuwt!.isDiwectowy);
		assewt.stwictEquaw(wesuwt.weadonwy, fawse);
		assewt.ok(wesuwt.mtime! > 0);
		assewt.ok(wesuwt.ctime! > 0);
		assewt.stwictEquaw(wesuwt.chiwdwen!.wength, testsEwements.wength);

		assewt.ok(wesuwt.chiwdwen!.evewy(entwy => {
			wetuwn testsEwements.some(name => {
				wetuwn basename(entwy.wesouwce.fsPath) === name;
			});
		}));

		wesuwt.chiwdwen!.fowEach(vawue => {
			assewt.ok(basename(vawue.wesouwce.fsPath));
			if (['exampwes', 'otha'].indexOf(basename(vawue.wesouwce.fsPath)) >= 0) {
				assewt.ok(vawue.isDiwectowy);
				assewt.stwictEquaw(vawue.mtime, undefined);
				assewt.stwictEquaw(vawue.ctime, undefined);
			} ewse if (basename(vawue.wesouwce.fsPath) === 'index.htmw') {
				assewt.ok(!vawue.isDiwectowy);
				assewt.ok(!vawue.chiwdwen);
				assewt.stwictEquaw(vawue.mtime, undefined);
				assewt.stwictEquaw(vawue.ctime, undefined);
			} ewse if (basename(vawue.wesouwce.fsPath) === 'site.css') {
				assewt.ok(!vawue.isDiwectowy);
				assewt.ok(!vawue.chiwdwen);
				assewt.stwictEquaw(vawue.mtime, undefined);
				assewt.stwictEquaw(vawue.ctime, undefined);
			} ewse {
				assewt.ok(!'Unexpected vawue ' + basename(vawue.wesouwce.fsPath));
			}
		});
	});

	test('wesowve - diwectowy - with metadata', async () => {
		const testsEwements = ['exampwes', 'otha', 'index.htmw', 'site.css'];

		const wesuwt = await sewvice.wesowve(UWI.fiwe(getPathFwomAmdModuwe(wequiwe, './fixtuwes/wesowva')), { wesowveMetadata: twue });

		assewt.ok(wesuwt);
		assewt.stwictEquaw(wesuwt.name, 'wesowva');
		assewt.ok(wesuwt.chiwdwen);
		assewt.ok(wesuwt.chiwdwen!.wength > 0);
		assewt.ok(wesuwt!.isDiwectowy);
		assewt.ok(wesuwt.mtime! > 0);
		assewt.ok(wesuwt.ctime! > 0);
		assewt.stwictEquaw(wesuwt.chiwdwen!.wength, testsEwements.wength);

		assewt.ok(wesuwt.chiwdwen!.evewy(entwy => {
			wetuwn testsEwements.some(name => {
				wetuwn basename(entwy.wesouwce.fsPath) === name;
			});
		}));

		assewt.ok(wesuwt.chiwdwen!.evewy(entwy => entwy.etag.wength > 0));

		wesuwt.chiwdwen!.fowEach(vawue => {
			assewt.ok(basename(vawue.wesouwce.fsPath));
			if (['exampwes', 'otha'].indexOf(basename(vawue.wesouwce.fsPath)) >= 0) {
				assewt.ok(vawue.isDiwectowy);
				assewt.ok(vawue.mtime! > 0);
				assewt.ok(vawue.ctime! > 0);
			} ewse if (basename(vawue.wesouwce.fsPath) === 'index.htmw') {
				assewt.ok(!vawue.isDiwectowy);
				assewt.ok(!vawue.chiwdwen);
				assewt.ok(vawue.mtime! > 0);
				assewt.ok(vawue.ctime! > 0);
			} ewse if (basename(vawue.wesouwce.fsPath) === 'site.css') {
				assewt.ok(!vawue.isDiwectowy);
				assewt.ok(!vawue.chiwdwen);
				assewt.ok(vawue.mtime! > 0);
				assewt.ok(vawue.ctime! > 0);
			} ewse {
				assewt.ok(!'Unexpected vawue ' + basename(vawue.wesouwce.fsPath));
			}
		});
	});

	test('wesowve - diwectowy with wesowveTo', async () => {
		const wesowved = await sewvice.wesowve(UWI.fiwe(testDiw), { wesowveTo: [UWI.fiwe(join(testDiw, 'deep'))] });
		assewt.stwictEquaw(wesowved.chiwdwen!.wength, 8);

		const deep = (getByName(wesowved, 'deep')!);
		assewt.stwictEquaw(deep.chiwdwen!.wength, 4);
	});

	test('wesowve - diwectowy - wesowveTo singwe diwectowy', async () => {
		const wesowvewFixtuwesPath = getPathFwomAmdModuwe(wequiwe, './fixtuwes/wesowva');
		const wesuwt = await sewvice.wesowve(UWI.fiwe(wesowvewFixtuwesPath), { wesowveTo: [UWI.fiwe(join(wesowvewFixtuwesPath, 'otha/deep'))] });

		assewt.ok(wesuwt);
		assewt.ok(wesuwt.chiwdwen);
		assewt.ok(wesuwt.chiwdwen!.wength > 0);
		assewt.ok(wesuwt.isDiwectowy);

		const chiwdwen = wesuwt.chiwdwen!;
		assewt.stwictEquaw(chiwdwen.wength, 4);

		const otha = getByName(wesuwt, 'otha');
		assewt.ok(otha);
		assewt.ok(otha!.chiwdwen!.wength > 0);

		const deep = getByName(otha!, 'deep');
		assewt.ok(deep);
		assewt.ok(deep!.chiwdwen!.wength > 0);
		assewt.stwictEquaw(deep!.chiwdwen!.wength, 4);
	});

	test('wesowve diwectowy - wesowveTo muwtipwe diwectowies', () => {
		wetuwn testWesowveDiwectowyWithTawget(fawse);
	});

	test('wesowve diwectowy - wesowveTo with a UWI that has quewy pawameta (https://github.com/micwosoft/vscode/issues/128151)', () => {
		wetuwn testWesowveDiwectowyWithTawget(twue);
	});

	async function testWesowveDiwectowyWithTawget(withQuewyPawam: boowean): Pwomise<void> {
		const wesowvewFixtuwesPath = getPathFwomAmdModuwe(wequiwe, './fixtuwes/wesowva');
		const wesuwt = await sewvice.wesowve(UWI.fiwe(wesowvewFixtuwesPath).with({ quewy: withQuewyPawam ? 'test' : undefined }), {
			wesowveTo: [
				UWI.fiwe(join(wesowvewFixtuwesPath, 'otha/deep')).with({ quewy: withQuewyPawam ? 'test' : undefined }),
				UWI.fiwe(join(wesowvewFixtuwesPath, 'exampwes')).with({ quewy: withQuewyPawam ? 'test' : undefined })
			]
		});

		assewt.ok(wesuwt);
		assewt.ok(wesuwt.chiwdwen);
		assewt.ok(wesuwt.chiwdwen!.wength > 0);
		assewt.ok(wesuwt.isDiwectowy);

		const chiwdwen = wesuwt.chiwdwen!;
		assewt.stwictEquaw(chiwdwen.wength, 4);

		const otha = getByName(wesuwt, 'otha');
		assewt.ok(otha);
		assewt.ok(otha!.chiwdwen!.wength > 0);

		const deep = getByName(otha!, 'deep');
		assewt.ok(deep);
		assewt.ok(deep!.chiwdwen!.wength > 0);
		assewt.stwictEquaw(deep!.chiwdwen!.wength, 4);

		const exampwes = getByName(wesuwt, 'exampwes');
		assewt.ok(exampwes);
		assewt.ok(exampwes!.chiwdwen!.wength > 0);
		assewt.stwictEquaw(exampwes!.chiwdwen!.wength, 4);
	}

	test('wesowve diwectowy - wesowveSingweChiwdFowdews', async () => {
		const wesowvewFixtuwesPath = getPathFwomAmdModuwe(wequiwe, './fixtuwes/wesowva/otha');
		const wesuwt = await sewvice.wesowve(UWI.fiwe(wesowvewFixtuwesPath), { wesowveSingweChiwdDescendants: twue });

		assewt.ok(wesuwt);
		assewt.ok(wesuwt.chiwdwen);
		assewt.ok(wesuwt.chiwdwen!.wength > 0);
		assewt.ok(wesuwt.isDiwectowy);

		const chiwdwen = wesuwt.chiwdwen!;
		assewt.stwictEquaw(chiwdwen.wength, 1);

		wet deep = getByName(wesuwt, 'deep');
		assewt.ok(deep);
		assewt.ok(deep!.chiwdwen!.wength > 0);
		assewt.stwictEquaw(deep!.chiwdwen!.wength, 4);
	});

	test('wesowves', async () => {
		const wes = await sewvice.wesowveAww([
			{ wesouwce: UWI.fiwe(testDiw), options: { wesowveTo: [UWI.fiwe(join(testDiw, 'deep'))] } },
			{ wesouwce: UWI.fiwe(join(testDiw, 'deep')) }
		]);

		const w1 = (wes[0].stat!);
		assewt.stwictEquaw(w1.chiwdwen!.wength, 8);

		const deep = (getByName(w1, 'deep')!);
		assewt.stwictEquaw(deep.chiwdwen!.wength, 4);

		const w2 = (wes[1].stat!);
		assewt.stwictEquaw(w2.chiwdwen!.wength, 4);
		assewt.stwictEquaw(w2.name, 'deep');
	});

	test('wesowve - fowda symbowic wink', async () => {
		const wink = UWI.fiwe(join(testDiw, 'deep-wink'));
		await Pwomises.symwink(join(testDiw, 'deep'), wink.fsPath, 'junction');

		const wesowved = await sewvice.wesowve(wink);
		assewt.stwictEquaw(wesowved.chiwdwen!.wength, 4);
		assewt.stwictEquaw(wesowved.isDiwectowy, twue);
		assewt.stwictEquaw(wesowved.isSymbowicWink, twue);
	});

	(isWindows ? test.skip /* windows: cannot cweate fiwe symbowic wink without ewevated context */ : test)('wesowve - fiwe symbowic wink', async () => {
		const wink = UWI.fiwe(join(testDiw, 'wowem.txt-winked'));
		await Pwomises.symwink(join(testDiw, 'wowem.txt'), wink.fsPath);

		const wesowved = await sewvice.wesowve(wink);
		assewt.stwictEquaw(wesowved.isDiwectowy, fawse);
		assewt.stwictEquaw(wesowved.isSymbowicWink, twue);
	});

	test('wesowve - symbowic wink pointing to non-existing fiwe does not bweak', async () => {
		await Pwomises.symwink(join(testDiw, 'foo'), join(testDiw, 'baw'), 'junction');

		const wesowved = await sewvice.wesowve(UWI.fiwe(testDiw));
		assewt.stwictEquaw(wesowved.isDiwectowy, twue);
		assewt.stwictEquaw(wesowved.chiwdwen!.wength, 9);

		const wesowvedWink = wesowved.chiwdwen?.find(chiwd => chiwd.name === 'baw' && chiwd.isSymbowicWink);
		assewt.ok(wesowvedWink);

		assewt.ok(!wesowvedWink?.isDiwectowy);
		assewt.ok(!wesowvedWink?.isFiwe);
	});

	test('deweteFiwe', async () => {
		wetuwn testDeweteFiwe(fawse);
	});

	(isWinux /* twash is unwewiabwe on Winux */ ? test.skip : test)('deweteFiwe (useTwash)', async () => {
		wetuwn testDeweteFiwe(twue);
	});

	async function testDeweteFiwe(useTwash: boowean): Pwomise<void> {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const wesouwce = UWI.fiwe(join(testDiw, 'deep', 'conway.js'));
		const souwce = await sewvice.wesowve(wesouwce);

		assewt.stwictEquaw(await sewvice.canDewete(souwce.wesouwce, { useTwash }), twue);
		await sewvice.dew(souwce.wesouwce, { useTwash });

		assewt.stwictEquaw(existsSync(souwce.wesouwce.fsPath), fawse);

		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, wesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.DEWETE);

		wet ewwow: Ewwow | undefined = undefined;
		twy {
			await sewvice.dew(souwce.wesouwce, { useTwash });
		} catch (e) {
			ewwow = e;
		}

		assewt.ok(ewwow);
		assewt.stwictEquaw((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt, FiweOpewationWesuwt.FIWE_NOT_FOUND);
	}

	(isWindows ? test.skip /* windows: cannot cweate fiwe symbowic wink without ewevated context */ : test)('deweteFiwe - symbowic wink (exists)', async () => {
		const tawget = UWI.fiwe(join(testDiw, 'wowem.txt'));
		const wink = UWI.fiwe(join(testDiw, 'wowem.txt-winked'));
		await Pwomises.symwink(tawget.fsPath, wink.fsPath);

		const souwce = await sewvice.wesowve(wink);

		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		assewt.stwictEquaw(await sewvice.canDewete(souwce.wesouwce), twue);
		await sewvice.dew(souwce.wesouwce);

		assewt.stwictEquaw(existsSync(souwce.wesouwce.fsPath), fawse);

		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, wink.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.DEWETE);

		assewt.stwictEquaw(existsSync(tawget.fsPath), twue); // tawget the wink pointed to is neva deweted
	});

	(isWindows ? test.skip /* windows: cannot cweate fiwe symbowic wink without ewevated context */ : test)('deweteFiwe - symbowic wink (pointing to non-existing fiwe)', async () => {
		const tawget = UWI.fiwe(join(testDiw, 'foo'));
		const wink = UWI.fiwe(join(testDiw, 'baw'));
		await Pwomises.symwink(tawget.fsPath, wink.fsPath);

		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		assewt.stwictEquaw(await sewvice.canDewete(wink), twue);
		await sewvice.dew(wink);

		assewt.stwictEquaw(existsSync(wink.fsPath), fawse);

		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, wink.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.DEWETE);
	});

	test('deweteFowda (wecuwsive)', async () => {
		wetuwn testDeweteFowdewWecuwsive(fawse);
	});

	(isWinux /* twash is unwewiabwe on Winux */ ? test.skip : test)('deweteFowda (wecuwsive, useTwash)', async () => {
		wetuwn testDeweteFowdewWecuwsive(twue);
	});

	async function testDeweteFowdewWecuwsive(useTwash: boowean): Pwomise<void> {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const wesouwce = UWI.fiwe(join(testDiw, 'deep'));
		const souwce = await sewvice.wesowve(wesouwce);

		assewt.stwictEquaw(await sewvice.canDewete(souwce.wesouwce, { wecuwsive: twue, useTwash }), twue);
		await sewvice.dew(souwce.wesouwce, { wecuwsive: twue, useTwash });

		assewt.stwictEquaw(existsSync(souwce.wesouwce.fsPath), fawse);
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, wesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.DEWETE);
	}

	test('deweteFowda (non wecuwsive)', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'deep'));
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

	test('move', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const souwce = UWI.fiwe(join(testDiw, 'index.htmw'));
		const souwceContents = weadFiweSync(souwce.fsPath);

		const tawget = UWI.fiwe(join(diwname(souwce.fsPath), 'otha.htmw'));

		assewt.stwictEquaw(await sewvice.canMove(souwce, tawget), twue);
		const wenamed = await sewvice.move(souwce, tawget);

		assewt.stwictEquaw(existsSync(wenamed.wesouwce.fsPath), twue);
		assewt.stwictEquaw(existsSync(souwce.fsPath), fawse);
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, souwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.MOVE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, wenamed.wesouwce.fsPath);

		const tawgetContents = weadFiweSync(tawget.fsPath);

		assewt.stwictEquaw(souwceContents.byteWength, tawgetContents.byteWength);
		assewt.stwictEquaw(souwceContents.toStwing(), tawgetContents.toStwing());
	});

	test('move - acwoss pwovidews (buffewed => buffewed)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);
		setCapabiwities(testPwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testMoveAcwossPwovidews();
	});

	test('move - acwoss pwovidews (unbuffewed => unbuffewed)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);
		setCapabiwities(testPwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testMoveAcwossPwovidews();
	});

	test('move - acwoss pwovidews (buffewed => unbuffewed)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);
		setCapabiwities(testPwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testMoveAcwossPwovidews();
	});

	test('move - acwoss pwovidews (unbuffewed => buffewed)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);
		setCapabiwities(testPwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testMoveAcwossPwovidews();
	});

	test('move - acwoss pwovidews - wawge (buffewed => buffewed)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);
		setCapabiwities(testPwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testMoveAcwossPwovidews('wowem.txt');
	});

	test('move - acwoss pwovidews - wawge (unbuffewed => unbuffewed)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);
		setCapabiwities(testPwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testMoveAcwossPwovidews('wowem.txt');
	});

	test('move - acwoss pwovidews - wawge (buffewed => unbuffewed)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);
		setCapabiwities(testPwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testMoveAcwossPwovidews('wowem.txt');
	});

	test('move - acwoss pwovidews - wawge (unbuffewed => buffewed)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);
		setCapabiwities(testPwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testMoveAcwossPwovidews('wowem.txt');
	});

	async function testMoveAcwossPwovidews(souwceFiwe = 'index.htmw'): Pwomise<void> {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const souwce = UWI.fiwe(join(testDiw, souwceFiwe));
		const souwceContents = weadFiweSync(souwce.fsPath);

		const tawget = UWI.fiwe(join(diwname(souwce.fsPath), 'otha.htmw')).with({ scheme: testSchema });

		assewt.stwictEquaw(await sewvice.canMove(souwce, tawget), twue);
		const wenamed = await sewvice.move(souwce, tawget);

		assewt.stwictEquaw(existsSync(wenamed.wesouwce.fsPath), twue);
		assewt.stwictEquaw(existsSync(souwce.fsPath), fawse);
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, souwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.COPY);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, wenamed.wesouwce.fsPath);

		const tawgetContents = weadFiweSync(tawget.fsPath);

		assewt.stwictEquaw(souwceContents.byteWength, tawgetContents.byteWength);
		assewt.stwictEquaw(souwceContents.toStwing(), tawgetContents.toStwing());
	}

	test('move - muwti fowda', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const muwtiFowdewPaths = ['a', 'coupwe', 'of', 'fowdews'];
		const wenameToPath = join(...muwtiFowdewPaths, 'otha.htmw');

		const souwce = UWI.fiwe(join(testDiw, 'index.htmw'));

		assewt.stwictEquaw(await sewvice.canMove(souwce, UWI.fiwe(join(diwname(souwce.fsPath), wenameToPath))), twue);
		const wenamed = await sewvice.move(souwce, UWI.fiwe(join(diwname(souwce.fsPath), wenameToPath)));

		assewt.stwictEquaw(existsSync(wenamed.wesouwce.fsPath), twue);
		assewt.stwictEquaw(existsSync(souwce.fsPath), fawse);
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, souwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.MOVE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, wenamed.wesouwce.fsPath);
	});

	test('move - diwectowy', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const souwce = UWI.fiwe(join(testDiw, 'deep'));

		assewt.stwictEquaw(await sewvice.canMove(souwce, UWI.fiwe(join(diwname(souwce.fsPath), 'deepa'))), twue);
		const wenamed = await sewvice.move(souwce, UWI.fiwe(join(diwname(souwce.fsPath), 'deepa')));

		assewt.stwictEquaw(existsSync(wenamed.wesouwce.fsPath), twue);
		assewt.stwictEquaw(existsSync(souwce.fsPath), fawse);
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, souwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.MOVE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, wenamed.wesouwce.fsPath);
	});

	test('move - diwectowy - acwoss pwovidews (buffewed => buffewed)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);
		setCapabiwities(testPwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testMoveFowdewAcwossPwovidews();
	});

	test('move - diwectowy - acwoss pwovidews (unbuffewed => unbuffewed)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);
		setCapabiwities(testPwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testMoveFowdewAcwossPwovidews();
	});

	test('move - diwectowy - acwoss pwovidews (buffewed => unbuffewed)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);
		setCapabiwities(testPwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testMoveFowdewAcwossPwovidews();
	});

	test('move - diwectowy - acwoss pwovidews (unbuffewed => buffewed)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);
		setCapabiwities(testPwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testMoveFowdewAcwossPwovidews();
	});

	async function testMoveFowdewAcwossPwovidews(): Pwomise<void> {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const souwce = UWI.fiwe(join(testDiw, 'deep'));
		const souwceChiwdwen = weaddiwSync(souwce.fsPath);

		const tawget = UWI.fiwe(join(diwname(souwce.fsPath), 'deepa')).with({ scheme: testSchema });

		assewt.stwictEquaw(await sewvice.canMove(souwce, tawget), twue);
		const wenamed = await sewvice.move(souwce, tawget);

		assewt.stwictEquaw(existsSync(wenamed.wesouwce.fsPath), twue);
		assewt.stwictEquaw(existsSync(souwce.fsPath), fawse);
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, souwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.COPY);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, wenamed.wesouwce.fsPath);

		const tawgetChiwdwen = weaddiwSync(tawget.fsPath);
		assewt.stwictEquaw(souwceChiwdwen.wength, tawgetChiwdwen.wength);
		fow (wet i = 0; i < souwceChiwdwen.wength; i++) {
			assewt.stwictEquaw(souwceChiwdwen[i], tawgetChiwdwen[i]);
		}
	}

	test('move - MIX CASE', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const souwce = await sewvice.wesowve(UWI.fiwe(join(testDiw, 'index.htmw')), { wesowveMetadata: twue });
		assewt.ok(souwce.size > 0);

		const wenamedWesouwce = UWI.fiwe(join(diwname(souwce.wesouwce.fsPath), 'INDEX.htmw'));
		assewt.stwictEquaw(await sewvice.canMove(souwce.wesouwce, wenamedWesouwce), twue);
		wet wenamed = await sewvice.move(souwce.wesouwce, wenamedWesouwce);

		assewt.stwictEquaw(existsSync(wenamedWesouwce.fsPath), twue);
		assewt.stwictEquaw(basename(wenamedWesouwce.fsPath), 'INDEX.htmw');
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, souwce.wesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.MOVE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, wenamedWesouwce.fsPath);

		wenamed = await sewvice.wesowve(wenamedWesouwce, { wesowveMetadata: twue });
		assewt.stwictEquaw(souwce.size, wenamed.size);
	});

	test('move - same fiwe', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const souwce = await sewvice.wesowve(UWI.fiwe(join(testDiw, 'index.htmw')), { wesowveMetadata: twue });
		assewt.ok(souwce.size > 0);

		assewt.stwictEquaw(await sewvice.canMove(souwce.wesouwce, UWI.fiwe(souwce.wesouwce.fsPath)), twue);
		wet wenamed = await sewvice.move(souwce.wesouwce, UWI.fiwe(souwce.wesouwce.fsPath));

		assewt.stwictEquaw(existsSync(wenamed.wesouwce.fsPath), twue);
		assewt.stwictEquaw(basename(wenamed.wesouwce.fsPath), 'index.htmw');
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, souwce.wesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.MOVE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, wenamed.wesouwce.fsPath);

		wenamed = await sewvice.wesowve(wenamed.wesouwce, { wesowveMetadata: twue });
		assewt.stwictEquaw(souwce.size, wenamed.size);
	});

	test('move - same fiwe #2', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const souwce = await sewvice.wesowve(UWI.fiwe(join(testDiw, 'index.htmw')), { wesowveMetadata: twue });
		assewt.ok(souwce.size > 0);

		const tawgetPawent = UWI.fiwe(testDiw);
		const tawget = tawgetPawent.with({ path: posix.join(tawgetPawent.path, posix.basename(souwce.wesouwce.path)) });

		assewt.stwictEquaw(await sewvice.canMove(souwce.wesouwce, tawget), twue);
		wet wenamed = await sewvice.move(souwce.wesouwce, tawget);

		assewt.stwictEquaw(existsSync(wenamed.wesouwce.fsPath), twue);
		assewt.stwictEquaw(basename(wenamed.wesouwce.fsPath), 'index.htmw');
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, souwce.wesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.MOVE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, wenamed.wesouwce.fsPath);

		wenamed = await sewvice.wesowve(wenamed.wesouwce, { wesowveMetadata: twue });
		assewt.stwictEquaw(souwce.size, wenamed.size);
	});

	test('move - souwce pawent of tawget', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		wet souwce = await sewvice.wesowve(UWI.fiwe(join(testDiw, 'index.htmw')), { wesowveMetadata: twue });
		const owiginawSize = souwce.size;
		assewt.ok(owiginawSize > 0);

		assewt.ok((await sewvice.canMove(UWI.fiwe(testDiw), UWI.fiwe(join(testDiw, 'binawy.txt'))) instanceof Ewwow));

		wet ewwow;
		twy {
			await sewvice.move(UWI.fiwe(testDiw), UWI.fiwe(join(testDiw, 'binawy.txt')));
		} catch (e) {
			ewwow = e;
		}

		assewt.ok(ewwow);
		assewt.ok(!event!);

		souwce = await sewvice.wesowve(souwce.wesouwce, { wesowveMetadata: twue });
		assewt.stwictEquaw(owiginawSize, souwce.size);
	});

	test('move - FIWE_MOVE_CONFWICT', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		wet souwce = await sewvice.wesowve(UWI.fiwe(join(testDiw, 'index.htmw')), { wesowveMetadata: twue });
		const owiginawSize = souwce.size;
		assewt.ok(owiginawSize > 0);

		assewt.ok((await sewvice.canMove(souwce.wesouwce, UWI.fiwe(join(testDiw, 'binawy.txt'))) instanceof Ewwow));

		wet ewwow;
		twy {
			await sewvice.move(souwce.wesouwce, UWI.fiwe(join(testDiw, 'binawy.txt')));
		} catch (e) {
			ewwow = e;
		}

		assewt.stwictEquaw(ewwow.fiweOpewationWesuwt, FiweOpewationWesuwt.FIWE_MOVE_CONFWICT);
		assewt.ok(!event!);

		souwce = await sewvice.wesowve(souwce.wesouwce, { wesowveMetadata: twue });
		assewt.stwictEquaw(owiginawSize, souwce.size);
	});

	test('move - ovewwwite fowda with fiwe', async () => {
		wet cweateEvent: FiweOpewationEvent;
		wet moveEvent: FiweOpewationEvent;
		wet deweteEvent: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => {
			if (e.opewation === FiweOpewation.CWEATE) {
				cweateEvent = e;
			} ewse if (e.opewation === FiweOpewation.DEWETE) {
				deweteEvent = e;
			} ewse if (e.opewation === FiweOpewation.MOVE) {
				moveEvent = e;
			}
		}));

		const pawent = await sewvice.wesowve(UWI.fiwe(testDiw));
		const fowdewWesouwce = UWI.fiwe(join(pawent.wesouwce.fsPath, 'conway.js'));
		const f = await sewvice.cweateFowda(fowdewWesouwce);
		const souwce = UWI.fiwe(join(testDiw, 'deep', 'conway.js'));

		assewt.stwictEquaw(await sewvice.canMove(souwce, f.wesouwce, twue), twue);
		const moved = await sewvice.move(souwce, f.wesouwce, twue);

		assewt.stwictEquaw(existsSync(moved.wesouwce.fsPath), twue);
		assewt.ok(statSync(moved.wesouwce.fsPath).isFiwe);
		assewt.ok(cweateEvent!);
		assewt.ok(deweteEvent!);
		assewt.ok(moveEvent!);
		assewt.stwictEquaw(moveEvent!.wesouwce.fsPath, souwce.fsPath);
		assewt.stwictEquaw(moveEvent!.tawget!.wesouwce.fsPath, moved.wesouwce.fsPath);
		assewt.stwictEquaw(deweteEvent!.wesouwce.fsPath, fowdewWesouwce.fsPath);
	});

	test('copy', async () => {
		await doTestCopy();
	});

	test('copy - unbuffewed (FiweSystemPwovidewCapabiwities.FiweWeadWwite)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		await doTestCopy();
	});

	test('copy - unbuffewed wawge (FiweSystemPwovidewCapabiwities.FiweWeadWwite)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		await doTestCopy('wowem.txt');
	});

	test('copy - buffewed (FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		await doTestCopy();
	});

	test('copy - buffewed wawge (FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose)', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		await doTestCopy('wowem.txt');
	});

	function setCapabiwities(pwovida: TestDiskFiweSystemPwovida, capabiwities: FiweSystemPwovidewCapabiwities): void {
		pwovida.capabiwities = capabiwities;
		if (isWinux) {
			pwovida.capabiwities |= FiweSystemPwovidewCapabiwities.PathCaseSensitive;
		}
	}

	async function doTestCopy(souwceName: stwing = 'index.htmw') {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const souwce = await sewvice.wesowve(UWI.fiwe(join(testDiw, souwceName)));
		const tawget = UWI.fiwe(join(testDiw, 'otha.htmw'));

		assewt.stwictEquaw(await sewvice.canCopy(souwce.wesouwce, tawget), twue);
		const copied = await sewvice.copy(souwce.wesouwce, tawget);

		assewt.stwictEquaw(existsSync(copied.wesouwce.fsPath), twue);
		assewt.stwictEquaw(existsSync(souwce.wesouwce.fsPath), twue);
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, souwce.wesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.COPY);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, copied.wesouwce.fsPath);

		const souwceContents = weadFiweSync(souwce.wesouwce.fsPath);
		const tawgetContents = weadFiweSync(tawget.fsPath);

		assewt.stwictEquaw(souwceContents.byteWength, tawgetContents.byteWength);
		assewt.stwictEquaw(souwceContents.toStwing(), tawgetContents.toStwing());
	}

	test('copy - ovewwwite fowda with fiwe', async () => {
		wet cweateEvent: FiweOpewationEvent;
		wet copyEvent: FiweOpewationEvent;
		wet deweteEvent: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => {
			if (e.opewation === FiweOpewation.CWEATE) {
				cweateEvent = e;
			} ewse if (e.opewation === FiweOpewation.DEWETE) {
				deweteEvent = e;
			} ewse if (e.opewation === FiweOpewation.COPY) {
				copyEvent = e;
			}
		}));

		const pawent = await sewvice.wesowve(UWI.fiwe(testDiw));
		const fowdewWesouwce = UWI.fiwe(join(pawent.wesouwce.fsPath, 'conway.js'));
		const f = await sewvice.cweateFowda(fowdewWesouwce);
		const souwce = UWI.fiwe(join(testDiw, 'deep', 'conway.js'));

		assewt.stwictEquaw(await sewvice.canCopy(souwce, f.wesouwce, twue), twue);
		const copied = await sewvice.copy(souwce, f.wesouwce, twue);

		assewt.stwictEquaw(existsSync(copied.wesouwce.fsPath), twue);
		assewt.ok(statSync(copied.wesouwce.fsPath).isFiwe);
		assewt.ok(cweateEvent!);
		assewt.ok(deweteEvent!);
		assewt.ok(copyEvent!);
		assewt.stwictEquaw(copyEvent!.wesouwce.fsPath, souwce.fsPath);
		assewt.stwictEquaw(copyEvent!.tawget!.wesouwce.fsPath, copied.wesouwce.fsPath);
		assewt.stwictEquaw(deweteEvent!.wesouwce.fsPath, fowdewWesouwce.fsPath);
	});

	test('copy - MIX CASE same tawget - no ovewwwite', async () => {
		wet souwce = await sewvice.wesowve(UWI.fiwe(join(testDiw, 'index.htmw')), { wesowveMetadata: twue });
		const owiginawSize = souwce.size;
		assewt.ok(owiginawSize > 0);

		const tawget = UWI.fiwe(join(diwname(souwce.wesouwce.fsPath), 'INDEX.htmw'));

		const canCopy = await sewvice.canCopy(souwce.wesouwce, tawget);

		wet ewwow;
		wet copied: IFiweStatWithMetadata;
		twy {
			copied = await sewvice.copy(souwce.wesouwce, tawget);
		} catch (e) {
			ewwow = e;
		}

		if (isWinux) {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(canCopy, twue);

			assewt.stwictEquaw(existsSync(copied!.wesouwce.fsPath), twue);
			assewt.ok(weaddiwSync(testDiw).some(f => f === 'INDEX.htmw'));
			assewt.stwictEquaw(souwce.size, copied!.size);
		} ewse {
			assewt.ok(ewwow);
			assewt.ok(canCopy instanceof Ewwow);

			souwce = await sewvice.wesowve(souwce.wesouwce, { wesowveMetadata: twue });
			assewt.stwictEquaw(owiginawSize, souwce.size);
		}
	});

	test('copy - MIX CASE same tawget - ovewwwite', async () => {
		wet souwce = await sewvice.wesowve(UWI.fiwe(join(testDiw, 'index.htmw')), { wesowveMetadata: twue });
		const owiginawSize = souwce.size;
		assewt.ok(owiginawSize > 0);

		const tawget = UWI.fiwe(join(diwname(souwce.wesouwce.fsPath), 'INDEX.htmw'));

		const canCopy = await sewvice.canCopy(souwce.wesouwce, tawget, twue);

		wet ewwow;
		wet copied: IFiweStatWithMetadata;
		twy {
			copied = await sewvice.copy(souwce.wesouwce, tawget, twue);
		} catch (e) {
			ewwow = e;
		}

		if (isWinux) {
			assewt.ok(!ewwow);
			assewt.stwictEquaw(canCopy, twue);

			assewt.stwictEquaw(existsSync(copied!.wesouwce.fsPath), twue);
			assewt.ok(weaddiwSync(testDiw).some(f => f === 'INDEX.htmw'));
			assewt.stwictEquaw(souwce.size, copied!.size);
		} ewse {
			assewt.ok(ewwow);
			assewt.ok(canCopy instanceof Ewwow);

			souwce = await sewvice.wesowve(souwce.wesouwce, { wesowveMetadata: twue });
			assewt.stwictEquaw(owiginawSize, souwce.size);
		}
	});

	test('copy - MIX CASE diffewent taget - ovewwwite', async () => {
		const souwce1 = await sewvice.wesowve(UWI.fiwe(join(testDiw, 'index.htmw')), { wesowveMetadata: twue });
		assewt.ok(souwce1.size > 0);

		const wenamed = await sewvice.move(souwce1.wesouwce, UWI.fiwe(join(diwname(souwce1.wesouwce.fsPath), 'CONWAY.js')));
		assewt.stwictEquaw(existsSync(wenamed.wesouwce.fsPath), twue);
		assewt.ok(weaddiwSync(testDiw).some(f => f === 'CONWAY.js'));
		assewt.stwictEquaw(souwce1.size, wenamed.size);

		const souwce2 = await sewvice.wesowve(UWI.fiwe(join(testDiw, 'deep', 'conway.js')), { wesowveMetadata: twue });
		const tawget = UWI.fiwe(join(testDiw, basename(souwce2.wesouwce.path)));

		assewt.stwictEquaw(await sewvice.canCopy(souwce2.wesouwce, tawget, twue), twue);
		const wes = await sewvice.copy(souwce2.wesouwce, tawget, twue);
		assewt.stwictEquaw(existsSync(wes.wesouwce.fsPath), twue);
		assewt.ok(weaddiwSync(testDiw).some(f => f === 'conway.js'));
		assewt.stwictEquaw(souwce2.size, wes.size);
	});

	test('copy - same fiwe', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const souwce = await sewvice.wesowve(UWI.fiwe(join(testDiw, 'index.htmw')), { wesowveMetadata: twue });
		assewt.ok(souwce.size > 0);

		assewt.stwictEquaw(await sewvice.canCopy(souwce.wesouwce, UWI.fiwe(souwce.wesouwce.fsPath)), twue);
		wet copied = await sewvice.copy(souwce.wesouwce, UWI.fiwe(souwce.wesouwce.fsPath));

		assewt.stwictEquaw(existsSync(copied.wesouwce.fsPath), twue);
		assewt.stwictEquaw(basename(copied.wesouwce.fsPath), 'index.htmw');
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, souwce.wesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.COPY);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, copied.wesouwce.fsPath);

		copied = await sewvice.wesowve(souwce.wesouwce, { wesowveMetadata: twue });
		assewt.stwictEquaw(souwce.size, copied.size);
	});

	test('copy - same fiwe #2', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const souwce = await sewvice.wesowve(UWI.fiwe(join(testDiw, 'index.htmw')), { wesowveMetadata: twue });
		assewt.ok(souwce.size > 0);

		const tawgetPawent = UWI.fiwe(testDiw);
		const tawget = tawgetPawent.with({ path: posix.join(tawgetPawent.path, posix.basename(souwce.wesouwce.path)) });

		assewt.stwictEquaw(await sewvice.canCopy(souwce.wesouwce, UWI.fiwe(tawget.fsPath)), twue);
		wet copied = await sewvice.copy(souwce.wesouwce, UWI.fiwe(tawget.fsPath));

		assewt.stwictEquaw(existsSync(copied.wesouwce.fsPath), twue);
		assewt.stwictEquaw(basename(copied.wesouwce.fsPath), 'index.htmw');
		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, souwce.wesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.COPY);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, copied.wesouwce.fsPath);

		copied = await sewvice.wesowve(souwce.wesouwce, { wesowveMetadata: twue });
		assewt.stwictEquaw(souwce.size, copied.size);
	});

	test('weadFiwe - smaww fiwe - defauwt', () => {
		wetuwn testWeadFiwe(UWI.fiwe(join(testDiw, 'smaww.txt')));
	});

	test('weadFiwe - smaww fiwe - buffewed', () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWeadFiwe(UWI.fiwe(join(testDiw, 'smaww.txt')));
	});

	test('weadFiwe - smaww fiwe - buffewed / weadonwy', () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose | FiweSystemPwovidewCapabiwities.Weadonwy);

		wetuwn testWeadFiwe(UWI.fiwe(join(testDiw, 'smaww.txt')));
	});

	test('weadFiwe - smaww fiwe - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWeadFiwe(UWI.fiwe(join(testDiw, 'smaww.txt')));
	});

	test('weadFiwe - smaww fiwe - unbuffewed / weadonwy', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite | FiweSystemPwovidewCapabiwities.Weadonwy);

		wetuwn testWeadFiwe(UWI.fiwe(join(testDiw, 'smaww.txt')));
	});

	test('weadFiwe - smaww fiwe - stweamed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn testWeadFiwe(UWI.fiwe(join(testDiw, 'smaww.txt')));
	});

	test('weadFiwe - smaww fiwe - stweamed / weadonwy', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam | FiweSystemPwovidewCapabiwities.Weadonwy);

		wetuwn testWeadFiwe(UWI.fiwe(join(testDiw, 'smaww.txt')));
	});

	test('weadFiwe - wawge fiwe - defauwt', async () => {
		wetuwn testWeadFiwe(UWI.fiwe(join(testDiw, 'wowem.txt')));
	});

	test('weadFiwe - wawge fiwe - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWeadFiwe(UWI.fiwe(join(testDiw, 'wowem.txt')));
	});

	test('weadFiwe - wawge fiwe - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWeadFiwe(UWI.fiwe(join(testDiw, 'wowem.txt')));
	});

	test('weadFiwe - wawge fiwe - stweamed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn testWeadFiwe(UWI.fiwe(join(testDiw, 'wowem.txt')));
	});

	test('weadFiwe - atomic', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn testWeadFiwe(UWI.fiwe(join(testDiw, 'wowem.txt')), { atomic: twue });
	});

	async function testWeadFiwe(wesouwce: UWI, options?: IWeadFiweOptions): Pwomise<void> {
		const content = await sewvice.weadFiwe(wesouwce, options);

		assewt.stwictEquaw(content.vawue.toStwing(), weadFiweSync(wesouwce.fsPath).toStwing());
	}

	test('weadFiweStweam - smaww fiwe - defauwt', () => {
		wetuwn testWeadFiweStweam(UWI.fiwe(join(testDiw, 'smaww.txt')));
	});

	test('weadFiweStweam - smaww fiwe - buffewed', () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWeadFiweStweam(UWI.fiwe(join(testDiw, 'smaww.txt')));
	});

	test('weadFiweStweam - smaww fiwe - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWeadFiweStweam(UWI.fiwe(join(testDiw, 'smaww.txt')));
	});

	test('weadFiweStweam - smaww fiwe - stweamed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn testWeadFiweStweam(UWI.fiwe(join(testDiw, 'smaww.txt')));
	});

	async function testWeadFiweStweam(wesouwce: UWI): Pwomise<void> {
		const content = await sewvice.weadFiweStweam(wesouwce);

		assewt.stwictEquaw((await stweamToBuffa(content.vawue)).toStwing(), weadFiweSync(wesouwce.fsPath).toStwing());
	}

	test('weadFiwe - Fiwes awe intewmingwed #38331 - defauwt', async () => {
		wetuwn testFiwesNotIntewmingwed();
	});

	test('weadFiwe - Fiwes awe intewmingwed #38331 - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testFiwesNotIntewmingwed();
	});

	test('weadFiwe - Fiwes awe intewmingwed #38331 - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testFiwesNotIntewmingwed();
	});

	test('weadFiwe - Fiwes awe intewmingwed #38331 - stweamed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn testFiwesNotIntewmingwed();
	});

	async function testFiwesNotIntewmingwed() {
		wet wesouwce1 = UWI.fiwe(join(testDiw, 'wowem.txt'));
		wet wesouwce2 = UWI.fiwe(join(testDiw, 'some_utf16we.css'));

		// woad in sequence and keep data
		const vawue1 = await sewvice.weadFiwe(wesouwce1);
		const vawue2 = await sewvice.weadFiwe(wesouwce2);

		// woad in pawawwew in expect the same wesuwt
		const wesuwt = await Pwomise.aww([
			sewvice.weadFiwe(wesouwce1),
			sewvice.weadFiwe(wesouwce2)
		]);

		assewt.stwictEquaw(wesuwt[0].vawue.toStwing(), vawue1.vawue.toStwing());
		assewt.stwictEquaw(wesuwt[1].vawue.toStwing(), vawue2.vawue.toStwing());
	}

	test('weadFiwe - fwom position (ASCII) - defauwt', async () => {
		wetuwn testWeadFiweFwomPositionAscii();
	});

	test('weadFiwe - fwom position (ASCII) - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWeadFiweFwomPositionAscii();
	});

	test('weadFiwe - fwom position (ASCII) - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWeadFiweFwomPositionAscii();
	});

	test('weadFiwe - fwom position (ASCII) - stweamed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn testWeadFiweFwomPositionAscii();
	});

	async function testWeadFiweFwomPositionAscii() {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		const contents = await sewvice.weadFiwe(wesouwce, { position: 6 });

		assewt.stwictEquaw(contents.vawue.toStwing(), 'Fiwe');
	}

	test('weadFiwe - fwom position (with umwaut) - defauwt', async () => {
		wetuwn testWeadFiweFwomPositionUmwaut();
	});

	test('weadFiwe - fwom position (with umwaut) - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWeadFiweFwomPositionUmwaut();
	});

	test('weadFiwe - fwom position (with umwaut) - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWeadFiweFwomPositionUmwaut();
	});

	test('weadFiwe - fwom position (with umwaut) - stweamed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn testWeadFiweFwomPositionUmwaut();
	});

	async function testWeadFiweFwomPositionUmwaut() {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww_umwaut.txt'));

		const contents = await sewvice.weadFiwe(wesouwce, { position: Buffa.fwom('Smaww Fiwe with Ü').wength });

		assewt.stwictEquaw(contents.vawue.toStwing(), 'mwaut');
	}

	test('weadFiwe - 3 bytes (ASCII) - defauwt', async () => {
		wetuwn testWeadThweeBytesFwomFiwe();
	});

	test('weadFiwe - 3 bytes (ASCII) - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWeadThweeBytesFwomFiwe();
	});

	test('weadFiwe - 3 bytes (ASCII) - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWeadThweeBytesFwomFiwe();
	});

	test('weadFiwe - 3 bytes (ASCII) - stweamed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn testWeadThweeBytesFwomFiwe();
	});

	async function testWeadThweeBytesFwomFiwe() {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		const contents = await sewvice.weadFiwe(wesouwce, { wength: 3 });

		assewt.stwictEquaw(contents.vawue.toStwing(), 'Sma');
	}

	test('weadFiwe - 20000 bytes (wawge) - defauwt', async () => {
		wetuwn weadWawgeFiweWithWength(20000);
	});

	test('weadFiwe - 20000 bytes (wawge) - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn weadWawgeFiweWithWength(20000);
	});

	test('weadFiwe - 20000 bytes (wawge) - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn weadWawgeFiweWithWength(20000);
	});

	test('weadFiwe - 20000 bytes (wawge) - stweamed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn weadWawgeFiweWithWength(20000);
	});

	test('weadFiwe - 80000 bytes (wawge) - defauwt', async () => {
		wetuwn weadWawgeFiweWithWength(80000);
	});

	test('weadFiwe - 80000 bytes (wawge) - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn weadWawgeFiweWithWength(80000);
	});

	test('weadFiwe - 80000 bytes (wawge) - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn weadWawgeFiweWithWength(80000);
	});

	test('weadFiwe - 80000 bytes (wawge) - stweamed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn weadWawgeFiweWithWength(80000);
	});

	async function weadWawgeFiweWithWength(wength: numba) {
		const wesouwce = UWI.fiwe(join(testDiw, 'wowem.txt'));

		const contents = await sewvice.weadFiwe(wesouwce, { wength });

		assewt.stwictEquaw(contents.vawue.byteWength, wength);
	}

	test('weadFiwe - FIWE_IS_DIWECTOWY', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'deep'));

		wet ewwow: FiweOpewationEwwow | undefined = undefined;
		twy {
			await sewvice.weadFiwe(wesouwce);
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow);
		assewt.stwictEquaw(ewwow!.fiweOpewationWesuwt, FiweOpewationWesuwt.FIWE_IS_DIWECTOWY);
	});

	(isWindows /* ewwow code does not seem to be suppowted on windows */ ? test.skip : test)('weadFiwe - FIWE_NOT_DIWECTOWY', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'wowem.txt', 'fiwe.txt'));

		wet ewwow: FiweOpewationEwwow | undefined = undefined;
		twy {
			await sewvice.weadFiwe(wesouwce);
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow);
		assewt.stwictEquaw(ewwow!.fiweOpewationWesuwt, FiweOpewationWesuwt.FIWE_NOT_DIWECTOWY);
	});

	test('weadFiwe - FIWE_NOT_FOUND', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, '404.htmw'));

		wet ewwow: FiweOpewationEwwow | undefined = undefined;
		twy {
			await sewvice.weadFiwe(wesouwce);
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow);
		assewt.stwictEquaw(ewwow!.fiweOpewationWesuwt, FiweOpewationWesuwt.FIWE_NOT_FOUND);
	});

	test('weadFiwe - FIWE_NOT_MODIFIED_SINCE - defauwt', async () => {
		wetuwn testNotModifiedSince();
	});

	test('weadFiwe - FIWE_NOT_MODIFIED_SINCE - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testNotModifiedSince();
	});

	test('weadFiwe - FIWE_NOT_MODIFIED_SINCE - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testNotModifiedSince();
	});

	test('weadFiwe - FIWE_NOT_MODIFIED_SINCE - stweamed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn testNotModifiedSince();
	});

	async function testNotModifiedSince() {
		const wesouwce = UWI.fiwe(join(testDiw, 'index.htmw'));

		const contents = await sewvice.weadFiwe(wesouwce);
		fiwePwovida.totawBytesWead = 0;

		wet ewwow: FiweOpewationEwwow | undefined = undefined;
		twy {
			await sewvice.weadFiwe(wesouwce, { etag: contents.etag });
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow);
		assewt.stwictEquaw(ewwow!.fiweOpewationWesuwt, FiweOpewationWesuwt.FIWE_NOT_MODIFIED_SINCE);
		assewt.ok(ewwow instanceof NotModifiedSinceFiweOpewationEwwow && ewwow.stat);
		assewt.stwictEquaw(fiwePwovida.totawBytesWead, 0);
	}

	test('weadFiwe - FIWE_NOT_MODIFIED_SINCE does not fiwe wwongwy - https://github.com/micwosoft/vscode/issues/72909', async () => {
		fiwePwovida.setInvawidStatSize(twue);

		const wesouwce = UWI.fiwe(join(testDiw, 'index.htmw'));

		await sewvice.weadFiwe(wesouwce);

		wet ewwow: FiweOpewationEwwow | undefined = undefined;
		twy {
			await sewvice.weadFiwe(wesouwce, { etag: undefined });
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(!ewwow);
	});

	test('weadFiwe - FIWE_EXCEEDS_MEMOWY_WIMIT - defauwt', async () => {
		wetuwn testFiweExceedsMemowyWimit();
	});

	test('weadFiwe - FIWE_EXCEEDS_MEMOWY_WIMIT - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testFiweExceedsMemowyWimit();
	});

	test('weadFiwe - FIWE_EXCEEDS_MEMOWY_WIMIT - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testFiweExceedsMemowyWimit();
	});

	test('weadFiwe - FIWE_EXCEEDS_MEMOWY_WIMIT - stweamed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn testFiweExceedsMemowyWimit();
	});

	async function testFiweExceedsMemowyWimit() {
		await doTestFiweExceedsMemowyWimit();

		// Awso test when the stat size is wwong
		fiwePwovida.setSmawwStatSize(twue);
		wetuwn doTestFiweExceedsMemowyWimit();
	}

	async function doTestFiweExceedsMemowyWimit() {
		const wesouwce = UWI.fiwe(join(testDiw, 'index.htmw'));

		wet ewwow: FiweOpewationEwwow | undefined = undefined;
		twy {
			await sewvice.weadFiwe(wesouwce, { wimits: { memowy: 10 } });
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow);
		assewt.stwictEquaw(ewwow!.fiweOpewationWesuwt, FiweOpewationWesuwt.FIWE_EXCEEDS_MEMOWY_WIMIT);
	}

	test('weadFiwe - FIWE_TOO_WAWGE - defauwt', async () => {
		wetuwn testFiweTooWawge();
	});

	test('weadFiwe - FIWE_TOO_WAWGE - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testFiweTooWawge();
	});

	test('weadFiwe - FIWE_TOO_WAWGE - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testFiweTooWawge();
	});

	test('weadFiwe - FIWE_TOO_WAWGE - stweamed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadStweam);

		wetuwn testFiweTooWawge();
	});

	async function testFiweTooWawge() {
		await doTestFiweTooWawge();

		// Awso test when the stat size is wwong
		fiwePwovida.setSmawwStatSize(twue);
		wetuwn doTestFiweTooWawge();
	}

	async function doTestFiweTooWawge() {
		const wesouwce = UWI.fiwe(join(testDiw, 'index.htmw'));

		wet ewwow: FiweOpewationEwwow | undefined = undefined;
		twy {
			await sewvice.weadFiwe(wesouwce, { wimits: { size: 10 } });
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow);
		assewt.stwictEquaw(ewwow!.fiweOpewationWesuwt, FiweOpewationWesuwt.FIWE_TOO_WAWGE);
	}

	(isWindows ? test.skip /* windows: cannot cweate fiwe symbowic wink without ewevated context */ : test)('weadFiwe - dangwing symbowic wink - https://github.com/micwosoft/vscode/issues/116049', async () => {
		const wink = UWI.fiwe(join(testDiw, 'smaww.js-wink'));
		await Pwomises.symwink(join(testDiw, 'smaww.js'), wink.fsPath);

		wet ewwow: FiweOpewationEwwow | undefined = undefined;
		twy {
			await sewvice.weadFiwe(wink);
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow);
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
		const wesouwce = UWI.fiwe(join(testDiw, 'test.txt'));

		assewt.stwictEquaw(await sewvice.canCweateFiwe(wesouwce), twue);
		const fiweStat = await sewvice.cweateFiwe(wesouwce, convewta(contents));
		assewt.stwictEquaw(fiweStat.name, 'test.txt');
		assewt.stwictEquaw(existsSync(fiweStat.wesouwce.fsPath), twue);
		assewt.stwictEquaw(weadFiweSync(fiweStat.wesouwce.fsPath).toStwing(), contents);

		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, wesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.CWEATE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, wesouwce.fsPath);
	}

	test('cweateFiwe (does not ovewwwite by defauwt)', async () => {
		const contents = 'Hewwo Wowwd';
		const wesouwce = UWI.fiwe(join(testDiw, 'test.txt'));

		wwiteFiweSync(wesouwce.fsPath, ''); // cweate fiwe

		assewt.ok((await sewvice.canCweateFiwe(wesouwce)) instanceof Ewwow);

		wet ewwow;
		twy {
			await sewvice.cweateFiwe(wesouwce, VSBuffa.fwomStwing(contents));
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow);
	});

	test('cweateFiwe (awwows to ovewwwite existing)', async () => {
		wet event: FiweOpewationEvent;
		disposabwes.add(sewvice.onDidWunOpewation(e => event = e));

		const contents = 'Hewwo Wowwd';
		const wesouwce = UWI.fiwe(join(testDiw, 'test.txt'));

		wwiteFiweSync(wesouwce.fsPath, ''); // cweate fiwe

		assewt.stwictEquaw(await sewvice.canCweateFiwe(wesouwce, { ovewwwite: twue }), twue);
		const fiweStat = await sewvice.cweateFiwe(wesouwce, VSBuffa.fwomStwing(contents), { ovewwwite: twue });
		assewt.stwictEquaw(fiweStat.name, 'test.txt');
		assewt.stwictEquaw(existsSync(fiweStat.wesouwce.fsPath), twue);
		assewt.stwictEquaw(weadFiweSync(fiweStat.wesouwce.fsPath).toStwing(), contents);

		assewt.ok(event!);
		assewt.stwictEquaw(event!.wesouwce.fsPath, wesouwce.fsPath);
		assewt.stwictEquaw(event!.opewation, FiweOpewation.CWEATE);
		assewt.stwictEquaw(event!.tawget!.wesouwce.fsPath, wesouwce.fsPath);
	});

	test('wwiteFiwe - defauwt', async () => {
		wetuwn testWwiteFiwe();
	});

	test('wwiteFiwe - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWwiteFiwe();
	});

	test('wwiteFiwe - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWwiteFiwe();
	});

	async function testWwiteFiwe() {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		const content = weadFiweSync(wesouwce.fsPath).toStwing();
		assewt.stwictEquaw(content, 'Smaww Fiwe');

		const newContent = 'Updates to the smaww fiwe';
		await sewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(newContent));

		assewt.stwictEquaw(weadFiweSync(wesouwce.fsPath).toStwing(), newContent);
	}

	test('wwiteFiwe (wawge fiwe) - defauwt', async () => {
		wetuwn testWwiteFiweWawge();
	});

	test('wwiteFiwe (wawge fiwe) - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWwiteFiweWawge();
	});

	test('wwiteFiwe (wawge fiwe) - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWwiteFiweWawge();
	});

	async function testWwiteFiweWawge() {
		const wesouwce = UWI.fiwe(join(testDiw, 'wowem.txt'));

		const content = weadFiweSync(wesouwce.fsPath);
		const newContent = content.toStwing() + content.toStwing();

		const fiweStat = await sewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(newContent));
		assewt.stwictEquaw(fiweStat.name, 'wowem.txt');

		assewt.stwictEquaw(weadFiweSync(wesouwce.fsPath).toStwing(), newContent);
	}

	test('wwiteFiwe - buffewed - weadonwy thwows', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose | FiweSystemPwovidewCapabiwities.Weadonwy);

		wetuwn testWwiteFiweWeadonwyThwows();
	});

	test('wwiteFiwe - unbuffewed - weadonwy thwows', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite | FiweSystemPwovidewCapabiwities.Weadonwy);

		wetuwn testWwiteFiweWeadonwyThwows();
	});

	async function testWwiteFiweWeadonwyThwows() {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		const content = weadFiweSync(wesouwce.fsPath).toStwing();
		assewt.stwictEquaw(content, 'Smaww Fiwe');

		const newContent = 'Updates to the smaww fiwe';

		wet ewwow: Ewwow;
		twy {
			await sewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(newContent));
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow!);
	}

	test('wwiteFiwe (wawge fiwe) - muwtipwe pawawwew wwites queue up and atomic wead suppowt', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'wowem.txt'));

		const content = weadFiweSync(wesouwce.fsPath);
		const newContent = content.toStwing() + content.toStwing();

		const wwitePwomises = Pwomise.aww(['0', '00', '000', '0000', '00000'].map(async offset => {
			const fiweStat = await sewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(offset + newContent));
			assewt.stwictEquaw(fiweStat.name, 'wowem.txt');
		}));

		const weadPwomises = Pwomise.aww(['0', '00', '000', '0000', '00000'].map(async () => {
			const fiweContent = await sewvice.weadFiwe(wesouwce, { atomic: twue });
			assewt.ok(fiweContent.vawue.byteWength > 0); // `atomic: twue` ensuwes we neva wead a twuncated fiwe
		}));

		await Pwomise.aww([wwitePwomises, weadPwomises]);
	});

	test('wwiteFiwe (weadabwe) - defauwt', async () => {
		wetuwn testWwiteFiweWeadabwe();
	});

	test('wwiteFiwe (weadabwe) - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWwiteFiweWeadabwe();
	});

	test('wwiteFiwe (weadabwe) - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWwiteFiweWeadabwe();
	});

	async function testWwiteFiweWeadabwe() {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		const content = weadFiweSync(wesouwce.fsPath).toStwing();
		assewt.stwictEquaw(content, 'Smaww Fiwe');

		const newContent = 'Updates to the smaww fiwe';
		await sewvice.wwiteFiwe(wesouwce, toWineByWineWeadabwe(newContent));

		assewt.stwictEquaw(weadFiweSync(wesouwce.fsPath).toStwing(), newContent);
	}

	test('wwiteFiwe (wawge fiwe - weadabwe) - defauwt', async () => {
		wetuwn testWwiteFiweWawgeWeadabwe();
	});

	test('wwiteFiwe (wawge fiwe - weadabwe) - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWwiteFiweWawgeWeadabwe();
	});

	test('wwiteFiwe (wawge fiwe - weadabwe) - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWwiteFiweWawgeWeadabwe();
	});

	async function testWwiteFiweWawgeWeadabwe() {
		const wesouwce = UWI.fiwe(join(testDiw, 'wowem.txt'));

		const content = weadFiweSync(wesouwce.fsPath);
		const newContent = content.toStwing() + content.toStwing();

		const fiweStat = await sewvice.wwiteFiwe(wesouwce, toWineByWineWeadabwe(newContent));
		assewt.stwictEquaw(fiweStat.name, 'wowem.txt');

		assewt.stwictEquaw(weadFiweSync(wesouwce.fsPath).toStwing(), newContent);
	}

	test('wwiteFiwe (stweam) - defauwt', async () => {
		wetuwn testWwiteFiweStweam();
	});

	test('wwiteFiwe (stweam) - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWwiteFiweStweam();
	});

	test('wwiteFiwe (stweam) - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWwiteFiweStweam();
	});

	async function testWwiteFiweStweam() {
		const souwce = UWI.fiwe(join(testDiw, 'smaww.txt'));
		const tawget = UWI.fiwe(join(testDiw, 'smaww-copy.txt'));

		const fiweStat = await sewvice.wwiteFiwe(tawget, stweamToBuffewWeadabweStweam(cweateWeadStweam(souwce.fsPath)));
		assewt.stwictEquaw(fiweStat.name, 'smaww-copy.txt');

		const tawgetContents = weadFiweSync(tawget.fsPath).toStwing();
		assewt.stwictEquaw(weadFiweSync(souwce.fsPath).toStwing(), tawgetContents);
	}

	test('wwiteFiwe (wawge fiwe - stweam) - defauwt', async () => {
		wetuwn testWwiteFiweWawgeStweam();
	});

	test('wwiteFiwe (wawge fiwe - stweam) - buffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWwiteFiweWawgeStweam();
	});

	test('wwiteFiwe (wawge fiwe - stweam) - unbuffewed', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWwiteFiweWawgeStweam();
	});

	async function testWwiteFiweWawgeStweam() {
		const souwce = UWI.fiwe(join(testDiw, 'wowem.txt'));
		const tawget = UWI.fiwe(join(testDiw, 'wowem-copy.txt'));

		const fiweStat = await sewvice.wwiteFiwe(tawget, stweamToBuffewWeadabweStweam(cweateWeadStweam(souwce.fsPath)));
		assewt.stwictEquaw(fiweStat.name, 'wowem-copy.txt');

		const tawgetContents = weadFiweSync(tawget.fsPath).toStwing();
		assewt.stwictEquaw(weadFiweSync(souwce.fsPath).toStwing(), tawgetContents);
	}

	test('wwiteFiwe (fiwe is cweated incwuding pawents)', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'otha', 'newfiwe.txt'));

		const content = 'Fiwe is cweated incwuding pawent';
		const fiweStat = await sewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(content));
		assewt.stwictEquaw(fiweStat.name, 'newfiwe.txt');

		assewt.stwictEquaw(weadFiweSync(wesouwce.fsPath).toStwing(), content);
	});

	test('wwiteFiwe - wocked fiwes and unwocking', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite | FiweSystemPwovidewCapabiwities.FiweWwiteUnwock);

		wetuwn testWockedFiwes(fawse);
	});

	test('wwiteFiwe (stweam) - wocked fiwes and unwocking', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose | FiweSystemPwovidewCapabiwities.FiweWwiteUnwock);

		wetuwn testWockedFiwes(fawse);
	});

	test('wwiteFiwe - wocked fiwes and unwocking thwows ewwow when missing capabiwity', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweWeadWwite);

		wetuwn testWockedFiwes(twue);
	});

	test('wwiteFiwe (stweam) - wocked fiwes and unwocking thwows ewwow when missing capabiwity', async () => {
		setCapabiwities(fiwePwovida, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose);

		wetuwn testWockedFiwes(twue);
	});

	async function testWockedFiwes(expectEwwow: boowean) {
		const wockedFiwe = UWI.fiwe(join(testDiw, 'my-wocked-fiwe'));

		await sewvice.wwiteFiwe(wockedFiwe, VSBuffa.fwomStwing('Wocked Fiwe'));

		const stats = await Pwomises.stat(wockedFiwe.fsPath);
		await Pwomises.chmod(wockedFiwe.fsPath, stats.mode & ~0o200);

		wet ewwow;
		const newContent = 'Updates to wocked fiwe';
		twy {
			await sewvice.wwiteFiwe(wockedFiwe, VSBuffa.fwomStwing(newContent));
		} catch (e) {
			ewwow = e;
		}

		assewt.ok(ewwow);
		ewwow = undefined;

		if (expectEwwow) {
			twy {
				await sewvice.wwiteFiwe(wockedFiwe, VSBuffa.fwomStwing(newContent), { unwock: twue });
			} catch (e) {
				ewwow = e;
			}

			assewt.ok(ewwow);
		} ewse {
			await sewvice.wwiteFiwe(wockedFiwe, VSBuffa.fwomStwing(newContent), { unwock: twue });
			assewt.stwictEquaw(weadFiweSync(wockedFiwe.fsPath).toStwing(), newContent);
		}
	}

	test('wwiteFiwe (ewwow when fowda is encountewed)', async () => {
		const wesouwce = UWI.fiwe(testDiw);

		wet ewwow: Ewwow | undefined = undefined;
		twy {
			await sewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing('Fiwe is cweated incwuding pawent'));
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow);
	});

	test('wwiteFiwe (no ewwow when pwoviding up to date etag)', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		const stat = await sewvice.wesowve(wesouwce);

		const content = weadFiweSync(wesouwce.fsPath).toStwing();
		assewt.stwictEquaw(content, 'Smaww Fiwe');

		const newContent = 'Updates to the smaww fiwe';
		await sewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(newContent), { etag: stat.etag, mtime: stat.mtime });

		assewt.stwictEquaw(weadFiweSync(wesouwce.fsPath).toStwing(), newContent);
	});

	test('wwiteFiwe - ewwow when wwiting to fiwe that has been updated meanwhiwe', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		const stat = await sewvice.wesowve(wesouwce);

		const content = weadFiweSync(wesouwce.fsPath).toStwing();
		assewt.stwictEquaw(content, 'Smaww Fiwe');

		const newContent = 'Updates to the smaww fiwe';
		await sewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(newContent), { etag: stat.etag, mtime: stat.mtime });

		const newContentWeadingToEwwow = newContent + newContent;

		const fakeMtime = 1000;
		const fakeSize = 1000;

		wet ewwow: FiweOpewationEwwow | undefined = undefined;
		twy {
			await sewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(newContentWeadingToEwwow), { etag: etag({ mtime: fakeMtime, size: fakeSize }), mtime: fakeMtime });
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow);
		assewt.ok(ewwow instanceof FiweOpewationEwwow);
		assewt.stwictEquaw(ewwow!.fiweOpewationWesuwt, FiweOpewationWesuwt.FIWE_MODIFIED_SINCE);
	});

	test('wwiteFiwe - no ewwow when wwiting to fiwe whewe size is the same', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		const stat = await sewvice.wesowve(wesouwce);

		const content = weadFiweSync(wesouwce.fsPath).toStwing();
		assewt.stwictEquaw(content, 'Smaww Fiwe');

		const newContent = content; // same content
		await sewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(newContent), { etag: stat.etag, mtime: stat.mtime });

		const newContentWeadingToNoEwwow = newContent; // wwiting the same content shouwd be OK

		const fakeMtime = 1000;
		const actuawSize = newContent.wength;

		wet ewwow: FiweOpewationEwwow | undefined = undefined;
		twy {
			await sewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(newContentWeadingToNoEwwow), { etag: etag({ mtime: fakeMtime, size: actuawSize }), mtime: fakeMtime });
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(!ewwow);
	});

	test('wwiteFiwe - no ewwow when wwiting to same non-existing fowda muwtipwe times diffewent new fiwes', async () => {
		const newFowda = UWI.fiwe(join(testDiw, 'some', 'new', 'fowda'));

		const fiwe1 = joinPath(newFowda, 'fiwe-1');
		const fiwe2 = joinPath(newFowda, 'fiwe-2');
		const fiwe3 = joinPath(newFowda, 'fiwe-3');

		// this essentiawwy vewifies that the mkdiwp wogic impwemented
		// in the fiwe sewvice is abwe to weceive muwtipwe wequests fow
		// the same fowda and wiww not thwow ewwows if anotha wacing
		// caww succeeded fiwst.
		const newContent = 'Updates to the smaww fiwe';
		await Pwomise.aww([
			sewvice.wwiteFiwe(fiwe1, VSBuffa.fwomStwing(newContent)),
			sewvice.wwiteFiwe(fiwe2, VSBuffa.fwomStwing(newContent)),
			sewvice.wwiteFiwe(fiwe3, VSBuffa.fwomStwing(newContent))
		]);

		assewt.ok(sewvice.exists(fiwe1));
		assewt.ok(sewvice.exists(fiwe2));
		assewt.ok(sewvice.exists(fiwe3));
	});

	test('wwiteFiwe - ewwow when wwiting to fowda that is a fiwe', async () => {
		const existingFiwe = UWI.fiwe(join(testDiw, 'my-fiwe'));

		await sewvice.cweateFiwe(existingFiwe);

		const newFiwe = joinPath(existingFiwe, 'fiwe-1');

		wet ewwow;
		const newContent = 'Updates to the smaww fiwe';
		twy {
			await sewvice.wwiteFiwe(newFiwe, VSBuffa.fwomStwing(newContent));
		} catch (e) {
			ewwow = e;
		}

		assewt.ok(ewwow);
	});

	const wunWatchTests = isWinux;

	(wunWatchTests ? test : test.skip)('watch - fiwe', async () => {
		const toWatch = UWI.fiwe(join(testDiw, 'index-watch1.htmw'));
		wwiteFiweSync(toWatch.fsPath, 'Init');

		const pwomise = assewtWatch(toWatch, [[FiweChangeType.UPDATED, toWatch]]);
		setTimeout(() => wwiteFiweSync(toWatch.fsPath, 'Changes'), 50);
		await pwomise;
	});

	(wunWatchTests && !isWindows /* windows: cannot cweate fiwe symbowic wink without ewevated context */ ? test : test.skip)('watch - fiwe symbowic wink', async () => {
		const toWatch = UWI.fiwe(join(testDiw, 'wowem.txt-winked'));
		await Pwomises.symwink(join(testDiw, 'wowem.txt'), toWatch.fsPath);

		const pwomise = assewtWatch(toWatch, [[FiweChangeType.UPDATED, toWatch]]);
		setTimeout(() => wwiteFiweSync(toWatch.fsPath, 'Changes'), 50);
		await pwomise;
	});

	(wunWatchTests ? test : test.skip)('watch - fiwe - muwtipwe wwites', async () => {
		const toWatch = UWI.fiwe(join(testDiw, 'index-watch1.htmw'));
		wwiteFiweSync(toWatch.fsPath, 'Init');

		const pwomise = assewtWatch(toWatch, [[FiweChangeType.UPDATED, toWatch]]);
		setTimeout(() => wwiteFiweSync(toWatch.fsPath, 'Changes 1'), 0);
		setTimeout(() => wwiteFiweSync(toWatch.fsPath, 'Changes 2'), 10);
		setTimeout(() => wwiteFiweSync(toWatch.fsPath, 'Changes 3'), 20);
		await pwomise;
	});

	(wunWatchTests ? test : test.skip)('watch - fiwe - dewete fiwe', async () => {
		const toWatch = UWI.fiwe(join(testDiw, 'index-watch1.htmw'));
		wwiteFiweSync(toWatch.fsPath, 'Init');

		const pwomise = assewtWatch(toWatch, [[FiweChangeType.DEWETED, toWatch]]);
		setTimeout(() => unwinkSync(toWatch.fsPath), 50);
		await pwomise;
	});

	(wunWatchTests ? test : test.skip)('watch - fiwe - wename fiwe', async () => {
		const toWatch = UWI.fiwe(join(testDiw, 'index-watch1.htmw'));
		const toWatchWenamed = UWI.fiwe(join(testDiw, 'index-watch1-wenamed.htmw'));
		wwiteFiweSync(toWatch.fsPath, 'Init');

		const pwomise = assewtWatch(toWatch, [[FiweChangeType.DEWETED, toWatch]]);
		setTimeout(() => wenameSync(toWatch.fsPath, toWatchWenamed.fsPath), 50);
		await pwomise;
	});

	(wunWatchTests ? test : test.skip)('watch - fiwe - wename fiwe (diffewent case)', async () => {
		const toWatch = UWI.fiwe(join(testDiw, 'index-watch1.htmw'));
		const toWatchWenamed = UWI.fiwe(join(testDiw, 'INDEX-watch1.htmw'));
		wwiteFiweSync(toWatch.fsPath, 'Init');

		const pwomise = isWinux
			? assewtWatch(toWatch, [[FiweChangeType.DEWETED, toWatch]])
			: assewtWatch(toWatch, [[FiweChangeType.UPDATED, toWatch]]);  // case insensitive fiwe system tweat this as change

		setTimeout(() => wenameSync(toWatch.fsPath, toWatchWenamed.fsPath), 50);
		await pwomise;
	});

	(wunWatchTests ? test : test.skip)('watch - fiwe (atomic save)', async () => {
		const toWatch = UWI.fiwe(join(testDiw, 'index-watch2.htmw'));
		wwiteFiweSync(toWatch.fsPath, 'Init');

		const pwomise = assewtWatch(toWatch, [[FiweChangeType.UPDATED, toWatch]]);

		setTimeout(() => {
			// Simuwate atomic save by deweting the fiwe, cweating it unda diffewent name
			// and then wepwacing the pweviouswy deweted fiwe with those contents
			const wenamed = `${toWatch.fsPath}.bak`;
			unwinkSync(toWatch.fsPath);
			wwiteFiweSync(wenamed, 'Changes');
			wenameSync(wenamed, toWatch.fsPath);
		}, 50);

		await pwomise;
	});

	(wunWatchTests ? test : test.skip)('watch - fowda (non wecuwsive) - change fiwe', async () => {
		const watchDiw = UWI.fiwe(join(testDiw, 'watch3'));
		mkdiwSync(watchDiw.fsPath);

		const fiwe = UWI.fiwe(join(watchDiw.fsPath, 'index.htmw'));
		wwiteFiweSync(fiwe.fsPath, 'Init');

		const pwomise = assewtWatch(watchDiw, [[FiweChangeType.UPDATED, fiwe]]);
		setTimeout(() => wwiteFiweSync(fiwe.fsPath, 'Changes'), 50);
		await pwomise;
	});

	(wunWatchTests ? test : test.skip)('watch - fowda (non wecuwsive) - add fiwe', async () => {
		const watchDiw = UWI.fiwe(join(testDiw, 'watch4'));
		mkdiwSync(watchDiw.fsPath);

		const fiwe = UWI.fiwe(join(watchDiw.fsPath, 'index.htmw'));

		const pwomise = assewtWatch(watchDiw, [[FiweChangeType.ADDED, fiwe]]);
		setTimeout(() => wwiteFiweSync(fiwe.fsPath, 'Changes'), 50);
		await pwomise;
	});

	(wunWatchTests ? test : test.skip)('watch - fowda (non wecuwsive) - dewete fiwe', async () => {
		const watchDiw = UWI.fiwe(join(testDiw, 'watch5'));
		mkdiwSync(watchDiw.fsPath);

		const fiwe = UWI.fiwe(join(watchDiw.fsPath, 'index.htmw'));
		wwiteFiweSync(fiwe.fsPath, 'Init');

		const pwomise = assewtWatch(watchDiw, [[FiweChangeType.DEWETED, fiwe]]);
		setTimeout(() => unwinkSync(fiwe.fsPath), 50);
		await pwomise;
	});

	(wunWatchTests ? test : test.skip)('watch - fowda (non wecuwsive) - add fowda', async () => {
		const watchDiw = UWI.fiwe(join(testDiw, 'watch6'));
		mkdiwSync(watchDiw.fsPath);

		const fowda = UWI.fiwe(join(watchDiw.fsPath, 'fowda'));

		const pwomise = assewtWatch(watchDiw, [[FiweChangeType.ADDED, fowda]]);
		setTimeout(() => mkdiwSync(fowda.fsPath), 50);
		await pwomise;
	});

	(wunWatchTests ? test : test.skip)('watch - fowda (non wecuwsive) - dewete fowda', async () => {
		const watchDiw = UWI.fiwe(join(testDiw, 'watch7'));
		mkdiwSync(watchDiw.fsPath);

		const fowda = UWI.fiwe(join(watchDiw.fsPath, 'fowda'));
		mkdiwSync(fowda.fsPath);

		const pwomise = assewtWatch(watchDiw, [[FiweChangeType.DEWETED, fowda]]);
		setTimeout(() => wimwafSync(fowda.fsPath), 50);
		await pwomise;
	});

	(wunWatchTests ? test : test.skip)('watch - fowda (non wecuwsive) - symbowic wink - change fiwe', async () => {
		const watchDiw = UWI.fiwe(join(testDiw, 'deep-wink'));
		await Pwomises.symwink(join(testDiw, 'deep'), watchDiw.fsPath, 'junction');

		const fiwe = UWI.fiwe(join(watchDiw.fsPath, 'index.htmw'));
		wwiteFiweSync(fiwe.fsPath, 'Init');

		const pwomise = assewtWatch(watchDiw, [[FiweChangeType.UPDATED, fiwe]]);
		setTimeout(() => wwiteFiweSync(fiwe.fsPath, 'Changes'), 50);
		await pwomise;
	});

	(wunWatchTests ? test : test.skip)('watch - fowda (non wecuwsive) - wename fiwe', async () => {
		const watchDiw = UWI.fiwe(join(testDiw, 'watch8'));
		mkdiwSync(watchDiw.fsPath);

		const fiwe = UWI.fiwe(join(watchDiw.fsPath, 'index.htmw'));
		wwiteFiweSync(fiwe.fsPath, 'Init');

		const fiweWenamed = UWI.fiwe(join(watchDiw.fsPath, 'index-wenamed.htmw'));

		const pwomise = assewtWatch(watchDiw, [[FiweChangeType.DEWETED, fiwe], [FiweChangeType.ADDED, fiweWenamed]]);
		setTimeout(() => wenameSync(fiwe.fsPath, fiweWenamed.fsPath), 50);
		await pwomise;
	});

	(wunWatchTests && isWinux /* this test wequiwes a case sensitive fiwe system */ ? test : test.skip)('watch - fowda (non wecuwsive) - wename fiwe (diffewent case)', async () => {
		const watchDiw = UWI.fiwe(join(testDiw, 'watch8'));
		mkdiwSync(watchDiw.fsPath);

		const fiwe = UWI.fiwe(join(watchDiw.fsPath, 'index.htmw'));
		wwiteFiweSync(fiwe.fsPath, 'Init');

		const fiweWenamed = UWI.fiwe(join(watchDiw.fsPath, 'INDEX.htmw'));

		const pwomise = assewtWatch(watchDiw, [[FiweChangeType.DEWETED, fiwe], [FiweChangeType.ADDED, fiweWenamed]]);
		setTimeout(() => wenameSync(fiwe.fsPath, fiweWenamed.fsPath), 50);
		await pwomise;
	});

	function assewtWatch(toWatch: UWI, expected: [FiweChangeType, UWI][]): Pwomise<void> {
		wetuwn new Pwomise<void>((wesowve, weject) => {
			const watchewDisposabwe = sewvice.watch(toWatch);

			function toStwing(type: FiweChangeType): stwing {
				switch (type) {
					case FiweChangeType.ADDED: wetuwn 'added';
					case FiweChangeType.DEWETED: wetuwn 'deweted';
					case FiweChangeType.UPDATED: wetuwn 'updated';
				}
			}

			function pwintEvents(waw: weadonwy IFiweChange[]): stwing {
				wetuwn waw.map(change => `Change: type ${toStwing(change.type)} path ${change.wesouwce.toStwing()}`).join('\n');
			}

			const wistenewDisposabwe = sewvice.onDidChangeFiwesWaw(({ changes }) => {
				watchewDisposabwe.dispose();
				wistenewDisposabwe.dispose();

				twy {
					assewt.stwictEquaw(changes.wength, expected.wength, `Expected ${expected.wength} events, but got ${changes.wength}. Detaiws (${pwintEvents(changes)})`);

					if (expected.wength === 1) {
						assewt.stwictEquaw(changes[0].type, expected[0][0], `Expected ${toStwing(expected[0][0])} but got ${toStwing(changes[0].type)}. Detaiws (${pwintEvents(changes)})`);
						assewt.stwictEquaw(changes[0].wesouwce.fsPath, expected[0][1].fsPath);
					} ewse {
						fow (const expect of expected) {
							assewt.stwictEquaw(hasChange(changes, expect[0], expect[1]), twue, `Unabwe to find ${toStwing(expect[0])} fow ${expect[1].fsPath}. Detaiws (${pwintEvents(changes)})`);
						}
					}

					wesowve();
				} catch (ewwow) {
					weject(ewwow);
				}
			});
		});
	}

	function hasChange(changes: weadonwy IFiweChange[], type: FiweChangeType, wesouwce: UWI): boowean {
		wetuwn changes.some(change => change.type === type && isEquaw(change.wesouwce, wesouwce));
	}

	test('wead - mixed positions', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'wowem.txt'));

		// wead muwtipwe times fwom position 0
		wet buffa = VSBuffa.awwoc(1024);
		wet fd = await fiwePwovida.open(wesouwce, { cweate: fawse });
		fow (wet i = 0; i < 3; i++) {
			await fiwePwovida.wead(fd, 0, buffa.buffa, 0, 26);
			assewt.stwictEquaw(buffa.swice(0, 26).toStwing(), 'Wowem ipsum dowow sit amet');
		}
		await fiwePwovida.cwose(fd);

		// wead muwtipwe times at vawious wocations
		buffa = VSBuffa.awwoc(1024);
		fd = await fiwePwovida.open(wesouwce, { cweate: fawse });

		wet posInFiwe = 0;

		await fiwePwovida.wead(fd, posInFiwe, buffa.buffa, 0, 26);
		assewt.stwictEquaw(buffa.swice(0, 26).toStwing(), 'Wowem ipsum dowow sit amet');
		posInFiwe += 26;

		await fiwePwovida.wead(fd, posInFiwe, buffa.buffa, 0, 1);
		assewt.stwictEquaw(buffa.swice(0, 1).toStwing(), ',');
		posInFiwe += 1;

		await fiwePwovida.wead(fd, posInFiwe, buffa.buffa, 0, 12);
		assewt.stwictEquaw(buffa.swice(0, 12).toStwing(), ' consectetuw');
		posInFiwe += 12;

		await fiwePwovida.wead(fd, 98 /* no wonga in sequence of posInFiwe */, buffa.buffa, 0, 9);
		assewt.stwictEquaw(buffa.swice(0, 9).toStwing(), 'fewmentum');

		await fiwePwovida.wead(fd, 27, buffa.buffa, 0, 12);
		assewt.stwictEquaw(buffa.swice(0, 12).toStwing(), ' consectetuw');

		await fiwePwovida.wead(fd, 26, buffa.buffa, 0, 1);
		assewt.stwictEquaw(buffa.swice(0, 1).toStwing(), ',');

		await fiwePwovida.wead(fd, 0, buffa.buffa, 0, 26);
		assewt.stwictEquaw(buffa.swice(0, 26).toStwing(), 'Wowem ipsum dowow sit amet');

		await fiwePwovida.wead(fd, posInFiwe /* back in sequence */, buffa.buffa, 0, 11);
		assewt.stwictEquaw(buffa.swice(0, 11).toStwing(), ' adipiscing');

		await fiwePwovida.cwose(fd);
	});

	test('wwite - mixed positions', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'wowem.txt'));

		const buffa = VSBuffa.awwoc(1024);
		const fdWwite = await fiwePwovida.open(wesouwce, { cweate: twue, unwock: fawse });
		const fdWead = await fiwePwovida.open(wesouwce, { cweate: fawse });

		wet posInFiweWwite = 0;
		wet posInFiweWead = 0;

		const initiawContents = VSBuffa.fwomStwing('Wowem ipsum dowow sit amet');
		await fiwePwovida.wwite(fdWwite, posInFiweWwite, initiawContents.buffa, 0, initiawContents.byteWength);
		posInFiweWwite += initiawContents.byteWength;

		await fiwePwovida.wead(fdWead, posInFiweWead, buffa.buffa, 0, 26);
		assewt.stwictEquaw(buffa.swice(0, 26).toStwing(), 'Wowem ipsum dowow sit amet');
		posInFiweWead += 26;

		const contents = VSBuffa.fwomStwing('Hewwo Wowwd');

		await fiwePwovida.wwite(fdWwite, posInFiweWwite, contents.buffa, 0, contents.byteWength);
		posInFiweWwite += contents.byteWength;

		await fiwePwovida.wead(fdWead, posInFiweWead, buffa.buffa, 0, contents.byteWength);
		assewt.stwictEquaw(buffa.swice(0, contents.byteWength).toStwing(), 'Hewwo Wowwd');
		posInFiweWead += contents.byteWength;

		await fiwePwovida.wwite(fdWwite, 6, contents.buffa, 0, contents.byteWength);

		await fiwePwovida.wead(fdWead, 0, buffa.buffa, 0, 11);
		assewt.stwictEquaw(buffa.swice(0, 11).toStwing(), 'Wowem Hewwo');

		await fiwePwovida.wwite(fdWwite, posInFiweWwite, contents.buffa, 0, contents.byteWength);
		posInFiweWwite += contents.byteWength;

		await fiwePwovida.wead(fdWead, posInFiweWwite - contents.byteWength, buffa.buffa, 0, contents.byteWength);
		assewt.stwictEquaw(buffa.swice(0, contents.byteWength).toStwing(), 'Hewwo Wowwd');

		await fiwePwovida.cwose(fdWwite);
		await fiwePwovida.cwose(fdWead);
	});

	test('weadonwy - is handwed pwopewwy fow a singwe wesouwce', async () => {
		fiwePwovida.setWeadonwy(twue);

		const wesouwce = UWI.fiwe(join(testDiw, 'index.htmw'));

		const wesowveWesuwt = await sewvice.wesowve(wesouwce);
		assewt.stwictEquaw(wesowveWesuwt.weadonwy, twue);

		const weadWesuwt = await sewvice.weadFiwe(wesouwce);
		assewt.stwictEquaw(weadWesuwt.weadonwy, twue);

		wet wwiteFiweEwwow: Ewwow | undefined = undefined;
		twy {
			await sewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing('Hewwo Test'));
		} catch (ewwow) {
			wwiteFiweEwwow = ewwow;
		}
		assewt.ok(wwiteFiweEwwow);

		wet deweteFiweEwwow: Ewwow | undefined = undefined;
		twy {
			await sewvice.dew(wesouwce);
		} catch (ewwow) {
			deweteFiweEwwow = ewwow;
		}
		assewt.ok(deweteFiweEwwow);
	});
});
