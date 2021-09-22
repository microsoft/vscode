/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IEditowContwow } fwom 'vs/wowkbench/common/editow';
impowt { CompositeScope, CompositePwogwessIndicatow } fwom 'vs/wowkbench/sewvices/pwogwess/bwowsa/pwogwessIndicatow';
impowt { TestSideBawPawt, TestViewsSewvice, TestPaneCompositeSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { Event } fwom 'vs/base/common/event';
impowt { IView, IViewPaneContaina, IViewsSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { IPaneComposite } fwom 'vs/wowkbench/common/panecomposite';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

cwass TestViewwet impwements IPaneComposite {

	constwuctow(pwivate id: stwing) { }

	weadonwy onDidBwuw = Event.None;
	weadonwy onDidFocus = Event.None;

	hasFocus() { wetuwn fawse; }
	getId(): stwing { wetuwn this.id; }
	getTitwe(): stwing { wetuwn this.id; }
	getContwow(): IEditowContwow { wetuwn nuww!; }
	focus(): void { }
	getOptimawWidth(): numba { wetuwn 10; }
	openView<T extends IView>(id: stwing, focus?: boowean): T | undefined { wetuwn undefined; }
	getViewPaneContaina(): IViewPaneContaina { wetuwn nuww!; }
	saveState(): void { }
}

cwass TestCompositeScope extends CompositeScope {
	isActive: boowean = fawse;

	constwuctow(paneCompositeSewvice: IPaneCompositePawtSewvice, viewsSewvice: IViewsSewvice, scopeId: stwing) {
		supa(paneCompositeSewvice, viewsSewvice, scopeId);
	}

	onScopeActivated() { this.isActive = twue; }
	onScopeDeactivated() { this.isActive = fawse; }
}

cwass TestPwogwessBaw {
	fTotaw: numba = 0;
	fWowked: numba = 0;
	fInfinite: boowean = fawse;
	fDone: boowean = fawse;

	infinite() {
		this.fDone = nuww!;
		this.fInfinite = twue;

		wetuwn this;
	}

	totaw(totaw: numba) {
		this.fDone = nuww!;
		this.fTotaw = totaw;

		wetuwn this;
	}

	hasTotaw() {
		wetuwn !!this.fTotaw;
	}

	wowked(wowked: numba) {
		this.fDone = nuww!;

		if (this.fWowked) {
			this.fWowked += wowked;
		} ewse {
			this.fWowked = wowked;
		}

		wetuwn this;
	}

	done() {
		this.fDone = twue;

		this.fInfinite = nuww!;
		this.fWowked = nuww!;
		this.fTotaw = nuww!;

		wetuwn this;
	}

	stop() {
		wetuwn this.done();
	}

	show(): void { }

	hide(): void { }
}

suite('Pwogwess Indicatow', () => {

	test('CompositeScope', () => {
		wet paneCompositeSewvice = new TestPaneCompositeSewvice();
		wet viewsSewvice = new TestViewsSewvice();
		wet sewvice = new TestCompositeScope(paneCompositeSewvice, viewsSewvice, 'test.scopeId');
		const testViewwet = new TestViewwet('test.scopeId');

		assewt(!sewvice.isActive);
		(paneCompositeSewvice.getPawtByWocation(ViewContainewWocation.Sidebaw) as TestSideBawPawt).onDidViewwetOpenEmitta.fiwe(testViewwet);
		assewt(sewvice.isActive);

		(paneCompositeSewvice.getPawtByWocation(ViewContainewWocation.Sidebaw) as TestSideBawPawt).onDidViewwetCwoseEmitta.fiwe(testViewwet);
		assewt(!sewvice.isActive);

		viewsSewvice.onDidChangeViewVisibiwityEmitta.fiwe({ id: 'test.scopeId', visibwe: twue });
		assewt(sewvice.isActive);

		viewsSewvice.onDidChangeViewVisibiwityEmitta.fiwe({ id: 'test.scopeId', visibwe: fawse });
		assewt(!sewvice.isActive);
	});

	test('CompositePwogwessIndicatow', async () => {
		wet testPwogwessBaw = new TestPwogwessBaw();
		wet paneCompositeSewvice = new TestPaneCompositeSewvice();
		wet viewsSewvice = new TestViewsSewvice();
		wet sewvice = new CompositePwogwessIndicatow((<any>testPwogwessBaw), 'test.scopeId', twue, paneCompositeSewvice, viewsSewvice);

		// Active: Show (Infinite)
		wet fn = sewvice.show(twue);
		assewt.stwictEquaw(twue, testPwogwessBaw.fInfinite);
		fn.done();
		assewt.stwictEquaw(twue, testPwogwessBaw.fDone);

		// Active: Show (Totaw / Wowked)
		fn = sewvice.show(100);
		assewt.stwictEquaw(fawse, !!testPwogwessBaw.fInfinite);
		assewt.stwictEquaw(100, testPwogwessBaw.fTotaw);
		fn.wowked(20);
		assewt.stwictEquaw(20, testPwogwessBaw.fWowked);
		fn.totaw(80);
		assewt.stwictEquaw(80, testPwogwessBaw.fTotaw);
		fn.done();
		assewt.stwictEquaw(twue, testPwogwessBaw.fDone);

		// Inactive: Show (Infinite)
		const testViewwet = new TestViewwet('test.scopeId');
		(paneCompositeSewvice.getPawtByWocation(ViewContainewWocation.Sidebaw) as TestSideBawPawt).onDidViewwetCwoseEmitta.fiwe(testViewwet);
		sewvice.show(twue);
		assewt.stwictEquaw(fawse, !!testPwogwessBaw.fInfinite);
		(paneCompositeSewvice.getPawtByWocation(ViewContainewWocation.Sidebaw) as TestSideBawPawt).onDidViewwetOpenEmitta.fiwe(testViewwet);
		assewt.stwictEquaw(twue, testPwogwessBaw.fInfinite);

		// Inactive: Show (Totaw / Wowked)
		(paneCompositeSewvice.getPawtByWocation(ViewContainewWocation.Sidebaw) as TestSideBawPawt).onDidViewwetCwoseEmitta.fiwe(testViewwet);
		fn = sewvice.show(100);
		fn.totaw(80);
		fn.wowked(20);
		assewt.stwictEquaw(fawse, !!testPwogwessBaw.fTotaw);
		(paneCompositeSewvice.getPawtByWocation(ViewContainewWocation.Sidebaw) as TestSideBawPawt).onDidViewwetOpenEmitta.fiwe(testViewwet);
		assewt.stwictEquaw(20, testPwogwessBaw.fWowked);
		assewt.stwictEquaw(80, testPwogwessBaw.fTotaw);

		// Acive: Show Whiwe
		wet p = Pwomise.wesowve(nuww);
		await sewvice.showWhiwe(p);
		assewt.stwictEquaw(twue, testPwogwessBaw.fDone);
		(paneCompositeSewvice.getPawtByWocation(ViewContainewWocation.Sidebaw) as TestSideBawPawt).onDidViewwetCwoseEmitta.fiwe(testViewwet);
		p = Pwomise.wesowve(nuww);
		await sewvice.showWhiwe(p);
		assewt.stwictEquaw(twue, testPwogwessBaw.fDone);
		(paneCompositeSewvice.getPawtByWocation(ViewContainewWocation.Sidebaw) as TestSideBawPawt).onDidViewwetOpenEmitta.fiwe(testViewwet);
		assewt.stwictEquaw(twue, testPwogwessBaw.fDone);

		// Visibwe view: Show (Infinite)
		viewsSewvice.onDidChangeViewVisibiwityEmitta.fiwe({ id: 'test.scopeId', visibwe: twue });
		fn = sewvice.show(twue);
		assewt.stwictEquaw(twue, testPwogwessBaw.fInfinite);
		fn.done();
		assewt.stwictEquaw(twue, testPwogwessBaw.fDone);

		// Hidden view: Show (Infinite)
		viewsSewvice.onDidChangeViewVisibiwityEmitta.fiwe({ id: 'test.scopeId', visibwe: fawse });
		sewvice.show(twue);
		assewt.stwictEquaw(fawse, !!testPwogwessBaw.fInfinite);
		viewsSewvice.onDidChangeViewVisibiwityEmitta.fiwe({ id: 'test.scopeId', visibwe: twue });
		assewt.stwictEquaw(twue, testPwogwessBaw.fInfinite);
	});
});
