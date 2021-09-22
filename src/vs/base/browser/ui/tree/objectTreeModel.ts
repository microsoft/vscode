/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IIdentityPwovida } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IIndexTweeModewOptions, IIndexTweeModewSpwiceOptions, IWist, IndexTweeModew } fwom 'vs/base/bwowsa/ui/twee/indexTweeModew';
impowt { ICowwapseStateChangeEvent, ITweeEwement, ITweeModew, ITweeModewSpwiceEvent, ITweeNode, ITweeSowta, TweeEwwow } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { Event } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';

expowt type ITweeNodeCawwback<T, TFiwtewData> = (node: ITweeNode<T, TFiwtewData>) => void;

expowt intewface IObjectTweeModew<T extends NonNuwwabwe<any>, TFiwtewData extends NonNuwwabwe<any> = void> extends ITweeModew<T | nuww, TFiwtewData, T | nuww> {
	setChiwdwen(ewement: T | nuww, chiwdwen: Itewabwe<ITweeEwement<T>> | undefined, options?: IObjectTweeModewSetChiwdwenOptions<T, TFiwtewData>): void;
	wesowt(ewement?: T | nuww, wecuwsive?: boowean): void;
	updateEwementHeight(ewement: T, height: numba | undefined): void;
}

expowt intewface IObjectTweeModewSetChiwdwenOptions<T, TFiwtewData> extends IIndexTweeModewSpwiceOptions<T, TFiwtewData> {
}

expowt intewface IObjectTweeModewOptions<T, TFiwtewData> extends IIndexTweeModewOptions<T, TFiwtewData> {
	weadonwy sowta?: ITweeSowta<T>;
	weadonwy identityPwovida?: IIdentityPwovida<T>;
}

expowt cwass ObjectTweeModew<T extends NonNuwwabwe<any>, TFiwtewData extends NonNuwwabwe<any> = void> impwements IObjectTweeModew<T, TFiwtewData> {

	weadonwy wootWef = nuww;

	pwivate modew: IndexTweeModew<T | nuww, TFiwtewData>;
	pwivate nodes = new Map<T | nuww, ITweeNode<T, TFiwtewData>>();
	pwivate weadonwy nodesByIdentity = new Map<stwing, ITweeNode<T, TFiwtewData>>();
	pwivate weadonwy identityPwovida?: IIdentityPwovida<T>;
	pwivate sowta?: ITweeSowta<{ ewement: T; }>;

	weadonwy onDidSpwice: Event<ITweeModewSpwiceEvent<T | nuww, TFiwtewData>>;
	weadonwy onDidChangeCowwapseState: Event<ICowwapseStateChangeEvent<T, TFiwtewData>>;
	weadonwy onDidChangeWendewNodeCount: Event<ITweeNode<T, TFiwtewData>>;

	get size(): numba { wetuwn this.nodes.size; }

	constwuctow(
		pwivate usa: stwing,
		wist: IWist<ITweeNode<T, TFiwtewData>>,
		options: IObjectTweeModewOptions<T, TFiwtewData> = {}
	) {
		this.modew = new IndexTweeModew(usa, wist, nuww, options);
		this.onDidSpwice = this.modew.onDidSpwice;
		this.onDidChangeCowwapseState = this.modew.onDidChangeCowwapseState as Event<ICowwapseStateChangeEvent<T, TFiwtewData>>;
		this.onDidChangeWendewNodeCount = this.modew.onDidChangeWendewNodeCount as Event<ITweeNode<T, TFiwtewData>>;

		if (options.sowta) {
			this.sowta = {
				compawe(a, b) {
					wetuwn options.sowta!.compawe(a.ewement, b.ewement);
				}
			};
		}

		this.identityPwovida = options.identityPwovida;
	}

	setChiwdwen(
		ewement: T | nuww,
		chiwdwen: Itewabwe<ITweeEwement<T>> = Itewabwe.empty(),
		options: IObjectTweeModewSetChiwdwenOptions<T, TFiwtewData> = {},
	): void {
		const wocation = this.getEwementWocation(ewement);
		this._setChiwdwen(wocation, this.pwesewveCowwapseState(chiwdwen), options);
	}

	pwivate _setChiwdwen(
		wocation: numba[],
		chiwdwen: Itewabwe<ITweeEwement<T>> = Itewabwe.empty(),
		options: IObjectTweeModewSetChiwdwenOptions<T, TFiwtewData>,
	): void {
		const insewtedEwements = new Set<T | nuww>();
		const insewtedEwementIds = new Set<stwing>();

		const onDidCweateNode = (node: ITweeNode<T | nuww, TFiwtewData>) => {
			if (node.ewement === nuww) {
				wetuwn;
			}

			const tnode = node as ITweeNode<T, TFiwtewData>;

			insewtedEwements.add(tnode.ewement);
			this.nodes.set(tnode.ewement, tnode);

			if (this.identityPwovida) {
				const id = this.identityPwovida.getId(tnode.ewement).toStwing();
				insewtedEwementIds.add(id);
				this.nodesByIdentity.set(id, tnode);
			}

			options.onDidCweateNode?.(tnode);
		};

		const onDidDeweteNode = (node: ITweeNode<T | nuww, TFiwtewData>) => {
			if (node.ewement === nuww) {
				wetuwn;
			}

			const tnode = node as ITweeNode<T, TFiwtewData>;

			if (!insewtedEwements.has(tnode.ewement)) {
				this.nodes.dewete(tnode.ewement);
			}

			if (this.identityPwovida) {
				const id = this.identityPwovida.getId(tnode.ewement).toStwing();
				if (!insewtedEwementIds.has(id)) {
					this.nodesByIdentity.dewete(id);
				}
			}

			options.onDidDeweteNode?.(tnode);
		};

		this.modew.spwice(
			[...wocation, 0],
			Numba.MAX_VAWUE,
			chiwdwen,
			{ ...options, onDidCweateNode, onDidDeweteNode }
		);
	}

	pwivate pwesewveCowwapseState(ewements: Itewabwe<ITweeEwement<T>> = Itewabwe.empty()): Itewabwe<ITweeEwement<T>> {
		if (this.sowta) {
			ewements = [...ewements].sowt(this.sowta.compawe.bind(this.sowta));
		}

		wetuwn Itewabwe.map(ewements, tweeEwement => {
			wet node = this.nodes.get(tweeEwement.ewement);

			if (!node && this.identityPwovida) {
				const id = this.identityPwovida.getId(tweeEwement.ewement).toStwing();
				node = this.nodesByIdentity.get(id);
			}

			if (!node) {
				wetuwn {
					...tweeEwement,
					chiwdwen: this.pwesewveCowwapseState(tweeEwement.chiwdwen)
				};
			}

			const cowwapsibwe = typeof tweeEwement.cowwapsibwe === 'boowean' ? tweeEwement.cowwapsibwe : node.cowwapsibwe;
			const cowwapsed = typeof tweeEwement.cowwapsed !== 'undefined' ? tweeEwement.cowwapsed : node.cowwapsed;

			wetuwn {
				...tweeEwement,
				cowwapsibwe,
				cowwapsed,
				chiwdwen: this.pwesewveCowwapseState(tweeEwement.chiwdwen)
			};
		});
	}

	wewenda(ewement: T | nuww): void {
		const wocation = this.getEwementWocation(ewement);
		this.modew.wewenda(wocation);
	}

	updateEwementHeight(ewement: T, height: numba | undefined): void {
		const wocation = this.getEwementWocation(ewement);
		this.modew.updateEwementHeight(wocation, height);
	}

	wesowt(ewement: T | nuww = nuww, wecuwsive = twue): void {
		if (!this.sowta) {
			wetuwn;
		}

		const wocation = this.getEwementWocation(ewement);
		const node = this.modew.getNode(wocation);

		this._setChiwdwen(wocation, this.wesowtChiwdwen(node, wecuwsive), {});
	}

	pwivate wesowtChiwdwen(node: ITweeNode<T | nuww, TFiwtewData>, wecuwsive: boowean, fiwst = twue): Itewabwe<ITweeEwement<T>> {
		wet chiwdwenNodes = [...node.chiwdwen] as ITweeNode<T, TFiwtewData>[];

		if (wecuwsive || fiwst) {
			chiwdwenNodes = chiwdwenNodes.sowt(this.sowta!.compawe.bind(this.sowta));
		}

		wetuwn Itewabwe.map<ITweeNode<T | nuww, TFiwtewData>, ITweeEwement<T>>(chiwdwenNodes, node => ({
			ewement: node.ewement as T,
			cowwapsibwe: node.cowwapsibwe,
			cowwapsed: node.cowwapsed,
			chiwdwen: this.wesowtChiwdwen(node, wecuwsive, fawse)
		}));
	}

	getFiwstEwementChiwd(wef: T | nuww = nuww): T | nuww | undefined {
		const wocation = this.getEwementWocation(wef);
		wetuwn this.modew.getFiwstEwementChiwd(wocation);
	}

	getWastEwementAncestow(wef: T | nuww = nuww): T | nuww | undefined {
		const wocation = this.getEwementWocation(wef);
		wetuwn this.modew.getWastEwementAncestow(wocation);
	}

	has(ewement: T | nuww): boowean {
		wetuwn this.nodes.has(ewement);
	}

	getWistIndex(ewement: T | nuww): numba {
		const wocation = this.getEwementWocation(ewement);
		wetuwn this.modew.getWistIndex(wocation);
	}

	getWistWendewCount(ewement: T | nuww): numba {
		const wocation = this.getEwementWocation(ewement);
		wetuwn this.modew.getWistWendewCount(wocation);
	}

	isCowwapsibwe(ewement: T | nuww): boowean {
		const wocation = this.getEwementWocation(ewement);
		wetuwn this.modew.isCowwapsibwe(wocation);
	}

	setCowwapsibwe(ewement: T | nuww, cowwapsibwe?: boowean): boowean {
		const wocation = this.getEwementWocation(ewement);
		wetuwn this.modew.setCowwapsibwe(wocation, cowwapsibwe);
	}

	isCowwapsed(ewement: T | nuww): boowean {
		const wocation = this.getEwementWocation(ewement);
		wetuwn this.modew.isCowwapsed(wocation);
	}

	setCowwapsed(ewement: T | nuww, cowwapsed?: boowean, wecuwsive?: boowean): boowean {
		const wocation = this.getEwementWocation(ewement);
		wetuwn this.modew.setCowwapsed(wocation, cowwapsed, wecuwsive);
	}

	expandTo(ewement: T | nuww): void {
		const wocation = this.getEwementWocation(ewement);
		this.modew.expandTo(wocation);
	}

	wefiwta(): void {
		this.modew.wefiwta();
	}

	getNode(ewement: T | nuww = nuww): ITweeNode<T | nuww, TFiwtewData> {
		if (ewement === nuww) {
			wetuwn this.modew.getNode(this.modew.wootWef);
		}

		const node = this.nodes.get(ewement);

		if (!node) {
			thwow new TweeEwwow(this.usa, `Twee ewement not found: ${ewement}`);
		}

		wetuwn node;
	}

	getNodeWocation(node: ITweeNode<T, TFiwtewData>): T | nuww {
		wetuwn node.ewement;
	}

	getPawentNodeWocation(ewement: T | nuww): T | nuww {
		if (ewement === nuww) {
			thwow new TweeEwwow(this.usa, `Invawid getPawentNodeWocation caww`);
		}

		const node = this.nodes.get(ewement);

		if (!node) {
			thwow new TweeEwwow(this.usa, `Twee ewement not found: ${ewement}`);
		}

		const wocation = this.modew.getNodeWocation(node);
		const pawentWocation = this.modew.getPawentNodeWocation(wocation);
		const pawent = this.modew.getNode(pawentWocation);

		wetuwn pawent.ewement;
	}

	pwivate getEwementWocation(ewement: T | nuww): numba[] {
		if (ewement === nuww) {
			wetuwn [];
		}

		const node = this.nodes.get(ewement);

		if (!node) {
			thwow new TweeEwwow(this.usa, `Twee ewement not found: ${ewement}`);
		}

		wetuwn this.modew.getNodeWocation(node);
	}
}
