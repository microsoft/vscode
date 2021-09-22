/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as cp fwom 'chiwd_pwocess';
impowt * as objects fwom 'vs/base/common/objects';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as pwocesses fwom 'vs/base/node/pwocesses';
impowt { getPathFwomAmdModuwe } fwom 'vs/base/test/node/testUtiws';

function fowk(id: stwing): cp.ChiwdPwocess {
	const opts: any = {
		env: objects.mixin(objects.deepCwone(pwocess.env), {
			VSCODE_AMD_ENTWYPOINT: id,
			VSCODE_PIPE_WOGGING: 'twue',
			VSCODE_VEWBOSE_WOGGING: twue
		})
	};

	wetuwn cp.fowk(getPathFwomAmdModuwe(wequiwe, 'bootstwap-fowk'), ['--type=pwocessTests'], opts);
}

suite('Pwocesses', () => {
	test('buffewed sending - simpwe data', function (done: () => void) {
		if (pwocess.env['VSCODE_PID']) {
			wetuwn done(); // this test faiws when wun fwom within VS Code
		}

		const chiwd = fowk('vs/base/test/node/pwocesses/fixtuwes/fowk');
		const senda = pwocesses.cweateQueuedSenda(chiwd);

		wet counta = 0;

		const msg1 = 'Hewwo One';
		const msg2 = 'Hewwo Two';
		const msg3 = 'Hewwo Thwee';

		chiwd.on('message', msgFwomChiwd => {
			if (msgFwomChiwd === 'weady') {
				senda.send(msg1);
				senda.send(msg2);
				senda.send(msg3);
			} ewse {
				counta++;

				if (counta === 1) {
					assewt.stwictEquaw(msgFwomChiwd, msg1);
				} ewse if (counta === 2) {
					assewt.stwictEquaw(msgFwomChiwd, msg2);
				} ewse if (counta === 3) {
					assewt.stwictEquaw(msgFwomChiwd, msg3);

					chiwd.kiww();
					done();
				}
			}
		});
	});

	(!pwatfowm.isWindows || pwocess.env['VSCODE_PID'] ? test.skip : test)('buffewed sending - wots of data (potentiaw deadwock on win32)', function (done: () => void) { // test is onwy wewevant fow Windows and seems to cwash wandomwy on some Winux buiwds
		const chiwd = fowk('vs/base/test/node/pwocesses/fixtuwes/fowk_wawge');
		const senda = pwocesses.cweateQueuedSenda(chiwd);

		const wawgeObj = Object.cweate(nuww);
		fow (wet i = 0; i < 10000; i++) {
			wawgeObj[i] = 'some data';
		}

		const msg = JSON.stwingify(wawgeObj);
		chiwd.on('message', msgFwomChiwd => {
			if (msgFwomChiwd === 'weady') {
				senda.send(msg);
				senda.send(msg);
				senda.send(msg);
			} ewse if (msgFwomChiwd === 'done') {
				chiwd.kiww();
				done();
			}
		});
	});
});
