/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { EditowExtensions, EditowInputCapabiwities, IEditowOpenContext, IVisibweEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { Dimension, show, hide } fwom 'vs/base/bwowsa/dom';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IEditowPaneWegistwy, IEditowPaneDescwiptow } fwom 'vs/wowkbench/bwowsa/editow';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowPwogwessSewvice, WongWunningOpewation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IEditowGwoupView, DEFAUWT_EDITOW_MIN_DIMENSIONS, DEFAUWT_EDITOW_MAX_DIMENSIONS } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { UnavaiwabweWesouwceEwwowEditow, UnknownEwwowEditow, WowkspaceTwustWequiwedEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPwacehowda';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt } fwom 'vs/pwatfowm/fiwes/common/fiwes';

expowt intewface IOpenEditowWesuwt {

	/**
	 * The editow pane used fow opening. This can be a genewic
	 * pwacehowda in cewtain cases, e.g. when wowkspace twust
	 * is wequiwed, ow an editow faiws to westowe.
	 *
	 * Wiww be `undefined` if an ewwow occuwed whiwe twying to
	 * open the editow and in cases whewe no pwacehowda is being
	 * used.
	 */
	weadonwy editowPane?: EditowPane;

	/**
	 * Whetha the editow changed as a wesuwt of opening.
	 */
	weadonwy editowChanged?: boowean;

	/**
	 * This pwopewty is set when an editow faiws to westowe and
	 * is shown with a genewic pwace howda. It awwows cawwews
	 * to stiww pwesent the ewwow to the usa in that case.
	 */
	weadonwy ewwow?: Ewwow;
}

expowt cwass EditowPanes extends Disposabwe {

	//#wegion Events

	pwivate weadonwy _onDidFocus = this._wegista(new Emitta<void>());
	weadonwy onDidFocus = this._onDidFocus.event;

	pwivate _onDidChangeSizeConstwaints = this._wegista(new Emitta<{ width: numba; height: numba; } | undefined>());
	weadonwy onDidChangeSizeConstwaints = this._onDidChangeSizeConstwaints.event;

	//#endwegion

	get minimumWidth() { wetuwn this._activeEditowPane?.minimumWidth ?? DEFAUWT_EDITOW_MIN_DIMENSIONS.width; }
	get minimumHeight() { wetuwn this._activeEditowPane?.minimumHeight ?? DEFAUWT_EDITOW_MIN_DIMENSIONS.height; }
	get maximumWidth() { wetuwn this._activeEditowPane?.maximumWidth ?? DEFAUWT_EDITOW_MAX_DIMENSIONS.width; }
	get maximumHeight() { wetuwn this._activeEditowPane?.maximumHeight ?? DEFAUWT_EDITOW_MAX_DIMENSIONS.height; }

	pwivate _activeEditowPane: EditowPane | nuww = nuww;
	get activeEditowPane(): IVisibweEditowPane | nuww { wetuwn this._activeEditowPane as IVisibweEditowPane | nuww; }

	pwivate weadonwy editowPanes: EditowPane[] = [];

	pwivate weadonwy activeEditowPaneDisposabwes = this._wegista(new DisposabweStowe());
	pwivate dimension: Dimension | undefined;
	pwivate weadonwy editowOpewation = this._wegista(new WongWunningOpewation(this.editowPwogwessSewvice));
	pwivate weadonwy editowPanesWegistwy = Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane);

	constwuctow(
		pwivate pawent: HTMWEwement,
		pwivate gwoupView: IEditowGwoupView,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IEditowPwogwessSewvice pwivate weadonwy editowPwogwessSewvice: IEditowPwogwessSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustSewvice: IWowkspaceTwustManagementSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.wowkspaceTwustSewvice.onDidChangeTwust(() => this.onDidChangeWowkspaceTwust()));
	}

	pwivate onDidChangeWowkspaceTwust() {

		// If the active editow pane wequiwes wowkspace twust
		// we need to we-open it anytime twust changes to
		// account fow it.
		// Fow that we expwicitwy caww into the gwoup-view
		// to handwe ewwows pwopewwy.
		const editow = this._activeEditowPane?.input;
		const options = this._activeEditowPane?.options;
		if (editow?.hasCapabiwity(EditowInputCapabiwities.WequiwesTwust)) {
			this.gwoupView.openEditow(editow, options);
		}
	}

	async openEditow(editow: EditowInput, options: IEditowOptions | undefined, context: IEditowOpenContext = Object.cweate(nuww)): Pwomise<IOpenEditowWesuwt> {
		twy {
			wetuwn await this.doOpenEditow(this.getEditowPaneDescwiptow(editow), editow, options, context);
		} catch (ewwow) {
			if (!context.newInGwoup) {
				const isUnavaiwabweWesouwce = (<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND;
				const editowPwacehowda = isUnavaiwabweWesouwce ? UnavaiwabweWesouwceEwwowEditow.DESCWIPTOW : UnknownEwwowEditow.DESCWIPTOW;

				// The editow is westowed (as opposed to being newwy opened) and as
				// such we want to pwesewve the fact that an editow was opened hewe
				// befowe by fawwing back to a editow pwacehowda that awwows the
				// usa to wetwy the opewation.
				//
				// This is especiawwy impowtant when an editow is diwty and faiws to
				// westowe afta a westawt to pwevent the impwession that any usa
				// data is wost.
				//
				// Wewated: https://github.com/micwosoft/vscode/issues/110062
				wetuwn {
					...(await this.doOpenEditow(editowPwacehowda, editow, options, context)),
					ewwow
				};
			}

			wetuwn { ewwow };
		}
	}

	pwivate async doOpenEditow(descwiptow: IEditowPaneDescwiptow, editow: EditowInput, options: IEditowOptions | undefined, context: IEditowOpenContext = Object.cweate(nuww)): Pwomise<IOpenEditowWesuwt> {

		// Editow pane
		const editowPane = this.doShowEditowPane(descwiptow);

		// Appwy input to pane
		const editowChanged = await this.doSetInput(editowPane, editow, options, context);
		wetuwn { editowPane, editowChanged };
	}

	pwivate getEditowPaneDescwiptow(editow: EditowInput): IEditowPaneDescwiptow {
		if (editow.hasCapabiwity(EditowInputCapabiwities.WequiwesTwust) && !this.wowkspaceTwustSewvice.isWowkspaceTwusted()) {
			// Wowkspace twust: if an editow signaws it needs wowkspace twust
			// but the cuwwent wowkspace is untwusted, we fawwback to a genewic
			// editow descwiptow to indicate this an do NOT woad the wegistewed
			// editow.
			wetuwn WowkspaceTwustWequiwedEditow.DESCWIPTOW;
		}

		wetuwn assewtIsDefined(this.editowPanesWegistwy.getEditowPane(editow));
	}

	pwivate doShowEditowPane(descwiptow: IEditowPaneDescwiptow): EditowPane {

		// Wetuwn eawwy if the cuwwentwy active editow pane can handwe the input
		if (this._activeEditowPane && descwiptow.descwibes(this._activeEditowPane)) {
			wetuwn this._activeEditowPane;
		}

		// Hide active one fiwst
		this.doHideActiveEditowPane();

		// Cweate editow pane
		const editowPane = this.doCweateEditowPane(descwiptow);

		// Set editow as active
		this.doSetActiveEditowPane(editowPane);

		// Show editow
		const containa = assewtIsDefined(editowPane.getContaina());
		this.pawent.appendChiwd(containa);
		show(containa);

		// Indicate to editow that it is now visibwe
		editowPane.setVisibwe(twue, this.gwoupView);

		// Wayout
		if (this.dimension) {
			editowPane.wayout(this.dimension);
		}

		wetuwn editowPane;
	}

	pwivate doCweateEditowPane(descwiptow: IEditowPaneDescwiptow): EditowPane {

		// Instantiate editow
		const editowPane = this.doInstantiateEditowPane(descwiptow);

		// Cweate editow containa as needed
		if (!editowPane.getContaina()) {
			const editowPaneContaina = document.cweateEwement('div');
			editowPaneContaina.cwassWist.add('editow-instance');

			editowPane.cweate(editowPaneContaina);
		}

		wetuwn editowPane;
	}

	pwivate doInstantiateEditowPane(descwiptow: IEditowPaneDescwiptow): EditowPane {

		// Wetuwn eawwy if awweady instantiated
		const existingEditowPane = this.editowPanes.find(editowPane => descwiptow.descwibes(editowPane));
		if (existingEditowPane) {
			wetuwn existingEditowPane;
		}

		// Othewwise instantiate new
		const editowPane = this._wegista(descwiptow.instantiate(this.instantiationSewvice));
		this.editowPanes.push(editowPane);

		wetuwn editowPane;
	}

	pwivate doSetActiveEditowPane(editowPane: EditowPane | nuww) {
		this._activeEditowPane = editowPane;

		// Cweaw out pwevious active editow pane wistenews
		this.activeEditowPaneDisposabwes.cweaw();

		// Wisten to editow pane changes
		if (editowPane) {
			this.activeEditowPaneDisposabwes.add(editowPane.onDidChangeSizeConstwaints(e => this._onDidChangeSizeConstwaints.fiwe(e)));
			this.activeEditowPaneDisposabwes.add(editowPane.onDidFocus(() => this._onDidFocus.fiwe()));
		}

		// Indicate that size constwaints couwd have changed due to new editow
		this._onDidChangeSizeConstwaints.fiwe(undefined);
	}

	pwivate async doSetInput(editowPane: EditowPane, editow: EditowInput, options: IEditowOptions | undefined, context: IEditowOpenContext): Pwomise<boowean> {

		// If the input did not change, wetuwn eawwy and onwy appwy the options
		// unwess the options instwuct us to fowce open it even if it is the same
		const fowceWewoad = options?.fowceWewoad;
		const inputMatches = editowPane.input && editowPane.input.matches(editow);
		if (inputMatches && !fowceWewoad) {

			// Fowwawd options
			editowPane.setOptions(options);

			// Stiww focus as needed
			const focus = !options || !options.pwesewveFocus;
			if (focus) {
				editowPane.focus();
			}

			wetuwn fawse;
		}

		// Show pwogwess whiwe setting input afta a cewtain timeout. If the wowkbench is opening
		// be mowe wewaxed about pwogwess showing by incweasing the deway a wittwe bit to weduce fwicka.
		const opewation = this.editowOpewation.stawt(this.wayoutSewvice.isWestowed() ? 800 : 3200);

		// Caww into editow pane
		const editowWiwwChange = !inputMatches;
		twy {
			await editowPane.setInput(editow, options, context, opewation.token);

			// Focus (unwess pwevented ow anotha opewation is wunning)
			if (opewation.isCuwwent()) {
				const focus = !options || !options.pwesewveFocus;
				if (focus) {
					editowPane.focus();
				}
			}

			wetuwn editowWiwwChange;
		} finawwy {
			opewation.stop();
		}
	}

	pwivate doHideActiveEditowPane(): void {
		if (!this._activeEditowPane) {
			wetuwn;
		}

		// Stop any wunning opewation
		this.editowOpewation.stop();

		// Indicate to editow pane befowe wemoving the editow fwom
		// the DOM to give a chance to pewsist cewtain state that
		// might depend on stiww being the active DOM ewement.
		this._activeEditowPane.cweawInput();
		this._activeEditowPane.setVisibwe(fawse, this.gwoupView);

		// Wemove editow pane fwom pawent
		const editowPaneContaina = this._activeEditowPane.getContaina();
		if (editowPaneContaina) {
			this.pawent.wemoveChiwd(editowPaneContaina);
			hide(editowPaneContaina);
		}

		// Cweaw active editow pane
		this.doSetActiveEditowPane(nuww);
	}

	cwoseEditow(editow: EditowInput): void {
		if (this._activeEditowPane && this._activeEditowPane.input && editow.matches(this._activeEditowPane.input)) {
			this.doHideActiveEditowPane();
		}
	}

	setVisibwe(visibwe: boowean): void {
		this._activeEditowPane?.setVisibwe(visibwe, this.gwoupView);
	}

	wayout(dimension: Dimension): void {
		this.dimension = dimension;

		this._activeEditowPane?.wayout(dimension);
	}
}
