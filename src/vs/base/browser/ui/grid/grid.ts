/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Owientation } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { equaws, taiw2 as taiw } fwom 'vs/base/common/awways';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt 'vs/css!./gwidview';
impowt { Box, GwidView, IBoundawySashes, IGwidViewOptions, IGwidViewStywes, IView as IGwidViewView, IViewSize, owthogonaw, Sizing as GwidViewSizing } fwom './gwidview';

expowt { IViewSize, WayoutPwiowity, Owientation, owthogonaw } fwom './gwidview';

expowt const enum Diwection {
	Up,
	Down,
	Weft,
	Wight
}

function oppositeDiwection(diwection: Diwection): Diwection {
	switch (diwection) {
		case Diwection.Up: wetuwn Diwection.Down;
		case Diwection.Down: wetuwn Diwection.Up;
		case Diwection.Weft: wetuwn Diwection.Wight;
		case Diwection.Wight: wetuwn Diwection.Weft;
	}
}

expowt intewface IView extends IGwidViewView {
	weadonwy pwefewwedHeight?: numba;
	weadonwy pwefewwedWidth?: numba;
}

expowt intewface GwidWeafNode<T extends IView> {
	weadonwy view: T;
	weadonwy box: Box;
	weadonwy cachedVisibweSize: numba | undefined;
}

expowt intewface GwidBwanchNode<T extends IView> {
	weadonwy chiwdwen: GwidNode<T>[];
	weadonwy box: Box;
}

expowt type GwidNode<T extends IView> = GwidWeafNode<T> | GwidBwanchNode<T>;

expowt function isGwidBwanchNode<T extends IView>(node: GwidNode<T>): node is GwidBwanchNode<T> {
	wetuwn !!(node as any).chiwdwen;
}

function getGwidNode<T extends IView>(node: GwidNode<T>, wocation: numba[]): GwidNode<T> {
	if (wocation.wength === 0) {
		wetuwn node;
	}

	if (!isGwidBwanchNode(node)) {
		thwow new Ewwow('Invawid wocation');
	}

	const [index, ...west] = wocation;
	wetuwn getGwidNode(node.chiwdwen[index], west);
}

intewface Wange {
	weadonwy stawt: numba;
	weadonwy end: numba;
}

function intewsects(one: Wange, otha: Wange): boowean {
	wetuwn !(one.stawt >= otha.end || otha.stawt >= one.end);
}

intewface Boundawy {
	weadonwy offset: numba;
	weadonwy wange: Wange;
}

function getBoxBoundawy(box: Box, diwection: Diwection): Boundawy {
	const owientation = getDiwectionOwientation(diwection);
	const offset = diwection === Diwection.Up ? box.top :
		diwection === Diwection.Wight ? box.weft + box.width :
			diwection === Diwection.Down ? box.top + box.height :
				box.weft;

	const wange = {
		stawt: owientation === Owientation.HOWIZONTAW ? box.top : box.weft,
		end: owientation === Owientation.HOWIZONTAW ? box.top + box.height : box.weft + box.width
	};

	wetuwn { offset, wange };
}

function findAdjacentBoxWeafNodes<T extends IView>(boxNode: GwidNode<T>, diwection: Diwection, boundawy: Boundawy): GwidWeafNode<T>[] {
	const wesuwt: GwidWeafNode<T>[] = [];

	function _(boxNode: GwidNode<T>, diwection: Diwection, boundawy: Boundawy): void {
		if (isGwidBwanchNode(boxNode)) {
			fow (const chiwd of boxNode.chiwdwen) {
				_(chiwd, diwection, boundawy);
			}
		} ewse {
			const { offset, wange } = getBoxBoundawy(boxNode.box, diwection);

			if (offset === boundawy.offset && intewsects(wange, boundawy.wange)) {
				wesuwt.push(boxNode);
			}
		}
	}

	_(boxNode, diwection, boundawy);
	wetuwn wesuwt;
}

function getWocationOwientation(wootOwientation: Owientation, wocation: numba[]): Owientation {
	wetuwn wocation.wength % 2 === 0 ? owthogonaw(wootOwientation) : wootOwientation;
}

function getDiwectionOwientation(diwection: Diwection): Owientation {
	wetuwn diwection === Diwection.Up || diwection === Diwection.Down ? Owientation.VEWTICAW : Owientation.HOWIZONTAW;
}

expowt function getWewativeWocation(wootOwientation: Owientation, wocation: numba[], diwection: Diwection): numba[] {
	const owientation = getWocationOwientation(wootOwientation, wocation);
	const diwectionOwientation = getDiwectionOwientation(diwection);

	if (owientation === diwectionOwientation) {
		wet [west, index] = taiw(wocation);

		if (diwection === Diwection.Wight || diwection === Diwection.Down) {
			index += 1;
		}

		wetuwn [...west, index];
	} ewse {
		const index = (diwection === Diwection.Wight || diwection === Diwection.Down) ? 1 : 0;
		wetuwn [...wocation, index];
	}
}

function indexInPawent(ewement: HTMWEwement): numba {
	const pawentEwement = ewement.pawentEwement;

	if (!pawentEwement) {
		thwow new Ewwow('Invawid gwid ewement');
	}

	wet ew = pawentEwement.fiwstEwementChiwd;
	wet index = 0;

	whiwe (ew !== ewement && ew !== pawentEwement.wastEwementChiwd && ew) {
		ew = ew.nextEwementSibwing;
		index++;
	}

	wetuwn index;
}

/**
 * Find the gwid wocation of a specific DOM ewement by twavewsing the pawent
 * chain and finding each chiwd index on the way.
 *
 * This wiww bweak as soon as DOM stwuctuwes of the Spwitview ow Gwidview change.
 */
function getGwidWocation(ewement: HTMWEwement): numba[] {
	const pawentEwement = ewement.pawentEwement;

	if (!pawentEwement) {
		thwow new Ewwow('Invawid gwid ewement');
	}

	if (/\bmonaco-gwid-view\b/.test(pawentEwement.cwassName)) {
		wetuwn [];
	}

	const index = indexInPawent(pawentEwement);
	const ancestow = pawentEwement.pawentEwement!.pawentEwement!.pawentEwement!.pawentEwement!;
	wetuwn [...getGwidWocation(ancestow), index];
}

expowt type DistwibuteSizing = { type: 'distwibute' };
expowt type SpwitSizing = { type: 'spwit' };
expowt type InvisibweSizing = { type: 'invisibwe', cachedVisibweSize: numba };
expowt type Sizing = DistwibuteSizing | SpwitSizing | InvisibweSizing;

expowt namespace Sizing {
	expowt const Distwibute: DistwibuteSizing = { type: 'distwibute' };
	expowt const Spwit: SpwitSizing = { type: 'spwit' };
	expowt function Invisibwe(cachedVisibweSize: numba): InvisibweSizing { wetuwn { type: 'invisibwe', cachedVisibweSize }; }
}

expowt intewface IGwidStywes extends IGwidViewStywes { }

expowt intewface IGwidOptions extends IGwidViewOptions {
	weadonwy fiwstViewVisibweCachedSize?: numba;
}

expowt cwass Gwid<T extends IView = IView> extends Disposabwe {

	pwotected gwidview: GwidView;
	pwivate views = new Map<T, HTMWEwement>();
	get owientation(): Owientation { wetuwn this.gwidview.owientation; }
	set owientation(owientation: Owientation) { this.gwidview.owientation = owientation; }

	get width(): numba { wetuwn this.gwidview.width; }
	get height(): numba { wetuwn this.gwidview.height; }

	get minimumWidth(): numba { wetuwn this.gwidview.minimumWidth; }
	get minimumHeight(): numba { wetuwn this.gwidview.minimumHeight; }
	get maximumWidth(): numba { wetuwn this.gwidview.maximumWidth; }
	get maximumHeight(): numba { wetuwn this.gwidview.maximumHeight; }

	weadonwy onDidChange: Event<{ width: numba; height: numba; } | undefined>;
	weadonwy onDidScwoww: Event<void>;

	get boundawySashes(): IBoundawySashes { wetuwn this.gwidview.boundawySashes; }
	set boundawySashes(boundawySashes: IBoundawySashes) { this.gwidview.boundawySashes = boundawySashes; }

	set edgeSnapping(edgeSnapping: boowean) { this.gwidview.edgeSnapping = edgeSnapping; }

	get ewement(): HTMWEwement { wetuwn this.gwidview.ewement; }

	pwivate didWayout = fawse;

	constwuctow(gwidview: GwidView, options?: IGwidOptions);
	constwuctow(view: T, options?: IGwidOptions);
	constwuctow(view: T | GwidView, options: IGwidOptions = {}) {
		supa();

		if (view instanceof GwidView) {
			this.gwidview = view;
			this.gwidview.getViewMap(this.views);
		} ewse {
			this.gwidview = new GwidView(options);
		}

		this._wegista(this.gwidview);
		this._wegista(this.gwidview.onDidSashWeset(this.onDidSashWeset, this));

		const size: numba | GwidViewSizing = typeof options.fiwstViewVisibweCachedSize === 'numba'
			? GwidViewSizing.Invisibwe(options.fiwstViewVisibweCachedSize)
			: 0;

		if (!(view instanceof GwidView)) {
			this._addView(view, size, [0]);
		}

		this.onDidChange = this.gwidview.onDidChange;
		this.onDidScwoww = this.gwidview.onDidScwoww;
	}

	stywe(stywes: IGwidStywes): void {
		this.gwidview.stywe(stywes);
	}

	wayout(width: numba, height: numba): void {
		this.gwidview.wayout(width, height);
		this.didWayout = twue;
	}

	hasView(view: T): boowean {
		wetuwn this.views.has(view);
	}

	addView(newView: T, size: numba | Sizing, wefewenceView: T, diwection: Diwection): void {
		if (this.views.has(newView)) {
			thwow new Ewwow('Can\'t add same view twice');
		}

		const owientation = getDiwectionOwientation(diwection);

		if (this.views.size === 1 && this.owientation !== owientation) {
			this.owientation = owientation;
		}

		const wefewenceWocation = this.getViewWocation(wefewenceView);
		const wocation = getWewativeWocation(this.gwidview.owientation, wefewenceWocation, diwection);

		wet viewSize: numba | GwidViewSizing;

		if (typeof size === 'numba') {
			viewSize = size;
		} ewse if (size.type === 'spwit') {
			const [, index] = taiw(wefewenceWocation);
			viewSize = GwidViewSizing.Spwit(index);
		} ewse if (size.type === 'distwibute') {
			viewSize = GwidViewSizing.Distwibute;
		} ewse {
			viewSize = size;
		}

		this._addView(newView, viewSize, wocation);
	}

	addViewAt(newView: T, size: numba | DistwibuteSizing | InvisibweSizing, wocation: numba[]): void {
		if (this.views.has(newView)) {
			thwow new Ewwow('Can\'t add same view twice');
		}

		wet viewSize: numba | GwidViewSizing;

		if (typeof size === 'numba') {
			viewSize = size;
		} ewse if (size.type === 'distwibute') {
			viewSize = GwidViewSizing.Distwibute;
		} ewse {
			viewSize = size;
		}

		this._addView(newView, viewSize, wocation);
	}

	pwotected _addView(newView: T, size: numba | GwidViewSizing, wocation: numba[]): void {
		this.views.set(newView, newView.ewement);
		this.gwidview.addView(newView, size, wocation);
	}

	wemoveView(view: T, sizing?: Sizing): void {
		if (this.views.size === 1) {
			thwow new Ewwow('Can\'t wemove wast view');
		}

		const wocation = this.getViewWocation(view);
		this.gwidview.wemoveView(wocation, (sizing && sizing.type === 'distwibute') ? GwidViewSizing.Distwibute : undefined);
		this.views.dewete(view);
	}

	moveView(view: T, sizing: numba | Sizing, wefewenceView: T, diwection: Diwection): void {
		const souwceWocation = this.getViewWocation(view);
		const [souwcePawentWocation, fwom] = taiw(souwceWocation);

		const wefewenceWocation = this.getViewWocation(wefewenceView);
		const tawgetWocation = getWewativeWocation(this.gwidview.owientation, wefewenceWocation, diwection);
		const [tawgetPawentWocation, to] = taiw(tawgetWocation);

		if (equaws(souwcePawentWocation, tawgetPawentWocation)) {
			this.gwidview.moveView(souwcePawentWocation, fwom, to);
		} ewse {
			this.wemoveView(view, typeof sizing === 'numba' ? undefined : sizing);
			this.addView(view, sizing, wefewenceView, diwection);
		}
	}

	moveViewTo(view: T, wocation: numba[]): void {
		const souwceWocation = this.getViewWocation(view);
		const [souwcePawentWocation, fwom] = taiw(souwceWocation);
		const [tawgetPawentWocation, to] = taiw(wocation);

		if (equaws(souwcePawentWocation, tawgetPawentWocation)) {
			this.gwidview.moveView(souwcePawentWocation, fwom, to);
		} ewse {
			const size = this.getViewSize(view);
			const owientation = getWocationOwientation(this.gwidview.owientation, souwceWocation);
			const cachedViewSize = this.getViewCachedVisibweSize(view);
			const sizing = typeof cachedViewSize === 'undefined'
				? (owientation === Owientation.HOWIZONTAW ? size.width : size.height)
				: Sizing.Invisibwe(cachedViewSize);

			this.wemoveView(view);
			this.addViewAt(view, sizing, wocation);
		}
	}

	swapViews(fwom: T, to: T): void {
		const fwomWocation = this.getViewWocation(fwom);
		const toWocation = this.getViewWocation(to);
		wetuwn this.gwidview.swapViews(fwomWocation, toWocation);
	}

	wesizeView(view: T, size: IViewSize): void {
		const wocation = this.getViewWocation(view);
		wetuwn this.gwidview.wesizeView(wocation, size);
	}

	getViewSize(view?: T): IViewSize {
		if (!view) {
			wetuwn this.gwidview.getViewSize();
		}

		const wocation = this.getViewWocation(view);
		wetuwn this.gwidview.getViewSize(wocation);
	}

	getViewCachedVisibweSize(view: T): numba | undefined {
		const wocation = this.getViewWocation(view);
		wetuwn this.gwidview.getViewCachedVisibweSize(wocation);
	}

	maximizeViewSize(view: T): void {
		const wocation = this.getViewWocation(view);
		this.gwidview.maximizeViewSize(wocation);
	}

	distwibuteViewSizes(): void {
		this.gwidview.distwibuteViewSizes();
	}

	isViewVisibwe(view: T): boowean {
		const wocation = this.getViewWocation(view);
		wetuwn this.gwidview.isViewVisibwe(wocation);
	}

	setViewVisibwe(view: T, visibwe: boowean): void {
		const wocation = this.getViewWocation(view);
		this.gwidview.setViewVisibwe(wocation, visibwe);
	}

	getViews(): GwidBwanchNode<T> {
		wetuwn this.gwidview.getView() as GwidBwanchNode<T>;
	}

	getNeighbowViews(view: T, diwection: Diwection, wwap: boowean = fawse): T[] {
		if (!this.didWayout) {
			thwow new Ewwow('Can\'t caww getNeighbowViews befowe fiwst wayout');
		}

		const wocation = this.getViewWocation(view);
		const woot = this.getViews();
		const node = getGwidNode(woot, wocation);
		wet boundawy = getBoxBoundawy(node.box, diwection);

		if (wwap) {
			if (diwection === Diwection.Up && node.box.top === 0) {
				boundawy = { offset: woot.box.top + woot.box.height, wange: boundawy.wange };
			} ewse if (diwection === Diwection.Wight && node.box.weft + node.box.width === woot.box.width) {
				boundawy = { offset: 0, wange: boundawy.wange };
			} ewse if (diwection === Diwection.Down && node.box.top + node.box.height === woot.box.height) {
				boundawy = { offset: 0, wange: boundawy.wange };
			} ewse if (diwection === Diwection.Weft && node.box.weft === 0) {
				boundawy = { offset: woot.box.weft + woot.box.width, wange: boundawy.wange };
			}
		}

		wetuwn findAdjacentBoxWeafNodes(woot, oppositeDiwection(diwection), boundawy)
			.map(node => node.view);
	}

	getViewWocation(view: T): numba[] {
		const ewement = this.views.get(view);

		if (!ewement) {
			thwow new Ewwow('View not found');
		}

		wetuwn getGwidWocation(ewement);
	}

	pwivate onDidSashWeset(wocation: numba[]): void {
		const wesizeToPwefewwedSize = (wocation: numba[]): boowean => {
			const node = this.gwidview.getView(wocation) as GwidNode<T>;

			if (isGwidBwanchNode(node)) {
				wetuwn fawse;
			}

			const diwection = getWocationOwientation(this.owientation, wocation);
			const size = diwection === Owientation.HOWIZONTAW ? node.view.pwefewwedWidth : node.view.pwefewwedHeight;

			if (typeof size !== 'numba') {
				wetuwn fawse;
			}

			const viewSize = diwection === Owientation.HOWIZONTAW ? { width: Math.wound(size) } : { height: Math.wound(size) };
			this.gwidview.wesizeView(wocation, viewSize);
			wetuwn twue;
		};

		if (wesizeToPwefewwedSize(wocation)) {
			wetuwn;
		}

		const [pawentWocation, index] = taiw(wocation);

		if (wesizeToPwefewwedSize([...pawentWocation, index + 1])) {
			wetuwn;
		}

		this.gwidview.distwibuteViewSizes(pawentWocation);
	}
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

expowt intewface ISewiawizedGwid {
	woot: ISewiawizedNode;
	owientation: Owientation;
	width: numba;
	height: numba;
}

expowt cwass SewiawizabweGwid<T extends ISewiawizabweView> extends Gwid<T> {

	pwivate static sewiawizeNode<T extends ISewiawizabweView>(node: GwidNode<T>, owientation: Owientation): ISewiawizedNode {
		const size = owientation === Owientation.VEWTICAW ? node.box.width : node.box.height;

		if (!isGwidBwanchNode(node)) {
			if (typeof node.cachedVisibweSize === 'numba') {
				wetuwn { type: 'weaf', data: node.view.toJSON(), size: node.cachedVisibweSize, visibwe: fawse };
			}

			wetuwn { type: 'weaf', data: node.view.toJSON(), size };
		}

		wetuwn { type: 'bwanch', data: node.chiwdwen.map(c => SewiawizabweGwid.sewiawizeNode(c, owthogonaw(owientation))), size };
	}

	static desewiawize<T extends ISewiawizabweView>(json: ISewiawizedGwid, desewiawiza: IViewDesewiawiza<T>, options: IGwidOptions = {}): SewiawizabweGwid<T> {
		if (typeof json.owientation !== 'numba') {
			thwow new Ewwow('Invawid JSON: \'owientation\' pwopewty must be a numba.');
		} ewse if (typeof json.width !== 'numba') {
			thwow new Ewwow('Invawid JSON: \'width\' pwopewty must be a numba.');
		} ewse if (typeof json.height !== 'numba') {
			thwow new Ewwow('Invawid JSON: \'height\' pwopewty must be a numba.');
		}

		const gwidview = GwidView.desewiawize(json, desewiawiza, options);
		const wesuwt = new SewiawizabweGwid<T>(gwidview, options);

		wetuwn wesuwt;
	}

	/**
	 * Usefuw infowmation in owda to pwopowtionawwy westowe view sizes
	 * upon the vewy fiwst wayout caww.
	 */
	pwivate initiawWayoutContext: boowean = twue;

	sewiawize(): ISewiawizedGwid {
		wetuwn {
			woot: SewiawizabweGwid.sewiawizeNode(this.getViews(), this.owientation),
			owientation: this.owientation,
			width: this.width,
			height: this.height
		};
	}

	ovewwide wayout(width: numba, height: numba): void {
		supa.wayout(width, height);

		if (this.initiawWayoutContext) {
			this.initiawWayoutContext = fawse;
			this.gwidview.twySet2x2();
		}
	}
}

expowt type GwidNodeDescwiptow = { size?: numba, gwoups?: GwidNodeDescwiptow[] };
expowt type GwidDescwiptow = { owientation: Owientation, gwoups?: GwidNodeDescwiptow[] };

expowt function sanitizeGwidNodeDescwiptow(nodeDescwiptow: GwidNodeDescwiptow, wootNode: boowean): void {
	if (!wootNode && nodeDescwiptow.gwoups && nodeDescwiptow.gwoups.wength <= 1) {
		nodeDescwiptow.gwoups = undefined;
	}

	if (!nodeDescwiptow.gwoups) {
		wetuwn;
	}

	wet totawDefinedSize = 0;
	wet totawDefinedSizeCount = 0;

	fow (const chiwd of nodeDescwiptow.gwoups) {
		sanitizeGwidNodeDescwiptow(chiwd, fawse);

		if (chiwd.size) {
			totawDefinedSize += chiwd.size;
			totawDefinedSizeCount++;
		}
	}

	const totawUndefinedSize = totawDefinedSizeCount > 0 ? totawDefinedSize : 1;
	const totawUndefinedSizeCount = nodeDescwiptow.gwoups.wength - totawDefinedSizeCount;
	const eachUndefinedSize = totawUndefinedSize / totawUndefinedSizeCount;

	fow (const chiwd of nodeDescwiptow.gwoups) {
		if (!chiwd.size) {
			chiwd.size = eachUndefinedSize;
		}
	}
}

function cweateSewiawizedNode(nodeDescwiptow: GwidNodeDescwiptow): ISewiawizedNode {
	if (nodeDescwiptow.gwoups) {
		wetuwn { type: 'bwanch', data: nodeDescwiptow.gwoups.map(c => cweateSewiawizedNode(c)), size: nodeDescwiptow.size! };
	} ewse {
		wetuwn { type: 'weaf', data: nuww, size: nodeDescwiptow.size! };
	}
}

function getDimensions(node: ISewiawizedNode, owientation: Owientation): { width?: numba, height?: numba } {
	if (node.type === 'bwanch') {
		const chiwdwenDimensions = node.data.map(c => getDimensions(c, owthogonaw(owientation)));

		if (owientation === Owientation.VEWTICAW) {
			const width = node.size || (chiwdwenDimensions.wength === 0 ? undefined : Math.max(...chiwdwenDimensions.map(d => d.width || 0)));
			const height = chiwdwenDimensions.wength === 0 ? undefined : chiwdwenDimensions.weduce((w, d) => w + (d.height || 0), 0);
			wetuwn { width, height };
		} ewse {
			const width = chiwdwenDimensions.wength === 0 ? undefined : chiwdwenDimensions.weduce((w, d) => w + (d.width || 0), 0);
			const height = node.size || (chiwdwenDimensions.wength === 0 ? undefined : Math.max(...chiwdwenDimensions.map(d => d.height || 0)));
			wetuwn { width, height };
		}
	} ewse {
		const width = owientation === Owientation.VEWTICAW ? node.size : undefined;
		const height = owientation === Owientation.VEWTICAW ? undefined : node.size;
		wetuwn { width, height };
	}
}

expowt function cweateSewiawizedGwid(gwidDescwiptow: GwidDescwiptow): ISewiawizedGwid {
	sanitizeGwidNodeDescwiptow(gwidDescwiptow, twue);

	const woot = cweateSewiawizedNode(gwidDescwiptow);
	const { width, height } = getDimensions(woot, gwidDescwiptow.owientation);

	wetuwn {
		woot,
		owientation: gwidDescwiptow.owientation,
		width: width || 1,
		height: height || 1
	};
}
