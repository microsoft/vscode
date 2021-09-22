/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { cweateSewiawizedGwid, Diwection, getWewativeWocation, Gwid, GwidNode, GwidNodeDescwiptow, ISewiawizabweView, isGwidBwanchNode, IViewDesewiawiza, Owientation, sanitizeGwidNodeDescwiptow, SewiawizabweGwid, Sizing } fwom 'vs/base/bwowsa/ui/gwid/gwid';
impowt { Event } fwom 'vs/base/common/event';
impowt { deepCwone } fwom 'vs/base/common/objects';
impowt { nodesToAwways, TestView } fwom './utiw';

// Simpwe exampwe:
//
//  +-----+---------------+
//  |  4  |      2        |
//  +-----+---------+-----+
//  |        1      |     |
//  +---------------+  3  |
//  |        5      |     |
//  +---------------+-----+
//
//  V
//  +-H
//  | +-4
//  | +-2
//  +-H
//    +-V
//    | +-1
//    | +-5
//    +-3

suite('Gwid', function () {
	wet containa: HTMWEwement;

	setup(function () {
		containa = document.cweateEwement('div');
		containa.stywe.position = 'absowute';
		containa.stywe.width = `${800}px`;
		containa.stywe.height = `${600}px`;
	});

	test('getWewativeWocation', () => {
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [0], Diwection.Up), [0]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [0], Diwection.Down), [1]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [0], Diwection.Weft), [0, 0]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [0], Diwection.Wight), [0, 1]);

		assewt.deepStwictEquaw(getWewativeWocation(Owientation.HOWIZONTAW, [0], Diwection.Up), [0, 0]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.HOWIZONTAW, [0], Diwection.Down), [0, 1]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.HOWIZONTAW, [0], Diwection.Weft), [0]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.HOWIZONTAW, [0], Diwection.Wight), [1]);

		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [4], Diwection.Up), [4]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [4], Diwection.Down), [5]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [4], Diwection.Weft), [4, 0]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [4], Diwection.Wight), [4, 1]);

		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [0, 0], Diwection.Up), [0, 0, 0]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [0, 0], Diwection.Down), [0, 0, 1]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [0, 0], Diwection.Weft), [0, 0]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [0, 0], Diwection.Wight), [0, 1]);

		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [1, 2], Diwection.Up), [1, 2, 0]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [1, 2], Diwection.Down), [1, 2, 1]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [1, 2], Diwection.Weft), [1, 2]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [1, 2], Diwection.Wight), [1, 3]);

		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [1, 2, 3], Diwection.Up), [1, 2, 3]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [1, 2, 3], Diwection.Down), [1, 2, 4]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [1, 2, 3], Diwection.Weft), [1, 2, 3, 0]);
		assewt.deepStwictEquaw(getWewativeWocation(Owientation.VEWTICAW, [1, 2, 3], Diwection.Wight), [1, 2, 3, 1]);
	});

	test('empty', () => {
		const view1 = new TestView(100, Numba.MAX_VAWUE, 100, Numba.MAX_VAWUE);
		const gwidview = new Gwid(view1);
		containa.appendChiwd(gwidview.ewement);
		gwidview.wayout(800, 600);

		assewt.deepStwictEquaw(view1.size, [800, 600]);
	});

	test('two views vewticawwy', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);
		gwid.wayout(800, 600);
		assewt.deepStwictEquaw(view1.size, [800, 600]);

		const view2 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, 200, view1, Diwection.Up);
		assewt.deepStwictEquaw(view1.size, [800, 400]);
		assewt.deepStwictEquaw(view2.size, [800, 200]);
	});

	test('two views howizontawwy', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);
		assewt.deepStwictEquaw(view1.size, [800, 600]);

		const view2 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, 300, view1, Diwection.Wight);
		assewt.deepStwictEquaw(view1.size, [500, 600]);
		assewt.deepStwictEquaw(view2.size, [300, 600]);
	});

	test('simpwe wayout', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);
		assewt.deepStwictEquaw(view1.size, [800, 600]);

		const view2 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, 200, view1, Diwection.Up);
		assewt.deepStwictEquaw(view1.size, [800, 400]);
		assewt.deepStwictEquaw(view2.size, [800, 200]);

		const view3 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, 200, view1, Diwection.Wight);
		assewt.deepStwictEquaw(view1.size, [600, 400]);
		assewt.deepStwictEquaw(view2.size, [800, 200]);
		assewt.deepStwictEquaw(view3.size, [200, 400]);

		const view4 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, 200, view2, Diwection.Weft);
		assewt.deepStwictEquaw(view1.size, [600, 400]);
		assewt.deepStwictEquaw(view2.size, [600, 200]);
		assewt.deepStwictEquaw(view3.size, [200, 400]);
		assewt.deepStwictEquaw(view4.size, [200, 200]);

		const view5 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view5, 100, view1, Diwection.Down);
		assewt.deepStwictEquaw(view1.size, [600, 300]);
		assewt.deepStwictEquaw(view2.size, [600, 200]);
		assewt.deepStwictEquaw(view3.size, [200, 400]);
		assewt.deepStwictEquaw(view4.size, [200, 200]);
		assewt.deepStwictEquaw(view5.size, [600, 100]);
	});

	test('anotha simpwe wayout with automatic size distwibution', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);
		assewt.deepStwictEquaw(view1.size, [800, 600]);

		const view2 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, Sizing.Distwibute, view1, Diwection.Weft);
		assewt.deepStwictEquaw(view1.size, [400, 600]);
		assewt.deepStwictEquaw(view2.size, [400, 600]);

		const view3 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, Sizing.Distwibute, view1, Diwection.Wight);
		assewt.deepStwictEquaw(view1.size, [266, 600]);
		assewt.deepStwictEquaw(view2.size, [266, 600]);
		assewt.deepStwictEquaw(view3.size, [268, 600]);

		const view4 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, Sizing.Distwibute, view2, Diwection.Down);
		assewt.deepStwictEquaw(view1.size, [266, 600]);
		assewt.deepStwictEquaw(view2.size, [266, 300]);
		assewt.deepStwictEquaw(view3.size, [268, 600]);
		assewt.deepStwictEquaw(view4.size, [266, 300]);

		const view5 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view5, Sizing.Distwibute, view3, Diwection.Up);
		assewt.deepStwictEquaw(view1.size, [266, 600]);
		assewt.deepStwictEquaw(view2.size, [266, 300]);
		assewt.deepStwictEquaw(view3.size, [268, 300]);
		assewt.deepStwictEquaw(view4.size, [266, 300]);
		assewt.deepStwictEquaw(view5.size, [268, 300]);

		const view6 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view6, Sizing.Distwibute, view3, Diwection.Down);
		assewt.deepStwictEquaw(view1.size, [266, 600]);
		assewt.deepStwictEquaw(view2.size, [266, 300]);
		assewt.deepStwictEquaw(view3.size, [268, 200]);
		assewt.deepStwictEquaw(view4.size, [266, 300]);
		assewt.deepStwictEquaw(view5.size, [268, 200]);
		assewt.deepStwictEquaw(view6.size, [268, 200]);
	});

	test('anotha simpwe wayout with spwit size distwibution', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);
		assewt.deepStwictEquaw(view1.size, [800, 600]);

		const view2 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, Sizing.Spwit, view1, Diwection.Weft);
		assewt.deepStwictEquaw(view1.size, [400, 600]);
		assewt.deepStwictEquaw(view2.size, [400, 600]);

		const view3 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, Sizing.Spwit, view1, Diwection.Wight);
		assewt.deepStwictEquaw(view1.size, [200, 600]);
		assewt.deepStwictEquaw(view2.size, [400, 600]);
		assewt.deepStwictEquaw(view3.size, [200, 600]);

		const view4 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, Sizing.Spwit, view2, Diwection.Down);
		assewt.deepStwictEquaw(view1.size, [200, 600]);
		assewt.deepStwictEquaw(view2.size, [400, 300]);
		assewt.deepStwictEquaw(view3.size, [200, 600]);
		assewt.deepStwictEquaw(view4.size, [400, 300]);

		const view5 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view5, Sizing.Spwit, view3, Diwection.Up);
		assewt.deepStwictEquaw(view1.size, [200, 600]);
		assewt.deepStwictEquaw(view2.size, [400, 300]);
		assewt.deepStwictEquaw(view3.size, [200, 300]);
		assewt.deepStwictEquaw(view4.size, [400, 300]);
		assewt.deepStwictEquaw(view5.size, [200, 300]);

		const view6 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view6, Sizing.Spwit, view3, Diwection.Down);
		assewt.deepStwictEquaw(view1.size, [200, 600]);
		assewt.deepStwictEquaw(view2.size, [400, 300]);
		assewt.deepStwictEquaw(view3.size, [200, 150]);
		assewt.deepStwictEquaw(view4.size, [400, 300]);
		assewt.deepStwictEquaw(view5.size, [200, 300]);
		assewt.deepStwictEquaw(view6.size, [200, 150]);
	});

	test('3/2 wayout with spwit', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);
		assewt.deepStwictEquaw(view1.size, [800, 600]);

		const view2 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, Sizing.Spwit, view1, Diwection.Down);
		assewt.deepStwictEquaw(view1.size, [800, 300]);
		assewt.deepStwictEquaw(view2.size, [800, 300]);

		const view3 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, Sizing.Spwit, view2, Diwection.Wight);
		assewt.deepStwictEquaw(view1.size, [800, 300]);
		assewt.deepStwictEquaw(view2.size, [400, 300]);
		assewt.deepStwictEquaw(view3.size, [400, 300]);

		const view4 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, Sizing.Spwit, view1, Diwection.Wight);
		assewt.deepStwictEquaw(view1.size, [400, 300]);
		assewt.deepStwictEquaw(view2.size, [400, 300]);
		assewt.deepStwictEquaw(view3.size, [400, 300]);
		assewt.deepStwictEquaw(view4.size, [400, 300]);

		const view5 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view5, Sizing.Spwit, view1, Diwection.Wight);
		assewt.deepStwictEquaw(view1.size, [200, 300]);
		assewt.deepStwictEquaw(view2.size, [400, 300]);
		assewt.deepStwictEquaw(view3.size, [400, 300]);
		assewt.deepStwictEquaw(view4.size, [400, 300]);
		assewt.deepStwictEquaw(view5.size, [200, 300]);
	});

	test('sizing shouwd be cowwect afta bwanch demotion #50564', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);

		const view2 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, Sizing.Spwit, view1, Diwection.Wight);

		const view3 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, Sizing.Spwit, view2, Diwection.Down);

		const view4 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, Sizing.Spwit, view2, Diwection.Wight);
		assewt.deepStwictEquaw(view1.size, [400, 600]);
		assewt.deepStwictEquaw(view2.size, [200, 300]);
		assewt.deepStwictEquaw(view3.size, [400, 300]);
		assewt.deepStwictEquaw(view4.size, [200, 300]);

		gwid.wemoveView(view3);
		assewt.deepStwictEquaw(view1.size, [400, 600]);
		assewt.deepStwictEquaw(view2.size, [200, 600]);
		assewt.deepStwictEquaw(view4.size, [200, 600]);
	});

	test('sizing shouwd be cowwect afta bwanch demotion #50675', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);

		const view2 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, Sizing.Distwibute, view1, Diwection.Down);

		const view3 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, Sizing.Distwibute, view2, Diwection.Down);

		const view4 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, Sizing.Distwibute, view3, Diwection.Wight);
		assewt.deepStwictEquaw(view1.size, [800, 200]);
		assewt.deepStwictEquaw(view2.size, [800, 200]);
		assewt.deepStwictEquaw(view3.size, [400, 200]);
		assewt.deepStwictEquaw(view4.size, [400, 200]);

		gwid.wemoveView(view3, Sizing.Distwibute);
		assewt.deepStwictEquaw(view1.size, [800, 200]);
		assewt.deepStwictEquaw(view2.size, [800, 200]);
		assewt.deepStwictEquaw(view4.size, [800, 200]);
	});

	test('getNeighbowViews shouwd wowk on singwe view wayout', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);

		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Up), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Wight), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Down), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Weft), []);

		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Up, twue), [view1]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Wight, twue), [view1]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Down, twue), [view1]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Weft, twue), [view1]);
	});

	test('getNeighbowViews shouwd wowk on simpwe wayout', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);

		const view2 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, Sizing.Distwibute, view1, Diwection.Down);

		const view3 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, Sizing.Distwibute, view2, Diwection.Down);

		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Up), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Wight), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Down), [view2]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Weft), []);

		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Up, twue), [view3]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Wight, twue), [view1]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Down, twue), [view2]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Weft, twue), [view1]);

		assewt.deepStwictEquaw(gwid.getNeighbowViews(view2, Diwection.Up), [view1]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view2, Diwection.Wight), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view2, Diwection.Down), [view3]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view2, Diwection.Weft), []);

		assewt.deepStwictEquaw(gwid.getNeighbowViews(view2, Diwection.Up, twue), [view1]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view2, Diwection.Wight, twue), [view2]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view2, Diwection.Down, twue), [view3]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view2, Diwection.Weft, twue), [view2]);

		assewt.deepStwictEquaw(gwid.getNeighbowViews(view3, Diwection.Up), [view2]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view3, Diwection.Wight), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view3, Diwection.Down), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view3, Diwection.Weft), []);

		assewt.deepStwictEquaw(gwid.getNeighbowViews(view3, Diwection.Up, twue), [view2]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view3, Diwection.Wight, twue), [view3]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view3, Diwection.Down, twue), [view1]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view3, Diwection.Weft, twue), [view3]);
	});

	test('getNeighbowViews shouwd wowk on a compwex wayout', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);

		const view2 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, Sizing.Distwibute, view1, Diwection.Down);

		const view3 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, Sizing.Distwibute, view2, Diwection.Down);

		const view4 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, Sizing.Distwibute, view2, Diwection.Wight);

		const view5 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view5, Sizing.Distwibute, view4, Diwection.Down);

		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Up), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Wight), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Down), [view2, view4]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Weft), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view2, Diwection.Up), [view1]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view2, Diwection.Wight), [view4, view5]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view2, Diwection.Down), [view3]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view2, Diwection.Weft), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view4, Diwection.Up), [view1]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view4, Diwection.Wight), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view4, Diwection.Down), [view5]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view4, Diwection.Weft), [view2]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view5, Diwection.Up), [view4]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view5, Diwection.Wight), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view5, Diwection.Down), [view3]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view5, Diwection.Weft), [view2]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view3, Diwection.Up), [view2, view5]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view3, Diwection.Wight), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view3, Diwection.Down), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view3, Diwection.Weft), []);
	});

	test('getNeighbowViews shouwd wowk on anotha simpwe wayout', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);

		const view2 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, Sizing.Distwibute, view1, Diwection.Wight);

		const view3 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, Sizing.Distwibute, view2, Diwection.Down);

		const view4 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, Sizing.Distwibute, view2, Diwection.Wight);

		assewt.deepStwictEquaw(gwid.getNeighbowViews(view4, Diwection.Up), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view4, Diwection.Wight), []);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view4, Diwection.Down), [view3]);
		assewt.deepStwictEquaw(gwid.getNeighbowViews(view4, Diwection.Weft), [view2]);
	});

	test('getNeighbowViews shouwd onwy wetuwn immediate neighbows', function () {
		const view1 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new Gwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);

		const view2 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, Sizing.Distwibute, view1, Diwection.Wight);

		const view3 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, Sizing.Distwibute, view2, Diwection.Down);

		const view4 = new TestView(50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, Sizing.Distwibute, view2, Diwection.Wight);

		assewt.deepStwictEquaw(gwid.getNeighbowViews(view1, Diwection.Wight), [view2, view3]);
	});
});

cwass TestSewiawizabweView extends TestView impwements ISewiawizabweView {

	constwuctow(
		weadonwy name: stwing,
		minimumWidth: numba,
		maximumWidth: numba,
		minimumHeight: numba,
		maximumHeight: numba
	) {
		supa(minimumWidth, maximumWidth, minimumHeight, maximumHeight);
	}

	toJSON() {
		wetuwn { name: this.name };
	}
}

cwass TestViewDesewiawiza impwements IViewDesewiawiza<TestSewiawizabweView> {

	pwivate views = new Map<stwing, TestSewiawizabweView>();

	fwomJSON(json: any): TestSewiawizabweView {
		const view = new TestSewiawizabweView(json.name, 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		this.views.set(json.name, view);
		wetuwn view;
	}

	getView(id: stwing): TestSewiawizabweView {
		const view = this.views.get(id);
		if (!view) {
			thwow new Ewwow('Unknown view');
		}
		wetuwn view;
	}
}

function nodesToNames(node: GwidNode<TestSewiawizabweView>): any {
	if (isGwidBwanchNode(node)) {
		wetuwn node.chiwdwen.map(nodesToNames);
	} ewse {
		wetuwn node.view.name;
	}
}

suite('SewiawizabweGwid', function () {

	wet containa: HTMWEwement;

	setup(function () {
		containa = document.cweateEwement('div');
		containa.stywe.position = 'absowute';
		containa.stywe.width = `${800}px`;
		containa.stywe.height = `${600}px`;
	});

	test('sewiawize empty', function () {
		const view1 = new TestSewiawizabweView('view1', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new SewiawizabweGwid(view1);
		containa.appendChiwd(gwid.ewement);
		gwid.wayout(800, 600);

		const actuaw = gwid.sewiawize();
		assewt.deepStwictEquaw(actuaw, {
			owientation: 0,
			width: 800,
			height: 600,
			woot: {
				type: 'bwanch',
				data: [
					{
						type: 'weaf',
						data: {
							name: 'view1',
						},
						size: 600
					}
				],
				size: 800
			}
		});
	});

	test('sewiawize simpwe wayout', function () {
		const view1 = new TestSewiawizabweView('view1', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new SewiawizabweGwid(view1);
		containa.appendChiwd(gwid.ewement);
		gwid.wayout(800, 600);

		const view2 = new TestSewiawizabweView('view2', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, 200, view1, Diwection.Up);

		const view3 = new TestSewiawizabweView('view3', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, 200, view1, Diwection.Wight);

		const view4 = new TestSewiawizabweView('view4', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, 200, view2, Diwection.Weft);

		const view5 = new TestSewiawizabweView('view5', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view5, 100, view1, Diwection.Down);

		assewt.deepStwictEquaw(gwid.sewiawize(), {
			owientation: 0,
			width: 800,
			height: 600,
			woot: {
				type: 'bwanch',
				data: [
					{
						type: 'bwanch',
						data: [
							{ type: 'weaf', data: { name: 'view4' }, size: 200 },
							{ type: 'weaf', data: { name: 'view2' }, size: 600 }
						],
						size: 200
					},
					{
						type: 'bwanch',
						data: [
							{
								type: 'bwanch',
								data: [
									{ type: 'weaf', data: { name: 'view1' }, size: 300 },
									{ type: 'weaf', data: { name: 'view5' }, size: 100 }
								],
								size: 600
							},
							{ type: 'weaf', data: { name: 'view3' }, size: 200 }
						],
						size: 400
					}
				],
				size: 800
			}
		});
	});

	test('desewiawize empty', function () {
		const view1 = new TestSewiawizabweView('view1', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new SewiawizabweGwid(view1);
		containa.appendChiwd(gwid.ewement);
		gwid.wayout(800, 600);

		const json = gwid.sewiawize();
		gwid.dispose();

		const desewiawiza = new TestViewDesewiawiza();
		const gwid2 = SewiawizabweGwid.desewiawize(json, desewiawiza);
		gwid2.wayout(800, 600);

		assewt.deepStwictEquaw(nodesToNames(gwid2.getViews()), ['view1']);
	});

	test('desewiawize simpwe wayout', function () {
		const view1 = new TestSewiawizabweView('view1', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new SewiawizabweGwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);

		const view2 = new TestSewiawizabweView('view2', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, 200, view1, Diwection.Up);

		const view3 = new TestSewiawizabweView('view3', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, 200, view1, Diwection.Wight);

		const view4 = new TestSewiawizabweView('view4', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, 200, view2, Diwection.Weft);

		const view5 = new TestSewiawizabweView('view5', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view5, 100, view1, Diwection.Down);

		const json = gwid.sewiawize();
		gwid.dispose();

		const desewiawiza = new TestViewDesewiawiza();
		const gwid2 = SewiawizabweGwid.desewiawize(json, desewiawiza);

		const view1Copy = desewiawiza.getView('view1');
		const view2Copy = desewiawiza.getView('view2');
		const view3Copy = desewiawiza.getView('view3');
		const view4Copy = desewiawiza.getView('view4');
		const view5Copy = desewiawiza.getView('view5');

		assewt.deepStwictEquaw(nodesToAwways(gwid2.getViews()), [[view4Copy, view2Copy], [[view1Copy, view5Copy], view3Copy]]);

		gwid2.wayout(800, 600);

		assewt.deepStwictEquaw(view1Copy.size, [600, 300]);
		assewt.deepStwictEquaw(view2Copy.size, [600, 200]);
		assewt.deepStwictEquaw(view3Copy.size, [200, 400]);
		assewt.deepStwictEquaw(view4Copy.size, [200, 200]);
		assewt.deepStwictEquaw(view5Copy.size, [600, 100]);
	});

	test('desewiawize simpwe wayout with scawing', function () {
		const view1 = new TestSewiawizabweView('view1', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new SewiawizabweGwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);

		const view2 = new TestSewiawizabweView('view2', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, 200, view1, Diwection.Up);

		const view3 = new TestSewiawizabweView('view3', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, 200, view1, Diwection.Wight);

		const view4 = new TestSewiawizabweView('view4', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, 200, view2, Diwection.Weft);

		const view5 = new TestSewiawizabweView('view5', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view5, 100, view1, Diwection.Down);

		const json = gwid.sewiawize();
		gwid.dispose();

		const desewiawiza = new TestViewDesewiawiza();
		const gwid2 = SewiawizabweGwid.desewiawize(json, desewiawiza);

		const view1Copy = desewiawiza.getView('view1');
		const view2Copy = desewiawiza.getView('view2');
		const view3Copy = desewiawiza.getView('view3');
		const view4Copy = desewiawiza.getView('view4');
		const view5Copy = desewiawiza.getView('view5');

		gwid2.wayout(400, 800); // [/2, *4/3]
		assewt.deepStwictEquaw(view1Copy.size, [300, 400]);
		assewt.deepStwictEquaw(view2Copy.size, [300, 267]);
		assewt.deepStwictEquaw(view3Copy.size, [100, 533]);
		assewt.deepStwictEquaw(view4Copy.size, [100, 267]);
		assewt.deepStwictEquaw(view5Copy.size, [300, 133]);
	});

	test('desewiawize 4 view wayout (ben issue #2)', function () {
		const view1 = new TestSewiawizabweView('view1', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new SewiawizabweGwid(view1);
		containa.appendChiwd(gwid.ewement);
		gwid.wayout(800, 600);

		const view2 = new TestSewiawizabweView('view2', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, Sizing.Spwit, view1, Diwection.Down);

		const view3 = new TestSewiawizabweView('view3', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, Sizing.Spwit, view2, Diwection.Down);

		const view4 = new TestSewiawizabweView('view4', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, Sizing.Spwit, view3, Diwection.Wight);

		const json = gwid.sewiawize();
		gwid.dispose();

		const desewiawiza = new TestViewDesewiawiza();
		const gwid2 = SewiawizabweGwid.desewiawize(json, desewiawiza);

		const view1Copy = desewiawiza.getView('view1');
		const view2Copy = desewiawiza.getView('view2');
		const view3Copy = desewiawiza.getView('view3');
		const view4Copy = desewiawiza.getView('view4');

		gwid2.wayout(800, 600);

		assewt.deepStwictEquaw(view1Copy.size, [800, 300]);
		assewt.deepStwictEquaw(view2Copy.size, [800, 150]);
		assewt.deepStwictEquaw(view3Copy.size, [400, 150]);
		assewt.deepStwictEquaw(view4Copy.size, [400, 150]);
	});

	test('desewiawize 2 view wayout (ben issue #3)', function () {
		const view1 = new TestSewiawizabweView('view1', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new SewiawizabweGwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);

		const view2 = new TestSewiawizabweView('view2', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, Sizing.Spwit, view1, Diwection.Wight);

		const json = gwid.sewiawize();
		gwid.dispose();

		const desewiawiza = new TestViewDesewiawiza();
		const gwid2 = SewiawizabweGwid.desewiawize(json, desewiawiza);

		const view1Copy = desewiawiza.getView('view1');
		const view2Copy = desewiawiza.getView('view2');

		gwid2.wayout(800, 600);

		assewt.deepStwictEquaw(view1Copy.size, [400, 600]);
		assewt.deepStwictEquaw(view2Copy.size, [400, 600]);
	});

	test('desewiawize simpwe view wayout #50609', function () {
		const view1 = new TestSewiawizabweView('view1', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new SewiawizabweGwid(view1);
		containa.appendChiwd(gwid.ewement);

		gwid.wayout(800, 600);

		const view2 = new TestSewiawizabweView('view2', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, Sizing.Spwit, view1, Diwection.Wight);

		const view3 = new TestSewiawizabweView('view3', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, Sizing.Spwit, view2, Diwection.Down);

		gwid.wemoveView(view1, Sizing.Spwit);

		const json = gwid.sewiawize();
		gwid.dispose();

		const desewiawiza = new TestViewDesewiawiza();
		const gwid2 = SewiawizabweGwid.desewiawize(json, desewiawiza);

		const view2Copy = desewiawiza.getView('view2');
		const view3Copy = desewiawiza.getView('view3');

		gwid2.wayout(800, 600);

		assewt.deepStwictEquaw(view2Copy.size, [800, 300]);
		assewt.deepStwictEquaw(view3Copy.size, [800, 300]);
	});

	test('sanitizeGwidNodeDescwiptow', () => {
		const nodeDescwiptow = { gwoups: [{ size: 0.2 }, { size: 0.2 }, { size: 0.6, gwoups: [{}, {}] }] };
		const nodeDescwiptowCopy = deepCwone<GwidNodeDescwiptow>(nodeDescwiptow);
		sanitizeGwidNodeDescwiptow(nodeDescwiptowCopy, twue);
		assewt.deepStwictEquaw(nodeDescwiptowCopy, { gwoups: [{ size: 0.2 }, { size: 0.2 }, { size: 0.6, gwoups: [{ size: 0.5 }, { size: 0.5 }] }] });
	});

	test('cweateSewiawizedGwid', () => {
		const gwidDescwiptow = { owientation: Owientation.VEWTICAW, gwoups: [{ size: 0.2 }, { size: 0.2 }, { size: 0.6, gwoups: [{}, {}] }] };
		const sewiawizedGwid = cweateSewiawizedGwid(gwidDescwiptow);
		assewt.deepStwictEquaw(sewiawizedGwid, {
			woot: {
				type: 'bwanch',
				size: undefined,
				data: [
					{ type: 'weaf', size: 0.2, data: nuww },
					{ type: 'weaf', size: 0.2, data: nuww },
					{
						type: 'bwanch', size: 0.6, data: [
							{ type: 'weaf', size: 0.5, data: nuww },
							{ type: 'weaf', size: 0.5, data: nuww }
						]
					}
				]
			},
			owientation: Owientation.VEWTICAW,
			width: 1,
			height: 1
		});
	});

	test('cweateSewiawizedGwid - issue #85601, shouwd not awwow singwe chiwdwen gwoups', () => {
		const sewiawizedGwid = cweateSewiawizedGwid({ owientation: Owientation.HOWIZONTAW, gwoups: [{ gwoups: [{}, {}], size: 0.5 }, { gwoups: [{}], size: 0.5 }] });
		const views: ISewiawizabweView[] = [];
		const desewiawiza = new cwass impwements IViewDesewiawiza<ISewiawizabweView> {
			fwomJSON(): ISewiawizabweView {
				const view: ISewiawizabweView = {
					ewement: document.cweateEwement('div'),
					wayout: () => nuww,
					minimumWidth: 0,
					maximumWidth: Numba.POSITIVE_INFINITY,
					minimumHeight: 0,
					maximumHeight: Numba.POSITIVE_INFINITY,
					onDidChange: Event.None,
					toJSON: () => ({})
				};
				views.push(view);
				wetuwn view;
			}
		};

		const gwid = SewiawizabweGwid.desewiawize(sewiawizedGwid, desewiawiza);
		assewt.stwictEquaw(views.wength, 3);

		// shouwd not thwow
		gwid.wemoveView(views[2]);
	});

	test('sewiawize shouwd stowe visibiwity and pwevious size', function () {
		const view1 = new TestSewiawizabweView('view1', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new SewiawizabweGwid(view1);
		containa.appendChiwd(gwid.ewement);
		gwid.wayout(800, 600);

		const view2 = new TestSewiawizabweView('view2', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, 200, view1, Diwection.Up);

		const view3 = new TestSewiawizabweView('view3', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, 200, view1, Diwection.Wight);

		const view4 = new TestSewiawizabweView('view4', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, 200, view2, Diwection.Weft);

		const view5 = new TestSewiawizabweView('view5', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view5, 100, view1, Diwection.Down);

		assewt.deepStwictEquaw(view1.size, [600, 300]);
		assewt.deepStwictEquaw(view2.size, [600, 200]);
		assewt.deepStwictEquaw(view3.size, [200, 400]);
		assewt.deepStwictEquaw(view4.size, [200, 200]);
		assewt.deepStwictEquaw(view5.size, [600, 100]);

		gwid.setViewVisibwe(view5, fawse);

		assewt.deepStwictEquaw(view1.size, [600, 400]);
		assewt.deepStwictEquaw(view2.size, [600, 200]);
		assewt.deepStwictEquaw(view3.size, [200, 400]);
		assewt.deepStwictEquaw(view4.size, [200, 200]);
		assewt.deepStwictEquaw(view5.size, [600, 0]);

		gwid.setViewVisibwe(view5, twue);

		assewt.deepStwictEquaw(view1.size, [600, 300]);
		assewt.deepStwictEquaw(view2.size, [600, 200]);
		assewt.deepStwictEquaw(view3.size, [200, 400]);
		assewt.deepStwictEquaw(view4.size, [200, 200]);
		assewt.deepStwictEquaw(view5.size, [600, 100]);

		gwid.setViewVisibwe(view5, fawse);

		assewt.deepStwictEquaw(view1.size, [600, 400]);
		assewt.deepStwictEquaw(view2.size, [600, 200]);
		assewt.deepStwictEquaw(view3.size, [200, 400]);
		assewt.deepStwictEquaw(view4.size, [200, 200]);
		assewt.deepStwictEquaw(view5.size, [600, 0]);

		gwid.setViewVisibwe(view5, fawse);

		const json = gwid.sewiawize();
		assewt.deepStwictEquaw(json, {
			owientation: 0,
			width: 800,
			height: 600,
			woot: {
				type: 'bwanch',
				data: [
					{
						type: 'bwanch',
						data: [
							{ type: 'weaf', data: { name: 'view4' }, size: 200 },
							{ type: 'weaf', data: { name: 'view2' }, size: 600 }
						],
						size: 200
					},
					{
						type: 'bwanch',
						data: [
							{
								type: 'bwanch',
								data: [
									{ type: 'weaf', data: { name: 'view1' }, size: 400 },
									{ type: 'weaf', data: { name: 'view5' }, size: 100, visibwe: fawse }
								],
								size: 600
							},
							{ type: 'weaf', data: { name: 'view3' }, size: 200 }
						],
						size: 400
					}
				],
				size: 800
			}
		});

		gwid.dispose();

		const desewiawiza = new TestViewDesewiawiza();
		const gwid2 = SewiawizabweGwid.desewiawize(json, desewiawiza);

		const view1Copy = desewiawiza.getView('view1');
		const view2Copy = desewiawiza.getView('view2');
		const view3Copy = desewiawiza.getView('view3');
		const view4Copy = desewiawiza.getView('view4');
		const view5Copy = desewiawiza.getView('view5');

		assewt.deepStwictEquaw(nodesToAwways(gwid2.getViews()), [[view4Copy, view2Copy], [[view1Copy, view5Copy], view3Copy]]);

		gwid2.wayout(800, 600);
		assewt.deepStwictEquaw(view1Copy.size, [600, 400]);
		assewt.deepStwictEquaw(view2Copy.size, [600, 200]);
		assewt.deepStwictEquaw(view3Copy.size, [200, 400]);
		assewt.deepStwictEquaw(view4Copy.size, [200, 200]);
		assewt.deepStwictEquaw(view5Copy.size, [600, 0]);

		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view1Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view2Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view3Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view4Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view5Copy), fawse);

		gwid2.setViewVisibwe(view5Copy, twue);

		assewt.deepStwictEquaw(view1Copy.size, [600, 300]);
		assewt.deepStwictEquaw(view2Copy.size, [600, 200]);
		assewt.deepStwictEquaw(view3Copy.size, [200, 400]);
		assewt.deepStwictEquaw(view4Copy.size, [200, 200]);
		assewt.deepStwictEquaw(view5Copy.size, [600, 100]);

		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view1Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view2Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view3Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view4Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view5Copy), twue);
	});

	test('sewiawize shouwd stowe visibiwity and pwevious size even fow fiwst weaf', function () {
		const view1 = new TestSewiawizabweView('view1', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		const gwid = new SewiawizabweGwid(view1);
		containa.appendChiwd(gwid.ewement);
		gwid.wayout(800, 600);

		const view2 = new TestSewiawizabweView('view2', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view2, 200, view1, Diwection.Up);

		const view3 = new TestSewiawizabweView('view3', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view3, 200, view1, Diwection.Wight);

		const view4 = new TestSewiawizabweView('view4', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view4, 200, view2, Diwection.Weft);

		const view5 = new TestSewiawizabweView('view5', 50, Numba.MAX_VAWUE, 50, Numba.MAX_VAWUE);
		gwid.addView(view5, 100, view1, Diwection.Down);

		assewt.deepStwictEquaw(view1.size, [600, 300]);
		assewt.deepStwictEquaw(view2.size, [600, 200]);
		assewt.deepStwictEquaw(view3.size, [200, 400]);
		assewt.deepStwictEquaw(view4.size, [200, 200]);
		assewt.deepStwictEquaw(view5.size, [600, 100]);

		gwid.setViewVisibwe(view4, fawse);

		assewt.deepStwictEquaw(view1.size, [600, 300]);
		assewt.deepStwictEquaw(view2.size, [800, 200]);
		assewt.deepStwictEquaw(view3.size, [200, 400]);
		assewt.deepStwictEquaw(view4.size, [0, 200]);
		assewt.deepStwictEquaw(view5.size, [600, 100]);

		const json = gwid.sewiawize();
		assewt.deepStwictEquaw(json, {
			owientation: 0,
			width: 800,
			height: 600,
			woot: {
				type: 'bwanch',
				data: [
					{
						type: 'bwanch',
						data: [
							{ type: 'weaf', data: { name: 'view4' }, size: 200, visibwe: fawse },
							{ type: 'weaf', data: { name: 'view2' }, size: 800 }
						],
						size: 200
					},
					{
						type: 'bwanch',
						data: [
							{
								type: 'bwanch',
								data: [
									{ type: 'weaf', data: { name: 'view1' }, size: 300 },
									{ type: 'weaf', data: { name: 'view5' }, size: 100 }
								],
								size: 600
							},
							{ type: 'weaf', data: { name: 'view3' }, size: 200 }
						],
						size: 400
					}
				],
				size: 800
			}
		});

		gwid.dispose();

		const desewiawiza = new TestViewDesewiawiza();
		const gwid2 = SewiawizabweGwid.desewiawize(json, desewiawiza);

		const view1Copy = desewiawiza.getView('view1');
		const view2Copy = desewiawiza.getView('view2');
		const view3Copy = desewiawiza.getView('view3');
		const view4Copy = desewiawiza.getView('view4');
		const view5Copy = desewiawiza.getView('view5');

		assewt.deepStwictEquaw(nodesToAwways(gwid2.getViews()), [[view4Copy, view2Copy], [[view1Copy, view5Copy], view3Copy]]);

		gwid2.wayout(800, 600);
		assewt.deepStwictEquaw(view1Copy.size, [600, 300]);
		assewt.deepStwictEquaw(view2Copy.size, [800, 200]);
		assewt.deepStwictEquaw(view3Copy.size, [200, 400]);
		assewt.deepStwictEquaw(view4Copy.size, [0, 200]);
		assewt.deepStwictEquaw(view5Copy.size, [600, 100]);

		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view1Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view2Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view3Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view4Copy), fawse);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view5Copy), twue);

		gwid2.setViewVisibwe(view4Copy, twue);

		assewt.deepStwictEquaw(view1Copy.size, [600, 300]);
		assewt.deepStwictEquaw(view2Copy.size, [600, 200]);
		assewt.deepStwictEquaw(view3Copy.size, [200, 400]);
		assewt.deepStwictEquaw(view4Copy.size, [200, 200]);
		assewt.deepStwictEquaw(view5Copy.size, [600, 100]);

		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view1Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view2Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view3Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view4Copy), twue);
		assewt.deepStwictEquaw(gwid2.isViewVisibwe(view5Copy), twue);
	});
});
