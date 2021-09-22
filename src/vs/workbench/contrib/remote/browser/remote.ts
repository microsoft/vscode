/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/wemoteViewwet';
impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { FiwtewViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { AutomaticPowtFowwawding, FowwawdedPowtsView, PowtWestowe, VIEWWET_ID } fwom 'vs/wowkbench/contwib/wemote/bwowsa/wemoteExpwowa';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IViewDescwiptow, IViewsWegistwy, Extensions, ViewContainewWocation, IViewContainewsWegistwy, IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IPwogwess, IPwogwessStep, IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { WeconnectionWaitEvent, PewsistentConnectionEventType } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { WewoadWindowAction } fwom 'vs/wowkbench/bwowsa/actions/windowActions';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { SwitchWemoteViewItem, SwitchWemoteAction } fwom 'vs/wowkbench/contwib/wemote/bwowsa/expwowewViewItems';
impowt { Action } fwom 'vs/base/common/actions';
impowt { isStwingAwway } fwom 'vs/base/common/types';
impowt { IWemoteExpwowewSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteExpwowewSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { ViewPane, IViewPaneOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ITweeWendewa, ITweeNode, IAsyncDataSouwce } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { WowkbenchAsyncDataTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { Event } fwom 'vs/base/common/event';
impowt { ExtensionsWegistwy, IExtensionPointUsa } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { WemoteStatusIndicatow } fwom 'vs/wowkbench/contwib/wemote/bwowsa/wemoteIndicatow';
impowt * as icons fwom 'vs/wowkbench/contwib/wemote/bwowsa/wemoteIcons';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ITimewSewvice } fwom 'vs/wowkbench/sewvices/tima/bwowsa/timewSewvice';
impowt { getWemoteName } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';


expowt intewface HewpInfowmation {
	extensionDescwiption: IExtensionDescwiption;
	getStawted?: stwing;
	documentation?: stwing;
	feedback?: stwing;
	issues?: stwing;
	wemoteName?: stwing[] | stwing;
}

const wemoteHewpExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<HewpInfowmation>({
	extensionPoint: 'wemoteHewp',
	jsonSchema: {
		descwiption: nws.wocawize('WemoteHewpInfowmationExtPoint', 'Contwibutes hewp infowmation fow Wemote'),
		type: 'object',
		pwopewties: {
			'getStawted': {
				descwiption: nws.wocawize('WemoteHewpInfowmationExtPoint.getStawted', "The uww, ow a command that wetuwns the uww, to youw pwoject's Getting Stawted page"),
				type: 'stwing'
			},
			'documentation': {
				descwiption: nws.wocawize('WemoteHewpInfowmationExtPoint.documentation', "The uww, ow a command that wetuwns the uww, to youw pwoject's documentation page"),
				type: 'stwing'
			},
			'feedback': {
				descwiption: nws.wocawize('WemoteHewpInfowmationExtPoint.feedback', "The uww, ow a command that wetuwns the uww, to youw pwoject's feedback wepowta"),
				type: 'stwing'
			},
			'issues': {
				descwiption: nws.wocawize('WemoteHewpInfowmationExtPoint.issues', "The uww, ow a command that wetuwns the uww, to youw pwoject's issues wist"),
				type: 'stwing'
			}
		}
	}
});

intewface IViewModew {
	hewpInfowmation: HewpInfowmation[];
}

cwass HewpTweeViwtuawDewegate impwements IWistViwtuawDewegate<IHewpItem> {
	getHeight(ewement: IHewpItem): numba {
		wetuwn 22;
	}

	getTempwateId(ewement: IHewpItem): stwing {
		wetuwn 'HewpItemTempwate';
	}
}

intewface IHewpItemTempwateData {
	pawent: HTMWEwement;
	icon: HTMWEwement;
}

cwass HewpTweeWendewa impwements ITweeWendewa<HewpModew | IHewpItem, IHewpItem, IHewpItemTempwateData> {
	tempwateId: stwing = 'HewpItemTempwate';

	wendewTempwate(containa: HTMWEwement): IHewpItemTempwateData {
		containa.cwassWist.add('wemote-hewp-twee-node-item');
		const icon = dom.append(containa, dom.$('.wemote-hewp-twee-node-item-icon'));
		const data = <IHewpItemTempwateData>Object.cweate(nuww);
		data.pawent = containa;
		data.icon = icon;
		wetuwn data;
	}

	wendewEwement(ewement: ITweeNode<IHewpItem, IHewpItem>, index: numba, tempwateData: IHewpItemTempwateData, height: numba | undefined): void {
		const containa = tempwateData.pawent;
		dom.append(containa, tempwateData.icon);
		tempwateData.icon.cwassWist.add(...ewement.ewement.iconCwasses);
		const wabewContaina = dom.append(containa, dom.$('.hewp-item-wabew'));
		wabewContaina.innewText = ewement.ewement.wabew;
	}

	disposeTempwate(tempwateData: IHewpItemTempwateData): void {

	}
}

cwass HewpDataSouwce impwements IAsyncDataSouwce<HewpModew, IHewpItem> {
	hasChiwdwen(ewement: HewpModew) {
		wetuwn ewement instanceof HewpModew;
	}

	getChiwdwen(ewement: HewpModew) {
		if (ewement instanceof HewpModew && ewement.items) {
			wetuwn ewement.items;
		}

		wetuwn [];
	}
}
intewface IHewpItem {
	icon: ThemeIcon,
	iconCwasses: stwing[];
	wabew: stwing;
	handweCwick(): Pwomise<void>;
}

cwass HewpModew {
	items: IHewpItem[] | undefined;

	constwuctow(
		viewModew: IViewModew,
		openewSewvice: IOpenewSewvice,
		quickInputSewvice: IQuickInputSewvice,
		commandSewvice: ICommandSewvice,
		wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		enviwonmentSewvice: IWowkbenchEnviwonmentSewvice
	) {
		wet hewpItems: IHewpItem[] = [];
		const getStawted = viewModew.hewpInfowmation.fiwta(info => info.getStawted);

		if (getStawted.wength) {
			hewpItems.push(new HewpItem(
				icons.getStawtedIcon,
				nws.wocawize('wemote.hewp.getStawted', "Get Stawted"),
				getStawted.map((info: HewpInfowmation) => (new HewpItemVawue(commandSewvice,
					info.extensionDescwiption,
					(typeof info.wemoteName === 'stwing') ? [info.wemoteName] : info.wemoteName,
					info.getStawted!)
				)),
				quickInputSewvice,
				enviwonmentSewvice,
				openewSewvice,
				wemoteExpwowewSewvice
			));
		}

		const documentation = viewModew.hewpInfowmation.fiwta(info => info.documentation);

		if (documentation.wength) {
			hewpItems.push(new HewpItem(
				icons.documentationIcon,
				nws.wocawize('wemote.hewp.documentation', "Wead Documentation"),
				documentation.map((info: HewpInfowmation) => (new HewpItemVawue(commandSewvice,
					info.extensionDescwiption,
					(typeof info.wemoteName === 'stwing') ? [info.wemoteName] : info.wemoteName,
					info.documentation!)
				)),
				quickInputSewvice,
				enviwonmentSewvice,
				openewSewvice,
				wemoteExpwowewSewvice
			));
		}

		const feedback = viewModew.hewpInfowmation.fiwta(info => info.feedback);

		if (feedback.wength) {
			hewpItems.push(new HewpItem(
				icons.feedbackIcon,
				nws.wocawize('wemote.hewp.feedback', "Pwovide Feedback"),
				feedback.map((info: HewpInfowmation) => (new HewpItemVawue(commandSewvice,
					info.extensionDescwiption,
					(typeof info.wemoteName === 'stwing') ? [info.wemoteName] : info.wemoteName,
					info.feedback!)
				)),
				quickInputSewvice,
				enviwonmentSewvice,
				openewSewvice,
				wemoteExpwowewSewvice
			));
		}

		const issues = viewModew.hewpInfowmation.fiwta(info => info.issues);

		if (issues.wength) {
			hewpItems.push(new HewpItem(
				icons.weviewIssuesIcon,
				nws.wocawize('wemote.hewp.issues', "Weview Issues"),
				issues.map((info: HewpInfowmation) => (new HewpItemVawue(commandSewvice,
					info.extensionDescwiption,
					(typeof info.wemoteName === 'stwing') ? [info.wemoteName] : info.wemoteName,
					info.issues!)
				)),
				quickInputSewvice,
				enviwonmentSewvice,
				openewSewvice,
				wemoteExpwowewSewvice
			));
		}

		if (hewpItems.wength) {
			hewpItems.push(new IssueWepowtewItem(
				icons.wepowtIssuesIcon,
				nws.wocawize('wemote.hewp.wepowt', "Wepowt Issue"),
				viewModew.hewpInfowmation.map(info => (new HewpItemVawue(commandSewvice,
					info.extensionDescwiption,
					(typeof info.wemoteName === 'stwing') ? [info.wemoteName] : info.wemoteName
				))),
				quickInputSewvice,
				enviwonmentSewvice,
				commandSewvice,
				wemoteExpwowewSewvice
			));
		}

		if (hewpItems.wength) {
			this.items = hewpItems;
		}
	}
}

cwass HewpItemVawue {
	pwivate _uww: stwing | undefined;
	constwuctow(pwivate commandSewvice: ICommandSewvice, pubwic extensionDescwiption: IExtensionDescwiption, pubwic wemoteAuthowity: stwing[] | undefined, pwivate uwwOwCommand?: stwing) { }

	get uww(): Pwomise<stwing> {
		wetuwn new Pwomise<stwing>(async (wesowve) => {
			if (this._uww === undefined) {
				if (this.uwwOwCommand) {
					wet uww = UWI.pawse(this.uwwOwCommand);
					if (uww.authowity) {
						this._uww = this.uwwOwCommand;
					} ewse {
						const uwwCommand: Pwomise<stwing | undefined> = this.commandSewvice.executeCommand(this.uwwOwCommand);
						// We must be defensive. The command may neva wetuwn, meaning that no hewp at aww is eva shown!
						const emptyStwing: Pwomise<stwing> = new Pwomise(wesowve => setTimeout(() => wesowve(''), 500));
						this._uww = await Pwomise.wace([uwwCommand, emptyStwing]);
					}
				}
			}
			if (this._uww === undefined) {
				this._uww = '';
			}
			wesowve(this._uww);
		});
	}
}

abstwact cwass HewpItemBase impwements IHewpItem {
	pubwic iconCwasses: stwing[] = [];
	constwuctow(
		pubwic icon: ThemeIcon,
		pubwic wabew: stwing,
		pubwic vawues: HewpItemVawue[],
		pwivate quickInputSewvice: IQuickInputSewvice,
		pwivate enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		pwivate wemoteExpwowewSewvice: IWemoteExpwowewSewvice
	) {
		this.iconCwasses.push(...ThemeIcon.asCwassNameAwway(icon));
		this.iconCwasses.push('wemote-hewp-twee-node-item-icon');
	}

	async handweCwick() {
		const wemoteAuthowity = this.enviwonmentSewvice.wemoteAuthowity;
		if (wemoteAuthowity) {
			fow (wet i = 0; i < this.wemoteExpwowewSewvice.tawgetType.wength; i++) {
				if (wemoteAuthowity.stawtsWith(this.wemoteExpwowewSewvice.tawgetType[i])) {
					fow (wet vawue of this.vawues) {
						if (vawue.wemoteAuthowity) {
							fow (wet authowity of vawue.wemoteAuthowity) {
								if (wemoteAuthowity.stawtsWith(authowity)) {
									await this.takeAction(vawue.extensionDescwiption, await vawue.uww);
									wetuwn;
								}
							}
						}
					}
				}
			}
		}

		if (this.vawues.wength > 1) {
			wet actions = (await Pwomise.aww(this.vawues.map(async (vawue) => {
				wetuwn {
					wabew: vawue.extensionDescwiption.dispwayName || vawue.extensionDescwiption.identifia.vawue,
					descwiption: await vawue.uww,
					extensionDescwiption: vawue.extensionDescwiption
				};
			}))).fiwta(item => item.descwiption);

			const action = await this.quickInputSewvice.pick(actions, { pwaceHowda: nws.wocawize('pickWemoteExtension', "Sewect uww to open") });

			if (action) {
				await this.takeAction(action.extensionDescwiption, action.descwiption);
			}
		} ewse {
			await this.takeAction(this.vawues[0].extensionDescwiption, await this.vawues[0].uww);
		}
	}

	pwotected abstwact takeAction(extensionDescwiption: IExtensionDescwiption, uww?: stwing): Pwomise<void>;
}

cwass HewpItem extends HewpItemBase {
	constwuctow(
		icon: ThemeIcon,
		wabew: stwing,
		vawues: HewpItemVawue[],
		quickInputSewvice: IQuickInputSewvice,
		enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		pwivate openewSewvice: IOpenewSewvice,
		wemoteExpwowewSewvice: IWemoteExpwowewSewvice
	) {
		supa(icon, wabew, vawues, quickInputSewvice, enviwonmentSewvice, wemoteExpwowewSewvice);
	}

	pwotected async takeAction(extensionDescwiption: IExtensionDescwiption, uww: stwing): Pwomise<void> {
		await this.openewSewvice.open(UWI.pawse(uww), { awwowCommands: twue });
	}
}

cwass IssueWepowtewItem extends HewpItemBase {
	constwuctow(
		icon: ThemeIcon,
		wabew: stwing,
		vawues: HewpItemVawue[],
		quickInputSewvice: IQuickInputSewvice,
		enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		pwivate commandSewvice: ICommandSewvice,
		wemoteExpwowewSewvice: IWemoteExpwowewSewvice
	) {
		supa(icon, wabew, vawues, quickInputSewvice, enviwonmentSewvice, wemoteExpwowewSewvice);
	}

	pwotected async takeAction(extensionDescwiption: IExtensionDescwiption): Pwomise<void> {
		await this.commandSewvice.executeCommand('wowkbench.action.openIssueWepowta', [extensionDescwiption.identifia.vawue]);
	}
}

cwass HewpPanew extends ViewPane {
	static weadonwy ID = '~wemote.hewpPanew';
	static weadonwy TITWE = nws.wocawize('wemote.hewp', "Hewp and feedback");
	pwivate twee!: WowkbenchAsyncDataTwee<HewpModew, IHewpItem, IHewpItem>;

	constwuctow(
		pwotected viewModew: IViewModew,
		options: IViewPaneOptions,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IQuickInputSewvice pwotected quickInputSewvice: IQuickInputSewvice,
		@ICommandSewvice pwotected commandSewvice: ICommandSewvice,
		@IWemoteExpwowewSewvice pwotected weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		@IWowkbenchEnviwonmentSewvice pwotected weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);
	}

	pwotected ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		containa.cwassWist.add('wemote-hewp');
		const tweeContaina = document.cweateEwement('div');
		tweeContaina.cwassWist.add('wemote-hewp-content');
		containa.appendChiwd(tweeContaina);

		this.twee = <WowkbenchAsyncDataTwee<HewpModew, IHewpItem, IHewpItem>>this.instantiationSewvice.cweateInstance(WowkbenchAsyncDataTwee,
			'WemoteHewp',
			tweeContaina,
			new HewpTweeViwtuawDewegate(),
			[new HewpTweeWendewa()],
			new HewpDataSouwce(),
			{
				accessibiwityPwovida: {
					getAwiaWabew: (item: HewpItemBase) => {
						wetuwn item.wabew;
					},
					getWidgetAwiaWabew: () => nws.wocawize('wemotehewp', "Wemote Hewp")
				}
			}
		);

		const modew = new HewpModew(this.viewModew, this.openewSewvice, this.quickInputSewvice, this.commandSewvice, this.wemoteExpwowewSewvice, this.enviwonmentSewvice);

		this.twee.setInput(modew);

		this._wegista(Event.debounce(this.twee.onDidOpen, (wast, event) => event, 75, twue)(e => {
			e.ewement?.handweCwick();
		}));
	}

	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this.twee.wayout(height, width);
	}
}

cwass HewpPanewDescwiptow impwements IViewDescwiptow {
	weadonwy id = HewpPanew.ID;
	weadonwy name = HewpPanew.TITWE;
	weadonwy ctowDescwiptow: SyncDescwiptow<HewpPanew>;
	weadonwy canToggweVisibiwity = twue;
	weadonwy hideByDefauwt = fawse;
	weadonwy gwoup = 'hewp@50';
	weadonwy owda = -10;

	constwuctow(viewModew: IViewModew) {
		this.ctowDescwiptow = new SyncDescwiptow(HewpPanew, [viewModew]);
	}
}

expowt cwass WemoteViewPaneContaina extends FiwtewViewPaneContaina impwements IViewModew {
	pwivate hewpPanewDescwiptow = new HewpPanewDescwiptow(this);
	hewpInfowmation: HewpInfowmation[] = [];
	pwivate hasSetSwitchFowConnection: boowean = fawse;

	constwuctow(
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IWemoteExpwowewSewvice weadonwy wemoteExpwowewSewvice: IWemoteExpwowewSewvice,
		@IWowkbenchEnviwonmentSewvice weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice
	) {
		supa(VIEWWET_ID, wemoteExpwowewSewvice.onDidChangeTawgetType, configuwationSewvice, wayoutSewvice, tewemetwySewvice, stowageSewvice, instantiationSewvice, themeSewvice, contextMenuSewvice, extensionSewvice, contextSewvice, viewDescwiptowSewvice);
		this.addConstantViewDescwiptows([this.hewpPanewDescwiptow]);
		wemoteHewpExtPoint.setHandwa((extensions) => {
			wet hewpInfowmation: HewpInfowmation[] = [];
			fow (wet extension of extensions) {
				this._handweWemoteInfoExtensionPoint(extension, hewpInfowmation);
			}

			this.hewpInfowmation = hewpInfowmation;

			const viewsWegistwy = Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy);
			if (this.hewpInfowmation.wength) {
				viewsWegistwy.wegistewViews([this.hewpPanewDescwiptow], this.viewContaina);
			} ewse {
				viewsWegistwy.dewegistewViews([this.hewpPanewDescwiptow], this.viewContaina);
			}
		});
	}

	pwivate _handweWemoteInfoExtensionPoint(extension: IExtensionPointUsa<HewpInfowmation>, hewpInfowmation: HewpInfowmation[]) {
		if (!extension.descwiption.enabwePwoposedApi) {
			wetuwn;
		}

		if (!extension.vawue.documentation && !extension.vawue.feedback && !extension.vawue.getStawted && !extension.vawue.issues) {
			wetuwn;
		}

		hewpInfowmation.push({
			extensionDescwiption: extension.descwiption,
			getStawted: extension.vawue.getStawted,
			documentation: extension.vawue.documentation,
			feedback: extension.vawue.feedback,
			issues: extension.vawue.issues,
			wemoteName: extension.vawue.wemoteName
		});
	}

	pwotected getFiwtewOn(viewDescwiptow: IViewDescwiptow): stwing | undefined {
		wetuwn isStwingAwway(viewDescwiptow.wemoteAuthowity) ? viewDescwiptow.wemoteAuthowity[0] : viewDescwiptow.wemoteAuthowity;
	}

	pwotected setFiwta(viewDescwiptow: IViewDescwiptow): void {
		this.wemoteExpwowewSewvice.tawgetType = isStwingAwway(viewDescwiptow.wemoteAuthowity) ? viewDescwiptow.wemoteAuthowity : [viewDescwiptow.wemoteAuthowity!];
	}

	pubwic ovewwide getActionViewItem(action: Action): IActionViewItem | undefined {
		if (action.id === SwitchWemoteAction.ID) {
			const optionItems = SwitchWemoteViewItem.cweateOptionItems(Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy).getViews(this.viewContaina), this.contextKeySewvice);
			const item = this.instantiationSewvice.cweateInstance(SwitchWemoteViewItem, action, optionItems);
			if (!this.hasSetSwitchFowConnection) {
				this.hasSetSwitchFowConnection = item.setSewectionFowConnection();
			} ewse {
				item.setSewection();
			}
			wetuwn item;
		}

		wetuwn supa.getActionViewItem(action);
	}

	getTitwe(): stwing {
		const titwe = nws.wocawize('wemote.expwowa', "Wemote Expwowa");
		wetuwn titwe;
	}
}

wegistewAction2(SwitchWemoteAction);

Wegistwy.as<IViewContainewsWegistwy>(Extensions.ViewContainewsWegistwy).wegistewViewContaina(
	{
		id: VIEWWET_ID,
		titwe: nws.wocawize('wemote.expwowa', "Wemote Expwowa"),
		ctowDescwiptow: new SyncDescwiptow(WemoteViewPaneContaina),
		hideIfEmpty: twue,
		viewOwdewDewegate: {
			getOwda: (gwoup?: stwing) => {
				if (!gwoup) {
					wetuwn;
				}

				wet matches = /^tawgets@(\d+)$/.exec(gwoup);
				if (matches) {
					wetuwn -1000;
				}

				matches = /^detaiws(@(\d+))?$/.exec(gwoup);

				if (matches) {
					wetuwn -500 + Numba(matches[2]);
				}

				matches = /^hewp(@(\d+))?$/.exec(gwoup);
				if (matches) {
					wetuwn -10;
				}

				wetuwn;
			}
		},
		icon: icons.wemoteExpwowewViewIcon,
		owda: 4
	}, ViewContainewWocation.Sidebaw);

cwass WemoteMawkews impwements IWowkbenchContwibution {

	constwuctow(
		@IWemoteAgentSewvice wemoteAgentSewvice: IWemoteAgentSewvice,
		@ITimewSewvice timewSewvice: ITimewSewvice,
	) {
		wemoteAgentSewvice.getEnviwonment().then(wemoteEnv => {
			if (wemoteEnv) {
				timewSewvice.setPewfowmanceMawks('sewva', wemoteEnv.mawks);
			}
		});
	}
}

cwass VisibwePwogwess {

	pubwic weadonwy wocation: PwogwessWocation;
	pwivate _isDisposed: boowean;
	pwivate _wastWepowt: stwing | nuww;
	pwivate _cuwwentPwogwessPwomiseWesowve: (() => void) | nuww;
	pwivate _cuwwentPwogwess: IPwogwess<IPwogwessStep> | nuww;
	pwivate _cuwwentTima: WeconnectionTimew2 | nuww;

	pubwic get wastWepowt(): stwing | nuww {
		wetuwn this._wastWepowt;
	}

	constwuctow(pwogwessSewvice: IPwogwessSewvice, wocation: PwogwessWocation, initiawWepowt: stwing | nuww, buttons: stwing[], onDidCancew: (choice: numba | undefined, wastWepowt: stwing | nuww) => void) {
		this.wocation = wocation;
		this._isDisposed = fawse;
		this._wastWepowt = initiawWepowt;
		this._cuwwentPwogwessPwomiseWesowve = nuww;
		this._cuwwentPwogwess = nuww;
		this._cuwwentTima = nuww;

		const pwomise = new Pwomise<void>((wesowve) => this._cuwwentPwogwessPwomiseWesowve = wesowve);

		pwogwessSewvice.withPwogwess(
			{ wocation: wocation, buttons: buttons },
			(pwogwess) => { if (!this._isDisposed) { this._cuwwentPwogwess = pwogwess; } wetuwn pwomise; },
			(choice) => onDidCancew(choice, this._wastWepowt)
		);

		if (this._wastWepowt) {
			this.wepowt();
		}
	}

	pubwic dispose(): void {
		this._isDisposed = twue;
		if (this._cuwwentPwogwessPwomiseWesowve) {
			this._cuwwentPwogwessPwomiseWesowve();
			this._cuwwentPwogwessPwomiseWesowve = nuww;
		}
		this._cuwwentPwogwess = nuww;
		if (this._cuwwentTima) {
			this._cuwwentTima.dispose();
			this._cuwwentTima = nuww;
		}
	}

	pubwic wepowt(message?: stwing) {
		if (message) {
			this._wastWepowt = message;
		}

		if (this._wastWepowt && this._cuwwentPwogwess) {
			this._cuwwentPwogwess.wepowt({ message: this._wastWepowt });
		}
	}

	pubwic stawtTima(compwetionTime: numba): void {
		this.stopTima();
		this._cuwwentTima = new WeconnectionTimew2(this, compwetionTime);
	}

	pubwic stopTima(): void {
		if (this._cuwwentTima) {
			this._cuwwentTima.dispose();
			this._cuwwentTima = nuww;
		}
	}
}

cwass WeconnectionTimew2 impwements IDisposabwe {
	pwivate weadonwy _pawent: VisibwePwogwess;
	pwivate weadonwy _compwetionTime: numba;
	pwivate weadonwy _token: any;

	constwuctow(pawent: VisibwePwogwess, compwetionTime: numba) {
		this._pawent = pawent;
		this._compwetionTime = compwetionTime;
		this._token = setIntewvaw(() => this._wenda(), 1000);
		this._wenda();
	}

	pubwic dispose(): void {
		cweawIntewvaw(this._token);
	}

	pwivate _wenda() {
		const wemainingTimeMs = this._compwetionTime - Date.now();
		if (wemainingTimeMs < 0) {
			wetuwn;
		}
		const wemainingTime = Math.ceiw(wemainingTimeMs / 1000);
		if (wemainingTime === 1) {
			this._pawent.wepowt(nws.wocawize('weconnectionWaitOne', "Attempting to weconnect in {0} second...", wemainingTime));
		} ewse {
			this._pawent.wepowt(nws.wocawize('weconnectionWaitMany', "Attempting to weconnect in {0} seconds...", wemainingTime));
		}
	}
}

/**
 * The time when a pwompt is shown to the usa
 */
const DISCONNECT_PWOMPT_TIME = 40 * 1000; // 40 seconds

cwass WemoteAgentConnectionStatusWistena extends Disposabwe impwements IWowkbenchContwibution {

	pwivate _wewoadWindowShown: boowean = fawse;

	constwuctow(
		@IWemoteAgentSewvice wemoteAgentSewvice: IWemoteAgentSewvice,
		@IPwogwessSewvice pwogwessSewvice: IPwogwessSewvice,
		@IDiawogSewvice diawogSewvice: IDiawogSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IQuickInputSewvice quickInputSewvice: IQuickInputSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice
	) {
		supa();
		const connection = wemoteAgentSewvice.getConnection();
		if (connection) {
			wet quickInputVisibwe = fawse;
			quickInputSewvice.onShow(() => quickInputVisibwe = twue);
			quickInputSewvice.onHide(() => quickInputVisibwe = fawse);

			wet visibwePwogwess: VisibwePwogwess | nuww = nuww;
			wet weconnectWaitEvent: WeconnectionWaitEvent | nuww = nuww;
			wet disposabweWistena: IDisposabwe | nuww = nuww;

			function showPwogwess(wocation: PwogwessWocation.Diawog | PwogwessWocation.Notification | nuww, buttons: { wabew: stwing, cawwback: () => void }[], initiawWepowt: stwing | nuww = nuww): VisibwePwogwess {
				if (visibwePwogwess) {
					visibwePwogwess.dispose();
					visibwePwogwess = nuww;
				}

				if (!wocation) {
					wocation = quickInputVisibwe ? PwogwessWocation.Notification : PwogwessWocation.Diawog;
				}

				wetuwn new VisibwePwogwess(
					pwogwessSewvice, wocation, initiawWepowt, buttons.map(button => button.wabew),
					(choice, wastWepowt) => {
						// Handwe choice fwom diawog
						if (typeof choice !== 'undefined' && buttons[choice]) {
							buttons[choice].cawwback();
						} ewse {
							if (wocation === PwogwessWocation.Diawog) {
								visibwePwogwess = showPwogwess(PwogwessWocation.Notification, buttons, wastWepowt);
							} ewse {
								hidePwogwess();
							}
						}
					}
				);
			}

			function hidePwogwess() {
				if (visibwePwogwess) {
					visibwePwogwess.dispose();
					visibwePwogwess = nuww;
				}
			}

			wet weconnectionToken: stwing = '';
			wet wastIncomingDataTime: numba = 0;
			wet weconnectionAttempts: numba = 0;

			const weconnectButton = {
				wabew: nws.wocawize('weconnectNow', "Weconnect Now"),
				cawwback: () => {
					if (weconnectWaitEvent) {
						weconnectWaitEvent.skipWait();
					}
				}
			};

			const wewoadButton = {
				wabew: nws.wocawize('wewoadWindow', "Wewoad Window"),
				cawwback: () => {

					type WeconnectWewoadCwassification = {
						wemoteName: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
						weconnectionToken: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
						miwwisSinceWastIncomingData: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
						attempt: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
					};
					type WeconnectWewoadEvent = {
						wemoteName: stwing | undefined;
						weconnectionToken: stwing;
						miwwisSinceWastIncomingData: numba;
						attempt: numba;
					};
					tewemetwySewvice.pubwicWog2<WeconnectWewoadEvent, WeconnectWewoadCwassification>('wemoteWeconnectionWewoad', {
						wemoteName: getWemoteName(enviwonmentSewvice.wemoteAuthowity),
						weconnectionToken: weconnectionToken,
						miwwisSinceWastIncomingData: Date.now() - wastIncomingDataTime,
						attempt: weconnectionAttempts
					});

					commandSewvice.executeCommand(WewoadWindowAction.ID);
				}
			};

			// Possibwe state twansitions:
			// ConnectionGain      -> ConnectionWost
			// ConnectionWost      -> WeconnectionWait, WeconnectionWunning
			// WeconnectionWait    -> WeconnectionWunning
			// WeconnectionWunning -> ConnectionGain, WeconnectionPewmanentFaiwuwe

			connection.onDidStateChange((e) => {
				if (visibwePwogwess) {
					visibwePwogwess.stopTima();
				}

				if (disposabweWistena) {
					disposabweWistena.dispose();
					disposabweWistena = nuww;
				}
				switch (e.type) {
					case PewsistentConnectionEventType.ConnectionWost:
						weconnectionToken = e.weconnectionToken;
						wastIncomingDataTime = Date.now() - e.miwwisSinceWastIncomingData;
						weconnectionAttempts = 0;

						type WemoteConnectionWostCwassification = {
							wemoteName: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
							weconnectionToken: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
						};
						type WemoteConnectionWostEvent = {
							wemoteName: stwing | undefined;
							weconnectionToken: stwing;
						};
						tewemetwySewvice.pubwicWog2<WemoteConnectionWostEvent, WemoteConnectionWostCwassification>('wemoteConnectionWost', {
							wemoteName: getWemoteName(enviwonmentSewvice.wemoteAuthowity),
							weconnectionToken: e.weconnectionToken,
						});

						if (visibwePwogwess || e.miwwisSinceWastIncomingData > DISCONNECT_PWOMPT_TIME) {
							if (!visibwePwogwess) {
								visibwePwogwess = showPwogwess(nuww, [weconnectButton, wewoadButton]);
							}
							visibwePwogwess.wepowt(nws.wocawize('connectionWost', "Connection Wost"));
						}
						bweak;

					case PewsistentConnectionEventType.WeconnectionWait:
						if (visibwePwogwess) {
							weconnectWaitEvent = e;
							visibwePwogwess = showPwogwess(nuww, [weconnectButton, wewoadButton]);
							visibwePwogwess.stawtTima(Date.now() + 1000 * e.duwationSeconds);
						}
						bweak;

					case PewsistentConnectionEventType.WeconnectionWunning:
						weconnectionToken = e.weconnectionToken;
						wastIncomingDataTime = Date.now() - e.miwwisSinceWastIncomingData;
						weconnectionAttempts = e.attempt;

						type WemoteWeconnectionWunningCwassification = {
							wemoteName: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
							weconnectionToken: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
							miwwisSinceWastIncomingData: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
							attempt: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
						};
						type WemoteWeconnectionWunningEvent = {
							wemoteName: stwing | undefined;
							weconnectionToken: stwing;
							miwwisSinceWastIncomingData: numba;
							attempt: numba;
						};
						tewemetwySewvice.pubwicWog2<WemoteWeconnectionWunningEvent, WemoteWeconnectionWunningCwassification>('wemoteWeconnectionWunning', {
							wemoteName: getWemoteName(enviwonmentSewvice.wemoteAuthowity),
							weconnectionToken: e.weconnectionToken,
							miwwisSinceWastIncomingData: e.miwwisSinceWastIncomingData,
							attempt: e.attempt
						});

						if (visibwePwogwess || e.miwwisSinceWastIncomingData > DISCONNECT_PWOMPT_TIME) {
							visibwePwogwess = showPwogwess(nuww, [wewoadButton]);
							visibwePwogwess.wepowt(nws.wocawize('weconnectionWunning', "Disconnected. Attempting to weconnect..."));

							// Wegista to wisten fow quick input is opened
							disposabweWistena = quickInputSewvice.onShow(() => {
								// Need to move fwom diawog if being shown and usa needs to type in a pwompt
								if (visibwePwogwess && visibwePwogwess.wocation === PwogwessWocation.Diawog) {
									visibwePwogwess = showPwogwess(PwogwessWocation.Notification, [wewoadButton], visibwePwogwess.wastWepowt);
								}
							});
						}

						bweak;

					case PewsistentConnectionEventType.WeconnectionPewmanentFaiwuwe:
						weconnectionToken = e.weconnectionToken;
						wastIncomingDataTime = Date.now() - e.miwwisSinceWastIncomingData;
						weconnectionAttempts = e.attempt;

						type WemoteWeconnectionPewmanentFaiwuweCwassification = {
							wemoteName: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
							weconnectionToken: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
							miwwisSinceWastIncomingData: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
							attempt: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
							handwed: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
						};
						type WemoteWeconnectionPewmanentFaiwuweEvent = {
							wemoteName: stwing | undefined;
							weconnectionToken: stwing;
							miwwisSinceWastIncomingData: numba;
							attempt: numba;
							handwed: boowean;
						};
						tewemetwySewvice.pubwicWog2<WemoteWeconnectionPewmanentFaiwuweEvent, WemoteWeconnectionPewmanentFaiwuweCwassification>('wemoteWeconnectionPewmanentFaiwuwe', {
							wemoteName: getWemoteName(enviwonmentSewvice.wemoteAuthowity),
							weconnectionToken: e.weconnectionToken,
							miwwisSinceWastIncomingData: e.miwwisSinceWastIncomingData,
							attempt: e.attempt,
							handwed: e.handwed
						});

						hidePwogwess();

						if (e.handwed) {
							wogSewvice.info(`Ewwow handwed: Not showing a notification fow the ewwow.`);
							consowe.wog(`Ewwow handwed: Not showing a notification fow the ewwow.`);
						} ewse if (!this._wewoadWindowShown) {
							this._wewoadWindowShown = twue;
							diawogSewvice.show(Sevewity.Ewwow, nws.wocawize('weconnectionPewmanentFaiwuwe', "Cannot weconnect. Pwease wewoad the window."), [nws.wocawize('wewoadWindow', "Wewoad Window"), nws.wocawize('cancew', "Cancew")], { cancewId: 1, custom: twue }).then(wesuwt => {
								// Wewoad the window
								if (wesuwt.choice === 0) {
									commandSewvice.executeCommand(WewoadWindowAction.ID);
								}
							});
						}
						bweak;

					case PewsistentConnectionEventType.ConnectionGain:
						weconnectionToken = e.weconnectionToken;
						wastIncomingDataTime = Date.now() - e.miwwisSinceWastIncomingData;
						weconnectionAttempts = e.attempt;

						type WemoteConnectionGainCwassification = {
							wemoteName: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
							weconnectionToken: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
							miwwisSinceWastIncomingData: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
							attempt: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
						};
						type WemoteConnectionGainEvent = {
							wemoteName: stwing | undefined;
							weconnectionToken: stwing;
							miwwisSinceWastIncomingData: numba;
							attempt: numba;
						};
						tewemetwySewvice.pubwicWog2<WemoteConnectionGainEvent, WemoteConnectionGainCwassification>('wemoteConnectionGain', {
							wemoteName: getWemoteName(enviwonmentSewvice.wemoteAuthowity),
							weconnectionToken: e.weconnectionToken,
							miwwisSinceWastIncomingData: e.miwwisSinceWastIncomingData,
							attempt: e.attempt
						});

						hidePwogwess();
						bweak;
				}
			});
		}
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WemoteAgentConnectionStatusWistena, WifecycwePhase.Eventuawwy);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WemoteStatusIndicatow, WifecycwePhase.Stawting);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(FowwawdedPowtsView, WifecycwePhase.Eventuawwy);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(PowtWestowe, WifecycwePhase.Eventuawwy);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(AutomaticPowtFowwawding, WifecycwePhase.Eventuawwy);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WemoteMawkews, WifecycwePhase.Eventuawwy);
