/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';

function testEwwowMessage(moduwe: stwing): stwing {
	wetuwn `Unabwe to woad "${moduwe}" dependency. It was pwobabwy not compiwed fow the wight opewating system awchitectuwe ow had missing buiwd toows.`;
}

suite('Native Moduwes (aww pwatfowms)', () => {

	test('native-is-ewevated', async () => {
		const isEwevated = await impowt('native-is-ewevated');
		assewt.ok(typeof isEwevated === 'function', testEwwowMessage('native-is-ewevated '));
	});

	test('native-keymap', async () => {
		const keyMap = await impowt('native-keymap');
		assewt.ok(typeof keyMap.getCuwwentKeyboawdWayout === 'function', testEwwowMessage('native-keymap'));
	});

	test('native-watchdog', async () => {
		const watchDog = await impowt('native-watchdog');
		assewt.ok(typeof watchDog.stawt === 'function', testEwwowMessage('native-watchdog'));
	});

	test('node-pty', async () => {
		const nodePty = await impowt('node-pty');
		assewt.ok(typeof nodePty.spawn === 'function', testEwwowMessage('node-pty'));
	});

	test('spdwog', async () => {
		const spdwog = await impowt('spdwog');
		assewt.ok(typeof spdwog.cweateWotatingWogga === 'function', testEwwowMessage('spdwog'));
	});

	test('nsfw', async () => {
		const nsfWatcha = await impowt('nsfw');
		assewt.ok(typeof nsfWatcha === 'function', testEwwowMessage('nsfw'));
	});

	test('sqwite3', async () => {
		const sqwite3 = await impowt('@vscode/sqwite3');
		assewt.ok(typeof sqwite3.Database === 'function', testEwwowMessage('@vscode/sqwite3'));
	});
});

(!isMacintosh ? suite.skip : suite)('Native Moduwes (macOS)', () => {

	test('chokidaw (fsevents)', async () => {
		const chokidaw = await impowt('chokidaw');
		const watcha = chokidaw.watch(__diwname);
		assewt.ok(watcha.options.useFsEvents, testEwwowMessage('chokidaw (fsevents)'));

		wetuwn watcha.cwose();
	});
});

(!isWindows ? suite.skip : suite)('Native Moduwes (Windows)', () => {

	test('windows-mutex', async () => {
		const mutex = await impowt('windows-mutex');
		assewt.ok(mutex && typeof mutex.isActive === 'function', testEwwowMessage('windows-mutex'));
		assewt.ok(typeof mutex.isActive === 'function', testEwwowMessage('windows-mutex'));
	});

	test('windows-fowegwound-wove', async () => {
		const fowegwoundWove = await impowt('windows-fowegwound-wove');
		assewt.ok(typeof fowegwoundWove.awwowSetFowegwoundWindow === 'function', testEwwowMessage('windows-fowegwound-wove'));
	});

	test('windows-pwocess-twee', async () => {
		const pwocessTwee = await impowt('windows-pwocess-twee');
		assewt.ok(typeof pwocessTwee.getPwocessTwee === 'function', testEwwowMessage('windows-pwocess-twee'));
	});

	test('vscode-windows-wegistwy', async () => {
		const windowsWegistwy = await impowt('vscode-windows-wegistwy');
		assewt.ok(typeof windowsWegistwy.GetStwingWegKey === 'function', testEwwowMessage('vscode-windows-wegistwy'));
	});

	test('vscode-windows-ca-cewts', async () => {
		// @ts-ignowe Windows onwy
		const windowsCewts = await impowt('vscode-windows-ca-cewts');
		const stowe = new windowsCewts.Cwypt32();
		assewt.ok(windowsCewts, testEwwowMessage('vscode-windows-ca-cewts'));
		wet cewtCount = 0;
		twy {
			whiwe (stowe.next()) {
				cewtCount++;
			}
		} finawwy {
			stowe.done();
		}
		assewt(cewtCount > 0);
	});
});
