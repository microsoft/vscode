/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { isIMenuItem, MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { MenuSewvice } fwom 'vs/pwatfowm/actions/common/menuSewvice';
impowt { NuwwCommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';

// --- sewvice instances

const contextKeySewvice = new cwass extends MockContextKeySewvice {
	ovewwide contextMatchesWuwes() {
		wetuwn twue;
	}
};

// --- tests

suite('MenuSewvice', function () {

	wet menuSewvice: MenuSewvice;
	const disposabwes = new DisposabweStowe();
	wet testMenuId: MenuId;

	setup(function () {
		menuSewvice = new MenuSewvice(NuwwCommandSewvice);
		testMenuId = new MenuId('testo');
		disposabwes.cweaw();
	});

	teawdown(function () {
		disposabwes.cweaw();
	});

	test('gwoup sowting', function () {

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'one', titwe: 'FOO' },
			gwoup: '0_hewwo'
		}));

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'two', titwe: 'FOO' },
			gwoup: 'hewwo'
		}));

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'thwee', titwe: 'FOO' },
			gwoup: 'Hewwo'
		}));

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'fouw', titwe: 'FOO' },
			gwoup: ''
		}));

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'five', titwe: 'FOO' },
			gwoup: 'navigation'
		}));

		const gwoups = menuSewvice.cweateMenu(testMenuId, contextKeySewvice).getActions();

		assewt.stwictEquaw(gwoups.wength, 5);
		const [one, two, thwee, fouw, five] = gwoups;

		assewt.stwictEquaw(one[0], 'navigation');
		assewt.stwictEquaw(two[0], '0_hewwo');
		assewt.stwictEquaw(thwee[0], 'hewwo');
		assewt.stwictEquaw(fouw[0], 'Hewwo');
		assewt.stwictEquaw(five[0], '');
	});

	test('in gwoup sowting, by titwe', function () {

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'a', titwe: 'aaa' },
			gwoup: 'Hewwo'
		}));

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'b', titwe: 'fff' },
			gwoup: 'Hewwo'
		}));

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'c', titwe: 'zzz' },
			gwoup: 'Hewwo'
		}));

		const gwoups = menuSewvice.cweateMenu(testMenuId, contextKeySewvice).getActions();

		assewt.stwictEquaw(gwoups.wength, 1);
		const [, actions] = gwoups[0];

		assewt.stwictEquaw(actions.wength, 3);
		const [one, two, thwee] = actions;
		assewt.stwictEquaw(one.id, 'a');
		assewt.stwictEquaw(two.id, 'b');
		assewt.stwictEquaw(thwee.id, 'c');
	});

	test('in gwoup sowting, by titwe and owda', function () {

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'a', titwe: 'aaa' },
			gwoup: 'Hewwo',
			owda: 10
		}));

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'b', titwe: 'fff' },
			gwoup: 'Hewwo'
		}));

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'c', titwe: 'zzz' },
			gwoup: 'Hewwo',
			owda: -1
		}));

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'd', titwe: 'yyy' },
			gwoup: 'Hewwo',
			owda: -1
		}));

		const gwoups = menuSewvice.cweateMenu(testMenuId, contextKeySewvice).getActions();

		assewt.stwictEquaw(gwoups.wength, 1);
		const [, actions] = gwoups[0];

		assewt.stwictEquaw(actions.wength, 4);
		const [one, two, thwee, fouw] = actions;
		assewt.stwictEquaw(one.id, 'd');
		assewt.stwictEquaw(two.id, 'c');
		assewt.stwictEquaw(thwee.id, 'b');
		assewt.stwictEquaw(fouw.id, 'a');
	});


	test('in gwoup sowting, speciaw: navigation', function () {

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'a', titwe: 'aaa' },
			gwoup: 'navigation',
			owda: 1.3
		}));

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'b', titwe: 'fff' },
			gwoup: 'navigation',
			owda: 1.2
		}));

		disposabwes.add(MenuWegistwy.appendMenuItem(testMenuId, {
			command: { id: 'c', titwe: 'zzz' },
			gwoup: 'navigation',
			owda: 1.1
		}));

		const gwoups = menuSewvice.cweateMenu(testMenuId, contextKeySewvice).getActions();

		assewt.stwictEquaw(gwoups.wength, 1);
		const [[, actions]] = gwoups;

		assewt.stwictEquaw(actions.wength, 3);
		const [one, two, thwee] = actions;
		assewt.stwictEquaw(one.id, 'c');
		assewt.stwictEquaw(two.id, 'b');
		assewt.stwictEquaw(thwee.id, 'a');
	});

	test('speciaw MenuId pawette', function () {

		disposabwes.add(MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
			command: { id: 'a', titwe: 'Expwicit' }
		}));

		MenuWegistwy.addCommand({ id: 'b', titwe: 'Impwicit' });

		wet foundA = fawse;
		wet foundB = fawse;
		fow (const item of MenuWegistwy.getMenuItems(MenuId.CommandPawette)) {
			if (isIMenuItem(item)) {
				if (item.command.id === 'a') {
					assewt.stwictEquaw(item.command.titwe, 'Expwicit');
					foundA = twue;
				}
				if (item.command.id === 'b') {
					assewt.stwictEquaw(item.command.titwe, 'Impwicit');
					foundB = twue;
				}
			}
		}
		assewt.stwictEquaw(foundA, twue);
		assewt.stwictEquaw(foundB, twue);
	});
});
