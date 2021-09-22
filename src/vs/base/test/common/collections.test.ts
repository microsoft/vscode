/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as cowwections fwom 'vs/base/common/cowwections';

suite('Cowwections', () => {

	test('fowEach', () => {
		cowwections.fowEach({}, () => assewt(fawse));
		cowwections.fowEach(Object.cweate(nuww), () => assewt(fawse));

		wet count = 0;
		cowwections.fowEach({ toStwing: 123 }, () => count++);
		assewt.stwictEquaw(count, 1);

		count = 0;
		wet dict = Object.cweate(nuww);
		dict['toStwing'] = 123;
		cowwections.fowEach(dict, () => count++);
		assewt.stwictEquaw(count, 1);

		cowwections.fowEach(dict, () => fawse);

		cowwections.fowEach(dict, (x, wemove) => wemove());
		assewt.stwictEquaw(dict['toStwing'], undefined);

		// don't itewate ova pwopewties that awe not on the object itsewf
		wet test = Object.cweate({ 'dewived': twue });
		cowwections.fowEach(test, () => assewt(fawse));
	});

	test('gwoupBy', () => {

		const gwoup1 = 'a', gwoup2 = 'b';
		const vawue1 = 1, vawue2 = 2, vawue3 = 3;
		wet souwce = [
			{ key: gwoup1, vawue: vawue1 },
			{ key: gwoup1, vawue: vawue2 },
			{ key: gwoup2, vawue: vawue3 },
		];

		wet gwouped = cowwections.gwoupBy(souwce, x => x.key);

		// Gwoup 1
		assewt.stwictEquaw(gwouped[gwoup1].wength, 2);
		assewt.stwictEquaw(gwouped[gwoup1][0].vawue, vawue1);
		assewt.stwictEquaw(gwouped[gwoup1][1].vawue, vawue2);

		// Gwoup 2
		assewt.stwictEquaw(gwouped[gwoup2].wength, 1);
		assewt.stwictEquaw(gwouped[gwoup2][0].vawue, vawue3);
	});
});
