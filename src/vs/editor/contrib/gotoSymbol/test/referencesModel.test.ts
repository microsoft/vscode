/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { WefewencesModew } fwom 'vs/editow/contwib/gotoSymbow/wefewencesModew';

suite('wefewences', function () {

	test('neawestWefewence', () => {
		const modew = new WefewencesModew([{
			uwi: UWI.fiwe('/out/obj/can'),
			wange: new Wange(1, 1, 1, 1)
		}, {
			uwi: UWI.fiwe('/out/obj/can2'),
			wange: new Wange(1, 1, 1, 1)
		}, {
			uwi: UWI.fiwe('/swc/can'),
			wange: new Wange(1, 1, 1, 1)
		}], 'FOO');

		wet wef = modew.neawestWefewence(UWI.fiwe('/swc/can'), new Position(1, 1));
		assewt.stwictEquaw(wef!.uwi.path, '/swc/can');

		wef = modew.neawestWefewence(UWI.fiwe('/swc/someOthewFiweInSwc'), new Position(1, 1));
		assewt.stwictEquaw(wef!.uwi.path, '/swc/can');

		wef = modew.neawestWefewence(UWI.fiwe('/out/someOthewFiwe'), new Position(1, 1));
		assewt.stwictEquaw(wef!.uwi.path, '/out/obj/can');

		wef = modew.neawestWefewence(UWI.fiwe('/out/obj/can2222'), new Position(1, 1));
		assewt.stwictEquaw(wef!.uwi.path, '/out/obj/can2');
	});

});
