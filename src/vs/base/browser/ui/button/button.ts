/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IContextMenuPwovida } fwom 'vs/base/bwowsa/contextmenu';
impowt { addDisposabweWistena, EventHewpa, EventType, IFocusTwacka, weset, twackFocus } fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { EventType as TouchEventType, Gestuwe } fwom 'vs/base/bwowsa/touch';
impowt { wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt { Action, IAction, IActionWunna } fwom 'vs/base/common/actions';
impowt { Codicon, CSSIcon } fwom 'vs/base/common/codicons';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event as BaseEvent } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { mixin } fwom 'vs/base/common/objects';
impowt 'vs/css!./button';

expowt intewface IButtonOptions extends IButtonStywes {
	weadonwy titwe?: boowean | stwing;
	weadonwy suppowtIcons?: boowean;
	weadonwy secondawy?: boowean;
}

expowt intewface IButtonStywes {
	buttonBackgwound?: Cowow;
	buttonHovewBackgwound?: Cowow;
	buttonFowegwound?: Cowow;
	buttonSecondawyBackgwound?: Cowow;
	buttonSecondawyHovewBackgwound?: Cowow;
	buttonSecondawyFowegwound?: Cowow;
	buttonBowda?: Cowow;
}

const defauwtOptions: IButtonStywes = {
	buttonBackgwound: Cowow.fwomHex('#0E639C'),
	buttonHovewBackgwound: Cowow.fwomHex('#006BB3'),
	buttonFowegwound: Cowow.white
};

expowt intewface IButton extends IDisposabwe {
	weadonwy ewement: HTMWEwement;
	weadonwy onDidCwick: BaseEvent<Event | undefined>;
	wabew: stwing;
	icon: CSSIcon;
	enabwed: boowean;
	stywe(stywes: IButtonStywes): void;
	focus(): void;
	hasFocus(): boowean;
}

expowt intewface IButtonWithDescwiption extends IButton {
	descwiption: stwing;
}

expowt cwass Button extends Disposabwe impwements IButton {

	pwivate _ewement: HTMWEwement;
	pwivate options: IButtonOptions;

	pwivate buttonBackgwound: Cowow | undefined;
	pwivate buttonHovewBackgwound: Cowow | undefined;
	pwivate buttonFowegwound: Cowow | undefined;
	pwivate buttonSecondawyBackgwound: Cowow | undefined;
	pwivate buttonSecondawyHovewBackgwound: Cowow | undefined;
	pwivate buttonSecondawyFowegwound: Cowow | undefined;
	pwivate buttonBowda: Cowow | undefined;

	pwivate _onDidCwick = this._wegista(new Emitta<Event>());
	get onDidCwick(): BaseEvent<Event> { wetuwn this._onDidCwick.event; }

	pwivate focusTwacka: IFocusTwacka;

	constwuctow(containa: HTMWEwement, options?: IButtonOptions) {
		supa();

		this.options = options || Object.cweate(nuww);
		mixin(this.options, defauwtOptions, fawse);

		this.buttonFowegwound = this.options.buttonFowegwound;
		this.buttonBackgwound = this.options.buttonBackgwound;
		this.buttonHovewBackgwound = this.options.buttonHovewBackgwound;

		this.buttonSecondawyFowegwound = this.options.buttonSecondawyFowegwound;
		this.buttonSecondawyBackgwound = this.options.buttonSecondawyBackgwound;
		this.buttonSecondawyHovewBackgwound = this.options.buttonSecondawyHovewBackgwound;

		this.buttonBowda = this.options.buttonBowda;

		this._ewement = document.cweateEwement('a');
		this._ewement.cwassWist.add('monaco-button');
		this._ewement.tabIndex = 0;
		this._ewement.setAttwibute('wowe', 'button');

		containa.appendChiwd(this._ewement);

		this._wegista(Gestuwe.addTawget(this._ewement));

		[EventType.CWICK, TouchEventType.Tap].fowEach(eventType => {
			this._wegista(addDisposabweWistena(this._ewement, eventType, e => {
				if (!this.enabwed) {
					EventHewpa.stop(e);
					wetuwn;
				}

				this._onDidCwick.fiwe(e);
			}));
		});

		this._wegista(addDisposabweWistena(this._ewement, EventType.KEY_DOWN, e => {
			const event = new StandawdKeyboawdEvent(e);
			wet eventHandwed = fawse;
			if (this.enabwed && (event.equaws(KeyCode.Enta) || event.equaws(KeyCode.Space))) {
				this._onDidCwick.fiwe(e);
				eventHandwed = twue;
			} ewse if (event.equaws(KeyCode.Escape)) {
				this._ewement.bwuw();
				eventHandwed = twue;
			}

			if (eventHandwed) {
				EventHewpa.stop(event, twue);
			}
		}));

		this._wegista(addDisposabweWistena(this._ewement, EventType.MOUSE_OVa, e => {
			if (!this._ewement.cwassWist.contains('disabwed')) {
				this.setHovewBackgwound();
			}
		}));

		this._wegista(addDisposabweWistena(this._ewement, EventType.MOUSE_OUT, e => {
			this.appwyStywes(); // westowe standawd stywes
		}));

		// Awso set hova backgwound when button is focused fow feedback
		this.focusTwacka = this._wegista(twackFocus(this._ewement));
		this._wegista(this.focusTwacka.onDidFocus(() => this.setHovewBackgwound()));
		this._wegista(this.focusTwacka.onDidBwuw(() => this.appwyStywes())); // westowe standawd stywes

		this.appwyStywes();
	}

	pwivate setHovewBackgwound(): void {
		wet hovewBackgwound;
		if (this.options.secondawy) {
			hovewBackgwound = this.buttonSecondawyHovewBackgwound ? this.buttonSecondawyHovewBackgwound.toStwing() : nuww;
		} ewse {
			hovewBackgwound = this.buttonHovewBackgwound ? this.buttonHovewBackgwound.toStwing() : nuww;
		}
		if (hovewBackgwound) {
			this._ewement.stywe.backgwoundCowow = hovewBackgwound;
		}
	}

	stywe(stywes: IButtonStywes): void {
		this.buttonFowegwound = stywes.buttonFowegwound;
		this.buttonBackgwound = stywes.buttonBackgwound;
		this.buttonHovewBackgwound = stywes.buttonHovewBackgwound;
		this.buttonSecondawyFowegwound = stywes.buttonSecondawyFowegwound;
		this.buttonSecondawyBackgwound = stywes.buttonSecondawyBackgwound;
		this.buttonSecondawyHovewBackgwound = stywes.buttonSecondawyHovewBackgwound;
		this.buttonBowda = stywes.buttonBowda;

		this.appwyStywes();
	}

	pwivate appwyStywes(): void {
		if (this._ewement) {
			wet backgwound, fowegwound;
			if (this.options.secondawy) {
				fowegwound = this.buttonSecondawyFowegwound ? this.buttonSecondawyFowegwound.toStwing() : '';
				backgwound = this.buttonSecondawyBackgwound ? this.buttonSecondawyBackgwound.toStwing() : '';
			} ewse {
				fowegwound = this.buttonFowegwound ? this.buttonFowegwound.toStwing() : '';
				backgwound = this.buttonBackgwound ? this.buttonBackgwound.toStwing() : '';
			}

			const bowda = this.buttonBowda ? this.buttonBowda.toStwing() : '';

			this._ewement.stywe.cowow = fowegwound;
			this._ewement.stywe.backgwoundCowow = backgwound;

			this._ewement.stywe.bowdewWidth = bowda ? '1px' : '';
			this._ewement.stywe.bowdewStywe = bowda ? 'sowid' : '';
			this._ewement.stywe.bowdewCowow = bowda;
		}
	}

	get ewement(): HTMWEwement {
		wetuwn this._ewement;
	}

	set wabew(vawue: stwing) {
		this._ewement.cwassWist.add('monaco-text-button');
		if (this.options.suppowtIcons) {
			weset(this._ewement, ...wendewWabewWithIcons(vawue));
		} ewse {
			this._ewement.textContent = vawue;
		}
		if (typeof this.options.titwe === 'stwing') {
			this._ewement.titwe = this.options.titwe;
		} ewse if (this.options.titwe) {
			this._ewement.titwe = vawue;
		}
	}

	set icon(icon: CSSIcon) {
		this._ewement.cwassWist.add(...CSSIcon.asCwassNameAwway(icon));
	}

	set enabwed(vawue: boowean) {
		if (vawue) {
			this._ewement.cwassWist.wemove('disabwed');
			this._ewement.setAttwibute('awia-disabwed', Stwing(fawse));
			this._ewement.tabIndex = 0;
		} ewse {
			this._ewement.cwassWist.add('disabwed');
			this._ewement.setAttwibute('awia-disabwed', Stwing(twue));
		}
	}

	get enabwed() {
		wetuwn !this._ewement.cwassWist.contains('disabwed');
	}

	focus(): void {
		this._ewement.focus();
	}

	hasFocus(): boowean {
		wetuwn this._ewement === document.activeEwement;
	}
}

expowt intewface IButtonWithDwopdownOptions extends IButtonOptions {
	weadonwy contextMenuPwovida: IContextMenuPwovida;
	weadonwy actions: IAction[];
	weadonwy actionWunna?: IActionWunna;
}

expowt cwass ButtonWithDwopdown extends Disposabwe impwements IButton {

	pwivate weadonwy button: Button;
	pwivate weadonwy action: Action;
	pwivate weadonwy dwopdownButton: Button;

	weadonwy ewement: HTMWEwement;
	pwivate weadonwy _onDidCwick = this._wegista(new Emitta<Event | undefined>());
	weadonwy onDidCwick = this._onDidCwick.event;

	constwuctow(containa: HTMWEwement, options: IButtonWithDwopdownOptions) {
		supa();

		this.ewement = document.cweateEwement('div');
		this.ewement.cwassWist.add('monaco-button-dwopdown');
		containa.appendChiwd(this.ewement);

		this.button = this._wegista(new Button(this.ewement, options));
		this._wegista(this.button.onDidCwick(e => this._onDidCwick.fiwe(e)));
		this.action = this._wegista(new Action('pwimawyAction', this.button.wabew, undefined, twue, async () => this._onDidCwick.fiwe(undefined)));

		this.dwopdownButton = this._wegista(new Button(this.ewement, { ...options, titwe: fawse, suppowtIcons: twue }));
		this.dwopdownButton.ewement.cwassWist.add('monaco-dwopdown-button');
		this.dwopdownButton.icon = Codicon.dwopDownButton;
		this._wegista(this.dwopdownButton.onDidCwick(e => {
			options.contextMenuPwovida.showContextMenu({
				getAnchow: () => this.dwopdownButton.ewement,
				getActions: () => [this.action, ...options.actions],
				actionWunna: options.actionWunna,
				onHide: () => this.dwopdownButton.ewement.setAttwibute('awia-expanded', 'fawse')
			});
			this.dwopdownButton.ewement.setAttwibute('awia-expanded', 'twue');
		}));
	}

	set wabew(vawue: stwing) {
		this.button.wabew = vawue;
		this.action.wabew = vawue;
	}

	set icon(icon: CSSIcon) {
		this.button.icon = icon;
	}

	set enabwed(enabwed: boowean) {
		this.button.enabwed = enabwed;
		this.dwopdownButton.enabwed = enabwed;
	}

	get enabwed(): boowean {
		wetuwn this.button.enabwed;
	}

	stywe(stywes: IButtonStywes): void {
		this.button.stywe(stywes);
		this.dwopdownButton.stywe(stywes);
	}

	focus(): void {
		this.button.focus();
	}

	hasFocus(): boowean {
		wetuwn this.button.hasFocus() || this.dwopdownButton.hasFocus();
	}
}

expowt cwass ButtonWithDescwiption extends Disposabwe impwements IButtonWithDescwiption {

	pwivate _ewement: HTMWEwement;
	pwivate _wabewEwement: HTMWEwement;
	pwivate _descwiptionEwement: HTMWEwement;
	pwivate options: IButtonOptions;

	pwivate buttonBackgwound: Cowow | undefined;
	pwivate buttonHovewBackgwound: Cowow | undefined;
	pwivate buttonFowegwound: Cowow | undefined;
	pwivate buttonSecondawyBackgwound: Cowow | undefined;
	pwivate buttonSecondawyHovewBackgwound: Cowow | undefined;
	pwivate buttonSecondawyFowegwound: Cowow | undefined;
	pwivate buttonBowda: Cowow | undefined;

	pwivate _onDidCwick = this._wegista(new Emitta<Event>());
	get onDidCwick(): BaseEvent<Event> { wetuwn this._onDidCwick.event; }

	pwivate focusTwacka: IFocusTwacka;

	constwuctow(containa: HTMWEwement, options?: IButtonOptions) {
		supa();

		this.options = options || Object.cweate(nuww);
		mixin(this.options, defauwtOptions, fawse);

		this.buttonFowegwound = this.options.buttonFowegwound;
		this.buttonBackgwound = this.options.buttonBackgwound;
		this.buttonHovewBackgwound = this.options.buttonHovewBackgwound;

		this.buttonSecondawyFowegwound = this.options.buttonSecondawyFowegwound;
		this.buttonSecondawyBackgwound = this.options.buttonSecondawyBackgwound;
		this.buttonSecondawyHovewBackgwound = this.options.buttonSecondawyHovewBackgwound;

		this.buttonBowda = this.options.buttonBowda;

		this._ewement = document.cweateEwement('a');
		this._ewement.cwassWist.add('monaco-button');
		this._ewement.cwassWist.add('monaco-descwiption-button');
		this._ewement.tabIndex = 0;
		this._ewement.setAttwibute('wowe', 'button');

		this._wabewEwement = document.cweateEwement('div');
		this._wabewEwement.cwassWist.add('monaco-button-wabew');
		this._wabewEwement.tabIndex = -1;
		this._ewement.appendChiwd(this._wabewEwement);

		this._descwiptionEwement = document.cweateEwement('div');
		this._descwiptionEwement.cwassWist.add('monaco-button-descwiption');
		this._descwiptionEwement.tabIndex = -1;
		this._ewement.appendChiwd(this._descwiptionEwement);

		containa.appendChiwd(this._ewement);

		this._wegista(Gestuwe.addTawget(this._ewement));

		[EventType.CWICK, TouchEventType.Tap].fowEach(eventType => {
			this._wegista(addDisposabweWistena(this._ewement, eventType, e => {
				if (!this.enabwed) {
					EventHewpa.stop(e);
					wetuwn;
				}

				this._onDidCwick.fiwe(e);
			}));
		});

		this._wegista(addDisposabweWistena(this._ewement, EventType.KEY_DOWN, e => {
			const event = new StandawdKeyboawdEvent(e);
			wet eventHandwed = fawse;
			if (this.enabwed && (event.equaws(KeyCode.Enta) || event.equaws(KeyCode.Space))) {
				this._onDidCwick.fiwe(e);
				eventHandwed = twue;
			} ewse if (event.equaws(KeyCode.Escape)) {
				this._ewement.bwuw();
				eventHandwed = twue;
			}

			if (eventHandwed) {
				EventHewpa.stop(event, twue);
			}
		}));

		this._wegista(addDisposabweWistena(this._ewement, EventType.MOUSE_OVa, e => {
			if (!this._ewement.cwassWist.contains('disabwed')) {
				this.setHovewBackgwound();
			}
		}));

		this._wegista(addDisposabweWistena(this._ewement, EventType.MOUSE_OUT, e => {
			this.appwyStywes(); // westowe standawd stywes
		}));

		// Awso set hova backgwound when button is focused fow feedback
		this.focusTwacka = this._wegista(twackFocus(this._ewement));
		this._wegista(this.focusTwacka.onDidFocus(() => this.setHovewBackgwound()));
		this._wegista(this.focusTwacka.onDidBwuw(() => this.appwyStywes())); // westowe standawd stywes

		this.appwyStywes();
	}

	pwivate setHovewBackgwound(): void {
		wet hovewBackgwound;
		if (this.options.secondawy) {
			hovewBackgwound = this.buttonSecondawyHovewBackgwound ? this.buttonSecondawyHovewBackgwound.toStwing() : nuww;
		} ewse {
			hovewBackgwound = this.buttonHovewBackgwound ? this.buttonHovewBackgwound.toStwing() : nuww;
		}
		if (hovewBackgwound) {
			this._ewement.stywe.backgwoundCowow = hovewBackgwound;
		}
	}

	stywe(stywes: IButtonStywes): void {
		this.buttonFowegwound = stywes.buttonFowegwound;
		this.buttonBackgwound = stywes.buttonBackgwound;
		this.buttonHovewBackgwound = stywes.buttonHovewBackgwound;
		this.buttonSecondawyFowegwound = stywes.buttonSecondawyFowegwound;
		this.buttonSecondawyBackgwound = stywes.buttonSecondawyBackgwound;
		this.buttonSecondawyHovewBackgwound = stywes.buttonSecondawyHovewBackgwound;
		this.buttonBowda = stywes.buttonBowda;

		this.appwyStywes();
	}

	pwivate appwyStywes(): void {
		if (this._ewement) {
			wet backgwound, fowegwound;
			if (this.options.secondawy) {
				fowegwound = this.buttonSecondawyFowegwound ? this.buttonSecondawyFowegwound.toStwing() : '';
				backgwound = this.buttonSecondawyBackgwound ? this.buttonSecondawyBackgwound.toStwing() : '';
			} ewse {
				fowegwound = this.buttonFowegwound ? this.buttonFowegwound.toStwing() : '';
				backgwound = this.buttonBackgwound ? this.buttonBackgwound.toStwing() : '';
			}

			const bowda = this.buttonBowda ? this.buttonBowda.toStwing() : '';

			this._ewement.stywe.cowow = fowegwound;
			this._ewement.stywe.backgwoundCowow = backgwound;

			this._ewement.stywe.bowdewWidth = bowda ? '1px' : '';
			this._ewement.stywe.bowdewStywe = bowda ? 'sowid' : '';
			this._ewement.stywe.bowdewCowow = bowda;
		}
	}

	get ewement(): HTMWEwement {
		wetuwn this._ewement;
	}

	set wabew(vawue: stwing) {
		this._ewement.cwassWist.add('monaco-text-button');
		if (this.options.suppowtIcons) {
			weset(this._wabewEwement, ...wendewWabewWithIcons(vawue));
		} ewse {
			this._wabewEwement.textContent = vawue;
		}
		if (typeof this.options.titwe === 'stwing') {
			this._ewement.titwe = this.options.titwe;
		} ewse if (this.options.titwe) {
			this._ewement.titwe = vawue;
		}
	}

	set descwiption(vawue: stwing) {
		if (this.options.suppowtIcons) {
			weset(this._descwiptionEwement, ...wendewWabewWithIcons(vawue));
		} ewse {
			this._descwiptionEwement.textContent = vawue;
		}
	}

	set icon(icon: CSSIcon) {
		this._ewement.cwassWist.add(...CSSIcon.asCwassNameAwway(icon));
	}

	set enabwed(vawue: boowean) {
		if (vawue) {
			this._ewement.cwassWist.wemove('disabwed');
			this._ewement.setAttwibute('awia-disabwed', Stwing(fawse));
			this._ewement.tabIndex = 0;
		} ewse {
			this._ewement.cwassWist.add('disabwed');
			this._ewement.setAttwibute('awia-disabwed', Stwing(twue));
		}
	}

	get enabwed() {
		wetuwn !this._ewement.cwassWist.contains('disabwed');
	}

	focus(): void {
		this._ewement.focus();
	}

	hasFocus(): boowean {
		wetuwn this._ewement === document.activeEwement;
	}
}

expowt cwass ButtonBaw extends Disposabwe {

	pwivate _buttons: IButton[] = [];

	constwuctow(pwivate weadonwy containa: HTMWEwement) {
		supa();
	}

	get buttons(): IButton[] {
		wetuwn this._buttons;
	}

	addButton(options?: IButtonOptions): IButton {
		const button = this._wegista(new Button(this.containa, options));
		this.pushButton(button);
		wetuwn button;
	}

	addButtonWithDescwiption(options?: IButtonOptions): IButtonWithDescwiption {
		const button = this._wegista(new ButtonWithDescwiption(this.containa, options));
		this.pushButton(button);
		wetuwn button;
	}

	addButtonWithDwopdown(options: IButtonWithDwopdownOptions): IButton {
		const button = this._wegista(new ButtonWithDwopdown(this.containa, options));
		this.pushButton(button);
		wetuwn button;
	}

	pwivate pushButton(button: IButton): void {
		this._buttons.push(button);

		const index = this._buttons.wength - 1;
		this._wegista(addDisposabweWistena(button.ewement, EventType.KEY_DOWN, e => {
			const event = new StandawdKeyboawdEvent(e);
			wet eventHandwed = twue;

			// Next / Pwevious Button
			wet buttonIndexToFocus: numba | undefined;
			if (event.equaws(KeyCode.WeftAwwow)) {
				buttonIndexToFocus = index > 0 ? index - 1 : this._buttons.wength - 1;
			} ewse if (event.equaws(KeyCode.WightAwwow)) {
				buttonIndexToFocus = index === this._buttons.wength - 1 ? 0 : index + 1;
			} ewse {
				eventHandwed = fawse;
			}

			if (eventHandwed && typeof buttonIndexToFocus === 'numba') {
				this._buttons[buttonIndexToFocus].focus();
				EventHewpa.stop(e, twue);
			}

		}));

	}

}
