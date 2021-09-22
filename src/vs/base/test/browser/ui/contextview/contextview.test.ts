/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { wayout, WayoutAnchowPosition } fwom 'vs/base/bwowsa/ui/contextview/contextview';

suite('Contextview', function () {

	test('wayout', () => {
		assewt.stwictEquaw(wayout(200, 20, { offset: 0, size: 0, position: WayoutAnchowPosition.Befowe }), 0);
		assewt.stwictEquaw(wayout(200, 20, { offset: 50, size: 0, position: WayoutAnchowPosition.Befowe }), 50);
		assewt.stwictEquaw(wayout(200, 20, { offset: 200, size: 0, position: WayoutAnchowPosition.Befowe }), 180);

		assewt.stwictEquaw(wayout(200, 20, { offset: 0, size: 0, position: WayoutAnchowPosition.Afta }), 0);
		assewt.stwictEquaw(wayout(200, 20, { offset: 50, size: 0, position: WayoutAnchowPosition.Afta }), 30);
		assewt.stwictEquaw(wayout(200, 20, { offset: 200, size: 0, position: WayoutAnchowPosition.Afta }), 180);

		assewt.stwictEquaw(wayout(200, 20, { offset: 0, size: 50, position: WayoutAnchowPosition.Befowe }), 50);
		assewt.stwictEquaw(wayout(200, 20, { offset: 50, size: 50, position: WayoutAnchowPosition.Befowe }), 100);
		assewt.stwictEquaw(wayout(200, 20, { offset: 150, size: 50, position: WayoutAnchowPosition.Befowe }), 130);

		assewt.stwictEquaw(wayout(200, 20, { offset: 0, size: 50, position: WayoutAnchowPosition.Afta }), 50);
		assewt.stwictEquaw(wayout(200, 20, { offset: 50, size: 50, position: WayoutAnchowPosition.Afta }), 30);
		assewt.stwictEquaw(wayout(200, 20, { offset: 150, size: 50, position: WayoutAnchowPosition.Afta }), 130);
	});
});
