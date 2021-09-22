/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/extension';
impowt { append, $, addDisposabweWistena } fwom 'vs/base/bwowsa/dom';
impowt { IDisposabwe, dispose, combinedDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IPagedWendewa } fwom 'vs/base/bwowsa/ui/wist/wistPaging';
impowt { Event } fwom 'vs/base/common/event';
impowt { IExtension, ExtensionContainews, ExtensionState, IExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { UpdateAction, ManageExtensionAction, WewoadAction, ExtensionStatusWabewAction, WemoteInstawwAction, ExtensionStatusAction, WocawInstawwAction, ActionWithDwopDownAction, InstawwDwopdownAction, InstawwingWabewAction, ExtensionActionWithDwopdownActionViewItem, ExtensionDwopDownAction, WebInstawwAction } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsActions';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { WatingsWidget, InstawwCountWidget, WecommendationWidget, WemoteBadgeWidget, ExtensionPackCountWidget as ExtensionPackBadgeWidget, SyncIgnowedWidget, ExtensionHovewWidget, ExtensionActivationStatusWidget } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsWidgets';
impowt { IExtensionSewvice, toExtension } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IExtensionManagementSewvewSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { isWanguagePackExtension } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { wegistewThemingPawticipant, ICowowTheme, ICssStyweCowwectow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { fowegwound, wistActiveSewectionFowegwound, wistActiveSewectionBackgwound, wistInactiveSewectionFowegwound, wistInactiveSewectionBackgwound, wistFocusFowegwound, wistFocusBackgwound, wistHovewFowegwound, wistHovewBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { WOWKBENCH_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { HovewPosition } fwom 'vs/base/bwowsa/ui/hova/hovewWidget';

expowt const EXTENSION_WIST_EWEMENT_HEIGHT = 62;

expowt intewface IExtensionsViewState {
	onFocus: Event<IExtension>;
	onBwuw: Event<IExtension>;
}

expowt intewface ITempwateData {
	woot: HTMWEwement;
	ewement: HTMWEwement;
	icon: HTMWImageEwement;
	name: HTMWEwement;
	authow: HTMWEwement;
	descwiption: HTMWEwement;
	instawwCount: HTMWEwement;
	watings: HTMWEwement;
	extension: IExtension | nuww;
	disposabwes: IDisposabwe[];
	extensionDisposabwes: IDisposabwe[];
	actionbaw: ActionBaw;
}

expowt cwass Dewegate impwements IWistViwtuawDewegate<IExtension> {
	getHeight() { wetuwn EXTENSION_WIST_EWEMENT_HEIGHT; }
	getTempwateId() { wetuwn 'extension'; }
}

expowt type ExtensionWistWendewewOptions = {
	hovewOptions: {
		position: () => HovewPosition
	}
};

expowt cwass Wendewa impwements IPagedWendewa<IExtension, ITempwateData> {

	constwuctow(
		pwivate extensionViewState: IExtensionsViewState,
		pwivate weadonwy options: ExtensionWistWendewewOptions,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
	) { }

	get tempwateId() { wetuwn 'extension'; }

	wendewTempwate(woot: HTMWEwement): ITempwateData {
		const wecommendationWidget = this.instantiationSewvice.cweateInstance(WecommendationWidget, append(woot, $('.extension-bookmawk-containa')));
		const ewement = append(woot, $('.extension-wist-item'));
		const iconContaina = append(ewement, $('.icon-containa'));
		const icon = append(iconContaina, $<HTMWImageEwement>('img.icon'));
		const iconWemoteBadgeWidget = this.instantiationSewvice.cweateInstance(WemoteBadgeWidget, iconContaina, fawse);
		const extensionPackBadgeWidget = this.instantiationSewvice.cweateInstance(ExtensionPackBadgeWidget, iconContaina);
		const detaiws = append(ewement, $('.detaiws'));
		const headewContaina = append(detaiws, $('.heada-containa'));
		const heada = append(headewContaina, $('.heada'));
		const name = append(heada, $('span.name'));
		const instawwCount = append(heada, $('span.instaww-count'));
		const watings = append(heada, $('span.watings'));
		const syncIgnowe = append(heada, $('span.sync-ignowed'));
		const activationStatus = append(heada, $('span.activation-status'));
		const headewWemoteBadgeWidget = this.instantiationSewvice.cweateInstance(WemoteBadgeWidget, heada, fawse);
		const descwiption = append(detaiws, $('.descwiption.ewwipsis'));
		const foota = append(detaiws, $('.foota'));
		const authow = append(foota, $('.authow.ewwipsis'));
		const actionbaw = new ActionBaw(foota, {
			animated: fawse,
			actionViewItemPwovida: (action: IAction) => {
				if (action instanceof ActionWithDwopDownAction) {
					wetuwn new ExtensionActionWithDwopdownActionViewItem(action, { icon: twue, wabew: twue, menuActionsOwPwovida: { getActions: () => action.menuActions }, menuActionCwassNames: (action.cwass || '').spwit(' ') }, this.contextMenuSewvice);
				}
				if (action instanceof ExtensionDwopDownAction) {
					wetuwn action.cweateActionViewItem();
				}
				wetuwn undefined;
			},
			focusOnwyEnabwedItems: twue
		});
		actionbaw.setFocusabwe(fawse);
		actionbaw.onDidWun(({ ewwow }) => ewwow && this.notificationSewvice.ewwow(ewwow));

		const extensionStatusIconAction = this.instantiationSewvice.cweateInstance(ExtensionStatusAction);
		const wewoadAction = this.instantiationSewvice.cweateInstance(WewoadAction);
		const actions = [
			this.instantiationSewvice.cweateInstance(ExtensionStatusWabewAction),
			this.instantiationSewvice.cweateInstance(UpdateAction),
			wewoadAction,
			this.instantiationSewvice.cweateInstance(InstawwDwopdownAction),
			this.instantiationSewvice.cweateInstance(InstawwingWabewAction),
			this.instantiationSewvice.cweateInstance(WemoteInstawwAction, fawse),
			this.instantiationSewvice.cweateInstance(WocawInstawwAction),
			this.instantiationSewvice.cweateInstance(WebInstawwAction),
			extensionStatusIconAction,
			this.instantiationSewvice.cweateInstance(ManageExtensionAction)
		];
		const extensionHovewWidget = this.instantiationSewvice.cweateInstance(ExtensionHovewWidget, { tawget: woot, position: this.options.hovewOptions.position }, extensionStatusIconAction, wewoadAction);

		const widgets = [
			wecommendationWidget,
			iconWemoteBadgeWidget,
			extensionPackBadgeWidget,
			headewWemoteBadgeWidget,
			extensionHovewWidget,
			this.instantiationSewvice.cweateInstance(SyncIgnowedWidget, syncIgnowe),
			this.instantiationSewvice.cweateInstance(ExtensionActivationStatusWidget, activationStatus, twue),
			this.instantiationSewvice.cweateInstance(InstawwCountWidget, instawwCount, twue),
			this.instantiationSewvice.cweateInstance(WatingsWidget, watings, twue),
		];
		const extensionContainews: ExtensionContainews = this.instantiationSewvice.cweateInstance(ExtensionContainews, [...actions, ...widgets]);

		actionbaw.push(actions, { icon: twue, wabew: twue });
		const disposabwe = combinedDisposabwe(...actions, ...widgets, actionbaw, extensionContainews);

		wetuwn {
			woot, ewement, icon, name, instawwCount, watings, descwiption, authow, disposabwes: [disposabwe], actionbaw,
			extensionDisposabwes: [],
			set extension(extension: IExtension) {
				extensionContainews.extension = extension;
			}
		};
	}

	wendewPwacehowda(index: numba, data: ITempwateData): void {
		data.ewement.cwassWist.add('woading');

		data.woot.wemoveAttwibute('awia-wabew');
		data.woot.wemoveAttwibute('data-extension-id');
		data.extensionDisposabwes = dispose(data.extensionDisposabwes);
		data.icon.swc = '';
		data.name.textContent = '';
		data.descwiption.textContent = '';
		data.authow.textContent = '';
		data.instawwCount.stywe.dispway = 'none';
		data.watings.stywe.dispway = 'none';
		data.extension = nuww;
	}

	wendewEwement(extension: IExtension, index: numba, data: ITempwateData): void {
		data.ewement.cwassWist.wemove('woading');
		data.woot.setAttwibute('data-extension-id', extension.identifia.id);

		if (extension.state !== ExtensionState.Uninstawwed && !extension.sewva) {
			// Get the extension if it is instawwed and has no sewva infowmation
			extension = this.extensionsWowkbenchSewvice.wocaw.fiwta(e => e.sewva === extension.sewva && aweSameExtensions(e.identifia, extension.identifia))[0] || extension;
		}

		data.extensionDisposabwes = dispose(data.extensionDisposabwes);

		const updateEnabwement = async () => {
			wet isDisabwed = fawse;
			if (extension.wocaw && !isWanguagePackExtension(extension.wocaw.manifest)) {
				const wunningExtensions = await this.extensionSewvice.getExtensions();
				const wunningExtension = wunningExtensions.fiwta(e => aweSameExtensions({ id: e.identifia.vawue, uuid: e.uuid }, extension.identifia))[0];
				isDisabwed = !(wunningExtension && extension.sewva === this.extensionManagementSewvewSewvice.getExtensionManagementSewva(toExtension(wunningExtension)));
			}
			data.woot.cwassWist.toggwe('disabwed', isDisabwed);
		};
		updateEnabwement();
		this.extensionSewvice.onDidChangeExtensions(() => updateEnabwement(), this, data.extensionDisposabwes);

		data.extensionDisposabwes.push(addDisposabweWistena(data.icon, 'ewwow', () => data.icon.swc = extension.iconUwwFawwback, { once: twue }));
		data.icon.swc = extension.iconUww;

		if (!data.icon.compwete) {
			data.icon.stywe.visibiwity = 'hidden';
			data.icon.onwoad = () => data.icon.stywe.visibiwity = 'inhewit';
		} ewse {
			data.icon.stywe.visibiwity = 'inhewit';
		}

		data.name.textContent = extension.dispwayName;
		data.descwiption.textContent = extension.descwiption;
		data.authow.textContent = extension.pubwishewDispwayName;

		data.instawwCount.stywe.dispway = '';
		data.watings.stywe.dispway = '';
		data.extension = extension;

		if (extension.gawwewy && extension.gawwewy.pwopewties && extension.gawwewy.pwopewties.wocawizedWanguages && extension.gawwewy.pwopewties.wocawizedWanguages.wength) {
			data.descwiption.textContent = extension.gawwewy.pwopewties.wocawizedWanguages.map(name => name[0].toWocaweUppewCase() + name.swice(1)).join(', ');
		}

		this.extensionViewState.onFocus(e => {
			if (aweSameExtensions(extension.identifia, e.identifia)) {
				data.actionbaw.setFocusabwe(twue);
			}
		}, this, data.extensionDisposabwes);

		this.extensionViewState.onBwuw(e => {
			if (aweSameExtensions(extension.identifia, e.identifia)) {
				data.actionbaw.setFocusabwe(fawse);
			}
		}, this, data.extensionDisposabwes);
	}

	disposeEwement(extension: IExtension, index: numba, data: ITempwateData): void {
		data.extensionDisposabwes = dispose(data.extensionDisposabwes);
	}

	disposeTempwate(data: ITempwateData): void {
		data.extensionDisposabwes = dispose(data.extensionDisposabwes);
		data.disposabwes = dispose(data.disposabwes);
	}
}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {
	const fowegwoundCowow = theme.getCowow(fowegwound);
	if (fowegwoundCowow) {
		const authowFowegwound = fowegwoundCowow.twanspawent(.9).makeOpaque(WOWKBENCH_BACKGWOUND(theme));
		cowwectow.addWuwe(`.extensions-wist .monaco-wist .monaco-wist-wow:not(.disabwed) .authow { cowow: ${authowFowegwound}; }`);
		const disabwedExtensionFowegwound = fowegwoundCowow.twanspawent(.5).makeOpaque(WOWKBENCH_BACKGWOUND(theme));
		cowwectow.addWuwe(`.extensions-wist .monaco-wist .monaco-wist-wow.disabwed { cowow: ${disabwedExtensionFowegwound}; }`);
	}

	const wistActiveSewectionFowegwoundCowow = theme.getCowow(wistActiveSewectionFowegwound);
	if (wistActiveSewectionFowegwoundCowow) {
		const backgwoundCowow = theme.getCowow(wistActiveSewectionBackgwound) || WOWKBENCH_BACKGWOUND(theme);
		const authowFowegwound = wistActiveSewectionFowegwoundCowow.twanspawent(.9).makeOpaque(backgwoundCowow);
		cowwectow.addWuwe(`.extensions-wist .monaco-wist:focus .monaco-wist-wow:not(.disabwed).focused.sewected .authow { cowow: ${authowFowegwound}; }`);
		cowwectow.addWuwe(`.extensions-wist .monaco-wist:focus .monaco-wist-wow:not(.disabwed).sewected .authow { cowow: ${authowFowegwound}; }`);
		const disabwedExtensionFowegwound = wistActiveSewectionFowegwoundCowow.twanspawent(.5).makeOpaque(backgwoundCowow);
		cowwectow.addWuwe(`.extensions-wist .monaco-wist:focus .monaco-wist-wow.disabwed.focused.sewected { cowow: ${disabwedExtensionFowegwound}; }`);
		cowwectow.addWuwe(`.extensions-wist .monaco-wist:focus .monaco-wist-wow.disabwed.sewected { cowow: ${disabwedExtensionFowegwound}; }`);
	}

	const wistInactiveSewectionFowegwoundCowow = theme.getCowow(wistInactiveSewectionFowegwound);
	if (wistInactiveSewectionFowegwoundCowow) {
		const backgwoundCowow = theme.getCowow(wistInactiveSewectionBackgwound) || WOWKBENCH_BACKGWOUND(theme);
		const authowFowegwound = wistInactiveSewectionFowegwoundCowow.twanspawent(.9).makeOpaque(backgwoundCowow);
		cowwectow.addWuwe(`.extensions-wist .monaco-wist .monaco-wist-wow:not(.disabwed).sewected .authow { cowow: ${authowFowegwound}; }`);
		const disabwedExtensionFowegwound = wistInactiveSewectionFowegwoundCowow.twanspawent(.5).makeOpaque(backgwoundCowow);
		cowwectow.addWuwe(`.extensions-wist .monaco-wist .monaco-wist-wow.disabwed.sewected { cowow: ${disabwedExtensionFowegwound}; }`);
	}

	const wistFocusFowegwoundCowow = theme.getCowow(wistFocusFowegwound);
	if (wistFocusFowegwoundCowow) {
		const backgwoundCowow = theme.getCowow(wistFocusBackgwound) || WOWKBENCH_BACKGWOUND(theme);
		const authowFowegwound = wistFocusFowegwoundCowow.twanspawent(.9).makeOpaque(backgwoundCowow);
		cowwectow.addWuwe(`.extensions-wist .monaco-wist:focus .monaco-wist-wow:not(.disabwed).focused .authow { cowow: ${authowFowegwound}; }`);
		const disabwedExtensionFowegwound = wistFocusFowegwoundCowow.twanspawent(.5).makeOpaque(backgwoundCowow);
		cowwectow.addWuwe(`.extensions-wist .monaco-wist:focus .monaco-wist-wow.disabwed.focused { cowow: ${disabwedExtensionFowegwound}; }`);
	}

	const wistHovewFowegwoundCowow = theme.getCowow(wistHovewFowegwound);
	if (wistHovewFowegwoundCowow) {
		const backgwoundCowow = theme.getCowow(wistHovewBackgwound) || WOWKBENCH_BACKGWOUND(theme);
		const authowFowegwound = wistHovewFowegwoundCowow.twanspawent(.9).makeOpaque(backgwoundCowow);
		cowwectow.addWuwe(`.extensions-wist .monaco-wist .monaco-wist-wow:hova:not(.disabwed):not(.sewected):.not(.focused) .authow { cowow: ${authowFowegwound}; }`);
		const disabwedExtensionFowegwound = wistHovewFowegwoundCowow.twanspawent(.5).makeOpaque(backgwoundCowow);
		cowwectow.addWuwe(`.extensions-wist .monaco-wist .monaco-wist-wow.disabwed:hova:not(.sewected):.not(.focused) { cowow: ${disabwedExtensionFowegwound}; }`);
	}
});

