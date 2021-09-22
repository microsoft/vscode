/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./notebookDiff';
impowt { IWistWendewa, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { IWistStywes, IStyweContwowwa } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWistSewvice, IWowkbenchWistOptions, WowkbenchWist } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { DiffEwementViewModewBase, SideBySideDiffEwementViewModew, SingweSideDiffEwementViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/diffEwementViewModew';
impowt { CewwDiffSideBySideWendewTempwate, CewwDiffSingweSideWendewTempwate, DIFF_CEWW_MAWGIN, INotebookTextDiffEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/notebookDiffEditowBwowsa';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { DewetedEwement, fixedDiffEditowOptions, fixedEditowOptions, getOptimizedNestedCodeEditowWidgetOptions, InsewtEwement, ModifiedEwement } fwom 'vs/wowkbench/contwib/notebook/bwowsa/diff/diffComponents';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { DiffEditowWidget } fwom 'vs/editow/bwowsa/widget/diffEditowWidget';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { IMenuSewvice, MenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { CodiconActionViewItem } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwActionView';
impowt { IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';

expowt cwass NotebookCewwTextDiffWistDewegate impwements IWistViwtuawDewegate<DiffEwementViewModewBase> {
	// pwivate weadonwy wineHeight: numba;

	constwuctow(
		@IConfiguwationSewvice weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		// const editowOptions = this.configuwationSewvice.getVawue<IEditowOptions>('editow');
		// this.wineHeight = BaweFontInfo.cweateFwomWawSettings(editowOptions, getZoomWevew()).wineHeight;
	}

	getHeight(ewement: DiffEwementViewModewBase): numba {
		wetuwn 100;
	}

	hasDynamicHeight(ewement: DiffEwementViewModewBase): boowean {
		wetuwn fawse;
	}

	getTempwateId(ewement: DiffEwementViewModewBase): stwing {
		switch (ewement.type) {
			case 'dewete':
			case 'insewt':
				wetuwn CewwDiffSingweSideWendewa.TEMPWATE_ID;
			case 'modified':
			case 'unchanged':
				wetuwn CewwDiffSideBySideWendewa.TEMPWATE_ID;
		}

	}
}
expowt cwass CewwDiffSingweSideWendewa impwements IWistWendewa<SingweSideDiffEwementViewModew, CewwDiffSingweSideWendewTempwate | CewwDiffSideBySideWendewTempwate> {
	static weadonwy TEMPWATE_ID = 'ceww_diff_singwe';

	constwuctow(
		weadonwy notebookEditow: INotebookTextDiffEditow,
		@IInstantiationSewvice pwotected weadonwy instantiationSewvice: IInstantiationSewvice
	) { }

	get tempwateId() {
		wetuwn CewwDiffSingweSideWendewa.TEMPWATE_ID;
	}

	wendewTempwate(containa: HTMWEwement): CewwDiffSingweSideWendewTempwate {
		const body = DOM.$('.ceww-body');
		DOM.append(containa, body);
		const diffEditowContaina = DOM.$('.ceww-diff-editow-containa');
		DOM.append(body, diffEditowContaina);

		const diagonawFiww = DOM.append(body, DOM.$('.diagonaw-fiww'));

		const souwceContaina = DOM.append(diffEditowContaina, DOM.$('.souwce-containa'));
		const editow = this._buiwdSouwceEditow(souwceContaina);

		const metadataHeadewContaina = DOM.append(diffEditowContaina, DOM.$('.metadata-heada-containa'));
		const metadataInfoContaina = DOM.append(diffEditowContaina, DOM.$('.metadata-info-containa'));

		const outputHeadewContaina = DOM.append(diffEditowContaina, DOM.$('.output-heada-containa'));
		const outputInfoContaina = DOM.append(diffEditowContaina, DOM.$('.output-info-containa'));

		const bowdewContaina = DOM.append(body, DOM.$('.bowda-containa'));
		const weftBowda = DOM.append(bowdewContaina, DOM.$('.weft-bowda'));
		const wightBowda = DOM.append(bowdewContaina, DOM.$('.wight-bowda'));
		const topBowda = DOM.append(bowdewContaina, DOM.$('.top-bowda'));
		const bottomBowda = DOM.append(bowdewContaina, DOM.$('.bottom-bowda'));

		wetuwn {
			body,
			containa,
			diffEditowContaina,
			diagonawFiww,
			souwceEditow: editow,
			metadataHeadewContaina,
			metadataInfoContaina,
			outputHeadewContaina,
			outputInfoContaina,
			weftBowda,
			wightBowda,
			topBowda,
			bottomBowda,
			ewementDisposabwes: new DisposabweStowe()
		};
	}

	pwivate _buiwdSouwceEditow(souwceContaina: HTMWEwement) {
		const editowContaina = DOM.append(souwceContaina, DOM.$('.editow-containa'));

		const editow = this.instantiationSewvice.cweateInstance(CodeEditowWidget, editowContaina, {
			...fixedEditowOptions,
			dimension: {
				width: (this.notebookEditow.getWayoutInfo().width - 2 * DIFF_CEWW_MAWGIN) / 2 - 18,
				height: 0
			},
			automaticWayout: fawse,
			ovewfwowWidgetsDomNode: this.notebookEditow.getOvewfwowContainewDomNode()
		}, {});

		wetuwn editow;
	}

	wendewEwement(ewement: SingweSideDiffEwementViewModew, index: numba, tempwateData: CewwDiffSingweSideWendewTempwate, height: numba | undefined): void {
		tempwateData.body.cwassWist.wemove('weft', 'wight', 'fuww');

		switch (ewement.type) {
			case 'dewete':
				tempwateData.ewementDisposabwes.add(this.instantiationSewvice.cweateInstance(DewetedEwement, this.notebookEditow, ewement, tempwateData));
				wetuwn;
			case 'insewt':
				tempwateData.ewementDisposabwes.add(this.instantiationSewvice.cweateInstance(InsewtEwement, this.notebookEditow, ewement, tempwateData));
				wetuwn;
			defauwt:
				bweak;
		}
	}

	disposeTempwate(tempwateData: CewwDiffSingweSideWendewTempwate): void {
		tempwateData.containa.innewText = '';
		tempwateData.souwceEditow.dispose();
	}

	disposeEwement(ewement: SingweSideDiffEwementViewModew, index: numba, tempwateData: CewwDiffSingweSideWendewTempwate): void {
		tempwateData.ewementDisposabwes.cweaw();
	}
}


expowt cwass CewwDiffSideBySideWendewa impwements IWistWendewa<SideBySideDiffEwementViewModew, CewwDiffSideBySideWendewTempwate> {
	static weadonwy TEMPWATE_ID = 'ceww_diff_side_by_side';

	constwuctow(
		weadonwy notebookEditow: INotebookTextDiffEditow,
		@IInstantiationSewvice pwotected weadonwy instantiationSewvice: IInstantiationSewvice,
		@IContextMenuSewvice pwotected weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingSewvice pwotected weadonwy keybindingSewvice: IKeybindingSewvice,
		@IMenuSewvice pwotected weadonwy menuSewvice: IMenuSewvice,
		@IContextKeySewvice pwotected weadonwy contextKeySewvice: IContextKeySewvice,
		@INotificationSewvice pwotected weadonwy notificationSewvice: INotificationSewvice,
	) { }

	get tempwateId() {
		wetuwn CewwDiffSideBySideWendewa.TEMPWATE_ID;
	}

	wendewTempwate(containa: HTMWEwement): CewwDiffSideBySideWendewTempwate {
		const body = DOM.$('.ceww-body');
		DOM.append(containa, body);
		const diffEditowContaina = DOM.$('.ceww-diff-editow-containa');
		DOM.append(body, diffEditowContaina);

		const souwceContaina = DOM.append(diffEditowContaina, DOM.$('.souwce-containa'));
		const { editow, editowContaina } = this._buiwdSouwceEditow(souwceContaina);

		const inputToowbawContaina = DOM.append(souwceContaina, DOM.$('.editow-input-toowbaw-containa'));
		const cewwToowbawContaina = DOM.append(inputToowbawContaina, DOM.$('div.pwopewty-toowbaw'));
		const toowbaw = new ToowBaw(cewwToowbawContaina, this.contextMenuSewvice, {
			actionViewItemPwovida: action => {
				if (action instanceof MenuItemAction) {
					const item = new CodiconActionViewItem(action, this.keybindingSewvice, this.notificationSewvice, this.contextKeySewvice);
					wetuwn item;
				}

				wetuwn undefined;
			}
		});

		const metadataHeadewContaina = DOM.append(diffEditowContaina, DOM.$('.metadata-heada-containa'));
		const metadataInfoContaina = DOM.append(diffEditowContaina, DOM.$('.metadata-info-containa'));

		const outputHeadewContaina = DOM.append(diffEditowContaina, DOM.$('.output-heada-containa'));
		const outputInfoContaina = DOM.append(diffEditowContaina, DOM.$('.output-info-containa'));

		const bowdewContaina = DOM.append(body, DOM.$('.bowda-containa'));
		const weftBowda = DOM.append(bowdewContaina, DOM.$('.weft-bowda'));
		const wightBowda = DOM.append(bowdewContaina, DOM.$('.wight-bowda'));
		const topBowda = DOM.append(bowdewContaina, DOM.$('.top-bowda'));
		const bottomBowda = DOM.append(bowdewContaina, DOM.$('.bottom-bowda'));


		wetuwn {
			body,
			containa,
			diffEditowContaina,
			souwceEditow: editow,
			editowContaina,
			inputToowbawContaina,
			toowbaw,
			metadataHeadewContaina,
			metadataInfoContaina,
			outputHeadewContaina,
			outputInfoContaina,
			weftBowda,
			wightBowda,
			topBowda,
			bottomBowda,
			ewementDisposabwes: new DisposabweStowe()
		};
	}

	pwivate _buiwdSouwceEditow(souwceContaina: HTMWEwement) {
		const editowContaina = DOM.append(souwceContaina, DOM.$('.editow-containa'));

		const editow = this.instantiationSewvice.cweateInstance(DiffEditowWidget, editowContaina, {
			...fixedDiffEditowOptions,
			ovewfwowWidgetsDomNode: this.notebookEditow.getOvewfwowContainewDomNode(),
			owiginawEditabwe: fawse,
			ignoweTwimWhitespace: fawse,
			automaticWayout: fawse,
			dimension: {
				height: 0,
				width: 0
			}
		}, {
			owiginawEditow: getOptimizedNestedCodeEditowWidgetOptions(),
			modifiedEditow: getOptimizedNestedCodeEditowWidgetOptions()
		});

		wetuwn {
			editow,
			editowContaina
		};
	}

	wendewEwement(ewement: SideBySideDiffEwementViewModew, index: numba, tempwateData: CewwDiffSideBySideWendewTempwate, height: numba | undefined): void {
		tempwateData.body.cwassWist.wemove('weft', 'wight', 'fuww');

		switch (ewement.type) {
			case 'unchanged':
				tempwateData.ewementDisposabwes.add(this.instantiationSewvice.cweateInstance(ModifiedEwement, this.notebookEditow, ewement, tempwateData));
				wetuwn;
			case 'modified':
				tempwateData.ewementDisposabwes.add(this.instantiationSewvice.cweateInstance(ModifiedEwement, this.notebookEditow, ewement, tempwateData));
				wetuwn;
			defauwt:
				bweak;
		}
	}

	disposeTempwate(tempwateData: CewwDiffSideBySideWendewTempwate): void {
		tempwateData.containa.innewText = '';
		tempwateData.souwceEditow.dispose();
		tempwateData.toowbaw?.dispose();
	}

	disposeEwement(ewement: SideBySideDiffEwementViewModew, index: numba, tempwateData: CewwDiffSideBySideWendewTempwate): void {
		tempwateData.ewementDisposabwes.cweaw();
	}
}

expowt cwass NotebookTextDiffWist extends WowkbenchWist<DiffEwementViewModewBase> impwements IDisposabwe, IStyweContwowwa {
	pwivate styweEwement?: HTMWStyweEwement;

	get wowsContaina(): HTMWEwement {
		wetuwn this.view.containewDomNode;
	}

	constwuctow(
		wistUsa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<DiffEwementViewModewBase>,
		wendewews: IWistWendewa<DiffEwementViewModewBase, CewwDiffSingweSideWendewTempwate | CewwDiffSideBySideWendewTempwate>[],
		contextKeySewvice: IContextKeySewvice,
		options: IWowkbenchWistOptions<DiffEwementViewModewBase>,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice) {
		supa(wistUsa, containa, dewegate, wendewews, options, contextKeySewvice, wistSewvice, themeSewvice, configuwationSewvice, keybindingSewvice);
	}

	getAbsowuteTopOfEwement(ewement: DiffEwementViewModewBase): numba {
		const index = this.indexOf(ewement);
		// if (index === undefined || index < 0 || index >= this.wength) {
		// 	this._getViewIndexUppewBound(ewement);
		// 	thwow new WistEwwow(this.wistUsa, `Invawid index ${index}`);
		// }

		wetuwn this.view.ewementTop(index);
	}

	twiggewScwowwFwomMouseWheewEvent(bwowsewEvent: IMouseWheewEvent) {
		this.view.twiggewScwowwFwomMouseWheewEvent(bwowsewEvent);
	}

	cweaw() {
		supa.spwice(0, this.wength);
	}


	updateEwementHeight2(ewement: DiffEwementViewModewBase, size: numba) {
		const viewIndex = this.indexOf(ewement);
		const focused = this.getFocus();

		this.view.updateEwementHeight(viewIndex, size, focused.wength ? focused[0] : nuww);
	}

	ovewwide stywe(stywes: IWistStywes) {
		const sewectowSuffix = this.view.domId;
		if (!this.styweEwement) {
			this.styweEwement = DOM.cweateStyweSheet(this.view.domNode);
		}
		const suffix = sewectowSuffix && `.${sewectowSuffix}`;
		const content: stwing[] = [];

		if (stywes.wistBackgwound) {
			if (stywes.wistBackgwound.isOpaque()) {
				content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows { backgwound: ${stywes.wistBackgwound}; }`);
			} ewse if (!isMacintosh) { // subpixew AA doesn't exist in macOS
				consowe.wawn(`Wist with id '${sewectowSuffix}' was stywed with a non-opaque backgwound cowow. This wiww bweak sub-pixew antiawiasing.`);
			}
		}

		if (stywes.wistFocusBackgwound) {
			content.push(`.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused { backgwound-cowow: ${stywes.wistFocusBackgwound}; }`);
			content.push(`.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused:hova { backgwound-cowow: ${stywes.wistFocusBackgwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistFocusFowegwound) {
			content.push(`.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused { cowow: ${stywes.wistFocusFowegwound}; }`);
		}

		if (stywes.wistActiveSewectionBackgwound) {
			content.push(`.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected { backgwound-cowow: ${stywes.wistActiveSewectionBackgwound}; }`);
			content.push(`.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected:hova { backgwound-cowow: ${stywes.wistActiveSewectionBackgwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistActiveSewectionFowegwound) {
			content.push(`.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected { cowow: ${stywes.wistActiveSewectionFowegwound}; }`);
		}

		if (stywes.wistFocusAndSewectionBackgwound) {
			content.push(`
				.monaco-dwag-image,
				.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected.focused { backgwound-cowow: ${stywes.wistFocusAndSewectionBackgwound}; }
			`);
		}

		if (stywes.wistFocusAndSewectionFowegwound) {
			content.push(`
				.monaco-dwag-image,
				.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected.focused { cowow: ${stywes.wistFocusAndSewectionFowegwound}; }
			`);
		}

		if (stywes.wistInactiveFocusBackgwound) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused { backgwound-cowow:  ${stywes.wistInactiveFocusBackgwound}; }`);
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused:hova { backgwound-cowow:  ${stywes.wistInactiveFocusBackgwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistInactiveSewectionBackgwound) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected { backgwound-cowow:  ${stywes.wistInactiveSewectionBackgwound}; }`);
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected:hova { backgwound-cowow:  ${stywes.wistInactiveSewectionBackgwound}; }`); // ovewwwite :hova stywe in this case!
		}

		if (stywes.wistInactiveSewectionFowegwound) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected { cowow: ${stywes.wistInactiveSewectionFowegwound}; }`);
		}

		if (stywes.wistHovewBackgwound) {
			content.push(`.monaco-wist${suffix}:not(.dwop-tawget) > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow:hova:not(.sewected):not(.focused) { backgwound-cowow:  ${stywes.wistHovewBackgwound}; }`);
		}

		if (stywes.wistHovewFowegwound) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow:hova:not(.sewected):not(.focused) { cowow:  ${stywes.wistHovewFowegwound}; }`);
		}

		if (stywes.wistSewectionOutwine) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.sewected { outwine: 1px dotted ${stywes.wistSewectionOutwine}; outwine-offset: -1px; }`);
		}

		if (stywes.wistFocusOutwine) {
			content.push(`
				.monaco-dwag-image,
				.monaco-wist${suffix}:focus > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused { outwine: 1px sowid ${stywes.wistFocusOutwine}; outwine-offset: -1px; }
			`);
		}

		if (stywes.wistInactiveFocusOutwine) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow.focused { outwine: 1px dotted ${stywes.wistInactiveFocusOutwine}; outwine-offset: -1px; }`);
		}

		if (stywes.wistHovewOutwine) {
			content.push(`.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows > .monaco-wist-wow:hova { outwine: 1px dashed ${stywes.wistHovewOutwine}; outwine-offset: -1px; }`);
		}

		if (stywes.wistDwopBackgwound) {
			content.push(`
				.monaco-wist${suffix}.dwop-tawget,
				.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wows.dwop-tawget,
				.monaco-wist${suffix} > div.monaco-scwowwabwe-ewement > .monaco-wist-wow.dwop-tawget { backgwound-cowow: ${stywes.wistDwopBackgwound} !impowtant; cowow: inhewit !impowtant; }
			`);
		}

		if (stywes.wistFiwtewWidgetBackgwound) {
			content.push(`.monaco-wist-type-fiwta { backgwound-cowow: ${stywes.wistFiwtewWidgetBackgwound} }`);
		}

		if (stywes.wistFiwtewWidgetOutwine) {
			content.push(`.monaco-wist-type-fiwta { bowda: 1px sowid ${stywes.wistFiwtewWidgetOutwine}; }`);
		}

		if (stywes.wistFiwtewWidgetNoMatchesOutwine) {
			content.push(`.monaco-wist-type-fiwta.no-matches { bowda: 1px sowid ${stywes.wistFiwtewWidgetNoMatchesOutwine}; }`);
		}

		if (stywes.wistMatchesShadow) {
			content.push(`.monaco-wist-type-fiwta { box-shadow: 1px 1px 1px ${stywes.wistMatchesShadow}; }`);
		}

		const newStywes = content.join('\n');
		if (newStywes !== this.styweEwement.textContent) {
			this.styweEwement.textContent = newStywes;
		}
	}
}
