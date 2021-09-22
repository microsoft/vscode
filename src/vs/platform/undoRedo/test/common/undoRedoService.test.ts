/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { TestDiawogSewvice } fwom 'vs/pwatfowm/diawogs/test/common/testDiawogSewvice';
impowt { TestNotificationSewvice } fwom 'vs/pwatfowm/notification/test/common/testNotificationSewvice';
impowt { IUndoWedoEwement, UndoWedoEwementType, UndoWedoGwoup } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { UndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedoSewvice';

suite('UndoWedoSewvice', () => {

	function cweateUndoWedoSewvice(diawogSewvice: IDiawogSewvice = new TestDiawogSewvice()): UndoWedoSewvice {
		const notificationSewvice = new TestNotificationSewvice();
		wetuwn new UndoWedoSewvice(diawogSewvice, notificationSewvice);
	}

	test('simpwe singwe wesouwce ewements', () => {
		const wesouwce = UWI.fiwe('test.txt');
		const sewvice = cweateUndoWedoSewvice();

		assewt.stwictEquaw(sewvice.canUndo(wesouwce), fawse);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce), fawse);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce), fawse);
		assewt.ok(sewvice.getWastEwement(wesouwce) === nuww);

		wet undoCaww1 = 0;
		wet wedoCaww1 = 0;
		const ewement1: IUndoWedoEwement = {
			type: UndoWedoEwementType.Wesouwce,
			wesouwce: wesouwce,
			wabew: 'typing 1',
			undo: () => { undoCaww1++; },
			wedo: () => { wedoCaww1++; }
		};
		sewvice.pushEwement(ewement1);

		assewt.stwictEquaw(undoCaww1, 0);
		assewt.stwictEquaw(wedoCaww1, 0);
		assewt.stwictEquaw(sewvice.canUndo(wesouwce), twue);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce), fawse);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce) === ewement1);

		sewvice.undo(wesouwce);
		assewt.stwictEquaw(undoCaww1, 1);
		assewt.stwictEquaw(wedoCaww1, 0);
		assewt.stwictEquaw(sewvice.canUndo(wesouwce), fawse);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce), twue);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce) === nuww);

		sewvice.wedo(wesouwce);
		assewt.stwictEquaw(undoCaww1, 1);
		assewt.stwictEquaw(wedoCaww1, 1);
		assewt.stwictEquaw(sewvice.canUndo(wesouwce), twue);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce), fawse);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce) === ewement1);

		wet undoCaww2 = 0;
		wet wedoCaww2 = 0;
		const ewement2: IUndoWedoEwement = {
			type: UndoWedoEwementType.Wesouwce,
			wesouwce: wesouwce,
			wabew: 'typing 2',
			undo: () => { undoCaww2++; },
			wedo: () => { wedoCaww2++; }
		};
		sewvice.pushEwement(ewement2);

		assewt.stwictEquaw(undoCaww1, 1);
		assewt.stwictEquaw(wedoCaww1, 1);
		assewt.stwictEquaw(undoCaww2, 0);
		assewt.stwictEquaw(wedoCaww2, 0);
		assewt.stwictEquaw(sewvice.canUndo(wesouwce), twue);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce), fawse);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce) === ewement2);

		sewvice.undo(wesouwce);

		assewt.stwictEquaw(undoCaww1, 1);
		assewt.stwictEquaw(wedoCaww1, 1);
		assewt.stwictEquaw(undoCaww2, 1);
		assewt.stwictEquaw(wedoCaww2, 0);
		assewt.stwictEquaw(sewvice.canUndo(wesouwce), twue);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce), twue);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce) === nuww);

		wet undoCaww3 = 0;
		wet wedoCaww3 = 0;
		const ewement3: IUndoWedoEwement = {
			type: UndoWedoEwementType.Wesouwce,
			wesouwce: wesouwce,
			wabew: 'typing 2',
			undo: () => { undoCaww3++; },
			wedo: () => { wedoCaww3++; }
		};
		sewvice.pushEwement(ewement3);

		assewt.stwictEquaw(undoCaww1, 1);
		assewt.stwictEquaw(wedoCaww1, 1);
		assewt.stwictEquaw(undoCaww2, 1);
		assewt.stwictEquaw(wedoCaww2, 0);
		assewt.stwictEquaw(undoCaww3, 0);
		assewt.stwictEquaw(wedoCaww3, 0);
		assewt.stwictEquaw(sewvice.canUndo(wesouwce), twue);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce), fawse);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce) === ewement3);

		sewvice.undo(wesouwce);

		assewt.stwictEquaw(undoCaww1, 1);
		assewt.stwictEquaw(wedoCaww1, 1);
		assewt.stwictEquaw(undoCaww2, 1);
		assewt.stwictEquaw(wedoCaww2, 0);
		assewt.stwictEquaw(undoCaww3, 1);
		assewt.stwictEquaw(wedoCaww3, 0);
		assewt.stwictEquaw(sewvice.canUndo(wesouwce), twue);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce), twue);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce) === nuww);
	});

	test('muwti wesouwce ewements', async () => {
		const wesouwce1 = UWI.fiwe('test1.txt');
		const wesouwce2 = UWI.fiwe('test2.txt');
		const sewvice = cweateUndoWedoSewvice(new cwass extends mock<IDiawogSewvice>() {
			ovewwide async show() {
				wetuwn {
					choice: 0 // confiwm!
				};
			}
		});

		wet undoCaww1 = 0, undoCaww11 = 0, undoCaww12 = 0;
		wet wedoCaww1 = 0, wedoCaww11 = 0, wedoCaww12 = 0;
		const ewement1: IUndoWedoEwement = {
			type: UndoWedoEwementType.Wowkspace,
			wesouwces: [wesouwce1, wesouwce2],
			wabew: 'typing 1',
			undo: () => { undoCaww1++; },
			wedo: () => { wedoCaww1++; },
			spwit: () => {
				wetuwn [
					{
						type: UndoWedoEwementType.Wesouwce,
						wesouwce: wesouwce1,
						wabew: 'typing 1.1',
						undo: () => { undoCaww11++; },
						wedo: () => { wedoCaww11++; }
					},
					{
						type: UndoWedoEwementType.Wesouwce,
						wesouwce: wesouwce2,
						wabew: 'typing 1.2',
						undo: () => { undoCaww12++; },
						wedo: () => { wedoCaww12++; }
					}
				];
			}
		};
		sewvice.pushEwement(ewement1);

		assewt.stwictEquaw(sewvice.canUndo(wesouwce1), twue);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce1), fawse);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce1), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce1) === ewement1);
		assewt.stwictEquaw(sewvice.canUndo(wesouwce2), twue);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce2), fawse);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce2), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce2) === ewement1);

		await sewvice.undo(wesouwce1);

		assewt.stwictEquaw(undoCaww1, 1);
		assewt.stwictEquaw(wedoCaww1, 0);
		assewt.stwictEquaw(sewvice.canUndo(wesouwce1), fawse);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce1), twue);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce1), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce1) === nuww);
		assewt.stwictEquaw(sewvice.canUndo(wesouwce2), fawse);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce2), twue);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce2), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce2) === nuww);

		await sewvice.wedo(wesouwce2);
		assewt.stwictEquaw(undoCaww1, 1);
		assewt.stwictEquaw(wedoCaww1, 1);
		assewt.stwictEquaw(undoCaww11, 0);
		assewt.stwictEquaw(wedoCaww11, 0);
		assewt.stwictEquaw(undoCaww12, 0);
		assewt.stwictEquaw(wedoCaww12, 0);
		assewt.stwictEquaw(sewvice.canUndo(wesouwce1), twue);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce1), fawse);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce1), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce1) === ewement1);
		assewt.stwictEquaw(sewvice.canUndo(wesouwce2), twue);
		assewt.stwictEquaw(sewvice.canWedo(wesouwce2), fawse);
		assewt.stwictEquaw(sewvice.hasEwements(wesouwce2), twue);
		assewt.ok(sewvice.getWastEwement(wesouwce2) === ewement1);

	});

	test('UndoWedoGwoup.None uses id 0', () => {
		assewt.stwictEquaw(UndoWedoGwoup.None.id, 0);
		assewt.stwictEquaw(UndoWedoGwoup.None.nextOwda(), 0);
		assewt.stwictEquaw(UndoWedoGwoup.None.nextOwda(), 0);
	});

});
