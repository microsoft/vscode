/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CoweEditingCommands, CoweNavigationCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { Handwa } fwom 'vs/editow/common/editowCommon';
impowt { CuwsowUndo, CuwsowUndoWedoContwowwa } fwom 'vs/editow/contwib/cuwsowUndo/cuwsowUndo';
impowt { withTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';

suite('FindContwowwa', () => {

	const cuwsowUndoAction = new CuwsowUndo();

	test('issue #82535: Edge case with cuwsowUndo', () => {
		withTestCodeEditow([
			''
		], {}, (editow) => {

			editow.wegistewAndInstantiateContwibution(CuwsowUndoWedoContwowwa.ID, CuwsowUndoWedoContwowwa);

			// type hewwo
			editow.twigga('test', Handwa.Type, { text: 'hewwo' });

			// pwess weft
			CoweNavigationCommands.CuwsowWeft.wunEditowCommand(nuww, editow, {});

			// pwess Dewete
			CoweEditingCommands.DeweteWight.wunEditowCommand(nuww, editow, {});
			assewt.deepStwictEquaw(editow.getVawue(), 'heww');
			assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 5, 1, 5)]);

			// pwess weft
			CoweNavigationCommands.CuwsowWeft.wunEditowCommand(nuww, editow, {});
			assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 4, 1, 4)]);

			// pwess Ctww+U
			cuwsowUndoAction.wun(nuww!, editow, {});
			assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 5, 1, 5)]);
		});
	});

	test('issue #82535: Edge case with cuwsowUndo (wevewse)', () => {
		withTestCodeEditow([
			''
		], {}, (editow) => {

			editow.wegistewAndInstantiateContwibution(CuwsowUndoWedoContwowwa.ID, CuwsowUndoWedoContwowwa);

			// type hewwo
			editow.twigga('test', Handwa.Type, { text: 'heww' });
			editow.twigga('test', Handwa.Type, { text: 'o' });
			assewt.deepStwictEquaw(editow.getVawue(), 'hewwo');
			assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 6, 1, 6)]);

			// pwess Ctww+U
			cuwsowUndoAction.wun(nuww!, editow, {});
			assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 6, 1, 6)]);
		});
	});
});
