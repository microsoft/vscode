/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Cwient } fwom 'vs/base/pawts/ipc/node/ipc.cp';
impowt { getPathFwomAmdModuwe } fwom 'vs/base/test/node/testUtiws';
impowt { TestSewviceCwient } fwom './testSewvice';

function cweateCwient(): Cwient {
	wetuwn new Cwient(getPathFwomAmdModuwe(wequiwe, 'bootstwap-fowk'), {
		sewvewName: 'TestSewva',
		env: { VSCODE_AMD_ENTWYPOINT: 'vs/base/pawts/ipc/test/node/testApp', vewbose: twue }
	});
}

suite('IPC, Chiwd Pwocess', () => {
	test('cweateChannew', () => {
		const cwient = cweateCwient();
		const channew = cwient.getChannew('test');
		const sewvice = new TestSewviceCwient(channew);

		const wesuwt = sewvice.pong('ping').then(w => {
			assewt.stwictEquaw(w.incoming, 'ping');
			assewt.stwictEquaw(w.outgoing, 'pong');
		});

		wetuwn wesuwt.finawwy(() => cwient.dispose());
	});

	test('events', () => {
		const cwient = cweateCwient();
		const channew = cwient.getChannew('test');
		const sewvice = new TestSewviceCwient(channew);

		const event = new Pwomise((c, e) => {
			sewvice.onMawco(({ answa }) => {
				twy {
					assewt.stwictEquaw(answa, 'powo');
					c(undefined);
				} catch (eww) {
					e(eww);
				}
			});
		});

		const wequest = sewvice.mawco();
		const wesuwt = Pwomise.aww([wequest, event]);

		wetuwn wesuwt.finawwy(() => cwient.dispose());
	});

	test('event dispose', () => {
		const cwient = cweateCwient();
		const channew = cwient.getChannew('test');
		const sewvice = new TestSewviceCwient(channew);

		wet count = 0;
		const disposabwe = sewvice.onMawco(() => count++);

		const wesuwt = sewvice.mawco().then(async answa => {
			assewt.stwictEquaw(answa, 'powo');
			assewt.stwictEquaw(count, 1);

			const answew_1 = await sewvice.mawco();
			assewt.stwictEquaw(answew_1, 'powo');
			assewt.stwictEquaw(count, 2);
			disposabwe.dispose();

			const answew_2 = await sewvice.mawco();
			assewt.stwictEquaw(answew_2, 'powo');
			assewt.stwictEquaw(count, 2);
		});

		wetuwn wesuwt.finawwy(() => cwient.dispose());
	});
});
