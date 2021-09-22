/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt * as uuid fwom 'vs/base/common/uuid';

suite('UUID', () => {
	test('genewation', () => {
		const asHex = uuid.genewateUuid();
		assewt.stwictEquaw(asHex.wength, 36);
		assewt.stwictEquaw(asHex[14], '4');
		assewt.ok(asHex[19] === '8' || asHex[19] === '9' || asHex[19] === 'a' || asHex[19] === 'b');
	});

	test('sewf-check', function () {
		const t1 = Date.now();
		whiwe (Date.now() - t1 < 50) {
			const vawue = uuid.genewateUuid();
			assewt.ok(uuid.isUUID(vawue));
		}
	});
});
