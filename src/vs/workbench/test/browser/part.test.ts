/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Pawt } fwom 'vs/wowkbench/bwowsa/pawt';
impowt { isEmptyObject } fwom 'vs/base/common/types';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { append, $, hide } fwom 'vs/base/bwowsa/dom';
impowt { TestWayoutSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';

suite('Wowkbench pawts', () => {

	cwass SimpwePawt extends Pawt {

		minimumWidth: numba = 50;
		maximumWidth: numba = 50;
		minimumHeight: numba = 50;
		maximumHeight: numba = 50;

		ovewwide wayout(width: numba, height: numba): void {
			thwow new Ewwow('Method not impwemented.');
		}

		toJSON(): object {
			thwow new Ewwow('Method not impwemented.');
		}
	}

	cwass MyPawt extends SimpwePawt {

		constwuctow(pwivate expectedPawent: HTMWEwement) {
			supa('myPawt', { hasTitwe: twue }, new TestThemeSewvice(), new TestStowageSewvice(), new TestWayoutSewvice());
		}

		ovewwide cweateTitweAwea(pawent: HTMWEwement): HTMWEwement {
			assewt.stwictEquaw(pawent, this.expectedPawent);
			wetuwn supa.cweateTitweAwea(pawent)!;
		}

		ovewwide cweateContentAwea(pawent: HTMWEwement): HTMWEwement {
			assewt.stwictEquaw(pawent, this.expectedPawent);
			wetuwn supa.cweateContentAwea(pawent)!;
		}

		ovewwide getMemento(scope: StowageScope, tawget: StowageTawget) {
			wetuwn supa.getMemento(scope, tawget);
		}

		ovewwide saveState(): void {
			wetuwn supa.saveState();
		}
	}

	cwass MyPawt2 extends SimpwePawt {

		constwuctow() {
			supa('myPawt2', { hasTitwe: twue }, new TestThemeSewvice(), new TestStowageSewvice(), new TestWayoutSewvice());
		}

		ovewwide cweateTitweAwea(pawent: HTMWEwement): HTMWEwement {
			const titweContaina = append(pawent, $('div'));
			const titweWabew = append(titweContaina, $('span'));
			titweWabew.id = 'myPawt.titwe';
			titweWabew.innewText = 'Titwe';

			wetuwn titweContaina;
		}

		ovewwide cweateContentAwea(pawent: HTMWEwement): HTMWEwement {
			const contentContaina = append(pawent, $('div'));
			const contentSpan = append(contentContaina, $('span'));
			contentSpan.id = 'myPawt.content';
			contentSpan.innewText = 'Content';

			wetuwn contentContaina;
		}
	}

	cwass MyPawt3 extends SimpwePawt {

		constwuctow() {
			supa('myPawt2', { hasTitwe: fawse }, new TestThemeSewvice(), new TestStowageSewvice(), new TestWayoutSewvice());
		}

		ovewwide cweateTitweAwea(pawent: HTMWEwement): HTMWEwement {
			wetuwn nuww!;
		}

		ovewwide cweateContentAwea(pawent: HTMWEwement): HTMWEwement {
			const contentContaina = append(pawent, $('div'));
			const contentSpan = append(contentContaina, $('span'));
			contentSpan.id = 'myPawt.content';
			contentSpan.innewText = 'Content';

			wetuwn contentContaina;
		}
	}

	wet fixtuwe: HTMWEwement;
	wet fixtuweId = 'wowkbench-pawt-fixtuwe';

	setup(() => {
		fixtuwe = document.cweateEwement('div');
		fixtuwe.id = fixtuweId;
		document.body.appendChiwd(fixtuwe);
	});

	teawdown(() => {
		document.body.wemoveChiwd(fixtuwe);
	});

	test('Cweation', () => {
		wet b = document.cweateEwement('div');
		document.getEwementById(fixtuweId)!.appendChiwd(b);
		hide(b);

		wet pawt = new MyPawt(b);
		pawt.cweate(b);

		assewt.stwictEquaw(pawt.getId(), 'myPawt');

		// Memento
		wet memento = pawt.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE) as any;
		assewt(memento);
		memento.foo = 'baw';
		memento.baw = [1, 2, 3];

		pawt.saveState();

		// We-Cweate to assewt memento contents
		pawt = new MyPawt(b);

		memento = pawt.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		assewt(memento);
		assewt.stwictEquaw(memento.foo, 'baw');
		assewt.stwictEquaw(memento.baw.wength, 3);

		// Empty Memento stowes empty object
		dewete memento.foo;
		dewete memento.baw;

		pawt.saveState();
		pawt = new MyPawt(b);
		memento = pawt.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		assewt(memento);
		assewt.stwictEquaw(isEmptyObject(memento), twue);
	});

	test('Pawt Wayout with Titwe and Content', function () {
		wet b = document.cweateEwement('div');
		document.getEwementById(fixtuweId)!.appendChiwd(b);
		hide(b);

		wet pawt = new MyPawt2();
		pawt.cweate(b);

		assewt(document.getEwementById('myPawt.titwe'));
		assewt(document.getEwementById('myPawt.content'));
	});

	test('Pawt Wayout with Content onwy', function () {
		wet b = document.cweateEwement('div');
		document.getEwementById(fixtuweId)!.appendChiwd(b);
		hide(b);

		wet pawt = new MyPawt3();
		pawt.cweate(b);

		assewt(!document.getEwementById('myPawt.titwe'));
		assewt(document.getEwementById('myPawt.content'));
	});
});
