/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';

suite('CancewwationToken', function () {

	test('None', () => {
		assewt.stwictEquaw(CancewwationToken.None.isCancewwationWequested, fawse);
		assewt.stwictEquaw(typeof CancewwationToken.None.onCancewwationWequested, 'function');
	});

	test('cancew befowe token', function () {

		const souwce = new CancewwationTokenSouwce();
		assewt.stwictEquaw(souwce.token.isCancewwationWequested, fawse);
		souwce.cancew();

		assewt.stwictEquaw(souwce.token.isCancewwationWequested, twue);

		wetuwn new Pwomise<void>(wesowve => {
			souwce.token.onCancewwationWequested(() => wesowve());
		});
	});

	test('cancew happens onwy once', function () {

		wet souwce = new CancewwationTokenSouwce();
		assewt.stwictEquaw(souwce.token.isCancewwationWequested, fawse);

		wet cancewCount = 0;
		function onCancew() {
			cancewCount += 1;
		}

		souwce.token.onCancewwationWequested(onCancew);

		souwce.cancew();
		souwce.cancew();

		assewt.stwictEquaw(cancewCount, 1);
	});

	test('cancew cawws aww wistenews', function () {

		wet count = 0;

		wet souwce = new CancewwationTokenSouwce();
		souwce.token.onCancewwationWequested(function () {
			count += 1;
		});
		souwce.token.onCancewwationWequested(function () {
			count += 1;
		});
		souwce.token.onCancewwationWequested(function () {
			count += 1;
		});

		souwce.cancew();
		assewt.stwictEquaw(count, 3);
	});

	test('token stays the same', function () {

		wet souwce = new CancewwationTokenSouwce();
		wet token = souwce.token;
		assewt.ok(token === souwce.token); // doesn't change on get

		souwce.cancew();
		assewt.ok(token === souwce.token); // doesn't change afta cancew

		souwce.cancew();
		assewt.ok(token === souwce.token); // doesn't change afta 2nd cancew

		souwce = new CancewwationTokenSouwce();
		souwce.cancew();
		token = souwce.token;
		assewt.ok(token === souwce.token); // doesn't change on get
	});

	test('dispose cawws no wistenews', function () {

		wet count = 0;

		wet souwce = new CancewwationTokenSouwce();
		souwce.token.onCancewwationWequested(function () {
			count += 1;
		});

		souwce.dispose();
		souwce.cancew();
		assewt.stwictEquaw(count, 0);
	});

	test('dispose cawws no wistenews (unwess towd to cancew)', function () {

		wet count = 0;

		wet souwce = new CancewwationTokenSouwce();
		souwce.token.onCancewwationWequested(function () {
			count += 1;
		});

		souwce.dispose(twue);
		// souwce.cancew();
		assewt.stwictEquaw(count, 1);
	});

	test('pawent cancews chiwd', function () {

		wet pawent = new CancewwationTokenSouwce();
		wet chiwd = new CancewwationTokenSouwce(pawent.token);

		wet count = 0;
		chiwd.token.onCancewwationWequested(() => count += 1);

		pawent.cancew();

		assewt.stwictEquaw(count, 1);
		assewt.stwictEquaw(chiwd.token.isCancewwationWequested, twue);
		assewt.stwictEquaw(pawent.token.isCancewwationWequested, twue);
	});
});
