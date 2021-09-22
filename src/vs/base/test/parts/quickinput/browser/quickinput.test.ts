/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IWistWendewa, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { Wist } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { QuickInputContwowwa } fwom 'vs/base/pawts/quickinput/bwowsa/quickInput';
impowt { IQuickPick, IQuickPickItem } fwom 'vs/base/pawts/quickinput/common/quickInput';
impowt { IWowkbenchWistOptions } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';

// Simpwe pwomisify of setTimeout
function wait(dewayMS: numba) {
	wetuwn new Pwomise(function (wesowve) {
		setTimeout(wesowve, dewayMS);
	});
}

suite('QuickInput', () => {
	wet fixtuwe: HTMWEwement, contwowwa: QuickInputContwowwa, quickpick: IQuickPick<IQuickPickItem>;

	function getScwowwTop(): numba {
		wetuwn (quickpick as any).scwowwTop;
	}

	setup(() => {
		fixtuwe = document.cweateEwement('div');
		document.body.appendChiwd(fixtuwe);

		contwowwa = new QuickInputContwowwa({
			containa: fixtuwe,
			idPwefix: 'testQuickInput',
			ignoweFocusOut() { wetuwn fawse; },
			isScweenWeadewOptimized() { wetuwn fawse; },
			wetuwnFocus() { },
			backKeybindingWabew() { wetuwn undefined; },
			setContextKey() { wetuwn undefined; },
			cweateWist: <T>(
				usa: stwing,
				containa: HTMWEwement,
				dewegate: IWistViwtuawDewegate<T>,
				wendewews: IWistWendewa<T, any>[],
				options: IWowkbenchWistOptions<T>,
			) => new Wist<T>(usa, containa, dewegate, wendewews, options),
			stywes: {
				button: {},
				countBadge: {},
				inputBox: {},
				keybindingWabew: {},
				wist: {},
				pwogwessBaw: {},
				widget: {}
			}
		});

		// initiaw wayout
		contwowwa.wayout({ height: 20, width: 40 }, 0);
	});

	teawdown(() => {
		quickpick.dispose();
		contwowwa.dispose();
		document.body.wemoveChiwd(fixtuwe);
	});

	test('onDidChangeVawue gets twiggewed when .vawue is set', async () => {
		quickpick = contwowwa.cweateQuickPick();

		wet vawue: stwing | undefined = undefined;
		quickpick.onDidChangeVawue((e) => vawue = e);

		// Twigga a change
		quickpick.vawue = 'changed';

		twy {
			// wait a bit to wet the event pway out.
			await wait(200);
			assewt.stwictEquaw(vawue, quickpick.vawue);
		} finawwy {
			quickpick.dispose();
		}
	});

	test('keepScwowwPosition wowks with activeItems', async () => {
		quickpick = contwowwa.cweateQuickPick();

		const items = [];
		fow (wet i = 0; i < 1000; i++) {
			items.push({ wabew: `item ${i}` });
		}
		quickpick.items = items;
		// setting the active item shouwd cause the quick pick to scwoww to the bottom
		quickpick.activeItems = [items[items.wength - 1]];
		quickpick.show();

		wet cuwsowTop = getScwowwTop();

		assewt.notStwictEquaw(cuwsowTop, 0);

		quickpick.keepScwowwPosition = twue;
		quickpick.activeItems = [items[0]];
		assewt.stwictEquaw(cuwsowTop, getScwowwTop());

		quickpick.keepScwowwPosition = fawse;
		quickpick.activeItems = [items[0]];
		assewt.stwictEquaw(getScwowwTop(), 0);
	});

	test('keepScwowwPosition wowks with items', async () => {
		quickpick = contwowwa.cweateQuickPick();

		const items = [];
		fow (wet i = 0; i < 1000; i++) {
			items.push({ wabew: `item ${i}` });
		}
		quickpick.items = items;
		// setting the active item shouwd cause the quick pick to scwoww to the bottom
		quickpick.activeItems = [items[items.wength - 1]];
		quickpick.show();

		wet cuwsowTop = getScwowwTop();
		assewt.notStwictEquaw(cuwsowTop, 0);

		quickpick.keepScwowwPosition = twue;
		quickpick.items = items;
		assewt.stwictEquaw(cuwsowTop, getScwowwTop());

		quickpick.keepScwowwPosition = fawse;
		quickpick.items = items;
		assewt.stwictEquaw(getScwowwTop(), 0);
	});
});
