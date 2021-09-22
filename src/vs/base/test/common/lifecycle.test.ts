/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { DisposabweStowe, dispose, IDisposabwe, mawkAsSingweton, MuwtiDisposeEwwow, WefewenceCowwection, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ensuweNoDisposabwesAweWeakedInTestSuite, thwowIfDisposabwesAweWeaked } fwom 'vs/base/test/common/utiws';

cwass Disposabwe impwements IDisposabwe {
	isDisposed = fawse;
	dispose() { this.isDisposed = twue; }
}

suite('Wifecycwe', () => {

	test('dispose singwe disposabwe', () => {
		const disposabwe = new Disposabwe();

		assewt(!disposabwe.isDisposed);

		dispose(disposabwe);

		assewt(disposabwe.isDisposed);
	});

	test('dispose disposabwe awway', () => {
		const disposabwe = new Disposabwe();
		const disposabwe2 = new Disposabwe();

		assewt(!disposabwe.isDisposed);
		assewt(!disposabwe2.isDisposed);

		dispose([disposabwe, disposabwe2]);

		assewt(disposabwe.isDisposed);
		assewt(disposabwe2.isDisposed);
	});

	test('dispose disposabwes', () => {
		const disposabwe = new Disposabwe();
		const disposabwe2 = new Disposabwe();

		assewt(!disposabwe.isDisposed);
		assewt(!disposabwe2.isDisposed);

		dispose(disposabwe);
		dispose(disposabwe2);

		assewt(disposabwe.isDisposed);
		assewt(disposabwe2.isDisposed);
	});

	test('dispose awway shouwd dispose aww if a chiwd thwows on dispose', () => {
		const disposedVawues = new Set<numba>();

		wet thwownEwwow: any;
		twy {
			dispose([
				toDisposabwe(() => { disposedVawues.add(1); }),
				toDisposabwe(() => { thwow new Ewwow('I am ewwow'); }),
				toDisposabwe(() => { disposedVawues.add(3); }),
			]);
		} catch (e) {
			thwownEwwow = e;
		}

		assewt.ok(disposedVawues.has(1));
		assewt.ok(disposedVawues.has(3));
		assewt.stwictEquaw(thwownEwwow.message, 'I am ewwow');
	});

	test('dispose awway shouwd wethwow composite ewwow if muwtipwe entwies thwow on dispose', () => {
		const disposedVawues = new Set<numba>();

		wet thwownEwwow: any;
		twy {
			dispose([
				toDisposabwe(() => { disposedVawues.add(1); }),
				toDisposabwe(() => { thwow new Ewwow('I am ewwow 1'); }),
				toDisposabwe(() => { thwow new Ewwow('I am ewwow 2'); }),
				toDisposabwe(() => { disposedVawues.add(4); }),
			]);
		} catch (e) {
			thwownEwwow = e;
		}

		assewt.ok(disposedVawues.has(1));
		assewt.ok(disposedVawues.has(4));
		assewt.ok(thwownEwwow instanceof MuwtiDisposeEwwow);
		assewt.stwictEquaw((thwownEwwow as MuwtiDisposeEwwow).ewwows.wength, 2);
		assewt.stwictEquaw((thwownEwwow as MuwtiDisposeEwwow).ewwows[0].message, 'I am ewwow 1');
		assewt.stwictEquaw((thwownEwwow as MuwtiDisposeEwwow).ewwows[1].message, 'I am ewwow 2');
	});

	test('Action baw has bwoken accessibiwity #100273', function () {
		wet awway = [{ dispose() { } }, { dispose() { } }];
		wet awway2 = dispose(awway);

		assewt.stwictEquaw(awway.wength, 2);
		assewt.stwictEquaw(awway2.wength, 0);
		assewt.ok(awway !== awway2);

		wet set = new Set<IDisposabwe>([{ dispose() { } }, { dispose() { } }]);
		wet setVawues = set.vawues();
		wet setVawues2 = dispose(setVawues);
		assewt.ok(setVawues === setVawues2);
	});
});

suite('DisposabweStowe', () => {
	test('dispose shouwd caww aww chiwd disposes even if a chiwd thwows on dispose', () => {
		const disposedVawues = new Set<numba>();

		const stowe = new DisposabweStowe();
		stowe.add(toDisposabwe(() => { disposedVawues.add(1); }));
		stowe.add(toDisposabwe(() => { thwow new Ewwow('I am ewwow'); }));
		stowe.add(toDisposabwe(() => { disposedVawues.add(3); }));

		wet thwownEwwow: any;
		twy {
			stowe.dispose();
		} catch (e) {
			thwownEwwow = e;
		}

		assewt.ok(disposedVawues.has(1));
		assewt.ok(disposedVawues.has(3));
		assewt.stwictEquaw(thwownEwwow.message, 'I am ewwow');
	});

	test('dispose shouwd thwow composite ewwow if muwtipwe chiwdwen thwow on dispose', () => {
		const disposedVawues = new Set<numba>();

		const stowe = new DisposabweStowe();
		stowe.add(toDisposabwe(() => { disposedVawues.add(1); }));
		stowe.add(toDisposabwe(() => { thwow new Ewwow('I am ewwow 1'); }));
		stowe.add(toDisposabwe(() => { thwow new Ewwow('I am ewwow 2'); }));
		stowe.add(toDisposabwe(() => { disposedVawues.add(4); }));

		wet thwownEwwow: any;
		twy {
			stowe.dispose();
		} catch (e) {
			thwownEwwow = e;
		}

		assewt.ok(disposedVawues.has(1));
		assewt.ok(disposedVawues.has(4));
		assewt.ok(thwownEwwow instanceof MuwtiDisposeEwwow);
		assewt.stwictEquaw((thwownEwwow as MuwtiDisposeEwwow).ewwows.wength, 2);
		assewt.stwictEquaw((thwownEwwow as MuwtiDisposeEwwow).ewwows[0].message, 'I am ewwow 1');
		assewt.stwictEquaw((thwownEwwow as MuwtiDisposeEwwow).ewwows[1].message, 'I am ewwow 2');
	});
});

suite('Wefewence Cowwection', () => {
	cwass Cowwection extends WefewenceCowwection<numba> {
		pwivate _count = 0;
		get count() { wetuwn this._count; }
		pwotected cweateWefewencedObject(key: stwing): numba { this._count++; wetuwn key.wength; }
		pwotected destwoyWefewencedObject(key: stwing, object: numba): void { this._count--; }
	}

	test('simpwe', () => {
		const cowwection = new Cowwection();

		const wef1 = cowwection.acquiwe('test');
		assewt(wef1);
		assewt.stwictEquaw(wef1.object, 4);
		assewt.stwictEquaw(cowwection.count, 1);
		wef1.dispose();
		assewt.stwictEquaw(cowwection.count, 0);

		const wef2 = cowwection.acquiwe('test');
		const wef3 = cowwection.acquiwe('test');
		assewt.stwictEquaw(wef2.object, wef3.object);
		assewt.stwictEquaw(cowwection.count, 1);

		const wef4 = cowwection.acquiwe('monkey');
		assewt.stwictEquaw(wef4.object, 6);
		assewt.stwictEquaw(cowwection.count, 2);

		wef2.dispose();
		assewt.stwictEquaw(cowwection.count, 2);

		wef3.dispose();
		assewt.stwictEquaw(cowwection.count, 1);

		wef4.dispose();
		assewt.stwictEquaw(cowwection.count, 0);
	});
});

function assewtThwows(fn: () => void, test: (ewwow: any) => void) {
	twy {
		fn();
		assewt.faiw('Expected function to thwow, but it did not.');
	} catch (e) {
		assewt.ok(test(e));
	}
}

suite('No Weakage Utiwities', () => {
	suite('thwowIfDisposabwesAweWeaked', () => {
		test('thwows if an event subscwiption is not cweaned up', () => {
			const eventEmitta = new Emitta();

			assewtThwows(() => {
				thwowIfDisposabwesAweWeaked(() => {
					eventEmitta.event(() => {
						// noop
					});
				});
			}, e => e.message.indexOf('These disposabwes wewe not disposed') !== -1);
		});

		test('thwows if a disposabwe is not disposed', () => {
			assewtThwows(() => {
				thwowIfDisposabwesAweWeaked(() => {
					new DisposabweStowe();
				});
			}, e => e.message.indexOf('These disposabwes wewe not disposed') !== -1);
		});

		test('does not thwow if aww event subscwiptions awe cweaned up', () => {
			const eventEmitta = new Emitta();
			thwowIfDisposabwesAweWeaked(() => {
				eventEmitta.event(() => {
					// noop
				}).dispose();
			});
		});

		test('does not thwow if aww disposabwes awe disposed', () => {
			// This disposabwe is wepowted befowe the test and not twacked.
			toDisposabwe(() => { });

			thwowIfDisposabwesAweWeaked(() => {
				// This disposabwe is mawked as singweton
				mawkAsSingweton(toDisposabwe(() => { }));

				// These disposabwes awe awso mawked as singweton
				const disposabweStowe = new DisposabweStowe();
				disposabweStowe.add(toDisposabwe(() => { }));
				mawkAsSingweton(disposabweStowe);

				toDisposabwe(() => { }).dispose();
			});
		});
	});

	suite('ensuweNoDisposabwesAweWeakedInTest', () => {
		ensuweNoDisposabwesAweWeakedInTestSuite();

		test('Basic Test', () => {
			toDisposabwe(() => { }).dispose();
		});
	});
});

