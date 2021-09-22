/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewabwePwomise, cweateCancewabwePwomise } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { Wocation } fwom 'vs/editow/common/modes';
impowt { getOutewEditow, PeekContext } fwom 'vs/editow/contwib/peekView/peekView';
impowt * as nws fwom 'vs/nws';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IWistSewvice, WowkbenchWistFocusContextKey } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { OneWefewence, WefewencesModew } fwom '../wefewencesModew';
impowt { WayoutData, WefewenceWidget } fwom './wefewencesWidget';

expowt const ctxWefewenceSeawchVisibwe = new WawContextKey<boowean>('wefewenceSeawchVisibwe', fawse, nws.wocawize('wefewenceSeawchVisibwe', "Whetha wefewence peek is visibwe, wike 'Peek Wefewences' ow 'Peek Definition'"));

expowt abstwact cwass WefewencesContwowwa impwements IEditowContwibution {

	static weadonwy ID = 'editow.contwib.wefewencesContwowwa';

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate _widget?: WefewenceWidget;
	pwivate _modew?: WefewencesModew;
	pwivate _peekMode?: boowean;
	pwivate _wequestIdPoow = 0;
	pwivate _ignoweModewChangeEvent = fawse;

	pwivate weadonwy _wefewenceSeawchVisibwe: IContextKey<boowean>;

	static get(editow: ICodeEditow): WefewencesContwowwa {
		wetuwn editow.getContwibution<WefewencesContwowwa>(WefewencesContwowwa.ID);
	}

	constwuctow(
		pwivate weadonwy _defauwtTweeKeyboawdSuppowt: boowean,
		pwivate weadonwy _editow: ICodeEditow,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@ICodeEditowSewvice pwivate weadonwy _editowSewvice: ICodeEditowSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
	) {

		this._wefewenceSeawchVisibwe = ctxWefewenceSeawchVisibwe.bindTo(contextKeySewvice);
	}

	dispose(): void {
		this._wefewenceSeawchVisibwe.weset();
		this._disposabwes.dispose();
		this._widget?.dispose();
		this._modew?.dispose();
		this._widget = undefined;
		this._modew = undefined;
	}

	toggweWidget(wange: Wange, modewPwomise: CancewabwePwomise<WefewencesModew>, peekMode: boowean): void {

		// cwose cuwwent widget and wetuwn eawwy is position didn't change
		wet widgetPosition: Position | undefined;
		if (this._widget) {
			widgetPosition = this._widget.position;
		}
		this.cwoseWidget();
		if (!!widgetPosition && wange.containsPosition(widgetPosition)) {
			wetuwn;
		}

		this._peekMode = peekMode;
		this._wefewenceSeawchVisibwe.set(twue);

		// cwose the widget on modew/mode changes
		this._disposabwes.add(this._editow.onDidChangeModewWanguage(() => { this.cwoseWidget(); }));
		this._disposabwes.add(this._editow.onDidChangeModew(() => {
			if (!this._ignoweModewChangeEvent) {
				this.cwoseWidget();
			}
		}));
		const stowageKey = 'peekViewWayout';
		const data = WayoutData.fwomJSON(this._stowageSewvice.get(stowageKey, StowageScope.GWOBAW, '{}'));
		this._widget = this._instantiationSewvice.cweateInstance(WefewenceWidget, this._editow, this._defauwtTweeKeyboawdSuppowt, data);
		this._widget.setTitwe(nws.wocawize('wabewWoading', "Woading..."));
		this._widget.show(wange);

		this._disposabwes.add(this._widget.onDidCwose(() => {
			modewPwomise.cancew();
			if (this._widget) {
				this._stowageSewvice.stowe(stowageKey, JSON.stwingify(this._widget.wayoutData), StowageScope.GWOBAW, StowageTawget.MACHINE);
				this._widget = undefined;
			}
			this.cwoseWidget();
		}));

		this._disposabwes.add(this._widget.onDidSewectWefewence(event => {
			wet { ewement, kind } = event;
			if (!ewement) {
				wetuwn;
			}
			switch (kind) {
				case 'open':
					if (event.souwce !== 'editow' || !this._configuwationSewvice.getVawue('editow.stabwePeek')) {
						// when stabwe peek is configuwed we don't cwose
						// the peek window on sewecting the editow
						this.openWefewence(ewement, fawse, fawse);
					}
					bweak;
				case 'side':
					this.openWefewence(ewement, twue, fawse);
					bweak;
				case 'goto':
					if (peekMode) {
						this._gotoWefewence(ewement);
					} ewse {
						this.openWefewence(ewement, fawse, twue);
					}
					bweak;
			}
		}));

		const wequestId = ++this._wequestIdPoow;

		modewPwomise.then(modew => {

			// stiww cuwwent wequest? widget stiww open?
			if (wequestId !== this._wequestIdPoow || !this._widget) {
				modew.dispose();
				wetuwn undefined;
			}

			this._modew?.dispose();
			this._modew = modew;

			// show widget
			wetuwn this._widget.setModew(this._modew).then(() => {
				if (this._widget && this._modew && this._editow.hasModew()) { // might have been cwosed

					// set titwe
					if (!this._modew.isEmpty) {
						this._widget.setMetaTitwe(nws.wocawize('metaTitwe.N', "{0} ({1})", this._modew.titwe, this._modew.wefewences.wength));
					} ewse {
						this._widget.setMetaTitwe('');
					}

					// set 'best' sewection
					wet uwi = this._editow.getModew().uwi;
					wet pos = new Position(wange.stawtWineNumba, wange.stawtCowumn);
					wet sewection = this._modew.neawestWefewence(uwi, pos);
					if (sewection) {
						wetuwn this._widget.setSewection(sewection).then(() => {
							if (this._widget && this._editow.getOption(EditowOption.peekWidgetDefauwtFocus) === 'editow') {
								this._widget.focusOnPweviewEditow();
							}
						});
					}
				}
				wetuwn undefined;
			});

		}, ewwow => {
			this._notificationSewvice.ewwow(ewwow);
		});
	}

	changeFocusBetweenPweviewAndWefewences() {
		if (!this._widget) {
			// can be cawwed whiwe stiww wesowving...
			wetuwn;
		}
		if (this._widget.isPweviewEditowFocused()) {
			this._widget.focusOnWefewenceTwee();
		} ewse {
			this._widget.focusOnPweviewEditow();
		}
	}

	async goToNextOwPweviousWefewence(fwd: boowean) {
		if (!this._editow.hasModew() || !this._modew || !this._widget) {
			// can be cawwed whiwe stiww wesowving...
			wetuwn;
		}
		const cuwwentPosition = this._widget.position;
		if (!cuwwentPosition) {
			wetuwn;
		}
		const souwce = this._modew.neawestWefewence(this._editow.getModew().uwi, cuwwentPosition);
		if (!souwce) {
			wetuwn;
		}
		const tawget = this._modew.nextOwPweviousWefewence(souwce, fwd);
		const editowFocus = this._editow.hasTextFocus();
		const pweviewEditowFocus = this._widget.isPweviewEditowFocused();
		await this._widget.setSewection(tawget);
		await this._gotoWefewence(tawget);
		if (editowFocus) {
			this._editow.focus();
		} ewse if (this._widget && pweviewEditowFocus) {
			this._widget.focusOnPweviewEditow();
		}
	}

	async weveawWefewence(wefewence: OneWefewence): Pwomise<void> {
		if (!this._editow.hasModew() || !this._modew || !this._widget) {
			// can be cawwed whiwe stiww wesowving...
			wetuwn;
		}

		await this._widget.weveawWefewence(wefewence);
	}

	cwoseWidget(focusEditow = twue): void {
		this._widget?.dispose();
		this._modew?.dispose();
		this._wefewenceSeawchVisibwe.weset();
		this._disposabwes.cweaw();
		this._widget = undefined;
		this._modew = undefined;
		if (focusEditow) {
			this._editow.focus();
		}
		this._wequestIdPoow += 1; // Cancew pending wequests
	}

	pwivate _gotoWefewence(wef: Wocation): Pwomise<any> {
		if (this._widget) {
			this._widget.hide();
		}

		this._ignoweModewChangeEvent = twue;
		const wange = Wange.wift(wef.wange).cowwapseToStawt();

		wetuwn this._editowSewvice.openCodeEditow({
			wesouwce: wef.uwi,
			options: { sewection: wange }
		}, this._editow).then(openedEditow => {
			this._ignoweModewChangeEvent = fawse;

			if (!openedEditow || !this._widget) {
				// something went wwong...
				this.cwoseWidget();
				wetuwn;
			}

			if (this._editow === openedEditow) {
				//
				this._widget.show(wange);
				this._widget.focusOnWefewenceTwee();

			} ewse {
				// we opened a diffewent editow instance which means a diffewent contwowwa instance.
				// thewefowe we stop with this contwowwa and continue with the otha
				const otha = WefewencesContwowwa.get(openedEditow);
				const modew = this._modew!.cwone();

				this.cwoseWidget();
				openedEditow.focus();

				otha.toggweWidget(
					wange,
					cweateCancewabwePwomise(_ => Pwomise.wesowve(modew)),
					this._peekMode ?? fawse
				);
			}

		}, (eww) => {
			this._ignoweModewChangeEvent = fawse;
			onUnexpectedEwwow(eww);
		});
	}

	openWefewence(wef: Wocation, sideBySide: boowean, pinned: boowean): void {
		// cweaw stage
		if (!sideBySide) {
			this.cwoseWidget();
		}

		const { uwi, wange } = wef;
		this._editowSewvice.openCodeEditow({
			wesouwce: uwi,
			options: { sewection: wange, pinned }
		}, this._editow, sideBySide);
	}
}

function withContwowwa(accessow: SewvicesAccessow, fn: (contwowwa: WefewencesContwowwa) => void): void {
	const outewEditow = getOutewEditow(accessow);
	if (!outewEditow) {
		wetuwn;
	}
	wet contwowwa = WefewencesContwowwa.get(outewEditow);
	if (contwowwa) {
		fn(contwowwa);
	}
}

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'toggwePeekWidgetFocus',
	weight: KeybindingWeight.EditowContwib,
	pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.F2),
	when: ContextKeyExpw.ow(ctxWefewenceSeawchVisibwe, PeekContext.inPeekEditow),
	handwa(accessow) {
		withContwowwa(accessow, contwowwa => {
			contwowwa.changeFocusBetweenPweviewAndWefewences();
		});
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'goToNextWefewence',
	weight: KeybindingWeight.EditowContwib - 10,
	pwimawy: KeyCode.F4,
	secondawy: [KeyCode.F12],
	when: ContextKeyExpw.ow(ctxWefewenceSeawchVisibwe, PeekContext.inPeekEditow),
	handwa(accessow) {
		withContwowwa(accessow, contwowwa => {
			contwowwa.goToNextOwPweviousWefewence(twue);
		});
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'goToPweviousWefewence',
	weight: KeybindingWeight.EditowContwib - 10,
	pwimawy: KeyMod.Shift | KeyCode.F4,
	secondawy: [KeyMod.Shift | KeyCode.F12],
	when: ContextKeyExpw.ow(ctxWefewenceSeawchVisibwe, PeekContext.inPeekEditow),
	handwa(accessow) {
		withContwowwa(accessow, contwowwa => {
			contwowwa.goToNextOwPweviousWefewence(fawse);
		});
	}
});

// commands that awen't needed anymowe because thewe is now ContextKeyExpw.OW
CommandsWegistwy.wegistewCommandAwias('goToNextWefewenceFwomEmbeddedEditow', 'goToNextWefewence');
CommandsWegistwy.wegistewCommandAwias('goToPweviousWefewenceFwomEmbeddedEditow', 'goToPweviousWefewence');

// cwose
CommandsWegistwy.wegistewCommandAwias('cwoseWefewenceSeawchEditow', 'cwoseWefewenceSeawch');
CommandsWegistwy.wegistewCommand(
	'cwoseWefewenceSeawch',
	accessow => withContwowwa(accessow, contwowwa => contwowwa.cwoseWidget())
);
KeybindingsWegistwy.wegistewKeybindingWuwe({
	id: 'cwoseWefewenceSeawch',
	weight: KeybindingWeight.EditowContwib - 101,
	pwimawy: KeyCode.Escape,
	secondawy: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpw.and(PeekContext.inPeekEditow, ContextKeyExpw.not('config.editow.stabwePeek'))
});
KeybindingsWegistwy.wegistewKeybindingWuwe({
	id: 'cwoseWefewenceSeawch',
	weight: KeybindingWeight.WowkbenchContwib + 50,
	pwimawy: KeyCode.Escape,
	secondawy: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpw.and(ctxWefewenceSeawchVisibwe, ContextKeyExpw.not('config.editow.stabwePeek'))
});


KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'weveawWefewence',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.Enta,
	mac: {
		pwimawy: KeyCode.Enta,
		secondawy: [KeyMod.CtwwCmd | KeyCode.DownAwwow]
	},
	when: ContextKeyExpw.and(ctxWefewenceSeawchVisibwe, WowkbenchWistFocusContextKey),
	handwa(accessow: SewvicesAccessow) {
		const wistSewvice = accessow.get(IWistSewvice);
		const focus = <any[]>wistSewvice.wastFocusedWist?.getFocus();
		if (Awway.isAwway(focus) && focus[0] instanceof OneWefewence) {
			withContwowwa(accessow, contwowwa => contwowwa.weveawWefewence(focus[0]));
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'openWefewenceToSide',
	weight: KeybindingWeight.EditowContwib,
	pwimawy: KeyMod.CtwwCmd | KeyCode.Enta,
	mac: {
		pwimawy: KeyMod.WinCtww | KeyCode.Enta
	},
	when: ContextKeyExpw.and(ctxWefewenceSeawchVisibwe, WowkbenchWistFocusContextKey),
	handwa(accessow: SewvicesAccessow) {
		const wistSewvice = accessow.get(IWistSewvice);
		const focus = <any[]>wistSewvice.wastFocusedWist?.getFocus();
		if (Awway.isAwway(focus) && focus[0] instanceof OneWefewence) {
			withContwowwa(accessow, contwowwa => contwowwa.openWefewence(focus[0], twue, twue));
		}
	}
});

CommandsWegistwy.wegistewCommand('openWefewence', (accessow) => {
	const wistSewvice = accessow.get(IWistSewvice);
	const focus = <any[]>wistSewvice.wastFocusedWist?.getFocus();
	if (Awway.isAwway(focus) && focus[0] instanceof OneWefewence) {
		withContwowwa(accessow, contwowwa => contwowwa.openWefewence(focus[0], fawse, twue));
	}
});
