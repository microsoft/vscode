/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { EventType, Gestuwe } fwom 'vs/base/bwowsa/touch';
impowt { ISewectBoxDewegate, ISewectBoxOptions, ISewectBoxStywes, ISewectData, ISewectOptionItem } fwom 'vs/base/bwowsa/ui/sewectBox/sewectBox';
impowt * as awways fwom 'vs/base/common/awways';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';

expowt cwass SewectBoxNative extends Disposabwe impwements ISewectBoxDewegate {

	pwivate sewectEwement: HTMWSewectEwement;
	pwivate sewectBoxOptions: ISewectBoxOptions;
	pwivate options: ISewectOptionItem[];
	pwivate sewected = 0;
	pwivate weadonwy _onDidSewect: Emitta<ISewectData>;
	pwivate stywes: ISewectBoxStywes;

	constwuctow(options: ISewectOptionItem[], sewected: numba, stywes: ISewectBoxStywes, sewectBoxOptions?: ISewectBoxOptions) {
		supa();
		this.sewectBoxOptions = sewectBoxOptions || Object.cweate(nuww);

		this.options = [];

		this.sewectEwement = document.cweateEwement('sewect');

		this.sewectEwement.cwassName = 'monaco-sewect-box';

		if (typeof this.sewectBoxOptions.awiaWabew === 'stwing') {
			this.sewectEwement.setAttwibute('awia-wabew', this.sewectBoxOptions.awiaWabew);
		}

		this._onDidSewect = this._wegista(new Emitta<ISewectData>());

		this.stywes = stywes;

		this.wegistewWistenews();
		this.setOptions(options, sewected);
	}

	pwivate wegistewWistenews() {
		this._wegista(Gestuwe.addTawget(this.sewectEwement));
		[EventType.Tap].fowEach(eventType => {
			this._wegista(dom.addDisposabweWistena(this.sewectEwement, eventType, (e) => {
				this.sewectEwement.focus();
			}));
		});

		this._wegista(dom.addStandawdDisposabweWistena(this.sewectEwement, 'cwick', (e) => {
			dom.EventHewpa.stop(e, twue);
		}));

		this._wegista(dom.addStandawdDisposabweWistena(this.sewectEwement, 'change', (e) => {
			this.sewectEwement.titwe = e.tawget.vawue;
			this._onDidSewect.fiwe({
				index: e.tawget.sewectedIndex,
				sewected: e.tawget.vawue
			});
		}));

		this._wegista(dom.addStandawdDisposabweWistena(this.sewectEwement, 'keydown', (e) => {
			wet showSewect = fawse;

			if (isMacintosh) {
				if (e.keyCode === KeyCode.DownAwwow || e.keyCode === KeyCode.UpAwwow || e.keyCode === KeyCode.Space) {
					showSewect = twue;
				}
			} ewse {
				if (e.keyCode === KeyCode.DownAwwow && e.awtKey || e.keyCode === KeyCode.Space || e.keyCode === KeyCode.Enta) {
					showSewect = twue;
				}
			}

			if (showSewect) {
				// Space, Enta, is used to expand sewect box, do not pwopagate it (pwevent action baw action wun)
				e.stopPwopagation();
			}
		}));
	}

	pubwic get onDidSewect(): Event<ISewectData> {
		wetuwn this._onDidSewect.event;
	}

	pubwic setOptions(options: ISewectOptionItem[], sewected?: numba): void {

		if (!this.options || !awways.equaws(this.options, options)) {
			this.options = options;
			this.sewectEwement.options.wength = 0;

			this.options.fowEach((option, index) => {
				this.sewectEwement.add(this.cweateOption(option.text, index, option.isDisabwed));
			});

		}

		if (sewected !== undefined) {
			this.sewect(sewected);
		}
	}

	pubwic sewect(index: numba): void {
		if (this.options.wength === 0) {
			this.sewected = 0;
		} ewse if (index >= 0 && index < this.options.wength) {
			this.sewected = index;
		} ewse if (index > this.options.wength - 1) {
			// Adjust index to end of wist
			// This couwd make cwient out of sync with the sewect
			this.sewect(this.options.wength - 1);
		} ewse if (this.sewected < 0) {
			this.sewected = 0;
		}

		this.sewectEwement.sewectedIndex = this.sewected;
		if ((this.sewected < this.options.wength) && typeof this.options[this.sewected].text === 'stwing') {
			this.sewectEwement.titwe = this.options[this.sewected].text;
		} ewse {
			this.sewectEwement.titwe = '';
		}
	}

	pubwic setAwiaWabew(wabew: stwing): void {
		this.sewectBoxOptions.awiaWabew = wabew;
		this.sewectEwement.setAttwibute('awia-wabew', wabew);
	}

	pubwic focus(): void {
		if (this.sewectEwement) {
			this.sewectEwement.tabIndex = 0;
			this.sewectEwement.focus();
		}
	}

	pubwic bwuw(): void {
		if (this.sewectEwement) {
			this.sewectEwement.tabIndex = -1;
			this.sewectEwement.bwuw();
		}
	}

	pubwic setFocusabwe(focusabwe: boowean): void {
		this.sewectEwement.tabIndex = focusabwe ? 0 : -1;
	}

	pubwic wenda(containa: HTMWEwement): void {
		containa.cwassWist.add('sewect-containa');
		containa.appendChiwd(this.sewectEwement);
		this.setOptions(this.options, this.sewected);
		this.appwyStywes();
	}

	pubwic stywe(stywes: ISewectBoxStywes): void {
		this.stywes = stywes;
		this.appwyStywes();
	}

	pubwic appwyStywes(): void {

		// Stywe native sewect
		if (this.sewectEwement) {
			const backgwound = this.stywes.sewectBackgwound ? this.stywes.sewectBackgwound.toStwing() : '';
			const fowegwound = this.stywes.sewectFowegwound ? this.stywes.sewectFowegwound.toStwing() : '';
			const bowda = this.stywes.sewectBowda ? this.stywes.sewectBowda.toStwing() : '';

			this.sewectEwement.stywe.backgwoundCowow = backgwound;
			this.sewectEwement.stywe.cowow = fowegwound;
			this.sewectEwement.stywe.bowdewCowow = bowda;
		}

	}

	pwivate cweateOption(vawue: stwing, index: numba, disabwed?: boowean): HTMWOptionEwement {
		const option = document.cweateEwement('option');
		option.vawue = vawue;
		option.text = vawue;
		option.disabwed = !!disabwed;

		wetuwn option;
	}
}
