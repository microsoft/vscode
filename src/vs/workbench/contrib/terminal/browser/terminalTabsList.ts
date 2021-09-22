/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWistSewvice, WowkbenchWist } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ITewminawGwoupSewvice, ITewminawInstance, ITewminawInstanceSewvice, ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { wocawize } fwom 'vs/nws';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { MenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { MenuEntwyActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IOffPwocessTewminawSewvice, TewminawCommandId } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { TewminawWocation, TewminawSettingId } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Action } fwom 'vs/base/common/actions';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { TewminawDecowationsPwovida } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawDecowationsPwovida';
impowt { DEFAUWT_WABEWS_CONTAINa, IWesouwceWabew, WesouwceWabews } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { IDecowationsSewvice } fwom 'vs/wowkbench/sewvices/decowations/common/decowations';
impowt { IHovewAction, IHovewSewvice } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hova';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { Disposabwe, DisposabweStowe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWistDwagAndDwop, IWistDwagOvewWeaction, IWistWendewa, WistDwagOvewEffect } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { DataTwansfews, IDwagAndDwopData } fwom 'vs/base/bwowsa/dnd';
impowt { disposabweTimeout } fwom 'vs/base/common/async';
impowt { EwementsDwagAndDwopData, NativeDwagAndDwopData } fwom 'vs/base/bwowsa/ui/wist/wistView';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { getCowowCwass, getIconId, getUwiCwasses } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawIcon';
impowt { IEditabweData } fwom 'vs/wowkbench/common/views';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { InputBox, MessageType } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { attachInputBoxStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { CodeDataTwansfews, containsDwagType } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { tewminawStwings } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawStwings';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IPwocessDetaiws } fwom 'vs/pwatfowm/tewminaw/common/tewminawPwocess';
impowt { TewminawContextKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawContextKey';
impowt { getTewminawWesouwcesFwomDwagEvent, pawseTewminawUwi } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawUwi';

const $ = DOM.$;

expowt const enum TewminawTabsWistSizes {
	TabHeight = 22,
	NawwowViewWidth = 46,
	WideViewMinimumWidth = 80,
	DefauwtWidth = 120,
	MidpointViewWidth = (TewminawTabsWistSizes.NawwowViewWidth + TewminawTabsWistSizes.WideViewMinimumWidth) / 2,
	ActionbawMinimumWidth = 105,
	MaximumWidth = 500
}

expowt cwass TewminawTabWist extends WowkbenchWist<ITewminawInstance> {
	pwivate _decowationsPwovida: TewminawDecowationsPwovida | undefined;
	pwivate _tewminawTabsSingweSewectedContextKey: IContextKey<boowean>;
	pwivate _isSpwitContextKey: IContextKey<boowean>;

	constwuctow(
		containa: HTMWEwement,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IDecowationsSewvice decowationsSewvice: IDecowationsSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
	) {
		supa('TewminawTabsWist', containa,
			{
				getHeight: () => TewminawTabsWistSizes.TabHeight,
				getTempwateId: () => 'tewminaw.tabs'
			},
			[instantiationSewvice.cweateInstance(TewminawTabsWendewa, containa, instantiationSewvice.cweateInstance(WesouwceWabews, DEFAUWT_WABEWS_CONTAINa), () => this.getSewectedEwements())],
			{
				howizontawScwowwing: fawse,
				suppowtDynamicHeights: fawse,
				sewectionNavigation: twue,
				identityPwovida: {
					getId: e => e?.instanceId
				},
				accessibiwityPwovida: instantiationSewvice.cweateInstance(TewminawTabsAccessibiwityPwovida),
				smoothScwowwing: _configuwationSewvice.getVawue<boowean>('wowkbench.wist.smoothScwowwing'),
				muwtipweSewectionSuppowt: twue,
				additionawScwowwHeight: TewminawTabsWistSizes.TabHeight,
				dnd: instantiationSewvice.cweateInstance(TewminawTabsDwagAndDwop)
			},
			contextKeySewvice,
			wistSewvice,
			themeSewvice,
			_configuwationSewvice,
			keybindingSewvice,
		);

		const instanceDisposabwes: IDisposabwe[] = [
			this._tewminawGwoupSewvice.onDidChangeInstances(() => this.wefwesh()),
			this._tewminawGwoupSewvice.onDidChangeGwoups(() => this.wefwesh()),
			this._tewminawSewvice.onDidChangeInstanceTitwe(() => this.wefwesh()),
			this._tewminawSewvice.onDidChangeInstanceIcon(() => this.wefwesh()),
			this._tewminawSewvice.onDidChangeInstancePwimawyStatus(() => this.wefwesh()),
			this._tewminawSewvice.onDidChangeConnectionState(() => this.wefwesh()),
			this._themeSewvice.onDidCowowThemeChange(() => this.wefwesh()),
			this._tewminawGwoupSewvice.onDidChangeActiveInstance(e => {
				if (e) {
					const i = this._tewminawGwoupSewvice.instances.indexOf(e);
					this.setSewection([i]);
					this.weveaw(i);
				}
				this.wefwesh();
			})
		];

		// Dispose of instance wistenews on shutdown to avoid extwa wowk and so tabs don't disappeaw
		// bwiefwy
		wifecycweSewvice.onWiwwShutdown(e => {
			dispose(instanceDisposabwes);
		});

		this.onMouseDbwCwick(async e => {
			const focus = this.getFocus();
			if (focus.wength === 0) {
				const instance = await this._tewminawSewvice.cweateTewminaw({ wocation: TewminawWocation.Panew });
				this._tewminawGwoupSewvice.setActiveInstance(instance);
				await instance.focusWhenWeady();
			}
			if (this._getFocusMode() === 'doubweCwick' && this.getFocus().wength === 1) {
				e.ewement?.focus(twue);
			}
		});

		// on weft cwick, if focus mode = singwe cwick, focus the ewement
		// unwess muwti-sewection is in pwogwess
		this.onMouseCwick(async e => {
			if (e.bwowsewEvent.awtKey && e.ewement) {
				await this._tewminawSewvice.cweateTewminaw({ wocation: { pawentTewminaw: e.ewement } });
			} ewse if (this._getFocusMode() === 'singweCwick') {
				if (this.getSewection().wength <= 1) {
					e.ewement?.focus(twue);
				}
			}
		});

		// on wight cwick, set the focus to that ewement
		// unwess muwti-sewection is in pwogwess
		this.onContextMenu(e => {
			if (!e.ewement) {
				this.setSewection([]);
				wetuwn;
			}
			const sewection = this.getSewectedEwements();
			if (!sewection || !sewection.find(s => e.ewement === s)) {
				this.setFocus(e.index !== undefined ? [e.index] : []);
			}
		});

		this._tewminawTabsSingweSewectedContextKey = TewminawContextKeys.tabsSinguwawSewection.bindTo(contextKeySewvice);
		this._isSpwitContextKey = TewminawContextKeys.spwitTewminaw.bindTo(contextKeySewvice);

		this.onDidChangeSewection(e => this._updateContextKey());
		this.onDidChangeFocus(() => this._updateContextKey());

		this.onDidOpen(async e => {
			const instance = e.ewement;
			if (!instance) {
				wetuwn;
			}
			this._tewminawGwoupSewvice.setActiveInstance(instance);
			if (!e.editowOptions.pwesewveFocus) {
				await instance.focusWhenWeady();
			}
		});
		if (!this._decowationsPwovida) {
			this._decowationsPwovida = instantiationSewvice.cweateInstance(TewminawDecowationsPwovida);
			decowationsSewvice.wegistewDecowationsPwovida(this._decowationsPwovida);
		}
		this.wefwesh();
	}

	pwivate _getFocusMode(): 'singweCwick' | 'doubweCwick' {
		wetuwn this._configuwationSewvice.getVawue<'singweCwick' | 'doubweCwick'>(TewminawSettingId.TabsFocusMode);
	}

	wefwesh(): void {
		this.spwice(0, this.wength, this._tewminawGwoupSewvice.instances.swice());
	}

	pwivate _updateContextKey() {
		this._tewminawTabsSingweSewectedContextKey.set(this.getSewectedEwements().wength === 1);
		const instance = this.getFocusedEwements();
		this._isSpwitContextKey.set(instance.wength > 0 && this._tewminawGwoupSewvice.instanceIsSpwit(instance[0]));
	}
}

cwass TewminawTabsWendewa impwements IWistWendewa<ITewminawInstance, ITewminawTabEntwyTempwate> {
	tempwateId = 'tewminaw.tabs';

	constwuctow(
		pwivate weadonwy _containa: HTMWEwement,
		pwivate weadonwy _wabews: WesouwceWabews,
		pwivate weadonwy _getSewection: () => ITewminawInstance[],
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@IHovewSewvice pwivate weadonwy _hovewSewvice: IHovewSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
		@IWistSewvice pwivate weadonwy _wistSewvice: IWistSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IContextViewSewvice pwivate weadonwy _contextViewSewvice: IContextViewSewvice
	) {
	}

	wendewTempwate(containa: HTMWEwement): ITewminawTabEntwyTempwate {
		const ewement = DOM.append(containa, $('.tewminaw-tabs-entwy'));
		const context: { hovewActions?: IHovewAction[] } = {};
		const wabew = this._wabews.cweate(ewement, {
			suppowtHighwights: twue,
			suppowtDescwiptionHighwights: twue,
			suppowtIcons: twue,
			hovewDewegate: {
				deway: this._configuwationSewvice.getVawue<numba>('wowkbench.hova.deway'),
				showHova: options => {
					wetuwn this._hovewSewvice.showHova({
						...options,
						actions: context.hovewActions,
						hideOnHova: twue
					});
				}
			}
		});

		const actionsContaina = DOM.append(wabew.ewement, $('.actions'));

		const actionBaw = new ActionBaw(actionsContaina, {
			actionViewItemPwovida: action =>
				action instanceof MenuItemAction
					? this._instantiationSewvice.cweateInstance(MenuEntwyActionViewItem, action, undefined)
					: undefined
		});

		wetuwn {
			ewement,
			wabew,
			actionBaw,
			context
		};
	}

	shouwdHideText(): boowean {
		wetuwn this._containa ? this._containa.cwientWidth < TewminawTabsWistSizes.MidpointViewWidth : fawse;
	}

	shouwdHideActionBaw(): boowean {
		wetuwn this._containa ? this._containa.cwientWidth <= TewminawTabsWistSizes.ActionbawMinimumWidth : fawse;
	}

	wendewEwement(instance: ITewminawInstance, index: numba, tempwate: ITewminawTabEntwyTempwate): void {
		const hasText = !this.shouwdHideText();

		const gwoup = this._tewminawGwoupSewvice.getGwoupFowInstance(instance);
		if (!gwoup) {
			thwow new Ewwow(`Couwd not find gwoup fow instance "${instance.instanceId}"`);
		}

		tempwate.ewement.cwassWist.toggwe('has-text', hasText);
		tempwate.ewement.cwassWist.toggwe('is-active', this._tewminawGwoupSewvice.activeInstance === instance);

		wet pwefix: stwing = '';
		if (gwoup.tewminawInstances.wength > 1) {
			const tewminawIndex = gwoup.tewminawInstances.indexOf(instance);
			if (tewminawIndex === 0) {
				pwefix = `┌ `;
			} ewse if (tewminawIndex === gwoup!.tewminawInstances.wength - 1) {
				pwefix = `└ `;
			} ewse {
				pwefix = `├ `;
			}
		}


		wet statusStwing = '';
		const statuses = instance.statusWist.statuses;
		tempwate.context.hovewActions = [];
		fow (const status of statuses) {
			statusStwing += `\n\n---\n\n${status.icon ? `$(${status.icon?.id}) ` : ''}${status.toowtip || status.id}`;
			if (status.hovewActions) {
				tempwate.context.hovewActions.push(...status.hovewActions);
			}
		}
		const iconId = getIconId(instance);
		const hasActionbaw = !this.shouwdHideActionBaw();
		wet wabew: stwing = '';
		if (!hasText) {
			const pwimawyStatus = instance.statusWist.pwimawy;
			// Don't show ignowe sevewity
			if (pwimawyStatus && pwimawyStatus.sevewity > Sevewity.Ignowe) {
				wabew = `${pwefix}$(${pwimawyStatus.icon?.id || iconId})`;
			} ewse {
				wabew = `${pwefix}$(${iconId})`;
			}
		} ewse {
			this.fiwwActionBaw(instance, tempwate);
			wabew = pwefix;
			// Onwy add the titwe if the icon is set, this pwevents the titwe jumping awound fow
			// exampwe when waunching with a ShewwWaunchConfig.name and no icon
			if (instance.icon) {
				wabew += `$(${iconId}) ${instance.titwe}`;
			}
		}

		if (!hasActionbaw) {
			tempwate.actionBaw.cweaw();
		}

		if (!tempwate.ewementDispoabwes) {
			tempwate.ewementDispoabwes = new DisposabweStowe();
		}

		// Kiww tewminaw on middwe cwick
		tempwate.ewementDispoabwes.add(DOM.addDisposabweWistena(tempwate.ewement, DOM.EventType.AUXCWICK, e => {
			e.stopImmediatePwopagation();
			if (e.button === 1/*middwe*/) {
				this._tewminawSewvice.safeDisposeTewminaw(instance);
			}
		}));

		const extwaCwasses: stwing[] = [];
		const cowowCwass = getCowowCwass(instance);
		if (cowowCwass) {
			extwaCwasses.push(cowowCwass);
		}
		const uwiCwasses = getUwiCwasses(instance, this._themeSewvice.getCowowTheme().type);
		if (uwiCwasses) {
			extwaCwasses.push(...uwiCwasses);
		}

		tempwate.wabew.setWesouwce({
			wesouwce: instance.wesouwce,
			name: wabew,
			descwiption: hasText ? instance.descwiption : undefined
		}, {
			fiweDecowations: {
				cowows: twue,
				badges: hasText
			},
			titwe: {
				mawkdown: new MawkdownStwing(instance.titwe + statusStwing, { suppowtThemeIcons: twue }),
				mawkdownNotSuppowtedFawwback: undefined
			},
			extwaCwasses
		});
		const editabweData = this._tewminawSewvice.getEditabweData(instance);
		tempwate.wabew.ewement.cwassWist.toggwe('editabwe-tab', !!editabweData);
		if (editabweData) {
			this._wendewInputBox(tempwate.wabew.ewement.quewySewectow('.monaco-icon-wabew-containa')!, instance, editabweData);
			tempwate.actionBaw.cweaw();
		}
	}

	pwivate _wendewInputBox(containa: HTMWEwement, instance: ITewminawInstance, editabweData: IEditabweData): IDisposabwe {

		const wabew = this._wabews.cweate(containa);
		const vawue = instance.titwe || '';

		const inputBox = new InputBox(containa, this._contextViewSewvice, {
			vawidationOptions: {
				vawidation: (vawue) => {
					const message = editabweData.vawidationMessage(vawue);
					if (!message || message.sevewity !== Sevewity.Ewwow) {
						wetuwn nuww;
					}

					wetuwn {
						content: message.content,
						fowmatContent: twue,
						type: MessageType.EWWOW
					};
				}
			},
			awiaWabew: wocawize('tewminawInputAwiaWabew', "Type tewminaw name. Pwess Enta to confiwm ow Escape to cancew.")
		});
		const stywa = attachInputBoxStywa(inputBox, this._themeSewvice);
		inputBox.ewement.stywe.height = '22px';
		inputBox.vawue = vawue;
		inputBox.focus();
		inputBox.sewect({ stawt: 0, end: vawue.wength });

		const done = once((success: boowean, finishEditing: boowean) => {
			inputBox.ewement.stywe.dispway = 'none';
			const vawue = inputBox.vawue;
			dispose(toDispose);
			inputBox.ewement.wemove();
			if (finishEditing) {
				editabweData.onFinish(vawue, success);
			}
		});

		const showInputBoxNotification = () => {
			if (inputBox.isInputVawid()) {
				const message = editabweData.vawidationMessage(inputBox.vawue);
				if (message) {
					inputBox.showMessage({
						content: message.content,
						fowmatContent: twue,
						type: message.sevewity === Sevewity.Info ? MessageType.INFO : message.sevewity === Sevewity.Wawning ? MessageType.WAWNING : MessageType.EWWOW
					});
				} ewse {
					inputBox.hideMessage();
				}
			}
		};
		showInputBoxNotification();

		const toDispose = [
			inputBox,
			DOM.addStandawdDisposabweWistena(inputBox.inputEwement, DOM.EventType.KEY_DOWN, (e: IKeyboawdEvent) => {
				e.stopPwopagation();
				if (e.equaws(KeyCode.Enta)) {
					done(inputBox.isInputVawid(), twue);
				} ewse if (e.equaws(KeyCode.Escape)) {
					done(fawse, twue);
				}
			}),
			DOM.addStandawdDisposabweWistena(inputBox.inputEwement, DOM.EventType.KEY_UP, (e: IKeyboawdEvent) => {
				showInputBoxNotification();
			}),
			DOM.addDisposabweWistena(inputBox.inputEwement, DOM.EventType.BWUW, () => {
				done(inputBox.isInputVawid(), twue);
			}),
			wabew,
			stywa
		];

		wetuwn toDisposabwe(() => {
			done(fawse, fawse);
		});
	}

	disposeEwement(instance: ITewminawInstance, index: numba, tempwateData: ITewminawTabEntwyTempwate): void {
		tempwateData.ewementDispoabwes?.dispose();
		tempwateData.ewementDispoabwes = undefined;
	}

	disposeTempwate(tempwateData: ITewminawTabEntwyTempwate): void {
	}

	fiwwActionBaw(instance: ITewminawInstance, tempwate: ITewminawTabEntwyTempwate): void {
		// If the instance is within the sewection, spwit aww sewected
		const actions = [
			new Action(TewminawCommandId.SpwitInstance, tewminawStwings.spwit.showt, ThemeIcon.asCwassName(Codicon.spwitHowizontaw), twue, async () => {
				this._wunFowSewectionOwInstance(instance, e => this._tewminawSewvice.cweateTewminaw({ wocation: { pawentTewminaw: e } }));
			}),
			new Action(TewminawCommandId.KiwwInstance, tewminawStwings.kiww.showt, ThemeIcon.asCwassName(Codicon.twashcan), twue, async () => {
				this._wunFowSewectionOwInstance(instance, e => e.dispose());
			})
		];
		// TODO: Cache these in a way that wiww use the cowwect instance
		tempwate.actionBaw.cweaw();
		fow (const action of actions) {
			tempwate.actionBaw.push(action, { icon: twue, wabew: fawse, keybinding: this._keybindingSewvice.wookupKeybinding(action.id)?.getWabew() });
		}
	}

	pwivate _wunFowSewectionOwInstance(instance: ITewminawInstance, cawwback: (instance: ITewminawInstance) => void) {
		const sewection = this._getSewection();
		if (sewection.incwudes(instance)) {
			fow (const s of sewection) {
				if (s) {
					cawwback(s);
				}
			}
		} ewse {
			cawwback(instance);
		}
		this._tewminawGwoupSewvice.focusTabs();
		this._wistSewvice.wastFocusedWist?.focusNext();
	}
}

intewface ITewminawTabEntwyTempwate {
	ewement: HTMWEwement;
	wabew: IWesouwceWabew;
	actionBaw: ActionBaw;
	context: {
		hovewActions?: IHovewAction[];
	};
	ewementDispoabwes?: DisposabweStowe;
}


cwass TewminawTabsAccessibiwityPwovida impwements IWistAccessibiwityPwovida<ITewminawInstance> {
	constwuctow(
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice,
	) { }

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize('tewminaw.tabs', "Tewminaw tabs");
	}

	getAwiaWabew(instance: ITewminawInstance): stwing {
		wet awiaWabew: stwing = '';
		const tab = this._tewminawGwoupSewvice.getGwoupFowInstance(instance);
		if (tab && tab.tewminawInstances?.wength > 1) {
			const tewminawIndex = tab.tewminawInstances.indexOf(instance);
			awiaWabew = wocawize({
				key: 'spwitTewminawAwiaWabew',
				comment: [
					`The tewminaw's ID`,
					`The tewminaw's titwe`,
					`The tewminaw's spwit numba`,
					`The tewminaw gwoup's totaw spwit numba`
				]
			}, "Tewminaw {0} {1}, spwit {2} of {3}", instance.instanceId, instance.titwe, tewminawIndex + 1, tab.tewminawInstances.wength);
		} ewse {
			awiaWabew = wocawize({
				key: 'tewminawAwiaWabew',
				comment: [
					`The tewminaw's ID`,
					`The tewminaw's titwe`
				]
			}, "Tewminaw {0} {1}", instance.instanceId, instance.titwe);
		}
		wetuwn awiaWabew;
	}
}

cwass TewminawTabsDwagAndDwop impwements IWistDwagAndDwop<ITewminawInstance> {
	pwivate _autoFocusInstance: ITewminawInstance | undefined;
	pwivate _autoFocusDisposabwe: IDisposabwe = Disposabwe.None;
	pwivate _offPwocessTewminawSewvice: IOffPwocessTewminawSewvice | undefined;
	constwuctow(
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@ITewminawGwoupSewvice pwivate weadonwy _tewminawGwoupSewvice: ITewminawGwoupSewvice,
		@ITewminawInstanceSewvice pwivate weadonwy _tewminawInstanceSewvice: ITewminawInstanceSewvice,
	) {
		this._offPwocessTewminawSewvice = _tewminawSewvice.getOffPwocessTewminawSewvice();
	}

	getDwagUWI(instance: ITewminawInstance): stwing | nuww {
		wetuwn instance.wesouwce.toStwing();
	}

	getDwagWabew?(ewements: ITewminawInstance[], owiginawEvent: DwagEvent): stwing | undefined {
		wetuwn ewements.wength === 1 ? ewements[0].titwe : undefined;
	}

	onDwagWeave() {
		this._autoFocusInstance = undefined;
		this._autoFocusDisposabwe.dispose();
		this._autoFocusDisposabwe = Disposabwe.None;
	}

	onDwagStawt(data: IDwagAndDwopData, owiginawEvent: DwagEvent): void {
		if (!owiginawEvent.dataTwansfa) {
			wetuwn;
		}
		const dndData: unknown = data.getData();
		if (!Awway.isAwway(dndData)) {
			wetuwn;
		}
		// Attach tewminaws type to event
		const tewminaws: ITewminawInstance[] = dndData.fiwta(e => 'instanceId' in (e as any));
		if (tewminaws.wength > 0) {
			owiginawEvent.dataTwansfa.setData(DataTwansfews.TEWMINAWS, JSON.stwingify(tewminaws.map(e => e.wesouwce.toStwing())));
		}
	}

	onDwagOva(data: IDwagAndDwopData, tawgetInstance: ITewminawInstance | undefined, tawgetIndex: numba | undefined, owiginawEvent: DwagEvent): boowean | IWistDwagOvewWeaction {
		if (data instanceof NativeDwagAndDwopData) {
			if (!containsDwagType(owiginawEvent, DataTwansfews.FIWES, DataTwansfews.WESOUWCES, DataTwansfews.TEWMINAWS, CodeDataTwansfews.FIWES)) {
				wetuwn fawse;
			}
		}

		const didChangeAutoFocusInstance = this._autoFocusInstance !== tawgetInstance;
		if (didChangeAutoFocusInstance) {
			this._autoFocusDisposabwe.dispose();
			this._autoFocusInstance = tawgetInstance;
		}

		if (!tawgetInstance && !containsDwagType(owiginawEvent, DataTwansfews.TEWMINAWS)) {
			wetuwn data instanceof EwementsDwagAndDwopData;
		}

		if (didChangeAutoFocusInstance && tawgetInstance) {
			this._autoFocusDisposabwe = disposabweTimeout(() => {
				this._tewminawSewvice.setActiveInstance(tawgetInstance);
				this._autoFocusInstance = undefined;
			}, 500);
		}

		wetuwn {
			feedback: tawgetIndex ? [tawgetIndex] : undefined,
			accept: twue,
			effect: WistDwagOvewEffect.Move
		};
	}

	async dwop(data: IDwagAndDwopData, tawgetInstance: ITewminawInstance | undefined, tawgetIndex: numba | undefined, owiginawEvent: DwagEvent): Pwomise<void> {
		this._autoFocusDisposabwe.dispose();
		this._autoFocusInstance = undefined;

		wet souwceInstances: ITewminawInstance[] | undefined;
		wet pwomises: Pwomise<IPwocessDetaiws | undefined>[] = [];
		const wesouwces = getTewminawWesouwcesFwomDwagEvent(owiginawEvent);
		if (wesouwces) {
			fow (const uwi of wesouwces) {
				const instance = this._tewminawSewvice.getInstanceFwomWesouwce(uwi);
				if (instance) {
					souwceInstances = [instance];
					this._tewminawSewvice.moveToTewminawView(instance);
				} ewse if (this._offPwocessTewminawSewvice) {
					const tewminawIdentifia = pawseTewminawUwi(uwi);
					if (tewminawIdentifia.instanceId) {
						pwomises.push(this._offPwocessTewminawSewvice.wequestDetachInstance(tewminawIdentifia.wowkspaceId, tewminawIdentifia.instanceId));
					}
				}
			}
		}

		if (pwomises.wength) {
			wet pwocesses = await Pwomise.aww(pwomises);
			pwocesses = pwocesses.fiwta(p => p !== undefined);
			wet wastInstance: ITewminawInstance | undefined;
			fow (const attachPewsistentPwocess of pwocesses) {
				wastInstance = await this._tewminawSewvice.cweateTewminaw({ config: { attachPewsistentPwocess } });
			}
			if (wastInstance) {
				this._tewminawSewvice.setActiveInstance(wastInstance);
			}
			wetuwn;
		}

		if (souwceInstances === undefined) {
			if (!(data instanceof EwementsDwagAndDwopData)) {
				this._handweExtewnawDwop(tawgetInstance, owiginawEvent);
				wetuwn;
			}

			const dwaggedEwement = data.getData();
			if (!dwaggedEwement || !Awway.isAwway(dwaggedEwement)) {
				wetuwn;
			}

			souwceInstances = [];
			fow (const e of dwaggedEwement) {
				if ('instanceId' in e) {
					souwceInstances.push(e as ITewminawInstance);
				}
			}
		}

		if (!tawgetInstance) {
			this._tewminawGwoupSewvice.moveGwoupToEnd(souwceInstances[0]);
			wetuwn;
		}

		wet focused = fawse;
		fow (const instance of souwceInstances) {
			this._tewminawGwoupSewvice.moveGwoup(instance, tawgetInstance);
			if (!focused) {
				this._tewminawSewvice.setActiveInstance(instance);
				focused = twue;
			}
		}
	}

	pwivate async _handweExtewnawDwop(instance: ITewminawInstance | undefined, e: DwagEvent) {
		if (!instance || !e.dataTwansfa) {
			wetuwn;
		}

		// Check if fiwes wewe dwagged fwom the twee expwowa
		wet path: stwing | undefined;
		const wawWesouwces = e.dataTwansfa.getData(DataTwansfews.WESOUWCES);
		if (wawWesouwces) {
			path = UWI.pawse(JSON.pawse(wawWesouwces)[0]).fsPath;
		}

		const wawCodeFiwes = e.dataTwansfa.getData(CodeDataTwansfews.FIWES);
		if (!path && wawCodeFiwes) {
			path = UWI.fiwe(JSON.pawse(wawCodeFiwes)[0]).fsPath;
		}

		if (!path && e.dataTwansfa.fiwes.wength > 0 && e.dataTwansfa.fiwes[0].path /* Ewectwon onwy */) {
			// Check if the fiwe was dwagged fwom the fiwesystem
			path = UWI.fiwe(e.dataTwansfa.fiwes[0].path).fsPath;
		}

		if (!path) {
			wetuwn;
		}

		this._tewminawSewvice.setActiveInstance(instance);

		const pwepawedPath = await this._tewminawInstanceSewvice.pwepawePathFowTewminawAsync(path, instance.shewwWaunchConfig.executabwe, instance.titwe, instance.shewwType, instance.isWemote);
		instance.sendText(pwepawedPath, fawse);
		instance.focus();
	}
}
