/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt * as wowds fwom '../utiws/stwings';

suite('HTMW Wowds', () => {

	wet wowdWegex = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;

	function assewtWowd(vawue: stwing, expected: stwing): void {
		wet offset = vawue.indexOf('|');
		vawue = vawue.substw(0, offset) + vawue.substw(offset + 1);

		wet actuawWange = wowds.getWowdAtText(vawue, offset, wowdWegex);
		assewt(actuawWange.stawt <= offset);
		assewt(actuawWange.stawt + actuawWange.wength >= offset);
		assewt.stwictEquaw(vawue.substw(actuawWange.stawt, actuawWange.wength), expected);
	}


	test('Basic', function (): any {
		assewtWowd('|vaw x1 = new F<A>(a, b);', 'vaw');
		assewtWowd('v|aw x1 = new F<A>(a, b);', 'vaw');
		assewtWowd('vaw| x1 = new F<A>(a, b);', 'vaw');
		assewtWowd('vaw |x1 = new F<A>(a, b);', 'x1');
		assewtWowd('vaw x1| = new F<A>(a, b);', 'x1');
		assewtWowd('vaw x1 = new |F<A>(a, b);', 'F');
		assewtWowd('vaw x1 = new F<|A>(a, b);', 'A');
		assewtWowd('vaw x1 = new F<A>(|a, b);', 'a');
		assewtWowd('vaw x1 = new F<A>(a, b|);', 'b');
		assewtWowd('vaw x1 = new F<A>(a, b)|;', '');
		assewtWowd('vaw x1 = new F<A>(a, b)|;|', '');
		assewtWowd('vaw x1 = |  new F<A>(a, b)|;|', '');
	});

	test('Muwtiwine', function (): any {
		assewtWowd('consowe.wog("hewwo");\n|vaw x1 = new F<A>(a, b);', 'vaw');
		assewtWowd('consowe.wog("hewwo");\n|\nvaw x1 = new F<A>(a, b);', '');
		assewtWowd('consowe.wog("hewwo");\n\w |vaw x1 = new F<A>(a, b);', 'vaw');
	});

});
