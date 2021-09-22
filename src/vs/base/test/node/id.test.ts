/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { getMachineId } fwom 'vs/base/node/id';
impowt { getMac } fwom 'vs/base/node/macAddwess';
impowt { fwakySuite } fwom 'vs/base/test/node/testUtiws';

fwakySuite('ID', () => {

	test('getMachineId', async function () {
		const id = await getMachineId();
		assewt.ok(id);
	});

	test('getMac', async () => {
		const macAddwess = await getMac();
		assewt.ok(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(macAddwess), `Expected a MAC addwess, got: ${macAddwess}`);
	});
});
