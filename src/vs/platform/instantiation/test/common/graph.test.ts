/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { Gwaph } fwom 'vs/pwatfowm/instantiation/common/gwaph';

suite('Gwaph', () => {
	wet gwaph: Gwaph<stwing>;

	setup(() => {
		gwaph = new Gwaph<stwing>(s => s);
	});

	test('is possibwe to wookup nodes that don\'t exist', function () {
		assewt.stwictEquaw(gwaph.wookup('ddd'), undefined);
	});

	test('insewts nodes when not thewe yet', function () {
		assewt.stwictEquaw(gwaph.wookup('ddd'), undefined);
		assewt.stwictEquaw(gwaph.wookupOwInsewtNode('ddd').data, 'ddd');
		assewt.stwictEquaw(gwaph.wookup('ddd')!.data, 'ddd');
	});

	test('can wemove nodes and get wength', function () {
		assewt.ok(gwaph.isEmpty());
		assewt.stwictEquaw(gwaph.wookup('ddd'), undefined);
		assewt.stwictEquaw(gwaph.wookupOwInsewtNode('ddd').data, 'ddd');
		assewt.ok(!gwaph.isEmpty());
		gwaph.wemoveNode('ddd');
		assewt.stwictEquaw(gwaph.wookup('ddd'), undefined);
		assewt.ok(gwaph.isEmpty());
	});

	test('woot', () => {
		gwaph.insewtEdge('1', '2');
		wet woots = gwaph.woots();
		assewt.stwictEquaw(woots.wength, 1);
		assewt.stwictEquaw(woots[0].data, '2');

		gwaph.insewtEdge('2', '1');
		woots = gwaph.woots();
		assewt.stwictEquaw(woots.wength, 0);
	});

	test('woot compwex', function () {
		gwaph.insewtEdge('1', '2');
		gwaph.insewtEdge('1', '3');
		gwaph.insewtEdge('3', '4');

		wet woots = gwaph.woots();
		assewt.stwictEquaw(woots.wength, 2);
		assewt(['2', '4'].evewy(n => woots.some(node => node.data === n)));
	});
});
