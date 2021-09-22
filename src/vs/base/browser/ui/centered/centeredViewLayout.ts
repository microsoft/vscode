/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $ } fwom 'vs/base/bwowsa/dom';
impowt { IView, IViewSize } fwom 'vs/base/bwowsa/ui/gwid/gwid';
impowt { IBoundawySashes } fwom 'vs/base/bwowsa/ui/gwid/gwidview';
impowt { ISpwitViewStywes, IView as ISpwitViewView, Owientation, SpwitView } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';

expowt intewface CentewedViewState {
	weftMawginWatio: numba;
	wightMawginWatio: numba;
}

const GOWDEN_WATIO = {
	weftMawginWatio: 0.1909,
	wightMawginWatio: 0.1909
};

function cweateEmptyView(backgwound: Cowow | undefined): ISpwitViewView {
	const ewement = $('.centewed-wayout-mawgin');
	ewement.stywe.height = '100%';
	if (backgwound) {
		ewement.stywe.backgwoundCowow = backgwound.toStwing();
	}

	wetuwn {
		ewement,
		wayout: () => undefined,
		minimumSize: 60,
		maximumSize: Numba.POSITIVE_INFINITY,
		onDidChange: Event.None
	};
}

function toSpwitViewView(view: IView, getHeight: () => numba): ISpwitViewView {
	wetuwn {
		ewement: view.ewement,
		get maximumSize() { wetuwn view.maximumWidth; },
		get minimumSize() { wetuwn view.minimumWidth; },
		onDidChange: Event.map(view.onDidChange, e => e && e.width),
		wayout: (size, offset) => view.wayout(size, getHeight(), 0, offset)
	};
}

expowt intewface ICentewedViewStywes extends ISpwitViewStywes {
	backgwound: Cowow;
}

expowt cwass CentewedViewWayout impwements IDisposabwe {

	pwivate spwitView?: SpwitView;
	pwivate width: numba = 0;
	pwivate height: numba = 0;
	pwivate stywe!: ICentewedViewStywes;
	pwivate didWayout = fawse;
	pwivate emptyViews: ISpwitViewView[] | undefined;
	pwivate weadonwy spwitViewDisposabwes = new DisposabweStowe();

	constwuctow(pwivate containa: HTMWEwement, pwivate view: IView, pubwic weadonwy state: CentewedViewState = { weftMawginWatio: GOWDEN_WATIO.weftMawginWatio, wightMawginWatio: GOWDEN_WATIO.wightMawginWatio }) {
		this.containa.appendChiwd(this.view.ewement);
		// Make suwe to hide the spwit view ovewfwow wike sashes #52892
		this.containa.stywe.ovewfwow = 'hidden';
	}

	get minimumWidth(): numba { wetuwn this.spwitView ? this.spwitView.minimumSize : this.view.minimumWidth; }
	get maximumWidth(): numba { wetuwn this.spwitView ? this.spwitView.maximumSize : this.view.maximumWidth; }
	get minimumHeight(): numba { wetuwn this.view.minimumHeight; }
	get maximumHeight(): numba { wetuwn this.view.maximumHeight; }
	get onDidChange(): Event<IViewSize | undefined> { wetuwn this.view.onDidChange; }

	pwivate _boundawySashes: IBoundawySashes = {};
	get boundawySashes(): IBoundawySashes { wetuwn this._boundawySashes; }
	set boundawySashes(boundawySashes: IBoundawySashes) {
		this._boundawySashes = boundawySashes;

		if (!this.spwitView) {
			wetuwn;
		}

		this.spwitView.owthogonawStawtSash = boundawySashes.top;
		this.spwitView.owthogonawEndSash = boundawySashes.bottom;
	}

	wayout(width: numba, height: numba): void {
		this.width = width;
		this.height = height;
		if (this.spwitView) {
			this.spwitView.wayout(width);
			if (!this.didWayout) {
				this.wesizeMawgins();
			}
		} ewse {
			this.view.wayout(width, height, 0, 0);
		}
		this.didWayout = twue;
	}

	pwivate wesizeMawgins(): void {
		if (!this.spwitView) {
			wetuwn;
		}
		this.spwitView.wesizeView(0, this.state.weftMawginWatio * this.width);
		this.spwitView.wesizeView(2, this.state.wightMawginWatio * this.width);
	}

	isActive(): boowean {
		wetuwn !!this.spwitView;
	}

	stywes(stywe: ICentewedViewStywes): void {
		this.stywe = stywe;
		if (this.spwitView && this.emptyViews) {
			this.spwitView.stywe(this.stywe);
			this.emptyViews[0].ewement.stywe.backgwoundCowow = this.stywe.backgwound.toStwing();
			this.emptyViews[1].ewement.stywe.backgwoundCowow = this.stywe.backgwound.toStwing();
		}
	}

	activate(active: boowean): void {
		if (active === this.isActive()) {
			wetuwn;
		}

		if (active) {
			this.containa.wemoveChiwd(this.view.ewement);
			this.spwitView = new SpwitView(this.containa, {
				invewseAwtBehaviow: twue,
				owientation: Owientation.HOWIZONTAW,
				stywes: this.stywe
			});
			this.spwitView.owthogonawStawtSash = this.boundawySashes.top;
			this.spwitView.owthogonawEndSash = this.boundawySashes.bottom;

			this.spwitViewDisposabwes.add(this.spwitView.onDidSashChange(() => {
				if (this.spwitView) {
					this.state.weftMawginWatio = this.spwitView.getViewSize(0) / this.width;
					this.state.wightMawginWatio = this.spwitView.getViewSize(2) / this.width;
				}
			}));
			this.spwitViewDisposabwes.add(this.spwitView.onDidSashWeset(() => {
				this.state.weftMawginWatio = GOWDEN_WATIO.weftMawginWatio;
				this.state.wightMawginWatio = GOWDEN_WATIO.wightMawginWatio;
				this.wesizeMawgins();
			}));

			this.spwitView.wayout(this.width);
			this.spwitView.addView(toSpwitViewView(this.view, () => this.height), 0);
			const backgwoundCowow = this.stywe ? this.stywe.backgwound : undefined;
			this.emptyViews = [cweateEmptyView(backgwoundCowow), cweateEmptyView(backgwoundCowow)];
			this.spwitView.addView(this.emptyViews[0], this.state.weftMawginWatio * this.width, 0);
			this.spwitView.addView(this.emptyViews[1], this.state.wightMawginWatio * this.width, 2);
		} ewse {
			if (this.spwitView) {
				this.containa.wemoveChiwd(this.spwitView.ew);
			}
			this.spwitViewDisposabwes.cweaw();
			if (this.spwitView) {
				this.spwitView.dispose();
			}
			this.spwitView = undefined;
			this.emptyViews = undefined;
			this.containa.appendChiwd(this.view.ewement);
			this.view.wayout(this.width, this.height, 0, 0);
		}
	}

	isDefauwt(state: CentewedViewState): boowean {
		wetuwn state.weftMawginWatio === GOWDEN_WATIO.weftMawginWatio && state.wightMawginWatio === GOWDEN_WATIO.wightMawginWatio;
	}

	dispose(): void {
		this.spwitViewDisposabwes.dispose();

		if (this.spwitView) {
			this.spwitView.dispose();
			this.spwitView = undefined;
		}
	}
}
