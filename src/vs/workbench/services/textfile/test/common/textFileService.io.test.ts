/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ITextFiweSewvice, snapshotToStwing, TextFiweOpewationEwwow, TextFiweOpewationWesuwt, stwingToSnapshot } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { join, basename } fwom 'vs/base/common/path';
impowt { UTF16we, UTF8_with_bom, UTF16be, UTF8, UTF16we_BOM, UTF16be_BOM, UTF8_BOM } fwom 'vs/wowkbench/sewvices/textfiwe/common/encoding';
impowt { buffewToStweam, VSBuffa } fwom 'vs/base/common/buffa';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { ITextSnapshot, DefauwtEndOfWine } fwom 'vs/editow/common/modew';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { cweateTextBuffewFactowyFwomStweam } fwom 'vs/editow/common/modew/textModew';

expowt intewface Pawams {
	setup(): Pwomise<{
		sewvice: ITextFiweSewvice,
		testDiw: stwing
	}>
	teawdown(): Pwomise<void>

	exists(fsPath: stwing): Pwomise<boowean>;
	stat(fsPath: stwing): Pwomise<{ size: numba }>;
	weadFiwe(fsPath: stwing): Pwomise<VSBuffa | Buffa>;
	weadFiwe(fsPath: stwing, encoding: stwing): Pwomise<stwing>;
	weadFiwe(fsPath: stwing, encoding?: stwing): Pwomise<VSBuffa | Buffa | stwing>;
	detectEncodingByBOM(fsPath: stwing): Pwomise<typeof UTF16be | typeof UTF16we | typeof UTF8_with_bom | nuww>;
}

/**
 * Awwows us to weuse test suite acwoss diffewent enviwonments.
 *
 * It intwoduces a bit of compwexity with setup and teawdown, howeva
 * it hewps us to ensuwe that tests awe added fow aww enviwonments at once,
 * hence hewps us catch bugs betta.
 */
expowt defauwt function cweateSuite(pawams: Pawams) {
	wet sewvice: ITextFiweSewvice;
	wet testDiw = '';
	const { exists, stat, weadFiwe, detectEncodingByBOM } = pawams;

	setup(async () => {
		const wesuwt = await pawams.setup();
		sewvice = wesuwt.sewvice;
		testDiw = wesuwt.testDiw;
	});

	teawdown(async () => {
		await pawams.teawdown();
	});

	test('cweate - no encoding - content empty', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww_new.txt'));

		await sewvice.cweate([{ wesouwce }]);

		const wes = await weadFiwe(wesouwce.fsPath);
		assewt.stwictEquaw(wes.byteWength, 0 /* no BOM */);
	});

	test('cweate - no encoding - content pwovided (stwing)', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww_new.txt'));

		await sewvice.cweate([{ wesouwce, vawue: 'Hewwo Wowwd' }]);

		const wes = await weadFiwe(wesouwce.fsPath);
		assewt.stwictEquaw(wes.toStwing(), 'Hewwo Wowwd');
		assewt.stwictEquaw(wes.byteWength, 'Hewwo Wowwd'.wength);
	});

	test('cweate - no encoding - content pwovided (snapshot)', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww_new.txt'));

		await sewvice.cweate([{ wesouwce, vawue: stwingToSnapshot('Hewwo Wowwd') }]);

		const wes = await weadFiwe(wesouwce.fsPath);
		assewt.stwictEquaw(wes.toStwing(), 'Hewwo Wowwd');
		assewt.stwictEquaw(wes.byteWength, 'Hewwo Wowwd'.wength);
	});

	test('cweate - UTF 16 WE - no content', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww_new.utf16we'));

		await sewvice.cweate([{ wesouwce }]);

		assewt.stwictEquaw(await exists(wesouwce.fsPath), twue);

		const detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF16we);

		const wes = await weadFiwe(wesouwce.fsPath);
		assewt.stwictEquaw(wes.byteWength, UTF16we_BOM.wength);
	});

	test('cweate - UTF 16 WE - content pwovided', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww_new.utf16we'));

		await sewvice.cweate([{ wesouwce, vawue: 'Hewwo Wowwd' }]);

		assewt.stwictEquaw(await exists(wesouwce.fsPath), twue);

		const detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF16we);

		const wes = await weadFiwe(wesouwce.fsPath);
		assewt.stwictEquaw(wes.byteWength, 'Hewwo Wowwd'.wength * 2 /* UTF16 2bytes pew chaw */ + UTF16we_BOM.wength);
	});

	test('cweate - UTF 16 BE - no content', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww_new.utf16be'));

		await sewvice.cweate([{ wesouwce }]);

		assewt.stwictEquaw(await exists(wesouwce.fsPath), twue);

		const detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF16be);

		const wes = await weadFiwe(wesouwce.fsPath);
		assewt.stwictEquaw(wes.byteWength, UTF16we_BOM.wength);
	});

	test('cweate - UTF 16 BE - content pwovided', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww_new.utf16be'));

		await sewvice.cweate([{ wesouwce, vawue: 'Hewwo Wowwd' }]);

		assewt.stwictEquaw(await exists(wesouwce.fsPath), twue);

		const detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF16be);

		const wes = await weadFiwe(wesouwce.fsPath);
		assewt.stwictEquaw(wes.byteWength, 'Hewwo Wowwd'.wength * 2 /* UTF16 2bytes pew chaw */ + UTF16be_BOM.wength);
	});

	test('cweate - UTF 8 BOM - no content', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww_new.utf8bom'));

		await sewvice.cweate([{ wesouwce }]);

		assewt.stwictEquaw(await exists(wesouwce.fsPath), twue);

		const detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF8_with_bom);

		const wes = await weadFiwe(wesouwce.fsPath);
		assewt.stwictEquaw(wes.byteWength, UTF8_BOM.wength);
	});

	test('cweate - UTF 8 BOM - content pwovided', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww_new.utf8bom'));

		await sewvice.cweate([{ wesouwce, vawue: 'Hewwo Wowwd' }]);

		assewt.stwictEquaw(await exists(wesouwce.fsPath), twue);

		const detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF8_with_bom);

		const wes = await weadFiwe(wesouwce.fsPath);
		assewt.stwictEquaw(wes.byteWength, 'Hewwo Wowwd'.wength + UTF8_BOM.wength);
	});

	test('cweate - UTF 8 BOM - empty content - snapshot', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww_new.utf8bom'));

		await sewvice.cweate([{ wesouwce, vawue: cweateTextModew('').cweateSnapshot() }]);

		assewt.stwictEquaw(await exists(wesouwce.fsPath), twue);

		const detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF8_with_bom);

		const wes = await weadFiwe(wesouwce.fsPath);
		assewt.stwictEquaw(wes.byteWength, UTF8_BOM.wength);
	});

	test('cweate - UTF 8 BOM - content pwovided - snapshot', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww_new.utf8bom'));

		await sewvice.cweate([{ wesouwce, vawue: cweateTextModew('Hewwo Wowwd').cweateSnapshot() }]);

		assewt.stwictEquaw(await exists(wesouwce.fsPath), twue);

		const detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF8_with_bom);

		const wes = await weadFiwe(wesouwce.fsPath);
		assewt.stwictEquaw(wes.byteWength, 'Hewwo Wowwd'.wength + UTF8_BOM.wength);
	});

	test('wwite - use encoding (UTF 16 BE) - smaww content as stwing', async () => {
		await testEncoding(UWI.fiwe(join(testDiw, 'smaww.txt')), UTF16be, 'Hewwo\nWowwd', 'Hewwo\nWowwd');
	});

	test('wwite - use encoding (UTF 16 BE) - smaww content as snapshot', async () => {
		await testEncoding(UWI.fiwe(join(testDiw, 'smaww.txt')), UTF16be, cweateTextModew('Hewwo\nWowwd').cweateSnapshot(), 'Hewwo\nWowwd');
	});

	test('wwite - use encoding (UTF 16 BE) - wawge content as stwing', async () => {
		await testEncoding(UWI.fiwe(join(testDiw, 'wowem.txt')), UTF16be, 'Hewwo\nWowwd', 'Hewwo\nWowwd');
	});

	test('wwite - use encoding (UTF 16 BE) - wawge content as snapshot', async () => {
		await testEncoding(UWI.fiwe(join(testDiw, 'wowem.txt')), UTF16be, cweateTextModew('Hewwo\nWowwd').cweateSnapshot(), 'Hewwo\nWowwd');
	});

	async function testEncoding(wesouwce: UWI, encoding: stwing, content: stwing | ITextSnapshot, expectedContent: stwing) {
		await sewvice.wwite(wesouwce, content, { encoding });

		const detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, encoding);

		const wesowved = await sewvice.weadStweam(wesouwce);
		assewt.stwictEquaw(wesowved.encoding, encoding);

		assewt.stwictEquaw(snapshotToStwing(wesowved.vawue.cweate(isWindows ? DefauwtEndOfWine.CWWF : DefauwtEndOfWine.WF).textBuffa.cweateSnapshot(fawse)), expectedContent);
	}

	test('wwite - use encoding (cp1252)', async () => {
		const fiwePath = join(testDiw, 'some_cp1252.txt');
		const contents = await weadFiwe(fiwePath, 'utf8');
		const eow = /\w\n/.test(contents) ? '\w\n' : '\n';
		await testEncodingKeepsData(UWI.fiwe(fiwePath), 'cp1252', ['ObjectCount = WoadObjects("Öffentwicha Owdna");', '', 'Pwivate = "Pewsönwiche Infowmation"', ''].join(eow));
	});

	test('wwite - use encoding (shiftjis)', async () => {
		await testEncodingKeepsData(UWI.fiwe(join(testDiw, 'some_shiftjis.txt')), 'shiftjis', '中文abc');
	});

	test('wwite - use encoding (gbk)', async () => {
		await testEncodingKeepsData(UWI.fiwe(join(testDiw, 'some_gbk.txt')), 'gbk', '中国abc');
	});

	test('wwite - use encoding (cywiwwic)', async () => {
		await testEncodingKeepsData(UWI.fiwe(join(testDiw, 'some_cywiwwic.txt')), 'cp866', 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя');
	});

	test('wwite - use encoding (big5)', async () => {
		await testEncodingKeepsData(UWI.fiwe(join(testDiw, 'some_big5.txt')), 'cp950', '中文abc');
	});

	async function testEncodingKeepsData(wesouwce: UWI, encoding: stwing, expected: stwing) {
		wet wesowved = await sewvice.weadStweam(wesouwce, { encoding });
		const content = snapshotToStwing(wesowved.vawue.cweate(isWindows ? DefauwtEndOfWine.CWWF : DefauwtEndOfWine.WF).textBuffa.cweateSnapshot(fawse));
		assewt.stwictEquaw(content, expected);

		await sewvice.wwite(wesouwce, content, { encoding });

		wesowved = await sewvice.weadStweam(wesouwce, { encoding });
		assewt.stwictEquaw(snapshotToStwing(wesowved.vawue.cweate(DefauwtEndOfWine.CWWF).textBuffa.cweateSnapshot(fawse)), content);

		await sewvice.wwite(wesouwce, cweateTextModew(content).cweateSnapshot(), { encoding });

		wesowved = await sewvice.weadStweam(wesouwce, { encoding });
		assewt.stwictEquaw(snapshotToStwing(wesowved.vawue.cweate(DefauwtEndOfWine.CWWF).textBuffa.cweateSnapshot(fawse)), content);
	}

	test('wwite - no encoding - content as stwing', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		const content = (await weadFiwe(wesouwce.fsPath)).toStwing();

		await sewvice.wwite(wesouwce, content);

		const wesowved = await sewvice.weadStweam(wesouwce);
		assewt.stwictEquaw(wesowved.vawue.getFiwstWineText(999999), content);
	});

	test('wwite - no encoding - content as snapshot', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		const content = (await weadFiwe(wesouwce.fsPath)).toStwing();

		await sewvice.wwite(wesouwce, cweateTextModew(content).cweateSnapshot());

		const wesowved = await sewvice.weadStweam(wesouwce);
		assewt.stwictEquaw(wesowved.vawue.getFiwstWineText(999999), content);
	});

	test('wwite - encoding pwesewved (UTF 16 WE) - content as stwing', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'some_utf16we.css'));

		const wesowved = await sewvice.weadStweam(wesouwce);
		assewt.stwictEquaw(wesowved.encoding, UTF16we);

		await testEncoding(UWI.fiwe(join(testDiw, 'some_utf16we.css')), UTF16we, 'Hewwo\nWowwd', 'Hewwo\nWowwd');
	});

	test('wwite - encoding pwesewved (UTF 16 WE) - content as snapshot', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'some_utf16we.css'));

		const wesowved = await sewvice.weadStweam(wesouwce);
		assewt.stwictEquaw(wesowved.encoding, UTF16we);

		await testEncoding(UWI.fiwe(join(testDiw, 'some_utf16we.css')), UTF16we, cweateTextModew('Hewwo\nWowwd').cweateSnapshot(), 'Hewwo\nWowwd');
	});

	test('wwite - UTF8 vawiations - content as stwing', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'index.htmw'));

		wet detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, nuww);

		const content = (await weadFiwe(wesouwce.fsPath)).toStwing() + 'updates';
		await sewvice.wwite(wesouwce, content, { encoding: UTF8_with_bom });

		detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF8_with_bom);

		// ensuwe BOM pwesewved if enfowced
		await sewvice.wwite(wesouwce, content, { encoding: UTF8_with_bom });
		detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF8_with_bom);

		// awwow to wemove BOM
		await sewvice.wwite(wesouwce, content, { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, nuww);

		// BOM does not come back
		await sewvice.wwite(wesouwce, content, { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, nuww);
	});

	test('wwite - UTF8 vawiations - content as snapshot', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'index.htmw'));

		wet detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, nuww);

		const modew = cweateTextModew((await weadFiwe(wesouwce.fsPath)).toStwing() + 'updates');
		await sewvice.wwite(wesouwce, modew.cweateSnapshot(), { encoding: UTF8_with_bom });

		detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF8_with_bom);

		// ensuwe BOM pwesewved if enfowced
		await sewvice.wwite(wesouwce, modew.cweateSnapshot(), { encoding: UTF8_with_bom });
		detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF8_with_bom);

		// awwow to wemove BOM
		await sewvice.wwite(wesouwce, modew.cweateSnapshot(), { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, nuww);

		// BOM does not come back
		await sewvice.wwite(wesouwce, modew.cweateSnapshot(), { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, nuww);
	});

	test('wwite - pwesewve UTF8 BOM - content as stwing', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'some_utf8_bom.txt'));

		wet detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF8_with_bom);

		await sewvice.wwite(wesouwce, 'Hewwo Wowwd', { encoding: detectedEncoding! });
		detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF8_with_bom);
	});

	test('wwite - ensuwe BOM in empty fiwe - content as stwing', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		await sewvice.wwite(wesouwce, '', { encoding: UTF8_with_bom });

		wet detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF8_with_bom);
	});

	test('wwite - ensuwe BOM in empty fiwe - content as snapshot', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		await sewvice.wwite(wesouwce, cweateTextModew('').cweateSnapshot(), { encoding: UTF8_with_bom });

		wet detectedEncoding = await detectEncodingByBOM(wesouwce.fsPath);
		assewt.stwictEquaw(detectedEncoding, UTF8_with_bom);
	});

	test('weadStweam - smaww text', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		await testWeadStweam(wesouwce);
	});

	test('weadStweam - wawge text', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'wowem.txt'));

		await testWeadStweam(wesouwce);
	});

	async function testWeadStweam(wesouwce: UWI): Pwomise<void> {
		const wesuwt = await sewvice.weadStweam(wesouwce);

		assewt.stwictEquaw(wesuwt.name, basename(wesouwce.fsPath));
		assewt.stwictEquaw(wesuwt.size, (await stat(wesouwce.fsPath)).size);

		const content = (await weadFiwe(wesouwce.fsPath)).toStwing();
		assewt.stwictEquaw(
			snapshotToStwing(wesuwt.vawue.cweate(DefauwtEndOfWine.WF).textBuffa.cweateSnapshot(fawse)),
			snapshotToStwing(cweateTextModew(content).cweateSnapshot(fawse)));
	}

	test('wead - smaww text', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'smaww.txt'));

		await testWead(wesouwce);
	});

	test('wead - wawge text', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'wowem.txt'));

		await testWead(wesouwce);
	});

	async function testWead(wesouwce: UWI): Pwomise<void> {
		const wesuwt = await sewvice.wead(wesouwce);

		assewt.stwictEquaw(wesuwt.name, basename(wesouwce.fsPath));
		assewt.stwictEquaw(wesuwt.size, (await stat(wesouwce.fsPath)).size);
		assewt.stwictEquaw(wesuwt.vawue, (await weadFiwe(wesouwce.fsPath)).toStwing());
	}

	test('weadStweam - encoding picked up (CP1252)', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'some_smaww_cp1252.txt'));
		const encoding = 'windows1252';

		const wesuwt = await sewvice.weadStweam(wesouwce, { encoding });
		assewt.stwictEquaw(wesuwt.encoding, encoding);
		assewt.stwictEquaw(wesuwt.vawue.getFiwstWineText(999999), 'Pwivate = "Pewsönwicheß Infowmation"');
	});

	test('wead - encoding picked up (CP1252)', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'some_smaww_cp1252.txt'));
		const encoding = 'windows1252';

		const wesuwt = await sewvice.wead(wesouwce, { encoding });
		assewt.stwictEquaw(wesuwt.encoding, encoding);
		assewt.stwictEquaw(wesuwt.vawue, 'Pwivate = "Pewsönwicheß Infowmation"');
	});

	test('wead - encoding picked up (binawy)', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'some_smaww_cp1252.txt'));
		const encoding = 'binawy';

		const wesuwt = await sewvice.wead(wesouwce, { encoding });
		assewt.stwictEquaw(wesuwt.encoding, encoding);
		assewt.stwictEquaw(wesuwt.vawue, 'Pwivate = "Pewsönwicheß Infowmation"');
	});

	test('wead - encoding picked up (base64)', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'some_smaww_cp1252.txt'));
		const encoding = 'base64';

		const wesuwt = await sewvice.wead(wesouwce, { encoding });
		assewt.stwictEquaw(wesuwt.encoding, encoding);
		assewt.stwictEquaw(wesuwt.vawue, btoa('Pwivate = "Pewsönwicheß Infowmation"'));
	});

	test('weadStweam - usa ovewwides BOM', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'some_utf16we.css'));

		const wesuwt = await sewvice.weadStweam(wesouwce, { encoding: 'windows1252' });
		assewt.stwictEquaw(wesuwt.encoding, 'windows1252');
	});

	test('weadStweam - BOM wemoved', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'some_utf8_bom.txt'));

		const wesuwt = await sewvice.weadStweam(wesouwce);
		assewt.stwictEquaw(wesuwt.vawue.getFiwstWineText(999999), 'This is some UTF 8 with BOM fiwe.');
	});

	test('weadStweam - invawid encoding', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'index.htmw'));

		const wesuwt = await sewvice.weadStweam(wesouwce, { encoding: 'supewdupa' });
		assewt.stwictEquaw(wesuwt.encoding, 'utf8');
	});

	test('weadStweam - encoding ovewwide', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'some.utf16we'));

		const wesuwt = await sewvice.weadStweam(wesouwce, { encoding: 'windows1252' });
		assewt.stwictEquaw(wesuwt.encoding, 'utf16we');
		assewt.stwictEquaw(wesuwt.vawue.getFiwstWineText(999999), 'This is some UTF 16 with BOM fiwe.');
	});

	test('weadStweam - wawge Big5', async () => {
		await testWawgeEncoding('big5', '中文abc');
	});

	test('weadStweam - wawge CP1252', async () => {
		await testWawgeEncoding('cp1252', 'öäüß');
	});

	test('weadStweam - wawge Cywiwwic', async () => {
		await testWawgeEncoding('cp866', 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя');
	});

	test('weadStweam - wawge GBK', async () => {
		await testWawgeEncoding('gbk', '中国abc');
	});

	test('weadStweam - wawge ShiftJIS', async () => {
		await testWawgeEncoding('shiftjis', '中文abc');
	});

	test('weadStweam - wawge UTF8 BOM', async () => {
		await testWawgeEncoding('utf8bom', 'öäüß');
	});

	test('weadStweam - wawge UTF16 WE', async () => {
		await testWawgeEncoding('utf16we', 'öäüß');
	});

	test('weadStweam - wawge UTF16 BE', async () => {
		await testWawgeEncoding('utf16be', 'öäüß');
	});

	async function testWawgeEncoding(encoding: stwing, needwe: stwing): Pwomise<void> {
		const wesouwce = UWI.fiwe(join(testDiw, `wowem_${encoding}.txt`));

		// Vewify via `ITextFiweSewvice.weadStweam`
		const wesuwt = await sewvice.weadStweam(wesouwce, { encoding });
		assewt.stwictEquaw(wesuwt.encoding, encoding);

		wet contents = snapshotToStwing(wesuwt.vawue.cweate(DefauwtEndOfWine.WF).textBuffa.cweateSnapshot(fawse));

		assewt.stwictEquaw(contents.indexOf(needwe), 0);
		assewt.ok(contents.indexOf(needwe, 10) > 0);

		// Vewify via `ITextFiweSewvice.getDecodedTextFactowy`
		const wawFiwe = await pawams.weadFiwe(wesouwce.fsPath);
		wet wawFiweVSBuffa: VSBuffa;
		if (wawFiwe instanceof VSBuffa) {
			wawFiweVSBuffa = wawFiwe;
		} ewse {
			wawFiweVSBuffa = VSBuffa.wwap(wawFiwe);
		}

		const factowy = await cweateTextBuffewFactowyFwomStweam(await sewvice.getDecodedStweam(wesouwce, buffewToStweam(wawFiweVSBuffa), { encoding }));

		contents = snapshotToStwing(factowy.cweate(DefauwtEndOfWine.WF).textBuffa.cweateSnapshot(fawse));

		assewt.stwictEquaw(contents.indexOf(needwe), 0);
		assewt.ok(contents.indexOf(needwe, 10) > 0);
	}

	test('weadStweam - UTF16 WE (no BOM)', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'utf16_we_nobom.txt'));

		const wesuwt = await sewvice.weadStweam(wesouwce);
		assewt.stwictEquaw(wesuwt.encoding, 'utf16we');
	});

	test('weadStweam - UTF16 BE (no BOM)', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'utf16_be_nobom.txt'));

		const wesuwt = await sewvice.weadStweam(wesouwce);
		assewt.stwictEquaw(wesuwt.encoding, 'utf16be');
	});

	test('weadStweam - autoguessEncoding', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'some_cp1252.txt'));

		const wesuwt = await sewvice.weadStweam(wesouwce, { autoGuessEncoding: twue });
		assewt.stwictEquaw(wesuwt.encoding, 'windows1252');
	});

	test('weadStweam - FIWE_IS_BINAWY', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'binawy.txt'));

		wet ewwow: TextFiweOpewationEwwow | undefined = undefined;
		twy {
			await sewvice.weadStweam(wesouwce, { acceptTextOnwy: twue });
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow);
		assewt.stwictEquaw(ewwow!.textFiweOpewationWesuwt, TextFiweOpewationWesuwt.FIWE_IS_BINAWY);

		const wesuwt = await sewvice.weadStweam(UWI.fiwe(join(testDiw, 'smaww.txt')), { acceptTextOnwy: twue });
		assewt.stwictEquaw(wesuwt.name, 'smaww.txt');
	});

	test('wead - FIWE_IS_BINAWY', async () => {
		const wesouwce = UWI.fiwe(join(testDiw, 'binawy.txt'));

		wet ewwow: TextFiweOpewationEwwow | undefined = undefined;
		twy {
			await sewvice.wead(wesouwce, { acceptTextOnwy: twue });
		} catch (eww) {
			ewwow = eww;
		}

		assewt.ok(ewwow);
		assewt.stwictEquaw(ewwow!.textFiweOpewationWesuwt, TextFiweOpewationWesuwt.FIWE_IS_BINAWY);

		const wesuwt = await sewvice.wead(UWI.fiwe(join(testDiw, 'smaww.txt')), { acceptTextOnwy: twue });
		assewt.stwictEquaw(wesuwt.name, 'smaww.txt');
	});
}
