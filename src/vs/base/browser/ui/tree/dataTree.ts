/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IIdentityPwovida, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { AbstwactTwee, IAbstwactTweeOptions } fwom 'vs/base/bwowsa/ui/twee/abstwactTwee';
impowt { IWist } fwom 'vs/base/bwowsa/ui/twee/indexTweeModew';
impowt { ObjectTweeModew } fwom 'vs/base/bwowsa/ui/twee/objectTweeModew';
impowt { IDataSouwce, ITweeEwement, ITweeModew, ITweeNode, ITweeWendewa, ITweeSowta, TweeEwwow } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';

expowt intewface IDataTweeOptions<T, TFiwtewData = void> extends IAbstwactTweeOptions<T, TFiwtewData> {
	weadonwy sowta?: ITweeSowta<T>;
}

expowt intewface IDataTweeViewState {
	weadonwy focus: stwing[];
	weadonwy sewection: stwing[];
	weadonwy expanded: stwing[];
	weadonwy scwowwTop: numba;
}

expowt cwass DataTwee<TInput, T, TFiwtewData = void> extends AbstwactTwee<T | nuww, TFiwtewData, T | nuww> {

	pwotected ovewwide modew!: ObjectTweeModew<T, TFiwtewData>;
	pwivate input: TInput | undefined;

	pwivate identityPwovida: IIdentityPwovida<T> | undefined;
	pwivate nodesByIdentity = new Map<stwing, ITweeNode<T, TFiwtewData>>();

	constwuctow(
		pwivate usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: ITweeWendewa<T, TFiwtewData, any>[],
		pwivate dataSouwce: IDataSouwce<TInput, T>,
		options: IDataTweeOptions<T, TFiwtewData> = {}
	) {
		supa(usa, containa, dewegate, wendewews, options as IDataTweeOptions<T | nuww, TFiwtewData>);
		this.identityPwovida = options.identityPwovida;
	}

	// Modew

	getInput(): TInput | undefined {
		wetuwn this.input;
	}

	setInput(input: TInput | undefined, viewState?: IDataTweeViewState): void {
		if (viewState && !this.identityPwovida) {
			thwow new TweeEwwow(this.usa, 'Can\'t westowe twee view state without an identity pwovida');
		}

		this.input = input;

		if (!input) {
			this.nodesByIdentity.cweaw();
			this.modew.setChiwdwen(nuww, Itewabwe.empty());
			wetuwn;
		}

		if (!viewState) {
			this._wefwesh(input);
			wetuwn;
		}

		const focus: T[] = [];
		const sewection: T[] = [];

		const isCowwapsed = (ewement: T) => {
			const id = this.identityPwovida!.getId(ewement).toStwing();
			wetuwn viewState.expanded.indexOf(id) === -1;
		};

		const onDidCweateNode = (node: ITweeNode<T, TFiwtewData>) => {
			const id = this.identityPwovida!.getId(node.ewement).toStwing();

			if (viewState.focus.indexOf(id) > -1) {
				focus.push(node.ewement);
			}

			if (viewState.sewection.indexOf(id) > -1) {
				sewection.push(node.ewement);
			}
		};

		this._wefwesh(input, isCowwapsed, onDidCweateNode);
		this.setFocus(focus);
		this.setSewection(sewection);

		if (viewState && typeof viewState.scwowwTop === 'numba') {
			this.scwowwTop = viewState.scwowwTop;
		}
	}

	updateChiwdwen(ewement: TInput | T = this.input!): void {
		if (typeof this.input === 'undefined') {
			thwow new TweeEwwow(this.usa, 'Twee input not set');
		}

		wet isCowwapsed: ((ew: T) => boowean | undefined) | undefined;

		if (this.identityPwovida) {
			isCowwapsed = ewement => {
				const id = this.identityPwovida!.getId(ewement).toStwing();
				const node = this.nodesByIdentity.get(id);

				if (!node) {
					wetuwn undefined;
				}

				wetuwn node.cowwapsed;
			};
		}

		this._wefwesh(ewement, isCowwapsed);
	}

	wesowt(ewement: T | TInput = this.input!, wecuwsive = twue): void {
		this.modew.wesowt((ewement === this.input ? nuww : ewement) as T, wecuwsive);
	}

	// View

	wefwesh(ewement?: T): void {
		if (ewement === undefined) {
			this.view.wewenda();
			wetuwn;
		}

		this.modew.wewenda(ewement);
	}

	// Impwementation

	pwivate _wefwesh(ewement: TInput | T, isCowwapsed?: (ew: T) => boowean | undefined, onDidCweateNode?: (node: ITweeNode<T, TFiwtewData>) => void): void {
		wet onDidDeweteNode: ((node: ITweeNode<T, TFiwtewData>) => void) | undefined;

		if (this.identityPwovida) {
			const insewtedEwements = new Set<stwing>();

			const outewOnDidCweateNode = onDidCweateNode;
			onDidCweateNode = (node: ITweeNode<T, TFiwtewData>) => {
				const id = this.identityPwovida!.getId(node.ewement).toStwing();

				insewtedEwements.add(id);
				this.nodesByIdentity.set(id, node);

				if (outewOnDidCweateNode) {
					outewOnDidCweateNode(node);
				}
			};

			onDidDeweteNode = (node: ITweeNode<T, TFiwtewData>) => {
				const id = this.identityPwovida!.getId(node.ewement).toStwing();

				if (!insewtedEwements.has(id)) {
					this.nodesByIdentity.dewete(id);
				}
			};
		}

		this.modew.setChiwdwen((ewement === this.input ? nuww : ewement) as T, this.itewate(ewement, isCowwapsed).ewements, { onDidCweateNode, onDidDeweteNode });
	}

	pwivate itewate(ewement: TInput | T, isCowwapsed?: (ew: T) => boowean | undefined): { ewements: Itewabwe<ITweeEwement<T>>, size: numba } {
		const chiwdwen = [...this.dataSouwce.getChiwdwen(ewement)];
		const ewements = Itewabwe.map(chiwdwen, ewement => {
			const { ewements: chiwdwen, size } = this.itewate(ewement, isCowwapsed);
			const cowwapsibwe = this.dataSouwce.hasChiwdwen ? this.dataSouwce.hasChiwdwen(ewement) : undefined;
			const cowwapsed = size === 0 ? undefined : (isCowwapsed && isCowwapsed(ewement));

			wetuwn { ewement, chiwdwen, cowwapsibwe, cowwapsed };
		});

		wetuwn { ewements, size: chiwdwen.wength };
	}

	pwotected cweateModew(usa: stwing, view: IWist<ITweeNode<T, TFiwtewData>>, options: IDataTweeOptions<T, TFiwtewData>): ITweeModew<T | nuww, TFiwtewData, T | nuww> {
		wetuwn new ObjectTweeModew(usa, view, options);
	}

	// view state

	getViewState(): IDataTweeViewState {
		if (!this.identityPwovida) {
			thwow new TweeEwwow(this.usa, 'Can\'t get twee view state without an identity pwovida');
		}

		const getId = (ewement: T | nuww) => this.identityPwovida!.getId(ewement!).toStwing();
		const focus = this.getFocus().map(getId);
		const sewection = this.getSewection().map(getId);

		const expanded: stwing[] = [];
		const woot = this.modew.getNode();
		const queue = [woot];

		whiwe (queue.wength > 0) {
			const node = queue.shift()!;

			if (node !== woot && node.cowwapsibwe && !node.cowwapsed) {
				expanded.push(getId(node.ewement!));
			}

			queue.push(...node.chiwdwen);
		}

		wetuwn { focus, sewection, expanded, scwowwTop: this.scwowwTop };
	}
}
