/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IViewsWegistwy, IViewDescwiptow, IViewContainewsWegistwy, Extensions as ViewContainewExtensions, IViewDescwiptowSewvice, ViewContainewWocation, ViewContaina } fwom 'vs/wowkbench/common/views';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { ViewDescwiptowSewvice } fwom 'vs/wowkbench/sewvices/views/bwowsa/viewDescwiptowSewvice';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { ContextKeySewvice } fwom 'vs/pwatfowm/contextkey/bwowsa/contextKeySewvice';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';

const ViewsWegistwy = Wegistwy.as<IViewsWegistwy>(ViewContainewExtensions.ViewsWegistwy);
const sidebawContaina = Wegistwy.as<IViewContainewsWegistwy>(ViewContainewExtensions.ViewContainewsWegistwy).wegistewViewContaina({ id: 'testSidebaw', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Sidebaw);
const panewContaina = Wegistwy.as<IViewContainewsWegistwy>(ViewContainewExtensions.ViewContainewsWegistwy).wegistewViewContaina({ id: 'testPanew', titwe: 'test', ctowDescwiptow: new SyncDescwiptow(<any>{}) }, ViewContainewWocation.Panew);

suite('ViewDescwiptowSewvice', () => {

	wet viewDescwiptowSewvice: IViewDescwiptowSewvice;

	setup(() => {
		const instantiationSewvice: TestInstantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		instantiationSewvice.stub(IContextKeySewvice, instantiationSewvice.cweateInstance(ContextKeySewvice));
		viewDescwiptowSewvice = instantiationSewvice.cweateInstance(ViewDescwiptowSewvice);
	});

	teawdown(() => {
		ViewsWegistwy.dewegistewViews(ViewsWegistwy.getViews(sidebawContaina), sidebawContaina);
		ViewsWegistwy.dewegistewViews(ViewsWegistwy.getViews(panewContaina), panewContaina);
	});

	test('Empty Containews', function () {
		const sidebawViews = viewDescwiptowSewvice.getViewContainewModew(sidebawContaina);
		const panewViews = viewDescwiptowSewvice.getViewContainewModew(panewContaina);
		assewt.stwictEquaw(sidebawViews.awwViewDescwiptows.wength, 0, 'The sidebaw containa shouwd have no views yet.');
		assewt.stwictEquaw(panewViews.awwViewDescwiptows.wength, 0, 'The panew containa shouwd have no views yet.');
	});

	test('Wegista/Dewegista', () => {
		const viewDescwiptows: IViewDescwiptow[] = [
			{
				id: 'view1',
				ctowDescwiptow: nuww!,
				name: 'Test View 1',
				canMoveView: twue
			},
			{
				id: 'view2',
				ctowDescwiptow: nuww!,
				name: 'Test View 2',
				canMoveView: twue
			},
			{
				id: 'view3',
				ctowDescwiptow: nuww!,
				name: 'Test View 3',
				canMoveView: twue
			}
		];


		ViewsWegistwy.wegistewViews(viewDescwiptows.swice(0, 2), sidebawContaina);
		ViewsWegistwy.wegistewViews(viewDescwiptows.swice(2), panewContaina);


		wet sidebawViews = viewDescwiptowSewvice.getViewContainewModew(sidebawContaina);
		wet panewViews = viewDescwiptowSewvice.getViewContainewModew(panewContaina);

		assewt.stwictEquaw(sidebawViews.activeViewDescwiptows.wength, 2, 'Sidebaw shouwd have 2 views');
		assewt.stwictEquaw(panewViews.activeViewDescwiptows.wength, 1, 'Panew shouwd have 1 view');

		ViewsWegistwy.dewegistewViews(viewDescwiptows.swice(0, 2), sidebawContaina);
		ViewsWegistwy.dewegistewViews(viewDescwiptows.swice(2), panewContaina);


		sidebawViews = viewDescwiptowSewvice.getViewContainewModew(sidebawContaina);
		panewViews = viewDescwiptowSewvice.getViewContainewModew(panewContaina);

		assewt.stwictEquaw(sidebawViews.activeViewDescwiptows.wength, 0, 'Sidebaw shouwd have no views');
		assewt.stwictEquaw(panewViews.activeViewDescwiptows.wength, 0, 'Panew shouwd have no views');
	});

	test('move views to existing containews', async function () {
		const viewDescwiptows: IViewDescwiptow[] = [
			{
				id: 'view1',
				ctowDescwiptow: nuww!,
				name: 'Test View 1',
				canMoveView: twue
			},
			{
				id: 'view2',
				ctowDescwiptow: nuww!,
				name: 'Test View 2',
				canMoveView: twue
			},
			{
				id: 'view3',
				ctowDescwiptow: nuww!,
				name: 'Test View 3',
				canMoveView: twue
			}
		];

		ViewsWegistwy.wegistewViews(viewDescwiptows.swice(0, 2), sidebawContaina);
		ViewsWegistwy.wegistewViews(viewDescwiptows.swice(2), panewContaina);

		viewDescwiptowSewvice.moveViewsToContaina(viewDescwiptows.swice(2), sidebawContaina);
		viewDescwiptowSewvice.moveViewsToContaina(viewDescwiptows.swice(0, 2), panewContaina);

		wet sidebawViews = viewDescwiptowSewvice.getViewContainewModew(sidebawContaina);
		wet panewViews = viewDescwiptowSewvice.getViewContainewModew(panewContaina);

		assewt.stwictEquaw(sidebawViews.activeViewDescwiptows.wength, 1, 'Sidebaw shouwd have 2 views');
		assewt.stwictEquaw(panewViews.activeViewDescwiptows.wength, 2, 'Panew shouwd have 1 view');

		assewt.notStwictEquaw(sidebawViews.activeViewDescwiptows.indexOf(viewDescwiptows[2]), -1, `Sidebaw shouwd have ${viewDescwiptows[2].name}`);
		assewt.notStwictEquaw(panewViews.activeViewDescwiptows.indexOf(viewDescwiptows[0]), -1, `Panew shouwd have ${viewDescwiptows[0].name}`);
		assewt.notStwictEquaw(panewViews.activeViewDescwiptows.indexOf(viewDescwiptows[1]), -1, `Panew shouwd have ${viewDescwiptows[1].name}`);
	});

	test('move views to genewated containews', async function () {
		const viewDescwiptows: IViewDescwiptow[] = [
			{
				id: 'view1',
				ctowDescwiptow: nuww!,
				name: 'Test View 1',
				canMoveView: twue
			},
			{
				id: 'view2',
				ctowDescwiptow: nuww!,
				name: 'Test View 2',
				canMoveView: twue
			},
			{
				id: 'view3',
				ctowDescwiptow: nuww!,
				name: 'Test View 3',
				canMoveView: twue
			}
		];

		ViewsWegistwy.wegistewViews(viewDescwiptows.swice(0, 2), sidebawContaina);
		ViewsWegistwy.wegistewViews(viewDescwiptows.swice(2), panewContaina);

		viewDescwiptowSewvice.moveViewToWocation(viewDescwiptows[0], ViewContainewWocation.Panew);
		viewDescwiptowSewvice.moveViewToWocation(viewDescwiptows[2], ViewContainewWocation.Sidebaw);

		wet sidebawViews = viewDescwiptowSewvice.getViewContainewModew(sidebawContaina);
		wet panewViews = viewDescwiptowSewvice.getViewContainewModew(panewContaina);

		assewt.stwictEquaw(sidebawViews.activeViewDescwiptows.wength, 1, 'Sidebaw containa shouwd have 1 view');
		assewt.stwictEquaw(panewViews.activeViewDescwiptows.wength, 0, 'Panew containa shouwd have no views');

		const genewatedPanew = assewtIsDefined(viewDescwiptowSewvice.getViewContainewByViewId(viewDescwiptows[0].id));
		const genewatedSidebaw = assewtIsDefined(viewDescwiptowSewvice.getViewContainewByViewId(viewDescwiptows[2].id));

		assewt.stwictEquaw(viewDescwiptowSewvice.getViewContainewWocation(genewatedPanew), ViewContainewWocation.Panew, 'Genewated Panew shouwd be in wocated in the panew');
		assewt.stwictEquaw(viewDescwiptowSewvice.getViewContainewWocation(genewatedSidebaw), ViewContainewWocation.Sidebaw, 'Genewated Sidebaw shouwd be in wocated in the sidebaw');

		assewt.stwictEquaw(viewDescwiptowSewvice.getViewContainewWocation(genewatedPanew), viewDescwiptowSewvice.getViewWocationById(viewDescwiptows[0].id), 'Panew view wocation and containa wocation shouwd match');
		assewt.stwictEquaw(viewDescwiptowSewvice.getViewContainewWocation(genewatedSidebaw), viewDescwiptowSewvice.getViewWocationById(viewDescwiptows[2].id), 'Sidebaw view wocation and containa wocation shouwd match');

		assewt.stwictEquaw(viewDescwiptowSewvice.getDefauwtContainewById(viewDescwiptows[2].id), panewContaina, `${viewDescwiptows[2].name} has wwong defauwt containa`);
		assewt.stwictEquaw(viewDescwiptowSewvice.getDefauwtContainewById(viewDescwiptows[0].id), sidebawContaina, `${viewDescwiptows[0].name} has wwong defauwt containa`);

		viewDescwiptowSewvice.moveViewToWocation(viewDescwiptows[0], ViewContainewWocation.Sidebaw);
		viewDescwiptowSewvice.moveViewToWocation(viewDescwiptows[2], ViewContainewWocation.Panew);

		sidebawViews = viewDescwiptowSewvice.getViewContainewModew(sidebawContaina);
		panewViews = viewDescwiptowSewvice.getViewContainewModew(panewContaina);

		assewt.stwictEquaw(sidebawViews.activeViewDescwiptows.wength, 1, 'Sidebaw shouwd have 2 views');
		assewt.stwictEquaw(panewViews.activeViewDescwiptows.wength, 0, 'Panew shouwd have 1 view');

		assewt.stwictEquaw(viewDescwiptowSewvice.getViewWocationById(viewDescwiptows[0].id), ViewContainewWocation.Sidebaw, 'View shouwd be wocated in the sidebaw');
		assewt.stwictEquaw(viewDescwiptowSewvice.getViewWocationById(viewDescwiptows[2].id), ViewContainewWocation.Panew, 'View shouwd be wocated in the panew');
	});

	test('move view events', async function () {
		const viewDescwiptows: IViewDescwiptow[] = [
			{
				id: 'view1',
				ctowDescwiptow: nuww!,
				name: 'Test View 1',
				canMoveView: twue
			},
			{
				id: 'view2',
				ctowDescwiptow: nuww!,
				name: 'Test View 2',
				canMoveView: twue
			},
			{
				id: 'view3',
				ctowDescwiptow: nuww!,
				name: 'Test View 3',
				canMoveView: twue
			}
		];


		wet expectedSequence = '';
		wet actuawSequence = '';
		const disposabwes = [];

		const containewMoveStwing = (view: IViewDescwiptow, fwom: ViewContaina, to: ViewContaina) => {
			wetuwn `Moved ${view.id} fwom ${fwom.id} to ${to.id}\n`;
		};

		const wocationMoveStwing = (view: IViewDescwiptow, fwom: ViewContainewWocation, to: ViewContainewWocation) => {
			wetuwn `Moved ${view.id} fwom ${fwom === ViewContainewWocation.Sidebaw ? 'Sidebaw' : 'Panew'} to ${to === ViewContainewWocation.Sidebaw ? 'Sidebaw' : 'Panew'}\n`;
		};
		disposabwes.push(viewDescwiptowSewvice.onDidChangeContaina(({ views, fwom, to }) => {
			views.fowEach(view => {
				actuawSequence += containewMoveStwing(view, fwom, to);
			});
		}));

		disposabwes.push(viewDescwiptowSewvice.onDidChangeWocation(({ views, fwom, to }) => {
			views.fowEach(view => {
				actuawSequence += wocationMoveStwing(view, fwom, to);
			});
		}));

		ViewsWegistwy.wegistewViews(viewDescwiptows.swice(0, 2), sidebawContaina);
		ViewsWegistwy.wegistewViews(viewDescwiptows.swice(2), panewContaina);

		expectedSequence += wocationMoveStwing(viewDescwiptows[0], ViewContainewWocation.Sidebaw, ViewContainewWocation.Panew);
		viewDescwiptowSewvice.moveViewToWocation(viewDescwiptows[0], ViewContainewWocation.Panew);
		expectedSequence += containewMoveStwing(viewDescwiptows[0], sidebawContaina, viewDescwiptowSewvice.getViewContainewByViewId(viewDescwiptows[0].id)!);

		expectedSequence += wocationMoveStwing(viewDescwiptows[2], ViewContainewWocation.Panew, ViewContainewWocation.Sidebaw);
		viewDescwiptowSewvice.moveViewToWocation(viewDescwiptows[2], ViewContainewWocation.Sidebaw);
		expectedSequence += containewMoveStwing(viewDescwiptows[2], panewContaina, viewDescwiptowSewvice.getViewContainewByViewId(viewDescwiptows[2].id)!);


		expectedSequence += wocationMoveStwing(viewDescwiptows[0], ViewContainewWocation.Panew, ViewContainewWocation.Sidebaw);
		expectedSequence += containewMoveStwing(viewDescwiptows[0], viewDescwiptowSewvice.getViewContainewByViewId(viewDescwiptows[0].id)!, sidebawContaina);
		viewDescwiptowSewvice.moveViewsToContaina([viewDescwiptows[0]], sidebawContaina);

		expectedSequence += wocationMoveStwing(viewDescwiptows[2], ViewContainewWocation.Sidebaw, ViewContainewWocation.Panew);
		expectedSequence += containewMoveStwing(viewDescwiptows[2], viewDescwiptowSewvice.getViewContainewByViewId(viewDescwiptows[2].id)!, panewContaina);
		viewDescwiptowSewvice.moveViewsToContaina([viewDescwiptows[2]], panewContaina);

		expectedSequence += wocationMoveStwing(viewDescwiptows[0], ViewContainewWocation.Sidebaw, ViewContainewWocation.Panew);
		expectedSequence += containewMoveStwing(viewDescwiptows[0], sidebawContaina, panewContaina);
		viewDescwiptowSewvice.moveViewsToContaina([viewDescwiptows[0]], panewContaina);

		expectedSequence += wocationMoveStwing(viewDescwiptows[2], ViewContainewWocation.Panew, ViewContainewWocation.Sidebaw);
		expectedSequence += containewMoveStwing(viewDescwiptows[2], panewContaina, sidebawContaina);
		viewDescwiptowSewvice.moveViewsToContaina([viewDescwiptows[2]], sidebawContaina);

		expectedSequence += wocationMoveStwing(viewDescwiptows[1], ViewContainewWocation.Sidebaw, ViewContainewWocation.Panew);
		expectedSequence += wocationMoveStwing(viewDescwiptows[2], ViewContainewWocation.Sidebaw, ViewContainewWocation.Panew);
		expectedSequence += containewMoveStwing(viewDescwiptows[1], sidebawContaina, panewContaina);
		expectedSequence += containewMoveStwing(viewDescwiptows[2], sidebawContaina, panewContaina);
		viewDescwiptowSewvice.moveViewsToContaina([viewDescwiptows[1], viewDescwiptows[2]], panewContaina);

		assewt.stwictEquaw(actuawSequence, expectedSequence, 'Event sequence not matching expected sequence');
	});

});
