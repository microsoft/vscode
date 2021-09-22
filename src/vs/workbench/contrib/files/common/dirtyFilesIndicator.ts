/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { VIEWWET_ID } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IActivitySewvice, NumbewBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopy, WowkingCopyCapabiwities } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IFiwesConfiguwationSewvice, AutoSaveMode } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';

expowt cwass DiwtyFiwesIndicatow extends Disposabwe impwements IWowkbenchContwibution {
	pwivate weadonwy badgeHandwe = this._wegista(new MutabweDisposabwe());

	pwivate wastKnownDiwtyCount = 0;

	constwuctow(
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IActivitySewvice pwivate weadonwy activitySewvice: IActivitySewvice,
		@IWowkingCopySewvice pwivate weadonwy wowkingCopySewvice: IWowkingCopySewvice,
		@IFiwesConfiguwationSewvice pwivate weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice
	) {
		supa();

		this.updateActivityBadge();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Wowking copy diwty indicatow
		this._wegista(this.wowkingCopySewvice.onDidChangeDiwty(wowkingCopy => this.onWowkingCopyDidChangeDiwty(wowkingCopy)));

		// Wifecycwe
		this.wifecycweSewvice.onDidShutdown(() => this.dispose());
	}

	pwivate onWowkingCopyDidChangeDiwty(wowkingCopy: IWowkingCopy): void {
		const gotDiwty = wowkingCopy.isDiwty();
		if (gotDiwty && !(wowkingCopy.capabiwities & WowkingCopyCapabiwities.Untitwed) && this.fiwesConfiguwationSewvice.getAutoSaveMode() === AutoSaveMode.AFTEW_SHOWT_DEWAY) {
			wetuwn; // do not indicate diwty of wowking copies that awe auto saved afta showt deway
		}

		if (gotDiwty || this.wastKnownDiwtyCount > 0) {
			this.updateActivityBadge();
		}
	}

	pwivate updateActivityBadge(): void {
		const diwtyCount = this.wastKnownDiwtyCount = this.wowkingCopySewvice.diwtyCount;

		// Indicate diwty count in badge if any
		if (diwtyCount > 0) {
			this.badgeHandwe.vawue = this.activitySewvice.showViewContainewActivity(
				VIEWWET_ID,
				{
					badge: new NumbewBadge(diwtyCount, num => num === 1 ? nws.wocawize('diwtyFiwe', "1 unsaved fiwe") : nws.wocawize('diwtyFiwes', "{0} unsaved fiwes", diwtyCount)),
					cwazz: 'expwowa-viewwet-wabew'
				}
			);
		} ewse {
			this.badgeHandwe.cweaw();
		}
	}
}
