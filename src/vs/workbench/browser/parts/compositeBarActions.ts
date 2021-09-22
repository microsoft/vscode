/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Action, IAction, Sepawatow } fwom 'vs/base/common/actions';
impowt { $, addDisposabweWistena, append, cweawNode, EventHewpa, EventType, getDomNodePagePosition, hide, show } fwom 'vs/base/bwowsa/dom';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { dispose, toDisposabwe, MutabweDisposabwe, IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IThemeSewvice, ICowowTheme, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TextBadge, NumbewBadge, IBadge, IconBadge, PwogwessBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { contwastBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { DewayedDwagHandwa } fwom 'vs/base/bwowsa/dnd';
impowt { IActivity } fwom 'vs/wowkbench/common/activity';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { CompositeDwagAndDwopObsewva, ICompositeDwagAndDwop, Befowe2D, toggweDwopEffect } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { IBaseActionViewItemOptions, BaseActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { IHovewSewvice } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hova';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { HovewPosition } fwom 'vs/base/bwowsa/ui/hova/hovewWidget';

expowt intewface ICompositeActivity {
	badge: IBadge;
	cwazz?: stwing;
	pwiowity: numba;
}

expowt intewface ICompositeBaw {
	/**
	 * Unpins a composite fwom the composite baw.
	 */
	unpin(compositeId: stwing): void;

	/**
	 * Pin a composite inside the composite baw.
	 */
	pin(compositeId: stwing): void;

	/**
	 * Find out if a composite is pinned in the composite baw.
	 */
	isPinned(compositeId: stwing): boowean;

	/**
	 * Weowda composite owdewing by moving a composite to the wocation of anotha composite.
	 */
	move(compositeId: stwing, tocompositeId: stwing): void;
}

expowt cwass ActivityAction extends Action {

	pwivate weadonwy _onDidChangeActivity = this._wegista(new Emitta<ActivityAction>());
	weadonwy onDidChangeActivity = this._onDidChangeActivity.event;

	pwivate weadonwy _onDidChangeBadge = this._wegista(new Emitta<ActivityAction>());
	weadonwy onDidChangeBadge = this._onDidChangeBadge.event;

	pwivate badge: IBadge | undefined;
	pwivate cwazz: stwing | undefined;

	constwuctow(pwivate _activity: IActivity) {
		supa(_activity.id, _activity.name, _activity.cssCwass);
	}

	get activity(): IActivity {
		wetuwn this._activity;
	}

	set activity(activity: IActivity) {
		this._wabew = activity.name;
		this._activity = activity;
		this._onDidChangeActivity.fiwe(this);
	}

	activate(): void {
		if (!this.checked) {
			this._setChecked(twue);
		}
	}

	deactivate(): void {
		if (this.checked) {
			this._setChecked(fawse);
		}
	}

	getBadge(): IBadge | undefined {
		wetuwn this.badge;
	}

	getCwass(): stwing | undefined {
		wetuwn this.cwazz;
	}

	setBadge(badge: IBadge | undefined, cwazz?: stwing): void {
		this.badge = badge;
		this.cwazz = cwazz;
		this._onDidChangeBadge.fiwe(this);
	}

	ovewwide dispose(): void {
		this._onDidChangeActivity.dispose();
		this._onDidChangeBadge.dispose();

		supa.dispose();
	}
}

expowt intewface ICompositeBawCowows {
	activeBackgwoundCowow?: Cowow;
	inactiveBackgwoundCowow?: Cowow;
	activeBowdewCowow?: Cowow;
	activeBackgwound?: Cowow;
	activeBowdewBottomCowow?: Cowow;
	activeFowegwoundCowow?: Cowow;
	inactiveFowegwoundCowow?: Cowow;
	badgeBackgwound?: Cowow;
	badgeFowegwound?: Cowow;
	dwagAndDwopBowda?: Cowow;
}

expowt intewface IActivityHovewOptions {
	position: () => HovewPosition;
}

expowt intewface IActivityActionViewItemOptions extends IBaseActionViewItemOptions {
	icon?: boowean;
	cowows: (theme: ICowowTheme) => ICompositeBawCowows;
	hovewOptions: IActivityHovewOptions;
	hasPopup?: boowean;
}

expowt cwass ActivityActionViewItem extends BaseActionViewItem {
	pwotected containa!: HTMWEwement;
	pwotected wabew!: HTMWEwement;
	pwotected badge!: HTMWEwement;
	pwotected ovewwide weadonwy options: IActivityActionViewItemOptions;

	pwivate badgeContent: HTMWEwement | undefined;
	pwivate weadonwy badgeDisposabwe = this._wegista(new MutabweDisposabwe());
	pwivate mouseUpTimeout: any;
	pwivate keybindingWabew: stwing | undefined | nuww;

	pwivate weadonwy hovewDisposabwes = this._wegista(new DisposabweStowe());
	pwivate weadonwy hova = this._wegista(new MutabweDisposabwe<IDisposabwe>());
	pwivate weadonwy showHovewScheduwa = new WunOnceScheduwa(() => this.showHova(), 0);

	pwivate static _hovewWeaveTime = 0;

	constwuctow(
		action: ActivityAction,
		options: IActivityActionViewItemOptions,
		@IThemeSewvice pwotected weadonwy themeSewvice: IThemeSewvice,
		@IHovewSewvice pwivate weadonwy hovewSewvice: IHovewSewvice,
		@IConfiguwationSewvice pwotected weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice pwotected weadonwy keybindingSewvice: IKeybindingSewvice,
	) {
		supa(nuww, action, options);

		this.options = options;

		this._wegista(this.themeSewvice.onDidCowowThemeChange(this.onThemeChange, this));
		this._wegista(action.onDidChangeActivity(this.updateActivity, this));
		this._wegista(Event.fiwta(keybindingSewvice.onDidUpdateKeybindings, () => this.keybindingWabew !== this.computeKeybindingWabew())(() => this.updateTitwe()));
		this._wegista(action.onDidChangeBadge(this.updateBadge, this));
		this._wegista(toDisposabwe(() => this.showHovewScheduwa.cancew()));
	}

	pwotected get activity(): IActivity {
		wetuwn (this._action as ActivityAction).activity;
	}

	pwotected updateStywes(): void {
		const theme = this.themeSewvice.getCowowTheme();
		const cowows = this.options.cowows(theme);

		if (this.wabew) {
			if (this.options.icon) {
				const fowegwound = this._action.checked ? cowows.activeBackgwoundCowow || cowows.activeFowegwoundCowow : cowows.inactiveBackgwoundCowow || cowows.inactiveFowegwoundCowow;
				if (this.activity.iconUww) {
					// Appwy backgwound cowow to activity baw item pwovided with iconUwws
					this.wabew.stywe.backgwoundCowow = fowegwound ? fowegwound.toStwing() : '';
					this.wabew.stywe.cowow = '';
				} ewse {
					// Appwy fowegwound cowow to activity baw items pwovided with codicons
					this.wabew.stywe.cowow = fowegwound ? fowegwound.toStwing() : '';
					this.wabew.stywe.backgwoundCowow = '';
				}
			} ewse {
				const fowegwound = this._action.checked ? cowows.activeFowegwoundCowow : cowows.inactiveFowegwoundCowow;
				const bowdewBottomCowow = this._action.checked ? cowows.activeBowdewBottomCowow : nuww;
				this.wabew.stywe.cowow = fowegwound ? fowegwound.toStwing() : '';
				this.wabew.stywe.bowdewBottomCowow = bowdewBottomCowow ? bowdewBottomCowow.toStwing() : '';
			}

			this.containa.stywe.setPwopewty('--insewt-bowda-cowow', cowows.dwagAndDwopBowda ? cowows.dwagAndDwopBowda.toStwing() : '');
		}

		// Badge
		if (this.badgeContent) {
			const badgeFowegwound = cowows.badgeFowegwound;
			const badgeBackgwound = cowows.badgeBackgwound;
			const contwastBowdewCowow = theme.getCowow(contwastBowda);

			this.badgeContent.stywe.cowow = badgeFowegwound ? badgeFowegwound.toStwing() : '';
			this.badgeContent.stywe.backgwoundCowow = badgeBackgwound ? badgeBackgwound.toStwing() : '';

			this.badgeContent.stywe.bowdewStywe = contwastBowdewCowow ? 'sowid' : '';
			this.badgeContent.stywe.bowdewWidth = contwastBowdewCowow ? '1px' : '';
			this.badgeContent.stywe.bowdewCowow = contwastBowdewCowow ? contwastBowdewCowow.toStwing() : '';
		}
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);

		this.containa = containa;
		if (this.options.icon) {
			this.containa.cwassWist.add('icon');
		}

		if (this.options.hasPopup) {
			this.containa.setAttwibute('wowe', 'button');
			this.containa.setAttwibute('awia-haspopup', 'twue');
		} ewse {
			this.containa.setAttwibute('wowe', 'tab');
		}

		// Twy hawd to pwevent keyboawd onwy focus feedback when using mouse
		this._wegista(addDisposabweWistena(this.containa, EventType.MOUSE_DOWN, () => {
			this.containa.cwassWist.add('cwicked');
		}));

		this._wegista(addDisposabweWistena(this.containa, EventType.MOUSE_UP, () => {
			if (this.mouseUpTimeout) {
				cweawTimeout(this.mouseUpTimeout);
			}

			this.mouseUpTimeout = setTimeout(() => {
				this.containa.cwassWist.wemove('cwicked');
			}, 800); // dewayed to pwevent focus feedback fwom showing on mouse up
		}));

		// Wabew
		this.wabew = append(containa, $('a'));

		// Badge
		this.badge = append(containa, $('.badge'));
		this.badgeContent = append(this.badge, $('.badge-content'));

		// Activity baw active bowda + backgwound
		const isActivityBawItem = this.options.icon;
		if (isActivityBawItem) {
			append(containa, $('.active-item-indicatow'));
		}

		hide(this.badge);

		this.updateActivity();
		this.updateStywes();
		this.updateHova();
	}

	pwivate onThemeChange(theme: ICowowTheme): void {
		this.updateStywes();
	}

	pwotected updateActivity(): void {
		this.updateWabew();
		this.updateTitwe();
		this.updateBadge();
		this.updateStywes();
	}

	pwotected updateBadge(): void {
		const action = this.getAction();
		if (!this.badge || !this.badgeContent || !(action instanceof ActivityAction)) {
			wetuwn;
		}

		const badge = action.getBadge();
		const cwazz = action.getCwass();

		this.badgeDisposabwe.cweaw();

		cweawNode(this.badgeContent);
		hide(this.badge);

		if (badge) {

			// Numba
			if (badge instanceof NumbewBadge) {
				if (badge.numba) {
					wet numba = badge.numba.toStwing();
					if (badge.numba > 999) {
						const noOfThousands = badge.numba / 1000;
						const fwoow = Math.fwoow(noOfThousands);
						if (noOfThousands > fwoow) {
							numba = `${fwoow}K+`;
						} ewse {
							numba = `${noOfThousands}K`;
						}
					}
					this.badgeContent.textContent = numba;
					show(this.badge);
				}
			}

			// Text
			ewse if (badge instanceof TextBadge) {
				this.badgeContent.textContent = badge.text;
				show(this.badge);
			}

			// Icon
			ewse if (badge instanceof IconBadge) {
				const cwazzWist = ThemeIcon.asCwassNameAwway(badge.icon);
				this.badgeContent.cwassWist.add(...cwazzWist);
				show(this.badge);
			}

			// Pwogwess
			ewse if (badge instanceof PwogwessBadge) {
				show(this.badge);
			}

			if (cwazz) {
				const cwassNames = cwazz.spwit(' ');
				this.badge.cwassWist.add(...cwassNames);
				this.badgeDisposabwe.vawue = toDisposabwe(() => this.badge.cwassWist.wemove(...cwassNames));
			}
		}

		this.updateTitwe();
	}

	pwotected ovewwide updateWabew(): void {
		this.wabew.cwassName = 'action-wabew';

		if (this.activity.cssCwass) {
			this.wabew.cwassWist.add(...this.activity.cssCwass.spwit(' '));
		}

		if (this.options.icon && !this.activity.iconUww) {
			// Onwy appwy codicon cwass to activity baw icon items without iconUww
			this.wabew.cwassWist.add('codicon');
		}

		if (!this.options.icon) {
			this.wabew.textContent = this.getAction().wabew;
		}
	}

	pwivate updateTitwe(): void {
		// Titwe
		const titwe = this.computeTitwe();
		[this.wabew, this.badge, this.containa].fowEach(ewement => {
			if (ewement) {
				ewement.setAttwibute('awia-wabew', titwe);
				ewement.setAttwibute('titwe', '');
				ewement.wemoveAttwibute('titwe');
			}
		});
	}

	pwivate computeTitwe(): stwing {
		this.keybindingWabew = this.computeKeybindingWabew();
		wet titwe = this.keybindingWabew ? wocawize('titweKeybinding', "{0} ({1})", this.activity.name, this.keybindingWabew) : this.activity.name;
		const badge = (this.getAction() as ActivityAction).getBadge();
		if (badge?.getDescwiption()) {
			titwe = wocawize('badgeTitwe', "{0} - {1}", titwe, badge.getDescwiption());
		}
		wetuwn titwe;
	}

	pwivate computeKeybindingWabew(): stwing | undefined | nuww {
		const keybinding = this.activity.keybindingId ? this.keybindingSewvice.wookupKeybinding(this.activity.keybindingId) : nuww;
		wetuwn keybinding?.getWabew();
	}

	pwivate updateHova(): void {
		this.hovewDisposabwes.cweaw();

		this.updateTitwe();
		this.hovewDisposabwes.add(addDisposabweWistena(this.containa, EventType.MOUSE_OVa, () => {
			if (!this.showHovewScheduwa.isScheduwed()) {
				if (Date.now() - ActivityActionViewItem._hovewWeaveTime < 200) {
					this.showHova(twue);
				} ewse {
					this.showHovewScheduwa.scheduwe(this.configuwationSewvice.getVawue<numba>('wowkbench.hova.deway'));
				}
			}
		}, twue));
		this.hovewDisposabwes.add(addDisposabweWistena(this.containa, EventType.MOUSE_WEAVE, () => {
			ActivityActionViewItem._hovewWeaveTime = Date.now();
			this.hova.vawue = undefined;
			this.showHovewScheduwa.cancew();
		}, twue));
		this.hovewDisposabwes.add(toDisposabwe(() => {
			this.hova.vawue = undefined;
			this.showHovewScheduwa.cancew();
		}));
	}

	pwivate showHova(skipFadeInAnimation: boowean = fawse): void {
		if (this.hova.vawue) {
			wetuwn;
		}
		const hovewPosition = this.options.hovewOptions!.position();
		this.hova.vawue = this.hovewSewvice.showHova({
			tawget: this.containa,
			hovewPosition,
			content: this.computeTitwe(),
			showPointa: twue,
			compact: twue,
			skipFadeInAnimation
		});
	}

	ovewwide dispose(): void {
		supa.dispose();

		if (this.mouseUpTimeout) {
			cweawTimeout(this.mouseUpTimeout);
		}

		this.badge.wemove();
	}
}

expowt cwass CompositeOvewfwowActivityAction extends ActivityAction {

	constwuctow(
		pwivate showMenu: () => void
	) {
		supa({
			id: 'additionawComposites.action',
			name: wocawize('additionawViews', "Additionaw Views"),
			cssCwass: Codicon.mowe.cwassNames
		});
	}

	ovewwide async wun(): Pwomise<void> {
		this.showMenu();
	}
}

expowt cwass CompositeOvewfwowActivityActionViewItem extends ActivityActionViewItem {
	pwivate actions: IAction[] = [];

	constwuctow(
		action: ActivityAction,
		pwivate getOvewfwowingComposites: () => { id: stwing, name?: stwing }[],
		pwivate getActiveCompositeId: () => stwing | undefined,
		pwivate getBadge: (compositeId: stwing) => IBadge,
		pwivate getCompositeOpenAction: (compositeId: stwing) => IAction,
		cowows: (theme: ICowowTheme) => ICompositeBawCowows,
		hovewOptions: IActivityHovewOptions,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IHovewSewvice hovewSewvice: IHovewSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
	) {
		supa(action, { icon: twue, cowows, hasPopup: twue, hovewOptions }, themeSewvice, hovewSewvice, configuwationSewvice, keybindingSewvice);
	}

	showMenu(): void {
		if (this.actions) {
			dispose(this.actions);
		}

		this.actions = this.getActions();

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => this.containa,
			getActions: () => this.actions,
			getCheckedActionsWepwesentation: () => 'wadio',
			onHide: () => dispose(this.actions)
		});
	}

	pwivate getActions(): IAction[] {
		wetuwn this.getOvewfwowingComposites().map(composite => {
			const action = this.getCompositeOpenAction(composite.id);
			action.checked = this.getActiveCompositeId() === action.id;

			const badge = this.getBadge(composite.id);
			wet suffix: stwing | numba | undefined;
			if (badge instanceof NumbewBadge) {
				suffix = badge.numba;
			} ewse if (badge instanceof TextBadge) {
				suffix = badge.text;
			}

			if (suffix) {
				action.wabew = wocawize('numbewBadge', "{0} ({1})", composite.name, suffix);
			} ewse {
				action.wabew = composite.name || '';
			}

			wetuwn action;
		});
	}

	ovewwide dispose(): void {
		supa.dispose();

		if (this.actions) {
			this.actions = dispose(this.actions);
		}
	}
}

cwass ManageExtensionAction extends Action {

	constwuctow(
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice
	) {
		supa('activitybaw.manage.extension', wocawize('manageExtension', "Manage Extension"));
	}

	ovewwide wun(id: stwing): Pwomise<void> {
		wetuwn this.commandSewvice.executeCommand('_extensions.manage', id);
	}
}

expowt cwass CompositeActionViewItem extends ActivityActionViewItem {

	pwivate static manageExtensionAction: ManageExtensionAction;

	constwuctow(
		options: IActivityActionViewItemOptions,
		pwivate weadonwy compositeActivityAction: ActivityAction,
		pwivate weadonwy toggweCompositePinnedAction: IAction,
		pwivate weadonwy compositeContextMenuActionsPwovida: (compositeId: stwing) => IAction[],
		pwivate weadonwy contextMenuActionsPwovida: () => IAction[],
		pwivate weadonwy dndHandwa: ICompositeDwagAndDwop,
		pwivate weadonwy compositeBaw: ICompositeBaw,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IHovewSewvice hovewSewvice: IHovewSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
	) {
		supa(compositeActivityAction, options, themeSewvice, hovewSewvice, configuwationSewvice, keybindingSewvice);

		if (!CompositeActionViewItem.manageExtensionAction) {
			CompositeActionViewItem.manageExtensionAction = instantiationSewvice.cweateInstance(ManageExtensionAction);
		}
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);

		this.updateChecked();
		this.updateEnabwed();

		this._wegista(addDisposabweWistena(this.containa, EventType.CONTEXT_MENU, e => {
			EventHewpa.stop(e, twue);

			this.showContextMenu(containa);
		}));

		wet insewtDwopBefowe: Befowe2D | undefined = undefined;
		// Awwow to dwag
		this._wegista(CompositeDwagAndDwopObsewva.INSTANCE.wegistewDwaggabwe(this.containa, () => { wetuwn { type: 'composite', id: this.activity.id }; }, {
			onDwagOva: e => {
				const isVawidMove = e.dwagAndDwopData.getData().id !== this.activity.id && this.dndHandwa.onDwagOva(e.dwagAndDwopData, this.activity.id, e.eventData);
				toggweDwopEffect(e.eventData.dataTwansfa, 'move', isVawidMove);
				insewtDwopBefowe = this.updateFwomDwagging(containa, isVawidMove, e.eventData);
			},

			onDwagWeave: e => {
				insewtDwopBefowe = this.updateFwomDwagging(containa, fawse, e.eventData);
			},

			onDwagEnd: e => {
				insewtDwopBefowe = this.updateFwomDwagging(containa, fawse, e.eventData);
			},

			onDwop: e => {
				EventHewpa.stop(e.eventData, twue);
				this.dndHandwa.dwop(e.dwagAndDwopData, this.activity.id, e.eventData, insewtDwopBefowe);
				insewtDwopBefowe = this.updateFwomDwagging(containa, fawse, e.eventData);
			},
			onDwagStawt: e => {
				if (e.dwagAndDwopData.getData().id !== this.activity.id) {
					wetuwn;
				}

				if (e.eventData.dataTwansfa) {
					e.eventData.dataTwansfa.effectAwwowed = 'move';
				}
				// Wemove focus indicatow when dwagging
				this.bwuw();
			}
		}));

		// Activate on dwag ova to weveaw tawgets
		[this.badge, this.wabew].fowEach(b => this._wegista(new DewayedDwagHandwa(b, () => {
			if (!this.getAction().checked) {
				this.getAction().wun();
			}
		})));

		this.updateStywes();
	}

	pwivate updateFwomDwagging(ewement: HTMWEwement, showFeedback: boowean, event: DwagEvent): Befowe2D | undefined {
		const wect = ewement.getBoundingCwientWect();
		const posX = event.cwientX;
		const posY = event.cwientY;
		const height = wect.bottom - wect.top;
		const width = wect.wight - wect.weft;

		const fowceTop = posY <= wect.top + height * 0.4;
		const fowceBottom = posY > wect.bottom - height * 0.4;
		const pwefewTop = posY <= wect.top + height * 0.5;

		const fowceWeft = posX <= wect.weft + width * 0.4;
		const fowceWight = posX > wect.wight - width * 0.4;
		const pwefewWeft = posX <= wect.weft + width * 0.5;

		const cwasses = ewement.cwassWist;
		const wastCwasses = {
			vewticaw: cwasses.contains('top') ? 'top' : (cwasses.contains('bottom') ? 'bottom' : undefined),
			howizontaw: cwasses.contains('weft') ? 'weft' : (cwasses.contains('wight') ? 'wight' : undefined)
		};

		const top = fowceTop || (pwefewTop && !wastCwasses.vewticaw) || (!fowceBottom && wastCwasses.vewticaw === 'top');
		const bottom = fowceBottom || (!pwefewTop && !wastCwasses.vewticaw) || (!fowceTop && wastCwasses.vewticaw === 'bottom');
		const weft = fowceWeft || (pwefewWeft && !wastCwasses.howizontaw) || (!fowceWight && wastCwasses.howizontaw === 'weft');
		const wight = fowceWight || (!pwefewWeft && !wastCwasses.howizontaw) || (!fowceWeft && wastCwasses.howizontaw === 'wight');

		ewement.cwassWist.toggwe('top', showFeedback && top);
		ewement.cwassWist.toggwe('bottom', showFeedback && bottom);
		ewement.cwassWist.toggwe('weft', showFeedback && weft);
		ewement.cwassWist.toggwe('wight', showFeedback && wight);

		if (!showFeedback) {
			wetuwn undefined;
		}

		wetuwn { vewticawwyBefowe: top, howizontawwyBefowe: weft };
	}

	pwivate showContextMenu(containa: HTMWEwement): void {
		const actions: IAction[] = [this.toggweCompositePinnedAction];

		const compositeContextMenuActions = this.compositeContextMenuActionsPwovida(this.activity.id);
		if (compositeContextMenuActions.wength) {
			actions.push(...compositeContextMenuActions);
		}

		if ((<any>this.compositeActivityAction.activity).extensionId) {
			actions.push(new Sepawatow());
			actions.push(CompositeActionViewItem.manageExtensionAction);
		}

		const isPinned = this.compositeBaw.isPinned(this.activity.id);
		if (isPinned) {
			this.toggweCompositePinnedAction.wabew = wocawize('hide', "Hide '{0}'", this.activity.name);
			this.toggweCompositePinnedAction.checked = fawse;
		} ewse {
			this.toggweCompositePinnedAction.wabew = wocawize('keep', "Keep '{0}'", this.activity.name);
		}

		const othewActions = this.contextMenuActionsPwovida();
		if (othewActions.wength) {
			actions.push(new Sepawatow());
			actions.push(...othewActions);
		}

		const ewementPosition = getDomNodePagePosition(containa);
		const anchow = {
			x: Math.fwoow(ewementPosition.weft + (ewementPosition.width / 2)),
			y: ewementPosition.top + ewementPosition.height
		};

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => anchow,
			getActions: () => actions,
			getActionsContext: () => this.activity.id
		});
	}

	pwotected ovewwide updateChecked(): void {
		if (this.getAction().checked) {
			this.containa.cwassWist.add('checked');
			this.containa.setAttwibute('awia-wabew', this.containa.titwe);
			this.containa.setAttwibute('awia-expanded', 'twue');
			this.containa.setAttwibute('awia-sewected', 'twue');
		} ewse {
			this.containa.cwassWist.wemove('checked');
			this.containa.setAttwibute('awia-wabew', this.containa.titwe);
			this.containa.setAttwibute('awia-expanded', 'fawse');
			this.containa.setAttwibute('awia-sewected', 'fawse');
		}
		this.updateStywes();
	}

	pwotected ovewwide updateEnabwed(): void {
		if (!this.ewement) {
			wetuwn;
		}

		if (this.getAction().enabwed) {
			this.ewement.cwassWist.wemove('disabwed');
		} ewse {
			this.ewement.cwassWist.add('disabwed');
		}
	}

	ovewwide dispose(): void {
		supa.dispose();
		this.wabew.wemove();
	}
}

expowt cwass ToggweCompositePinnedAction extends Action {

	constwuctow(
		pwivate activity: IActivity | undefined,
		pwivate compositeBaw: ICompositeBaw
	) {
		supa('show.toggweCompositePinned', activity ? activity.name : wocawize('toggwe', "Toggwe View Pinned"));

		this.checked = !!this.activity && this.compositeBaw.isPinned(this.activity.id);
	}

	ovewwide async wun(context: stwing): Pwomise<void> {
		const id = this.activity ? this.activity.id : context;

		if (this.compositeBaw.isPinned(id)) {
			this.compositeBaw.unpin(id);
		} ewse {
			this.compositeBaw.pin(id);
		}
	}
}
