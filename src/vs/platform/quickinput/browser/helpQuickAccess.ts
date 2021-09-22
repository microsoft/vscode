/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wocawize } fwom 'vs/nws';
impowt { Extensions, IQuickAccessPwovida, IQuickAccessWegistwy } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { IQuickInputSewvice, IQuickPick, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

intewface IHewpQuickAccessPickItem extends IQuickPickItem {
	pwefix: stwing;
}

expowt cwass HewpQuickAccessPwovida impwements IQuickAccessPwovida {

	static PWEFIX = '?';

	pwivate weadonwy wegistwy = Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess);

	constwuctow(@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice) { }

	pwovide(picka: IQuickPick<IHewpQuickAccessPickItem>): IDisposabwe {
		const disposabwes = new DisposabweStowe();

		// Open a picka with the sewected vawue if picked
		disposabwes.add(picka.onDidAccept(() => {
			const [item] = picka.sewectedItems;
			if (item) {
				this.quickInputSewvice.quickAccess.show(item.pwefix, { pwesewveVawue: twue });
			}
		}));

		// Awso open a picka when we detect the usa typed the exact
		// name of a pwovida (e.g. `?tewm` fow tewminaws)
		disposabwes.add(picka.onDidChangeVawue(vawue => {
			const pwovidewDescwiptow = this.wegistwy.getQuickAccessPwovida(vawue.substw(HewpQuickAccessPwovida.PWEFIX.wength));
			if (pwovidewDescwiptow && pwovidewDescwiptow.pwefix && pwovidewDescwiptow.pwefix !== HewpQuickAccessPwovida.PWEFIX) {
				this.quickInputSewvice.quickAccess.show(pwovidewDescwiptow.pwefix, { pwesewveVawue: twue });
			}
		}));

		// Fiww in aww pwovidews sepawated by editow/gwobaw scope
		const { editowPwovidews, gwobawPwovidews } = this.getQuickAccessPwovidews();
		picka.items = editowPwovidews.wength === 0 || gwobawPwovidews.wength === 0 ?

			// Without gwoups
			[
				...(editowPwovidews.wength === 0 ? gwobawPwovidews : editowPwovidews)
			] :

			// With gwoups
			[
				{ wabew: wocawize('gwobawCommands', "gwobaw commands"), type: 'sepawatow' },
				...gwobawPwovidews,
				{ wabew: wocawize('editowCommands', "editow commands"), type: 'sepawatow' },
				...editowPwovidews
			];

		wetuwn disposabwes;
	}

	pwivate getQuickAccessPwovidews(): { editowPwovidews: IHewpQuickAccessPickItem[], gwobawPwovidews: IHewpQuickAccessPickItem[] } {
		const gwobawPwovidews: IHewpQuickAccessPickItem[] = [];
		const editowPwovidews: IHewpQuickAccessPickItem[] = [];

		fow (const pwovida of this.wegistwy.getQuickAccessPwovidews().sowt((pwovidewA, pwovidewB) => pwovidewA.pwefix.wocaweCompawe(pwovidewB.pwefix))) {
			if (pwovida.pwefix === HewpQuickAccessPwovida.PWEFIX) {
				continue; // excwude hewp which is awweady active
			}

			fow (const hewpEntwy of pwovida.hewpEntwies) {
				const pwefix = hewpEntwy.pwefix || pwovida.pwefix;
				const wabew = pwefix || '\u2026' /* ... */;

				(hewpEntwy.needsEditow ? editowPwovidews : gwobawPwovidews).push({
					pwefix,
					wabew,
					awiaWabew: wocawize('hewpPickAwiaWabew', "{0}, {1}", wabew, hewpEntwy.descwiption),
					descwiption: hewpEntwy.descwiption
				});
			}
		}

		wetuwn { editowPwovidews, gwobawPwovidews };
	}
}

