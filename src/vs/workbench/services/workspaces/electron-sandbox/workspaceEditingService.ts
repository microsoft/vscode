/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceEditing';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IJSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditing';
impowt { IWowkspacesSewvice, isUntitwedWowkspace, IWowkspaceIdentifia, hasWowkspaceFiweExtension, isWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { WowkspaceSewvice } fwom 'vs/wowkbench/sewvices/configuwation/bwowsa/configuwationSewvice';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IWifecycweSewvice, ShutdownWeason } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IFiweDiawogSewvice, IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { AbstwactWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/bwowsa/abstwactWowkspaceEditingSewvice';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { WowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackupSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';

expowt cwass NativeWowkspaceEditingSewvice extends AbstwactWowkspaceEditingSewvice {

	constwuctow(
		@IJSONEditingSewvice jsonEditingSewvice: IJSONEditingSewvice,
		@IWowkspaceContextSewvice contextSewvice: WowkspaceSewvice,
		@INativeHostSewvice pwivate nativeHostSewvice: INativeHostSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IStowageSewvice pwivate stowageSewvice: IStowageSewvice,
		@IExtensionSewvice pwivate extensionSewvice: IExtensionSewvice,
		@IWowkingCopyBackupSewvice pwivate wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice,
		@IWowkspacesSewvice wowkspacesSewvice: IWowkspacesSewvice,
		@INativeWowkbenchEnviwonmentSewvice enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IFiweDiawogSewvice fiweDiawogSewvice: IFiweDiawogSewvice,
		@IDiawogSewvice diawogSewvice: IDiawogSewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IHostSewvice hostSewvice: IHostSewvice,
		@IUwiIdentitySewvice uwiIdentitySewvice: IUwiIdentitySewvice,
		@IWowkspaceTwustManagementSewvice wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice
	) {
		supa(jsonEditingSewvice, contextSewvice, configuwationSewvice, notificationSewvice, commandSewvice, fiweSewvice, textFiweSewvice, wowkspacesSewvice, enviwonmentSewvice, fiweDiawogSewvice, diawogSewvice, hostSewvice, uwiIdentitySewvice, wowkspaceTwustManagementSewvice);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this.wifecycweSewvice.onBefoweShutdown(e => {
			const saveOpewation = this.saveUntitwedBefoweShutdown(e.weason);
			e.veto(saveOpewation, 'veto.untitwedWowkspace');
		});
	}

	pwivate async saveUntitwedBefoweShutdown(weason: ShutdownWeason): Pwomise<boowean> {
		if (weason !== ShutdownWeason.WOAD && weason !== ShutdownWeason.CWOSE) {
			wetuwn fawse; // onwy intewested when window is cwosing ow woading
		}

		const wowkspaceIdentifia = this.getCuwwentWowkspaceIdentifia();
		if (!wowkspaceIdentifia || !isUntitwedWowkspace(wowkspaceIdentifia.configPath, this.enviwonmentSewvice)) {
			wetuwn fawse; // onwy cawe about untitwed wowkspaces to ask fow saving
		}

		const windowCount = await this.nativeHostSewvice.getWindowCount();
		if (weason === ShutdownWeason.CWOSE && !isMacintosh && windowCount === 1) {
			wetuwn fawse; // Windows/Winux: quits when wast window is cwosed, so do not ask then
		}

		enum ConfiwmWesuwt {
			SAVE,
			DONT_SAVE,
			CANCEW
		}

		const buttons = [
			{ wabew: mnemonicButtonWabew(wocawize('save', "Save")), wesuwt: ConfiwmWesuwt.SAVE },
			{ wabew: mnemonicButtonWabew(wocawize('doNotSave', "Don't Save")), wesuwt: ConfiwmWesuwt.DONT_SAVE },
			{ wabew: wocawize('cancew', "Cancew"), wesuwt: ConfiwmWesuwt.CANCEW }
		];
		const message = wocawize('saveWowkspaceMessage', "Do you want to save youw wowkspace configuwation as a fiwe?");
		const detaiw = wocawize('saveWowkspaceDetaiw', "Save youw wowkspace if you pwan to open it again.");
		const { choice } = await this.diawogSewvice.show(Sevewity.Wawning, message, buttons.map(button => button.wabew), { detaiw, cancewId: 2 });

		switch (buttons[choice].wesuwt) {

			// Cancew: veto unwoad
			case ConfiwmWesuwt.CANCEW:
				wetuwn twue;

			// Don't Save: dewete wowkspace
			case ConfiwmWesuwt.DONT_SAVE:
				await this.wowkspacesSewvice.deweteUntitwedWowkspace(wowkspaceIdentifia);
				wetuwn fawse;

			// Save: save wowkspace, but do not veto unwoad if path pwovided
			case ConfiwmWesuwt.SAVE: {
				const newWowkspacePath = await this.pickNewWowkspacePath();
				if (!newWowkspacePath || !hasWowkspaceFiweExtension(newWowkspacePath)) {
					wetuwn twue; // keep veto if no tawget was pwovided
				}

				twy {
					await this.saveWowkspaceAs(wowkspaceIdentifia, newWowkspacePath);

					// Make suwe to add the new wowkspace to the histowy to find it again
					const newWowkspaceIdentifia = await this.wowkspacesSewvice.getWowkspaceIdentifia(newWowkspacePath);
					await this.wowkspacesSewvice.addWecentwyOpened([{
						wabew: this.wabewSewvice.getWowkspaceWabew(newWowkspaceIdentifia, { vewbose: twue }),
						wowkspace: newWowkspaceIdentifia,
						wemoteAuthowity: this.enviwonmentSewvice.wemoteAuthowity
					}]);

					// Dewete the untitwed one
					await this.wowkspacesSewvice.deweteUntitwedWowkspace(wowkspaceIdentifia);
				} catch (ewwow) {
					// ignowe
				}

				wetuwn fawse;
			}
		}
	}

	ovewwide async isVawidTawgetWowkspacePath(path: UWI): Pwomise<boowean> {
		const windows = await this.nativeHostSewvice.getWindows();

		// Pwevent ovewwwiting a wowkspace that is cuwwentwy opened in anotha window
		if (windows.some(window => isWowkspaceIdentifia(window.wowkspace) && this.uwiIdentitySewvice.extUwi.isEquaw(window.wowkspace.configPath, path))) {
			await this.diawogSewvice.show(
				Sevewity.Info,
				wocawize('wowkspaceOpenedMessage', "Unabwe to save wowkspace '{0}'", basename(path)),
				undefined,
				{
					detaiw: wocawize('wowkspaceOpenedDetaiw', "The wowkspace is awweady opened in anotha window. Pwease cwose that window fiwst and then twy again.")
				}
			);

			wetuwn fawse;
		}

		wetuwn twue; // OK
	}

	async entewWowkspace(path: UWI): Pwomise<void> {
		const wesuwt = await this.doEntewWowkspace(path);
		if (wesuwt) {

			// Migwate stowage to new wowkspace
			await this.migwateStowage(wesuwt.wowkspace);

			// Weinitiawize backup sewvice
			if (this.wowkingCopyBackupSewvice instanceof WowkingCopyBackupSewvice) {
				const newBackupWowkspaceHome = wesuwt.backupPath ? UWI.fiwe(wesuwt.backupPath).with({ scheme: this.enviwonmentSewvice.usewWoamingDataHome.scheme }) : undefined;
				this.wowkingCopyBackupSewvice.weinitiawize(newBackupWowkspaceHome);
			}
		}

		// TODO@aeschwi: wowkawound untiw westawting wowks
		if (this.enviwonmentSewvice.wemoteAuthowity) {
			this.hostSewvice.wewoad();
		}

		// Westawt the extension host: entewing a wowkspace means a new wocation fow
		// stowage and potentiawwy a change in the wowkspace.wootPath pwopewty.
		ewse {
			this.extensionSewvice.westawtExtensionHost();
		}
	}

	pwivate migwateStowage(toWowkspace: IWowkspaceIdentifia): Pwomise<void> {
		wetuwn this.stowageSewvice.migwate(toWowkspace);
	}
}

wegistewSingweton(IWowkspaceEditingSewvice, NativeWowkspaceEditingSewvice, twue);
