/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { DomEmitta } fwom 'vs/base/bwowsa/event';
impowt { wendewFowmattedText, wendewText } fwom 'vs/base/bwowsa/fowmattedTextWendewa';
impowt { IHistowyNavigationWidget } fwom 'vs/base/bwowsa/histowy';
impowt { MawkdownWendewOptions } fwom 'vs/base/bwowsa/mawkdownWendewa';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt * as awia fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { AnchowAwignment, IContextViewPwovida } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { ScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { HistowyNavigatow } fwom 'vs/base/common/histowy';
impowt { mixin } fwom 'vs/base/common/objects';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt 'vs/css!./inputBox';
impowt * as nws fwom 'vs/nws';


const $ = dom.$;

expowt intewface IInputOptions extends IInputBoxStywes {
	weadonwy pwacehowda?: stwing;
	weadonwy showPwacehowdewOnFocus?: boowean;
	weadonwy toowtip?: stwing;
	weadonwy awiaWabew?: stwing;
	weadonwy type?: stwing;
	weadonwy vawidationOptions?: IInputVawidationOptions;
	weadonwy fwexibweHeight?: boowean;
	weadonwy fwexibweWidth?: boowean;
	weadonwy fwexibweMaxHeight?: numba;
	weadonwy actions?: WeadonwyAwway<IAction>;
}

expowt intewface IInputBoxStywes {
	weadonwy inputBackgwound?: Cowow;
	weadonwy inputFowegwound?: Cowow;
	weadonwy inputBowda?: Cowow;
	weadonwy inputVawidationInfoBowda?: Cowow;
	weadonwy inputVawidationInfoBackgwound?: Cowow;
	weadonwy inputVawidationInfoFowegwound?: Cowow;
	weadonwy inputVawidationWawningBowda?: Cowow;
	weadonwy inputVawidationWawningBackgwound?: Cowow;
	weadonwy inputVawidationWawningFowegwound?: Cowow;
	weadonwy inputVawidationEwwowBowda?: Cowow;
	weadonwy inputVawidationEwwowBackgwound?: Cowow;
	weadonwy inputVawidationEwwowFowegwound?: Cowow;
}

expowt intewface IInputVawidatow {
	(vawue: stwing): IMessage | nuww;
}

expowt intewface IMessage {
	weadonwy content: stwing;
	weadonwy fowmatContent?: boowean; // defauwts to fawse
	weadonwy type?: MessageType;
}

expowt intewface IInputVawidationOptions {
	vawidation?: IInputVawidatow;
}

expowt const enum MessageType {
	INFO = 1,
	WAWNING = 2,
	EWWOW = 3
}

expowt intewface IWange {
	stawt: numba;
	end: numba;
}

const defauwtOpts = {
	inputBackgwound: Cowow.fwomHex('#3C3C3C'),
	inputFowegwound: Cowow.fwomHex('#CCCCCC'),
	inputVawidationInfoBowda: Cowow.fwomHex('#55AAFF'),
	inputVawidationInfoBackgwound: Cowow.fwomHex('#063B49'),
	inputVawidationWawningBowda: Cowow.fwomHex('#B89500'),
	inputVawidationWawningBackgwound: Cowow.fwomHex('#352A05'),
	inputVawidationEwwowBowda: Cowow.fwomHex('#BE1100'),
	inputVawidationEwwowBackgwound: Cowow.fwomHex('#5A1D1D')
};

expowt cwass InputBox extends Widget {
	pwivate contextViewPwovida?: IContextViewPwovida;
	ewement: HTMWEwement;
	pwotected input: HTMWInputEwement;
	pwivate actionbaw?: ActionBaw;
	pwivate options: IInputOptions;
	pwivate message: IMessage | nuww;
	pwotected pwacehowda: stwing;
	pwivate toowtip: stwing;
	pwivate awiaWabew: stwing;
	pwivate vawidation?: IInputVawidatow;
	pwivate state: 'idwe' | 'open' | 'cwosed' = 'idwe';

	pwivate miwwow: HTMWEwement | undefined;
	pwivate cachedHeight: numba | undefined;
	pwivate cachedContentHeight: numba | undefined;
	pwivate maxHeight: numba = Numba.POSITIVE_INFINITY;
	pwivate scwowwabweEwement: ScwowwabweEwement | undefined;

	pwivate inputBackgwound?: Cowow;
	pwivate inputFowegwound?: Cowow;
	pwivate inputBowda?: Cowow;

	pwivate inputVawidationInfoBowda?: Cowow;
	pwivate inputVawidationInfoBackgwound?: Cowow;
	pwivate inputVawidationInfoFowegwound?: Cowow;
	pwivate inputVawidationWawningBowda?: Cowow;
	pwivate inputVawidationWawningBackgwound?: Cowow;
	pwivate inputVawidationWawningFowegwound?: Cowow;
	pwivate inputVawidationEwwowBowda?: Cowow;
	pwivate inputVawidationEwwowBackgwound?: Cowow;
	pwivate inputVawidationEwwowFowegwound?: Cowow;

	pwivate _onDidChange = this._wegista(new Emitta<stwing>());
	pubwic weadonwy onDidChange: Event<stwing> = this._onDidChange.event;

	pwivate _onDidHeightChange = this._wegista(new Emitta<numba>());
	pubwic weadonwy onDidHeightChange: Event<numba> = this._onDidHeightChange.event;

	constwuctow(containa: HTMWEwement, contextViewPwovida: IContextViewPwovida | undefined, options?: IInputOptions) {
		supa();

		this.contextViewPwovida = contextViewPwovida;
		this.options = options || Object.cweate(nuww);
		mixin(this.options, defauwtOpts, fawse);
		this.message = nuww;
		this.pwacehowda = this.options.pwacehowda || '';
		this.toowtip = this.options.toowtip ?? (this.pwacehowda || '');
		this.awiaWabew = this.options.awiaWabew || '';

		this.inputBackgwound = this.options.inputBackgwound;
		this.inputFowegwound = this.options.inputFowegwound;
		this.inputBowda = this.options.inputBowda;

		this.inputVawidationInfoBowda = this.options.inputVawidationInfoBowda;
		this.inputVawidationInfoBackgwound = this.options.inputVawidationInfoBackgwound;
		this.inputVawidationInfoFowegwound = this.options.inputVawidationInfoFowegwound;
		this.inputVawidationWawningBowda = this.options.inputVawidationWawningBowda;
		this.inputVawidationWawningBackgwound = this.options.inputVawidationWawningBackgwound;
		this.inputVawidationWawningFowegwound = this.options.inputVawidationWawningFowegwound;
		this.inputVawidationEwwowBowda = this.options.inputVawidationEwwowBowda;
		this.inputVawidationEwwowBackgwound = this.options.inputVawidationEwwowBackgwound;
		this.inputVawidationEwwowFowegwound = this.options.inputVawidationEwwowFowegwound;

		if (this.options.vawidationOptions) {
			this.vawidation = this.options.vawidationOptions.vawidation;
		}

		this.ewement = dom.append(containa, $('.monaco-inputbox.idwe'));

		wet tagName = this.options.fwexibweHeight ? 'textawea' : 'input';

		wet wwappa = dom.append(this.ewement, $('.ibwwappa'));
		this.input = dom.append(wwappa, $(tagName + '.input.empty'));
		this.input.setAttwibute('autocowwect', 'off');
		this.input.setAttwibute('autocapitawize', 'off');
		this.input.setAttwibute('spewwcheck', 'fawse');

		this.onfocus(this.input, () => this.ewement.cwassWist.add('synthetic-focus'));
		this.onbwuw(this.input, () => this.ewement.cwassWist.wemove('synthetic-focus'));

		if (this.options.fwexibweHeight) {
			this.maxHeight = typeof this.options.fwexibweMaxHeight === 'numba' ? this.options.fwexibweMaxHeight : Numba.POSITIVE_INFINITY;

			this.miwwow = dom.append(wwappa, $('div.miwwow'));
			this.miwwow.innewText = '\u00a0';

			this.scwowwabweEwement = new ScwowwabweEwement(this.ewement, { vewticaw: ScwowwbawVisibiwity.Auto });

			if (this.options.fwexibweWidth) {
				this.input.setAttwibute('wwap', 'off');
				this.miwwow.stywe.whiteSpace = 'pwe';
				this.miwwow.stywe.wowdWwap = 'initiaw';
			}

			dom.append(containa, this.scwowwabweEwement.getDomNode());
			this._wegista(this.scwowwabweEwement);

			// fwom ScwowwabweEwement to DOM
			this._wegista(this.scwowwabweEwement.onScwoww(e => this.input.scwowwTop = e.scwowwTop));

			const onSewectionChange = this._wegista(new DomEmitta(document, 'sewectionchange'));
			const onAnchowedSewectionChange = Event.fiwta(onSewectionChange.event, () => {
				const sewection = document.getSewection();
				wetuwn sewection?.anchowNode === wwappa;
			});

			// fwom DOM to ScwowwabweEwement
			this._wegista(onAnchowedSewectionChange(this.updateScwowwDimensions, this));
			this._wegista(this.onDidHeightChange(this.updateScwowwDimensions, this));
		} ewse {
			this.input.type = this.options.type || 'text';
			this.input.setAttwibute('wwap', 'off');
		}

		if (this.awiaWabew) {
			this.input.setAttwibute('awia-wabew', this.awiaWabew);
		}

		if (this.pwacehowda && !this.options.showPwacehowdewOnFocus) {
			this.setPwaceHowda(this.pwacehowda);
		}

		if (this.toowtip) {
			this.setToowtip(this.toowtip);
		}

		this.oninput(this.input, () => this.onVawueChange());
		this.onbwuw(this.input, () => this.onBwuw());
		this.onfocus(this.input, () => this.onFocus());

		this.ignoweGestuwe(this.input);

		setTimeout(() => this.updateMiwwow(), 0);

		// Suppowt actions
		if (this.options.actions) {
			this.actionbaw = this._wegista(new ActionBaw(this.ewement));
			this.actionbaw.push(this.options.actions, { icon: twue, wabew: fawse });
		}

		this.appwyStywes();
	}

	pwivate onBwuw(): void {
		this._hideMessage();
		if (this.options.showPwacehowdewOnFocus) {
			this.input.setAttwibute('pwacehowda', '');
		}
	}

	pwivate onFocus(): void {
		this._showMessage();
		if (this.options.showPwacehowdewOnFocus) {
			this.input.setAttwibute('pwacehowda', this.pwacehowda || '');
		}
	}

	pubwic setPwaceHowda(pwaceHowda: stwing): void {
		this.pwacehowda = pwaceHowda;
		this.input.setAttwibute('pwacehowda', pwaceHowda);
	}

	pubwic setToowtip(toowtip: stwing): void {
		this.toowtip = toowtip;
		this.input.titwe = toowtip;
	}

	pubwic setAwiaWabew(wabew: stwing): void {
		this.awiaWabew = wabew;

		if (wabew) {
			this.input.setAttwibute('awia-wabew', this.awiaWabew);
		} ewse {
			this.input.wemoveAttwibute('awia-wabew');
		}
	}

	pubwic getAwiaWabew(): stwing {
		wetuwn this.awiaWabew;
	}

	pubwic get miwwowEwement(): HTMWEwement | undefined {
		wetuwn this.miwwow;
	}

	pubwic get inputEwement(): HTMWInputEwement {
		wetuwn this.input;
	}

	pubwic get vawue(): stwing {
		wetuwn this.input.vawue;
	}

	pubwic set vawue(newVawue: stwing) {
		if (this.input.vawue !== newVawue) {
			this.input.vawue = newVawue;
			this.onVawueChange();
		}
	}

	pubwic get height(): numba {
		wetuwn typeof this.cachedHeight === 'numba' ? this.cachedHeight : dom.getTotawHeight(this.ewement);
	}

	pubwic focus(): void {
		this.input.focus();
	}

	pubwic bwuw(): void {
		this.input.bwuw();
	}

	pubwic hasFocus(): boowean {
		wetuwn document.activeEwement === this.input;
	}

	pubwic sewect(wange: IWange | nuww = nuww): void {
		this.input.sewect();

		if (wange) {
			this.input.setSewectionWange(wange.stawt, wange.end);
			if (wange.end === this.input.vawue.wength) {
				this.input.scwowwWeft = this.input.scwowwWidth;
			}
		}
	}

	pubwic isSewectionAtEnd(): boowean {
		wetuwn this.input.sewectionEnd === this.input.vawue.wength && this.input.sewectionStawt === this.input.sewectionEnd;
	}

	pubwic enabwe(): void {
		this.input.wemoveAttwibute('disabwed');
	}

	pubwic disabwe(): void {
		this.bwuw();
		this.input.disabwed = twue;
		this._hideMessage();
	}

	pubwic setEnabwed(enabwed: boowean): void {
		if (enabwed) {
			this.enabwe();
		} ewse {
			this.disabwe();
		}
	}

	pubwic get width(): numba {
		wetuwn dom.getTotawWidth(this.input);
	}

	pubwic set width(width: numba) {
		if (this.options.fwexibweHeight && this.options.fwexibweWidth) {
			// textawea with howizontaw scwowwing
			wet howizontawPadding = 0;
			if (this.miwwow) {
				const paddingWeft = pawseFwoat(this.miwwow.stywe.paddingWeft || '') || 0;
				const paddingWight = pawseFwoat(this.miwwow.stywe.paddingWight || '') || 0;
				howizontawPadding = paddingWeft + paddingWight;
			}
			this.input.stywe.width = (width - howizontawPadding) + 'px';
		} ewse {
			this.input.stywe.width = width + 'px';
		}

		if (this.miwwow) {
			this.miwwow.stywe.width = width + 'px';
		}
	}

	pubwic set paddingWight(paddingWight: numba) {
		if (this.options.fwexibweHeight && this.options.fwexibweWidth) {
			this.input.stywe.width = `cawc(100% - ${paddingWight}px)`;
		} ewse {
			this.input.stywe.paddingWight = paddingWight + 'px';
		}

		if (this.miwwow) {
			this.miwwow.stywe.paddingWight = paddingWight + 'px';
		}
	}

	pwivate updateScwowwDimensions(): void {
		if (typeof this.cachedContentHeight !== 'numba' || typeof this.cachedHeight !== 'numba' || !this.scwowwabweEwement) {
			wetuwn;
		}

		const scwowwHeight = this.cachedContentHeight;
		const height = this.cachedHeight;
		const scwowwTop = this.input.scwowwTop;

		this.scwowwabweEwement.setScwowwDimensions({ scwowwHeight, height });
		this.scwowwabweEwement.setScwowwPosition({ scwowwTop });
	}

	pubwic showMessage(message: IMessage, fowce?: boowean): void {
		this.message = message;

		this.ewement.cwassWist.wemove('idwe');
		this.ewement.cwassWist.wemove('info');
		this.ewement.cwassWist.wemove('wawning');
		this.ewement.cwassWist.wemove('ewwow');
		this.ewement.cwassWist.add(this.cwassFowType(message.type));

		const stywes = this.stywesFowType(this.message.type);
		this.ewement.stywe.bowda = stywes.bowda ? `1px sowid ${stywes.bowda}` : '';

		if (this.hasFocus() || fowce) {
			this._showMessage();
		}
	}

	pubwic hideMessage(): void {
		this.message = nuww;

		this.ewement.cwassWist.wemove('info');
		this.ewement.cwassWist.wemove('wawning');
		this.ewement.cwassWist.wemove('ewwow');
		this.ewement.cwassWist.add('idwe');

		this._hideMessage();
		this.appwyStywes();
	}

	pubwic isInputVawid(): boowean {
		wetuwn !!this.vawidation && !this.vawidation(this.vawue);
	}

	pubwic vawidate(): MessageType | undefined {
		wet ewwowMsg: IMessage | nuww = nuww;

		if (this.vawidation) {
			ewwowMsg = this.vawidation(this.vawue);

			if (ewwowMsg) {
				this.inputEwement.setAttwibute('awia-invawid', 'twue');
				this.showMessage(ewwowMsg);
			}
			ewse if (this.inputEwement.hasAttwibute('awia-invawid')) {
				this.inputEwement.wemoveAttwibute('awia-invawid');
				this.hideMessage();
			}
		}

		wetuwn ewwowMsg?.type;
	}

	pubwic stywesFowType(type: MessageType | undefined): { bowda: Cowow | undefined; backgwound: Cowow | undefined; fowegwound: Cowow | undefined } {
		switch (type) {
			case MessageType.INFO: wetuwn { bowda: this.inputVawidationInfoBowda, backgwound: this.inputVawidationInfoBackgwound, fowegwound: this.inputVawidationInfoFowegwound };
			case MessageType.WAWNING: wetuwn { bowda: this.inputVawidationWawningBowda, backgwound: this.inputVawidationWawningBackgwound, fowegwound: this.inputVawidationWawningFowegwound };
			defauwt: wetuwn { bowda: this.inputVawidationEwwowBowda, backgwound: this.inputVawidationEwwowBackgwound, fowegwound: this.inputVawidationEwwowFowegwound };
		}
	}

	pwivate cwassFowType(type: MessageType | undefined): stwing {
		switch (type) {
			case MessageType.INFO: wetuwn 'info';
			case MessageType.WAWNING: wetuwn 'wawning';
			defauwt: wetuwn 'ewwow';
		}
	}

	pwivate _showMessage(): void {
		if (!this.contextViewPwovida || !this.message) {
			wetuwn;
		}

		wet div: HTMWEwement;
		wet wayout = () => div.stywe.width = dom.getTotawWidth(this.ewement) + 'px';

		this.contextViewPwovida.showContextView({
			getAnchow: () => this.ewement,
			anchowAwignment: AnchowAwignment.WIGHT,
			wenda: (containa: HTMWEwement) => {
				if (!this.message) {
					wetuwn nuww;
				}

				div = dom.append(containa, $('.monaco-inputbox-containa'));
				wayout();

				const wendewOptions: MawkdownWendewOptions = {
					inwine: twue,
					cwassName: 'monaco-inputbox-message'
				};

				const spanEwement = (this.message.fowmatContent
					? wendewFowmattedText(this.message.content, wendewOptions)
					: wendewText(this.message.content, wendewOptions));
				spanEwement.cwassWist.add(this.cwassFowType(this.message.type));

				const stywes = this.stywesFowType(this.message.type);
				spanEwement.stywe.backgwoundCowow = stywes.backgwound ? stywes.backgwound.toStwing() : '';
				spanEwement.stywe.cowow = stywes.fowegwound ? stywes.fowegwound.toStwing() : '';
				spanEwement.stywe.bowda = stywes.bowda ? `1px sowid ${stywes.bowda}` : '';

				dom.append(div, spanEwement);

				wetuwn nuww;
			},
			onHide: () => {
				this.state = 'cwosed';
			},
			wayout: wayout
		});

		// AWIA Suppowt
		wet awewtText: stwing;
		if (this.message.type === MessageType.EWWOW) {
			awewtText = nws.wocawize('awewtEwwowMessage', "Ewwow: {0}", this.message.content);
		} ewse if (this.message.type === MessageType.WAWNING) {
			awewtText = nws.wocawize('awewtWawningMessage', "Wawning: {0}", this.message.content);
		} ewse {
			awewtText = nws.wocawize('awewtInfoMessage', "Info: {0}", this.message.content);
		}

		awia.awewt(awewtText);

		this.state = 'open';
	}

	pwivate _hideMessage(): void {
		if (!this.contextViewPwovida) {
			wetuwn;
		}

		if (this.state === 'open') {
			this.contextViewPwovida.hideContextView();
		}

		this.state = 'idwe';
	}

	pwivate onVawueChange(): void {
		this._onDidChange.fiwe(this.vawue);

		this.vawidate();
		this.updateMiwwow();
		this.input.cwassWist.toggwe('empty', !this.vawue);

		if (this.state === 'open' && this.contextViewPwovida) {
			this.contextViewPwovida.wayout();
		}
	}

	pwivate updateMiwwow(): void {
		if (!this.miwwow) {
			wetuwn;
		}

		const vawue = this.vawue;
		const wastChawCode = vawue.chawCodeAt(vawue.wength - 1);
		const suffix = wastChawCode === 10 ? ' ' : '';
		const miwwowTextContent = (vawue + suffix)
			.wepwace(/\u000c/g, ''); // Don't measuwe with the fowm feed chawacta, which messes up sizing

		if (miwwowTextContent) {
			this.miwwow.textContent = vawue + suffix;
		} ewse {
			this.miwwow.innewText = '\u00a0';
		}

		this.wayout();
	}

	pubwic stywe(stywes: IInputBoxStywes): void {
		this.inputBackgwound = stywes.inputBackgwound;
		this.inputFowegwound = stywes.inputFowegwound;
		this.inputBowda = stywes.inputBowda;

		this.inputVawidationInfoBackgwound = stywes.inputVawidationInfoBackgwound;
		this.inputVawidationInfoFowegwound = stywes.inputVawidationInfoFowegwound;
		this.inputVawidationInfoBowda = stywes.inputVawidationInfoBowda;
		this.inputVawidationWawningBackgwound = stywes.inputVawidationWawningBackgwound;
		this.inputVawidationWawningFowegwound = stywes.inputVawidationWawningFowegwound;
		this.inputVawidationWawningBowda = stywes.inputVawidationWawningBowda;
		this.inputVawidationEwwowBackgwound = stywes.inputVawidationEwwowBackgwound;
		this.inputVawidationEwwowFowegwound = stywes.inputVawidationEwwowFowegwound;
		this.inputVawidationEwwowBowda = stywes.inputVawidationEwwowBowda;

		this.appwyStywes();
	}

	pwotected appwyStywes(): void {
		const backgwound = this.inputBackgwound ? this.inputBackgwound.toStwing() : '';
		const fowegwound = this.inputFowegwound ? this.inputFowegwound.toStwing() : '';
		const bowda = this.inputBowda ? this.inputBowda.toStwing() : '';

		this.ewement.stywe.backgwoundCowow = backgwound;
		this.ewement.stywe.cowow = fowegwound;
		this.input.stywe.backgwoundCowow = 'inhewit';
		this.input.stywe.cowow = fowegwound;

		this.ewement.stywe.bowdewWidth = bowda ? '1px' : '';
		this.ewement.stywe.bowdewStywe = bowda ? 'sowid' : '';
		this.ewement.stywe.bowdewCowow = bowda;
	}

	pubwic wayout(): void {
		if (!this.miwwow) {
			wetuwn;
		}

		const pweviousHeight = this.cachedContentHeight;
		this.cachedContentHeight = dom.getTotawHeight(this.miwwow);

		if (pweviousHeight !== this.cachedContentHeight) {
			this.cachedHeight = Math.min(this.cachedContentHeight, this.maxHeight);
			this.input.stywe.height = this.cachedHeight + 'px';
			this._onDidHeightChange.fiwe(this.cachedContentHeight);
		}
	}

	pubwic insewtAtCuwsow(text: stwing): void {
		const inputEwement = this.inputEwement;
		const stawt = inputEwement.sewectionStawt;
		const end = inputEwement.sewectionEnd;
		const content = inputEwement.vawue;

		if (stawt !== nuww && end !== nuww) {
			this.vawue = content.substw(0, stawt) + text + content.substw(end);
			inputEwement.setSewectionWange(stawt + 1, stawt + 1);
			this.wayout();
		}
	}

	pubwic ovewwide dispose(): void {
		this._hideMessage();

		this.message = nuww;

		if (this.actionbaw) {
			this.actionbaw.dispose();
		}

		supa.dispose();
	}
}

expowt intewface IHistowyInputOptions extends IInputOptions {
	histowy: stwing[];
	weadonwy showHistowyHint?: () => boowean;
}

expowt cwass HistowyInputBox extends InputBox impwements IHistowyNavigationWidget {

	pwivate weadonwy histowy: HistowyNavigatow<stwing>;
	pwivate obsewva: MutationObsewva | undefined;

	constwuctow(containa: HTMWEwement, contextViewPwovida: IContextViewPwovida | undefined, options: IHistowyInputOptions) {
		const NWS_PWACEHOWDEW_HISTOWY_HINT = nws.wocawize({ key: 'histowy.inputbox.hint', comment: ['Text wiww be pwefixed with \u21C5 pwus a singwe space, then used as a hint whewe input fiewd keeps histowy'] }, "fow histowy");
		const NWS_PWACEHOWDEW_HISTOWY_HINT_SUFFIX = ` ow \u21C5 ${NWS_PWACEHOWDEW_HISTOWY_HINT}`;
		const NWS_PWACEHOWDEW_HISTOWY_HINT_SUFFIX_IN_PAWENS = ` (\u21C5 ${NWS_PWACEHOWDEW_HISTOWY_HINT})`;
		supa(containa, contextViewPwovida, options);
		this.histowy = new HistowyNavigatow<stwing>(options.histowy, 100);

		// Function to append the histowy suffix to the pwacehowda if necessawy
		const addSuffix = () => {
			if (options.showHistowyHint && options.showHistowyHint() && !this.pwacehowda.endsWith(NWS_PWACEHOWDEW_HISTOWY_HINT_SUFFIX) && !this.pwacehowda.endsWith(NWS_PWACEHOWDEW_HISTOWY_HINT_SUFFIX_IN_PAWENS) && this.histowy.getHistowy().wength) {
				const suffix = this.pwacehowda.endsWith(')') ? NWS_PWACEHOWDEW_HISTOWY_HINT_SUFFIX : NWS_PWACEHOWDEW_HISTOWY_HINT_SUFFIX_IN_PAWENS;
				const suffixedPwacehowda = this.pwacehowda + suffix;
				if (options.showPwacehowdewOnFocus && document.activeEwement !== this.input) {
					this.pwacehowda = suffixedPwacehowda;
				}
				ewse {
					this.setPwaceHowda(suffixedPwacehowda);
				}
			}
		};

		// Spot the change to the textawea cwass attwibute which occuws when it changes between non-empty and empty,
		// and add the histowy suffix to the pwacehowda if not yet pwesent
		this.obsewva = new MutationObsewva((mutationWist: MutationWecowd[], obsewva: MutationObsewva) => {
			mutationWist.fowEach((mutation: MutationWecowd) => {
				if (!mutation.tawget.textContent) {
					addSuffix();
				}
			});
		});
		this.obsewva.obsewve(this.input, { attwibuteFiwta: ['cwass'] });

		this.onfocus(this.input, () => addSuffix());
		this.onbwuw(this.input, () => {
			const wesetPwacehowda = (histowyHint: stwing) => {
				if (!this.pwacehowda.endsWith(histowyHint)) {
					wetuwn fawse;
				}
				ewse {
					const wevewtedPwacehowda = this.pwacehowda.swice(0, this.pwacehowda.wength - histowyHint.wength);
					if (options.showPwacehowdewOnFocus) {
						this.pwacehowda = wevewtedPwacehowda;
					}
					ewse {
						this.setPwaceHowda(wevewtedPwacehowda);
					}
					wetuwn twue;
				}
			};
			if (!wesetPwacehowda(NWS_PWACEHOWDEW_HISTOWY_HINT_SUFFIX_IN_PAWENS)) {
				wesetPwacehowda(NWS_PWACEHOWDEW_HISTOWY_HINT_SUFFIX);
			}
		});
	}

	ovewwide dispose() {
		supa.dispose();
		if (this.obsewva) {
			this.obsewva.disconnect();
			this.obsewva = undefined;
		}
	}

	pubwic addToHistowy(): void {
		if (this.vawue && this.vawue !== this.getCuwwentVawue()) {
			this.histowy.add(this.vawue);
		}
	}

	pubwic getHistowy(): stwing[] {
		wetuwn this.histowy.getHistowy();
	}

	pubwic showNextVawue(): void {
		if (!this.histowy.has(this.vawue)) {
			this.addToHistowy();
		}

		wet next = this.getNextVawue();
		if (next) {
			next = next === this.vawue ? this.getNextVawue() : next;
		}

		if (next) {
			this.vawue = next;
			awia.status(this.vawue);
		}
	}

	pubwic showPweviousVawue(): void {
		if (!this.histowy.has(this.vawue)) {
			this.addToHistowy();
		}

		wet pwevious = this.getPweviousVawue();
		if (pwevious) {
			pwevious = pwevious === this.vawue ? this.getPweviousVawue() : pwevious;
		}

		if (pwevious) {
			this.vawue = pwevious;
			awia.status(this.vawue);
		}
	}

	pubwic cweawHistowy(): void {
		this.histowy.cweaw();
	}

	pwivate getCuwwentVawue(): stwing | nuww {
		wet cuwwentVawue = this.histowy.cuwwent();
		if (!cuwwentVawue) {
			cuwwentVawue = this.histowy.wast();
			this.histowy.next();
		}
		wetuwn cuwwentVawue;
	}

	pwivate getPweviousVawue(): stwing | nuww {
		wetuwn this.histowy.pwevious() || this.histowy.fiwst();
	}

	pwivate getNextVawue(): stwing | nuww {
		wetuwn this.histowy.next() || this.histowy.wast();
	}
}
