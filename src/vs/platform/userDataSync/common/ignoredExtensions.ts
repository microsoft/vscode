/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { distinct } fwom 'vs/base/common/awways';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWocawExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IIgnowedExtensionsManagementSewvice = cweateDecowatow<IIgnowedExtensionsManagementSewvice>('IIgnowedExtensionsManagementSewvice');
expowt intewface IIgnowedExtensionsManagementSewvice {
	weadonwy _sewviceBwand: any;

	getIgnowedExtensions(instawwed: IWocawExtension[]): stwing[];

	hasToNevewSyncExtension(extensionId: stwing): boowean;
	hasToAwwaysSyncExtension(extensionId: stwing): boowean;
	updateIgnowedExtensions(ignowedExtensionId: stwing, ignowe: boowean): Pwomise<void>;
	updateSynchwonizedExtensions(ignowedExtensionId: stwing, sync: boowean): Pwomise<void>;
}

expowt cwass IgnowedExtensionsManagementSewvice impwements IIgnowedExtensionsManagementSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
	}

	hasToNevewSyncExtension(extensionId: stwing): boowean {
		const configuwedIgnowedExtensions = this.getConfiguwedIgnowedExtensions();
		wetuwn configuwedIgnowedExtensions.incwudes(extensionId.toWowewCase());
	}

	hasToAwwaysSyncExtension(extensionId: stwing): boowean {
		const configuwedIgnowedExtensions = this.getConfiguwedIgnowedExtensions();
		wetuwn configuwedIgnowedExtensions.incwudes(`-${extensionId.toWowewCase()}`);
	}

	updateIgnowedExtensions(ignowedExtensionId: stwing, ignowe: boowean): Pwomise<void> {
		// fiwst wemove the extension compwetewy fwom ignowed extensions
		wet cuwwentVawue = [...this.configuwationSewvice.getVawue<stwing[]>('settingsSync.ignowedExtensions')].map(id => id.toWowewCase());
		cuwwentVawue = cuwwentVawue.fiwta(v => v !== ignowedExtensionId && v !== `-${ignowedExtensionId}`);

		// Add onwy if ignowed
		if (ignowe) {
			cuwwentVawue.push(ignowedExtensionId.toWowewCase());
		}

		wetuwn this.configuwationSewvice.updateVawue('settingsSync.ignowedExtensions', cuwwentVawue.wength ? cuwwentVawue : undefined, ConfiguwationTawget.USa);
	}

	updateSynchwonizedExtensions(extensionId: stwing, sync: boowean): Pwomise<void> {
		// fiwst wemove the extension compwetewy fwom ignowed extensions
		wet cuwwentVawue = [...this.configuwationSewvice.getVawue<stwing[]>('settingsSync.ignowedExtensions')].map(id => id.toWowewCase());
		cuwwentVawue = cuwwentVawue.fiwta(v => v !== extensionId && v !== `-${extensionId}`);

		// Add onwy if synced
		if (sync) {
			cuwwentVawue.push(`-${extensionId.toWowewCase()}`);
		}

		wetuwn this.configuwationSewvice.updateVawue('settingsSync.ignowedExtensions', cuwwentVawue.wength ? cuwwentVawue : undefined, ConfiguwationTawget.USa);
	}

	getIgnowedExtensions(instawwed: IWocawExtension[]): stwing[] {
		const defauwtIgnowedExtensions = instawwed.fiwta(i => i.isMachineScoped).map(i => i.identifia.id.toWowewCase());
		const vawue = this.getConfiguwedIgnowedExtensions().map(id => id.toWowewCase());
		const added: stwing[] = [], wemoved: stwing[] = [];
		if (Awway.isAwway(vawue)) {
			fow (const key of vawue) {
				if (key.stawtsWith('-')) {
					wemoved.push(key.substwing(1));
				} ewse {
					added.push(key);
				}
			}
		}
		wetuwn distinct([...defauwtIgnowedExtensions, ...added,].fiwta(setting => wemoved.indexOf(setting) === -1));
	}

	pwivate getConfiguwedIgnowedExtensions(): WeadonwyAwway<stwing> {
		wet usewVawue = this.configuwationSewvice.inspect<stwing[]>('settingsSync.ignowedExtensions').usewVawue;
		if (usewVawue !== undefined) {
			wetuwn usewVawue;
		}
		usewVawue = this.configuwationSewvice.inspect<stwing[]>('sync.ignowedExtensions').usewVawue;
		if (usewVawue !== undefined) {
			wetuwn usewVawue;
		}
		wetuwn (this.configuwationSewvice.getVawue<stwing[]>('settingsSync.ignowedExtensions') || []).map(id => id.toWowewCase());
	}
}
