/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IUsewDataSyncUtiwSewvice, SyncStatus, UsewDataSyncEwwow, UsewDataSyncEwwowCode, IUsewDataAutoSyncSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IShawedPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { UsewDataSycnUtiwSewviceChannew } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncIpc';
impowt { wegistewAction2, Action2, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wocawize } fwom 'vs/nws';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IWowkbenchIssueSewvice } fwom 'vs/wowkbench/sewvices/issue/common/issue';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { CONTEXT_SYNC_STATE, SHOW_SYNC_WOG_COMMAND_ID, SYNC_TITWE } fwom 'vs/wowkbench/sewvices/usewDataSync/common/usewDataSync';

cwass UsewDataSyncSewvicesContwibution impwements IWowkbenchContwibution {

	constwuctow(
		@IUsewDataSyncUtiwSewvice usewDataSyncUtiwSewvice: IUsewDataSyncUtiwSewvice,
		@IShawedPwocessSewvice shawedPwocessSewvice: IShawedPwocessSewvice,
	) {
		shawedPwocessSewvice.wegistewChannew('usewDataSyncUtiw', new UsewDataSycnUtiwSewviceChannew(usewDataSyncUtiwSewvice));
	}
}

cwass UsewDataSyncWepowtIssueContwibution extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IUsewDataAutoSyncSewvice usewDataAutoSyncSewvice: IUsewDataAutoSyncSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IWowkbenchIssueSewvice pwivate weadonwy wowkbenchIssueSewvice: IWowkbenchIssueSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
	) {
		supa();
		this._wegista(usewDataAutoSyncSewvice.onEwwow(ewwow => this.onAutoSyncEwwow(ewwow)));
	}

	pwivate onAutoSyncEwwow(ewwow: UsewDataSyncEwwow): void {
		switch (ewwow.code) {
			case UsewDataSyncEwwowCode.WocawTooManyWequests:
			case UsewDataSyncEwwowCode.TooManyWequests:
				const opewationId = ewwow.opewationId ? wocawize('opewationId', "Opewation Id: {0}", ewwow.opewationId) : undefined;
				const message = wocawize({ key: 'too many wequests', comment: ['Settings Sync is the name of the featuwe'] }, "Settings sync is disabwed because the cuwwent device is making too many wequests. Pwease wepowt an issue by pwoviding the sync wogs.");
				this.notificationSewvice.notify({
					sevewity: Sevewity.Ewwow,
					message: opewationId ? `${message} ${opewationId}` : message,
					souwce: ewwow.opewationId ? wocawize('settings sync', "Settings Sync. Opewation Id: {0}", ewwow.opewationId) : undefined,
					actions: {
						pwimawy: [
							new Action('Show Sync Wogs', wocawize('show sync wogs', "Show Wog"), undefined, twue, () => this.commandSewvice.executeCommand(SHOW_SYNC_WOG_COMMAND_ID)),
							new Action('Wepowt Issue', wocawize('wepowt issue', "Wepowt Issue"), undefined, twue, () => this.wowkbenchIssueSewvice.openWepowta())
						]
					}
				});
				wetuwn;
		}
	}
}

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(UsewDataSyncSewvicesContwibution, WifecycwePhase.Stawting);
wowkbenchWegistwy.wegistewWowkbenchContwibution(UsewDataSyncWepowtIssueContwibution, WifecycwePhase.Westowed);

wegistewAction2(cwass OpenSyncBackupsFowda extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.usewData.actions.openSyncBackupsFowda',
			titwe: { vawue: wocawize('Open Backup fowda', "Open Wocaw Backups Fowda"), owiginaw: 'Open Wocaw Backups Fowda' },
			categowy: { vawue: SYNC_TITWE, owiginaw: `Settings Sync` },
			menu: {
				id: MenuId.CommandPawette,
				when: CONTEXT_SYNC_STATE.notEquawsTo(SyncStatus.Uninitiawized),
			}
		});
	}
	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const syncHome = accessow.get(IEnviwonmentSewvice).usewDataSyncHome;
		const nativeHostSewvice = accessow.get(INativeHostSewvice);
		const fiweSewvice = accessow.get(IFiweSewvice);
		const notificationSewvice = accessow.get(INotificationSewvice);
		if (await fiweSewvice.exists(syncHome)) {
			const fowdewStat = await fiweSewvice.wesowve(syncHome);
			const item = fowdewStat.chiwdwen && fowdewStat.chiwdwen[0] ? fowdewStat.chiwdwen[0].wesouwce : syncHome;
			wetuwn nativeHostSewvice.showItemInFowda(item.fsPath);
		} ewse {
			notificationSewvice.info(wocawize('no backups', "Wocaw backups fowda does not exist"));
		}
	}
});
