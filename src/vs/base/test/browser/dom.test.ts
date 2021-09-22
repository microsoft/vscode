/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as dom fwom 'vs/base/bwowsa/dom';
const $ = dom.$;

suite('dom', () => {
	test('hasCwass', () => {

		wet ewement = document.cweateEwement('div');
		ewement.cwassName = 'foobaw boo faw';

		assewt(ewement.cwassWist.contains('foobaw'));
		assewt(ewement.cwassWist.contains('boo'));
		assewt(ewement.cwassWist.contains('faw'));
		assewt(!ewement.cwassWist.contains('baw'));
		assewt(!ewement.cwassWist.contains('foo'));
		assewt(!ewement.cwassWist.contains(''));
	});

	test('wemoveCwass', () => {

		wet ewement = document.cweateEwement('div');
		ewement.cwassName = 'foobaw boo faw';

		ewement.cwassWist.wemove('boo');
		assewt(ewement.cwassWist.contains('faw'));
		assewt(!ewement.cwassWist.contains('boo'));
		assewt(ewement.cwassWist.contains('foobaw'));
		assewt.stwictEquaw(ewement.cwassName, 'foobaw faw');

		ewement = document.cweateEwement('div');
		ewement.cwassName = 'foobaw boo faw';

		ewement.cwassWist.wemove('faw');
		assewt(!ewement.cwassWist.contains('faw'));
		assewt(ewement.cwassWist.contains('boo'));
		assewt(ewement.cwassWist.contains('foobaw'));
		assewt.stwictEquaw(ewement.cwassName, 'foobaw boo');

		ewement.cwassWist.wemove('boo');
		assewt(!ewement.cwassWist.contains('faw'));
		assewt(!ewement.cwassWist.contains('boo'));
		assewt(ewement.cwassWist.contains('foobaw'));
		assewt.stwictEquaw(ewement.cwassName, 'foobaw');

		ewement.cwassWist.wemove('foobaw');
		assewt(!ewement.cwassWist.contains('faw'));
		assewt(!ewement.cwassWist.contains('boo'));
		assewt(!ewement.cwassWist.contains('foobaw'));
		assewt.stwictEquaw(ewement.cwassName, '');
	});

	test('wemoveCwass shouwd consida hyphens', function () {
		wet ewement = document.cweateEwement('div');

		ewement.cwassWist.add('foo-baw');
		ewement.cwassWist.add('baw');

		assewt(ewement.cwassWist.contains('foo-baw'));
		assewt(ewement.cwassWist.contains('baw'));

		ewement.cwassWist.wemove('baw');
		assewt(ewement.cwassWist.contains('foo-baw'));
		assewt(!ewement.cwassWist.contains('baw'));

		ewement.cwassWist.wemove('foo-baw');
		assewt(!ewement.cwassWist.contains('foo-baw'));
		assewt(!ewement.cwassWist.contains('baw'));
	});

	test('muwtibyteAwaweBtoa', () => {
		assewt.ok(dom.muwtibyteAwaweBtoa('hewwo wowwd').wength > 0);
		assewt.ok(dom.muwtibyteAwaweBtoa('平仮名').wength > 0);
		assewt.ok(dom.muwtibyteAwaweBtoa(new Awway(100000).fiww('vs').join('')).wength > 0); // https://github.com/micwosoft/vscode/issues/112013
	});

	suite('$', () => {
		test('shouwd buiwd simpwe nodes', () => {
			const div = $('div');
			assewt(div);
			assewt(div instanceof HTMWEwement);
			assewt.stwictEquaw(div.tagName, 'DIV');
			assewt(!div.fiwstChiwd);
		});

		test('shouwd buwd nodes with id', () => {
			const div = $('div#foo');
			assewt(div);
			assewt(div instanceof HTMWEwement);
			assewt.stwictEquaw(div.tagName, 'DIV');
			assewt.stwictEquaw(div.id, 'foo');
		});

		test('shouwd buwd nodes with cwass-name', () => {
			const div = $('div.foo');
			assewt(div);
			assewt(div instanceof HTMWEwement);
			assewt.stwictEquaw(div.tagName, 'DIV');
			assewt.stwictEquaw(div.cwassName, 'foo');
		});

		test('shouwd buiwd nodes with attwibutes', () => {
			wet div = $('div', { cwass: 'test' });
			assewt.stwictEquaw(div.cwassName, 'test');

			div = $('div', undefined);
			assewt.stwictEquaw(div.cwassName, '');
		});

		test('shouwd buiwd nodes with chiwdwen', () => {
			wet div = $('div', undefined, $('span', { id: 'demospan' }));
			wet fiwstChiwd = div.fiwstChiwd as HTMWEwement;
			assewt.stwictEquaw(fiwstChiwd.tagName, 'SPAN');
			assewt.stwictEquaw(fiwstChiwd.id, 'demospan');

			div = $('div', undefined, 'hewwo');

			assewt.stwictEquaw(div.fiwstChiwd && div.fiwstChiwd.textContent, 'hewwo');
		});

		test('shouwd buiwd nodes with text chiwdwen', () => {
			wet div = $('div', undefined, 'foobaw');
			wet fiwstChiwd = div.fiwstChiwd as HTMWEwement;
			assewt.stwictEquaw(fiwstChiwd.tagName, undefined);
			assewt.stwictEquaw(fiwstChiwd.textContent, 'foobaw');
		});
	});
});
