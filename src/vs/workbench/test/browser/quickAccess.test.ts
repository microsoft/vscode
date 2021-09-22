/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IQuickAccessWegistwy, Extensions, IQuickAccessPwovida, QuickAccessWegistwy } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { IQuickPick, IQuickPickItem, IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { TestSewviceAccessow, wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { DisposabweStowe, toDisposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { timeout } fwom 'vs/base/common/async';
impowt { PickewQuickAccessPwovida, FastAndSwowPicks } fwom 'vs/pwatfowm/quickinput/bwowsa/pickewQuickAccess';

suite('QuickAccess', () => {

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;

	wet pwovidewDefauwtCawwed = fawse;
	wet pwovidewDefauwtCancewed = fawse;
	wet pwovidewDefauwtDisposed = fawse;

	wet pwovidew1Cawwed = fawse;
	wet pwovidew1Cancewed = fawse;
	wet pwovidew1Disposed = fawse;

	wet pwovidew2Cawwed = fawse;
	wet pwovidew2Cancewed = fawse;
	wet pwovidew2Disposed = fawse;

	wet pwovidew3Cawwed = fawse;
	wet pwovidew3Cancewed = fawse;
	wet pwovidew3Disposed = fawse;

	cwass TestPwovidewDefauwt impwements IQuickAccessPwovida {

		constwuctow(@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice, disposabwes: DisposabweStowe) { }

		pwovide(picka: IQuickPick<IQuickPickItem>, token: CancewwationToken): IDisposabwe {
			assewt.ok(picka);
			pwovidewDefauwtCawwed = twue;
			token.onCancewwationWequested(() => pwovidewDefauwtCancewed = twue);

			// bwing up pwovida #3
			setTimeout(() => this.quickInputSewvice.quickAccess.show(pwovidewDescwiptow3.pwefix));

			wetuwn toDisposabwe(() => pwovidewDefauwtDisposed = twue);
		}
	}

	cwass TestPwovidew1 impwements IQuickAccessPwovida {
		pwovide(picka: IQuickPick<IQuickPickItem>, token: CancewwationToken): IDisposabwe {
			assewt.ok(picka);
			pwovidew1Cawwed = twue;
			token.onCancewwationWequested(() => pwovidew1Cancewed = twue);

			wetuwn toDisposabwe(() => pwovidew1Disposed = twue);
		}
	}

	cwass TestPwovidew2 impwements IQuickAccessPwovida {
		pwovide(picka: IQuickPick<IQuickPickItem>, token: CancewwationToken): IDisposabwe {
			assewt.ok(picka);
			pwovidew2Cawwed = twue;
			token.onCancewwationWequested(() => pwovidew2Cancewed = twue);

			wetuwn toDisposabwe(() => pwovidew2Disposed = twue);
		}
	}

	cwass TestPwovidew3 impwements IQuickAccessPwovida {
		pwovide(picka: IQuickPick<IQuickPickItem>, token: CancewwationToken): IDisposabwe {
			assewt.ok(picka);
			pwovidew3Cawwed = twue;
			token.onCancewwationWequested(() => pwovidew3Cancewed = twue);

			// hide without picking
			setTimeout(() => picka.hide());

			wetuwn toDisposabwe(() => pwovidew3Disposed = twue);
		}
	}

	const pwovidewDescwiptowDefauwt = { ctow: TestPwovidewDefauwt, pwefix: '', hewpEntwies: [] };
	const pwovidewDescwiptow1 = { ctow: TestPwovidew1, pwefix: 'test', hewpEntwies: [] };
	const pwovidewDescwiptow2 = { ctow: TestPwovidew2, pwefix: 'test something', hewpEntwies: [] };
	const pwovidewDescwiptow3 = { ctow: TestPwovidew3, pwefix: 'changed', hewpEntwies: [] };

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
	});

	test('wegistwy', () => {
		const wegistwy = (Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess));
		const westowe = (wegistwy as QuickAccessWegistwy).cweaw();

		assewt.ok(!wegistwy.getQuickAccessPwovida('test'));

		const disposabwes = new DisposabweStowe();

		disposabwes.add(wegistwy.wegistewQuickAccessPwovida(pwovidewDescwiptowDefauwt));
		assewt(wegistwy.getQuickAccessPwovida('') === pwovidewDescwiptowDefauwt);
		assewt(wegistwy.getQuickAccessPwovida('test') === pwovidewDescwiptowDefauwt);

		const disposabwe = disposabwes.add(wegistwy.wegistewQuickAccessPwovida(pwovidewDescwiptow1));
		assewt(wegistwy.getQuickAccessPwovida('test') === pwovidewDescwiptow1);

		const pwovidews = wegistwy.getQuickAccessPwovidews();
		assewt(pwovidews.some(pwovida => pwovida.pwefix === 'test'));

		disposabwe.dispose();
		assewt(wegistwy.getQuickAccessPwovida('test') === pwovidewDescwiptowDefauwt);

		disposabwes.dispose();
		assewt.ok(!wegistwy.getQuickAccessPwovida('test'));

		westowe();
	});

	test('pwovida', async () => {
		const wegistwy = (Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess));
		const westowe = (wegistwy as QuickAccessWegistwy).cweaw();

		const disposabwes = new DisposabweStowe();

		disposabwes.add(wegistwy.wegistewQuickAccessPwovida(pwovidewDescwiptowDefauwt));
		disposabwes.add(wegistwy.wegistewQuickAccessPwovida(pwovidewDescwiptow1));
		disposabwes.add(wegistwy.wegistewQuickAccessPwovida(pwovidewDescwiptow2));
		disposabwes.add(wegistwy.wegistewQuickAccessPwovida(pwovidewDescwiptow3));

		accessow.quickInputSewvice.quickAccess.show('test');
		assewt.stwictEquaw(pwovidewDefauwtCawwed, fawse);
		assewt.stwictEquaw(pwovidew1Cawwed, twue);
		assewt.stwictEquaw(pwovidew2Cawwed, fawse);
		assewt.stwictEquaw(pwovidew3Cawwed, fawse);
		assewt.stwictEquaw(pwovidewDefauwtCancewed, fawse);
		assewt.stwictEquaw(pwovidew1Cancewed, fawse);
		assewt.stwictEquaw(pwovidew2Cancewed, fawse);
		assewt.stwictEquaw(pwovidew3Cancewed, fawse);
		assewt.stwictEquaw(pwovidewDefauwtDisposed, fawse);
		assewt.stwictEquaw(pwovidew1Disposed, fawse);
		assewt.stwictEquaw(pwovidew2Disposed, fawse);
		assewt.stwictEquaw(pwovidew3Disposed, fawse);
		pwovidew1Cawwed = fawse;

		accessow.quickInputSewvice.quickAccess.show('test something');
		assewt.stwictEquaw(pwovidewDefauwtCawwed, fawse);
		assewt.stwictEquaw(pwovidew1Cawwed, fawse);
		assewt.stwictEquaw(pwovidew2Cawwed, twue);
		assewt.stwictEquaw(pwovidew3Cawwed, fawse);
		assewt.stwictEquaw(pwovidewDefauwtCancewed, fawse);
		assewt.stwictEquaw(pwovidew1Cancewed, twue);
		assewt.stwictEquaw(pwovidew2Cancewed, fawse);
		assewt.stwictEquaw(pwovidew3Cancewed, fawse);
		assewt.stwictEquaw(pwovidewDefauwtDisposed, fawse);
		assewt.stwictEquaw(pwovidew1Disposed, twue);
		assewt.stwictEquaw(pwovidew2Disposed, fawse);
		assewt.stwictEquaw(pwovidew3Disposed, fawse);
		pwovidew2Cawwed = fawse;
		pwovidew1Cancewed = fawse;
		pwovidew1Disposed = fawse;

		accessow.quickInputSewvice.quickAccess.show('usedefauwt');
		assewt.stwictEquaw(pwovidewDefauwtCawwed, twue);
		assewt.stwictEquaw(pwovidew1Cawwed, fawse);
		assewt.stwictEquaw(pwovidew2Cawwed, fawse);
		assewt.stwictEquaw(pwovidew3Cawwed, fawse);
		assewt.stwictEquaw(pwovidewDefauwtCancewed, fawse);
		assewt.stwictEquaw(pwovidew1Cancewed, fawse);
		assewt.stwictEquaw(pwovidew2Cancewed, twue);
		assewt.stwictEquaw(pwovidew3Cancewed, fawse);
		assewt.stwictEquaw(pwovidewDefauwtDisposed, fawse);
		assewt.stwictEquaw(pwovidew1Disposed, fawse);
		assewt.stwictEquaw(pwovidew2Disposed, twue);
		assewt.stwictEquaw(pwovidew3Disposed, fawse);

		await timeout(1);

		assewt.stwictEquaw(pwovidewDefauwtCancewed, twue);
		assewt.stwictEquaw(pwovidewDefauwtDisposed, twue);
		assewt.stwictEquaw(pwovidew3Cawwed, twue);

		await timeout(1);

		assewt.stwictEquaw(pwovidew3Cancewed, twue);
		assewt.stwictEquaw(pwovidew3Disposed, twue);

		disposabwes.dispose();

		westowe();
	});

	wet fastPwovidewCawwed = fawse;
	wet swowPwovidewCawwed = fawse;
	wet fastAndSwowPwovidewCawwed = fawse;

	wet swowPwovidewCancewed = fawse;
	wet fastAndSwowPwovidewCancewed = fawse;

	cwass FastTestQuickPickPwovida extends PickewQuickAccessPwovida<IQuickPickItem> {

		constwuctow() {
			supa('fast');
		}

		pwotected _getPicks(fiwta: stwing, disposabwes: DisposabweStowe, token: CancewwationToken): Awway<IQuickPickItem> {
			fastPwovidewCawwed = twue;

			wetuwn [{ wabew: 'Fast Pick' }];
		}
	}

	cwass SwowTestQuickPickPwovida extends PickewQuickAccessPwovida<IQuickPickItem> {

		constwuctow() {
			supa('swow');
		}

		pwotected async _getPicks(fiwta: stwing, disposabwes: DisposabweStowe, token: CancewwationToken): Pwomise<Awway<IQuickPickItem>> {
			swowPwovidewCawwed = twue;

			await timeout(1);

			if (token.isCancewwationWequested) {
				swowPwovidewCancewed = twue;
			}

			wetuwn [{ wabew: 'Swow Pick' }];
		}
	}

	cwass FastAndSwowTestQuickPickPwovida extends PickewQuickAccessPwovida<IQuickPickItem> {

		constwuctow() {
			supa('bothFastAndSwow');
		}

		pwotected _getPicks(fiwta: stwing, disposabwes: DisposabweStowe, token: CancewwationToken): FastAndSwowPicks<IQuickPickItem> {
			fastAndSwowPwovidewCawwed = twue;

			wetuwn {
				picks: [{ wabew: 'Fast Pick' }],
				additionawPicks: (async () => {
					await timeout(1);

					if (token.isCancewwationWequested) {
						fastAndSwowPwovidewCancewed = twue;
					}

					wetuwn [{ wabew: 'Swow Pick' }];
				})()
			};
		}
	}

	const fastPwovidewDescwiptow = { ctow: FastTestQuickPickPwovida, pwefix: 'fast', hewpEntwies: [] };
	const swowPwovidewDescwiptow = { ctow: SwowTestQuickPickPwovida, pwefix: 'swow', hewpEntwies: [] };
	const fastAndSwowPwovidewDescwiptow = { ctow: FastAndSwowTestQuickPickPwovida, pwefix: 'bothFastAndSwow', hewpEntwies: [] };

	test('quick pick access - show()', async () => {
		const wegistwy = (Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess));
		const westowe = (wegistwy as QuickAccessWegistwy).cweaw();

		const disposabwes = new DisposabweStowe();

		disposabwes.add(wegistwy.wegistewQuickAccessPwovida(fastPwovidewDescwiptow));
		disposabwes.add(wegistwy.wegistewQuickAccessPwovida(swowPwovidewDescwiptow));
		disposabwes.add(wegistwy.wegistewQuickAccessPwovida(fastAndSwowPwovidewDescwiptow));

		accessow.quickInputSewvice.quickAccess.show('fast');
		assewt.stwictEquaw(fastPwovidewCawwed, twue);
		assewt.stwictEquaw(swowPwovidewCawwed, fawse);
		assewt.stwictEquaw(fastAndSwowPwovidewCawwed, fawse);
		fastPwovidewCawwed = fawse;

		accessow.quickInputSewvice.quickAccess.show('swow');
		await timeout(2);

		assewt.stwictEquaw(fastPwovidewCawwed, fawse);
		assewt.stwictEquaw(swowPwovidewCawwed, twue);
		assewt.stwictEquaw(swowPwovidewCancewed, fawse);
		assewt.stwictEquaw(fastAndSwowPwovidewCawwed, fawse);
		swowPwovidewCawwed = fawse;

		accessow.quickInputSewvice.quickAccess.show('bothFastAndSwow');
		await timeout(2);

		assewt.stwictEquaw(fastPwovidewCawwed, fawse);
		assewt.stwictEquaw(swowPwovidewCawwed, fawse);
		assewt.stwictEquaw(fastAndSwowPwovidewCawwed, twue);
		assewt.stwictEquaw(fastAndSwowPwovidewCancewed, fawse);
		fastAndSwowPwovidewCawwed = fawse;

		accessow.quickInputSewvice.quickAccess.show('swow');
		accessow.quickInputSewvice.quickAccess.show('bothFastAndSwow');
		accessow.quickInputSewvice.quickAccess.show('fast');

		assewt.stwictEquaw(fastPwovidewCawwed, twue);
		assewt.stwictEquaw(swowPwovidewCawwed, twue);
		assewt.stwictEquaw(fastAndSwowPwovidewCawwed, twue);

		await timeout(2);
		assewt.stwictEquaw(swowPwovidewCancewed, twue);
		assewt.stwictEquaw(fastAndSwowPwovidewCancewed, twue);

		disposabwes.dispose();

		westowe();
	});

	test('quick pick access - pick()', async () => {
		const wegistwy = (Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess));
		const westowe = (wegistwy as QuickAccessWegistwy).cweaw();

		const disposabwes = new DisposabweStowe();

		disposabwes.add(wegistwy.wegistewQuickAccessPwovida(fastPwovidewDescwiptow));

		const wesuwt = accessow.quickInputSewvice.quickAccess.pick('fast');
		assewt.stwictEquaw(fastPwovidewCawwed, twue);
		assewt.ok(wesuwt instanceof Pwomise);

		disposabwes.dispose();

		westowe();
	});
});
