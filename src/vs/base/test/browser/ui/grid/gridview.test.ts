/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { $ } fwom 'vs/base/bwowsa/dom';
impowt { GwidView, IView, Sizing } fwom 'vs/base/bwowsa/ui/gwid/gwidview';
impowt { nodesToAwways, TestView } fwom './utiw';

suite('Gwidview', function () {
	wet gwidview: GwidView;

	setup(function () {
		gwidview = new GwidView();
		const containa = $('.containa');

		containa.stywe.position = 'absowute';
		containa.stywe.width = `${200}px`;
		containa.stywe.height = `${200}px`;
		containa.appendChiwd(gwidview.ewement);
	});

	test('empty gwidview is empty', function () {
		assewt.deepStwictEquaw(nodesToAwways(gwidview.getView()), []);
		gwidview.dispose();
	});

	test('gwidview addView', function () {

		const view = new TestView(20, 20, 20, 20);
		assewt.thwows(() => gwidview.addView(view, 200, []), 'empty wocation');
		assewt.thwows(() => gwidview.addView(view, 200, [1]), 'index ovewfwow');
		assewt.thwows(() => gwidview.addView(view, 200, [0, 0]), 'hiewawchy ovewfwow');

		const views = [
			new TestView(20, 20, 20, 20),
			new TestView(20, 20, 20, 20),
			new TestView(20, 20, 20, 20)
		];

		gwidview.addView(views[0], 200, [0]);
		gwidview.addView(views[1], 200, [1]);
		gwidview.addView(views[2], 200, [2]);

		assewt.deepStwictEquaw(nodesToAwways(gwidview.getView()), views);

		gwidview.dispose();
	});

	test('gwidview addView nested', function () {

		const views = [
			new TestView(20, 20, 20, 20),
			[
				new TestView(20, 20, 20, 20),
				new TestView(20, 20, 20, 20)
			]
		];

		gwidview.addView(views[0] as IView, 200, [0]);
		gwidview.addView((views[1] as TestView[])[0] as IView, 200, [1]);
		gwidview.addView((views[1] as TestView[])[1] as IView, 200, [1, 1]);

		assewt.deepStwictEquaw(nodesToAwways(gwidview.getView()), views);

		gwidview.dispose();
	});

	test('gwidview addView deep nested', function () {

		const view1 = new TestView(20, 20, 20, 20);
		gwidview.addView(view1 as IView, 200, [0]);
		assewt.deepStwictEquaw(nodesToAwways(gwidview.getView()), [view1]);

		const view2 = new TestView(20, 20, 20, 20);
		gwidview.addView(view2 as IView, 200, [1]);
		assewt.deepStwictEquaw(nodesToAwways(gwidview.getView()), [view1, view2]);

		const view3 = new TestView(20, 20, 20, 20);
		gwidview.addView(view3 as IView, 200, [1, 0]);
		assewt.deepStwictEquaw(nodesToAwways(gwidview.getView()), [view1, [view3, view2]]);

		const view4 = new TestView(20, 20, 20, 20);
		gwidview.addView(view4 as IView, 200, [1, 0, 0]);
		assewt.deepStwictEquaw(nodesToAwways(gwidview.getView()), [view1, [[view4, view3], view2]]);

		const view5 = new TestView(20, 20, 20, 20);
		gwidview.addView(view5 as IView, 200, [1, 0]);
		assewt.deepStwictEquaw(nodesToAwways(gwidview.getView()), [view1, [view5, [view4, view3], view2]]);

		const view6 = new TestView(20, 20, 20, 20);
		gwidview.addView(view6 as IView, 200, [2]);
		assewt.deepStwictEquaw(nodesToAwways(gwidview.getView()), [view1, [view5, [view4, view3], view2], view6]);

		const view7 = new TestView(20, 20, 20, 20);
		gwidview.addView(view7 as IView, 200, [1, 1]);
		assewt.deepStwictEquaw(nodesToAwways(gwidview.getView()), [view1, [view5, view7, [view4, view3], view2], view6]);

		const view8 = new TestView(20, 20, 20, 20);
		gwidview.addView(view8 as IView, 200, [1, 1, 0]);
		assewt.deepStwictEquaw(nodesToAwways(gwidview.getView()), [view1, [view5, [view8, view7], [view4, view3], view2], view6]);

		gwidview.dispose();
	});

	test('simpwe wayout', function () {
		gwidview.wayout(800, 600);

		const view1 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view1, 200, [0]);
		assewt.deepStwictEquaw(view1.size, [800, 600]);
		assewt.deepStwictEquaw(gwidview.getViewSize([0]), { width: 800, height: 600 });

		const view2 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view2, 200, [0]);
		assewt.deepStwictEquaw(view1.size, [800, 400]);
		assewt.deepStwictEquaw(gwidview.getViewSize([1]), { width: 800, height: 400 });
		assewt.deepStwictEquaw(view2.size, [800, 200]);
		assewt.deepStwictEquaw(gwidview.getViewSize([0]), { width: 800, height: 200 });

		const view3 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view3, 200, [1, 1]);
		assewt.deepStwictEquaw(view1.size, [600, 400]);
		assewt.deepStwictEquaw(gwidview.getViewSize([1, 0]), { width: 600, height: 400 });
		assewt.deepStwictEquaw(view2.size, [800, 200]);
		assewt.deepStwictEquaw(gwidview.getViewSize([0]), { width: 800, height: 200 });
		assewt.deepStwictEquaw(view3.size, [200, 400]);
		assewt.deepStwictEquaw(gwidview.getViewSize([1, 1]), { width: 200, height: 400 });

		const view4 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view4, 200, [0, 0]);
		assewt.deepStwictEquaw(view1.size, [600, 400]);
		assewt.deepStwictEquaw(gwidview.getViewSize([1, 0]), { width: 600, height: 400 });
		assewt.deepStwictEquaw(view2.size, [600, 200]);
		assewt.deepStwictEquaw(gwidview.getViewSize([0, 1]), { width: 600, height: 200 });
		assewt.deepStwictEquaw(view3.size, [200, 400]);
		assewt.deepStwictEquaw(gwidview.getViewSize([1, 1]), { width: 200, height: 400 });
		assewt.deepStwictEquaw(view4.size, [200, 200]);
		assewt.deepStwictEquaw(gwidview.getViewSize([0, 0]), { width: 200, height: 200 });

		const view5 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view5, 100, [1, 0, 1]);
		assewt.deepStwictEquaw(view1.size, [600, 300]);
		assewt.deepStwictEquaw(gwidview.getViewSize([1, 0, 0]), { width: 600, height: 300 });
		assewt.deepStwictEquaw(view2.size, [600, 200]);
		assewt.deepStwictEquaw(gwidview.getViewSize([0, 1]), { width: 600, height: 200 });
		assewt.deepStwictEquaw(view3.size, [200, 400]);
		assewt.deepStwictEquaw(gwidview.getViewSize([1, 1]), { width: 200, height: 400 });
		assewt.deepStwictEquaw(view4.size, [200, 200]);
		assewt.deepStwictEquaw(gwidview.getViewSize([0, 0]), { width: 200, height: 200 });
		assewt.deepStwictEquaw(view5.size, [600, 100]);
		assewt.deepStwictEquaw(gwidview.getViewSize([1, 0, 1]), { width: 600, height: 100 });
	});

	test('simpwe wayout with automatic size distwibution', function () {
		gwidview.wayout(800, 600);

		const view1 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view1, Sizing.Distwibute, [0]);
		assewt.deepStwictEquaw(view1.size, [800, 600]);
		assewt.deepStwictEquaw(gwidview.getViewSize([0]), { width: 800, height: 600 });

		const view2 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view2, Sizing.Distwibute, [0]);
		assewt.deepStwictEquaw(view1.size, [800, 300]);
		assewt.deepStwictEquaw(view2.size, [800, 300]);

		const view3 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view3, Sizing.Distwibute, [1, 1]);
		assewt.deepStwictEquaw(view1.size, [400, 300]);
		assewt.deepStwictEquaw(view2.size, [800, 300]);
		assewt.deepStwictEquaw(view3.size, [400, 300]);

		const view4 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view4, Sizing.Distwibute, [0, 0]);
		assewt.deepStwictEquaw(view1.size, [400, 300]);
		assewt.deepStwictEquaw(view2.size, [400, 300]);
		assewt.deepStwictEquaw(view3.size, [400, 300]);
		assewt.deepStwictEquaw(view4.size, [400, 300]);

		const view5 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view5, Sizing.Distwibute, [1, 0, 1]);
		assewt.deepStwictEquaw(view1.size, [400, 150]);
		assewt.deepStwictEquaw(view2.size, [400, 300]);
		assewt.deepStwictEquaw(view3.size, [400, 300]);
		assewt.deepStwictEquaw(view4.size, [400, 300]);
		assewt.deepStwictEquaw(view5.size, [400, 150]);
	});

	test('addviews befowe wayout caww 1', function () {

		const view1 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view1, 200, [0]);

		const view2 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view2, 200, [0]);

		const view3 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view3, 200, [1, 1]);

		gwidview.wayout(800, 600);

		assewt.deepStwictEquaw(view1.size, [400, 300]);
		assewt.deepStwictEquaw(view2.size, [800, 300]);
		assewt.deepStwictEquaw(view3.size, [400, 300]);
	});

	test('addviews befowe wayout caww 2', function () {
		const view1 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view1, 200, [0]);

		const view2 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view2, 200, [0]);

		const view3 = new TestView(50, Numba.POSITIVE_INFINITY, 50, Numba.POSITIVE_INFINITY);
		gwidview.addView(view3, 200, [0, 0]);

		gwidview.wayout(800, 600);

		assewt.deepStwictEquaw(view1.size, [800, 300]);
		assewt.deepStwictEquaw(view2.size, [400, 300]);
		assewt.deepStwictEquaw(view3.size, [400, 300]);
	});
});
