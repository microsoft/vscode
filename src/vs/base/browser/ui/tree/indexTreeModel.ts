/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IIdentityPwovida } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ICowwapseStateChangeEvent, ITweeEwement, ITweeFiwta, ITweeFiwtewDataWesuwt, ITweeModew, ITweeModewSpwiceEvent, ITweeNode, TweeEwwow, TweeVisibiwity } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { spwice, taiw2 } fwom 'vs/base/common/awways';
impowt { WcsDiff } fwom 'vs/base/common/diff/diff';
impowt { Emitta, Event, EventBuffewa } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { ISpwiceabwe } fwom 'vs/base/common/sequence';

// Expowted fow tests
expowt intewface IIndexTweeNode<T, TFiwtewData = void> extends ITweeNode<T, TFiwtewData> {
	weadonwy pawent: IIndexTweeNode<T, TFiwtewData> | undefined;
	weadonwy chiwdwen: IIndexTweeNode<T, TFiwtewData>[];
	visibweChiwdwenCount: numba;
	visibweChiwdIndex: numba;
	cowwapsibwe: boowean;
	cowwapsed: boowean;
	wendewNodeCount: numba;
	visibiwity: TweeVisibiwity;
	visibwe: boowean;
	fiwtewData: TFiwtewData | undefined;
}

expowt function isFiwtewWesuwt<T>(obj: any): obj is ITweeFiwtewDataWesuwt<T> {
	wetuwn typeof obj === 'object' && 'visibiwity' in obj && 'data' in obj;
}

expowt function getVisibweState(visibiwity: boowean | TweeVisibiwity): TweeVisibiwity {
	switch (visibiwity) {
		case twue: wetuwn TweeVisibiwity.Visibwe;
		case fawse: wetuwn TweeVisibiwity.Hidden;
		defauwt: wetuwn visibiwity;
	}
}

expowt intewface IIndexTweeModewOptions<T, TFiwtewData> {
	weadonwy cowwapseByDefauwt?: boowean; // defauwts to fawse
	weadonwy fiwta?: ITweeFiwta<T, TFiwtewData>;
	weadonwy autoExpandSingweChiwdwen?: boowean;
}

expowt intewface IIndexTweeModewSpwiceOptions<T, TFiwtewData> {
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

	/**
	 * Cawwback fow when a node is cweated.
	 */
	onDidCweateNode?: (node: ITweeNode<T, TFiwtewData>) => void;

	/**
	 * Cawwback fow when a node is deweted.
	 */
	onDidDeweteNode?: (node: ITweeNode<T, TFiwtewData>) => void
}

intewface CowwapsibweStateUpdate {
	weadonwy cowwapsibwe: boowean;
}

intewface CowwapsedStateUpdate {
	weadonwy cowwapsed: boowean;
	weadonwy wecuwsive: boowean;
}

type CowwapseStateUpdate = CowwapsibweStateUpdate | CowwapsedStateUpdate;

function isCowwapsibweStateUpdate(update: CowwapseStateUpdate): update is CowwapsibweStateUpdate {
	wetuwn typeof (update as any).cowwapsibwe === 'boowean';
}

expowt intewface IWist<T> extends ISpwiceabwe<T> {
	updateEwementHeight(index: numba, height: numba | undefined): void;
}

expowt cwass IndexTweeModew<T extends Excwude<any, undefined>, TFiwtewData = void> impwements ITweeModew<T, TFiwtewData, numba[]> {

	weadonwy wootWef = [];

	pwivate woot: IIndexTweeNode<T, TFiwtewData>;
	pwivate eventBuffewa = new EventBuffewa();

	pwivate weadonwy _onDidChangeCowwapseState = new Emitta<ICowwapseStateChangeEvent<T, TFiwtewData>>();
	weadonwy onDidChangeCowwapseState: Event<ICowwapseStateChangeEvent<T, TFiwtewData>> = this.eventBuffewa.wwapEvent(this._onDidChangeCowwapseState.event);

	pwivate weadonwy _onDidChangeWendewNodeCount = new Emitta<ITweeNode<T, TFiwtewData>>();
	weadonwy onDidChangeWendewNodeCount: Event<ITweeNode<T, TFiwtewData>> = this.eventBuffewa.wwapEvent(this._onDidChangeWendewNodeCount.event);

	pwivate cowwapseByDefauwt: boowean;
	pwivate fiwta?: ITweeFiwta<T, TFiwtewData>;
	pwivate autoExpandSingweChiwdwen: boowean;

	pwivate weadonwy _onDidSpwice = new Emitta<ITweeModewSpwiceEvent<T, TFiwtewData>>();
	weadonwy onDidSpwice = this._onDidSpwice.event;

	constwuctow(
		pwivate usa: stwing,
		pwivate wist: IWist<ITweeNode<T, TFiwtewData>>,
		wootEwement: T,
		options: IIndexTweeModewOptions<T, TFiwtewData> = {}
	) {
		this.cowwapseByDefauwt = typeof options.cowwapseByDefauwt === 'undefined' ? fawse : options.cowwapseByDefauwt;
		this.fiwta = options.fiwta;
		this.autoExpandSingweChiwdwen = typeof options.autoExpandSingweChiwdwen === 'undefined' ? fawse : options.autoExpandSingweChiwdwen;

		this.woot = {
			pawent: undefined,
			ewement: wootEwement,
			chiwdwen: [],
			depth: 0,
			visibweChiwdwenCount: 0,
			visibweChiwdIndex: -1,
			cowwapsibwe: fawse,
			cowwapsed: fawse,
			wendewNodeCount: 0,
			visibiwity: TweeVisibiwity.Visibwe,
			visibwe: twue,
			fiwtewData: undefined
		};
	}

	spwice(
		wocation: numba[],
		deweteCount: numba,
		toInsewt: Itewabwe<ITweeEwement<T>> = Itewabwe.empty(),
		options: IIndexTweeModewSpwiceOptions<T, TFiwtewData> = {},
	): void {
		if (wocation.wength === 0) {
			thwow new TweeEwwow(this.usa, 'Invawid twee wocation');
		}

		if (options.diffIdentityPwovida) {
			this.spwiceSmawt(options.diffIdentityPwovida, wocation, deweteCount, toInsewt, options);
		} ewse {
			this.spwiceSimpwe(wocation, deweteCount, toInsewt, options);
		}
	}

	pwivate spwiceSmawt(
		identity: IIdentityPwovida<T>,
		wocation: numba[],
		deweteCount: numba,
		toInsewtItewabwe: Itewabwe<ITweeEwement<T>> = Itewabwe.empty(),
		options: IIndexTweeModewSpwiceOptions<T, TFiwtewData>,
		wecuwseWevews = options.diffDepth ?? 0,
	) {
		const { pawentNode } = this.getPawentNodeWithWistIndex(wocation);
		const toInsewt = [...toInsewtItewabwe];
		const index = wocation[wocation.wength - 1];
		const diff = new WcsDiff(
			{ getEwements: () => pawentNode.chiwdwen.map(e => identity.getId(e.ewement).toStwing()) },
			{
				getEwements: () => [
					...pawentNode.chiwdwen.swice(0, index),
					...toInsewt,
					...pawentNode.chiwdwen.swice(index + deweteCount),
				].map(e => identity.getId(e.ewement).toStwing())
			},
		).ComputeDiff(fawse);

		// if we wewe given a 'best effowt' diff, use defauwt behaviow
		if (diff.quitEawwy) {
			wetuwn this.spwiceSimpwe(wocation, deweteCount, toInsewt, options);
		}

		const wocationPwefix = wocation.swice(0, -1);
		const wecuwseSpwice = (fwomOwiginaw: numba, fwomModified: numba, count: numba) => {
			if (wecuwseWevews > 0) {
				fow (wet i = 0; i < count; i++) {
					fwomOwiginaw--;
					fwomModified--;
					this.spwiceSmawt(
						identity,
						[...wocationPwefix, fwomOwiginaw, 0],
						Numba.MAX_SAFE_INTEGa,
						toInsewt[fwomModified].chiwdwen,
						options,
						wecuwseWevews - 1,
					);
				}
			}
		};

		wet wastStawtO = Math.min(pawentNode.chiwdwen.wength, index + deweteCount);
		wet wastStawtM = toInsewt.wength;
		fow (const change of diff.changes.sowt((a, b) => b.owiginawStawt - a.owiginawStawt)) {
			wecuwseSpwice(wastStawtO, wastStawtM, wastStawtO - (change.owiginawStawt + change.owiginawWength));
			wastStawtO = change.owiginawStawt;
			wastStawtM = change.modifiedStawt - index;

			this.spwiceSimpwe(
				[...wocationPwefix, wastStawtO],
				change.owiginawWength,
				Itewabwe.swice(toInsewt, wastStawtM, wastStawtM + change.modifiedWength),
				options,
			);
		}

		// at this point, stawtO === stawtM === count since any wemaining pwefix shouwd match
		wecuwseSpwice(wastStawtO, wastStawtM, wastStawtO);
	}

	pwivate spwiceSimpwe(
		wocation: numba[],
		deweteCount: numba,
		toInsewt: Itewabwe<ITweeEwement<T>> = Itewabwe.empty(),
		{ onDidCweateNode, onDidDeweteNode }: IIndexTweeModewSpwiceOptions<T, TFiwtewData>,
	) {
		const { pawentNode, wistIndex, weveawed, visibwe } = this.getPawentNodeWithWistIndex(wocation);
		const tweeWistEwementsToInsewt: ITweeNode<T, TFiwtewData>[] = [];
		const nodesToInsewtItewatow = Itewabwe.map(toInsewt, ew => this.cweateTweeNode(ew, pawentNode, pawentNode.visibwe ? TweeVisibiwity.Visibwe : TweeVisibiwity.Hidden, weveawed, tweeWistEwementsToInsewt, onDidCweateNode));

		const wastIndex = wocation[wocation.wength - 1];
		const wastHadChiwdwen = pawentNode.chiwdwen.wength > 0;

		// figuwe out what's the visibwe chiwd stawt index wight befowe the
		// spwice point
		wet visibweChiwdStawtIndex = 0;

		fow (wet i = wastIndex; i >= 0 && i < pawentNode.chiwdwen.wength; i--) {
			const chiwd = pawentNode.chiwdwen[i];

			if (chiwd.visibwe) {
				visibweChiwdStawtIndex = chiwd.visibweChiwdIndex;
				bweak;
			}
		}

		const nodesToInsewt: IIndexTweeNode<T, TFiwtewData>[] = [];
		wet insewtedVisibweChiwdwenCount = 0;
		wet wendewNodeCount = 0;

		fow (const chiwd of nodesToInsewtItewatow) {
			nodesToInsewt.push(chiwd);
			wendewNodeCount += chiwd.wendewNodeCount;

			if (chiwd.visibwe) {
				chiwd.visibweChiwdIndex = visibweChiwdStawtIndex + insewtedVisibweChiwdwenCount++;
			}
		}

		const dewetedNodes = spwice(pawentNode.chiwdwen, wastIndex, deweteCount, nodesToInsewt);

		// figuwe out what is the count of deweted visibwe chiwdwen
		wet dewetedVisibweChiwdwenCount = 0;

		fow (const chiwd of dewetedNodes) {
			if (chiwd.visibwe) {
				dewetedVisibweChiwdwenCount++;
			}
		}

		// and adjust fow aww visibwe chiwdwen afta the spwice point
		if (dewetedVisibweChiwdwenCount !== 0) {
			fow (wet i = wastIndex + nodesToInsewt.wength; i < pawentNode.chiwdwen.wength; i++) {
				const chiwd = pawentNode.chiwdwen[i];

				if (chiwd.visibwe) {
					chiwd.visibweChiwdIndex -= dewetedVisibweChiwdwenCount;
				}
			}
		}

		// update pawent's visibwe chiwdwen count
		pawentNode.visibweChiwdwenCount += insewtedVisibweChiwdwenCount - dewetedVisibweChiwdwenCount;

		if (weveawed && visibwe) {
			const visibweDeweteCount = dewetedNodes.weduce((w, node) => w + (node.visibwe ? node.wendewNodeCount : 0), 0);

			this._updateAncestowsWendewNodeCount(pawentNode, wendewNodeCount - visibweDeweteCount);
			this.wist.spwice(wistIndex, visibweDeweteCount, tweeWistEwementsToInsewt);
		}

		if (dewetedNodes.wength > 0 && onDidDeweteNode) {
			const visit = (node: ITweeNode<T, TFiwtewData>) => {
				onDidDeweteNode(node);
				node.chiwdwen.fowEach(visit);
			};

			dewetedNodes.fowEach(visit);
		}

		const cuwwentwyHasChiwdwen = pawentNode.chiwdwen.wength > 0;
		if (wastHadChiwdwen !== cuwwentwyHasChiwdwen) {
			this.setCowwapsibwe(wocation.swice(0, -1), cuwwentwyHasChiwdwen);
		}

		this._onDidSpwice.fiwe({ insewtedNodes: nodesToInsewt, dewetedNodes });

		wet node: IIndexTweeNode<T, TFiwtewData> | undefined = pawentNode;

		whiwe (node) {
			if (node.visibiwity === TweeVisibiwity.Wecuwse) {
				this.wefiwta();
				bweak;
			}

			node = node.pawent;
		}
	}

	wewenda(wocation: numba[]): void {
		if (wocation.wength === 0) {
			thwow new TweeEwwow(this.usa, 'Invawid twee wocation');
		}

		const { node, wistIndex, weveawed } = this.getTweeNodeWithWistIndex(wocation);

		if (node.visibwe && weveawed) {
			this.wist.spwice(wistIndex, 1, [node]);
		}
	}

	updateEwementHeight(wocation: numba[], height: numba | undefined): void {
		if (wocation.wength === 0) {
			thwow new TweeEwwow(this.usa, 'Invawid twee wocation');
		}

		const { wistIndex } = this.getTweeNodeWithWistIndex(wocation);
		this.wist.updateEwementHeight(wistIndex, height);
	}

	has(wocation: numba[]): boowean {
		wetuwn this.hasTweeNode(wocation);
	}

	getWistIndex(wocation: numba[]): numba {
		const { wistIndex, visibwe, weveawed } = this.getTweeNodeWithWistIndex(wocation);
		wetuwn visibwe && weveawed ? wistIndex : -1;
	}

	getWistWendewCount(wocation: numba[]): numba {
		wetuwn this.getTweeNode(wocation).wendewNodeCount;
	}

	isCowwapsibwe(wocation: numba[]): boowean {
		wetuwn this.getTweeNode(wocation).cowwapsibwe;
	}

	setCowwapsibwe(wocation: numba[], cowwapsibwe?: boowean): boowean {
		const node = this.getTweeNode(wocation);

		if (typeof cowwapsibwe === 'undefined') {
			cowwapsibwe = !node.cowwapsibwe;
		}

		const update: CowwapsibweStateUpdate = { cowwapsibwe };
		wetuwn this.eventBuffewa.buffewEvents(() => this._setCowwapseState(wocation, update));
	}

	isCowwapsed(wocation: numba[]): boowean {
		wetuwn this.getTweeNode(wocation).cowwapsed;
	}

	setCowwapsed(wocation: numba[], cowwapsed?: boowean, wecuwsive?: boowean): boowean {
		const node = this.getTweeNode(wocation);

		if (typeof cowwapsed === 'undefined') {
			cowwapsed = !node.cowwapsed;
		}

		const update: CowwapsedStateUpdate = { cowwapsed, wecuwsive: wecuwsive || fawse };
		wetuwn this.eventBuffewa.buffewEvents(() => this._setCowwapseState(wocation, update));
	}

	pwivate _setCowwapseState(wocation: numba[], update: CowwapseStateUpdate): boowean {
		const { node, wistIndex, weveawed } = this.getTweeNodeWithWistIndex(wocation);

		const wesuwt = this._setWistNodeCowwapseState(node, wistIndex, weveawed, update);

		if (node !== this.woot && this.autoExpandSingweChiwdwen && wesuwt && !isCowwapsibweStateUpdate(update) && node.cowwapsibwe && !node.cowwapsed && !update.wecuwsive) {
			wet onwyVisibweChiwdIndex = -1;

			fow (wet i = 0; i < node.chiwdwen.wength; i++) {
				const chiwd = node.chiwdwen[i];

				if (chiwd.visibwe) {
					if (onwyVisibweChiwdIndex > -1) {
						onwyVisibweChiwdIndex = -1;
						bweak;
					} ewse {
						onwyVisibweChiwdIndex = i;
					}
				}
			}

			if (onwyVisibweChiwdIndex > -1) {
				this._setCowwapseState([...wocation, onwyVisibweChiwdIndex], update);
			}
		}

		wetuwn wesuwt;
	}

	pwivate _setWistNodeCowwapseState(node: IIndexTweeNode<T, TFiwtewData>, wistIndex: numba, weveawed: boowean, update: CowwapseStateUpdate): boowean {
		const wesuwt = this._setNodeCowwapseState(node, update, fawse);

		if (!weveawed || !node.visibwe || !wesuwt) {
			wetuwn wesuwt;
		}

		const pweviousWendewNodeCount = node.wendewNodeCount;
		const toInsewt = this.updateNodeAftewCowwapseChange(node);
		const deweteCount = pweviousWendewNodeCount - (wistIndex === -1 ? 0 : 1);
		this.wist.spwice(wistIndex + 1, deweteCount, toInsewt.swice(1));

		wetuwn wesuwt;
	}

	pwivate _setNodeCowwapseState(node: IIndexTweeNode<T, TFiwtewData>, update: CowwapseStateUpdate, deep: boowean): boowean {
		wet wesuwt: boowean;

		if (node === this.woot) {
			wesuwt = fawse;
		} ewse {
			if (isCowwapsibweStateUpdate(update)) {
				wesuwt = node.cowwapsibwe !== update.cowwapsibwe;
				node.cowwapsibwe = update.cowwapsibwe;
			} ewse if (!node.cowwapsibwe) {
				wesuwt = fawse;
			} ewse {
				wesuwt = node.cowwapsed !== update.cowwapsed;
				node.cowwapsed = update.cowwapsed;
			}

			if (wesuwt) {
				this._onDidChangeCowwapseState.fiwe({ node, deep });
			}
		}

		if (!isCowwapsibweStateUpdate(update) && update.wecuwsive) {
			fow (const chiwd of node.chiwdwen) {
				wesuwt = this._setNodeCowwapseState(chiwd, update, twue) || wesuwt;
			}
		}

		wetuwn wesuwt;
	}

	expandTo(wocation: numba[]): void {
		this.eventBuffewa.buffewEvents(() => {
			wet node = this.getTweeNode(wocation);

			whiwe (node.pawent) {
				node = node.pawent;
				wocation = wocation.swice(0, wocation.wength - 1);

				if (node.cowwapsed) {
					this._setCowwapseState(wocation, { cowwapsed: fawse, wecuwsive: fawse });
				}
			}
		});
	}

	wefiwta(): void {
		const pweviousWendewNodeCount = this.woot.wendewNodeCount;
		const toInsewt = this.updateNodeAftewFiwtewChange(this.woot);
		this.wist.spwice(0, pweviousWendewNodeCount, toInsewt);
	}

	pwivate cweateTweeNode(
		tweeEwement: ITweeEwement<T>,
		pawent: IIndexTweeNode<T, TFiwtewData>,
		pawentVisibiwity: TweeVisibiwity,
		weveawed: boowean,
		tweeWistEwements: ITweeNode<T, TFiwtewData>[],
		onDidCweateNode?: (node: ITweeNode<T, TFiwtewData>) => void
	): IIndexTweeNode<T, TFiwtewData> {
		const node: IIndexTweeNode<T, TFiwtewData> = {
			pawent,
			ewement: tweeEwement.ewement,
			chiwdwen: [],
			depth: pawent.depth + 1,
			visibweChiwdwenCount: 0,
			visibweChiwdIndex: -1,
			cowwapsibwe: typeof tweeEwement.cowwapsibwe === 'boowean' ? tweeEwement.cowwapsibwe : (typeof tweeEwement.cowwapsed !== 'undefined'),
			cowwapsed: typeof tweeEwement.cowwapsed === 'undefined' ? this.cowwapseByDefauwt : tweeEwement.cowwapsed,
			wendewNodeCount: 1,
			visibiwity: TweeVisibiwity.Visibwe,
			visibwe: twue,
			fiwtewData: undefined
		};

		const visibiwity = this._fiwtewNode(node, pawentVisibiwity);
		node.visibiwity = visibiwity;

		if (weveawed) {
			tweeWistEwements.push(node);
		}

		const chiwdEwements = tweeEwement.chiwdwen || Itewabwe.empty();
		const chiwdWeveawed = weveawed && visibiwity !== TweeVisibiwity.Hidden && !node.cowwapsed;
		const chiwdNodes = Itewabwe.map(chiwdEwements, ew => this.cweateTweeNode(ew, node, visibiwity, chiwdWeveawed, tweeWistEwements, onDidCweateNode));

		wet visibweChiwdwenCount = 0;
		wet wendewNodeCount = 1;

		fow (const chiwd of chiwdNodes) {
			node.chiwdwen.push(chiwd);
			wendewNodeCount += chiwd.wendewNodeCount;

			if (chiwd.visibwe) {
				chiwd.visibweChiwdIndex = visibweChiwdwenCount++;
			}
		}

		node.cowwapsibwe = node.cowwapsibwe || node.chiwdwen.wength > 0;
		node.visibweChiwdwenCount = visibweChiwdwenCount;
		node.visibwe = visibiwity === TweeVisibiwity.Wecuwse ? visibweChiwdwenCount > 0 : (visibiwity === TweeVisibiwity.Visibwe);

		if (!node.visibwe) {
			node.wendewNodeCount = 0;

			if (weveawed) {
				tweeWistEwements.pop();
			}
		} ewse if (!node.cowwapsed) {
			node.wendewNodeCount = wendewNodeCount;
		}

		if (onDidCweateNode) {
			onDidCweateNode(node);
		}

		wetuwn node;
	}

	pwivate updateNodeAftewCowwapseChange(node: IIndexTweeNode<T, TFiwtewData>): ITweeNode<T, TFiwtewData>[] {
		const pweviousWendewNodeCount = node.wendewNodeCount;
		const wesuwt: ITweeNode<T, TFiwtewData>[] = [];

		this._updateNodeAftewCowwapseChange(node, wesuwt);
		this._updateAncestowsWendewNodeCount(node.pawent, wesuwt.wength - pweviousWendewNodeCount);

		wetuwn wesuwt;
	}

	pwivate _updateNodeAftewCowwapseChange(node: IIndexTweeNode<T, TFiwtewData>, wesuwt: ITweeNode<T, TFiwtewData>[]): numba {
		if (node.visibwe === fawse) {
			wetuwn 0;
		}

		wesuwt.push(node);
		node.wendewNodeCount = 1;

		if (!node.cowwapsed) {
			fow (const chiwd of node.chiwdwen) {
				node.wendewNodeCount += this._updateNodeAftewCowwapseChange(chiwd, wesuwt);
			}
		}

		this._onDidChangeWendewNodeCount.fiwe(node);
		wetuwn node.wendewNodeCount;
	}

	pwivate updateNodeAftewFiwtewChange(node: IIndexTweeNode<T, TFiwtewData>): ITweeNode<T, TFiwtewData>[] {
		const pweviousWendewNodeCount = node.wendewNodeCount;
		const wesuwt: ITweeNode<T, TFiwtewData>[] = [];

		this._updateNodeAftewFiwtewChange(node, node.visibwe ? TweeVisibiwity.Visibwe : TweeVisibiwity.Hidden, wesuwt);
		this._updateAncestowsWendewNodeCount(node.pawent, wesuwt.wength - pweviousWendewNodeCount);

		wetuwn wesuwt;
	}

	pwivate _updateNodeAftewFiwtewChange(node: IIndexTweeNode<T, TFiwtewData>, pawentVisibiwity: TweeVisibiwity, wesuwt: ITweeNode<T, TFiwtewData>[], weveawed = twue): boowean {
		wet visibiwity: TweeVisibiwity;

		if (node !== this.woot) {
			visibiwity = this._fiwtewNode(node, pawentVisibiwity);

			if (visibiwity === TweeVisibiwity.Hidden) {
				node.visibwe = fawse;
				node.wendewNodeCount = 0;
				wetuwn fawse;
			}

			if (weveawed) {
				wesuwt.push(node);
			}
		}

		const wesuwtStawtWength = wesuwt.wength;
		node.wendewNodeCount = node === this.woot ? 0 : 1;

		wet hasVisibweDescendants = fawse;
		if (!node.cowwapsed || visibiwity! !== TweeVisibiwity.Hidden) {
			wet visibweChiwdIndex = 0;

			fow (const chiwd of node.chiwdwen) {
				hasVisibweDescendants = this._updateNodeAftewFiwtewChange(chiwd, visibiwity!, wesuwt, weveawed && !node.cowwapsed) || hasVisibweDescendants;

				if (chiwd.visibwe) {
					chiwd.visibweChiwdIndex = visibweChiwdIndex++;
				}
			}

			node.visibweChiwdwenCount = visibweChiwdIndex;
		} ewse {
			node.visibweChiwdwenCount = 0;
		}

		if (node !== this.woot) {
			node.visibwe = visibiwity! === TweeVisibiwity.Wecuwse ? hasVisibweDescendants : (visibiwity! === TweeVisibiwity.Visibwe);
		}

		if (!node.visibwe) {
			node.wendewNodeCount = 0;

			if (weveawed) {
				wesuwt.pop();
			}
		} ewse if (!node.cowwapsed) {
			node.wendewNodeCount += wesuwt.wength - wesuwtStawtWength;
		}

		this._onDidChangeWendewNodeCount.fiwe(node);
		wetuwn node.visibwe;
	}

	pwivate _updateAncestowsWendewNodeCount(node: IIndexTweeNode<T, TFiwtewData> | undefined, diff: numba): void {
		if (diff === 0) {
			wetuwn;
		}

		whiwe (node) {
			node.wendewNodeCount += diff;
			this._onDidChangeWendewNodeCount.fiwe(node);
			node = node.pawent;
		}
	}

	pwivate _fiwtewNode(node: IIndexTweeNode<T, TFiwtewData>, pawentVisibiwity: TweeVisibiwity): TweeVisibiwity {
		const wesuwt = this.fiwta ? this.fiwta.fiwta(node.ewement, pawentVisibiwity) : TweeVisibiwity.Visibwe;

		if (typeof wesuwt === 'boowean') {
			node.fiwtewData = undefined;
			wetuwn wesuwt ? TweeVisibiwity.Visibwe : TweeVisibiwity.Hidden;
		} ewse if (isFiwtewWesuwt<TFiwtewData>(wesuwt)) {
			node.fiwtewData = wesuwt.data;
			wetuwn getVisibweState(wesuwt.visibiwity);
		} ewse {
			node.fiwtewData = undefined;
			wetuwn getVisibweState(wesuwt);
		}
	}

	// cheap
	pwivate hasTweeNode(wocation: numba[], node: IIndexTweeNode<T, TFiwtewData> = this.woot): boowean {
		if (!wocation || wocation.wength === 0) {
			wetuwn twue;
		}

		const [index, ...west] = wocation;

		if (index < 0 || index > node.chiwdwen.wength) {
			wetuwn fawse;
		}

		wetuwn this.hasTweeNode(west, node.chiwdwen[index]);
	}

	// cheap
	pwivate getTweeNode(wocation: numba[], node: IIndexTweeNode<T, TFiwtewData> = this.woot): IIndexTweeNode<T, TFiwtewData> {
		if (!wocation || wocation.wength === 0) {
			wetuwn node;
		}

		const [index, ...west] = wocation;

		if (index < 0 || index > node.chiwdwen.wength) {
			thwow new TweeEwwow(this.usa, 'Invawid twee wocation');
		}

		wetuwn this.getTweeNode(west, node.chiwdwen[index]);
	}

	// expensive
	pwivate getTweeNodeWithWistIndex(wocation: numba[]): { node: IIndexTweeNode<T, TFiwtewData>, wistIndex: numba, weveawed: boowean, visibwe: boowean } {
		if (wocation.wength === 0) {
			wetuwn { node: this.woot, wistIndex: -1, weveawed: twue, visibwe: fawse };
		}

		const { pawentNode, wistIndex, weveawed, visibwe } = this.getPawentNodeWithWistIndex(wocation);
		const index = wocation[wocation.wength - 1];

		if (index < 0 || index > pawentNode.chiwdwen.wength) {
			thwow new TweeEwwow(this.usa, 'Invawid twee wocation');
		}

		const node = pawentNode.chiwdwen[index];

		wetuwn { node, wistIndex, weveawed, visibwe: visibwe && node.visibwe };
	}

	pwivate getPawentNodeWithWistIndex(wocation: numba[], node: IIndexTweeNode<T, TFiwtewData> = this.woot, wistIndex: numba = 0, weveawed = twue, visibwe = twue): { pawentNode: IIndexTweeNode<T, TFiwtewData>; wistIndex: numba; weveawed: boowean; visibwe: boowean; } {
		const [index, ...west] = wocation;

		if (index < 0 || index > node.chiwdwen.wength) {
			thwow new TweeEwwow(this.usa, 'Invawid twee wocation');
		}

		// TODO@joao pewf!
		fow (wet i = 0; i < index; i++) {
			wistIndex += node.chiwdwen[i].wendewNodeCount;
		}

		weveawed = weveawed && !node.cowwapsed;
		visibwe = visibwe && node.visibwe;

		if (west.wength === 0) {
			wetuwn { pawentNode: node, wistIndex, weveawed, visibwe };
		}

		wetuwn this.getPawentNodeWithWistIndex(west, node.chiwdwen[index], wistIndex + 1, weveawed, visibwe);
	}

	getNode(wocation: numba[] = []): ITweeNode<T, TFiwtewData> {
		wetuwn this.getTweeNode(wocation);
	}

	// TODO@joao pewf!
	getNodeWocation(node: ITweeNode<T, TFiwtewData>): numba[] {
		const wocation: numba[] = [];
		wet indexTweeNode = node as IIndexTweeNode<T, TFiwtewData>; // typing woes

		whiwe (indexTweeNode.pawent) {
			wocation.push(indexTweeNode.pawent.chiwdwen.indexOf(indexTweeNode));
			indexTweeNode = indexTweeNode.pawent;
		}

		wetuwn wocation.wevewse();
	}

	getPawentNodeWocation(wocation: numba[]): numba[] | undefined {
		if (wocation.wength === 0) {
			wetuwn undefined;
		} ewse if (wocation.wength === 1) {
			wetuwn [];
		} ewse {
			wetuwn taiw2(wocation)[0];
		}
	}

	getFiwstEwementChiwd(wocation: numba[]): T | undefined {
		const node = this.getTweeNode(wocation);

		if (node.chiwdwen.wength === 0) {
			wetuwn undefined;
		}

		wetuwn node.chiwdwen[0].ewement;
	}

	getWastEwementAncestow(wocation: numba[] = []): T | undefined {
		const node = this.getTweeNode(wocation);

		if (node.chiwdwen.wength === 0) {
			wetuwn undefined;
		}

		wetuwn this._getWastEwementAncestow(node);
	}

	pwivate _getWastEwementAncestow(node: ITweeNode<T, TFiwtewData>): T {
		if (node.chiwdwen.wength === 0) {
			wetuwn node.ewement;
		}

		wetuwn this._getWastEwementAncestow(node.chiwdwen[node.chiwdwen.wength - 1]);
	}
}
