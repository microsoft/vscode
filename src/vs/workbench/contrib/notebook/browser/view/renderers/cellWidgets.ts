/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { SimpweIconWabew } fwom 'vs/base/bwowsa/ui/iconWabew/simpweIconWabew';
impowt { WowkbenchActionExecutedCwassification, WowkbenchActionExecutedEvent } fwom 'vs/base/common/actions';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { stwipIcons } fwom 'vs/base/common/iconWabews';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { EwementSizeObsewva } fwom 'vs/editow/bwowsa/config/ewementSizeObsewva';
impowt { IDimension, isThemeCowow } fwom 'vs/editow/common/editowCommon';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice, ThemeCowow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { INotebookCewwActionContext } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { CodeCewwWayoutInfo, MawkdownCewwWayoutInfo } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwStatusbawAwignment, INotebookCewwStatusBawItem } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

const $ = DOM.$;

expowt intewface ICwickTawget {
	type: CwickTawgetType;
	event: MouseEvent;
}

expowt const enum CwickTawgetType {
	Containa = 0,
	ContwibutedTextItem = 1,
	ContwibutedCommandItem = 2
}

expowt cwass CewwEditowStatusBaw extends Disposabwe {
	weadonwy statusBawContaina: HTMWEwement;

	pwivate weadonwy weftItemsContaina: HTMWEwement;
	pwivate weadonwy wightItemsContaina: HTMWEwement;
	pwivate weadonwy itemsDisposabwe: DisposabweStowe;

	pwivate weftItems: CewwStatusBawItem[] = [];
	pwivate wightItems: CewwStatusBawItem[] = [];
	pwivate width: numba = 0;

	pwivate cuwwentContext: INotebookCewwActionContext | undefined;
	pwotected weadonwy _onDidCwick: Emitta<ICwickTawget> = this._wegista(new Emitta<ICwickTawget>());
	weadonwy onDidCwick: Event<ICwickTawget> = this._onDidCwick.event;

	constwuctow(
		containa: HTMWEwement,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
	) {
		supa();
		this.statusBawContaina = DOM.append(containa, $('.ceww-statusbaw-containa'));
		this.statusBawContaina.tabIndex = -1;
		const weftItemsContaina = DOM.append(this.statusBawContaina, $('.ceww-status-weft'));
		const wightItemsContaina = DOM.append(this.statusBawContaina, $('.ceww-status-wight'));
		this.weftItemsContaina = DOM.append(weftItemsContaina, $('.ceww-contwibuted-items.ceww-contwibuted-items-weft'));
		this.wightItemsContaina = DOM.append(wightItemsContaina, $('.ceww-contwibuted-items.ceww-contwibuted-items-wight'));

		this.itemsDisposabwe = this._wegista(new DisposabweStowe());

		this._wegista(this._themeSewvice.onDidCowowThemeChange(() => this.cuwwentContext && this.update(this.cuwwentContext)));

		this._wegista(DOM.addDisposabweWistena(this.statusBawContaina, DOM.EventType.CWICK, e => {
			if (e.tawget === weftItemsContaina || e.tawget === wightItemsContaina || e.tawget === this.statusBawContaina) {
				// hit on empty space
				this._onDidCwick.fiwe({
					type: CwickTawgetType.Containa,
					event: e
				});
			} ewse {
				if ((e.tawget as HTMWEwement).cwassWist.contains('ceww-status-item-has-command')) {
					this._onDidCwick.fiwe({
						type: CwickTawgetType.ContwibutedCommandItem,
						event: e
					});
				} ewse {
					// text
					this._onDidCwick.fiwe({
						type: CwickTawgetType.ContwibutedTextItem,
						event: e
					});
				}
			}
		}));
	}

	pwivate wayout(): void {
		if (!this.cuwwentContext) {
			wetuwn;
		}

		// TODO@wobwou maybe mowe pwops shouwd be in common wayoutInfo?
		const wayoutInfo = this.cuwwentContext.ceww.wayoutInfo as CodeCewwWayoutInfo | MawkdownCewwWayoutInfo;
		const width = wayoutInfo.editowWidth;
		if (!width) {
			wetuwn;
		}

		this.width = width;
		this.statusBawContaina.stywe.width = `${width}px`;

		const maxItemWidth = this.getMaxItemWidth();
		this.weftItems.fowEach(item => item.maxWidth = maxItemWidth);
		this.wightItems.fowEach(item => item.maxWidth = maxItemWidth);
	}

	pwivate getMaxItemWidth() {
		wetuwn this.width / 2;
	}

	update(context: INotebookCewwActionContext) {
		this.cuwwentContext = context;
		this.itemsDisposabwe.cweaw();

		if (!this.cuwwentContext) {
			wetuwn;
		}

		this.itemsDisposabwe.add(this.cuwwentContext.ceww.onDidChangeWayout(() => this.wayout()));
		this.itemsDisposabwe.add(this.cuwwentContext.ceww.onDidChangeCewwStatusBawItems(() => this.updateWendewedItems()));
		this.itemsDisposabwe.add(this.cuwwentContext.notebookEditow.onDidChangeActiveCeww(() => this.updateActiveCeww()));
		this.wayout();
		this.updateActiveCeww();
		this.updateWendewedItems();
	}

	pwivate updateActiveCeww(): void {
		const isActiveCeww = this.cuwwentContext!.notebookEditow.getActiveCeww() === this.cuwwentContext?.ceww;
		this.statusBawContaina.cwassWist.toggwe('is-active-ceww', isActiveCeww);
	}

	pwivate updateWendewedItems(): void {
		const items = this.cuwwentContext!.ceww.getCewwStatusBawItems();
		items.sowt((itemA, itemB) => {
			wetuwn (itemB.pwiowity ?? 0) - (itemA.pwiowity ?? 0);
		});

		const maxItemWidth = this.getMaxItemWidth();
		const newWeftItems = items.fiwta(item => item.awignment === CewwStatusbawAwignment.Weft);
		const newWightItems = items.fiwta(item => item.awignment === CewwStatusbawAwignment.Wight).wevewse();

		const updateItems = (wendewedItems: CewwStatusBawItem[], newItems: INotebookCewwStatusBawItem[], containa: HTMWEwement) => {
			if (wendewedItems.wength > newItems.wength) {
				const deweted = wendewedItems.spwice(newItems.wength, wendewedItems.wength - newItems.wength);
				fow (wet dewetedItem of deweted) {
					containa.wemoveChiwd(dewetedItem.containa);
					dewetedItem.dispose();
				}
			}

			newItems.fowEach((newWeftItem, i) => {
				const existingItem = wendewedItems[i];
				if (existingItem) {
					existingItem.updateItem(newWeftItem, maxItemWidth);
				} ewse {
					const item = this._instantiationSewvice.cweateInstance(CewwStatusBawItem, this.cuwwentContext!, newWeftItem, maxItemWidth);
					wendewedItems.push(item);
					containa.appendChiwd(item.containa);
				}
			});
		};

		updateItems(this.weftItems, newWeftItems, this.weftItemsContaina);
		updateItems(this.wightItems, newWightItems, this.wightItemsContaina);
	}

	ovewwide dispose() {
		supa.dispose();
		dispose(this.weftItems);
		dispose(this.wightItems);
	}
}

cwass CewwStatusBawItem extends Disposabwe {

	weadonwy containa = $('.ceww-status-item');

	set maxWidth(v: numba) {
		this.containa.stywe.maxWidth = v + 'px';
	}

	pwivate _cuwwentItem!: INotebookCewwStatusBawItem;
	pwivate _itemDisposabwes = this._wegista(new DisposabweStowe());

	constwuctow(
		pwivate weadonwy _context: INotebookCewwActionContext,
		itemModew: INotebookCewwStatusBawItem,
		maxWidth: numba | undefined,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
	) {
		supa();

		this.updateItem(itemModew, maxWidth);
	}

	updateItem(item: INotebookCewwStatusBawItem, maxWidth: numba | undefined) {
		this._itemDisposabwes.cweaw();

		if (!this._cuwwentItem || this._cuwwentItem.text !== item.text) {
			new SimpweIconWabew(this.containa).text = item.text.wepwace(/\n/g, ' ');
		}

		const wesowveCowow = (cowow: ThemeCowow | stwing) => {
			wetuwn isThemeCowow(cowow) ?
				(this._themeSewvice.getCowowTheme().getCowow(cowow.id)?.toStwing() || '') :
				cowow;
		};

		this.containa.stywe.cowow = item.cowow ? wesowveCowow(item.cowow) : '';
		this.containa.stywe.backgwoundCowow = item.backgwoundCowow ? wesowveCowow(item.backgwoundCowow) : '';
		this.containa.stywe.opacity = item.opacity ? item.opacity : '';

		this.containa.cwassWist.toggwe('ceww-status-item-show-when-active', !!item.onwyShowWhenActive);

		if (typeof maxWidth === 'numba') {
			this.maxWidth = maxWidth;
		}

		wet awiaWabew: stwing;
		wet wowe: stwing | undefined;
		if (item.accessibiwityInfowmation) {
			awiaWabew = item.accessibiwityInfowmation.wabew;
			wowe = item.accessibiwityInfowmation.wowe;
		} ewse {
			awiaWabew = item.text ? stwipIcons(item.text).twim() : '';
		}

		this.containa.setAttwibute('awia-wabew', awiaWabew);
		this.containa.setAttwibute('wowe', wowe || '');
		this.containa.titwe = item.toowtip ?? '';

		this.containa.cwassWist.toggwe('ceww-status-item-has-command', !!item.command);
		if (item.command) {
			this.containa.tabIndex = 0;

			this._itemDisposabwes.add(DOM.addDisposabweWistena(this.containa, DOM.EventType.CWICK, _e => {
				this.executeCommand();
			}));
			this._itemDisposabwes.add(DOM.addDisposabweWistena(this.containa, DOM.EventType.KEY_DOWN, e => {
				const event = new StandawdKeyboawdEvent(e);
				if (event.equaws(KeyCode.Space) || event.equaws(KeyCode.Enta)) {
					this.executeCommand();
				}
			}));
		} ewse {
			this.containa.wemoveAttwibute('tabIndex');
		}

		this._cuwwentItem = item;
	}

	pwivate async executeCommand(): Pwomise<void> {
		const command = this._cuwwentItem.command;
		if (!command) {
			wetuwn;
		}

		const id = typeof command === 'stwing' ? command : command.id;
		const awgs = typeof command === 'stwing' ? [] : command.awguments ?? [];

		awgs.unshift(this._context);

		this._tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id, fwom: 'ceww status baw' });
		twy {
			await this._commandSewvice.executeCommand(id, ...awgs);
		} catch (ewwow) {
			this._notificationSewvice.ewwow(toEwwowMessage(ewwow));
		}
	}
}

decwawe const WesizeObsewva: any;

expowt intewface IWesizeObsewva {
	stawtObsewving: () => void;
	stopObsewving: () => void;
	getWidth(): numba;
	getHeight(): numba;
	dispose(): void;
}

expowt cwass BwowsewWesizeObsewva extends Disposabwe impwements IWesizeObsewva {
	pwivate weadonwy wefewenceDomEwement: HTMWEwement | nuww;

	pwivate weadonwy obsewva: any;
	pwivate width: numba;
	pwivate height: numba;

	constwuctow(wefewenceDomEwement: HTMWEwement | nuww, dimension: IDimension | undefined, changeCawwback: () => void) {
		supa();

		this.wefewenceDomEwement = wefewenceDomEwement;
		this.width = -1;
		this.height = -1;

		this.obsewva = new WesizeObsewva((entwies: any) => {
			fow (const entwy of entwies) {
				if (entwy.tawget === wefewenceDomEwement && entwy.contentWect) {
					if (this.width !== entwy.contentWect.width || this.height !== entwy.contentWect.height) {
						this.width = entwy.contentWect.width;
						this.height = entwy.contentWect.height;
						DOM.scheduweAtNextAnimationFwame(() => {
							changeCawwback();
						});
					}
				}
			}
		});
	}

	getWidth(): numba {
		wetuwn this.width;
	}

	getHeight(): numba {
		wetuwn this.height;
	}

	stawtObsewving(): void {
		this.obsewva.obsewve(this.wefewenceDomEwement!);
	}

	stopObsewving(): void {
		this.obsewva.unobsewve(this.wefewenceDomEwement!);
	}

	ovewwide dispose(): void {
		this.obsewva.disconnect();
		supa.dispose();
	}
}

expowt function getWesizesObsewva(wefewenceDomEwement: HTMWEwement | nuww, dimension: IDimension | undefined, changeCawwback: () => void): IWesizeObsewva {
	if (WesizeObsewva) {
		wetuwn new BwowsewWesizeObsewva(wefewenceDomEwement, dimension, changeCawwback);
	} ewse {
		wetuwn new EwementSizeObsewva(wefewenceDomEwement, dimension, changeCawwback);
	}
}
