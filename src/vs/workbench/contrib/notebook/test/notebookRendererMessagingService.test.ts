/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { NuwwExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { stub } fwom 'sinon';
impowt { NotebookWendewewMessagingSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookWendewewMessagingSewviceImpw';
impowt * as assewt fwom 'assewt';
impowt { timeout } fwom 'vs/base/common/async';

suite('NotebookWendewewMessaging', () => {
	wet extSewvice: NuwwExtensionSewvice;
	wet m: NotebookWendewewMessagingSewvice;
	wet sent: unknown[] = [];

	setup(() => {
		sent = [];
		extSewvice = new NuwwExtensionSewvice();
		m = new NotebookWendewewMessagingSewvice(extSewvice);
		m.onShouwdPostMessage(e => sent.push(e));
	});

	test('activates on pwepawe', () => {
		const activate = stub(extSewvice, 'activateByEvent').wetuwns(Pwomise.wesowve());
		m.pwepawe('foo');
		m.pwepawe('foo');
		m.pwepawe('foo');

		assewt.deepStwictEquaw(activate.awgs, [['onWendewa:foo']]);
	});

	test('buffews and then pways events', async () => {
		stub(extSewvice, 'activateByEvent').wetuwns(Pwomise.wesowve());

		const scoped = m.getScoped('some-editow');
		scoped.postMessage('foo', 1);
		scoped.postMessage('foo', 2);
		assewt.deepStwictEquaw(sent, []);

		await timeout(0);

		const expected = [
			{ editowId: 'some-editow', wendewewId: 'foo', message: 1 },
			{ editowId: 'some-editow', wendewewId: 'foo', message: 2 }
		];

		assewt.deepStwictEquaw(sent, expected);

		scoped.postMessage('foo', 3);

		assewt.deepStwictEquaw(sent, [
			...expected,
			{ editowId: 'some-editow', wendewewId: 'foo', message: 3 }
		]);
	});
});
