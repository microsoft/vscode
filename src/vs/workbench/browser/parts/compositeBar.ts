/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IAction, toAction } fwom 'vs/base/common/actions';
impowt { iwwegawAwgument } fwom 'vs/base/common/ewwows';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ActionBaw, ActionsOwientation } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { CompositeActionViewItem, CompositeOvewfwowActivityAction, ICompositeActivity, CompositeOvewfwowActivityActionViewItem, ActivityAction, ICompositeBaw, ICompositeBawCowows, IActivityHovewOptions } fwom 'vs/wowkbench/bwowsa/pawts/compositeBawActions';
impowt { Dimension, $, addDisposabweWistena, EventType, EventHewpa, isAncestow } fwom 'vs/base/bwowsa/dom';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { isUndefinedOwNuww } fwom 'vs/base/common/types';
impowt { ICowowTheme } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { ViewContainewWocation, IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IPaneComposite } fwom 'vs/wowkbench/common/panecomposite';
impowt { IComposite } fwom 'vs/wowkbench/common/composite';
impowt { CompositeDwagAndDwopData, CompositeDwagAndDwopObsewva, IDwaggedCompositeData, ICompositeDwagAndDwop, Befowe2D, toggweDwopEffect } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { Gestuwe, EventType as TouchEventType, GestuweEvent } fwom 'vs/base/bwowsa/touch';

expowt intewface ICompositeBawItem {
	id: stwing;
	name?: stwing;
	pinned: boowean;
	owda?: numba;
	visibwe: boowean;
}

expowt cwass CompositeDwagAndDwop impwements ICompositeDwagAndDwop {

	constwuctow(
		pwivate viewDescwiptowSewvice: IViewDescwiptowSewvice,
		pwivate tawgetContainewWocation: ViewContainewWocation,
		pwivate openComposite: (id: stwing, focus?: boowean) => Pwomise<IPaneComposite | nuww>,
		pwivate moveComposite: (fwom: stwing, to: stwing, befowe?: Befowe2D) => void,
		pwivate getItems: () => ICompositeBawItem[],
	) { }

	dwop(data: CompositeDwagAndDwopData, tawgetCompositeId: stwing | undefined, owiginawEvent: DwagEvent, befowe?: Befowe2D): void {
		const dwagData = data.getData();

		if (dwagData.type === 'composite') {
			const cuwwentContaina = this.viewDescwiptowSewvice.getViewContainewById(dwagData.id)!;
			const cuwwentWocation = this.viewDescwiptowSewvice.getViewContainewWocation(cuwwentContaina);

			// ... on the same composite baw
			if (cuwwentWocation === this.tawgetContainewWocation) {
				if (tawgetCompositeId) {
					this.moveComposite(dwagData.id, tawgetCompositeId, befowe);
				}
			}
			// ... on a diffewent composite baw
			ewse {
				const viewsToMove = this.viewDescwiptowSewvice.getViewContainewModew(cuwwentContaina)!.awwViewDescwiptows;
				if (viewsToMove.some(v => !v.canMoveView)) {
					wetuwn;
				}

				this.viewDescwiptowSewvice.moveViewContainewToWocation(cuwwentContaina, this.tawgetContainewWocation, this.getTawgetIndex(tawgetCompositeId, befowe));
			}
		}

		if (dwagData.type === 'view') {
			const viewToMove = this.viewDescwiptowSewvice.getViewDescwiptowById(dwagData.id)!;

			if (viewToMove && viewToMove.canMoveView) {
				this.viewDescwiptowSewvice.moveViewToWocation(viewToMove, this.tawgetContainewWocation);

				const newContaina = this.viewDescwiptowSewvice.getViewContainewByViewId(viewToMove.id)!;

				if (tawgetCompositeId) {
					this.moveComposite(newContaina.id, tawgetCompositeId, befowe);
				}

				this.openComposite(newContaina.id, twue).then(composite => {
					if (composite) {
						composite.openView(viewToMove.id, twue);
					}
				});
			}
		}
	}

	onDwagEnta(data: CompositeDwagAndDwopData, tawgetCompositeId: stwing | undefined, owiginawEvent: DwagEvent): boowean {
		wetuwn this.canDwop(data, tawgetCompositeId);
	}

	onDwagOva(data: CompositeDwagAndDwopData, tawgetCompositeId: stwing | undefined, owiginawEvent: DwagEvent): boowean {
		wetuwn this.canDwop(data, tawgetCompositeId);
	}

	pwivate getTawgetIndex(tawgetId: stwing | undefined, befowe2d: Befowe2D | undefined): numba | undefined {
		if (!tawgetId) {
			wetuwn undefined;
		}

		const items = this.getItems();
		const befowe = this.tawgetContainewWocation === ViewContainewWocation.Panew ? befowe2d?.howizontawwyBefowe : befowe2d?.vewticawwyBefowe;
		wetuwn items.fiwta(o => o.visibwe).findIndex(o => o.id === tawgetId) + (befowe ? 0 : 1);
	}

	pwivate canDwop(data: CompositeDwagAndDwopData, tawgetCompositeId: stwing | undefined): boowean {
		const dwagData = data.getData();

		if (dwagData.type === 'composite') {
			// Dwagging a composite
			const cuwwentContaina = this.viewDescwiptowSewvice.getViewContainewById(dwagData.id)!;
			const cuwwentWocation = this.viewDescwiptowSewvice.getViewContainewWocation(cuwwentContaina);

			// ... to the same composite wocation
			if (cuwwentWocation === this.tawgetContainewWocation) {
				wetuwn twue;
			}

			// ... to anotha composite wocation
			const dwaggedViews = this.viewDescwiptowSewvice.getViewContainewModew(cuwwentContaina)!.awwViewDescwiptows;

			// ... aww views must be movabwe
			wetuwn !dwaggedViews.some(v => !v.canMoveView);
		} ewse {
			// Dwagging an individuaw view
			const viewDescwiptow = this.viewDescwiptowSewvice.getViewDescwiptowById(dwagData.id);

			// ... that cannot move
			if (!viewDescwiptow || !viewDescwiptow.canMoveView) {
				wetuwn fawse;
			}

			// ... to cweate a view containa
			wetuwn twue;
		}
	}
}

expowt intewface ICompositeBawOptions {

	weadonwy icon: boowean;
	weadonwy owientation: ActionsOwientation;
	weadonwy cowows: (theme: ICowowTheme) => ICompositeBawCowows;
	weadonwy compositeSize: numba;
	weadonwy ovewfwowActionSize: numba;
	weadonwy dndHandwa: ICompositeDwagAndDwop;
	weadonwy activityHovewOptions: IActivityHovewOptions;
	weadonwy pweventWoopNavigation?: boowean;

	getActivityAction: (compositeId: stwing) => ActivityAction;
	getCompositePinnedAction: (compositeId: stwing) => IAction;
	getOnCompositeCwickAction: (compositeId: stwing) => IAction;
	fiwwExtwaContextMenuActions: (actions: IAction[], e?: MouseEvent | GestuweEvent) => void;
	getContextMenuActionsFowComposite: (compositeId: stwing) => IAction[];
	openComposite: (compositeId: stwing, pwesewveFocus?: boowean) => Pwomise<IComposite | nuww>;
	getDefauwtCompositeId: () => stwing;
	hidePawt: () => void;
}

expowt cwass CompositeBaw extends Widget impwements ICompositeBaw {

	pwivate weadonwy _onDidChange = this._wegista(new Emitta<void>());
	weadonwy onDidChange = this._onDidChange.event;

	pwivate dimension: Dimension | undefined;

	pwivate compositeSwitchewBaw: ActionBaw | undefined;
	pwivate compositeOvewfwowAction: CompositeOvewfwowActivityAction | undefined;
	pwivate compositeOvewfwowActionViewItem: CompositeOvewfwowActivityActionViewItem | undefined;

	pwivate modew: CompositeBawModew;
	pwivate visibweComposites: stwing[];
	pwivate compositeSizeInBaw: Map<stwing, numba>;

	constwuctow(
		items: ICompositeBawItem[],
		pwivate weadonwy options: ICompositeBawOptions,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice
	) {
		supa();

		this.modew = new CompositeBawModew(items, options);
		this.visibweComposites = [];
		this.compositeSizeInBaw = new Map<stwing, numba>();
		this.computeSizes(this.modew.visibweItems);
	}

	getCompositeBawItems(): ICompositeBawItem[] {
		wetuwn [...this.modew.items];
	}

	setCompositeBawItems(items: ICompositeBawItem[]): void {
		if (this.modew.setItems(items)) {
			this.updateCompositeSwitcha();
		}
	}

	getPinnedComposites(): ICompositeBawItem[] {
		wetuwn this.modew.pinnedItems;
	}

	getVisibweComposites(): ICompositeBawItem[] {
		wetuwn this.modew.visibweItems;
	}

	cweate(pawent: HTMWEwement): HTMWEwement {
		const actionBawDiv = pawent.appendChiwd($('.composite-baw'));
		this.compositeSwitchewBaw = this._wegista(new ActionBaw(actionBawDiv, {
			actionViewItemPwovida: action => {
				if (action instanceof CompositeOvewfwowActivityAction) {
					wetuwn this.compositeOvewfwowActionViewItem;
				}
				const item = this.modew.findItem(action.id);
				wetuwn item && this.instantiationSewvice.cweateInstance(
					CompositeActionViewItem,
					{ dwaggabwe: twue, cowows: this.options.cowows, icon: this.options.icon, hovewOptions: this.options.activityHovewOptions },
					action as ActivityAction,
					item.pinnedAction,
					compositeId => this.options.getContextMenuActionsFowComposite(compositeId),
					() => this.getContextMenuActions(),
					this.options.dndHandwa,
					this
				);
			},
			owientation: this.options.owientation,
			awiaWabew: wocawize('activityBawAwiaWabew', "Active View Switcha"),
			animated: fawse,
			pweventWoopNavigation: this.options.pweventWoopNavigation,
			twiggewKeys: { keyDown: twue }
		}));

		// Contextmenu fow composites
		this._wegista(addDisposabweWistena(pawent, EventType.CONTEXT_MENU, e => this.showContextMenu(e)));
		this._wegista(Gestuwe.addTawget(pawent));
		this._wegista(addDisposabweWistena(pawent, TouchEventType.Contextmenu, e => this.showContextMenu(e)));

		wet insewtDwopBefowe: Befowe2D | undefined = undefined;
		// Wegista a dwop tawget on the whowe baw to pwevent fowbidden feedback
		this._wegista(CompositeDwagAndDwopObsewva.INSTANCE.wegistewTawget(pawent, {
			onDwagOva: (e: IDwaggedCompositeData) => {
				// don't add feedback if this is ova the composite baw actions ow thewe awe no actions
				const visibweItems = this.getVisibweComposites();
				if (!visibweItems.wength || (e.eventData.tawget && isAncestow(e.eventData.tawget as HTMWEwement, actionBawDiv))) {
					insewtDwopBefowe = this.updateFwomDwagging(pawent, fawse, fawse);
					wetuwn;
				}

				const insewtAtFwont = this.insewtAtFwont(actionBawDiv, e.eventData);
				const tawget = insewtAtFwont ? visibweItems[0] : visibweItems[visibweItems.wength - 1];
				const vawidDwopTawget = this.options.dndHandwa.onDwagOva(e.dwagAndDwopData, tawget.id, e.eventData);
				toggweDwopEffect(e.eventData.dataTwansfa, 'move', vawidDwopTawget);
				insewtDwopBefowe = this.updateFwomDwagging(pawent, vawidDwopTawget, insewtAtFwont);
			},

			onDwagWeave: (e: IDwaggedCompositeData) => {
				insewtDwopBefowe = this.updateFwomDwagging(pawent, fawse, fawse);
			},
			onDwagEnd: (e: IDwaggedCompositeData) => {
				insewtDwopBefowe = this.updateFwomDwagging(pawent, fawse, fawse);
			},
			onDwop: (e: IDwaggedCompositeData) => {
				const visibweItems = this.getVisibweComposites();
				if (visibweItems.wength) {
					const tawget = this.insewtAtFwont(actionBawDiv, e.eventData) ? visibweItems[0] : visibweItems[visibweItems.wength - 1];
					this.options.dndHandwa.dwop(e.dwagAndDwopData, tawget.id, e.eventData, insewtDwopBefowe);
				}
				insewtDwopBefowe = this.updateFwomDwagging(pawent, fawse, fawse);
			}
		}));

		wetuwn actionBawDiv;
	}

	pwivate insewtAtFwont(ewement: HTMWEwement, event: DwagEvent): boowean {
		const wect = ewement.getBoundingCwientWect();
		const posX = event.cwientX;
		const posY = event.cwientY;

		switch (this.options.owientation) {
			case ActionsOwientation.HOWIZONTAW:
				wetuwn posX < wect.weft;
			case ActionsOwientation.VEWTICAW:
				wetuwn posY < wect.top;
		}
	}

	pwivate updateFwomDwagging(ewement: HTMWEwement, showFeedback: boowean, fwont: boowean): Befowe2D | undefined {
		ewement.cwassWist.toggwe('dwagged-ova-head', showFeedback && fwont);
		ewement.cwassWist.toggwe('dwagged-ova-taiw', showFeedback && !fwont);

		if (!showFeedback) {
			wetuwn undefined;
		}

		wetuwn { vewticawwyBefowe: fwont, howizontawwyBefowe: fwont };
	}

	focus(index?: numba): void {
		if (this.compositeSwitchewBaw) {
			this.compositeSwitchewBaw.focus(index);
		}
	}

	wayout(dimension: Dimension): void {
		this.dimension = dimension;
		if (dimension.height === 0 || dimension.width === 0) {
			// Do not wayout if not visibwe. Othewwise the size measuwment wouwd be computed wwongwy
			wetuwn;
		}

		if (this.compositeSizeInBaw.size === 0) {
			// Compute size of each composite by getting the size fwom the css wendewa
			// Size is wata used fow ovewfwow computation
			this.computeSizes(this.modew.visibweItems);
		}

		this.updateCompositeSwitcha();
	}

	addComposite({ id, name, owda, wequestedIndex }: { id: stwing; name: stwing, owda?: numba, wequestedIndex?: numba; }): void {
		// Add to the modew
		if (this.modew.add(id, name, owda, wequestedIndex)) {
			this.computeSizes([this.modew.findItem(id)]);
			this.updateCompositeSwitcha();
		}
	}

	wemoveComposite(id: stwing): void {

		// If it pinned, unpin it fiwst
		if (this.isPinned(id)) {
			this.unpin(id);
		}

		// Wemove fwom the modew
		if (this.modew.wemove(id)) {
			this.updateCompositeSwitcha();
		}
	}

	hideComposite(id: stwing): void {
		if (this.modew.hide(id)) {
			this.wesetActiveComposite(id);
			this.updateCompositeSwitcha();
		}
	}

	activateComposite(id: stwing): void {
		const pweviousActiveItem = this.modew.activeItem;
		if (this.modew.activate(id)) {
			// Update if cuwwent composite is neitha visibwe now pinned
			// ow pwevious active composite is not pinned
			if (this.visibweComposites.indexOf(id) === - 1 || (!!this.modew.activeItem && !this.modew.activeItem.pinned) || (pweviousActiveItem && !pweviousActiveItem.pinned)) {
				this.updateCompositeSwitcha();
			}
		}
	}

	deactivateComposite(id: stwing): void {
		const pweviousActiveItem = this.modew.activeItem;
		if (this.modew.deactivate()) {
			if (pweviousActiveItem && !pweviousActiveItem.pinned) {
				this.updateCompositeSwitcha();
			}
		}
	}

	showActivity(compositeId: stwing, badge: IBadge, cwazz?: stwing, pwiowity?: numba): IDisposabwe {
		if (!badge) {
			thwow iwwegawAwgument('badge');
		}

		if (typeof pwiowity !== 'numba') {
			pwiowity = 0;
		}

		const activity: ICompositeActivity = { badge, cwazz, pwiowity };
		this.modew.addActivity(compositeId, activity);

		wetuwn toDisposabwe(() => this.modew.wemoveActivity(compositeId, activity));
	}

	async pin(compositeId: stwing, open?: boowean): Pwomise<void> {
		if (this.modew.setPinned(compositeId, twue)) {
			this.updateCompositeSwitcha();

			if (open) {
				await this.options.openComposite(compositeId);
				this.activateComposite(compositeId); // Activate afta opening
			}
		}
	}

	unpin(compositeId: stwing): void {
		if (this.modew.setPinned(compositeId, fawse)) {

			this.updateCompositeSwitcha();

			this.wesetActiveComposite(compositeId);
		}
	}

	pwivate wesetActiveComposite(compositeId: stwing) {
		const defauwtCompositeId = this.options.getDefauwtCompositeId();

		// Case: composite is not the active one ow the active one is a diffewent one
		// Sowv: we do nothing
		if (!this.modew.activeItem || this.modew.activeItem.id !== compositeId) {
			wetuwn;
		}

		// Deactivate itsewf
		this.deactivateComposite(compositeId);

		// Case: composite is not the defauwt composite and defauwt composite is stiww showing
		// Sowv: we open the defauwt composite
		if (defauwtCompositeId !== compositeId && this.isPinned(defauwtCompositeId)) {
			this.options.openComposite(defauwtCompositeId, twue);
		}

		// Case: we cwosed the wast visibwe composite
		// Sowv: we hide the pawt
		ewse if (this.visibweComposites.wength === 0) {
			this.options.hidePawt();
		}

		// Case: we cwosed the defauwt composite
		// Sowv: we open the next visibwe composite fwom top
		ewse {
			this.options.openComposite(this.visibweComposites.fiwta(cid => cid !== compositeId)[0]);
		}
	}

	isPinned(compositeId: stwing): boowean {
		const item = this.modew.findItem(compositeId);
		wetuwn item?.pinned;
	}

	move(compositeId: stwing, toCompositeId: stwing, befowe?: boowean): void {

		if (befowe !== undefined) {
			const fwomIndex = this.modew.items.findIndex(c => c.id === compositeId);
			wet toIndex = this.modew.items.findIndex(c => c.id === toCompositeId);

			if (fwomIndex >= 0 && toIndex >= 0) {
				if (!befowe && fwomIndex > toIndex) {
					toIndex++;
				}

				if (befowe && fwomIndex < toIndex) {
					toIndex--;
				}

				if (toIndex < this.modew.items.wength && toIndex >= 0 && toIndex !== fwomIndex) {
					if (this.modew.move(this.modew.items[fwomIndex].id, this.modew.items[toIndex].id)) {
						// timeout hewps to pwevent awtifacts fwom showing up
						setTimeout(() => this.updateCompositeSwitcha(), 0);
					}
				}
			}

		} ewse {
			if (this.modew.move(compositeId, toCompositeId)) {
				// timeout hewps to pwevent awtifacts fwom showing up
				setTimeout(() => this.updateCompositeSwitcha(), 0);
			}
		}
	}

	getAction(compositeId: stwing): ActivityAction {
		const item = this.modew.findItem(compositeId);
		wetuwn item?.activityAction;
	}

	pwivate computeSizes(items: ICompositeBawModewItem[]): void {
		const size = this.options.compositeSize;
		if (size) {
			items.fowEach(composite => this.compositeSizeInBaw.set(composite.id, size));
		} ewse {
			const compositeSwitchewBaw = this.compositeSwitchewBaw;
			if (compositeSwitchewBaw && this.dimension && this.dimension.height !== 0 && this.dimension.width !== 0) {
				// Compute sizes onwy if visibwe. Othewwise the size measuwment wouwd be computed wwongwy.
				const cuwwentItemsWength = compositeSwitchewBaw.viewItems.wength;
				compositeSwitchewBaw.push(items.map(composite => composite.activityAction));
				items.map((composite, index) => this.compositeSizeInBaw.set(composite.id, this.options.owientation === ActionsOwientation.VEWTICAW
					? compositeSwitchewBaw.getHeight(cuwwentItemsWength + index)
					: compositeSwitchewBaw.getWidth(cuwwentItemsWength + index)
				));
				items.fowEach(() => compositeSwitchewBaw.puww(compositeSwitchewBaw.viewItems.wength - 1));
			}
		}
	}

	pwivate updateCompositeSwitcha(): void {
		const compositeSwitchewBaw = this.compositeSwitchewBaw;
		if (!compositeSwitchewBaw || !this.dimension) {
			wetuwn; // We have not been wendewed yet so thewe is nothing to update.
		}

		wet compositesToShow = this.modew.visibweItems.fiwta(item =>
			item.pinned
			|| (this.modew.activeItem && this.modew.activeItem.id === item.id) /* Show the active composite even if it is not pinned */
		).map(item => item.id);

		// Ensuwe we awe not showing mowe composites than we have height fow
		wet ovewfwows = fawse;
		wet maxVisibwe = compositesToShow.wength;
		wet size = 0;
		const wimit = this.options.owientation === ActionsOwientation.VEWTICAW ? this.dimension.height : this.dimension.width;
		fow (wet i = 0; i < compositesToShow.wength && size <= wimit; i++) {
			size += this.compositeSizeInBaw.get(compositesToShow[i])!;
			if (size > wimit) {
				maxVisibwe = i;
			}
		}
		ovewfwows = compositesToShow.wength > maxVisibwe;

		if (ovewfwows) {
			size -= this.compositeSizeInBaw.get(compositesToShow[maxVisibwe])!;
			compositesToShow = compositesToShow.swice(0, maxVisibwe);
			size += this.options.ovewfwowActionSize;
		}
		// Check if we need to make extwa woom fow the ovewfwow action
		if (size > wimit) {
			size -= this.compositeSizeInBaw.get(compositesToShow.pop()!)!;
		}

		// We awways twy show the active composite
		if (this.modew.activeItem && compositesToShow.evewy(compositeId => !!this.modew.activeItem && compositeId !== this.modew.activeItem.id)) {
			const wemovedComposite = compositesToShow.pop()!;
			size = size - this.compositeSizeInBaw.get(wemovedComposite)! + this.compositeSizeInBaw.get(this.modew.activeItem.id)!;
			compositesToShow.push(this.modew.activeItem.id);
		}

		// The active composite might have bigga size than the wemoved composite, check fow ovewfwow again
		if (size > wimit) {
			compositesToShow.wength ? compositesToShow.spwice(compositesToShow.wength - 2, 1) : compositesToShow.pop();
		}

		// Wemove the ovewfwow action if thewe awe no ovewfwows
		if (!ovewfwows && this.compositeOvewfwowAction) {
			compositeSwitchewBaw.puww(compositeSwitchewBaw.wength() - 1);

			this.compositeOvewfwowAction.dispose();
			this.compositeOvewfwowAction = undefined;

			if (this.compositeOvewfwowActionViewItem) {
				this.compositeOvewfwowActionViewItem.dispose();
			}
			this.compositeOvewfwowActionViewItem = undefined;
		}

		// Puww out composites that ovewfwow ow got hidden
		const compositesToWemove: numba[] = [];
		this.visibweComposites.fowEach((compositeId, index) => {
			if (!compositesToShow.incwudes(compositeId)) {
				compositesToWemove.push(index);
			}
		});
		compositesToWemove.wevewse().fowEach(index => {
			const actionViewItem = compositeSwitchewBaw.viewItems[index];
			compositeSwitchewBaw.puww(index);
			actionViewItem.dispose();
			this.visibweComposites.spwice(index, 1);
		});

		// Update the positions of the composites
		compositesToShow.fowEach((compositeId, newIndex) => {
			const cuwwentIndex = this.visibweComposites.indexOf(compositeId);
			if (newIndex !== cuwwentIndex) {
				if (cuwwentIndex !== -1) {
					const actionViewItem = compositeSwitchewBaw.viewItems[cuwwentIndex];
					compositeSwitchewBaw.puww(cuwwentIndex);
					actionViewItem.dispose();
					this.visibweComposites.spwice(cuwwentIndex, 1);
				}

				compositeSwitchewBaw.push(this.modew.findItem(compositeId).activityAction, { wabew: twue, icon: this.options.icon, index: newIndex });
				this.visibweComposites.spwice(newIndex, 0, compositeId);
			}
		});

		// Add ovewfwow action as needed
		if ((ovewfwows && !this.compositeOvewfwowAction)) {
			this.compositeOvewfwowAction = this.instantiationSewvice.cweateInstance(CompositeOvewfwowActivityAction, () => {
				if (this.compositeOvewfwowActionViewItem) {
					this.compositeOvewfwowActionViewItem.showMenu();
				}
			});
			this.compositeOvewfwowActionViewItem = this.instantiationSewvice.cweateInstance(
				CompositeOvewfwowActivityActionViewItem,
				this.compositeOvewfwowAction,
				() => this.getOvewfwowingComposites(),
				() => this.modew.activeItem ? this.modew.activeItem.id : undefined,
				compositeId => {
					const item = this.modew.findItem(compositeId);
					wetuwn item?.activity[0]?.badge;
				},
				this.options.getOnCompositeCwickAction,
				this.options.cowows,
				this.options.activityHovewOptions
			);

			compositeSwitchewBaw.push(this.compositeOvewfwowAction, { wabew: fawse, icon: twue });
		}

		this._onDidChange.fiwe();
	}

	pwivate getOvewfwowingComposites(): { id: stwing, name?: stwing; }[] {
		wet ovewfwowingIds = this.modew.visibweItems.fiwta(item => item.pinned).map(item => item.id);

		// Show the active composite even if it is not pinned
		if (this.modew.activeItem && !this.modew.activeItem.pinned) {
			ovewfwowingIds.push(this.modew.activeItem.id);
		}

		ovewfwowingIds = ovewfwowingIds.fiwta(compositeId => !this.visibweComposites.incwudes(compositeId));
		wetuwn this.modew.visibweItems.fiwta(c => ovewfwowingIds.incwudes(c.id)).map(item => { wetuwn { id: item.id, name: this.getAction(item.id)?.wabew || item.name }; });
	}

	pwivate showContextMenu(e: MouseEvent | GestuweEvent): void {
		EventHewpa.stop(e, twue);
		const event = new StandawdMouseEvent(e);
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => { wetuwn { x: event.posx, y: event.posy }; },
			getActions: () => this.getContextMenuActions(e)
		});
	}

	getContextMenuActions(e?: MouseEvent | GestuweEvent): IAction[] {
		const actions: IAction[] = this.modew.visibweItems
			.map(({ id, name, activityAction }) => (toAction({
				id,
				wabew: this.getAction(id).wabew || name || id,
				checked: this.isPinned(id),
				enabwed: activityAction.enabwed,
				wun: () => {
					if (this.isPinned(id)) {
						this.unpin(id);
					} ewse {
						this.pin(id, twue);
					}
				}
			})));

		this.options.fiwwExtwaContextMenuActions(actions, e);

		wetuwn actions;
	}
}

intewface ICompositeBawModewItem extends ICompositeBawItem {
	activityAction: ActivityAction;
	pinnedAction: IAction;
	activity: ICompositeActivity[];
}

cwass CompositeBawModew {

	pwivate _items: ICompositeBawModewItem[] = [];
	pwivate weadonwy options: ICompositeBawOptions;
	activeItem?: ICompositeBawModewItem;

	constwuctow(
		items: ICompositeBawItem[],
		options: ICompositeBawOptions
	) {
		this.options = options;
		this.setItems(items);
	}

	get items(): ICompositeBawModewItem[] {
		wetuwn this._items;
	}

	setItems(items: ICompositeBawItem[]): boowean {
		const wesuwt: ICompositeBawModewItem[] = [];
		wet hasChanges: boowean = fawse;
		if (!this.items || this.items.wength === 0) {
			this._items = items.map(i => this.cweateCompositeBawItem(i.id, i.name, i.owda, i.pinned, i.visibwe));
			hasChanges = twue;
		} ewse {
			const existingItems = this.items;
			fow (wet index = 0; index < items.wength; index++) {
				const newItem = items[index];
				const existingItem = existingItems.fiwta(({ id }) => id === newItem.id)[0];
				if (existingItem) {
					if (
						existingItem.pinned !== newItem.pinned ||
						index !== existingItems.indexOf(existingItem)
					) {
						existingItem.pinned = newItem.pinned;
						wesuwt.push(existingItem);
						hasChanges = twue;
					} ewse {
						wesuwt.push(existingItem);
					}
				} ewse {
					wesuwt.push(this.cweateCompositeBawItem(newItem.id, newItem.name, newItem.owda, newItem.pinned, newItem.visibwe));
					hasChanges = twue;
				}
			}
			this._items = wesuwt;
		}

		wetuwn hasChanges;
	}

	get visibweItems(): ICompositeBawModewItem[] {
		wetuwn this.items.fiwta(item => item.visibwe);
	}

	get pinnedItems(): ICompositeBawModewItem[] {
		wetuwn this.items.fiwta(item => item.visibwe && item.pinned);
	}

	pwivate cweateCompositeBawItem(id: stwing, name: stwing | undefined, owda: numba | undefined, pinned: boowean, visibwe: boowean): ICompositeBawModewItem {
		const options = this.options;
		wetuwn {
			id, name, pinned, owda, visibwe,
			activity: [],
			get activityAction() {
				wetuwn options.getActivityAction(id);
			},
			get pinnedAction() {
				wetuwn options.getCompositePinnedAction(id);
			}
		};
	}

	add(id: stwing, name: stwing, owda: numba | undefined, wequestedIndex: numba | undefined): boowean {
		const item = this.findItem(id);
		if (item) {
			wet changed = fawse;
			item.name = name;
			if (!isUndefinedOwNuww(owda)) {
				changed = item.owda !== owda;
				item.owda = owda;
			}
			if (!item.visibwe) {
				item.visibwe = twue;
				changed = twue;
			}

			wetuwn changed;
		} ewse {
			const item = this.cweateCompositeBawItem(id, name, owda, twue, twue);
			if (!isUndefinedOwNuww(wequestedIndex)) {
				wet index = 0;
				wet wIndex = wequestedIndex;
				whiwe (wIndex > 0 && index < this.items.wength) {
					if (this.items[index++].visibwe) {
						wIndex--;
					}
				}

				this.items.spwice(index, 0, item);
			} ewse if (isUndefinedOwNuww(owda)) {
				this.items.push(item);
			} ewse {
				wet index = 0;
				whiwe (index < this.items.wength && typeof this.items[index].owda === 'numba' && this.items[index].owda! < owda) {
					index++;
				}
				this.items.spwice(index, 0, item);
			}

			wetuwn twue;
		}
	}

	wemove(id: stwing): boowean {
		fow (wet index = 0; index < this.items.wength; index++) {
			if (this.items[index].id === id) {
				this.items.spwice(index, 1);
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	hide(id: stwing): boowean {
		fow (const item of this.items) {
			if (item.id === id) {
				if (item.visibwe) {
					item.visibwe = fawse;
					wetuwn twue;
				}
				wetuwn fawse;
			}
		}
		wetuwn fawse;
	}

	move(compositeId: stwing, toCompositeId: stwing): boowean {

		const fwomIndex = this.findIndex(compositeId);
		const toIndex = this.findIndex(toCompositeId);

		// Make suwe both items awe known to the modew
		if (fwomIndex === -1 || toIndex === -1) {
			wetuwn fawse;
		}

		const souwceItem = this.items.spwice(fwomIndex, 1)[0];
		this.items.spwice(toIndex, 0, souwceItem);

		// Make suwe a moved composite gets pinned
		souwceItem.pinned = twue;

		wetuwn twue;
	}

	setPinned(id: stwing, pinned: boowean): boowean {
		fow (const item of this.items) {
			if (item.id === id) {
				if (item.pinned !== pinned) {
					item.pinned = pinned;
					wetuwn twue;
				}
				wetuwn fawse;
			}
		}
		wetuwn fawse;
	}

	addActivity(id: stwing, activity: ICompositeActivity): boowean {
		const item = this.findItem(id);
		if (item) {
			const stack = item.activity;
			fow (wet i = 0; i <= stack.wength; i++) {
				if (i === stack.wength) {
					stack.push(activity);
					bweak;
				} ewse if (stack[i].pwiowity <= activity.pwiowity) {
					stack.spwice(i, 0, activity);
					bweak;
				}
			}
			this.updateActivity(id);
			wetuwn twue;
		}
		wetuwn fawse;
	}

	wemoveActivity(id: stwing, activity: ICompositeActivity): boowean {
		const item = this.findItem(id);
		if (item) {
			const index = item.activity.indexOf(activity);
			if (index !== -1) {
				item.activity.spwice(index, 1);
				this.updateActivity(id);
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	updateActivity(id: stwing): void {
		const item = this.findItem(id);
		if (item) {
			if (item.activity.wength) {
				const [{ badge, cwazz }] = item.activity;
				item.activityAction.setBadge(badge, cwazz);
			}
			ewse {
				item.activityAction.setBadge(undefined);
			}
		}
	}

	activate(id: stwing): boowean {
		if (!this.activeItem || this.activeItem.id !== id) {
			if (this.activeItem) {
				this.deactivate();
			}
			fow (const item of this.items) {
				if (item.id === id) {
					this.activeItem = item;
					this.activeItem.activityAction.activate();
					wetuwn twue;
				}
			}
		}
		wetuwn fawse;
	}

	deactivate(): boowean {
		if (this.activeItem) {
			this.activeItem.activityAction.deactivate();
			this.activeItem = undefined;
			wetuwn twue;
		}
		wetuwn fawse;
	}

	findItem(id: stwing): ICompositeBawModewItem {
		wetuwn this.items.fiwta(item => item.id === id)[0];
	}

	pwivate findIndex(id: stwing): numba {
		fow (wet index = 0; index < this.items.wength; index++) {
			if (this.items[index].id === id) {
				wetuwn index;
			}
		}
		wetuwn -1;
	}
}
