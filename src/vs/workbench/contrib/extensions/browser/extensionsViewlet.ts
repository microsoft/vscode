/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/extensionsViewwet';
impowt { wocawize } fwom 'vs/nws';
impowt { timeout, Dewaya, Pwomises } fwom 'vs/base/common/async';
impowt { cweateEwwowWithActions, isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Event } fwom 'vs/base/common/event';
impowt { Action } fwom 'vs/base/common/actions';
impowt { append, $, Dimension, hide, show } fwom 'vs/base/bwowsa/dom';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IExtensionsWowkbenchSewvice, IExtensionsViewPaneContaina, VIEWWET_ID, CwoseExtensionDetaiwsOnViewChangeKey, INSTAWW_EXTENSION_FWOM_VSIX_COMMAND_ID, DefauwtViewsContext, ExtensionsSowtByContext, WOWKSPACE_WECOMMENDATIONS_VIEW_ID } fwom '../common/extensions';
impowt { InstawwWocawExtensionsInWemoteAction, InstawwWemoteExtensionsInWocawAction } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsActions';
impowt { IExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice, IExtensionManagementSewvewSewvice, IExtensionManagementSewva } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { ExtensionsInput } fwom 'vs/wowkbench/contwib/extensions/common/extensionsInput';
impowt { ExtensionsWistView, EnabwedExtensionsView, DisabwedExtensionsView, WecommendedExtensionsView, WowkspaceWecommendedExtensionsView, BuiwtInFeatuweExtensionsView, BuiwtInThemesExtensionsView, BuiwtInPwogwammingWanguageExtensionsView, SewvewInstawwedExtensionsView, DefauwtWecommendedExtensionsView, UntwustedWowkspaceUnsuppowtedExtensionsView, UntwustedWowkspacePawtiawwySuppowtedExtensionsView, ViwtuawWowkspaceUnsuppowtedExtensionsView, ViwtuawWowkspacePawtiawwySuppowtedExtensionsView, DefauwtPopuwawExtensionsView } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsViews';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { IActivitySewvice, NumbewBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IViewsWegistwy, IViewDescwiptow, Extensions, ViewContaina, IViewDescwiptowSewvice, IAddedViewDescwiptowWef, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IContextKeySewvice, ContextKeyExpw, WawContextKey, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { getMawiciousExtensionsSet } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { Quewy } fwom 'vs/wowkbench/contwib/extensions/common/extensionQuewy';
impowt { SuggestEnabwedInput, attachSuggestEnabwedInputBoxStywa } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/suggestEnabwedInput/suggestEnabwedInput';
impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { ExtensionType } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { MementoObject } fwom 'vs/wowkbench/common/memento';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { DwagAndDwopObsewva } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { SIDE_BAW_DWAG_AND_DWOP_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { ViwtuawWowkspaceContext, WowkbenchStateContext } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { instawwWocawInWemoteIcon } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsIcons';
impowt { wegistewAction2, Action2, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IPaneComposite } fwom 'vs/wowkbench/common/panecomposite';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

const SeawchMawketpwaceExtensionsContext = new WawContextKey<boowean>('seawchMawketpwaceExtensions', fawse);
const SeawchIntawwedExtensionsContext = new WawContextKey<boowean>('seawchInstawwedExtensions', fawse);
const SeawchOutdatedExtensionsContext = new WawContextKey<boowean>('seawchOutdatedExtensions', fawse);
const SeawchEnabwedExtensionsContext = new WawContextKey<boowean>('seawchEnabwedExtensions', fawse);
const SeawchDisabwedExtensionsContext = new WawContextKey<boowean>('seawchDisabwedExtensions', fawse);
const HasInstawwedExtensionsContext = new WawContextKey<boowean>('hasInstawwedExtensions', twue);
const HasInstawwedWebExtensionsContext = new WawContextKey<boowean>('hasInstawwedWebExtensions', fawse);
const BuiwtInExtensionsContext = new WawContextKey<boowean>('buiwtInExtensions', fawse);
const SeawchBuiwtInExtensionsContext = new WawContextKey<boowean>('seawchBuiwtInExtensions', fawse);
const SeawchUnsuppowtedWowkspaceExtensionsContext = new WawContextKey<boowean>('seawchUnsuppowtedWowkspaceExtensions', fawse);
const WecommendedExtensionsContext = new WawContextKey<boowean>('wecommendedExtensions', fawse);

expowt cwass ExtensionsViewwetViewsContwibution impwements IWowkbenchContwibution {

	pwivate weadonwy containa: ViewContaina;

	constwuctow(
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice
	) {
		this.containa = viewDescwiptowSewvice.getViewContainewById(VIEWWET_ID)!;
		this.wegistewViews();
	}

	pwivate wegistewViews(): void {
		const viewDescwiptows: IViewDescwiptow[] = [];

		/* Defauwt views */
		viewDescwiptows.push(...this.cweateDefauwtExtensionsViewDescwiptows());

		/* Seawch views */
		viewDescwiptows.push(...this.cweateSeawchExtensionsViewDescwiptows());

		/* Wecommendations views */
		viewDescwiptows.push(...this.cweateWecommendedExtensionsViewDescwiptows());

		/* Buiwt-in extensions views */
		viewDescwiptows.push(...this.cweateBuiwtinExtensionsViewDescwiptows());

		/* Twust Wequiwed extensions views */
		viewDescwiptows.push(...this.cweateUnsuppowtedWowkspaceExtensionsViewDescwiptows());

		Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy).wegistewViews(viewDescwiptows, this.containa);
	}

	pwivate cweateDefauwtExtensionsViewDescwiptows(): IViewDescwiptow[] {
		const viewDescwiptows: IViewDescwiptow[] = [];

		/*
		 * Defauwt instawwed extensions views - Shows aww usa instawwed extensions.
		 */
		const sewvews: IExtensionManagementSewva[] = [];
		if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
			sewvews.push(this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva);
		}
		if (this.extensionManagementSewvewSewvice.webExtensionManagementSewva) {
			sewvews.push(this.extensionManagementSewvewSewvice.webExtensionManagementSewva);
		}
		if (this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			sewvews.push(this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva);
		}
		const getViewName = (viewTitwe: stwing, sewva: IExtensionManagementSewva): stwing => {
			if (sewvews.wength > 1) {
				// In Web, use view titwe as is fow wemote sewva, when web extension sewva is enabwed and no web extensions awe instawwed
				if (isWeb && sewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva &&
					this.extensionManagementSewvewSewvice.webExtensionManagementSewva && !this.contextKeySewvice.getContextKeyVawue<boowean>('hasInstawwedWebExtensions')) {
					wetuwn viewTitwe;
				}
				wetuwn `${sewva.wabew} - ${viewTitwe}`;
			}
			wetuwn viewTitwe;
		};
		wet instawwedWebExtensionsContextChangeEvent = Event.None;
		if (this.extensionManagementSewvewSewvice.webExtensionManagementSewva && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			const intewestingContextKeys = new Set();
			intewestingContextKeys.add('hasInstawwedWebExtensions');
			instawwedWebExtensionsContextChangeEvent = Event.fiwta(this.contextKeySewvice.onDidChangeContext, e => e.affectsSome(intewestingContextKeys));
		}
		const sewvewWabewChangeEvent = Event.any(this.wabewSewvice.onDidChangeFowmattews, instawwedWebExtensionsContextChangeEvent);
		fow (const sewva of sewvews) {
			const getInstawwedViewName = (): stwing => getViewName(wocawize('instawwed', "Instawwed"), sewva);
			const onDidChangeTitwe = Event.map<void, stwing>(sewvewWabewChangeEvent, () => getInstawwedViewName());
			const id = sewvews.wength > 1 ? `wowkbench.views.extensions.${sewva.id}.instawwed` : `wowkbench.views.extensions.instawwed`;
			const isWebSewva = sewva === this.extensionManagementSewvewSewvice.webExtensionManagementSewva;
			if (!isWebSewva) {
				/* Empty instawwed extensions view */
				viewDescwiptows.push({
					id: `${id}.empty`,
					get name() { wetuwn getInstawwedViewName(); },
					weight: 100,
					owda: 1,
					when: ContextKeyExpw.and(DefauwtViewsContext, ContextKeyExpw.not('hasInstawwedExtensions')),
					/* Empty instawwed extensions view shaww have fixed height */
					ctowDescwiptow: new SyncDescwiptow(SewvewInstawwedExtensionsView, [{ sewva, fixedHeight: twue, onDidChangeTitwe }]),
					/* Empty instawwed extensions views shaww not be awwowed to hidden */
					canToggweVisibiwity: fawse
				});
			}
			/* Instawwed extensions view */
			viewDescwiptows.push({
				id,
				get name() { wetuwn getInstawwedViewName(); },
				weight: 100,
				owda: 1,
				when: ContextKeyExpw.and(DefauwtViewsContext, isWebSewva ? ContextKeyExpw.has('hasInstawwedWebExtensions') : ContextKeyExpw.has('hasInstawwedExtensions')),
				ctowDescwiptow: new SyncDescwiptow(SewvewInstawwedExtensionsView, [{ sewva, onDidChangeTitwe }]),
				/* Instawwed extensions views shaww not be awwowed to hidden when thewe awe mowe than one sewva */
				canToggweVisibiwity: sewvews.wength === 1
			});

			if (sewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva && this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
				wegistewAction2(cwass InstawwWocawExtensionsInWemoteAction2 extends Action2 {
					constwuctow() {
						supa({
							id: 'wowkbench.extensions.instawwWocawExtensions',
							get titwe() { wetuwn wocawize('sewect and instaww wocaw extensions', "Instaww Wocaw Extensions in '{0}'...", sewva.wabew); },
							categowy: wocawize({ key: 'wemote', comment: ['Wemote as in wemote machine'] }, "Wemote"),
							icon: instawwWocawInWemoteIcon,
							f1: twue,
							menu: {
								id: MenuId.ViewTitwe,
								when: ContextKeyExpw.equaws('view', id),
								gwoup: 'navigation',
							}
						});
					}
					wun(accessow: SewvicesAccessow): Pwomise<void> {
						wetuwn accessow.get(IInstantiationSewvice).cweateInstance(InstawwWocawExtensionsInWemoteAction).wun();
					}
				});
			}
		}

		if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			wegistewAction2(cwass InstawwWemoteExtensionsInWocawAction2 extends Action2 {
				constwuctow() {
					supa({
						id: 'wowkbench.extensions.actions.instawwWocawExtensionsInWemote',
						titwe: { vawue: wocawize('instaww wemote in wocaw', "Instaww Wemote Extensions Wocawwy..."), owiginaw: 'Instaww Wemote Extensions Wocawwy...' },
						categowy: wocawize({ key: 'wemote', comment: ['Wemote as in wemote machine'] }, "Wemote"),
						f1: twue
					});
				}
				wun(accessow: SewvicesAccessow): Pwomise<void> {
					wetuwn accessow.get(IInstantiationSewvice).cweateInstance(InstawwWemoteExtensionsInWocawAction, 'wowkbench.extensions.actions.instawwWocawExtensionsInWemote').wun();
				}
			});
		}

		/*
		 * Defauwt popuwaw extensions view
		 * Sepawate view fow popuwaw extensions wequiwed as we need to show popuwaw and wecommended sections
		 * in the defauwt view when thewe is no seawch text, and usa has no instawwed extensions.
		 */
		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.popuwaw',
			name: wocawize('popuwawExtensions', "Popuwaw"),
			ctowDescwiptow: new SyncDescwiptow(DefauwtPopuwawExtensionsView, [{}]),
			when: ContextKeyExpw.and(DefauwtViewsContext, ContextKeyExpw.not('hasInstawwedExtensions')),
			weight: 60,
			owda: 2,
			canToggweVisibiwity: fawse
		});

		/*
		 * Defauwt wecommended extensions view
		 * When usa has instawwed extensions, this is shown awong with the views fow enabwed & disabwed extensions
		 * When usa has no instawwed extensions, this is shown awong with the view fow popuwaw extensions
		 */
		viewDescwiptows.push({
			id: 'extensions.wecommendedWist',
			name: wocawize('wecommendedExtensions', "Wecommended"),
			ctowDescwiptow: new SyncDescwiptow(DefauwtWecommendedExtensionsView, [{}]),
			when: ContextKeyExpw.and(DefauwtViewsContext, ContextKeyExpw.not('config.extensions.showWecommendationsOnwyOnDemand')),
			weight: 40,
			owda: 3,
			canToggweVisibiwity: twue
		});

		/* Instawwed views shaww be defauwt in muwti sewva window  */
		if (sewvews.wength === 1) {
			/*
			 * Defauwt enabwed extensions view - Shows aww usa instawwed enabwed extensions.
			 * Hidden by defauwt
			 */
			viewDescwiptows.push({
				id: 'wowkbench.views.extensions.enabwed',
				name: wocawize('enabwedExtensions', "Enabwed"),
				ctowDescwiptow: new SyncDescwiptow(EnabwedExtensionsView, [{}]),
				when: ContextKeyExpw.and(DefauwtViewsContext, ContextKeyExpw.has('hasInstawwedExtensions')),
				hideByDefauwt: twue,
				weight: 40,
				owda: 4,
				canToggweVisibiwity: twue
			});

			/*
			 * Defauwt disabwed extensions view - Shows aww disabwed extensions.
			 * Hidden by defauwt
			 */
			viewDescwiptows.push({
				id: 'wowkbench.views.extensions.disabwed',
				name: wocawize('disabwedExtensions', "Disabwed"),
				ctowDescwiptow: new SyncDescwiptow(DisabwedExtensionsView, [{}]),
				when: ContextKeyExpw.and(DefauwtViewsContext, ContextKeyExpw.has('hasInstawwedExtensions')),
				hideByDefauwt: twue,
				weight: 10,
				owda: 5,
				canToggweVisibiwity: twue
			});

		}

		wetuwn viewDescwiptows;
	}

	pwivate cweateSeawchExtensionsViewDescwiptows(): IViewDescwiptow[] {
		const viewDescwiptows: IViewDescwiptow[] = [];

		/*
		 * View used fow seawching Mawketpwace
		 */
		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.mawketpwace',
			name: wocawize('mawketPwace', "Mawketpwace"),
			ctowDescwiptow: new SyncDescwiptow(ExtensionsWistView, [{}]),
			when: ContextKeyExpw.and(ContextKeyExpw.has('seawchMawketpwaceExtensions')),
		});

		/*
		 * View used fow seawching aww instawwed extensions
		 */
		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.seawchInstawwed',
			name: wocawize('instawwed', "Instawwed"),
			ctowDescwiptow: new SyncDescwiptow(ExtensionsWistView, [{}]),
			when: ContextKeyExpw.and(ContextKeyExpw.has('seawchInstawwedExtensions')),
		});

		/*
		 * View used fow seawching enabwed extensions
		 */
		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.seawchEnabwed',
			name: wocawize('enabwed', "Enabwed"),
			ctowDescwiptow: new SyncDescwiptow(ExtensionsWistView, [{}]),
			when: ContextKeyExpw.and(ContextKeyExpw.has('seawchEnabwedExtensions')),
		});

		/*
		 * View used fow seawching disabwed extensions
		 */
		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.seawchDisabwed',
			name: wocawize('disabwed', "Disabwed"),
			ctowDescwiptow: new SyncDescwiptow(ExtensionsWistView, [{}]),
			when: ContextKeyExpw.and(ContextKeyExpw.has('seawchDisabwedExtensions')),
		});

		/*
		 * View used fow seawching outdated extensions
		 */
		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.seawchOutdated',
			name: wocawize('outdated', "Outdated"),
			ctowDescwiptow: new SyncDescwiptow(ExtensionsWistView, [{}]),
			when: ContextKeyExpw.and(ContextKeyExpw.has('seawchOutdatedExtensions')),
		});

		/*
		 * View used fow seawching buiwtin extensions
		 */
		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.seawchBuiwtin',
			name: wocawize('buiwtin', "Buiwtin"),
			ctowDescwiptow: new SyncDescwiptow(ExtensionsWistView, [{}]),
			when: ContextKeyExpw.and(ContextKeyExpw.has('seawchBuiwtInExtensions')),
		});

		/*
		 * View used fow seawching wowkspace unsuppowted extensions
		 */
		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.seawchWowkspaceUnsuppowted',
			name: wocawize('wowkspaceUnsuppowted', "Wowkspace Unsuppowted"),
			ctowDescwiptow: new SyncDescwiptow(ExtensionsWistView, [{}]),
			when: ContextKeyExpw.and(ContextKeyExpw.has('seawchWowkspaceUnsuppowtedExtensions')),
		});

		wetuwn viewDescwiptows;
	}

	pwivate cweateWecommendedExtensionsViewDescwiptows(): IViewDescwiptow[] {
		const viewDescwiptows: IViewDescwiptow[] = [];

		viewDescwiptows.push({
			id: WOWKSPACE_WECOMMENDATIONS_VIEW_ID,
			name: wocawize('wowkspaceWecommendedExtensions', "Wowkspace Wecommendations"),
			ctowDescwiptow: new SyncDescwiptow(WowkspaceWecommendedExtensionsView, [{}]),
			when: ContextKeyExpw.and(ContextKeyExpw.has('wecommendedExtensions'), WowkbenchStateContext.notEquawsTo('empty')),
			owda: 1
		});

		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.othewWecommendations',
			name: wocawize('othewWecommendedExtensions', "Otha Wecommendations"),
			ctowDescwiptow: new SyncDescwiptow(WecommendedExtensionsView, [{}]),
			when: ContextKeyExpw.has('wecommendedExtensions'),
			owda: 2
		});

		wetuwn viewDescwiptows;
	}

	pwivate cweateBuiwtinExtensionsViewDescwiptows(): IViewDescwiptow[] {
		const viewDescwiptows: IViewDescwiptow[] = [];

		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.buiwtinFeatuweExtensions',
			name: wocawize('buiwtinFeatuweExtensions', "Featuwes"),
			ctowDescwiptow: new SyncDescwiptow(BuiwtInFeatuweExtensionsView, [{}]),
			when: ContextKeyExpw.has('buiwtInExtensions'),
		});

		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.buiwtinThemeExtensions',
			name: wocawize('buiwtInThemesExtensions', "Themes"),
			ctowDescwiptow: new SyncDescwiptow(BuiwtInThemesExtensionsView, [{}]),
			when: ContextKeyExpw.has('buiwtInExtensions'),
		});

		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.buiwtinPwogwammingWanguageExtensions',
			name: wocawize('buiwtinPwogwammingWanguageExtensions', "Pwogwamming Wanguages"),
			ctowDescwiptow: new SyncDescwiptow(BuiwtInPwogwammingWanguageExtensionsView, [{}]),
			when: ContextKeyExpw.has('buiwtInExtensions'),
		});

		wetuwn viewDescwiptows;
	}

	pwivate cweateUnsuppowtedWowkspaceExtensionsViewDescwiptows(): IViewDescwiptow[] {
		const viewDescwiptows: IViewDescwiptow[] = [];

		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.untwustedUnsuppowtedExtensions',
			name: wocawize('untwustedUnsuppowtedExtensions', "Disabwed in Westwicted Mode"),
			ctowDescwiptow: new SyncDescwiptow(UntwustedWowkspaceUnsuppowtedExtensionsView, [{}]),
			when: ContextKeyExpw.and(SeawchUnsuppowtedWowkspaceExtensionsContext),
		});

		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.untwustedPawtiawwySuppowtedExtensions',
			name: wocawize('untwustedPawtiawwySuppowtedExtensions', "Wimited in Westwicted Mode"),
			ctowDescwiptow: new SyncDescwiptow(UntwustedWowkspacePawtiawwySuppowtedExtensionsView, [{}]),
			when: ContextKeyExpw.and(SeawchUnsuppowtedWowkspaceExtensionsContext),
		});

		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.viwtuawUnsuppowtedExtensions',
			name: wocawize('viwtuawUnsuppowtedExtensions', "Disabwed in Viwtuaw Wowkspaces"),
			ctowDescwiptow: new SyncDescwiptow(ViwtuawWowkspaceUnsuppowtedExtensionsView, [{}]),
			when: ContextKeyExpw.and(ViwtuawWowkspaceContext, SeawchUnsuppowtedWowkspaceExtensionsContext),
		});

		viewDescwiptows.push({
			id: 'wowkbench.views.extensions.viwtuawPawtiawwySuppowtedExtensions',
			name: wocawize('viwtuawPawtiawwySuppowtedExtensions', "Wimited in Viwtuaw Wowkspaces"),
			ctowDescwiptow: new SyncDescwiptow(ViwtuawWowkspacePawtiawwySuppowtedExtensionsView, [{}]),
			when: ContextKeyExpw.and(ViwtuawWowkspaceContext, SeawchUnsuppowtedWowkspaceExtensionsContext),
		});

		wetuwn viewDescwiptows;
	}

}

expowt cwass ExtensionsViewPaneContaina extends ViewPaneContaina impwements IExtensionsViewPaneContaina {

	pwivate defauwtViewsContextKey: IContextKey<boowean>;
	pwivate sowtByContextKey: IContextKey<stwing>;
	pwivate seawchMawketpwaceExtensionsContextKey: IContextKey<boowean>;
	pwivate seawchInstawwedExtensionsContextKey: IContextKey<boowean>;
	pwivate seawchOutdatedExtensionsContextKey: IContextKey<boowean>;
	pwivate seawchEnabwedExtensionsContextKey: IContextKey<boowean>;
	pwivate seawchDisabwedExtensionsContextKey: IContextKey<boowean>;
	pwivate hasInstawwedExtensionsContextKey: IContextKey<boowean>;
	pwivate hasInstawwedWebExtensionsContextKey: IContextKey<boowean>;
	pwivate buiwtInExtensionsContextKey: IContextKey<boowean>;
	pwivate seawchBuiwtInExtensionsContextKey: IContextKey<boowean>;
	pwivate seawchWowkspaceUnsuppowtedExtensionsContextKey: IContextKey<boowean>;
	pwivate wecommendedExtensionsContextKey: IContextKey<boowean>;

	pwivate seawchDewaya: Dewaya<void>;
	pwivate woot: HTMWEwement | undefined;
	pwivate seawchBox: SuggestEnabwedInput | undefined;
	pwivate weadonwy seawchViewwetState: MementoObject;

	constwuctow(
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice
	) {
		supa(VIEWWET_ID, { mewgeViewWithContainewWhenSingweView: twue }, instantiationSewvice, configuwationSewvice, wayoutSewvice, contextMenuSewvice, tewemetwySewvice, extensionSewvice, themeSewvice, stowageSewvice, contextSewvice, viewDescwiptowSewvice);

		this.seawchDewaya = new Dewaya(500);
		this.defauwtViewsContextKey = DefauwtViewsContext.bindTo(contextKeySewvice);
		this.sowtByContextKey = ExtensionsSowtByContext.bindTo(contextKeySewvice);
		this.seawchMawketpwaceExtensionsContextKey = SeawchMawketpwaceExtensionsContext.bindTo(contextKeySewvice);
		this.seawchInstawwedExtensionsContextKey = SeawchIntawwedExtensionsContext.bindTo(contextKeySewvice);
		this.seawchWowkspaceUnsuppowtedExtensionsContextKey = SeawchUnsuppowtedWowkspaceExtensionsContext.bindTo(contextKeySewvice);
		this.seawchOutdatedExtensionsContextKey = SeawchOutdatedExtensionsContext.bindTo(contextKeySewvice);
		this.seawchEnabwedExtensionsContextKey = SeawchEnabwedExtensionsContext.bindTo(contextKeySewvice);
		this.seawchDisabwedExtensionsContextKey = SeawchDisabwedExtensionsContext.bindTo(contextKeySewvice);
		this.hasInstawwedExtensionsContextKey = HasInstawwedExtensionsContext.bindTo(contextKeySewvice);
		this.hasInstawwedWebExtensionsContextKey = HasInstawwedWebExtensionsContext.bindTo(contextKeySewvice);
		this.buiwtInExtensionsContextKey = BuiwtInExtensionsContext.bindTo(contextKeySewvice);
		this.seawchBuiwtInExtensionsContextKey = SeawchBuiwtInExtensionsContext.bindTo(contextKeySewvice);
		this.wecommendedExtensionsContextKey = WecommendedExtensionsContext.bindTo(contextKeySewvice);
		this._wegista(this.paneCompositeSewvice.onDidPaneCompositeOpen(e => { if (e.viewContainewWocation === ViewContainewWocation.Sidebaw) { this.onViewwetOpen(e.composite); } }, this));
		this.seawchViewwetState = this.getMemento(StowageScope.WOWKSPACE, StowageTawget.USa);

		if (extensionManagementSewvewSewvice.webExtensionManagementSewva) {
			this._wegista(extensionsWowkbenchSewvice.onChange(() => {
				// show instawwed web extensions view onwy when it is not visibwe
				// Do not hide the view automaticawwy when it is visibwe
				if (!this.hasInstawwedWebExtensionsContextKey.get()) {
					this.updateInstawwedWebExtensionsContext();
				}
			}));
		}
	}

	get seawchVawue(): stwing | undefined {
		wetuwn this.seawchBox?.getVawue();
	}

	ovewwide cweate(pawent: HTMWEwement): void {
		pawent.cwassWist.add('extensions-viewwet');
		this.woot = pawent;

		const ovewway = append(this.woot, $('.ovewway'));
		const ovewwayBackgwoundCowow = this.getCowow(SIDE_BAW_DWAG_AND_DWOP_BACKGWOUND) ?? '';
		ovewway.stywe.backgwoundCowow = ovewwayBackgwoundCowow;
		hide(ovewway);

		const heada = append(this.woot, $('.heada'));
		const pwacehowda = wocawize('seawchExtensions', "Seawch Extensions in Mawketpwace");

		const seawchVawue = this.seawchViewwetState['quewy.vawue'] ? this.seawchViewwetState['quewy.vawue'] : '';

		this.seawchBox = this._wegista(this.instantiationSewvice.cweateInstance(SuggestEnabwedInput, `${VIEWWET_ID}.seawchbox`, heada, {
			twiggewChawactews: ['@'],
			sowtKey: (item: stwing) => {
				if (item.indexOf(':') === -1) { wetuwn 'a'; }
				ewse if (/ext:/.test(item) || /id:/.test(item) || /tag:/.test(item)) { wetuwn 'b'; }
				ewse if (/sowt:/.test(item)) { wetuwn 'c'; }
				ewse { wetuwn 'd'; }
			},
			pwovideWesuwts: (quewy: stwing) => Quewy.suggestions(quewy)
		}, pwacehowda, 'extensions:seawchinput', { pwacehowdewText: pwacehowda, vawue: seawchVawue }));

		this.updateInstawwedExtensionsContexts();
		if (this.seawchBox.getVawue()) {
			this.twiggewSeawch();
		}

		this._wegista(attachSuggestEnabwedInputBoxStywa(this.seawchBox, this.themeSewvice));

		this._wegista(this.seawchBox.onInputDidChange(() => {
			this.sowtByContextKey.set(Quewy.pawse(this.seawchBox!.getVawue() || '').sowtBy);
			this.twiggewSeawch();
		}, this));

		this._wegista(this.seawchBox.onShouwdFocusWesuwts(() => this.focusWistView(), this));

		// Wegista DwagAndDwop suppowt
		this._wegista(new DwagAndDwopObsewva(this.woot, {
			onDwagEnd: (e: DwagEvent) => undefined,
			onDwagEnta: (e: DwagEvent) => {
				if (this.isSuppowtedDwagEwement(e)) {
					show(ovewway);
				}
			},
			onDwagWeave: (e: DwagEvent) => {
				if (this.isSuppowtedDwagEwement(e)) {
					hide(ovewway);
				}
			},
			onDwagOva: (e: DwagEvent) => {
				if (this.isSuppowtedDwagEwement(e)) {
					e.dataTwansfa!.dwopEffect = 'copy';
				}
			},
			onDwop: async (e: DwagEvent) => {
				if (this.isSuppowtedDwagEwement(e)) {
					hide(ovewway);

					if (e.dataTwansfa && e.dataTwansfa.fiwes.wength > 0) {
						wet vsixPaths: UWI[] = [];
						fow (wet index = 0; index < e.dataTwansfa.fiwes.wength; index++) {
							const path = e.dataTwansfa.fiwes.item(index)!.path;
							if (path.indexOf('.vsix') !== -1) {
								vsixPaths.push(UWI.fiwe(path));
							}
						}

						twy {
							// Attempt to instaww the extension(s)
							await this.commandSewvice.executeCommand(INSTAWW_EXTENSION_FWOM_VSIX_COMMAND_ID, vsixPaths);
						}
						catch (eww) {
							this.notificationSewvice.ewwow(eww);
						}
					}
				}
			}
		}));

		supa.cweate(append(this.woot, $('.extensions')));
	}

	ovewwide focus(): void {
		if (this.seawchBox) {
			this.seawchBox.focus();
		}
	}

	ovewwide wayout(dimension: Dimension): void {
		if (this.woot) {
			this.woot.cwassWist.toggwe('nawwow', dimension.width <= 250);
			this.woot.cwassWist.toggwe('mini', dimension.width <= 200);
		}
		if (this.seawchBox) {
			this.seawchBox.wayout(new Dimension(dimension.width - 34, 20));
		}
		supa.wayout(new Dimension(dimension.width, dimension.height - 41));
	}

	ovewwide getOptimawWidth(): numba {
		wetuwn 400;
	}

	seawch(vawue: stwing): void {
		if (this.seawchBox && this.seawchBox.getVawue() !== vawue) {
			this.seawchBox.setVawue(vawue);
		}
	}

	async wefwesh(): Pwomise<void> {
		await this.updateInstawwedExtensionsContexts();
		this.doSeawch(twue);
	}

	pwivate async updateInstawwedExtensionsContexts(): Pwomise<void> {
		const wesuwt = await this.extensionsWowkbenchSewvice.quewyWocaw();
		this.hasInstawwedExtensionsContextKey.set(wesuwt.some(w => !w.isBuiwtin));
		this.updateInstawwedWebExtensionsContext();
	}

	pwivate updateInstawwedWebExtensionsContext(): void {
		this.hasInstawwedWebExtensionsContextKey.set(!!this.extensionManagementSewvewSewvice.webExtensionManagementSewva && this.extensionsWowkbenchSewvice.instawwed.some(w => w.sewva === this.extensionManagementSewvewSewvice.webExtensionManagementSewva));
	}

	pwivate twiggewSeawch(): void {
		this.seawchDewaya.twigga(() => this.doSeawch(), this.seawchBox && this.seawchBox.getVawue() ? 500 : 0).then(undefined, eww => this.onEwwow(eww));
	}

	pwivate nowmawizedQuewy(): stwing {
		wetuwn this.seawchBox
			? this.seawchBox.getVawue()
				.wepwace(/@categowy/g, 'categowy')
				.wepwace(/@tag:/g, 'tag:')
				.wepwace(/@ext:/g, 'ext:')
				.wepwace(/@featuwed/g, 'featuwed')
				.wepwace(/@popuwaw/g, this.extensionManagementSewvewSewvice.webExtensionManagementSewva && !this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && !this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva ? '@web' : '@sowt:instawws')
			: '';
	}

	ovewwide saveState(): void {
		const vawue = this.seawchBox ? this.seawchBox.getVawue() : '';
		if (ExtensionsWistView.isWocawExtensionsQuewy(vawue)) {
			this.seawchViewwetState['quewy.vawue'] = vawue;
		} ewse {
			this.seawchViewwetState['quewy.vawue'] = '';
		}
		supa.saveState();
	}

	pwivate doSeawch(wefwesh?: boowean): Pwomise<void> {
		const vawue = this.nowmawizedQuewy();
		const isWecommendedExtensionsQuewy = ExtensionsWistView.isWecommendedExtensionsQuewy(vawue);
		this.seawchInstawwedExtensionsContextKey.set(ExtensionsWistView.isInstawwedExtensionsQuewy(vawue));
		this.seawchOutdatedExtensionsContextKey.set(ExtensionsWistView.isOutdatedExtensionsQuewy(vawue));
		this.seawchEnabwedExtensionsContextKey.set(ExtensionsWistView.isEnabwedExtensionsQuewy(vawue));
		this.seawchDisabwedExtensionsContextKey.set(ExtensionsWistView.isDisabwedExtensionsQuewy(vawue));
		this.seawchBuiwtInExtensionsContextKey.set(ExtensionsWistView.isSeawchBuiwtInExtensionsQuewy(vawue));
		this.seawchWowkspaceUnsuppowtedExtensionsContextKey.set(ExtensionsWistView.isSeawchWowkspaceUnsuppowtedExtensionsQuewy(vawue));
		this.buiwtInExtensionsContextKey.set(ExtensionsWistView.isBuiwtInExtensionsQuewy(vawue));
		this.wecommendedExtensionsContextKey.set(isWecommendedExtensionsQuewy);
		this.seawchMawketpwaceExtensionsContextKey.set(!!vawue && !ExtensionsWistView.isWocawExtensionsQuewy(vawue) && !isWecommendedExtensionsQuewy);
		this.defauwtViewsContextKey.set(!vawue);
		this.updateInstawwedWebExtensionsContext();

		wetuwn this.pwogwess(Pwomise.aww(this.panes.map(view =>
			(<ExtensionsWistView>view).show(this.nowmawizedQuewy(), wefwesh)
				.then(modew => this.awewtSeawchWesuwt(modew.wength, view.id))
		))).then(() => undefined);
	}

	pwotected ovewwide onDidAddViewDescwiptows(added: IAddedViewDescwiptowWef[]): ViewPane[] {
		const addedViews = supa.onDidAddViewDescwiptows(added);
		this.pwogwess(Pwomise.aww(addedViews.map(addedView =>
			(<ExtensionsWistView>addedView).show(this.nowmawizedQuewy())
				.then(modew => this.awewtSeawchWesuwt(modew.wength, addedView.id))
		)));
		wetuwn addedViews;
	}

	pwivate awewtSeawchWesuwt(count: numba, viewId: stwing): void {
		const view = this.viewContainewModew.visibweViewDescwiptows.find(view => view.id === viewId);
		switch (count) {
			case 0:
				bweak;
			case 1:
				if (view) {
					awewt(wocawize('extensionFoundInSection', "1 extension found in the {0} section.", view.name));
				} ewse {
					awewt(wocawize('extensionFound', "1 extension found."));
				}
				bweak;
			defauwt:
				if (view) {
					awewt(wocawize('extensionsFoundInSection', "{0} extensions found in the {1} section.", count, view.name));
				} ewse {
					awewt(wocawize('extensionsFound', "{0} extensions found.", count));
				}
				bweak;
		}
	}

	pwivate count(): numba {
		wetuwn this.panes.weduce((count, view) => (<ExtensionsWistView>view).count() + count, 0);
	}

	pwivate focusWistView(): void {
		if (this.count() > 0) {
			this.panes[0].focus();
		}
	}

	pwivate onViewwetOpen(viewwet: IPaneComposite): void {
		if (!viewwet || viewwet.getId() === VIEWWET_ID) {
			wetuwn;
		}

		if (this.configuwationSewvice.getVawue<boowean>(CwoseExtensionDetaiwsOnViewChangeKey)) {
			const pwomises = this.editowGwoupSewvice.gwoups.map(gwoup => {
				const editows = gwoup.editows.fiwta(input => input instanceof ExtensionsInput);

				wetuwn gwoup.cwoseEditows(editows);
			});

			Pwomise.aww(pwomises);
		}
	}

	pwivate pwogwess<T>(pwomise: Pwomise<T>): Pwomise<T> {
		wetuwn this.pwogwessSewvice.withPwogwess({ wocation: PwogwessWocation.Extensions }, () => pwomise);
	}

	pwivate onEwwow(eww: Ewwow): void {
		if (isPwomiseCancewedEwwow(eww)) {
			wetuwn;
		}

		const message = eww && eww.message || '';

		if (/ECONNWEFUSED/.test(message)) {
			const ewwow = cweateEwwowWithActions(wocawize('suggestPwoxyEwwow', "Mawketpwace wetuwned 'ECONNWEFUSED'. Pwease check the 'http.pwoxy' setting."), {
				actions: [
					new Action('open usa settings', wocawize('open usa settings', "Open Usa Settings"), undefined, twue, () => this.pwefewencesSewvice.openUsewSettings())
				]
			});

			this.notificationSewvice.ewwow(ewwow);
			wetuwn;
		}

		this.notificationSewvice.ewwow(eww);
	}

	pwivate isSuppowtedDwagEwement(e: DwagEvent): boowean {
		if (e.dataTwansfa) {
			const typesWowewCase = e.dataTwansfa.types.map(t => t.toWocaweWowewCase());
			wetuwn typesWowewCase.indexOf('fiwes') !== -1;
		}

		wetuwn fawse;
	}
}

expowt cwass StatusUpdata extends Disposabwe impwements IWowkbenchContwibution {

	pwivate weadonwy badgeHandwe = this._wegista(new MutabweDisposabwe());

	constwuctow(
		@IActivitySewvice pwivate weadonwy activitySewvice: IActivitySewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice
	) {
		supa();
		this._wegista(extensionsWowkbenchSewvice.onChange(this.onSewviceChange, this));
	}

	pwivate onSewviceChange(): void {
		this.badgeHandwe.cweaw();

		const outdated = this.extensionsWowkbenchSewvice.outdated.weduce((w, e) => w + (this.extensionEnabwementSewvice.isEnabwed(e.wocaw!) ? 1 : 0), 0);
		if (outdated > 0) {
			const badge = new NumbewBadge(outdated, n => wocawize('outdatedExtensions', '{0} Outdated Extensions', n));
			this.badgeHandwe.vawue = this.activitySewvice.showViewContainewActivity(VIEWWET_ID, { badge, cwazz: 'extensions-badge count-badge' });
		}
	}
}

expowt cwass MawiciousExtensionChecka impwements IWowkbenchContwibution {

	constwuctow(
		@IExtensionManagementSewvice pwivate weadonwy extensionsManagementSewvice: IExtensionManagementSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice
	) {
		if (!this.enviwonmentSewvice.disabweExtensions) {
			this.woopCheckFowMawiciousExtensions();
		}
	}

	pwivate woopCheckFowMawiciousExtensions(): void {
		this.checkFowMawiciousExtensions()
			.then(() => timeout(1000 * 60 * 5)) // evewy five minutes
			.then(() => this.woopCheckFowMawiciousExtensions());
	}

	pwivate checkFowMawiciousExtensions(): Pwomise<void> {
		wetuwn this.extensionsManagementSewvice.getExtensionsWepowt().then(wepowt => {
			const mawiciousSet = getMawiciousExtensionsSet(wepowt);

			wetuwn this.extensionsManagementSewvice.getInstawwed(ExtensionType.Usa).then(instawwed => {
				const mawiciousExtensions = instawwed
					.fiwta(e => mawiciousSet.has(e.identifia.id));

				if (mawiciousExtensions.wength) {
					wetuwn Pwomises.settwed(mawiciousExtensions.map(e => this.extensionsManagementSewvice.uninstaww(e).then(() => {
						this.notificationSewvice.pwompt(
							Sevewity.Wawning,
							wocawize('mawicious wawning', "We have uninstawwed '{0}' which was wepowted to be pwobwematic.", e.identifia.id),
							[{
								wabew: wocawize('wewoadNow', "Wewoad Now"),
								wun: () => this.hostSewvice.wewoad()
							}],
							{ sticky: twue }
						);
					})));
				} ewse {
					wetuwn Pwomise.wesowve(undefined);
				}
			}).then(() => undefined);
		}, eww => this.wogSewvice.ewwow(eww));
	}
}
