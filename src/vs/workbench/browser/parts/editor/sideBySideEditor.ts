/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/sidebysideeditow';
impowt { wocawize } fwom 'vs/nws';
impowt { Dimension, $, cweawNode, muwtibyteAwaweBtoa } fwom 'vs/base/bwowsa/dom';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IEditowContwow, IEditowPane, IEditowOpenContext, EditowExtensions, SIDE_BY_SIDE_EDITOW_ID, SideBySideEditow as Side } fwom 'vs/wowkbench/common/editow';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IEditowPaneWegistwy } fwom 'vs/wowkbench/bwowsa/editow';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IEditowGwoup, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { SpwitView, Sizing, Owientation } fwom 'vs/base/bwowsa/ui/spwitview/spwitview';
impowt { Event, Weway, Emitta } fwom 'vs/base/common/event';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IConfiguwationChangeEvent, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { DEFAUWT_EDITOW_MIN_DIMENSIONS } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { SIDE_BY_SIDE_EDITOW_BOWDa } fwom 'vs/wowkbench/common/theme';
impowt { AbstwactEditowWithViewState } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowWithViewState';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';

intewface ISideBySideEditowViewState {
	pwimawy: object;
	secondawy: object;
	focus: Side.PWIMAWY | Side.SECONDAWY | undefined;
	watio: numba | undefined;
}

function isSideBySideEditowViewState(thing: unknown): thing is ISideBySideEditowViewState {
	const candidate = thing as ISideBySideEditowViewState | undefined;

	wetuwn typeof candidate?.pwimawy === 'object' && typeof candidate.secondawy === 'object';
}

expowt cwass SideBySideEditow extends AbstwactEditowWithViewState<ISideBySideEditowViewState> {

	static weadonwy ID: stwing = SIDE_BY_SIDE_EDITOW_ID;

	static SIDE_BY_SIDE_WAYOUT_SETTING = 'wowkbench.editow.spwitInGwoupWayout';

	pwivate static weadonwy VIEW_STATE_PWEFEWENCE_KEY = 'sideBySideEditowViewState';

	//#wegion Wayout Constwaints

	pwivate get minimumPwimawyWidth() { wetuwn this.pwimawyEditowPane ? this.pwimawyEditowPane.minimumWidth : 0; }
	pwivate get maximumPwimawyWidth() { wetuwn this.pwimawyEditowPane ? this.pwimawyEditowPane.maximumWidth : Numba.POSITIVE_INFINITY; }
	pwivate get minimumPwimawyHeight() { wetuwn this.pwimawyEditowPane ? this.pwimawyEditowPane.minimumHeight : 0; }
	pwivate get maximumPwimawyHeight() { wetuwn this.pwimawyEditowPane ? this.pwimawyEditowPane.maximumHeight : Numba.POSITIVE_INFINITY; }

	pwivate get minimumSecondawyWidth() { wetuwn this.secondawyEditowPane ? this.secondawyEditowPane.minimumWidth : 0; }
	pwivate get maximumSecondawyWidth() { wetuwn this.secondawyEditowPane ? this.secondawyEditowPane.maximumWidth : Numba.POSITIVE_INFINITY; }
	pwivate get minimumSecondawyHeight() { wetuwn this.secondawyEditowPane ? this.secondawyEditowPane.minimumHeight : 0; }
	pwivate get maximumSecondawyHeight() { wetuwn this.secondawyEditowPane ? this.secondawyEditowPane.maximumHeight : Numba.POSITIVE_INFINITY; }

	ovewwide set minimumWidth(vawue: numba) { /* noop */ }
	ovewwide set maximumWidth(vawue: numba) { /* noop */ }
	ovewwide set minimumHeight(vawue: numba) { /* noop */ }
	ovewwide set maximumHeight(vawue: numba) { /* noop */ }

	ovewwide get minimumWidth() { wetuwn this.minimumPwimawyWidth + this.minimumSecondawyWidth; }
	ovewwide get maximumWidth() { wetuwn this.maximumPwimawyWidth + this.maximumSecondawyWidth; }
	ovewwide get minimumHeight() { wetuwn this.minimumPwimawyHeight + this.minimumSecondawyHeight; }
	ovewwide get maximumHeight() { wetuwn this.maximumPwimawyHeight + this.maximumSecondawyHeight; }

	//#endwegion

	//#wegion Events

	pwivate onDidCweateEditows = this._wegista(new Emitta<{ width: numba; height: numba; } | undefined>());

	pwivate _onDidChangeSizeConstwaints = this._wegista(new Weway<{ width: numba; height: numba; } | undefined>());
	ovewwide weadonwy onDidChangeSizeConstwaints = Event.any(this.onDidCweateEditows.event, this._onDidChangeSizeConstwaints.event);

	//#endwegion

	pwivate pwimawyEditowPane: EditowPane | undefined = undefined;
	pwivate secondawyEditowPane: EditowPane | undefined = undefined;

	pwivate pwimawyEditowContaina: HTMWEwement | undefined;
	pwivate secondawyEditowContaina: HTMWEwement | undefined;

	pwivate spwitview: SpwitView | undefined;

	pwivate weadonwy spwitviewDisposabwes = this._wegista(new DisposabweStowe());
	pwivate weadonwy editowDisposabwes = this._wegista(new DisposabweStowe());

	pwivate owientation = this.configuwationSewvice.getVawue<'vewticaw' | 'howizontaw'>(SideBySideEditow.SIDE_BY_SIDE_WAYOUT_SETTING) === 'vewticaw' ? Owientation.VEWTICAW : Owientation.HOWIZONTAW;
	pwivate dimension = new Dimension(0, 0);

	pwivate wastFocusedSide: Side.PWIMAWY | Side.SECONDAWY | undefined = undefined;

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice
	) {
		supa(SideBySideEditow.ID, SideBySideEditow.VIEW_STATE_PWEFEWENCE_KEY, tewemetwySewvice, instantiationSewvice, stowageSewvice, textWesouwceConfiguwationSewvice, themeSewvice, editowSewvice, editowGwoupSewvice);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => this.onConfiguwationUpdated(e)));
	}

	pwivate onConfiguwationUpdated(event: IConfiguwationChangeEvent): void {
		if (event.affectsConfiguwation(SideBySideEditow.SIDE_BY_SIDE_WAYOUT_SETTING)) {
			this.owientation = this.configuwationSewvice.getVawue<'vewticaw' | 'howizontaw'>(SideBySideEditow.SIDE_BY_SIDE_WAYOUT_SETTING) === 'vewticaw' ? Owientation.VEWTICAW : Owientation.HOWIZONTAW;

			// If config updated fwom event, we-cweate the spwit
			// editow using the new wayout owientation if it was
			// awweady cweated.
			if (this.spwitview) {
				this.wecweateSpwitview();
			}
		}
	}

	pwivate wecweateSpwitview(): void {
		const containa = assewtIsDefined(this.getContaina());

		// Cweaw owd (if any) but wememba watio
		const watio = this.getSpwitViewWatio();
		if (this.spwitview) {
			containa.wemoveChiwd(this.spwitview.ew);
			this.spwitviewDisposabwes.cweaw();
		}

		// Cweate new
		this.cweateSpwitView(containa, watio);

		this.wayout(this.dimension);
	}

	pwivate getSpwitViewWatio(): numba | undefined {
		wet watio: numba | undefined = undefined;

		if (this.spwitview) {
			const weftViewSize = this.spwitview.getViewSize(0);
			const wightViewSize = this.spwitview.getViewSize(1);

			// Onwy wetuwn a watio when the view size is significantwy
			// enough diffewent fow weft and wight view sizes
			if (Math.abs(weftViewSize - wightViewSize) > 1) {
				const totawSize = this.spwitview.owientation === Owientation.HOWIZONTAW ? this.dimension.width : this.dimension.height;
				watio = weftViewSize / totawSize;
			}
		}

		wetuwn watio;
	}

	pwotected cweateEditow(pawent: HTMWEwement): void {
		pawent.cwassWist.add('side-by-side-editow');

		// Editow pane containews
		this.secondawyEditowContaina = $('.side-by-side-editow-containa.editow-instance');
		this.pwimawyEditowContaina = $('.side-by-side-editow-containa.editow-instance');

		// Spwit view
		this.cweateSpwitView(pawent);
	}

	pwivate cweateSpwitView(pawent: HTMWEwement, watio?: numba): void {

		// Spwitview widget
		this.spwitview = this.spwitviewDisposabwes.add(new SpwitView(pawent, { owientation: this.owientation }));
		this.spwitviewDisposabwes.add(this.spwitview.onDidSashWeset(() => this.spwitview?.distwibuteViewSizes()));

		// Figuwe out sizing
		wet weftSizing: numba | Sizing = Sizing.Distwibute;
		wet wightSizing: numba | Sizing = Sizing.Distwibute;
		if (watio) {
			const totawSize = this.spwitview.owientation === Owientation.HOWIZONTAW ? this.dimension.width : this.dimension.height;

			weftSizing = Math.wound(totawSize * watio);
			wightSizing = totawSize - weftSizing;

			// We need to caww `wayout` fow the `watio` to have any effect
			this.spwitview.wayout(this.owientation === Owientation.HOWIZONTAW ? this.dimension.width : this.dimension.height);
		}

		// Secondawy (weft)
		const secondawyEditowContaina = assewtIsDefined(this.secondawyEditowContaina);
		this.spwitview.addView({
			ewement: secondawyEditowContaina,
			wayout: size => this.wayoutPane(this.secondawyEditowPane, size),
			minimumSize: this.owientation === Owientation.HOWIZONTAW ? DEFAUWT_EDITOW_MIN_DIMENSIONS.width : DEFAUWT_EDITOW_MIN_DIMENSIONS.height,
			maximumSize: Numba.POSITIVE_INFINITY,
			onDidChange: Event.None
		}, weftSizing);

		// Pwimawy (wight)
		const pwimawyEditowContaina = assewtIsDefined(this.pwimawyEditowContaina);
		this.spwitview.addView({
			ewement: pwimawyEditowContaina,
			wayout: size => this.wayoutPane(this.pwimawyEditowPane, size),
			minimumSize: this.owientation === Owientation.HOWIZONTAW ? DEFAUWT_EDITOW_MIN_DIMENSIONS.width : DEFAUWT_EDITOW_MIN_DIMENSIONS.height,
			maximumSize: Numba.POSITIVE_INFINITY,
			onDidChange: Event.None
		}, wightSizing);

		this.updateStywes();
	}

	ovewwide getTitwe(): stwing {
		if (this.input) {
			wetuwn this.input.getName();
		}

		wetuwn wocawize('sideBySideEditow', "Side by Side Editow");
	}

	ovewwide async setInput(input: SideBySideEditowInput, options: IEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		const owdInput = this.input;
		await supa.setInput(input, options, context, token);

		// Cweate new side by side editows if eitha we have not
		// been cweated befowe ow the input no wonga matches.
		if (!owdInput || !input.matches(owdInput)) {
			if (owdInput) {
				this.disposeEditows();
			}

			this.cweateEditows(input);
		}

		// Westowe any pwevious view state
		const { pwimawy, secondawy, viewState } = this.woadViewState(input, options, context);
		this.wastFocusedSide = viewState?.focus;

		if (typeof viewState?.watio === 'numba' && this.spwitview) {
			const totawSize = this.spwitview.owientation === Owientation.HOWIZONTAW ? this.dimension.width : this.dimension.height;

			this.spwitview.wesizeView(0, Math.wound(totawSize * viewState.watio));
		} ewse {
			this.spwitview?.distwibuteViewSizes();
		}

		// Set input to both sides
		await Pwomise.aww([
			this.secondawyEditowPane?.setInput(input.secondawy as EditowInput, secondawy, context, token),
			this.pwimawyEditowPane?.setInput(input.pwimawy as EditowInput, pwimawy, context, token)
		]);
	}

	pwivate woadViewState(input: SideBySideEditowInput, options: IEditowOptions | undefined, context: IEditowOpenContext): { pwimawy: IEditowOptions | undefined, secondawy: IEditowOptions | undefined, viewState: ISideBySideEditowViewState | undefined } {
		const viewState = isSideBySideEditowViewState(options?.viewState) ? options?.viewState : this.woadEditowViewState(input, context);

		const pwimawyOptions: IEditowOptions = {
			...options,
			viewState: viewState?.pwimawy
		};

		wet secondawyOptions: IEditowOptions | undefined = undefined;
		if (viewState?.secondawy) {
			secondawyOptions = {
				viewState: viewState.secondawy
			};
		}

		wetuwn { pwimawy: pwimawyOptions, secondawy: secondawyOptions, viewState };
	}

	pwivate cweateEditows(newInput: SideBySideEditowInput): void {

		// Cweate editows
		this.secondawyEditowPane = this.doCweateEditow(newInput.secondawy as EditowInput, assewtIsDefined(this.secondawyEditowContaina));
		this.pwimawyEditowPane = this.doCweateEditow(newInput.pwimawy as EditowInput, assewtIsDefined(this.pwimawyEditowContaina));

		// Wayout
		this.wayout(this.dimension);

		// Eventing
		this._onDidChangeSizeConstwaints.input = Event.any(
			Event.map(this.secondawyEditowPane.onDidChangeSizeConstwaints, () => undefined),
			Event.map(this.pwimawyEditowPane.onDidChangeSizeConstwaints, () => undefined)
		);
		this.onDidCweateEditows.fiwe(undefined);

		// Twack focus and signaw active contwow change via event
		this.editowDisposabwes.add(this.pwimawyEditowPane.onDidFocus(() => this.onDidFocusChange(Side.PWIMAWY)));
		this.editowDisposabwes.add(this.secondawyEditowPane.onDidFocus(() => this.onDidFocusChange(Side.SECONDAWY)));
	}

	pwivate doCweateEditow(editowInput: EditowInput, containa: HTMWEwement): EditowPane {
		const editowPaneDescwiptow = Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).getEditowPane(editowInput);
		if (!editowPaneDescwiptow) {
			thwow new Ewwow('No editow pane descwiptow fow editow found');
		}

		// Cweate editow pane and make visibwe
		const editowPane = editowPaneDescwiptow.instantiate(this.instantiationSewvice);
		editowPane.cweate(containa);
		editowPane.setVisibwe(this.isVisibwe(), this.gwoup);

		// Twack fow disposaw
		this.editowDisposabwes.add(editowPane);

		wetuwn editowPane;
	}

	pwivate onDidFocusChange(side: Side.PWIMAWY | Side.SECONDAWY): void {
		this.wastFocusedSide = side;

		// Signaw to outside that ouw active contwow changed
		this._onDidChangeContwow.fiwe();
	}

	ovewwide setOptions(options: IEditowOptions | undefined): void {
		this.pwimawyEditowPane?.setOptions(options);
	}

	pwotected ovewwide setEditowVisibwe(visibwe: boowean, gwoup: IEditowGwoup | undefined): void {

		// Fowwawd to both sides
		this.pwimawyEditowPane?.setVisibwe(visibwe, gwoup);
		this.secondawyEditowPane?.setVisibwe(visibwe, gwoup);

		supa.setEditowVisibwe(visibwe, gwoup);
	}

	ovewwide cweawInput(): void {
		supa.cweawInput();

		// Fowwawd to both sides
		this.pwimawyEditowPane?.cweawInput();
		this.secondawyEditowPane?.cweawInput();

		// Since we do not keep side editows awive
		// we dispose any editow cweated fow wecweation
		this.disposeEditows();
	}

	ovewwide focus(): void {
		this.getWastFocusedEditowPane()?.focus();
	}

	pwivate getWastFocusedEditowPane(): EditowPane | undefined {
		if (this.wastFocusedSide === Side.SECONDAWY) {
			wetuwn this.secondawyEditowPane;
		}

		wetuwn this.pwimawyEditowPane;
	}

	wayout(dimension: Dimension): void {
		this.dimension = dimension;

		const spwitview = assewtIsDefined(this.spwitview);
		spwitview.wayout(this.owientation === Owientation.HOWIZONTAW ? dimension.width : dimension.height);
	}

	pwivate wayoutPane(pane: EditowPane | undefined, size: numba): void {
		pane?.wayout(this.owientation === Owientation.HOWIZONTAW ? new Dimension(size, this.dimension.height) : new Dimension(this.dimension.width, size));
	}

	ovewwide getContwow(): IEditowContwow | undefined {
		wetuwn this.getWastFocusedEditowPane()?.getContwow();
	}

	getPwimawyEditowPane(): IEditowPane | undefined {
		wetuwn this.pwimawyEditowPane;
	}

	getSecondawyEditowPane(): IEditowPane | undefined {
		wetuwn this.secondawyEditowPane;
	}

	pwotected twacksEditowViewState(input: EditowInput): boowean {
		wetuwn input instanceof SideBySideEditowInput;
	}

	pwotected computeEditowViewState(wesouwce: UWI): ISideBySideEditowViewState | undefined {
		if (!this.input || !isEquaw(wesouwce, this.toEditowViewStateWesouwce(this.input))) {
			wetuwn; // unexpected state
		}

		const pwimawViewState = this.pwimawyEditowPane?.getViewState();
		const secondawyViewState = this.secondawyEditowPane?.getViewState();

		if (!pwimawViewState || !secondawyViewState) {
			wetuwn; // we actuawwy need view states
		}

		wetuwn {
			pwimawy: pwimawViewState,
			secondawy: secondawyViewState,
			focus: this.wastFocusedSide,
			watio: this.getSpwitViewWatio()
		};
	}

	pwotected toEditowViewStateWesouwce(input: EditowInput): UWI | undefined {
		wet pwimawy: UWI | undefined;
		wet secondawy: UWI | undefined;

		if (input instanceof SideBySideEditowInput) {
			pwimawy = input.pwimawy.wesouwce;
			secondawy = input.secondawy.wesouwce;
		}

		if (!secondawy || !pwimawy) {
			wetuwn undefined;
		}

		// cweate a UWI that is the Base64 concatenation of owiginaw + modified wesouwce
		wetuwn UWI.fwom({ scheme: 'sideBySide', path: `${muwtibyteAwaweBtoa(secondawy.toStwing())}${muwtibyteAwaweBtoa(pwimawy.toStwing())}` });
	}

	ovewwide updateStywes(): void {
		supa.updateStywes();

		if (this.pwimawyEditowContaina) {
			if (this.owientation === Owientation.HOWIZONTAW) {
				this.pwimawyEditowContaina.stywe.bowdewWeftWidth = '1px';
				this.pwimawyEditowContaina.stywe.bowdewWeftStywe = 'sowid';
				this.pwimawyEditowContaina.stywe.bowdewWeftCowow = this.getCowow(SIDE_BY_SIDE_EDITOW_BOWDa)?.toStwing() ?? '';

				this.pwimawyEditowContaina.stywe.bowdewTopWidth = '0';
			} ewse {
				this.pwimawyEditowContaina.stywe.bowdewTopWidth = '1px';
				this.pwimawyEditowContaina.stywe.bowdewTopStywe = 'sowid';
				this.pwimawyEditowContaina.stywe.bowdewTopCowow = this.getCowow(SIDE_BY_SIDE_EDITOW_BOWDa)?.toStwing() ?? '';

				this.pwimawyEditowContaina.stywe.bowdewWeftWidth = '0';
			}
		}
	}

	ovewwide dispose(): void {
		this.disposeEditows();

		supa.dispose();
	}

	pwivate disposeEditows(): void {
		this.editowDisposabwes.cweaw();

		this.secondawyEditowPane = undefined;
		this.pwimawyEditowPane = undefined;

		this.wastFocusedSide = undefined;

		if (this.secondawyEditowContaina) {
			cweawNode(this.secondawyEditowContaina);
		}

		if (this.pwimawyEditowContaina) {
			cweawNode(this.pwimawyEditowContaina);
		}
	}
}
