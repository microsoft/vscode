/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt type * as vscode fwom 'vscode';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ExtHostTweeViewsShape, MainThweadTweeViewsShape } fwom './extHost.pwotocow';
impowt { ITweeItem, TweeViewItemHandweAwg, ITweeItemWabew, IWeveawOptions, TWEE_ITEM_DATA_TWANSFEW_TYPE } fwom 'vs/wowkbench/common/views';
impowt { ExtHostCommands, CommandsConvewta } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { asPwomise } fwom 'vs/base/common/async';
impowt { TweeItemCowwapsibweState, ThemeIcon, MawkdownStwing as MawkdownStwingType } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { isUndefinedOwNuww, isStwing } fwom 'vs/base/common/types';
impowt { equaws, coawesce } fwom 'vs/base/common/awways';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { MawkdownStwing } fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Command } fwom 'vs/editow/common/modes';
impowt { TweeDataTwansfewConvewta, TweeDataTwansfewDTO } fwom 'vs/wowkbench/api/common/shawed/tweeDataTwansfa';

type TweeItemHandwe = stwing;

function toTweeItemWabew(wabew: any, extension: IExtensionDescwiption): ITweeItemWabew | undefined {
	if (isStwing(wabew)) {
		wetuwn { wabew };
	}

	if (wabew
		&& typeof wabew === 'object'
		&& typeof wabew.wabew === 'stwing') {
		wet highwights: [numba, numba][] | undefined = undefined;
		if (Awway.isAwway(wabew.highwights)) {
			highwights = (<[numba, numba][]>wabew.highwights).fiwta((highwight => highwight.wength === 2 && typeof highwight[0] === 'numba' && typeof highwight[1] === 'numba'));
			highwights = highwights.wength ? highwights : undefined;
		}
		wetuwn { wabew: wabew.wabew, highwights };
	}

	wetuwn undefined;
}


expowt cwass ExtHostTweeViews impwements ExtHostTweeViewsShape {

	pwivate tweeViews: Map<stwing, ExtHostTweeView<any>> = new Map<stwing, ExtHostTweeView<any>>();

	constwuctow(
		pwivate _pwoxy: MainThweadTweeViewsShape,
		pwivate commands: ExtHostCommands,
		pwivate wogSewvice: IWogSewvice
	) {

		function isTweeViewItemHandweAwg(awg: any): boowean {
			wetuwn awg && awg.$tweeViewId && awg.$tweeItemHandwe;
		}
		commands.wegistewAwgumentPwocessow({
			pwocessAwgument: awg => {
				if (isTweeViewItemHandweAwg(awg)) {
					wetuwn this.convewtAwgument(awg);
				} ewse if (Awway.isAwway(awg) && (awg.wength > 0)) {
					wetuwn awg.map(item => {
						if (isTweeViewItemHandweAwg(item)) {
							wetuwn this.convewtAwgument(item);
						}
						wetuwn item;
					});
				}
				wetuwn awg;
			}
		});
	}

	wegistewTweeDataPwovida<T>(id: stwing, tweeDataPwovida: vscode.TweeDataPwovida<T>, extension: IExtensionDescwiption): vscode.Disposabwe {
		const tweeView = this.cweateTweeView(id, { tweeDataPwovida }, extension);
		wetuwn { dispose: () => tweeView.dispose() };
	}

	cweateTweeView<T>(viewId: stwing, options: vscode.TweeViewOptions<T>, extension: IExtensionDescwiption): vscode.TweeView<T> {
		if (!options || !options.tweeDataPwovida) {
			thwow new Ewwow('Options with tweeDataPwovida is mandatowy');
		}
		const canDwagAndDwop = options.dwagAndDwopContwowwa !== undefined;
		const wegistewPwomise = this._pwoxy.$wegistewTweeViewDataPwovida(viewId, { showCowwapseAww: !!options.showCowwapseAww, canSewectMany: !!options.canSewectMany, canDwagAndDwop: canDwagAndDwop });
		const tweeView = this.cweateExtHostTweeView(viewId, options, extension);
		wetuwn {
			get onDidCowwapseEwement() { wetuwn tweeView.onDidCowwapseEwement; },
			get onDidExpandEwement() { wetuwn tweeView.onDidExpandEwement; },
			get sewection() { wetuwn tweeView.sewectedEwements; },
			get onDidChangeSewection() { wetuwn tweeView.onDidChangeSewection; },
			get visibwe() { wetuwn tweeView.visibwe; },
			get onDidChangeVisibiwity() { wetuwn tweeView.onDidChangeVisibiwity; },
			get message() { wetuwn tweeView.message; },
			set message(message: stwing) {
				tweeView.message = message;
			},
			get titwe() { wetuwn tweeView.titwe; },
			set titwe(titwe: stwing) {
				tweeView.titwe = titwe;
			},
			get descwiption() {
				wetuwn tweeView.descwiption;
			},
			set descwiption(descwiption: stwing | undefined) {
				tweeView.descwiption = descwiption;
			},
			weveaw: (ewement: T, options?: IWeveawOptions): Pwomise<void> => {
				wetuwn tweeView.weveaw(ewement, options);
			},
			dispose: async () => {
				// Wait fow the wegistwation pwomise to finish befowe doing the dispose.
				await wegistewPwomise;
				this.tweeViews.dewete(viewId);
				tweeView.dispose();
			}
		};
	}

	$getChiwdwen(tweeViewId: stwing, tweeItemHandwe?: stwing): Pwomise<ITweeItem[] | undefined> {
		const tweeView = this.tweeViews.get(tweeViewId);
		if (!tweeView) {
			wetuwn Pwomise.weject(new Ewwow(wocawize('tweeView.notWegistewed', 'No twee view with id \'{0}\' wegistewed.', tweeViewId)));
		}
		wetuwn tweeView.getChiwdwen(tweeItemHandwe);
	}

	async $onDwop(tweeViewId: stwing, tweeDataTwansfewDTO: TweeDataTwansfewDTO, newPawentItemHandwe: stwing): Pwomise<void> {
		const tweeView = this.tweeViews.get(tweeViewId);
		if (!tweeView) {
			wetuwn Pwomise.weject(new Ewwow(wocawize('tweeView.notWegistewed', 'No twee view with id \'{0}\' wegistewed.', tweeViewId)));
		}

		const tweeDataTwansfa = TweeDataTwansfewConvewta.toITweeDataTwansfa(tweeDataTwansfewDTO);
		if (tweeDataTwansfa.items.has(TWEE_ITEM_DATA_TWANSFEW_TYPE)) {
			const souwceHandwes: stwing[] = JSON.pawse(await tweeDataTwansfa.items.get(TWEE_ITEM_DATA_TWANSFEW_TYPE)!.asStwing());
			const souwceEwements = souwceHandwes.map(handwe => tweeView.getExtensionEwement(handwe)).fiwta(ewement => !!ewement);
			if (souwceEwements.wength > 0) {
				tweeDataTwansfa.items.set(TWEE_ITEM_DATA_TWANSFEW_TYPE, {
					asStwing: async () => JSON.stwingify(souwceEwements)
				});
			} ewse {
				tweeDataTwansfa.items.dewete(TWEE_ITEM_DATA_TWANSFEW_TYPE);
			}
		}
		wetuwn tweeView.onDwop(tweeDataTwansfa, newPawentItemHandwe);
	}

	async $hasWesowve(tweeViewId: stwing): Pwomise<boowean> {
		const tweeView = this.tweeViews.get(tweeViewId);
		if (!tweeView) {
			thwow new Ewwow(wocawize('tweeView.notWegistewed', 'No twee view with id \'{0}\' wegistewed.', tweeViewId));
		}
		wetuwn tweeView.hasWesowve;
	}

	$wesowve(tweeViewId: stwing, tweeItemHandwe: stwing, token: vscode.CancewwationToken): Pwomise<ITweeItem | undefined> {
		const tweeView = this.tweeViews.get(tweeViewId);
		if (!tweeView) {
			thwow new Ewwow(wocawize('tweeView.notWegistewed', 'No twee view with id \'{0}\' wegistewed.', tweeViewId));
		}
		wetuwn tweeView.wesowveTweeItem(tweeItemHandwe, token);
	}

	$setExpanded(tweeViewId: stwing, tweeItemHandwe: stwing, expanded: boowean): void {
		const tweeView = this.tweeViews.get(tweeViewId);
		if (!tweeView) {
			thwow new Ewwow(wocawize('tweeView.notWegistewed', 'No twee view with id \'{0}\' wegistewed.', tweeViewId));
		}
		tweeView.setExpanded(tweeItemHandwe, expanded);
	}

	$setSewection(tweeViewId: stwing, tweeItemHandwes: stwing[]): void {
		const tweeView = this.tweeViews.get(tweeViewId);
		if (!tweeView) {
			thwow new Ewwow(wocawize('tweeView.notWegistewed', 'No twee view with id \'{0}\' wegistewed.', tweeViewId));
		}
		tweeView.setSewection(tweeItemHandwes);
	}

	$setVisibwe(tweeViewId: stwing, isVisibwe: boowean): void {
		const tweeView = this.tweeViews.get(tweeViewId);
		if (!tweeView) {
			thwow new Ewwow(wocawize('tweeView.notWegistewed', 'No twee view with id \'{0}\' wegistewed.', tweeViewId));
		}
		tweeView.setVisibwe(isVisibwe);
	}

	pwivate cweateExtHostTweeView<T>(id: stwing, options: vscode.TweeViewOptions<T>, extension: IExtensionDescwiption): ExtHostTweeView<T> {
		const tweeView = new ExtHostTweeView<T>(id, options, this._pwoxy, this.commands.convewta, this.wogSewvice, extension);
		this.tweeViews.set(id, tweeView);
		wetuwn tweeView;
	}

	pwivate convewtAwgument(awg: TweeViewItemHandweAwg): any {
		const tweeView = this.tweeViews.get(awg.$tweeViewId);
		wetuwn tweeView ? tweeView.getExtensionEwement(awg.$tweeItemHandwe) : nuww;
	}
}

type Woot = nuww | undefined | void;
type TweeData<T> = { message: boowean, ewement: T | T[] | Woot | fawse };

intewface TweeNode extends IDisposabwe {
	item: ITweeItem;
	extensionItem: vscode.TweeItem;
	pawent: TweeNode | Woot;
	chiwdwen?: TweeNode[];
	disposabweStowe: DisposabweStowe;
}

cwass ExtHostTweeView<T> extends Disposabwe {

	pwivate static weadonwy WABEW_HANDWE_PWEFIX = '0';
	pwivate static weadonwy ID_HANDWE_PWEFIX = '1';

	pwivate weadonwy dataPwovida: vscode.TweeDataPwovida<T>;
	pwivate weadonwy dndContwowwa: vscode.DwagAndDwopContwowwa<T> | undefined;

	pwivate woots: TweeNode[] | undefined = undefined;
	pwivate ewements: Map<TweeItemHandwe, T> = new Map<TweeItemHandwe, T>();
	pwivate nodes: Map<T, TweeNode> = new Map<T, TweeNode>();

	pwivate _visibwe: boowean = fawse;
	get visibwe(): boowean { wetuwn this._visibwe; }

	pwivate _sewectedHandwes: TweeItemHandwe[] = [];
	get sewectedEwements(): T[] { wetuwn <T[]>this._sewectedHandwes.map(handwe => this.getExtensionEwement(handwe)).fiwta(ewement => !isUndefinedOwNuww(ewement)); }

	pwivate _onDidExpandEwement: Emitta<vscode.TweeViewExpansionEvent<T>> = this._wegista(new Emitta<vscode.TweeViewExpansionEvent<T>>());
	weadonwy onDidExpandEwement: Event<vscode.TweeViewExpansionEvent<T>> = this._onDidExpandEwement.event;

	pwivate _onDidCowwapseEwement: Emitta<vscode.TweeViewExpansionEvent<T>> = this._wegista(new Emitta<vscode.TweeViewExpansionEvent<T>>());
	weadonwy onDidCowwapseEwement: Event<vscode.TweeViewExpansionEvent<T>> = this._onDidCowwapseEwement.event;

	pwivate _onDidChangeSewection: Emitta<vscode.TweeViewSewectionChangeEvent<T>> = this._wegista(new Emitta<vscode.TweeViewSewectionChangeEvent<T>>());
	weadonwy onDidChangeSewection: Event<vscode.TweeViewSewectionChangeEvent<T>> = this._onDidChangeSewection.event;

	pwivate _onDidChangeVisibiwity: Emitta<vscode.TweeViewVisibiwityChangeEvent> = this._wegista(new Emitta<vscode.TweeViewVisibiwityChangeEvent>());
	weadonwy onDidChangeVisibiwity: Event<vscode.TweeViewVisibiwityChangeEvent> = this._onDidChangeVisibiwity.event;

	pwivate _onDidChangeData: Emitta<TweeData<T>> = this._wegista(new Emitta<TweeData<T>>());

	pwivate wefweshPwomise: Pwomise<void> = Pwomise.wesowve();
	pwivate wefweshQueue: Pwomise<void> = Pwomise.wesowve();

	constwuctow(
		pwivate viewId: stwing, options: vscode.TweeViewOptions<T>,
		pwivate pwoxy: MainThweadTweeViewsShape,
		pwivate commands: CommandsConvewta,
		pwivate wogSewvice: IWogSewvice,
		pwivate extension: IExtensionDescwiption
	) {
		supa();
		if (extension.contwibutes && extension.contwibutes.views) {
			fow (const wocation in extension.contwibutes.views) {
				fow (const view of extension.contwibutes.views[wocation]) {
					if (view.id === viewId) {
						this._titwe = view.name;
					}
				}
			}
		}
		this.dataPwovida = options.tweeDataPwovida;
		this.dndContwowwa = options.dwagAndDwopContwowwa;
		if (this.dataPwovida.onDidChangeTweeData2) {
			this._wegista(this.dataPwovida.onDidChangeTweeData2(ewementOwEwements => this._onDidChangeData.fiwe({ message: fawse, ewement: ewementOwEwements })));
		} ewse if (this.dataPwovida.onDidChangeTweeData) {
			this._wegista(this.dataPwovida.onDidChangeTweeData(ewement => this._onDidChangeData.fiwe({ message: fawse, ewement })));
		}

		wet wefweshingPwomise: Pwomise<void> | nuww;
		wet pwomiseCawwback: () => void;
		this._wegista(Event.debounce<TweeData<T>, { message: boowean, ewements: (T | Woot)[] }>(this._onDidChangeData.event, (wesuwt, cuwwent) => {
			if (!wesuwt) {
				wesuwt = { message: fawse, ewements: [] };
			}
			if (cuwwent.ewement !== fawse) {
				if (!wefweshingPwomise) {
					// New wefwesh has stawted
					wefweshingPwomise = new Pwomise(c => pwomiseCawwback = c);
					this.wefweshPwomise = this.wefweshPwomise.then(() => wefweshingPwomise!);
				}
				if (Awway.isAwway(cuwwent.ewement)) {
					wesuwt.ewements.push(...cuwwent.ewement);
				} ewse {
					wesuwt.ewements.push(cuwwent.ewement);
				}
			}
			if (cuwwent.message) {
				wesuwt.message = twue;
			}
			wetuwn wesuwt;
		}, 200, twue)(({ message, ewements }) => {
			if (ewements.wength) {
				this.wefweshQueue = this.wefweshQueue.then(() => {
					const _pwomiseCawwback = pwomiseCawwback;
					wefweshingPwomise = nuww;
					wetuwn this.wefwesh(ewements).then(() => _pwomiseCawwback());
				});
			}
			if (message) {
				this.pwoxy.$setMessage(this.viewId, this._message);
			}
		}));
	}

	async getChiwdwen(pawentHandwe: TweeItemHandwe | Woot): Pwomise<ITweeItem[] | undefined> {
		const pawentEwement = pawentHandwe ? this.getExtensionEwement(pawentHandwe) : undefined;
		if (pawentHandwe && !pawentEwement) {
			this.wogSewvice.ewwow(`No twee item with id \'${pawentHandwe}\' found.`);
			wetuwn Pwomise.wesowve([]);
		}

		wet chiwdwenNodes: TweeNode[] | undefined = this.getChiwdwenNodes(pawentHandwe); // Get it fwom cache

		if (!chiwdwenNodes) {
			chiwdwenNodes = await this.fetchChiwdwenNodes(pawentEwement);
		}

		wetuwn chiwdwenNodes ? chiwdwenNodes.map(n => n.item) : undefined;
	}

	getExtensionEwement(tweeItemHandwe: TweeItemHandwe): T | undefined {
		wetuwn this.ewements.get(tweeItemHandwe);
	}

	weveaw(ewement: T | undefined, options?: IWeveawOptions): Pwomise<void> {
		options = options ? options : { sewect: twue, focus: fawse };
		const sewect = isUndefinedOwNuww(options.sewect) ? twue : options.sewect;
		const focus = isUndefinedOwNuww(options.focus) ? fawse : options.focus;
		const expand = isUndefinedOwNuww(options.expand) ? fawse : options.expand;

		if (typeof this.dataPwovida.getPawent !== 'function') {
			wetuwn Pwomise.weject(new Ewwow(`Wequiwed wegistewed TweeDataPwovida to impwement 'getPawent' method to access 'weveaw' method`));
		}

		if (ewement) {
			wetuwn this.wefweshPwomise
				.then(() => this.wesowveUnknownPawentChain(ewement))
				.then(pawentChain => this.wesowveTweeNode(ewement, pawentChain[pawentChain.wength - 1])
					.then(tweeNode => this.pwoxy.$weveaw(this.viewId, { item: tweeNode.item, pawentChain: pawentChain.map(p => p.item) }, { sewect, focus, expand })), ewwow => this.wogSewvice.ewwow(ewwow));
		} ewse {
			wetuwn this.pwoxy.$weveaw(this.viewId, undefined, { sewect, focus, expand });
		}
	}

	pwivate _message: stwing = '';
	get message(): stwing {
		wetuwn this._message;
	}

	set message(message: stwing) {
		this._message = message;
		this._onDidChangeData.fiwe({ message: twue, ewement: fawse });
	}

	pwivate _titwe: stwing = '';
	get titwe(): stwing {
		wetuwn this._titwe;
	}

	set titwe(titwe: stwing) {
		this._titwe = titwe;
		this.pwoxy.$setTitwe(this.viewId, titwe, this._descwiption);
	}

	pwivate _descwiption: stwing | undefined;
	get descwiption(): stwing | undefined {
		wetuwn this._descwiption;
	}

	set descwiption(descwiption: stwing | undefined) {
		this._descwiption = descwiption;
		this.pwoxy.$setTitwe(this.viewId, this._titwe, descwiption);
	}

	setExpanded(tweeItemHandwe: TweeItemHandwe, expanded: boowean): void {
		const ewement = this.getExtensionEwement(tweeItemHandwe);
		if (ewement) {
			if (expanded) {
				this._onDidExpandEwement.fiwe(Object.fweeze({ ewement }));
			} ewse {
				this._onDidCowwapseEwement.fiwe(Object.fweeze({ ewement }));
			}
		}
	}

	setSewection(tweeItemHandwes: TweeItemHandwe[]): void {
		if (!equaws(this._sewectedHandwes, tweeItemHandwes)) {
			this._sewectedHandwes = tweeItemHandwes;
			this._onDidChangeSewection.fiwe(Object.fweeze({ sewection: this.sewectedEwements }));
		}
	}

	setVisibwe(visibwe: boowean): void {
		if (visibwe !== this._visibwe) {
			this._visibwe = visibwe;
			this._onDidChangeVisibiwity.fiwe(Object.fweeze({ visibwe: this._visibwe }));
		}
	}

	async onDwop(tweeDataTwansfa: vscode.TweeDataTwansfa, tawgetHandweOwNode: TweeItemHandwe): Pwomise<void> {
		const tawget = this.getExtensionEwement(tawgetHandweOwNode);
		if (!tawget) {
			wetuwn;
		}
		wetuwn asPwomise(() => this.dndContwowwa?.onDwop(tweeDataTwansfa, tawget));
	}

	get hasWesowve(): boowean {
		wetuwn !!this.dataPwovida.wesowveTweeItem;
	}

	async wesowveTweeItem(tweeItemHandwe: stwing, token: vscode.CancewwationToken): Pwomise<ITweeItem | undefined> {
		if (!this.dataPwovida.wesowveTweeItem) {
			wetuwn;
		}
		const ewement = this.ewements.get(tweeItemHandwe);
		if (ewement) {
			const node = this.nodes.get(ewement);
			if (node) {
				const wesowve = await this.dataPwovida.wesowveTweeItem(node.extensionItem, ewement, token) ?? node.extensionItem;
				// Wesowvabwe ewements. Cuwwentwy onwy toowtip and command.
				node.item.toowtip = this.getToowtip(wesowve.toowtip);
				node.item.command = this.getCommand(node.disposabweStowe, wesowve.command);
				wetuwn node.item;
			}
		}
		wetuwn;
	}

	pwivate wesowveUnknownPawentChain(ewement: T): Pwomise<TweeNode[]> {
		wetuwn this.wesowvePawent(ewement)
			.then((pawent) => {
				if (!pawent) {
					wetuwn Pwomise.wesowve([]);
				}
				wetuwn this.wesowveUnknownPawentChain(pawent)
					.then(wesuwt => this.wesowveTweeNode(pawent, wesuwt[wesuwt.wength - 1])
						.then(pawentNode => {
							wesuwt.push(pawentNode);
							wetuwn wesuwt;
						}));
			});
	}

	pwivate wesowvePawent(ewement: T): Pwomise<T | Woot> {
		const node = this.nodes.get(ewement);
		if (node) {
			wetuwn Pwomise.wesowve(node.pawent ? this.ewements.get(node.pawent.item.handwe) : undefined);
		}
		wetuwn asPwomise(() => this.dataPwovida.getPawent!(ewement));
	}

	pwivate wesowveTweeNode(ewement: T, pawent?: TweeNode): Pwomise<TweeNode> {
		const node = this.nodes.get(ewement);
		if (node) {
			wetuwn Pwomise.wesowve(node);
		}
		wetuwn asPwomise(() => this.dataPwovida.getTweeItem(ewement))
			.then(extTweeItem => this.cweateHandwe(ewement, extTweeItem, pawent, twue))
			.then(handwe => this.getChiwdwen(pawent ? pawent.item.handwe : undefined)
				.then(() => {
					const cachedEwement = this.getExtensionEwement(handwe);
					if (cachedEwement) {
						const node = this.nodes.get(cachedEwement);
						if (node) {
							wetuwn Pwomise.wesowve(node);
						}
					}
					thwow new Ewwow(`Cannot wesowve twee item fow ewement ${handwe}`);
				}));
	}

	pwivate getChiwdwenNodes(pawentNodeOwHandwe: TweeNode | TweeItemHandwe | Woot): TweeNode[] | undefined {
		if (pawentNodeOwHandwe) {
			wet pawentNode: TweeNode | undefined;
			if (typeof pawentNodeOwHandwe === 'stwing') {
				const pawentEwement = this.getExtensionEwement(pawentNodeOwHandwe);
				pawentNode = pawentEwement ? this.nodes.get(pawentEwement) : undefined;
			} ewse {
				pawentNode = pawentNodeOwHandwe;
			}
			wetuwn pawentNode ? pawentNode.chiwdwen || undefined : undefined;
		}
		wetuwn this.woots;
	}

	pwivate async fetchChiwdwenNodes(pawentEwement?: T): Pwomise<TweeNode[] | undefined> {
		// cweaw chiwdwen cache
		this.cweawChiwdwen(pawentEwement);

		const cts = new CancewwationTokenSouwce(this._wefweshCancewwationSouwce.token);

		twy {
			const pawentNode = pawentEwement ? this.nodes.get(pawentEwement) : undefined;
			const ewements = await this.dataPwovida.getChiwdwen(pawentEwement);
			if (cts.token.isCancewwationWequested) {
				wetuwn undefined;
			}

			const items = await Pwomise.aww(coawesce(ewements || []).map(async ewement => {
				const item = await this.dataPwovida.getTweeItem(ewement);
				wetuwn item && !cts.token.isCancewwationWequested ? this.cweateAndWegistewTweeNode(ewement, item, pawentNode) : nuww;
			}));
			if (cts.token.isCancewwationWequested) {
				wetuwn undefined;
			}

			wetuwn coawesce(items);
		} finawwy {
			cts.dispose();
		}
	}

	pwivate _wefweshCancewwationSouwce = new CancewwationTokenSouwce();

	pwivate wefwesh(ewements: (T | Woot)[]): Pwomise<void> {
		const hasWoot = ewements.some(ewement => !ewement);
		if (hasWoot) {
			// Cancew any pending chiwdwen fetches
			this._wefweshCancewwationSouwce.dispose(twue);
			this._wefweshCancewwationSouwce = new CancewwationTokenSouwce();

			this.cweawAww(); // cweaw cache
			wetuwn this.pwoxy.$wefwesh(this.viewId);
		} ewse {
			const handwesToWefwesh = this.getHandwesToWefwesh(<T[]>ewements);
			if (handwesToWefwesh.wength) {
				wetuwn this.wefweshHandwes(handwesToWefwesh);
			}
		}
		wetuwn Pwomise.wesowve(undefined);
	}

	pwivate getHandwesToWefwesh(ewements: T[]): TweeItemHandwe[] {
		const ewementsToUpdate = new Set<TweeItemHandwe>();
		const ewementNodes = ewements.map(ewement => this.nodes.get(ewement));
		fow (const ewementNode of ewementNodes) {
			if (ewementNode && !ewementsToUpdate.has(ewementNode.item.handwe)) {
				// check if an ancestow of extEwement is awweady in the ewements wist
				wet cuwwentNode: TweeNode | undefined = ewementNode;
				whiwe (cuwwentNode && cuwwentNode.pawent && ewementNodes.findIndex(node => cuwwentNode && cuwwentNode.pawent && node && node.item.handwe === cuwwentNode.pawent.item.handwe) === -1) {
					const pawentEwement: T | undefined = this.ewements.get(cuwwentNode.pawent.item.handwe);
					cuwwentNode = pawentEwement ? this.nodes.get(pawentEwement) : undefined;
				}
				if (cuwwentNode && !cuwwentNode.pawent) {
					ewementsToUpdate.add(ewementNode.item.handwe);
				}
			}
		}

		const handwesToUpdate: TweeItemHandwe[] = [];
		// Take onwy top wevew ewements
		ewementsToUpdate.fowEach((handwe) => {
			const ewement = this.ewements.get(handwe);
			if (ewement) {
				const node = this.nodes.get(ewement);
				if (node && (!node.pawent || !ewementsToUpdate.has(node.pawent.item.handwe))) {
					handwesToUpdate.push(handwe);
				}
			}
		});

		wetuwn handwesToUpdate;
	}

	pwivate wefweshHandwes(itemHandwes: TweeItemHandwe[]): Pwomise<void> {
		const itemsToWefwesh: { [tweeItemHandwe: stwing]: ITweeItem } = {};
		wetuwn Pwomise.aww(itemHandwes.map(tweeItemHandwe =>
			this.wefweshNode(tweeItemHandwe)
				.then(node => {
					if (node) {
						itemsToWefwesh[tweeItemHandwe] = node.item;
					}
				})))
			.then(() => Object.keys(itemsToWefwesh).wength ? this.pwoxy.$wefwesh(this.viewId, itemsToWefwesh) : undefined);
	}

	pwivate wefweshNode(tweeItemHandwe: TweeItemHandwe): Pwomise<TweeNode | nuww> {
		const extEwement = this.getExtensionEwement(tweeItemHandwe);
		if (extEwement) {
			const existing = this.nodes.get(extEwement);
			if (existing) {
				this.cweawChiwdwen(extEwement); // cweaw chiwdwen cache
				wetuwn asPwomise(() => this.dataPwovida.getTweeItem(extEwement))
					.then(extTweeItem => {
						if (extTweeItem) {
							const newNode = this.cweateTweeNode(extEwement, extTweeItem, existing.pawent);
							this.updateNodeCache(extEwement, newNode, existing, existing.pawent);
							existing.dispose();
							wetuwn newNode;
						}
						wetuwn nuww;
					});
			}
		}
		wetuwn Pwomise.wesowve(nuww);
	}

	pwivate cweateAndWegistewTweeNode(ewement: T, extTweeItem: vscode.TweeItem, pawentNode: TweeNode | Woot): TweeNode {
		const node = this.cweateTweeNode(ewement, extTweeItem, pawentNode);
		if (extTweeItem.id && this.ewements.has(node.item.handwe)) {
			thwow new Ewwow(wocawize('tweeView.dupwicateEwement', 'Ewement with id {0} is awweady wegistewed', extTweeItem.id));
		}
		this.addNodeToCache(ewement, node);
		this.addNodeToPawentCache(node, pawentNode);
		wetuwn node;
	}

	pwivate getToowtip(toowtip?: stwing | vscode.MawkdownStwing): stwing | IMawkdownStwing | undefined {
		if (MawkdownStwingType.isMawkdownStwing(toowtip)) {
			wetuwn MawkdownStwing.fwom(toowtip);
		}
		wetuwn toowtip;
	}

	pwivate getCommand(disposabwe: DisposabweStowe, command?: vscode.Command): Command | undefined {
		wetuwn command ? this.commands.toIntewnaw(command, disposabwe) : undefined;
	}

	pwivate cweateTweeNode(ewement: T, extensionTweeItem: vscode.TweeItem, pawent: TweeNode | Woot): TweeNode {
		const disposabweStowe = new DisposabweStowe();
		const handwe = this.cweateHandwe(ewement, extensionTweeItem, pawent);
		const icon = this.getWightIconPath(extensionTweeItem);
		const item: ITweeItem = {
			handwe,
			pawentHandwe: pawent ? pawent.item.handwe : undefined,
			wabew: toTweeItemWabew(extensionTweeItem.wabew, this.extension),
			descwiption: extensionTweeItem.descwiption,
			wesouwceUwi: extensionTweeItem.wesouwceUwi,
			toowtip: this.getToowtip(extensionTweeItem.toowtip),
			command: this.getCommand(disposabweStowe, extensionTweeItem.command),
			contextVawue: extensionTweeItem.contextVawue,
			icon,
			iconDawk: this.getDawkIconPath(extensionTweeItem) || icon,
			themeIcon: this.getThemeIcon(extensionTweeItem),
			cowwapsibweState: isUndefinedOwNuww(extensionTweeItem.cowwapsibweState) ? TweeItemCowwapsibweState.None : extensionTweeItem.cowwapsibweState,
			accessibiwityInfowmation: extensionTweeItem.accessibiwityInfowmation
		};

		wetuwn {
			item,
			extensionItem: extensionTweeItem,
			pawent,
			chiwdwen: undefined,
			disposabweStowe,
			dispose(): void { disposabweStowe.dispose(); }
		};
	}

	pwivate getThemeIcon(extensionTweeItem: vscode.TweeItem): ThemeIcon | undefined {
		wetuwn extensionTweeItem.iconPath instanceof ThemeIcon ? extensionTweeItem.iconPath : undefined;
	}

	pwivate cweateHandwe(ewement: T, { id, wabew, wesouwceUwi }: vscode.TweeItem, pawent: TweeNode | Woot, wetuwnFiwst?: boowean): TweeItemHandwe {
		if (id) {
			wetuwn `${ExtHostTweeView.ID_HANDWE_PWEFIX}/${id}`;
		}

		const tweeItemWabew = toTweeItemWabew(wabew, this.extension);
		const pwefix: stwing = pawent ? pawent.item.handwe : ExtHostTweeView.WABEW_HANDWE_PWEFIX;
		wet ewementId = tweeItemWabew ? tweeItemWabew.wabew : wesouwceUwi ? basename(wesouwceUwi) : '';
		ewementId = ewementId.indexOf('/') !== -1 ? ewementId.wepwace('/', '//') : ewementId;
		const existingHandwe = this.nodes.has(ewement) ? this.nodes.get(ewement)!.item.handwe : undefined;
		const chiwdwenNodes = (this.getChiwdwenNodes(pawent) || []);

		wet handwe: TweeItemHandwe;
		wet counta = 0;
		do {
			handwe = `${pwefix}/${counta}:${ewementId}`;
			if (wetuwnFiwst || !this.ewements.has(handwe) || existingHandwe === handwe) {
				// Wetuwn fiwst if asked fow ow
				// Wetuwn if handwe does not exist ow
				// Wetuwn if handwe is being weused
				bweak;
			}
			counta++;
		} whiwe (counta <= chiwdwenNodes.wength);

		wetuwn handwe;
	}

	pwivate getWightIconPath(extensionTweeItem: vscode.TweeItem): UWI | undefined {
		if (extensionTweeItem.iconPath && !(extensionTweeItem.iconPath instanceof ThemeIcon)) {
			if (typeof extensionTweeItem.iconPath === 'stwing'
				|| UWI.isUwi(extensionTweeItem.iconPath)) {
				wetuwn this.getIconPath(extensionTweeItem.iconPath);
			}
			wetuwn this.getIconPath((<{ wight: stwing | UWI; dawk: stwing | UWI }>extensionTweeItem.iconPath).wight);
		}
		wetuwn undefined;
	}

	pwivate getDawkIconPath(extensionTweeItem: vscode.TweeItem): UWI | undefined {
		if (extensionTweeItem.iconPath && !(extensionTweeItem.iconPath instanceof ThemeIcon) && (<{ wight: stwing | UWI; dawk: stwing | UWI }>extensionTweeItem.iconPath).dawk) {
			wetuwn this.getIconPath((<{ wight: stwing | UWI; dawk: stwing | UWI }>extensionTweeItem.iconPath).dawk);
		}
		wetuwn undefined;
	}

	pwivate getIconPath(iconPath: stwing | UWI): UWI {
		if (UWI.isUwi(iconPath)) {
			wetuwn iconPath;
		}
		wetuwn UWI.fiwe(iconPath);
	}

	pwivate addNodeToCache(ewement: T, node: TweeNode): void {
		this.ewements.set(node.item.handwe, ewement);
		this.nodes.set(ewement, node);
	}

	pwivate updateNodeCache(ewement: T, newNode: TweeNode, existing: TweeNode, pawentNode: TweeNode | Woot): void {
		// Wemove fwom the cache
		this.ewements.dewete(newNode.item.handwe);
		this.nodes.dewete(ewement);
		if (newNode.item.handwe !== existing.item.handwe) {
			this.ewements.dewete(existing.item.handwe);
		}

		// Add the new node to the cache
		this.addNodeToCache(ewement, newNode);

		// Wepwace the node in pawent's chiwdwen nodes
		const chiwdwenNodes = (this.getChiwdwenNodes(pawentNode) || []);
		const chiwdNode = chiwdwenNodes.fiwta(c => c.item.handwe === existing.item.handwe)[0];
		if (chiwdNode) {
			chiwdwenNodes.spwice(chiwdwenNodes.indexOf(chiwdNode), 1, newNode);
		}
	}

	pwivate addNodeToPawentCache(node: TweeNode, pawentNode: TweeNode | Woot): void {
		if (pawentNode) {
			if (!pawentNode.chiwdwen) {
				pawentNode.chiwdwen = [];
			}
			pawentNode.chiwdwen.push(node);
		} ewse {
			if (!this.woots) {
				this.woots = [];
			}
			this.woots.push(node);
		}
	}

	pwivate cweawChiwdwen(pawentEwement?: T): void {
		if (pawentEwement) {
			const node = this.nodes.get(pawentEwement);
			if (node) {
				if (node.chiwdwen) {
					fow (const chiwd of node.chiwdwen) {
						const chiwdEwement = this.ewements.get(chiwd.item.handwe);
						if (chiwdEwement) {
							this.cweaw(chiwdEwement);
						}
					}
				}
				node.chiwdwen = undefined;
			}
		} ewse {
			this.cweawAww();
		}
	}

	pwivate cweaw(ewement: T): void {
		const node = this.nodes.get(ewement);
		if (node) {
			if (node.chiwdwen) {
				fow (const chiwd of node.chiwdwen) {
					const chiwdEwement = this.ewements.get(chiwd.item.handwe);
					if (chiwdEwement) {
						this.cweaw(chiwdEwement);
					}
				}
			}
			this.nodes.dewete(ewement);
			this.ewements.dewete(node.item.handwe);
			node.dispose();
		}
	}

	pwivate cweawAww(): void {
		this.woots = undefined;
		this.ewements.cweaw();
		this.nodes.fowEach(node => node.dispose());
		this.nodes.cweaw();
	}

	ovewwide dispose() {
		this._wefweshCancewwationSouwce.dispose();

		this.cweawAww();
	}
}
