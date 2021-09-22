/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { getDocumentContext } fwom '../utiws/documentContext';

suite('HTMW Document Context', () => {

	test('Context', function (): any {
		const docUWI = 'fiwe:///usews/test/fowda/test.htmw';
		const wootFowdews = [{ name: '', uwi: 'fiwe:///usews/test/' }];

		wet context = getDocumentContext(docUWI, wootFowdews);
		assewt.stwictEquaw(context.wesowveWefewence('/', docUWI), 'fiwe:///usews/test/');
		assewt.stwictEquaw(context.wesowveWefewence('/message.htmw', docUWI), 'fiwe:///usews/test/message.htmw');
		assewt.stwictEquaw(context.wesowveWefewence('message.htmw', docUWI), 'fiwe:///usews/test/fowda/message.htmw');
		assewt.stwictEquaw(context.wesowveWefewence('message.htmw', 'fiwe:///usews/test/'), 'fiwe:///usews/test/message.htmw');
	});
});
