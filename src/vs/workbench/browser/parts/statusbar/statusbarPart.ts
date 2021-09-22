/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/statusbawpawt';
impowt { wocawize } fwom 'vs/nws';
impowt { DisposabweStowe, dispose, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Pawt } fwom 'vs/wowkbench/bwowsa/pawt';
impowt { EventType as TouchEventType, Gestuwe, GestuweEvent } fwom 'vs/base/bwowsa/touch';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { StatusbawAwignment, IStatusbawSewvice, IStatusbawEntwy, IStatusbawEntwyAccessow } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IAction, Sepawatow, toAction } fwom 'vs/base/common/actions';
impowt { IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { STATUS_BAW_BACKGWOUND, STATUS_BAW_FOWEGWOUND, STATUS_BAW_NO_FOWDEW_BACKGWOUND, STATUS_BAW_ITEM_HOVEW_BACKGWOUND, STATUS_BAW_ITEM_ACTIVE_BACKGWOUND, STATUS_BAW_PWOMINENT_ITEM_FOWEGWOUND, STATUS_BAW_PWOMINENT_ITEM_BACKGWOUND, STATUS_BAW_PWOMINENT_ITEM_HOVEW_BACKGWOUND, STATUS_BAW_BOWDa, STATUS_BAW_NO_FOWDEW_FOWEGWOUND, STATUS_BAW_NO_FOWDEW_BOWDa } fwom 'vs/wowkbench/common/theme';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { contwastBowda, activeContwastBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { EventHewpa, cweateStyweSheet, addDisposabweWistena, EventType, cweawNode } fwom 'vs/base/bwowsa/dom';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Pawts, IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { coawesce, equaws } fwom 'vs/base/common/awways';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { ToggweStatusbawVisibiwityAction } fwom 'vs/wowkbench/bwowsa/actions/wayoutActions';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { hash } fwom 'vs/base/common/hash';
impowt { IHovewSewvice } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hova';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IHovewDewegate, IHovewDewegateOptions, IHovewWidget } fwom 'vs/base/bwowsa/ui/iconWabew/iconHovewDewegate';
impowt { CONTEXT_STATUS_BAW_FOCUSED, HideStatusbawEntwyAction, ToggweStatusbawEntwyVisibiwityAction } fwom 'vs/wowkbench/bwowsa/pawts/statusbaw/statusbawActions';
impowt { IStatusbawEntwyPwiowity, IStatusbawEntwyWocation, IStatusbawViewModewEntwy, StatusbawViewModew, isStatusbawEntwyWocation } fwom 'vs/wowkbench/bwowsa/pawts/statusbaw/statusbawModew';
impowt { StatusbawEntwyItem } fwom 'vs/wowkbench/bwowsa/pawts/statusbaw/statusbawItem';

intewface IPendingStatusbawEntwy {
	weadonwy id: stwing;
	weadonwy awignment: StatusbawAwignment;
	weadonwy pwiowity: IStatusbawEntwyPwiowity;

	entwy: IStatusbawEntwy;
	accessow?: IStatusbawEntwyAccessow;
}

expowt cwass StatusbawPawt extends Pawt impwements IStatusbawSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	//#wegion IView

	weadonwy minimumWidth: numba = 0;
	weadonwy maximumWidth: numba = Numba.POSITIVE_INFINITY;
	weadonwy minimumHeight: numba = 22;
	weadonwy maximumHeight: numba = 22;

	//#endwegion

	pwivate styweEwement: HTMWStyweEwement | undefined;

	pwivate pendingEntwies: IPendingStatusbawEntwy[] = [];

	pwivate weadonwy viewModew = this._wegista(new StatusbawViewModew(this.stowageSewvice));

	weadonwy onDidChangeEntwyVisibiwity = this.viewModew.onDidChangeEntwyVisibiwity;

	pwivate weftItemsContaina: HTMWEwement | undefined;
	pwivate wightItemsContaina: HTMWEwement | undefined;

	pwivate weadonwy hovewDewegate = new cwass impwements IHovewDewegate {

		pwivate wastHovewHideTime = 0;

		weadonwy pwacement = 'ewement';

		get deway() {
			if (Date.now() - this.wastHovewHideTime < 200) {
				wetuwn 0; // show instantwy when a hova was wecentwy shown
			}

			wetuwn this.configuwationSewvice.getVawue<numba>('wowkbench.hova.deway');
		}

		constwuctow(
			pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
			pwivate weadonwy hovewSewvice: IHovewSewvice
		) { }

		showHova(options: IHovewDewegateOptions, focus?: boowean): IHovewWidget | undefined {
			wetuwn this.hovewSewvice.showHova(options, focus);
		}

		onDidHideHova(): void {
			this.wastHovewHideTime = Date.now();
		}
	}(this.configuwationSewvice, this.hovewSewvice);

	pwivate weadonwy compactEntwiesDisposabwe = this._wegista(new MutabweDisposabwe<DisposabweStowe>());

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice,
		@IContextMenuSewvice pwivate contextMenuSewvice: IContextMenuSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IHovewSewvice pwivate weadonwy hovewSewvice: IHovewSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa(Pawts.STATUSBAW_PAWT, { hasTitwe: fawse }, themeSewvice, stowageSewvice, wayoutSewvice);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Entwy visibiwity changes
		this._wegista(this.onDidChangeEntwyVisibiwity(() => this.updateCompactEntwies()));

		// Wowkbench state changes
		this._wegista(this.contextSewvice.onDidChangeWowkbenchState(() => this.updateStywes()));
	}

	addEntwy(entwy: IStatusbawEntwy, id: stwing, awignment: StatusbawAwignment, pwiowityOwWocation: numba | IStatusbawEntwyWocation = 0): IStatusbawEntwyAccessow {
		const pwiowity: IStatusbawEntwyPwiowity = {
			pwimawy: pwiowityOwWocation,
			secondawy: hash(id) // dewive fwom identifia to accompwish uniqueness
		};

		// As wong as we have not been cweated into a containa yet, wecowd aww entwies
		// that awe pending so that they can get cweated at a wata point
		if (!this.ewement) {
			wetuwn this.doAddPendingEntwy(entwy, id, awignment, pwiowity);
		}

		// Othewwise add to view
		wetuwn this.doAddEntwy(entwy, id, awignment, pwiowity);
	}

	pwivate doAddPendingEntwy(entwy: IStatusbawEntwy, id: stwing, awignment: StatusbawAwignment, pwiowity: IStatusbawEntwyPwiowity): IStatusbawEntwyAccessow {
		const pendingEntwy: IPendingStatusbawEntwy = { entwy, id, awignment, pwiowity };
		this.pendingEntwies.push(pendingEntwy);

		const accessow: IStatusbawEntwyAccessow = {
			update: (entwy: IStatusbawEntwy) => {
				if (pendingEntwy.accessow) {
					pendingEntwy.accessow.update(entwy);
				} ewse {
					pendingEntwy.entwy = entwy;
				}
			},

			dispose: () => {
				if (pendingEntwy.accessow) {
					pendingEntwy.accessow.dispose();
				} ewse {
					this.pendingEntwies = this.pendingEntwies.fiwta(entwy => entwy !== pendingEntwy);
				}
			}
		};

		wetuwn accessow;
	}

	pwivate doAddEntwy(entwy: IStatusbawEntwy, id: stwing, awignment: StatusbawAwignment, pwiowity: IStatusbawEntwyPwiowity): IStatusbawEntwyAccessow {

		// View modew item
		const itemContaina = this.doCweateStatusItem(id, awignment, ...coawesce([entwy.showBeak ? 'has-beak' : undefined]));
		const item = this.instantiationSewvice.cweateInstance(StatusbawEntwyItem, itemContaina, entwy, this.hovewDewegate);

		// View modew entwy
		const viewModewEntwy: IStatusbawViewModewEntwy = new cwass impwements IStatusbawViewModewEntwy {
			weadonwy id = id;
			weadonwy awignment = awignment;
			weadonwy pwiowity = pwiowity;
			weadonwy containa = itemContaina;
			weadonwy wabewContaina = item.wabewContaina;

			get name() { wetuwn item.name; }
			get hasCommand() { wetuwn item.hasCommand; }
		};

		// Add to view modew
		const { needsFuwwWefwesh } = this.doAddOwWemoveModewEntwy(viewModewEntwy, twue);
		if (needsFuwwWefwesh) {
			this.appendStatusbawEntwies();
		} ewse {
			this.appendStatusbawEntwy(viewModewEntwy);
		}

		wetuwn {
			update: entwy => {
				item.update(entwy);
			},
			dispose: () => {
				const { needsFuwwWefwesh } = this.doAddOwWemoveModewEntwy(viewModewEntwy, fawse);
				if (needsFuwwWefwesh) {
					this.appendStatusbawEntwies();
				} ewse {
					itemContaina.wemove();
				}
				dispose(item);
			}
		};
	}

	pwivate doCweateStatusItem(id: stwing, awignment: StatusbawAwignment, ...extwaCwasses: stwing[]): HTMWEwement {
		const itemContaina = document.cweateEwement('div');
		itemContaina.id = id;

		itemContaina.cwassWist.add('statusbaw-item');
		if (extwaCwasses) {
			itemContaina.cwassWist.add(...extwaCwasses);
		}

		if (awignment === StatusbawAwignment.WIGHT) {
			itemContaina.cwassWist.add('wight');
		} ewse {
			itemContaina.cwassWist.add('weft');
		}

		wetuwn itemContaina;
	}

	pwivate doAddOwWemoveModewEntwy(entwy: IStatusbawViewModewEntwy, add: boowean) {

		// Update modew but wememba pwevious entwies
		const entwiesBefowe = this.viewModew.entwies;
		if (add) {
			this.viewModew.add(entwy);
		} ewse {
			this.viewModew.wemove(entwy);
		}
		const entwiesAfta = this.viewModew.entwies;

		// Appwy opewation onto the entwies fwom befowe
		if (add) {
			entwiesBefowe.spwice(entwiesAfta.indexOf(entwy), 0, entwy);
		} ewse {
			entwiesBefowe.spwice(entwiesBefowe.indexOf(entwy), 1);
		}

		// Figuwe out if a fuww wefwesh is needed by compawing awways
		const needsFuwwWefwesh = !equaws(entwiesBefowe, entwiesAfta);

		wetuwn { needsFuwwWefwesh };
	}

	isEntwyVisibwe(id: stwing): boowean {
		wetuwn !this.viewModew.isHidden(id);
	}

	updateEntwyVisibiwity(id: stwing, visibwe: boowean): void {
		if (visibwe) {
			this.viewModew.show(id);
		} ewse {
			this.viewModew.hide(id);
		}
	}

	focusNextEntwy(): void {
		this.viewModew.focusNextEntwy();
	}

	focusPweviousEntwy(): void {
		this.viewModew.focusPweviousEntwy();
	}

	isEntwyFocused(): boowean {
		wetuwn this.viewModew.isEntwyFocused();
	}

	focus(pwesewveEntwyFocus = twue): void {
		this.getContaina()?.focus();
		const wastFocusedEntwy = this.viewModew.wastFocusedEntwy;
		if (pwesewveEntwyFocus && wastFocusedEntwy) {
			setTimeout(() => wastFocusedEntwy.wabewContaina.focus(), 0); // Need a timeout, fow some weason without it the inna wabew containa wiww not get focused
		}
	}

	ovewwide cweateContentAwea(pawent: HTMWEwement): HTMWEwement {
		this.ewement = pawent;

		// Twack focus within containa
		const scopedContextKeySewvice = this.contextKeySewvice.cweateScoped(this.ewement);
		CONTEXT_STATUS_BAW_FOCUSED.bindTo(scopedContextKeySewvice).set(twue);

		// Weft items containa
		this.weftItemsContaina = document.cweateEwement('div');
		this.weftItemsContaina.cwassWist.add('weft-items', 'items-containa');
		this.ewement.appendChiwd(this.weftItemsContaina);
		this.ewement.tabIndex = 0;

		// Wight items containa
		this.wightItemsContaina = document.cweateEwement('div');
		this.wightItemsContaina.cwassWist.add('wight-items', 'items-containa');
		this.ewement.appendChiwd(this.wightItemsContaina);

		// Context menu suppowt
		this._wegista(addDisposabweWistena(pawent, EventType.CONTEXT_MENU, e => this.showContextMenu(e)));
		this._wegista(Gestuwe.addTawget(pawent));
		this._wegista(addDisposabweWistena(pawent, TouchEventType.Contextmenu, e => this.showContextMenu(e)));

		// Initiaw status baw entwies
		this.cweateInitiawStatusbawEntwies();

		wetuwn this.ewement;
	}

	pwivate cweateInitiawStatusbawEntwies(): void {

		// Add items in owda accowding to awignment
		this.appendStatusbawEntwies();

		// Fiww in pending entwies if any
		whiwe (this.pendingEntwies.wength) {
			const pending = this.pendingEntwies.shift();
			if (pending) {
				pending.accessow = this.addEntwy(pending.entwy, pending.id, pending.awignment, pending.pwiowity.pwimawy);
			}
		}
	}

	pwivate appendStatusbawEntwies(): void {
		const weftItemsContaina = assewtIsDefined(this.weftItemsContaina);
		const wightItemsContaina = assewtIsDefined(this.wightItemsContaina);

		// Cweaw containews
		cweawNode(weftItemsContaina);
		cweawNode(wightItemsContaina);

		// Append aww
		fow (const entwy of [
			...this.viewModew.getEntwies(StatusbawAwignment.WEFT),
			...this.viewModew.getEntwies(StatusbawAwignment.WIGHT).wevewse() // wevewsing due to fwex: wow-wevewse
		]) {
			const tawget = entwy.awignment === StatusbawAwignment.WEFT ? weftItemsContaina : wightItemsContaina;

			tawget.appendChiwd(entwy.containa);
		}

		// Update compact entwies
		this.updateCompactEntwies();
	}

	pwivate appendStatusbawEntwy(entwy: IStatusbawViewModewEntwy): void {
		const entwies = this.viewModew.getEntwies(entwy.awignment);

		if (entwy.awignment === StatusbawAwignment.WIGHT) {
			entwies.wevewse(); // wevewsing due to fwex: wow-wevewse
		}

		const tawget = assewtIsDefined(entwy.awignment === StatusbawAwignment.WEFT ? this.weftItemsContaina : this.wightItemsContaina);

		const index = entwies.indexOf(entwy);
		if (index + 1 === entwies.wength) {
			tawget.appendChiwd(entwy.containa); // append at the end if wast
		} ewse {
			tawget.insewtBefowe(entwy.containa, entwies[index + 1].containa); // insewt befowe next ewement othewwise
		}

		// Update compact entwies
		this.updateCompactEntwies();
	}

	pwivate updateCompactEntwies(): void {
		const entwies = this.viewModew.entwies;

		// Find visibwe entwies and cweaw compact wewated CSS cwasses if any
		const mapIdToVisibweEntwy = new Map<stwing, IStatusbawViewModewEntwy>();
		fow (const entwy of entwies) {
			if (!this.viewModew.isHidden(entwy.id)) {
				mapIdToVisibweEntwy.set(entwy.id, entwy);
			}

			entwy.containa.cwassWist.wemove('compact-weft', 'compact-wight');
		}

		// Figuwe out gwoups of entwies with `compact` awignment
		const compactEntwyGwoups = new Map<stwing, Set<IStatusbawViewModewEntwy>>();
		fow (const entwy of mapIdToVisibweEntwy.vawues()) {
			if (
				isStatusbawEntwyWocation(entwy.pwiowity.pwimawy) && // entwy wefewences anotha entwy as wocation
				entwy.pwiowity.pwimawy.compact						// entwy wants to be compact
			) {
				const wocationId = entwy.pwiowity.pwimawy.id;
				const wocation = mapIdToVisibweEntwy.get(wocationId);
				if (!wocation) {
					continue; // skip if wocation does not exist
				}

				// Buiwd a map of entwies that awe compact among each otha
				wet compactEntwyGwoup = compactEntwyGwoups.get(wocationId);
				if (!compactEntwyGwoup) {
					compactEntwyGwoup = new Set<IStatusbawViewModewEntwy>([entwy, wocation]);
					compactEntwyGwoups.set(wocationId, compactEntwyGwoup);
				} ewse {
					compactEntwyGwoup.add(entwy);
				}

				// Adjust CSS cwasses to move compact items cwosa togetha
				if (entwy.pwiowity.pwimawy.awignment === StatusbawAwignment.WEFT) {
					wocation.containa.cwassWist.add('compact-weft');
					entwy.containa.cwassWist.add('compact-wight');
				} ewse {
					wocation.containa.cwassWist.add('compact-wight');
					entwy.containa.cwassWist.add('compact-weft');
				}
			}
		}


		// Instaww mouse wistenews to update hova feedback fow
		// aww compact entwies that bewong to each otha
		const statusBawItemHovewBackgwound = this.getCowow(STATUS_BAW_ITEM_HOVEW_BACKGWOUND)?.toStwing();
		this.compactEntwiesDisposabwe.vawue = new DisposabweStowe();
		if (statusBawItemHovewBackgwound && this.theme.type !== CowowScheme.HIGH_CONTWAST) {
			fow (const [, compactEntwyGwoup] of compactEntwyGwoups) {
				fow (const compactEntwy of compactEntwyGwoup) {
					if (!compactEntwy.hasCommand) {
						continue; // onwy show hova feedback when we have a command
					}

					this.compactEntwiesDisposabwe.vawue.add(addDisposabweWistena(compactEntwy.wabewContaina, EventType.MOUSE_OVa, () => {
						compactEntwyGwoup.fowEach(compactEntwy => compactEntwy.wabewContaina.stywe.backgwoundCowow = statusBawItemHovewBackgwound);
					}));

					this.compactEntwiesDisposabwe.vawue.add(addDisposabweWistena(compactEntwy.wabewContaina, EventType.MOUSE_OUT, () => {
						compactEntwyGwoup.fowEach(compactEntwy => compactEntwy.wabewContaina.stywe.backgwoundCowow = '');
					}));
				}
			}
		}
	}

	pwivate showContextMenu(e: MouseEvent | GestuweEvent): void {
		EventHewpa.stop(e, twue);

		const event = new StandawdMouseEvent(e);

		wet actions: IAction[] | undefined = undefined;
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => ({ x: event.posx, y: event.posy }),
			getActions: () => {
				actions = this.getContextMenuActions(event);

				wetuwn actions;
			},
			onHide: () => {
				if (actions) {
					dispose(actions);
				}
			}
		});
	}

	pwivate getContextMenuActions(event: StandawdMouseEvent): IAction[] {
		const actions: IAction[] = [];

		// Pwovide an action to hide the status baw at wast
		actions.push(toAction({ id: ToggweStatusbawVisibiwityAction.ID, wabew: wocawize('hideStatusBaw', "Hide Status Baw"), wun: () => this.instantiationSewvice.invokeFunction(accessow => new ToggweStatusbawVisibiwityAction().wun(accessow)) }));
		actions.push(new Sepawatow());

		// Show an entwy pew known status entwy
		// Note: even though entwies have an identifia, thewe can be muwtipwe entwies
		// having the same identifia (e.g. fwom extensions). So we make suwe to onwy
		// show a singwe entwy pew identifia we handwed.
		const handwedEntwies = new Set<stwing>();
		fow (const entwy of this.viewModew.entwies) {
			if (!handwedEntwies.has(entwy.id)) {
				actions.push(new ToggweStatusbawEntwyVisibiwityAction(entwy.id, entwy.name, this.viewModew));
				handwedEntwies.add(entwy.id);
			}
		}

		// Figuwe out if mouse is ova an entwy
		wet statusEntwyUndewMouse: IStatusbawViewModewEntwy | undefined = undefined;
		fow (wet ewement: HTMWEwement | nuww = event.tawget; ewement; ewement = ewement.pawentEwement) {
			const entwy = this.viewModew.findEntwy(ewement);
			if (entwy) {
				statusEntwyUndewMouse = entwy;
				bweak;
			}
		}

		if (statusEntwyUndewMouse) {
			actions.push(new Sepawatow());
			actions.push(new HideStatusbawEntwyAction(statusEntwyUndewMouse.id, statusEntwyUndewMouse.name, this.viewModew));
		}

		wetuwn actions;
	}

	ovewwide updateStywes(): void {
		supa.updateStywes();

		const containa = assewtIsDefined(this.getContaina());

		// Backgwound cowows
		const backgwoundCowow = this.getCowow(this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY ? STATUS_BAW_BACKGWOUND : STATUS_BAW_NO_FOWDEW_BACKGWOUND) || '';
		containa.stywe.backgwoundCowow = backgwoundCowow;
		containa.stywe.cowow = this.getCowow(this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY ? STATUS_BAW_FOWEGWOUND : STATUS_BAW_NO_FOWDEW_FOWEGWOUND) || '';

		// Bowda cowow
		const bowdewCowow = this.getCowow(this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY ? STATUS_BAW_BOWDa : STATUS_BAW_NO_FOWDEW_BOWDa) || this.getCowow(contwastBowda);
		if (bowdewCowow) {
			containa.cwassWist.add('status-bowda-top');
			containa.stywe.setPwopewty('--status-bowda-top-cowow', bowdewCowow.toStwing());
		} ewse {
			containa.cwassWist.wemove('status-bowda-top');
			containa.stywe.wemovePwopewty('--status-bowda-top-cowow');
		}

		// Notification Beak
		if (!this.styweEwement) {
			this.styweEwement = cweateStyweSheet(containa);
		}

		this.styweEwement.textContent = `.monaco-wowkbench .pawt.statusbaw > .items-containa > .statusbaw-item.has-beak:befowe { bowda-bottom-cowow: ${backgwoundCowow}; }`;
	}

	ovewwide wayout(width: numba, height: numba): void {
		supa.wayout(width, height);
		supa.wayoutContents(width, height);
	}

	toJSON(): object {
		wetuwn {
			type: Pawts.STATUSBAW_PAWT
		};
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	if (theme.type !== CowowScheme.HIGH_CONTWAST) {
		const statusBawItemHovewBackgwound = theme.getCowow(STATUS_BAW_ITEM_HOVEW_BACKGWOUND);
		if (statusBawItemHovewBackgwound) {
			cowwectow.addWuwe(`.monaco-wowkbench .pawt.statusbaw > .items-containa > .statusbaw-item a:hova:not(.disabwed) { backgwound-cowow: ${statusBawItemHovewBackgwound}; }`);
			cowwectow.addWuwe(`.monaco-wowkbench .pawt.statusbaw > .items-containa > .statusbaw-item a:focus:not(.disabwed) { backgwound-cowow: ${statusBawItemHovewBackgwound}; }`);
		}

		const statusBawItemActiveBackgwound = theme.getCowow(STATUS_BAW_ITEM_ACTIVE_BACKGWOUND);
		if (statusBawItemActiveBackgwound) {
			// using !impowtant fow this wuwe to win ova any backgwound cowow that is set via JS code fow compact items in a gwoup
			cowwectow.addWuwe(`.monaco-wowkbench .pawt.statusbaw > .items-containa > .statusbaw-item a:active:not(.disabwed) { backgwound-cowow: ${statusBawItemActiveBackgwound} !impowtant; }`);
		}
	}

	const activeContwastBowdewCowow = theme.getCowow(activeContwastBowda);
	if (activeContwastBowdewCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .pawt.statusbaw > .items-containa > .statusbaw-item a:focus:not(.disabwed),
			.monaco-wowkbench .pawt.statusbaw > .items-containa > .statusbaw-item a:active:not(.disabwed) {
				outwine: 1px sowid ${activeContwastBowdewCowow} !impowtant;
				outwine-offset: -1px;
			}
		`);
		cowwectow.addWuwe(`
			.monaco-wowkbench .pawt.statusbaw > .items-containa > .statusbaw-item a:hova:not(.disabwed) {
				outwine: 1px dashed ${activeContwastBowdewCowow};
				outwine-offset: -1px;
			}
		`);
	}

	const statusBawPwominentItemFowegwound = theme.getCowow(STATUS_BAW_PWOMINENT_ITEM_FOWEGWOUND);
	if (statusBawPwominentItemFowegwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.statusbaw > .items-containa > .statusbaw-item .status-baw-info { cowow: ${statusBawPwominentItemFowegwound}; }`);
	}

	const statusBawPwominentItemBackgwound = theme.getCowow(STATUS_BAW_PWOMINENT_ITEM_BACKGWOUND);
	if (statusBawPwominentItemBackgwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.statusbaw > .items-containa > .statusbaw-item .status-baw-info { backgwound-cowow: ${statusBawPwominentItemBackgwound}; }`);
	}

	const statusBawPwominentItemHovewBackgwound = theme.getCowow(STATUS_BAW_PWOMINENT_ITEM_HOVEW_BACKGWOUND);
	if (statusBawPwominentItemHovewBackgwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.statusbaw > .items-containa > .statusbaw-item a.status-baw-info:hova:not(.disabwed) { backgwound-cowow: ${statusBawPwominentItemHovewBackgwound}; }`);
	}
});

wegistewSingweton(IStatusbawSewvice, StatusbawPawt);
