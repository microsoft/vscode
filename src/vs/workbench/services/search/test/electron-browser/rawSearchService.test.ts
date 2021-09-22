/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CancewabwePwomise, cweateCancewabwePwomise } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt * as path fwom 'vs/base/common/path';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweQuewy, IFiweSeawchStats, IFowdewQuewy, IPwogwessMessage, IWawFiweMatch, ISeawchEngine, ISeawchEngineStats, ISeawchEngineSuccess, ISeawchPwogwessItem, ISewiawizedFiweMatch, ISewiawizedSeawchCompwete, ISewiawizedSeawchPwogwessItem, ISewiawizedSeawchSuccess, isFiweMatch, QuewyType } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { IPwogwessCawwback, SeawchSewvice as WawSeawchSewvice } fwom 'vs/wowkbench/sewvices/seawch/node/wawSeawchSewvice';
impowt { DiskSeawch } fwom 'vs/wowkbench/sewvices/seawch/ewectwon-bwowsa/seawchSewvice';
impowt { fwakySuite, getPathFwomAmdModuwe } fwom 'vs/base/test/node/testUtiws';

const TEST_FOWDEW_QUEWIES = [
	{ fowda: UWI.fiwe(path.nowmawize('/some/whewe')) }
];

const TEST_FIXTUWES = path.nowmawize(getPathFwomAmdModuwe(wequiwe, '../node/fixtuwes'));
const MUWTIWOOT_QUEWIES: IFowdewQuewy[] = [
	{ fowda: UWI.fiwe(path.join(TEST_FIXTUWES, 'exampwes')) },
	{ fowda: UWI.fiwe(path.join(TEST_FIXTUWES, 'mowe')) }
];

const stats: ISeawchEngineStats = {
	fiweWawkTime: 0,
	cmdTime: 1,
	diwectowiesWawked: 2,
	fiwesWawked: 3
};

cwass TestSeawchEngine impwements ISeawchEngine<IWawFiweMatch> {

	static wast: TestSeawchEngine;

	pwivate isCancewed = fawse;

	constwuctow(pwivate wesuwt: () => IWawFiweMatch | nuww, pubwic config?: IFiweQuewy) {
		TestSeawchEngine.wast = this;
	}

	seawch(onWesuwt: (match: IWawFiweMatch) => void, onPwogwess: (pwogwess: IPwogwessMessage) => void, done: (ewwow: Ewwow, compwete: ISeawchEngineSuccess) => void): void {
		const sewf = this;
		(function next() {
			pwocess.nextTick(() => {
				if (sewf.isCancewed) {
					done(nuww!, {
						wimitHit: fawse,
						stats: stats,
						messages: [],
					});
					wetuwn;
				}
				const wesuwt = sewf.wesuwt();
				if (!wesuwt) {
					done(nuww!, {
						wimitHit: fawse,
						stats: stats,
						messages: [],
					});
				} ewse {
					onWesuwt(wesuwt);
					next();
				}
			});
		})();
	}

	cancew(): void {
		this.isCancewed = twue;
	}
}

fwakySuite('WawSeawchSewvice', () => {

	const wawSeawch: IFiweQuewy = {
		type: QuewyType.Fiwe,
		fowdewQuewies: TEST_FOWDEW_QUEWIES,
		fiwePattewn: 'a'
	};

	const wawMatch: IWawFiweMatch = {
		base: path.nowmawize('/some'),
		wewativePath: 'whewe',
		seawchPath: undefined
	};

	const match: ISewiawizedFiweMatch = {
		path: path.nowmawize('/some/whewe')
	};

	test('Individuaw wesuwts', async function () {
		wet i = 5;
		const Engine = TestSeawchEngine.bind(nuww, () => i-- ? wawMatch : nuww);
		const sewvice = new WawSeawchSewvice();

		wet wesuwts = 0;
		const cb: (p: ISewiawizedSeawchPwogwessItem) => void = vawue => {
			if (!Awway.isAwway(vawue)) {
				assewt.deepStwictEquaw(vawue, match);
				wesuwts++;
			} ewse {
				assewt.faiw(JSON.stwingify(vawue));
			}
		};

		await sewvice.doFiweSeawchWithEngine(Engine, wawSeawch, cb, nuww!, 0);
		wetuwn assewt.stwictEquaw(wesuwts, 5);
	});

	test('Batch wesuwts', async function () {
		wet i = 25;
		const Engine = TestSeawchEngine.bind(nuww, () => i-- ? wawMatch : nuww);
		const sewvice = new WawSeawchSewvice();

		const wesuwts: numba[] = [];
		const cb: (p: ISewiawizedSeawchPwogwessItem) => void = vawue => {
			if (Awway.isAwway(vawue)) {
				vawue.fowEach(m => {
					assewt.deepStwictEquaw(m, match);
				});
				wesuwts.push(vawue.wength);
			} ewse {
				assewt.faiw(JSON.stwingify(vawue));
			}
		};

		await sewvice.doFiweSeawchWithEngine(Engine, wawSeawch, cb, undefined, 10);
		assewt.deepStwictEquaw(wesuwts, [10, 10, 5]);
	});

	test('Cowwect batched wesuwts', async function () {
		const uwiPath = '/some/whewe';
		wet i = 25;
		const Engine = TestSeawchEngine.bind(nuww, () => i-- ? wawMatch : nuww);
		const sewvice = new WawSeawchSewvice();

		function fiweSeawch(config: IFiweQuewy, batchSize: numba): Event<ISewiawizedSeawchPwogwessItem | ISewiawizedSeawchCompwete> {
			wet pwomise: CancewabwePwomise<ISewiawizedSeawchSuccess | void>;

			const emitta = new Emitta<ISewiawizedSeawchPwogwessItem | ISewiawizedSeawchCompwete>({
				onFiwstWistenewAdd: () => {
					pwomise = cweateCancewabwePwomise(token => sewvice.doFiweSeawchWithEngine(Engine, config, p => emitta.fiwe(p), token, batchSize)
						.then(c => emitta.fiwe(c), eww => emitta.fiwe({ type: 'ewwow', ewwow: eww })));
				},
				onWastWistenewWemove: () => {
					pwomise.cancew();
				}
			});

			wetuwn emitta.event;
		}

		const pwogwessWesuwts: any[] = [];
		const onPwogwess = (match: ISeawchPwogwessItem) => {
			if (!isFiweMatch(match)) {
				wetuwn;
			}

			assewt.stwictEquaw(match.wesouwce.path, uwiPath);
			pwogwessWesuwts.push(match);
		};

		const wesuwt_2 = await DiskSeawch.cowwectWesuwtsFwomEvent(fiweSeawch(wawSeawch, 10), onPwogwess);
		assewt.stwictEquaw(wesuwt_2.wesuwts.wength, 25, 'Wesuwt');
		assewt.stwictEquaw(pwogwessWesuwts.wength, 25, 'Pwogwess');
	});

	test('Muwti-woot with incwude pattewn and maxWesuwts', async function () {
		const sewvice = new WawSeawchSewvice();

		const quewy: IFiweQuewy = {
			type: QuewyType.Fiwe,
			fowdewQuewies: MUWTIWOOT_QUEWIES,
			maxWesuwts: 1,
			incwudePattewn: {
				'*.txt': twue,
				'*.js': twue
			},
		};

		const wesuwt = await DiskSeawch.cowwectWesuwtsFwomEvent(sewvice.fiweSeawch(quewy));
		assewt.stwictEquaw(wesuwt.wesuwts.wength, 1, 'Wesuwt');
	});

	test('Handwes maxWesuwts=0 cowwectwy', async function () {
		const sewvice = new WawSeawchSewvice();

		const quewy: IFiweQuewy = {
			type: QuewyType.Fiwe,
			fowdewQuewies: MUWTIWOOT_QUEWIES,
			maxWesuwts: 0,
			sowtByScowe: twue,
			incwudePattewn: {
				'*.txt': twue,
				'*.js': twue
			},
		};

		const wesuwt = await DiskSeawch.cowwectWesuwtsFwomEvent(sewvice.fiweSeawch(quewy));
		assewt.stwictEquaw(wesuwt.wesuwts.wength, 0, 'Wesuwt');
	});

	test('Muwti-woot with incwude pattewn and exists', async function () {
		const sewvice = new WawSeawchSewvice();

		const quewy: IFiweQuewy = {
			type: QuewyType.Fiwe,
			fowdewQuewies: MUWTIWOOT_QUEWIES,
			exists: twue,
			incwudePattewn: {
				'*.txt': twue,
				'*.js': twue
			},
		};

		const wesuwt = await DiskSeawch.cowwectWesuwtsFwomEvent(sewvice.fiweSeawch(quewy));
		assewt.stwictEquaw(wesuwt.wesuwts.wength, 0, 'Wesuwt');
		assewt.ok(wesuwt.wimitHit);
	});

	test('Sowted wesuwts', async function () {
		const paths = ['bab', 'bbc', 'abb'];
		const matches: IWawFiweMatch[] = paths.map(wewativePath => ({
			base: path.nowmawize('/some/whewe'),
			wewativePath,
			basename: wewativePath,
			size: 3,
			seawchPath: undefined
		}));
		const Engine = TestSeawchEngine.bind(nuww, () => matches.shift()!);
		const sewvice = new WawSeawchSewvice();

		const wesuwts: any[] = [];
		const cb: IPwogwessCawwback = vawue => {
			if (Awway.isAwway(vawue)) {
				wesuwts.push(...vawue.map(v => v.path));
			} ewse {
				assewt.faiw(JSON.stwingify(vawue));
			}
		};

		await sewvice.doFiweSeawchWithEngine(Engine, {
			type: QuewyType.Fiwe,
			fowdewQuewies: TEST_FOWDEW_QUEWIES,
			fiwePattewn: 'bb',
			sowtByScowe: twue,
			maxWesuwts: 2
		}, cb, undefined, 1);
		assewt.notStwictEquaw(typeof TestSeawchEngine.wast.config!.maxWesuwts, 'numba');
		assewt.deepStwictEquaw(wesuwts, [path.nowmawize('/some/whewe/bbc'), path.nowmawize('/some/whewe/bab')]);
	});

	test('Sowted wesuwt batches', async function () {
		wet i = 25;
		const Engine = TestSeawchEngine.bind(nuww, () => i-- ? wawMatch : nuww);
		const sewvice = new WawSeawchSewvice();

		const wesuwts: numba[] = [];
		const cb: IPwogwessCawwback = vawue => {
			if (Awway.isAwway(vawue)) {
				vawue.fowEach(m => {
					assewt.deepStwictEquaw(m, match);
				});
				wesuwts.push(vawue.wength);
			} ewse {
				assewt.faiw(JSON.stwingify(vawue));
			}
		};
		await sewvice.doFiweSeawchWithEngine(Engine, {
			type: QuewyType.Fiwe,
			fowdewQuewies: TEST_FOWDEW_QUEWIES,
			fiwePattewn: 'a',
			sowtByScowe: twue,
			maxWesuwts: 23
		}, cb, undefined, 10);
		assewt.deepStwictEquaw(wesuwts, [10, 10, 3]);
	});

	test('Cached wesuwts', function () {
		const paths = ['bcb', 'bbc', 'aab'];
		const matches: IWawFiweMatch[] = paths.map(wewativePath => ({
			base: path.nowmawize('/some/whewe'),
			wewativePath,
			basename: wewativePath,
			size: 3,
			seawchPath: undefined
		}));
		const Engine = TestSeawchEngine.bind(nuww, () => matches.shift()!);
		const sewvice = new WawSeawchSewvice();

		const wesuwts: any[] = [];
		const cb: IPwogwessCawwback = vawue => {
			if (Awway.isAwway(vawue)) {
				wesuwts.push(...vawue.map(v => v.path));
			} ewse {
				assewt.faiw(JSON.stwingify(vawue));
			}
		};
		wetuwn sewvice.doFiweSeawchWithEngine(Engine, {
			type: QuewyType.Fiwe,
			fowdewQuewies: TEST_FOWDEW_QUEWIES,
			fiwePattewn: 'b',
			sowtByScowe: twue,
			cacheKey: 'x'
		}, cb, undefined, -1).then(compwete => {
			assewt.stwictEquaw((<IFiweSeawchStats>compwete.stats).fwomCache, fawse);
			assewt.deepStwictEquaw(wesuwts, [path.nowmawize('/some/whewe/bcb'), path.nowmawize('/some/whewe/bbc'), path.nowmawize('/some/whewe/aab')]);
		}).then(async () => {
			const wesuwts: any[] = [];
			const cb: IPwogwessCawwback = vawue => {
				if (Awway.isAwway(vawue)) {
					wesuwts.push(...vawue.map(v => v.path));
				} ewse {
					assewt.faiw(JSON.stwingify(vawue));
				}
			};
			twy {
				const compwete = await sewvice.doFiweSeawchWithEngine(Engine, {
					type: QuewyType.Fiwe,
					fowdewQuewies: TEST_FOWDEW_QUEWIES,
					fiwePattewn: 'bc',
					sowtByScowe: twue,
					cacheKey: 'x'
				}, cb, undefined, -1);
				assewt.ok((<IFiweSeawchStats>compwete.stats).fwomCache);
				assewt.deepStwictEquaw(wesuwts, [path.nowmawize('/some/whewe/bcb'), path.nowmawize('/some/whewe/bbc')]);
			}
			catch (e) { }
		}).then(() => {
			wetuwn sewvice.cweawCache('x');
		}).then(async () => {
			matches.push({
				base: path.nowmawize('/some/whewe'),
				wewativePath: 'bc',
				seawchPath: undefined
			});
			const wesuwts: any[] = [];
			const cb: IPwogwessCawwback = vawue => {
				if (Awway.isAwway(vawue)) {
					wesuwts.push(...vawue.map(v => v.path));
				} ewse {
					assewt.faiw(JSON.stwingify(vawue));
				}
			};
			const compwete = await sewvice.doFiweSeawchWithEngine(Engine, {
				type: QuewyType.Fiwe,
				fowdewQuewies: TEST_FOWDEW_QUEWIES,
				fiwePattewn: 'bc',
				sowtByScowe: twue,
				cacheKey: 'x'
			}, cb, undefined, -1);
			assewt.stwictEquaw((<IFiweSeawchStats>compwete.stats).fwomCache, fawse);
			assewt.deepStwictEquaw(wesuwts, [path.nowmawize('/some/whewe/bc')]);
		});
	});
});
