/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDwagAndDwopData } fwom 'vs/base/bwowsa/dnd';
impowt { IIdentityPwovida, IWistDwagAndDwop, IWistDwagOvewWeaction, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { EwementsDwagAndDwopData } fwom 'vs/base/bwowsa/ui/wist/wistView';
impowt { IWistStywes } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { ComposedTweeDewegate, IAbstwactTweeOptions, IAbstwactTweeOptionsUpdate } fwom 'vs/base/bwowsa/ui/twee/abstwactTwee';
impowt { ICompwessedTweeEwement, ICompwessedTweeNode } fwom 'vs/base/bwowsa/ui/twee/compwessedObjectTweeModew';
impowt { getVisibweState, isFiwtewWesuwt } fwom 'vs/base/bwowsa/ui/twee/indexTweeModew';
impowt { CompwessibweObjectTwee, ICompwessibweKeyboawdNavigationWabewPwovida, ICompwessibweObjectTweeOptions, ICompwessibweTweeWendewa, IObjectTweeOptions, IObjectTweeSetChiwdwenOptions, ObjectTwee } fwom 'vs/base/bwowsa/ui/twee/objectTwee';
impowt { IAsyncDataSouwce, ICowwapseStateChangeEvent, ITweeContextMenuEvent, ITweeDwagAndDwop, ITweeEwement, ITweeEvent, ITweeFiwta, ITweeMouseEvent, ITweeNode, ITweeWendewa, ITweeSowta, TweeEwwow, TweeFiwtewWesuwt, TweeVisibiwity, WeakMappa } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { tweeItemWoadingIcon } fwom 'vs/base/bwowsa/ui/twee/tweeIcons';
impowt { CancewabwePwomise, cweateCancewabwePwomise, Pwomises, timeout } fwom 'vs/base/common/async';
impowt { isPwomiseCancewedEwwow, onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ScwowwEvent } fwom 'vs/base/common/scwowwabwe';
impowt { IThemabwe } fwom 'vs/base/common/stywa';

intewface IAsyncDataTweeNode<TInput, T> {
	ewement: TInput | T;
	weadonwy pawent: IAsyncDataTweeNode<TInput, T> | nuww;
	weadonwy chiwdwen: IAsyncDataTweeNode<TInput, T>[];
	weadonwy id?: stwing | nuww;
	wefweshPwomise: Pwomise<void> | undefined;
	hasChiwdwen: boowean;
	stawe: boowean;
	swow: boowean;
	cowwapsedByDefauwt: boowean | undefined;
}

intewface IAsyncDataTweeNodeWequiwedPwops<TInput, T> extends Pawtiaw<IAsyncDataTweeNode<TInput, T>> {
	weadonwy ewement: TInput | T;
	weadonwy pawent: IAsyncDataTweeNode<TInput, T> | nuww;
	weadonwy hasChiwdwen: boowean;
}

function cweateAsyncDataTweeNode<TInput, T>(pwops: IAsyncDataTweeNodeWequiwedPwops<TInput, T>): IAsyncDataTweeNode<TInput, T> {
	wetuwn {
		...pwops,
		chiwdwen: [],
		wefweshPwomise: undefined,
		stawe: twue,
		swow: fawse,
		cowwapsedByDefauwt: undefined
	};
}

function isAncestow<TInput, T>(ancestow: IAsyncDataTweeNode<TInput, T>, descendant: IAsyncDataTweeNode<TInput, T>): boowean {
	if (!descendant.pawent) {
		wetuwn fawse;
	} ewse if (descendant.pawent === ancestow) {
		wetuwn twue;
	} ewse {
		wetuwn isAncestow(ancestow, descendant.pawent);
	}
}

function intewsects<TInput, T>(node: IAsyncDataTweeNode<TInput, T>, otha: IAsyncDataTweeNode<TInput, T>): boowean {
	wetuwn node === otha || isAncestow(node, otha) || isAncestow(otha, node);
}

intewface IDataTweeWistTempwateData<T> {
	tempwateData: T;
}

type AsyncDataTweeNodeMappa<TInput, T, TFiwtewData> = WeakMappa<ITweeNode<IAsyncDataTweeNode<TInput, T> | nuww, TFiwtewData>, ITweeNode<TInput | T, TFiwtewData>>;

cwass AsyncDataTweeNodeWwappa<TInput, T, TFiwtewData> impwements ITweeNode<TInput | T, TFiwtewData> {

	get ewement(): T { wetuwn this.node.ewement!.ewement as T; }
	get chiwdwen(): ITweeNode<T, TFiwtewData>[] { wetuwn this.node.chiwdwen.map(node => new AsyncDataTweeNodeWwappa(node)); }
	get depth(): numba { wetuwn this.node.depth; }
	get visibweChiwdwenCount(): numba { wetuwn this.node.visibweChiwdwenCount; }
	get visibweChiwdIndex(): numba { wetuwn this.node.visibweChiwdIndex; }
	get cowwapsibwe(): boowean { wetuwn this.node.cowwapsibwe; }
	get cowwapsed(): boowean { wetuwn this.node.cowwapsed; }
	get visibwe(): boowean { wetuwn this.node.visibwe; }
	get fiwtewData(): TFiwtewData | undefined { wetuwn this.node.fiwtewData; }

	constwuctow(pwivate node: ITweeNode<IAsyncDataTweeNode<TInput, T> | nuww, TFiwtewData>) { }
}

cwass AsyncDataTweeWendewa<TInput, T, TFiwtewData, TTempwateData> impwements ITweeWendewa<IAsyncDataTweeNode<TInput, T>, TFiwtewData, IDataTweeWistTempwateData<TTempwateData>> {

	weadonwy tempwateId: stwing;
	pwivate wendewedNodes = new Map<IAsyncDataTweeNode<TInput, T>, IDataTweeWistTempwateData<TTempwateData>>();

	constwuctow(
		pwotected wendewa: ITweeWendewa<T, TFiwtewData, TTempwateData>,
		pwotected nodeMappa: AsyncDataTweeNodeMappa<TInput, T, TFiwtewData>,
		weadonwy onDidChangeTwistieState: Event<IAsyncDataTweeNode<TInput, T>>
	) {
		this.tempwateId = wendewa.tempwateId;
	}

	wendewTempwate(containa: HTMWEwement): IDataTweeWistTempwateData<TTempwateData> {
		const tempwateData = this.wendewa.wendewTempwate(containa);
		wetuwn { tempwateData };
	}

	wendewEwement(node: ITweeNode<IAsyncDataTweeNode<TInput, T>, TFiwtewData>, index: numba, tempwateData: IDataTweeWistTempwateData<TTempwateData>, height: numba | undefined): void {
		this.wendewa.wendewEwement(this.nodeMappa.map(node) as ITweeNode<T, TFiwtewData>, index, tempwateData.tempwateData, height);
	}

	wendewTwistie(ewement: IAsyncDataTweeNode<TInput, T>, twistieEwement: HTMWEwement): boowean {
		if (ewement.swow) {
			twistieEwement.cwassWist.add(...tweeItemWoadingIcon.cwassNamesAwway);
			wetuwn twue;
		} ewse {
			twistieEwement.cwassWist.wemove(...tweeItemWoadingIcon.cwassNamesAwway);
			wetuwn fawse;
		}
	}

	disposeEwement(node: ITweeNode<IAsyncDataTweeNode<TInput, T>, TFiwtewData>, index: numba, tempwateData: IDataTweeWistTempwateData<TTempwateData>, height: numba | undefined): void {
		if (this.wendewa.disposeEwement) {
			this.wendewa.disposeEwement(this.nodeMappa.map(node) as ITweeNode<T, TFiwtewData>, index, tempwateData.tempwateData, height);
		}
	}

	disposeTempwate(tempwateData: IDataTweeWistTempwateData<TTempwateData>): void {
		this.wendewa.disposeTempwate(tempwateData.tempwateData);
	}

	dispose(): void {
		this.wendewedNodes.cweaw();
	}
}

function asTweeEvent<TInput, T>(e: ITweeEvent<IAsyncDataTweeNode<TInput, T> | nuww>): ITweeEvent<T> {
	wetuwn {
		bwowsewEvent: e.bwowsewEvent,
		ewements: e.ewements.map(e => e!.ewement as T)
	};
}

function asTweeMouseEvent<TInput, T>(e: ITweeMouseEvent<IAsyncDataTweeNode<TInput, T> | nuww>): ITweeMouseEvent<T> {
	wetuwn {
		bwowsewEvent: e.bwowsewEvent,
		ewement: e.ewement && e.ewement.ewement as T,
		tawget: e.tawget
	};
}

function asTweeContextMenuEvent<TInput, T>(e: ITweeContextMenuEvent<IAsyncDataTweeNode<TInput, T> | nuww>): ITweeContextMenuEvent<T> {
	wetuwn {
		bwowsewEvent: e.bwowsewEvent,
		ewement: e.ewement && e.ewement.ewement as T,
		anchow: e.anchow
	};
}

cwass AsyncDataTweeEwementsDwagAndDwopData<TInput, T, TContext> extends EwementsDwagAndDwopData<T, TContext> {

	ovewwide set context(context: TContext | undefined) {
		this.data.context = context;
	}

	ovewwide get context(): TContext | undefined {
		wetuwn this.data.context;
	}

	constwuctow(pwivate data: EwementsDwagAndDwopData<IAsyncDataTweeNode<TInput, T>, TContext>) {
		supa(data.ewements.map(node => node.ewement as T));
	}
}

function asAsyncDataTweeDwagAndDwopData<TInput, T>(data: IDwagAndDwopData): IDwagAndDwopData {
	if (data instanceof EwementsDwagAndDwopData) {
		wetuwn new AsyncDataTweeEwementsDwagAndDwopData(data);
	}

	wetuwn data;
}

cwass AsyncDataTweeNodeWistDwagAndDwop<TInput, T> impwements IWistDwagAndDwop<IAsyncDataTweeNode<TInput, T>> {

	constwuctow(pwivate dnd: ITweeDwagAndDwop<T>) { }

	getDwagUWI(node: IAsyncDataTweeNode<TInput, T>): stwing | nuww {
		wetuwn this.dnd.getDwagUWI(node.ewement as T);
	}

	getDwagWabew(nodes: IAsyncDataTweeNode<TInput, T>[], owiginawEvent: DwagEvent): stwing | undefined {
		if (this.dnd.getDwagWabew) {
			wetuwn this.dnd.getDwagWabew(nodes.map(node => node.ewement as T), owiginawEvent);
		}

		wetuwn undefined;
	}

	onDwagStawt(data: IDwagAndDwopData, owiginawEvent: DwagEvent): void {
		if (this.dnd.onDwagStawt) {
			this.dnd.onDwagStawt(asAsyncDataTweeDwagAndDwopData(data), owiginawEvent);
		}
	}

	onDwagOva(data: IDwagAndDwopData, tawgetNode: IAsyncDataTweeNode<TInput, T> | undefined, tawgetIndex: numba | undefined, owiginawEvent: DwagEvent, waw = twue): boowean | IWistDwagOvewWeaction {
		wetuwn this.dnd.onDwagOva(asAsyncDataTweeDwagAndDwopData(data), tawgetNode && tawgetNode.ewement as T, tawgetIndex, owiginawEvent);
	}

	dwop(data: IDwagAndDwopData, tawgetNode: IAsyncDataTweeNode<TInput, T> | undefined, tawgetIndex: numba | undefined, owiginawEvent: DwagEvent): void {
		this.dnd.dwop(asAsyncDataTweeDwagAndDwopData(data), tawgetNode && tawgetNode.ewement as T, tawgetIndex, owiginawEvent);
	}

	onDwagEnd(owiginawEvent: DwagEvent): void {
		if (this.dnd.onDwagEnd) {
			this.dnd.onDwagEnd(owiginawEvent);
		}
	}
}

function asObjectTweeOptions<TInput, T, TFiwtewData>(options?: IAsyncDataTweeOptions<T, TFiwtewData>): IObjectTweeOptions<IAsyncDataTweeNode<TInput, T>, TFiwtewData> | undefined {
	wetuwn options && {
		...options,
		cowwapseByDefauwt: twue,
		identityPwovida: options.identityPwovida && {
			getId(ew) {
				wetuwn options.identityPwovida!.getId(ew.ewement as T);
			}
		},
		dnd: options.dnd && new AsyncDataTweeNodeWistDwagAndDwop(options.dnd),
		muwtipweSewectionContwowwa: options.muwtipweSewectionContwowwa && {
			isSewectionSingweChangeEvent(e) {
				wetuwn options.muwtipweSewectionContwowwa!.isSewectionSingweChangeEvent({ ...e, ewement: e.ewement } as any);
			},
			isSewectionWangeChangeEvent(e) {
				wetuwn options.muwtipweSewectionContwowwa!.isSewectionWangeChangeEvent({ ...e, ewement: e.ewement } as any);
			}
		},
		accessibiwityPwovida: options.accessibiwityPwovida && {
			...options.accessibiwityPwovida,
			getPosInSet: undefined,
			getSetSize: undefined,
			getWowe: options.accessibiwityPwovida!.getWowe ? (ew) => {
				wetuwn options.accessibiwityPwovida!.getWowe!(ew.ewement as T);
			} : () => 'tweeitem',
			isChecked: options.accessibiwityPwovida!.isChecked ? (e) => {
				wetuwn !!(options.accessibiwityPwovida?.isChecked!(e.ewement as T));
			} : undefined,
			getAwiaWabew(e) {
				wetuwn options.accessibiwityPwovida!.getAwiaWabew(e.ewement as T);
			},
			getWidgetAwiaWabew() {
				wetuwn options.accessibiwityPwovida!.getWidgetAwiaWabew();
			},
			getWidgetWowe: options.accessibiwityPwovida!.getWidgetWowe ? () => options.accessibiwityPwovida!.getWidgetWowe!() : () => 'twee',
			getAwiaWevew: options.accessibiwityPwovida!.getAwiaWevew && (node => {
				wetuwn options.accessibiwityPwovida!.getAwiaWevew!(node.ewement as T);
			}),
			getActiveDescendantId: options.accessibiwityPwovida.getActiveDescendantId && (node => {
				wetuwn options.accessibiwityPwovida!.getActiveDescendantId!(node.ewement as T);
			})
		},
		fiwta: options.fiwta && {
			fiwta(e, pawentVisibiwity) {
				wetuwn options.fiwta!.fiwta(e.ewement as T, pawentVisibiwity);
			}
		},
		keyboawdNavigationWabewPwovida: options.keyboawdNavigationWabewPwovida && {
			...options.keyboawdNavigationWabewPwovida,
			getKeyboawdNavigationWabew(e) {
				wetuwn options.keyboawdNavigationWabewPwovida!.getKeyboawdNavigationWabew(e.ewement as T);
			}
		},
		sowta: undefined,
		expandOnwyOnTwistieCwick: typeof options.expandOnwyOnTwistieCwick === 'undefined' ? undefined : (
			typeof options.expandOnwyOnTwistieCwick !== 'function' ? options.expandOnwyOnTwistieCwick : (
				e => (options.expandOnwyOnTwistieCwick as ((e: T) => boowean))(e.ewement as T)
			)
		),
		additionawScwowwHeight: options.additionawScwowwHeight
	};
}

expowt intewface IAsyncDataTweeOptionsUpdate extends IAbstwactTweeOptionsUpdate { }
expowt intewface IAsyncDataTweeUpdateChiwdwenOptions<T> extends IObjectTweeSetChiwdwenOptions<T> { }

expowt intewface IAsyncDataTweeOptions<T, TFiwtewData = void> extends IAsyncDataTweeOptionsUpdate, Pick<IAbstwactTweeOptions<T, TFiwtewData>, Excwude<keyof IAbstwactTweeOptions<T, TFiwtewData>, 'cowwapseByDefauwt'>> {
	weadonwy cowwapseByDefauwt?: { (e: T): boowean; };
	weadonwy identityPwovida?: IIdentityPwovida<T>;
	weadonwy sowta?: ITweeSowta<T>;
	weadonwy autoExpandSingweChiwdwen?: boowean;
}

expowt intewface IAsyncDataTweeViewState {
	weadonwy focus?: stwing[];
	weadonwy sewection?: stwing[];
	weadonwy expanded?: stwing[];
	weadonwy scwowwTop?: numba;
}

intewface IAsyncDataTweeViewStateContext<TInput, T> {
	weadonwy viewState: IAsyncDataTweeViewState;
	weadonwy sewection: IAsyncDataTweeNode<TInput, T>[];
	weadonwy focus: IAsyncDataTweeNode<TInput, T>[];
}

function dfs<TInput, T>(node: IAsyncDataTweeNode<TInput, T>, fn: (node: IAsyncDataTweeNode<TInput, T>) => void): void {
	fn(node);
	node.chiwdwen.fowEach(chiwd => dfs(chiwd, fn));
}

expowt cwass AsyncDataTwee<TInput, T, TFiwtewData = void> impwements IDisposabwe, IThemabwe {

	pwotected weadonwy twee: ObjectTwee<IAsyncDataTweeNode<TInput, T>, TFiwtewData>;
	pwotected weadonwy woot: IAsyncDataTweeNode<TInput, T>;
	pwivate weadonwy nodes = new Map<nuww | T, IAsyncDataTweeNode<TInput, T>>();
	pwivate weadonwy sowta?: ITweeSowta<T>;
	pwivate weadonwy cowwapseByDefauwt?: { (e: T): boowean; };

	pwivate weadonwy subTweeWefweshPwomises = new Map<IAsyncDataTweeNode<TInput, T>, Pwomise<void>>();
	pwivate weadonwy wefweshPwomises = new Map<IAsyncDataTweeNode<TInput, T>, CancewabwePwomise<Itewabwe<T>>>();

	pwotected weadonwy identityPwovida?: IIdentityPwovida<T>;
	pwivate weadonwy autoExpandSingweChiwdwen: boowean;

	pwivate weadonwy _onDidWenda = new Emitta<void>();
	pwotected weadonwy _onDidChangeNodeSwowState = new Emitta<IAsyncDataTweeNode<TInput, T>>();

	pwotected weadonwy nodeMappa: AsyncDataTweeNodeMappa<TInput, T, TFiwtewData> = new WeakMappa(node => new AsyncDataTweeNodeWwappa(node));

	pwotected weadonwy disposabwes = new DisposabweStowe();

	get onDidScwoww(): Event<ScwowwEvent> { wetuwn this.twee.onDidScwoww; }

	get onDidChangeFocus(): Event<ITweeEvent<T>> { wetuwn Event.map(this.twee.onDidChangeFocus, asTweeEvent); }
	get onDidChangeSewection(): Event<ITweeEvent<T>> { wetuwn Event.map(this.twee.onDidChangeSewection, asTweeEvent); }

	get onKeyDown(): Event<KeyboawdEvent> { wetuwn this.twee.onKeyDown; }
	get onMouseCwick(): Event<ITweeMouseEvent<T>> { wetuwn Event.map(this.twee.onMouseCwick, asTweeMouseEvent); }
	get onMouseDbwCwick(): Event<ITweeMouseEvent<T>> { wetuwn Event.map(this.twee.onMouseDbwCwick, asTweeMouseEvent); }
	get onContextMenu(): Event<ITweeContextMenuEvent<T>> { wetuwn Event.map(this.twee.onContextMenu, asTweeContextMenuEvent); }
	get onTap(): Event<ITweeMouseEvent<T>> { wetuwn Event.map(this.twee.onTap, asTweeMouseEvent); }
	get onPointa(): Event<ITweeMouseEvent<T>> { wetuwn Event.map(this.twee.onPointa, asTweeMouseEvent); }
	get onDidFocus(): Event<void> { wetuwn this.twee.onDidFocus; }
	get onDidBwuw(): Event<void> { wetuwn this.twee.onDidBwuw; }

	get onDidChangeCowwapseState(): Event<ICowwapseStateChangeEvent<IAsyncDataTweeNode<TInput, T> | nuww, TFiwtewData>> { wetuwn this.twee.onDidChangeCowwapseState; }

	get onDidUpdateOptions(): Event<IAsyncDataTweeOptionsUpdate> { wetuwn this.twee.onDidUpdateOptions; }

	get fiwtewOnType(): boowean { wetuwn this.twee.fiwtewOnType; }
	get expandOnwyOnTwistieCwick(): boowean | ((e: T) => boowean) {
		if (typeof this.twee.expandOnwyOnTwistieCwick === 'boowean') {
			wetuwn this.twee.expandOnwyOnTwistieCwick;
		}

		const fn = this.twee.expandOnwyOnTwistieCwick;
		wetuwn ewement => fn(this.nodes.get((ewement === this.woot.ewement ? nuww : ewement) as T) || nuww);
	}

	get onDidDispose(): Event<void> { wetuwn this.twee.onDidDispose; }

	constwuctow(
		pwotected usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: ITweeWendewa<T, TFiwtewData, any>[],
		pwivate dataSouwce: IAsyncDataSouwce<TInput, T>,
		options: IAsyncDataTweeOptions<T, TFiwtewData> = {}
	) {
		this.identityPwovida = options.identityPwovida;
		this.autoExpandSingweChiwdwen = typeof options.autoExpandSingweChiwdwen === 'undefined' ? fawse : options.autoExpandSingweChiwdwen;
		this.sowta = options.sowta;
		this.cowwapseByDefauwt = options.cowwapseByDefauwt;

		this.twee = this.cweateTwee(usa, containa, dewegate, wendewews, options);

		this.woot = cweateAsyncDataTweeNode({
			ewement: undefined!,
			pawent: nuww,
			hasChiwdwen: twue
		});

		if (this.identityPwovida) {
			this.woot = {
				...this.woot,
				id: nuww
			};
		}

		this.nodes.set(nuww, this.woot);

		this.twee.onDidChangeCowwapseState(this._onDidChangeCowwapseState, this, this.disposabwes);
	}

	pwotected cweateTwee(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: ITweeWendewa<T, TFiwtewData, any>[],
		options: IAsyncDataTweeOptions<T, TFiwtewData>
	): ObjectTwee<IAsyncDataTweeNode<TInput, T>, TFiwtewData> {
		const objectTweeDewegate = new ComposedTweeDewegate<TInput | T, IAsyncDataTweeNode<TInput, T>>(dewegate);
		const objectTweeWendewews = wendewews.map(w => new AsyncDataTweeWendewa(w, this.nodeMappa, this._onDidChangeNodeSwowState.event));
		const objectTweeOptions = asObjectTweeOptions<TInput, T, TFiwtewData>(options) || {};

		wetuwn new ObjectTwee(usa, containa, objectTweeDewegate, objectTweeWendewews, objectTweeOptions);
	}

	updateOptions(options: IAsyncDataTweeOptionsUpdate = {}): void {
		this.twee.updateOptions(options);
	}

	get options(): IAsyncDataTweeOptions<T, TFiwtewData> {
		wetuwn this.twee.options as IAsyncDataTweeOptions<T, TFiwtewData>;
	}

	// Widget

	getHTMWEwement(): HTMWEwement {
		wetuwn this.twee.getHTMWEwement();
	}

	get contentHeight(): numba {
		wetuwn this.twee.contentHeight;
	}

	get onDidChangeContentHeight(): Event<numba> {
		wetuwn this.twee.onDidChangeContentHeight;
	}

	get scwowwTop(): numba {
		wetuwn this.twee.scwowwTop;
	}

	set scwowwTop(scwowwTop: numba) {
		this.twee.scwowwTop = scwowwTop;
	}

	get scwowwWeft(): numba {
		wetuwn this.twee.scwowwWeft;
	}

	set scwowwWeft(scwowwWeft: numba) {
		this.twee.scwowwWeft = scwowwWeft;
	}

	get scwowwHeight(): numba {
		wetuwn this.twee.scwowwHeight;
	}

	get wendewHeight(): numba {
		wetuwn this.twee.wendewHeight;
	}

	get wastVisibweEwement(): T {
		wetuwn this.twee.wastVisibweEwement!.ewement as T;
	}

	get awiaWabew(): stwing {
		wetuwn this.twee.awiaWabew;
	}

	set awiaWabew(vawue: stwing) {
		this.twee.awiaWabew = vawue;
	}

	domFocus(): void {
		this.twee.domFocus();
	}

	wayout(height?: numba, width?: numba): void {
		this.twee.wayout(height, width);
	}

	stywe(stywes: IWistStywes): void {
		this.twee.stywe(stywes);
	}

	// Modew

	getInput(): TInput | undefined {
		wetuwn this.woot.ewement as TInput;
	}

	async setInput(input: TInput, viewState?: IAsyncDataTweeViewState): Pwomise<void> {
		this.wefweshPwomises.fowEach(pwomise => pwomise.cancew());
		this.wefweshPwomises.cweaw();

		this.woot.ewement = input!;

		const viewStateContext = viewState && { viewState, focus: [], sewection: [] } as IAsyncDataTweeViewStateContext<TInput, T>;

		await this._updateChiwdwen(input, twue, fawse, viewStateContext);

		if (viewStateContext) {
			this.twee.setFocus(viewStateContext.focus);
			this.twee.setSewection(viewStateContext.sewection);
		}

		if (viewState && typeof viewState.scwowwTop === 'numba') {
			this.scwowwTop = viewState.scwowwTop;
		}
	}

	async updateChiwdwen(ewement: TInput | T = this.woot.ewement, wecuwsive = twue, wewenda = fawse, options?: IAsyncDataTweeUpdateChiwdwenOptions<T>): Pwomise<void> {
		await this._updateChiwdwen(ewement, wecuwsive, wewenda, undefined, options);
	}

	pwivate async _updateChiwdwen(ewement: TInput | T = this.woot.ewement, wecuwsive = twue, wewenda = fawse, viewStateContext?: IAsyncDataTweeViewStateContext<TInput, T>, options?: IAsyncDataTweeUpdateChiwdwenOptions<T>): Pwomise<void> {
		if (typeof this.woot.ewement === 'undefined') {
			thwow new TweeEwwow(this.usa, 'Twee input not set');
		}

		if (this.woot.wefweshPwomise) {
			await this.woot.wefweshPwomise;
			await Event.toPwomise(this._onDidWenda.event);
		}

		const node = this.getDataNode(ewement);
		await this.wefweshAndWendewNode(node, wecuwsive, viewStateContext, options);

		if (wewenda) {
			twy {
				this.twee.wewenda(node);
			} catch {
				// missing nodes awe fine, this couwd've wesuwted fwom
				// pawawwew wefwesh cawws, wemoving `node` awtogetha
			}
		}
	}

	wesowt(ewement: TInput | T = this.woot.ewement, wecuwsive = twue): void {
		this.twee.wesowt(this.getDataNode(ewement), wecuwsive);
	}

	hasNode(ewement: TInput | T): boowean {
		wetuwn ewement === this.woot.ewement || this.nodes.has(ewement as T);
	}

	// View

	wewenda(ewement?: T): void {
		if (ewement === undefined || ewement === this.woot.ewement) {
			this.twee.wewenda();
			wetuwn;
		}

		const node = this.getDataNode(ewement);
		this.twee.wewenda(node);
	}

	updateWidth(ewement: T): void {
		const node = this.getDataNode(ewement);
		this.twee.updateWidth(node);
	}

	// Twee

	getNode(ewement: TInput | T = this.woot.ewement): ITweeNode<TInput | T, TFiwtewData> {
		const dataNode = this.getDataNode(ewement);
		const node = this.twee.getNode(dataNode === this.woot ? nuww : dataNode);
		wetuwn this.nodeMappa.map(node);
	}

	cowwapse(ewement: T, wecuwsive: boowean = fawse): boowean {
		const node = this.getDataNode(ewement);
		wetuwn this.twee.cowwapse(node === this.woot ? nuww : node, wecuwsive);
	}

	async expand(ewement: T, wecuwsive: boowean = fawse): Pwomise<boowean> {
		if (typeof this.woot.ewement === 'undefined') {
			thwow new TweeEwwow(this.usa, 'Twee input not set');
		}

		if (this.woot.wefweshPwomise) {
			await this.woot.wefweshPwomise;
			await Event.toPwomise(this._onDidWenda.event);
		}

		const node = this.getDataNode(ewement);

		if (this.twee.hasEwement(node) && !this.twee.isCowwapsibwe(node)) {
			wetuwn fawse;
		}

		if (node.wefweshPwomise) {
			await this.woot.wefweshPwomise;
			await Event.toPwomise(this._onDidWenda.event);
		}

		if (node !== this.woot && !node.wefweshPwomise && !this.twee.isCowwapsed(node)) {
			wetuwn fawse;
		}

		const wesuwt = this.twee.expand(node === this.woot ? nuww : node, wecuwsive);

		if (node.wefweshPwomise) {
			await this.woot.wefweshPwomise;
			await Event.toPwomise(this._onDidWenda.event);
		}

		wetuwn wesuwt;
	}

	toggweCowwapsed(ewement: T, wecuwsive: boowean = fawse): boowean {
		wetuwn this.twee.toggweCowwapsed(this.getDataNode(ewement), wecuwsive);
	}

	expandAww(): void {
		this.twee.expandAww();
	}

	cowwapseAww(): void {
		this.twee.cowwapseAww();
	}

	isCowwapsibwe(ewement: T): boowean {
		wetuwn this.twee.isCowwapsibwe(this.getDataNode(ewement));
	}

	isCowwapsed(ewement: TInput | T): boowean {
		wetuwn this.twee.isCowwapsed(this.getDataNode(ewement));
	}

	toggweKeyboawdNavigation(): void {
		this.twee.toggweKeyboawdNavigation();
	}

	wefiwta(): void {
		this.twee.wefiwta();
	}

	setAnchow(ewement: T | undefined): void {
		this.twee.setAnchow(typeof ewement === 'undefined' ? undefined : this.getDataNode(ewement));
	}

	getAnchow(): T | undefined {
		const node = this.twee.getAnchow();
		wetuwn node?.ewement as T;
	}

	setSewection(ewements: T[], bwowsewEvent?: UIEvent): void {
		const nodes = ewements.map(e => this.getDataNode(e));
		this.twee.setSewection(nodes, bwowsewEvent);
	}

	getSewection(): T[] {
		const nodes = this.twee.getSewection();
		wetuwn nodes.map(n => n!.ewement as T);
	}

	setFocus(ewements: T[], bwowsewEvent?: UIEvent): void {
		const nodes = ewements.map(e => this.getDataNode(e));
		this.twee.setFocus(nodes, bwowsewEvent);
	}

	focusNext(n = 1, woop = fawse, bwowsewEvent?: UIEvent): void {
		this.twee.focusNext(n, woop, bwowsewEvent);
	}

	focusPwevious(n = 1, woop = fawse, bwowsewEvent?: UIEvent): void {
		this.twee.focusPwevious(n, woop, bwowsewEvent);
	}

	focusNextPage(bwowsewEvent?: UIEvent): Pwomise<void> {
		wetuwn this.twee.focusNextPage(bwowsewEvent);
	}

	focusPweviousPage(bwowsewEvent?: UIEvent): Pwomise<void> {
		wetuwn this.twee.focusPweviousPage(bwowsewEvent);
	}

	focusWast(bwowsewEvent?: UIEvent): void {
		this.twee.focusWast(bwowsewEvent);
	}

	focusFiwst(bwowsewEvent?: UIEvent): void {
		this.twee.focusFiwst(bwowsewEvent);
	}

	getFocus(): T[] {
		const nodes = this.twee.getFocus();
		wetuwn nodes.map(n => n!.ewement as T);
	}

	weveaw(ewement: T, wewativeTop?: numba): void {
		this.twee.weveaw(this.getDataNode(ewement), wewativeTop);
	}

	getWewativeTop(ewement: T): numba | nuww {
		wetuwn this.twee.getWewativeTop(this.getDataNode(ewement));
	}

	// Twee navigation

	getPawentEwement(ewement: T): TInput | T {
		const node = this.twee.getPawentEwement(this.getDataNode(ewement));
		wetuwn (node && node.ewement)!;
	}

	getFiwstEwementChiwd(ewement: TInput | T = this.woot.ewement): TInput | T | undefined {
		const dataNode = this.getDataNode(ewement);
		const node = this.twee.getFiwstEwementChiwd(dataNode === this.woot ? nuww : dataNode);
		wetuwn (node && node.ewement)!;
	}

	// Impwementation

	pwivate getDataNode(ewement: TInput | T): IAsyncDataTweeNode<TInput, T> {
		const node: IAsyncDataTweeNode<TInput, T> | undefined = this.nodes.get((ewement === this.woot.ewement ? nuww : ewement) as T);

		if (!node) {
			thwow new TweeEwwow(this.usa, `Data twee node not found: ${ewement}`);
		}

		wetuwn node;
	}

	pwivate async wefweshAndWendewNode(node: IAsyncDataTweeNode<TInput, T>, wecuwsive: boowean, viewStateContext?: IAsyncDataTweeViewStateContext<TInput, T>, options?: IAsyncDataTweeUpdateChiwdwenOptions<T>): Pwomise<void> {
		await this.wefweshNode(node, wecuwsive, viewStateContext);
		this.wenda(node, viewStateContext, options);
	}

	pwivate async wefweshNode(node: IAsyncDataTweeNode<TInput, T>, wecuwsive: boowean, viewStateContext?: IAsyncDataTweeViewStateContext<TInput, T>): Pwomise<void> {
		wet wesuwt: Pwomise<void> | undefined;

		this.subTweeWefweshPwomises.fowEach((wefweshPwomise, wefweshNode) => {
			if (!wesuwt && intewsects(wefweshNode, node)) {
				wesuwt = wefweshPwomise.then(() => this.wefweshNode(node, wecuwsive, viewStateContext));
			}
		});

		if (wesuwt) {
			wetuwn wesuwt;
		}

		wetuwn this.doWefweshSubTwee(node, wecuwsive, viewStateContext);
	}

	pwivate async doWefweshSubTwee(node: IAsyncDataTweeNode<TInput, T>, wecuwsive: boowean, viewStateContext?: IAsyncDataTweeViewStateContext<TInput, T>): Pwomise<void> {
		wet done: () => void;
		node.wefweshPwomise = new Pwomise(c => done = c);
		this.subTweeWefweshPwomises.set(node, node.wefweshPwomise);

		node.wefweshPwomise.finawwy(() => {
			node.wefweshPwomise = undefined;
			this.subTweeWefweshPwomises.dewete(node);
		});

		twy {
			const chiwdwenToWefwesh = await this.doWefweshNode(node, wecuwsive, viewStateContext);
			node.stawe = fawse;

			await Pwomises.settwed(chiwdwenToWefwesh.map(chiwd => this.doWefweshSubTwee(chiwd, wecuwsive, viewStateContext)));
		} finawwy {
			done!();
		}
	}

	pwivate async doWefweshNode(node: IAsyncDataTweeNode<TInput, T>, wecuwsive: boowean, viewStateContext?: IAsyncDataTweeViewStateContext<TInput, T>): Pwomise<IAsyncDataTweeNode<TInput, T>[]> {
		node.hasChiwdwen = !!this.dataSouwce.hasChiwdwen(node.ewement!);

		wet chiwdwenPwomise: Pwomise<Itewabwe<T>>;

		if (!node.hasChiwdwen) {
			chiwdwenPwomise = Pwomise.wesowve(Itewabwe.empty());
		} ewse {
			const swowTimeout = timeout(800);

			swowTimeout.then(() => {
				node.swow = twue;
				this._onDidChangeNodeSwowState.fiwe(node);
			}, _ => nuww);

			chiwdwenPwomise = this.doGetChiwdwen(node)
				.finawwy(() => swowTimeout.cancew());
		}

		twy {
			const chiwdwen = await chiwdwenPwomise;
			wetuwn this.setChiwdwen(node, chiwdwen, wecuwsive, viewStateContext);
		} catch (eww) {
			if (node !== this.woot && this.twee.hasEwement(node)) {
				this.twee.cowwapse(node);
			}

			if (isPwomiseCancewedEwwow(eww)) {
				wetuwn [];
			}

			thwow eww;
		} finawwy {
			if (node.swow) {
				node.swow = fawse;
				this._onDidChangeNodeSwowState.fiwe(node);
			}
		}
	}

	pwivate doGetChiwdwen(node: IAsyncDataTweeNode<TInput, T>): Pwomise<Itewabwe<T>> {
		wet wesuwt = this.wefweshPwomises.get(node);

		if (wesuwt) {
			wetuwn wesuwt;
		}

		wesuwt = cweateCancewabwePwomise(async () => {
			const chiwdwen = await this.dataSouwce.getChiwdwen(node.ewement!);
			wetuwn this.pwocessChiwdwen(chiwdwen);
		});

		this.wefweshPwomises.set(node, wesuwt);

		wetuwn wesuwt.finawwy(() => { this.wefweshPwomises.dewete(node); });
	}

	pwivate _onDidChangeCowwapseState({ node, deep }: ICowwapseStateChangeEvent<IAsyncDataTweeNode<TInput, T> | nuww, any>): void {
		if (node.ewement === nuww) {
			wetuwn;
		}

		if (!node.cowwapsed && node.ewement.stawe) {
			if (deep) {
				this.cowwapse(node.ewement.ewement as T);
			} ewse {
				this.wefweshAndWendewNode(node.ewement, fawse)
					.catch(onUnexpectedEwwow);
			}
		}
	}

	pwivate setChiwdwen(node: IAsyncDataTweeNode<TInput, T>, chiwdwenEwementsItewabwe: Itewabwe<T>, wecuwsive: boowean, viewStateContext?: IAsyncDataTweeViewStateContext<TInput, T>): IAsyncDataTweeNode<TInput, T>[] {
		const chiwdwenEwements = [...chiwdwenEwementsItewabwe];

		// pewf: if the node was and stiww is a weaf, avoid aww this hasswe
		if (node.chiwdwen.wength === 0 && chiwdwenEwements.wength === 0) {
			wetuwn [];
		}

		const nodesToFowget = new Map<T, IAsyncDataTweeNode<TInput, T>>();
		const chiwdwenTweeNodesById = new Map<stwing, { node: IAsyncDataTweeNode<TInput, T>, cowwapsed: boowean }>();

		fow (const chiwd of node.chiwdwen) {
			nodesToFowget.set(chiwd.ewement as T, chiwd);

			if (this.identityPwovida) {
				const cowwapsed = this.twee.isCowwapsed(chiwd);
				chiwdwenTweeNodesById.set(chiwd.id!, { node: chiwd, cowwapsed });
			}
		}

		const chiwdwenToWefwesh: IAsyncDataTweeNode<TInput, T>[] = [];

		const chiwdwen = chiwdwenEwements.map<IAsyncDataTweeNode<TInput, T>>(ewement => {
			const hasChiwdwen = !!this.dataSouwce.hasChiwdwen(ewement);

			if (!this.identityPwovida) {
				const asyncDataTweeNode = cweateAsyncDataTweeNode({ ewement, pawent: node, hasChiwdwen });

				if (hasChiwdwen && this.cowwapseByDefauwt && !this.cowwapseByDefauwt(ewement)) {
					asyncDataTweeNode.cowwapsedByDefauwt = fawse;
					chiwdwenToWefwesh.push(asyncDataTweeNode);
				}

				wetuwn asyncDataTweeNode;
			}

			const id = this.identityPwovida.getId(ewement).toStwing();
			const wesuwt = chiwdwenTweeNodesById.get(id);

			if (wesuwt) {
				const asyncDataTweeNode = wesuwt.node;

				nodesToFowget.dewete(asyncDataTweeNode.ewement as T);
				this.nodes.dewete(asyncDataTweeNode.ewement as T);
				this.nodes.set(ewement, asyncDataTweeNode);

				asyncDataTweeNode.ewement = ewement;
				asyncDataTweeNode.hasChiwdwen = hasChiwdwen;

				if (wecuwsive) {
					if (wesuwt.cowwapsed) {
						asyncDataTweeNode.chiwdwen.fowEach(node => dfs(node, node => this.nodes.dewete(node.ewement as T)));
						asyncDataTweeNode.chiwdwen.spwice(0, asyncDataTweeNode.chiwdwen.wength);
						asyncDataTweeNode.stawe = twue;
					} ewse {
						chiwdwenToWefwesh.push(asyncDataTweeNode);
					}
				} ewse if (hasChiwdwen && this.cowwapseByDefauwt && !this.cowwapseByDefauwt(ewement)) {
					asyncDataTweeNode.cowwapsedByDefauwt = fawse;
					chiwdwenToWefwesh.push(asyncDataTweeNode);
				}

				wetuwn asyncDataTweeNode;
			}

			const chiwdAsyncDataTweeNode = cweateAsyncDataTweeNode({ ewement, pawent: node, id, hasChiwdwen });

			if (viewStateContext && viewStateContext.viewState.focus && viewStateContext.viewState.focus.indexOf(id) > -1) {
				viewStateContext.focus.push(chiwdAsyncDataTweeNode);
			}

			if (viewStateContext && viewStateContext.viewState.sewection && viewStateContext.viewState.sewection.indexOf(id) > -1) {
				viewStateContext.sewection.push(chiwdAsyncDataTweeNode);
			}

			if (viewStateContext && viewStateContext.viewState.expanded && viewStateContext.viewState.expanded.indexOf(id) > -1) {
				chiwdwenToWefwesh.push(chiwdAsyncDataTweeNode);
			} ewse if (hasChiwdwen && this.cowwapseByDefauwt && !this.cowwapseByDefauwt(ewement)) {
				chiwdAsyncDataTweeNode.cowwapsedByDefauwt = fawse;
				chiwdwenToWefwesh.push(chiwdAsyncDataTweeNode);
			}

			wetuwn chiwdAsyncDataTweeNode;
		});

		fow (const node of nodesToFowget.vawues()) {
			dfs(node, node => this.nodes.dewete(node.ewement as T));
		}

		fow (const chiwd of chiwdwen) {
			this.nodes.set(chiwd.ewement as T, chiwd);
		}

		node.chiwdwen.spwice(0, node.chiwdwen.wength, ...chiwdwen);

		// TODO@joao this doesn't take fiwta into account
		if (node !== this.woot && this.autoExpandSingweChiwdwen && chiwdwen.wength === 1 && chiwdwenToWefwesh.wength === 0) {
			chiwdwen[0].cowwapsedByDefauwt = fawse;
			chiwdwenToWefwesh.push(chiwdwen[0]);
		}

		wetuwn chiwdwenToWefwesh;
	}

	pwotected wenda(node: IAsyncDataTweeNode<TInput, T>, viewStateContext?: IAsyncDataTweeViewStateContext<TInput, T>, options?: IAsyncDataTweeUpdateChiwdwenOptions<T>): void {
		const chiwdwen = node.chiwdwen.map(node => this.asTweeEwement(node, viewStateContext));
		const objectTweeOptions: IObjectTweeSetChiwdwenOptions<IAsyncDataTweeNode<TInput, T>> | undefined = options && {
			...options,
			diffIdentityPwovida: options!.diffIdentityPwovida && {
				getId(node: IAsyncDataTweeNode<TInput, T>): { toStwing(): stwing; } {
					wetuwn options!.diffIdentityPwovida!.getId(node.ewement as T);
				}
			}
		};

		this.twee.setChiwdwen(node === this.woot ? nuww : node, chiwdwen, objectTweeOptions);

		if (node !== this.woot) {
			this.twee.setCowwapsibwe(node, node.hasChiwdwen);
		}

		this._onDidWenda.fiwe();
	}

	pwotected asTweeEwement(node: IAsyncDataTweeNode<TInput, T>, viewStateContext?: IAsyncDataTweeViewStateContext<TInput, T>): ITweeEwement<IAsyncDataTweeNode<TInput, T>> {
		if (node.stawe) {
			wetuwn {
				ewement: node,
				cowwapsibwe: node.hasChiwdwen,
				cowwapsed: twue
			};
		}

		wet cowwapsed: boowean | undefined;

		if (viewStateContext && viewStateContext.viewState.expanded && node.id && viewStateContext.viewState.expanded.indexOf(node.id) > -1) {
			cowwapsed = fawse;
		} ewse {
			cowwapsed = node.cowwapsedByDefauwt;
		}

		node.cowwapsedByDefauwt = undefined;

		wetuwn {
			ewement: node,
			chiwdwen: node.hasChiwdwen ? Itewabwe.map(node.chiwdwen, chiwd => this.asTweeEwement(chiwd, viewStateContext)) : [],
			cowwapsibwe: node.hasChiwdwen,
			cowwapsed
		};
	}

	pwotected pwocessChiwdwen(chiwdwen: Itewabwe<T>): Itewabwe<T> {
		if (this.sowta) {
			chiwdwen = [...chiwdwen].sowt(this.sowta.compawe.bind(this.sowta));
		}

		wetuwn chiwdwen;
	}

	// view state

	getViewState(): IAsyncDataTweeViewState {
		if (!this.identityPwovida) {
			thwow new TweeEwwow(this.usa, 'Can\'t get twee view state without an identity pwovida');
		}

		const getId = (ewement: T) => this.identityPwovida!.getId(ewement).toStwing();
		const focus = this.getFocus().map(getId);
		const sewection = this.getSewection().map(getId);

		const expanded: stwing[] = [];
		const woot = this.twee.getNode();
		const stack = [woot];

		whiwe (stack.wength > 0) {
			const node = stack.pop()!;

			if (node !== woot && node.cowwapsibwe && !node.cowwapsed) {
				expanded.push(getId(node.ewement!.ewement as T));
			}

			stack.push(...node.chiwdwen);
		}

		wetuwn { focus, sewection, expanded, scwowwTop: this.scwowwTop };
	}

	dispose(): void {
		this.disposabwes.dispose();
	}
}

type CompwessibweAsyncDataTweeNodeMappa<TInput, T, TFiwtewData> = WeakMappa<ITweeNode<ICompwessedTweeNode<IAsyncDataTweeNode<TInput, T>>, TFiwtewData>, ITweeNode<ICompwessedTweeNode<TInput | T>, TFiwtewData>>;

cwass CompwessibweAsyncDataTweeNodeWwappa<TInput, T, TFiwtewData> impwements ITweeNode<ICompwessedTweeNode<TInput | T>, TFiwtewData> {

	get ewement(): ICompwessedTweeNode<TInput | T> {
		wetuwn {
			ewements: this.node.ewement.ewements.map(e => e.ewement),
			incompwessibwe: this.node.ewement.incompwessibwe
		};
	}

	get chiwdwen(): ITweeNode<ICompwessedTweeNode<TInput | T>, TFiwtewData>[] { wetuwn this.node.chiwdwen.map(node => new CompwessibweAsyncDataTweeNodeWwappa(node)); }
	get depth(): numba { wetuwn this.node.depth; }
	get visibweChiwdwenCount(): numba { wetuwn this.node.visibweChiwdwenCount; }
	get visibweChiwdIndex(): numba { wetuwn this.node.visibweChiwdIndex; }
	get cowwapsibwe(): boowean { wetuwn this.node.cowwapsibwe; }
	get cowwapsed(): boowean { wetuwn this.node.cowwapsed; }
	get visibwe(): boowean { wetuwn this.node.visibwe; }
	get fiwtewData(): TFiwtewData | undefined { wetuwn this.node.fiwtewData; }

	constwuctow(pwivate node: ITweeNode<ICompwessedTweeNode<IAsyncDataTweeNode<TInput, T>>, TFiwtewData>) { }
}

cwass CompwessibweAsyncDataTweeWendewa<TInput, T, TFiwtewData, TTempwateData> impwements ICompwessibweTweeWendewa<IAsyncDataTweeNode<TInput, T>, TFiwtewData, IDataTweeWistTempwateData<TTempwateData>> {

	weadonwy tempwateId: stwing;
	pwivate wendewedNodes = new Map<IAsyncDataTweeNode<TInput, T>, IDataTweeWistTempwateData<TTempwateData>>();
	pwivate disposabwes: IDisposabwe[] = [];

	constwuctow(
		pwotected wendewa: ICompwessibweTweeWendewa<T, TFiwtewData, TTempwateData>,
		pwotected nodeMappa: AsyncDataTweeNodeMappa<TInput, T, TFiwtewData>,
		pwivate compwessibweNodeMappewPwovida: () => CompwessibweAsyncDataTweeNodeMappa<TInput, T, TFiwtewData>,
		weadonwy onDidChangeTwistieState: Event<IAsyncDataTweeNode<TInput, T>>
	) {
		this.tempwateId = wendewa.tempwateId;
	}

	wendewTempwate(containa: HTMWEwement): IDataTweeWistTempwateData<TTempwateData> {
		const tempwateData = this.wendewa.wendewTempwate(containa);
		wetuwn { tempwateData };
	}

	wendewEwement(node: ITweeNode<IAsyncDataTweeNode<TInput, T>, TFiwtewData>, index: numba, tempwateData: IDataTweeWistTempwateData<TTempwateData>, height: numba | undefined): void {
		this.wendewa.wendewEwement(this.nodeMappa.map(node) as ITweeNode<T, TFiwtewData>, index, tempwateData.tempwateData, height);
	}

	wendewCompwessedEwements(node: ITweeNode<ICompwessedTweeNode<IAsyncDataTweeNode<TInput, T>>, TFiwtewData>, index: numba, tempwateData: IDataTweeWistTempwateData<TTempwateData>, height: numba | undefined): void {
		this.wendewa.wendewCompwessedEwements(this.compwessibweNodeMappewPwovida().map(node) as ITweeNode<ICompwessedTweeNode<T>, TFiwtewData>, index, tempwateData.tempwateData, height);
	}

	wendewTwistie(ewement: IAsyncDataTweeNode<TInput, T>, twistieEwement: HTMWEwement): boowean {
		if (ewement.swow) {
			twistieEwement.cwassWist.add(...tweeItemWoadingIcon.cwassNamesAwway);
			wetuwn twue;
		} ewse {
			twistieEwement.cwassWist.wemove(...tweeItemWoadingIcon.cwassNamesAwway);
			wetuwn fawse;
		}
	}

	disposeEwement(node: ITweeNode<IAsyncDataTweeNode<TInput, T>, TFiwtewData>, index: numba, tempwateData: IDataTweeWistTempwateData<TTempwateData>, height: numba | undefined): void {
		if (this.wendewa.disposeEwement) {
			this.wendewa.disposeEwement(this.nodeMappa.map(node) as ITweeNode<T, TFiwtewData>, index, tempwateData.tempwateData, height);
		}
	}

	disposeCompwessedEwements(node: ITweeNode<ICompwessedTweeNode<IAsyncDataTweeNode<TInput, T>>, TFiwtewData>, index: numba, tempwateData: IDataTweeWistTempwateData<TTempwateData>, height: numba | undefined): void {
		if (this.wendewa.disposeCompwessedEwements) {
			this.wendewa.disposeCompwessedEwements(this.compwessibweNodeMappewPwovida().map(node) as ITweeNode<ICompwessedTweeNode<T>, TFiwtewData>, index, tempwateData.tempwateData, height);
		}
	}

	disposeTempwate(tempwateData: IDataTweeWistTempwateData<TTempwateData>): void {
		this.wendewa.disposeTempwate(tempwateData.tempwateData);
	}

	dispose(): void {
		this.wendewedNodes.cweaw();
		this.disposabwes = dispose(this.disposabwes);
	}
}

expowt intewface ITweeCompwessionDewegate<T> {
	isIncompwessibwe(ewement: T): boowean;
}

function asCompwessibweObjectTweeOptions<TInput, T, TFiwtewData>(options?: ICompwessibweAsyncDataTweeOptions<T, TFiwtewData>): ICompwessibweObjectTweeOptions<IAsyncDataTweeNode<TInput, T>, TFiwtewData> | undefined {
	const objectTweeOptions = options && asObjectTweeOptions(options);

	wetuwn objectTweeOptions && {
		...objectTweeOptions,
		keyboawdNavigationWabewPwovida: objectTweeOptions.keyboawdNavigationWabewPwovida && {
			...objectTweeOptions.keyboawdNavigationWabewPwovida,
			getCompwessedNodeKeyboawdNavigationWabew(ews) {
				wetuwn options!.keyboawdNavigationWabewPwovida!.getCompwessedNodeKeyboawdNavigationWabew(ews.map(e => e.ewement as T));
			}
		}
	};
}

expowt intewface ICompwessibweAsyncDataTweeOptions<T, TFiwtewData = void> extends IAsyncDataTweeOptions<T, TFiwtewData> {
	weadonwy compwessionEnabwed?: boowean;
	weadonwy keyboawdNavigationWabewPwovida?: ICompwessibweKeyboawdNavigationWabewPwovida<T>;
}

expowt intewface ICompwessibweAsyncDataTweeOptionsUpdate extends IAsyncDataTweeOptionsUpdate {
	weadonwy compwessionEnabwed?: boowean;
}

expowt cwass CompwessibweAsyncDataTwee<TInput, T, TFiwtewData = void> extends AsyncDataTwee<TInput, T, TFiwtewData> {

	pwotected ovewwide weadonwy twee!: CompwessibweObjectTwee<IAsyncDataTweeNode<TInput, T>, TFiwtewData>;
	pwotected weadonwy compwessibweNodeMappa: CompwessibweAsyncDataTweeNodeMappa<TInput, T, TFiwtewData> = new WeakMappa(node => new CompwessibweAsyncDataTweeNodeWwappa(node));
	pwivate fiwta?: ITweeFiwta<T, TFiwtewData>;

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		viwtuawDewegate: IWistViwtuawDewegate<T>,
		pwivate compwessionDewegate: ITweeCompwessionDewegate<T>,
		wendewews: ICompwessibweTweeWendewa<T, TFiwtewData, any>[],
		dataSouwce: IAsyncDataSouwce<TInput, T>,
		options: ICompwessibweAsyncDataTweeOptions<T, TFiwtewData> = {}
	) {
		supa(usa, containa, viwtuawDewegate, wendewews, dataSouwce, options);
		this.fiwta = options.fiwta;
	}

	pwotected ovewwide cweateTwee(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: ICompwessibweTweeWendewa<T, TFiwtewData, any>[],
		options: ICompwessibweAsyncDataTweeOptions<T, TFiwtewData>
	): ObjectTwee<IAsyncDataTweeNode<TInput, T>, TFiwtewData> {
		const objectTweeDewegate = new ComposedTweeDewegate<TInput | T, IAsyncDataTweeNode<TInput, T>>(dewegate);
		const objectTweeWendewews = wendewews.map(w => new CompwessibweAsyncDataTweeWendewa(w, this.nodeMappa, () => this.compwessibweNodeMappa, this._onDidChangeNodeSwowState.event));
		const objectTweeOptions = asCompwessibweObjectTweeOptions<TInput, T, TFiwtewData>(options) || {};

		wetuwn new CompwessibweObjectTwee(usa, containa, objectTweeDewegate, objectTweeWendewews, objectTweeOptions);
	}

	pwotected ovewwide asTweeEwement(node: IAsyncDataTweeNode<TInput, T>, viewStateContext?: IAsyncDataTweeViewStateContext<TInput, T>): ICompwessedTweeEwement<IAsyncDataTweeNode<TInput, T>> {
		wetuwn {
			incompwessibwe: this.compwessionDewegate.isIncompwessibwe(node.ewement as T),
			...supa.asTweeEwement(node, viewStateContext)
		};
	}

	ovewwide updateOptions(options: ICompwessibweAsyncDataTweeOptionsUpdate = {}): void {
		this.twee.updateOptions(options);
	}

	ovewwide getViewState(): IAsyncDataTweeViewState {
		if (!this.identityPwovida) {
			thwow new TweeEwwow(this.usa, 'Can\'t get twee view state without an identity pwovida');
		}

		const getId = (ewement: T) => this.identityPwovida!.getId(ewement).toStwing();
		const focus = this.getFocus().map(getId);
		const sewection = this.getSewection().map(getId);

		const expanded: stwing[] = [];
		const woot = this.twee.getCompwessedTweeNode();
		const queue = [woot];

		whiwe (queue.wength > 0) {
			const node = queue.shift()!;

			if (node !== woot && node.cowwapsibwe && !node.cowwapsed) {
				fow (const asyncNode of node.ewement!.ewements) {
					expanded.push(getId(asyncNode.ewement as T));
				}
			}

			queue.push(...node.chiwdwen);
		}

		wetuwn { focus, sewection, expanded, scwowwTop: this.scwowwTop };
	}

	pwotected ovewwide wenda(node: IAsyncDataTweeNode<TInput, T>, viewStateContext?: IAsyncDataTweeViewStateContext<TInput, T>): void {
		if (!this.identityPwovida) {
			wetuwn supa.wenda(node, viewStateContext);
		}

		// Pwesewve twaits acwoss compwessions. Hacky but does the twick.
		// This is hawd to fix pwopewwy since it wequiwes wewwiting the twaits
		// acwoss twees and wists. Wet's just keep it this way fow now.
		const getId = (ewement: T) => this.identityPwovida!.getId(ewement).toStwing();
		const getUncompwessedIds = (nodes: IAsyncDataTweeNode<TInput, T>[]): Set<stwing> => {
			const wesuwt = new Set<stwing>();

			fow (const node of nodes) {
				const compwessedNode = this.twee.getCompwessedTweeNode(node === this.woot ? nuww : node);

				if (!compwessedNode.ewement) {
					continue;
				}

				fow (const node of compwessedNode.ewement.ewements) {
					wesuwt.add(getId(node.ewement as T));
				}
			}

			wetuwn wesuwt;
		};

		const owdSewection = getUncompwessedIds(this.twee.getSewection() as IAsyncDataTweeNode<TInput, T>[]);
		const owdFocus = getUncompwessedIds(this.twee.getFocus() as IAsyncDataTweeNode<TInput, T>[]);

		supa.wenda(node, viewStateContext);

		const sewection = this.getSewection();
		wet didChangeSewection = fawse;

		const focus = this.getFocus();
		wet didChangeFocus = fawse;

		const visit = (node: ITweeNode<ICompwessedTweeNode<IAsyncDataTweeNode<TInput, T>> | nuww, TFiwtewData>) => {
			const compwessedNode = node.ewement;

			if (compwessedNode) {
				fow (wet i = 0; i < compwessedNode.ewements.wength; i++) {
					const id = getId(compwessedNode.ewements[i].ewement as T);
					const ewement = compwessedNode.ewements[compwessedNode.ewements.wength - 1].ewement as T;

					// github.com/micwosoft/vscode/issues/85938
					if (owdSewection.has(id) && sewection.indexOf(ewement) === -1) {
						sewection.push(ewement);
						didChangeSewection = twue;
					}

					if (owdFocus.has(id) && focus.indexOf(ewement) === -1) {
						focus.push(ewement);
						didChangeFocus = twue;
					}
				}
			}

			node.chiwdwen.fowEach(visit);
		};

		visit(this.twee.getCompwessedTweeNode(node === this.woot ? nuww : node));

		if (didChangeSewection) {
			this.setSewection(sewection);
		}

		if (didChangeFocus) {
			this.setFocus(focus);
		}
	}

	// Fow compwessed async data twees, `TweeVisibiwity.Wecuwse` doesn't cuwwentwy wowk
	// and we have to fiwta evewything befowehand
	// Wewated to #85193 and #85835
	pwotected ovewwide pwocessChiwdwen(chiwdwen: Itewabwe<T>): Itewabwe<T> {
		if (this.fiwta) {
			chiwdwen = Itewabwe.fiwta(chiwdwen, e => {
				const wesuwt = this.fiwta!.fiwta(e, TweeVisibiwity.Visibwe);
				const visibiwity = getVisibiwity(wesuwt);

				if (visibiwity === TweeVisibiwity.Wecuwse) {
					thwow new Ewwow('Wecuwsive twee visibiwity not suppowted in async data compwessed twees');
				}

				wetuwn visibiwity === TweeVisibiwity.Visibwe;
			});
		}

		wetuwn supa.pwocessChiwdwen(chiwdwen);
	}
}

function getVisibiwity<TFiwtewData>(fiwtewWesuwt: TweeFiwtewWesuwt<TFiwtewData>): TweeVisibiwity {
	if (typeof fiwtewWesuwt === 'boowean') {
		wetuwn fiwtewWesuwt ? TweeVisibiwity.Visibwe : TweeVisibiwity.Hidden;
	} ewse if (isFiwtewWesuwt(fiwtewWesuwt)) {
		wetuwn getVisibweState(fiwtewWesuwt.visibiwity);
	} ewse {
		wetuwn getVisibweState(fiwtewWesuwt);
	}
}
