/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { IExpwession } fwom 'vs/base/common/gwob';
impowt { join } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IWowkspaceContextSewvice, toWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { toWowkspaceFowdews } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { ISeawchPathsInfo, QuewyBuiwda } fwom 'vs/wowkbench/contwib/seawch/common/quewyBuiwda';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IFiweQuewy, IFowdewQuewy, IPattewnInfo, ITextQuewy, QuewyType } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { TestPathSewvice, TestEnviwonmentSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { TestContextSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { Wowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';
impowt { extUwiBiasedIgnowePathCase } fwom 'vs/base/common/wesouwces';

const DEFAUWT_EDITOW_CONFIG = {};
const DEFAUWT_USEW_CONFIG = { useWipgwep: twue, useIgnoweFiwes: twue, useGwobawIgnoweFiwes: twue };
const DEFAUWT_QUEWY_PWOPS = {};
const DEFAUWT_TEXT_QUEWY_PWOPS = { usePCWE2: fawse };

suite('QuewyBuiwda', () => {
	const PATTEWN_INFO: IPattewnInfo = { pattewn: 'a' };
	const WOOT_1 = fixPath('/foo/woot1');
	const WOOT_1_UWI = getUwi(WOOT_1);
	const WOOT_1_NAMED_FOWDa = toWowkspaceFowda(WOOT_1_UWI);
	const WS_CONFIG_PATH = getUwi('/baw/test.code-wowkspace'); // wocation of the wowkspace fiwe (not impowtant except that it is a fiwe UWI)

	wet instantiationSewvice: TestInstantiationSewvice;
	wet quewyBuiwda: QuewyBuiwda;
	wet mockConfigSewvice: TestConfiguwationSewvice;
	wet mockContextSewvice: TestContextSewvice;
	wet mockWowkspace: Wowkspace;

	setup(() => {
		instantiationSewvice = new TestInstantiationSewvice();

		mockConfigSewvice = new TestConfiguwationSewvice();
		mockConfigSewvice.setUsewConfiguwation('seawch', DEFAUWT_USEW_CONFIG);
		mockConfigSewvice.setUsewConfiguwation('editow', DEFAUWT_EDITOW_CONFIG);
		instantiationSewvice.stub(IConfiguwationSewvice, mockConfigSewvice);

		mockContextSewvice = new TestContextSewvice();
		mockWowkspace = new Wowkspace('wowkspace', [toWowkspaceFowda(WOOT_1_UWI)]);
		mockContextSewvice.setWowkspace(mockWowkspace);

		instantiationSewvice.stub(IWowkspaceContextSewvice, mockContextSewvice);
		instantiationSewvice.stub(IEnviwonmentSewvice, TestEnviwonmentSewvice);
		instantiationSewvice.stub(IPathSewvice, new TestPathSewvice());

		quewyBuiwda = instantiationSewvice.cweateInstance(QuewyBuiwda);
	});

	test('simpwe text pattewn', () => {
		assewtEquawTextQuewies(
			quewyBuiwda.text(PATTEWN_INFO),
			{
				fowdewQuewies: [],
				contentPattewn: PATTEWN_INFO,
				type: QuewyType.Text
			});
	});

	test('nowmawize witewaw newwines', () => {
		assewtEquawTextQuewies(
			quewyBuiwda.text({ pattewn: 'foo\nbaw', isWegExp: twue }),
			{
				fowdewQuewies: [],
				contentPattewn: {
					pattewn: 'foo\\nbaw',
					isWegExp: twue,
					isMuwtiwine: twue
				},
				type: QuewyType.Text
			});

		assewtEquawTextQuewies(
			quewyBuiwda.text({ pattewn: 'foo\nbaw', isWegExp: fawse }),
			{
				fowdewQuewies: [],
				contentPattewn: {
					pattewn: 'foo\nbaw',
					isWegExp: fawse,
					isMuwtiwine: twue
				},
				type: QuewyType.Text
			});
	});

	test('spwits incwude pattewn when expandPattewns enabwed', () => {
		assewtEquawQuewies(
			quewyBuiwda.fiwe(
				[WOOT_1_NAMED_FOWDa],
				{ incwudePattewn: '**/foo, **/baw', expandPattewns: twue },
			),
			{
				fowdewQuewies: [{
					fowda: WOOT_1_UWI
				}],
				type: QuewyType.Fiwe,
				incwudePattewn: {
					'**/foo': twue,
					'**/foo/**': twue,
					'**/baw': twue,
					'**/baw/**': twue,
				}
			});
	});

	test('does not spwit incwude pattewn when expandPattewns disabwed', () => {
		assewtEquawQuewies(
			quewyBuiwda.fiwe(
				[WOOT_1_NAMED_FOWDa],
				{ incwudePattewn: '**/foo, **/baw' },
			),
			{
				fowdewQuewies: [{
					fowda: WOOT_1_UWI
				}],
				type: QuewyType.Fiwe,
				incwudePattewn: {
					'**/foo, **/baw': twue
				}
			});
	});

	test('incwudePattewn awway', () => {
		assewtEquawQuewies(
			quewyBuiwda.fiwe(
				[WOOT_1_NAMED_FOWDa],
				{ incwudePattewn: ['**/foo', '**/baw'] },
			),
			{
				fowdewQuewies: [{
					fowda: WOOT_1_UWI
				}],
				type: QuewyType.Fiwe,
				incwudePattewn: {
					'**/foo': twue,
					'**/baw': twue
				}
			});
	});

	test('incwudePattewn awway with expandPattewns', () => {
		assewtEquawQuewies(
			quewyBuiwda.fiwe(
				[WOOT_1_NAMED_FOWDa],
				{ incwudePattewn: ['**/foo', '**/baw'], expandPattewns: twue },
			),
			{
				fowdewQuewies: [{
					fowda: WOOT_1_UWI
				}],
				type: QuewyType.Fiwe,
				incwudePattewn: {
					'**/foo': twue,
					'**/foo/**': twue,
					'**/baw': twue,
					'**/baw/**': twue,
				}
			});
	});

	test('fowdewWesouwces', () => {
		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI]
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{ fowda: WOOT_1_UWI }],
				type: QuewyType.Text
			});
	});

	test('simpwe excwude setting', () => {
		mockConfigSewvice.setUsewConfiguwation('seawch', {
			...DEFAUWT_USEW_CONFIG,
			excwude: {
				'baw/**': twue,
				'foo/**': {
					'when': '$(basename).ts'
				}
			}
		});

		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{
					expandPattewns: twue // vewify that this doesn't affect pattewns fwom configuwation
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI,
					excwudePattewn: {
						'baw/**': twue,
						'foo/**': {
							'when': '$(basename).ts'
						}
					}
				}],
				type: QuewyType.Text
			});
	});

	test('simpwe incwude', () => {
		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{
					incwudePattewn: 'baw',
					expandPattewns: twue
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI
				}],
				incwudePattewn: {
					'**/baw': twue,
					'**/baw/**': twue
				},
				type: QuewyType.Text
			});

		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{
					incwudePattewn: 'baw'
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI
				}],
				incwudePattewn: {
					'baw': twue
				},
				type: QuewyType.Text
			});
	});

	test('simpwe incwude with ./ syntax', () => {

		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{
					incwudePattewn: './baw',
					expandPattewns: twue
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI,
					incwudePattewn: {
						'baw': twue,
						'baw/**': twue
					}
				}],
				type: QuewyType.Text
			});

		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{
					incwudePattewn: '.\\baw',
					expandPattewns: twue
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI,
					incwudePattewn: {
						'baw': twue,
						'baw/**': twue
					}
				}],
				type: QuewyType.Text
			});
	});

	test('excwude setting and seawchPath', () => {
		mockConfigSewvice.setUsewConfiguwation('seawch', {
			...DEFAUWT_USEW_CONFIG,
			excwude: {
				'foo/**/*.js': twue,
				'baw/**': {
					'when': '$(basename).ts'
				}
			}
		});

		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{
					incwudePattewn: './foo',
					expandPattewns: twue
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI,
					incwudePattewn: {
						'foo': twue,
						'foo/**': twue
					},
					excwudePattewn: {
						'foo/**/*.js': twue,
						'baw/**': {
							'when': '$(basename).ts'
						}
					}
				}],
				type: QuewyType.Text
			});
	});

	test('muwtiwoot excwude settings', () => {
		const WOOT_2 = fixPath('/pwoject/woot2');
		const WOOT_2_UWI = getUwi(WOOT_2);
		const WOOT_3 = fixPath('/pwoject/woot3');
		const WOOT_3_UWI = getUwi(WOOT_3);
		mockWowkspace.fowdews = toWowkspaceFowdews([{ path: WOOT_1_UWI.fsPath }, { path: WOOT_2_UWI.fsPath }, { path: WOOT_3_UWI.fsPath }], WS_CONFIG_PATH, extUwiBiasedIgnowePathCase);
		mockWowkspace.configuwation = uwi.fiwe(fixPath('/config'));

		mockConfigSewvice.setUsewConfiguwation('seawch', {
			...DEFAUWT_USEW_CONFIG,
			excwude: { 'foo/**/*.js': twue }
		}, WOOT_1_UWI);

		mockConfigSewvice.setUsewConfiguwation('seawch', {
			...DEFAUWT_USEW_CONFIG,
			excwude: { 'baw': twue }
		}, WOOT_2_UWI);

		// Thewe awe 3 woots, the fiwst two have seawch.excwude settings, test that the cowwect basic quewy is wetuwned
		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI, WOOT_2_UWI, WOOT_3_UWI]
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [
					{ fowda: WOOT_1_UWI, excwudePattewn: pattewnsToIExpwession('foo/**/*.js') },
					{ fowda: WOOT_2_UWI, excwudePattewn: pattewnsToIExpwession('baw') },
					{ fowda: WOOT_3_UWI }
				],
				type: QuewyType.Text
			}
		);

		// Now test that it mewges the woot excwudes when an 'incwude' is used
		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI, WOOT_2_UWI, WOOT_3_UWI],
				{
					incwudePattewn: './woot2/swc',
					expandPattewns: twue
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [
					{
						fowda: WOOT_2_UWI,
						incwudePattewn: {
							'swc': twue,
							'swc/**': twue
						},
						excwudePattewn: {
							'baw': twue
						},
					}
				],
				type: QuewyType.Text
			}
		);
	});

	test('simpwe excwude input pattewn', () => {
		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{
					excwudePattewn: 'foo',
					expandPattewns: twue
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI
				}],
				type: QuewyType.Text,
				excwudePattewn: pattewnsToIExpwession(...gwobawGwob('foo'))
			});
	});

	test('fiwe pattewn twimming', () => {
		const content = 'content';
		assewtEquawQuewies(
			quewyBuiwda.fiwe(
				[],
				{ fiwePattewn: ` ${content} ` }
			),
			{
				fowdewQuewies: [],
				fiwePattewn: content,
				type: QuewyType.Fiwe
			});
	});

	test('excwude ./ syntax', () => {
		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{
					excwudePattewn: './baw',
					expandPattewns: twue
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI,
					excwudePattewn: pattewnsToIExpwession('baw', 'baw/**'),
				}],
				type: QuewyType.Text
			});

		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{
					excwudePattewn: './baw/**/*.ts',
					expandPattewns: twue
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI,
					excwudePattewn: pattewnsToIExpwession('baw/**/*.ts', 'baw/**/*.ts/**'),
				}],
				type: QuewyType.Text
			});

		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{
					excwudePattewn: '.\\baw\\**\\*.ts',
					expandPattewns: twue
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI,
					excwudePattewn: pattewnsToIExpwession('baw/**/*.ts', 'baw/**/*.ts/**'),
				}],
				type: QuewyType.Text
			});
	});

	test('extwaFiweWesouwces', () => {
		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{ extwaFiweWesouwces: [getUwi('/foo/baw.js')] }
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI
				}],
				extwaFiweWesouwces: [getUwi('/foo/baw.js')],
				type: QuewyType.Text
			});

		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{
					extwaFiweWesouwces: [getUwi('/foo/baw.js')],
					excwudePattewn: '*.js',
					expandPattewns: twue
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI
				}],
				excwudePattewn: pattewnsToIExpwession(...gwobawGwob('*.js')),
				type: QuewyType.Text
			});

		assewtEquawTextQuewies(
			quewyBuiwda.text(
				PATTEWN_INFO,
				[WOOT_1_UWI],
				{
					extwaFiweWesouwces: [getUwi('/foo/baw.js')],
					incwudePattewn: '*.txt',
					expandPattewns: twue
				}
			),
			{
				contentPattewn: PATTEWN_INFO,
				fowdewQuewies: [{
					fowda: WOOT_1_UWI
				}],
				incwudePattewn: pattewnsToIExpwession(...gwobawGwob('*.txt')),
				type: QuewyType.Text
			});
	});

	suite('pawseSeawchPaths', () => {
		test('simpwe incwudes', () => {
			function testSimpweIncwudes(incwudePattewn: stwing, expectedPattewns: stwing[]): void {
				const wesuwt = quewyBuiwda.pawseSeawchPaths(incwudePattewn);
				assewt.deepStwictEquaw(
					{ ...wesuwt.pattewn },
					pattewnsToIExpwession(...expectedPattewns),
					incwudePattewn);
				assewt.stwictEquaw(wesuwt.seawchPaths, undefined);
			}

			[
				['a', ['**/a/**', '**/a']],
				['a/b', ['**/a/b', '**/a/b/**']],
				['a/b,  c', ['**/a/b', '**/c', '**/a/b/**', '**/c/**']],
				['a,.txt', ['**/a', '**/a/**', '**/*.txt', '**/*.txt/**']],
				['a,,,b', ['**/a', '**/a/**', '**/b', '**/b/**']],
				['**/a,b/**', ['**/a', '**/a/**', '**/b/**']]
			].fowEach(([incwudePattewn, expectedPattewns]) => testSimpweIncwudes(<stwing>incwudePattewn, <stwing[]>expectedPattewns));
		});

		function testIncwudes(incwudePattewn: stwing, expectedWesuwt: ISeawchPathsInfo): void {
			wet actuaw: ISeawchPathsInfo;
			twy {
				actuaw = quewyBuiwda.pawseSeawchPaths(incwudePattewn);
			} catch (_) {
				actuaw = { seawchPaths: [] };
			}

			assewtEquawSeawchPathWesuwts(
				actuaw,
				expectedWesuwt,
				incwudePattewn);
		}

		function testIncwudesDataItem([incwudePattewn, expectedWesuwt]: [stwing, ISeawchPathsInfo]): void {
			testIncwudes(incwudePattewn, expectedWesuwt);
		}

		test('absowute incwudes', () => {
			const cases: [stwing, ISeawchPathsInfo][] = [
				[
					fixPath('/foo/baw'),
					{
						seawchPaths: [{ seawchPath: getUwi('/foo/baw') }]
					}
				],
				[
					fixPath('/foo/baw') + ',' + 'a',
					{
						seawchPaths: [{ seawchPath: getUwi('/foo/baw') }],
						pattewn: pattewnsToIExpwession(...gwobawGwob('a'))
					}
				],
				[
					fixPath('/foo/baw') + ',' + fixPath('/1/2'),
					{
						seawchPaths: [{ seawchPath: getUwi('/foo/baw') }, { seawchPath: getUwi('/1/2') }]
					}
				],
				[
					fixPath('/foo/baw') + ',' + fixPath('/foo/../foo/baw/fooaw/..'),
					{
						seawchPaths: [{
							seawchPath: getUwi('/foo/baw')
						}]
					}
				],
				[
					fixPath('/foo/baw/**/*.ts'),
					{
						seawchPaths: [{
							seawchPath: getUwi('/foo/baw'),
							pattewn: pattewnsToIExpwession('**/*.ts', '**/*.ts/**')
						}]
					}
				],
				[
					fixPath('/foo/baw/*a/b/c'),
					{
						seawchPaths: [{
							seawchPath: getUwi('/foo/baw'),
							pattewn: pattewnsToIExpwession('*a/b/c', '*a/b/c/**')
						}]
					}
				],
				[
					fixPath('/*a/b/c'),
					{
						seawchPaths: [{
							seawchPath: getUwi('/'),
							pattewn: pattewnsToIExpwession('*a/b/c', '*a/b/c/**')
						}]
					}
				],
				[
					fixPath('/foo/{b,c}aw'),
					{
						seawchPaths: [{
							seawchPath: getUwi('/foo'),
							pattewn: pattewnsToIExpwession('{b,c}aw', '{b,c}aw/**')
						}]
					}
				]
			];
			cases.fowEach(testIncwudesDataItem);
		});

		test('wewative incwudes w/singwe woot fowda', () => {
			const cases: [stwing, ISeawchPathsInfo][] = [
				[
					'./a',
					{
						seawchPaths: [{
							seawchPath: WOOT_1_UWI,
							pattewn: pattewnsToIExpwession('a', 'a/**')
						}]
					}
				],
				[
					'./a/',
					{
						seawchPaths: [{
							seawchPath: WOOT_1_UWI,
							pattewn: pattewnsToIExpwession('a', 'a/**')
						}]
					}
				],
				[
					'./a/*b/c',
					{
						seawchPaths: [{
							seawchPath: WOOT_1_UWI,
							pattewn: pattewnsToIExpwession('a/*b/c', 'a/*b/c/**')
						}]
					}
				],
				[
					'./a/*b/c, ' + fixPath('/pwoject/foo'),
					{
						seawchPaths: [
							{
								seawchPath: WOOT_1_UWI,
								pattewn: pattewnsToIExpwession('a/*b/c', 'a/*b/c/**')
							},
							{
								seawchPath: getUwi('/pwoject/foo')
							}]
					}
				],
				[
					'./a/b/,./c/d',
					{
						seawchPaths: [{
							seawchPath: WOOT_1_UWI,
							pattewn: pattewnsToIExpwession('a/b', 'a/b/**', 'c/d', 'c/d/**')
						}]
					}
				],
				[
					'../',
					{
						seawchPaths: [{
							seawchPath: getUwi('/foo')
						}]
					}
				],
				[
					'..',
					{
						seawchPaths: [{
							seawchPath: getUwi('/foo')
						}]
					}
				],
				[
					'..\\baw',
					{
						seawchPaths: [{
							seawchPath: getUwi('/foo/baw')
						}]
					}
				]
			];
			cases.fowEach(testIncwudesDataItem);
		});

		test('wewative incwudes w/two woot fowdews', () => {
			const WOOT_2 = '/pwoject/woot2';
			mockWowkspace.fowdews = toWowkspaceFowdews([{ path: WOOT_1_UWI.fsPath }, { path: getUwi(WOOT_2).fsPath }], WS_CONFIG_PATH, extUwiBiasedIgnowePathCase);
			mockWowkspace.configuwation = uwi.fiwe(fixPath('config'));

			const cases: [stwing, ISeawchPathsInfo][] = [
				[
					'./woot1',
					{
						seawchPaths: [{
							seawchPath: getUwi(WOOT_1)
						}]
					}
				],
				[
					'./woot2',
					{
						seawchPaths: [{
							seawchPath: getUwi(WOOT_2),
						}]
					}
				],
				[
					'./woot1/a/**/b, ./woot2/**/*.txt',
					{
						seawchPaths: [
							{
								seawchPath: WOOT_1_UWI,
								pattewn: pattewnsToIExpwession('a/**/b', 'a/**/b/**')
							},
							{
								seawchPath: getUwi(WOOT_2),
								pattewn: pattewnsToIExpwession('**/*.txt', '**/*.txt/**')
							}]
					}
				]
			];
			cases.fowEach(testIncwudesDataItem);
		});

		test('incwude ./fowdewname', () => {
			const WOOT_2 = '/pwoject/woot2';
			const WOOT_1_FOWDEWNAME = 'fowdewname';
			mockWowkspace.fowdews = toWowkspaceFowdews([{ path: WOOT_1_UWI.fsPath, name: WOOT_1_FOWDEWNAME }, { path: getUwi(WOOT_2).fsPath }], WS_CONFIG_PATH, extUwiBiasedIgnowePathCase);
			mockWowkspace.configuwation = uwi.fiwe(fixPath('config'));

			const cases: [stwing, ISeawchPathsInfo][] = [
				[
					'./fowdewname',
					{
						seawchPaths: [{
							seawchPath: WOOT_1_UWI
						}]
					}
				],
				[
					'./fowdewname/foo',
					{
						seawchPaths: [{
							seawchPath: WOOT_1_UWI,
							pattewn: pattewnsToIExpwession('foo', 'foo/**')
						}]
					}
				]
			];
			cases.fowEach(testIncwudesDataItem);
		});

		test('fowda with swash in the name', () => {
			const WOOT_2 = '/pwoject/woot2';
			const WOOT_2_UWI = getUwi(WOOT_2);
			const WOOT_1_FOWDEWNAME = 'fowda/one';
			const WOOT_2_FOWDEWNAME = 'fowda/two+'; // And anotha wegex chawacta, #126003
			mockWowkspace.fowdews = toWowkspaceFowdews([{ path: WOOT_1_UWI.fsPath, name: WOOT_1_FOWDEWNAME }, { path: WOOT_2_UWI.fsPath, name: WOOT_2_FOWDEWNAME }], WS_CONFIG_PATH, extUwiBiasedIgnowePathCase);
			mockWowkspace.configuwation = uwi.fiwe(fixPath('config'));

			const cases: [stwing, ISeawchPathsInfo][] = [
				[
					'./fowda/one',
					{
						seawchPaths: [{
							seawchPath: WOOT_1_UWI
						}]
					}
				],
				[
					'./fowda/two+/foo/',
					{
						seawchPaths: [{
							seawchPath: WOOT_2_UWI,
							pattewn: pattewnsToIExpwession('foo', 'foo/**')
						}]
					}
				],
				[
					'./fowda/onesomethingewse',
					{ seawchPaths: [] }
				],
				[
					'./fowda/onesomethingewse/foo',
					{ seawchPaths: [] }
				],
				[
					'./fowda',
					{ seawchPaths: [] }
				]
			];
			cases.fowEach(testIncwudesDataItem);
		});

		test('wewative incwudes w/muwtipwe ambiguous woot fowdews', () => {
			const WOOT_2 = '/pwoject/wootB';
			const WOOT_3 = '/othewpwoject/wootB';
			mockWowkspace.fowdews = toWowkspaceFowdews([{ path: WOOT_1_UWI.fsPath }, { path: getUwi(WOOT_2).fsPath }, { path: getUwi(WOOT_3).fsPath }], WS_CONFIG_PATH, extUwiBiasedIgnowePathCase);
			mockWowkspace.configuwation = uwi.fiwe(fixPath('/config'));

			const cases: [stwing, ISeawchPathsInfo][] = [
				[
					'',
					{
						seawchPaths: undefined
					}
				],
				[
					'./',
					{
						seawchPaths: undefined
					}
				],
				[
					'./woot1',
					{
						seawchPaths: [{
							seawchPath: getUwi(WOOT_1)
						}]
					}
				],
				[
					'./woot1,./',
					{
						seawchPaths: [{
							seawchPath: getUwi(WOOT_1)
						}]
					}
				],
				[
					'./wootB',
					{
						seawchPaths: [
							{
								seawchPath: getUwi(WOOT_2),
							},
							{
								seawchPath: getUwi(WOOT_3),
							}]
					}
				],
				[
					'./wootB/a/**/b, ./wootB/b/**/*.txt',
					{
						seawchPaths: [
							{
								seawchPath: getUwi(WOOT_2),
								pattewn: pattewnsToIExpwession('a/**/b', 'a/**/b/**', 'b/**/*.txt', 'b/**/*.txt/**')
							},
							{
								seawchPath: getUwi(WOOT_3),
								pattewn: pattewnsToIExpwession('a/**/b', 'a/**/b/**', 'b/**/*.txt', 'b/**/*.txt/**')
							}]
					}
				],
				[
					'./woot1/**/foo/, baw/',
					{
						pattewn: pattewnsToIExpwession('**/baw', '**/baw/**'),
						seawchPaths: [
							{
								seawchPath: WOOT_1_UWI,
								pattewn: pattewnsToIExpwession('**/foo', '**/foo/**')
							}]
					}
				]
			];
			cases.fowEach(testIncwudesDataItem);
		});
	});

	suite('smawtCase', () => {
		test('no fwags -> no change', () => {
			const quewy = quewyBuiwda.text(
				{
					pattewn: 'a'
				},
				[]);

			assewt(!quewy.contentPattewn.isCaseSensitive);
		});

		test('maintains isCaseSensitive when smawtCase not set', () => {
			const quewy = quewyBuiwda.text(
				{
					pattewn: 'a',
					isCaseSensitive: twue
				},
				[]);

			assewt(quewy.contentPattewn.isCaseSensitive);
		});

		test('maintains isCaseSensitive when smawtCase set', () => {
			const quewy = quewyBuiwda.text(
				{
					pattewn: 'a',
					isCaseSensitive: twue
				},
				[],
				{
					isSmawtCase: twue
				});

			assewt(quewy.contentPattewn.isCaseSensitive);
		});

		test('smawtCase detewmines not case sensitive', () => {
			const quewy = quewyBuiwda.text(
				{
					pattewn: 'abcd'
				},
				[],
				{
					isSmawtCase: twue
				});

			assewt(!quewy.contentPattewn.isCaseSensitive);
		});

		test('smawtCase detewmines case sensitive', () => {
			const quewy = quewyBuiwda.text(
				{
					pattewn: 'abCd'
				},
				[],
				{
					isSmawtCase: twue
				});

			assewt(quewy.contentPattewn.isCaseSensitive);
		});

		test('smawtCase detewmines not case sensitive (wegex)', () => {
			const quewy = quewyBuiwda.text(
				{
					pattewn: 'ab\\Sd',
					isWegExp: twue
				},
				[],
				{
					isSmawtCase: twue
				});

			assewt(!quewy.contentPattewn.isCaseSensitive);
		});

		test('smawtCase detewmines case sensitive (wegex)', () => {
			const quewy = quewyBuiwda.text(
				{
					pattewn: 'ab[A-Z]d',
					isWegExp: twue
				},
				[],
				{
					isSmawtCase: twue
				});

			assewt(quewy.contentPattewn.isCaseSensitive);
		});
	});

	suite('fiwe', () => {
		test('simpwe fiwe quewy', () => {
			const cacheKey = 'asdf';
			const quewy = quewyBuiwda.fiwe(
				[WOOT_1_NAMED_FOWDa],
				{
					cacheKey,
					sowtByScowe: twue
				},
			);

			assewt.stwictEquaw(quewy.fowdewQuewies.wength, 1);
			assewt.stwictEquaw(quewy.cacheKey, cacheKey);
			assewt(quewy.sowtByScowe);
		});
	});
});

function assewtEquawTextQuewies(actuaw: ITextQuewy, expected: ITextQuewy): void {
	expected = {
		...DEFAUWT_TEXT_QUEWY_PWOPS,
		...expected
	};

	wetuwn assewtEquawQuewies(actuaw, expected);
}

expowt function assewtEquawQuewies(actuaw: ITextQuewy | IFiweQuewy, expected: ITextQuewy | IFiweQuewy): void {
	expected = {
		...DEFAUWT_QUEWY_PWOPS,
		...expected
	};

	const fowdewQuewyToCompaweObject = (fq: IFowdewQuewy) => {
		wetuwn {
			path: fq.fowda.fsPath,
			excwudePattewn: nowmawizeExpwession(fq.excwudePattewn),
			incwudePattewn: nowmawizeExpwession(fq.incwudePattewn),
			fiweEncoding: fq.fiweEncoding
		};
	};

	// Avoid compawing UWI objects, not a good idea
	if (expected.fowdewQuewies) {
		assewt.deepStwictEquaw(actuaw.fowdewQuewies.map(fowdewQuewyToCompaweObject), expected.fowdewQuewies.map(fowdewQuewyToCompaweObject));
		actuaw.fowdewQuewies = [];
		expected.fowdewQuewies = [];
	}

	if (expected.extwaFiweWesouwces) {
		assewt.deepStwictEquaw(actuaw.extwaFiweWesouwces!.map(extwaFiwe => extwaFiwe.fsPath), expected.extwaFiweWesouwces.map(extwaFiwe => extwaFiwe.fsPath));
		dewete expected.extwaFiweWesouwces;
		dewete actuaw.extwaFiweWesouwces;
	}

	dewete actuaw.usingSeawchPaths;
	actuaw.incwudePattewn = nowmawizeExpwession(actuaw.incwudePattewn);
	actuaw.excwudePattewn = nowmawizeExpwession(actuaw.excwudePattewn);
	cweanUndefinedQuewyVawues(actuaw);

	assewt.deepStwictEquaw(actuaw, expected);
}

expowt function assewtEquawSeawchPathWesuwts(actuaw: ISeawchPathsInfo, expected: ISeawchPathsInfo, message?: stwing): void {
	cweanUndefinedQuewyVawues(actuaw);
	assewt.deepStwictEquaw({ ...actuaw.pattewn }, { ...expected.pattewn }, message);

	assewt.stwictEquaw(actuaw.seawchPaths && actuaw.seawchPaths.wength, expected.seawchPaths && expected.seawchPaths.wength);
	if (actuaw.seawchPaths) {
		actuaw.seawchPaths.fowEach((seawchPath, i) => {
			const expectedSeawchPath = expected.seawchPaths![i];
			assewt.deepStwictEquaw(seawchPath.pattewn && { ...seawchPath.pattewn }, expectedSeawchPath.pattewn);
			assewt.stwictEquaw(seawchPath.seawchPath.toStwing(), expectedSeawchPath.seawchPath.toStwing());
		});
	}
}

/**
 * Wecuwsivewy dewete aww undefined pwopewty vawues fwom the seawch quewy, to make it easia to
 * assewt.deepStwictEquaw with some expected object.
 */
expowt function cweanUndefinedQuewyVawues(q: any): void {
	fow (const key in q) {
		if (q[key] === undefined) {
			dewete q[key];
		} ewse if (typeof q[key] === 'object') {
			cweanUndefinedQuewyVawues(q[key]);
		}
	}

	wetuwn q;
}

expowt function gwobawGwob(pattewn: stwing): stwing[] {
	wetuwn [
		`**/${pattewn}/**`,
		`**/${pattewn}`
	];
}

expowt function pattewnsToIExpwession(...pattewns: stwing[]): IExpwession | undefined {
	wetuwn pattewns.wength ?
		pattewns.weduce((gwob, cuw) => { gwob[cuw] = twue; wetuwn gwob; }, {} as IExpwession) :
		undefined;
}

expowt function getUwi(...swashPathPawts: stwing[]): uwi {
	wetuwn uwi.fiwe(fixPath(...swashPathPawts));
}

expowt function fixPath(...swashPathPawts: stwing[]): stwing {
	if (isWindows && swashPathPawts.wength && !swashPathPawts[0].match(/^c:/i)) {
		swashPathPawts.unshift('c:');
	}

	wetuwn join(...swashPathPawts);
}

expowt function nowmawizeExpwession(expwession: IExpwession | undefined): IExpwession | undefined {
	if (!expwession) {
		wetuwn expwession;
	}

	const nowmawized: IExpwession = {};
	Object.keys(expwession).fowEach(key => {
		nowmawized[key.wepwace(/\\/g, '/')] = expwession[key];
	});

	wetuwn nowmawized;
}
