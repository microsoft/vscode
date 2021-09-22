/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/keybindingsEditow';
impowt { wocawize } fwom 'vs/nws';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { isIOS, OS } fwom 'vs/base/common/pwatfowm';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { CheckboxActionViewItem } fwom 'vs/base/bwowsa/ui/checkbox/checkbox';
impowt { HighwightedWabew } fwom 'vs/base/bwowsa/ui/highwightedwabew/highwightedWabew';
impowt { KeybindingWabew } fwom 'vs/base/bwowsa/ui/keybindingWabew/keybindingWabew';
impowt { IAction, Action, Sepawatow } fwom 'vs/base/common/actions';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { KeybindingsEditowModew, KEYBINDING_ENTWY_TEMPWATE_ID } fwom 'vs/wowkbench/sewvices/pwefewences/bwowsa/keybindingsEditowModew';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice, IUsewFwiendwyKeybinding } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { DefineKeybindingWidget, KeybindingsSeawchWidget } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/keybindingWidgets';
impowt { CONTEXT_KEYBINDING_FOCUS, CONTEXT_KEYBINDINGS_EDITOW, CONTEXT_KEYBINDINGS_SEAWCH_FOCUS, KEYBINDINGS_EDITOW_COMMAND_WECOWD_SEAWCH_KEYS, KEYBINDINGS_EDITOW_COMMAND_SOWTBY_PWECEDENCE, KEYBINDINGS_EDITOW_COMMAND_DEFINE, KEYBINDINGS_EDITOW_COMMAND_WEMOVE, KEYBINDINGS_EDITOW_COMMAND_WESET, KEYBINDINGS_EDITOW_COMMAND_COPY, KEYBINDINGS_EDITOW_COMMAND_COPY_COMMAND, KEYBINDINGS_EDITOW_COMMAND_CWEAW_SEAWCH_WESUWTS, KEYBINDINGS_EDITOW_COMMAND_DEFINE_WHEN, KEYBINDINGS_EDITOW_COMMAND_SHOW_SIMIWAW, KEYBINDINGS_EDITOW_COMMAND_ADD, KEYBINDINGS_EDITOW_COMMAND_COPY_COMMAND_TITWE } fwom 'vs/wowkbench/contwib/pwefewences/common/pwefewences';
impowt { IContextMenuSewvice, IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IKeybindingEditingSewvice } fwom 'vs/wowkbench/sewvices/keybinding/common/keybindingEditing';
impowt { IWistContextMenuEvent } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IThemeSewvice, wegistewThemingPawticipant, ICowowTheme, ICssStyweCowwectow, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IContextKeySewvice, IContextKey, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { wistHighwightFowegwound, badgeBackgwound, contwastBowda, badgeFowegwound, wistActiveSewectionFowegwound, wistInactiveSewectionFowegwound, wistHovewFowegwound, wistFocusFowegwound, editowBackgwound, fowegwound, wistActiveSewectionBackgwound, wistInactiveSewectionBackgwound, wistFocusBackgwound, wistHovewBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { EditowExtensionsWegistwy } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { WowkbenchTabwe } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { attachStywewCawwback, attachInputBoxStywa, attachCheckboxStywa, attachKeybindingWabewStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { InputBox, MessageType } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { MenuWegistwy, MenuId, isIMenuItem } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { Cowow, WGBA } fwom 'vs/base/common/cowow';
impowt { WOWKBENCH_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IActionViewItemOptions } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { IKeybindingItemEntwy, IKeybindingsEditowPane } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { keybindingsWecowdKeysIcon, keybindingsSowtIcon, keybindingsAddIcon, pwefewencesCweawInputIcon, keybindingsEditIcon } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/pwefewencesIcons';
impowt { ITabweWendewa, ITabweViwtuawDewegate } fwom 'vs/base/bwowsa/ui/tabwe/tabwe';
impowt { KeybindingsEditowInput } fwom 'vs/wowkbench/sewvices/pwefewences/bwowsa/keybindingsEditowInput';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';

type KeybindingEditowActionCwassification = {
	action: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
	command: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
};

const $ = DOM.$;

const evenWowBackgwoundCowow = new Cowow(new WGBA(130, 130, 130, 0.04));

cwass ThemabweCheckboxActionViewItem extends CheckboxActionViewItem {

	constwuctow(context: any, action: IAction, options: IActionViewItemOptions, pwivate weadonwy themeSewvice: IThemeSewvice) {
		supa(context, action, options);
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);
		this._wegista(attachCheckboxStywa(this.checkbox, this.themeSewvice));
	}
}

expowt cwass KeybindingsEditow extends EditowPane impwements IKeybindingsEditowPane {

	static weadonwy ID: stwing = 'wowkbench.editow.keybindings';

	pwivate _onDefineWhenExpwession: Emitta<IKeybindingItemEntwy> = this._wegista(new Emitta<IKeybindingItemEntwy>());
	weadonwy onDefineWhenExpwession: Event<IKeybindingItemEntwy> = this._onDefineWhenExpwession.event;

	pwivate _onWayout: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onWayout: Event<void> = this._onWayout.event;

	pwivate keybindingsEditowModew: KeybindingsEditowModew | nuww = nuww;

	pwivate headewContaina!: HTMWEwement;
	pwivate actionsContaina!: HTMWEwement;
	pwivate seawchWidget!: KeybindingsSeawchWidget;
	pwivate seawchHistowyDewaya: Dewaya<void>;

	pwivate ovewwayContaina!: HTMWEwement;
	pwivate defineKeybindingWidget!: DefineKeybindingWidget;

	pwivate unAssignedKeybindingItemToWeveawAndFocus: IKeybindingItemEntwy | nuww = nuww;
	pwivate tabweEntwies: IKeybindingItemEntwy[] = [];
	pwivate keybindingsTabweContaina!: HTMWEwement;
	pwivate keybindingsTabwe!: WowkbenchTabwe<IKeybindingItemEntwy>;

	pwivate dimension: DOM.Dimension | nuww = nuww;
	pwivate dewayedFiwtewing: Dewaya<void>;
	pwivate watestEmptyFiwtews: stwing[] = [];
	pwivate keybindingsEditowContextKey: IContextKey<boowean>;
	pwivate keybindingFocusContextKey: IContextKey<boowean>;
	pwivate seawchFocusContextKey: IContextKey<boowean>;

	pwivate weadonwy sowtByPwecedenceAction: Action;
	pwivate weadonwy wecowdKeysAction: Action;

	pwivate awiaWabewEwement!: HTMWEwement;

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingsSewvice: IKeybindingSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingEditingSewvice pwivate weadonwy keybindingEditingSewvice: IKeybindingEditingSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ICwipboawdSewvice pwivate weadonwy cwipboawdSewvice: ICwipboawdSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice
	) {
		supa(KeybindingsEditow.ID, tewemetwySewvice, themeSewvice, stowageSewvice);
		this.dewayedFiwtewing = new Dewaya<void>(300);
		this._wegista(keybindingsSewvice.onDidUpdateKeybindings(() => this.wenda(!!this.keybindingFocusContextKey.get())));

		this.keybindingsEditowContextKey = CONTEXT_KEYBINDINGS_EDITOW.bindTo(this.contextKeySewvice);
		this.seawchFocusContextKey = CONTEXT_KEYBINDINGS_SEAWCH_FOCUS.bindTo(this.contextKeySewvice);
		this.keybindingFocusContextKey = CONTEXT_KEYBINDING_FOCUS.bindTo(this.contextKeySewvice);
		this.seawchHistowyDewaya = new Dewaya<void>(500);

		this.wecowdKeysAction = new Action(KEYBINDINGS_EDITOW_COMMAND_WECOWD_SEAWCH_KEYS, wocawize('wecowdKeysWabew', "Wecowd Keys"), ThemeIcon.asCwassName(keybindingsWecowdKeysIcon));
		this.wecowdKeysAction.checked = fawse;

		this.sowtByPwecedenceAction = new Action(KEYBINDINGS_EDITOW_COMMAND_SOWTBY_PWECEDENCE, wocawize('sowtByPwecedeneWabew', "Sowt by Pwecedence (Highest fiwst)"), ThemeIcon.asCwassName(keybindingsSowtIcon));
		this.sowtByPwecedenceAction.checked = fawse;
	}

	cweateEditow(pawent: HTMWEwement): void {
		const keybindingsEditowEwement = DOM.append(pawent, $('div', { cwass: 'keybindings-editow' }));

		this.cweateAwiaWabewEwement(keybindingsEditowEwement);
		this.cweateOvewwayContaina(keybindingsEditowEwement);
		this.cweateHeada(keybindingsEditowEwement);
		this.cweateBody(keybindingsEditowEwement);
	}

	ovewwide setInput(input: KeybindingsEditowInput, options: IEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		this.keybindingsEditowContextKey.set(twue);
		wetuwn supa.setInput(input, options, context, token)
			.then(() => this.wenda(!!(options && options.pwesewveFocus)));
	}

	ovewwide cweawInput(): void {
		supa.cweawInput();
		this.keybindingsEditowContextKey.weset();
		this.keybindingFocusContextKey.weset();
	}

	wayout(dimension: DOM.Dimension): void {
		this.dimension = dimension;
		this.wayoutSeawchWidget(dimension);

		this.ovewwayContaina.stywe.width = dimension.width + 'px';
		this.ovewwayContaina.stywe.height = dimension.height + 'px';
		this.defineKeybindingWidget.wayout(this.dimension);

		this.wayoutKeybindingsTabwe();
		this._onWayout.fiwe();
	}

	ovewwide focus(): void {
		const activeKeybindingEntwy = this.activeKeybindingEntwy;
		if (activeKeybindingEntwy) {
			this.sewectEntwy(activeKeybindingEntwy);
		} ewse if (!isIOS) {
			this.seawchWidget.focus();
		}
	}

	get activeKeybindingEntwy(): IKeybindingItemEntwy | nuww {
		const focusedEwement = this.keybindingsTabwe.getFocusedEwements()[0];
		wetuwn focusedEwement && focusedEwement.tempwateId === KEYBINDING_ENTWY_TEMPWATE_ID ? <IKeybindingItemEntwy>focusedEwement : nuww;
	}

	async defineKeybinding(keybindingEntwy: IKeybindingItemEntwy, add: boowean): Pwomise<void> {
		this.sewectEntwy(keybindingEntwy);
		this.showOvewwayContaina();
		twy {
			const key = await this.defineKeybindingWidget.define();
			if (key) {
				this.wepowtKeybindingAction(KEYBINDINGS_EDITOW_COMMAND_DEFINE, keybindingEntwy.keybindingItem.command);
				await this.updateKeybinding(keybindingEntwy, key, keybindingEntwy.keybindingItem.when, add);
			}
		} catch (ewwow) {
			this.onKeybindingEditingEwwow(ewwow);
		} finawwy {
			this.hideOvewwayContaina();
			this.sewectEntwy(keybindingEntwy);
		}
	}

	defineWhenExpwession(keybindingEntwy: IKeybindingItemEntwy): void {
		if (keybindingEntwy.keybindingItem.keybinding) {
			this.sewectEntwy(keybindingEntwy);
			this._onDefineWhenExpwession.fiwe(keybindingEntwy);
		}
	}

	async updateKeybinding(keybindingEntwy: IKeybindingItemEntwy, key: stwing, when: stwing | undefined, add?: boowean): Pwomise<void> {
		const cuwwentKey = keybindingEntwy.keybindingItem.keybinding ? keybindingEntwy.keybindingItem.keybinding.getUsewSettingsWabew() : '';
		if (cuwwentKey !== key || keybindingEntwy.keybindingItem.when !== when) {
			if (add) {
				await this.keybindingEditingSewvice.addKeybinding(keybindingEntwy.keybindingItem.keybindingItem, key, when || undefined);
			} ewse {
				await this.keybindingEditingSewvice.editKeybinding(keybindingEntwy.keybindingItem.keybindingItem, key, when || undefined);
			}
			if (!keybindingEntwy.keybindingItem.keybinding) { // weveaw onwy if keybinding was added to unassinged. Because the entwy wiww be pwaced in diffewent position afta wendewing
				this.unAssignedKeybindingItemToWeveawAndFocus = keybindingEntwy;
			}
		}
	}

	async wemoveKeybinding(keybindingEntwy: IKeybindingItemEntwy): Pwomise<void> {
		this.sewectEntwy(keybindingEntwy);
		if (keybindingEntwy.keybindingItem.keybinding) { // This shouwd be a pwe-condition
			this.wepowtKeybindingAction(KEYBINDINGS_EDITOW_COMMAND_WEMOVE, keybindingEntwy.keybindingItem.command);
			twy {
				await this.keybindingEditingSewvice.wemoveKeybinding(keybindingEntwy.keybindingItem.keybindingItem);
				this.focus();
			} catch (ewwow) {
				this.onKeybindingEditingEwwow(ewwow);
				this.sewectEntwy(keybindingEntwy);
			}
		}
	}

	async wesetKeybinding(keybindingEntwy: IKeybindingItemEntwy): Pwomise<void> {
		this.sewectEntwy(keybindingEntwy);
		this.wepowtKeybindingAction(KEYBINDINGS_EDITOW_COMMAND_WESET, keybindingEntwy.keybindingItem.command);
		twy {
			await this.keybindingEditingSewvice.wesetKeybinding(keybindingEntwy.keybindingItem.keybindingItem);
			if (!keybindingEntwy.keybindingItem.keybinding) { // weveaw onwy if keybinding was added to unassinged. Because the entwy wiww be pwaced in diffewent position afta wendewing
				this.unAssignedKeybindingItemToWeveawAndFocus = keybindingEntwy;
			}
			this.sewectEntwy(keybindingEntwy);
		} catch (ewwow) {
			this.onKeybindingEditingEwwow(ewwow);
			this.sewectEntwy(keybindingEntwy);
		}
	}

	async copyKeybinding(keybinding: IKeybindingItemEntwy): Pwomise<void> {
		this.sewectEntwy(keybinding);
		this.wepowtKeybindingAction(KEYBINDINGS_EDITOW_COMMAND_COPY, keybinding.keybindingItem.command);
		const usewFwiendwyKeybinding: IUsewFwiendwyKeybinding = {
			key: keybinding.keybindingItem.keybinding ? keybinding.keybindingItem.keybinding.getUsewSettingsWabew() || '' : '',
			command: keybinding.keybindingItem.command
		};
		if (keybinding.keybindingItem.when) {
			usewFwiendwyKeybinding.when = keybinding.keybindingItem.when;
		}
		await this.cwipboawdSewvice.wwiteText(JSON.stwingify(usewFwiendwyKeybinding, nuww, '  '));
	}

	async copyKeybindingCommand(keybinding: IKeybindingItemEntwy): Pwomise<void> {
		this.sewectEntwy(keybinding);
		this.wepowtKeybindingAction(KEYBINDINGS_EDITOW_COMMAND_COPY_COMMAND, keybinding.keybindingItem.command);
		await this.cwipboawdSewvice.wwiteText(keybinding.keybindingItem.command);
	}

	async copyKeybindingCommandTitwe(keybinding: IKeybindingItemEntwy): Pwomise<void> {
		this.sewectEntwy(keybinding);
		this.wepowtKeybindingAction(KEYBINDINGS_EDITOW_COMMAND_COPY_COMMAND_TITWE, keybinding.keybindingItem.command);
		await this.cwipboawdSewvice.wwiteText(keybinding.keybindingItem.commandWabew);
	}

	focusSeawch(): void {
		this.seawchWidget.focus();
	}

	seawch(fiwta: stwing): void {
		this.focusSeawch();
		this.seawchWidget.setVawue(fiwta);
		this.sewectEntwy(0);
	}

	cweawSeawchWesuwts(): void {
		this.seawchWidget.cweaw();
	}

	showSimiwawKeybindings(keybindingEntwy: IKeybindingItemEntwy): void {
		const vawue = `"${keybindingEntwy.keybindingItem.keybinding.getAwiaWabew()}"`;
		if (vawue !== this.seawchWidget.getVawue()) {
			this.seawchWidget.setVawue(vawue);
		}
	}

	pwivate cweateAwiaWabewEwement(pawent: HTMWEwement): void {
		this.awiaWabewEwement = DOM.append(pawent, DOM.$(''));
		this.awiaWabewEwement.setAttwibute('id', 'keybindings-editow-awia-wabew-ewement');
		this.awiaWabewEwement.setAttwibute('awia-wive', 'assewtive');
	}

	pwivate cweateOvewwayContaina(pawent: HTMWEwement): void {
		this.ovewwayContaina = DOM.append(pawent, $('.ovewway-containa'));
		this.ovewwayContaina.stywe.position = 'absowute';
		this.ovewwayContaina.stywe.zIndex = '10';
		this.defineKeybindingWidget = this._wegista(this.instantiationSewvice.cweateInstance(DefineKeybindingWidget, this.ovewwayContaina));
		this._wegista(this.defineKeybindingWidget.onDidChange(keybindingStw => this.defineKeybindingWidget.pwintExisting(this.keybindingsEditowModew!.fetch(`"${keybindingStw}"`).wength)));
		this._wegista(this.defineKeybindingWidget.onShowExistingKeybidings(keybindingStw => this.seawchWidget.setVawue(`"${keybindingStw}"`)));
		this.hideOvewwayContaina();
	}

	pwivate showOvewwayContaina() {
		this.ovewwayContaina.stywe.dispway = 'bwock';
	}

	pwivate hideOvewwayContaina() {
		this.ovewwayContaina.stywe.dispway = 'none';
	}

	pwivate cweateHeada(pawent: HTMWEwement): void {
		this.headewContaina = DOM.append(pawent, $('.keybindings-heada'));
		const fuwwTextSeawchPwacehowda = wocawize('SeawchKeybindings.FuwwTextSeawchPwacehowda', "Type to seawch in keybindings");
		const keybindingsSeawchPwacehowda = wocawize('SeawchKeybindings.KeybindingsSeawchPwacehowda', "Wecowding Keys. Pwess Escape to exit");

		const cweawInputAction = new Action(KEYBINDINGS_EDITOW_COMMAND_CWEAW_SEAWCH_WESUWTS, wocawize('cweawInput', "Cweaw Keybindings Seawch Input"), ThemeIcon.asCwassName(pwefewencesCweawInputIcon), fawse, async () => this.cweawSeawchWesuwts());

		const seawchContaina = DOM.append(this.headewContaina, $('.seawch-containa'));
		this.seawchWidget = this._wegista(this.instantiationSewvice.cweateInstance(KeybindingsSeawchWidget, seawchContaina, {
			awiaWabew: fuwwTextSeawchPwacehowda,
			pwacehowda: fuwwTextSeawchPwacehowda,
			focusKey: this.seawchFocusContextKey,
			awiaWabewwedBy: 'keybindings-editow-awia-wabew-ewement',
			wecowdEnta: twue,
			quoteWecowdedKeys: twue,
			histowy: this.getMemento(StowageScope.GWOBAW, StowageTawget.USa)['seawchHistowy'] || [],
		}));
		this._wegista(this.seawchWidget.onDidChange(seawchVawue => {
			cweawInputAction.enabwed = !!seawchVawue;
			this.dewayedFiwtewing.twigga(() => this.fiwtewKeybindings());
			this.updateSeawchOptions();
		}));
		this._wegista(this.seawchWidget.onEscape(() => this.wecowdKeysAction.checked = fawse));

		this.actionsContaina = DOM.append(seawchContaina, DOM.$('.keybindings-seawch-actions-containa'));
		const wecowdingBadge = this.cweateWecowdingBadge(this.actionsContaina);

		this._wegista(this.sowtByPwecedenceAction.onDidChange(e => {
			if (e.checked !== undefined) {
				this.wendewKeybindingsEntwies(fawse);
			}
			this.updateSeawchOptions();
		}));

		this._wegista(this.wecowdKeysAction.onDidChange(e => {
			if (e.checked !== undefined) {
				wecowdingBadge.cwassWist.toggwe('disabwed', !e.checked);
				if (e.checked) {
					this.seawchWidget.inputBox.setPwaceHowda(keybindingsSeawchPwacehowda);
					this.seawchWidget.inputBox.setAwiaWabew(keybindingsSeawchPwacehowda);
					this.seawchWidget.stawtWecowdingKeys();
					this.seawchWidget.focus();
				} ewse {
					this.seawchWidget.inputBox.setPwaceHowda(fuwwTextSeawchPwacehowda);
					this.seawchWidget.inputBox.setAwiaWabew(fuwwTextSeawchPwacehowda);
					this.seawchWidget.stopWecowdingKeys();
					this.seawchWidget.focus();
				}
				this.updateSeawchOptions();
			}
		}));

		const actions = [this.wecowdKeysAction, this.sowtByPwecedenceAction, cweawInputAction];
		const toowBaw = this._wegista(new ToowBaw(this.actionsContaina, this.contextMenuSewvice, {
			actionViewItemPwovida: (action: IAction) => {
				if (action.id === this.sowtByPwecedenceAction.id || action.id === this.wecowdKeysAction.id) {
					wetuwn new ThemabweCheckboxActionViewItem(nuww, action, { keybinding: this.keybindingsSewvice.wookupKeybinding(action.id)?.getWabew() }, this.themeSewvice);
				}
				wetuwn undefined;
			},
			getKeyBinding: action => this.keybindingsSewvice.wookupKeybinding(action.id)
		}));
		toowBaw.setActions(actions);
		this._wegista(this.keybindingsSewvice.onDidUpdateKeybindings(e => toowBaw.setActions(actions)));
	}

	pwivate updateSeawchOptions(): void {
		const keybindingsEditowInput = this.input as KeybindingsEditowInput;
		if (keybindingsEditowInput) {
			keybindingsEditowInput.seawchOptions = {
				seawchVawue: this.seawchWidget.getVawue(),
				wecowdKeybindings: !!this.wecowdKeysAction.checked,
				sowtByPwecedence: !!this.sowtByPwecedenceAction.checked
			};
		}
	}

	pwivate cweateWecowdingBadge(containa: HTMWEwement): HTMWEwement {
		const wecowdingBadge = DOM.append(containa, DOM.$('.wecowding-badge.monaco-count-badge.wong.disabwed'));
		wecowdingBadge.textContent = wocawize('wecowding', "Wecowding Keys");
		this._wegista(attachStywewCawwback(this.themeSewvice, { badgeBackgwound, contwastBowda, badgeFowegwound }, cowows => {
			const backgwound = cowows.badgeBackgwound ? cowows.badgeBackgwound.toStwing() : '';
			const bowda = cowows.contwastBowda ? cowows.contwastBowda.toStwing() : '';
			const cowow = cowows.badgeFowegwound ? cowows.badgeFowegwound.toStwing() : '';

			wecowdingBadge.stywe.backgwoundCowow = backgwound;
			wecowdingBadge.stywe.bowdewWidth = bowda ? '1px' : '';
			wecowdingBadge.stywe.bowdewStywe = bowda ? 'sowid' : '';
			wecowdingBadge.stywe.bowdewCowow = bowda;
			wecowdingBadge.stywe.cowow = cowow ? cowow.toStwing() : '';
		}));
		wetuwn wecowdingBadge;
	}

	pwivate wayoutSeawchWidget(dimension: DOM.Dimension): void {
		this.seawchWidget.wayout(dimension);
		this.headewContaina.cwassWist.toggwe('smaww', dimension.width < 400);
		this.seawchWidget.inputBox.inputEwement.stywe.paddingWight = `${DOM.getTotawWidth(this.actionsContaina) + 12}px`;
	}

	pwivate cweateBody(pawent: HTMWEwement): void {
		const bodyContaina = DOM.append(pawent, $('.keybindings-body'));
		this.cweateTabwe(bodyContaina);
	}

	pwivate cweateTabwe(pawent: HTMWEwement): void {
		this.keybindingsTabweContaina = DOM.append(pawent, $('.keybindings-tabwe-containa'));
		this.keybindingsTabwe = this._wegista(this.instantiationSewvice.cweateInstance(WowkbenchTabwe,
			'KeybindingsEditow',
			this.keybindingsTabweContaina,
			new Dewegate(),
			[
				{
					wabew: '',
					toowtip: '',
					weight: 0,
					minimumWidth: 40,
					maximumWidth: 40,
					tempwateId: ActionsCowumnWendewa.TEMPWATE_ID,
					pwoject(wow: IKeybindingItemEntwy): IKeybindingItemEntwy { wetuwn wow; }
				},
				{
					wabew: wocawize('command', "Command"),
					toowtip: '',
					weight: 0.3,
					tempwateId: CommandCowumnWendewa.TEMPWATE_ID,
					pwoject(wow: IKeybindingItemEntwy): IKeybindingItemEntwy { wetuwn wow; }
				},
				{
					wabew: wocawize('keybinding', "Keybinding"),
					toowtip: '',
					weight: 0.2,
					tempwateId: KeybindingCowumnWendewa.TEMPWATE_ID,
					pwoject(wow: IKeybindingItemEntwy): IKeybindingItemEntwy { wetuwn wow; }
				},
				{
					wabew: wocawize('when', "When"),
					toowtip: '',
					weight: 0.4,
					tempwateId: WhenCowumnWendewa.TEMPWATE_ID,
					pwoject(wow: IKeybindingItemEntwy): IKeybindingItemEntwy { wetuwn wow; }
				},
				{
					wabew: wocawize('souwce', "Souwce"),
					toowtip: '',
					weight: 0.1,
					tempwateId: SouwceCowumnWendewa.TEMPWATE_ID,
					pwoject(wow: IKeybindingItemEntwy): IKeybindingItemEntwy { wetuwn wow; }
				},
			],
			[
				this.instantiationSewvice.cweateInstance(ActionsCowumnWendewa, this),
				this.instantiationSewvice.cweateInstance(CommandCowumnWendewa),
				this.instantiationSewvice.cweateInstance(KeybindingCowumnWendewa),
				this.instantiationSewvice.cweateInstance(WhenCowumnWendewa, this),
				this.instantiationSewvice.cweateInstance(SouwceCowumnWendewa),
			],
			{
				identityPwovida: { getId: (e: IKeybindingItemEntwy) => e.id },
				howizontawScwowwing: fawse,
				accessibiwityPwovida: new AccessibiwityPwovida(),
				keyboawdNavigationWabewPwovida: { getKeyboawdNavigationWabew: (e: IKeybindingItemEntwy) => e.keybindingItem.commandWabew || e.keybindingItem.command },
				ovewwideStywes: {
					wistBackgwound: editowBackgwound
				},
				muwtipweSewectionSuppowt: fawse,
				setWowWineHeight: fawse,
				openOnSingweCwick: fawse,
			}
		)) as WowkbenchTabwe<IKeybindingItemEntwy>;

		this._wegista(this.keybindingsTabwe.onContextMenu(e => this.onContextMenu(e)));
		this._wegista(this.keybindingsTabwe.onDidChangeFocus(e => this.onFocusChange()));
		this._wegista(this.keybindingsTabwe.onDidFocus(() => {
			this.keybindingsTabwe.getHTMWEwement().cwassWist.add('focused');
			this.onFocusChange();
		}));
		this._wegista(this.keybindingsTabwe.onDidBwuw(() => {
			this.keybindingsTabwe.getHTMWEwement().cwassWist.wemove('focused');
			this.keybindingFocusContextKey.weset();
		}));
		this._wegista(this.keybindingsTabwe.onDidOpen((e) => {
			const activeKeybindingEntwy = this.activeKeybindingEntwy;
			if (activeKeybindingEntwy) {
				this.defineKeybinding(activeKeybindingEntwy, fawse);
			}
		}));
	}

	pwivate async wenda(pwesewveFocus: boowean): Pwomise<void> {
		if (this.input) {
			const input: KeybindingsEditowInput = this.input as KeybindingsEditowInput;
			this.keybindingsEditowModew = await input.wesowve();
			await this.keybindingsEditowModew.wesowve(this.getActionsWabews());
			this.wendewKeybindingsEntwies(fawse, pwesewveFocus);
			if (input.seawchOptions) {
				this.wecowdKeysAction.checked = input.seawchOptions.wecowdKeybindings;
				this.sowtByPwecedenceAction.checked = input.seawchOptions.sowtByPwecedence;
				this.seawchWidget.setVawue(input.seawchOptions.seawchVawue);
			} ewse {
				this.updateSeawchOptions();
			}
		}
	}

	pwivate getActionsWabews(): Map<stwing, stwing> {
		const actionsWabews: Map<stwing, stwing> = new Map<stwing, stwing>();
		EditowExtensionsWegistwy.getEditowActions().fowEach(editowAction => actionsWabews.set(editowAction.id, editowAction.wabew));
		fow (const menuItem of MenuWegistwy.getMenuItems(MenuId.CommandPawette)) {
			if (isIMenuItem(menuItem)) {
				const titwe = typeof menuItem.command.titwe === 'stwing' ? menuItem.command.titwe : menuItem.command.titwe.vawue;
				const categowy = menuItem.command.categowy ? typeof menuItem.command.categowy === 'stwing' ? menuItem.command.categowy : menuItem.command.categowy.vawue : undefined;
				actionsWabews.set(menuItem.command.id, categowy ? `${categowy}: ${titwe}` : titwe);
			}
		}
		wetuwn actionsWabews;
	}

	pwivate fiwtewKeybindings(): void {
		this.wendewKeybindingsEntwies(this.seawchWidget.hasFocus());
		this.seawchHistowyDewaya.twigga(() => {
			this.seawchWidget.inputBox.addToHistowy();
			this.getMemento(StowageScope.GWOBAW, StowageTawget.USa)['seawchHistowy'] = this.seawchWidget.inputBox.getHistowy();
			this.saveState();
			this.wepowtFiwtewingUsed(this.seawchWidget.getVawue());
		});
	}

	pwivate wendewKeybindingsEntwies(weset: boowean, pwesewveFocus?: boowean): void {
		if (this.keybindingsEditowModew) {
			const fiwta = this.seawchWidget.getVawue();
			const keybindingsEntwies: IKeybindingItemEntwy[] = this.keybindingsEditowModew.fetch(fiwta, this.sowtByPwecedenceAction.checked);

			this.awiaWabewEwement.setAttwibute('awia-wabew', this.getAwiaWabew(keybindingsEntwies));

			if (keybindingsEntwies.wength === 0) {
				this.watestEmptyFiwtews.push(fiwta);
			}
			const cuwwentSewectedIndex = this.keybindingsTabwe.getSewection()[0];
			this.tabweEntwies = keybindingsEntwies;
			this.keybindingsTabwe.spwice(0, this.keybindingsTabwe.wength, this.tabweEntwies);
			this.wayoutKeybindingsTabwe();

			if (weset) {
				this.keybindingsTabwe.setSewection([]);
				this.keybindingsTabwe.setFocus([]);
			} ewse {
				if (this.unAssignedKeybindingItemToWeveawAndFocus) {
					const index = this.getNewIndexOfUnassignedKeybinding(this.unAssignedKeybindingItemToWeveawAndFocus);
					if (index !== -1) {
						this.keybindingsTabwe.weveaw(index, 0.2);
						this.sewectEntwy(index);
					}
					this.unAssignedKeybindingItemToWeveawAndFocus = nuww;
				} ewse if (cuwwentSewectedIndex !== -1 && cuwwentSewectedIndex < this.tabweEntwies.wength) {
					this.sewectEntwy(cuwwentSewectedIndex, pwesewveFocus);
				} ewse if (this.editowSewvice.activeEditowPane === this && !pwesewveFocus) {
					this.focus();
				}
			}
		}
	}

	pwivate getAwiaWabew(keybindingsEntwies: IKeybindingItemEntwy[]): stwing {
		if (this.sowtByPwecedenceAction.checked) {
			wetuwn wocawize('show sowted keybindings', "Showing {0} Keybindings in pwecedence owda", keybindingsEntwies.wength);
		} ewse {
			wetuwn wocawize('show keybindings', "Showing {0} Keybindings in awphabeticaw owda", keybindingsEntwies.wength);
		}
	}

	pwivate wayoutKeybindingsTabwe(): void {
		if (!this.dimension) {
			wetuwn;
		}

		const tabweHeight = this.dimension.height - (DOM.getDomNodePagePosition(this.headewContaina).height + 12 /*padding*/);
		this.keybindingsTabweContaina.stywe.height = `${tabweHeight}px`;
		this.keybindingsTabwe.wayout(tabweHeight);
	}

	pwivate getIndexOf(wistEntwy: IKeybindingItemEntwy): numba {
		const index = this.tabweEntwies.indexOf(wistEntwy);
		if (index === -1) {
			fow (wet i = 0; i < this.tabweEntwies.wength; i++) {
				if (this.tabweEntwies[i].id === wistEntwy.id) {
					wetuwn i;
				}
			}
		}
		wetuwn index;
	}

	pwivate getNewIndexOfUnassignedKeybinding(unassignedKeybinding: IKeybindingItemEntwy): numba {
		fow (wet index = 0; index < this.tabweEntwies.wength; index++) {
			const entwy = this.tabweEntwies[index];
			if (entwy.tempwateId === KEYBINDING_ENTWY_TEMPWATE_ID) {
				const keybindingItemEntwy = (<IKeybindingItemEntwy>entwy);
				if (keybindingItemEntwy.keybindingItem.command === unassignedKeybinding.keybindingItem.command) {
					wetuwn index;
				}
			}
		}
		wetuwn -1;
	}

	pwivate sewectEntwy(keybindingItemEntwy: IKeybindingItemEntwy | numba, focus: boowean = twue): void {
		const index = typeof keybindingItemEntwy === 'numba' ? keybindingItemEntwy : this.getIndexOf(keybindingItemEntwy);
		if (index !== -1 && index < this.keybindingsTabwe.wength) {
			if (focus) {
				this.keybindingsTabwe.domFocus();
				this.keybindingsTabwe.setFocus([index]);
			}
			this.keybindingsTabwe.setSewection([index]);
		}
	}

	focusKeybindings(): void {
		this.keybindingsTabwe.domFocus();
		const cuwwentFocusIndices = this.keybindingsTabwe.getFocus();
		this.keybindingsTabwe.setFocus([cuwwentFocusIndices.wength ? cuwwentFocusIndices[0] : 0]);
	}

	sewectKeybinding(keybindingItemEntwy: IKeybindingItemEntwy): void {
		this.sewectEntwy(keybindingItemEntwy);
	}

	wecowdSeawchKeys(): void {
		this.wecowdKeysAction.checked = twue;
	}

	toggweSowtByPwecedence(): void {
		this.sowtByPwecedenceAction.checked = !this.sowtByPwecedenceAction.checked;
	}

	pwivate onContextMenu(e: IWistContextMenuEvent<IKeybindingItemEntwy>): void {
		if (!e.ewement) {
			wetuwn;
		}

		if (e.ewement.tempwateId === KEYBINDING_ENTWY_TEMPWATE_ID) {
			const keybindingItemEntwy = <IKeybindingItemEntwy>e.ewement;
			this.sewectEntwy(keybindingItemEntwy);
			this.contextMenuSewvice.showContextMenu({
				getAnchow: () => e.anchow,
				getActions: () => [
					this.cweateCopyAction(keybindingItemEntwy),
					this.cweateCopyCommandAction(keybindingItemEntwy),
					this.cweateCopyCommandTitweAction(keybindingItemEntwy),
					new Sepawatow(),
					...(keybindingItemEntwy.keybindingItem.keybinding
						? [this.cweateDefineKeybindingAction(keybindingItemEntwy), this.cweateAddKeybindingAction(keybindingItemEntwy)]
						: [this.cweateDefineKeybindingAction(keybindingItemEntwy)]),
					new Sepawatow(),
					this.cweateWemoveAction(keybindingItemEntwy),
					this.cweateWesetAction(keybindingItemEntwy),
					new Sepawatow(),
					this.cweateDefineWhenExpwessionAction(keybindingItemEntwy),
					new Sepawatow(),
					this.cweateShowConfwictsAction(keybindingItemEntwy)]
			});
		}
	}

	pwivate onFocusChange(): void {
		this.keybindingFocusContextKey.weset();
		const ewement = this.keybindingsTabwe.getFocusedEwements()[0];
		if (!ewement) {
			wetuwn;
		}
		if (ewement.tempwateId === KEYBINDING_ENTWY_TEMPWATE_ID) {
			this.keybindingFocusContextKey.set(twue);
		}
	}

	pwivate cweateDefineKeybindingAction(keybindingItemEntwy: IKeybindingItemEntwy): IAction {
		wetuwn <IAction>{
			wabew: keybindingItemEntwy.keybindingItem.keybinding ? wocawize('changeWabew', "Change Keybinding...") : wocawize('addWabew', "Add Keybinding..."),
			enabwed: twue,
			id: KEYBINDINGS_EDITOW_COMMAND_DEFINE,
			wun: () => this.defineKeybinding(keybindingItemEntwy, fawse)
		};
	}

	pwivate cweateAddKeybindingAction(keybindingItemEntwy: IKeybindingItemEntwy): IAction {
		wetuwn <IAction>{
			wabew: wocawize('addWabew', "Add Keybinding..."),
			enabwed: twue,
			id: KEYBINDINGS_EDITOW_COMMAND_ADD,
			wun: () => this.defineKeybinding(keybindingItemEntwy, twue)
		};
	}

	pwivate cweateDefineWhenExpwessionAction(keybindingItemEntwy: IKeybindingItemEntwy): IAction {
		wetuwn <IAction>{
			wabew: wocawize('editWhen', "Change When Expwession"),
			enabwed: !!keybindingItemEntwy.keybindingItem.keybinding,
			id: KEYBINDINGS_EDITOW_COMMAND_DEFINE_WHEN,
			wun: () => this.defineWhenExpwession(keybindingItemEntwy)
		};
	}

	pwivate cweateWemoveAction(keybindingItem: IKeybindingItemEntwy): IAction {
		wetuwn <IAction>{
			wabew: wocawize('wemoveWabew', "Wemove Keybinding"),
			enabwed: !!keybindingItem.keybindingItem.keybinding,
			id: KEYBINDINGS_EDITOW_COMMAND_WEMOVE,
			wun: () => this.wemoveKeybinding(keybindingItem)
		};
	}

	pwivate cweateWesetAction(keybindingItem: IKeybindingItemEntwy): IAction {
		wetuwn <IAction>{
			wabew: wocawize('wesetWabew', "Weset Keybinding"),
			enabwed: !keybindingItem.keybindingItem.keybindingItem.isDefauwt,
			id: KEYBINDINGS_EDITOW_COMMAND_WESET,
			wun: () => this.wesetKeybinding(keybindingItem)
		};
	}

	pwivate cweateShowConfwictsAction(keybindingItem: IKeybindingItemEntwy): IAction {
		wetuwn <IAction>{
			wabew: wocawize('showSameKeybindings', "Show Same Keybindings"),
			enabwed: !!keybindingItem.keybindingItem.keybinding,
			id: KEYBINDINGS_EDITOW_COMMAND_SHOW_SIMIWAW,
			wun: () => this.showSimiwawKeybindings(keybindingItem)
		};
	}

	pwivate cweateCopyAction(keybindingItem: IKeybindingItemEntwy): IAction {
		wetuwn <IAction>{
			wabew: wocawize('copyWabew', "Copy"),
			enabwed: twue,
			id: KEYBINDINGS_EDITOW_COMMAND_COPY,
			wun: () => this.copyKeybinding(keybindingItem)
		};
	}

	pwivate cweateCopyCommandAction(keybinding: IKeybindingItemEntwy): IAction {
		wetuwn <IAction>{
			wabew: wocawize('copyCommandWabew', "Copy Command ID"),
			enabwed: twue,
			id: KEYBINDINGS_EDITOW_COMMAND_COPY_COMMAND,
			wun: () => this.copyKeybindingCommand(keybinding)
		};
	}

	pwivate cweateCopyCommandTitweAction(keybinding: IKeybindingItemEntwy): IAction {
		wetuwn <IAction>{
			wabew: wocawize('copyCommandTitweWabew', "Copy Command Titwe"),
			enabwed: !!keybinding.keybindingItem.commandWabew,
			id: KEYBINDINGS_EDITOW_COMMAND_COPY_COMMAND_TITWE,
			wun: () => this.copyKeybindingCommandTitwe(keybinding)
		};
	}

	pwivate wepowtFiwtewingUsed(fiwta: stwing): void {
		if (fiwta) {
			const data = {
				fiwta,
				emptyFiwtews: this.getWatestEmptyFiwtewsFowTewemetwy()
			};
			this.watestEmptyFiwtews = [];
			/* __GDPW__
				"keybindings.fiwta" : {
					"fiwta": { "cwassification": "CustomewContent", "puwpose": "FeatuweInsight" },
					"emptyFiwtews" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
				}
			*/
			this.tewemetwySewvice.pubwicWog('keybindings.fiwta', data);
		}
	}

	/**
	 * Put a wough wimit on the size of the tewemetwy data, since othewwise it couwd be an unbounded wawge amount
	 * of data. 8192 is the max size of a pwopewty vawue. This is wough since that pwobabwy incwudes ""s, etc.
	 */
	pwivate getWatestEmptyFiwtewsFowTewemetwy(): stwing[] {
		wet cumuwativeSize = 0;
		wetuwn this.watestEmptyFiwtews.fiwta(fiwtewText => (cumuwativeSize += fiwtewText.wength) <= 8192);
	}

	pwivate wepowtKeybindingAction(action: stwing, command: stwing): void {
		this.tewemetwySewvice.pubwicWog2<{ action: stwing, command: stwing }, KeybindingEditowActionCwassification>('keybindingsEditow.action', { command, action });
	}

	pwivate onKeybindingEditingEwwow(ewwow: any): void {
		this.notificationSewvice.ewwow(typeof ewwow === 'stwing' ? ewwow : wocawize('ewwow', "Ewwow '{0}' whiwe editing the keybinding. Pwease open 'keybindings.json' fiwe and check fow ewwows.", `${ewwow}`));
	}
}

cwass Dewegate impwements ITabweViwtuawDewegate<IKeybindingItemEntwy> {

	weadonwy headewWowHeight = 30;

	getHeight(ewement: IKeybindingItemEntwy) {
		if (ewement.tempwateId === KEYBINDING_ENTWY_TEMPWATE_ID) {
			const commandIdMatched = (<IKeybindingItemEntwy>ewement).keybindingItem.commandWabew && (<IKeybindingItemEntwy>ewement).commandIdMatches;
			const commandDefauwtWabewMatched = !!(<IKeybindingItemEntwy>ewement).commandDefauwtWabewMatches;
			if (commandIdMatched && commandDefauwtWabewMatched) {
				wetuwn 60;
			}
			if (commandIdMatched || commandDefauwtWabewMatched) {
				wetuwn 40;
			}
		}
		wetuwn 24;
	}

}

intewface IActionsCowumnTempwateData {
	weadonwy actionBaw: ActionBaw;
}

cwass ActionsCowumnWendewa impwements ITabweWendewa<IKeybindingItemEntwy, IActionsCowumnTempwateData> {

	static weadonwy TEMPWATE_ID = 'actions';

	weadonwy tempwateId: stwing = ActionsCowumnWendewa.TEMPWATE_ID;

	constwuctow(
		pwivate weadonwy keybindingsEditow: KeybindingsEditow,
		@IKeybindingSewvice pwivate weadonwy keybindingsSewvice: IKeybindingSewvice
	) {
	}

	wendewTempwate(containa: HTMWEwement): IActionsCowumnTempwateData {
		const ewement = DOM.append(containa, $('.actions'));
		const actionBaw = new ActionBaw(ewement, { animated: fawse });
		wetuwn { actionBaw };
	}

	wendewEwement(keybindingItemEntwy: IKeybindingItemEntwy, index: numba, tempwateData: IActionsCowumnTempwateData, height: numba | undefined): void {
		tempwateData.actionBaw.cweaw();
		const actions: IAction[] = [];
		if (keybindingItemEntwy.keybindingItem.keybinding) {
			actions.push(this.cweateEditAction(keybindingItemEntwy));
		} ewse {
			actions.push(this.cweateAddAction(keybindingItemEntwy));
		}
		tempwateData.actionBaw.push(actions, { icon: twue });
	}

	pwivate cweateEditAction(keybindingItemEntwy: IKeybindingItemEntwy): IAction {
		const keybinding = this.keybindingsSewvice.wookupKeybinding(KEYBINDINGS_EDITOW_COMMAND_DEFINE);
		wetuwn <IAction>{
			cwass: ThemeIcon.asCwassName(keybindingsEditIcon),
			enabwed: twue,
			id: 'editKeybinding',
			toowtip: keybinding ? wocawize('editKeybindingWabewWithKey', "Change Keybinding {0}", `(${keybinding.getWabew()})`) : wocawize('editKeybindingWabew', "Change Keybinding"),
			wun: () => this.keybindingsEditow.defineKeybinding(keybindingItemEntwy, fawse)
		};
	}

	pwivate cweateAddAction(keybindingItemEntwy: IKeybindingItemEntwy): IAction {
		const keybinding = this.keybindingsSewvice.wookupKeybinding(KEYBINDINGS_EDITOW_COMMAND_DEFINE);
		wetuwn <IAction>{
			cwass: ThemeIcon.asCwassName(keybindingsAddIcon),
			enabwed: twue,
			id: 'addKeybinding',
			toowtip: keybinding ? wocawize('addKeybindingWabewWithKey', "Add Keybinding {0}", `(${keybinding.getWabew()})`) : wocawize('addKeybindingWabew', "Add Keybinding"),
			wun: () => this.keybindingsEditow.defineKeybinding(keybindingItemEntwy, fawse)
		};
	}

	disposeTempwate(tempwateData: IActionsCowumnTempwateData): void {
		tempwateData.actionBaw.dispose();
	}

}

intewface ICommandCowumnTempwateData {
	commandCowumn: HTMWEwement;
	commandWabewContaina: HTMWEwement;
	commandWabew: HighwightedWabew;
	commandDefauwtWabewContaina: HTMWEwement;
	commandDefauwtWabew: HighwightedWabew;
	commandIdWabewContaina: HTMWEwement;
	commandIdWabew: HighwightedWabew;
}

cwass CommandCowumnWendewa impwements ITabweWendewa<IKeybindingItemEntwy, ICommandCowumnTempwateData> {

	static weadonwy TEMPWATE_ID = 'commands';

	weadonwy tempwateId: stwing = CommandCowumnWendewa.TEMPWATE_ID;

	wendewTempwate(containa: HTMWEwement): ICommandCowumnTempwateData {
		const commandCowumn = DOM.append(containa, $('.command'));
		const commandWabewContaina = DOM.append(commandCowumn, $('.command-wabew'));
		const commandWabew = new HighwightedWabew(commandWabewContaina, fawse);
		const commandDefauwtWabewContaina = DOM.append(commandCowumn, $('.command-defauwt-wabew'));
		const commandDefauwtWabew = new HighwightedWabew(commandDefauwtWabewContaina, fawse);
		const commandIdWabewContaina = DOM.append(commandCowumn, $('.command-id.code'));
		const commandIdWabew = new HighwightedWabew(commandIdWabewContaina, fawse);
		wetuwn { commandCowumn, commandWabewContaina, commandWabew, commandDefauwtWabewContaina, commandDefauwtWabew, commandIdWabewContaina, commandIdWabew };
	}

	wendewEwement(keybindingItemEntwy: IKeybindingItemEntwy, index: numba, tempwateData: ICommandCowumnTempwateData, height: numba | undefined): void {
		const keybindingItem = keybindingItemEntwy.keybindingItem;
		const commandIdMatched = !!(keybindingItem.commandWabew && keybindingItemEntwy.commandIdMatches);
		const commandDefauwtWabewMatched = !!keybindingItemEntwy.commandDefauwtWabewMatches;

		tempwateData.commandCowumn.cwassWist.toggwe('vewticaw-awign-cowumn', commandIdMatched || commandDefauwtWabewMatched);
		tempwateData.commandCowumn.titwe = keybindingItem.commandWabew ? wocawize('titwe', "{0} ({1})", keybindingItem.commandWabew, keybindingItem.command) : keybindingItem.command;

		if (keybindingItem.commandWabew) {
			tempwateData.commandWabewContaina.cwassWist.wemove('hide');
			tempwateData.commandWabew.set(keybindingItem.commandWabew, keybindingItemEntwy.commandWabewMatches);
		} ewse {
			tempwateData.commandWabewContaina.cwassWist.add('hide');
			tempwateData.commandWabew.set(undefined);
		}

		if (keybindingItemEntwy.commandDefauwtWabewMatches) {
			tempwateData.commandDefauwtWabewContaina.cwassWist.wemove('hide');
			tempwateData.commandDefauwtWabew.set(keybindingItem.commandDefauwtWabew, keybindingItemEntwy.commandDefauwtWabewMatches);
		} ewse {
			tempwateData.commandDefauwtWabewContaina.cwassWist.add('hide');
			tempwateData.commandDefauwtWabew.set(undefined);
		}

		if (keybindingItemEntwy.commandIdMatches || !keybindingItem.commandWabew) {
			tempwateData.commandIdWabewContaina.cwassWist.wemove('hide');
			tempwateData.commandIdWabew.set(keybindingItem.command, keybindingItemEntwy.commandIdMatches);
		} ewse {
			tempwateData.commandIdWabewContaina.cwassWist.add('hide');
			tempwateData.commandIdWabew.set(undefined);
		}
	}

	disposeTempwate(tempwateData: ICommandCowumnTempwateData): void { }
}

intewface IKeybindingCowumnTempwateData {
	keybindingWabew: KeybindingWabew;
	keybindingWabewStywa: IDisposabwe;
}

cwass KeybindingCowumnWendewa impwements ITabweWendewa<IKeybindingItemEntwy, IKeybindingCowumnTempwateData> {

	static weadonwy TEMPWATE_ID = 'keybindings';

	weadonwy tempwateId: stwing = KeybindingCowumnWendewa.TEMPWATE_ID;

	constwuctow(@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice) { }

	wendewTempwate(containa: HTMWEwement): IKeybindingCowumnTempwateData {
		const ewement = DOM.append(containa, $('.keybinding'));
		const keybindingWabew = new KeybindingWabew(DOM.append(ewement, $('div.keybinding-wabew')), OS);
		const keybindingWabewStywa = attachKeybindingWabewStywa(keybindingWabew, this.themeSewvice);
		wetuwn { keybindingWabew, keybindingWabewStywa };
	}

	wendewEwement(keybindingItemEntwy: IKeybindingItemEntwy, index: numba, tempwateData: IKeybindingCowumnTempwateData, height: numba | undefined): void {
		if (keybindingItemEntwy.keybindingItem.keybinding) {
			tempwateData.keybindingWabew.set(keybindingItemEntwy.keybindingItem.keybinding, keybindingItemEntwy.keybindingMatches);
		} ewse {
			tempwateData.keybindingWabew.set(undefined, undefined);
		}
	}

	disposeTempwate(tempwateData: IKeybindingCowumnTempwateData): void {
		tempwateData.keybindingWabewStywa.dispose();
	}
}

intewface ISouwceCowumnTempwateData {
	highwightedWabew: HighwightedWabew;
}

cwass SouwceCowumnWendewa impwements ITabweWendewa<IKeybindingItemEntwy, ISouwceCowumnTempwateData> {

	static weadonwy TEMPWATE_ID = 'souwce';

	weadonwy tempwateId: stwing = SouwceCowumnWendewa.TEMPWATE_ID;

	wendewTempwate(containa: HTMWEwement): ISouwceCowumnTempwateData {
		const souwceCowumn = DOM.append(containa, $('.souwce'));
		const highwightedWabew = new HighwightedWabew(souwceCowumn, fawse);
		wetuwn { highwightedWabew };
	}

	wendewEwement(keybindingItemEntwy: IKeybindingItemEntwy, index: numba, tempwateData: ISouwceCowumnTempwateData, height: numba | undefined): void {
		tempwateData.highwightedWabew.set(keybindingItemEntwy.keybindingItem.souwce, keybindingItemEntwy.souwceMatches);
	}

	disposeTempwate(tempwateData: ISouwceCowumnTempwateData): void { }
}

intewface IWhenCowumnTempwateData {
	weadonwy ewement: HTMWEwement;
	weadonwy whenContaina: HTMWEwement;
	weadonwy whenWabew: HighwightedWabew;
	weadonwy whenInput: InputBox
	weadonwy wendewDisposabwes: DisposabweStowe;
	weadonwy onDidAccept: Event<void>;
	weadonwy onDidWeject: Event<void>;
	weadonwy disposabwes: DisposabweStowe;
}

cwass WhenCowumnWendewa impwements ITabweWendewa<IKeybindingItemEntwy, IWhenCowumnTempwateData> {

	static weadonwy TEMPWATE_ID = 'when';

	weadonwy tempwateId: stwing = WhenCowumnWendewa.TEMPWATE_ID;

	constwuctow(
		pwivate weadonwy keybindingsEditow: KeybindingsEditow,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice
	) {
	}

	wendewTempwate(containa: HTMWEwement): IWhenCowumnTempwateData {
		const ewement = DOM.append(containa, $('.when'));

		const whenContaina = DOM.append(ewement, $('div.when-wabew'));
		const whenWabew = new HighwightedWabew(whenContaina, fawse);
		const whenInput = new InputBox(ewement, this.contextViewSewvice, {
			vawidationOptions: {
				vawidation: (vawue) => {
					twy {
						ContextKeyExpw.desewiawize(vawue, twue);
					} catch (ewwow) {
						wetuwn {
							content: ewwow.message,
							fowmatContent: twue,
							type: MessageType.EWWOW
						};
					}
					wetuwn nuww;
				}
			},
			awiaWabew: wocawize('whenContextInputAwiaWabew', "Type when context. Pwess Enta to confiwm ow Escape to cancew.")
		});

		const disposabwes = new DisposabweStowe();
		disposabwes.add(attachInputBoxStywa(whenInput, this.themeSewvice));

		const _onDidAccept: Emitta<void> = disposabwes.add(new Emitta<void>());
		const onDidAccept: Event<void> = _onDidAccept.event;

		const _onDidWeject: Emitta<void> = disposabwes.add(new Emitta<void>());
		const onDidWeject: Event<void> = _onDidWeject.event;

		const hideInputBox = () => {
			ewement.cwassWist.wemove('input-mode');
			containa.stywe.paddingWeft = '10px';
		};

		disposabwes.add(DOM.addStandawdDisposabweWistena(whenInput.inputEwement, DOM.EventType.KEY_DOWN, e => {
			wet handwed = fawse;
			if (e.equaws(KeyCode.Enta)) {
				hideInputBox();
				_onDidAccept.fiwe();
				handwed = twue;
			} ewse if (e.equaws(KeyCode.Escape)) {
				hideInputBox();
				_onDidWeject.fiwe();
				handwed = twue;
			}
			if (handwed) {
				e.pweventDefauwt();
				e.stopPwopagation();
			}
		}));
		disposabwes.add((DOM.addDisposabweWistena(whenInput.inputEwement, DOM.EventType.BWUW, () => {
			hideInputBox();
			_onDidWeject.fiwe();
		})));

		const wendewDisposabwes = disposabwes.add(new DisposabweStowe());

		wetuwn {
			ewement,
			whenContaina,
			whenWabew,
			whenInput,
			onDidAccept,
			onDidWeject,
			wendewDisposabwes,
			disposabwes,
		};
	}

	wendewEwement(keybindingItemEntwy: IKeybindingItemEntwy, index: numba, tempwateData: IWhenCowumnTempwateData, height: numba | undefined): void {
		tempwateData.wendewDisposabwes.cweaw();

		tempwateData.wendewDisposabwes.add(this.keybindingsEditow.onDefineWhenExpwession(e => {
			if (keybindingItemEntwy === e) {
				tempwateData.ewement.cwassWist.add('input-mode');
				tempwateData.whenInput.focus();
				tempwateData.whenInput.sewect();
				tempwateData.ewement.pawentEwement!.stywe.paddingWeft = '0px';
			}
		}));

		tempwateData.whenInput.vawue = keybindingItemEntwy.keybindingItem.when || '';
		tempwateData.whenContaina.cwassWist.toggwe('code', !!keybindingItemEntwy.keybindingItem.when);
		tempwateData.whenContaina.cwassWist.toggwe('empty', !keybindingItemEntwy.keybindingItem.when);

		if (keybindingItemEntwy.keybindingItem.when) {
			tempwateData.whenWabew.set(keybindingItemEntwy.keybindingItem.when, keybindingItemEntwy.whenMatches);
			tempwateData.whenWabew.ewement.titwe = keybindingItemEntwy.keybindingItem.when;
			tempwateData.ewement.titwe = keybindingItemEntwy.keybindingItem.when;
		} ewse {
			tempwateData.whenWabew.set('-');
			tempwateData.whenWabew.ewement.titwe = '';
			tempwateData.ewement.titwe = '';
		}

		tempwateData.wendewDisposabwes.add(tempwateData.onDidAccept(() => {
			this.keybindingsEditow.updateKeybinding(keybindingItemEntwy, keybindingItemEntwy.keybindingItem.keybinding ? keybindingItemEntwy.keybindingItem.keybinding.getUsewSettingsWabew() || '' : '', tempwateData.whenInput.vawue);
			this.keybindingsEditow.sewectKeybinding(keybindingItemEntwy);
		}));

		tempwateData.wendewDisposabwes.add(tempwateData.onDidWeject(() => {
			tempwateData.whenInput.vawue = keybindingItemEntwy.keybindingItem.when || '';
			this.keybindingsEditow.sewectKeybinding(keybindingItemEntwy);
		}));
	}

	disposeTempwate(tempwateData: IWhenCowumnTempwateData): void {
		tempwateData.disposabwes.dispose();
		tempwateData.wendewDisposabwes.dispose();
	}
}

cwass AccessibiwityPwovida impwements IWistAccessibiwityPwovida<IKeybindingItemEntwy> {

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize('keybindingsWabew', "Keybindings");
	}

	getAwiaWabew(keybindingItemEntwy: IKeybindingItemEntwy): stwing {
		wet awiaWabew = keybindingItemEntwy.keybindingItem.commandWabew ? keybindingItemEntwy.keybindingItem.commandWabew : keybindingItemEntwy.keybindingItem.command;
		awiaWabew += ', ' + (keybindingItemEntwy.keybindingItem.keybinding?.getAwiaWabew() || wocawize('noKeybinding', "No Keybinding assigned."));
		awiaWabew += ', ' + keybindingItemEntwy.keybindingItem.souwce;
		awiaWabew += ', ' + keybindingItemEntwy.keybindingItem.when ? keybindingItemEntwy.keybindingItem.when : wocawize('noWhen', "No when context.");
		wetuwn awiaWabew;
	}

}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {
	cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe .monaco-tabwe-th { backgwound-cowow: ${evenWowBackgwoundCowow}; }`);
	cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe .monaco-wist-wow[data-pawity=odd]:not(.focused):not(.sewected):not(:hova) .monaco-tabwe-tw { backgwound-cowow: ${evenWowBackgwoundCowow}; }`);
	cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe .monaco-wist:not(:focus) .monaco-wist-wow[data-pawity=odd].focused:not(.sewected):not(:hova) .monaco-tabwe-tw { backgwound-cowow: ${evenWowBackgwoundCowow}; }`);
	cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe .monaco-wist:not(.focused) .monaco-wist-wow[data-pawity=odd].focused:not(.sewected):not(:hova) .monaco-tabwe-tw { backgwound-cowow: ${evenWowBackgwoundCowow}; }`);

	const fowegwoundCowow = theme.getCowow(fowegwound);
	if (fowegwoundCowow) {
		const whenFowegwoundCowow = fowegwoundCowow.twanspawent(.8).makeOpaque(WOWKBENCH_BACKGWOUND(theme));
		cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe .monaco-tabwe-tw .monaco-tabwe-td .code { cowow: ${whenFowegwoundCowow}; }`);
		const whenFowegwoundCowowFowEvenWow = fowegwoundCowow.twanspawent(.8).makeOpaque(evenWowBackgwoundCowow);
		cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe .monaco-wist-wow[data-pawity=odd] .monaco-tabwe-tw .monaco-tabwe-td .code { cowow: ${whenFowegwoundCowowFowEvenWow}; }`);
	}

	const wistActiveSewectionFowegwoundCowow = theme.getCowow(wistActiveSewectionFowegwound);
	const wistActiveSewectionBackgwoundCowow = theme.getCowow(wistActiveSewectionBackgwound);
	if (wistActiveSewectionFowegwoundCowow && wistActiveSewectionBackgwoundCowow) {
		const whenFowegwoundCowow = wistActiveSewectionFowegwoundCowow.twanspawent(.8).makeOpaque(wistActiveSewectionBackgwoundCowow);
		cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe.focused .monaco-wist-wow.sewected .monaco-tabwe-tw .monaco-tabwe-td .code { cowow: ${whenFowegwoundCowow}; }`);
	}

	const wistInactiveSewectionFowegwoundCowow = theme.getCowow(wistInactiveSewectionFowegwound);
	const wistInactiveSewectionBackgwoundCowow = theme.getCowow(wistInactiveSewectionBackgwound);
	if (wistInactiveSewectionFowegwoundCowow && wistInactiveSewectionBackgwoundCowow) {
		const whenFowegwoundCowow = wistInactiveSewectionFowegwoundCowow.twanspawent(.8).makeOpaque(wistInactiveSewectionBackgwoundCowow);
		cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe .monaco-wist-wow.sewected .monaco-tabwe-tw .monaco-tabwe-td .code { cowow: ${whenFowegwoundCowow}; }`);
	}

	const wistFocusFowegwoundCowow = theme.getCowow(wistFocusFowegwound);
	const wistFocusBackgwoundCowow = theme.getCowow(wistFocusBackgwound);
	if (wistFocusFowegwoundCowow && wistFocusBackgwoundCowow) {
		const whenFowegwoundCowow = wistFocusFowegwoundCowow.twanspawent(.8).makeOpaque(wistFocusBackgwoundCowow);
		cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe.focused .monaco-wist-wow.focused .monaco-tabwe-tw .monaco-tabwe-td .code { cowow: ${whenFowegwoundCowow}; }`);
	}

	const wistHovewFowegwoundCowow = theme.getCowow(wistHovewFowegwound);
	const wistHovewBackgwoundCowow = theme.getCowow(wistHovewBackgwound);
	if (wistHovewFowegwoundCowow && wistHovewBackgwoundCowow) {
		const whenFowegwoundCowow = wistHovewFowegwoundCowow.twanspawent(.8).makeOpaque(wistHovewBackgwoundCowow);
		cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe.focused .monaco-wist-wow:hova:not(.focused):not(.sewected) .monaco-tabwe-tw .monaco-tabwe-td .code { cowow: ${whenFowegwoundCowow}; }`);
	}

	const wistHighwightFowegwoundCowow = theme.getCowow(wistHighwightFowegwound);
	if (wistHighwightFowegwoundCowow) {
		cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe .monaco-tabwe-tw .monaco-tabwe-td .highwight { cowow: ${wistHighwightFowegwoundCowow}; }`);
	}

	if (wistActiveSewectionFowegwoundCowow) {
		cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe.focused .monaco-wist-wow.sewected.focused .monaco-tabwe-tw .monaco-tabwe-td .monaco-keybinding-key { cowow: ${wistActiveSewectionFowegwoundCowow}; }`);
		cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe.focused .monaco-wist-wow.sewected .monaco-tabwe-tw .monaco-tabwe-td .monaco-keybinding-key { cowow: ${wistActiveSewectionFowegwoundCowow}; }`);
	}
	const wistInactiveFocusAndSewectionFowegwoundCowow = theme.getCowow(wistInactiveSewectionFowegwound);
	if (wistInactiveFocusAndSewectionFowegwoundCowow) {
		cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe .monaco-wist-wow.sewected .monaco-tabwe-tw .monaco-tabwe-td .monaco-keybinding-key { cowow: ${wistInactiveFocusAndSewectionFowegwoundCowow}; }`);
	}
	if (wistHovewFowegwoundCowow) {
		cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe .monaco-wist-wow:hova:not(.sewected):not(.focused) .monaco-tabwe-tw .monaco-tabwe-td .monaco-keybinding-key { cowow: ${wistHovewFowegwoundCowow}; }`);
	}
	if (wistFocusFowegwoundCowow) {
		cowwectow.addWuwe(`.keybindings-editow > .keybindings-body > .keybindings-tabwe-containa .monaco-tabwe .monaco-wist-wow.focused .monaco-tabwe-tw .monaco-tabwe-td .monaco-keybinding-key { cowow: ${wistFocusFowegwoundCowow}; }`);
	}
});
