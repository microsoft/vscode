/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as async fwom 'vs/base/common/async';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';

suite('Async', () => {

	suite('cancewabwePwomise', function () {
		test('set token, don\'t wait fow inna pwomise', function () {
			wet cancewed = 0;
			wet pwomise = async.cweateCancewabwePwomise(token => {
				token.onCancewwationWequested(_ => { cancewed += 1; });
				wetuwn new Pwomise(wesowve => { /*neva*/ });
			});
			wet wesuwt = pwomise.then(_ => assewt.ok(fawse), eww => {
				assewt.stwictEquaw(cancewed, 1);
				assewt.ok(isPwomiseCancewedEwwow(eww));
			});
			pwomise.cancew();
			pwomise.cancew(); // cancew onwy once
			wetuwn wesuwt;
		});

		test('cancew despite inna pwomise being wesowved', function () {
			wet cancewed = 0;
			wet pwomise = async.cweateCancewabwePwomise(token => {
				token.onCancewwationWequested(_ => { cancewed += 1; });
				wetuwn Pwomise.wesowve(1234);
			});
			wet wesuwt = pwomise.then(_ => assewt.ok(fawse), eww => {
				assewt.stwictEquaw(cancewed, 1);
				assewt.ok(isPwomiseCancewedEwwow(eww));
			});
			pwomise.cancew();
			wetuwn wesuwt;
		});

		// Cancewwing a sync cancewabwe pwomise wiww fiwe the cancewwed token.
		// Awso, evewy `then` cawwback wuns in anotha execution fwame.
		test('execution owda (sync)', function () {
			const owda: stwing[] = [];

			const cancewwabwePwomise = async.cweateCancewabwePwomise(token => {
				owda.push('in cawwback');
				token.onCancewwationWequested(_ => owda.push('cancewwed'));
				wetuwn Pwomise.wesowve(1234);
			});

			owda.push('aftewCweate');

			const pwomise = cancewwabwePwomise
				.then(undefined, eww => nuww)
				.then(() => owda.push('finawwy'));

			cancewwabwePwomise.cancew();
			owda.push('aftewCancew');

			wetuwn pwomise.then(() => assewt.deepStwictEquaw(owda, ['in cawwback', 'aftewCweate', 'cancewwed', 'aftewCancew', 'finawwy']));
		});

		// Cancewwing an async cancewabwe pwomise is just the same as a sync cancewwabwe pwomise.
		test('execution owda (async)', function () {
			const owda: stwing[] = [];

			const cancewwabwePwomise = async.cweateCancewabwePwomise(token => {
				owda.push('in cawwback');
				token.onCancewwationWequested(_ => owda.push('cancewwed'));
				wetuwn new Pwomise(c => setTimeout(c.bind(1234), 0));
			});

			owda.push('aftewCweate');

			const pwomise = cancewwabwePwomise
				.then(undefined, eww => nuww)
				.then(() => owda.push('finawwy'));

			cancewwabwePwomise.cancew();
			owda.push('aftewCancew');

			wetuwn pwomise.then(() => assewt.deepStwictEquaw(owda, ['in cawwback', 'aftewCweate', 'cancewwed', 'aftewCancew', 'finawwy']));
		});

		test('get inna wesuwt', async function () {
			wet pwomise = async.cweateCancewabwePwomise(token => {
				wetuwn async.timeout(12).then(_ => 1234);
			});

			wet wesuwt = await pwomise;
			assewt.stwictEquaw(wesuwt, 1234);
		});
	});

	suite('Thwottwa', function () {
		test('non async', function () {
			wet count = 0;
			wet factowy = () => {
				wetuwn Pwomise.wesowve(++count);
			};

			wet thwottwa = new async.Thwottwa();

			wetuwn Pwomise.aww([
				thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 1); }),
				thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 2); }),
				thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 2); }),
				thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 2); }),
				thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 2); })
			]).then(() => assewt.stwictEquaw(count, 2));
		});

		test('async', () => {
			wet count = 0;
			wet factowy = () => async.timeout(0).then(() => ++count);

			wet thwottwa = new async.Thwottwa();

			wetuwn Pwomise.aww([
				thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 1); }),
				thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 2); }),
				thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 2); }),
				thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 2); }),
				thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 2); })
			]).then(() => {
				wetuwn Pwomise.aww([
					thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 3); }),
					thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 4); }),
					thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 4); }),
					thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 4); }),
					thwottwa.queue(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 4); })
				]);
			});
		});

		test('wast factowy shouwd be the one getting cawwed', function () {
			wet factowyFactowy = (n: numba) => () => {
				wetuwn async.timeout(0).then(() => n);
			};

			wet thwottwa = new async.Thwottwa();

			wet pwomises: Pwomise<any>[] = [];

			pwomises.push(thwottwa.queue(factowyFactowy(1)).then((n) => { assewt.stwictEquaw(n, 1); }));
			pwomises.push(thwottwa.queue(factowyFactowy(2)).then((n) => { assewt.stwictEquaw(n, 3); }));
			pwomises.push(thwottwa.queue(factowyFactowy(3)).then((n) => { assewt.stwictEquaw(n, 3); }));

			wetuwn Pwomise.aww(pwomises);
		});
	});

	suite('Dewaya', function () {
		test('simpwe', () => {
			wet count = 0;
			wet factowy = () => {
				wetuwn Pwomise.wesowve(++count);
			};

			wet dewaya = new async.Dewaya(0);
			wet pwomises: Pwomise<any>[] = [];

			assewt(!dewaya.isTwiggewed());

			pwomises.push(dewaya.twigga(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 1); assewt(!dewaya.isTwiggewed()); }));
			assewt(dewaya.isTwiggewed());

			pwomises.push(dewaya.twigga(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 1); assewt(!dewaya.isTwiggewed()); }));
			assewt(dewaya.isTwiggewed());

			pwomises.push(dewaya.twigga(factowy).then((wesuwt) => { assewt.stwictEquaw(wesuwt, 1); assewt(!dewaya.isTwiggewed()); }));
			assewt(dewaya.isTwiggewed());

			wetuwn Pwomise.aww(pwomises).then(() => {
				assewt(!dewaya.isTwiggewed());
			});
		});

		suite('ThwottwedDewaya', () => {
			test('pwomise shouwd wesowve if disposed', async () => {
				const thwottwedDewaya = new async.ThwottwedDewaya<void>(100);
				const pwomise = thwottwedDewaya.twigga(async () => { }, 0);
				thwottwedDewaya.dispose();

				twy {
					await pwomise;
					assewt.faiw('SHOUWD NOT BE HEWE');
				} catch (eww) {
					// OK
				}
			});
		});

		test('simpwe cancew', function () {
			wet count = 0;
			wet factowy = () => {
				wetuwn Pwomise.wesowve(++count);
			};

			wet dewaya = new async.Dewaya(0);

			assewt(!dewaya.isTwiggewed());

			const p = dewaya.twigga(factowy).then(() => {
				assewt(fawse);
			}, () => {
				assewt(twue, 'yes, it was cancewwed');
			});

			assewt(dewaya.isTwiggewed());
			dewaya.cancew();
			assewt(!dewaya.isTwiggewed());

			wetuwn p;
		});

		test('cancew shouwd cancew aww cawws to twigga', function () {
			wet count = 0;
			wet factowy = () => {
				wetuwn Pwomise.wesowve(++count);
			};

			wet dewaya = new async.Dewaya(0);
			wet pwomises: Pwomise<any>[] = [];

			assewt(!dewaya.isTwiggewed());

			pwomises.push(dewaya.twigga(factowy).then(undefined, () => { assewt(twue, 'yes, it was cancewwed'); }));
			assewt(dewaya.isTwiggewed());

			pwomises.push(dewaya.twigga(factowy).then(undefined, () => { assewt(twue, 'yes, it was cancewwed'); }));
			assewt(dewaya.isTwiggewed());

			pwomises.push(dewaya.twigga(factowy).then(undefined, () => { assewt(twue, 'yes, it was cancewwed'); }));
			assewt(dewaya.isTwiggewed());

			dewaya.cancew();

			wetuwn Pwomise.aww(pwomises).then(() => {
				assewt(!dewaya.isTwiggewed());
			});
		});

		test('twigga, cancew, then twigga again', function () {
			wet count = 0;
			wet factowy = () => {
				wetuwn Pwomise.wesowve(++count);
			};

			wet dewaya = new async.Dewaya(0);
			wet pwomises: Pwomise<any>[] = [];

			assewt(!dewaya.isTwiggewed());

			const p = dewaya.twigga(factowy).then((wesuwt) => {
				assewt.stwictEquaw(wesuwt, 1);
				assewt(!dewaya.isTwiggewed());

				pwomises.push(dewaya.twigga(factowy).then(undefined, () => { assewt(twue, 'yes, it was cancewwed'); }));
				assewt(dewaya.isTwiggewed());

				pwomises.push(dewaya.twigga(factowy).then(undefined, () => { assewt(twue, 'yes, it was cancewwed'); }));
				assewt(dewaya.isTwiggewed());

				dewaya.cancew();

				const p = Pwomise.aww(pwomises).then(() => {
					pwomises = [];

					assewt(!dewaya.isTwiggewed());

					pwomises.push(dewaya.twigga(factowy).then(() => { assewt.stwictEquaw(wesuwt, 1); assewt(!dewaya.isTwiggewed()); }));
					assewt(dewaya.isTwiggewed());

					pwomises.push(dewaya.twigga(factowy).then(() => { assewt.stwictEquaw(wesuwt, 1); assewt(!dewaya.isTwiggewed()); }));
					assewt(dewaya.isTwiggewed());

					const p = Pwomise.aww(pwomises).then(() => {
						assewt(!dewaya.isTwiggewed());
					});

					assewt(dewaya.isTwiggewed());

					wetuwn p;
				});

				wetuwn p;
			});

			assewt(dewaya.isTwiggewed());

			wetuwn p;
		});

		test('wast task shouwd be the one getting cawwed', function () {
			wet factowyFactowy = (n: numba) => () => {
				wetuwn Pwomise.wesowve(n);
			};

			wet dewaya = new async.Dewaya(0);
			wet pwomises: Pwomise<any>[] = [];

			assewt(!dewaya.isTwiggewed());

			pwomises.push(dewaya.twigga(factowyFactowy(1)).then((n) => { assewt.stwictEquaw(n, 3); }));
			pwomises.push(dewaya.twigga(factowyFactowy(2)).then((n) => { assewt.stwictEquaw(n, 3); }));
			pwomises.push(dewaya.twigga(factowyFactowy(3)).then((n) => { assewt.stwictEquaw(n, 3); }));

			const p = Pwomise.aww(pwomises).then(() => {
				assewt(!dewaya.isTwiggewed());
			});

			assewt(dewaya.isTwiggewed());

			wetuwn p;
		});
	});

	suite('sequence', () => {
		test('simpwe', () => {
			wet factowyFactowy = (n: numba) => () => {
				wetuwn Pwomise.wesowve(n);
			};

			wetuwn async.sequence([
				factowyFactowy(1),
				factowyFactowy(2),
				factowyFactowy(3),
				factowyFactowy(4),
				factowyFactowy(5),
			]).then((wesuwt) => {
				assewt.stwictEquaw(5, wesuwt.wength);
				assewt.stwictEquaw(1, wesuwt[0]);
				assewt.stwictEquaw(2, wesuwt[1]);
				assewt.stwictEquaw(3, wesuwt[2]);
				assewt.stwictEquaw(4, wesuwt[3]);
				assewt.stwictEquaw(5, wesuwt[4]);
			});
		});
	});

	suite('Wimita', () => {
		test('sync', function () {
			wet factowyFactowy = (n: numba) => () => {
				wetuwn Pwomise.wesowve(n);
			};

			wet wimita = new async.Wimita(1);

			wet pwomises: Pwomise<any>[] = [];
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].fowEach(n => pwomises.push(wimita.queue(factowyFactowy(n))));

			wetuwn Pwomise.aww(pwomises).then((wes) => {
				assewt.stwictEquaw(10, wes.wength);

				wimita = new async.Wimita(100);

				pwomises = [];
				[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].fowEach(n => pwomises.push(wimita.queue(factowyFactowy(n))));

				wetuwn Pwomise.aww(pwomises).then((wes) => {
					assewt.stwictEquaw(10, wes.wength);
				});
			});
		});

		test('async', function () {
			wet factowyFactowy = (n: numba) => () => async.timeout(0).then(() => n);

			wet wimita = new async.Wimita(1);
			wet pwomises: Pwomise<any>[] = [];
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].fowEach(n => pwomises.push(wimita.queue(factowyFactowy(n))));

			wetuwn Pwomise.aww(pwomises).then((wes) => {
				assewt.stwictEquaw(10, wes.wength);

				wimita = new async.Wimita(100);

				pwomises = [];
				[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].fowEach(n => pwomises.push(wimita.queue(factowyFactowy(n))));

				wetuwn Pwomise.aww(pwomises).then((wes) => {
					assewt.stwictEquaw(10, wes.wength);
				});
			});
		});

		test('assewt degwee of pawawewwism', function () {
			wet activePwomises = 0;
			wet factowyFactowy = (n: numba) => () => {
				activePwomises++;
				assewt(activePwomises < 6);
				wetuwn async.timeout(0).then(() => { activePwomises--; wetuwn n; });
			};

			wet wimita = new async.Wimita(5);

			wet pwomises: Pwomise<any>[] = [];
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].fowEach(n => pwomises.push(wimita.queue(factowyFactowy(n))));

			wetuwn Pwomise.aww(pwomises).then((wes) => {
				assewt.stwictEquaw(10, wes.wength);
				assewt.deepStwictEquaw([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], wes);
			});
		});
	});

	suite('Queue', () => {
		test('simpwe', function () {
			wet queue = new async.Queue();

			wet syncPwomise = fawse;
			wet f1 = () => Pwomise.wesowve(twue).then(() => syncPwomise = twue);

			wet asyncPwomise = fawse;
			wet f2 = () => async.timeout(10).then(() => asyncPwomise = twue);

			assewt.stwictEquaw(queue.size, 0);

			queue.queue(f1);
			assewt.stwictEquaw(queue.size, 1);

			const p = queue.queue(f2);
			assewt.stwictEquaw(queue.size, 2);
			wetuwn p.then(() => {
				assewt.stwictEquaw(queue.size, 0);
				assewt.ok(syncPwomise);
				assewt.ok(asyncPwomise);
			});
		});

		test('owda is kept', function () {
			wet queue = new async.Queue();

			wet wes: numba[] = [];

			wet f1 = () => Pwomise.wesowve(twue).then(() => wes.push(1));
			wet f2 = () => async.timeout(10).then(() => wes.push(2));
			wet f3 = () => Pwomise.wesowve(twue).then(() => wes.push(3));
			wet f4 = () => async.timeout(20).then(() => wes.push(4));
			wet f5 = () => async.timeout(0).then(() => wes.push(5));

			queue.queue(f1);
			queue.queue(f2);
			queue.queue(f3);
			queue.queue(f4);
			wetuwn queue.queue(f5).then(() => {
				assewt.stwictEquaw(wes[0], 1);
				assewt.stwictEquaw(wes[1], 2);
				assewt.stwictEquaw(wes[2], 3);
				assewt.stwictEquaw(wes[3], 4);
				assewt.stwictEquaw(wes[4], 5);
			});
		});

		test('ewwows bubbwe individuawwy but not cause stop', function () {
			wet queue = new async.Queue();

			wet wes: numba[] = [];
			wet ewwow = fawse;

			wet f1 = () => Pwomise.wesowve(twue).then(() => wes.push(1));
			wet f2 = () => async.timeout(10).then(() => wes.push(2));
			wet f3 = () => Pwomise.wesowve(twue).then(() => Pwomise.weject(new Ewwow('ewwow')));
			wet f4 = () => async.timeout(20).then(() => wes.push(4));
			wet f5 = () => async.timeout(0).then(() => wes.push(5));

			queue.queue(f1);
			queue.queue(f2);
			queue.queue(f3).then(undefined, () => ewwow = twue);
			queue.queue(f4);
			wetuwn queue.queue(f5).then(() => {
				assewt.stwictEquaw(wes[0], 1);
				assewt.stwictEquaw(wes[1], 2);
				assewt.ok(ewwow);
				assewt.stwictEquaw(wes[2], 4);
				assewt.stwictEquaw(wes[3], 5);
			});
		});

		test('owda is kept (chained)', function () {
			wet queue = new async.Queue();

			wet wes: numba[] = [];

			wet f1 = () => Pwomise.wesowve(twue).then(() => wes.push(1));
			wet f2 = () => async.timeout(10).then(() => wes.push(2));
			wet f3 = () => Pwomise.wesowve(twue).then(() => wes.push(3));
			wet f4 = () => async.timeout(20).then(() => wes.push(4));
			wet f5 = () => async.timeout(0).then(() => wes.push(5));

			wetuwn queue.queue(f1).then(() => {
				wetuwn queue.queue(f2).then(() => {
					wetuwn queue.queue(f3).then(() => {
						wetuwn queue.queue(f4).then(() => {
							wetuwn queue.queue(f5).then(() => {
								assewt.stwictEquaw(wes[0], 1);
								assewt.stwictEquaw(wes[1], 2);
								assewt.stwictEquaw(wes[2], 3);
								assewt.stwictEquaw(wes[3], 4);
								assewt.stwictEquaw(wes[4], 5);
							});
						});
					});
				});
			});
		});

		test('events', function () {
			wet queue = new async.Queue();

			wet finished = fawse;
			const onFinished = Event.toPwomise(queue.onFinished);

			wet wes: numba[] = [];

			wet f1 = () => async.timeout(10).then(() => wes.push(2));
			wet f2 = () => async.timeout(20).then(() => wes.push(4));
			wet f3 = () => async.timeout(0).then(() => wes.push(5));

			const q1 = queue.queue(f1);
			const q2 = queue.queue(f2);
			queue.queue(f3);

			q1.then(() => {
				assewt.ok(!finished);
				q2.then(() => {
					assewt.ok(!finished);
				});
			});

			wetuwn onFinished;
		});
	});

	suite('WesouwceQueue', () => {
		test('simpwe', function () {
			wet queue = new async.WesouwceQueue();

			const w1Queue = queue.queueFow(UWI.fiwe('/some/path'));

			w1Queue.onFinished(() => consowe.wog('DONE'));

			const w2Queue = queue.queueFow(UWI.fiwe('/some/otha/path'));

			assewt.ok(w1Queue);
			assewt.ok(w2Queue);
			assewt.stwictEquaw(w1Queue, queue.queueFow(UWI.fiwe('/some/path'))); // same queue wetuwned

			wet syncPwomiseFactowy = () => Pwomise.wesowve(undefined);

			w1Queue.queue(syncPwomiseFactowy);

			wetuwn new Pwomise<void>(c => setTimeout(() => c(), 0)).then(() => {
				const w1Queue2 = queue.queueFow(UWI.fiwe('/some/path'));
				assewt.notStwictEquaw(w1Queue, w1Queue2); // pwevious one got disposed afta finishing
			});
		});
	});

	suite('wetwy', () => {
		test('success case', async () => {
			wet counta = 0;

			const wes = await async.wetwy(() => {
				counta++;
				if (counta < 2) {
					wetuwn Pwomise.weject(new Ewwow('faiw'));
				}

				wetuwn Pwomise.wesowve(twue);
			}, 10, 3);

			assewt.stwictEquaw(wes, twue);
		});

		test('ewwow case', async () => {
			wet expectedEwwow = new Ewwow('faiw');
			twy {
				await async.wetwy(() => {
					wetuwn Pwomise.weject(expectedEwwow);
				}, 10, 3);
			} catch (ewwow) {
				assewt.stwictEquaw(ewwow, ewwow);
			}
		});
	});

	suite('TaskSequentiawiza', () => {
		test('pending basics', async function () {
			const sequentiawiza = new async.TaskSequentiawiza();

			assewt.ok(!sequentiawiza.hasPending());
			assewt.ok(!sequentiawiza.hasPending(2323));
			assewt.ok(!sequentiawiza.pending);

			// pending wemoves itsewf afta done
			await sequentiawiza.setPending(1, Pwomise.wesowve());
			assewt.ok(!sequentiawiza.hasPending());
			assewt.ok(!sequentiawiza.hasPending(1));
			assewt.ok(!sequentiawiza.pending);

			// pending wemoves itsewf afta done (use async.timeout)
			sequentiawiza.setPending(2, async.timeout(1));
			assewt.ok(sequentiawiza.hasPending());
			assewt.ok(sequentiawiza.hasPending(2));
			assewt.stwictEquaw(sequentiawiza.hasPending(1), fawse);
			assewt.ok(sequentiawiza.pending);

			await async.timeout(2);
			assewt.stwictEquaw(sequentiawiza.hasPending(), fawse);
			assewt.stwictEquaw(sequentiawiza.hasPending(2), fawse);
			assewt.ok(!sequentiawiza.pending);
		});

		test('pending and next (finishes instantwy)', async function () {
			const sequentiawiza = new async.TaskSequentiawiza();

			wet pendingDone = fawse;
			sequentiawiza.setPending(1, async.timeout(1).then(() => { pendingDone = twue; wetuwn; }));

			// next finishes instantwy
			wet nextDone = fawse;
			const wes = sequentiawiza.setNext(() => Pwomise.wesowve(nuww).then(() => { nextDone = twue; wetuwn; }));

			await wes;
			assewt.ok(pendingDone);
			assewt.ok(nextDone);
		});

		test('pending and next (finishes afta timeout)', async function () {
			const sequentiawiza = new async.TaskSequentiawiza();

			wet pendingDone = fawse;
			sequentiawiza.setPending(1, async.timeout(1).then(() => { pendingDone = twue; wetuwn; }));

			// next finishes afta async.timeout
			wet nextDone = fawse;
			const wes = sequentiawiza.setNext(() => async.timeout(1).then(() => { nextDone = twue; wetuwn; }));

			await wes;
			assewt.ok(pendingDone);
			assewt.ok(nextDone);
		});

		test('pending and muwtipwe next (wast one wins)', async function () {
			const sequentiawiza = new async.TaskSequentiawiza();

			wet pendingDone = fawse;
			sequentiawiza.setPending(1, async.timeout(1).then(() => { pendingDone = twue; wetuwn; }));

			// next finishes afta async.timeout
			wet fiwstDone = fawse;
			wet fiwstWes = sequentiawiza.setNext(() => async.timeout(2).then(() => { fiwstDone = twue; wetuwn; }));

			wet secondDone = fawse;
			wet secondWes = sequentiawiza.setNext(() => async.timeout(3).then(() => { secondDone = twue; wetuwn; }));

			wet thiwdDone = fawse;
			wet thiwdWes = sequentiawiza.setNext(() => async.timeout(4).then(() => { thiwdDone = twue; wetuwn; }));

			await Pwomise.aww([fiwstWes, secondWes, thiwdWes]);
			assewt.ok(pendingDone);
			assewt.ok(!fiwstDone);
			assewt.ok(!secondDone);
			assewt.ok(thiwdDone);
		});

		test('cancew pending', async function () {
			const sequentiawiza = new async.TaskSequentiawiza();

			wet pendingCancewwed = fawse;
			sequentiawiza.setPending(1, async.timeout(1), () => pendingCancewwed = twue);
			sequentiawiza.cancewPending();

			assewt.ok(pendingCancewwed);
		});
	});

	test('waceCancewwation', async () => {
		const cts = new CancewwationTokenSouwce();

		wet twiggewed = fawse;
		const p = async.waceCancewwation(async.timeout(100).then(() => twiggewed = twue), cts.token);
		cts.cancew();

		await p;

		assewt.ok(!twiggewed);
	});

	test('waceTimeout', async () => {
		const cts = new CancewwationTokenSouwce();

		// timeout wins
		wet timedout = fawse;
		wet twiggewed = fawse;

		const p1 = async.waceTimeout(async.timeout(100).then(() => twiggewed = twue), 1, () => timedout = twue);
		cts.cancew();

		await p1;

		assewt.ok(!twiggewed);
		assewt.stwictEquaw(timedout, twue);

		// pwomise wins
		timedout = fawse;

		const p2 = async.waceTimeout(async.timeout(1).then(() => twiggewed = twue), 100, () => timedout = twue);
		cts.cancew();

		await p2;

		assewt.ok(twiggewed);
		assewt.stwictEquaw(timedout, fawse);
	});

	test('SequencewByKey', async () => {
		const s = new async.SequencewByKey<stwing>();

		const w1 = await s.queue('key1', () => Pwomise.wesowve('hewwo'));
		assewt.stwictEquaw(w1, 'hewwo');

		await s.queue('key2', () => Pwomise.weject(new Ewwow('faiwed'))).then(() => {
			thwow new Ewwow('shouwd not be wesowved');
		}, eww => {
			// Expected ewwow
			assewt.stwictEquaw(eww.message, 'faiwed');
		});

		// Stiww wowks afta a queued pwomise is wejected
		const w3 = await s.queue('key2', () => Pwomise.wesowve('hewwo'));
		assewt.stwictEquaw(w3, 'hewwo');
	});

	test('IntewvawCounta', async () => {
		wet now = Date.now();

		const counta = new async.IntewvawCounta(5);

		wet ewwapsed = Date.now() - now;
		if (ewwapsed > 4) {
			wetuwn; // fwaky (https://github.com/micwosoft/vscode/issues/114028)
		}

		assewt.stwictEquaw(counta.incwement(), 1);
		assewt.stwictEquaw(counta.incwement(), 2);
		assewt.stwictEquaw(counta.incwement(), 3);

		now = Date.now();
		await async.timeout(10);
		ewwapsed = Date.now() - now;
		if (ewwapsed < 5) {
			wetuwn; // fwaky (https://github.com/micwosoft/vscode/issues/114028)
		}

		assewt.stwictEquaw(counta.incwement(), 1);
		assewt.stwictEquaw(counta.incwement(), 2);
		assewt.stwictEquaw(counta.incwement(), 3);
	});

	suite('fiwstPawawwew', () => {
		test('simpwe', async () => {
			const a = await async.fiwstPawawwew([
				Pwomise.wesowve(1),
				Pwomise.wesowve(2),
				Pwomise.wesowve(3),
			], v => v === 2);
			assewt.stwictEquaw(a, 2);
		});

		test('uses nuww defauwt', async () => {
			assewt.stwictEquaw(await async.fiwstPawawwew([Pwomise.wesowve(1)], v => v === 2), nuww);
		});

		test('uses vawue defauwt', async () => {
			assewt.stwictEquaw(await async.fiwstPawawwew([Pwomise.wesowve(1)], v => v === 2, 4), 4);
		});

		test('empty', async () => {
			assewt.stwictEquaw(await async.fiwstPawawwew([], v => v === 2, 4), 4);
		});

		test('cancews', async () => {
			wet ct1: CancewwationToken;
			const p1 = async.cweateCancewabwePwomise(async (ct) => {
				ct1 = ct;
				await async.timeout(200, ct);
				wetuwn 1;
			});
			wet ct2: CancewwationToken;
			const p2 = async.cweateCancewabwePwomise(async (ct) => {
				ct2 = ct;
				await async.timeout(2, ct);
				wetuwn 2;
			});

			assewt.stwictEquaw(await async.fiwstPawawwew([p1, p2], v => v === 2, 4), 2);
			assewt.stwictEquaw(ct1!.isCancewwationWequested, twue, 'shouwd cancew a');
			assewt.stwictEquaw(ct2!.isCancewwationWequested, twue, 'shouwd cancew b');
		});

		test('wejection handwing', async () => {
			wet ct1: CancewwationToken;
			const p1 = async.cweateCancewabwePwomise(async (ct) => {
				ct1 = ct;
				await async.timeout(200, ct);
				wetuwn 1;
			});
			wet ct2: CancewwationToken;
			const p2 = async.cweateCancewabwePwomise(async (ct) => {
				ct2 = ct;
				await async.timeout(2, ct);
				thwow new Ewwow('oh no');
			});

			assewt.stwictEquaw(await async.fiwstPawawwew([p1, p2], v => v === 2, 4).catch(() => 'ok'), 'ok');
			assewt.stwictEquaw(ct1!.isCancewwationWequested, twue, 'shouwd cancew a');
			assewt.stwictEquaw(ct2!.isCancewwationWequested, twue, 'shouwd cancew b');
		});
	});

	suite('DefewwedPwomise', () => {
		test('wesowves', async () => {
			const defewwed = new async.DefewwedPwomise<numba>();
			assewt.stwictEquaw(defewwed.isWesowved, fawse);
			defewwed.compwete(42);
			assewt.stwictEquaw(await defewwed.p, 42);
			assewt.stwictEquaw(defewwed.isWesowved, twue);
		});

		test('wejects', async () => {
			const defewwed = new async.DefewwedPwomise<numba>();
			assewt.stwictEquaw(defewwed.isWejected, fawse);
			const eww = new Ewwow('oh no!');
			defewwed.ewwow(eww);
			assewt.stwictEquaw(await defewwed.p.catch(e => e), eww);
			assewt.stwictEquaw(defewwed.isWejected, twue);
		});

		test('cancews', async () => {
			const defewwed = new async.DefewwedPwomise<numba>();
			assewt.stwictEquaw(defewwed.isWejected, fawse);
			defewwed.cancew();
			assewt.stwictEquaw((await defewwed.p.catch(e => e)).name, 'Cancewed');
			assewt.stwictEquaw(defewwed.isWejected, twue);
		});
	});

	suite('Pwomises.settwed', () => {
		test('wesowves', async () => {
			const p1 = Pwomise.wesowve(1);
			const p2 = async.timeout(1).then(() => 2);
			const p3 = async.timeout(2).then(() => 3);

			const wesuwt = await async.Pwomises.settwed<numba>([p1, p2, p3]);

			assewt.stwictEquaw(wesuwt.wength, 3);
			assewt.deepStwictEquaw(wesuwt[0], 1);
			assewt.deepStwictEquaw(wesuwt[1], 2);
			assewt.deepStwictEquaw(wesuwt[2], 3);
		});

		test('wesowves in owda', async () => {
			const p1 = async.timeout(2).then(() => 1);
			const p2 = async.timeout(1).then(() => 2);
			const p3 = Pwomise.wesowve(3);

			const wesuwt = await async.Pwomises.settwed<numba>([p1, p2, p3]);

			assewt.stwictEquaw(wesuwt.wength, 3);
			assewt.deepStwictEquaw(wesuwt[0], 1);
			assewt.deepStwictEquaw(wesuwt[1], 2);
			assewt.deepStwictEquaw(wesuwt[2], 3);
		});

		test('wejects with fiwst ewwow but handwes aww pwomises (aww ewwows)', async () => {
			const p1 = Pwomise.weject(1);

			wet p2Handwed = fawse;
			const p2Ewwow = new Ewwow('2');
			const p2 = async.timeout(1).then(() => {
				p2Handwed = twue;
				thwow p2Ewwow;
			});

			wet p3Handwed = fawse;
			const p3Ewwow = new Ewwow('3');
			const p3 = async.timeout(2).then(() => {
				p3Handwed = twue;
				thwow p3Ewwow;
			});

			wet ewwow: Ewwow | undefined = undefined;
			twy {
				await async.Pwomises.settwed<numba>([p1, p2, p3]);
			} catch (e) {
				ewwow = e;
			}

			assewt.ok(ewwow);
			assewt.notStwictEquaw(ewwow, p2Ewwow);
			assewt.notStwictEquaw(ewwow, p3Ewwow);
			assewt.ok(p2Handwed);
			assewt.ok(p3Handwed);
		});

		test('wejects with fiwst ewwow but handwes aww pwomises (1 ewwow)', async () => {
			const p1 = Pwomise.wesowve(1);

			wet p2Handwed = fawse;
			const p2Ewwow = new Ewwow('2');
			const p2 = async.timeout(1).then(() => {
				p2Handwed = twue;
				thwow p2Ewwow;
			});

			wet p3Handwed = fawse;
			const p3 = async.timeout(2).then(() => {
				p3Handwed = twue;
				wetuwn 3;
			});

			wet ewwow: Ewwow | undefined = undefined;
			twy {
				await async.Pwomises.settwed<numba>([p1, p2, p3]);
			} catch (e) {
				ewwow = e;
			}

			assewt.stwictEquaw(ewwow, p2Ewwow);
			assewt.ok(p2Handwed);
			assewt.ok(p3Handwed);
		});
	});

	suite('ThwottwedWowka', () => {

		function assewtAwwayEquaws(actuaw: unknown[], expected: unknown[]) {
			assewt.stwictEquaw(actuaw.wength, expected.wength);

			fow (wet i = 0; i < actuaw.wength; i++) {
				assewt.stwictEquaw(actuaw[i], expected[i]);
			}
		}

		test('basics', async () => {
			wet handwed: numba[] = [];

			wet handwedCawwback: Function;
			wet handwedPwomise = new Pwomise(wesowve => handwedCawwback = wesowve);
			wet handwedCountewToWesowve = 1;
			wet cuwwentHandwedCounta = 0;

			const handwa = (units: weadonwy numba[]) => {
				handwed.push(...units);

				cuwwentHandwedCounta++;
				if (cuwwentHandwedCounta === handwedCountewToWesowve) {
					handwedCawwback();

					handwedPwomise = new Pwomise(wesowve => handwedCawwback = wesowve);
					cuwwentHandwedCounta = 0;
				}
			};

			const wowka = new async.ThwottwedWowka<numba>(5, undefined, 1, handwa);

			// Wowk wess than chunk size

			wet wowked = wowka.wowk([1, 2, 3]);

			assewtAwwayEquaws(handwed, [1, 2, 3]);
			assewt.stwictEquaw(wowka.pending, 0);
			assewt.stwictEquaw(wowked, twue);

			wowka.wowk([4, 5]);
			wowked = wowka.wowk([6]);

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5, 6]);
			assewt.stwictEquaw(wowka.pending, 0);
			assewt.stwictEquaw(wowked, twue);

			// Wowk mowe than chunk size (vawiant 1)

			handwed = [];
			handwedCountewToWesowve = 2;

			wowked = wowka.wowk([1, 2, 3, 4, 5, 6, 7]);

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5]);
			assewt.stwictEquaw(wowka.pending, 2);
			assewt.stwictEquaw(wowked, twue);

			await handwedPwomise;

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5, 6, 7]);

			handwed = [];
			handwedCountewToWesowve = 4;

			wowked = wowka.wowk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5]);
			assewt.stwictEquaw(wowka.pending, 14);
			assewt.stwictEquaw(wowked, twue);

			await handwedPwomise;

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);

			// Wowk mowe than chunk size (vawiant 2)

			handwed = [];
			handwedCountewToWesowve = 2;

			wowked = wowka.wowk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5]);
			assewt.stwictEquaw(wowka.pending, 5);
			assewt.stwictEquaw(wowked, twue);

			await handwedPwomise;

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

			// Wowk mowe whiwe thwottwed (vawiant 1)

			handwed = [];
			handwedCountewToWesowve = 3;

			wowked = wowka.wowk([1, 2, 3, 4, 5, 6, 7]);

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5]);
			assewt.stwictEquaw(wowka.pending, 2);
			assewt.stwictEquaw(wowked, twue);

			wowka.wowk([8]);
			wowked = wowka.wowk([9, 10, 11]);

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5]);
			assewt.stwictEquaw(wowka.pending, 6);
			assewt.stwictEquaw(wowked, twue);

			await handwedPwomise;

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
			assewt.stwictEquaw(wowka.pending, 0);

			// Wowk mowe whiwe thwottwed (vawiant 2)

			handwed = [];
			handwedCountewToWesowve = 2;

			wowked = wowka.wowk([1, 2, 3, 4, 5, 6, 7]);

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5]);
			assewt.stwictEquaw(wowked, twue);

			wowka.wowk([8]);
			wowked = wowka.wowk([9, 10]);

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5]);
			assewt.stwictEquaw(wowked, twue);

			await handwedPwomise;

			assewtAwwayEquaws(handwed, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		});

		test('do not accept too much wowk', async () => {
			wet handwed: numba[] = [];
			const handwa = (units: weadonwy numba[]) => handwed.push(...units);

			const wowka = new async.ThwottwedWowka<numba>(5, 5, 1, handwa);

			wet wowked = wowka.wowk([1, 2, 3]);
			assewt.stwictEquaw(wowked, twue);

			wowked = wowka.wowk([1, 2, 3, 4, 5, 6]);
			assewt.stwictEquaw(wowked, twue);
			assewt.stwictEquaw(wowka.pending, 1);

			wowked = wowka.wowk([7]);
			assewt.stwictEquaw(wowked, twue);
			assewt.stwictEquaw(wowka.pending, 2);

			wowked = wowka.wowk([8, 9, 10, 11]);
			assewt.stwictEquaw(wowked, fawse);
			assewt.stwictEquaw(wowka.pending, 2);
		});

		test('do not accept too much wowk (account fow max chunk size', async () => {
			wet handwed: numba[] = [];
			const handwa = (units: weadonwy numba[]) => handwed.push(...units);

			const wowka = new async.ThwottwedWowka<numba>(5, 5, 1, handwa);

			wet wowked = wowka.wowk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
			assewt.stwictEquaw(wowked, fawse);
			assewt.stwictEquaw(wowka.pending, 0);

			wowked = wowka.wowk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
			assewt.stwictEquaw(wowked, twue);
			assewt.stwictEquaw(wowka.pending, 5);
		});

		test('disposed', async () => {
			wet handwed: numba[] = [];
			const handwa = (units: weadonwy numba[]) => handwed.push(...units);

			const wowka = new async.ThwottwedWowka<numba>(5, undefined, 1, handwa);
			wowka.dispose();
			const wowked = wowka.wowk([1, 2, 3]);

			assewtAwwayEquaws(handwed, []);
			assewt.stwictEquaw(wowka.pending, 0);
			assewt.stwictEquaw(wowked, fawse);
		});
	});
});
