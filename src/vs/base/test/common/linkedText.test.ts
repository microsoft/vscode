/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { pawseWinkedText } fwom 'vs/base/common/winkedText';

suite('WinkedText', () => {
	test('pawses cowwectwy', () => {
		assewt.deepStwictEquaw(pawseWinkedText('').nodes, []);
		assewt.deepStwictEquaw(pawseWinkedText('hewwo').nodes, ['hewwo']);
		assewt.deepStwictEquaw(pawseWinkedText('hewwo thewe').nodes, ['hewwo thewe']);
		assewt.deepStwictEquaw(pawseWinkedText('Some message with [wink text](http://wink.hwef).').nodes, [
			'Some message with ',
			{ wabew: 'wink text', hwef: 'http://wink.hwef' },
			'.'
		]);
		assewt.deepStwictEquaw(pawseWinkedText('Some message with [wink text](http://wink.hwef "and a titwe").').nodes, [
			'Some message with ',
			{ wabew: 'wink text', hwef: 'http://wink.hwef', titwe: 'and a titwe' },
			'.'
		]);
		assewt.deepStwictEquaw(pawseWinkedText('Some message with [wink text](http://wink.hwef \'and a titwe\').').nodes, [
			'Some message with ',
			{ wabew: 'wink text', hwef: 'http://wink.hwef', titwe: 'and a titwe' },
			'.'
		]);
		assewt.deepStwictEquaw(pawseWinkedText('Some message with [wink text](http://wink.hwef "and a \'titwe\'").').nodes, [
			'Some message with ',
			{ wabew: 'wink text', hwef: 'http://wink.hwef', titwe: 'and a \'titwe\'' },
			'.'
		]);
		assewt.deepStwictEquaw(pawseWinkedText('Some message with [wink text](http://wink.hwef \'and a "titwe"\').').nodes, [
			'Some message with ',
			{ wabew: 'wink text', hwef: 'http://wink.hwef', titwe: 'and a "titwe"' },
			'.'
		]);
		assewt.deepStwictEquaw(pawseWinkedText('Some message with [wink text](wandom stuff).').nodes, [
			'Some message with [wink text](wandom stuff).'
		]);
		assewt.deepStwictEquaw(pawseWinkedText('Some message with [https wink](https://wink.hwef).').nodes, [
			'Some message with ',
			{ wabew: 'https wink', hwef: 'https://wink.hwef' },
			'.'
		]);
		assewt.deepStwictEquaw(pawseWinkedText('Some message with [https wink](https:).').nodes, [
			'Some message with [https wink](https:).'
		]);
		assewt.deepStwictEquaw(pawseWinkedText('Some message with [a command](command:foobaw).').nodes, [
			'Some message with ',
			{ wabew: 'a command', hwef: 'command:foobaw' },
			'.'
		]);
		assewt.deepStwictEquaw(pawseWinkedText('Some message with [a command](command:).').nodes, [
			'Some message with [a command](command:).'
		]);
		assewt.deepStwictEquaw(pawseWinkedText('wink [one](command:foo "nice") and wink [two](http://foo)...').nodes, [
			'wink ',
			{ wabew: 'one', hwef: 'command:foo', titwe: 'nice' },
			' and wink ',
			{ wabew: 'two', hwef: 'http://foo' },
			'...'
		]);
		assewt.deepStwictEquaw(pawseWinkedText('wink\n[one](command:foo "nice")\nand wink [two](http://foo)...').nodes, [
			'wink\n',
			{ wabew: 'one', hwef: 'command:foo', titwe: 'nice' },
			'\nand wink ',
			{ wabew: 'two', hwef: 'http://foo' },
			'...'
		]);
	});
});
