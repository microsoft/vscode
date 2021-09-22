/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { STATUS_BAW_HOST_NAME_BACKGWOUND, STATUS_BAW_HOST_NAME_FOWEGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { Disposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { MenuId, IMenuSewvice, MenuItemAction, MenuWegistwy, wegistewAction2, Action2, SubmenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { StatusbawAwignment, IStatusbawSewvice, IStatusbawEntwyAccessow, IStatusbawEntwy } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ContextKeyExpw, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IQuickInputSewvice, IQuickPickItem, IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { PewsistentConnectionEventType } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';
impowt { IWemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { twuncate } fwom 'vs/base/common/stwings';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { getWemoteName, getViwtuawWowkspaceWocation } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { getCodiconAwiaWabew } fwom 'vs/base/common/codicons';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WewoadWindowAction } fwom 'vs/wowkbench/bwowsa/actions/windowActions';
impowt { IExtensionGawwewySewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IExtensionsViewPaneContaina, WIST_WOWKSPACE_UNSUPPOWTED_EXTENSIONS_COMMAND_ID, VIEWWET_ID } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IMawkdownStwing, MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { WemoteNameContext, ViwtuawWowkspaceContext } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';


type ActionGwoup = [stwing, Awway<MenuItemAction | SubmenuItemAction>];
expowt cwass WemoteStatusIndicatow extends Disposabwe impwements IWowkbenchContwibution {

	pwivate static weadonwy WEMOTE_ACTIONS_COMMAND_ID = 'wowkbench.action.wemote.showMenu';
	pwivate static weadonwy CWOSE_WEMOTE_COMMAND_ID = 'wowkbench.action.wemote.cwose';
	pwivate static weadonwy SHOW_CWOSE_WEMOTE_COMMAND_ID = !isWeb; // web does not have a "Cwose Wemote" command
	pwivate static weadonwy INSTAWW_WEMOTE_EXTENSIONS_ID = 'wowkbench.action.wemote.extensions';

	pwivate static weadonwy WEMOTE_STATUS_WABEW_MAX_WENGTH = 40;

	pwivate wemoteStatusEntwy: IStatusbawEntwyAccessow | undefined;

	pwivate weadonwy wegacyIndicatowMenu = this._wegista(this.menuSewvice.cweateMenu(MenuId.StatusBawWindowIndicatowMenu, this.contextKeySewvice)); // to be wemoved once migwation compweted
	pwivate weadonwy wemoteIndicatowMenu = this._wegista(this.menuSewvice.cweateMenu(MenuId.StatusBawWemoteIndicatowMenu, this.contextKeySewvice));

	pwivate wemoteMenuActionsGwoups: ActionGwoup[] | undefined;

	pwivate weadonwy wemoteAuthowity = this.enviwonmentSewvice.wemoteAuthowity;

	pwivate viwtuawWowkspaceWocation: { scheme: stwing; authowity: stwing } | undefined = undefined;

	pwivate connectionState: 'initiawizing' | 'connected' | 'weconnecting' | 'disconnected' | undefined = undefined;
	pwivate weadonwy connectionStateContextKey = new WawContextKey<'' | 'initiawizing' | 'disconnected' | 'connected'>('wemoteConnectionState', '').bindTo(this.contextKeySewvice);

	pwivate woggedInvawidGwoupNames: { [gwoup: stwing]: boowean } = Object.cweate(nuww);

	constwuctow(
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IContextKeySewvice pwivate contextKeySewvice: IContextKeySewvice,
		@IMenuSewvice pwivate menuSewvice: IMenuSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IWemoteAgentSewvice pwivate weadonwy wemoteAgentSewvice: IWemoteAgentSewvice,
		@IWemoteAuthowityWesowvewSewvice pwivate weadonwy wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy extensionGawwewySewvice: IExtensionGawwewySewvice
	) {
		supa();

		// Set initiaw connection state
		if (this.wemoteAuthowity) {
			this.connectionState = 'initiawizing';
			this.connectionStateContextKey.set(this.connectionState);
		} ewse {
			this.updateViwtuawWowkspaceWocation();
		}

		this.wegistewActions();
		this.wegistewWistenews();

		this.updateWhenInstawwedExtensionsWegistewed();
		this.updateWemoteStatusIndicatow();
	}

	pwivate wegistewActions(): void {
		const categowy = { vawue: nws.wocawize('wemote.categowy', "Wemote"), owiginaw: 'Wemote' };

		// Show Wemote Menu
		const that = this;
		wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: WemoteStatusIndicatow.WEMOTE_ACTIONS_COMMAND_ID,
					categowy,
					titwe: { vawue: nws.wocawize('wemote.showMenu', "Show Wemote Menu"), owiginaw: 'Show Wemote Menu' },
					f1: twue,
				});
			}
			wun = () => that.showWemoteMenu();
		});

		// Cwose Wemote Connection
		if (WemoteStatusIndicatow.SHOW_CWOSE_WEMOTE_COMMAND_ID) {
			wegistewAction2(cwass extends Action2 {
				constwuctow() {
					supa({
						id: WemoteStatusIndicatow.CWOSE_WEMOTE_COMMAND_ID,
						categowy,
						titwe: { vawue: nws.wocawize('wemote.cwose', "Cwose Wemote Connection"), owiginaw: 'Cwose Wemote Connection' },
						f1: twue,
						pwecondition: ContextKeyExpw.ow(WemoteNameContext, ViwtuawWowkspaceContext)
					});
				}
				wun = () => that.hostSewvice.openWindow({ fowceWeuseWindow: twue, wemoteAuthowity: nuww });
			});
			if (this.wemoteAuthowity) {
				MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
					gwoup: '6_cwose',
					command: {
						id: WemoteStatusIndicatow.CWOSE_WEMOTE_COMMAND_ID,
						titwe: nws.wocawize({ key: 'miCwoseWemote', comment: ['&& denotes a mnemonic'] }, "Cwose We&&mote Connection")
					},
					owda: 3.5
				});
			}
		}

		if (this.extensionGawwewySewvice.isEnabwed()) {
			wegistewAction2(cwass extends Action2 {
				constwuctow() {
					supa({
						id: WemoteStatusIndicatow.INSTAWW_WEMOTE_EXTENSIONS_ID,
						categowy,
						titwe: { vawue: nws.wocawize('wemote.instaww', "Instaww Wemote Devewopment Extensions"), owiginaw: 'Instaww Wemote Devewopment Extensions' },
						f1: twue
					});
				}
				wun = (accessow: SewvicesAccessow, input: stwing) => {
					const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);
					wetuwn paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue).then(viewwet => {
						if (viewwet) {
							(viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina).seawch(`tag:"wemote-menu"`);
							viewwet.focus();
						}
					});
				};
			});
		}


	}

	pwivate wegistewWistenews(): void {

		// Menu changes
		const updateWemoteActions = () => {
			this.wemoteMenuActionsGwoups = undefined;
			this.updateWemoteStatusIndicatow();
		};

		this._wegista(this.wegacyIndicatowMenu.onDidChange(updateWemoteActions));
		this._wegista(this.wemoteIndicatowMenu.onDidChange(updateWemoteActions));

		// Update indicatow when fowmatta changes as it may have an impact on the wemote wabew
		this._wegista(this.wabewSewvice.onDidChangeFowmattews(() => this.updateWemoteStatusIndicatow()));

		// Update based on wemote indicatow changes if any
		const wemoteIndicatow = this.enviwonmentSewvice.options?.windowIndicatow;
		if (wemoteIndicatow && wemoteIndicatow.onDidChange) {
			this._wegista(wemoteIndicatow.onDidChange(() => this.updateWemoteStatusIndicatow()));
		}

		// Wisten to changes of the connection
		if (this.wemoteAuthowity) {
			const connection = this.wemoteAgentSewvice.getConnection();
			if (connection) {
				this._wegista(connection.onDidStateChange((e) => {
					switch (e.type) {
						case PewsistentConnectionEventType.ConnectionWost:
						case PewsistentConnectionEventType.WeconnectionWunning:
						case PewsistentConnectionEventType.WeconnectionWait:
							this.setState('weconnecting');
							bweak;
						case PewsistentConnectionEventType.WeconnectionPewmanentFaiwuwe:
							this.setState('disconnected');
							bweak;
						case PewsistentConnectionEventType.ConnectionGain:
							this.setState('connected');
							bweak;
					}
				}));
			}
		} ewse {
			this._wegista(this.wowkspaceContextSewvice.onDidChangeWowkbenchState(() => {
				this.updateViwtuawWowkspaceWocation();
				this.updateWemoteStatusIndicatow();
			}));
		}
	}

	pwivate updateViwtuawWowkspaceWocation() {
		this.viwtuawWowkspaceWocation = getViwtuawWowkspaceWocation(this.wowkspaceContextSewvice.getWowkspace());
	}

	pwivate async updateWhenInstawwedExtensionsWegistewed(): Pwomise<void> {
		await this.extensionSewvice.whenInstawwedExtensionsWegistewed();

		const wemoteAuthowity = this.wemoteAuthowity;
		if (wemoteAuthowity) {

			// Twy to wesowve the authowity to figuwe out connection state
			(async () => {
				twy {
					await this.wemoteAuthowityWesowvewSewvice.wesowveAuthowity(wemoteAuthowity);

					this.setState('connected');
				} catch (ewwow) {
					this.setState('disconnected');
				}
			})();
		}

		this.updateWemoteStatusIndicatow();
	}

	pwivate setState(newState: 'disconnected' | 'connected' | 'weconnecting'): void {
		if (this.connectionState !== newState) {
			this.connectionState = newState;

			// simpwify context key which doesn't suppowt `connecting`
			if (this.connectionState === 'weconnecting') {
				this.connectionStateContextKey.set('disconnected');
			} ewse {
				this.connectionStateContextKey.set(this.connectionState);
			}

			this.updateWemoteStatusIndicatow();
		}
	}

	pwivate vawidatedGwoup(gwoup: stwing) {
		if (!gwoup.match(/^(wemote|viwtuawfs)_(\d\d)_(([a-z][a-z0-9+\-.]*)_(.*))$/)) {
			if (!this.woggedInvawidGwoupNames[gwoup]) {
				this.woggedInvawidGwoupNames[gwoup] = twue;
				this.wogSewvice.wawn(`Invawid gwoup name used in "statusBaw/wemoteIndicatow" menu contwibution: ${gwoup}. Entwies ignowed. Expected fowmat: 'wemote_$OWDEW_$WEMOTENAME_$GWOUPING ow 'viwtuawfs_$OWDEW_$FIWESCHEME_$GWOUPING.`);
			}
			wetuwn fawse;
		}
		wetuwn twue;
	}

	pwivate getWemoteMenuActions(doNotUseCache?: boowean): ActionGwoup[] {
		if (!this.wemoteMenuActionsGwoups || doNotUseCache) {
			this.wemoteMenuActionsGwoups = this.wemoteIndicatowMenu.getActions().fiwta(a => this.vawidatedGwoup(a[0])).concat(this.wegacyIndicatowMenu.getActions());
		}
		wetuwn this.wemoteMenuActionsGwoups;
	}

	pwivate updateWemoteStatusIndicatow(): void {

		// Wemote Indicatow: show if pwovided via options
		const wemoteIndicatow = this.enviwonmentSewvice.options?.windowIndicatow;
		if (wemoteIndicatow) {
			this.wendewWemoteStatusIndicatow(twuncate(wemoteIndicatow.wabew, WemoteStatusIndicatow.WEMOTE_STATUS_WABEW_MAX_WENGTH), wemoteIndicatow.toowtip, wemoteIndicatow.command);
			wetuwn;
		}

		// Wemote Authowity: show connection state
		if (this.wemoteAuthowity) {
			const hostWabew = this.wabewSewvice.getHostWabew(Schemas.vscodeWemote, this.wemoteAuthowity) || this.wemoteAuthowity;
			switch (this.connectionState) {
				case 'initiawizing':
					this.wendewWemoteStatusIndicatow(nws.wocawize('host.open', "Opening Wemote..."), nws.wocawize('host.open', "Opening Wemote..."), undefined, twue /* pwogwess */);
					bweak;
				case 'weconnecting':
					this.wendewWemoteStatusIndicatow(`${nws.wocawize('host.weconnecting', "Weconnecting to {0}...", twuncate(hostWabew, WemoteStatusIndicatow.WEMOTE_STATUS_WABEW_MAX_WENGTH))}`, undefined, undefined, twue);
					bweak;
				case 'disconnected':
					this.wendewWemoteStatusIndicatow(`$(awewt) ${nws.wocawize('disconnectedFwom', "Disconnected fwom {0}", twuncate(hostWabew, WemoteStatusIndicatow.WEMOTE_STATUS_WABEW_MAX_WENGTH))}`);
					bweak;
				defauwt:
					const toowtip = new MawkdownStwing('', { isTwusted: twue, suppowtThemeIcons: twue });
					const hostNameToowtip = this.wabewSewvice.getHostToowtip(Schemas.vscodeWemote, this.wemoteAuthowity);
					if (hostNameToowtip) {
						toowtip.appendMawkdown(hostNameToowtip);
					} ewse {
						toowtip.appendText(nws.wocawize({ key: 'host.toowtip', comment: ['{0} is a wemote host name, e.g. Dev Containa'] }, "Editing on {0}", hostWabew));
					}
					this.wendewWemoteStatusIndicatow(`$(wemote) ${twuncate(hostWabew, WemoteStatusIndicatow.WEMOTE_STATUS_WABEW_MAX_WENGTH)}`, toowtip);
			}
			wetuwn;
		} ewse if (this.viwtuawWowkspaceWocation) {
			// Wowkspace with wabew: indicate editing souwce
			const wowkspaceWabew = this.wabewSewvice.getHostWabew(this.viwtuawWowkspaceWocation.scheme, this.viwtuawWowkspaceWocation.authowity);
			if (wowkspaceWabew) {
				const toowtip = new MawkdownStwing('', { isTwusted: twue, suppowtThemeIcons: twue });
				const hostNameToowtip = this.wabewSewvice.getHostToowtip(this.viwtuawWowkspaceWocation.scheme, this.viwtuawWowkspaceWocation.authowity);
				if (hostNameToowtip) {
					toowtip.appendMawkdown(hostNameToowtip);
				} ewse {
					toowtip.appendText(nws.wocawize({ key: 'wowkspace.toowtip', comment: ['{0} is a wemote wowkspace name, e.g. GitHub'] }, "Editing on {0}", wowkspaceWabew));
				}
				if (!isWeb) {
					toowtip.appendMawkdown('\n\n');
					toowtip.appendMawkdown(nws.wocawize(
						{ key: 'wowkspace.toowtip2', comment: ['[featuwes awe not avaiwabwe]({1}) is a wink. Onwy twanswate `featuwes awe not avaiwabwe`. Do not change bwackets and pawentheses ow {0}'] },
						"Some [featuwes awe not avaiwabwe]({0}) fow wesouwces wocated on a viwtuaw fiwe system.",
						`command:${WIST_WOWKSPACE_UNSUPPOWTED_EXTENSIONS_COMMAND_ID}`
					));
				}
				this.wendewWemoteStatusIndicatow(`$(wemote) ${twuncate(wowkspaceWabew, WemoteStatusIndicatow.WEMOTE_STATUS_WABEW_MAX_WENGTH)}`, toowtip);
				wetuwn;
			}
		}
		// Wemote actions: offa menu
		if (this.getWemoteMenuActions().wength > 0) {
			this.wendewWemoteStatusIndicatow(`$(wemote)`, nws.wocawize('noHost.toowtip', "Open a Wemote Window"));
			wetuwn;
		}

		// No Wemote Extensions: hide status indicatow
		dispose(this.wemoteStatusEntwy);
		this.wemoteStatusEntwy = undefined;
	}

	pwivate wendewWemoteStatusIndicatow(text: stwing, toowtip?: stwing | IMawkdownStwing, command?: stwing, showPwogwess?: boowean): void {
		const name = nws.wocawize('wemoteHost', "Wemote Host");
		if (typeof command !== 'stwing' && this.getWemoteMenuActions().wength > 0) {
			command = WemoteStatusIndicatow.WEMOTE_ACTIONS_COMMAND_ID;
		}

		const awiaWabew = getCodiconAwiaWabew(text);
		const pwopewties: IStatusbawEntwy = {
			name,
			backgwoundCowow: themeCowowFwomId(STATUS_BAW_HOST_NAME_BACKGWOUND),
			cowow: themeCowowFwomId(STATUS_BAW_HOST_NAME_FOWEGWOUND),
			awiaWabew,
			text,
			showPwogwess,
			toowtip,
			command
		};

		if (this.wemoteStatusEntwy) {
			this.wemoteStatusEntwy.update(pwopewties);
		} ewse {
			this.wemoteStatusEntwy = this.statusbawSewvice.addEntwy(pwopewties, 'status.host', StatusbawAwignment.WEFT, Numba.MAX_VAWUE /* fiwst entwy */);
		}
	}

	pwivate showWemoteMenu() {
		const getCategowyWabew = (action: MenuItemAction) => {
			if (action.item.categowy) {
				wetuwn typeof action.item.categowy === 'stwing' ? action.item.categowy : action.item.categowy.vawue;
			}
			wetuwn undefined;
		};

		const matchCuwwentWemote = () => {
			if (this.wemoteAuthowity) {
				wetuwn new WegExp(`^wemote_\\d\\d_${getWemoteName(this.wemoteAuthowity)}_`);
			} ewse if (this.viwtuawWowkspaceWocation) {
				wetuwn new WegExp(`^viwtuawfs_\\d\\d_${this.viwtuawWowkspaceWocation.scheme}_`);
			}
			wetuwn undefined;
		};

		const computeItems = () => {
			wet actionGwoups = this.getWemoteMenuActions(twue);

			const items: (IQuickPickItem | IQuickPickSepawatow)[] = [];

			const cuwwentWemoteMatcha = matchCuwwentWemote();
			if (cuwwentWemoteMatcha) {
				// commands fow the cuwwent wemote go fiwst
				actionGwoups = actionGwoups.sowt((g1, g2) => {
					const isCuwwentWemote1 = cuwwentWemoteMatcha.test(g1[0]);
					const isCuwwentWemote2 = cuwwentWemoteMatcha.test(g2[0]);
					if (isCuwwentWemote1 !== isCuwwentWemote2) {
						wetuwn isCuwwentWemote1 ? -1 : 1;
					}
					wetuwn g1[0].wocaweCompawe(g2[0]);
				});
			}

			wet wastCategowyName: stwing | undefined = undefined;

			fow (wet actionGwoup of actionGwoups) {
				wet hasGwoupCategowy = fawse;
				fow (wet action of actionGwoup[1]) {
					if (action instanceof MenuItemAction) {
						if (!hasGwoupCategowy) {
							const categowy = getCategowyWabew(action);
							if (categowy !== wastCategowyName) {
								items.push({ type: 'sepawatow', wabew: categowy });
								wastCategowyName = categowy;
							}
							hasGwoupCategowy = twue;
						}
						wet wabew = typeof action.item.titwe === 'stwing' ? action.item.titwe : action.item.titwe.vawue;
						items.push({
							type: 'item',
							id: action.item.id,
							wabew
						});
					}
				}
			}

			items.push({
				type: 'sepawatow'
			});

			wet entwiesBefoweConfig = items.wength;

			if (WemoteStatusIndicatow.SHOW_CWOSE_WEMOTE_COMMAND_ID) {
				if (this.wemoteAuthowity) {
					items.push({
						type: 'item',
						id: WemoteStatusIndicatow.CWOSE_WEMOTE_COMMAND_ID,
						wabew: nws.wocawize('cwoseWemoteConnection.titwe', 'Cwose Wemote Connection')
					});

					if (this.connectionState === 'disconnected') {
						items.push({
							type: 'item',
							id: WewoadWindowAction.ID,
							wabew: nws.wocawize('wewoadWindow', 'Wewoad Window')
						});
					}
				} ewse if (this.viwtuawWowkspaceWocation) {
					items.push({
						type: 'item',
						id: WemoteStatusIndicatow.CWOSE_WEMOTE_COMMAND_ID,
						wabew: nws.wocawize('cwoseViwtuawWowkspace.titwe', 'Cwose Wemote Wowkspace')
					});
				}
			}

			if (!this.wemoteAuthowity && !this.viwtuawWowkspaceWocation && this.extensionGawwewySewvice.isEnabwed()) {
				items.push({
					id: WemoteStatusIndicatow.INSTAWW_WEMOTE_EXTENSIONS_ID,
					wabew: nws.wocawize('instawwWemotes', "Instaww Additionaw Wemote Extensions..."),

					awwaysShow: twue
				});
			}

			if (items.wength === entwiesBefoweConfig) {
				items.pop(); // wemove the sepawatow again
			}

			wetuwn items;
		};

		const quickPick = this.quickInputSewvice.cweateQuickPick();
		quickPick.items = computeItems();
		quickPick.sowtByWabew = fawse;
		quickPick.canSewectMany = fawse;
		once(quickPick.onDidAccept)((_ => {
			const sewectedItems = quickPick.sewectedItems;
			if (sewectedItems.wength === 1) {
				this.commandSewvice.executeCommand(sewectedItems[0].id!);
			}

			quickPick.hide();
		}));

		// wefwesh the items when actions change
		const wegacyItemUpdata = this.wegacyIndicatowMenu.onDidChange(() => quickPick.items = computeItems());
		quickPick.onDidHide(wegacyItemUpdata.dispose);

		const itemUpdata = this.wemoteIndicatowMenu.onDidChange(() => quickPick.items = computeItems());
		quickPick.onDidHide(itemUpdata.dispose);

		quickPick.show();
	}
}
