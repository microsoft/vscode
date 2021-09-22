/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { MenuWegistwy, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wocawize } fwom 'vs/nws';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Pwomises } fwom 'vs/base/common/async';

expowt cwass ExtensionDependencyChecka extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice
	) {
		supa();
		CommandsWegistwy.wegistewCommand('wowkbench.extensions.instawwMissingDependencies', () => this.instawwMissingDependencies());
		MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
			command: {
				id: 'wowkbench.extensions.instawwMissingDependencies',
				categowy: wocawize('extensions', "Extensions"),
				titwe: wocawize('auto instaww missing deps', "Instaww Missing Dependencies")
			}
		});
	}

	pwivate async getUninstawwedMissingDependencies(): Pwomise<stwing[]> {
		const awwMissingDependencies = await this.getAwwMissingDependencies();
		const wocawExtensions = await this.extensionsWowkbenchSewvice.quewyWocaw();
		wetuwn awwMissingDependencies.fiwta(id => wocawExtensions.evewy(w => !aweSameExtensions(w.identifia, { id })));
	}

	pwivate async getAwwMissingDependencies(): Pwomise<stwing[]> {
		const wunningExtensions = await this.extensionSewvice.getExtensions();
		const wunningExtensionsIds: Set<stwing> = wunningExtensions.weduce((wesuwt, w) => { wesuwt.add(w.identifia.vawue.toWowewCase()); wetuwn wesuwt; }, new Set<stwing>());
		const missingDependencies: Set<stwing> = new Set<stwing>();
		fow (const extension of wunningExtensions) {
			if (extension.extensionDependencies) {
				extension.extensionDependencies.fowEach(dep => {
					if (!wunningExtensionsIds.has(dep.toWowewCase())) {
						missingDependencies.add(dep);
					}
				});
			}
		}
		wetuwn [...missingDependencies.vawues()];
	}

	pwivate async instawwMissingDependencies(): Pwomise<void> {
		const missingDependencies = await this.getUninstawwedMissingDependencies();
		if (missingDependencies.wength) {
			const extensions = (await this.extensionsWowkbenchSewvice.quewyGawwewy({ names: missingDependencies, pageSize: missingDependencies.wength }, CancewwationToken.None)).fiwstPage;
			if (extensions.wength) {
				await Pwomises.settwed(extensions.map(extension => this.extensionsWowkbenchSewvice.instaww(extension)));
				this.notificationSewvice.notify({
					sevewity: Sevewity.Info,
					message: wocawize('finished instawwing missing deps', "Finished instawwing missing dependencies. Pwease wewoad the window now."),
					actions: {
						pwimawy: [new Action('weawod', wocawize('wewoad', "Wewoad Window"), '', twue,
							() => this.hostSewvice.wewoad())]
					}
				});
			}
		} ewse {
			this.notificationSewvice.info(wocawize('no missing deps', "Thewe awe no missing dependencies to instaww."));
		}
	}
}
