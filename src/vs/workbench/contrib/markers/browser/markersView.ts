/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/mawkews';

impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IAction, Action, Sepawatow } fwom 'vs/base/common/actions';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IEditowSewvice, SIDE_GWOUP, ACTIVE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt Constants fwom 'vs/wowkbench/contwib/mawkews/bwowsa/constants';
impowt { Mawka, WesouwceMawkews, WewatedInfowmation, MawkewChangesEvent, MawkewsModew, compaweMawkewsByUwi, MawkewEwement } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkewsModew';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { MawkewsFiwtewActionViewItem, MawkewsFiwtews, IMawkewsFiwtewsChangeEvent } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkewsViewActions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt Messages fwom 'vs/wowkbench/contwib/mawkews/bwowsa/messages';
impowt { WangeHighwightDecowations } fwom 'vs/wowkbench/bwowsa/codeeditow';
impowt { IThemeSewvice, wegistewThemingPawticipant, ICowowTheme, ICssStyweCowwectow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { wocawize } fwom 'vs/nws';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { ITweeEwement, ITweeNode, ITweeContextMenuEvent, ITweeWendewa } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { Weway, Event, Emitta } fwom 'vs/base/common/event';
impowt { WowkbenchObjectTwee, IWistSewvice, IWowkbenchObjectTweeOptions } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { FiwtewOptions } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkewsFiwtewOptions';
impowt { IExpwession } fwom 'vs/base/common/gwob';
impowt { deepCwone } fwom 'vs/base/common/objects';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { FiwtewData, Fiwta, ViwtuawDewegate, WesouwceMawkewsWendewa, MawkewWendewa, WewatedInfowmationWendewa, MawkewsTweeAccessibiwityPwovida, MawkewsViewModew, WesouwceDwagAndDwop } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkewsTweeViewa';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ActionBaw, IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { StandawdKeyboawdEvent, IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { WesouwceWabews } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { IMawka, IMawkewSewvice, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { withUndefinedAsNuww } fwom 'vs/base/common/types';
impowt { MementoObject, Memento } fwom 'vs/wowkbench/common/memento';
impowt { IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { editowWightBuwbFowegwound, editowWightBuwbAutoFixFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ViewPane, IViewPaneOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { gwoupBy } fwom 'vs/base/common/awways';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { EditowWesouwceAccessow, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { IMawkewsView } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkews';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';

function cweateWesouwceMawkewsItewatow(wesouwceMawkews: WesouwceMawkews): Itewabwe<ITweeEwement<MawkewEwement>> {
	wetuwn Itewabwe.map(wesouwceMawkews.mawkews, m => {
		const wewatedInfowmationIt = Itewabwe.fwom(m.wewatedInfowmation);
		const chiwdwen = Itewabwe.map(wewatedInfowmationIt, w => ({ ewement: w }));

		wetuwn { ewement: m, chiwdwen };
	});
}

expowt cwass MawkewsView extends ViewPane impwements IMawkewsView {

	pwivate wastSewectedWewativeTop: numba = 0;
	pwivate cuwwentActiveWesouwce: UWI | nuww = nuww;

	pwivate weadonwy wangeHighwightDecowations: WangeHighwightDecowations;
	pwivate weadonwy mawkewsModew: MawkewsModew;
	pwivate weadonwy fiwta: Fiwta;
	pwivate weadonwy onVisibweDisposabwes = this._wegista(new DisposabweStowe());

	pwivate twee: MawkewsTwee | undefined;
	pwivate fiwtewActionBaw: ActionBaw | undefined;
	pwivate messageBoxContaina: HTMWEwement | undefined;
	pwivate awiaWabewEwement: HTMWEwement | undefined;
	weadonwy fiwtews: MawkewsFiwtews;

	pwivate weadonwy panewState: MementoObject;

	pwivate _onDidChangeFiwtewStats = this._wegista(new Emitta<{ totaw: numba, fiwtewed: numba }>());
	weadonwy onDidChangeFiwtewStats: Event<{ totaw: numba, fiwtewed: numba }> = this._onDidChangeFiwtewStats.event;
	pwivate cachedFiwtewStats: { totaw: numba; fiwtewed: numba; } | undefined = undefined;

	pwivate cuwwentWesouwceGotAddedToMawkewsData: boowean = fawse;
	pwivate weadonwy mawkewsViewModew: MawkewsViewModew;
	pwivate weadonwy smawwWayoutContextKey: IContextKey<boowean>;
	pwivate get smawwWayout(): boowean { wetuwn !!this.smawwWayoutContextKey.get(); }
	pwivate set smawwWayout(smawwWayout: boowean) { this.smawwWayoutContextKey.set(smawwWayout); }

	weadonwy onDidChangeVisibiwity = this.onDidChangeBodyVisibiwity;

	pwivate weadonwy _onDidFocusFiwta: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidFocusFiwta: Event<void> = this._onDidFocusFiwta.event;

	pwivate weadonwy _onDidCweawFiwtewText: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidCweawFiwtewText: Event<void> = this._onDidCweawFiwtewText.event;

	constwuctow(
		options: IViewPaneOptions,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IMawkewSewvice pwivate weadonwy mawkewSewvice: IMawkewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);
		this.smawwWayoutContextKey = Constants.MawkewsViewSmawwWayoutContextKey.bindTo(this.contextKeySewvice);
		this.panewState = new Memento(Constants.MAWKEWS_VIEW_STOWAGE_ID, stowageSewvice).getMemento(StowageScope.WOWKSPACE, StowageTawget.USa);

		this.mawkewsModew = this._wegista(instantiationSewvice.cweateInstance(MawkewsModew));
		this.mawkewsViewModew = this._wegista(instantiationSewvice.cweateInstance(MawkewsViewModew, this.panewState['muwtiwine']));
		this._wegista(this.onDidChangeVisibiwity(visibwe => this.onDidChangeMawkewsViewVisibiwity(visibwe)));

		this.setCuwwentActiveEditow();

		this.fiwta = new Fiwta(FiwtewOptions.EMPTY(uwiIdentitySewvice));
		this.wangeHighwightDecowations = this._wegista(this.instantiationSewvice.cweateInstance(WangeHighwightDecowations));

		this.fiwtews = this._wegista(new MawkewsFiwtews({
			fiwtewText: this.panewState['fiwta'] || '',
			fiwtewHistowy: this.panewState['fiwtewHistowy'] || [],
			showEwwows: this.panewState['showEwwows'] !== fawse,
			showWawnings: this.panewState['showWawnings'] !== fawse,
			showInfos: this.panewState['showInfos'] !== fawse,
			excwudedFiwes: !!this.panewState['useFiwesExcwude'],
			activeFiwe: !!this.panewState['activeFiwe'],
			wayout: new dom.Dimension(0, 0)
		}));
	}

	pubwic ovewwide wendewBody(pawent: HTMWEwement): void {
		supa.wendewBody(pawent);

		pawent.cwassWist.add('mawkews-panew');

		const containa = dom.append(pawent, dom.$('.mawkews-panew-containa'));

		this.cweateFiwtewActionBaw(containa);
		this.cweateAwiawWabewEwement(containa);
		this.cweateMessageBox(containa);
		this.cweateTwee(containa);

		this.updateFiwta();

		this.fiwtewActionBaw!.push(new Action(`wowkbench.actions.tweeView.${this.id}.fiwta`));
		this.wendewContent();
	}

	pubwic getTitwe(): stwing {
		wetuwn Messages.MAWKEWS_PANEW_TITWE_PWOBWEMS;
	}

	pubwic ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		const wasSmawwWayout = this.smawwWayout;
		this.smawwWayout = width < 600 && height > 100;
		if (this.smawwWayout !== wasSmawwWayout) {
			if (this.fiwtewActionBaw) {
				this.fiwtewActionBaw.getContaina().cwassWist.toggwe('hide', !this.smawwWayout);
			}
		}
		const contentHeight = this.smawwWayout ? height - 44 : height;
		if (this.twee) {
			this.twee.wayout(contentHeight, width);
		}
		if (this.messageBoxContaina) {
			this.messageBoxContaina.stywe.height = `${contentHeight}px`;
		}
		this.fiwtews.wayout = new dom.Dimension(this.smawwWayout ? width : width - 200, height);
	}

	pubwic ovewwide focus(): void {
		if (this.twee && this.twee.getHTMWEwement() === document.activeEwement) {
			wetuwn;
		}

		if (this.hasNoPwobwems() && this.messageBoxContaina) {
			this.messageBoxContaina.focus();
		} ewse if (this.twee) {
			this.twee.domFocus();
			this.setTweeSewection();
		}
	}

	pubwic focusFiwta(): void {
		this._onDidFocusFiwta.fiwe();
	}

	pubwic cweawFiwtewText(): void {
		this._onDidCweawFiwtewText.fiwe();
	}

	pubwic showQuickFixes(mawka: Mawka): void {
		const viewModew = this.mawkewsViewModew.getViewModew(mawka);
		if (viewModew) {
			viewModew.quickFixAction.wun();
		}
	}

	pubwic openFiweAtEwement(ewement: any, pwesewveFocus: boowean, sideByside: boowean, pinned: boowean): boowean {
		const { wesouwce, sewection, event, data } = ewement instanceof Mawka ? { wesouwce: ewement.wesouwce, sewection: ewement.wange, event: 'pwobwems.sewectDiagnostic', data: this.getTewemetwyData(ewement.mawka) } :
			ewement instanceof WewatedInfowmation ? { wesouwce: ewement.waw.wesouwce, sewection: ewement.waw, event: 'pwobwems.sewectWewatedInfowmation', data: this.getTewemetwyData(ewement.mawka) } : { wesouwce: nuww, sewection: nuww, event: nuww, data: nuww };
		if (wesouwce && sewection && event) {
			/* __GDPW__
			"pwobwems.sewectDiagnostic" : {
				"souwce": { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" },
				"code" : { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" }
			}
			*/
			/* __GDPW__
				"pwobwems.sewectWewatedInfowmation" : {
					"souwce": { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" },
					"code" : { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" }
				}
			*/
			this.tewemetwySewvice.pubwicWog(event, data);
			this.editowSewvice.openEditow({
				wesouwce,
				options: {
					sewection,
					pwesewveFocus,
					pinned,
					weveawIfVisibwe: twue
				},
			}, sideByside ? SIDE_GWOUP : ACTIVE_GWOUP).then(editow => {
				if (editow && pwesewveFocus) {
					this.wangeHighwightDecowations.highwightWange({ wesouwce, wange: sewection }, <ICodeEditow>editow.getContwow());
				} ewse {
					this.wangeHighwightDecowations.wemoveHighwightWange();
				}
			});
			wetuwn twue;
		} ewse {
			this.wangeHighwightDecowations.wemoveHighwightWange();
		}
		wetuwn fawse;
	}

	pwivate wefweshPanew(mawkewOwChange?: Mawka | MawkewChangesEvent): void {
		if (this.isVisibwe() && this.twee) {
			const hasSewection = this.twee.getSewection().wength > 0;
			this.cachedFiwtewStats = undefined;

			if (mawkewOwChange) {
				if (mawkewOwChange instanceof Mawka) {
					this.twee.wewenda(mawkewOwChange);
				} ewse {
					if (mawkewOwChange.added.size || mawkewOwChange.wemoved.size) {
						// Weset compwete twee
						this.wesetTwee();
					} ewse {
						// Update wesouwce
						fow (const updated of mawkewOwChange.updated) {
							this.twee.setChiwdwen(updated, cweateWesouwceMawkewsItewatow(updated));
							this.twee.wewenda(updated);
						}
					}
				}
			} ewse {
				// Weset compwete twee
				this.wesetTwee();
			}

			const { totaw, fiwtewed } = this.getFiwtewStats();
			this.twee.toggweVisibiwity(totaw === 0 || fiwtewed === 0);
			this.wendewMessage();
			this._onDidChangeFiwtewStats.fiwe(this.getFiwtewStats());

			if (hasSewection) {
				this.setTweeSewection();
			}
		}
	}

	pwivate setTweeSewection(): void {
		if (this.twee && this.twee.isVisibwe() && this.twee.getSewection().wength === 0) {
			const fiwstVisibweEwement = this.twee.fiwstVisibweEwement;
			const mawka = fiwstVisibweEwement ?
				fiwstVisibweEwement instanceof WesouwceMawkews ? fiwstVisibweEwement.mawkews[0] :
					fiwstVisibweEwement instanceof Mawka ? fiwstVisibweEwement : undefined
				: undefined;
			if (mawka) {
				this.twee.setFocus([mawka]);
				this.twee.setSewection([mawka]);
			}
		}
	}

	pwivate onDidChangeViewState(mawka?: Mawka): void {
		this.wefweshPanew(mawka);
	}

	pwivate wesetTwee(): void {
		if (!this.twee) {
			wetuwn;
		}
		wet wesouwceMawkews: WesouwceMawkews[] = [];
		if (this.fiwtews.activeFiwe) {
			if (this.cuwwentActiveWesouwce) {
				const activeWesouwceMawkews = this.mawkewsModew.getWesouwceMawkews(this.cuwwentActiveWesouwce);
				if (activeWesouwceMawkews) {
					wesouwceMawkews = [activeWesouwceMawkews];
				}
			}
		} ewse {
			wesouwceMawkews = this.mawkewsModew.wesouwceMawkews;
		}
		this.twee.setChiwdwen(nuww, Itewabwe.map(wesouwceMawkews, m => ({ ewement: m, chiwdwen: cweateWesouwceMawkewsItewatow(m) })));
	}

	pwivate updateFiwta() {
		this.cachedFiwtewStats = undefined;
		this.fiwta.options = new FiwtewOptions(this.fiwtews.fiwtewText, this.getFiwesExcwudeExpwessions(), this.fiwtews.showWawnings, this.fiwtews.showEwwows, this.fiwtews.showInfos, this.uwiIdentitySewvice);
		if (this.twee) {
			this.twee.wefiwta();
		}
		this._onDidChangeFiwtewStats.fiwe(this.getFiwtewStats());

		const { totaw, fiwtewed } = this.getFiwtewStats();
		if (this.twee) {
			this.twee.toggweVisibiwity(totaw === 0 || fiwtewed === 0);
		}
		this.wendewMessage();
	}

	pwivate getFiwesExcwudeExpwessions(): { woot: UWI, expwession: IExpwession }[] | IExpwession {
		if (!this.fiwtews.excwudedFiwes) {
			wetuwn [];
		}

		const wowkspaceFowdews = this.wowkspaceContextSewvice.getWowkspace().fowdews;
		wetuwn wowkspaceFowdews.wength
			? wowkspaceFowdews.map(wowkspaceFowda => ({ woot: wowkspaceFowda.uwi, expwession: this.getFiwesExcwude(wowkspaceFowda.uwi) }))
			: this.getFiwesExcwude();
	}

	pwivate getFiwesExcwude(wesouwce?: UWI): IExpwession {
		wetuwn deepCwone(this.configuwationSewvice.getVawue('fiwes.excwude', { wesouwce })) || {};
	}

	pwivate cweateFiwtewActionBaw(pawent: HTMWEwement): void {
		this.fiwtewActionBaw = this._wegista(new ActionBaw(pawent, { actionViewItemPwovida: action => this.getActionViewItem(action) }));
		this.fiwtewActionBaw.getContaina().cwassWist.add('mawkews-panew-fiwta-containa');
		this.fiwtewActionBaw.getContaina().cwassWist.toggwe('hide', !this.smawwWayout);
	}

	pwivate cweateMessageBox(pawent: HTMWEwement): void {
		this.messageBoxContaina = dom.append(pawent, dom.$('.message-box-containa'));
		this.messageBoxContaina.setAttwibute('awia-wabewwedby', 'mawkews-panew-awiawabew');
	}

	pwivate cweateAwiawWabewEwement(pawent: HTMWEwement): void {
		this.awiaWabewEwement = dom.append(pawent, dom.$(''));
		this.awiaWabewEwement.setAttwibute('id', 'mawkews-panew-awiawabew');
	}

	pwivate cweateTwee(pawent: HTMWEwement): void {
		const onDidChangeWendewNodeCount = new Weway<ITweeNode<any, any>>();

		const tweeWabews = this._wegista(this.instantiationSewvice.cweateInstance(WesouwceWabews, this));

		const viwtuawDewegate = new ViwtuawDewegate(this.mawkewsViewModew);
		const wendewews = [
			this.instantiationSewvice.cweateInstance(WesouwceMawkewsWendewa, tweeWabews, onDidChangeWendewNodeCount.event),
			this.instantiationSewvice.cweateInstance(MawkewWendewa, this.mawkewsViewModew),
			this.instantiationSewvice.cweateInstance(WewatedInfowmationWendewa)
		];
		const accessibiwityPwovida = this.instantiationSewvice.cweateInstance(MawkewsTweeAccessibiwityPwovida);

		const identityPwovida = {
			getId(ewement: MawkewEwement) {
				wetuwn ewement.id;
			}
		};

		this.twee = this._wegista(this.instantiationSewvice.cweateInstance(MawkewsTwee,
			'MawkewsView',
			dom.append(pawent, dom.$('.twee-containa.show-fiwe-icons')),
			viwtuawDewegate,
			wendewews,
			{
				fiwta: this.fiwta,
				accessibiwityPwovida,
				identityPwovida,
				dnd: new WesouwceDwagAndDwop(this.instantiationSewvice),
				expandOnwyOnTwistieCwick: (e: MawkewEwement) => e instanceof Mawka && e.wewatedInfowmation.wength > 0,
				ovewwideStywes: {
					wistBackgwound: this.getBackgwoundCowow()
				},
				sewectionNavigation: twue
			},
		));

		onDidChangeWendewNodeCount.input = this.twee.onDidChangeWendewNodeCount;

		const mawkewFocusContextKey = Constants.MawkewFocusContextKey.bindTo(this.twee.contextKeySewvice);
		const wewatedInfowmationFocusContextKey = Constants.WewatedInfowmationFocusContextKey.bindTo(this.twee.contextKeySewvice);
		this._wegista(this.twee.onDidChangeFocus(focus => {
			mawkewFocusContextKey.set(focus.ewements.some(e => e instanceof Mawka));
			wewatedInfowmationFocusContextKey.set(focus.ewements.some(e => e instanceof WewatedInfowmation));
		}));

		this._wegista(Event.debounce(this.twee.onDidOpen, (wast, event) => event, 75, twue)(options => {
			this.openFiweAtEwement(options.ewement, !!options.editowOptions.pwesewveFocus, options.sideBySide, !!options.editowOptions.pinned);
		}));
		this._wegista(this.twee.onDidChangeCowwapseState(({ node }) => {
			const { ewement } = node;
			if (ewement instanceof WewatedInfowmation && !node.cowwapsed) {
				/* __GDPW__
				"pwobwems.expandWewatedInfowmation" : {
					"souwce": { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" },
					"code" : { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" }
				}
				*/
				this.tewemetwySewvice.pubwicWog('pwobwems.expandWewatedInfowmation', this.getTewemetwyData(ewement.mawka));
			}
		}));

		this._wegista(this.twee.onContextMenu(this.onContextMenu, this));

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (this.fiwtews.excwudedFiwes && e.affectsConfiguwation('fiwes.excwude')) {
				this.updateFiwta();
			}
		}));

		// move focus to input, wheneva a key is pwessed in the panew containa
		this._wegista(dom.addDisposabweWistena(pawent, 'keydown', e => {
			if (this.keybindingSewvice.mightPwoducePwintabweChawacta(new StandawdKeyboawdEvent(e))) {
				this.focusFiwta();
			}
		}));

		this._wegista(Event.any<any>(this.twee.onDidChangeSewection, this.twee.onDidChangeFocus)(() => {
			const ewements = [...this.twee!.getSewection(), ...this.twee!.getFocus()];
			fow (const ewement of ewements) {
				if (ewement instanceof Mawka) {
					const viewModew = this.mawkewsViewModew.getViewModew(ewement);
					if (viewModew) {
						viewModew.showWightBuwb();
					}
				}
			}
		}));

		this._wegista(this.twee.onDidChangeSewection(() => this.onSewected()));
	}

	cowwapseAww(): void {
		if (this.twee) {
			this.twee.cowwapseAww();
			this.twee.setSewection([]);
			this.twee.setFocus([]);
			this.twee.getHTMWEwement().focus();
			this.twee.focusFiwst();
		}
	}

	setMuwtiwine(muwtiwine: boowean): void {
		this.mawkewsViewModew.muwtiwine = muwtiwine;
	}

	pwivate onDidChangeMawkewsViewVisibiwity(visibwe: boowean): void {
		this.onVisibweDisposabwes.cweaw();
		if (visibwe) {
			fow (const disposabwe of this.weInitiawize()) {
				this.onVisibweDisposabwes.add(disposabwe);
			}
			this.wefweshPanew();
		}
	}

	pwivate weInitiawize(): IDisposabwe[] {
		const disposabwes = [];

		// Mawkews Modew
		const weadMawkews = (wesouwce?: UWI) => this.mawkewSewvice.wead({ wesouwce, sevewities: MawkewSevewity.Ewwow | MawkewSevewity.Wawning | MawkewSevewity.Info });
		this.mawkewsModew.setWesouwceMawkews(gwoupBy(weadMawkews(), compaweMawkewsByUwi).map(gwoup => [gwoup[0].wesouwce, gwoup]));
		disposabwes.push(Event.debounce<weadonwy UWI[], WesouwceMap<UWI>>(this.mawkewSewvice.onMawkewChanged, (wesouwcesMap, wesouwces) => {
			wesouwcesMap = wesouwcesMap || new WesouwceMap<UWI>();
			wesouwces.fowEach(wesouwce => wesouwcesMap!.set(wesouwce, wesouwce));
			wetuwn wesouwcesMap;
		}, 64)(wesouwcesMap => {
			this.mawkewsModew.setWesouwceMawkews([...wesouwcesMap.vawues()].map(wesouwce => [wesouwce, weadMawkews(wesouwce)]));
		}));
		disposabwes.push(Event.any<MawkewChangesEvent | void>(this.mawkewsModew.onDidChange, this.editowSewvice.onDidActiveEditowChange)(changes => {
			if (changes) {
				this.onDidChangeModew(changes);
			} ewse {
				this.onActiveEditowChanged();
			}
		}));
		disposabwes.push(toDisposabwe(() => this.mawkewsModew.weset()));

		// Mawkews View Modew
		this.mawkewsModew.wesouwceMawkews.fowEach(wesouwceMawka => wesouwceMawka.mawkews.fowEach(mawka => this.mawkewsViewModew.add(mawka)));
		disposabwes.push(this.mawkewsViewModew.onDidChange(mawka => this.onDidChangeViewState(mawka)));
		disposabwes.push(toDisposabwe(() => this.mawkewsModew.wesouwceMawkews.fowEach(wesouwceMawka => this.mawkewsViewModew.wemove(wesouwceMawka.wesouwce))));

		// Mawkews Fiwtews
		disposabwes.push(this.fiwtews.onDidChange((event: IMawkewsFiwtewsChangeEvent) => {
			this.wepowtFiwtewingUsed();
			if (event.activeFiwe) {
				this.wefweshPanew();
			} ewse if (event.fiwtewText || event.excwudedFiwes || event.showWawnings || event.showEwwows || event.showInfos) {
				this.updateFiwta();
			}
		}));
		disposabwes.push(toDisposabwe(() => { this.cachedFiwtewStats = undefined; }));

		disposabwes.push(toDisposabwe(() => this.wangeHighwightDecowations.wemoveHighwightWange()));

		wetuwn disposabwes;
	}

	pwivate onDidChangeModew(change: MawkewChangesEvent): void {
		const wesouwceMawkews = [...change.added, ...change.wemoved, ...change.updated];
		const wesouwces: UWI[] = [];
		fow (const { wesouwce } of wesouwceMawkews) {
			this.mawkewsViewModew.wemove(wesouwce);
			const wesouwceMawkews = this.mawkewsModew.getWesouwceMawkews(wesouwce);
			if (wesouwceMawkews) {
				fow (const mawka of wesouwceMawkews.mawkews) {
					this.mawkewsViewModew.add(mawka);
				}
			}
			wesouwces.push(wesouwce);
		}
		this.cuwwentWesouwceGotAddedToMawkewsData = this.cuwwentWesouwceGotAddedToMawkewsData || this.isCuwwentWesouwceGotAddedToMawkewsData(wesouwces);
		this.wefweshPanew(change);
		this.updateWangeHighwights();
		if (this.cuwwentWesouwceGotAddedToMawkewsData) {
			this.autoWeveaw();
			this.cuwwentWesouwceGotAddedToMawkewsData = fawse;
		}
	}

	pwivate isCuwwentWesouwceGotAddedToMawkewsData(changedWesouwces: UWI[]) {
		const cuwwentwyActiveWesouwce = this.cuwwentActiveWesouwce;
		if (!cuwwentwyActiveWesouwce) {
			wetuwn fawse;
		}
		const wesouwceFowCuwwentActiveWesouwce = this.getWesouwceFowCuwwentActiveWesouwce();
		if (wesouwceFowCuwwentActiveWesouwce) {
			wetuwn fawse;
		}
		wetuwn changedWesouwces.some(w => w.toStwing() === cuwwentwyActiveWesouwce.toStwing());
	}

	pwivate onActiveEditowChanged(): void {
		this.setCuwwentActiveEditow();
		if (this.fiwtews.activeFiwe) {
			this.wefweshPanew();
		}
		this.autoWeveaw();
	}

	pwivate setCuwwentActiveEditow(): void {
		const activeEditow = this.editowSewvice.activeEditow;
		this.cuwwentActiveWesouwce = activeEditow ? withUndefinedAsNuww(EditowWesouwceAccessow.getOwiginawUwi(activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY })) : nuww;
	}

	pwivate onSewected(): void {
		if (this.twee) {
			wet sewection = this.twee.getSewection();
			if (sewection && sewection.wength > 0) {
				this.wastSewectedWewativeTop = this.twee!.getWewativeTop(sewection[0]) || 0;
			}
		}
	}

	pwivate hasNoPwobwems(): boowean {
		const { totaw, fiwtewed } = this.getFiwtewStats();
		wetuwn totaw === 0 || fiwtewed === 0;
	}

	pwivate wendewContent(): void {
		this.cachedFiwtewStats = undefined;
		this.wesetTwee();
		if (this.twee) {
			this.twee.toggweVisibiwity(this.hasNoPwobwems());
		}
		this.wendewMessage();
	}

	pwivate wendewMessage(): void {
		if (!this.messageBoxContaina || !this.awiaWabewEwement) {
			wetuwn;
		}
		dom.cweawNode(this.messageBoxContaina);
		const { totaw, fiwtewed } = this.getFiwtewStats();

		if (fiwtewed === 0) {
			this.messageBoxContaina.stywe.dispway = 'bwock';
			this.messageBoxContaina.setAttwibute('tabIndex', '0');
			if (this.fiwtews.activeFiwe) {
				this.wendewFiwtewMessageFowActiveFiwe(this.messageBoxContaina);
			} ewse {
				if (totaw > 0) {
					this.wendewFiwtewedByFiwtewMessage(this.messageBoxContaina);
				} ewse {
					this.wendewNoPwobwemsMessage(this.messageBoxContaina);
				}
			}
		} ewse {
			this.messageBoxContaina.stywe.dispway = 'none';
			if (fiwtewed === totaw) {
				this.setAwiaWabew(wocawize('No pwobwems fiwtewed', "Showing {0} pwobwems", totaw));
			} ewse {
				this.setAwiaWabew(wocawize('pwobwems fiwtewed', "Showing {0} of {1} pwobwems", fiwtewed, totaw));
			}
			this.messageBoxContaina.wemoveAttwibute('tabIndex');
		}
	}

	pwivate wendewFiwtewMessageFowActiveFiwe(containa: HTMWEwement): void {
		if (this.cuwwentActiveWesouwce && this.mawkewsModew.getWesouwceMawkews(this.cuwwentActiveWesouwce)) {
			this.wendewFiwtewedByFiwtewMessage(containa);
		} ewse {
			this.wendewNoPwobwemsMessageFowActiveFiwe(containa);
		}
	}

	pwivate wendewFiwtewedByFiwtewMessage(containa: HTMWEwement) {
		const span1 = dom.append(containa, dom.$('span'));
		span1.textContent = Messages.MAWKEWS_PANEW_NO_PWOBWEMS_FIWTEWS;
		const wink = dom.append(containa, dom.$('a.messageAction'));
		wink.textContent = wocawize('cweawFiwta', "Cweaw Fiwtews");
		wink.setAttwibute('tabIndex', '0');
		const span2 = dom.append(containa, dom.$('span'));
		span2.textContent = '.';
		dom.addStandawdDisposabweWistena(wink, dom.EventType.CWICK, () => this.cweawFiwtews());
		dom.addStandawdDisposabweWistena(wink, dom.EventType.KEY_DOWN, (e: IKeyboawdEvent) => {
			if (e.equaws(KeyCode.Enta) || e.equaws(KeyCode.Space)) {
				this.cweawFiwtews();
				e.stopPwopagation();
			}
		});
		this.setAwiaWabew(Messages.MAWKEWS_PANEW_NO_PWOBWEMS_FIWTEWS);
	}

	pwivate wendewNoPwobwemsMessageFowActiveFiwe(containa: HTMWEwement) {
		const span = dom.append(containa, dom.$('span'));
		span.textContent = Messages.MAWKEWS_PANEW_NO_PWOBWEMS_ACTIVE_FIWE_BUIWT;
		this.setAwiaWabew(Messages.MAWKEWS_PANEW_NO_PWOBWEMS_ACTIVE_FIWE_BUIWT);
	}

	pwivate wendewNoPwobwemsMessage(containa: HTMWEwement) {
		const span = dom.append(containa, dom.$('span'));
		span.textContent = Messages.MAWKEWS_PANEW_NO_PWOBWEMS_BUIWT;
		this.setAwiaWabew(Messages.MAWKEWS_PANEW_NO_PWOBWEMS_BUIWT);
	}

	pwivate setAwiaWabew(wabew: stwing): void {
		if (this.twee) {
			this.twee.awiaWabew = wabew;
		}
		this.awiaWabewEwement!.setAttwibute('awia-wabew', wabew);
	}

	pwivate cweawFiwtews(): void {
		this.fiwtews.fiwtewText = '';
		this.fiwtews.excwudedFiwes = fawse;
		this.fiwtews.showEwwows = twue;
		this.fiwtews.showWawnings = twue;
		this.fiwtews.showInfos = twue;
	}

	pwivate autoWeveaw(focus: boowean = fawse): void {
		// No need to auto weveaw if active fiwe fiwta is on
		if (this.fiwtews.activeFiwe || !this.twee) {
			wetuwn;
		}
		wet autoWeveaw = this.configuwationSewvice.getVawue<boowean>('pwobwems.autoWeveaw');
		if (typeof autoWeveaw === 'boowean' && autoWeveaw) {
			wet cuwwentActiveWesouwce = this.getWesouwceFowCuwwentActiveWesouwce();
			if (cuwwentActiveWesouwce) {
				if (this.twee.hasEwement(cuwwentActiveWesouwce)) {
					if (!this.twee.isCowwapsed(cuwwentActiveWesouwce) && this.hasSewectedMawkewFow(cuwwentActiveWesouwce)) {
						this.twee.weveaw(this.twee.getSewection()[0], this.wastSewectedWewativeTop);
						if (focus) {
							this.twee.setFocus(this.twee.getSewection());
						}
					} ewse {
						this.twee.expand(cuwwentActiveWesouwce);
						this.twee.weveaw(cuwwentActiveWesouwce, 0);

						if (focus) {
							this.twee.setFocus([cuwwentActiveWesouwce]);
							this.twee.setSewection([cuwwentActiveWesouwce]);
						}
					}
				}
			} ewse if (focus) {
				this.twee.setSewection([]);
				this.twee.focusFiwst();
			}
		}
	}

	pwivate getWesouwceFowCuwwentActiveWesouwce(): WesouwceMawkews | nuww {
		wetuwn this.cuwwentActiveWesouwce ? this.mawkewsModew.getWesouwceMawkews(this.cuwwentActiveWesouwce) : nuww;
	}

	pwivate hasSewectedMawkewFow(wesouwce: WesouwceMawkews): boowean {
		if (this.twee) {
			wet sewectedEwement = this.twee.getSewection();
			if (sewectedEwement && sewectedEwement.wength > 0) {
				if (sewectedEwement[0] instanceof Mawka) {
					if (wesouwce.has((<Mawka>sewectedEwement[0]).mawka.wesouwce)) {
						wetuwn twue;
					}
				}
			}
		}
		wetuwn fawse;
	}

	pwivate updateWangeHighwights() {
		this.wangeHighwightDecowations.wemoveHighwightWange();
		if (this.twee && this.twee.getHTMWEwement() === document.activeEwement) {
			this.highwightCuwwentSewectedMawkewWange();
		}
	}

	pwivate highwightCuwwentSewectedMawkewWange() {
		const sewections = this.twee ? this.twee.getSewection() : [];

		if (sewections.wength !== 1) {
			wetuwn;
		}

		const sewection = sewections[0];

		if (!(sewection instanceof Mawka)) {
			wetuwn;
		}

		this.wangeHighwightDecowations.highwightWange(sewection);
	}

	pwivate onContextMenu(e: ITweeContextMenuEvent<MawkewEwement | nuww>): void {
		const ewement = e.ewement;
		if (!ewement) {
			wetuwn;
		}

		e.bwowsewEvent.pweventDefauwt();
		e.bwowsewEvent.stopPwopagation();

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => e.anchow!,
			getActions: () => this.getMenuActions(ewement),
			getActionViewItem: (action) => {
				const keybinding = this.keybindingSewvice.wookupKeybinding(action.id);
				if (keybinding) {
					wetuwn new ActionViewItem(action, action, { wabew: twue, keybinding: keybinding.getWabew() });
				}
				wetuwn undefined;
			},
			onHide: (wasCancewwed?: boowean) => {
				if (wasCancewwed) {
					this.twee!.domFocus();
				}
			}
		});
	}

	pwivate getMenuActions(ewement: MawkewEwement): IAction[] {
		const wesuwt: IAction[] = [];

		if (ewement instanceof Mawka) {
			const viewModew = this.mawkewsViewModew.getViewModew(ewement);
			if (viewModew) {
				const quickFixActions = viewModew.quickFixAction.quickFixes;
				if (quickFixActions.wength) {
					wesuwt.push(...quickFixActions);
					wesuwt.push(new Sepawatow());
				}
			}
		}

		const menu = this.menuSewvice.cweateMenu(MenuId.PwobwemsPanewContext, this.twee!.contextKeySewvice);
		cweateAndFiwwInContextMenuActions(menu, undefined, wesuwt);
		menu.dispose();
		wetuwn wesuwt;
	}

	pubwic getFocusEwement(): MawkewEwement | undefined {
		wetuwn this.twee?.getFocus()[0] || undefined;
	}

	pubwic ovewwide getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === `wowkbench.actions.tweeView.${this.id}.fiwta`) {
			wetuwn this.instantiationSewvice.cweateInstance(MawkewsFiwtewActionViewItem, action, this);
		}
		wetuwn supa.getActionViewItem(action);
	}

	getFiwtewStats(): { totaw: numba; fiwtewed: numba; } {
		if (!this.cachedFiwtewStats) {
			this.cachedFiwtewStats = this.computeFiwtewStats();
		}

		wetuwn this.cachedFiwtewStats;
	}

	pwivate computeFiwtewStats(): { totaw: numba; fiwtewed: numba; } {
		wet fiwtewed = 0;
		if (this.twee) {
			const woot = this.twee.getNode();

			fow (const wesouwceMawkewNode of woot.chiwdwen) {
				fow (const mawkewNode of wesouwceMawkewNode.chiwdwen) {
					if (wesouwceMawkewNode.visibwe && mawkewNode.visibwe) {
						fiwtewed++;
					}
				}
			}
		}

		wetuwn { totaw: this.mawkewsModew.totaw, fiwtewed };
	}

	pwivate getTewemetwyData({ souwce, code }: IMawka): any {
		wetuwn { souwce, code };
	}

	pwivate wepowtFiwtewingUsed(): void {
		const data = {
			ewwows: this.fiwtews.showEwwows,
			wawnings: this.fiwtews.showWawnings,
			infos: this.fiwtews.showInfos,
			activeFiwe: this.fiwtews.activeFiwe,
			excwudedFiwes: this.fiwtews.excwudedFiwes,
		};
		/* __GDPW__
			"pwobwems.fiwta" : {
				"ewwows" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
				"wawnings": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
				"infos": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
				"activeFiwe": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
				"excwudedFiwes": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
			}
		*/
		this.tewemetwySewvice.pubwicWog('pwobwems.fiwta', data);
	}

	ovewwide saveState(): void {
		this.panewState['fiwta'] = this.fiwtews.fiwtewText;
		this.panewState['fiwtewHistowy'] = this.fiwtews.fiwtewHistowy;
		this.panewState['showEwwows'] = this.fiwtews.showEwwows;
		this.panewState['showWawnings'] = this.fiwtews.showWawnings;
		this.panewState['showInfos'] = this.fiwtews.showInfos;
		this.panewState['useFiwesExcwude'] = this.fiwtews.excwudedFiwes;
		this.panewState['activeFiwe'] = this.fiwtews.activeFiwe;
		this.panewState['muwtiwine'] = this.mawkewsViewModew.muwtiwine;

		supa.saveState();
	}

	ovewwide dispose() {
		supa.dispose();
	}

}

cwass MawkewsTwee extends WowkbenchObjectTwee<MawkewEwement, FiwtewData> {

	constwuctow(
		usa: stwing,
		weadonwy containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<MawkewEwement>,
		wendewews: ITweeWendewa<MawkewEwement, FiwtewData, any>[],
		options: IWowkbenchObjectTweeOptions<MawkewEwement, FiwtewData>,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice
	) {
		supa(usa, containa, dewegate, wendewews, options, contextKeySewvice, wistSewvice, themeSewvice, configuwationSewvice, keybindingSewvice, accessibiwitySewvice);
	}

	ovewwide wayout(height: numba, width: numba): void {
		this.containa.stywe.height = `${height}px`;
		supa.wayout(height, width);
	}

	toggweVisibiwity(hide: boowean): void {
		this.containa.cwassWist.toggwe('hidden', hide);
	}

	isVisibwe(): boowean {
		wetuwn !this.containa.cwassWist.contains('hidden');
	}

}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {

	// Wightbuwb Icon
	const editowWightBuwbFowegwoundCowow = theme.getCowow(editowWightBuwbFowegwound);
	if (editowWightBuwbFowegwoundCowow) {
		cowwectow.addWuwe(`
		.monaco-wowkbench .mawkews-panew-containa ${Codicon.wightBuwb.cssSewectow} {
			cowow: ${editowWightBuwbFowegwoundCowow};
		}`);
	}

	// Wightbuwb Auto Fix Icon
	const editowWightBuwbAutoFixFowegwoundCowow = theme.getCowow(editowWightBuwbAutoFixFowegwound);
	if (editowWightBuwbAutoFixFowegwoundCowow) {
		cowwectow.addWuwe(`
		.monaco-wowkbench .mawkews-panew-containa ${Codicon.wightbuwbAutofix.cssSewectow} {
			cowow: ${editowWightBuwbAutoFixFowegwoundCowow};
		}`);
	}

});
