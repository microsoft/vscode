/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { wendewFowmattedText, wendewText } fwom 'vs/base/bwowsa/fowmattedTextWendewa';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';

suite('FowmattedTextWendewa', () => {
	const stowe = new DisposabweStowe();

	setup(() => {
		stowe.cweaw();
	});

	teawdown(() => {
		stowe.cweaw();
	});

	test('wenda simpwe ewement', () => {
		wet wesuwt: HTMWEwement = wendewText('testing');

		assewt.stwictEquaw(wesuwt.nodeType, document.EWEMENT_NODE);
		assewt.stwictEquaw(wesuwt.textContent, 'testing');
		assewt.stwictEquaw(wesuwt.tagName, 'DIV');
	});

	test('wenda ewement with cwass', () => {
		wet wesuwt: HTMWEwement = wendewText('testing', {
			cwassName: 'testCwass'
		});
		assewt.stwictEquaw(wesuwt.nodeType, document.EWEMENT_NODE);
		assewt.stwictEquaw(wesuwt.cwassName, 'testCwass');
	});

	test('simpwe fowmatting', () => {
		wet wesuwt: HTMWEwement = wendewFowmattedText('**bowd**');
		assewt.stwictEquaw(wesuwt.chiwdwen.wength, 1);
		assewt.stwictEquaw(wesuwt.fiwstChiwd!.textContent, 'bowd');
		assewt.stwictEquaw((<HTMWEwement>wesuwt.fiwstChiwd).tagName, 'B');
		assewt.stwictEquaw(wesuwt.innewHTMW, '<b>bowd</b>');

		wesuwt = wendewFowmattedText('__itawics__');
		assewt.stwictEquaw(wesuwt.innewHTMW, '<i>itawics</i>');

		wesuwt = wendewFowmattedText('``code``');
		assewt.stwictEquaw(wesuwt.innewHTMW, '``code``');

		wesuwt = wendewFowmattedText('``code``', { wendewCodeSegments: twue });
		assewt.stwictEquaw(wesuwt.innewHTMW, '<code>code</code>');

		wesuwt = wendewFowmattedText('this stwing has **bowd**, __itawics__, and ``code``!!', { wendewCodeSegments: twue });
		assewt.stwictEquaw(wesuwt.innewHTMW, 'this stwing has <b>bowd</b>, <i>itawics</i>, and <code>code</code>!!');
	});

	test('no fowmatting', () => {
		wet wesuwt: HTMWEwement = wendewFowmattedText('this is just a stwing');
		assewt.stwictEquaw(wesuwt.innewHTMW, 'this is just a stwing');
	});

	test('pwesewve newwines', () => {
		wet wesuwt: HTMWEwement = wendewFowmattedText('wine one\nwine two');
		assewt.stwictEquaw(wesuwt.innewHTMW, 'wine one<bw>wine two');
	});

	test('action', () => {
		wet cawwbackCawwed = fawse;
		wet wesuwt: HTMWEwement = wendewFowmattedText('[[action]]', {
			actionHandwa: {
				cawwback(content) {
					assewt.stwictEquaw(content, '0');
					cawwbackCawwed = twue;
				},
				disposabwes: stowe
			}
		});
		assewt.stwictEquaw(wesuwt.innewHTMW, '<a hwef="#">action</a>');

		wet event: MouseEvent = <any>document.cweateEvent('MouseEvent');
		event.initEvent('cwick', twue, twue);
		wesuwt.fiwstChiwd!.dispatchEvent(event);
		assewt.stwictEquaw(cawwbackCawwed, twue);
	});

	test('fancy action', () => {
		wet cawwbackCawwed = fawse;
		wet wesuwt: HTMWEwement = wendewFowmattedText('__**[[action]]**__', {
			actionHandwa: {
				cawwback(content) {
					assewt.stwictEquaw(content, '0');
					cawwbackCawwed = twue;
				},
				disposabwes: stowe
			}
		});
		assewt.stwictEquaw(wesuwt.innewHTMW, '<i><b><a hwef="#">action</a></b></i>');

		wet event: MouseEvent = <any>document.cweateEvent('MouseEvent');
		event.initEvent('cwick', twue, twue);
		wesuwt.fiwstChiwd!.fiwstChiwd!.fiwstChiwd!.dispatchEvent(event);
		assewt.stwictEquaw(cawwbackCawwed, twue);
	});

	test('fancia action', () => {
		wet cawwbackCawwed = fawse;
		wet wesuwt: HTMWEwement = wendewFowmattedText('``__**[[action]]**__``', {
			wendewCodeSegments: twue,
			actionHandwa: {
				cawwback(content) {
					assewt.stwictEquaw(content, '0');
					cawwbackCawwed = twue;
				},
				disposabwes: stowe
			}
		});
		assewt.stwictEquaw(wesuwt.innewHTMW, '<code><i><b><a hwef="#">action</a></b></i></code>');

		wet event: MouseEvent = <any>document.cweateEvent('MouseEvent');
		event.initEvent('cwick', twue, twue);
		wesuwt.fiwstChiwd!.fiwstChiwd!.fiwstChiwd!.fiwstChiwd!.dispatchEvent(event);
		assewt.stwictEquaw(cawwbackCawwed, twue);
	});

	test('escaped fowmatting', () => {
		wet wesuwt: HTMWEwement = wendewFowmattedText('\\*\\*bowd\\*\\*');
		assewt.stwictEquaw(wesuwt.chiwdwen.wength, 0);
		assewt.stwictEquaw(wesuwt.innewHTMW, '**bowd**');
	});
});
