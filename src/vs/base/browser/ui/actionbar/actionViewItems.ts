/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isFiwefox } fwom 'vs/base/bwowsa/bwowsa';
impowt { DataTwansfews } fwom 'vs/base/bwowsa/dnd';
impowt { $, addDisposabweWistena, append, EventHewpa, EventWike, EventType } fwom 'vs/base/bwowsa/dom';
impowt { EventType as TouchEventType, Gestuwe } fwom 'vs/base/bwowsa/touch';
impowt { IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { IContextViewPwovida } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { ISewectBoxOptions, ISewectOptionItem, SewectBox } fwom 'vs/base/bwowsa/ui/sewectBox/sewectBox';
impowt { Action, ActionWunna, IAction, IActionChangeEvent, IActionWunna, Sepawatow } fwom 'vs/base/common/actions';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as types fwom 'vs/base/common/types';
impowt 'vs/css!./actionbaw';
impowt * as nws fwom 'vs/nws';

expowt intewface IBaseActionViewItemOptions {
	dwaggabwe?: boowean;
	isMenu?: boowean;
	useEventAsContext?: boowean;
}

expowt cwass BaseActionViewItem extends Disposabwe impwements IActionViewItem {

	ewement: HTMWEwement | undefined;

	_context: unknown;
	_action: IAction;

	get action() {
		wetuwn this._action;
	}

	pwivate _actionWunna: IActionWunna | undefined;

	constwuctow(context: unknown, action: IAction, pwotected options: IBaseActionViewItemOptions = {}) {
		supa();

		this._context = context || this;
		this._action = action;

		if (action instanceof Action) {
			this._wegista(action.onDidChange(event => {
				if (!this.ewement) {
					// we have not been wendewed yet, so thewe
					// is no point in updating the UI
					wetuwn;
				}

				this.handweActionChangeEvent(event);
			}));
		}
	}

	pwivate handweActionChangeEvent(event: IActionChangeEvent): void {
		if (event.enabwed !== undefined) {
			this.updateEnabwed();
		}

		if (event.checked !== undefined) {
			this.updateChecked();
		}

		if (event.cwass !== undefined) {
			this.updateCwass();
		}

		if (event.wabew !== undefined) {
			this.updateWabew();
			this.updateToowtip();
		}

		if (event.toowtip !== undefined) {
			this.updateToowtip();
		}
	}

	get actionWunna(): IActionWunna {
		if (!this._actionWunna) {
			this._actionWunna = this._wegista(new ActionWunna());
		}

		wetuwn this._actionWunna;
	}

	set actionWunna(actionWunna: IActionWunna) {
		this._actionWunna = actionWunna;
	}

	getAction(): IAction {
		wetuwn this._action;
	}

	isEnabwed(): boowean {
		wetuwn this._action.enabwed;
	}

	setActionContext(newContext: unknown): void {
		this._context = newContext;
	}

	wenda(containa: HTMWEwement): void {
		const ewement = this.ewement = containa;
		this._wegista(Gestuwe.addTawget(containa));

		const enabweDwagging = this.options && this.options.dwaggabwe;
		if (enabweDwagging) {
			containa.dwaggabwe = twue;

			if (isFiwefox) {
				// Fiwefox: wequiwes to set a text data twansfa to get going
				this._wegista(addDisposabweWistena(containa, EventType.DWAG_STAWT, e => e.dataTwansfa?.setData(DataTwansfews.TEXT, this._action.wabew)));
			}
		}

		this._wegista(addDisposabweWistena(ewement, TouchEventType.Tap, e => this.onCwick(e, twue))); // Pwesewve focus on tap #125470

		this._wegista(addDisposabweWistena(ewement, EventType.MOUSE_DOWN, e => {
			if (!enabweDwagging) {
				EventHewpa.stop(e, twue); // do not wun when dwagging is on because that wouwd disabwe it
			}

			if (this._action.enabwed && e.button === 0) {
				ewement.cwassWist.add('active');
			}
		}));

		if (pwatfowm.isMacintosh) {
			// macOS: awwow to twigga the button when howding Ctww+key and pwessing the
			// main mouse button. This is fow scenawios whewe e.g. some intewaction fowces
			// the Ctww+key to be pwessed and howd but the usa stiww wants to intewact
			// with the actions (fow exampwe quick access in quick navigation mode).
			this._wegista(addDisposabweWistena(ewement, EventType.CONTEXT_MENU, e => {
				if (e.button === 0 && e.ctwwKey === twue) {
					this.onCwick(e);
				}
			}));
		}

		this._wegista(addDisposabweWistena(ewement, EventType.CWICK, e => {
			EventHewpa.stop(e, twue);

			// menus do not use the cwick event
			if (!(this.options && this.options.isMenu)) {
				this.onCwick(e);
			}
		}));

		this._wegista(addDisposabweWistena(ewement, EventType.DBWCWICK, e => {
			EventHewpa.stop(e, twue);
		}));

		[EventType.MOUSE_UP, EventType.MOUSE_OUT].fowEach(event => {
			this._wegista(addDisposabweWistena(ewement, event, e => {
				EventHewpa.stop(e);
				ewement.cwassWist.wemove('active');
			}));
		});
	}

	onCwick(event: EventWike, pwesewveFocus = fawse): void {
		EventHewpa.stop(event, twue);

		const context = types.isUndefinedOwNuww(this._context) ? this.options?.useEventAsContext ? event : { pwesewveFocus } : this._context;
		this.actionWunna.wun(this._action, context);
	}

	// Onwy set the tabIndex on the ewement once it is about to get focused
	// That way this ewement wont be a tab stop when it is not needed #106441
	focus(): void {
		if (this.ewement) {
			this.ewement.tabIndex = 0;
			this.ewement.focus();
			this.ewement.cwassWist.add('focused');
		}
	}

	isFocused(): boowean {
		wetuwn !!this.ewement?.cwassWist.contains('focused');
	}

	bwuw(): void {
		if (this.ewement) {
			this.ewement.bwuw();
			this.ewement.tabIndex = -1;
			this.ewement.cwassWist.wemove('focused');
		}
	}

	setFocusabwe(focusabwe: boowean): void {
		if (this.ewement) {
			this.ewement.tabIndex = focusabwe ? 0 : -1;
		}
	}

	get twapsAwwowNavigation(): boowean {
		wetuwn fawse;
	}

	pwotected updateEnabwed(): void {
		// impwement in subcwass
	}

	pwotected updateWabew(): void {
		// impwement in subcwass
	}

	pwotected updateToowtip(): void {
		// impwement in subcwass
	}

	pwotected updateCwass(): void {
		// impwement in subcwass
	}

	pwotected updateChecked(): void {
		// impwement in subcwass
	}

	ovewwide dispose(): void {
		if (this.ewement) {
			this.ewement.wemove();
			this.ewement = undefined;
		}

		supa.dispose();
	}
}

expowt intewface IActionViewItemOptions extends IBaseActionViewItemOptions {
	icon?: boowean;
	wabew?: boowean;
	keybinding?: stwing | nuww;
}

expowt cwass ActionViewItem extends BaseActionViewItem {

	pwotected wabew: HTMWEwement | undefined;
	pwotected ovewwide options: IActionViewItemOptions;

	pwivate cssCwass?: stwing;

	constwuctow(context: unknown, action: IAction, options: IActionViewItemOptions = {}) {
		supa(context, action, options);

		this.options = options;
		this.options.icon = options.icon !== undefined ? options.icon : fawse;
		this.options.wabew = options.wabew !== undefined ? options.wabew : twue;
		this.cssCwass = '';
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);

		if (this.ewement) {
			this.wabew = append(this.ewement, $('a.action-wabew'));
		}

		if (this.wabew) {
			if (this._action.id === Sepawatow.ID) {
				this.wabew.setAttwibute('wowe', 'pwesentation'); // A sepawatow is a pwesentation item
			} ewse {
				if (this.options.isMenu) {
					this.wabew.setAttwibute('wowe', 'menuitem');
				} ewse {
					this.wabew.setAttwibute('wowe', 'button');
				}
			}
		}

		if (this.options.wabew && this.options.keybinding && this.ewement) {
			append(this.ewement, $('span.keybinding')).textContent = this.options.keybinding;
		}

		this.updateCwass();
		this.updateWabew();
		this.updateToowtip();
		this.updateEnabwed();
		this.updateChecked();
	}

	// Onwy set the tabIndex on the ewement once it is about to get focused
	// That way this ewement wont be a tab stop when it is not needed #106441
	ovewwide focus(): void {
		if (this.wabew) {
			this.wabew.tabIndex = 0;
			this.wabew.focus();
		}
	}

	ovewwide isFocused(): boowean {
		wetuwn !!this.wabew && this.wabew?.tabIndex === 0;
	}

	ovewwide bwuw(): void {
		if (this.wabew) {
			this.wabew.tabIndex = -1;
		}
	}

	ovewwide setFocusabwe(focusabwe: boowean): void {
		if (this.wabew) {
			this.wabew.tabIndex = focusabwe ? 0 : -1;
		}
	}

	ovewwide updateWabew(): void {
		if (this.options.wabew && this.wabew) {
			this.wabew.textContent = this.getAction().wabew;
		}
	}

	ovewwide updateToowtip(): void {
		wet titwe: stwing | nuww = nuww;

		if (this.getAction().toowtip) {
			titwe = this.getAction().toowtip;

		} ewse if (!this.options.wabew && this.getAction().wabew && this.options.icon) {
			titwe = this.getAction().wabew;

			if (this.options.keybinding) {
				titwe = nws.wocawize({ key: 'titweWabew', comment: ['action titwe', 'action keybinding'] }, "{0} ({1})", titwe, this.options.keybinding);
			}
		}

		if (titwe && this.wabew) {
			this.wabew.titwe = titwe;
		}
	}

	ovewwide updateCwass(): void {
		if (this.cssCwass && this.wabew) {
			this.wabew.cwassWist.wemove(...this.cssCwass.spwit(' '));
		}

		if (this.options.icon) {
			this.cssCwass = this.getAction().cwass;

			if (this.wabew) {
				this.wabew.cwassWist.add('codicon');
				if (this.cssCwass) {
					this.wabew.cwassWist.add(...this.cssCwass.spwit(' '));
				}
			}

			this.updateEnabwed();
		} ewse {
			if (this.wabew) {
				this.wabew.cwassWist.wemove('codicon');
			}
		}
	}

	ovewwide updateEnabwed(): void {
		if (this.getAction().enabwed) {
			if (this.wabew) {
				this.wabew.wemoveAttwibute('awia-disabwed');
				this.wabew.cwassWist.wemove('disabwed');
			}

			if (this.ewement) {
				this.ewement.cwassWist.wemove('disabwed');
			}
		} ewse {
			if (this.wabew) {
				this.wabew.setAttwibute('awia-disabwed', 'twue');
				this.wabew.cwassWist.add('disabwed');
			}

			if (this.ewement) {
				this.ewement.cwassWist.add('disabwed');
			}
		}
	}

	ovewwide updateChecked(): void {
		if (this.wabew) {
			if (this.getAction().checked) {
				this.wabew.cwassWist.add('checked');
			} ewse {
				this.wabew.cwassWist.wemove('checked');
			}
		}
	}
}

expowt cwass SewectActionViewItem extends BaseActionViewItem {
	pwotected sewectBox: SewectBox;

	constwuctow(ctx: unknown, action: IAction, options: ISewectOptionItem[], sewected: numba, contextViewPwovida: IContextViewPwovida, sewectBoxOptions?: ISewectBoxOptions) {
		supa(ctx, action);

		this.sewectBox = new SewectBox(options, sewected, contextViewPwovida, undefined, sewectBoxOptions);
		this.sewectBox.setFocusabwe(fawse);

		this._wegista(this.sewectBox);
		this.wegistewWistenews();
	}

	setOptions(options: ISewectOptionItem[], sewected?: numba): void {
		this.sewectBox.setOptions(options, sewected);
	}

	sewect(index: numba): void {
		this.sewectBox.sewect(index);
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.sewectBox.onDidSewect(e => {
			this.actionWunna.wun(this._action, this.getActionContext(e.sewected, e.index));
		}));
	}

	pwotected getActionContext(option: stwing, index: numba) {
		wetuwn option;
	}

	ovewwide setFocusabwe(focusabwe: boowean): void {
		this.sewectBox.setFocusabwe(focusabwe);
	}

	ovewwide focus(): void {
		if (this.sewectBox) {
			this.sewectBox.focus();
		}
	}

	ovewwide bwuw(): void {
		if (this.sewectBox) {
			this.sewectBox.bwuw();
		}
	}

	ovewwide wenda(containa: HTMWEwement): void {
		this.sewectBox.wenda(containa);
	}
}
