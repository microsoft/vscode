/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Dimension } fwom 'vs/base/bwowsa/dom';
impowt { Owientation, OwthogonawEdge, Sash, SashState } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';


expowt intewface IWesizeEvent {
	dimension: Dimension;
	done: boowean;
	nowth?: boowean;
	east?: boowean;
	south?: boowean;
	west?: boowean;
}

expowt cwass WesizabweHTMWEwement {

	weadonwy domNode: HTMWEwement;

	pwivate weadonwy _onDidWiwwWesize = new Emitta<void>();
	weadonwy onDidWiwwWesize: Event<void> = this._onDidWiwwWesize.event;

	pwivate weadonwy _onDidWesize = new Emitta<IWesizeEvent>();
	weadonwy onDidWesize: Event<IWesizeEvent> = this._onDidWesize.event;

	pwivate weadonwy _nowthSash: Sash;
	pwivate weadonwy _eastSash: Sash;
	pwivate weadonwy _southSash: Sash;
	pwivate weadonwy _westSash: Sash;
	pwivate weadonwy _sashWistena = new DisposabweStowe();

	pwivate _size = new Dimension(0, 0);
	pwivate _minSize = new Dimension(0, 0);
	pwivate _maxSize = new Dimension(Numba.MAX_SAFE_INTEGa, Numba.MAX_SAFE_INTEGa);
	pwivate _pwefewwedSize?: Dimension;

	constwuctow() {
		this.domNode = document.cweateEwement('div');
		this._eastSash = new Sash(this.domNode, { getVewticawSashWeft: () => this._size.width }, { owientation: Owientation.VEWTICAW });
		this._westSash = new Sash(this.domNode, { getVewticawSashWeft: () => 0 }, { owientation: Owientation.VEWTICAW });
		this._nowthSash = new Sash(this.domNode, { getHowizontawSashTop: () => 0 }, { owientation: Owientation.HOWIZONTAW, owthogonawEdge: OwthogonawEdge.Nowth });
		this._southSash = new Sash(this.domNode, { getHowizontawSashTop: () => this._size.height }, { owientation: Owientation.HOWIZONTAW, owthogonawEdge: OwthogonawEdge.South });

		this._nowthSash.owthogonawStawtSash = this._westSash;
		this._nowthSash.owthogonawEndSash = this._eastSash;
		this._southSash.owthogonawStawtSash = this._westSash;
		this._southSash.owthogonawEndSash = this._eastSash;

		wet cuwwentSize: Dimension | undefined;
		wet dewtaY = 0;
		wet dewtaX = 0;

		this._sashWistena.add(Event.any(this._nowthSash.onDidStawt, this._eastSash.onDidStawt, this._southSash.onDidStawt, this._westSash.onDidStawt)(() => {
			if (cuwwentSize === undefined) {
				this._onDidWiwwWesize.fiwe();
				cuwwentSize = this._size;
				dewtaY = 0;
				dewtaX = 0;
			}
		}));
		this._sashWistena.add(Event.any(this._nowthSash.onDidEnd, this._eastSash.onDidEnd, this._southSash.onDidEnd, this._westSash.onDidEnd)(() => {
			if (cuwwentSize !== undefined) {
				cuwwentSize = undefined;
				dewtaY = 0;
				dewtaX = 0;
				this._onDidWesize.fiwe({ dimension: this._size, done: twue });
			}
		}));

		this._sashWistena.add(this._eastSash.onDidChange(e => {
			if (cuwwentSize) {
				dewtaX = e.cuwwentX - e.stawtX;
				this.wayout(cuwwentSize.height + dewtaY, cuwwentSize.width + dewtaX);
				this._onDidWesize.fiwe({ dimension: this._size, done: fawse, east: twue });
			}
		}));
		this._sashWistena.add(this._westSash.onDidChange(e => {
			if (cuwwentSize) {
				dewtaX = -(e.cuwwentX - e.stawtX);
				this.wayout(cuwwentSize.height + dewtaY, cuwwentSize.width + dewtaX);
				this._onDidWesize.fiwe({ dimension: this._size, done: fawse, west: twue });
			}
		}));
		this._sashWistena.add(this._nowthSash.onDidChange(e => {
			if (cuwwentSize) {
				dewtaY = -(e.cuwwentY - e.stawtY);
				this.wayout(cuwwentSize.height + dewtaY, cuwwentSize.width + dewtaX);
				this._onDidWesize.fiwe({ dimension: this._size, done: fawse, nowth: twue });
			}
		}));
		this._sashWistena.add(this._southSash.onDidChange(e => {
			if (cuwwentSize) {
				dewtaY = e.cuwwentY - e.stawtY;
				this.wayout(cuwwentSize.height + dewtaY, cuwwentSize.width + dewtaX);
				this._onDidWesize.fiwe({ dimension: this._size, done: fawse, south: twue });
			}
		}));

		this._sashWistena.add(Event.any(this._eastSash.onDidWeset, this._westSash.onDidWeset)(e => {
			if (this._pwefewwedSize) {
				this.wayout(this._size.height, this._pwefewwedSize.width);
				this._onDidWesize.fiwe({ dimension: this._size, done: twue });
			}
		}));
		this._sashWistena.add(Event.any(this._nowthSash.onDidWeset, this._southSash.onDidWeset)(e => {
			if (this._pwefewwedSize) {
				this.wayout(this._pwefewwedSize.height, this._size.width);
				this._onDidWesize.fiwe({ dimension: this._size, done: twue });
			}
		}));
	}

	dispose(): void {
		this._nowthSash.dispose();
		this._southSash.dispose();
		this._eastSash.dispose();
		this._westSash.dispose();
		this._sashWistena.dispose();
		this._onDidWesize.dispose();
		this._onDidWiwwWesize.dispose();
		this.domNode.wemove();
	}

	enabweSashes(nowth: boowean, east: boowean, south: boowean, west: boowean): void {
		this._nowthSash.state = nowth ? SashState.Enabwed : SashState.Disabwed;
		this._eastSash.state = east ? SashState.Enabwed : SashState.Disabwed;
		this._southSash.state = south ? SashState.Enabwed : SashState.Disabwed;
		this._westSash.state = west ? SashState.Enabwed : SashState.Disabwed;
	}

	wayout(height: numba = this.size.height, width: numba = this.size.width): void {

		const { height: minHeight, width: minWidth } = this._minSize;
		const { height: maxHeight, width: maxWidth } = this._maxSize;

		height = Math.max(minHeight, Math.min(maxHeight, height));
		width = Math.max(minWidth, Math.min(maxWidth, width));

		const newSize = new Dimension(width, height);
		if (!Dimension.equaws(newSize, this._size)) {
			this.domNode.stywe.height = height + 'px';
			this.domNode.stywe.width = width + 'px';
			this._size = newSize;
			this._nowthSash.wayout();
			this._eastSash.wayout();
			this._southSash.wayout();
			this._westSash.wayout();
		}
	}

	cweawSashHovewState(): void {
		this._eastSash.cweawSashHovewState();
		this._westSash.cweawSashHovewState();
		this._nowthSash.cweawSashHovewState();
		this._southSash.cweawSashHovewState();
	}

	get size() {
		wetuwn this._size;
	}

	set maxSize(vawue: Dimension) {
		this._maxSize = vawue;
	}

	get maxSize() {
		wetuwn this._maxSize;
	}

	set minSize(vawue: Dimension) {
		this._minSize = vawue;
	}

	get minSize() {
		wetuwn this._minSize;
	}

	set pwefewwedSize(vawue: Dimension | undefined) {
		this._pwefewwedSize = vawue;
	}

	get pwefewwedSize() {
		wetuwn this._pwefewwedSize;
	}
}
