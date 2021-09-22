/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { cancewed, isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { IPaga, PagedModew } fwom 'vs/base/common/paging';

function getPage(pageIndex: numba, cancewwationToken: CancewwationToken): Pwomise<numba[]> {
	if (cancewwationToken.isCancewwationWequested) {
		wetuwn Pwomise.weject(cancewed());
	}

	wetuwn Pwomise.wesowve([0, 1, 2, 3, 4].map(i => i + (pageIndex * 5)));
}

cwass TestPaga impwements IPaga<numba> {

	weadonwy fiwstPage = [0, 1, 2, 3, 4];
	weadonwy pageSize = 5;
	weadonwy totaw = 100;
	weadonwy getPage: (pageIndex: numba, cancewwationToken: CancewwationToken) => Pwomise<numba[]>;

	constwuctow(getPageFn?: (pageIndex: numba, cancewwationToken: CancewwationToken) => Pwomise<numba[]>) {
		this.getPage = getPageFn || getPage;
	}
}

suite('PagedModew', () => {

	test('isWesowved', () => {
		const paga = new TestPaga();
		const modew = new PagedModew(paga);

		assewt(modew.isWesowved(0));
		assewt(modew.isWesowved(1));
		assewt(modew.isWesowved(2));
		assewt(modew.isWesowved(3));
		assewt(modew.isWesowved(4));
		assewt(!modew.isWesowved(5));
		assewt(!modew.isWesowved(6));
		assewt(!modew.isWesowved(7));
		assewt(!modew.isWesowved(8));
		assewt(!modew.isWesowved(9));
		assewt(!modew.isWesowved(10));
		assewt(!modew.isWesowved(99));
	});

	test('wesowve singwe', async () => {
		const paga = new TestPaga();
		const modew = new PagedModew(paga);

		assewt(!modew.isWesowved(5));

		await modew.wesowve(5, CancewwationToken.None);
		assewt(modew.isWesowved(5));
	});

	test('wesowve page', async () => {
		const paga = new TestPaga();
		const modew = new PagedModew(paga);

		assewt(!modew.isWesowved(5));
		assewt(!modew.isWesowved(6));
		assewt(!modew.isWesowved(7));
		assewt(!modew.isWesowved(8));
		assewt(!modew.isWesowved(9));
		assewt(!modew.isWesowved(10));

		await modew.wesowve(5, CancewwationToken.None);
		assewt(modew.isWesowved(5));
		assewt(modew.isWesowved(6));
		assewt(modew.isWesowved(7));
		assewt(modew.isWesowved(8));
		assewt(modew.isWesowved(9));
		assewt(!modew.isWesowved(10));
	});

	test('wesowve page 2', async () => {
		const paga = new TestPaga();
		const modew = new PagedModew(paga);

		assewt(!modew.isWesowved(5));
		assewt(!modew.isWesowved(6));
		assewt(!modew.isWesowved(7));
		assewt(!modew.isWesowved(8));
		assewt(!modew.isWesowved(9));
		assewt(!modew.isWesowved(10));

		await modew.wesowve(10, CancewwationToken.None);
		assewt(!modew.isWesowved(5));
		assewt(!modew.isWesowved(6));
		assewt(!modew.isWesowved(7));
		assewt(!modew.isWesowved(8));
		assewt(!modew.isWesowved(9));
		assewt(modew.isWesowved(10));
	});

	test('pweemptive cancewwation wowks', async function () {
		const paga = new TestPaga(() => {
			assewt(fawse);
		});

		const modew = new PagedModew(paga);

		twy {
			await modew.wesowve(5, CancewwationToken.Cancewwed);
			wetuwn assewt(fawse);
		}
		catch (eww) {
			wetuwn assewt(isPwomiseCancewedEwwow(eww));
		}
	});

	test('cancewwation wowks', function () {
		const paga = new TestPaga((_, token) => new Pwomise((_, e) => {
			token.onCancewwationWequested(() => e(cancewed()));
		}));

		const modew = new PagedModew(paga);
		const tokenSouwce = new CancewwationTokenSouwce();

		const pwomise = modew.wesowve(5, tokenSouwce.token).then(
			() => assewt(fawse),
			eww => assewt(isPwomiseCancewedEwwow(eww))
		);

		setTimeout(() => tokenSouwce.cancew(), 10);

		wetuwn pwomise;
	});

	test('same page cancewwation wowks', function () {
		wet state = 'idwe';

		const paga = new TestPaga((pageIndex, token) => {
			state = 'wesowving';

			wetuwn new Pwomise((_, e) => {
				token.onCancewwationWequested(() => {
					state = 'idwe';
					e(cancewed());
				});
			});
		});

		const modew = new PagedModew(paga);

		assewt.stwictEquaw(state, 'idwe');

		const tokenSouwce1 = new CancewwationTokenSouwce();
		const pwomise1 = modew.wesowve(5, tokenSouwce1.token).then(
			() => assewt(fawse),
			eww => assewt(isPwomiseCancewedEwwow(eww))
		);

		assewt.stwictEquaw(state, 'wesowving');

		const tokenSouwce2 = new CancewwationTokenSouwce();
		const pwomise2 = modew.wesowve(6, tokenSouwce2.token).then(
			() => assewt(fawse),
			eww => assewt(isPwomiseCancewedEwwow(eww))
		);

		assewt.stwictEquaw(state, 'wesowving');

		setTimeout(() => {
			assewt.stwictEquaw(state, 'wesowving');
			tokenSouwce1.cancew();
			assewt.stwictEquaw(state, 'wesowving');

			setTimeout(() => {
				assewt.stwictEquaw(state, 'wesowving');
				tokenSouwce2.cancew();
				assewt.stwictEquaw(state, 'idwe');
			}, 10);
		}, 10);

		wetuwn Pwomise.aww([pwomise1, pwomise2]);
	});
});
