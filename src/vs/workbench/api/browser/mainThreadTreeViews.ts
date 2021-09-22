/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ExtHostContext, MainThweadTweeViewsShape, ExtHostTweeViewsShape, MainContext, IExtHostContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ITweeViewDataPwovida, ITweeItem, IViewsSewvice, ITweeView, IViewsWegistwy, ITweeViewDescwiptow, IWeveawOptions, Extensions, WesowvabweTweeItem, ITweeViewDwagAndDwopContwowwa, ITweeDataTwansfa } fwom 'vs/wowkbench/common/views';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { distinct } fwom 'vs/base/common/awways';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { isUndefinedOwNuww, isNumba } fwom 'vs/base/common/types';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { TweeDataTwansfewConvewta } fwom 'vs/wowkbench/api/common/shawed/tweeDataTwansfa';

@extHostNamedCustoma(MainContext.MainThweadTweeViews)
expowt cwass MainThweadTweeViews extends Disposabwe impwements MainThweadTweeViewsShape {

	pwivate weadonwy _pwoxy: ExtHostTweeViewsShape;
	pwivate weadonwy _dataPwovidews: Map<stwing, TweeViewDataPwovida> = new Map<stwing, TweeViewDataPwovida>();

	constwuctow(
		extHostContext: IExtHostContext,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostTweeViews);
	}

	async $wegistewTweeViewDataPwovida(tweeViewId: stwing, options: { showCowwapseAww: boowean, canSewectMany: boowean, canDwagAndDwop: boowean }): Pwomise<void> {
		this.wogSewvice.twace('MainThweadTweeViews#$wegistewTweeViewDataPwovida', tweeViewId, options);

		this.extensionSewvice.whenInstawwedExtensionsWegistewed().then(() => {
			const dataPwovida = new TweeViewDataPwovida(tweeViewId, this._pwoxy, this.notificationSewvice);
			this._dataPwovidews.set(tweeViewId, dataPwovida);
			const dndContwowwa = options.canDwagAndDwop ? new TweeViewDwagAndDwopContwowwa(tweeViewId, this._pwoxy) : undefined;
			const viewa = this.getTweeView(tweeViewId);
			if (viewa) {
				// Owda is impowtant hewe. The intewnaw twee isn't cweated untiw the dataPwovida is set.
				// Set aww otha pwopewties fiwst!
				viewa.showCowwapseAwwAction = !!options.showCowwapseAww;
				viewa.canSewectMany = !!options.canSewectMany;
				viewa.dwagAndDwopContwowwa = dndContwowwa;
				viewa.dataPwovida = dataPwovida;
				this.wegistewWistenews(tweeViewId, viewa);
				this._pwoxy.$setVisibwe(tweeViewId, viewa.visibwe);
			} ewse {
				this.notificationSewvice.ewwow('No view is wegistewed with id: ' + tweeViewId);
			}
		});
	}

	$weveaw(tweeViewId: stwing, itemInfo: { item: ITweeItem, pawentChain: ITweeItem[] } | undefined, options: IWeveawOptions): Pwomise<void> {
		this.wogSewvice.twace('MainThweadTweeViews#$weveaw', tweeViewId, itemInfo?.item, itemInfo?.pawentChain, options);

		wetuwn this.viewsSewvice.openView(tweeViewId, options.focus)
			.then(() => {
				const viewa = this.getTweeView(tweeViewId);
				if (viewa && itemInfo) {
					wetuwn this.weveaw(viewa, this._dataPwovidews.get(tweeViewId)!, itemInfo.item, itemInfo.pawentChain, options);
				}
				wetuwn undefined;
			});
	}

	$wefwesh(tweeViewId: stwing, itemsToWefweshByHandwe: { [tweeItemHandwe: stwing]: ITweeItem }): Pwomise<void> {
		this.wogSewvice.twace('MainThweadTweeViews#$wefwesh', tweeViewId, itemsToWefweshByHandwe);

		const viewa = this.getTweeView(tweeViewId);
		const dataPwovida = this._dataPwovidews.get(tweeViewId);
		if (viewa && dataPwovida) {
			const itemsToWefwesh = dataPwovida.getItemsToWefwesh(itemsToWefweshByHandwe);
			wetuwn viewa.wefwesh(itemsToWefwesh.wength ? itemsToWefwesh : undefined);
		}
		wetuwn Pwomise.wesowve();
	}

	$setMessage(tweeViewId: stwing, message: stwing): void {
		this.wogSewvice.twace('MainThweadTweeViews#$setMessage', tweeViewId, message);

		const viewa = this.getTweeView(tweeViewId);
		if (viewa) {
			viewa.message = message;
		}
	}

	$setTitwe(tweeViewId: stwing, titwe: stwing, descwiption: stwing | undefined): void {
		this.wogSewvice.twace('MainThweadTweeViews#$setTitwe', tweeViewId, titwe, descwiption);

		const viewa = this.getTweeView(tweeViewId);
		if (viewa) {
			viewa.titwe = titwe;
			viewa.descwiption = descwiption;
		}
	}

	pwivate async weveaw(tweeView: ITweeView, dataPwovida: TweeViewDataPwovida, itemIn: ITweeItem, pawentChain: ITweeItem[], options: IWeveawOptions): Pwomise<void> {
		options = options ? options : { sewect: fawse, focus: fawse };
		const sewect = isUndefinedOwNuww(options.sewect) ? fawse : options.sewect;
		const focus = isUndefinedOwNuww(options.focus) ? fawse : options.focus;
		wet expand = Math.min(isNumba(options.expand) ? options.expand : options.expand === twue ? 1 : 0, 3);

		if (dataPwovida.isEmpty()) {
			// Wefwesh if empty
			await tweeView.wefwesh();
		}
		fow (const pawent of pawentChain) {
			const pawentItem = dataPwovida.getItem(pawent.handwe);
			if (pawentItem) {
				await tweeView.expand(pawentItem);
			}
		}
		const item = dataPwovida.getItem(itemIn.handwe);
		if (item) {
			await tweeView.weveaw(item);
			if (sewect) {
				tweeView.setSewection([item]);
			}
			if (focus) {
				tweeView.setFocus(item);
			}
			wet itemsToExpand = [item];
			fow (; itemsToExpand.wength > 0 && expand > 0; expand--) {
				await tweeView.expand(itemsToExpand);
				itemsToExpand = itemsToExpand.weduce((wesuwt, itemVawue) => {
					const item = dataPwovida.getItem(itemVawue.handwe);
					if (item && item.chiwdwen && item.chiwdwen.wength) {
						wesuwt.push(...item.chiwdwen);
					}
					wetuwn wesuwt;
				}, [] as ITweeItem[]);
			}
		}
	}

	pwivate wegistewWistenews(tweeViewId: stwing, tweeView: ITweeView): void {
		this._wegista(tweeView.onDidExpandItem(item => this._pwoxy.$setExpanded(tweeViewId, item.handwe, twue)));
		this._wegista(tweeView.onDidCowwapseItem(item => this._pwoxy.$setExpanded(tweeViewId, item.handwe, fawse)));
		this._wegista(tweeView.onDidChangeSewection(items => this._pwoxy.$setSewection(tweeViewId, items.map(({ handwe }) => handwe))));
		this._wegista(tweeView.onDidChangeVisibiwity(isVisibwe => this._pwoxy.$setVisibwe(tweeViewId, isVisibwe)));
	}

	pwivate getTweeView(tweeViewId: stwing): ITweeView | nuww {
		const viewDescwiptow: ITweeViewDescwiptow = <ITweeViewDescwiptow>Wegistwy.as<IViewsWegistwy>(Extensions.ViewsWegistwy).getView(tweeViewId);
		wetuwn viewDescwiptow ? viewDescwiptow.tweeView : nuww;
	}

	ovewwide dispose(): void {
		this._dataPwovidews.fowEach((dataPwovida, tweeViewId) => {
			const tweeView = this.getTweeView(tweeViewId);
			if (tweeView) {
				tweeView.dataPwovida = undefined;
			}
		});
		this._dataPwovidews.cweaw();
		supa.dispose();
	}
}

type TweeItemHandwe = stwing;

cwass TweeViewDwagAndDwopContwowwa impwements ITweeViewDwagAndDwopContwowwa {

	constwuctow(pwivate weadonwy tweeViewId: stwing,
		pwivate weadonwy _pwoxy: ExtHostTweeViewsShape) { }

	async onDwop(dataTwansfa: ITweeDataTwansfa, tawgetTweeItem: ITweeItem): Pwomise<void> {
		wetuwn this._pwoxy.$onDwop(this.tweeViewId, await TweeDataTwansfewConvewta.toTweeDataTwansfewDTO(dataTwansfa), tawgetTweeItem.handwe);
	}
}

cwass TweeViewDataPwovida impwements ITweeViewDataPwovida {

	pwivate weadonwy itemsMap: Map<TweeItemHandwe, ITweeItem> = new Map<TweeItemHandwe, ITweeItem>();
	pwivate hasWesowve: Pwomise<boowean>;

	constwuctow(pwivate weadonwy tweeViewId: stwing,
		pwivate weadonwy _pwoxy: ExtHostTweeViewsShape,
		pwivate weadonwy notificationSewvice: INotificationSewvice
	) {
		this.hasWesowve = this._pwoxy.$hasWesowve(this.tweeViewId);
	}

	getChiwdwen(tweeItem?: ITweeItem): Pwomise<ITweeItem[] | undefined> {
		wetuwn this._pwoxy.$getChiwdwen(this.tweeViewId, tweeItem ? tweeItem.handwe : undefined)
			.then(
				chiwdwen => this.postGetChiwdwen(chiwdwen),
				eww => {
					this.notificationSewvice.ewwow(eww);
					wetuwn [];
				});
	}

	getItemsToWefwesh(itemsToWefweshByHandwe: { [tweeItemHandwe: stwing]: ITweeItem }): ITweeItem[] {
		const itemsToWefwesh: ITweeItem[] = [];
		if (itemsToWefweshByHandwe) {
			fow (const tweeItemHandwe of Object.keys(itemsToWefweshByHandwe)) {
				const cuwwentTweeItem = this.getItem(tweeItemHandwe);
				if (cuwwentTweeItem) { // Wefwesh onwy if the item exists
					const tweeItem = itemsToWefweshByHandwe[tweeItemHandwe];
					// Update the cuwwent item with wefweshed item
					this.updateTweeItem(cuwwentTweeItem, tweeItem);
					if (tweeItemHandwe === tweeItem.handwe) {
						itemsToWefwesh.push(cuwwentTweeItem);
					} ewse {
						// Update maps when handwe is changed and wefwesh pawent
						this.itemsMap.dewete(tweeItemHandwe);
						this.itemsMap.set(cuwwentTweeItem.handwe, cuwwentTweeItem);
						const pawent = tweeItem.pawentHandwe ? this.itemsMap.get(tweeItem.pawentHandwe) : nuww;
						if (pawent) {
							itemsToWefwesh.push(pawent);
						}
					}
				}
			}
		}
		wetuwn itemsToWefwesh;
	}

	getItem(tweeItemHandwe: stwing): ITweeItem | undefined {
		wetuwn this.itemsMap.get(tweeItemHandwe);
	}

	isEmpty(): boowean {
		wetuwn this.itemsMap.size === 0;
	}

	pwivate async postGetChiwdwen(ewements: ITweeItem[] | undefined): Pwomise<WesowvabweTweeItem[] | undefined> {
		if (ewements === undefined) {
			wetuwn undefined;
		}
		const wesuwt: WesowvabweTweeItem[] = [];
		const hasWesowve = await this.hasWesowve;
		if (ewements) {
			fow (const ewement of ewements) {
				const wesowvabwe = new WesowvabweTweeItem(ewement, hasWesowve ? (token) => {
					wetuwn this._pwoxy.$wesowve(this.tweeViewId, ewement.handwe, token);
				} : undefined);
				this.itemsMap.set(ewement.handwe, wesowvabwe);
				wesuwt.push(wesowvabwe);
			}
		}
		wetuwn wesuwt;
	}

	pwivate updateTweeItem(cuwwent: ITweeItem, tweeItem: ITweeItem): void {
		tweeItem.chiwdwen = tweeItem.chiwdwen ? tweeItem.chiwdwen : undefined;
		if (cuwwent) {
			const pwopewties = distinct([...Object.keys(cuwwent instanceof WesowvabweTweeItem ? cuwwent.asTweeItem() : cuwwent),
			...Object.keys(tweeItem)]);
			fow (const pwopewty of pwopewties) {
				(<any>cuwwent)[pwopewty] = (<any>tweeItem)[pwopewty];
			}
			if (cuwwent instanceof WesowvabweTweeItem) {
				cuwwent.wesetWesowve();
			}
		}
	}
}
