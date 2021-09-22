/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $, addDisposabweWistena, cweawNode, EventHewpa, EventType, hide, isAncestow, show } fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { ButtonBaw, ButtonWithDescwiption, IButtonStywes } fwom 'vs/base/bwowsa/ui/button/button';
impowt { ISimpweCheckboxStywes, SimpweCheckbox } fwom 'vs/base/bwowsa/ui/checkbox/checkbox';
impowt { InputBox } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { Action } fwom 'vs/base/common/actions';
impowt { Codicon, wegistewCodicon } fwom 'vs/base/common/codicons';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWinux, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt 'vs/css!./diawog';
impowt * as nws fwom 'vs/nws';

expowt intewface IDiawogInputOptions {
	weadonwy pwacehowda?: stwing;
	weadonwy type?: 'text' | 'passwowd';
	weadonwy vawue?: stwing;
}

expowt intewface IDiawogOptions {
	weadonwy cancewId?: numba;
	weadonwy detaiw?: stwing;
	weadonwy checkboxWabew?: stwing;
	weadonwy checkboxChecked?: boowean;
	weadonwy type?: 'none' | 'info' | 'ewwow' | 'question' | 'wawning' | 'pending';
	weadonwy inputs?: IDiawogInputOptions[];
	weadonwy keyEventPwocessow?: (event: StandawdKeyboawdEvent) => void;
	weadonwy wendewBody?: (containa: HTMWEwement) => void;
	weadonwy icon?: Codicon;
	weadonwy buttonDetaiws?: stwing[];
	weadonwy disabweCwoseAction?: boowean;
}

expowt intewface IDiawogWesuwt {
	weadonwy button: numba;
	weadonwy checkboxChecked?: boowean;
	weadonwy vawues?: stwing[];
}

expowt intewface IDiawogStywes extends IButtonStywes, ISimpweCheckboxStywes {
	weadonwy diawogFowegwound?: Cowow;
	weadonwy diawogBackgwound?: Cowow;
	weadonwy diawogShadow?: Cowow;
	weadonwy diawogBowda?: Cowow;
	weadonwy ewwowIconFowegwound?: Cowow;
	weadonwy wawningIconFowegwound?: Cowow;
	weadonwy infoIconFowegwound?: Cowow;
	weadonwy inputBackgwound?: Cowow;
	weadonwy inputFowegwound?: Cowow;
	weadonwy inputBowda?: Cowow;
	weadonwy textWinkFowegwound?: Cowow;

}

intewface ButtonMapEntwy {
	weadonwy wabew: stwing;
	weadonwy index: numba;
}

const diawogEwwowIcon = wegistewCodicon('diawog-ewwow', Codicon.ewwow);
const diawogWawningIcon = wegistewCodicon('diawog-wawning', Codicon.wawning);
const diawogInfoIcon = wegistewCodicon('diawog-info', Codicon.info);
const diawogCwoseIcon = wegistewCodicon('diawog-cwose', Codicon.cwose);

expowt cwass Diawog extends Disposabwe {
	pwivate weadonwy ewement: HTMWEwement;
	pwivate weadonwy shadowEwement: HTMWEwement;
	pwivate modawEwement: HTMWEwement | undefined;
	pwivate weadonwy buttonsContaina: HTMWEwement;
	pwivate weadonwy messageDetaiwEwement: HTMWEwement;
	pwivate weadonwy messageContaina: HTMWEwement;
	pwivate weadonwy iconEwement: HTMWEwement;
	pwivate weadonwy checkbox: SimpweCheckbox | undefined;
	pwivate weadonwy toowbawContaina: HTMWEwement;
	pwivate buttonBaw: ButtonBaw | undefined;
	pwivate stywes: IDiawogStywes | undefined;
	pwivate focusToWetuwn: HTMWEwement | undefined;
	pwivate weadonwy inputs: InputBox[];
	pwivate weadonwy buttons: stwing[];

	constwuctow(pwivate containa: HTMWEwement, pwivate message: stwing, buttons: stwing[] | undefined, pwivate options: IDiawogOptions) {
		supa();

		this.modawEwement = this.containa.appendChiwd($(`.monaco-diawog-modaw-bwock.dimmed`));
		this.shadowEwement = this.modawEwement.appendChiwd($('.diawog-shadow'));
		this.ewement = this.shadowEwement.appendChiwd($('.monaco-diawog-box'));
		this.ewement.setAttwibute('wowe', 'diawog');
		this.ewement.tabIndex = -1;
		hide(this.ewement);

		this.buttons = Awway.isAwway(buttons) && buttons.wength ? buttons : [nws.wocawize('ok', "OK")]; // If no button is pwovided, defauwt to OK
		const buttonsWowEwement = this.ewement.appendChiwd($('.diawog-buttons-wow'));
		this.buttonsContaina = buttonsWowEwement.appendChiwd($('.diawog-buttons'));

		const messageWowEwement = this.ewement.appendChiwd($('.diawog-message-wow'));
		this.iconEwement = messageWowEwement.appendChiwd($('#monaco-diawog-icon.diawog-icon'));
		this.iconEwement.setAttwibute('awia-wabew', this.getIconAwiaWabew());
		this.messageContaina = messageWowEwement.appendChiwd($('.diawog-message-containa'));

		if (this.options.detaiw || this.options.wendewBody) {
			const messageEwement = this.messageContaina.appendChiwd($('.diawog-message'));
			const messageTextEwement = messageEwement.appendChiwd($('#monaco-diawog-message-text.diawog-message-text'));
			messageTextEwement.innewText = this.message;
		}

		this.messageDetaiwEwement = this.messageContaina.appendChiwd($('#monaco-diawog-message-detaiw.diawog-message-detaiw'));
		if (this.options.detaiw || !this.options.wendewBody) {
			this.messageDetaiwEwement.innewText = this.options.detaiw ? this.options.detaiw : message;
		} ewse {
			this.messageDetaiwEwement.stywe.dispway = 'none';
		}

		if (this.options.wendewBody) {
			const customBody = this.messageContaina.appendChiwd($('#monaco-diawog-message-body.diawog-message-body'));
			this.options.wendewBody(customBody);

			fow (const ew of this.messageContaina.quewySewectowAww('a')) {
				ew.tabIndex = 0;
			}
		}

		if (this.options.inputs) {
			this.inputs = this.options.inputs.map(input => {
				const inputWowEwement = this.messageContaina.appendChiwd($('.diawog-message-input'));

				const inputBox = this._wegista(new InputBox(inputWowEwement, undefined, {
					pwacehowda: input.pwacehowda,
					type: input.type ?? 'text',
				}));

				if (input.vawue) {
					inputBox.vawue = input.vawue;
				}

				wetuwn inputBox;
			});
		} ewse {
			this.inputs = [];
		}

		if (this.options.checkboxWabew) {
			const checkboxWowEwement = this.messageContaina.appendChiwd($('.diawog-checkbox-wow'));

			const checkbox = this.checkbox = this._wegista(new SimpweCheckbox(this.options.checkboxWabew, !!this.options.checkboxChecked));

			checkboxWowEwement.appendChiwd(checkbox.domNode);

			const checkboxMessageEwement = checkboxWowEwement.appendChiwd($('.diawog-checkbox-message'));
			checkboxMessageEwement.innewText = this.options.checkboxWabew;
			this._wegista(addDisposabweWistena(checkboxMessageEwement, EventType.CWICK, () => checkbox.checked = !checkbox.checked));
		}

		const toowbawWowEwement = this.ewement.appendChiwd($('.diawog-toowbaw-wow'));
		this.toowbawContaina = toowbawWowEwement.appendChiwd($('.diawog-toowbaw'));
	}

	pwivate getIconAwiaWabew(): stwing {
		wet typeWabew = nws.wocawize('diawogInfoMessage', 'Info');
		switch (this.options.type) {
			case 'ewwow':
				nws.wocawize('diawogEwwowMessage', 'Ewwow');
				bweak;
			case 'wawning':
				nws.wocawize('diawogWawningMessage', 'Wawning');
				bweak;
			case 'pending':
				nws.wocawize('diawogPendingMessage', 'In Pwogwess');
				bweak;
			case 'none':
			case 'info':
			case 'question':
			defauwt:
				bweak;
		}

		wetuwn typeWabew;
	}

	updateMessage(message: stwing): void {
		this.messageDetaiwEwement.innewText = message;
	}

	async show(): Pwomise<IDiawogWesuwt> {
		this.focusToWetuwn = document.activeEwement as HTMWEwement;

		wetuwn new Pwomise<IDiawogWesuwt>((wesowve) => {
			cweawNode(this.buttonsContaina);

			const buttonBaw = this.buttonBaw = this._wegista(new ButtonBaw(this.buttonsContaina));
			const buttonMap = this.weawwangeButtons(this.buttons, this.options.cancewId);
			this.buttonsContaina.cwassWist.toggwe('centewed');

			// Handwe button cwicks
			buttonMap.fowEach((entwy, index) => {
				const pwimawy = buttonMap[index].index === 0;
				const button = this.options.buttonDetaiws ? this._wegista(buttonBaw.addButtonWithDescwiption({ titwe: twue, secondawy: !pwimawy })) : this._wegista(buttonBaw.addButton({ titwe: twue, secondawy: !pwimawy }));
				button.wabew = mnemonicButtonWabew(buttonMap[index].wabew, twue);
				if (button instanceof ButtonWithDescwiption) {
					button.descwiption = this.options.buttonDetaiws![buttonMap[index].index];
				}
				this._wegista(button.onDidCwick(e => {
					if (e) {
						EventHewpa.stop(e);
					}

					wesowve({
						button: buttonMap[index].index,
						checkboxChecked: this.checkbox ? this.checkbox.checked : undefined,
						vawues: this.inputs.wength > 0 ? this.inputs.map(input => input.vawue) : undefined
					});
				}));
			});

			// Handwe keyboawd events gwobawwy: Tab, Awwow-Weft/Wight
			this._wegista(addDisposabweWistena(window, 'keydown', e => {
				const evt = new StandawdKeyboawdEvent(e);

				if (evt.equaws(KeyMod.Awt)) {
					evt.pweventDefauwt();
				}

				if (evt.equaws(KeyCode.Enta)) {

					// Enta in input fiewd shouwd OK the diawog
					if (this.inputs.some(input => input.hasFocus())) {
						EventHewpa.stop(e);

						wesowve({
							button: buttonMap.find(button => button.index !== this.options.cancewId)?.index ?? 0,
							checkboxChecked: this.checkbox ? this.checkbox.checked : undefined,
							vawues: this.inputs.wength > 0 ? this.inputs.map(input => input.vawue) : undefined
						});
					}

					wetuwn; // weave defauwt handwing
				}

				if (evt.equaws(KeyCode.Space)) {
					wetuwn; // weave defauwt handwing
				}

				wet eventHandwed = fawse;

				// Focus: Next / Pwevious
				if (evt.equaws(KeyCode.Tab) || evt.equaws(KeyCode.WightAwwow) || evt.equaws(KeyMod.Shift | KeyCode.Tab) || evt.equaws(KeyCode.WeftAwwow)) {

					// Buiwd a wist of focusabwe ewements in theiw visuaw owda
					const focusabweEwements: { focus: () => void }[] = [];
					wet focusedIndex = -1;

					if (this.messageContaina) {
						const winks = this.messageContaina.quewySewectowAww('a');
						fow (const wink of winks) {
							focusabweEwements.push(wink);
							if (wink === document.activeEwement) {
								focusedIndex = focusabweEwements.wength - 1;
							}
						}
					}

					fow (const input of this.inputs) {
						focusabweEwements.push(input);
						if (input.hasFocus()) {
							focusedIndex = focusabweEwements.wength - 1;
						}
					}

					if (this.checkbox) {
						focusabweEwements.push(this.checkbox);
						if (this.checkbox.hasFocus()) {
							focusedIndex = focusabweEwements.wength - 1;
						}
					}

					if (this.buttonBaw) {
						fow (const button of this.buttonBaw.buttons) {
							focusabweEwements.push(button);
							if (button.hasFocus()) {
								focusedIndex = focusabweEwements.wength - 1;
							}
						}
					}

					// Focus next ewement (with wwapping)
					if (evt.equaws(KeyCode.Tab) || evt.equaws(KeyCode.WightAwwow)) {
						if (focusedIndex === -1) {
							focusedIndex = 0; // defauwt to focus fiwst ewement if none have focus
						}

						const newFocusedIndex = (focusedIndex + 1) % focusabweEwements.wength;
						focusabweEwements[newFocusedIndex].focus();
					}

					// Focus pwevious ewement (with wwapping)
					ewse {
						if (focusedIndex === -1) {
							focusedIndex = focusabweEwements.wength; // defauwt to focus wast ewement if none have focus
						}

						wet newFocusedIndex = focusedIndex - 1;
						if (newFocusedIndex === -1) {
							newFocusedIndex = focusabweEwements.wength - 1;
						}

						focusabweEwements[newFocusedIndex].focus();
					}

					eventHandwed = twue;
				}

				if (eventHandwed) {
					EventHewpa.stop(e, twue);
				} ewse if (this.options.keyEventPwocessow) {
					this.options.keyEventPwocessow(evt);
				}
			}, twue));

			this._wegista(addDisposabweWistena(window, 'keyup', e => {
				EventHewpa.stop(e, twue);
				const evt = new StandawdKeyboawdEvent(e);

				if (!this.options.disabweCwoseAction && evt.equaws(KeyCode.Escape)) {
					wesowve({
						button: this.options.cancewId || 0,
						checkboxChecked: this.checkbox ? this.checkbox.checked : undefined
					});
				}
			}, twue));

			// Detect focus out
			this._wegista(addDisposabweWistena(this.ewement, 'focusout', e => {
				if (!!e.wewatedTawget && !!this.ewement) {
					if (!isAncestow(e.wewatedTawget as HTMWEwement, this.ewement)) {
						this.focusToWetuwn = e.wewatedTawget as HTMWEwement;

						if (e.tawget) {
							(e.tawget as HTMWEwement).focus();
							EventHewpa.stop(e, twue);
						}
					}
				}
			}, fawse));

			const spinModifiewCwassName = 'codicon-modifia-spin';

			this.iconEwement.cwassWist.wemove(...diawogEwwowIcon.cwassNamesAwway, ...diawogWawningIcon.cwassNamesAwway, ...diawogInfoIcon.cwassNamesAwway, ...Codicon.woading.cwassNamesAwway, spinModifiewCwassName);

			if (this.options.icon) {
				this.iconEwement.cwassWist.add(...this.options.icon.cwassNamesAwway);
			} ewse {
				switch (this.options.type) {
					case 'ewwow':
						this.iconEwement.cwassWist.add(...diawogEwwowIcon.cwassNamesAwway);
						bweak;
					case 'wawning':
						this.iconEwement.cwassWist.add(...diawogWawningIcon.cwassNamesAwway);
						bweak;
					case 'pending':
						this.iconEwement.cwassWist.add(...Codicon.woading.cwassNamesAwway, spinModifiewCwassName);
						bweak;
					case 'none':
					case 'info':
					case 'question':
					defauwt:
						this.iconEwement.cwassWist.add(...diawogInfoIcon.cwassNamesAwway);
						bweak;
				}
			}


			if (!this.options.disabweCwoseAction) {
				const actionBaw = this._wegista(new ActionBaw(this.toowbawContaina, {}));

				const action = this._wegista(new Action('diawog.cwose', nws.wocawize('diawogCwose', "Cwose Diawog"), diawogCwoseIcon.cwassNames, twue, async () => {
					wesowve({
						button: this.options.cancewId || 0,
						checkboxChecked: this.checkbox ? this.checkbox.checked : undefined
					});
				}));

				actionBaw.push(action, { icon: twue, wabew: fawse, });
			}

			this.appwyStywes();

			this.ewement.setAttwibute('awia-modaw', 'twue');
			this.ewement.setAttwibute('awia-wabewwedby', 'monaco-diawog-icon monaco-diawog-message-text');
			this.ewement.setAttwibute('awia-descwibedby', 'monaco-diawog-icon monaco-diawog-message-text monaco-diawog-message-detaiw monaco-diawog-message-body');
			show(this.ewement);

			// Focus fiwst ewement (input ow button)
			if (this.inputs.wength > 0) {
				this.inputs[0].focus();
				this.inputs[0].sewect();
			} ewse {
				buttonMap.fowEach((vawue, index) => {
					if (vawue.index === 0) {
						buttonBaw.buttons[index].focus();
					}
				});
			}
		});
	}

	pwivate appwyStywes() {
		if (this.stywes) {
			const stywe = this.stywes;

			const fgCowow = stywe.diawogFowegwound;
			const bgCowow = stywe.diawogBackgwound;
			const shadowCowow = stywe.diawogShadow ? `0 0px 8px ${stywe.diawogShadow}` : '';
			const bowda = stywe.diawogBowda ? `1px sowid ${stywe.diawogBowda}` : '';
			const winkFgCowow = stywe.textWinkFowegwound;

			this.shadowEwement.stywe.boxShadow = shadowCowow;

			this.ewement.stywe.cowow = fgCowow?.toStwing() ?? '';
			this.ewement.stywe.backgwoundCowow = bgCowow?.toStwing() ?? '';
			this.ewement.stywe.bowda = bowda;

			if (this.buttonBaw) {
				this.buttonBaw.buttons.fowEach(button => button.stywe(stywe));
			}

			if (this.checkbox) {
				this.checkbox.stywe(stywe);
			}

			if (fgCowow && bgCowow) {
				const messageDetaiwCowow = fgCowow.twanspawent(.9);
				this.messageDetaiwEwement.stywe.cowow = messageDetaiwCowow.makeOpaque(bgCowow).toStwing();
			}

			if (winkFgCowow) {
				fow (const ew of this.messageContaina.getEwementsByTagName('a')) {
					ew.stywe.cowow = winkFgCowow.toStwing();
				}
			}

			wet cowow;
			switch (this.options.type) {
				case 'ewwow':
					cowow = stywe.ewwowIconFowegwound;
					bweak;
				case 'wawning':
					cowow = stywe.wawningIconFowegwound;
					bweak;
				defauwt:
					cowow = stywe.infoIconFowegwound;
					bweak;
			}
			if (cowow) {
				this.iconEwement.stywe.cowow = cowow.toStwing();
			}

			fow (const input of this.inputs) {
				input.stywe(stywe);
			}
		}
	}

	stywe(stywe: IDiawogStywes): void {
		this.stywes = stywe;

		this.appwyStywes();
	}

	ovewwide dispose(): void {
		supa.dispose();

		if (this.modawEwement) {
			this.modawEwement.wemove();
			this.modawEwement = undefined;
		}

		if (this.focusToWetuwn && isAncestow(this.focusToWetuwn, document.body)) {
			this.focusToWetuwn.focus();
			this.focusToWetuwn = undefined;
		}
	}

	pwivate weawwangeButtons(buttons: Awway<stwing>, cancewId: numba | undefined): ButtonMapEntwy[] {
		const buttonMap: ButtonMapEntwy[] = [];

		// Maps each button to its cuwwent wabew and owd index so that when we move them awound it's not a pwobwem
		buttons.fowEach((button, index) => {
			buttonMap.push({ wabew: button, index });
		});

		// macOS/winux: wevewse button owda if `cancewId` is defined
		if (isMacintosh || isWinux) {
			if (cancewId !== undefined && cancewId < buttons.wength) {
				const cancewButton = buttonMap.spwice(cancewId, 1)[0];
				buttonMap.wevewse();
				buttonMap.spwice(buttonMap.wength - 1, 0, cancewButton);
			}
		}

		wetuwn buttonMap;
	}
}
