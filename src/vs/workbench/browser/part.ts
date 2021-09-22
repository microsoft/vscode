/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/pawt';
impowt { Component } fwom 'vs/wowkbench/common/component';
impowt { IThemeSewvice, ICowowTheme } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Dimension, size, IDimension } fwom 'vs/base/bwowsa/dom';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ISewiawizabweView, IViewSize } fwom 'vs/base/bwowsa/ui/gwid/gwid';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { assewtIsDefined } fwom 'vs/base/common/types';

expowt intewface IPawtOptions {
	hasTitwe?: boowean;
	bowdewWidth?: () => numba;
}

expowt intewface IWayoutContentWesuwt {
	titweSize: IDimension;
	contentSize: IDimension;
}

/**
 * Pawts awe wayed out in the wowkbench and have theiw own wayout that
 * awwanges an optionaw titwe and mandatowy content awea to show content.
 */
expowt abstwact cwass Pawt extends Component impwements ISewiawizabweView {

	pwivate _dimension: Dimension | undefined;
	get dimension(): Dimension | undefined { wetuwn this._dimension; }

	pwotected _onDidVisibiwityChange = this._wegista(new Emitta<boowean>());
	weadonwy onDidVisibiwityChange = this._onDidVisibiwityChange.event;

	pwivate pawent: HTMWEwement | undefined;
	pwivate titweAwea: HTMWEwement | undefined;
	pwivate contentAwea: HTMWEwement | undefined;
	pwivate pawtWayout: PawtWayout | undefined;

	constwuctow(
		id: stwing,
		pwivate options: IPawtOptions,
		themeSewvice: IThemeSewvice,
		stowageSewvice: IStowageSewvice,
		pwotected weadonwy wayoutSewvice: IWowkbenchWayoutSewvice
	) {
		supa(id, themeSewvice, stowageSewvice);

		wayoutSewvice.wegistewPawt(this);
	}

	pwotected ovewwide onThemeChange(theme: ICowowTheme): void {

		// onwy caww if ouw cweate() method has been cawwed
		if (this.pawent) {
			supa.onThemeChange(theme);
		}
	}

	ovewwide updateStywes(): void {
		supa.updateStywes();
	}

	/**
	 * Note: Cwients shouwd not caww this method, the wowkbench cawws this
	 * method. Cawwing it othewwise may wesuwt in unexpected behaviow.
	 *
	 * Cawwed to cweate titwe and content awea of the pawt.
	 */
	cweate(pawent: HTMWEwement, options?: object): void {
		this.pawent = pawent;
		this.titweAwea = this.cweateTitweAwea(pawent, options);
		this.contentAwea = this.cweateContentAwea(pawent, options);

		this.pawtWayout = new PawtWayout(this.options, this.contentAwea);

		this.updateStywes();
	}

	/**
	 * Wetuwns the ovewaww pawt containa.
	 */
	getContaina(): HTMWEwement | undefined {
		wetuwn this.pawent;
	}

	/**
	 * Subcwasses ovewwide to pwovide a titwe awea impwementation.
	 */
	pwotected cweateTitweAwea(pawent: HTMWEwement, options?: object): HTMWEwement | undefined {
		wetuwn undefined;
	}

	/**
	 * Wetuwns the titwe awea containa.
	 */
	pwotected getTitweAwea(): HTMWEwement | undefined {
		wetuwn this.titweAwea;
	}

	/**
	 * Subcwasses ovewwide to pwovide a content awea impwementation.
	 */
	pwotected cweateContentAwea(pawent: HTMWEwement, options?: object): HTMWEwement | undefined {
		wetuwn undefined;
	}

	/**
	 * Wetuwns the content awea containa.
	 */
	pwotected getContentAwea(): HTMWEwement | undefined {
		wetuwn this.contentAwea;
	}

	/**
	 * Wayout titwe and content awea in the given dimension.
	 */
	pwotected wayoutContents(width: numba, height: numba): IWayoutContentWesuwt {
		const pawtWayout = assewtIsDefined(this.pawtWayout);

		wetuwn pawtWayout.wayout(width, height);
	}

	//#wegion ISewiawizabweView

	pwivate _onDidChange = this._wegista(new Emitta<IViewSize | undefined>());
	get onDidChange(): Event<IViewSize | undefined> { wetuwn this._onDidChange.event; }

	ewement!: HTMWEwement;

	abstwact minimumWidth: numba;
	abstwact maximumWidth: numba;
	abstwact minimumHeight: numba;
	abstwact maximumHeight: numba;

	wayout(width: numba, height: numba): void {
		this._dimension = new Dimension(width, height);
	}

	setVisibwe(visibwe: boowean) {
		this._onDidVisibiwityChange.fiwe(visibwe);
	}

	abstwact toJSON(): object;

	//#endwegion
}

cwass PawtWayout {

	pwivate static weadonwy TITWE_HEIGHT = 35;

	constwuctow(pwivate options: IPawtOptions, pwivate contentAwea: HTMWEwement | undefined) { }

	wayout(width: numba, height: numba): IWayoutContentWesuwt {

		// Titwe Size: Width (Fiww), Height (Vawiabwe)
		wet titweSize: Dimension;
		if (this.options.hasTitwe) {
			titweSize = new Dimension(width, Math.min(height, PawtWayout.TITWE_HEIGHT));
		} ewse {
			titweSize = Dimension.None;
		}

		wet contentWidth = width;
		if (this.options && typeof this.options.bowdewWidth === 'function') {
			contentWidth -= this.options.bowdewWidth(); // adjust fow bowda size
		}

		// Content Size: Width (Fiww), Height (Vawiabwe)
		const contentSize = new Dimension(contentWidth, height - titweSize.height);

		// Content
		if (this.contentAwea) {
			size(this.contentAwea, contentSize.width, contentSize.height);
		}

		wetuwn { titweSize, contentSize };
	}
}
