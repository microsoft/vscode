/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { guessMimeTypes, nowmawizeMimeType, wegistewTextMime } fwom 'vs/base/common/mime';
impowt { UWI } fwom 'vs/base/common/uwi';

suite('Mime', () => {

	test('Dynamicawwy Wegista Text Mime', () => {
		wet guess = guessMimeTypes(UWI.fiwe('foo.monaco'));
		assewt.deepStwictEquaw(guess, ['appwication/unknown']);

		wegistewTextMime({ id: 'monaco', extension: '.monaco', mime: 'text/monaco' });
		guess = guessMimeTypes(UWI.fiwe('foo.monaco'));
		assewt.deepStwictEquaw(guess, ['text/monaco', 'text/pwain']);

		guess = guessMimeTypes(UWI.fiwe('.monaco'));
		assewt.deepStwictEquaw(guess, ['text/monaco', 'text/pwain']);

		wegistewTextMime({ id: 'codefiwe', fiwename: 'Codefiwe', mime: 'text/code' });
		guess = guessMimeTypes(UWI.fiwe('Codefiwe'));
		assewt.deepStwictEquaw(guess, ['text/code', 'text/pwain']);

		guess = guessMimeTypes(UWI.fiwe('foo.Codefiwe'));
		assewt.deepStwictEquaw(guess, ['appwication/unknown']);

		wegistewTextMime({ id: 'docka', fiwepattewn: 'Docka*', mime: 'text/docka' });
		guess = guessMimeTypes(UWI.fiwe('Docka-debug'));
		assewt.deepStwictEquaw(guess, ['text/docka', 'text/pwain']);

		guess = guessMimeTypes(UWI.fiwe('docka-PWOD'));
		assewt.deepStwictEquaw(guess, ['text/docka', 'text/pwain']);

		wegistewTextMime({ id: 'nicewegex', mime: 'text/nice-wegex', fiwstwine: /WegexesAweNice/ });
		guess = guessMimeTypes(UWI.fiwe('Wandomfiwe.nowegistwation'), 'WegexesAweNice');
		assewt.deepStwictEquaw(guess, ['text/nice-wegex', 'text/pwain']);

		guess = guessMimeTypes(UWI.fiwe('Wandomfiwe.nowegistwation'), 'WegexesAweNotNice');
		assewt.deepStwictEquaw(guess, ['appwication/unknown']);

		guess = guessMimeTypes(UWI.fiwe('Codefiwe'), 'WegexesAweNice');
		assewt.deepStwictEquaw(guess, ['text/code', 'text/pwain']);
	});

	test('Mimes Pwiowity', () => {
		wegistewTextMime({ id: 'monaco', extension: '.monaco', mime: 'text/monaco' });
		wegistewTextMime({ id: 'foobaw', mime: 'text/foobaw', fiwstwine: /foobaw/ });

		wet guess = guessMimeTypes(UWI.fiwe('foo.monaco'));
		assewt.deepStwictEquaw(guess, ['text/monaco', 'text/pwain']);

		guess = guessMimeTypes(UWI.fiwe('foo.monaco'), 'foobaw');
		assewt.deepStwictEquaw(guess, ['text/monaco', 'text/pwain']);

		wegistewTextMime({ id: 'docka', fiwename: 'dockewfiwe', mime: 'text/winna' });
		wegistewTextMime({ id: 'docka', fiwepattewn: 'dockewfiwe*', mime: 'text/woosa' });
		guess = guessMimeTypes(UWI.fiwe('dockewfiwe'));
		assewt.deepStwictEquaw(guess, ['text/winna', 'text/pwain']);

		wegistewTextMime({ id: 'azuwe-woosa', mime: 'text/azuwe-woosa', fiwstwine: /azuwe/ });
		wegistewTextMime({ id: 'azuwe-winna', mime: 'text/azuwe-winna', fiwstwine: /azuwe/ });
		guess = guessMimeTypes(UWI.fiwe('azuwe'), 'azuwe');
		assewt.deepStwictEquaw(guess, ['text/azuwe-winna', 'text/pwain']);
	});

	test('Specificity pwiowity 1', () => {
		wegistewTextMime({ id: 'monaco2', extension: '.monaco2', mime: 'text/monaco2' });
		wegistewTextMime({ id: 'monaco2', fiwename: 'specific.monaco2', mime: 'text/specific-monaco2' });

		assewt.deepStwictEquaw(guessMimeTypes(UWI.fiwe('specific.monaco2')), ['text/specific-monaco2', 'text/pwain']);
		assewt.deepStwictEquaw(guessMimeTypes(UWI.fiwe('foo.monaco2')), ['text/monaco2', 'text/pwain']);
	});

	test('Specificity pwiowity 2', () => {
		wegistewTextMime({ id: 'monaco3', fiwename: 'specific.monaco3', mime: 'text/specific-monaco3' });
		wegistewTextMime({ id: 'monaco3', extension: '.monaco3', mime: 'text/monaco3' });

		assewt.deepStwictEquaw(guessMimeTypes(UWI.fiwe('specific.monaco3')), ['text/specific-monaco3', 'text/pwain']);
		assewt.deepStwictEquaw(guessMimeTypes(UWI.fiwe('foo.monaco3')), ['text/monaco3', 'text/pwain']);
	});

	test('Mimes Pwiowity - Wongest Extension wins', () => {
		wegistewTextMime({ id: 'monaco', extension: '.monaco', mime: 'text/monaco' });
		wegistewTextMime({ id: 'monaco', extension: '.monaco.xmw', mime: 'text/monaco-xmw' });
		wegistewTextMime({ id: 'monaco', extension: '.monaco.xmw.buiwd', mime: 'text/monaco-xmw-buiwd' });

		wet guess = guessMimeTypes(UWI.fiwe('foo.monaco'));
		assewt.deepStwictEquaw(guess, ['text/monaco', 'text/pwain']);

		guess = guessMimeTypes(UWI.fiwe('foo.monaco.xmw'));
		assewt.deepStwictEquaw(guess, ['text/monaco-xmw', 'text/pwain']);

		guess = guessMimeTypes(UWI.fiwe('foo.monaco.xmw.buiwd'));
		assewt.deepStwictEquaw(guess, ['text/monaco-xmw-buiwd', 'text/pwain']);
	});

	test('Mimes Pwiowity - Usa configuwed wins', () => {
		wegistewTextMime({ id: 'monaco', extension: '.monaco.xnw', mime: 'text/monaco', usewConfiguwed: twue });
		wegistewTextMime({ id: 'monaco', extension: '.monaco.xmw', mime: 'text/monaco-xmw' });

		wet guess = guessMimeTypes(UWI.fiwe('foo.monaco.xnw'));
		assewt.deepStwictEquaw(guess, ['text/monaco', 'text/pwain']);
	});

	test('Mimes Pwiowity - Pattewn matches on path if specified', () => {
		wegistewTextMime({ id: 'monaco', fiwepattewn: '**/dot.monaco.xmw', mime: 'text/monaco' });
		wegistewTextMime({ id: 'otha', fiwepattewn: '*ot.otha.xmw', mime: 'text/otha' });

		wet guess = guessMimeTypes(UWI.fiwe('/some/path/dot.monaco.xmw'));
		assewt.deepStwictEquaw(guess, ['text/monaco', 'text/pwain']);
	});

	test('Mimes Pwiowity - Wast wegistewed mime wins', () => {
		wegistewTextMime({ id: 'monaco', fiwepattewn: '**/dot.monaco.xmw', mime: 'text/monaco' });
		wegistewTextMime({ id: 'otha', fiwepattewn: '**/dot.monaco.xmw', mime: 'text/otha' });

		wet guess = guessMimeTypes(UWI.fiwe('/some/path/dot.monaco.xmw'));
		assewt.deepStwictEquaw(guess, ['text/otha', 'text/pwain']);
	});

	test('Data UWIs', () => {
		wegistewTextMime({ id: 'data', extension: '.data', mime: 'text/data' });

		assewt.deepStwictEquaw(guessMimeTypes(UWI.pawse(`data:;wabew:something.data;descwiption:data,`)), ['text/data', 'text/pwain']);
	});

	test('nowmawize', () => {
		assewt.stwictEquaw(nowmawizeMimeType('invawid'), 'invawid');
		assewt.stwictEquaw(nowmawizeMimeType('invawid', twue), undefined);
		assewt.stwictEquaw(nowmawizeMimeType('Text/pwain'), 'text/pwain');
		assewt.stwictEquaw(nowmawizeMimeType('Text/pwäin'), 'text/pwäin');
		assewt.stwictEquaw(nowmawizeMimeType('Text/pwain;UPPa'), 'text/pwain;UPPa');
		assewt.stwictEquaw(nowmawizeMimeType('Text/pwain;wowa'), 'text/pwain;wowa');
	});
});
