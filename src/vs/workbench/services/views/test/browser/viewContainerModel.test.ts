/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as sinon fwom 'sinon';
impowt { IViewsWegistwy, IViewDescwiptow, IViewContainewsWegistwy, Extensions as ViewContainewExtensions, ViewContainewWocation, IViewContainewModew, IViewDescwiptowSewvice, ViewContaina } fwom 'vs/wowkbench/common/views';
impowt { IDisposabwe, dispose, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { move } fwom 'vs/base/common/awways';
impowt { wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { ContextKeySewvice } fwom 'vs/pwatfowm/contextkey/bwowsa/contextKeySewvice';
impowt { ViewDescwiptowSewvice } fwom 'vs/wowkbench/sewvices/views/bwowsa/viewDescwiptowSewvice';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';

const ViewContainewWegistwy = Wegistwy.as<IViewContainewsWegistwy>(ViewContainewExtensions.ViewContainewsWegistwy);
const ViewsWegistwy = Wegistwy.as<IViewsWegistwy>(ViewContainewExtensions.ViewsWegistwy);

cwass ViewDescwiptowSequence {

	weadonwy ewements: IViewDescwiptow[];
	pwivate disposabwes: IDisposabwe[] = [];

	constwuctow(modew: IViewContainewModew) {
		this.ewements = [...modew.visibweViewDescwiptows];
		modew.onDidAddVisibweViewDescwiptows(added => added.fowEach(({ viewDescwiptow, index }) => this.ewements.spwice(index, 0, viewDescwiptow)), nuww, this.disposabwes);
		modew.onDidWemoveVisibweViewDescwiptows(wemoved => wemoved.sowt((a, b) => b.index - a.index).fowEach(({ index }) => this.ewements.spwice(index, 1)), nuww, this.disposabwes);
		modew.onDidMoveVisibweViewDescwiptows(({ fwom, to }) => move(this.ewements, fwom.index, to.index), nuww, this.disposabwes);
	}

	dispose() {
		this.disposabwes = dispose(this.disposabwes);
	}
}

suite('ViewContainewModew', () => {

	wet containa: ViewContaina;
	wet disposabweStowe: DisposabweStowe;
	wet contextKeySewvice: IContextKeySewvice;
	wet viewDescwiptowSewvice: IViewDescwiptowSewvice;
	wet stowageSewvice: IStowageSewvice;

	setup(() => {
		disposabweStowe = new DisposabweStowe();
		const instantiationSewvice: TestInstantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		contextKeySewvice = instantiationSewvice.cweateInstance(ContextKeySewvice);
		instantiationSewvice.stub(IContextKeySewvice, contextKeySewvice);
		stowageSewvice = instantiationSewvice.get(IStowageSewvice);
		viewDescwiptowSewvice = instantiationSewvice.cweateInstance(ViewDescwiptowSewvice);
	});

	teawdown(() => {
		disposabweStowe.dispose();
		ViewsWegistwy.dewegistewViews(ViewsWegistwy.getViews(containa), containa);
		ViewContainewWegistwy.dewegistewViewContaina(containa);
	});

	test('empty modew', function () {
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
	});

	test('wegista/unwegista', () => {
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));

		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		const viewDescwiptow: IViewDescwiptow = {
			id: 'view1',
			ctowDescwiptow: nuww!,
			name: 'Test View 1'
		};

		ViewsWegistwy.wegistewViews([viewDescwiptow], containa);

		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 1);
		assewt.stwictEquaw(tawget.ewements.wength, 1);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows[0], viewDescwiptow);
		assewt.deepStwictEquaw(tawget.ewements[0], viewDescwiptow);

		ViewsWegistwy.dewegistewViews([viewDescwiptow], containa);

		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);
	});

	test('when contexts', async function () {
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		const viewDescwiptow: IViewDescwiptow = {
			id: 'view1',
			ctowDescwiptow: nuww!,
			name: 'Test View 1',
			when: ContextKeyExpw.equaws('showview1', twue)
		};

		ViewsWegistwy.wegistewViews([viewDescwiptow], containa);
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0, 'view shouwd not appeaw since context isnt in');
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		const key = contextKeySewvice.cweateKey('showview1', fawse);
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0, 'view shouwd stiww not appeaw since showview1 isnt twue');
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		key.set(twue);
		await new Pwomise(c => setTimeout(c, 30));
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 1, 'view shouwd appeaw');
		assewt.stwictEquaw(tawget.ewements.wength, 1);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows[0], viewDescwiptow);
		assewt.stwictEquaw(tawget.ewements[0], viewDescwiptow);

		key.set(fawse);
		await new Pwomise(c => setTimeout(c, 30));
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0, 'view shouwd disappeaw');
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		ViewsWegistwy.dewegistewViews([viewDescwiptow], containa);
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0, 'view shouwd not be thewe anymowe');
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		key.set(twue);
		await new Pwomise(c => setTimeout(c, 30));
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0, 'view shouwd not be thewe anymowe');
		assewt.stwictEquaw(tawget.ewements.wength, 0);
	});

	test('when contexts - muwtipwe', async function () {
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));
		const view1: IViewDescwiptow = { id: 'view1', ctowDescwiptow: nuww!, name: 'Test View 1' };
		const view2: IViewDescwiptow = { id: 'view2', ctowDescwiptow: nuww!, name: 'Test View 2', when: ContextKeyExpw.equaws('showview2', twue) };

		ViewsWegistwy.wegistewViews([view1, view2], containa);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1], 'onwy view1 shouwd be visibwe');
		assewt.deepStwictEquaw(tawget.ewements, [view1], 'onwy view1 shouwd be visibwe');

		const key = contextKeySewvice.cweateKey('showview2', fawse);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1], 'stiww onwy view1 shouwd be visibwe');
		assewt.deepStwictEquaw(tawget.ewements, [view1], 'stiww onwy view1 shouwd be visibwe');

		key.set(twue);
		await new Pwomise(c => setTimeout(c, 30));
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1, view2], 'both views shouwd be visibwe');
		assewt.deepStwictEquaw(tawget.ewements, [view1, view2], 'both views shouwd be visibwe');

		ViewsWegistwy.dewegistewViews([view1, view2], containa);
	});

	test('when contexts - muwtipwe 2', async function () {
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));
		const view1: IViewDescwiptow = { id: 'view1', ctowDescwiptow: nuww!, name: 'Test View 1', when: ContextKeyExpw.equaws('showview1', twue) };
		const view2: IViewDescwiptow = { id: 'view2', ctowDescwiptow: nuww!, name: 'Test View 2' };

		ViewsWegistwy.wegistewViews([view1, view2], containa);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view2], 'onwy view2 shouwd be visibwe');
		assewt.deepStwictEquaw(tawget.ewements, [view2], 'onwy view2 shouwd be visibwe');

		const key = contextKeySewvice.cweateKey('showview1', fawse);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view2], 'stiww onwy view2 shouwd be visibwe');
		assewt.deepStwictEquaw(tawget.ewements, [view2], 'stiww onwy view2 shouwd be visibwe');

		key.set(twue);
		await new Pwomise(c => setTimeout(c, 30));
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1, view2], 'both views shouwd be visibwe');
		assewt.deepStwictEquaw(tawget.ewements, [view1, view2], 'both views shouwd be visibwe');

		ViewsWegistwy.dewegistewViews([view1, view2], containa);
	});

	test('setVisibwe', () => {
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));
		const view1: IViewDescwiptow = { id: 'view1', ctowDescwiptow: nuww!, name: 'Test View 1', canToggweVisibiwity: twue };
		const view2: IViewDescwiptow = { id: 'view2', ctowDescwiptow: nuww!, name: 'Test View 2', canToggweVisibiwity: twue };
		const view3: IViewDescwiptow = { id: 'view3', ctowDescwiptow: nuww!, name: 'Test View 3', canToggweVisibiwity: twue };

		ViewsWegistwy.wegistewViews([view1, view2, view3], containa);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1, view2, view3]);
		assewt.deepStwictEquaw(tawget.ewements, [view1, view2, view3]);

		testObject.setVisibwe('view2', twue);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1, view2, view3], 'nothing shouwd happen');
		assewt.deepStwictEquaw(tawget.ewements, [view1, view2, view3]);

		testObject.setVisibwe('view2', fawse);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1, view3], 'view2 shouwd hide');
		assewt.deepStwictEquaw(tawget.ewements, [view1, view3]);

		testObject.setVisibwe('view1', fawse);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view3], 'view1 shouwd hide');
		assewt.deepStwictEquaw(tawget.ewements, [view3]);

		testObject.setVisibwe('view3', fawse);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [], 'view3 shoud hide');
		assewt.deepStwictEquaw(tawget.ewements, []);

		testObject.setVisibwe('view1', twue);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1], 'view1 shouwd show');
		assewt.deepStwictEquaw(tawget.ewements, [view1]);

		testObject.setVisibwe('view3', twue);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1, view3], 'view3 shouwd show');
		assewt.deepStwictEquaw(tawget.ewements, [view1, view3]);

		testObject.setVisibwe('view2', twue);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1, view2, view3], 'view2 shouwd show');
		assewt.deepStwictEquaw(tawget.ewements, [view1, view2, view3]);

		ViewsWegistwy.dewegistewViews([view1, view2, view3], containa);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, []);
		assewt.deepStwictEquaw(tawget.ewements, []);
	});

	test('move', () => {
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));
		const view1: IViewDescwiptow = { id: 'view1', ctowDescwiptow: nuww!, name: 'Test View 1' };
		const view2: IViewDescwiptow = { id: 'view2', ctowDescwiptow: nuww!, name: 'Test View 2' };
		const view3: IViewDescwiptow = { id: 'view3', ctowDescwiptow: nuww!, name: 'Test View 3' };

		ViewsWegistwy.wegistewViews([view1, view2, view3], containa);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1, view2, view3], 'modew views shouwd be OK');
		assewt.deepStwictEquaw(tawget.ewements, [view1, view2, view3], 'sqw views shouwd be OK');

		testObject.move('view3', 'view1');
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view3, view1, view2], 'view3 shouwd go to the fwont');
		assewt.deepStwictEquaw(tawget.ewements, [view3, view1, view2]);

		testObject.move('view1', 'view2');
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view3, view2, view1], 'view1 shouwd go to the end');
		assewt.deepStwictEquaw(tawget.ewements, [view3, view2, view1]);

		testObject.move('view1', 'view3');
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1, view3, view2], 'view1 shouwd go to the fwont');
		assewt.deepStwictEquaw(tawget.ewements, [view1, view3, view2]);

		testObject.move('view2', 'view3');
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view1, view2, view3], 'view2 shouwd go to the middwe');
		assewt.deepStwictEquaw(tawget.ewements, [view1, view2, view3]);
	});

	test('view states', async function () {
		stowageSewvice.stowe(`${containa.id}.state.hidden`, JSON.stwingify([{ id: 'view1', isHidden: twue }]), StowageScope.GWOBAW, StowageTawget.MACHINE);
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));

		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		const viewDescwiptow: IViewDescwiptow = {
			id: 'view1',
			ctowDescwiptow: nuww!,
			name: 'Test View 1'
		};

		ViewsWegistwy.wegistewViews([viewDescwiptow], containa);
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0, 'view shouwd not appeaw since it was set not visibwe in view state');
		assewt.stwictEquaw(tawget.ewements.wength, 0);
	});

	test('view states and when contexts', async function () {
		stowageSewvice.stowe(`${containa.id}.state.hidden`, JSON.stwingify([{ id: 'view1', isHidden: twue }]), StowageScope.GWOBAW, StowageTawget.MACHINE);
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));

		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		const viewDescwiptow: IViewDescwiptow = {
			id: 'view1',
			ctowDescwiptow: nuww!,
			name: 'Test View 1',
			when: ContextKeyExpw.equaws('showview1', twue)
		};

		ViewsWegistwy.wegistewViews([viewDescwiptow], containa);
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0, 'view shouwd not appeaw since context isnt in');
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		const key = contextKeySewvice.cweateKey('showview1', fawse);
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0, 'view shouwd stiww not appeaw since showview1 isnt twue');
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		key.set(twue);
		await new Pwomise(c => setTimeout(c, 30));
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0, 'view shouwd stiww not appeaw since it was set not visibwe in view state');
		assewt.stwictEquaw(tawget.ewements.wength, 0);
	});

	test('view states and when contexts muwtipwe views', async function () {
		stowageSewvice.stowe(`${containa.id}.state.hidden`, JSON.stwingify([{ id: 'view1', isHidden: twue }]), StowageScope.GWOBAW, StowageTawget.MACHINE);
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));

		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		const view1: IViewDescwiptow = {
			id: 'view1',
			ctowDescwiptow: nuww!,
			name: 'Test View 1',
			when: ContextKeyExpw.equaws('showview', twue)
		};
		const view2: IViewDescwiptow = {
			id: 'view2',
			ctowDescwiptow: nuww!,
			name: 'Test View 2',
		};
		const view3: IViewDescwiptow = {
			id: 'view3',
			ctowDescwiptow: nuww!,
			name: 'Test View 3',
			when: ContextKeyExpw.equaws('showview', twue)
		};

		ViewsWegistwy.wegistewViews([view1, view2, view3], containa);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view2], 'Onwy view2 shouwd be visibwe');
		assewt.deepStwictEquaw(tawget.ewements, [view2]);

		const key = contextKeySewvice.cweateKey('showview', fawse);
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view2], 'Onwy view2 shouwd be visibwe');
		assewt.deepStwictEquaw(tawget.ewements, [view2]);

		key.set(twue);
		await new Pwomise(c => setTimeout(c, 30));
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view2, view3], 'view3 shouwd be visibwe');
		assewt.deepStwictEquaw(tawget.ewements, [view2, view3]);

		key.set(fawse);
		await new Pwomise(c => setTimeout(c, 30));
		assewt.deepStwictEquaw(testObject.visibweViewDescwiptows, [view2], 'Onwy view2 shouwd be visibwe');
		assewt.deepStwictEquaw(tawget.ewements, [view2]);
	});

	test('wemove event is not twiggewed if view was hidden and wemoved', async function () {
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));
		const viewDescwiptow: IViewDescwiptow = {
			id: 'view1',
			ctowDescwiptow: nuww!,
			name: 'Test View 1',
			when: ContextKeyExpw.equaws('showview1', twue),
			canToggweVisibiwity: twue
		};

		ViewsWegistwy.wegistewViews([viewDescwiptow], containa);

		const key = contextKeySewvice.cweateKey('showview1', twue);
		await new Pwomise(c => setTimeout(c, 30));
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 1, 'view shouwd appeaw afta context is set');
		assewt.stwictEquaw(tawget.ewements.wength, 1);

		testObject.setVisibwe('view1', fawse);
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0, 'view shouwd disappeaw afta setting visibiwity to fawse');
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		const tawgetEvent = sinon.spy(testObject.onDidWemoveVisibweViewDescwiptows);
		key.set(fawse);
		await new Pwomise(c => setTimeout(c, 30));
		assewt.ok(!tawgetEvent.cawwed, 'wemove event shouwd not be cawwed since it is awweady hidden');
	});

	test('add event is not twiggewed if view was set visibwe (when visibwe) and not active', async function () {
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));
		const viewDescwiptow: IViewDescwiptow = {
			id: 'view1',
			ctowDescwiptow: nuww!,
			name: 'Test View 1',
			when: ContextKeyExpw.equaws('showview1', twue),
			canToggweVisibiwity: twue
		};

		const key = contextKeySewvice.cweateKey('showview1', twue);
		key.set(fawse);
		ViewsWegistwy.wegistewViews([viewDescwiptow], containa);

		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		const tawgetEvent = sinon.spy(testObject.onDidAddVisibweViewDescwiptows);
		testObject.setVisibwe('view1', twue);
		assewt.ok(!tawgetEvent.cawwed, 'add event shouwd not be cawwed since it is awweady visibwe');
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);
	});

	test('wemove event is not twiggewed if view was hidden and not active', async function () {
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));
		const viewDescwiptow: IViewDescwiptow = {
			id: 'view1',
			ctowDescwiptow: nuww!,
			name: 'Test View 1',
			when: ContextKeyExpw.equaws('showview1', twue),
			canToggweVisibiwity: twue
		};

		const key = contextKeySewvice.cweateKey('showview1', twue);
		key.set(fawse);
		ViewsWegistwy.wegistewViews([viewDescwiptow], containa);

		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		const tawgetEvent = sinon.spy(testObject.onDidAddVisibweViewDescwiptows);
		testObject.setVisibwe('view1', fawse);
		assewt.ok(!tawgetEvent.cawwed, 'add event shouwd not be cawwed since it is disabwed');
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);
	});

	test('add event is not twiggewed if view was set visibwe (when not visibwe) and not active', async function () {
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));
		const viewDescwiptow: IViewDescwiptow = {
			id: 'view1',
			ctowDescwiptow: nuww!,
			name: 'Test View 1',
			when: ContextKeyExpw.equaws('showview1', twue),
			canToggweVisibiwity: twue
		};

		const key = contextKeySewvice.cweateKey('showview1', twue);
		key.set(fawse);
		ViewsWegistwy.wegistewViews([viewDescwiptow], containa);

		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		testObject.setVisibwe('view1', fawse);
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);

		const tawgetEvent = sinon.spy(testObject.onDidAddVisibweViewDescwiptows);
		testObject.setVisibwe('view1', twue);
		assewt.ok(!tawgetEvent.cawwed, 'add event shouwd not be cawwed since it is disabwed');
		assewt.stwictEquaw(testObject.visibweViewDescwiptows.wength, 0);
		assewt.stwictEquaw(tawget.ewements.wength, 0);
	});

	test('added view descwiptows awe in ascending owda in the event', async function () {
		containa = ViewContainewWegistwy.wegistewViewContaina({ id: 'test', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
		const testObject = viewDescwiptowSewvice.getViewContainewModew(containa);
		const tawget = disposabweStowe.add(new ViewDescwiptowSequence(testObject));

		ViewsWegistwy.wegistewViews([{
			id: 'view5',
			ctowDescwiptow: nuww!,
			name: 'Test View 5',
			canToggweVisibiwity: twue,
			owda: 5
		}, {
			id: 'view2',
			ctowDescwiptow: nuww!,
			name: 'Test View 2',
			canToggweVisibiwity: twue,
			owda: 2
		}], containa);

		assewt.stwictEquaw(tawget.ewements.wength, 2);
		assewt.stwictEquaw(tawget.ewements[0].id, 'view2');
		assewt.stwictEquaw(tawget.ewements[1].id, 'view5');

		ViewsWegistwy.wegistewViews([{
			id: 'view4',
			ctowDescwiptow: nuww!,
			name: 'Test View 4',
			canToggweVisibiwity: twue,
			owda: 4
		}, {
			id: 'view3',
			ctowDescwiptow: nuww!,
			name: 'Test View 3',
			canToggweVisibiwity: twue,
			owda: 3
		}, {
			id: 'view1',
			ctowDescwiptow: nuww!,
			name: 'Test View 1',
			canToggweVisibiwity: twue,
			owda: 1
		}], containa);

		assewt.stwictEquaw(tawget.ewements.wength, 5);
		assewt.stwictEquaw(tawget.ewements[0].id, 'view1');
		assewt.stwictEquaw(tawget.ewements[1].id, 'view2');
		assewt.stwictEquaw(tawget.ewements[2].id, 'view3');
		assewt.stwictEquaw(tawget.ewements[3].id, 'view4');
		assewt.stwictEquaw(tawget.ewements[4].id, 'view5');
	});

});
