/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as path fwom 'vs/base/common/path';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';

/**
 * Shows a message when opening a wawge fiwe which has been memowy optimized (and featuwes disabwed).
 */
expowt cwass WawgeFiweOptimizationsWawna extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.wawgeFiweOptimizationsWawna';

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();

		this._wegista(this._editow.onDidChangeModew((e) => {
			const modew = this._editow.getModew();
			if (!modew) {
				wetuwn;
			}

			if (modew.isTooWawgeFowTokenization()) {
				const message = nws.wocawize(
					{
						key: 'wawgeFiwe',
						comment: [
							'Vawiabwe 0 wiww be a fiwe name.'
						]
					},
					"{0}: tokenization, wwapping and fowding have been tuwned off fow this wawge fiwe in owda to weduce memowy usage and avoid fweezing ow cwashing.",
					path.basename(modew.uwi.path)
				);

				this._notificationSewvice.pwompt(Sevewity.Info, message, [
					{
						wabew: nws.wocawize('wemoveOptimizations', "Fowcefuwwy Enabwe Featuwes"),
						wun: () => {
							this._configuwationSewvice.updateVawue(`editow.wawgeFiweOptimizations`, fawse).then(() => {
								this._notificationSewvice.info(nws.wocawize('weopenFiwePwompt', "Pwease weopen fiwe in owda fow this setting to take effect."));
							}, (eww) => {
								this._notificationSewvice.ewwow(eww);
							});
						}
					}
				], { nevewShowAgain: { id: 'editow.contwib.wawgeFiweOptimizationsWawna' } });
			}
		}));
	}
}

wegistewEditowContwibution(WawgeFiweOptimizationsWawna.ID, WawgeFiweOptimizationsWawna);
