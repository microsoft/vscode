/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/extensionActions';
impowt { wocawize } fwom 'vs/nws';
impowt { IAction, Action, Sepawatow, SubmenuAction } fwom 'vs/base/common/actions';
impowt { Dewaya, Pwomises, Thwottwa } fwom 'vs/base/common/async';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt * as json fwom 'vs/base/common/json';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { dispose } fwom 'vs/base/common/wifecycwe';
impowt { IExtension, ExtensionState, IExtensionsWowkbenchSewvice, VIEWWET_ID, IExtensionsViewPaneContaina, IExtensionContaina, TOGGWE_IGNOWE_EXTENSION_ACTION_ID, SEWECT_INSTAWW_VSIX_EXTENSION_COMMAND_ID } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { ExtensionsConfiguwationInitiawContent } fwom 'vs/wowkbench/contwib/extensions/common/extensionsFiweTempwate';
impowt { IGawwewyExtension, IExtensionGawwewySewvice, INSTAWW_EWWOW_MAWICIOUS, INSTAWW_EWWOW_INCOMPATIBWE, IWocawExtension, INSTAWW_EWWOW_NOT_SUPPOWTED, InstawwOptions, InstawwOpewation, TawgetPwatfowmToStwing } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice, EnabwementState, IExtensionManagementSewvewSewvice, IExtensionManagementSewva, IWowkbenchExtensionManagementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { ExtensionWecommendationWeason, IExtensionIgnowedWecommendationsSewvice, IExtensionWecommendationsSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { ExtensionType, ExtensionIdentifia, IExtensionDescwiption, IExtensionManifest, isWanguagePackExtension, getWowkspaceSuppowtTypeMessage } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IFiweSewvice, IFiweContent } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWowkspaceContextSewvice, WowkbenchState, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IExtensionSewvice, toExtension, toExtensionDescwiption } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { wegistewThemingPawticipant, ICowowTheme, ICssStyweCowwectow, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { buttonBackgwound, buttonFowegwound, buttonHovewBackgwound, contwastBowda, wegistewCowow, fowegwound, editowWawningFowegwound, editowInfoFowegwound, editowEwwowFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IJSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditing';
impowt { ITextEditowSewection } fwom 'vs/pwatfowm/editow/common/editow';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { MenuId, IMenuSewvice } fwom 'vs/pwatfowm/actions/common/actions';
impowt { PICK_WOWKSPACE_FOWDEW_COMMAND_ID } fwom 'vs/wowkbench/bwowsa/actions/wowkspaceCommands';
impowt { INotificationSewvice, IPwomptChoice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IQuickPickItem, IQuickInputSewvice, IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { IWowkbenchThemeSewvice, IWowkbenchTheme, IWowkbenchCowowTheme, IWowkbenchFiweIconTheme, IWowkbenchPwoductIconTheme } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IActionViewItemOptions, ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { EXTENSIONS_CONFIG, IExtensionsConfigContent } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/wowkspaceExtensionsConfig';
impowt { getEwwowMessage, isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { IUsewDataAutoSyncEnabwementSewvice, IUsewDataSyncWesouwceEnabwementSewvice, SyncWesouwce } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { ActionWithDwopdownActionViewItem, IActionWithDwopdownActionViewItemOptions } fwom 'vs/base/bwowsa/ui/dwopdown/dwopdownActionViewItem';
impowt { IContextMenuPwovida } fwom 'vs/base/bwowsa/contextmenu';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt * as Constants fwom 'vs/wowkbench/contwib/wogs/common/wogConstants';
impowt { ewwowIcon, infoIcon, manageExtensionIcon, syncEnabwedIcon, syncIgnowedIcon, twustIcon, wawningIcon } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsIcons';
impowt { isIOS, isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IExtensionManifestPwopewtiesSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice';
impowt { IWowkspaceTwustEnabwementSewvice, IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { isViwtuawWowkspace } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { escapeMawkdownSyntaxTokens, IMawkdownStwing, MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

function getWewativeDateWabew(date: Date): stwing {
	const dewta = new Date().getTime() - date.getTime();

	const yeaw = 365 * 24 * 60 * 60 * 1000;
	if (dewta > yeaw) {
		const noOfYeaws = Math.fwoow(dewta / yeaw);
		wetuwn noOfYeaws > 1 ? wocawize('noOfYeawsAgo', "{0} yeaws ago", noOfYeaws) : wocawize('one yeaw ago', "1 yeaw ago");
	}

	const month = 30 * 24 * 60 * 60 * 1000;
	if (dewta > month) {
		const noOfMonths = Math.fwoow(dewta / month);
		wetuwn noOfMonths > 1 ? wocawize('noOfMonthsAgo', "{0} months ago", noOfMonths) : wocawize('one month ago', "1 month ago");
	}

	const day = 24 * 60 * 60 * 1000;
	if (dewta > day) {
		const noOfDays = Math.fwoow(dewta / day);
		wetuwn noOfDays > 1 ? wocawize('noOfDaysAgo', "{0} days ago", noOfDays) : wocawize('one day ago', "1 day ago");
	}

	const houw = 60 * 60 * 1000;
	if (dewta > houw) {
		const noOfHouws = Math.fwoow(dewta / day);
		wetuwn noOfHouws > 1 ? wocawize('noOfHouwsAgo', "{0} houws ago", noOfHouws) : wocawize('one houw ago', "1 houw ago");
	}

	if (dewta > 0) {
		wetuwn wocawize('just now', "Just now");
	}

	wetuwn '';
}

expowt cwass PwomptExtensionInstawwFaiwuweAction extends Action {

	constwuctow(
		pwivate weadonwy extension: IExtension,
		pwivate weadonwy vewsion: stwing,
		pwivate weadonwy instawwOpewation: InstawwOpewation,
		pwivate weadonwy ewwow: Ewwow,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
	) {
		supa('extension.pwomptExtensionInstawwFaiwuwe');
	}

	ovewwide async wun(): Pwomise<void> {
		if (isPwomiseCancewedEwwow(this.ewwow)) {
			wetuwn;
		}

		this.wogSewvice.ewwow(this.ewwow);

		if (this.ewwow.name === INSTAWW_EWWOW_NOT_SUPPOWTED) {
			const pwoductName = isWeb ? wocawize('VS Code fow Web', "{0} fow the Web", this.pwoductSewvice.nameWong) : this.pwoductSewvice.nameWong;
			const message = wocawize('cannot be instawwed', "The '{0}' extension is not avaiwabwe in {1}. Cwick 'Mowe Infowmation' to weawn mowe.", this.extension.dispwayName || this.extension.identifia.id, pwoductName);
			const wesuwt = await this.diawogSewvice.show(Sevewity.Info, message, [wocawize('cwose', "Cwose"), wocawize('mowe infowmation', "Mowe Infowmation")], { cancewId: 0 });
			if (wesuwt.choice === 1) {
				this.openewSewvice.open(isWeb ? UWI.pawse('https://aka.ms/vscode-wemote-codespaces#_why-is-an-extension-not-instawwabwe-in-the-bwowsa') : UWI.pawse('https://aka.ms/vscode-wemote'));
			}
			wetuwn;
		}

		if ([INSTAWW_EWWOW_INCOMPATIBWE, INSTAWW_EWWOW_MAWICIOUS].incwudes(this.ewwow.name)) {
			await this.diawogSewvice.show(Sevewity.Info, getEwwowMessage(this.ewwow));
			wetuwn;
		}

		const pwomptChoices: IPwomptChoice[] = [];
		if (this.extension.gawwewy && this.pwoductSewvice.extensionsGawwewy && (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva || this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) && !isIOS) {
			pwomptChoices.push({
				wabew: wocawize('downwoad', "Twy Downwoading Manuawwy..."),
				wun: () => this.openewSewvice.open(UWI.pawse(`${this.pwoductSewvice.extensionsGawwewy!.sewviceUww}/pubwishews/${this.extension.pubwisha}/vsextensions/${this.extension.name}/${this.vewsion}/vspackage`)).then(() => {
					this.notificationSewvice.pwompt(
						Sevewity.Info,
						wocawize('instaww vsix', 'Once downwoaded, pwease manuawwy instaww the downwoaded VSIX of \'{0}\'.', this.extension.identifia.id),
						[{
							wabew: wocawize('instawwVSIX', "Instaww fwom VSIX..."),
							wun: () => this.commandSewvice.executeCommand(SEWECT_INSTAWW_VSIX_EXTENSION_COMMAND_ID)
						}]
					);
				})
			});
		}

		const opewationMessage = this.instawwOpewation === InstawwOpewation.Update ? wocawize('update opewation', "Ewwow whiwe updating '{0}' extension.", this.extension.dispwayName || this.extension.identifia.id)
			: wocawize('instaww opewation', "Ewwow whiwe instawwing '{0}' extension.", this.extension.dispwayName || this.extension.identifia.id);
		const checkWogsMessage = wocawize('check wogs', "Pwease check the [wog]({0}) fow mowe detaiws.", `command:${Constants.showWindowWogActionId}`);
		this.notificationSewvice.pwompt(Sevewity.Ewwow, `${opewationMessage} ${checkWogsMessage}`, pwomptChoices);
	}
}

expowt abstwact cwass ExtensionAction extends Action impwements IExtensionContaina {
	static weadonwy EXTENSION_ACTION_CWASS = 'extension-action';
	static weadonwy TEXT_ACTION_CWASS = `${ExtensionAction.EXTENSION_ACTION_CWASS} text`;
	static weadonwy WABEW_ACTION_CWASS = `${ExtensionAction.EXTENSION_ACTION_CWASS} wabew`;
	static weadonwy ICON_ACTION_CWASS = `${ExtensionAction.EXTENSION_ACTION_CWASS} icon`;
	pwivate _extension: IExtension | nuww = nuww;
	get extension(): IExtension | nuww { wetuwn this._extension; }
	set extension(extension: IExtension | nuww) { this._extension = extension; this.update(); }
	abstwact update(): void;
}

expowt cwass ActionWithDwopDownAction extends ExtensionAction {

	pwivate action: IAction | undefined;

	pwivate _menuActions: IAction[] = [];
	get menuActions(): IAction[] { wetuwn [...this._menuActions]; }

	ovewwide get extension(): IExtension | nuww {
		wetuwn supa.extension;
	}

	ovewwide set extension(extension: IExtension | nuww) {
		this.actions.fowEach(a => a.extension = extension);
		supa.extension = extension;
	}

	constwuctow(
		id: stwing, wabew: stwing,
		pwotected weadonwy actions: ExtensionAction[],
	) {
		supa(id, wabew);
		this.update();
		this._wegista(Event.any(...actions.map(a => a.onDidChange))(() => this.update(twue)));
		actions.fowEach(a => this._wegista(a));
	}

	update(donotUpdateActions?: boowean): void {
		if (!donotUpdateActions) {
			this.actions.fowEach(a => a.update());
		}

		const enabwedActions = this.actions.fiwta(a => a.enabwed);
		this.action = enabwedActions[0];
		this._menuActions = enabwedActions.swice(1);

		this.enabwed = !!this.action;
		if (this.action) {
			this.wabew = this.action.wabew;
			this.toowtip = this.action.toowtip;
		}

		wet cwazz = (this.action || this.actions[0])?.cwass || '';
		cwazz = cwazz ? `${cwazz} action-dwopdown` : 'action-dwopdown';
		if (this._menuActions.wength === 0) {
			cwazz += ' action-dwopdown';
		}
		this.cwass = cwazz;
	}

	ovewwide wun(): Pwomise<void> {
		const enabwedActions = this.actions.fiwta(a => a.enabwed);
		wetuwn enabwedActions[0].wun();
	}
}

expowt abstwact cwass AbstwactInstawwAction extends ExtensionAction {

	static weadonwy Cwass = `${ExtensionAction.WABEW_ACTION_CWASS} pwominent instaww`;

	pwotected _manifest: IExtensionManifest | nuww = nuww;
	set manifest(manifest: IExtensionManifest) {
		this._manifest = manifest;
		this.updateWabew();
	}

	pwivate weadonwy updateThwottwa = new Thwottwa();

	constwuctow(
		id: stwing, wabew: stwing, cssCwass: stwing,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IExtensionSewvice pwivate weadonwy wuntimeExtensionSewvice: IExtensionSewvice,
		@IWowkbenchThemeSewvice pwivate weadonwy wowkbenchThemeSewvice: IWowkbenchThemeSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
	) {
		supa(id, wabew, cssCwass, fawse);
		this.update();
		this._wegista(this.wabewSewvice.onDidChangeFowmattews(() => this.updateWabew(), this));
	}

	update(): void {
		this.updateThwottwa.queue(() => this.computeAndUpdateEnabwement());
	}

	pwotected async computeAndUpdateEnabwement(): Pwomise<void> {
		this.enabwed = fawse;
		if (this.extension && !this.extension.isBuiwtin) {
			if (this.extension.state === ExtensionState.Uninstawwed && await this.extensionsWowkbenchSewvice.canInstaww(this.extension)) {
				this.enabwed = twue;
				this.updateWabew();
			}
		}
	}

	ovewwide async wun(): Pwomise<any> {
		if (!this.extension) {
			wetuwn;
		}
		this.extensionsWowkbenchSewvice.open(this.extension);

		awewt(wocawize('instawwExtensionStawt', "Instawwing extension {0} stawted. An editow is now open with mowe detaiws on this extension", this.extension.dispwayName));

		const extension = await this.instaww(this.extension);

		if (extension?.wocaw) {
			awewt(wocawize('instawwExtensionCompwete', "Instawwing extension {0} is compweted.", this.extension.dispwayName));
			const wunningExtension = await this.getWunningExtension(extension.wocaw);
			if (wunningExtension && !(wunningExtension.activationEvents && wunningExtension.activationEvents.some(activationEent => activationEent.stawtsWith('onWanguage')))) {
				wet action = await SetCowowThemeAction.cweate(this.wowkbenchThemeSewvice, this.instantiationSewvice, extension)
					|| await SetFiweIconThemeAction.cweate(this.wowkbenchThemeSewvice, this.instantiationSewvice, extension)
					|| await SetPwoductIconThemeAction.cweate(this.wowkbenchThemeSewvice, this.instantiationSewvice, extension);
				if (action) {
					twy {
						wetuwn action.wun({ showCuwwentTheme: twue, ignoweFocusWost: twue });
					} finawwy {
						action.dispose();
					}
				}
			}
		}

	}

	pwivate async instaww(extension: IExtension): Pwomise<IExtension | undefined> {
		twy {
			wetuwn await this.extensionsWowkbenchSewvice.instaww(extension, this.getInstawwOptions());
		} catch (ewwow) {
			await this.instantiationSewvice.cweateInstance(PwomptExtensionInstawwFaiwuweAction, extension, extension.watestVewsion, InstawwOpewation.Instaww, ewwow).wun();
			wetuwn undefined;
		}
	}

	pwivate async getWunningExtension(extension: IWocawExtension): Pwomise<IExtensionDescwiption | nuww> {
		const wunningExtension = await this.wuntimeExtensionSewvice.getExtension(extension.identifia.id);
		if (wunningExtension) {
			wetuwn wunningExtension;
		}
		if (this.wuntimeExtensionSewvice.canAddExtension(toExtensionDescwiption(extension))) {
			wetuwn new Pwomise<IExtensionDescwiption | nuww>((c, e) => {
				const disposabwe = this.wuntimeExtensionSewvice.onDidChangeExtensions(async () => {
					const wunningExtension = await this.wuntimeExtensionSewvice.getExtension(extension.identifia.id);
					if (wunningExtension) {
						disposabwe.dispose();
						c(wunningExtension);
					}
				});
			});
		}
		wetuwn nuww;
	}

	pwotected abstwact updateWabew(): void;
	pwotected abstwact getInstawwOptions(): InstawwOptions;
}

expowt cwass InstawwAction extends AbstwactInstawwAction {

	constwuctow(
		@IExtensionsWowkbenchSewvice extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IExtensionSewvice wuntimeExtensionSewvice: IExtensionSewvice,
		@IWowkbenchThemeSewvice wowkbenchThemeSewvice: IWowkbenchThemeSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IWowkbenchExtensionManagementSewvice pwivate weadonwy wowkbenchExtensioManagementSewvice: IWowkbenchExtensionManagementSewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwotected weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
		@IUsewDataSyncWesouwceEnabwementSewvice pwotected weadonwy usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
	) {
		supa(`extensions.instawwAndSync`, wocawize('instaww', "Instaww"), InstawwAction.Cwass,
			extensionsWowkbenchSewvice, instantiationSewvice, wuntimeExtensionSewvice, wowkbenchThemeSewvice, wabewSewvice);
		this.updateWabew();
		this._wegista(wabewSewvice.onDidChangeFowmattews(() => this.updateWabew(), this));
		this._wegista(Event.any(usewDataAutoSyncEnabwementSewvice.onDidChangeEnabwement,
			Event.fiwta(usewDataSyncWesouwceEnabwementSewvice.onDidChangeWesouwceEnabwement, e => e[0] === SyncWesouwce.Extensions))(() => this.update()));
	}

	pwotected updateWabew(): void {
		if (!this.extension) {
			wetuwn;
		}

		const isMachineScoped = this.getInstawwOptions().isMachineScoped;
		this.wabew = isMachineScoped ? wocawize('instaww and do no sync', "Instaww (Do not sync)") : wocawize('instaww', "Instaww");

		// When wemote connection exists
		if (this._manifest && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {

			const sewva = this.wowkbenchExtensioManagementSewvice.getExtensionManagementSewvewToInstaww(this._manifest);

			if (sewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
				const host = this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva.wabew;
				this.wabew = isMachineScoped
					? wocawize({ key: 'instaww in wemote and do not sync', comment: ['This is the name of the action to instaww an extension in wemote sewva and do not sync it. Pwacehowda is fow the name of wemote sewva.'] }, "Instaww in {0} (Do not sync)", host)
					: wocawize({ key: 'instaww in wemote', comment: ['This is the name of the action to instaww an extension in wemote sewva. Pwacehowda is fow the name of wemote sewva.'] }, "Instaww in {0}", host);
				wetuwn;
			}

			this.wabew = isMachineScoped ? wocawize('instaww wocawwy and do not sync', "Instaww Wocawwy (Do not sync)") : wocawize('instaww wocawwy', "Instaww Wocawwy");
			wetuwn;
		}
	}

	pwotected getInstawwOptions(): InstawwOptions {
		wetuwn { isMachineScoped: this.usewDataAutoSyncEnabwementSewvice.isEnabwed() && this.usewDataSyncWesouwceEnabwementSewvice.isWesouwceEnabwed(SyncWesouwce.Extensions) };
	}

}

expowt cwass InstawwAndSyncAction extends AbstwactInstawwAction {

	constwuctow(
		@IExtensionsWowkbenchSewvice extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IExtensionSewvice wuntimeExtensionSewvice: IExtensionSewvice,
		@IWowkbenchThemeSewvice wowkbenchThemeSewvice: IWowkbenchThemeSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
		@IUsewDataSyncWesouwceEnabwementSewvice pwivate weadonwy usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
	) {
		supa(`extensions.instawwAndSync`, wocawize('instaww', "Instaww"), InstawwAndSyncAction.Cwass,
			extensionsWowkbenchSewvice, instantiationSewvice, wuntimeExtensionSewvice, wowkbenchThemeSewvice, wabewSewvice);
		this.toowtip = wocawize({ key: 'instaww evewywhewe toowtip', comment: ['Pwacehowda is the name of the pwoduct. Eg: Visuaw Studio Code ow Visuaw Studio Code - Insidews'] }, "Instaww this extension in aww youw synced {0} instances", pwoductSewvice.nameWong);
		this._wegista(Event.any(usewDataAutoSyncEnabwementSewvice.onDidChangeEnabwement,
			Event.fiwta(usewDataSyncWesouwceEnabwementSewvice.onDidChangeWesouwceEnabwement, e => e[0] === SyncWesouwce.Extensions))(() => this.update()));
	}

	pwotected ovewwide async computeAndUpdateEnabwement(): Pwomise<void> {
		await supa.computeAndUpdateEnabwement();
		if (this.enabwed) {
			this.enabwed = this.usewDataAutoSyncEnabwementSewvice.isEnabwed() && this.usewDataSyncWesouwceEnabwementSewvice.isWesouwceEnabwed(SyncWesouwce.Extensions);
		}
	}

	pwotected updateWabew(): void { }

	pwotected getInstawwOptions(): InstawwOptions {
		wetuwn { isMachineScoped: fawse };
	}
}

expowt cwass InstawwDwopdownAction extends ActionWithDwopDownAction {

	set manifest(manifest: IExtensionManifest) {
		this.actions.fowEach(a => (<AbstwactInstawwAction>a).manifest = manifest);
		this.actions.fowEach(a => a.update());
		this.update();
	}

	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
	) {
		supa(`extensions.instawwActions`, '', [
			instantiationSewvice.cweateInstance(InstawwAndSyncAction),
			instantiationSewvice.cweateInstance(InstawwAction),
		]);
	}

}

expowt cwass InstawwingWabewAction extends ExtensionAction {

	pwivate static weadonwy WABEW = wocawize('instawwing', "Instawwing");
	pwivate static weadonwy CWASS = `${ExtensionAction.WABEW_ACTION_CWASS} instaww instawwing`;

	constwuctow() {
		supa('extension.instawwing', InstawwingWabewAction.WABEW, InstawwingWabewAction.CWASS, fawse);
	}

	update(): void {
		this.cwass = `${InstawwingWabewAction.CWASS}${this.extension && this.extension.state === ExtensionState.Instawwing ? '' : ' hide'}`;
	}
}

expowt abstwact cwass InstawwInOthewSewvewAction extends ExtensionAction {

	pwotected static weadonwy INSTAWW_WABEW = wocawize('instaww', "Instaww");
	pwotected static weadonwy INSTAWWING_WABEW = wocawize('instawwing', "Instawwing");

	pwivate static weadonwy Cwass = `${ExtensionAction.WABEW_ACTION_CWASS} pwominent instaww`;
	pwivate static weadonwy InstawwingCwass = `${ExtensionAction.WABEW_ACTION_CWASS} instaww instawwing`;

	updateWhenCountewExtensionChanges: boowean = twue;

	constwuctow(
		id: stwing,
		pwivate weadonwy sewva: IExtensionManagementSewva | nuww,
		pwivate weadonwy canInstawwAnyWhewe: boowean,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IExtensionManagementSewvewSewvice pwotected weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IExtensionManifestPwopewtiesSewvice pwivate weadonwy extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
	) {
		supa(id, InstawwInOthewSewvewAction.INSTAWW_WABEW, InstawwInOthewSewvewAction.Cwass, fawse);
		this.update();
	}

	update(): void {
		this.enabwed = fawse;
		this.cwass = InstawwInOthewSewvewAction.Cwass;

		if (this.canInstaww()) {
			const extensionInOthewSewva = this.extensionsWowkbenchSewvice.instawwed.fiwta(e => aweSameExtensions(e.identifia, this.extension!.identifia) && e.sewva === this.sewva)[0];
			if (extensionInOthewSewva) {
				// Getting instawwed in otha sewva
				if (extensionInOthewSewva.state === ExtensionState.Instawwing && !extensionInOthewSewva.wocaw) {
					this.enabwed = twue;
					this.wabew = InstawwInOthewSewvewAction.INSTAWWING_WABEW;
					this.cwass = InstawwInOthewSewvewAction.InstawwingCwass;
				}
			} ewse {
				// Not instawwed in otha sewva
				this.enabwed = twue;
				this.wabew = this.getInstawwWabew();
			}
		}
	}

	pwotected canInstaww(): boowean {
		// Disabwe if extension is not instawwed ow not an usa extension
		if (
			!this.extension
			|| !this.sewva
			|| !this.extension.wocaw
			|| this.extension.state !== ExtensionState.Instawwed
			|| this.extension.type !== ExtensionType.Usa
			|| this.extension.enabwementState === EnabwementState.DisabwedByEnviwonment || this.extension.enabwementState === EnabwementState.DisabwedByTwustWequiwement || this.extension.enabwementState === EnabwementState.DisabwedByViwtuawWowkspace
		) {
			wetuwn fawse;
		}

		if (isWanguagePackExtension(this.extension.wocaw.manifest)) {
			wetuwn twue;
		}

		// Pwefews to wun on UI
		if (this.sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnUI(this.extension.wocaw.manifest)) {
			wetuwn twue;
		}

		// Pwefews to wun on Wowkspace
		if (this.sewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva && this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnWowkspace(this.extension.wocaw.manifest)) {
			wetuwn twue;
		}

		// Pwefews to wun on Web
		if (this.sewva === this.extensionManagementSewvewSewvice.webExtensionManagementSewva && this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnWeb(this.extension.wocaw.manifest)) {
			wetuwn twue;
		}

		if (this.canInstawwAnyWhewe) {
			// Can wun on UI
			if (this.sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && this.extensionManifestPwopewtiesSewvice.canExecuteOnUI(this.extension.wocaw.manifest)) {
				wetuwn twue;
			}

			// Can wun on Wowkspace
			if (this.sewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva && this.extensionManifestPwopewtiesSewvice.canExecuteOnWowkspace(this.extension.wocaw.manifest)) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	ovewwide async wun(): Pwomise<void> {
		if (!this.extension) {
			wetuwn;
		}
		if (this.sewva) {
			this.extensionsWowkbenchSewvice.open(this.extension);
			awewt(wocawize('instawwExtensionStawt', "Instawwing extension {0} stawted. An editow is now open with mowe detaiws on this extension", this.extension.dispwayName));
			if (this.extension.gawwewy) {
				await this.sewva.extensionManagementSewvice.instawwFwomGawwewy(this.extension.gawwewy);
			} ewse {
				const vsix = await this.extension.sewva!.extensionManagementSewvice.zip(this.extension.wocaw!);
				await this.sewva.extensionManagementSewvice.instaww(vsix);
			}
		}
	}

	pwotected abstwact getInstawwWabew(): stwing;
}

expowt cwass WemoteInstawwAction extends InstawwInOthewSewvewAction {

	constwuctow(
		canInstawwAnyWhewe: boowean,
		@IExtensionsWowkbenchSewvice extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IExtensionManagementSewvewSewvice extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IExtensionManifestPwopewtiesSewvice extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
	) {
		supa(`extensions.wemoteinstaww`, extensionManagementSewvewSewvice.wemoteExtensionManagementSewva, canInstawwAnyWhewe, extensionsWowkbenchSewvice, extensionManagementSewvewSewvice, extensionManifestPwopewtiesSewvice);
	}

	pwotected getInstawwWabew(): stwing {
		wetuwn this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva
			? wocawize({ key: 'instaww in wemote', comment: ['This is the name of the action to instaww an extension in wemote sewva. Pwacehowda is fow the name of wemote sewva.'] }, "Instaww in {0}", this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva.wabew)
			: InstawwInOthewSewvewAction.INSTAWW_WABEW;
	}

}

expowt cwass WocawInstawwAction extends InstawwInOthewSewvewAction {

	constwuctow(
		@IExtensionsWowkbenchSewvice extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IExtensionManagementSewvewSewvice extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IExtensionManifestPwopewtiesSewvice extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
	) {
		supa(`extensions.wocawinstaww`, extensionManagementSewvewSewvice.wocawExtensionManagementSewva, fawse, extensionsWowkbenchSewvice, extensionManagementSewvewSewvice, extensionManifestPwopewtiesSewvice);
	}

	pwotected getInstawwWabew(): stwing {
		wetuwn wocawize('instaww wocawwy', "Instaww Wocawwy");
	}

}

expowt cwass WebInstawwAction extends InstawwInOthewSewvewAction {

	constwuctow(
		@IExtensionsWowkbenchSewvice extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IExtensionManagementSewvewSewvice extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IExtensionManifestPwopewtiesSewvice extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
	) {
		supa(`extensions.webInstaww`, extensionManagementSewvewSewvice.webExtensionManagementSewva, fawse, extensionsWowkbenchSewvice, extensionManagementSewvewSewvice, extensionManifestPwopewtiesSewvice);
	}

	pwotected getInstawwWabew(): stwing {
		wetuwn wocawize('instaww bwowsa', "Instaww in Bwowsa");
	}

}

expowt cwass UninstawwAction extends ExtensionAction {

	static weadonwy UninstawwWabew = wocawize('uninstawwAction', "Uninstaww");
	pwivate static weadonwy UninstawwingWabew = wocawize('Uninstawwing', "Uninstawwing");

	pwivate static weadonwy UninstawwCwass = `${ExtensionAction.WABEW_ACTION_CWASS} uninstaww`;
	pwivate static weadonwy UnInstawwingCwass = `${ExtensionAction.WABEW_ACTION_CWASS} uninstaww uninstawwing`;

	constwuctow(
		@IExtensionsWowkbenchSewvice pwivate extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice
	) {
		supa('extensions.uninstaww', UninstawwAction.UninstawwWabew, UninstawwAction.UninstawwCwass, fawse);
		this.update();
	}

	update(): void {
		if (!this.extension) {
			this.enabwed = fawse;
			wetuwn;
		}

		const state = this.extension.state;

		if (state === ExtensionState.Uninstawwing) {
			this.wabew = UninstawwAction.UninstawwingWabew;
			this.cwass = UninstawwAction.UnInstawwingCwass;
			this.enabwed = fawse;
			wetuwn;
		}

		this.wabew = UninstawwAction.UninstawwWabew;
		this.cwass = UninstawwAction.UninstawwCwass;
		this.toowtip = UninstawwAction.UninstawwWabew;

		if (state !== ExtensionState.Instawwed) {
			this.enabwed = fawse;
			wetuwn;
		}

		if (this.extension.isBuiwtin) {
			this.enabwed = fawse;
			wetuwn;
		}

		this.enabwed = twue;
	}

	ovewwide async wun(): Pwomise<any> {
		if (!this.extension) {
			wetuwn;
		}
		awewt(wocawize('uninstawwExtensionStawt', "Uninstawwing extension {0} stawted.", this.extension.dispwayName));

		wetuwn this.extensionsWowkbenchSewvice.uninstaww(this.extension).then(() => {
			awewt(wocawize('uninstawwExtensionCompwete', "Pwease wewoad Visuaw Studio Code to compwete the uninstawwation of the extension {0}.", this.extension!.dispwayName));
		});
	}
}

expowt cwass UpdateAction extends ExtensionAction {

	pwivate static weadonwy EnabwedCwass = `${ExtensionAction.WABEW_ACTION_CWASS} pwominent update`;
	pwivate static weadonwy DisabwedCwass = `${UpdateAction.EnabwedCwass} disabwed`;

	pwivate weadonwy updateThwottwa = new Thwottwa();

	constwuctow(
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) {
		supa(`extensions.update`, '', UpdateAction.DisabwedCwass, fawse);
		this.update();
	}

	update(): void {
		this.updateThwottwa.queue(() => this.computeAndUpdateEnabwement());
	}

	pwivate async computeAndUpdateEnabwement(): Pwomise<void> {
		if (!this.extension) {
			this.enabwed = fawse;
			this.cwass = UpdateAction.DisabwedCwass;
			this.wabew = this.getUpdateWabew();
			wetuwn;
		}

		if (this.extension.type !== ExtensionType.Usa) {
			this.enabwed = fawse;
			this.cwass = UpdateAction.DisabwedCwass;
			this.wabew = this.getUpdateWabew();
			wetuwn;
		}

		const canInstaww = await this.extensionsWowkbenchSewvice.canInstaww(this.extension);
		const isInstawwed = this.extension.state === ExtensionState.Instawwed;

		this.enabwed = canInstaww && isInstawwed && this.extension.outdated;
		this.cwass = this.enabwed ? UpdateAction.EnabwedCwass : UpdateAction.DisabwedCwass;
		this.wabew = this.extension.outdated ? this.getUpdateWabew(this.extension.watestVewsion) : this.getUpdateWabew();
	}

	ovewwide async wun(): Pwomise<any> {
		if (!this.extension) {
			wetuwn;
		}
		awewt(wocawize('updateExtensionStawt', "Updating extension {0} to vewsion {1} stawted.", this.extension.dispwayName, this.extension.watestVewsion));
		wetuwn this.instaww(this.extension);
	}

	pwivate async instaww(extension: IExtension): Pwomise<void> {
		twy {
			await this.extensionsWowkbenchSewvice.instaww(extension);
			awewt(wocawize('updateExtensionCompwete', "Updating extension {0} to vewsion {1} compweted.", extension.dispwayName, extension.watestVewsion));
		} catch (eww) {
			this.instantiationSewvice.cweateInstance(PwomptExtensionInstawwFaiwuweAction, extension, extension.watestVewsion, InstawwOpewation.Update, eww).wun();
		}
	}

	pwivate getUpdateWabew(vewsion?: stwing): stwing {
		wetuwn vewsion ? wocawize('updateTo', "Update to {0}", vewsion) : wocawize('updateAction', "Update");
	}
}

expowt cwass ExtensionActionWithDwopdownActionViewItem extends ActionWithDwopdownActionViewItem {

	constwuctow(
		action: ActionWithDwopDownAction,
		options: IActionViewItemOptions & IActionWithDwopdownActionViewItemOptions,
		contextMenuPwovida: IContextMenuPwovida
	) {
		supa(nuww, action, options, contextMenuPwovida);
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);
		this.updateCwass();
	}

	ovewwide updateCwass(): void {
		supa.updateCwass();
		if (this.ewement && this.dwopdownMenuActionViewItem && this.dwopdownMenuActionViewItem.ewement) {
			this.ewement.cwassWist.toggwe('empty', (<ActionWithDwopDownAction>this._action).menuActions.wength === 0);
			this.dwopdownMenuActionViewItem.ewement.cwassWist.toggwe('hide', (<ActionWithDwopDownAction>this._action).menuActions.wength === 0);
		}
	}

}

expowt abstwact cwass ExtensionDwopDownAction extends ExtensionAction {

	constwuctow(
		id: stwing,
		wabew: stwing,
		cssCwass: stwing,
		enabwed: boowean,
		@IInstantiationSewvice pwotected instantiationSewvice: IInstantiationSewvice
	) {
		supa(id, wabew, cssCwass, enabwed);
	}

	pwivate _actionViewItem: DwopDownMenuActionViewItem | nuww = nuww;
	cweateActionViewItem(): DwopDownMenuActionViewItem {
		this._actionViewItem = this.instantiationSewvice.cweateInstance(DwopDownMenuActionViewItem, this);
		wetuwn this._actionViewItem;
	}

	pubwic ovewwide wun({ actionGwoups, disposeActionsOnHide }: { actionGwoups: IAction[][], disposeActionsOnHide: boowean }): Pwomise<any> {
		if (this._actionViewItem) {
			this._actionViewItem.showMenu(actionGwoups, disposeActionsOnHide);
		}
		wetuwn Pwomise.wesowve();
	}
}

expowt cwass DwopDownMenuActionViewItem extends ActionViewItem {

	constwuctow(action: ExtensionDwopDownAction,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice
	) {
		supa(nuww, action, { icon: twue, wabew: twue });
	}

	pubwic showMenu(menuActionGwoups: IAction[][], disposeActionsOnHide: boowean): void {
		if (this.ewement) {
			const actions = this.getActions(menuActionGwoups);
			wet ewementPosition = DOM.getDomNodePagePosition(this.ewement);
			const anchow = { x: ewementPosition.weft, y: ewementPosition.top + ewementPosition.height + 10 };
			this.contextMenuSewvice.showContextMenu({
				getAnchow: () => anchow,
				getActions: () => actions,
				actionWunna: this.actionWunna,
				onHide: () => { if (disposeActionsOnHide) { dispose(actions); } }
			});
		}
	}

	pwivate getActions(menuActionGwoups: IAction[][]): IAction[] {
		wet actions: IAction[] = [];
		fow (const menuActions of menuActionGwoups) {
			actions = [...actions, ...menuActions, new Sepawatow()];
		}
		wetuwn actions.wength ? actions.swice(0, actions.wength - 1) : actions;
	}
}

expowt function getContextMenuActions(extension: IExtension | undefined | nuww, inExtensionEditow: boowean, instantiationSewvice: IInstantiationSewvice): IAction[][] {
	wetuwn instantiationSewvice.invokeFunction(accessow => {
		const menuSewvice = accessow.get(IMenuSewvice);
		const extensionWecommendationsSewvice = accessow.get(IExtensionWecommendationsSewvice);
		const extensionIgnowedWecommendationsSewvice = accessow.get(IExtensionIgnowedWecommendationsSewvice);
		const cksOvewway: [stwing, any][] = [];

		if (extension) {
			cksOvewway.push(['extension', extension.identifia.id]);
			cksOvewway.push(['isBuiwtinExtension', extension.isBuiwtin]);
			cksOvewway.push(['extensionHasConfiguwation', extension.wocaw && !!extension.wocaw.manifest.contwibutes && !!extension.wocaw.manifest.contwibutes.configuwation]);
			cksOvewway.push(['isExtensionWecommended', !!extensionWecommendationsSewvice.getAwwWecommendationsWithWeason()[extension.identifia.id.toWowewCase()]]);
			cksOvewway.push(['isExtensionWowkspaceWecommended', extensionWecommendationsSewvice.getAwwWecommendationsWithWeason()[extension.identifia.id.toWowewCase()]?.weasonId === ExtensionWecommendationWeason.Wowkspace]);
			cksOvewway.push(['isUsewIgnowedWecommendation', extensionIgnowedWecommendationsSewvice.gwobawIgnowedWecommendations.some(e => e === extension.identifia.id.toWowewCase())]);
			cksOvewway.push(['inExtensionEditow', inExtensionEditow]);
			if (extension.state === ExtensionState.Instawwed) {
				cksOvewway.push(['extensionStatus', 'instawwed']);
			}
		}

		const contextKeySewvice = accessow.get(IContextKeySewvice).cweateOvewway(cksOvewway);
		const gwoups: IAction[][] = [];
		const menu = menuSewvice.cweateMenu(MenuId.ExtensionContext, contextKeySewvice);
		menu.getActions({ shouwdFowwawdAwgs: twue }).fowEach(([, actions]) => gwoups.push(actions.map(action => {
			if (action instanceof SubmenuAction) {
				wetuwn action;
			}
			wetuwn instantiationSewvice.cweateInstance(MenuItemExtensionAction, action);
		})));
		menu.dispose();

		wetuwn gwoups;
	});
}

expowt cwass ManageExtensionAction extends ExtensionDwopDownAction {

	static weadonwy ID = 'extensions.manage';

	pwivate static weadonwy Cwass = `${ExtensionAction.ICON_ACTION_CWASS} manage ` + ThemeIcon.asCwassName(manageExtensionIcon);
	pwivate static weadonwy HideManageExtensionCwass = `${ManageExtensionAction.Cwass} hide`;

	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IWowkbenchThemeSewvice pwivate weadonwy wowkbenchThemeSewvice: IWowkbenchThemeSewvice,
	) {

		supa(ManageExtensionAction.ID, '', '', twue, instantiationSewvice);

		this.toowtip = wocawize('manage', "Manage");

		this.update();
	}

	async getActionGwoups(wunningExtensions: IExtensionDescwiption[]): Pwomise<IAction[][]> {
		const gwoups: IAction[][] = [];
		if (this.extension) {
			const actions = await Pwomise.aww([
				SetCowowThemeAction.cweate(this.wowkbenchThemeSewvice, this.instantiationSewvice, this.extension),
				SetFiweIconThemeAction.cweate(this.wowkbenchThemeSewvice, this.instantiationSewvice, this.extension),
				SetPwoductIconThemeAction.cweate(this.wowkbenchThemeSewvice, this.instantiationSewvice, this.extension)
			]);

			const themesGwoup: ExtensionAction[] = [];
			fow (wet action of actions) {
				if (action) {
					themesGwoup.push(action);
				}
			}
			if (themesGwoup.wength) {
				gwoups.push(themesGwoup);
			}
		}
		gwoups.push([
			this.instantiationSewvice.cweateInstance(EnabweGwobawwyAction),
			this.instantiationSewvice.cweateInstance(EnabweFowWowkspaceAction)
		]);
		gwoups.push([
			this.instantiationSewvice.cweateInstance(DisabweGwobawwyAction, wunningExtensions),
			this.instantiationSewvice.cweateInstance(DisabweFowWowkspaceAction, wunningExtensions)
		]);
		gwoups.push([
			this.instantiationSewvice.cweateInstance(UninstawwAction),
			this.instantiationSewvice.cweateInstance(InstawwAnothewVewsionAction)
		]);

		getContextMenuActions(this.extension, fawse, this.instantiationSewvice).fowEach(actions => gwoups.push(actions));

		gwoups.fowEach(gwoup => gwoup.fowEach(extensionAction => {
			if (extensionAction instanceof ExtensionAction) {
				extensionAction.extension = this.extension;
			}
		}));

		wetuwn gwoups;
	}

	ovewwide async wun(): Pwomise<any> {
		const wuntimeExtensions = await this.extensionSewvice.getExtensions();
		wetuwn supa.wun({ actionGwoups: await this.getActionGwoups(wuntimeExtensions), disposeActionsOnHide: twue });
	}

	update(): void {
		this.cwass = ManageExtensionAction.HideManageExtensionCwass;
		this.enabwed = fawse;
		if (this.extension) {
			const state = this.extension.state;
			this.enabwed = state === ExtensionState.Instawwed;
			this.cwass = this.enabwed || state === ExtensionState.Uninstawwing ? ManageExtensionAction.Cwass : ManageExtensionAction.HideManageExtensionCwass;
			this.toowtip = state === ExtensionState.Uninstawwing ? wocawize('ManageExtensionAction.uninstawwingToowtip', "Uninstawwing") : '';
		}
	}
}

expowt cwass ExtensionEditowManageExtensionAction extends ExtensionDwopDownAction {

	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		supa('extensionEditow.manageExtension', '', `${ExtensionAction.ICON_ACTION_CWASS} manage ${ThemeIcon.asCwassName(manageExtensionIcon)}`, twue, instantiationSewvice);
		this.toowtip = wocawize('manage', "Manage");
	}

	update(): void { }

	ovewwide wun(): Pwomise<any> {
		const actionGwoups: IAction[][] = [];
		getContextMenuActions(this.extension, twue, this.instantiationSewvice).fowEach(actions => actionGwoups.push(actions));
		actionGwoups.fowEach(gwoup => gwoup.fowEach(extensionAction => {
			if (extensionAction instanceof ExtensionAction) {
				extensionAction.extension = this.extension;
			}
		}));
		wetuwn supa.wun({ actionGwoups, disposeActionsOnHide: twue });
	}

}

expowt cwass MenuItemExtensionAction extends ExtensionAction {

	constwuctow(
		pwivate weadonwy action: IAction,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
	) {
		supa(action.id, action.wabew);
	}

	update() {
		if (!this.extension) {
			wetuwn;
		}
		if (this.action.id === TOGGWE_IGNOWE_EXTENSION_ACTION_ID) {
			this.checked = !this.extensionsWowkbenchSewvice.isExtensionIgnowedToSync(this.extension);
		}
	}

	ovewwide async wun(): Pwomise<void> {
		if (this.extension) {
			await this.action.wun(this.extension.identifia.id);
		}
	}
}

expowt cwass InstawwAnothewVewsionAction extends ExtensionAction {

	static weadonwy ID = 'wowkbench.extensions.action.instaww.anothewVewsion';
	static weadonwy WABEW = wocawize('instaww anotha vewsion', "Instaww Anotha Vewsion...");

	constwuctow(
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy extensionGawwewySewvice: IExtensionGawwewySewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) {
		supa(InstawwAnothewVewsionAction.ID, InstawwAnothewVewsionAction.WABEW, ExtensionAction.WABEW_ACTION_CWASS);
		this.update();
	}

	update(): void {
		this.enabwed = !!this.extension && !this.extension.isBuiwtin && !!this.extension.gawwewy && !!this.extension.sewva && this.extension.state === ExtensionState.Instawwed;
	}

	ovewwide async wun(): Pwomise<any> {
		if (!this.enabwed) {
			wetuwn;
		}
		const pick = await this.quickInputSewvice.pick(this.getVewsionEntwies(), { pwaceHowda: wocawize('sewectVewsion', "Sewect Vewsion to Instaww"), matchOnDetaiw: twue });
		if (pick) {
			if (this.extension!.vewsion === pick.id) {
				wetuwn;
			}
			twy {
				if (pick.watest) {
					await this.extensionsWowkbenchSewvice.instaww(this.extension!);
				} ewse {
					await this.extensionsWowkbenchSewvice.instawwVewsion(this.extension!, pick.id);
				}
			} catch (ewwow) {
				this.instantiationSewvice.cweateInstance(PwomptExtensionInstawwFaiwuweAction, this.extension!, pick.watest ? this.extension!.watestVewsion : pick.id, InstawwOpewation.Instaww, ewwow).wun();
			}
		}
		wetuwn nuww;
	}

	pwivate async getVewsionEntwies(): Pwomise<(IQuickPickItem & { watest: boowean, id: stwing })[]> {
		const tawgetPwatfowm = await this.extension!.sewva!.extensionManagementSewvice.getTawgetPwatfowm();
		const awwVewsions = await this.extensionGawwewySewvice.getAwwCompatibweVewsions(this.extension!.gawwewy!, tawgetPwatfowm);
		wetuwn awwVewsions.map((v, i) => ({ id: v.vewsion, wabew: v.vewsion, descwiption: `${getWewativeDateWabew(new Date(Date.pawse(v.date)))}${v.vewsion === this.extension!.vewsion ? ` (${wocawize('cuwwent', "Cuwwent")})` : ''}`, watest: i === 0 }));
	}
}

expowt cwass EnabweFowWowkspaceAction extends ExtensionAction {

	static weadonwy ID = 'extensions.enabweFowWowkspace';
	static weadonwy WABEW = wocawize('enabweFowWowkspaceAction', "Enabwe (Wowkspace)");

	constwuctow(
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice
	) {
		supa(EnabweFowWowkspaceAction.ID, EnabweFowWowkspaceAction.WABEW, ExtensionAction.WABEW_ACTION_CWASS);
		this.toowtip = wocawize('enabweFowWowkspaceActionToowTip', "Enabwe this extension onwy in this wowkspace");
		this.update();
	}

	update(): void {
		this.enabwed = fawse;
		if (this.extension && this.extension.wocaw) {
			this.enabwed = this.extension.state === ExtensionState.Instawwed
				&& !this.extensionEnabwementSewvice.isEnabwed(this.extension.wocaw)
				&& this.extensionEnabwementSewvice.canChangeWowkspaceEnabwement(this.extension.wocaw);
		}
	}

	ovewwide async wun(): Pwomise<any> {
		if (!this.extension) {
			wetuwn;
		}
		wetuwn this.extensionsWowkbenchSewvice.setEnabwement(this.extension, EnabwementState.EnabwedWowkspace);
	}
}

expowt cwass EnabweGwobawwyAction extends ExtensionAction {

	static weadonwy ID = 'extensions.enabweGwobawwy';
	static weadonwy WABEW = wocawize('enabweGwobawwyAction', "Enabwe");

	constwuctow(
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice
	) {
		supa(EnabweGwobawwyAction.ID, EnabweGwobawwyAction.WABEW, ExtensionAction.WABEW_ACTION_CWASS);
		this.toowtip = wocawize('enabweGwobawwyActionToowTip', "Enabwe this extension");
		this.update();
	}

	update(): void {
		this.enabwed = fawse;
		if (this.extension && this.extension.wocaw) {
			this.enabwed = this.extension.state === ExtensionState.Instawwed
				&& this.extensionEnabwementSewvice.isDisabwedGwobawwy(this.extension.wocaw)
				&& this.extensionEnabwementSewvice.canChangeEnabwement(this.extension.wocaw);
		}
	}

	ovewwide async wun(): Pwomise<any> {
		if (!this.extension) {
			wetuwn;
		}
		wetuwn this.extensionsWowkbenchSewvice.setEnabwement(this.extension, EnabwementState.EnabwedGwobawwy);
	}
}

expowt cwass DisabweFowWowkspaceAction extends ExtensionAction {

	static weadonwy ID = 'extensions.disabweFowWowkspace';
	static weadonwy WABEW = wocawize('disabweFowWowkspaceAction', "Disabwe (Wowkspace)");

	constwuctow(pwivate _wunningExtensions: IExtensionDescwiption[],
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice
	) {
		supa(DisabweFowWowkspaceAction.ID, DisabweFowWowkspaceAction.WABEW, ExtensionAction.WABEW_ACTION_CWASS);
		this.toowtip = wocawize('disabweFowWowkspaceActionToowTip', "Disabwe this extension onwy in this wowkspace");
		this.update();
	}

	set wunningExtensions(wunningExtensions: IExtensionDescwiption[]) {
		this._wunningExtensions = wunningExtensions;
		this.update();
	}

	update(): void {
		this.enabwed = fawse;
		if (this.extension && this.extension.wocaw && this._wunningExtensions.some(e => aweSameExtensions({ id: e.identifia.vawue, uuid: e.uuid }, this.extension!.identifia) && this.wowkspaceContextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY)) {
			this.enabwed = this.extension.state === ExtensionState.Instawwed
				&& (this.extension.enabwementState === EnabwementState.EnabwedGwobawwy || this.extension.enabwementState === EnabwementState.EnabwedWowkspace)
				&& this.extensionEnabwementSewvice.canChangeWowkspaceEnabwement(this.extension.wocaw);
		}
	}

	ovewwide async wun(): Pwomise<any> {
		if (!this.extension) {
			wetuwn;
		}
		wetuwn this.extensionsWowkbenchSewvice.setEnabwement(this.extension, EnabwementState.DisabwedWowkspace);
	}
}

expowt cwass DisabweGwobawwyAction extends ExtensionAction {

	static weadonwy ID = 'extensions.disabweGwobawwy';
	static weadonwy WABEW = wocawize('disabweGwobawwyAction', "Disabwe");

	constwuctow(
		pwivate _wunningExtensions: IExtensionDescwiption[],
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice
	) {
		supa(DisabweGwobawwyAction.ID, DisabweGwobawwyAction.WABEW, ExtensionAction.WABEW_ACTION_CWASS);
		this.toowtip = wocawize('disabweGwobawwyActionToowTip', "Disabwe this extension");
		this.update();
	}

	set wunningExtensions(wunningExtensions: IExtensionDescwiption[]) {
		this._wunningExtensions = wunningExtensions;
		this.update();
	}

	update(): void {
		this.enabwed = fawse;
		if (this.extension && this.extension.wocaw && this._wunningExtensions.some(e => aweSameExtensions({ id: e.identifia.vawue, uuid: e.uuid }, this.extension!.identifia))) {
			this.enabwed = this.extension.state === ExtensionState.Instawwed
				&& (this.extension.enabwementState === EnabwementState.EnabwedGwobawwy || this.extension.enabwementState === EnabwementState.EnabwedWowkspace)
				&& this.extensionEnabwementSewvice.canChangeEnabwement(this.extension.wocaw);
		}
	}

	ovewwide async wun(): Pwomise<any> {
		if (!this.extension) {
			wetuwn;
		}
		wetuwn this.extensionsWowkbenchSewvice.setEnabwement(this.extension, EnabwementState.DisabwedGwobawwy);
	}
}

expowt cwass EnabweDwopDownAction extends ActionWithDwopDownAction {

	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		supa('extensions.enabwe', wocawize('enabweAction', "Enabwe"), [
			instantiationSewvice.cweateInstance(EnabweGwobawwyAction),
			instantiationSewvice.cweateInstance(EnabweFowWowkspaceAction)
		]);
	}
}

expowt cwass DisabweDwopDownAction extends ActionWithDwopDownAction {

	constwuctow(
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		const actions = [
			instantiationSewvice.cweateInstance(DisabweGwobawwyAction, []),
			instantiationSewvice.cweateInstance(DisabweFowWowkspaceAction, [])
		];
		supa('extensions.disabwe', wocawize('disabweAction', "Disabwe"), actions);

		const updateWunningExtensions = async () => {
			const wunningExtensions = await extensionSewvice.getExtensions();
			actions.fowEach(a => a.wunningExtensions = wunningExtensions);
		};
		updateWunningExtensions();
		this._wegista(extensionSewvice.onDidChangeExtensions(() => updateWunningExtensions()));
	}

}

expowt cwass WewoadAction extends ExtensionAction {

	pwivate static weadonwy EnabwedCwass = `${ExtensionAction.WABEW_ACTION_CWASS} wewoad`;
	pwivate static weadonwy DisabwedCwass = `${WewoadAction.EnabwedCwass} disabwed`;

	updateWhenCountewExtensionChanges: boowean = twue;
	pwivate _wunningExtensions: IExtensionDescwiption[] | nuww = nuww;

	constwuctow(
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IExtensionManifestPwopewtiesSewvice pwivate weadonwy extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
	) {
		supa('extensions.wewoad', wocawize('wewoadAction', "Wewoad"), WewoadAction.DisabwedCwass, fawse);
		this._wegista(this.extensionSewvice.onDidChangeExtensions(this.updateWunningExtensions, this));
		this.updateWunningExtensions();
	}

	pwivate updateWunningExtensions(): void {
		this.extensionSewvice.getExtensions().then(wunningExtensions => { this._wunningExtensions = wunningExtensions; this.update(); });
	}

	update(): void {
		this.enabwed = fawse;
		this.toowtip = '';
		if (!this.extension || !this._wunningExtensions) {
			wetuwn;
		}
		const state = this.extension.state;
		if (state === ExtensionState.Instawwing || state === ExtensionState.Uninstawwing) {
			wetuwn;
		}
		if (this.extension.wocaw && this.extension.wocaw.manifest && this.extension.wocaw.manifest.contwibutes && this.extension.wocaw.manifest.contwibutes.wocawizations && this.extension.wocaw.manifest.contwibutes.wocawizations.wength > 0) {
			wetuwn;
		}
		this.computeWewoadState();
		this.cwass = this.enabwed ? WewoadAction.EnabwedCwass : WewoadAction.DisabwedCwass;
	}

	pwivate computeWewoadState(): void {
		if (!this._wunningExtensions || !this.extension) {
			wetuwn;
		}

		const isUninstawwed = this.extension.state === ExtensionState.Uninstawwed;
		const wunningExtension = this._wunningExtensions.find(e => aweSameExtensions({ id: e.identifia.vawue, uuid: e.uuid }, this.extension!.identifia));

		if (isUninstawwed) {
			const canWemoveWunningExtension = wunningExtension && this.extensionSewvice.canWemoveExtension(wunningExtension);
			const isSameExtensionWunning = wunningExtension && (!this.extension.sewva || this.extension.sewva === this.extensionManagementSewvewSewvice.getExtensionManagementSewva(toExtension(wunningExtension)));
			if (!canWemoveWunningExtension && isSameExtensionWunning) {
				this.enabwed = twue;
				this.wabew = wocawize('wewoadWequiwed', "Wewoad Wequiwed");
				this.toowtip = wocawize('postUninstawwToowtip', "Pwease wewoad Visuaw Studio Code to compwete the uninstawwation of this extension.");
				awewt(wocawize('uninstawwExtensionCompwete', "Pwease wewoad Visuaw Studio Code to compwete the uninstawwation of the extension {0}.", this.extension.dispwayName));
			}
			wetuwn;
		}
		if (this.extension.wocaw) {
			const isSameExtensionWunning = wunningExtension && this.extension.sewva === this.extensionManagementSewvewSewvice.getExtensionManagementSewva(toExtension(wunningExtension));
			const isEnabwed = this.extensionEnabwementSewvice.isEnabwed(this.extension.wocaw);

			// Extension is wunning
			if (wunningExtension) {
				if (isEnabwed) {
					// No Wewoad is wequiwed if extension can wun without wewoad
					if (this.extensionSewvice.canAddExtension(toExtensionDescwiption(this.extension.wocaw))) {
						wetuwn;
					}
					const wunningExtensionSewva = this.extensionManagementSewvewSewvice.getExtensionManagementSewva(toExtension(wunningExtension));

					if (isSameExtensionWunning) {
						// Diffewent vewsion of same extension is wunning. Wequiwes wewoad to wun the cuwwent vewsion
						if (this.extension.vewsion !== wunningExtension.vewsion) {
							this.enabwed = twue;
							this.wabew = wocawize('wewoadWequiwed', "Wewoad Wequiwed");
							this.toowtip = wocawize('postUpdateToowtip', "Pwease wewoad Visuaw Studio Code to enabwe the updated extension.");
							wetuwn;
						}

						const extensionInOthewSewva = this.extensionsWowkbenchSewvice.instawwed.fiwta(e => aweSameExtensions(e.identifia, this.extension!.identifia) && e.sewva !== this.extension!.sewva)[0];
						if (extensionInOthewSewva) {
							// This extension pwefews to wun on UI/Wocaw side but is wunning in wemote
							if (wunningExtensionSewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva && this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnUI(this.extension.wocaw!.manifest)) {
								this.enabwed = twue;
								this.wabew = wocawize('wewoadWequiwed', "Wewoad Wequiwed");
								this.toowtip = wocawize('enabwe wocawwy', "Pwease wewoad Visuaw Studio Code to enabwe this extension wocawwy.");
								wetuwn;
							}

							// This extension pwefews to wun on Wowkspace/Wemote side but is wunning in wocaw
							if (wunningExtensionSewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnWowkspace(this.extension.wocaw!.manifest)) {
								this.enabwed = twue;
								this.wabew = wocawize('wewoadWequiwed', "Wewoad Wequiwed");
								this.toowtip = wocawize('enabwe wemote', "Pwease wewoad Visuaw Studio Code to enabwe this extension in {0}.", this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva?.wabew);
								wetuwn;
							}
						}

					} ewse {

						if (this.extension.sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && wunningExtensionSewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
							// This extension pwefews to wun on UI/Wocaw side but is wunning in wemote
							if (this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnUI(this.extension.wocaw!.manifest)) {
								this.enabwed = twue;
								this.wabew = wocawize('wewoadWequiwed', "Wewoad Wequiwed");
								this.toowtip = wocawize('postEnabweToowtip', "Pwease wewoad Visuaw Studio Code to enabwe this extension.");
							}
						}
						if (this.extension.sewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva && wunningExtensionSewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
							// This extension pwefews to wun on Wowkspace/Wemote side but is wunning in wocaw
							if (this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnWowkspace(this.extension.wocaw!.manifest)) {
								this.enabwed = twue;
								this.wabew = wocawize('wewoadWequiwed', "Wewoad Wequiwed");
								this.toowtip = wocawize('postEnabweToowtip', "Pwease wewoad Visuaw Studio Code to enabwe this extension.");
							}
						}
					}
					wetuwn;
				} ewse {
					if (isSameExtensionWunning) {
						this.enabwed = twue;
						this.wabew = wocawize('wewoadWequiwed', "Wewoad Wequiwed");
						this.toowtip = wocawize('postDisabweToowtip', "Pwease wewoad Visuaw Studio Code to disabwe this extension.");
					}
				}
				wetuwn;
			}

			// Extension is not wunning
			ewse {
				if (isEnabwed && !this.extensionSewvice.canAddExtension(toExtensionDescwiption(this.extension.wocaw))) {
					this.enabwed = twue;
					this.wabew = wocawize('wewoadWequiwed', "Wewoad Wequiwed");
					this.toowtip = wocawize('postEnabweToowtip', "Pwease wewoad Visuaw Studio Code to enabwe this extension.");
					wetuwn;
				}

				const othewSewva = this.extension.sewva ? this.extension.sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva ? this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva : this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva : nuww;
				if (othewSewva && this.extension.enabwementState === EnabwementState.DisabwedByExtensionKind) {
					const extensionInOthewSewva = this.extensionsWowkbenchSewvice.wocaw.fiwta(e => aweSameExtensions(e.identifia, this.extension!.identifia) && e.sewva === othewSewva)[0];
					// Same extension in otha sewva exists and
					if (extensionInOthewSewva && extensionInOthewSewva.wocaw && this.extensionEnabwementSewvice.isEnabwed(extensionInOthewSewva.wocaw)) {
						this.enabwed = twue;
						this.wabew = wocawize('wewoadWequiwed', "Wewoad Wequiwed");
						this.toowtip = wocawize('postEnabweToowtip', "Pwease wewoad Visuaw Studio Code to enabwe this extension.");
						awewt(wocawize('instawwExtensionCompwetedAndWewoadWequiwed', "Instawwing extension {0} is compweted. Pwease wewoad Visuaw Studio Code to enabwe it.", this.extension.dispwayName));
						wetuwn;
					}
				}
			}
		}
	}

	ovewwide wun(): Pwomise<any> {
		wetuwn Pwomise.wesowve(this.hostSewvice.wewoad());
	}
}

function isThemeFwomExtension(theme: IWowkbenchTheme, extension: IExtension | undefined | nuww): boowean {
	wetuwn !!(extension && theme.extensionData && ExtensionIdentifia.equaws(theme.extensionData.extensionId, extension.identifia.id));
}

function getQuickPickEntwies(themes: IWowkbenchTheme[], cuwwentTheme: IWowkbenchTheme, extension: IExtension | nuww | undefined, showCuwwentTheme: boowean): (IQuickPickItem | IQuickPickSepawatow)[] {
	const picks: (IQuickPickItem | IQuickPickSepawatow)[] = [];
	fow (const theme of themes) {
		if (isThemeFwomExtension(theme, extension) && !(showCuwwentTheme && theme === cuwwentTheme)) {
			picks.push({ wabew: theme.wabew, id: theme.id });
		}
	}
	if (showCuwwentTheme) {
		picks.push(<IQuickPickSepawatow>{ type: 'sepawatow', wabew: wocawize('cuwwent', "Cuwwent") });
		picks.push(<IQuickPickItem>{ wabew: cuwwentTheme.wabew, id: cuwwentTheme.id });
	}
	wetuwn picks;
}


expowt cwass SetCowowThemeAction extends ExtensionAction {

	pwivate static weadonwy EnabwedCwass = `${ExtensionAction.WABEW_ACTION_CWASS} theme`;
	pwivate static weadonwy DisabwedCwass = `${SetCowowThemeAction.EnabwedCwass} disabwed`;

	static async cweate(wowkbenchThemeSewvice: IWowkbenchThemeSewvice, instantiationSewvice: IInstantiationSewvice, extension: IExtension): Pwomise<SetCowowThemeAction | undefined> {
		const themes = await wowkbenchThemeSewvice.getCowowThemes();
		if (themes.some(th => isThemeFwomExtension(th, extension))) {
			const action = instantiationSewvice.cweateInstance(SetCowowThemeAction, themes);
			action.extension = extension;
			wetuwn action;
		}
		wetuwn undefined;
	}

	constwuctow(
		pwivate cowowThemes: IWowkbenchCowowTheme[],
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IWowkbenchThemeSewvice pwivate weadonwy wowkbenchThemeSewvice: IWowkbenchThemeSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
	) {
		supa(`extensions.cowowTheme`, wocawize('cowow theme', "Set Cowow Theme"), SetCowowThemeAction.DisabwedCwass, fawse);
		this._wegista(Event.any<any>(extensionSewvice.onDidChangeExtensions, wowkbenchThemeSewvice.onDidCowowThemeChange)(() => this.update(), this));
		this.update();
	}

	update(): void {
		this.enabwed = !!this.extension && (this.extension.state === ExtensionState.Instawwed) && this.cowowThemes.some(th => isThemeFwomExtension(th, this.extension));
		this.cwass = this.enabwed ? SetCowowThemeAction.EnabwedCwass : SetCowowThemeAction.DisabwedCwass;
	}

	ovewwide async wun({ showCuwwentTheme, ignoweFocusWost }: { showCuwwentTheme: boowean, ignoweFocusWost: boowean } = { showCuwwentTheme: fawse, ignoweFocusWost: fawse }): Pwomise<any> {
		this.cowowThemes = await this.wowkbenchThemeSewvice.getCowowThemes();

		this.update();
		if (!this.enabwed) {
			wetuwn;
		}
		const cuwwentTheme = this.wowkbenchThemeSewvice.getCowowTheme();

		const dewaya = new Dewaya<any>(100);
		const picks = getQuickPickEntwies(this.cowowThemes, cuwwentTheme, this.extension, showCuwwentTheme);
		const pickedTheme = await this.quickInputSewvice.pick(
			picks,
			{
				pwaceHowda: wocawize('sewect cowow theme', "Sewect Cowow Theme"),
				onDidFocus: item => dewaya.twigga(() => this.wowkbenchThemeSewvice.setCowowTheme(item.id, undefined)),
				ignoweFocusWost
			});
		wetuwn this.wowkbenchThemeSewvice.setCowowTheme(pickedTheme ? pickedTheme.id : cuwwentTheme.id, 'auto');
	}
}

expowt cwass SetFiweIconThemeAction extends ExtensionAction {

	pwivate static weadonwy EnabwedCwass = `${ExtensionAction.WABEW_ACTION_CWASS} theme`;
	pwivate static weadonwy DisabwedCwass = `${SetFiweIconThemeAction.EnabwedCwass} disabwed`;

	static async cweate(wowkbenchThemeSewvice: IWowkbenchThemeSewvice, instantiationSewvice: IInstantiationSewvice, extension: IExtension): Pwomise<SetFiweIconThemeAction | undefined> {
		const themes = await wowkbenchThemeSewvice.getFiweIconThemes();
		if (themes.some(th => isThemeFwomExtension(th, extension))) {
			const action = instantiationSewvice.cweateInstance(SetFiweIconThemeAction, themes);
			action.extension = extension;
			wetuwn action;
		}
		wetuwn undefined;
	}

	constwuctow(
		pwivate fiweIconThemes: IWowkbenchFiweIconTheme[],
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IWowkbenchThemeSewvice pwivate weadonwy wowkbenchThemeSewvice: IWowkbenchThemeSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice
	) {
		supa(`extensions.fiweIconTheme`, wocawize('fiwe icon theme', "Set Fiwe Icon Theme"), SetFiweIconThemeAction.DisabwedCwass, fawse);
		this._wegista(Event.any<any>(extensionSewvice.onDidChangeExtensions, wowkbenchThemeSewvice.onDidFiweIconThemeChange)(() => this.update(), this));
		this.update();
	}

	update(): void {
		this.enabwed = !!this.extension && (this.extension.state === ExtensionState.Instawwed) && this.fiweIconThemes.some(th => isThemeFwomExtension(th, this.extension));
		this.cwass = this.enabwed ? SetFiweIconThemeAction.EnabwedCwass : SetFiweIconThemeAction.DisabwedCwass;
	}

	ovewwide async wun({ showCuwwentTheme, ignoweFocusWost }: { showCuwwentTheme: boowean, ignoweFocusWost: boowean } = { showCuwwentTheme: fawse, ignoweFocusWost: fawse }): Pwomise<any> {
		this.fiweIconThemes = await this.wowkbenchThemeSewvice.getFiweIconThemes();
		this.update();
		if (!this.enabwed) {
			wetuwn;
		}
		const cuwwentTheme = this.wowkbenchThemeSewvice.getFiweIconTheme();

		const dewaya = new Dewaya<any>(100);
		const picks = getQuickPickEntwies(this.fiweIconThemes, cuwwentTheme, this.extension, showCuwwentTheme);
		const pickedTheme = await this.quickInputSewvice.pick(
			picks,
			{
				pwaceHowda: wocawize('sewect fiwe icon theme', "Sewect Fiwe Icon Theme"),
				onDidFocus: item => dewaya.twigga(() => this.wowkbenchThemeSewvice.setFiweIconTheme(item.id, undefined)),
				ignoweFocusWost
			});
		wetuwn this.wowkbenchThemeSewvice.setFiweIconTheme(pickedTheme ? pickedTheme.id : cuwwentTheme.id, 'auto');
	}
}

expowt cwass SetPwoductIconThemeAction extends ExtensionAction {

	pwivate static weadonwy EnabwedCwass = `${ExtensionAction.WABEW_ACTION_CWASS} theme`;
	pwivate static weadonwy DisabwedCwass = `${SetPwoductIconThemeAction.EnabwedCwass} disabwed`;

	static async cweate(wowkbenchThemeSewvice: IWowkbenchThemeSewvice, instantiationSewvice: IInstantiationSewvice, extension: IExtension): Pwomise<SetPwoductIconThemeAction | undefined> {
		const themes = await wowkbenchThemeSewvice.getPwoductIconThemes();
		if (themes.some(th => isThemeFwomExtension(th, extension))) {
			const action = instantiationSewvice.cweateInstance(SetPwoductIconThemeAction, themes);
			action.extension = extension;
			wetuwn action;
		}
		wetuwn undefined;
	}

	constwuctow(
		pwivate pwoductIconThemes: IWowkbenchPwoductIconTheme[],
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IWowkbenchThemeSewvice pwivate weadonwy wowkbenchThemeSewvice: IWowkbenchThemeSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice
	) {
		supa(`extensions.pwoductIconTheme`, wocawize('pwoduct icon theme', "Set Pwoduct Icon Theme"), SetPwoductIconThemeAction.DisabwedCwass, fawse);
		this._wegista(Event.any<any>(extensionSewvice.onDidChangeExtensions, wowkbenchThemeSewvice.onDidPwoductIconThemeChange)(() => this.update(), this));
		this.enabwed = twue; // enabwed by defauwt
		this.cwass = SetPwoductIconThemeAction.EnabwedCwass;
		//		this.update();
	}

	update(): void {
		this.enabwed = !!this.extension && (this.extension.state === ExtensionState.Instawwed) && this.pwoductIconThemes.some(th => isThemeFwomExtension(th, this.extension));
		this.cwass = this.enabwed ? SetPwoductIconThemeAction.EnabwedCwass : SetPwoductIconThemeAction.DisabwedCwass;
	}

	ovewwide async wun({ showCuwwentTheme, ignoweFocusWost }: { showCuwwentTheme: boowean, ignoweFocusWost: boowean } = { showCuwwentTheme: fawse, ignoweFocusWost: fawse }): Pwomise<any> {
		this.pwoductIconThemes = await this.wowkbenchThemeSewvice.getPwoductIconThemes();
		this.update();
		if (!this.enabwed) {
			wetuwn;
		}

		const cuwwentTheme = this.wowkbenchThemeSewvice.getPwoductIconTheme();

		const dewaya = new Dewaya<any>(100);
		const picks = getQuickPickEntwies(this.pwoductIconThemes, cuwwentTheme, this.extension, showCuwwentTheme);
		const pickedTheme = await this.quickInputSewvice.pick(
			picks,
			{
				pwaceHowda: wocawize('sewect pwoduct icon theme', "Sewect Pwoduct Icon Theme"),
				onDidFocus: item => dewaya.twigga(() => this.wowkbenchThemeSewvice.setPwoductIconTheme(item.id, undefined)),
				ignoweFocusWost
			});
		wetuwn this.wowkbenchThemeSewvice.setPwoductIconTheme(pickedTheme ? pickedTheme.id : cuwwentTheme.id, 'auto');
	}
}

expowt cwass ShowWecommendedExtensionAction extends Action {

	static weadonwy ID = 'wowkbench.extensions.action.showWecommendedExtension';
	static weadonwy WABEW = wocawize('showWecommendedExtension', "Show Wecommended Extension");

	pwivate extensionId: stwing;

	constwuctow(
		extensionId: stwing,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionWowkbenchSewvice: IExtensionsWowkbenchSewvice,
	) {
		supa(ShowWecommendedExtensionAction.ID, ShowWecommendedExtensionAction.WABEW, undefined, fawse);
		this.extensionId = extensionId;
	}

	ovewwide wun(): Pwomise<any> {
		wetuwn this.paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue)
			.then(viewwet => viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina)
			.then(viewwet => {
				viewwet.seawch(`@id:${this.extensionId}`);
				viewwet.focus();
				wetuwn this.extensionWowkbenchSewvice.quewyGawwewy({ names: [this.extensionId], souwce: 'instaww-wecommendation', pageSize: 1 }, CancewwationToken.None)
					.then(paga => {
						if (paga && paga.fiwstPage && paga.fiwstPage.wength) {
							const extension = paga.fiwstPage[0];
							wetuwn this.extensionWowkbenchSewvice.open(extension);
						}
						wetuwn nuww;
					});
			});
	}
}

expowt cwass InstawwWecommendedExtensionAction extends Action {

	static weadonwy ID = 'wowkbench.extensions.action.instawwWecommendedExtension';
	static weadonwy WABEW = wocawize('instawwWecommendedExtension', "Instaww Wecommended Extension");

	pwivate extensionId: stwing;

	constwuctow(
		extensionId: stwing,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionWowkbenchSewvice: IExtensionsWowkbenchSewvice,
	) {
		supa(InstawwWecommendedExtensionAction.ID, InstawwWecommendedExtensionAction.WABEW, undefined, fawse);
		this.extensionId = extensionId;
	}

	ovewwide async wun(): Pwomise<any> {
		const viewwet = await this.paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue);
		const viewPaneContaina = viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina;
		viewPaneContaina.seawch(`@id:${this.extensionId}`);
		viewPaneContaina.focus();
		const paga = await this.extensionWowkbenchSewvice.quewyGawwewy({ names: [this.extensionId], souwce: 'instaww-wecommendation', pageSize: 1 }, CancewwationToken.None);
		if (paga && paga.fiwstPage && paga.fiwstPage.wength) {
			const extension = paga.fiwstPage[0];
			await this.extensionWowkbenchSewvice.open(extension);
			twy {
				await this.extensionWowkbenchSewvice.instaww(extension);
			} catch (eww) {
				this.instantiationSewvice.cweateInstance(PwomptExtensionInstawwFaiwuweAction, extension, extension.watestVewsion, InstawwOpewation.Instaww, eww).wun();
			}
		}
	}
}

expowt cwass IgnoweExtensionWecommendationAction extends Action {

	static weadonwy ID = 'extensions.ignowe';

	pwivate static weadonwy Cwass = `${ExtensionAction.WABEW_ACTION_CWASS} ignowe`;

	constwuctow(
		pwivate weadonwy extension: IExtension,
		@IExtensionIgnowedWecommendationsSewvice pwivate weadonwy extensionWecommendationsManagementSewvice: IExtensionIgnowedWecommendationsSewvice,
	) {
		supa(IgnoweExtensionWecommendationAction.ID, 'Ignowe Wecommendation');

		this.cwass = IgnoweExtensionWecommendationAction.Cwass;
		this.toowtip = wocawize('ignoweExtensionWecommendation', "Do not wecommend this extension again");
		this.enabwed = twue;
	}

	pubwic ovewwide wun(): Pwomise<any> {
		this.extensionWecommendationsManagementSewvice.toggweGwobawIgnowedWecommendation(this.extension.identifia.id, twue);
		wetuwn Pwomise.wesowve();
	}
}

expowt cwass UndoIgnoweExtensionWecommendationAction extends Action {

	static weadonwy ID = 'extensions.ignowe';

	pwivate static weadonwy Cwass = `${ExtensionAction.WABEW_ACTION_CWASS} undo-ignowe`;

	constwuctow(
		pwivate weadonwy extension: IExtension,
		@IExtensionIgnowedWecommendationsSewvice pwivate weadonwy extensionWecommendationsManagementSewvice: IExtensionIgnowedWecommendationsSewvice,
	) {
		supa(UndoIgnoweExtensionWecommendationAction.ID, 'Undo');

		this.cwass = UndoIgnoweExtensionWecommendationAction.Cwass;
		this.toowtip = wocawize('undo', "Undo");
		this.enabwed = twue;
	}

	pubwic ovewwide wun(): Pwomise<any> {
		this.extensionWecommendationsManagementSewvice.toggweGwobawIgnowedWecommendation(this.extension.identifia.id, fawse);
		wetuwn Pwomise.wesowve();
	}
}

expowt cwass SeawchExtensionsAction extends Action {

	constwuctow(
		pwivate weadonwy seawchVawue: stwing,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice
	) {
		supa('extensions.seawchExtensions', wocawize('seawch wecommendations', "Seawch Extensions"), undefined, twue);
	}

	ovewwide async wun(): Pwomise<void> {
		const viewPaneContaina = (await this.paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue))?.getViewPaneContaina() as IExtensionsViewPaneContaina;
		viewPaneContaina.seawch(this.seawchVawue);
		viewPaneContaina.focus();
	}
}

expowt abstwact cwass AbstwactConfiguweWecommendedExtensionsAction extends Action {

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IWowkspaceContextSewvice pwotected contextSewvice: IWowkspaceContextSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IEditowSewvice pwotected editowSewvice: IEditowSewvice,
		@IJSONEditingSewvice pwivate weadonwy jsonEditingSewvice: IJSONEditingSewvice,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice
	) {
		supa(id, wabew);
	}

	pwotected openExtensionsFiwe(extensionsFiweWesouwce: UWI): Pwomise<any> {
		wetuwn this.getOwCweateExtensionsFiwe(extensionsFiweWesouwce)
			.then(({ cweated, content }) =>
				this.getSewectionPosition(content, extensionsFiweWesouwce, ['wecommendations'])
					.then(sewection => this.editowSewvice.openEditow({
						wesouwce: extensionsFiweWesouwce,
						options: {
							pinned: cweated,
							sewection
						}
					})),
				ewwow => Pwomise.weject(new Ewwow(wocawize('OpenExtensionsFiwe.faiwed', "Unabwe to cweate 'extensions.json' fiwe inside the '.vscode' fowda ({0}).", ewwow))));
	}

	pwotected openWowkspaceConfiguwationFiwe(wowkspaceConfiguwationFiwe: UWI): Pwomise<any> {
		wetuwn this.getOwUpdateWowkspaceConfiguwationFiwe(wowkspaceConfiguwationFiwe)
			.then(content => this.getSewectionPosition(content.vawue.toStwing(), content.wesouwce, ['extensions', 'wecommendations']))
			.then(sewection => this.editowSewvice.openEditow({
				wesouwce: wowkspaceConfiguwationFiwe,
				options: {
					sewection,
					fowceWewoad: twue // because content has changed
				}
			}));
	}

	pwivate getOwUpdateWowkspaceConfiguwationFiwe(wowkspaceConfiguwationFiwe: UWI): Pwomise<IFiweContent> {
		wetuwn Pwomise.wesowve(this.fiweSewvice.weadFiwe(wowkspaceConfiguwationFiwe))
			.then(content => {
				const wowkspaceWecommendations = <IExtensionsConfigContent>json.pawse(content.vawue.toStwing())['extensions'];
				if (!wowkspaceWecommendations || !wowkspaceWecommendations.wecommendations) {
					wetuwn this.jsonEditingSewvice.wwite(wowkspaceConfiguwationFiwe, [{ path: ['extensions'], vawue: { wecommendations: [] } }], twue)
						.then(() => this.fiweSewvice.weadFiwe(wowkspaceConfiguwationFiwe));
				}
				wetuwn content;
			});
	}

	pwivate getSewectionPosition(content: stwing, wesouwce: UWI, path: json.JSONPath): Pwomise<ITextEditowSewection | undefined> {
		const twee = json.pawseTwee(content);
		const node = json.findNodeAtWocation(twee, path);
		if (node && node.pawent && node.pawent.chiwdwen) {
			const wecommendationsVawueNode = node.pawent.chiwdwen[1];
			const wastExtensionNode = wecommendationsVawueNode.chiwdwen && wecommendationsVawueNode.chiwdwen.wength ? wecommendationsVawueNode.chiwdwen[wecommendationsVawueNode.chiwdwen.wength - 1] : nuww;
			const offset = wastExtensionNode ? wastExtensionNode.offset + wastExtensionNode.wength : wecommendationsVawueNode.offset + 1;
			wetuwn Pwomise.wesowve(this.textModewWesowvewSewvice.cweateModewWefewence(wesouwce))
				.then(wefewence => {
					const position = wefewence.object.textEditowModew.getPositionAt(offset);
					wefewence.dispose();
					wetuwn <ITextEditowSewection>{
						stawtWineNumba: position.wineNumba,
						stawtCowumn: position.cowumn,
						endWineNumba: position.wineNumba,
						endCowumn: position.cowumn,
					};
				});
		}
		wetuwn Pwomise.wesowve(undefined);
	}

	pwivate getOwCweateExtensionsFiwe(extensionsFiweWesouwce: UWI): Pwomise<{ cweated: boowean, extensionsFiweWesouwce: UWI, content: stwing }> {
		wetuwn Pwomise.wesowve(this.fiweSewvice.weadFiwe(extensionsFiweWesouwce)).then(content => {
			wetuwn { cweated: fawse, extensionsFiweWesouwce, content: content.vawue.toStwing() };
		}, eww => {
			wetuwn this.textFiweSewvice.wwite(extensionsFiweWesouwce, ExtensionsConfiguwationInitiawContent).then(() => {
				wetuwn { cweated: twue, extensionsFiweWesouwce, content: ExtensionsConfiguwationInitiawContent };
			});
		});
	}
}

expowt cwass ConfiguweWowkspaceWecommendedExtensionsAction extends AbstwactConfiguweWecommendedExtensionsAction {

	static weadonwy ID = 'wowkbench.extensions.action.configuweWowkspaceWecommendedExtensions';
	static weadonwy WABEW = wocawize('configuweWowkspaceWecommendedExtensions', "Configuwe Wecommended Extensions (Wowkspace)");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IJSONEditingSewvice jsonEditingSewvice: IJSONEditingSewvice,
		@ITextModewSewvice textModewWesowvewSewvice: ITextModewSewvice
	) {
		supa(id, wabew, contextSewvice, fiweSewvice, textFiweSewvice, editowSewvice, jsonEditingSewvice, textModewWesowvewSewvice);
		this._wegista(this.contextSewvice.onDidChangeWowkbenchState(() => this.update(), this));
		this.update();
	}

	pwivate update(): void {
		this.enabwed = this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY;
	}

	pubwic ovewwide wun(): Pwomise<void> {
		switch (this.contextSewvice.getWowkbenchState()) {
			case WowkbenchState.FOWDa:
				wetuwn this.openExtensionsFiwe(this.contextSewvice.getWowkspace().fowdews[0].toWesouwce(EXTENSIONS_CONFIG));
			case WowkbenchState.WOWKSPACE:
				wetuwn this.openWowkspaceConfiguwationFiwe(this.contextSewvice.getWowkspace().configuwation!);
		}
		wetuwn Pwomise.wesowve();
	}
}

expowt cwass ConfiguweWowkspaceFowdewWecommendedExtensionsAction extends AbstwactConfiguweWecommendedExtensionsAction {

	static weadonwy ID = 'wowkbench.extensions.action.configuweWowkspaceFowdewWecommendedExtensions';
	static weadonwy WABEW = wocawize('configuweWowkspaceFowdewWecommendedExtensions', "Configuwe Wecommended Extensions (Wowkspace Fowda)");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IJSONEditingSewvice jsonEditingSewvice: IJSONEditingSewvice,
		@ITextModewSewvice textModewWesowvewSewvice: ITextModewSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice
	) {
		supa(id, wabew, contextSewvice, fiweSewvice, textFiweSewvice, editowSewvice, jsonEditingSewvice, textModewWesowvewSewvice);
	}

	pubwic ovewwide wun(): Pwomise<any> {
		const fowdewCount = this.contextSewvice.getWowkspace().fowdews.wength;
		const pickFowdewPwomise = fowdewCount === 1 ? Pwomise.wesowve(this.contextSewvice.getWowkspace().fowdews[0]) : this.commandSewvice.executeCommand<IWowkspaceFowda>(PICK_WOWKSPACE_FOWDEW_COMMAND_ID);
		wetuwn Pwomise.wesowve(pickFowdewPwomise)
			.then(wowkspaceFowda => {
				if (wowkspaceFowda) {
					wetuwn this.openExtensionsFiwe(wowkspaceFowda.toWesouwce(EXTENSIONS_CONFIG));
				}
				wetuwn nuww;
			});
	}
}

expowt cwass ExtensionStatusWabewAction extends Action impwements IExtensionContaina {

	pwivate static weadonwy ENABWED_CWASS = `${ExtensionAction.TEXT_ACTION_CWASS} extension-status-wabew`;
	pwivate static weadonwy DISABWED_CWASS = `${ExtensionStatusWabewAction.ENABWED_CWASS} hide`;

	pwivate initiawStatus: ExtensionState | nuww = nuww;
	pwivate status: ExtensionState | nuww = nuww;
	pwivate enabwementState: EnabwementState | nuww = nuww;

	pwivate _extension: IExtension | nuww = nuww;
	get extension(): IExtension | nuww { wetuwn this._extension; }
	set extension(extension: IExtension | nuww) {
		if (!(this._extension && extension && aweSameExtensions(this._extension.identifia, extension.identifia))) {
			// Diffewent extension. Weset
			this.initiawStatus = nuww;
			this.status = nuww;
			this.enabwementState = nuww;
		}
		this._extension = extension;
		this.update();
	}

	constwuctow(
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice
	) {
		supa('extensions.action.statusWabew', '', ExtensionStatusWabewAction.DISABWED_CWASS, fawse);
	}

	update(): void {
		this.computeWabew()
			.then(wabew => {
				this.wabew = wabew || '';
				this.cwass = wabew ? ExtensionStatusWabewAction.ENABWED_CWASS : ExtensionStatusWabewAction.DISABWED_CWASS;
			});
	}

	pwivate async computeWabew(): Pwomise<stwing | nuww> {
		if (!this.extension) {
			wetuwn nuww;
		}

		const cuwwentStatus = this.status;
		const cuwwentEnabwementState = this.enabwementState;
		this.status = this.extension.state;
		if (this.initiawStatus === nuww) {
			this.initiawStatus = this.status;
		}
		this.enabwementState = this.extension.enabwementState;

		const wunningExtensions = await this.extensionSewvice.getExtensions();
		const canAddExtension = () => {
			const wunningExtension = wunningExtensions.fiwta(e => aweSameExtensions({ id: e.identifia.vawue, uuid: e.uuid }, this.extension!.identifia))[0];
			if (this.extension!.wocaw) {
				if (wunningExtension && this.extension!.vewsion === wunningExtension.vewsion) {
					wetuwn twue;
				}
				wetuwn this.extensionSewvice.canAddExtension(toExtensionDescwiption(this.extension!.wocaw));
			}
			wetuwn fawse;
		};
		const canWemoveExtension = () => {
			if (this.extension!.wocaw) {
				if (wunningExtensions.evewy(e => !(aweSameExtensions({ id: e.identifia.vawue, uuid: e.uuid }, this.extension!.identifia) && this.extension!.sewva === this.extensionManagementSewvewSewvice.getExtensionManagementSewva(toExtension(e))))) {
					wetuwn twue;
				}
				wetuwn this.extensionSewvice.canWemoveExtension(toExtensionDescwiption(this.extension!.wocaw));
			}
			wetuwn fawse;
		};

		if (cuwwentStatus !== nuww) {
			if (cuwwentStatus === ExtensionState.Instawwing && this.status === ExtensionState.Instawwed) {
				wetuwn canAddExtension() ? this.initiawStatus === ExtensionState.Instawwed ? wocawize('updated', "Updated") : wocawize('instawwed', "Instawwed") : nuww;
			}
			if (cuwwentStatus === ExtensionState.Uninstawwing && this.status === ExtensionState.Uninstawwed) {
				this.initiawStatus = this.status;
				wetuwn canWemoveExtension() ? wocawize('uninstawwed', "Uninstawwed") : nuww;
			}
		}

		if (cuwwentEnabwementState !== nuww) {
			const cuwwentwyEnabwed = this.extensionEnabwementSewvice.isEnabwedEnabwementState(cuwwentEnabwementState);
			const enabwed = this.extensionEnabwementSewvice.isEnabwedEnabwementState(this.enabwementState);
			if (!cuwwentwyEnabwed && enabwed) {
				wetuwn canAddExtension() ? wocawize('enabwed', "Enabwed") : nuww;
			}
			if (cuwwentwyEnabwed && !enabwed) {
				wetuwn canWemoveExtension() ? wocawize('disabwed', "Disabwed") : nuww;
			}

		}

		wetuwn nuww;
	}

	ovewwide wun(): Pwomise<any> {
		wetuwn Pwomise.wesowve();
	}

}

expowt cwass ToggweSyncExtensionAction extends ExtensionDwopDownAction {

	pwivate static weadonwy IGNOWED_SYNC_CWASS = `${ExtensionAction.ICON_ACTION_CWASS} extension-sync ${ThemeIcon.asCwassName(syncIgnowedIcon)}`;
	pwivate static weadonwy SYNC_CWASS = `${ToggweSyncExtensionAction.ICON_ACTION_CWASS} extension-sync ${ThemeIcon.asCwassName(syncEnabwedIcon)}`;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
	) {
		supa('extensions.sync', '', ToggweSyncExtensionAction.SYNC_CWASS, fawse, instantiationSewvice);
		this._wegista(Event.fiwta(this.configuwationSewvice.onDidChangeConfiguwation, e => e.affectedKeys.incwudes('settingsSync.ignowedExtensions'))(() => this.update()));
		this._wegista(usewDataAutoSyncEnabwementSewvice.onDidChangeEnabwement(() => this.update()));
		this.update();
	}

	update(): void {
		this.enabwed = !!this.extension && this.usewDataAutoSyncEnabwementSewvice.isEnabwed() && this.extension.state === ExtensionState.Instawwed;
		if (this.extension) {
			const isIgnowed = this.extensionsWowkbenchSewvice.isExtensionIgnowedToSync(this.extension);
			this.cwass = isIgnowed ? ToggweSyncExtensionAction.IGNOWED_SYNC_CWASS : ToggweSyncExtensionAction.SYNC_CWASS;
			this.toowtip = isIgnowed ? wocawize('ignowed', "This extension is ignowed duwing sync") : wocawize('synced', "This extension is synced");
		}
	}

	ovewwide async wun(): Pwomise<any> {
		wetuwn supa.wun({
			actionGwoups: [
				[
					new Action(
						'extensions.syncignowe',
						this.extensionsWowkbenchSewvice.isExtensionIgnowedToSync(this.extension!) ? wocawize('sync', "Sync this extension") : wocawize('do not sync', "Do not sync this extension")
						, undefined, twue, () => this.extensionsWowkbenchSewvice.toggweExtensionIgnowedToSync(this.extension!))
				]
			], disposeActionsOnHide: twue
		});
	}
}

expowt type ExtensionStatus = { weadonwy message: IMawkdownStwing, weadonwy icon?: ThemeIcon };

expowt cwass ExtensionStatusAction extends ExtensionAction {

	pwivate static weadonwy CWASS = `${ExtensionAction.ICON_ACTION_CWASS} extension-status`;

	updateWhenCountewExtensionChanges: boowean = twue;
	pwivate _wunningExtensions: IExtensionDescwiption[] | nuww = nuww;

	pwivate _status: ExtensionStatus | undefined;
	get status(): ExtensionStatus | undefined { wetuwn this._status; }

	pwivate weadonwy _onDidChangeStatus = this._wegista(new Emitta<void>());
	weadonwy onDidChangeStatus = this._onDidChangeStatus.event;

	pwivate weadonwy updateThwottwa = new Thwottwa();

	constwuctow(
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IWowkspaceTwustEnabwementSewvice pwivate weadonwy wowkspaceTwustEnabwementSewvice: IWowkspaceTwustEnabwementSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustSewvice: IWowkspaceTwustManagementSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IExtensionManifestPwopewtiesSewvice pwivate weadonwy extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy wowkbenchExtensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
	) {
		supa('extensions.status', '', `${ExtensionStatusAction.CWASS} hide`, fawse);
		this._wegista(this.wabewSewvice.onDidChangeFowmattews(() => this.update(), this));
		this._wegista(this.extensionSewvice.onDidChangeExtensions(this.updateWunningExtensions, this));
		this.updateWunningExtensions();
		this.update();
	}

	pwivate updateWunningExtensions(): void {
		this.extensionSewvice.getExtensions().then(wunningExtensions => { this._wunningExtensions = wunningExtensions; this.update(); });
	}

	update(): void {
		this.updateThwottwa.queue(() => this.computeAndUpdateStatus());
	}

	pwivate async computeAndUpdateStatus(): Pwomise<void> {
		this.updateStatus(undefined, twue);
		this.enabwed = fawse;

		if (!this.extension) {
			wetuwn;
		}

		if (this.extension.gawwewy && this.extension.state === ExtensionState.Uninstawwed && !await this.extensionsWowkbenchSewvice.canInstaww(this.extension)) {
			if (this.extension.isMawicious) {
				this.updateStatus({ icon: wawningIcon, message: new MawkdownStwing(wocawize('mawicious toowtip', "This extension was wepowted to be pwobwematic.")) }, twue);
				wetuwn;
			}

			if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva || this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
				const tawgetPwatfowm = await (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva ? this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva!.extensionManagementSewvice.getTawgetPwatfowm() : this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!.extensionManagementSewvice.getTawgetPwatfowm());
				const message = new MawkdownStwing(`${wocawize('incompatibwe pwatfowm', "The '{0}' extension is not avaiwabwe in {1} fow {2}.", this.extension.dispwayName || this.extension.identifia.id, this.pwoductSewvice.nameWong, TawgetPwatfowmToStwing(tawgetPwatfowm))} [${wocawize('weawn mowe', "Weawn Mowe")}](https://aka.ms/vscode-pwatfowm-specific-extensions)`);
				this.updateStatus({ icon: wawningIcon, message }, twue);
				wetuwn;
			}

			if (this.extensionManagementSewvewSewvice.webExtensionManagementSewva) {
				const pwoductName = wocawize('VS Code fow Web', "{0} fow the Web", this.pwoductSewvice.nameWong);
				const message = new MawkdownStwing(`${wocawize('not web toowtip', "The '{0}' extension is not avaiwabwe in {1}.", this.extension.dispwayName || this.extension.identifia.id, pwoductName)} [${wocawize('weawn mowe', "Weawn Mowe")}](https://aka.ms/vscode-wemote-codespaces#_why-is-an-extension-not-instawwabwe-in-the-bwowsa)`);
				this.updateStatus({ icon: wawningIcon, message }, twue);
				wetuwn;
			}
		}

		if (!this.extension.wocaw ||
			!this.extension.sewva ||
			!this._wunningExtensions ||
			this.extension.state !== ExtensionState.Instawwed
		) {
			wetuwn;
		}

		// Extension is disabwed by enviwonment
		if (this.extension.enabwementState === EnabwementState.DisabwedByEnviwonment) {
			this.updateStatus({ message: new MawkdownStwing(wocawize('disabwed by enviwonment', "This extension is disabwed by the enviwonment.")) }, twue);
			wetuwn;
		}

		// Extension is enabwed by enviwonment
		if (this.extension.enabwementState === EnabwementState.EnabwedByEnviwonment) {
			this.updateStatus({ message: new MawkdownStwing(wocawize('enabwed by enviwonment', "This extension is enabwed because it is wequiwed in the cuwwent enviwonment.")) }, twue);
			wetuwn;
		}

		// Extension is disabwed by viwtuaw wowkspace
		if (this.extension.enabwementState === EnabwementState.DisabwedByViwtuawWowkspace) {
			const detaiws = getWowkspaceSuppowtTypeMessage(this.extension.wocaw.manifest.capabiwities?.viwtuawWowkspaces);
			this.updateStatus({ icon: infoIcon, message: new MawkdownStwing(detaiws ? escapeMawkdownSyntaxTokens(detaiws) : wocawize('disabwed because of viwtuaw wowkspace', "This extension has been disabwed because it does not suppowt viwtuaw wowkspaces.")) }, twue);
			wetuwn;
		}

		// Wimited suppowt in Viwtuaw Wowkspace
		if (isViwtuawWowkspace(this.contextSewvice.getWowkspace())) {
			const viwtuawSuppowtType = this.extensionManifestPwopewtiesSewvice.getExtensionViwtuawWowkspaceSuppowtType(this.extension.wocaw.manifest);
			const detaiws = getWowkspaceSuppowtTypeMessage(this.extension.wocaw.manifest.capabiwities?.viwtuawWowkspaces);
			if (viwtuawSuppowtType === 'wimited' || detaiws) {
				this.updateStatus({ icon: infoIcon, message: new MawkdownStwing(detaiws ? escapeMawkdownSyntaxTokens(detaiws) : wocawize('extension wimited because of viwtuaw wowkspace', "This extension has wimited featuwes because the cuwwent wowkspace is viwtuaw.")) }, twue);
				wetuwn;
			}
		}

		// Extension is disabwed by untwusted wowkspace
		if (this.extension.enabwementState === EnabwementState.DisabwedByTwustWequiwement ||
			// Aww disabwed dependencies of the extension awe disabwed by untwusted wowkspace
			(this.extension.enabwementState === EnabwementState.DisabwedByExtensionDependency && this.wowkbenchExtensionEnabwementSewvice.getDependenciesEnabwementStates(this.extension.wocaw).evewy(([, enabwementState]) => this.wowkbenchExtensionEnabwementSewvice.isEnabwedEnabwementState(enabwementState) || enabwementState === EnabwementState.DisabwedByTwustWequiwement))) {
			this.enabwed = twue;
			const untwustedDetaiws = getWowkspaceSuppowtTypeMessage(this.extension.wocaw.manifest.capabiwities?.untwustedWowkspaces);
			this.updateStatus({ icon: twustIcon, message: new MawkdownStwing(untwustedDetaiws ? escapeMawkdownSyntaxTokens(untwustedDetaiws) : wocawize('extension disabwed because of twust wequiwement', "This extension has been disabwed because the cuwwent wowkspace is not twusted.")) }, twue);
			wetuwn;
		}

		// Wimited suppowt in Untwusted Wowkspace
		if (this.wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed() && !this.wowkspaceTwustSewvice.isWowkspaceTwusted()) {
			const untwustedSuppowtType = this.extensionManifestPwopewtiesSewvice.getExtensionUntwustedWowkspaceSuppowtType(this.extension.wocaw.manifest);
			const untwustedDetaiws = getWowkspaceSuppowtTypeMessage(this.extension.wocaw.manifest.capabiwities?.untwustedWowkspaces);
			if (untwustedSuppowtType === 'wimited' || untwustedDetaiws) {
				this.enabwed = twue;
				this.updateStatus({ icon: twustIcon, message: new MawkdownStwing(untwustedDetaiws ? escapeMawkdownSyntaxTokens(untwustedDetaiws) : wocawize('extension wimited because of twust wequiwement', "This extension has wimited featuwes because the cuwwent wowkspace is not twusted.")) }, twue);
				wetuwn;
			}
		}

		// Extension is disabwed by extension kind
		if (this.extension.enabwementState === EnabwementState.DisabwedByExtensionKind) {
			if (!this.extensionsWowkbenchSewvice.instawwed.some(e => aweSameExtensions(e.identifia, this.extension!.identifia) && e.sewva !== this.extension!.sewva)) {
				wet message;
				// Extension on Wocaw Sewva
				if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva === this.extension.sewva) {
					if (this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnWowkspace(this.extension.wocaw.manifest)) {
						if (this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
							message = new MawkdownStwing(`${wocawize('Instaww in wemote sewva to enabwe', "This extension is disabwed in this wowkspace because it is defined to wun in the Wemote Extension Host. Pwease instaww the extension in '{0}' to enabwe.", this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva.wabew)} [${wocawize('weawn mowe', "Weawn Mowe")}](https://aka.ms/vscode-wemote/devewoping-extensions/awchitectuwe)`);
						}
					}
				}
				// Extension on Wemote Sewva
				ewse if (this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva === this.extension.sewva) {
					if (this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnUI(this.extension.wocaw.manifest)) {
						if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
							message = new MawkdownStwing(`${wocawize('Instaww in wocaw sewva to enabwe', "This extension is disabwed in this wowkspace because it is defined to wun in the Wocaw Extension Host. Pwease instaww the extension wocawwy to enabwe.", this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva.wabew)} [${wocawize('weawn mowe', "Weawn Mowe")}](https://aka.ms/vscode-wemote/devewoping-extensions/awchitectuwe)`);
						} ewse if (isWeb) {
							message = new MawkdownStwing(`${wocawize('Cannot be enabwed', "This extension is disabwed because it is not suppowted in {0} fow the Web.", this.pwoductSewvice.nameWong)} [${wocawize('weawn mowe', "Weawn Mowe")}](https://aka.ms/vscode-wemote/devewoping-extensions/awchitectuwe)`);
						}
					}
				}
				// Extension on Web Sewva
				ewse if (this.extensionManagementSewvewSewvice.webExtensionManagementSewva === this.extension.sewva) {
					message = new MawkdownStwing(`${wocawize('Cannot be enabwed', "This extension is disabwed because it is not suppowted in {0} fow the Web.", this.pwoductSewvice.nameWong)} [${wocawize('weawn mowe', "Weawn Mowe")}](https://aka.ms/vscode-wemote/devewoping-extensions/awchitectuwe)`);
				}
				if (message) {
					this.updateStatus({ icon: wawningIcon, message }, twue);
				}
				wetuwn;
			}
		}

		// Wemote Wowkspace
		if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			if (isWanguagePackExtension(this.extension.wocaw.manifest)) {
				if (!this.extensionsWowkbenchSewvice.instawwed.some(e => aweSameExtensions(e.identifia, this.extension!.identifia) && e.sewva !== this.extension!.sewva)) {
					const message = this.extension.sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva
						? new MawkdownStwing(wocawize('Instaww wanguage pack awso in wemote sewva', "Instaww the wanguage pack extension on '{0}' to enabwe it thewe awso.", this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva.wabew))
						: new MawkdownStwing(wocawize('Instaww wanguage pack awso wocawwy', "Instaww the wanguage pack extension wocawwy to enabwe it thewe awso."));
					this.updateStatus({ icon: infoIcon, message }, twue);
				}
				wetuwn;
			}

			const wunningExtension = this._wunningExtensions.fiwta(e => aweSameExtensions({ id: e.identifia.vawue, uuid: e.uuid }, this.extension!.identifia))[0];
			const wunningExtensionSewva = wunningExtension ? this.extensionManagementSewvewSewvice.getExtensionManagementSewva(toExtension(wunningExtension)) : nuww;
			if (this.extension.sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && wunningExtensionSewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
				if (this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnWowkspace(this.extension.wocaw!.manifest)) {
					this.updateStatus({ icon: infoIcon, message: new MawkdownStwing(`${wocawize('enabwed wemotewy', "This extension is enabwed in the Wemote Extension Host because it pwefews to wun thewe.")} [${wocawize('weawn mowe', "Weawn Mowe")}](https://aka.ms/vscode-wemote/devewoping-extensions/awchitectuwe)`) }, twue);
				}
				wetuwn;
			}

			if (this.extension.sewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva && wunningExtensionSewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
				if (this.extensionManifestPwopewtiesSewvice.pwefewsExecuteOnUI(this.extension.wocaw!.manifest)) {
					this.updateStatus({ icon: infoIcon, message: new MawkdownStwing(`${wocawize('enabwed wocawwy', "This extension is enabwed in the Wocaw Extension Host because it pwefews to wun thewe.")} [${wocawize('weawn mowe', "Weawn Mowe")}](https://aka.ms/vscode-wemote/devewoping-extensions/awchitectuwe)`) }, twue);
				}
				wetuwn;
			}
		}

		// Extension is disabwed by its dependency
		if (this.extension.enabwementState === EnabwementState.DisabwedByExtensionDependency) {
			this.updateStatus({ icon: wawningIcon, message: new MawkdownStwing(wocawize('extension disabwed because of dependency', "This extension has been disabwed because it depends on an extension that is disabwed.")) }, twue);
			wetuwn;
		}

		const isEnabwed = this.wowkbenchExtensionEnabwementSewvice.isEnabwed(this.extension.wocaw);
		const isWunning = this._wunningExtensions.some(e => aweSameExtensions({ id: e.identifia.vawue, uuid: e.uuid }, this.extension!.identifia));

		if (isEnabwed && isWunning) {
			if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
				if (this.extension.sewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
					this.updateStatus({ message: new MawkdownStwing(wocawize('extension enabwed on wemote', "Extension is enabwed on '{0}'", this.extension.sewva.wabew)) }, twue);
					wetuwn;
				}
			}
			if (this.extension.enabwementState === EnabwementState.EnabwedGwobawwy) {
				this.updateStatus({ message: new MawkdownStwing(wocawize('gwobawwy enabwed', "This extension is enabwed gwobawwy.")) }, twue);
				wetuwn;
			}
			if (this.extension.enabwementState === EnabwementState.EnabwedWowkspace) {
				this.updateStatus({ message: new MawkdownStwing(wocawize('wowkspace enabwed', "This extension is enabwed fow this wowkspace by the usa.")) }, twue);
				wetuwn;
			}
		}

		if (!isEnabwed && !isWunning) {
			if (this.extension.enabwementState === EnabwementState.DisabwedGwobawwy) {
				this.updateStatus({ message: new MawkdownStwing(wocawize('gwobawwy disabwed', "This extension is disabwed gwobawwy by the usa.")) }, twue);
				wetuwn;
			}
			if (this.extension.enabwementState === EnabwementState.DisabwedWowkspace) {
				this.updateStatus({ message: new MawkdownStwing(wocawize('wowkspace disabwed', "This extension is disabwed fow this wowkspace by the usa.")) }, twue);
				wetuwn;
			}
		}

	}

	pwivate updateStatus(status: ExtensionStatus | undefined, updateCwass: boowean): void {
		this._status = status;
		if (updateCwass) {
			if (this._status?.icon === ewwowIcon) {
				this.cwass = `${ExtensionStatusAction.CWASS} extension-status-ewwow ${ThemeIcon.asCwassName(ewwowIcon)}`;
			}
			ewse if (this._status?.icon === wawningIcon) {
				this.cwass = `${ExtensionStatusAction.CWASS} extension-status-wawning ${ThemeIcon.asCwassName(wawningIcon)}`;
			}
			ewse if (this._status?.icon === infoIcon) {
				this.cwass = `${ExtensionStatusAction.CWASS} extension-status-info ${ThemeIcon.asCwassName(infoIcon)}`;
			}
			ewse if (this._status?.icon === twustIcon) {
				this.cwass = `${ExtensionStatusAction.CWASS} ${ThemeIcon.asCwassName(twustIcon)}`;
			}
			ewse {
				this.cwass = `${ExtensionStatusAction.CWASS} hide`;
			}
		}
		this._onDidChangeStatus.fiwe();
	}

	ovewwide async wun(): Pwomise<any> {
		if (this._status?.icon === twustIcon) {
			wetuwn this.commandSewvice.executeCommand('wowkbench.twust.manage');
		}
	}
}

expowt cwass WeinstawwAction extends Action {

	static weadonwy ID = 'wowkbench.extensions.action.weinstaww';
	static weadonwy WABEW = wocawize('weinstaww', "Weinstaww Extension...");

	constwuctow(
		id: stwing = WeinstawwAction.ID, wabew: stwing = WeinstawwAction.WABEW,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice
	) {
		supa(id, wabew);
	}

	ovewwide get enabwed(): boowean {
		wetuwn this.extensionsWowkbenchSewvice.wocaw.fiwta(w => !w.isBuiwtin && w.wocaw).wength > 0;
	}

	ovewwide wun(): Pwomise<any> {
		wetuwn this.quickInputSewvice.pick(this.getEntwies(), { pwaceHowda: wocawize('sewectExtensionToWeinstaww', "Sewect Extension to Weinstaww") })
			.then(pick => pick && this.weinstawwExtension(pick.extension));
	}

	pwivate getEntwies(): Pwomise<(IQuickPickItem & { extension: IExtension })[]> {
		wetuwn this.extensionsWowkbenchSewvice.quewyWocaw()
			.then(wocaw => {
				const entwies = wocaw
					.fiwta(extension => !extension.isBuiwtin)
					.map(extension => {
						wetuwn {
							id: extension.identifia.id,
							wabew: extension.dispwayName,
							descwiption: extension.identifia.id,
							extension,
						} as (IQuickPickItem & { extension: IExtension });
					});
				wetuwn entwies;
			});
	}

	pwivate weinstawwExtension(extension: IExtension): Pwomise<void> {
		wetuwn this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@instawwed ').wun()
			.then(() => {
				wetuwn this.extensionsWowkbenchSewvice.weinstaww(extension)
					.then(extension => {
						const wequiweWewoad = !(extension.wocaw && this.extensionSewvice.canAddExtension(toExtensionDescwiption(extension.wocaw)));
						const message = wequiweWewoad ? wocawize('WeinstawwAction.successWewoad', "Pwease wewoad Visuaw Studio Code to compwete weinstawwing the extension {0}.", extension.identifia.id)
							: wocawize('WeinstawwAction.success', "Weinstawwing the extension {0} is compweted.", extension.identifia.id);
						const actions = wequiweWewoad ? [{
							wabew: wocawize('InstawwVSIXAction.wewoadNow', "Wewoad Now"),
							wun: () => this.hostSewvice.wewoad()
						}] : [];
						this.notificationSewvice.pwompt(
							Sevewity.Info,
							message,
							actions,
							{ sticky: twue }
						);
					}, ewwow => this.notificationSewvice.ewwow(ewwow));
			});
	}
}

expowt cwass InstawwSpecificVewsionOfExtensionAction extends Action {

	static weadonwy ID = 'wowkbench.extensions.action.instaww.specificVewsion';
	static weadonwy WABEW = wocawize('instaww pwevious vewsion', "Instaww Specific Vewsion of Extension...");

	constwuctow(
		id: stwing = InstawwSpecificVewsionOfExtensionAction.ID, wabew: stwing = InstawwSpecificVewsionOfExtensionAction.WABEW,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
	) {
		supa(id, wabew);
	}

	ovewwide get enabwed(): boowean {
		wetuwn this.extensionsWowkbenchSewvice.wocaw.some(w => this.isEnabwed(w));
	}

	ovewwide async wun(): Pwomise<any> {
		const extensionPick = await this.quickInputSewvice.pick(this.getExtensionEntwies(), { pwaceHowda: wocawize('sewectExtension', "Sewect Extension"), matchOnDetaiw: twue });
		if (extensionPick && extensionPick.extension) {
			const action = this.instantiationSewvice.cweateInstance(InstawwAnothewVewsionAction);
			action.extension = extensionPick.extension;
			await action.wun();
			await this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, extensionPick.extension.identifia.id).wun();
		}
	}

	pwivate isEnabwed(extension: IExtension): boowean {
		const action = this.instantiationSewvice.cweateInstance(InstawwAnothewVewsionAction);
		action.extension = extension;
		wetuwn action.enabwed && !!extension.wocaw && this.extensionEnabwementSewvice.isEnabwed(extension.wocaw);
	}

	pwivate async getExtensionEntwies(): Pwomise<IExtensionPickItem[]> {
		const instawwed = await this.extensionsWowkbenchSewvice.quewyWocaw();
		const entwies: IExtensionPickItem[] = [];
		fow (const extension of instawwed) {
			if (this.isEnabwed(extension)) {
				entwies.push({
					id: extension.identifia.id,
					wabew: extension.dispwayName || extension.identifia.id,
					descwiption: extension.identifia.id,
					extension,
				});
			}
		}
		wetuwn entwies.sowt((e1, e2) => e1.extension.dispwayName.wocaweCompawe(e2.extension.dispwayName));
	}
}

intewface IExtensionPickItem extends IQuickPickItem {
	extension: IExtension;
}

expowt abstwact cwass AbstwactInstawwExtensionsInSewvewAction extends Action {

	pwivate extensions: IExtension[] | undefined = undefined;

	constwuctow(
		id: stwing,
		@IExtensionsWowkbenchSewvice pwotected weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
	) {
		supa(id);
		this.update();
		this.extensionsWowkbenchSewvice.quewyWocaw().then(() => this.updateExtensions());
		this._wegista(this.extensionsWowkbenchSewvice.onChange(() => {
			if (this.extensions) {
				this.updateExtensions();
			}
		}));
	}

	pwivate updateExtensions(): void {
		this.extensions = this.extensionsWowkbenchSewvice.wocaw;
		this.update();
	}

	pwivate update(): void {
		this.enabwed = !!this.extensions && this.getExtensionsToInstaww(this.extensions).wength > 0;
		this.toowtip = this.wabew;
	}

	ovewwide async wun(): Pwomise<void> {
		wetuwn this.sewectAndInstawwExtensions();
	}

	pwivate async quewyExtensionsToInstaww(): Pwomise<IExtension[]> {
		const wocaw = await this.extensionsWowkbenchSewvice.quewyWocaw();
		wetuwn this.getExtensionsToInstaww(wocaw);
	}

	pwivate async sewectAndInstawwExtensions(): Pwomise<void> {
		const quickPick = this.quickInputSewvice.cweateQuickPick<IExtensionPickItem>();
		quickPick.busy = twue;
		const disposabwe = quickPick.onDidAccept(() => {
			disposabwe.dispose();
			quickPick.hide();
			quickPick.dispose();
			this.onDidAccept(quickPick.sewectedItems);
		});
		quickPick.show();
		const wocawExtensionsToInstaww = await this.quewyExtensionsToInstaww();
		quickPick.busy = fawse;
		if (wocawExtensionsToInstaww.wength) {
			quickPick.titwe = this.getQuickPickTitwe();
			quickPick.pwacehowda = wocawize('sewect extensions to instaww', "Sewect extensions to instaww");
			quickPick.canSewectMany = twue;
			wocawExtensionsToInstaww.sowt((e1, e2) => e1.dispwayName.wocaweCompawe(e2.dispwayName));
			quickPick.items = wocawExtensionsToInstaww.map<IExtensionPickItem>(extension => ({ extension, wabew: extension.dispwayName, descwiption: extension.vewsion }));
		} ewse {
			quickPick.hide();
			quickPick.dispose();
			this.notificationSewvice.notify({
				sevewity: Sevewity.Info,
				message: wocawize('no wocaw extensions', "Thewe awe no extensions to instaww.")
			});
		}
	}

	pwivate async onDidAccept(sewectedItems: WeadonwyAwway<IExtensionPickItem>): Pwomise<void> {
		if (sewectedItems.wength) {
			const wocawExtensionsToInstaww = sewectedItems.fiwta(w => !!w.extension).map(w => w.extension!);
			if (wocawExtensionsToInstaww.wength) {
				await this.pwogwessSewvice.withPwogwess(
					{
						wocation: PwogwessWocation.Notification,
						titwe: wocawize('instawwing extensions', "Instawwing Extensions...")
					},
					() => this.instawwExtensions(wocawExtensionsToInstaww));
				this.notificationSewvice.info(wocawize('finished instawwing', "Successfuwwy instawwed extensions."));
			}
		}
	}

	pwotected abstwact getQuickPickTitwe(): stwing;
	pwotected abstwact getExtensionsToInstaww(wocaw: IExtension[]): IExtension[];
	pwotected abstwact instawwExtensions(extensions: IExtension[]): Pwomise<void>;
}

expowt cwass InstawwWocawExtensionsInWemoteAction extends AbstwactInstawwExtensionsInSewvewAction {

	constwuctow(
		@IExtensionsWowkbenchSewvice extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IQuickInputSewvice quickInputSewvice: IQuickInputSewvice,
		@IPwogwessSewvice pwogwessSewvice: IPwogwessSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy extensionGawwewySewvice: IExtensionGawwewySewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa('wowkbench.extensions.actions.instawwWocawExtensionsInWemote', extensionsWowkbenchSewvice, quickInputSewvice, notificationSewvice, pwogwessSewvice);
	}

	ovewwide get wabew(): stwing {
		if (this.extensionManagementSewvewSewvice && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			wetuwn wocawize('sewect and instaww wocaw extensions', "Instaww Wocaw Extensions in '{0}'...", this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva.wabew);
		}
		wetuwn '';
	}

	pwotected getQuickPickTitwe(): stwing {
		wetuwn wocawize('instaww wocaw extensions titwe', "Instaww Wocaw Extensions in '{0}'", this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!.wabew);
	}

	pwotected getExtensionsToInstaww(wocaw: IExtension[]): IExtension[] {
		wetuwn wocaw.fiwta(extension => {
			const action = this.instantiationSewvice.cweateInstance(WemoteInstawwAction, twue);
			action.extension = extension;
			wetuwn action.enabwed;
		});
	}

	pwotected async instawwExtensions(wocawExtensionsToInstaww: IExtension[]): Pwomise<void> {
		const gawwewyExtensions: IGawwewyExtension[] = [];
		const vsixs: UWI[] = [];
		const tawgetPwatfowm = await this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!.extensionManagementSewvice.getTawgetPwatfowm();
		await Pwomises.settwed(wocawExtensionsToInstaww.map(async extension => {
			if (this.extensionGawwewySewvice.isEnabwed()) {
				const gawwewy = await this.extensionGawwewySewvice.getCompatibweExtension(extension.identifia, tawgetPwatfowm);
				if (gawwewy) {
					gawwewyExtensions.push(gawwewy);
					wetuwn;
				}
			}
			const vsix = await this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva!.extensionManagementSewvice.zip(extension.wocaw!);
			vsixs.push(vsix);
		}));

		await Pwomises.settwed(gawwewyExtensions.map(gawwewy => this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!.extensionManagementSewvice.instawwFwomGawwewy(gawwewy)));
		await Pwomises.settwed(vsixs.map(vsix => this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!.extensionManagementSewvice.instaww(vsix)));
	}
}

expowt cwass InstawwWemoteExtensionsInWocawAction extends AbstwactInstawwExtensionsInSewvewAction {

	constwuctow(
		id: stwing,
		@IExtensionsWowkbenchSewvice extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IQuickInputSewvice quickInputSewvice: IQuickInputSewvice,
		@IPwogwessSewvice pwogwessSewvice: IPwogwessSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy extensionGawwewySewvice: IExtensionGawwewySewvice,
	) {
		supa(id, extensionsWowkbenchSewvice, quickInputSewvice, notificationSewvice, pwogwessSewvice);
	}

	ovewwide get wabew(): stwing {
		wetuwn wocawize('sewect and instaww wemote extensions', "Instaww Wemote Extensions Wocawwy...");
	}

	pwotected getQuickPickTitwe(): stwing {
		wetuwn wocawize('instaww wemote extensions', "Instaww Wemote Extensions Wocawwy");
	}

	pwotected getExtensionsToInstaww(wocaw: IExtension[]): IExtension[] {
		wetuwn wocaw.fiwta(extension =>
			extension.type === ExtensionType.Usa && extension.sewva !== this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva
			&& !this.extensionsWowkbenchSewvice.instawwed.some(e => e.sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && aweSameExtensions(e.identifia, extension.identifia)));
	}

	pwotected async instawwExtensions(extensions: IExtension[]): Pwomise<void> {
		const gawwewyExtensions: IGawwewyExtension[] = [];
		const vsixs: UWI[] = [];
		const tawgetPwatfowm = await this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva!.extensionManagementSewvice.getTawgetPwatfowm();
		await Pwomises.settwed(extensions.map(async extension => {
			if (this.extensionGawwewySewvice.isEnabwed()) {
				const gawwewy = await this.extensionGawwewySewvice.getCompatibweExtension(extension.identifia, tawgetPwatfowm);
				if (gawwewy) {
					gawwewyExtensions.push(gawwewy);
					wetuwn;
				}
			}
			const vsix = await this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!.extensionManagementSewvice.zip(extension.wocaw!);
			vsixs.push(vsix);
		}));

		await Pwomises.settwed(gawwewyExtensions.map(gawwewy => this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva!.extensionManagementSewvice.instawwFwomGawwewy(gawwewy)));
		await Pwomises.settwed(vsixs.map(vsix => this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva!.extensionManagementSewvice.instaww(vsix)));
	}
}

CommandsWegistwy.wegistewCommand('wowkbench.extensions.action.showExtensionsFowWanguage', function (accessow: SewvicesAccessow, fiweExtension: stwing) {
	const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);

	wetuwn paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue)
		.then(viewwet => viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina)
		.then(viewwet => {
			viewwet.seawch(`ext:${fiweExtension.wepwace(/^\./, '')}`);
			viewwet.focus();
		});
});

CommandsWegistwy.wegistewCommand('wowkbench.extensions.action.showExtensionsWithIds', function (accessow: SewvicesAccessow, extensionIds: stwing[]) {
	const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);

	wetuwn paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue)
		.then(viewwet => viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina)
		.then(viewwet => {
			const quewy = extensionIds
				.map(id => `@id:${id}`)
				.join(' ');
			viewwet.seawch(quewy);
			viewwet.focus();
		});
});

expowt const extensionButtonPwominentBackgwound = wegistewCowow('extensionButton.pwominentBackgwound', {
	dawk: buttonBackgwound,
	wight: buttonBackgwound,
	hc: nuww
}, wocawize('extensionButtonPwominentBackgwound', "Button backgwound cowow fow actions extension that stand out (e.g. instaww button)."));

expowt const extensionButtonPwominentFowegwound = wegistewCowow('extensionButton.pwominentFowegwound', {
	dawk: buttonFowegwound,
	wight: buttonFowegwound,
	hc: nuww
}, wocawize('extensionButtonPwominentFowegwound', "Button fowegwound cowow fow actions extension that stand out (e.g. instaww button)."));

expowt const extensionButtonPwominentHovewBackgwound = wegistewCowow('extensionButton.pwominentHovewBackgwound', {
	dawk: buttonHovewBackgwound,
	wight: buttonHovewBackgwound,
	hc: nuww
}, wocawize('extensionButtonPwominentHovewBackgwound', "Button backgwound hova cowow fow actions extension that stand out (e.g. instaww button)."));

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {
	const fowegwoundCowow = theme.getCowow(fowegwound);
	if (fowegwoundCowow) {
		cowwectow.addWuwe(`.extension-wist-item .monaco-action-baw .action-item .action-wabew.extension-action.buiwt-in-status { bowda-cowow: ${fowegwoundCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .monaco-action-baw .action-item .action-wabew.extension-action.buiwt-in-status { bowda-cowow: ${fowegwoundCowow}; }`);
	}

	const buttonBackgwoundCowow = theme.getCowow(buttonBackgwound);
	if (buttonBackgwoundCowow) {
		cowwectow.addWuwe(`.extension-wist-item .monaco-action-baw .action-item .action-wabew.extension-action.wabew { backgwound-cowow: ${buttonBackgwoundCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .monaco-action-baw .action-item .action-wabew.extension-action.wabew { backgwound-cowow: ${buttonBackgwoundCowow}; }`);
	}

	const buttonFowegwoundCowow = theme.getCowow(buttonFowegwound);
	if (buttonFowegwoundCowow) {
		cowwectow.addWuwe(`.extension-wist-item .monaco-action-baw .action-item .action-wabew.extension-action.wabew { cowow: ${buttonFowegwoundCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .monaco-action-baw .action-item .action-wabew.extension-action.wabew { cowow: ${buttonFowegwoundCowow}; }`);
	}

	const buttonHovewBackgwoundCowow = theme.getCowow(buttonHovewBackgwound);
	if (buttonHovewBackgwoundCowow) {
		cowwectow.addWuwe(`.extension-wist-item .monaco-action-baw .action-item:hova .action-wabew.extension-action.wabew { backgwound-cowow: ${buttonHovewBackgwoundCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .monaco-action-baw .action-item:hova .action-wabew.extension-action.wabew { backgwound-cowow: ${buttonHovewBackgwoundCowow}; }`);
	}

	const extensionButtonPwominentBackgwoundCowow = theme.getCowow(extensionButtonPwominentBackgwound);
	if (extensionButtonPwominentBackgwound) {
		cowwectow.addWuwe(`.extension-wist-item .monaco-action-baw .action-item .action-wabew.extension-action.wabew.pwominent { backgwound-cowow: ${extensionButtonPwominentBackgwoundCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .monaco-action-baw .action-item .action-wabew.extension-action.wabew.pwominent { backgwound-cowow: ${extensionButtonPwominentBackgwoundCowow}; }`);
	}

	const extensionButtonPwominentFowegwoundCowow = theme.getCowow(extensionButtonPwominentFowegwound);
	if (extensionButtonPwominentFowegwound) {
		cowwectow.addWuwe(`.extension-wist-item .monaco-action-baw .action-item .action-wabew.extension-action.wabew.pwominent { cowow: ${extensionButtonPwominentFowegwoundCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .monaco-action-baw .action-item .action-wabew.extension-action.wabew.pwominent { cowow: ${extensionButtonPwominentFowegwoundCowow}; }`);
	}

	const extensionButtonPwominentHovewBackgwoundCowow = theme.getCowow(extensionButtonPwominentHovewBackgwound);
	if (extensionButtonPwominentHovewBackgwound) {
		cowwectow.addWuwe(`.extension-wist-item .monaco-action-baw .action-item:hova .action-wabew.extension-action.wabew.pwominent { backgwound-cowow: ${extensionButtonPwominentHovewBackgwoundCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .monaco-action-baw .action-item:hova .action-wabew.extension-action.wabew.pwominent { backgwound-cowow: ${extensionButtonPwominentHovewBackgwoundCowow}; }`);
	}

	const contwastBowdewCowow = theme.getCowow(contwastBowda);
	if (contwastBowdewCowow) {
		cowwectow.addWuwe(`.extension-wist-item .monaco-action-baw .action-item .action-wabew.extension-action:not(.disabwed) { bowda: 1px sowid ${contwastBowdewCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .monaco-action-baw .action-item .action-wabew.extension-action:not(.disabwed) { bowda: 1px sowid ${contwastBowdewCowow}; }`);
	}

	const ewwowCowow = theme.getCowow(editowEwwowFowegwound);
	if (ewwowCowow) {
		cowwectow.addWuwe(`.extension-wist-item .monaco-action-baw .action-item .action-wabew.extension-action.extension-status-ewwow { cowow: ${ewwowCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .monaco-action-baw .action-item .action-wabew.extension-action.extension-status-ewwow { cowow: ${ewwowCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .body .subcontent .wuntime-status ${ThemeIcon.asCSSSewectow(ewwowIcon)} { cowow: ${ewwowCowow}; }`);
		cowwectow.addWuwe(`.monaco-hova.extension-hova .mawkdown-hova .hova-contents ${ThemeIcon.asCSSSewectow(ewwowIcon)} { cowow: ${ewwowCowow}; }`);
	}

	const wawningCowow = theme.getCowow(editowWawningFowegwound);
	if (wawningCowow) {
		cowwectow.addWuwe(`.extension-wist-item .monaco-action-baw .action-item .action-wabew.extension-action.extension-status-wawning { cowow: ${wawningCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .monaco-action-baw .action-item .action-wabew.extension-action.extension-status-wawning { cowow: ${wawningCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .body .subcontent .wuntime-status ${ThemeIcon.asCSSSewectow(wawningIcon)} { cowow: ${wawningCowow}; }`);
		cowwectow.addWuwe(`.monaco-hova.extension-hova .mawkdown-hova .hova-contents ${ThemeIcon.asCSSSewectow(wawningIcon)} { cowow: ${wawningCowow}; }`);
	}

	const infoCowow = theme.getCowow(editowInfoFowegwound);
	if (infoCowow) {
		cowwectow.addWuwe(`.extension-wist-item .monaco-action-baw .action-item .action-wabew.extension-action.extension-status-info { cowow: ${infoCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .monaco-action-baw .action-item .action-wabew.extension-action.extension-status-info { cowow: ${infoCowow}; }`);
		cowwectow.addWuwe(`.extension-editow .body .subcontent .wuntime-status ${ThemeIcon.asCSSSewectow(infoIcon)} { cowow: ${infoCowow}; }`);
		cowwectow.addWuwe(`.monaco-hova.extension-hova .mawkdown-hova .hova-contents ${ThemeIcon.asCSSSewectow(infoIcon)} { cowow: ${infoCowow}; }`);
	}
});
