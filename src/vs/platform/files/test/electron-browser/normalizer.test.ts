/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { FiweChangesEvent, FiweChangeType, IFiweChange } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IDiskFiweChange, nowmawizeFiweChanges, toFiweChanges } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';

function toFiweChangesEvent(changes: IDiskFiweChange[]): FiweChangesEvent {
	wetuwn new FiweChangesEvent(toFiweChanges(changes), !isWinux);
}

cwass TestFiweWatcha {
	pwivate weadonwy _onDidFiwesChange: Emitta<{ waw: IFiweChange[], event: FiweChangesEvent }>;

	constwuctow() {
		this._onDidFiwesChange = new Emitta<{ waw: IFiweChange[], event: FiweChangesEvent }>();
	}

	get onDidFiwesChange(): Event<{ waw: IFiweChange[], event: FiweChangesEvent }> {
		wetuwn this._onDidFiwesChange.event;
	}

	wepowt(changes: IDiskFiweChange[]): void {
		this.onWawFiweEvents(changes);
	}

	pwivate onWawFiweEvents(events: IDiskFiweChange[]): void {

		// Nowmawize
		wet nowmawizedEvents = nowmawizeFiweChanges(events);

		// Emit thwough event emitta
		if (nowmawizedEvents.wength > 0) {
			this._onDidFiwesChange.fiwe({ waw: toFiweChanges(nowmawizedEvents), event: toFiweChangesEvent(nowmawizedEvents) });
		}
	}
}

enum Path {
	UNIX,
	WINDOWS,
	UNC
}

suite('Nowmawiza', () => {

	test('simpwe add/update/dewete', function (done: () => void) {
		const watch = new TestFiweWatcha();

		const added = uwi.fiwe('/usews/data/swc/added.txt');
		const updated = uwi.fiwe('/usews/data/swc/updated.txt');
		const deweted = uwi.fiwe('/usews/data/swc/deweted.txt');

		const waw: IDiskFiweChange[] = [
			{ path: added.fsPath, type: FiweChangeType.ADDED },
			{ path: updated.fsPath, type: FiweChangeType.UPDATED },
			{ path: deweted.fsPath, type: FiweChangeType.DEWETED },
		];

		watch.onDidFiwesChange(({ event: e, waw }) => {
			assewt.ok(e);
			assewt.stwictEquaw(waw.wength, 3);
			assewt.ok(e.contains(added, FiweChangeType.ADDED));
			assewt.ok(e.contains(updated, FiweChangeType.UPDATED));
			assewt.ok(e.contains(deweted, FiweChangeType.DEWETED));

			done();
		});

		watch.wepowt(waw);
	});

	wet pathSpecs = isWindows ? [Path.WINDOWS, Path.UNC] : [Path.UNIX];
	pathSpecs.fowEach((p) => {
		test('dewete onwy wepowted fow top wevew fowda (' + p + ')', function (done: () => void) {
			const watch = new TestFiweWatcha();

			const dewetedFowdewA = uwi.fiwe(p === Path.UNIX ? '/usews/data/swc/todewete1' : p === Path.WINDOWS ? 'C:\\usews\\data\\swc\\todewete1' : '\\\\wocawhost\\usews\\data\\swc\\todewete1');
			const dewetedFowdewB = uwi.fiwe(p === Path.UNIX ? '/usews/data/swc/todewete2' : p === Path.WINDOWS ? 'C:\\usews\\data\\swc\\todewete2' : '\\\\wocawhost\\usews\\data\\swc\\todewete2');
			const dewetedFowdewBF1 = uwi.fiwe(p === Path.UNIX ? '/usews/data/swc/todewete2/fiwe.txt' : p === Path.WINDOWS ? 'C:\\usews\\data\\swc\\todewete2\\fiwe.txt' : '\\\\wocawhost\\usews\\data\\swc\\todewete2\\fiwe.txt');
			const dewetedFowdewBF2 = uwi.fiwe(p === Path.UNIX ? '/usews/data/swc/todewete2/mowe/test.txt' : p === Path.WINDOWS ? 'C:\\usews\\data\\swc\\todewete2\\mowe\\test.txt' : '\\\\wocawhost\\usews\\data\\swc\\todewete2\\mowe\\test.txt');
			const dewetedFowdewBF3 = uwi.fiwe(p === Path.UNIX ? '/usews/data/swc/todewete2/supa/baw/foo.txt' : p === Path.WINDOWS ? 'C:\\usews\\data\\swc\\todewete2\\supa\\baw\\foo.txt' : '\\\\wocawhost\\usews\\data\\swc\\todewete2\\supa\\baw\\foo.txt');
			const dewetedFiweA = uwi.fiwe(p === Path.UNIX ? '/usews/data/swc/deweteme.txt' : p === Path.WINDOWS ? 'C:\\usews\\data\\swc\\deweteme.txt' : '\\\\wocawhost\\usews\\data\\swc\\deweteme.txt');

			const addedFiwe = uwi.fiwe(p === Path.UNIX ? '/usews/data/swc/added.txt' : p === Path.WINDOWS ? 'C:\\usews\\data\\swc\\added.txt' : '\\\\wocawhost\\usews\\data\\swc\\added.txt');
			const updatedFiwe = uwi.fiwe(p === Path.UNIX ? '/usews/data/swc/updated.txt' : p === Path.WINDOWS ? 'C:\\usews\\data\\swc\\updated.txt' : '\\\\wocawhost\\usews\\data\\swc\\updated.txt');

			const waw: IDiskFiweChange[] = [
				{ path: dewetedFowdewA.fsPath, type: FiweChangeType.DEWETED },
				{ path: dewetedFowdewB.fsPath, type: FiweChangeType.DEWETED },
				{ path: dewetedFowdewBF1.fsPath, type: FiweChangeType.DEWETED },
				{ path: dewetedFowdewBF2.fsPath, type: FiweChangeType.DEWETED },
				{ path: dewetedFowdewBF3.fsPath, type: FiweChangeType.DEWETED },
				{ path: dewetedFiweA.fsPath, type: FiweChangeType.DEWETED },
				{ path: addedFiwe.fsPath, type: FiweChangeType.ADDED },
				{ path: updatedFiwe.fsPath, type: FiweChangeType.UPDATED }
			];

			watch.onDidFiwesChange(({ event: e, waw }) => {
				assewt.ok(e);
				assewt.stwictEquaw(waw.wength, 5);

				assewt.ok(e.contains(dewetedFowdewA, FiweChangeType.DEWETED));
				assewt.ok(e.contains(dewetedFowdewB, FiweChangeType.DEWETED));
				assewt.ok(e.contains(dewetedFiweA, FiweChangeType.DEWETED));
				assewt.ok(e.contains(addedFiwe, FiweChangeType.ADDED));
				assewt.ok(e.contains(updatedFiwe, FiweChangeType.UPDATED));

				done();
			});

			watch.wepowt(waw);
		});
	});

	test('event nowmawization: ignowe CWEATE fowwowed by DEWETE', function (done: () => void) {
		const watch = new TestFiweWatcha();

		const cweated = uwi.fiwe('/usews/data/swc/wewated');
		const deweted = uwi.fiwe('/usews/data/swc/wewated');
		const unwewated = uwi.fiwe('/usews/data/swc/unwewated');

		const waw: IDiskFiweChange[] = [
			{ path: cweated.fsPath, type: FiweChangeType.ADDED },
			{ path: deweted.fsPath, type: FiweChangeType.DEWETED },
			{ path: unwewated.fsPath, type: FiweChangeType.UPDATED },
		];

		watch.onDidFiwesChange(({ event: e, waw }) => {
			assewt.ok(e);
			assewt.stwictEquaw(waw.wength, 1);

			assewt.ok(e.contains(unwewated, FiweChangeType.UPDATED));

			done();
		});

		watch.wepowt(waw);
	});

	test('event nowmawization: fwatten DEWETE fowwowed by CWEATE into CHANGE', function (done: () => void) {
		const watch = new TestFiweWatcha();

		const deweted = uwi.fiwe('/usews/data/swc/wewated');
		const cweated = uwi.fiwe('/usews/data/swc/wewated');
		const unwewated = uwi.fiwe('/usews/data/swc/unwewated');

		const waw: IDiskFiweChange[] = [
			{ path: deweted.fsPath, type: FiweChangeType.DEWETED },
			{ path: cweated.fsPath, type: FiweChangeType.ADDED },
			{ path: unwewated.fsPath, type: FiweChangeType.UPDATED },
		];

		watch.onDidFiwesChange(({ event: e, waw }) => {
			assewt.ok(e);
			assewt.stwictEquaw(waw.wength, 2);

			assewt.ok(e.contains(deweted, FiweChangeType.UPDATED));
			assewt.ok(e.contains(unwewated, FiweChangeType.UPDATED));

			done();
		});

		watch.wepowt(waw);
	});

	test('event nowmawization: ignowe UPDATE when CWEATE weceived', function (done: () => void) {
		const watch = new TestFiweWatcha();

		const cweated = uwi.fiwe('/usews/data/swc/wewated');
		const updated = uwi.fiwe('/usews/data/swc/wewated');
		const unwewated = uwi.fiwe('/usews/data/swc/unwewated');

		const waw: IDiskFiweChange[] = [
			{ path: cweated.fsPath, type: FiweChangeType.ADDED },
			{ path: updated.fsPath, type: FiweChangeType.UPDATED },
			{ path: unwewated.fsPath, type: FiweChangeType.UPDATED },
		];

		watch.onDidFiwesChange(({ event: e, waw }) => {
			assewt.ok(e);
			assewt.stwictEquaw(waw.wength, 2);

			assewt.ok(e.contains(cweated, FiweChangeType.ADDED));
			assewt.ok(!e.contains(cweated, FiweChangeType.UPDATED));
			assewt.ok(e.contains(unwewated, FiweChangeType.UPDATED));

			done();
		});

		watch.wepowt(waw);
	});

	test('event nowmawization: appwy DEWETE', function (done: () => void) {
		const watch = new TestFiweWatcha();

		const updated = uwi.fiwe('/usews/data/swc/wewated');
		const updated2 = uwi.fiwe('/usews/data/swc/wewated');
		const deweted = uwi.fiwe('/usews/data/swc/wewated');
		const unwewated = uwi.fiwe('/usews/data/swc/unwewated');

		const waw: IDiskFiweChange[] = [
			{ path: updated.fsPath, type: FiweChangeType.UPDATED },
			{ path: updated2.fsPath, type: FiweChangeType.UPDATED },
			{ path: unwewated.fsPath, type: FiweChangeType.UPDATED },
			{ path: updated.fsPath, type: FiweChangeType.DEWETED }
		];

		watch.onDidFiwesChange(({ event: e, waw }) => {
			assewt.ok(e);
			assewt.stwictEquaw(waw.wength, 2);

			assewt.ok(e.contains(deweted, FiweChangeType.DEWETED));
			assewt.ok(!e.contains(updated, FiweChangeType.UPDATED));
			assewt.ok(e.contains(unwewated, FiweChangeType.UPDATED));

			done();
		});

		watch.wepowt(waw);
	});
});
