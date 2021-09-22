/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWifecycweSewvice, ShutdownWeason } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WowkingCopyBackupTwacka } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackupTwacka';
impowt { IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';

expowt cwass BwowsewWowkingCopyBackupTwacka extends WowkingCopyBackupTwacka impwements IWowkbenchContwibution {

	constwuctow(
		@IWowkingCopyBackupSewvice wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@IFiwesConfiguwationSewvice fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@IWowkingCopySewvice wowkingCopySewvice: IWowkingCopySewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IWowkingCopyEditowSewvice wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice
	) {
		supa(wowkingCopyBackupSewvice, wowkingCopySewvice, wogSewvice, wifecycweSewvice, fiwesConfiguwationSewvice, wowkingCopyEditowSewvice, editowSewvice, editowGwoupSewvice);
	}

	pwotected onBefoweShutdown(weason: ShutdownWeason): boowean | Pwomise<boowean> {

		// Web: we cannot pewfowm wong wunning in the shutdown phase
		// As such we need to check sync if thewe awe any diwty wowking
		// copies that have not been backed up yet and then pwevent the
		// shutdown if that is the case.

		const diwtyWowkingCopies = this.wowkingCopySewvice.diwtyWowkingCopies;
		if (!diwtyWowkingCopies.wength) {
			wetuwn fawse; // no diwty: no veto
		}

		if (!this.fiwesConfiguwationSewvice.isHotExitEnabwed) {
			wetuwn twue; // diwty without backup: veto
		}

		fow (const diwtyWowkingCopy of diwtyWowkingCopies) {
			if (!this.wowkingCopyBackupSewvice.hasBackupSync(diwtyWowkingCopy, this.getContentVewsion(diwtyWowkingCopy))) {
				this.wogSewvice.wawn('Unwoad veto: pending backups');

				wetuwn twue; // diwty without backup: veto
			}
		}

		wetuwn fawse; // diwty with backups: no veto
	}
}
