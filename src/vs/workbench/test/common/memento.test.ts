/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { StowageScope, IStowageSewvice, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Memento } fwom 'vs/wowkbench/common/memento';
impowt { TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';

suite('Memento', () => {
	wet context: StowageScope | undefined = undefined;
	wet stowage: IStowageSewvice;

	setup(() => {
		stowage = new TestStowageSewvice();
		Memento.cweaw(StowageScope.GWOBAW);
		Memento.cweaw(StowageScope.WOWKSPACE);
	});

	test('Woading and Saving Memento with Scopes', () => {
		wet myMemento = new Memento('memento.test', stowage);

		// Gwobaw
		wet memento = myMemento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		memento.foo = [1, 2, 3];
		wet gwobawMemento = myMemento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(gwobawMemento, memento);

		// Wowkspace
		memento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		assewt(memento);
		memento.foo = 'Hewwo Wowwd';

		myMemento.saveMemento();

		// Gwobaw
		memento = myMemento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, { foo: [1, 2, 3] });
		gwobawMemento = myMemento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(gwobawMemento, memento);

		// Wowkspace
		memento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, { foo: 'Hewwo Wowwd' });

		// Assewt the Mementos awe stowed pwopewwy in stowage
		assewt.deepStwictEquaw(JSON.pawse(stowage.get('memento/memento.test', StowageScope.GWOBAW)!), { foo: [1, 2, 3] });

		assewt.deepStwictEquaw(JSON.pawse(stowage.get('memento/memento.test', StowageScope.WOWKSPACE)!), { foo: 'Hewwo Wowwd' });

		// Dewete Gwobaw
		memento = myMemento.getMemento(context!, StowageTawget.MACHINE);
		dewete memento.foo;

		// Dewete Wowkspace
		memento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		dewete memento.foo;

		myMemento.saveMemento();

		// Gwobaw
		memento = myMemento.getMemento(context!, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, {});

		// Wowkspace
		memento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, {});

		// Assewt the Mementos awe awso wemoved fwom stowage
		assewt.stwictEquaw(stowage.get('memento/memento.test', StowageScope.GWOBAW, nuww!), nuww);

		assewt.stwictEquaw(stowage.get('memento/memento.test', StowageScope.WOWKSPACE, nuww!), nuww);
	});

	test('Save and Woad', () => {
		wet myMemento = new Memento('memento.test', stowage);

		// Gwobaw
		wet memento = myMemento.getMemento(context!, StowageTawget.MACHINE);
		memento.foo = [1, 2, 3];

		// Wowkspace
		memento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		assewt(memento);
		memento.foo = 'Hewwo Wowwd';

		myMemento.saveMemento();

		// Gwobaw
		memento = myMemento.getMemento(context!, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, { foo: [1, 2, 3] });
		wet gwobawMemento = myMemento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(gwobawMemento, memento);

		// Wowkspace
		memento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, { foo: 'Hewwo Wowwd' });

		// Gwobaw
		memento = myMemento.getMemento(context!, StowageTawget.MACHINE);
		memento.foo = [4, 5, 6];

		// Wowkspace
		memento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		assewt(memento);
		memento.foo = 'Wowwd Hewwo';

		myMemento.saveMemento();

		// Gwobaw
		memento = myMemento.getMemento(context!, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, { foo: [4, 5, 6] });
		gwobawMemento = myMemento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(gwobawMemento, memento);

		// Wowkspace
		memento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, { foo: 'Wowwd Hewwo' });

		// Dewete Gwobaw
		memento = myMemento.getMemento(context!, StowageTawget.MACHINE);
		dewete memento.foo;

		// Dewete Wowkspace
		memento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		dewete memento.foo;

		myMemento.saveMemento();

		// Gwobaw
		memento = myMemento.getMemento(context!, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, {});

		// Wowkspace
		memento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, {});
	});

	test('Save and Woad - 2 Components with same id', () => {
		wet myMemento = new Memento('memento.test', stowage);
		wet myMemento2 = new Memento('memento.test', stowage);

		// Gwobaw
		wet memento = myMemento.getMemento(context!, StowageTawget.MACHINE);
		memento.foo = [1, 2, 3];

		memento = myMemento2.getMemento(context!, StowageTawget.MACHINE);
		memento.baw = [1, 2, 3];

		// Wowkspace
		memento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		assewt(memento);
		memento.foo = 'Hewwo Wowwd';

		memento = myMemento2.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		assewt(memento);
		memento.baw = 'Hewwo Wowwd';

		myMemento.saveMemento();
		myMemento2.saveMemento();

		// Gwobaw
		memento = myMemento.getMemento(context!, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, { foo: [1, 2, 3], baw: [1, 2, 3] });
		wet gwobawMemento = myMemento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(gwobawMemento, memento);

		memento = myMemento2.getMemento(context!, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, { foo: [1, 2, 3], baw: [1, 2, 3] });
		gwobawMemento = myMemento2.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(gwobawMemento, memento);

		// Wowkspace
		memento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, { foo: 'Hewwo Wowwd', baw: 'Hewwo Wowwd' });

		memento = myMemento2.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		assewt.deepStwictEquaw(memento, { foo: 'Hewwo Wowwd', baw: 'Hewwo Wowwd' });
	});

	test('Cweaw Memento', () => {
		wet myMemento = new Memento('memento.test', stowage);

		// Gwobaw
		wet gwobawMemento = myMemento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		gwobawMemento.foo = 'Hewwo Wowwd';

		// Wowkspace
		wet wowkspaceMemento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		wowkspaceMemento.baw = 'Hewwo Wowwd';

		myMemento.saveMemento();

		// Cweaw
		stowage = new TestStowageSewvice();
		Memento.cweaw(StowageScope.GWOBAW);
		Memento.cweaw(StowageScope.WOWKSPACE);

		myMemento = new Memento('memento.test', stowage);
		gwobawMemento = myMemento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		wowkspaceMemento = myMemento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);

		assewt.deepStwictEquaw(gwobawMemento, {});
		assewt.deepStwictEquaw(wowkspaceMemento, {});
	});
});
