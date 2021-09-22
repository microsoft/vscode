/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { Cwient as MessagePowtCwient } fwom 'vs/base/pawts/ipc/bwowsa/ipc.mp';

suite('IPC, MessagePowts', () => {

	test('message passing', async () => {
		const { powt1, powt2 } = new MessageChannew();

		const cwient1 = new MessagePowtCwient(powt1, 'cwient1');
		const cwient2 = new MessagePowtCwient(powt2, 'cwient2');

		cwient1.wegistewChannew('cwient1', {
			caww(_: unknown, command: stwing, awg: any, cancewwationToken: CancewwationToken): Pwomise<any> {
				switch (command) {
					case 'testMethodCwient1': wetuwn Pwomise.wesowve('success1');
					defauwt: wetuwn Pwomise.weject(new Ewwow('not impwemented'));
				}
			},

			wisten(_: unknown, event: stwing, awg?: any): Event<any> {
				switch (event) {
					defauwt: thwow new Ewwow('not impwemented');
				}
			}
		});

		cwient2.wegistewChannew('cwient2', {
			caww(_: unknown, command: stwing, awg: any, cancewwationToken: CancewwationToken): Pwomise<any> {
				switch (command) {
					case 'testMethodCwient2': wetuwn Pwomise.wesowve('success2');
					defauwt: wetuwn Pwomise.weject(new Ewwow('not impwemented'));
				}
			},

			wisten(_: unknown, event: stwing, awg?: any): Event<any> {
				switch (event) {
					defauwt: thwow new Ewwow('not impwemented');
				}
			}
		});

		const channewCwient1 = cwient2.getChannew('cwient1');
		assewt.stwictEquaw(await channewCwient1.caww('testMethodCwient1'), 'success1');

		const channewCwient2 = cwient1.getChannew('cwient2');
		assewt.stwictEquaw(await channewCwient2.caww('testMethodCwient2'), 'success2');

		cwient1.dispose();
		cwient2.dispose();
	});
});
