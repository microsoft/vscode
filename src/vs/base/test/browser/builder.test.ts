/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Build, Builder, MultiBuilder, Binding, Dimension, Position, Box, $ } from 'vs/base/browser/builder';
import * as Types from 'vs/base/common/types';
import * as DomUtils from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';

let withElementsBySelector = function (selector: string, offdom: boolean = false) {
	let elements = window.document.querySelectorAll(selector);

	let builders = [];
	for (let i = 0; i < elements.length; i++) {
		builders.push(new Builder(<HTMLElement>elements.item(i), offdom));
	}

	return new MultiBuilder(builders);
};

let withBuilder = function (builder, offdom) {
	if (builder instanceof MultiBuilder) {
		return new MultiBuilder(builder);
	}

	return new Builder(builder.getHTMLElement(), offdom);
};

suite('Builder', () => {
	let fixture: HTMLElement;
	let fixtureId = 'builder-fixture';

	setup(() => {
		fixture = document.createElement('div');
		fixture.id = fixtureId;
		document.body.appendChild(fixture);
	});

	teardown(() => {
		document.body.removeChild(fixture);
	});

	test('Dimension.substract()', function () {
		let d1 = new Dimension(200, 100);
		let d2 = new Box(10, 20, 30, 40);

		assert.deepEqual(d1.substract(d2), new Dimension(140, 60));
	});

	test('Position', function () {
		let p = new Position(200, 100);
		assert.strictEqual(p.x, 200);
		assert.strictEqual(p.y, 100);
	});

	test('Binding', function () {
		let b = Build.withElementById(fixtureId, false);
		let element = b.getHTMLElement();

		assert(element);

		// Properties
		Binding.setPropertyOnElement(element, 'foo', 'bar');
		assert.strictEqual(Binding.getPropertyFromElement(element, 'foo'), 'bar');

		Binding.setPropertyOnElement(element, 'foo', { foo: 'bar' });
		assert.deepEqual(Binding.getPropertyFromElement(element, 'foo'), { foo: 'bar' });

		Binding.removePropertyFromElement(element, 'foo');

		Binding.setPropertyOnElement(element, 'bar', 'bar');
		assert.strictEqual(Binding.getPropertyFromElement(element, 'bar'), 'bar');

		Binding.setPropertyOnElement(element, 'bar', { foo: 'bar' });
		assert.deepEqual(Binding.getPropertyFromElement(element, 'bar'), { foo: 'bar' });

		Binding.removePropertyFromElement(element, 'bar');

		assert(!Binding.getPropertyFromElement(element, 'foo'));
		assert(!Binding.getPropertyFromElement(element, 'bar'));

		// Binding
		Binding.bindElement(element, 'bar');
		assert.strictEqual(Binding.getBindingFromElement(element), 'bar');

		Binding.bindElement(element, { foo: 'bar' });
		assert.deepEqual(Binding.getBindingFromElement(element), { foo: 'bar' });

		Binding.unbindElement(element);
		assert(!Binding.getBindingFromElement(element));
	});

	test('Select', function () {
		let b = Build.withElementById(fixtureId, false);
		assert(b);

		let allDivs = withElementsBySelector('div');

		assert(allDivs);
		assert(allDivs.length >= 1);
		assert(Types.isFunction(allDivs.push));
		assert(Types.isFunction(allDivs.pop));
		assert(allDivs instanceof MultiBuilder);

		for (let key in b) {
			if (b.hasOwnProperty(key) && Types.isFunction(b[key])) {
				assert(allDivs.hasOwnProperty(key));
			}
		}

		let noElement = withElementsBySelector('#thiselementdoesnotexist');

		assert(noElement);
		assert(noElement.length === 0);
		assert(Types.isFunction(noElement.push));
		assert(Types.isFunction(noElement.pop));
		assert(noElement instanceof MultiBuilder);

		for (let key in b) {
			if (b.hasOwnProperty(key) && Types.isFunction(b[key])) {
				assert(noElement.hasOwnProperty(key));
			}
		}
	});

	test('Build.withElement()', function () {
		let f = Build.withElementById(fixtureId, false);
		let b = $(f.getHTMLElement());

		b.addClass('foo');
		assert(b.hasClass('foo'));

		b.removeClass('foo');
		assert(!b.hasClass('foo'));

		assert.strictEqual(f.getHTMLElement(), document.getElementById(fixtureId));
		assert.strictEqual(b.getHTMLElement(), document.getElementById(fixtureId));
	});

	test('Build.withBuilder()', function () {
		let f = Build.withElementById(fixtureId, false);
		let b = withBuilder(f, false);

		b.addClass('foo');
		assert(b.hasClass('foo'));

		b.removeClass('foo');
		assert(!b.hasClass('foo'));

		assert.strictEqual(f.getHTMLElement(), document.getElementById(fixtureId));
		assert.strictEqual(b.getHTMLElement(), document.getElementById(fixtureId));
	});

	test('Build.withBuilder() - Multibuilder', function () {
		let f = withElementsBySelector('#' + fixtureId);
		let b = withBuilder(f, false);

		b.addClass('foo');
		assert(b.hasClass('foo')[0]);

		b.removeClass('foo');
		assert(!b.hasClass('foo')[0]);
	});

	test('Build.offDOM()', function () {
		let b = $();
		assert(b);

		b.div({
			id: 'foobar'
		}, function (div) {
			div.span({
				id: 'foobarspan',
				innerHtml: 'foo bar'
			});
		});

		assert(Build.withElementById('foobar') === null);

		b.build(Build.withElementById(fixtureId, false));

		assert(Build.withElementById('foobar'));
		assert(Build.withElementById('foobarspan'));
		assert.strictEqual(Build.withElementById('foobarspan').getHTMLElement().innerHTML, 'foo bar');
	});

	test('Build.withElementById()', function () {
		let b = Build.withElementById(fixtureId, false);

		b.addClass('foo');
		assert(b.hasClass('foo'));

		b.removeClass('foo');
		assert(!b.hasClass('foo'));

		assert.strictEqual(b.getHTMLElement(), document.getElementById(fixtureId));
	});

	test('withElementsBySelector()', function () {
		let b = withElementsBySelector('#' + fixtureId, false);

		b.addClass('foo');
		assert(b.hasClass('foo')[0]);

		b.removeClass('foo');
		assert(!b.hasClass('foo')[0]);
	});

	test('Off DOM withElementById and container passed in', function () {
		let b = Build.withElementById(fixtureId, true);
		assert(b);
		assert.strictEqual(b.getHTMLElement(), document.getElementById(fixtureId));

		b.div({
			id: 'foobar'
		}, function (div) {
			div.span({
				id: 'foobarspan',
				innerHtml: 'foo bar'
			});
		});

		assert(Build.withElementById('foobar') === null);

		b.build();

		assert(Build.withElementById('foobar'));
		assert(Build.withElementById('foobarspan'));
		assert.strictEqual(Build.withElementById('foobarspan').getHTMLElement().innerHTML, 'foo bar');
	});

	test('Off DOM withSelector and container passed in', function () {
		let b = withElementsBySelector('#' + fixtureId, true);
		assert(b);

		b.div({
			id: 'foobar'
		}, function (div) {
			div.span({
				id: 'foobarspan',
				innerHtml: 'foo bar'
			});
		});

		assert(Build.withElementById('foobar') === null);

		b.build();

		assert(Build.withElementById('foobar'));
		assert(Build.withElementById('foobarspan'));
		assert.strictEqual(Build.withElementById('foobarspan').getHTMLElement().innerHTML, 'foo bar');
	});

	test('Builder.build() with index specified', function () {
		let b = Build.withElementById(fixtureId);
		b.empty();
		b.div({ id: '1' });
		b.div({ id: '2' });
		b.div({ id: '3' });

		b = $();
		b.div({ id: '4' });
		b.build(Build.withElementById(fixtureId), 0);

		b = Build.withElementById(fixtureId);
		let divs = b.select('div');
		assert.strictEqual(divs.length, 4);

		let ids = divs.attr('id');
		assert.strictEqual(ids.length, 4);
		assert.strictEqual(ids[0], '4');
		assert.strictEqual(ids[1], '1');
		assert.strictEqual(ids[2], '2');
		assert.strictEqual(ids[3], '3');

		b = $();
		b.div({ id: '5' });
		b.build(Build.withElementById(fixtureId), 2);

		b = Build.withElementById(fixtureId);
		divs = b.select('div');
		assert.strictEqual(divs.length, 5);

		ids = divs.attr('id');
		assert.strictEqual(ids.length, 5);
		assert.strictEqual(ids[0], '4');
		assert.strictEqual(ids[1], '1');
		assert.strictEqual(ids[2], '5');
		assert.strictEqual(ids[3], '2');
		assert.strictEqual(ids[4], '3');
	});

	test('Builder.asContainer()', function () {
		let f = Build.withElementById(fixtureId, false);
		f.div({
			id: 'foobar'
		});

		let divBuilder = f.asContainer();
		divBuilder.span({
			innerHtml: 'see man'
		});

		assert.strictEqual(divBuilder.parent().attr('id'), 'foobar');
	});

	test('Builder.clone()', function () {
		let b = Build.withElementById(fixtureId);

		let clone = b.clone();
		assert(clone);
		assert(clone instanceof Builder);
		assert.strictEqual(b.getHTMLElement(), clone.getHTMLElement());
		assert.deepEqual(b, clone);

		let multiB = withElementsBySelector('div');

		let multiClone = multiB.clone();
		assert(multiClone);
	});

	test('Builder.and() with 2 Builders', function () {
		let b = Build.withElementById(fixtureId);

		let otherB = Build.withElementById(fixtureId);

		let bAndB = b.and(otherB);

		assert.strictEqual(bAndB.length, 2);

		assert.deepEqual(bAndB.attr('id'), [fixtureId, fixtureId]);
	});

	test('Builder.and() with HTMLElement', function () {
		let b = Build.withElementById(fixtureId);

		let otherB = Build.withElementById(fixtureId);

		let bAndB = b.and(otherB.getHTMLElement());

		assert.strictEqual(bAndB.length, 2);

		assert.deepEqual(bAndB.attr('id'), [fixtureId, fixtureId]);
	});

	test('Builder.and() with MultiBuilder', function () {
		let b = Build.withElementById(fixtureId);

		let allDivs = withElementsBySelector('div');

		let bAndB = b.and(allDivs);

		assert.strictEqual(bAndB.length, 1 + allDivs.length);
	});

	test('Builder.and() with two MultiBuilders', function () {
		let allDivs = withElementsBySelector('div');
		let allDivsCount = allDivs.length;

		let otherAllDivs = withElementsBySelector('div');

		let allDivsAndAllDivs = allDivs.and(otherAllDivs);

		assert.strictEqual(allDivsAndAllDivs.length, allDivsCount * 2);
		assert.strictEqual(allDivs.length, allDivsCount * 2);
	});

	test('Builder.and() with MultiBuilder and HTMLElement', function () {
		let allDivs = withElementsBySelector('div');
		let len = allDivs.length;

		let allDivsFixture = allDivs.and(Build.withElementById(fixtureId).getHTMLElement());

		assert.strictEqual(allDivsFixture.length, len + 1);
		assert.strictEqual(allDivs.length, len + 1);
	});

	test('Builder Multibuilder fn call that returns Multibuilder', function () {
		let b = Build.withElementById(fixtureId);
		b.div(function (div) {
			div.span();
		});

		b.div(function (div) {
			div.span();
		});

		b.div(function (div) {
			div.span();
		});

		let multiBuilder = Build.withElementById(fixtureId).select('div');
		assert(multiBuilder.length === 3);

		assert(multiBuilder.select('span').length === 3);
	});

	test('Builder.p() and other elements', function () {
		let b = Build.withElementById(fixtureId);
		b.empty();
		b.div(function (div) {
			assert(div !== b);
			assert.strictEqual('div', div.getHTMLElement().nodeName.toLowerCase());

			div.p(function (p) {
				p.ul(function (ul) {
					ul.li(function (li) {
						li.span({
							id: 'builderspan',
							innerHtml: 'Foo Bar'
						});

						assert.strictEqual('span', li.getHTMLElement().nodeName.toLowerCase());

						li.img({
							id: 'builderimg',
							src: '#'
						});

						assert.strictEqual('img', li.getHTMLElement().nodeName.toLowerCase());

						li.a({
							id: 'builderlink',
							href: '#',
							innerHtml: 'Link'
						});

						assert.strictEqual('a', li.getHTMLElement().nodeName.toLowerCase());
					});
				});
			});

			assert.strictEqual('p', div.getHTMLElement().nodeName.toLowerCase());
		});

		assert.strictEqual(Build.withElementById(fixtureId).select('div').length, 1);
		assert.strictEqual(Build.withElementById(fixtureId).select('*').length, 7);

		assert.strictEqual(Build.withElementById('builderspan').getHTMLElement().innerHTML, 'Foo Bar');
		assert.strictEqual(Build.withElementById('builderimg').attr('src'), '#');
		assert.strictEqual(Build.withElementById('builderlink').attr('href'), '#');

		// Assert HTML through DOM
		let root = document.getElementById(fixtureId);
		assert.strictEqual(b.parent().getHTMLElement(), root);
		assert.strictEqual(root.childNodes.length, 1);

		let div = root.childNodes[0];
		assert.strictEqual('div', div.nodeName.toLowerCase());
		assert.strictEqual(b.getHTMLElement(), div);
		assert.strictEqual(div.childNodes.length, 1);

		let p = div.childNodes[0];
		assert.strictEqual('p', p.nodeName.toLowerCase());
		assert.strictEqual(p.childNodes.length, 1);

		let ul = p.childNodes[0];
		assert.strictEqual('ul', ul.nodeName.toLowerCase());
		assert.strictEqual(ul.childNodes.length, 1);

		let li = ul.childNodes[0];
		assert.strictEqual('li', li.nodeName.toLowerCase());
		assert.strictEqual(li.childNodes.length, 3);

		let span = <HTMLElement>li.childNodes[0];
		assert.strictEqual('span', span.nodeName.toLowerCase());
		assert.strictEqual(span.childNodes.length, 1);
		assert.strictEqual(span.innerHTML, 'Foo Bar');

		let img = <HTMLElement>li.childNodes[1];
		assert.strictEqual('img', img.nodeName.toLowerCase());
		assert.strictEqual(img.childNodes.length, 0);
		assert.strictEqual(img.getAttribute('src'), '#');

		let a = <HTMLElement>li.childNodes[2];
		assert.strictEqual('a', a.nodeName.toLowerCase());
		assert.strictEqual(a.childNodes.length, 1);
		assert.strictEqual(a.getAttribute('href'), '#');
		assert.strictEqual(a.innerHTML, 'Link');
	});

	test('Builder.p() and other elements', function () {
		let b = Build.withElementById(fixtureId);
		b.element('div', function (div) {
			div.element('p', function (p) {
				p.element('ul', function (ul) {
					ul.element('li', function (li) {
						li.element('span', {
							id: 'builderspan',
							innerHtml: 'Foo Bar'
						});

						li.element('img', {
							id: 'builderimg',
							src: '#'
						});

						li.element('a', {
							id: 'builderlink',
							href: '#',
							innerHtml: 'Link'
						});
					});
				});
			});
		});

		assert.strictEqual(Build.withElementById(fixtureId).select('div').length, 1);
		assert.strictEqual(Build.withElementById(fixtureId).select('*').length, 7);

		assert.strictEqual(Build.withElementById('builderspan').getHTMLElement().innerHTML, 'Foo Bar');
		assert.strictEqual(Build.withElementById('builderimg').attr('src'), '#');
		assert.strictEqual(Build.withElementById('builderlink').attr('href'), '#');
	});

	test('Builder.attr()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		assert(!b.attr('id'));
		b.attr('id', 'foobar');
		assert.strictEqual(b.attr('id'), 'foobar');

		b.attr({
			id: 'barfoo',
			padding: [4, 3, 2, 1],
			margin: '4px 3px 2px 1px'
		});

		assert.strictEqual(b.attr('id'), 'barfoo');
		assert.strictEqual(b.getHTMLElement().getAttribute('id'), 'barfoo');
		assert.strictEqual(b.style('margin-top'), '4px');
		assert.strictEqual(b.getHTMLElement().style.marginTop, '4px');
		assert.strictEqual(b.style('margin-right'), '3px');
		assert.strictEqual(b.style('margin-bottom'), '2px');
		assert.strictEqual(b.style('margin-left'), '1px');

		assert.strictEqual(b.style('padding-top'), '4px');
		assert.strictEqual(b.style('padding-right'), '3px');
		assert.strictEqual(b.style('padding-bottom'), '2px');
		assert.strictEqual(b.style('padding-left'), '1px');

		b.attr({
			padding: '1 2 3 4',
			position: '100 200 300 400',
			size: '200 300'
		});

		assert.strictEqual(b.style('padding-top'), '1px');
		assert.strictEqual(b.style('padding-right'), '2px');
		assert.strictEqual(b.style('padding-bottom'), '3px');
		assert.strictEqual(b.style('padding-left'), '4px');

		assert.strictEqual(b.style('top'), '100px');
		assert.strictEqual(b.style('right'), '200px');
		assert.strictEqual(b.style('bottom'), '300px');
		assert.strictEqual(b.style('left'), '400px');

		assert.strictEqual(b.style('width'), '200px');
		assert.strictEqual(b.style('height'), '300px');
	});

	test('Builder.style()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.style('padding-bottom', '5px');
		b.style('paddingTop', '4px');

		assert.strictEqual(b.style('paddingBottom'), '5px');
		assert.strictEqual(b.style('padding-bottom'), '5px');

		assert.strictEqual(b.style('paddingTop'), '4px');
		assert.strictEqual(b.style('padding-top'), '4px');
	});

	test('Builder.style() as object literal', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.style({
			'padding-bottom': '5px',
			paddingTop: '4px',
			border: '1px solid red'
		});

		assert.strictEqual(b.getHTMLElement().style.paddingBottom, '5px');

		assert.strictEqual(b.style('paddingBottom'), '5px');
		assert.strictEqual(b.style('padding-bottom'), '5px');

		assert.strictEqual(b.style('paddingTop'), '4px');
		assert.strictEqual(b.style('padding-top'), '4px');

		assert.strictEqual(b.style('border-width'), '1px');
		assert.strictEqual(b.style('border-style'), 'solid');
		assert.strictEqual(b.style('border-color'), 'red');
	});

	test('Builder.attributes', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.id('foobar');
		b.src('foobar');
		b.href('foobar');
		b.title('foobar');
		b.name('foobar');
		b.type('foobar');
		b.value('foobar');
		b.alt('foobar');
		b.draggable(true);
		b.tabindex(0);

		assert.strictEqual(b.attr('id'), 'foobar');
		assert.strictEqual(b.attr('src'), 'foobar');
		assert.strictEqual(b.attr('href'), 'foobar');
		assert.strictEqual(b.attr('title'), 'foobar');
		assert.strictEqual(b.attr('name'), 'foobar');
		assert.strictEqual(b.attr('type'), 'foobar');
		assert.strictEqual(b.attr('value'), 'foobar');
		assert.strictEqual(b.attr('alt'), 'foobar');
		assert.strictEqual(b.attr('draggable'), 'true');
		assert.strictEqual(b.attr('tabindex'), '0');

		assert.strictEqual(b.getHTMLElement().getAttribute('id'), 'foobar');
		assert.strictEqual(b.getHTMLElement().getAttribute('src'), 'foobar');
		assert.strictEqual(b.getHTMLElement().getAttribute('href'), 'foobar');
		assert.strictEqual(b.getHTMLElement().getAttribute('title'), 'foobar');
		assert.strictEqual(b.getHTMLElement().getAttribute('name'), 'foobar');
		assert.strictEqual(b.getHTMLElement().getAttribute('type'), 'foobar');
		assert.strictEqual(b.getHTMLElement().getAttribute('value'), 'foobar');
		assert.strictEqual(b.getHTMLElement().getAttribute('alt'), 'foobar');
		assert.strictEqual(b.getHTMLElement().getAttribute('draggable'), 'true');
		assert.strictEqual(b.getHTMLElement().getAttribute('tabindex'), '0');
	});

	test('Builder.addClass() and Co', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		assert(!b.hasClass('foobar'));
		assert(!b.getHTMLElement().className);
		b.addClass('foobar');
		assert(b.getComputedStyle());
		assert(b.hasClass('foobar'));
		assert.strictEqual(b.getHTMLElement().className, 'foobar');
		b.removeClass('foobar');
		assert(!b.hasClass('foobar'));
		assert(!b.getHTMLElement().className);

		assert(!b.hasClass('foobar'));
		b.attr({ 'class': 'foobar' });
		assert(b.hasClass('foobar'));
		assert.strictEqual(b.getHTMLElement().className, 'foobar');
		b.removeClass('foobar');
		assert(!b.hasClass('foobar'));
		assert(!b.getHTMLElement().className);

		b.addClass('foobar').addClass('barfoo').addClass('foobar');
		assert(b.hasClass('barfoo'));
		assert(b.hasClass('foobar'));
		b.removeClass('foobar').removeClass('barfoo');
		assert(!b.hasClass('barfoo'));
		assert(!b.hasClass('foobar'));
		assert(!b.getHTMLElement().className);

		b.addClass('foobar');
		b.swapClass('foobar', 'barfoo');
		assert(b.hasClass('barfoo'));
		b.swapClass('foobar', 'barfoo');
		assert(b.hasClass('foobar'));

		b.toggleClass('foobar');
		assert(!b.hasClass('foobar'));

		b.toggleClass('barfoo');
		assert(b.hasClass('barfoo'));

		b.setClass('helloworld');
		assert(!b.hasClass('barfoo'));
		assert(b.hasClass('helloworld'));
		b.setClass('');
		assert(!b.hasClass('helloworld'));
	});

	test('Builder.color() and .background()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.color('red').background('blue');

		assert.strictEqual(b.style('color'), 'red');
		assert.strictEqual(b.style('background-color'), 'blue');
		assert(b.getComputedStyle());
	});

	test('Builder.padding() and .margin()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.padding(4, 3, 2, 1).margin(1, 2, 3, 4);

		assert.strictEqual(b.style('padding-top'), '4px');
		assert.strictEqual(b.style('padding-right'), '3px');
		assert.strictEqual(b.style('padding-bottom'), '2px');
		assert.strictEqual(b.style('padding-left'), '1px');

		assert.strictEqual(b.style('margin-top'), '1px');
		assert.strictEqual(b.style('margin-right'), '2px');
		assert.strictEqual(b.style('margin-bottom'), '3px');
		assert.strictEqual(b.style('margin-left'), '4px');
		assert(b.getComputedStyle());
	});

	test('Builder.position()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.position(100, 200, 300, 400, 'relative');

		assert.strictEqual(b.style('top'), '100px');
		assert.strictEqual(b.style('right'), '200px');
		assert.strictEqual(b.style('bottom'), '300px');
		assert.strictEqual(b.style('left'), '400px');
		assert.strictEqual(b.style('position'), 'relative');
	});

	test('Builder.size(), .minSize() and .maxSize()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.size(100, 200);

		assert.strictEqual(b.style('width'), '100px');
		assert.strictEqual(b.style('height'), '200px');

		b.minSize(300, 400);
		b.maxSize(500, 600);

		assert.strictEqual(b.style('minWidth'), '300px');
		assert.strictEqual(b.style('minHeight'), '400px');
		assert.strictEqual(b.style('maxWidth'), '500px');
		assert.strictEqual(b.style('maxHeight'), '600px');
	});

	test('Builder.float() and .clear()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.float('left');
		b.clear('right');

		assert.strictEqual(b.style('float'), 'left');
		assert.strictEqual(b.style('clear'), 'right');
	});

	test('Builder.normal(), .italic(), .bold() and underline()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.italic().underline().bold();

		assert(b.style('font-weight') === 'bold' || b.style('font-weight') === '700'); // For Opera
		assert.strictEqual(b.style('text-decoration'), 'underline');
		assert.strictEqual(b.style('font-style'), 'italic');

		b.normal();

		assert(b.style('font-weight') === 'normal' || b.style('font-weight') === '400'); // For Opera
		assert(b.style('text-decoration') === 'none' || b.style('text-decoration') === 'initial');
		assert.strictEqual(b.style('font-style'), 'normal');
	});

	test('Builder.display() and .overflow()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.display('inline');
		b.overflow('hidden');

		assert.strictEqual(b.style('display'), 'inline');
		assert.strictEqual(b.style('overflow'), 'hidden');
	});

	test('Builder.show() and .hide()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.show();
		assert(!b.hasClass('builder-hidden'));
		assert(!b.isHidden());
		b.toggleVisibility();
		assert(!b.isHidden());
		assert(b.hasClass('builder-visible'));
		b.toggleVisibility();
		b.hide();
		assert(b.hasClass('builder-hidden'));
		assert(b.isHidden());
	});

	test('Builder.showDelayed()', function (done) {
		let b = Build.withElementById(fixtureId);
		b.div().hide();

		b.showDelayed(20);
		assert(b.hasClass('builder-hidden'));

		TPromise.timeout(30).then(() => {
			assert(!b.hasClass('builder-hidden'));
			done();
		});
	});

	test('Builder.showDelayed() but interrupted', function (done) {
		let b = Build.withElementById(fixtureId);
		b.div().hide();

		b.showDelayed(20);
		assert(b.hasClass('builder-hidden'));

		b.hide(); // Should cancel the visibility promise

		TPromise.timeout(30).then(() => {
			assert(b.hasClass('builder-hidden'));
			done();
		});
	});

	test('Builder.border(), .borderTop(), .borderBottom(), .borderLeft(), .borderRight()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.border('1px solid red');

		assert.strictEqual(b.style('border-width'), '1px');
		assert.strictEqual(b.style('border-color'), 'red');
		assert.strictEqual(b.style('border-style'), 'solid');

		b.borderTop('2px dotted yellow');

		assert.strictEqual(b.style('border-top-width'), '2px');
		assert.strictEqual(b.style('border-top-color'), 'yellow');
		assert.strictEqual(b.style('border-top-style'), 'dotted');

		b.borderRight('3px dashed green');

		assert.strictEqual(b.style('border-right-width'), '3px');
		assert.strictEqual(b.style('border-right-color'), 'green');
		assert.strictEqual(b.style('border-right-style'), 'dashed');

		b.borderBottom('4px solid blue');

		assert.strictEqual(b.style('border-bottom-width'), '4px');
		assert.strictEqual(b.style('border-bottom-color'), 'blue');
		assert.strictEqual(b.style('border-bottom-style'), 'solid');

		b.borderLeft('5px dashed white');

		assert.strictEqual(b.style('border-left-width'), '5px');
		assert.strictEqual(b.style('border-left-color'), 'white');
		assert.strictEqual(b.style('border-left-style'), 'dashed');
	});

	test('Builder.textAlign() and .verticalAlign()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.textAlign('center');
		b.verticalAlign('top');

		assert.strictEqual(b.style('textAlign'), 'center');
		assert.strictEqual(b.style('verticalAlign'), 'top');
	});

	test('Builder.innerHtml()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.innerHtml('<b>Foo Bar</b>');

		assert.strictEqual(b.getHTMLElement().innerHTML, '<b>Foo Bar</b>');
	});

	test('Builder.safeInnerHtml()', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.safeInnerHtml('<b>Foo Bar</b>');

		assert.strictEqual(b.getHTMLElement().innerHTML, '&lt;b&gt;Foo Bar&lt;/b&gt;');

		b.safeInnerHtml('Foo Bar');

		assert.strictEqual(b.getHTMLElement().innerHTML, 'Foo Bar');
	});

	test('Builder.parent(), .children(), .removeChild() and isEmpty()', function () {
		let b = Build.withElementById(fixtureId);
		b.empty();

		assert(b.isEmpty());
		assert.strictEqual(b.parent().getHTMLElement(), b.getHTMLElement().parentNode);
		assert(b.children().length === 0);

		let divB;
		b.div(function (div) {
			divB = div.clone();
			div.span();
		});
		b.span();

		b = Build.withElementById(fixtureId);
		assert(!b.isEmpty());
		assert.strictEqual(b.parent().getHTMLElement(), b.getHTMLElement().parentNode);
		assert.equal(b.children().length, 2);

		b.removeChild(divB);
		assert.equal(b.children().length, 1);
	});

	test('Build Client Area', function () {

		// Global
		let dimensions = $(document.body).getClientArea();
		assert(dimensions.width > 0);
		assert(dimensions.height > 0);

		// Local
		let b = Build.withElementById(fixtureId);
		dimensions = b.getClientArea();
		// assert(dimensions.width >= 0);
		// assert(dimensions.height >= 0);
	});

	// test('Builder.select() and .matches()', function () {
	// 	let b = Build.withElementById(fixtureId);

	// 	assert(b.matches('#' + fixtureId));

	// 	let divs = withElementsBySelector('div');
	// 	for (let i = 0; i < divs.length; i++) {
	// 		assert (divs.item(i).matches('div'));
	// 	}

	// 	assert(b.select('div').length === 0);

	// 	b.clone().div();

	// 	assert(b.select('div').length === 1);
	// });

	test('Builder.select() and .matches()', function () {
		let b = Build.withElementById(fixtureId);

		assert(b.getTotalSize());
		assert(b.getContentSize());
	});

	test('Builder.preventDefault()', function () {
		let b = Build.withElementById(fixtureId);
		b.element('input', {
			type: 'button'
		});

		b.preventDefault(DomUtils.EventType.CLICK, true);

		b.once(DomUtils.EventType.CLICK, function (e) {
			if (e.defaultPrevented) {
				assert.strictEqual(e.defaultPrevented, true);
			} else if (e.cancelBubble) {
				assert.strictEqual(e.cancelBubble, true);
			}
		});

		b.domClick();
	});

	test('Builder.once()', function () {
		let b = Build.withElementById(fixtureId);
		b.element('input', {
			type: 'button'
		});

		let counter = 0;
		b.once(DomUtils.EventType.CLICK, function (e) {
			counter++;
			assert(counter <= 1);
		});

		b.domClick();
		b.domClick();
	});

	test('Builder.once() with capture', function () {
		let b = Build.withElementById(fixtureId);
		b.element('input', {
			type: 'button'
		});

		let counter = 0;
		b.once(DomUtils.EventType.CLICK, function (e) {
			counter++;
			assert(counter <= 1);
		}, null, true);

		b.domClick();
		b.domClick();
	});

	test('Builder.on() and .off()', function () {
		let b = Build.withElementById(fixtureId);
		b.element('input', {
			type: 'button'
		});

		let listeners = [];
		let counter = 0;
		b.on(DomUtils.EventType.CLICK, function (e) {
			counter++;
		}, listeners);

		assert(listeners.length === 1);

		b.domClick();
		b.off(DomUtils.EventType.BLUR);
		b.domClick();
		b.off(DomUtils.EventType.CLICK);
		b.domClick();
		b.domClick();

		assert.equal(counter, 2);
	});

	test('Builder.on() and .off() with capture', function () {
		let b = Build.withElementById(fixtureId);
		b.element('input', {
			type: 'button'
		});

		let listeners = [];
		let counter = 0;
		b.on(DomUtils.EventType.CLICK, function (e) {
			counter++;
		}, listeners, true);

		assert(listeners.length === 1);

		b.domClick();
		b.off(DomUtils.EventType.BLUR);
		b.domClick();
		b.off(DomUtils.EventType.BLUR, true);
		b.domClick();
		b.off(DomUtils.EventType.CLICK);
		b.domClick();
		b.off(DomUtils.EventType.CLICK, true);
		b.domClick();
		b.domClick();
		assert(counter === 4);
	});

	test('Builder.empty()', function () {
		let inputs = [];
		let bindings = [];

		let b = Build.withElementById(fixtureId);
		let counter1 = 0;
		let counter2 = 0;
		let counter3 = 0;
		let counter4 = 0;
		let counter5 = 0;
		let counter6 = 0;
		let counter7 = 0;

		b.div(function (div) {
			div.bind('Foo Bar');
			div.setProperty('Foo', 'Bar');
			bindings.push(div.clone());

			div.element('input', {
				type: 'button'
			}).on(DomUtils.EventType.CLICK, function (e) {
				counter1++;
				assert(counter1 <= 1);
			});
			inputs.push(div.clone());

			div.p(function (p) {
				p.bind('Foo Bar');
				p.setProperty('Foo', 'Bar');
				bindings.push(p.clone());

				p.element('input', {
					type: 'button'
				}).on(DomUtils.EventType.CLICK, function (e) {
					counter2++;
					assert(counter2 <= 1);
				});
				inputs.push(p.clone());

				p.ul(function (ul) {
					ul.bind('Foo Bar');
					ul.setProperty('Foo', 'Bar');
					bindings.push(ul.clone());

					ul.element('input', {
						type: 'button'
					}).on(DomUtils.EventType.CLICK, function (e) {
						counter3++;
						assert(counter3 <= 1);
					});
					inputs.push(ul.clone());

					ul.li(function (li) {
						li.bind('Foo Bar');
						li.setProperty('Foo', 'Bar');
						bindings.push(li.clone());

						li.element('input', {
							type: 'button'
						}).on(DomUtils.EventType.CLICK, function (e) {
							counter4++;
							assert(counter4 <= 1);
						});
						inputs.push(li.clone());

						li.span({
							id: 'builderspan',
							innerHtml: 'Foo Bar'
						}, function (span) {
							span.bind('Foo Bar');
							span.setProperty('Foo', 'Bar');
							bindings.push(span.clone());

							span.element('input', {
								type: 'button'
							}).on(DomUtils.EventType.CLICK, function (e) {
								counter5++;
								assert(counter5 <= 1);
							});
							inputs.push(span.clone());
						});

						li.img({
							id: 'builderimg',
							src: '#'
						}, function (img) {
							img.bind('Foo Bar');
							img.setProperty('Foo', 'Bar');
							bindings.push(img.clone());

							img.element('input', {
								type: 'button'
							}).on(DomUtils.EventType.CLICK, function (e) {
								counter6++;
								assert(counter6 <= 1);
							});
							inputs.push(img.clone());
						});

						li.a({
							id: 'builderlink',
							href: '#',
							innerHtml: 'Link'
						}, function (a) {
							a.bind('Foo Bar');
							a.setProperty('Foo', 'Bar');
							bindings.push(a.clone());

							a.element('input', {
								type: 'button'
							}).on(DomUtils.EventType.CLICK, function (e) {
								counter7++;
								assert(counter7 <= 1);
							});
							inputs.push(a.clone());
						});
					});
				});
			});
		});

		inputs.forEach(function (input) {
			input.domClick();
		});

		for (let i = 0; i < bindings.length; i++) {
			assert(bindings[i].getBinding());
			assert(bindings[i].getProperty('Foo'));
		}

		Build.withElementById(fixtureId).empty();
		assert(Build.withElementById(fixtureId).select('*').length === 0);

		inputs.forEach(function (input) {
			input.domClick();
		});

		for (let i = 0; i < bindings.length; i++) {
			assert(!bindings[i].getBinding());
			assert(!bindings[i].getProperty('Foo'));
		}

		assert.equal(counter1, 1);
		assert.equal(counter2, 1);
		assert.equal(counter3, 1);
		assert.equal(counter4, 1);
		assert.equal(counter5, 1);
		assert.equal(counter6, 1);
		assert.equal(counter7, 1);
	});

	test('Builder.empty() cleans all listeners', function () {
		let b = Build.withElementById(fixtureId);
		let unbindCounter = 0;

		let old = DomUtils.addDisposableListener;
		try {
			(DomUtils as any).addDisposableListener = function (node, type, handler) {
				let unbind: IDisposable = old.call(null, node, type, handler);

				return {
					dispose: function () {
						unbindCounter++;
						unbind.dispose();
					}
				};
			};

			b.div(function (div) {
				div.p(function (p) {
					p.span().on([DomUtils.EventType.CLICK, DomUtils.EventType.KEY_DOWN], function (e) { });

					p.img().on([DomUtils.EventType.KEY_PRESS, DomUtils.EventType.MOUSE_OUT], function (e) { }, null, true); // useCapture

					p.a(function (a) {
						a.span().on([DomUtils.EventType.CLICK, DomUtils.EventType.KEY_DOWN], function (e) { });
					}).on([DomUtils.EventType.SELECT, DomUtils.EventType.BLUR], function (e) { });
				});
			});

			b.empty();
			assert.strictEqual(unbindCounter, 8);
		} finally {
			(DomUtils as any).addDisposableListener = old;
		}
	});

	test('Builder.destroy()', function () {
		let inputs = [];
		let bindings = [];

		let b = Build.withElementById(fixtureId);
		let counter1 = 0;
		let counter2 = 0;
		let counter3 = 0;
		let counter4 = 0;
		let counter5 = 0;
		let counter6 = 0;
		let counter7 = 0;

		b.div(function (div) {
			div.bind('Foo Bar');
			div.setProperty('Foo', 'Bar');
			bindings.push(div.clone());

			div.element('input', {
				type: 'button'
			}).on(DomUtils.EventType.CLICK, function (e) {
				counter1++;
				assert(counter1 <= 1);
			}, null, true); // useCapture
			inputs.push(div.clone());

			div.p(function (p) {
				p.bind('Foo Bar');
				p.setProperty('Foo', 'Bar');
				bindings.push(p.clone());

				p.element('input', {
					type: 'button'
				}).on(DomUtils.EventType.CLICK, function (e) {
					counter2++;
					assert(counter2 <= 1);
				});
				inputs.push(p.clone());

				p.ul(function (ul) {
					ul.bind('Foo Bar');
					ul.setProperty('Foo', 'Bar');
					bindings.push(ul.clone());

					ul.element('input', {
						type: 'button'
					}).on(DomUtils.EventType.CLICK, function (e) {
						counter3++;
						assert(counter3 <= 1);
					});
					inputs.push(ul.clone());

					ul.li(function (li) {
						li.bind('Foo Bar');
						li.setProperty('Foo', 'Bar');
						bindings.push(li.clone());

						li.element('input', {
							type: 'button'
						}).on(DomUtils.EventType.CLICK, function (e) {
							counter4++;
							assert(counter4 <= 1);
						});
						inputs.push(li.clone());

						li.span({
							id: 'builderspan',
							innerHtml: 'Foo Bar'
						}, function (span) {
							span.bind('Foo Bar');
							span.setProperty('Foo', 'Bar');
							bindings.push(span.clone());

							span.element('input', {
								type: 'button'
							}).on(DomUtils.EventType.CLICK, function (e) {
								counter5++;
								assert(counter5 <= 1);
							});
							inputs.push(span.clone());
						});

						li.img({
							id: 'builderimg',
							src: '#'
						}, function (img) {
							img.bind('Foo Bar');
							img.setProperty('Foo', 'Bar');
							bindings.push(img.clone());

							img.element('input', {
								type: 'button'
							}).on(DomUtils.EventType.CLICK, function (e) {
								counter6++;
								assert(counter6 <= 1);
							});
							inputs.push(img.clone());
						});

						li.a({
							id: 'builderlink',
							href: '#',
							innerHtml: 'Link'
						}, function (a) {
							a.bind('Foo Bar');
							a.setProperty('Foo', 'Bar');
							bindings.push(a.clone());

							a.element('input', {
								type: 'button'
							}).on(DomUtils.EventType.CLICK, function (e) {
								counter7++;
								assert(counter7 <= 1);
							});
							inputs.push(a.clone());
						});
					});
				});
			});
		});

		inputs.forEach(function (input) {
			input.domClick();
		});

		for (let i = 0; i < bindings.length; i++) {
			assert(bindings[i].getBinding());
			assert(bindings[i].getProperty('Foo'));
		}

		Build.withElementById(fixtureId).select('div').destroy();
		assert(Build.withElementById(fixtureId).select('*').length === 0);

		inputs.forEach(function (input) {
			input.domClick();
		});

		for (let i = 0; i < bindings.length; i++) {
			assert(!bindings[i].getBinding());
			assert(!bindings[i].getProperty('Foo'));
		}

		assert.equal(counter1, 1);
		assert.equal(counter2, 1);
		assert.equal(counter3, 1);
		assert.equal(counter4, 1);
		assert.equal(counter5, 1);
		assert.equal(counter6, 1);
		assert.equal(counter7, 1);
	});

	test('Builder.destroy() cleans all listeners', function () {
		let b = Build.withElementById(fixtureId);
		let unbindCounter = 0;

		let old = DomUtils.addDisposableListener;
		try {
			(DomUtils as any).addDisposableListener = function (node, type, handler) {
				let unbind: IDisposable = old.call(null, node, type, handler);

				return {
					dispose: function () {
						unbindCounter++;
						unbind.dispose();
					}
				};
			};

			b.div(function (div) {
				div.p(function (p) {
					p.span().on([DomUtils.EventType.CLICK, DomUtils.EventType.KEY_DOWN], function (e) { });

					p.img().on([DomUtils.EventType.KEY_PRESS, DomUtils.EventType.MOUSE_OUT], function (e) { });

					p.a(function (a) {
						a.span().on([DomUtils.EventType.CLICK, DomUtils.EventType.KEY_DOWN], function (e) { });
					}).on([DomUtils.EventType.SELECT, DomUtils.EventType.BLUR], function (e) { });
				});
			})
				.on([DomUtils.EventType.CLICK, DomUtils.EventType.KEY_DOWN], function (e) { })
				.on([DomUtils.EventType.BLUR, DomUtils.EventType.FOCUS], function (e) { }, null, true); //useCapture

			b.destroy();
			assert.strictEqual(unbindCounter, 16);
		} finally {
			(DomUtils as any).addDisposableListener = old;
		}
	});

	test('Builder.empty() MultiBuilder', function () {
		let b = Build.withElementById(fixtureId);
		let inputs = [];

		let firstCounter = 0;
		b.div(function (div) {
			div.element('input', {
				type: 'button'
			}).on(DomUtils.EventType.CLICK, function (e) {
				firstCounter++;
			});

			inputs.push(div.clone());
		});

		let secondCounter = 0;
		b.div(function (div) {
			div.element('input', {
				type: 'button'
			}).on(DomUtils.EventType.CLICK, function (e) {
				secondCounter++;
			});

			inputs.push(div.clone());
		});

		let thirdCounter = 0;
		b.div(function (div) {
			div.element('input', {
				type: 'button'
			}).on(DomUtils.EventType.CLICK, function (e) {
				thirdCounter++;
			});

			inputs.push(div.clone());
		});

		Build.withElementById(fixtureId).select('div > input').domClick();

		Build.withElementById(fixtureId).select('div').empty();

		inputs.forEach(function (input) {
			input.domClick();
		});

		assert.equal(firstCounter, 1);
		assert.equal(secondCounter, 1);
		assert.equal(thirdCounter, 1);
	});

	test('Builder .domFocus(), .domBlur(), .hasFocus()', function () {
		let b = Build.withElementById(fixtureId);

		b.element('input', { type: 'text' });
		assert(!b.hasFocus());
		b.domFocus().domSelect();
		assert(b.hasFocus());
		b.domBlur();
		assert(!b.hasFocus());
	});

	test('Builder misc', function () {
		let b = Build.withElementById(fixtureId);
		b.div();

		b.on([DomUtils.EventType.CLICK, DomUtils.EventType.MOUSE_DOWN, DomUtils.EventType.MOUSE_UP], function (e, b) {
		});
		b.off([DomUtils.EventType.CLICK, DomUtils.EventType.MOUSE_DOWN, DomUtils.EventType.MOUSE_UP]);

		b.once([DomUtils.EventType.CLICK, DomUtils.EventType.MOUSE_DOWN, DomUtils.EventType.MOUSE_UP], function (e, b) {
		});
		b.off([DomUtils.EventType.CLICK, DomUtils.EventType.MOUSE_DOWN, DomUtils.EventType.MOUSE_UP]);

		b.preventDefault(DomUtils.EventType.CLICK, true);

		b.bind('foo');
		assert.strictEqual(b.getBinding(), 'foo');
		b.unbind();
		assert(!b.getBinding());

		b.setProperty('foo', 'bar');
		assert.strictEqual(b.getProperty('foo'), 'bar');
		b.removeProperty('foo');
		assert(!b.getProperty('foo'));
	});

	test('Builder.offDOM()', function () {
		let b = Build.withElementById(fixtureId);
		b.div({ id: '1' });

		assert(Build.withElementById('1'));

		b.offDOM();

		assert(!Build.withElementById('1'));
	});

	test('$ - selector construction', function () {
		let obj = $('div');
		assert(obj instanceof Builder);
		assert(DomUtils.isHTMLElement(obj.getHTMLElement()));
		assert.equal(obj.getHTMLElement().tagName.toLowerCase(), 'div');
		assert.equal(obj.getHTMLElement().id, '');
		assert.equal(obj.getHTMLElement().className, '');

		obj = $('#myid');
		assert(obj instanceof Builder);
		assert(DomUtils.isHTMLElement(obj.getHTMLElement()));
		assert.equal(obj.getHTMLElement().tagName.toLowerCase(), 'div');
		assert.equal(obj.getHTMLElement().id, 'myid');
		assert.equal(obj.getHTMLElement().className, '');

		obj = $('.myclass');
		assert(obj instanceof Builder);
		assert(DomUtils.isHTMLElement(obj.getHTMLElement()));
		assert.equal(obj.getHTMLElement().tagName.toLowerCase(), 'div');
		assert.equal(obj.getHTMLElement().id, '');
		assert.equal(obj.getHTMLElement().className, 'myclass');

		obj = $('.myclass.element');
		assert(obj instanceof Builder);
		assert(DomUtils.isHTMLElement(obj.getHTMLElement()));
		assert.equal(obj.getHTMLElement().tagName.toLowerCase(), 'div');
		assert.equal(obj.getHTMLElement().id, '');
		assert.equal(obj.getHTMLElement().className, 'myclass element');

		obj = $('#myid.element');
		assert(obj instanceof Builder);
		assert(DomUtils.isHTMLElement(obj.getHTMLElement()));
		assert.equal(obj.getHTMLElement().tagName.toLowerCase(), 'div');
		assert.equal(obj.getHTMLElement().id, 'myid');
		assert.equal(obj.getHTMLElement().className, 'element');

		obj = $('ul#myid');
		assert(obj instanceof Builder);
		assert(DomUtils.isHTMLElement(obj.getHTMLElement()));
		assert.equal(obj.getHTMLElement().tagName.toLowerCase(), 'ul');
		assert.equal(obj.getHTMLElement().id, 'myid');
		assert.equal(obj.getHTMLElement().className, '');

		obj = $('header#monaco.container');
		assert(obj instanceof Builder);
		assert(DomUtils.isHTMLElement(obj.getHTMLElement()));
		assert.equal(obj.getHTMLElement().tagName.toLowerCase(), 'header');
		assert.equal(obj.getHTMLElement().id, 'monaco');
		assert.equal(obj.getHTMLElement().className, 'container');

		obj = $('header#monaco.container.box');
		assert(obj instanceof Builder);
		assert(DomUtils.isHTMLElement(obj.getHTMLElement()));
		assert.equal(obj.getHTMLElement().tagName.toLowerCase(), 'header');
		assert.equal(obj.getHTMLElement().id, 'monaco');
		assert.equal(obj.getHTMLElement().className, 'container box');
	});

	test('$ - wrap elements and builders', function () {
		let obj = $('#' + fixtureId);
		assert(obj instanceof Builder);
		obj = $(obj.getHTMLElement());
		assert(obj instanceof Builder);
		obj = $(obj);
		assert(obj instanceof Builder);
	});

	test('$ - delegate to #element', function () {
		let obj = $('a', { 'class': 'a1', innerHtml: 'Hello' });
		assert(obj instanceof Builder);
		let el = obj.getHTMLElement();
		assert.equal(el.tagName.toLowerCase(), 'a');
		assert.equal(el.className, 'a1');
		assert.equal(el.innerHTML, 'Hello');
	});

	test('$ - html', function () {
		let obj = $('<a class="a1">Hello</a>');
		assert(obj instanceof Builder);
		let el = obj.getHTMLElement();
		assert.equal(el.tagName.toLowerCase(), 'a');
		assert.equal(el.className, 'a1');
		assert.equal(el.innerHTML, 'Hello');
	});

	test('$ - multiple html tags', function () {
		let objs = <MultiBuilder>$('<a class="a1">Hello</a><a class="a2">There</a>');
		assert(objs instanceof MultiBuilder);
		assert.equal(objs.length, 2);

		let obj = objs.item(0).getHTMLElement();
		assert.equal(obj.tagName.toLowerCase(), 'a');
		assert.equal(obj.className, 'a1');
		assert.equal(obj.innerHTML, 'Hello');

		obj = objs.item(1).getHTMLElement();
		assert.equal(obj.tagName.toLowerCase(), 'a');
		assert.equal(obj.className, 'a2');
		assert.equal(obj.innerHTML, 'There');
	});

	test('$ - html format', function () {
		let objs = <MultiBuilder>(<any>$)('<a class="{0}">{1}</a><a class="{2}">{3}</a>', 'a1', 'Hello', 'a2', 'There');
		assert(objs instanceof MultiBuilder);
		assert.equal(objs.length, 2);

		let obj = objs.item(0).getHTMLElement();
		assert.equal(obj.tagName.toLowerCase(), 'a');
		assert.equal(obj.className, 'a1');
		assert.equal(obj.innerHTML, 'Hello');

		obj = objs.item(1).getHTMLElement();
		assert.equal(obj.tagName.toLowerCase(), 'a');
		assert.equal(obj.className, 'a2');
		assert.equal(obj.innerHTML, 'There');
	});

	test('$ - exceptions', function () {
		assert.throws(function () { $(''); });
		assert.throws(function () { $(<any>123); });
	});

	test('$ - appendTo, append', function () {
		let peel = $('<div class="peel"></div>');
		let core = $('<span class="core"></span>').appendTo(peel);
		let obj = peel.getHTMLElement();
		assert(obj);
		assert.equal(obj.tagName.toLowerCase(), 'div');
		assert.equal(obj.className, 'peel');
		assert.equal(obj.children.length, 1);
		assert(obj.firstChild);
		assert.equal((<HTMLElement>obj.firstChild).children.length, 0);
		assert.equal((<HTMLElement>obj.firstChild).tagName.toLowerCase(), 'span');
		assert.equal((<HTMLElement>obj.firstChild).className, 'core');
		obj = core.getHTMLElement();
		assert.equal(obj.children.length, 0);
		assert.equal(obj.tagName.toLowerCase(), 'span');
		assert.equal(obj.className, 'core');

		peel = $('<div class="peel"></div>').append($('<span class="core"></span>'));
		obj = peel.getHTMLElement();
		assert(obj);
		assert.equal(obj.tagName.toLowerCase(), 'div');
		assert.equal(obj.className, 'peel');
		assert.equal(obj.children.length, 1);
		assert(obj.firstChild);
		assert.equal((<HTMLElement>obj.firstChild).children.length, 0);
		assert.equal((<HTMLElement>obj.firstChild).tagName.toLowerCase(), 'span');
		assert.equal((<HTMLElement>obj.firstChild).className, 'core');
	});
});