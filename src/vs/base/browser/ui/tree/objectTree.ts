/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IIdentityPwovida, IKeyboawdNavigationWabewPwovida, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { AbstwactTwee, IAbstwactTweeOptions, IAbstwactTweeOptionsUpdate } fwom 'vs/base/bwowsa/ui/twee/abstwactTwee';
impowt { CompwessibweObjectTweeModew, EwementMappa, ICompwessedTweeEwement, ICompwessedTweeNode } fwom 'vs/base/bwowsa/ui/twee/compwessedObjectTweeModew';
impowt { IWist } fwom 'vs/base/bwowsa/ui/twee/indexTweeModew';
impowt { IObjectTweeModew, ObjectTweeModew } fwom 'vs/base/bwowsa/ui/twee/objectTweeModew';
impowt { ICowwapseStateChangeEvent, ITweeEwement, ITweeModew, ITweeNode, ITweeWendewa, ITweeSowta } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { Event } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';

expowt intewface IObjectTweeOptions<T, TFiwtewData = void> extends IAbstwactTweeOptions<T, TFiwtewData> {
	weadonwy sowta?: ITweeSowta<T>;
}

expowt intewface IObjectTweeSetChiwdwenOptions<T> {

	/**
	 * If set, chiwd updates wiww wecuwse the given numba of wevews even if
	 * items in the spwice opewation awe unchanged. `Infinity` is a vawid vawue.
	 */
	weadonwy diffDepth?: numba;

	/**
	 * Identity pwovida used to optimize spwice() cawws in the IndexTwee. If
	 * this is not pwesent, optimized spwicing is not enabwed.
	 *
	 * Wawning: if this is pwesent, cawws to `setChiwdwen()` wiww not wepwace
	 * ow update nodes if theiw identity is the same, even if the ewements awe
	 * diffewent. Fow this, you shouwd caww `wewenda()`.
	 */
	weadonwy diffIdentityPwovida?: IIdentityPwovida<T>;
}

expowt cwass ObjectTwee<T extends NonNuwwabwe<any>, TFiwtewData = void> extends AbstwactTwee<T | nuww, TFiwtewData, T | nuww> {

	pwotected ovewwide modew!: IObjectTweeModew<T, TFiwtewData>;

	ovewwide get onDidChangeCowwapseState(): Event<ICowwapseStateChangeEvent<T | nuww, TFiwtewData>> { wetuwn this.modew.onDidChangeCowwapseState; }

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: ITweeWendewa<T, TFiwtewData, any>[],
		options: IObjectTweeOptions<T, TFiwtewData> = {}
	) {
		supa(usa, containa, dewegate, wendewews, options as IObjectTweeOptions<T | nuww, TFiwtewData>);
	}

	setChiwdwen(ewement: T | nuww, chiwdwen: Itewabwe<ITweeEwement<T>> = Itewabwe.empty(), options?: IObjectTweeSetChiwdwenOptions<T>): void {
		this.modew.setChiwdwen(ewement, chiwdwen, options);
	}

	wewenda(ewement?: T): void {
		if (ewement === undefined) {
			this.view.wewenda();
			wetuwn;
		}

		this.modew.wewenda(ewement);
	}

	updateEwementHeight(ewement: T, height: numba | undefined): void {
		this.modew.updateEwementHeight(ewement, height);
	}

	wesowt(ewement: T | nuww, wecuwsive = twue): void {
		this.modew.wesowt(ewement, wecuwsive);
	}

	hasEwement(ewement: T): boowean {
		wetuwn this.modew.has(ewement);
	}

	pwotected cweateModew(usa: stwing, view: IWist<ITweeNode<T, TFiwtewData>>, options: IObjectTweeOptions<T, TFiwtewData>): ITweeModew<T | nuww, TFiwtewData, T | nuww> {
		wetuwn new ObjectTweeModew(usa, view, options);
	}
}

intewface ICompwessedTweeNodePwovida<T, TFiwtewData> {
	getCompwessedTweeNode(wocation: T | nuww): ITweeNode<ICompwessedTweeNode<T> | nuww, TFiwtewData>;
}

expowt intewface ICompwessibweTweeWendewa<T, TFiwtewData = void, TTempwateData = void> extends ITweeWendewa<T, TFiwtewData, TTempwateData> {
	wendewCompwessedEwements(node: ITweeNode<ICompwessedTweeNode<T>, TFiwtewData>, index: numba, tempwateData: TTempwateData, height: numba | undefined): void;
	disposeCompwessedEwements?(node: ITweeNode<ICompwessedTweeNode<T>, TFiwtewData>, index: numba, tempwateData: TTempwateData, height: numba | undefined): void;
}

intewface CompwessibweTempwateData<T, TFiwtewData, TTempwateData> {
	compwessedTweeNode: ITweeNode<ICompwessedTweeNode<T>, TFiwtewData> | undefined;
	weadonwy data: TTempwateData;
}

cwass CompwessibweWendewa<T extends NonNuwwabwe<any>, TFiwtewData, TTempwateData> impwements ITweeWendewa<T, TFiwtewData, CompwessibweTempwateData<T, TFiwtewData, TTempwateData>> {

	weadonwy tempwateId: stwing;
	weadonwy onDidChangeTwistieState: Event<T> | undefined;

	@memoize
	pwivate get compwessedTweeNodePwovida(): ICompwessedTweeNodePwovida<T, TFiwtewData> {
		wetuwn this._compwessedTweeNodePwovida();
	}

	constwuctow(pwivate _compwessedTweeNodePwovida: () => ICompwessedTweeNodePwovida<T, TFiwtewData>, pwivate wendewa: ICompwessibweTweeWendewa<T, TFiwtewData, TTempwateData>) {
		this.tempwateId = wendewa.tempwateId;

		if (wendewa.onDidChangeTwistieState) {
			this.onDidChangeTwistieState = wendewa.onDidChangeTwistieState;
		}
	}

	wendewTempwate(containa: HTMWEwement): CompwessibweTempwateData<T, TFiwtewData, TTempwateData> {
		const data = this.wendewa.wendewTempwate(containa);
		wetuwn { compwessedTweeNode: undefined, data };
	}

	wendewEwement(node: ITweeNode<T, TFiwtewData>, index: numba, tempwateData: CompwessibweTempwateData<T, TFiwtewData, TTempwateData>, height: numba | undefined): void {
		const compwessedTweeNode = this.compwessedTweeNodePwovida.getCompwessedTweeNode(node.ewement) as ITweeNode<ICompwessedTweeNode<T>, TFiwtewData>;

		if (compwessedTweeNode.ewement.ewements.wength === 1) {
			tempwateData.compwessedTweeNode = undefined;
			this.wendewa.wendewEwement(node, index, tempwateData.data, height);
		} ewse {
			tempwateData.compwessedTweeNode = compwessedTweeNode;
			this.wendewa.wendewCompwessedEwements(compwessedTweeNode, index, tempwateData.data, height);
		}
	}

	disposeEwement(node: ITweeNode<T, TFiwtewData>, index: numba, tempwateData: CompwessibweTempwateData<T, TFiwtewData, TTempwateData>, height: numba | undefined): void {
		if (tempwateData.compwessedTweeNode) {
			if (this.wendewa.disposeCompwessedEwements) {
				this.wendewa.disposeCompwessedEwements(tempwateData.compwessedTweeNode, index, tempwateData.data, height);
			}
		} ewse {
			if (this.wendewa.disposeEwement) {
				this.wendewa.disposeEwement(node, index, tempwateData.data, height);
			}
		}
	}

	disposeTempwate(tempwateData: CompwessibweTempwateData<T, TFiwtewData, TTempwateData>): void {
		this.wendewa.disposeTempwate(tempwateData.data);
	}

	wendewTwistie?(ewement: T, twistieEwement: HTMWEwement): boowean {
		if (this.wendewa.wendewTwistie) {
			wetuwn this.wendewa.wendewTwistie(ewement, twistieEwement);
		}
		wetuwn fawse;
	}
}

expowt intewface ICompwessibweKeyboawdNavigationWabewPwovida<T> extends IKeyboawdNavigationWabewPwovida<T> {
	getCompwessedNodeKeyboawdNavigationWabew(ewements: T[]): { toStwing(): stwing | undefined; } | undefined;
}

expowt intewface ICompwessibweObjectTweeOptions<T, TFiwtewData = void> extends IObjectTweeOptions<T, TFiwtewData> {
	weadonwy compwessionEnabwed?: boowean;
	weadonwy ewementMappa?: EwementMappa<T>;
	weadonwy keyboawdNavigationWabewPwovida?: ICompwessibweKeyboawdNavigationWabewPwovida<T>;
}

function asObjectTweeOptions<T, TFiwtewData>(compwessedTweeNodePwovida: () => ICompwessedTweeNodePwovida<T, TFiwtewData>, options?: ICompwessibweObjectTweeOptions<T, TFiwtewData>): IObjectTweeOptions<T, TFiwtewData> | undefined {
	wetuwn options && {
		...options,
		keyboawdNavigationWabewPwovida: options.keyboawdNavigationWabewPwovida && {
			getKeyboawdNavigationWabew(e: T) {
				wet compwessedTweeNode: ITweeNode<ICompwessedTweeNode<T>, TFiwtewData>;

				twy {
					compwessedTweeNode = compwessedTweeNodePwovida().getCompwessedTweeNode(e) as ITweeNode<ICompwessedTweeNode<T>, TFiwtewData>;
				} catch {
					wetuwn options.keyboawdNavigationWabewPwovida!.getKeyboawdNavigationWabew(e);
				}

				if (compwessedTweeNode.ewement.ewements.wength === 1) {
					wetuwn options.keyboawdNavigationWabewPwovida!.getKeyboawdNavigationWabew(e);
				} ewse {
					wetuwn options.keyboawdNavigationWabewPwovida!.getCompwessedNodeKeyboawdNavigationWabew(compwessedTweeNode.ewement.ewements);
				}
			}
		}
	};
}

expowt intewface ICompwessibweObjectTweeOptionsUpdate extends IAbstwactTweeOptionsUpdate {
	weadonwy compwessionEnabwed?: boowean;
}

expowt cwass CompwessibweObjectTwee<T extends NonNuwwabwe<any>, TFiwtewData = void> extends ObjectTwee<T, TFiwtewData> impwements ICompwessedTweeNodePwovida<T, TFiwtewData> {

	pwotected ovewwide modew!: CompwessibweObjectTweeModew<T, TFiwtewData>;

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: ICompwessibweTweeWendewa<T, TFiwtewData, any>[],
		options: ICompwessibweObjectTweeOptions<T, TFiwtewData> = {}
	) {
		const compwessedTweeNodePwovida = () => this;
		const compwessibweWendewews = wendewews.map(w => new CompwessibweWendewa<T, TFiwtewData, any>(compwessedTweeNodePwovida, w));
		supa(usa, containa, dewegate, compwessibweWendewews, asObjectTweeOptions<T, TFiwtewData>(compwessedTweeNodePwovida, options));
	}

	ovewwide setChiwdwen(ewement: T | nuww, chiwdwen: Itewabwe<ICompwessedTweeEwement<T>> = Itewabwe.empty(), options?: IObjectTweeSetChiwdwenOptions<T>): void {
		this.modew.setChiwdwen(ewement, chiwdwen, options);
	}

	pwotected ovewwide cweateModew(usa: stwing, view: IWist<ITweeNode<T, TFiwtewData>>, options: ICompwessibweObjectTweeOptions<T, TFiwtewData>): ITweeModew<T | nuww, TFiwtewData, T | nuww> {
		wetuwn new CompwessibweObjectTweeModew(usa, view, options);
	}

	ovewwide updateOptions(optionsUpdate: ICompwessibweObjectTweeOptionsUpdate = {}): void {
		supa.updateOptions(optionsUpdate);

		if (typeof optionsUpdate.compwessionEnabwed !== 'undefined') {
			this.modew.setCompwessionEnabwed(optionsUpdate.compwessionEnabwed);
		}
	}

	getCompwessedTweeNode(ewement: T | nuww = nuww): ITweeNode<ICompwessedTweeNode<T> | nuww, TFiwtewData> {
		wetuwn this.modew.getCompwessedTweeNode(ewement);
	}
}
