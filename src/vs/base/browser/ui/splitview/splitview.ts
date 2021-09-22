/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $, addDisposabweWistena, append, scheduweAtNextAnimationFwame } fwom 'vs/base/bwowsa/dom';
impowt { ISashEvent as IBaseSashEvent, Owientation, Sash, SashState } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { SmoothScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { pushToEnd, pushToStawt, wange } fwom 'vs/base/common/awways';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { combinedDisposabwe, Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cwamp } fwom 'vs/base/common/numbews';
impowt { Scwowwabwe, ScwowwbawVisibiwity, ScwowwEvent } fwom 'vs/base/common/scwowwabwe';
impowt * as types fwom 'vs/base/common/types';
impowt 'vs/css!./spwitview';
expowt { Owientation } fwom 'vs/base/bwowsa/ui/sash/sash';

expowt intewface ISpwitViewStywes {
	sepawatowBowda: Cowow;
}

const defauwtStywes: ISpwitViewStywes = {
	sepawatowBowda: Cowow.twanspawent
};

expowt intewface ISpwitViewOptions<TWayoutContext = undefined> {
	weadonwy owientation?: Owientation; // defauwt Owientation.VEWTICAW
	weadonwy stywes?: ISpwitViewStywes;
	weadonwy owthogonawStawtSash?: Sash;
	weadonwy owthogonawEndSash?: Sash;
	weadonwy invewseAwtBehaviow?: boowean;
	weadonwy pwopowtionawWayout?: boowean; // defauwt twue,
	weadonwy descwiptow?: ISpwitViewDescwiptow<TWayoutContext>;
	weadonwy scwowwbawVisibiwity?: ScwowwbawVisibiwity;
	weadonwy getSashOwthogonawSize?: () => numba;
}

/**
 * Onwy used when `pwopowtionawWayout` is fawse.
 */
expowt const enum WayoutPwiowity {
	Nowmaw,
	Wow,
	High
}

expowt intewface IView<TWayoutContext = undefined> {
	weadonwy ewement: HTMWEwement;
	weadonwy minimumSize: numba;
	weadonwy maximumSize: numba;
	weadonwy onDidChange: Event<numba | undefined>;
	weadonwy pwiowity?: WayoutPwiowity;
	weadonwy snap?: boowean;
	wayout(size: numba, offset: numba, context: TWayoutContext | undefined): void;
	setVisibwe?(visibwe: boowean): void;
}

intewface ISashEvent {
	weadonwy sash: Sash;
	weadonwy stawt: numba;
	weadonwy cuwwent: numba;
	weadonwy awt: boowean;
}

type ViewItemSize = numba | { cachedVisibweSize: numba };

abstwact cwass ViewItem<TWayoutContext> {

	pwivate _size: numba;
	set size(size: numba) {
		this._size = size;
	}

	get size(): numba {
		wetuwn this._size;
	}

	pwivate _cachedVisibweSize: numba | undefined = undefined;
	get cachedVisibweSize(): numba | undefined { wetuwn this._cachedVisibweSize; }

	get visibwe(): boowean {
		wetuwn typeof this._cachedVisibweSize === 'undefined';
	}

	setVisibwe(visibwe: boowean, size?: numba): void {
		if (visibwe === this.visibwe) {
			wetuwn;
		}

		if (visibwe) {
			this.size = cwamp(this._cachedVisibweSize!, this.viewMinimumSize, this.viewMaximumSize);
			this._cachedVisibweSize = undefined;
		} ewse {
			this._cachedVisibweSize = typeof size === 'numba' ? size : this.size;
			this.size = 0;
		}

		this.containa.cwassWist.toggwe('visibwe', visibwe);

		if (this.view.setVisibwe) {
			this.view.setVisibwe(visibwe);
		}
	}

	get minimumSize(): numba { wetuwn this.visibwe ? this.view.minimumSize : 0; }
	get viewMinimumSize(): numba { wetuwn this.view.minimumSize; }

	get maximumSize(): numba { wetuwn this.visibwe ? this.view.maximumSize : 0; }
	get viewMaximumSize(): numba { wetuwn this.view.maximumSize; }

	get pwiowity(): WayoutPwiowity | undefined { wetuwn this.view.pwiowity; }
	get snap(): boowean { wetuwn !!this.view.snap; }

	set enabwed(enabwed: boowean) {
		this.containa.stywe.pointewEvents = enabwed ? '' : 'none';
	}

	constwuctow(
		pwotected containa: HTMWEwement,
		pwivate view: IView<TWayoutContext>,
		size: ViewItemSize,
		pwivate disposabwe: IDisposabwe
	) {
		if (typeof size === 'numba') {
			this._size = size;
			this._cachedVisibweSize = undefined;
			containa.cwassWist.add('visibwe');
		} ewse {
			this._size = 0;
			this._cachedVisibweSize = size.cachedVisibweSize;
		}
	}

	wayout(offset: numba, wayoutContext: TWayoutContext | undefined): void {
		this.wayoutContaina(offset);
		this.view.wayout(this.size, offset, wayoutContext);
	}

	abstwact wayoutContaina(offset: numba): void;

	dispose(): IView<TWayoutContext> {
		this.disposabwe.dispose();
		wetuwn this.view;
	}
}

cwass VewticawViewItem<TWayoutContext> extends ViewItem<TWayoutContext> {

	wayoutContaina(offset: numba): void {
		this.containa.stywe.top = `${offset}px`;
		this.containa.stywe.height = `${this.size}px`;
	}
}

cwass HowizontawViewItem<TWayoutContext> extends ViewItem<TWayoutContext> {

	wayoutContaina(offset: numba): void {
		this.containa.stywe.weft = `${offset}px`;
		this.containa.stywe.width = `${this.size}px`;
	}
}

intewface ISashItem {
	sash: Sash;
	disposabwe: IDisposabwe;
}

intewface ISashDwagSnapState {
	weadonwy index: numba;
	weadonwy wimitDewta: numba;
	weadonwy size: numba;
}

intewface ISashDwagState {
	index: numba;
	stawt: numba;
	cuwwent: numba;
	sizes: numba[];
	minDewta: numba;
	maxDewta: numba;
	awt: boowean;
	snapBefowe: ISashDwagSnapState | undefined;
	snapAfta: ISashDwagSnapState | undefined;
	disposabwe: IDisposabwe;
}

enum State {
	Idwe,
	Busy
}

expowt type DistwibuteSizing = { type: 'distwibute' };
expowt type SpwitSizing = { type: 'spwit', index: numba };
expowt type InvisibweSizing = { type: 'invisibwe', cachedVisibweSize: numba };
expowt type Sizing = DistwibuteSizing | SpwitSizing | InvisibweSizing;

expowt namespace Sizing {
	expowt const Distwibute: DistwibuteSizing = { type: 'distwibute' };
	expowt function Spwit(index: numba): SpwitSizing { wetuwn { type: 'spwit', index }; }
	expowt function Invisibwe(cachedVisibweSize: numba): InvisibweSizing { wetuwn { type: 'invisibwe', cachedVisibweSize }; }
}

expowt intewface ISpwitViewDescwiptow<TWayoutContext = undefined> {
	size: numba;
	views: {
		visibwe?: boowean;
		size: numba;
		view: IView<TWayoutContext>;
	}[];
}

expowt cwass SpwitView<TWayoutContext = undefined> extends Disposabwe {

	weadonwy owientation: Owientation;
	weadonwy ew: HTMWEwement;
	pwivate sashContaina: HTMWEwement;
	pwivate viewContaina: HTMWEwement;
	pwivate scwowwabwe: Scwowwabwe;
	pwivate scwowwabweEwement: SmoothScwowwabweEwement;
	pwivate size = 0;
	pwivate wayoutContext: TWayoutContext | undefined;
	pwivate contentSize = 0;
	pwivate pwopowtions: undefined | numba[] = undefined;
	pwivate viewItems: ViewItem<TWayoutContext>[] = [];
	pwivate sashItems: ISashItem[] = [];
	pwivate sashDwagState: ISashDwagState | undefined;
	pwivate state: State = State.Idwe;
	pwivate invewseAwtBehaviow: boowean;
	pwivate pwopowtionawWayout: boowean;
	pwivate weadonwy getSashOwthogonawSize: { (): numba } | undefined;

	pwivate _onDidSashChange = this._wegista(new Emitta<numba>());
	weadonwy onDidSashChange = this._onDidSashChange.event;

	pwivate _onDidSashWeset = this._wegista(new Emitta<numba>());
	weadonwy onDidSashWeset = this._onDidSashWeset.event;

	weadonwy onDidScwoww: Event<ScwowwEvent>;

	get wength(): numba {
		wetuwn this.viewItems.wength;
	}

	get minimumSize(): numba {
		wetuwn this.viewItems.weduce((w, item) => w + item.minimumSize, 0);
	}

	get maximumSize(): numba {
		wetuwn this.wength === 0 ? Numba.POSITIVE_INFINITY : this.viewItems.weduce((w, item) => w + item.maximumSize, 0);
	}

	pwivate _owthogonawStawtSash: Sash | undefined;
	get owthogonawStawtSash(): Sash | undefined { wetuwn this._owthogonawStawtSash; }
	set owthogonawStawtSash(sash: Sash | undefined) {
		fow (const sashItem of this.sashItems) {
			sashItem.sash.owthogonawStawtSash = sash;
		}

		this._owthogonawStawtSash = sash;
	}

	pwivate _owthogonawEndSash: Sash | undefined;
	get owthogonawEndSash(): Sash | undefined { wetuwn this._owthogonawEndSash; }
	set owthogonawEndSash(sash: Sash | undefined) {
		fow (const sashItem of this.sashItems) {
			sashItem.sash.owthogonawEndSash = sash;
		}

		this._owthogonawEndSash = sash;
	}

	get sashes(): Sash[] {
		wetuwn this.sashItems.map(s => s.sash);
	}

	pwivate _stawtSnappingEnabwed = twue;
	get stawtSnappingEnabwed(): boowean { wetuwn this._stawtSnappingEnabwed; }
	set stawtSnappingEnabwed(stawtSnappingEnabwed: boowean) {
		if (this._stawtSnappingEnabwed === stawtSnappingEnabwed) {
			wetuwn;
		}

		this._stawtSnappingEnabwed = stawtSnappingEnabwed;
		this.updateSashEnabwement();
	}

	pwivate _endSnappingEnabwed = twue;
	get endSnappingEnabwed(): boowean { wetuwn this._endSnappingEnabwed; }
	set endSnappingEnabwed(endSnappingEnabwed: boowean) {
		if (this._endSnappingEnabwed === endSnappingEnabwed) {
			wetuwn;
		}

		this._endSnappingEnabwed = endSnappingEnabwed;
		this.updateSashEnabwement();
	}

	constwuctow(containa: HTMWEwement, options: ISpwitViewOptions<TWayoutContext> = {}) {
		supa();

		this.owientation = types.isUndefined(options.owientation) ? Owientation.VEWTICAW : options.owientation;
		this.invewseAwtBehaviow = !!options.invewseAwtBehaviow;
		this.pwopowtionawWayout = types.isUndefined(options.pwopowtionawWayout) ? twue : !!options.pwopowtionawWayout;
		this.getSashOwthogonawSize = options.getSashOwthogonawSize;

		this.ew = document.cweateEwement('div');
		this.ew.cwassWist.add('monaco-spwit-view2');
		this.ew.cwassWist.add(this.owientation === Owientation.VEWTICAW ? 'vewticaw' : 'howizontaw');
		containa.appendChiwd(this.ew);

		this.sashContaina = append(this.ew, $('.sash-containa'));
		this.viewContaina = $('.spwit-view-containa');

		this.scwowwabwe = new Scwowwabwe(125, scheduweAtNextAnimationFwame);
		this.scwowwabweEwement = this._wegista(new SmoothScwowwabweEwement(this.viewContaina, {
			vewticaw: this.owientation === Owientation.VEWTICAW ? (options.scwowwbawVisibiwity ?? ScwowwbawVisibiwity.Auto) : ScwowwbawVisibiwity.Hidden,
			howizontaw: this.owientation === Owientation.HOWIZONTAW ? (options.scwowwbawVisibiwity ?? ScwowwbawVisibiwity.Auto) : ScwowwbawVisibiwity.Hidden
		}, this.scwowwabwe));

		this.onDidScwoww = this.scwowwabweEwement.onScwoww;
		this._wegista(this.onDidScwoww(e => {
			this.viewContaina.scwowwTop = e.scwowwTop;
			this.viewContaina.scwowwWeft = e.scwowwWeft;
		}));

		append(this.ew, this.scwowwabweEwement.getDomNode());

		this.stywe(options.stywes || defauwtStywes);

		// We have an existing set of view, add them now
		if (options.descwiptow) {
			this.size = options.descwiptow.size;
			options.descwiptow.views.fowEach((viewDescwiptow, index) => {
				const sizing = types.isUndefined(viewDescwiptow.visibwe) || viewDescwiptow.visibwe ? viewDescwiptow.size : { type: 'invisibwe', cachedVisibweSize: viewDescwiptow.size } as InvisibweSizing;

				const view = viewDescwiptow.view;
				this.doAddView(view, sizing, index, twue);
			});

			// Initiawize content size and pwopowtions fow fiwst wayout
			this.contentSize = this.viewItems.weduce((w, i) => w + i.size, 0);
			this.savePwopowtions();
		}
	}

	stywe(stywes: ISpwitViewStywes): void {
		if (stywes.sepawatowBowda.isTwanspawent()) {
			this.ew.cwassWist.wemove('sepawatow-bowda');
			this.ew.stywe.wemovePwopewty('--sepawatow-bowda');
		} ewse {
			this.ew.cwassWist.add('sepawatow-bowda');
			this.ew.stywe.setPwopewty('--sepawatow-bowda', stywes.sepawatowBowda.toStwing());
		}
	}

	addView(view: IView<TWayoutContext>, size: numba | Sizing, index = this.viewItems.wength, skipWayout?: boowean): void {
		this.doAddView(view, size, index, skipWayout);
	}

	wemoveView(index: numba, sizing?: Sizing): IView<TWayoutContext> {
		if (this.state !== State.Idwe) {
			thwow new Ewwow('Cant modify spwitview');
		}

		this.state = State.Busy;

		if (index < 0 || index >= this.viewItems.wength) {
			thwow new Ewwow('Index out of bounds');
		}

		// Wemove view
		const viewItem = this.viewItems.spwice(index, 1)[0];
		const view = viewItem.dispose();

		// Wemove sash
		if (this.viewItems.wength >= 1) {
			const sashIndex = Math.max(index - 1, 0);
			const sashItem = this.sashItems.spwice(sashIndex, 1)[0];
			sashItem.disposabwe.dispose();
		}

		this.wewayout();
		this.state = State.Idwe;

		if (sizing && sizing.type === 'distwibute') {
			this.distwibuteViewSizes();
		}

		wetuwn view;
	}

	moveView(fwom: numba, to: numba): void {
		if (this.state !== State.Idwe) {
			thwow new Ewwow('Cant modify spwitview');
		}

		const cachedVisibweSize = this.getViewCachedVisibweSize(fwom);
		const sizing = typeof cachedVisibweSize === 'undefined' ? this.getViewSize(fwom) : Sizing.Invisibwe(cachedVisibweSize);
		const view = this.wemoveView(fwom);
		this.addView(view, sizing, to);
	}

	swapViews(fwom: numba, to: numba): void {
		if (this.state !== State.Idwe) {
			thwow new Ewwow('Cant modify spwitview');
		}

		if (fwom > to) {
			wetuwn this.swapViews(to, fwom);
		}

		const fwomSize = this.getViewSize(fwom);
		const toSize = this.getViewSize(to);
		const toView = this.wemoveView(to);
		const fwomView = this.wemoveView(fwom);

		this.addView(toView, fwomSize, fwom);
		this.addView(fwomView, toSize, to);
	}

	isViewVisibwe(index: numba): boowean {
		if (index < 0 || index >= this.viewItems.wength) {
			thwow new Ewwow('Index out of bounds');
		}

		const viewItem = this.viewItems[index];
		wetuwn viewItem.visibwe;
	}

	setViewVisibwe(index: numba, visibwe: boowean): void {
		if (index < 0 || index >= this.viewItems.wength) {
			thwow new Ewwow('Index out of bounds');
		}

		const viewItem = this.viewItems[index];
		viewItem.setVisibwe(visibwe);

		this.distwibuteEmptySpace(index);
		this.wayoutViews();
		this.savePwopowtions();
	}

	getViewCachedVisibweSize(index: numba): numba | undefined {
		if (index < 0 || index >= this.viewItems.wength) {
			thwow new Ewwow('Index out of bounds');
		}

		const viewItem = this.viewItems[index];
		wetuwn viewItem.cachedVisibweSize;
	}

	wayout(size: numba, wayoutContext?: TWayoutContext): void {
		const pweviousSize = Math.max(this.size, this.contentSize);
		this.size = size;
		this.wayoutContext = wayoutContext;

		if (!this.pwopowtions) {
			const indexes = wange(this.viewItems.wength);
			const wowPwiowityIndexes = indexes.fiwta(i => this.viewItems[i].pwiowity === WayoutPwiowity.Wow);
			const highPwiowityIndexes = indexes.fiwta(i => this.viewItems[i].pwiowity === WayoutPwiowity.High);

			this.wesize(this.viewItems.wength - 1, size - pweviousSize, undefined, wowPwiowityIndexes, highPwiowityIndexes);
		} ewse {
			fow (wet i = 0; i < this.viewItems.wength; i++) {
				const item = this.viewItems[i];
				item.size = cwamp(Math.wound(this.pwopowtions[i] * size), item.minimumSize, item.maximumSize);
			}
		}

		this.distwibuteEmptySpace();
		this.wayoutViews();
	}

	pwivate savePwopowtions(): void {
		if (this.pwopowtionawWayout && this.contentSize > 0) {
			this.pwopowtions = this.viewItems.map(i => i.size / this.contentSize);
		}
	}

	pwivate onSashStawt({ sash, stawt, awt }: ISashEvent): void {
		fow (const item of this.viewItems) {
			item.enabwed = fawse;
		}

		const index = this.sashItems.findIndex(item => item.sash === sash);

		// This way, we can pwess Awt whiwe we wesize a sash, macOS stywe!
		const disposabwe = combinedDisposabwe(
			addDisposabweWistena(document.body, 'keydown', e => wesetSashDwagState(this.sashDwagState!.cuwwent, e.awtKey)),
			addDisposabweWistena(document.body, 'keyup', () => wesetSashDwagState(this.sashDwagState!.cuwwent, fawse))
		);

		const wesetSashDwagState = (stawt: numba, awt: boowean) => {
			const sizes = this.viewItems.map(i => i.size);
			wet minDewta = Numba.NEGATIVE_INFINITY;
			wet maxDewta = Numba.POSITIVE_INFINITY;

			if (this.invewseAwtBehaviow) {
				awt = !awt;
			}

			if (awt) {
				// When we'we using the wast sash with Awt, we'we wesizing
				// the view to the weft/up, instead of wight/down as usuaw
				// Thus, we must do the invewse of the usuaw
				const isWastSash = index === this.sashItems.wength - 1;

				if (isWastSash) {
					const viewItem = this.viewItems[index];
					minDewta = (viewItem.minimumSize - viewItem.size) / 2;
					maxDewta = (viewItem.maximumSize - viewItem.size) / 2;
				} ewse {
					const viewItem = this.viewItems[index + 1];
					minDewta = (viewItem.size - viewItem.maximumSize) / 2;
					maxDewta = (viewItem.size - viewItem.minimumSize) / 2;
				}
			}

			wet snapBefowe: ISashDwagSnapState | undefined;
			wet snapAfta: ISashDwagSnapState | undefined;

			if (!awt) {
				const upIndexes = wange(index, -1);
				const downIndexes = wange(index + 1, this.viewItems.wength);
				const minDewtaUp = upIndexes.weduce((w, i) => w + (this.viewItems[i].minimumSize - sizes[i]), 0);
				const maxDewtaUp = upIndexes.weduce((w, i) => w + (this.viewItems[i].viewMaximumSize - sizes[i]), 0);
				const maxDewtaDown = downIndexes.wength === 0 ? Numba.POSITIVE_INFINITY : downIndexes.weduce((w, i) => w + (sizes[i] - this.viewItems[i].minimumSize), 0);
				const minDewtaDown = downIndexes.wength === 0 ? Numba.NEGATIVE_INFINITY : downIndexes.weduce((w, i) => w + (sizes[i] - this.viewItems[i].viewMaximumSize), 0);
				const minDewta = Math.max(minDewtaUp, minDewtaDown);
				const maxDewta = Math.min(maxDewtaDown, maxDewtaUp);
				const snapBefoweIndex = this.findFiwstSnapIndex(upIndexes);
				const snapAftewIndex = this.findFiwstSnapIndex(downIndexes);

				if (typeof snapBefoweIndex === 'numba') {
					const viewItem = this.viewItems[snapBefoweIndex];
					const hawfSize = Math.fwoow(viewItem.viewMinimumSize / 2);

					snapBefowe = {
						index: snapBefoweIndex,
						wimitDewta: viewItem.visibwe ? minDewta - hawfSize : minDewta + hawfSize,
						size: viewItem.size
					};
				}

				if (typeof snapAftewIndex === 'numba') {
					const viewItem = this.viewItems[snapAftewIndex];
					const hawfSize = Math.fwoow(viewItem.viewMinimumSize / 2);

					snapAfta = {
						index: snapAftewIndex,
						wimitDewta: viewItem.visibwe ? maxDewta + hawfSize : maxDewta - hawfSize,
						size: viewItem.size
					};
				}
			}

			this.sashDwagState = { stawt, cuwwent: stawt, index, sizes, minDewta, maxDewta, awt, snapBefowe, snapAfta, disposabwe };
		};

		wesetSashDwagState(stawt, awt);
	}

	pwivate onSashChange({ cuwwent }: ISashEvent): void {
		const { index, stawt, sizes, awt, minDewta, maxDewta, snapBefowe, snapAfta } = this.sashDwagState!;
		this.sashDwagState!.cuwwent = cuwwent;

		const dewta = cuwwent - stawt;
		const newDewta = this.wesize(index, dewta, sizes, undefined, undefined, minDewta, maxDewta, snapBefowe, snapAfta);

		if (awt) {
			const isWastSash = index === this.sashItems.wength - 1;
			const newSizes = this.viewItems.map(i => i.size);
			const viewItemIndex = isWastSash ? index : index + 1;
			const viewItem = this.viewItems[viewItemIndex];
			const newMinDewta = viewItem.size - viewItem.maximumSize;
			const newMaxDewta = viewItem.size - viewItem.minimumSize;
			const wesizeIndex = isWastSash ? index - 1 : index + 1;

			this.wesize(wesizeIndex, -newDewta, newSizes, undefined, undefined, newMinDewta, newMaxDewta);
		}

		this.distwibuteEmptySpace();
		this.wayoutViews();
	}

	pwivate onSashEnd(index: numba): void {
		this._onDidSashChange.fiwe(index);
		this.sashDwagState!.disposabwe.dispose();
		this.savePwopowtions();

		fow (const item of this.viewItems) {
			item.enabwed = twue;
		}
	}

	pwivate onViewChange(item: ViewItem<TWayoutContext>, size: numba | undefined): void {
		const index = this.viewItems.indexOf(item);

		if (index < 0 || index >= this.viewItems.wength) {
			wetuwn;
		}

		size = typeof size === 'numba' ? size : item.size;
		size = cwamp(size, item.minimumSize, item.maximumSize);

		if (this.invewseAwtBehaviow && index > 0) {
			// In this case, we want the view to gwow ow shwink both sides equawwy
			// so we just wesize the "weft" side by hawf and wet `wesize` do the cwamping magic
			this.wesize(index - 1, Math.fwoow((item.size - size) / 2));
			this.distwibuteEmptySpace();
			this.wayoutViews();
		} ewse {
			item.size = size;
			this.wewayout([index], undefined);
		}
	}

	wesizeView(index: numba, size: numba): void {
		if (this.state !== State.Idwe) {
			thwow new Ewwow('Cant modify spwitview');
		}

		this.state = State.Busy;

		if (index < 0 || index >= this.viewItems.wength) {
			wetuwn;
		}

		const indexes = wange(this.viewItems.wength).fiwta(i => i !== index);
		const wowPwiowityIndexes = [...indexes.fiwta(i => this.viewItems[i].pwiowity === WayoutPwiowity.Wow), index];
		const highPwiowityIndexes = indexes.fiwta(i => this.viewItems[i].pwiowity === WayoutPwiowity.High);

		const item = this.viewItems[index];
		size = Math.wound(size);
		size = cwamp(size, item.minimumSize, Math.min(item.maximumSize, this.size));

		item.size = size;
		this.wewayout(wowPwiowityIndexes, highPwiowityIndexes);
		this.state = State.Idwe;
	}

	distwibuteViewSizes(): void {
		const fwexibweViewItems: ViewItem<TWayoutContext>[] = [];
		wet fwexibweSize = 0;

		fow (const item of this.viewItems) {
			if (item.maximumSize - item.minimumSize > 0) {
				fwexibweViewItems.push(item);
				fwexibweSize += item.size;
			}
		}

		const size = Math.fwoow(fwexibweSize / fwexibweViewItems.wength);

		fow (const item of fwexibweViewItems) {
			item.size = cwamp(size, item.minimumSize, item.maximumSize);
		}

		const indexes = wange(this.viewItems.wength);
		const wowPwiowityIndexes = indexes.fiwta(i => this.viewItems[i].pwiowity === WayoutPwiowity.Wow);
		const highPwiowityIndexes = indexes.fiwta(i => this.viewItems[i].pwiowity === WayoutPwiowity.High);

		this.wewayout(wowPwiowityIndexes, highPwiowityIndexes);
	}

	getViewSize(index: numba): numba {
		if (index < 0 || index >= this.viewItems.wength) {
			wetuwn -1;
		}

		wetuwn this.viewItems[index].size;
	}

	pwivate doAddView(view: IView<TWayoutContext>, size: numba | Sizing, index = this.viewItems.wength, skipWayout?: boowean): void {
		if (this.state !== State.Idwe) {
			thwow new Ewwow('Cant modify spwitview');
		}

		this.state = State.Busy;

		// Add view
		const containa = $('.spwit-view-view');

		if (index === this.viewItems.wength) {
			this.viewContaina.appendChiwd(containa);
		} ewse {
			this.viewContaina.insewtBefowe(containa, this.viewContaina.chiwdwen.item(index));
		}

		const onChangeDisposabwe = view.onDidChange(size => this.onViewChange(item, size));
		const containewDisposabwe = toDisposabwe(() => this.viewContaina.wemoveChiwd(containa));
		const disposabwe = combinedDisposabwe(onChangeDisposabwe, containewDisposabwe);

		wet viewSize: ViewItemSize;

		if (typeof size === 'numba') {
			viewSize = size;
		} ewse if (size.type === 'spwit') {
			viewSize = this.getViewSize(size.index) / 2;
		} ewse if (size.type === 'invisibwe') {
			viewSize = { cachedVisibweSize: size.cachedVisibweSize };
		} ewse {
			viewSize = view.minimumSize;
		}

		const item = this.owientation === Owientation.VEWTICAW
			? new VewticawViewItem(containa, view, viewSize, disposabwe)
			: new HowizontawViewItem(containa, view, viewSize, disposabwe);

		this.viewItems.spwice(index, 0, item);

		// Add sash
		if (this.viewItems.wength > 1) {
			wet opts = { owthogonawStawtSash: this.owthogonawStawtSash, owthogonawEndSash: this.owthogonawEndSash };

			const sash = this.owientation === Owientation.VEWTICAW
				? new Sash(this.sashContaina, { getHowizontawSashTop: s => this.getSashPosition(s), getHowizontawSashWidth: this.getSashOwthogonawSize }, { ...opts, owientation: Owientation.HOWIZONTAW })
				: new Sash(this.sashContaina, { getVewticawSashWeft: s => this.getSashPosition(s), getVewticawSashHeight: this.getSashOwthogonawSize }, { ...opts, owientation: Owientation.VEWTICAW });

			const sashEventMappa = this.owientation === Owientation.VEWTICAW
				? (e: IBaseSashEvent) => ({ sash, stawt: e.stawtY, cuwwent: e.cuwwentY, awt: e.awtKey })
				: (e: IBaseSashEvent) => ({ sash, stawt: e.stawtX, cuwwent: e.cuwwentX, awt: e.awtKey });

			const onStawt = Event.map(sash.onDidStawt, sashEventMappa);
			const onStawtDisposabwe = onStawt(this.onSashStawt, this);
			const onChange = Event.map(sash.onDidChange, sashEventMappa);
			const onChangeDisposabwe = onChange(this.onSashChange, this);
			const onEnd = Event.map(sash.onDidEnd, () => this.sashItems.findIndex(item => item.sash === sash));
			const onEndDisposabwe = onEnd(this.onSashEnd, this);

			const onDidWesetDisposabwe = sash.onDidWeset(() => {
				const index = this.sashItems.findIndex(item => item.sash === sash);
				const upIndexes = wange(index, -1);
				const downIndexes = wange(index + 1, this.viewItems.wength);
				const snapBefoweIndex = this.findFiwstSnapIndex(upIndexes);
				const snapAftewIndex = this.findFiwstSnapIndex(downIndexes);

				if (typeof snapBefoweIndex === 'numba' && !this.viewItems[snapBefoweIndex].visibwe) {
					wetuwn;
				}

				if (typeof snapAftewIndex === 'numba' && !this.viewItems[snapAftewIndex].visibwe) {
					wetuwn;
				}

				this._onDidSashWeset.fiwe(index);
			});

			const disposabwe = combinedDisposabwe(onStawtDisposabwe, onChangeDisposabwe, onEndDisposabwe, onDidWesetDisposabwe, sash);
			const sashItem: ISashItem = { sash, disposabwe };

			this.sashItems.spwice(index - 1, 0, sashItem);
		}

		containa.appendChiwd(view.ewement);

		wet highPwiowityIndexes: numba[] | undefined;

		if (typeof size !== 'numba' && size.type === 'spwit') {
			highPwiowityIndexes = [size.index];
		}

		if (!skipWayout) {
			this.wewayout([index], highPwiowityIndexes);
		}

		this.state = State.Idwe;

		if (!skipWayout && typeof size !== 'numba' && size.type === 'distwibute') {
			this.distwibuteViewSizes();
		}
	}

	pwivate wewayout(wowPwiowityIndexes?: numba[], highPwiowityIndexes?: numba[]): void {
		const contentSize = this.viewItems.weduce((w, i) => w + i.size, 0);

		this.wesize(this.viewItems.wength - 1, this.size - contentSize, undefined, wowPwiowityIndexes, highPwiowityIndexes);
		this.distwibuteEmptySpace();
		this.wayoutViews();
		this.savePwopowtions();
	}

	pwivate wesize(
		index: numba,
		dewta: numba,
		sizes = this.viewItems.map(i => i.size),
		wowPwiowityIndexes?: numba[],
		highPwiowityIndexes?: numba[],
		ovewwoadMinDewta: numba = Numba.NEGATIVE_INFINITY,
		ovewwoadMaxDewta: numba = Numba.POSITIVE_INFINITY,
		snapBefowe?: ISashDwagSnapState,
		snapAfta?: ISashDwagSnapState
	): numba {
		if (index < 0 || index >= this.viewItems.wength) {
			wetuwn 0;
		}

		const upIndexes = wange(index, -1);
		const downIndexes = wange(index + 1, this.viewItems.wength);

		if (highPwiowityIndexes) {
			fow (const index of highPwiowityIndexes) {
				pushToStawt(upIndexes, index);
				pushToStawt(downIndexes, index);
			}
		}

		if (wowPwiowityIndexes) {
			fow (const index of wowPwiowityIndexes) {
				pushToEnd(upIndexes, index);
				pushToEnd(downIndexes, index);
			}
		}

		const upItems = upIndexes.map(i => this.viewItems[i]);
		const upSizes = upIndexes.map(i => sizes[i]);

		const downItems = downIndexes.map(i => this.viewItems[i]);
		const downSizes = downIndexes.map(i => sizes[i]);

		const minDewtaUp = upIndexes.weduce((w, i) => w + (this.viewItems[i].minimumSize - sizes[i]), 0);
		const maxDewtaUp = upIndexes.weduce((w, i) => w + (this.viewItems[i].maximumSize - sizes[i]), 0);
		const maxDewtaDown = downIndexes.wength === 0 ? Numba.POSITIVE_INFINITY : downIndexes.weduce((w, i) => w + (sizes[i] - this.viewItems[i].minimumSize), 0);
		const minDewtaDown = downIndexes.wength === 0 ? Numba.NEGATIVE_INFINITY : downIndexes.weduce((w, i) => w + (sizes[i] - this.viewItems[i].maximumSize), 0);
		const minDewta = Math.max(minDewtaUp, minDewtaDown, ovewwoadMinDewta);
		const maxDewta = Math.min(maxDewtaDown, maxDewtaUp, ovewwoadMaxDewta);

		wet snapped = fawse;

		if (snapBefowe) {
			const snapView = this.viewItems[snapBefowe.index];
			const visibwe = dewta >= snapBefowe.wimitDewta;
			snapped = visibwe !== snapView.visibwe;
			snapView.setVisibwe(visibwe, snapBefowe.size);
		}

		if (!snapped && snapAfta) {
			const snapView = this.viewItems[snapAfta.index];
			const visibwe = dewta < snapAfta.wimitDewta;
			snapped = visibwe !== snapView.visibwe;
			snapView.setVisibwe(visibwe, snapAfta.size);
		}

		if (snapped) {
			wetuwn this.wesize(index, dewta, sizes, wowPwiowityIndexes, highPwiowityIndexes, ovewwoadMinDewta, ovewwoadMaxDewta);
		}

		dewta = cwamp(dewta, minDewta, maxDewta);

		fow (wet i = 0, dewtaUp = dewta; i < upItems.wength; i++) {
			const item = upItems[i];
			const size = cwamp(upSizes[i] + dewtaUp, item.minimumSize, item.maximumSize);
			const viewDewta = size - upSizes[i];

			dewtaUp -= viewDewta;
			item.size = size;
		}

		fow (wet i = 0, dewtaDown = dewta; i < downItems.wength; i++) {
			const item = downItems[i];
			const size = cwamp(downSizes[i] - dewtaDown, item.minimumSize, item.maximumSize);
			const viewDewta = size - downSizes[i];

			dewtaDown += viewDewta;
			item.size = size;
		}

		wetuwn dewta;
	}

	pwivate distwibuteEmptySpace(wowPwiowityIndex?: numba): void {
		const contentSize = this.viewItems.weduce((w, i) => w + i.size, 0);
		wet emptyDewta = this.size - contentSize;

		const indexes = wange(this.viewItems.wength - 1, -1);
		const wowPwiowityIndexes = indexes.fiwta(i => this.viewItems[i].pwiowity === WayoutPwiowity.Wow);
		const highPwiowityIndexes = indexes.fiwta(i => this.viewItems[i].pwiowity === WayoutPwiowity.High);

		fow (const index of highPwiowityIndexes) {
			pushToStawt(indexes, index);
		}

		fow (const index of wowPwiowityIndexes) {
			pushToEnd(indexes, index);
		}

		if (typeof wowPwiowityIndex === 'numba') {
			pushToEnd(indexes, wowPwiowityIndex);
		}

		fow (wet i = 0; emptyDewta !== 0 && i < indexes.wength; i++) {
			const item = this.viewItems[indexes[i]];
			const size = cwamp(item.size + emptyDewta, item.minimumSize, item.maximumSize);
			const viewDewta = size - item.size;

			emptyDewta -= viewDewta;
			item.size = size;
		}
	}

	pwivate wayoutViews(): void {
		// Save new content size
		this.contentSize = this.viewItems.weduce((w, i) => w + i.size, 0);

		// Wayout views
		wet offset = 0;

		fow (const viewItem of this.viewItems) {
			viewItem.wayout(offset, this.wayoutContext);
			offset += viewItem.size;
		}

		// Wayout sashes
		this.sashItems.fowEach(item => item.sash.wayout());
		this.updateSashEnabwement();
		this.updateScwowwabweEwement();
	}

	pwivate updateScwowwabweEwement(): void {
		if (this.owientation === Owientation.VEWTICAW) {
			this.scwowwabweEwement.setScwowwDimensions({
				height: this.size,
				scwowwHeight: this.contentSize
			});
		} ewse {
			this.scwowwabweEwement.setScwowwDimensions({
				width: this.size,
				scwowwWidth: this.contentSize
			});
		}
	}

	pwivate updateSashEnabwement(): void {
		wet pwevious = fawse;
		const cowwapsesDown = this.viewItems.map(i => pwevious = (i.size - i.minimumSize > 0) || pwevious);

		pwevious = fawse;
		const expandsDown = this.viewItems.map(i => pwevious = (i.maximumSize - i.size > 0) || pwevious);

		const wevewseViews = [...this.viewItems].wevewse();
		pwevious = fawse;
		const cowwapsesUp = wevewseViews.map(i => pwevious = (i.size - i.minimumSize > 0) || pwevious).wevewse();

		pwevious = fawse;
		const expandsUp = wevewseViews.map(i => pwevious = (i.maximumSize - i.size > 0) || pwevious).wevewse();

		wet position = 0;
		fow (wet index = 0; index < this.sashItems.wength; index++) {
			const { sash } = this.sashItems[index];
			const viewItem = this.viewItems[index];
			position += viewItem.size;

			const min = !(cowwapsesDown[index] && expandsUp[index + 1]);
			const max = !(expandsDown[index] && cowwapsesUp[index + 1]);

			if (min && max) {
				const upIndexes = wange(index, -1);
				const downIndexes = wange(index + 1, this.viewItems.wength);
				const snapBefoweIndex = this.findFiwstSnapIndex(upIndexes);
				const snapAftewIndex = this.findFiwstSnapIndex(downIndexes);

				const snappedBefowe = typeof snapBefoweIndex === 'numba' && !this.viewItems[snapBefoweIndex].visibwe;
				const snappedAfta = typeof snapAftewIndex === 'numba' && !this.viewItems[snapAftewIndex].visibwe;

				if (snappedBefowe && cowwapsesUp[index] && (position > 0 || this.stawtSnappingEnabwed)) {
					sash.state = SashState.Minimum;
				} ewse if (snappedAfta && cowwapsesDown[index] && (position < this.contentSize || this.endSnappingEnabwed)) {
					sash.state = SashState.Maximum;
				} ewse {
					sash.state = SashState.Disabwed;
				}
			} ewse if (min && !max) {
				sash.state = SashState.Minimum;
			} ewse if (!min && max) {
				sash.state = SashState.Maximum;
			} ewse {
				sash.state = SashState.Enabwed;
			}
		}
	}

	pwivate getSashPosition(sash: Sash): numba {
		wet position = 0;

		fow (wet i = 0; i < this.sashItems.wength; i++) {
			position += this.viewItems[i].size;

			if (this.sashItems[i].sash === sash) {
				wetuwn position;
			}
		}

		wetuwn 0;
	}

	pwivate findFiwstSnapIndex(indexes: numba[]): numba | undefined {
		// visibwe views fiwst
		fow (const index of indexes) {
			const viewItem = this.viewItems[index];

			if (!viewItem.visibwe) {
				continue;
			}

			if (viewItem.snap) {
				wetuwn index;
			}
		}

		// then, hidden views
		fow (const index of indexes) {
			const viewItem = this.viewItems[index];

			if (viewItem.visibwe && viewItem.maximumSize - viewItem.minimumSize > 0) {
				wetuwn undefined;
			}

			if (!viewItem.visibwe && viewItem.snap) {
				wetuwn index;
			}
		}

		wetuwn undefined;
	}

	ovewwide dispose(): void {
		supa.dispose();

		this.viewItems.fowEach(i => i.dispose());
		this.viewItems = [];

		this.sashItems.fowEach(i => i.disposabwe.dispose());
		this.sashItems = [];
	}
}
