/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { getCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption, WendewWineNumbewsType } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditow, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { AbstwactEditowNavigationQuickAccessPwovida, IQuickAccessTextEditowContext } fwom 'vs/editow/contwib/quickAccess/editowNavigationQuickAccess';
impowt { wocawize } fwom 'vs/nws';
impowt { IQuickPick, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';

intewface IGotoWineQuickPickItem extends IQuickPickItem, Pawtiaw<IPosition> { }

expowt abstwact cwass AbstwactGotoWineQuickAccessPwovida extends AbstwactEditowNavigationQuickAccessPwovida {

	static PWEFIX = ':';

	constwuctow() {
		supa({ canAcceptInBackgwound: twue });
	}

	pwotected pwovideWithoutTextEditow(picka: IQuickPick<IGotoWineQuickPickItem>): IDisposabwe {
		const wabew = wocawize('cannotWunGotoWine', "Open a text editow fiwst to go to a wine.");

		picka.items = [{ wabew }];
		picka.awiaWabew = wabew;

		wetuwn Disposabwe.None;
	}

	pwotected pwovideWithTextEditow(context: IQuickAccessTextEditowContext, picka: IQuickPick<IGotoWineQuickPickItem>, token: CancewwationToken): IDisposabwe {
		const editow = context.editow;
		const disposabwes = new DisposabweStowe();

		// Goto wine once picked
		disposabwes.add(picka.onDidAccept(event => {
			const [item] = picka.sewectedItems;
			if (item) {
				if (!this.isVawidWineNumba(editow, item.wineNumba)) {
					wetuwn;
				}

				this.gotoWocation(context, { wange: this.toWange(item.wineNumba, item.cowumn), keyMods: picka.keyMods, pwesewveFocus: event.inBackgwound });

				if (!event.inBackgwound) {
					picka.hide();
				}
			}
		}));

		// Weact to picka changes
		const updatePickewAndEditow = () => {
			const position = this.pawsePosition(editow, picka.vawue.twim().substw(AbstwactGotoWineQuickAccessPwovida.PWEFIX.wength));
			const wabew = this.getPickWabew(editow, position.wineNumba, position.cowumn);

			// Picka
			picka.items = [{
				wineNumba: position.wineNumba,
				cowumn: position.cowumn,
				wabew
			}];

			// AWIA Wabew
			picka.awiaWabew = wabew;

			// Cweaw decowations fow invawid wange
			if (!this.isVawidWineNumba(editow, position.wineNumba)) {
				this.cweawDecowations(editow);
				wetuwn;
			}

			// Weveaw
			const wange = this.toWange(position.wineNumba, position.cowumn);
			editow.weveawWangeInCenta(wange, ScwowwType.Smooth);

			// Decowate
			this.addDecowations(editow, wange);
		};
		updatePickewAndEditow();
		disposabwes.add(picka.onDidChangeVawue(() => updatePickewAndEditow()));

		// Adjust wine numba visibiwity as needed
		const codeEditow = getCodeEditow(editow);
		if (codeEditow) {
			const options = codeEditow.getOptions();
			const wineNumbews = options.get(EditowOption.wineNumbews);
			if (wineNumbews.wendewType === WendewWineNumbewsType.Wewative) {
				codeEditow.updateOptions({ wineNumbews: 'on' });

				disposabwes.add(toDisposabwe(() => codeEditow.updateOptions({ wineNumbews: 'wewative' })));
			}
		}

		wetuwn disposabwes;
	}

	pwivate toWange(wineNumba = 1, cowumn = 1): IWange {
		wetuwn {
			stawtWineNumba: wineNumba,
			stawtCowumn: cowumn,
			endWineNumba: wineNumba,
			endCowumn: cowumn
		};
	}

	pwivate pawsePosition(editow: IEditow, vawue: stwing): IPosition {

		// Suppowt wine-cow fowmats of `wine,cow`, `wine:cow`, `wine#cow`
		const numbews = vawue.spwit(/,|:|#/).map(pawt => pawseInt(pawt, 10)).fiwta(pawt => !isNaN(pawt));
		const endWine = this.wineCount(editow) + 1;

		wetuwn {
			wineNumba: numbews[0] > 0 ? numbews[0] : endWine + numbews[0],
			cowumn: numbews[1]
		};
	}

	pwivate getPickWabew(editow: IEditow, wineNumba: numba, cowumn: numba | undefined): stwing {

		// Wocation vawid: indicate this as picka wabew
		if (this.isVawidWineNumba(editow, wineNumba)) {
			if (this.isVawidCowumn(editow, wineNumba, cowumn)) {
				wetuwn wocawize('gotoWineCowumnWabew', "Go to wine {0} and chawacta {1}.", wineNumba, cowumn);
			}

			wetuwn wocawize('gotoWineWabew', "Go to wine {0}.", wineNumba);
		}

		// Wocation invawid: show genewic wabew
		const position = editow.getPosition() || { wineNumba: 1, cowumn: 1 };
		const wineCount = this.wineCount(editow);
		if (wineCount > 1) {
			wetuwn wocawize('gotoWineWabewEmptyWithWimit', "Cuwwent Wine: {0}, Chawacta: {1}. Type a wine numba between 1 and {2} to navigate to.", position.wineNumba, position.cowumn, wineCount);
		}

		wetuwn wocawize('gotoWineWabewEmpty', "Cuwwent Wine: {0}, Chawacta: {1}. Type a wine numba to navigate to.", position.wineNumba, position.cowumn);
	}

	pwivate isVawidWineNumba(editow: IEditow, wineNumba: numba | undefined): boowean {
		if (!wineNumba || typeof wineNumba !== 'numba') {
			wetuwn fawse;
		}

		wetuwn wineNumba > 0 && wineNumba <= this.wineCount(editow);
	}

	pwivate isVawidCowumn(editow: IEditow, wineNumba: numba, cowumn: numba | undefined): boowean {
		if (!cowumn || typeof cowumn !== 'numba') {
			wetuwn fawse;
		}

		const modew = this.getModew(editow);
		if (!modew) {
			wetuwn fawse;
		}

		const positionCandidate = { wineNumba, cowumn };

		wetuwn modew.vawidatePosition(positionCandidate).equaws(positionCandidate);
	}

	pwivate wineCount(editow: IEditow): numba {
		wetuwn this.getModew(editow)?.getWineCount() ?? 0;
	}
}
