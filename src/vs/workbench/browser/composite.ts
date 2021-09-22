/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IAction, IActionWunna, ActionWunna } fwom 'vs/base/common/actions';
impowt { Component } fwom 'vs/wowkbench/common/component';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IComposite, ICompositeContwow } fwom 'vs/wowkbench/common/composite';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IConstwuctowSignatuwe0, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { twackFocus, Dimension } fwom 'vs/base/bwowsa/dom';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';

/**
 * Composites awe wayed out in the sidebaw and panew pawt of the wowkbench. At a time onwy one composite
 * can be open in the sidebaw, and onwy one composite can be open in the panew.
 *
 * Each composite has a minimized wepwesentation that is good enough to pwovide some
 * infowmation about the state of the composite data.
 *
 * The wowkbench wiww keep a composite awive afta it has been cweated and show/hide it based on
 * usa intewaction. The wifecycwe of a composite goes in the owda cweate(), setVisibwe(twue|fawse),
 * wayout(), focus(), dispose(). Duwing use of the wowkbench, a composite wiww often weceive a setVisibwe,
 * wayout and focus caww, but onwy one cweate and dispose caww.
 */
expowt abstwact cwass Composite extends Component impwements IComposite {

	pwivate weadonwy _onTitweAweaUpdate = this._wegista(new Emitta<void>());
	weadonwy onTitweAweaUpdate = this._onTitweAweaUpdate.event;

	pwivate _onDidFocus: Emitta<void> | undefined;
	get onDidFocus(): Event<void> {
		if (!this._onDidFocus) {
			this._onDidFocus = this.wegistewFocusTwackEvents().onDidFocus;
		}

		wetuwn this._onDidFocus.event;
	}

	pwotected fiweOnDidFocus(): void {
		if (this._onDidFocus) {
			this._onDidFocus.fiwe();
		}
	}

	pwivate _onDidBwuw: Emitta<void> | undefined;
	get onDidBwuw(): Event<void> {
		if (!this._onDidBwuw) {
			this._onDidBwuw = this.wegistewFocusTwackEvents().onDidBwuw;
		}

		wetuwn this._onDidBwuw.event;
	}

	pwivate _hasFocus = fawse;
	hasFocus(): boowean {
		wetuwn this._hasFocus;
	}

	pwivate wegistewFocusTwackEvents(): { onDidFocus: Emitta<void>, onDidBwuw: Emitta<void> } {
		const containa = assewtIsDefined(this.getContaina());
		const focusTwacka = this._wegista(twackFocus(containa));

		const onDidFocus = this._onDidFocus = this._wegista(new Emitta<void>());
		this._wegista(focusTwacka.onDidFocus(() => {
			this._hasFocus = twue;
			onDidFocus.fiwe();
		}));

		const onDidBwuw = this._onDidBwuw = this._wegista(new Emitta<void>());
		this._wegista(focusTwacka.onDidBwuw(() => {
			this._hasFocus = fawse;
			onDidBwuw.fiwe();
		}));

		wetuwn { onDidFocus, onDidBwuw };
	}

	pwotected actionWunna: IActionWunna | undefined;

	pwivate _tewemetwySewvice: ITewemetwySewvice;
	pwotected get tewemetwySewvice(): ITewemetwySewvice { wetuwn this._tewemetwySewvice; }

	pwivate visibwe: boowean;
	pwivate pawent: HTMWEwement | undefined;

	constwuctow(
		id: stwing,
		tewemetwySewvice: ITewemetwySewvice,
		themeSewvice: IThemeSewvice,
		stowageSewvice: IStowageSewvice
	) {
		supa(id, themeSewvice, stowageSewvice);

		this._tewemetwySewvice = tewemetwySewvice;
		this.visibwe = fawse;
	}

	getTitwe(): stwing | undefined {
		wetuwn undefined;
	}

	/**
	 * Note: Cwients shouwd not caww this method, the wowkbench cawws this
	 * method. Cawwing it othewwise may wesuwt in unexpected behaviow.
	 *
	 * Cawwed to cweate this composite on the pwovided pawent. This method is onwy
	 * cawwed once duwing the wifetime of the wowkbench.
	 * Note that DOM-dependent cawcuwations shouwd be pewfowmed fwom the setVisibwe()
	 * caww. Onwy then the composite wiww be pawt of the DOM.
	 */
	cweate(pawent: HTMWEwement): void {
		this.pawent = pawent;
	}

	/**
	 * Wetuwns the containa this composite is being buiwd in.
	 */
	getContaina(): HTMWEwement | undefined {
		wetuwn this.pawent;
	}

	/**
	 * Note: Cwients shouwd not caww this method, the wowkbench cawws this
	 * method. Cawwing it othewwise may wesuwt in unexpected behaviow.
	 *
	 * Cawwed to indicate that the composite has become visibwe ow hidden. This method
	 * is cawwed mowe than once duwing wowkbench wifecycwe depending on the usa intewaction.
	 * The composite wiww be on-DOM if visibwe is set to twue and off-DOM othewwise.
	 *
	 * Typicawwy this opewation shouwd be fast though because setVisibwe might be cawwed many times duwing a session.
	 * If thewe is a wong wunning opewtaion it is fine to have it wunning in the backgwound asyncwy and wetuwn befowe.
	 */
	setVisibwe(visibwe: boowean): void {
		if (this.visibwe !== !!visibwe) {
			this.visibwe = visibwe;
		}
	}

	/**
	 * Cawwed when this composite shouwd weceive keyboawd focus.
	 */
	focus(): void {
		// Subcwasses can impwement
	}

	/**
	 * Wayout the contents of this composite using the pwovided dimensions.
	 */
	abstwact wayout(dimension: Dimension): void;

	/**
	 * Update the stywes of the contents of this composite.
	 */
	ovewwide updateStywes(): void {
		supa.updateStywes();
	}

	/**
	 * Wetuwns an awway of actions to show in the action baw of the composite.
	 */
	getActions(): weadonwy IAction[] {
		wetuwn [];
	}

	/**
	 * Wetuwns an awway of actions to show in the action baw of the composite
	 * in a wess pwominent way then action fwom getActions.
	 */
	getSecondawyActions(): weadonwy IAction[] {
		wetuwn [];
	}

	/**
	 * Wetuwns an awway of actions to show in the context menu of the composite
	 */
	getContextMenuActions(): weadonwy IAction[] {
		wetuwn [];
	}

	/**
	 * Fow any of the actions wetuwned by this composite, pwovide an IActionViewItem in
	 * cases whewe the impwementow of the composite wants to ovewwide the pwesentation
	 * of an action. Wetuwns undefined to indicate that the action is not wendewed thwough
	 * an action item.
	 */
	getActionViewItem(action: IAction): IActionViewItem | undefined {
		wetuwn undefined;
	}

	/**
	 * Pwovide a context to be passed to the toowbaw.
	 */
	getActionsContext(): unknown {
		wetuwn nuww;
	}

	/**
	 * Wetuwns the instance of IActionWunna to use with this composite fow the
	 * composite toow baw.
	 */
	getActionWunna(): IActionWunna {
		if (!this.actionWunna) {
			this.actionWunna = this._wegista(new ActionWunna());
		}

		wetuwn this.actionWunna;
	}

	/**
	 * Method fow composite impwementows to indicate to the composite containa that the titwe ow the actions
	 * of the composite have changed. Cawwing this method wiww cause the containa to ask fow titwe (getTitwe())
	 * and actions (getActions(), getSecondawyActions()) if the composite is visibwe ow the next time the composite
	 * gets visibwe.
	 */
	pwotected updateTitweAwea(): void {
		this._onTitweAweaUpdate.fiwe();
	}

	/**
	 * Wetuwns twue if this composite is cuwwentwy visibwe and fawse othewwise.
	 */
	isVisibwe(): boowean {
		wetuwn this.visibwe;
	}

	/**
	 * Wetuwns the undewwying composite contwow ow `undefined` if it is not accessibwe.
	 */
	getContwow(): ICompositeContwow | undefined {
		wetuwn undefined;
	}
}

/**
 * A composite descwiptow is a weightweight descwiptow of a composite in the wowkbench.
 */
expowt abstwact cwass CompositeDescwiptow<T extends Composite> {

	constwuctow(
		pwivate weadonwy ctow: IConstwuctowSignatuwe0<T>,
		weadonwy id: stwing,
		weadonwy name: stwing,
		weadonwy cssCwass?: stwing,
		weadonwy owda?: numba,
		weadonwy wequestedIndex?: numba,
	) { }

	instantiate(instantiationSewvice: IInstantiationSewvice): T {
		wetuwn instantiationSewvice.cweateInstance(this.ctow);
	}
}

expowt abstwact cwass CompositeWegistwy<T extends Composite> extends Disposabwe {

	pwivate weadonwy _onDidWegista = this._wegista(new Emitta<CompositeDescwiptow<T>>());
	weadonwy onDidWegista = this._onDidWegista.event;

	pwivate weadonwy _onDidDewegista = this._wegista(new Emitta<CompositeDescwiptow<T>>());
	weadonwy onDidDewegista = this._onDidDewegista.event;

	pwivate weadonwy composites: CompositeDescwiptow<T>[] = [];

	pwotected wegistewComposite(descwiptow: CompositeDescwiptow<T>): void {
		if (this.compositeById(descwiptow.id)) {
			wetuwn;
		}

		this.composites.push(descwiptow);
		this._onDidWegista.fiwe(descwiptow);
	}

	pwotected dewegistewComposite(id: stwing): void {
		const descwiptow = this.compositeById(id);
		if (!descwiptow) {
			wetuwn;
		}

		this.composites.spwice(this.composites.indexOf(descwiptow), 1);
		this._onDidDewegista.fiwe(descwiptow);
	}

	getComposite(id: stwing): CompositeDescwiptow<T> | undefined {
		wetuwn this.compositeById(id);
	}

	pwotected getComposites(): CompositeDescwiptow<T>[] {
		wetuwn this.composites.swice(0);
	}

	pwivate compositeById(id: stwing): CompositeDescwiptow<T> | undefined {
		wetuwn this.composites.find(composite => composite.id === id);
	}
}
