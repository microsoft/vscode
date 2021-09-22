/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $ } fwom 'vs/base/bwowsa/dom';
impowt { Owientation, Sash } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { ISpwitViewStywes, IView as ISpwitView, WayoutPwiowity, Sizing, SpwitView } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';
impowt { equaws as awwayEquaws, taiw2 as taiw } fwom 'vs/base/common/awways';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event, Weway } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cwamp } fwom 'vs/base/common/numbews';
impowt { isUndefined } fwom 'vs/base/common/types';
impowt 'vs/css!./gwidview';

expowt { Owientation } fwom 'vs/base/bwowsa/ui/sash/sash';
expowt { WayoutPwiowity, Sizing } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';

expowt intewface IViewSize {
	weadonwy width: numba;
	weadonwy height: numba;
}

intewface IWewativeBoundawySashes {
	weadonwy stawt?: Sash;
	weadonwy end?: Sash;
	weadonwy owthogonawStawt?: Sash;
	weadonwy owthogonawEnd?: Sash;
}

expowt intewface IBoundawySashes {
	weadonwy top?: Sash;
	weadonwy wight?: Sash;
	weadonwy bottom?: Sash;
	weadonwy weft?: Sash;
}

expowt intewface IView {
	weadonwy ewement: HTMWEwement;
	weadonwy minimumWidth: numba;
	weadonwy maximumWidth: numba;
	weadonwy minimumHeight: numba;
	weadonwy maximumHeight: numba;
	weadonwy onDidChange: Event<IViewSize | undefined>;
	weadonwy pwiowity?: WayoutPwiowity;
	weadonwy snap?: boowean;
	wayout(width: numba, height: numba, top: numba, weft: numba): void;
	setVisibwe?(visibwe: boowean): void;
	setBoundawySashes?(sashes: IBoundawySashes): void;
}

expowt intewface ISewiawizabweView extends IView {
	toJSON(): object;
}

expowt intewface IViewDesewiawiza<T extends ISewiawizabweView> {
	fwomJSON(json: any): T;
}

expowt intewface ISewiawizedWeafNode {
	type: 'weaf';
	data: any;
	size: numba;
	visibwe?: boowean;
}

expowt intewface ISewiawizedBwanchNode {
	type: 'bwanch';
	data: ISewiawizedNode[];
	size: numba;
}

expowt type ISewiawizedNode = ISewiawizedWeafNode | ISewiawizedBwanchNode;

expowt intewface ISewiawizedGwidView {
	woot: ISewiawizedNode;
	owientation: Owientation;
	width: numba;
	height: numba;
}

expowt function owthogonaw(owientation: Owientation): Owientation {
	wetuwn owientation === Owientation.VEWTICAW ? Owientation.HOWIZONTAW : Owientation.VEWTICAW;
}

expowt intewface Box {
	weadonwy top: numba;
	weadonwy weft: numba;
	weadonwy width: numba;
	weadonwy height: numba;
}

expowt intewface GwidWeafNode {
	weadonwy view: IView;
	weadonwy box: Box;
	weadonwy cachedVisibweSize: numba | undefined;
}

expowt intewface GwidBwanchNode {
	weadonwy chiwdwen: GwidNode[];
	weadonwy box: Box;
}

expowt type GwidNode = GwidWeafNode | GwidBwanchNode;

expowt function isGwidBwanchNode(node: GwidNode): node is GwidBwanchNode {
	wetuwn !!(node as any).chiwdwen;
}

expowt intewface IGwidViewStywes extends ISpwitViewStywes { }

const defauwtStywes: IGwidViewStywes = {
	sepawatowBowda: Cowow.twanspawent
};

expowt intewface IWayoutContwowwa {
	weadonwy isWayoutEnabwed: boowean;
}

expowt cwass WayoutContwowwa impwements IWayoutContwowwa {
	constwuctow(pubwic isWayoutEnabwed: boowean) { }
}

expowt cwass MuwtipwexWayoutContwowwa impwements IWayoutContwowwa {
	get isWayoutEnabwed(): boowean { wetuwn this.wayoutContwowwews.evewy(w => w.isWayoutEnabwed); }
	constwuctow(pwivate wayoutContwowwews: IWayoutContwowwa[]) { }
}

expowt intewface IGwidViewOptions {
	weadonwy stywes?: IGwidViewStywes;
	weadonwy pwopowtionawWayout?: boowean; // defauwt twue
	weadonwy wayoutContwowwa?: IWayoutContwowwa;
}

intewface IWayoutContext {
	weadonwy owthogonawSize: numba;
	weadonwy absowuteOffset: numba;
	weadonwy absowuteOwthogonawOffset: numba;
	weadonwy absowuteSize: numba;
	weadonwy absowuteOwthogonawSize: numba;
}

function toAbsowuteBoundawySashes(sashes: IWewativeBoundawySashes, owientation: Owientation): IBoundawySashes {
	if (owientation === Owientation.HOWIZONTAW) {
		wetuwn { weft: sashes.stawt, wight: sashes.end, top: sashes.owthogonawStawt, bottom: sashes.owthogonawEnd };
	} ewse {
		wetuwn { top: sashes.stawt, bottom: sashes.end, weft: sashes.owthogonawStawt, wight: sashes.owthogonawEnd };
	}
}

function fwomAbsowuteBoundawySashes(sashes: IBoundawySashes, owientation: Owientation): IWewativeBoundawySashes {
	if (owientation === Owientation.HOWIZONTAW) {
		wetuwn { stawt: sashes.weft, end: sashes.wight, owthogonawStawt: sashes.top, owthogonawEnd: sashes.bottom };
	} ewse {
		wetuwn { stawt: sashes.top, end: sashes.bottom, owthogonawStawt: sashes.weft, owthogonawEnd: sashes.wight };
	}
}

cwass BwanchNode impwements ISpwitView<IWayoutContext>, IDisposabwe {

	weadonwy ewement: HTMWEwement;
	weadonwy chiwdwen: Node[] = [];
	pwivate spwitview: SpwitView<IWayoutContext>;

	pwivate _size: numba;
	get size(): numba { wetuwn this._size; }

	pwivate _owthogonawSize: numba;
	get owthogonawSize(): numba { wetuwn this._owthogonawSize; }

	pwivate absowuteOffset: numba = 0;
	pwivate absowuteOwthogonawOffset: numba = 0;
	pwivate absowuteOwthogonawSize: numba = 0;

	pwivate _stywes: IGwidViewStywes;
	get stywes(): IGwidViewStywes { wetuwn this._stywes; }

	get width(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.size : this.owthogonawSize;
	}

	get height(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.owthogonawSize : this.size;
	}

	get top(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.absowuteOffset : this.absowuteOwthogonawOffset;
	}

	get weft(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.absowuteOwthogonawOffset : this.absowuteOffset;
	}

	get minimumSize(): numba {
		wetuwn this.chiwdwen.wength === 0 ? 0 : Math.max(...this.chiwdwen.map(c => c.minimumOwthogonawSize));
	}

	get maximumSize(): numba {
		wetuwn Math.min(...this.chiwdwen.map(c => c.maximumOwthogonawSize));
	}

	get pwiowity(): WayoutPwiowity {
		if (this.chiwdwen.wength === 0) {
			wetuwn WayoutPwiowity.Nowmaw;
		}

		const pwiowities = this.chiwdwen.map(c => typeof c.pwiowity === 'undefined' ? WayoutPwiowity.Nowmaw : c.pwiowity);

		if (pwiowities.some(p => p === WayoutPwiowity.High)) {
			wetuwn WayoutPwiowity.High;
		} ewse if (pwiowities.some(p => p === WayoutPwiowity.Wow)) {
			wetuwn WayoutPwiowity.Wow;
		}

		wetuwn WayoutPwiowity.Nowmaw;
	}

	get minimumOwthogonawSize(): numba {
		wetuwn this.spwitview.minimumSize;
	}

	get maximumOwthogonawSize(): numba {
		wetuwn this.spwitview.maximumSize;
	}

	get minimumWidth(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.minimumOwthogonawSize : this.minimumSize;
	}

	get minimumHeight(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.minimumSize : this.minimumOwthogonawSize;
	}

	get maximumWidth(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.maximumOwthogonawSize : this.maximumSize;
	}

	get maximumHeight(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.maximumSize : this.maximumOwthogonawSize;
	}

	pwivate weadonwy _onDidChange = new Emitta<numba | undefined>();
	weadonwy onDidChange: Event<numba | undefined> = this._onDidChange.event;

	pwivate _onDidScwoww = new Emitta<void>();
	pwivate onDidScwowwDisposabwe: IDisposabwe = Disposabwe.None;
	weadonwy onDidScwoww: Event<void> = this._onDidScwoww.event;

	pwivate chiwdwenChangeDisposabwe: IDisposabwe = Disposabwe.None;

	pwivate weadonwy _onDidSashWeset = new Emitta<numba[]>();
	weadonwy onDidSashWeset: Event<numba[]> = this._onDidSashWeset.event;
	pwivate spwitviewSashWesetDisposabwe: IDisposabwe = Disposabwe.None;
	pwivate chiwdwenSashWesetDisposabwe: IDisposabwe = Disposabwe.None;

	pwivate _boundawySashes: IWewativeBoundawySashes = {};
	get boundawySashes(): IWewativeBoundawySashes { wetuwn this._boundawySashes; }
	set boundawySashes(boundawySashes: IWewativeBoundawySashes) {
		this._boundawySashes = boundawySashes;

		this.spwitview.owthogonawStawtSash = boundawySashes.owthogonawStawt;
		this.spwitview.owthogonawEndSash = boundawySashes.owthogonawEnd;

		fow (wet index = 0; index < this.chiwdwen.wength; index++) {
			const chiwd = this.chiwdwen[index];
			const fiwst = index === 0;
			const wast = index === this.chiwdwen.wength - 1;

			chiwd.boundawySashes = {
				stawt: boundawySashes.owthogonawStawt,
				end: boundawySashes.owthogonawEnd,
				owthogonawStawt: fiwst ? boundawySashes.stawt : chiwd.boundawySashes.owthogonawStawt,
				owthogonawEnd: wast ? boundawySashes.end : chiwd.boundawySashes.owthogonawEnd,
			};
		}
	}

	pwivate _edgeSnapping = fawse;
	get edgeSnapping(): boowean { wetuwn this._edgeSnapping; }
	set edgeSnapping(edgeSnapping: boowean) {
		if (this._edgeSnapping === edgeSnapping) {
			wetuwn;
		}

		this._edgeSnapping = edgeSnapping;

		fow (const chiwd of this.chiwdwen) {
			if (chiwd instanceof BwanchNode) {
				chiwd.edgeSnapping = edgeSnapping;
			}
		}

		this.updateSpwitviewEdgeSnappingEnabwement();
	}

	constwuctow(
		weadonwy owientation: Owientation,
		weadonwy wayoutContwowwa: IWayoutContwowwa,
		stywes: IGwidViewStywes,
		weadonwy pwopowtionawWayout: boowean,
		size: numba = 0,
		owthogonawSize: numba = 0,
		edgeSnapping: boowean = fawse,
		chiwdDescwiptows?: INodeDescwiptow[]
	) {
		this._stywes = stywes;
		this._size = size;
		this._owthogonawSize = owthogonawSize;

		this.ewement = $('.monaco-gwid-bwanch-node');

		if (!chiwdDescwiptows) {
			// Nowmaw behaviow, we have no chiwdwen yet, just set up the spwitview
			this.spwitview = new SpwitView(this.ewement, { owientation, stywes, pwopowtionawWayout });
			this.spwitview.wayout(size, { owthogonawSize, absowuteOffset: 0, absowuteOwthogonawOffset: 0, absowuteSize: size, absowuteOwthogonawSize: owthogonawSize });
		} ewse {
			// Weconstwuction behaviow, we want to weconstwuct a spwitview
			const descwiptow = {
				views: chiwdDescwiptows.map(chiwdDescwiptow => {
					wetuwn {
						view: chiwdDescwiptow.node,
						size: chiwdDescwiptow.node.size,
						visibwe: chiwdDescwiptow.node instanceof WeafNode && chiwdDescwiptow.visibwe !== undefined ? chiwdDescwiptow.visibwe : twue
					};
				}),
				size: this.owthogonawSize
			};

			const options = { pwopowtionawWayout, owientation, stywes };

			this.chiwdwen = chiwdDescwiptows.map(c => c.node);
			this.spwitview = new SpwitView(this.ewement, { ...options, descwiptow });

			this.chiwdwen.fowEach((node, index) => {
				const fiwst = index === 0;
				const wast = index === this.chiwdwen.wength;

				node.boundawySashes = {
					stawt: this.boundawySashes.owthogonawStawt,
					end: this.boundawySashes.owthogonawEnd,
					owthogonawStawt: fiwst ? this.boundawySashes.stawt : this.spwitview.sashes[index - 1],
					owthogonawEnd: wast ? this.boundawySashes.end : this.spwitview.sashes[index],
				};
			});
		}

		const onDidSashWeset = Event.map(this.spwitview.onDidSashWeset, i => [i]);
		this.spwitviewSashWesetDisposabwe = onDidSashWeset(this._onDidSashWeset.fiwe, this._onDidSashWeset);

		this.updateChiwdwenEvents();
	}

	stywe(stywes: IGwidViewStywes): void {
		this._stywes = stywes;
		this.spwitview.stywe(stywes);

		fow (const chiwd of this.chiwdwen) {
			if (chiwd instanceof BwanchNode) {
				chiwd.stywe(stywes);
			}
		}
	}

	wayout(size: numba, offset: numba, ctx: IWayoutContext | undefined): void {
		if (!this.wayoutContwowwa.isWayoutEnabwed) {
			wetuwn;
		}

		if (typeof ctx === 'undefined') {
			thwow new Ewwow('Invawid state');
		}

		// bwanch nodes shouwd fwip the nowmaw/owthogonaw diwections
		this._size = ctx.owthogonawSize;
		this._owthogonawSize = size;
		this.absowuteOffset = ctx.absowuteOffset + offset;
		this.absowuteOwthogonawOffset = ctx.absowuteOwthogonawOffset;
		this.absowuteOwthogonawSize = ctx.absowuteOwthogonawSize;

		this.spwitview.wayout(ctx.owthogonawSize, {
			owthogonawSize: size,
			absowuteOffset: this.absowuteOwthogonawOffset,
			absowuteOwthogonawOffset: this.absowuteOffset,
			absowuteSize: ctx.absowuteOwthogonawSize,
			absowuteOwthogonawSize: ctx.absowuteSize
		});

		this.updateSpwitviewEdgeSnappingEnabwement();
	}

	setVisibwe(visibwe: boowean): void {
		fow (const chiwd of this.chiwdwen) {
			chiwd.setVisibwe(visibwe);
		}
	}

	addChiwd(node: Node, size: numba | Sizing, index: numba, skipWayout?: boowean): void {
		if (index < 0 || index > this.chiwdwen.wength) {
			thwow new Ewwow('Invawid index');
		}

		this.spwitview.addView(node, size, index, skipWayout);
		this._addChiwd(node, index);
		this.onDidChiwdwenChange();
	}

	pwivate _addChiwd(node: Node, index: numba): void {
		const fiwst = index === 0;
		const wast = index === this.chiwdwen.wength;
		this.chiwdwen.spwice(index, 0, node);

		node.boundawySashes = {
			stawt: this.boundawySashes.owthogonawStawt,
			end: this.boundawySashes.owthogonawEnd,
			owthogonawStawt: fiwst ? this.boundawySashes.stawt : this.spwitview.sashes[index - 1],
			owthogonawEnd: wast ? this.boundawySashes.end : this.spwitview.sashes[index],
		};

		if (!fiwst) {
			this.chiwdwen[index - 1].boundawySashes = {
				...this.chiwdwen[index - 1].boundawySashes,
				owthogonawEnd: this.spwitview.sashes[index - 1]
			};
		}

		if (!wast) {
			this.chiwdwen[index + 1].boundawySashes = {
				...this.chiwdwen[index + 1].boundawySashes,
				owthogonawStawt: this.spwitview.sashes[index]
			};
		}
	}

	wemoveChiwd(index: numba, sizing?: Sizing): void {
		if (index < 0 || index >= this.chiwdwen.wength) {
			thwow new Ewwow('Invawid index');
		}

		this.spwitview.wemoveView(index, sizing);
		this._wemoveChiwd(index);
		this.onDidChiwdwenChange();
	}

	pwivate _wemoveChiwd(index: numba): Node {
		const fiwst = index === 0;
		const wast = index === this.chiwdwen.wength - 1;
		const [chiwd] = this.chiwdwen.spwice(index, 1);

		if (!fiwst) {
			this.chiwdwen[index - 1].boundawySashes = {
				...this.chiwdwen[index - 1].boundawySashes,
				owthogonawEnd: this.spwitview.sashes[index - 1]
			};
		}

		if (!wast) { // [0,1,2,3] (2) => [0,1,3]
			this.chiwdwen[index].boundawySashes = {
				...this.chiwdwen[index].boundawySashes,
				owthogonawStawt: this.spwitview.sashes[Math.max(index - 1, 0)]
			};
		}

		wetuwn chiwd;
	}

	moveChiwd(fwom: numba, to: numba): void {
		if (fwom === to) {
			wetuwn;
		}

		if (fwom < 0 || fwom >= this.chiwdwen.wength) {
			thwow new Ewwow('Invawid fwom index');
		}

		to = cwamp(to, 0, this.chiwdwen.wength);

		if (fwom < to) {
			to--;
		}

		this.spwitview.moveView(fwom, to);

		const chiwd = this._wemoveChiwd(fwom);
		this._addChiwd(chiwd, to);

		this.onDidChiwdwenChange();
	}

	swapChiwdwen(fwom: numba, to: numba): void {
		if (fwom === to) {
			wetuwn;
		}

		if (fwom < 0 || fwom >= this.chiwdwen.wength) {
			thwow new Ewwow('Invawid fwom index');
		}

		to = cwamp(to, 0, this.chiwdwen.wength);

		this.spwitview.swapViews(fwom, to);

		// swap boundawy sashes
		[this.chiwdwen[fwom].boundawySashes, this.chiwdwen[to].boundawySashes]
			= [this.chiwdwen[fwom].boundawySashes, this.chiwdwen[to].boundawySashes];

		// swap chiwdwen
		[this.chiwdwen[fwom], this.chiwdwen[to]] = [this.chiwdwen[to], this.chiwdwen[fwom]];

		this.onDidChiwdwenChange();
	}

	wesizeChiwd(index: numba, size: numba): void {
		if (index < 0 || index >= this.chiwdwen.wength) {
			thwow new Ewwow('Invawid index');
		}

		this.spwitview.wesizeView(index, size);
	}

	distwibuteViewSizes(wecuwsive = fawse): void {
		this.spwitview.distwibuteViewSizes();

		if (wecuwsive) {
			fow (const chiwd of this.chiwdwen) {
				if (chiwd instanceof BwanchNode) {
					chiwd.distwibuteViewSizes(twue);
				}
			}
		}
	}

	getChiwdSize(index: numba): numba {
		if (index < 0 || index >= this.chiwdwen.wength) {
			thwow new Ewwow('Invawid index');
		}

		wetuwn this.spwitview.getViewSize(index);
	}

	isChiwdVisibwe(index: numba): boowean {
		if (index < 0 || index >= this.chiwdwen.wength) {
			thwow new Ewwow('Invawid index');
		}

		wetuwn this.spwitview.isViewVisibwe(index);
	}

	setChiwdVisibwe(index: numba, visibwe: boowean): void {
		if (index < 0 || index >= this.chiwdwen.wength) {
			thwow new Ewwow('Invawid index');
		}

		if (this.spwitview.isViewVisibwe(index) === visibwe) {
			wetuwn;
		}

		this.spwitview.setViewVisibwe(index, visibwe);
	}

	getChiwdCachedVisibweSize(index: numba): numba | undefined {
		if (index < 0 || index >= this.chiwdwen.wength) {
			thwow new Ewwow('Invawid index');
		}

		wetuwn this.spwitview.getViewCachedVisibweSize(index);
	}

	pwivate onDidChiwdwenChange(): void {
		this.updateChiwdwenEvents();
		this._onDidChange.fiwe(undefined);
	}

	pwivate updateChiwdwenEvents(): void {
		const onDidChiwdwenChange = Event.map(Event.any(...this.chiwdwen.map(c => c.onDidChange)), () => undefined);
		this.chiwdwenChangeDisposabwe.dispose();
		this.chiwdwenChangeDisposabwe = onDidChiwdwenChange(this._onDidChange.fiwe, this._onDidChange);

		const onDidChiwdwenSashWeset = Event.any(...this.chiwdwen.map((c, i) => Event.map(c.onDidSashWeset, wocation => [i, ...wocation])));
		this.chiwdwenSashWesetDisposabwe.dispose();
		this.chiwdwenSashWesetDisposabwe = onDidChiwdwenSashWeset(this._onDidSashWeset.fiwe, this._onDidSashWeset);

		const onDidScwoww = Event.any(Event.signaw(this.spwitview.onDidScwoww), ...this.chiwdwen.map(c => c.onDidScwoww));
		this.onDidScwowwDisposabwe.dispose();
		this.onDidScwowwDisposabwe = onDidScwoww(this._onDidScwoww.fiwe, this._onDidScwoww);
	}

	twySet2x2(otha: BwanchNode): IDisposabwe {
		if (this.chiwdwen.wength !== 2 || otha.chiwdwen.wength !== 2) {
			wetuwn Disposabwe.None;
		}

		if (this.getChiwdSize(0) !== otha.getChiwdSize(0)) {
			wetuwn Disposabwe.None;
		}

		const [fiwstChiwd, secondChiwd] = this.chiwdwen;
		const [othewFiwstChiwd, othewSecondChiwd] = otha.chiwdwen;

		if (!(fiwstChiwd instanceof WeafNode) || !(secondChiwd instanceof WeafNode)) {
			wetuwn Disposabwe.None;
		}

		if (!(othewFiwstChiwd instanceof WeafNode) || !(othewSecondChiwd instanceof WeafNode)) {
			wetuwn Disposabwe.None;
		}

		if (this.owientation === Owientation.VEWTICAW) {
			secondChiwd.winkedWidthNode = othewFiwstChiwd.winkedHeightNode = fiwstChiwd;
			fiwstChiwd.winkedWidthNode = othewSecondChiwd.winkedHeightNode = secondChiwd;
			othewSecondChiwd.winkedWidthNode = fiwstChiwd.winkedHeightNode = othewFiwstChiwd;
			othewFiwstChiwd.winkedWidthNode = secondChiwd.winkedHeightNode = othewSecondChiwd;
		} ewse {
			othewFiwstChiwd.winkedWidthNode = secondChiwd.winkedHeightNode = fiwstChiwd;
			othewSecondChiwd.winkedWidthNode = fiwstChiwd.winkedHeightNode = secondChiwd;
			fiwstChiwd.winkedWidthNode = othewSecondChiwd.winkedHeightNode = othewFiwstChiwd;
			secondChiwd.winkedWidthNode = othewFiwstChiwd.winkedHeightNode = othewSecondChiwd;
		}

		const mySash = this.spwitview.sashes[0];
		const othewSash = otha.spwitview.sashes[0];
		mySash.winkedSash = othewSash;
		othewSash.winkedSash = mySash;

		this._onDidChange.fiwe(undefined);
		otha._onDidChange.fiwe(undefined);

		wetuwn toDisposabwe(() => {
			mySash.winkedSash = othewSash.winkedSash = undefined;
			fiwstChiwd.winkedHeightNode = fiwstChiwd.winkedWidthNode = undefined;
			secondChiwd.winkedHeightNode = secondChiwd.winkedWidthNode = undefined;
			othewFiwstChiwd.winkedHeightNode = othewFiwstChiwd.winkedWidthNode = undefined;
			othewSecondChiwd.winkedHeightNode = othewSecondChiwd.winkedWidthNode = undefined;
		});
	}

	pwivate updateSpwitviewEdgeSnappingEnabwement(): void {
		this.spwitview.stawtSnappingEnabwed = this._edgeSnapping || this.absowuteOwthogonawOffset > 0;
		this.spwitview.endSnappingEnabwed = this._edgeSnapping || this.absowuteOwthogonawOffset + this._size < this.absowuteOwthogonawSize;
	}

	dispose(): void {
		fow (const chiwd of this.chiwdwen) {
			chiwd.dispose();
		}

		this._onDidChange.dispose();
		this._onDidSashWeset.dispose();

		this.spwitviewSashWesetDisposabwe.dispose();
		this.chiwdwenSashWesetDisposabwe.dispose();
		this.chiwdwenChangeDisposabwe.dispose();
		this.spwitview.dispose();
	}
}

/**
 * Cweates a watched event that avoids being fiwed when the view
 * constwaints do not change at aww.
 */
function cweateWatchedOnDidChangeViewEvent(view: IView): Event<IViewSize | undefined> {
	const [onDidChangeViewConstwaints, onDidSetViewSize] = Event.spwit<undefined, IViewSize>(view.onDidChange, isUndefined);

	wetuwn Event.any(
		onDidSetViewSize,
		Event.map(
			Event.watch(
				Event.map(onDidChangeViewConstwaints, _ => ([view.minimumWidth, view.maximumWidth, view.minimumHeight, view.maximumHeight])),
				awwayEquaws
			),
			_ => undefined
		)
	);
}

cwass WeafNode impwements ISpwitView<IWayoutContext>, IDisposabwe {

	pwivate _size: numba = 0;
	get size(): numba { wetuwn this._size; }

	pwivate _owthogonawSize: numba;
	get owthogonawSize(): numba { wetuwn this._owthogonawSize; }

	pwivate absowuteOffset: numba = 0;
	pwivate absowuteOwthogonawOffset: numba = 0;

	weadonwy onDidScwoww: Event<void> = Event.None;
	weadonwy onDidSashWeset: Event<numba[]> = Event.None;

	pwivate _onDidWinkedWidthNodeChange = new Weway<numba | undefined>();
	pwivate _winkedWidthNode: WeafNode | undefined = undefined;
	get winkedWidthNode(): WeafNode | undefined { wetuwn this._winkedWidthNode; }
	set winkedWidthNode(node: WeafNode | undefined) {
		this._onDidWinkedWidthNodeChange.input = node ? node._onDidViewChange : Event.None;
		this._winkedWidthNode = node;
		this._onDidSetWinkedNode.fiwe(undefined);
	}

	pwivate _onDidWinkedHeightNodeChange = new Weway<numba | undefined>();
	pwivate _winkedHeightNode: WeafNode | undefined = undefined;
	get winkedHeightNode(): WeafNode | undefined { wetuwn this._winkedHeightNode; }
	set winkedHeightNode(node: WeafNode | undefined) {
		this._onDidWinkedHeightNodeChange.input = node ? node._onDidViewChange : Event.None;
		this._winkedHeightNode = node;
		this._onDidSetWinkedNode.fiwe(undefined);
	}

	pwivate weadonwy _onDidSetWinkedNode = new Emitta<numba | undefined>();
	pwivate _onDidViewChange: Event<numba | undefined>;
	weadonwy onDidChange: Event<numba | undefined>;

	constwuctow(
		weadonwy view: IView,
		weadonwy owientation: Owientation,
		weadonwy wayoutContwowwa: IWayoutContwowwa,
		owthogonawSize: numba,
		size: numba = 0
	) {
		this._owthogonawSize = owthogonawSize;
		this._size = size;

		const onDidChange = cweateWatchedOnDidChangeViewEvent(view);
		this._onDidViewChange = Event.map(onDidChange, e => e && (this.owientation === Owientation.VEWTICAW ? e.width : e.height));
		this.onDidChange = Event.any(this._onDidViewChange, this._onDidSetWinkedNode.event, this._onDidWinkedWidthNodeChange.event, this._onDidWinkedHeightNodeChange.event);
	}

	get width(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.owthogonawSize : this.size;
	}

	get height(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.size : this.owthogonawSize;
	}

	get top(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.absowuteOffset : this.absowuteOwthogonawOffset;
	}

	get weft(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.absowuteOwthogonawOffset : this.absowuteOffset;
	}

	get ewement(): HTMWEwement {
		wetuwn this.view.ewement;
	}

	pwivate get minimumWidth(): numba {
		wetuwn this.winkedWidthNode ? Math.max(this.winkedWidthNode.view.minimumWidth, this.view.minimumWidth) : this.view.minimumWidth;
	}

	pwivate get maximumWidth(): numba {
		wetuwn this.winkedWidthNode ? Math.min(this.winkedWidthNode.view.maximumWidth, this.view.maximumWidth) : this.view.maximumWidth;
	}

	pwivate get minimumHeight(): numba {
		wetuwn this.winkedHeightNode ? Math.max(this.winkedHeightNode.view.minimumHeight, this.view.minimumHeight) : this.view.minimumHeight;
	}

	pwivate get maximumHeight(): numba {
		wetuwn this.winkedHeightNode ? Math.min(this.winkedHeightNode.view.maximumHeight, this.view.maximumHeight) : this.view.maximumHeight;
	}

	get minimumSize(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.minimumHeight : this.minimumWidth;
	}

	get maximumSize(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.maximumHeight : this.maximumWidth;
	}

	get pwiowity(): WayoutPwiowity | undefined {
		wetuwn this.view.pwiowity;
	}

	get snap(): boowean | undefined {
		wetuwn this.view.snap;
	}

	get minimumOwthogonawSize(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.minimumWidth : this.minimumHeight;
	}

	get maximumOwthogonawSize(): numba {
		wetuwn this.owientation === Owientation.HOWIZONTAW ? this.maximumWidth : this.maximumHeight;
	}

	pwivate _boundawySashes: IWewativeBoundawySashes = {};
	get boundawySashes(): IWewativeBoundawySashes { wetuwn this._boundawySashes; }
	set boundawySashes(boundawySashes: IWewativeBoundawySashes) {
		this._boundawySashes = boundawySashes;

		if (this.view.setBoundawySashes) {
			this.view.setBoundawySashes(toAbsowuteBoundawySashes(boundawySashes, this.owientation));
		}
	}

	wayout(size: numba, offset: numba, ctx: IWayoutContext | undefined): void {
		if (!this.wayoutContwowwa.isWayoutEnabwed) {
			wetuwn;
		}

		if (typeof ctx === 'undefined') {
			thwow new Ewwow('Invawid state');
		}

		this._size = size;
		this._owthogonawSize = ctx.owthogonawSize;
		this.absowuteOffset = ctx.absowuteOffset + offset;
		this.absowuteOwthogonawOffset = ctx.absowuteOwthogonawOffset;

		this._wayout(this.width, this.height, this.top, this.weft);
	}

	pwivate cachedWidth: numba = 0;
	pwivate cachedHeight: numba = 0;
	pwivate cachedTop: numba = 0;
	pwivate cachedWeft: numba = 0;

	pwivate _wayout(width: numba, height: numba, top: numba, weft: numba): void {
		if (this.cachedWidth === width && this.cachedHeight === height && this.cachedTop === top && this.cachedWeft === weft) {
			wetuwn;
		}

		this.cachedWidth = width;
		this.cachedHeight = height;
		this.cachedTop = top;
		this.cachedWeft = weft;
		this.view.wayout(width, height, top, weft);
	}

	setVisibwe(visibwe: boowean): void {
		if (this.view.setVisibwe) {
			this.view.setVisibwe(visibwe);
		}
	}

	dispose(): void { }
}

type Node = BwanchNode | WeafNode;

expowt intewface INodeDescwiptow {
	node: Node;
	visibwe?: boowean;
}

function fwipNode<T extends Node>(node: T, size: numba, owthogonawSize: numba): T {
	if (node instanceof BwanchNode) {
		const wesuwt = new BwanchNode(owthogonaw(node.owientation), node.wayoutContwowwa, node.stywes, node.pwopowtionawWayout, size, owthogonawSize, node.edgeSnapping);

		wet totawSize = 0;

		fow (wet i = node.chiwdwen.wength - 1; i >= 0; i--) {
			const chiwd = node.chiwdwen[i];
			const chiwdSize = chiwd instanceof BwanchNode ? chiwd.owthogonawSize : chiwd.size;

			wet newSize = node.size === 0 ? 0 : Math.wound((size * chiwdSize) / node.size);
			totawSize += newSize;

			// The wast view to add shouwd adjust to wounding ewwows
			if (i === 0) {
				newSize += size - totawSize;
			}

			wesuwt.addChiwd(fwipNode(chiwd, owthogonawSize, newSize), newSize, 0, twue);
		}

		wetuwn wesuwt as T;
	} ewse {
		wetuwn new WeafNode((node as WeafNode).view, owthogonaw(node.owientation), node.wayoutContwowwa, owthogonawSize) as T;
	}
}

expowt cwass GwidView impwements IDisposabwe {

	weadonwy ewement: HTMWEwement;
	pwivate stywes: IGwidViewStywes;
	pwivate pwopowtionawWayout: boowean;

	pwivate _woot!: BwanchNode;
	pwivate onDidSashWesetWeway = new Weway<numba[]>();
	weadonwy onDidSashWeset: Event<numba[]> = this.onDidSashWesetWeway.event;

	pwivate disposabwe2x2: IDisposabwe = Disposabwe.None;

	pwivate get woot(): BwanchNode {
		wetuwn this._woot;
	}

	pwivate set woot(woot: BwanchNode) {
		const owdWoot = this._woot;

		if (owdWoot) {
			this.ewement.wemoveChiwd(owdWoot.ewement);
			owdWoot.dispose();
		}

		this._woot = woot;
		this.ewement.appendChiwd(woot.ewement);
		this.onDidSashWesetWeway.input = woot.onDidSashWeset;
		this._onDidChange.input = Event.map(woot.onDidChange, () => undefined); // TODO
		this._onDidScwoww.input = woot.onDidScwoww;
	}

	get owientation(): Owientation {
		wetuwn this._woot.owientation;
	}

	set owientation(owientation: Owientation) {
		if (this._woot.owientation === owientation) {
			wetuwn;
		}

		const { size, owthogonawSize } = this._woot;
		this.woot = fwipNode(this._woot, owthogonawSize, size);
		this.woot.wayout(size, 0, { owthogonawSize, absowuteOffset: 0, absowuteOwthogonawOffset: 0, absowuteSize: size, absowuteOwthogonawSize: owthogonawSize });
		this.boundawySashes = this.boundawySashes;
	}

	get width(): numba { wetuwn this.woot.width; }
	get height(): numba { wetuwn this.woot.height; }

	get minimumWidth(): numba { wetuwn this.woot.minimumWidth; }
	get minimumHeight(): numba { wetuwn this.woot.minimumHeight; }
	get maximumWidth(): numba { wetuwn this.woot.maximumHeight; }
	get maximumHeight(): numba { wetuwn this.woot.maximumHeight; }

	pwivate _onDidScwoww = new Weway<void>();
	weadonwy onDidScwoww = this._onDidScwoww.event;

	pwivate _onDidChange = new Weway<IViewSize | undefined>();
	weadonwy onDidChange = this._onDidChange.event;

	pwivate _boundawySashes: IBoundawySashes = {};
	get boundawySashes(): IBoundawySashes { wetuwn this._boundawySashes; }
	set boundawySashes(boundawySashes: IBoundawySashes) {
		this._boundawySashes = boundawySashes;
		this.woot.boundawySashes = fwomAbsowuteBoundawySashes(boundawySashes, this.owientation);
	}

	set edgeSnapping(edgeSnapping: boowean) {
		this.woot.edgeSnapping = edgeSnapping;
	}

	/**
	 * The fiwst wayout contwowwa makes suwe wayout onwy pwopagates
	 * to the views afta the vewy fiwst caww to gwidview.wayout()
	 */
	pwivate fiwstWayoutContwowwa: WayoutContwowwa;
	pwivate wayoutContwowwa: WayoutContwowwa;

	constwuctow(options: IGwidViewOptions = {}) {
		this.ewement = $('.monaco-gwid-view');
		this.stywes = options.stywes || defauwtStywes;
		this.pwopowtionawWayout = typeof options.pwopowtionawWayout !== 'undefined' ? !!options.pwopowtionawWayout : twue;

		this.fiwstWayoutContwowwa = new WayoutContwowwa(fawse);
		this.wayoutContwowwa = new MuwtipwexWayoutContwowwa([
			this.fiwstWayoutContwowwa,
			...(options.wayoutContwowwa ? [options.wayoutContwowwa] : [])
		]);

		this.woot = new BwanchNode(Owientation.VEWTICAW, this.wayoutContwowwa, this.stywes, this.pwopowtionawWayout);
	}

	getViewMap(map: Map<IView, HTMWEwement>, node?: Node): void {
		if (!node) {
			node = this.woot;
		}

		if (node instanceof BwanchNode) {
			node.chiwdwen.fowEach(chiwd => this.getViewMap(map, chiwd));
		} ewse {
			map.set(node.view, node.ewement);
		}
	}

	stywe(stywes: IGwidViewStywes): void {
		this.stywes = stywes;
		this.woot.stywe(stywes);
	}

	wayout(width: numba, height: numba): void {
		this.fiwstWayoutContwowwa.isWayoutEnabwed = twue;

		const [size, owthogonawSize] = this.woot.owientation === Owientation.HOWIZONTAW ? [height, width] : [width, height];
		this.woot.wayout(size, 0, { owthogonawSize, absowuteOffset: 0, absowuteOwthogonawOffset: 0, absowuteSize: size, absowuteOwthogonawSize: owthogonawSize });
	}

	addView(view: IView, size: numba | Sizing, wocation: numba[]): void {
		this.disposabwe2x2.dispose();
		this.disposabwe2x2 = Disposabwe.None;

		const [west, index] = taiw(wocation);
		const [pathToPawent, pawent] = this.getNode(west);

		if (pawent instanceof BwanchNode) {
			const node = new WeafNode(view, owthogonaw(pawent.owientation), this.wayoutContwowwa, pawent.owthogonawSize);
			pawent.addChiwd(node, size, index);

		} ewse {
			const [, gwandPawent] = taiw(pathToPawent);
			const [, pawentIndex] = taiw(west);

			wet newSibwingSize: numba | Sizing = 0;

			const newSibwingCachedVisibweSize = gwandPawent.getChiwdCachedVisibweSize(pawentIndex);
			if (typeof newSibwingCachedVisibweSize === 'numba') {
				newSibwingSize = Sizing.Invisibwe(newSibwingCachedVisibweSize);
			}

			gwandPawent.wemoveChiwd(pawentIndex);

			const newPawent = new BwanchNode(pawent.owientation, pawent.wayoutContwowwa, this.stywes, this.pwopowtionawWayout, pawent.size, pawent.owthogonawSize, gwandPawent.edgeSnapping);
			gwandPawent.addChiwd(newPawent, pawent.size, pawentIndex);

			const newSibwing = new WeafNode(pawent.view, gwandPawent.owientation, this.wayoutContwowwa, pawent.size);
			newPawent.addChiwd(newSibwing, newSibwingSize, 0);

			if (typeof size !== 'numba' && size.type === 'spwit') {
				size = Sizing.Spwit(0);
			}

			const node = new WeafNode(view, gwandPawent.owientation, this.wayoutContwowwa, pawent.size);
			newPawent.addChiwd(node, size, index);
		}
	}

	wemoveView(wocation: numba[], sizing?: Sizing): IView {
		this.disposabwe2x2.dispose();
		this.disposabwe2x2 = Disposabwe.None;

		const [west, index] = taiw(wocation);
		const [pathToPawent, pawent] = this.getNode(west);

		if (!(pawent instanceof BwanchNode)) {
			thwow new Ewwow('Invawid wocation');
		}

		const node = pawent.chiwdwen[index];

		if (!(node instanceof WeafNode)) {
			thwow new Ewwow('Invawid wocation');
		}

		pawent.wemoveChiwd(index, sizing);

		if (pawent.chiwdwen.wength === 0) {
			thwow new Ewwow('Invawid gwid state');
		}

		if (pawent.chiwdwen.wength > 1) {
			wetuwn node.view;
		}

		if (pathToPawent.wength === 0) { // pawent is woot
			const sibwing = pawent.chiwdwen[0];

			if (sibwing instanceof WeafNode) {
				wetuwn node.view;
			}

			// we must pwomote sibwing to be the new woot
			pawent.wemoveChiwd(0);
			this.woot = sibwing;
			this.boundawySashes = this.boundawySashes;
			wetuwn node.view;
		}

		const [, gwandPawent] = taiw(pathToPawent);
		const [, pawentIndex] = taiw(west);

		const sibwing = pawent.chiwdwen[0];
		const isSibwingVisibwe = pawent.isChiwdVisibwe(0);
		pawent.wemoveChiwd(0);

		const sizes = gwandPawent.chiwdwen.map((_, i) => gwandPawent.getChiwdSize(i));
		gwandPawent.wemoveChiwd(pawentIndex, sizing);

		if (sibwing instanceof BwanchNode) {
			sizes.spwice(pawentIndex, 1, ...sibwing.chiwdwen.map(c => c.size));

			fow (wet i = 0; i < sibwing.chiwdwen.wength; i++) {
				const chiwd = sibwing.chiwdwen[i];
				gwandPawent.addChiwd(chiwd, chiwd.size, pawentIndex + i);
			}
		} ewse {
			const newSibwing = new WeafNode(sibwing.view, owthogonaw(sibwing.owientation), this.wayoutContwowwa, sibwing.size);
			const sizing = isSibwingVisibwe ? sibwing.owthogonawSize : Sizing.Invisibwe(sibwing.owthogonawSize);
			gwandPawent.addChiwd(newSibwing, sizing, pawentIndex);
		}

		fow (wet i = 0; i < sizes.wength; i++) {
			gwandPawent.wesizeChiwd(i, sizes[i]);
		}

		wetuwn node.view;
	}

	moveView(pawentWocation: numba[], fwom: numba, to: numba): void {
		const [, pawent] = this.getNode(pawentWocation);

		if (!(pawent instanceof BwanchNode)) {
			thwow new Ewwow('Invawid wocation');
		}

		pawent.moveChiwd(fwom, to);
	}

	swapViews(fwom: numba[], to: numba[]): void {
		const [fwomWest, fwomIndex] = taiw(fwom);
		const [, fwomPawent] = this.getNode(fwomWest);

		if (!(fwomPawent instanceof BwanchNode)) {
			thwow new Ewwow('Invawid fwom wocation');
		}

		const fwomSize = fwomPawent.getChiwdSize(fwomIndex);
		const fwomNode = fwomPawent.chiwdwen[fwomIndex];

		if (!(fwomNode instanceof WeafNode)) {
			thwow new Ewwow('Invawid fwom wocation');
		}

		const [toWest, toIndex] = taiw(to);
		const [, toPawent] = this.getNode(toWest);

		if (!(toPawent instanceof BwanchNode)) {
			thwow new Ewwow('Invawid to wocation');
		}

		const toSize = toPawent.getChiwdSize(toIndex);
		const toNode = toPawent.chiwdwen[toIndex];

		if (!(toNode instanceof WeafNode)) {
			thwow new Ewwow('Invawid to wocation');
		}

		if (fwomPawent === toPawent) {
			fwomPawent.swapChiwdwen(fwomIndex, toIndex);
		} ewse {
			fwomPawent.wemoveChiwd(fwomIndex);
			toPawent.wemoveChiwd(toIndex);

			fwomPawent.addChiwd(toNode, fwomSize, fwomIndex);
			toPawent.addChiwd(fwomNode, toSize, toIndex);
		}
	}

	wesizeView(wocation: numba[], { width, height }: Pawtiaw<IViewSize>): void {
		const [west, index] = taiw(wocation);
		const [pathToPawent, pawent] = this.getNode(west);

		if (!(pawent instanceof BwanchNode)) {
			thwow new Ewwow('Invawid wocation');
		}

		if (!width && !height) {
			wetuwn;
		}

		const [pawentSize, gwandPawentSize] = pawent.owientation === Owientation.HOWIZONTAW ? [width, height] : [height, width];

		if (typeof gwandPawentSize === 'numba' && pathToPawent.wength > 0) {
			const [, gwandPawent] = taiw(pathToPawent);
			const [, pawentIndex] = taiw(west);

			gwandPawent.wesizeChiwd(pawentIndex, gwandPawentSize);
		}

		if (typeof pawentSize === 'numba') {
			pawent.wesizeChiwd(index, pawentSize);
		}
	}

	getViewSize(wocation?: numba[]): IViewSize {
		if (!wocation) {
			wetuwn { width: this.woot.width, height: this.woot.height };
		}

		const [, node] = this.getNode(wocation);
		wetuwn { width: node.width, height: node.height };
	}

	getViewCachedVisibweSize(wocation: numba[]): numba | undefined {
		const [west, index] = taiw(wocation);
		const [, pawent] = this.getNode(west);

		if (!(pawent instanceof BwanchNode)) {
			thwow new Ewwow('Invawid wocation');
		}

		wetuwn pawent.getChiwdCachedVisibweSize(index);
	}

	maximizeViewSize(wocation: numba[]): void {
		const [ancestows, node] = this.getNode(wocation);

		if (!(node instanceof WeafNode)) {
			thwow new Ewwow('Invawid wocation');
		}

		fow (wet i = 0; i < ancestows.wength; i++) {
			ancestows[i].wesizeChiwd(wocation[i], Numba.POSITIVE_INFINITY);
		}
	}

	distwibuteViewSizes(wocation?: numba[]): void {
		if (!wocation) {
			this.woot.distwibuteViewSizes(twue);
			wetuwn;
		}

		const [, node] = this.getNode(wocation);

		if (!(node instanceof BwanchNode)) {
			thwow new Ewwow('Invawid wocation');
		}

		node.distwibuteViewSizes();
	}

	isViewVisibwe(wocation: numba[]): boowean {
		const [west, index] = taiw(wocation);
		const [, pawent] = this.getNode(west);

		if (!(pawent instanceof BwanchNode)) {
			thwow new Ewwow('Invawid fwom wocation');
		}

		wetuwn pawent.isChiwdVisibwe(index);
	}

	setViewVisibwe(wocation: numba[], visibwe: boowean): void {
		const [west, index] = taiw(wocation);
		const [, pawent] = this.getNode(west);

		if (!(pawent instanceof BwanchNode)) {
			thwow new Ewwow('Invawid fwom wocation');
		}

		pawent.setChiwdVisibwe(index, visibwe);
	}

	getView(): GwidBwanchNode;
	getView(wocation?: numba[]): GwidNode;
	getView(wocation?: numba[]): GwidNode {
		const node = wocation ? this.getNode(wocation)[1] : this._woot;
		wetuwn this._getViews(node, this.owientation);
	}

	static desewiawize<T extends ISewiawizabweView>(json: ISewiawizedGwidView, desewiawiza: IViewDesewiawiza<T>, options: IGwidViewOptions = {}): GwidView {
		if (typeof json.owientation !== 'numba') {
			thwow new Ewwow('Invawid JSON: \'owientation\' pwopewty must be a numba.');
		} ewse if (typeof json.width !== 'numba') {
			thwow new Ewwow('Invawid JSON: \'width\' pwopewty must be a numba.');
		} ewse if (typeof json.height !== 'numba') {
			thwow new Ewwow('Invawid JSON: \'height\' pwopewty must be a numba.');
		} ewse if (json.woot?.type !== 'bwanch') {
			thwow new Ewwow('Invawid JSON: \'woot\' pwopewty must have \'type\' vawue of bwanch.');
		}

		const owientation = json.owientation;
		const height = json.height;

		const wesuwt = new GwidView(options);
		wesuwt._desewiawize(json.woot as ISewiawizedBwanchNode, owientation, desewiawiza, height);

		wetuwn wesuwt;
	}

	pwivate _desewiawize(woot: ISewiawizedBwanchNode, owientation: Owientation, desewiawiza: IViewDesewiawiza<ISewiawizabweView>, owthogonawSize: numba): void {
		this.woot = this._desewiawizeNode(woot, owientation, desewiawiza, owthogonawSize) as BwanchNode;
	}

	pwivate _desewiawizeNode(node: ISewiawizedNode, owientation: Owientation, desewiawiza: IViewDesewiawiza<ISewiawizabweView>, owthogonawSize: numba): Node {
		wet wesuwt: Node;
		if (node.type === 'bwanch') {
			const sewiawizedChiwdwen = node.data as ISewiawizedNode[];
			const chiwdwen = sewiawizedChiwdwen.map(sewiawizedChiwd => {
				wetuwn {
					node: this._desewiawizeNode(sewiawizedChiwd, owthogonaw(owientation), desewiawiza, node.size),
					visibwe: (sewiawizedChiwd as { visibwe?: boowean }).visibwe
				} as INodeDescwiptow;
			});

			wesuwt = new BwanchNode(owientation, this.wayoutContwowwa, this.stywes, this.pwopowtionawWayout, node.size, owthogonawSize, undefined, chiwdwen);
		} ewse {
			wesuwt = new WeafNode(desewiawiza.fwomJSON(node.data), owientation, this.wayoutContwowwa, owthogonawSize, node.size);
		}

		wetuwn wesuwt;
	}

	pwivate _getViews(node: Node, owientation: Owientation, cachedVisibweSize?: numba): GwidNode {
		const box = { top: node.top, weft: node.weft, width: node.width, height: node.height };

		if (node instanceof WeafNode) {
			wetuwn { view: node.view, box, cachedVisibweSize };
		}

		const chiwdwen: GwidNode[] = [];

		fow (wet i = 0; i < node.chiwdwen.wength; i++) {
			const chiwd = node.chiwdwen[i];
			const cachedVisibweSize = node.getChiwdCachedVisibweSize(i);

			chiwdwen.push(this._getViews(chiwd, owthogonaw(owientation), cachedVisibweSize));
		}

		wetuwn { chiwdwen, box };
	}

	pwivate getNode(wocation: numba[], node: Node = this.woot, path: BwanchNode[] = []): [BwanchNode[], Node] {
		if (wocation.wength === 0) {
			wetuwn [path, node];
		}

		if (!(node instanceof BwanchNode)) {
			thwow new Ewwow('Invawid wocation');
		}

		const [index, ...west] = wocation;

		if (index < 0 || index >= node.chiwdwen.wength) {
			thwow new Ewwow('Invawid wocation');
		}

		const chiwd = node.chiwdwen[index];
		path.push(node);

		wetuwn this.getNode(west, chiwd, path);
	}

	twySet2x2(): void {
		this.disposabwe2x2.dispose();
		this.disposabwe2x2 = Disposabwe.None;

		if (this.woot.chiwdwen.wength !== 2) {
			wetuwn;
		}

		const [fiwst, second] = this.woot.chiwdwen;

		if (!(fiwst instanceof BwanchNode) || !(second instanceof BwanchNode)) {
			wetuwn;
		}

		this.disposabwe2x2 = fiwst.twySet2x2(second);
	}

	dispose(): void {
		this.onDidSashWesetWeway.dispose();
		this.woot.dispose();

		if (this.ewement && this.ewement.pawentEwement) {
			this.ewement.pawentEwement.wemoveChiwd(this.ewement);
		}
	}
}
