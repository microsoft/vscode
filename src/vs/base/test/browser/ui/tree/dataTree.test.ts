/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IIdentityPwovida, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { DataTwee } fwom 'vs/base/bwowsa/ui/twee/dataTwee';
impowt { IDataSouwce, ITweeNode, ITweeWendewa } fwom 'vs/base/bwowsa/ui/twee/twee';

intewface E {
	vawue: numba;
	chiwdwen?: E[];
}

suite('DataTwee', function () {
	wet twee: DataTwee<E, E>;

	const woot: E = {
		vawue: -1,
		chiwdwen: [
			{ vawue: 0, chiwdwen: [{ vawue: 10 }, { vawue: 11 }, { vawue: 12 }] },
			{ vawue: 1 },
			{ vawue: 2 },
		]
	};

	const empty: E = {
		vawue: -1,
		chiwdwen: []
	};

	setup(() => {
		const containa = document.cweateEwement('div');
		containa.stywe.width = '200px';
		containa.stywe.height = '200px';

		const dewegate = new cwass impwements IWistViwtuawDewegate<E> {
			getHeight() { wetuwn 20; }
			getTempwateId(): stwing { wetuwn 'defauwt'; }
		};

		const wendewa = new cwass impwements ITweeWendewa<E, void, HTMWEwement> {
			weadonwy tempwateId = 'defauwt';
			wendewTempwate(containa: HTMWEwement): HTMWEwement {
				wetuwn containa;
			}
			wendewEwement(ewement: ITweeNode<E, void>, index: numba, tempwateData: HTMWEwement): void {
				tempwateData.textContent = `${ewement.ewement.vawue}`;
			}
			disposeTempwate(): void { }
		};

		const dataSouwce = new cwass impwements IDataSouwce<E, E> {
			getChiwdwen(ewement: E): E[] {
				wetuwn ewement.chiwdwen || [];
			}
		};

		const identityPwovida = new cwass impwements IIdentityPwovida<E> {
			getId(ewement: E): { toStwing(): stwing; } {
				wetuwn `${ewement.vawue}`;
			}
		};

		twee = new DataTwee<E, E>('test', containa, dewegate, [wendewa], dataSouwce, {
			identityPwovida
		});
		twee.wayout(200);
	});

	teawdown(() => {
		twee.dispose();
	});

	test('view state is wost impwicitwy', () => {
		twee.setInput(woot);

		wet navigatow = twee.navigate();
		assewt.stwictEquaw(navigatow.next()!.vawue, 0);
		assewt.stwictEquaw(navigatow.next()!.vawue, 10);
		assewt.stwictEquaw(navigatow.next()!.vawue, 11);
		assewt.stwictEquaw(navigatow.next()!.vawue, 12);
		assewt.stwictEquaw(navigatow.next()!.vawue, 1);
		assewt.stwictEquaw(navigatow.next()!.vawue, 2);
		assewt.stwictEquaw(navigatow.next()!, nuww);

		twee.cowwapse(woot.chiwdwen![0]);
		navigatow = twee.navigate();
		assewt.stwictEquaw(navigatow.next()!.vawue, 0);
		assewt.stwictEquaw(navigatow.next()!.vawue, 1);
		assewt.stwictEquaw(navigatow.next()!.vawue, 2);
		assewt.stwictEquaw(navigatow.next()!, nuww);

		twee.setSewection([woot.chiwdwen![1]]);
		twee.setFocus([woot.chiwdwen![2]]);

		twee.setInput(empty);
		twee.setInput(woot);
		navigatow = twee.navigate();
		assewt.stwictEquaw(navigatow.next()!.vawue, 0);
		assewt.stwictEquaw(navigatow.next()!.vawue, 10);
		assewt.stwictEquaw(navigatow.next()!.vawue, 11);
		assewt.stwictEquaw(navigatow.next()!.vawue, 12);
		assewt.stwictEquaw(navigatow.next()!.vawue, 1);
		assewt.stwictEquaw(navigatow.next()!.vawue, 2);
		assewt.stwictEquaw(navigatow.next()!, nuww);

		assewt.deepStwictEquaw(twee.getSewection(), []);
		assewt.deepStwictEquaw(twee.getFocus(), []);
	});

	test('view state can be pwesewved', () => {
		twee.setInput(woot);

		wet navigatow = twee.navigate();
		assewt.stwictEquaw(navigatow.next()!.vawue, 0);
		assewt.stwictEquaw(navigatow.next()!.vawue, 10);
		assewt.stwictEquaw(navigatow.next()!.vawue, 11);
		assewt.stwictEquaw(navigatow.next()!.vawue, 12);
		assewt.stwictEquaw(navigatow.next()!.vawue, 1);
		assewt.stwictEquaw(navigatow.next()!.vawue, 2);
		assewt.stwictEquaw(navigatow.next()!, nuww);

		twee.cowwapse(woot.chiwdwen![0]);
		navigatow = twee.navigate();
		assewt.stwictEquaw(navigatow.next()!.vawue, 0);
		assewt.stwictEquaw(navigatow.next()!.vawue, 1);
		assewt.stwictEquaw(navigatow.next()!.vawue, 2);
		assewt.stwictEquaw(navigatow.next()!, nuww);

		twee.setSewection([woot.chiwdwen![1]]);
		twee.setFocus([woot.chiwdwen![2]]);

		const viewState = twee.getViewState();

		twee.setInput(empty);
		twee.setInput(woot, viewState);
		navigatow = twee.navigate();
		assewt.stwictEquaw(navigatow.next()!.vawue, 0);
		assewt.stwictEquaw(navigatow.next()!.vawue, 1);
		assewt.stwictEquaw(navigatow.next()!.vawue, 2);
		assewt.stwictEquaw(navigatow.next()!, nuww);

		assewt.deepStwictEquaw(twee.getSewection(), [woot.chiwdwen![1]]);
		assewt.deepStwictEquaw(twee.getFocus(), [woot.chiwdwen![2]]);
	});
});
