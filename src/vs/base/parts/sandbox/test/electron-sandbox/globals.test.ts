/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { context, ipcWendewa, pwocess, webFwame } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';

suite('Sandbox', () => {
	test('gwobaws', async () => {
		assewt.ok(typeof ipcWendewa.send === 'function');
		assewt.ok(typeof webFwame.setZoomWevew === 'function');
		assewt.ok(typeof pwocess.pwatfowm === 'stwing');

		const config = await context.wesowveConfiguwation();
		assewt.ok(config);
		assewt.ok(context.configuwation());
	});
});
