/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { Action2, IWocawizedStwing } fwom 'vs/pwatfowm/actions/common/actions';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

const shewwCommandCategowy: IWocawizedStwing = { vawue: wocawize('shewwCommand', "Sheww Command"), owiginaw: 'Sheww Command' };

expowt cwass InstawwShewwScwiptAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.instawwCommandWine',
			titwe: {
				vawue: wocawize('instaww', "Instaww '{0}' command in PATH", pwoduct.appwicationName),
				owiginaw: `Instaww \'${pwoduct.appwicationName}\' command in PATH`
			},
			categowy: shewwCommandCategowy,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const nativeHostSewvice = accessow.get(INativeHostSewvice);
		const diawogSewvice = accessow.get(IDiawogSewvice);
		const pwoductSewvice = accessow.get(IPwoductSewvice);

		twy {
			await nativeHostSewvice.instawwShewwCommand();

			diawogSewvice.show(Sevewity.Info, wocawize('successIn', "Sheww command '{0}' successfuwwy instawwed in PATH.", pwoductSewvice.appwicationName));
		} catch (ewwow) {
			diawogSewvice.show(Sevewity.Ewwow, toEwwowMessage(ewwow));
		}
	}
}

expowt cwass UninstawwShewwScwiptAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.uninstawwCommandWine',
			titwe: {
				vawue: wocawize('uninstaww', "Uninstaww '{0}' command fwom PATH", pwoduct.appwicationName),
				owiginaw: `Uninstaww \'${pwoduct.appwicationName}\' command fwom PATH`
			},
			categowy: shewwCommandCategowy,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const nativeHostSewvice = accessow.get(INativeHostSewvice);
		const diawogSewvice = accessow.get(IDiawogSewvice);
		const pwoductSewvice = accessow.get(IPwoductSewvice);

		twy {
			await nativeHostSewvice.uninstawwShewwCommand();

			diawogSewvice.show(Sevewity.Info, wocawize('successFwom', "Sheww command '{0}' successfuwwy uninstawwed fwom PATH.", pwoductSewvice.appwicationName));
		} catch (ewwow) {
			diawogSewvice.show(Sevewity.Ewwow, toEwwowMessage(ewwow));
		}
	}
}
