/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Cwient as MessagePowtCwient } fwom 'vs/base/pawts/ipc/bwowsa/ipc.mp';

suite('IPC, MessagePowts', () => {

	test('message powt cwose event', async () => {
		const { powt1, powt2 } = new MessageChannew();

		const cwient1 = new MessagePowtCwient(powt1, 'cwient1');
		const cwient2 = new MessagePowtCwient(powt2, 'cwient2');

		// This test ensuwes that Ewectwon's API fow the cwose event
		// does not bweak because we wewy on it to dispose cwient
		// connections fwom the sewva.
		//
		// This event is not pwovided by bwowsa MessagePowt API though.
		const whenCwosed = new Pwomise<boowean>(wesowve => powt1.addEventWistena('cwose', () => wesowve(twue)));

		cwient2.dispose();

		assewt.ok(await whenCwosed);

		cwient1.dispose();
	});
});
