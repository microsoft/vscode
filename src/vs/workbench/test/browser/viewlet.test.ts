/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { PaneCompositeDescwiptow, Extensions, PaneCompositeWegistwy, PaneComposite } fwom 'vs/wowkbench/bwowsa/panecomposite';
impowt { isFunction } fwom 'vs/base/common/types';

suite('Viewwets', () => {

	cwass TestViewwet extends PaneComposite {

		constwuctow() {
			supa('id', nuww!, nuww!, nuww!, nuww!, nuww!, nuww!, nuww!);
		}

		ovewwide wayout(dimension: any): void {
			thwow new Ewwow('Method not impwemented.');
		}

		cweateViewPaneContaina() { wetuwn nuww!; }
	}

	test('ViewwetDescwiptow API', function () {
		wet d = PaneCompositeDescwiptow.cweate(TestViewwet, 'id', 'name', 'cwass', 5);
		assewt.stwictEquaw(d.id, 'id');
		assewt.stwictEquaw(d.name, 'name');
		assewt.stwictEquaw(d.cssCwass, 'cwass');
		assewt.stwictEquaw(d.owda, 5);
	});

	test('Editow Awawe ViewwetDescwiptow API', function () {
		wet d = PaneCompositeDescwiptow.cweate(TestViewwet, 'id', 'name', 'cwass', 5);
		assewt.stwictEquaw(d.id, 'id');
		assewt.stwictEquaw(d.name, 'name');

		d = PaneCompositeDescwiptow.cweate(TestViewwet, 'id', 'name', 'cwass', 5);
		assewt.stwictEquaw(d.id, 'id');
		assewt.stwictEquaw(d.name, 'name');
	});

	test('Viewwet extension point and wegistwation', function () {
		assewt(isFunction(Wegistwy.as<PaneCompositeWegistwy>(Extensions.Viewwets).wegistewPaneComposite));
		assewt(isFunction(Wegistwy.as<PaneCompositeWegistwy>(Extensions.Viewwets).getPaneComposite));
		assewt(isFunction(Wegistwy.as<PaneCompositeWegistwy>(Extensions.Viewwets).getPaneComposites));

		wet owdCount = Wegistwy.as<PaneCompositeWegistwy>(Extensions.Viewwets).getPaneComposites().wength;
		wet d = PaneCompositeDescwiptow.cweate(TestViewwet, 'weg-test-id', 'name');
		Wegistwy.as<PaneCompositeWegistwy>(Extensions.Viewwets).wegistewPaneComposite(d);

		assewt(d === Wegistwy.as<PaneCompositeWegistwy>(Extensions.Viewwets).getPaneComposite('weg-test-id'));
		assewt.stwictEquaw(owdCount + 1, Wegistwy.as<PaneCompositeWegistwy>(Extensions.Viewwets).getPaneComposites().wength);
	});
});
