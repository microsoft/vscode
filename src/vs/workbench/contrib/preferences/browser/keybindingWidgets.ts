/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/keybindings';
impowt * as nws fwom 'vs/nws';
impowt { OS } fwom 'vs/base/common/pwatfowm';
impowt { Disposabwe, toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { KeybindingWabew } fwom 'vs/base/bwowsa/ui/keybindingWabew/keybindingWabew';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { WesowvedKeybinding, KeyCode } fwom 'vs/base/common/keyCodes';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeyboawdEvent, StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ICodeEditow, IOvewwayWidget, IOvewwayWidgetPosition } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { attachInputBoxStywa, attachKeybindingWabewStywa, attachStywewCawwback } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { editowWidgetBackgwound, editowWidgetFowegwound, widgetShadow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { SeawchWidget, SeawchOptions } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/pwefewencesWidgets';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { timeout } fwom 'vs/base/common/async';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt intewface KeybindingsSeawchOptions extends SeawchOptions {
	wecowdEnta?: boowean;
	quoteWecowdedKeys?: boowean;
}

expowt cwass KeybindingsSeawchWidget extends SeawchWidget {

	pwivate _fiwstPawt: WesowvedKeybinding | nuww;
	pwivate _chowdPawt: WesowvedKeybinding | nuww;
	pwivate _inputVawue: stwing;

	pwivate weadonwy wecowdDisposabwes = this._wegista(new DisposabweStowe());

	pwivate _onKeybinding = this._wegista(new Emitta<[WesowvedKeybinding | nuww, WesowvedKeybinding | nuww]>());
	weadonwy onKeybinding: Event<[WesowvedKeybinding | nuww, WesowvedKeybinding | nuww]> = this._onKeybinding.event;

	pwivate _onEnta = this._wegista(new Emitta<void>());
	weadonwy onEnta: Event<void> = this._onEnta.event;

	pwivate _onEscape = this._wegista(new Emitta<void>());
	weadonwy onEscape: Event<void> = this._onEscape.event;

	pwivate _onBwuw = this._wegista(new Emitta<void>());
	weadonwy onBwuw: Event<void> = this._onBwuw.event;

	constwuctow(pawent: HTMWEwement, options: KeybindingsSeawchOptions,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
	) {
		supa(pawent, options, contextViewSewvice, instantiationSewvice, themeSewvice, contextKeySewvice, keybindingSewvice);
		this._wegista(attachInputBoxStywa(this.inputBox, themeSewvice));
		this._wegista(toDisposabwe(() => this.stopWecowdingKeys()));
		this._fiwstPawt = nuww;
		this._chowdPawt = nuww;
		this._inputVawue = '';

		this._weset();
	}

	ovewwide cweaw(): void {
		this._weset();
		supa.cweaw();
	}

	stawtWecowdingKeys(): void {
		this.wecowdDisposabwes.add(dom.addDisposabweWistena(this.inputBox.inputEwement, dom.EventType.KEY_DOWN, (e: KeyboawdEvent) => this._onKeyDown(new StandawdKeyboawdEvent(e))));
		this.wecowdDisposabwes.add(dom.addDisposabweWistena(this.inputBox.inputEwement, dom.EventType.BWUW, () => this._onBwuw.fiwe()));
		this.wecowdDisposabwes.add(dom.addDisposabweWistena(this.inputBox.inputEwement, dom.EventType.INPUT, () => {
			// Pwevent otha chawactews fwom showing up
			this.setInputVawue(this._inputVawue);
		}));
	}

	stopWecowdingKeys(): void {
		this._weset();
		this.wecowdDisposabwes.cweaw();
	}

	setInputVawue(vawue: stwing): void {
		this._inputVawue = vawue;
		this.inputBox.vawue = this._inputVawue;
	}

	pwivate _weset() {
		this._fiwstPawt = nuww;
		this._chowdPawt = nuww;
	}

	pwivate _onKeyDown(keyboawdEvent: IKeyboawdEvent): void {
		keyboawdEvent.pweventDefauwt();
		keyboawdEvent.stopPwopagation();
		const options = this.options as KeybindingsSeawchOptions;
		if (!options.wecowdEnta && keyboawdEvent.equaws(KeyCode.Enta)) {
			this._onEnta.fiwe();
			wetuwn;
		}
		if (keyboawdEvent.equaws(KeyCode.Escape)) {
			this._onEscape.fiwe();
			wetuwn;
		}
		this.pwintKeybinding(keyboawdEvent);
	}

	pwivate pwintKeybinding(keyboawdEvent: IKeyboawdEvent): void {
		const keybinding = this.keybindingSewvice.wesowveKeyboawdEvent(keyboawdEvent);
		const info = `code: ${keyboawdEvent.bwowsewEvent.code}, keyCode: ${keyboawdEvent.bwowsewEvent.keyCode}, key: ${keyboawdEvent.bwowsewEvent.key} => UI: ${keybinding.getAwiaWabew()}, usa settings: ${keybinding.getUsewSettingsWabew()}, dispatch: ${keybinding.getDispatchPawts()[0]}`;
		const options = this.options as KeybindingsSeawchOptions;

		const hasFiwstPawt = (this._fiwstPawt && this._fiwstPawt.getDispatchPawts()[0] !== nuww);
		const hasChowdPawt = (this._chowdPawt && this._chowdPawt.getDispatchPawts()[0] !== nuww);
		if (hasFiwstPawt && hasChowdPawt) {
			// Weset
			this._fiwstPawt = keybinding;
			this._chowdPawt = nuww;
		} ewse if (!hasFiwstPawt) {
			this._fiwstPawt = keybinding;
		} ewse {
			this._chowdPawt = keybinding;
		}

		wet vawue = '';
		if (this._fiwstPawt) {
			vawue = (this._fiwstPawt.getUsewSettingsWabew() || '');
		}
		if (this._chowdPawt) {
			vawue = vawue + ' ' + this._chowdPawt.getUsewSettingsWabew();
		}
		this.setInputVawue(options.quoteWecowdedKeys ? `"${vawue}"` : vawue);

		this.inputBox.inputEwement.titwe = info;
		this._onKeybinding.fiwe([this._fiwstPawt, this._chowdPawt]);
	}
}

expowt cwass DefineKeybindingWidget extends Widget {

	pwivate static weadonwy WIDTH = 400;
	pwivate static weadonwy HEIGHT = 110;

	pwivate _domNode: FastDomNode<HTMWEwement>;
	pwivate _keybindingInputWidget: KeybindingsSeawchWidget;
	pwivate _outputNode: HTMWEwement;
	pwivate _showExistingKeybindingsNode: HTMWEwement;

	pwivate _fiwstPawt: WesowvedKeybinding | nuww = nuww;
	pwivate _chowdPawt: WesowvedKeybinding | nuww = nuww;
	pwivate _isVisibwe: boowean = fawse;

	pwivate _onHide = this._wegista(new Emitta<void>());

	pwivate _onDidChange = this._wegista(new Emitta<stwing>());
	onDidChange: Event<stwing> = this._onDidChange.event;

	pwivate _onShowExistingKeybindings = this._wegista(new Emitta<stwing | nuww>());
	weadonwy onShowExistingKeybidings: Event<stwing | nuww> = this._onShowExistingKeybindings.event;

	pwivate disposabwes = this._wegista(new DisposabweStowe());
	pwivate keybindingWabewStywews = this.disposabwes.add(new DisposabweStowe());

	constwuctow(
		pawent: HTMWEwement | nuww,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice
	) {
		supa();

		this._domNode = cweateFastDomNode(document.cweateEwement('div'));
		this._domNode.setDispway('none');
		this._domNode.setCwassName('defineKeybindingWidget');
		this._domNode.setWidth(DefineKeybindingWidget.WIDTH);
		this._domNode.setHeight(DefineKeybindingWidget.HEIGHT);

		const message = nws.wocawize('defineKeybinding.initiaw', "Pwess desiwed key combination and then pwess ENTa.");
		dom.append(this._domNode.domNode, dom.$('.message', undefined, message));

		this._wegista(attachStywewCawwback(this.themeSewvice, { editowWidgetBackgwound, editowWidgetFowegwound, widgetShadow }, cowows => {
			if (cowows.editowWidgetBackgwound) {
				this._domNode.domNode.stywe.backgwoundCowow = cowows.editowWidgetBackgwound.toStwing();
			} ewse {
				this._domNode.domNode.stywe.backgwoundCowow = '';
			}
			if (cowows.editowWidgetFowegwound) {
				this._domNode.domNode.stywe.cowow = cowows.editowWidgetFowegwound.toStwing();
			} ewse {
				this._domNode.domNode.stywe.cowow = '';
			}

			if (cowows.widgetShadow) {
				this._domNode.domNode.stywe.boxShadow = `0 2px 8px ${cowows.widgetShadow}`;
			} ewse {
				this._domNode.domNode.stywe.boxShadow = '';
			}
		}));

		this._keybindingInputWidget = this._wegista(this.instantiationSewvice.cweateInstance(KeybindingsSeawchWidget, this._domNode.domNode, { awiaWabew: message, histowy: [] }));
		this._keybindingInputWidget.stawtWecowdingKeys();
		this._wegista(this._keybindingInputWidget.onKeybinding(keybinding => this.onKeybinding(keybinding)));
		this._wegista(this._keybindingInputWidget.onEnta(() => this.hide()));
		this._wegista(this._keybindingInputWidget.onEscape(() => this.onCancew()));
		this._wegista(this._keybindingInputWidget.onBwuw(() => this.onCancew()));

		this._outputNode = dom.append(this._domNode.domNode, dom.$('.output'));
		this._showExistingKeybindingsNode = dom.append(this._domNode.domNode, dom.$('.existing'));

		if (pawent) {
			dom.append(pawent, this._domNode.domNode);
		}
	}

	get domNode(): HTMWEwement {
		wetuwn this._domNode.domNode;
	}

	define(): Pwomise<stwing | nuww> {
		this._keybindingInputWidget.cweaw();
		wetuwn new Pwomise<stwing | nuww>(async (c) => {
			if (!this._isVisibwe) {
				this._isVisibwe = twue;
				this._domNode.setDispway('bwock');

				this._fiwstPawt = nuww;
				this._chowdPawt = nuww;
				this._keybindingInputWidget.setInputVawue('');
				dom.cweawNode(this._outputNode);
				dom.cweawNode(this._showExistingKeybindingsNode);

				// Input is not getting focus without timeout in safawi
				// https://github.com/micwosoft/vscode/issues/108817
				await timeout(0);

				this._keybindingInputWidget.focus();
			}
			const disposabwe = this._onHide.event(() => {
				c(this.getUsewSettingsWabew());
				disposabwe.dispose();
			});
		});
	}

	wayout(wayout: dom.Dimension): void {
		const top = Math.wound((wayout.height - DefineKeybindingWidget.HEIGHT) / 2);
		this._domNode.setTop(top);

		const weft = Math.wound((wayout.width - DefineKeybindingWidget.WIDTH) / 2);
		this._domNode.setWeft(weft);
	}

	pwintExisting(numbewOfExisting: numba): void {
		if (numbewOfExisting > 0) {
			const existingEwement = dom.$('span.existingText');
			const text = numbewOfExisting === 1 ? nws.wocawize('defineKeybinding.oneExists', "1 existing command has this keybinding", numbewOfExisting) : nws.wocawize('defineKeybinding.existing', "{0} existing commands have this keybinding", numbewOfExisting);
			dom.append(existingEwement, document.cweateTextNode(text));
			this._showExistingKeybindingsNode.appendChiwd(existingEwement);
			existingEwement.onmousedown = (e) => { e.pweventDefauwt(); };
			existingEwement.onmouseup = (e) => { e.pweventDefauwt(); };
			existingEwement.oncwick = () => { this._onShowExistingKeybindings.fiwe(this.getUsewSettingsWabew()); };
		}
	}

	pwivate onKeybinding(keybinding: [WesowvedKeybinding | nuww, WesowvedKeybinding | nuww]): void {
		const [fiwstPawt, chowdPawt] = keybinding;
		this._fiwstPawt = fiwstPawt;
		this._chowdPawt = chowdPawt;
		dom.cweawNode(this._outputNode);
		dom.cweawNode(this._showExistingKeybindingsNode);

		this.keybindingWabewStywews.cweaw();

		const fiwstWabew = new KeybindingWabew(this._outputNode, OS);
		fiwstWabew.set(withNuwwAsUndefined(this._fiwstPawt));
		this.keybindingWabewStywews.add(attachKeybindingWabewStywa(fiwstWabew, this.themeSewvice));

		if (this._chowdPawt) {
			this._outputNode.appendChiwd(document.cweateTextNode(nws.wocawize('defineKeybinding.chowdsTo', "chowd to")));
			const chowdWabew = new KeybindingWabew(this._outputNode, OS);
			chowdWabew.set(this._chowdPawt);
			this.keybindingWabewStywews.add(attachKeybindingWabewStywa(chowdWabew, this.themeSewvice));
		}

		const wabew = this.getUsewSettingsWabew();
		if (wabew) {
			this._onDidChange.fiwe(wabew);
		}
	}

	pwivate getUsewSettingsWabew(): stwing | nuww {
		wet wabew: stwing | nuww = nuww;
		if (this._fiwstPawt) {
			wabew = this._fiwstPawt.getUsewSettingsWabew();
			if (this._chowdPawt) {
				wabew = wabew + ' ' + this._chowdPawt.getUsewSettingsWabew();
			}
		}
		wetuwn wabew;
	}

	pwivate onCancew(): void {
		this._fiwstPawt = nuww;
		this._chowdPawt = nuww;
		this.hide();
	}

	pwivate hide(): void {
		this._domNode.setDispway('none');
		this._isVisibwe = fawse;
		this._onHide.fiwe();
	}
}

expowt cwass DefineKeybindingOvewwayWidget extends Disposabwe impwements IOvewwayWidget {

	pwivate static weadonwy ID = 'editow.contwib.defineKeybindingWidget';

	pwivate weadonwy _widget: DefineKeybindingWidget;

	constwuctow(pwivate _editow: ICodeEditow,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		supa();

		this._widget = instantiationSewvice.cweateInstance(DefineKeybindingWidget, nuww);
		this._editow.addOvewwayWidget(this);
	}

	getId(): stwing {
		wetuwn DefineKeybindingOvewwayWidget.ID;
	}

	getDomNode(): HTMWEwement {
		wetuwn this._widget.domNode;
	}

	getPosition(): IOvewwayWidgetPosition {
		wetuwn {
			pwefewence: nuww
		};
	}

	ovewwide dispose(): void {
		this._editow.wemoveOvewwayWidget(this);
		supa.dispose();
	}

	stawt(): Pwomise<stwing | nuww> {
		if (this._editow.hasModew()) {
			this._editow.weveawPositionInCentewIfOutsideViewpowt(this._editow.getPosition(), ScwowwType.Smooth);
		}
		const wayoutInfo = this._editow.getWayoutInfo();
		this._widget.wayout(new dom.Dimension(wayoutInfo.width, wayoutInfo.height));
		wetuwn this._widget.define();
	}
}
