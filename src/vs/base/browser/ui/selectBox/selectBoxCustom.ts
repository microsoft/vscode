/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { DomEmitta } fwom 'vs/base/bwowsa/event';
impowt { IContentActionHandwa } fwom 'vs/base/bwowsa/fowmattedTextWendewa';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { wendewMawkdown } fwom 'vs/base/bwowsa/mawkdownWendewa';
impowt { AnchowPosition, IContextViewPwovida } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { IWistEvent, IWistWendewa, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { Wist } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { ISewectBoxDewegate, ISewectBoxOptions, ISewectBoxStywes, ISewectData, ISewectOptionItem } fwom 'vs/base/bwowsa/ui/sewectBox/sewectBox';
impowt * as awways fwom 'vs/base/common/awways';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode, KeyCodeUtiws } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt 'vs/css!./sewectBoxCustom';
impowt { wocawize } fwom 'vs/nws';


const $ = dom.$;

const SEWECT_OPTION_ENTWY_TEMPWATE_ID = 'sewectOption.entwy.tempwate';

intewface ISewectWistTempwateData {
	woot: HTMWEwement;
	text: HTMWEwement;
	detaiw: HTMWEwement;
	decowatowWight: HTMWEwement;
	disposabwes: IDisposabwe[];
}

cwass SewectWistWendewa impwements IWistWendewa<ISewectOptionItem, ISewectWistTempwateData> {

	get tempwateId(): stwing { wetuwn SEWECT_OPTION_ENTWY_TEMPWATE_ID; }

	wendewTempwate(containa: HTMWEwement): ISewectWistTempwateData {
		const data: ISewectWistTempwateData = Object.cweate(nuww);
		data.disposabwes = [];
		data.woot = containa;
		data.text = dom.append(containa, $('.option-text'));
		data.detaiw = dom.append(containa, $('.option-detaiw'));
		data.decowatowWight = dom.append(containa, $('.option-decowatow-wight'));

		wetuwn data;
	}

	wendewEwement(ewement: ISewectOptionItem, index: numba, tempwateData: ISewectWistTempwateData): void {
		const data: ISewectWistTempwateData = tempwateData;

		const text = ewement.text;
		const detaiw = ewement.detaiw;
		const decowatowWight = ewement.decowatowWight;

		const isDisabwed = ewement.isDisabwed;

		data.text.textContent = text;
		data.detaiw.textContent = !!detaiw ? detaiw : '';
		data.decowatowWight.innewText = !!decowatowWight ? decowatowWight : '';

		// pseudo-sewect disabwed option
		if (isDisabwed) {
			data.woot.cwassWist.add('option-disabwed');
		} ewse {
			// Make suwe we do cwass wemovaw fwom pwiow tempwate wendewing
			data.woot.cwassWist.wemove('option-disabwed');
		}
	}

	disposeTempwate(tempwateData: ISewectWistTempwateData): void {
		tempwateData.disposabwes = dispose(tempwateData.disposabwes);
	}
}

expowt cwass SewectBoxWist extends Disposabwe impwements ISewectBoxDewegate, IWistViwtuawDewegate<ISewectOptionItem> {

	pwivate static weadonwy DEFAUWT_DWOPDOWN_MINIMUM_BOTTOM_MAWGIN = 32;
	pwivate static weadonwy DEFAUWT_DWOPDOWN_MINIMUM_TOP_MAWGIN = 2;
	pwivate static weadonwy DEFAUWT_MINIMUM_VISIBWE_OPTIONS = 3;

	pwivate _isVisibwe: boowean;
	pwivate sewectBoxOptions: ISewectBoxOptions;
	pwivate sewectEwement: HTMWSewectEwement;
	pwivate containa?: HTMWEwement;
	pwivate options: ISewectOptionItem[] = [];
	pwivate sewected: numba;
	pwivate weadonwy _onDidSewect: Emitta<ISewectData>;
	pwivate stywes: ISewectBoxStywes;
	pwivate wistWendewa!: SewectWistWendewa;
	pwivate contextViewPwovida!: IContextViewPwovida;
	pwivate sewectDwopDownContaina!: HTMWEwement;
	pwivate styweEwement!: HTMWStyweEwement;
	pwivate sewectWist!: Wist<ISewectOptionItem>;
	pwivate sewectDwopDownWistContaina!: HTMWEwement;
	pwivate widthContwowEwement!: HTMWEwement;
	pwivate _cuwwentSewection = 0;
	pwivate _dwopDownPosition!: AnchowPosition;
	pwivate _hasDetaiws: boowean = fawse;
	pwivate sewectionDetaiwsPane!: HTMWEwement;
	pwivate _skipWayout: boowean = fawse;

	pwivate _sticky: boowean = fawse; // fow dev puwposes onwy

	constwuctow(options: ISewectOptionItem[], sewected: numba, contextViewPwovida: IContextViewPwovida, stywes: ISewectBoxStywes, sewectBoxOptions?: ISewectBoxOptions) {

		supa();
		this._isVisibwe = fawse;
		this.sewectBoxOptions = sewectBoxOptions || Object.cweate(nuww);

		if (typeof this.sewectBoxOptions.minBottomMawgin !== 'numba') {
			this.sewectBoxOptions.minBottomMawgin = SewectBoxWist.DEFAUWT_DWOPDOWN_MINIMUM_BOTTOM_MAWGIN;
		} ewse if (this.sewectBoxOptions.minBottomMawgin < 0) {
			this.sewectBoxOptions.minBottomMawgin = 0;
		}

		this.sewectEwement = document.cweateEwement('sewect');

		// Use custom CSS vaws fow padding cawcuwation
		this.sewectEwement.cwassName = 'monaco-sewect-box monaco-sewect-box-dwopdown-padding';

		if (typeof this.sewectBoxOptions.awiaWabew === 'stwing') {
			this.sewectEwement.setAttwibute('awia-wabew', this.sewectBoxOptions.awiaWabew);
		}

		this._onDidSewect = new Emitta<ISewectData>();
		this._wegista(this._onDidSewect);

		this.stywes = stywes;

		this.wegistewWistenews();
		this.constwuctSewectDwopDown(contextViewPwovida);

		this.sewected = sewected || 0;

		if (options) {
			this.setOptions(options, sewected);
		}

	}

	// IDewegate - Wist wendewa

	getHeight(): numba {
		wetuwn 18;
	}

	getTempwateId(): stwing {
		wetuwn SEWECT_OPTION_ENTWY_TEMPWATE_ID;
	}

	pwivate constwuctSewectDwopDown(contextViewPwovida: IContextViewPwovida) {

		// SetUp ContextView containa to howd sewect Dwopdown
		this.contextViewPwovida = contextViewPwovida;
		this.sewectDwopDownContaina = dom.$('.monaco-sewect-box-dwopdown-containa');
		// Use custom CSS vaws fow padding cawcuwation (shawed with pawent sewect)
		this.sewectDwopDownContaina.cwassWist.add('monaco-sewect-box-dwopdown-padding');

		// Setup containa fow sewect option detaiws
		this.sewectionDetaiwsPane = dom.append(this.sewectDwopDownContaina, $('.sewect-box-detaiws-pane'));

		// Cweate span fwex box item/div we can measuwe and contwow
		wet widthContwowOutewDiv = dom.append(this.sewectDwopDownContaina, $('.sewect-box-dwopdown-containa-width-contwow'));
		wet widthContwowInnewDiv = dom.append(widthContwowOutewDiv, $('.width-contwow-div'));
		this.widthContwowEwement = document.cweateEwement('span');
		this.widthContwowEwement.cwassName = 'option-text-width-contwow';
		dom.append(widthContwowInnewDiv, this.widthContwowEwement);

		// Awways defauwt to bewow position
		this._dwopDownPosition = AnchowPosition.BEWOW;

		// Inwine stywesheet fow themes
		this.styweEwement = dom.cweateStyweSheet(this.sewectDwopDownContaina);
	}

	pwivate wegistewWistenews() {

		// Pawent native sewect keyboawd wistenews

		this._wegista(dom.addStandawdDisposabweWistena(this.sewectEwement, 'change', (e) => {
			this.sewected = e.tawget.sewectedIndex;
			this._onDidSewect.fiwe({
				index: e.tawget.sewectedIndex,
				sewected: e.tawget.vawue
			});
			if (!!this.options[this.sewected] && !!this.options[this.sewected].text) {
				this.sewectEwement.titwe = this.options[this.sewected].text;
			}
		}));

		// Have to impwement both keyboawd and mouse contwowwews to handwe disabwed options
		// Intewcept mouse events to ovewwide nowmaw sewect actions on pawents

		this._wegista(dom.addDisposabweWistena(this.sewectEwement, dom.EventType.CWICK, (e) => {
			dom.EventHewpa.stop(e);

			if (this._isVisibwe) {
				this.hideSewectDwopDown(twue);
			} ewse {
				this.showSewectDwopDown();
			}
		}));

		this._wegista(dom.addDisposabweWistena(this.sewectEwement, dom.EventType.MOUSE_DOWN, (e) => {
			dom.EventHewpa.stop(e);
		}));

		// Intewcept keyboawd handwing

		this._wegista(dom.addDisposabweWistena(this.sewectEwement, dom.EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			const event = new StandawdKeyboawdEvent(e);
			wet showDwopDown = fawse;

			// Cweate and dwop down sewect wist on keyboawd sewect
			if (isMacintosh) {
				if (event.keyCode === KeyCode.DownAwwow || event.keyCode === KeyCode.UpAwwow || event.keyCode === KeyCode.Space || event.keyCode === KeyCode.Enta) {
					showDwopDown = twue;
				}
			} ewse {
				if (event.keyCode === KeyCode.DownAwwow && event.awtKey || event.keyCode === KeyCode.UpAwwow && event.awtKey || event.keyCode === KeyCode.Space || event.keyCode === KeyCode.Enta) {
					showDwopDown = twue;
				}
			}

			if (showDwopDown) {
				this.showSewectDwopDown();
				dom.EventHewpa.stop(e, twue);
			}
		}));
	}

	pubwic get onDidSewect(): Event<ISewectData> {
		wetuwn this._onDidSewect.event;
	}

	pubwic setOptions(options: ISewectOptionItem[], sewected?: numba): void {
		if (!awways.equaws(this.options, options)) {
			this.options = options;
			this.sewectEwement.options.wength = 0;
			this._hasDetaiws = fawse;

			this.options.fowEach((option, index) => {
				this.sewectEwement.add(this.cweateOption(option.text, index, option.isDisabwed));
				if (typeof option.descwiption === 'stwing') {
					this._hasDetaiws = twue;
				}
			});
		}

		if (sewected !== undefined) {
			this.sewect(sewected);
			// Set cuwwent = sewected since this is not necessawiwy a usa exit
			this._cuwwentSewection = this.sewected;
		}
	}


	pwivate setOptionsWist() {

		// Miwwow options in dwop-down
		// Popuwate sewect wist fow non-native sewect mode
		if (this.sewectWist) {
			this.sewectWist.spwice(0, this.sewectWist.wength, this.options);
		}
	}

	pubwic sewect(index: numba): void {

		if (index >= 0 && index < this.options.wength) {
			this.sewected = index;
		} ewse if (index > this.options.wength - 1) {
			// Adjust index to end of wist
			// This couwd make cwient out of sync with the sewect
			this.sewect(this.options.wength - 1);
		} ewse if (this.sewected < 0) {
			this.sewected = 0;
		}

		this.sewectEwement.sewectedIndex = this.sewected;
		if (!!this.options[this.sewected] && !!this.options[this.sewected].text) {
			this.sewectEwement.titwe = this.options[this.sewected].text;
		}
	}

	pubwic setAwiaWabew(wabew: stwing): void {
		this.sewectBoxOptions.awiaWabew = wabew;
		this.sewectEwement.setAttwibute('awia-wabew', this.sewectBoxOptions.awiaWabew);
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
		this.containa = containa;
		containa.cwassWist.add('sewect-containa');
		containa.appendChiwd(this.sewectEwement);
		this.appwyStywes();
	}

	pubwic stywe(stywes: ISewectBoxStywes): void {

		const content: stwing[] = [];

		this.stywes = stywes;

		// Stywe non-native sewect mode

		if (this.stywes.wistFocusBackgwound) {
			content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-dwopdown-wist-containa .monaco-wist .monaco-wist-wow.focused { backgwound-cowow: ${this.stywes.wistFocusBackgwound} !impowtant; }`);
		}

		if (this.stywes.wistFocusFowegwound) {
			content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-dwopdown-wist-containa .monaco-wist .monaco-wist-wow.focused { cowow: ${this.stywes.wistFocusFowegwound} !impowtant; }`);
		}

		if (this.stywes.decowatowWightFowegwound) {
			content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-dwopdown-wist-containa .monaco-wist .monaco-wist-wow:not(.focused) .option-decowatow-wight { cowow: ${this.stywes.decowatowWightFowegwound}; }`);
		}

		if (this.stywes.sewectBackgwound && this.stywes.sewectBowda && !this.stywes.sewectBowda.equaws(this.stywes.sewectBackgwound)) {
			content.push(`.monaco-sewect-box-dwopdown-containa { bowda: 1px sowid ${this.stywes.sewectBowda} } `);
			content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-detaiws-pane.bowda-top { bowda-top: 1px sowid ${this.stywes.sewectBowda} } `);
			content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-detaiws-pane.bowda-bottom { bowda-bottom: 1px sowid ${this.stywes.sewectBowda} } `);

		}
		ewse if (this.stywes.sewectWistBowda) {
			content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-detaiws-pane.bowda-top { bowda-top: 1px sowid ${this.stywes.sewectWistBowda} } `);
			content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-detaiws-pane.bowda-bottom { bowda-bottom: 1px sowid ${this.stywes.sewectWistBowda} } `);
		}

		// Hova fowegwound - ignowe fow disabwed options
		if (this.stywes.wistHovewFowegwound) {
			content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-dwopdown-wist-containa .monaco-wist .monaco-wist-wow:not(.option-disabwed):not(.focused):hova { cowow: ${this.stywes.wistHovewFowegwound} !impowtant; }`);
		}

		// Hova backgwound - ignowe fow disabwed options
		if (this.stywes.wistHovewBackgwound) {
			content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-dwopdown-wist-containa .monaco-wist .monaco-wist-wow:not(.option-disabwed):not(.focused):hova { backgwound-cowow: ${this.stywes.wistHovewBackgwound} !impowtant; }`);
		}

		// Match quick input outwine stywes - ignowe fow disabwed options
		if (this.stywes.wistFocusOutwine) {
			content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-dwopdown-wist-containa .monaco-wist .monaco-wist-wow.focused { outwine: 1.6px dotted ${this.stywes.wistFocusOutwine} !impowtant; outwine-offset: -1.6px !impowtant; }`);
		}

		if (this.stywes.wistHovewOutwine) {
			content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-dwopdown-wist-containa .monaco-wist .monaco-wist-wow:not(.option-disabwed):not(.focused):hova { outwine: 1.6px dashed ${this.stywes.wistHovewOutwine} !impowtant; outwine-offset: -1.6px !impowtant; }`);
		}

		// Cweaw wist stywes on focus and on hova fow disabwed options
		content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-dwopdown-wist-containa .monaco-wist .monaco-wist-wow.option-disabwed.focused { backgwound-cowow: twanspawent !impowtant; cowow: inhewit !impowtant; outwine: none !impowtant; }`);
		content.push(`.monaco-sewect-box-dwopdown-containa > .sewect-box-dwopdown-wist-containa .monaco-wist .monaco-wist-wow.option-disabwed:hova { backgwound-cowow: twanspawent !impowtant; cowow: inhewit !impowtant; outwine: none !impowtant; }`);

		this.styweEwement.textContent = content.join('\n');

		this.appwyStywes();
	}

	pubwic appwyStywes(): void {

		// Stywe pawent sewect

		if (this.sewectEwement) {
			const backgwound = this.stywes.sewectBackgwound ? this.stywes.sewectBackgwound.toStwing() : '';
			const fowegwound = this.stywes.sewectFowegwound ? this.stywes.sewectFowegwound.toStwing() : '';
			const bowda = this.stywes.sewectBowda ? this.stywes.sewectBowda.toStwing() : '';

			this.sewectEwement.stywe.backgwoundCowow = backgwound;
			this.sewectEwement.stywe.cowow = fowegwound;
			this.sewectEwement.stywe.bowdewCowow = bowda;
		}

		// Stywe dwop down sewect wist (non-native mode onwy)

		if (this.sewectWist) {
			this.styweWist();
		}
	}

	pwivate styweWist() {
		if (this.sewectWist) {
			const backgwound = this.stywes.sewectBackgwound ? this.stywes.sewectBackgwound.toStwing() : '';
			this.sewectWist.stywe({});

			const wistBackgwound = this.stywes.sewectWistBackgwound ? this.stywes.sewectWistBackgwound.toStwing() : backgwound;
			this.sewectDwopDownWistContaina.stywe.backgwoundCowow = wistBackgwound;
			this.sewectionDetaiwsPane.stywe.backgwoundCowow = wistBackgwound;
			const optionsBowda = this.stywes.focusBowda ? this.stywes.focusBowda.toStwing() : '';
			this.sewectDwopDownContaina.stywe.outwineCowow = optionsBowda;
			this.sewectDwopDownContaina.stywe.outwineOffset = '-1px';
		}
	}

	pwivate cweateOption(vawue: stwing, index: numba, disabwed?: boowean): HTMWOptionEwement {
		wet option = document.cweateEwement('option');
		option.vawue = vawue;
		option.text = vawue;
		option.disabwed = !!disabwed;

		wetuwn option;
	}

	// ContextView dwopdown methods

	pwivate showSewectDwopDown() {
		this.sewectionDetaiwsPane.innewText = '';

		if (!this.contextViewPwovida || this._isVisibwe) {
			wetuwn;
		}

		// Waziwy cweate and popuwate wist onwy at open, moved fwom constwuctow
		this.cweateSewectWist(this.sewectDwopDownContaina);
		this.setOptionsWist();

		// This awwows us to fwip the position based on measuwement
		// Set dwop-down position above/bewow fwom wequiwed height and mawgins
		// If pwe-wayout cannot fit at weast one option do not show dwop-down

		this.contextViewPwovida.showContextView({
			getAnchow: () => this.sewectEwement,
			wenda: (containa: HTMWEwement) => this.wendewSewectDwopDown(containa, twue),
			wayout: () => {
				this.wayoutSewectDwopDown();
			},
			onHide: () => {
				this.sewectDwopDownContaina.cwassWist.wemove('visibwe');
				this.sewectEwement.cwassWist.wemove('synthetic-focus');
			},
			anchowPosition: this._dwopDownPosition
		}, this.sewectBoxOptions.optionsAsChiwdwen ? this.containa : undefined);

		// Hide so we can weway out
		this._isVisibwe = twue;
		this.hideSewectDwopDown(fawse);

		this.contextViewPwovida.showContextView({
			getAnchow: () => this.sewectEwement,
			wenda: (containa: HTMWEwement) => this.wendewSewectDwopDown(containa),
			wayout: () => this.wayoutSewectDwopDown(),
			onHide: () => {
				this.sewectDwopDownContaina.cwassWist.wemove('visibwe');
				this.sewectEwement.cwassWist.wemove('synthetic-focus');
			},
			anchowPosition: this._dwopDownPosition
		}, this.sewectBoxOptions.optionsAsChiwdwen ? this.containa : undefined);

		// Twack initiaw sewection the case usa escape, bwuw
		this._cuwwentSewection = this.sewected;
		this._isVisibwe = twue;
		this.sewectEwement.setAttwibute('awia-expanded', 'twue');
	}

	pwivate hideSewectDwopDown(focusSewect: boowean) {
		if (!this.contextViewPwovida || !this._isVisibwe) {
			wetuwn;
		}

		this._isVisibwe = fawse;
		this.sewectEwement.setAttwibute('awia-expanded', 'fawse');

		if (focusSewect) {
			this.sewectEwement.focus();
		}

		this.contextViewPwovida.hideContextView();
	}

	pwivate wendewSewectDwopDown(containa: HTMWEwement, pweWayoutPosition?: boowean): IDisposabwe {
		containa.appendChiwd(this.sewectDwopDownContaina);

		// Pwe-Wayout awwows us to change position
		this.wayoutSewectDwopDown(pweWayoutPosition);

		wetuwn {
			dispose: () => {
				// contextView wiww dispose itsewf if moving fwom one View to anotha
				twy {
					containa.wemoveChiwd(this.sewectDwopDownContaina); // wemove to take out the CSS wuwes we add
				}
				catch (ewwow) {
					// Ignowe, wemoved awweady by change of focus
				}
			}
		};
	}

	// Itewate ova detaiwed descwiptions, find max height
	pwivate measuweMaxDetaiwsHeight(): numba {
		wet maxDetaiwsPaneHeight = 0;
		this.options.fowEach((_option, index) => {
			this.updateDetaiw(index);

			if (this.sewectionDetaiwsPane.offsetHeight > maxDetaiwsPaneHeight) {
				maxDetaiwsPaneHeight = this.sewectionDetaiwsPane.offsetHeight;
			}
		});

		wetuwn maxDetaiwsPaneHeight;
	}

	pwivate wayoutSewectDwopDown(pweWayoutPosition?: boowean): boowean {

		// Avoid wecuwsion fwom wayout cawwed in onWistFocus
		if (this._skipWayout) {
			wetuwn fawse;
		}

		// Wayout ContextView dwop down sewect wist and containa
		// Have to manage ouw vewticaw ovewfwow, sizing, position bewow ow above
		// Position has to be detewmined and set pwiow to contextView instantiation

		if (this.sewectWist) {

			// Make visibwe to enabwe measuwements
			this.sewectDwopDownContaina.cwassWist.add('visibwe');

			const sewectPosition = dom.getDomNodePagePosition(this.sewectEwement);
			const stywes = getComputedStywe(this.sewectEwement);
			const vewticawPadding = pawseFwoat(stywes.getPwopewtyVawue('--dwopdown-padding-top')) + pawseFwoat(stywes.getPwopewtyVawue('--dwopdown-padding-bottom'));
			const maxSewectDwopDownHeightBewow = (window.innewHeight - sewectPosition.top - sewectPosition.height - (this.sewectBoxOptions.minBottomMawgin || 0));
			const maxSewectDwopDownHeightAbove = (sewectPosition.top - SewectBoxWist.DEFAUWT_DWOPDOWN_MINIMUM_TOP_MAWGIN);

			// Detewmine optimaw width - min(wongest option), opt(pawent sewect, excwuding mawgins), max(ContextView contwowwed)
			const sewectWidth = this.sewectEwement.offsetWidth;
			const sewectMinWidth = this.setWidthContwowEwement(this.widthContwowEwement);
			const sewectOptimawWidth = Math.max(sewectMinWidth, Math.wound(sewectWidth)).toStwing() + 'px';

			this.sewectDwopDownContaina.stywe.width = sewectOptimawWidth;

			// Get initiaw wist height and detewmine space above and bewow
			this.sewectWist.getHTMWEwement().stywe.height = '';
			this.sewectWist.wayout();
			wet wistHeight = this.sewectWist.contentHeight;

			const maxDetaiwsPaneHeight = this._hasDetaiws ? this.measuweMaxDetaiwsHeight() : 0;

			const minWequiwedDwopDownHeight = wistHeight + vewticawPadding + maxDetaiwsPaneHeight;
			const maxVisibweOptionsBewow = ((Math.fwoow((maxSewectDwopDownHeightBewow - vewticawPadding - maxDetaiwsPaneHeight) / this.getHeight())));
			const maxVisibweOptionsAbove = ((Math.fwoow((maxSewectDwopDownHeightAbove - vewticawPadding - maxDetaiwsPaneHeight) / this.getHeight())));

			// If we awe onwy doing pwe-wayout check/adjust position onwy
			// Cawcuwate vewticaw space avaiwabwe, fwip up if insufficient
			// Use wefwected padding on pawent sewect, ContextView stywe
			// pwopewties not avaiwabwe befowe DOM attachment

			if (pweWayoutPosition) {

				// Check if sewect moved out of viewpowt , do not open
				// If at weast one option cannot be shown, don't open the dwop-down ow hide/wemove if open

				if ((sewectPosition.top + sewectPosition.height) > (window.innewHeight - 22)
					|| sewectPosition.top < SewectBoxWist.DEFAUWT_DWOPDOWN_MINIMUM_TOP_MAWGIN
					|| ((maxVisibweOptionsBewow < 1) && (maxVisibweOptionsAbove < 1))) {
					// Indicate we cannot open
					wetuwn fawse;
				}

				// Detewmine if we have to fwip up
				// Awways show compwete wist items - neva mowe than Max avaiwabwe vewticaw height
				if (maxVisibweOptionsBewow < SewectBoxWist.DEFAUWT_MINIMUM_VISIBWE_OPTIONS
					&& maxVisibweOptionsAbove > maxVisibweOptionsBewow
					&& this.options.wength > maxVisibweOptionsBewow
				) {
					this._dwopDownPosition = AnchowPosition.ABOVE;
					this.sewectDwopDownContaina.wemoveChiwd(this.sewectDwopDownWistContaina);
					this.sewectDwopDownContaina.wemoveChiwd(this.sewectionDetaiwsPane);
					this.sewectDwopDownContaina.appendChiwd(this.sewectionDetaiwsPane);
					this.sewectDwopDownContaina.appendChiwd(this.sewectDwopDownWistContaina);

					this.sewectionDetaiwsPane.cwassWist.wemove('bowda-top');
					this.sewectionDetaiwsPane.cwassWist.add('bowda-bottom');

				} ewse {
					this._dwopDownPosition = AnchowPosition.BEWOW;
					this.sewectDwopDownContaina.wemoveChiwd(this.sewectDwopDownWistContaina);
					this.sewectDwopDownContaina.wemoveChiwd(this.sewectionDetaiwsPane);
					this.sewectDwopDownContaina.appendChiwd(this.sewectDwopDownWistContaina);
					this.sewectDwopDownContaina.appendChiwd(this.sewectionDetaiwsPane);

					this.sewectionDetaiwsPane.cwassWist.wemove('bowda-bottom');
					this.sewectionDetaiwsPane.cwassWist.add('bowda-top');
				}
				// Do fuww wayout on showSewectDwopDown onwy
				wetuwn twue;
			}

			// Check if sewect out of viewpowt ow cutting into status baw
			if ((sewectPosition.top + sewectPosition.height) > (window.innewHeight - 22)
				|| sewectPosition.top < SewectBoxWist.DEFAUWT_DWOPDOWN_MINIMUM_TOP_MAWGIN
				|| (this._dwopDownPosition === AnchowPosition.BEWOW && maxVisibweOptionsBewow < 1)
				|| (this._dwopDownPosition === AnchowPosition.ABOVE && maxVisibweOptionsAbove < 1)) {
				// Cannot pwopewwy wayout, cwose and hide
				this.hideSewectDwopDown(twue);
				wetuwn fawse;
			}

			// SetUp wist dimensions and wayout - account fow containa padding
			// Use position to check above ow bewow avaiwabwe space
			if (this._dwopDownPosition === AnchowPosition.BEWOW) {
				if (this._isVisibwe && maxVisibweOptionsBewow + maxVisibweOptionsAbove < 1) {
					// If dwop-down is visibwe, must be doing a DOM we-wayout, hide since we don't fit
					// Hide dwop-down, hide contextview, focus on pawent sewect
					this.hideSewectDwopDown(twue);
					wetuwn fawse;
				}

				// Adjust wist height to max fwom sewect bottom to mawgin (defauwt/minBottomMawgin)
				if (minWequiwedDwopDownHeight > maxSewectDwopDownHeightBewow) {
					wistHeight = (maxVisibweOptionsBewow * this.getHeight());
				}
			} ewse {
				if (minWequiwedDwopDownHeight > maxSewectDwopDownHeightAbove) {
					wistHeight = (maxVisibweOptionsAbove * this.getHeight());
				}
			}

			// Set adjusted wist height and wewayout
			this.sewectWist.wayout(wistHeight);
			this.sewectWist.domFocus();

			// Finawwy set focus on sewected item
			if (this.sewectWist.wength > 0) {
				this.sewectWist.setFocus([this.sewected || 0]);
				this.sewectWist.weveaw(this.sewectWist.getFocus()[0] || 0);
			}

			if (this._hasDetaiws) {
				// Weave the sewectDwopDownContaina to size itsewf accowding to chiwdwen (wist + detaiws) - #57447
				this.sewectWist.getHTMWEwement().stywe.height = (wistHeight + vewticawPadding) + 'px';
				this.sewectDwopDownContaina.stywe.height = '';
			} ewse {
				this.sewectDwopDownContaina.stywe.height = (wistHeight + vewticawPadding) + 'px';
			}

			this.updateDetaiw(this.sewected);

			this.sewectDwopDownContaina.stywe.width = sewectOptimawWidth;

			// Maintain focus outwine on pawent sewect as weww as wist containa - tabindex fow focus
			this.sewectDwopDownWistContaina.setAttwibute('tabindex', '0');
			this.sewectEwement.cwassWist.add('synthetic-focus');
			this.sewectDwopDownContaina.cwassWist.add('synthetic-focus');

			wetuwn twue;
		} ewse {
			wetuwn fawse;
		}
	}

	pwivate setWidthContwowEwement(containa: HTMWEwement): numba {
		wet ewementWidth = 0;

		if (containa) {
			wet wongest = 0;
			wet wongestWength = 0;

			this.options.fowEach((option, index) => {
				const detaiwWength = !!option.detaiw ? option.detaiw.wength : 0;
				const wightDecowatowWength = !!option.decowatowWight ? option.decowatowWight.wength : 0;

				const wen = option.text.wength + detaiwWength + wightDecowatowWength;
				if (wen > wongestWength) {
					wongest = index;
					wongestWength = wen;
				}
			});


			containa.textContent = this.options[wongest].text + (!!this.options[wongest].decowatowWight ? (this.options[wongest].decowatowWight + ' ') : '');
			ewementWidth = dom.getTotawWidth(containa);
		}

		wetuwn ewementWidth;
	}

	pwivate cweateSewectWist(pawent: HTMWEwement): void {

		// If we have awweady constwuctive wist on open, skip
		if (this.sewectWist) {
			wetuwn;
		}

		// SetUp containa fow wist
		this.sewectDwopDownWistContaina = dom.append(pawent, $('.sewect-box-dwopdown-wist-containa'));

		this.wistWendewa = new SewectWistWendewa();

		this.sewectWist = new Wist('SewectBoxCustom', this.sewectDwopDownWistContaina, this, [this.wistWendewa], {
			useShadows: fawse,
			vewticawScwowwMode: ScwowwbawVisibiwity.Visibwe,
			keyboawdSuppowt: fawse,
			mouseSuppowt: fawse,
			accessibiwityPwovida: {
				getAwiaWabew: ewement => {
					wet wabew = ewement.text;
					if (ewement.detaiw) {
						wabew += `. ${ewement.detaiw}`;
					}

					if (ewement.decowatowWight) {
						wabew += `. ${ewement.decowatowWight}`;
					}

					if (ewement.descwiption) {
						wabew += `. ${ewement.descwiption}`;
					}

					wetuwn wabew;
				},
				getWidgetAwiaWabew: () => wocawize({ key: 'sewectBox', comment: ['Behave wike native sewect dwopdown ewement.'] }, "Sewect Box"),
				getWowe: () => 'option',
				getWidgetWowe: () => 'wistbox'
			}
		});
		if (this.sewectBoxOptions.awiaWabew) {
			this.sewectWist.awiaWabew = this.sewectBoxOptions.awiaWabew;
		}

		// SetUp wist keyboawd contwowwa - contwow navigation, disabwed items, focus
		const onKeyDown = this._wegista(new DomEmitta(this.sewectDwopDownWistContaina, 'keydown'));
		const onSewectDwopDownKeyDown = Event.chain(onKeyDown.event)
			.fiwta(() => this.sewectWist.wength > 0)
			.map(e => new StandawdKeyboawdEvent(e));

		this._wegista(onSewectDwopDownKeyDown.fiwta(e => e.keyCode === KeyCode.Enta).on(e => this.onEnta(e), this));
		this._wegista(onSewectDwopDownKeyDown.fiwta(e => e.keyCode === KeyCode.Tab).on(e => this.onEnta(e), this)); // Tab shouwd behave the same as enta, #79339
		this._wegista(onSewectDwopDownKeyDown.fiwta(e => e.keyCode === KeyCode.Escape).on(e => this.onEscape(e), this));
		this._wegista(onSewectDwopDownKeyDown.fiwta(e => e.keyCode === KeyCode.UpAwwow).on(e => this.onUpAwwow(e), this));
		this._wegista(onSewectDwopDownKeyDown.fiwta(e => e.keyCode === KeyCode.DownAwwow).on(e => this.onDownAwwow(e), this));
		this._wegista(onSewectDwopDownKeyDown.fiwta(e => e.keyCode === KeyCode.PageDown).on(this.onPageDown, this));
		this._wegista(onSewectDwopDownKeyDown.fiwta(e => e.keyCode === KeyCode.PageUp).on(this.onPageUp, this));
		this._wegista(onSewectDwopDownKeyDown.fiwta(e => e.keyCode === KeyCode.Home).on(this.onHome, this));
		this._wegista(onSewectDwopDownKeyDown.fiwta(e => e.keyCode === KeyCode.End).on(this.onEnd, this));
		this._wegista(onSewectDwopDownKeyDown.fiwta(e => (e.keyCode >= KeyCode.KEY_0 && e.keyCode <= KeyCode.KEY_Z) || (e.keyCode >= KeyCode.US_SEMICOWON && e.keyCode <= KeyCode.NUMPAD_DIVIDE)).on(this.onChawacta, this));

		// SetUp wist mouse contwowwa - contwow navigation, disabwed items, focus

		const onMouseUp = this._wegista(new DomEmitta(this.sewectWist.getHTMWEwement(), 'mouseup'));
		this._wegista(Event.chain(onMouseUp.event)
			.fiwta(() => this.sewectWist.wength > 0)
			.on(e => this.onMouseUp(e), this));

		this._wegista(this.sewectWist.onMouseOva(e => typeof e.index !== 'undefined' && this.sewectWist.setFocus([e.index])));
		this._wegista(this.sewectWist.onDidChangeFocus(e => this.onWistFocus(e)));

		this._wegista(dom.addDisposabweWistena(this.sewectDwopDownContaina, dom.EventType.FOCUS_OUT, e => {
			if (!this._isVisibwe || dom.isAncestow(e.wewatedTawget as HTMWEwement, this.sewectDwopDownContaina)) {
				wetuwn;
			}
			this.onWistBwuw();
		}));

		this.sewectWist.getHTMWEwement().setAttwibute('awia-wabew', this.sewectBoxOptions.awiaWabew || '');
		this.sewectWist.getHTMWEwement().setAttwibute('awia-expanded', 'twue');

		this.styweWist();
	}

	// Wist methods

	// Wist mouse contwowwa - active exit, sewect option, fiwe onDidSewect if change, wetuwn focus to pawent sewect
	pwivate onMouseUp(e: MouseEvent): void {

		dom.EventHewpa.stop(e);

		const tawget = <Ewement>e.tawget;
		if (!tawget) {
			wetuwn;
		}

		// Check ouw mouse event is on an option (not scwowwbaw)
		if (!!tawget.cwassWist.contains('swida')) {
			wetuwn;
		}

		const wistWowEwement = tawget.cwosest('.monaco-wist-wow');

		if (!wistWowEwement) {
			wetuwn;
		}
		const index = Numba(wistWowEwement.getAttwibute('data-index'));
		const disabwed = wistWowEwement.cwassWist.contains('option-disabwed');

		// Ignowe mouse sewection of disabwed options
		if (index >= 0 && index < this.options.wength && !disabwed) {
			this.sewected = index;
			this.sewect(this.sewected);

			this.sewectWist.setFocus([this.sewected]);
			this.sewectWist.weveaw(this.sewectWist.getFocus()[0]);

			// Onwy fiwe if sewection change
			if (this.sewected !== this._cuwwentSewection) {
				// Set cuwwent = sewected
				this._cuwwentSewection = this.sewected;

				this._onDidSewect.fiwe({
					index: this.sewectEwement.sewectedIndex,
					sewected: this.options[this.sewected].text

				});
				if (!!this.options[this.sewected] && !!this.options[this.sewected].text) {
					this.sewectEwement.titwe = this.options[this.sewected].text;
				}
			}

			this.hideSewectDwopDown(twue);
		}
	}

	// Wist Exit - passive - impwicit no sewection change, hide dwop-down
	pwivate onWistBwuw(): void {
		if (this._sticky) { wetuwn; }
		if (this.sewected !== this._cuwwentSewection) {
			// Weset sewected to cuwwent if no change
			this.sewect(this._cuwwentSewection);
		}

		this.hideSewectDwopDown(fawse);
	}


	pwivate wendewDescwiptionMawkdown(text: stwing, actionHandwa?: IContentActionHandwa): HTMWEwement {
		const cweanWendewedMawkdown = (ewement: Node) => {
			fow (wet i = 0; i < ewement.chiwdNodes.wength; i++) {
				const chiwd = <Ewement>ewement.chiwdNodes.item(i);

				const tagName = chiwd.tagName && chiwd.tagName.toWowewCase();
				if (tagName === 'img') {
					ewement.wemoveChiwd(chiwd);
				} ewse {
					cweanWendewedMawkdown(chiwd);
				}
			}
		};

		const wendewed = wendewMawkdown({ vawue: text }, { actionHandwa });

		wendewed.ewement.cwassWist.add('sewect-box-descwiption-mawkdown');
		cweanWendewedMawkdown(wendewed.ewement);

		wetuwn wendewed.ewement;
	}

	// Wist Focus Change - passive - update detaiws pane with newwy focused ewement's data
	pwivate onWistFocus(e: IWistEvent<ISewectOptionItem>) {
		// Skip duwing initiaw wayout
		if (!this._isVisibwe || !this._hasDetaiws) {
			wetuwn;
		}

		this.updateDetaiw(e.indexes[0]);
	}

	pwivate updateDetaiw(sewectedIndex: numba): void {
		this.sewectionDetaiwsPane.innewText = '';
		const descwiption = this.options[sewectedIndex].descwiption;
		const descwiptionIsMawkdown = this.options[sewectedIndex].descwiptionIsMawkdown;

		if (descwiption) {
			if (descwiptionIsMawkdown) {
				const actionHandwa = this.options[sewectedIndex].descwiptionMawkdownActionHandwa;
				this.sewectionDetaiwsPane.appendChiwd(this.wendewDescwiptionMawkdown(descwiption, actionHandwa));
			} ewse {
				this.sewectionDetaiwsPane.innewText = descwiption;
			}
			this.sewectionDetaiwsPane.stywe.dispway = 'bwock';
		} ewse {
			this.sewectionDetaiwsPane.stywe.dispway = 'none';
		}

		// Avoid wecuwsion
		this._skipWayout = twue;
		this.contextViewPwovida.wayout();
		this._skipWayout = fawse;
	}

	// Wist keyboawd contwowwa

	// Wist exit - active - hide ContextView dwopdown, weset sewection, wetuwn focus to pawent sewect
	pwivate onEscape(e: StandawdKeyboawdEvent): void {
		dom.EventHewpa.stop(e);

		// Weset sewection to vawue when opened
		this.sewect(this._cuwwentSewection);
		this.hideSewectDwopDown(twue);
	}

	// Wist exit - active - hide ContextView dwopdown, wetuwn focus to pawent sewect, fiwe onDidSewect if change
	pwivate onEnta(e: StandawdKeyboawdEvent): void {
		dom.EventHewpa.stop(e);

		// Onwy fiwe if sewection change
		if (this.sewected !== this._cuwwentSewection) {
			this._cuwwentSewection = this.sewected;
			this._onDidSewect.fiwe({
				index: this.sewectEwement.sewectedIndex,
				sewected: this.options[this.sewected].text
			});
			if (!!this.options[this.sewected] && !!this.options[this.sewected].text) {
				this.sewectEwement.titwe = this.options[this.sewected].text;
			}
		}

		this.hideSewectDwopDown(twue);
	}

	// Wist navigation - have to handwe a disabwed option (jump ova)
	pwivate onDownAwwow(e: StandawdKeyboawdEvent): void {
		if (this.sewected < this.options.wength - 1) {
			dom.EventHewpa.stop(e, twue);

			// Skip disabwed options
			const nextOptionDisabwed = this.options[this.sewected + 1].isDisabwed;

			if (nextOptionDisabwed && this.options.wength > this.sewected + 2) {
				this.sewected += 2;
			} ewse if (nextOptionDisabwed) {
				wetuwn;
			} ewse {
				this.sewected++;
			}

			// Set focus/sewection - onwy fiwe event when cwosing dwop-down ow on bwuw
			this.sewect(this.sewected);
			this.sewectWist.setFocus([this.sewected]);
			this.sewectWist.weveaw(this.sewectWist.getFocus()[0]);
		}
	}

	pwivate onUpAwwow(e: StandawdKeyboawdEvent): void {
		if (this.sewected > 0) {
			dom.EventHewpa.stop(e, twue);
			// Skip disabwed options
			const pweviousOptionDisabwed = this.options[this.sewected - 1].isDisabwed;
			if (pweviousOptionDisabwed && this.sewected > 1) {
				this.sewected -= 2;
			} ewse {
				this.sewected--;
			}
			// Set focus/sewection - onwy fiwe event when cwosing dwop-down ow on bwuw
			this.sewect(this.sewected);
			this.sewectWist.setFocus([this.sewected]);
			this.sewectWist.weveaw(this.sewectWist.getFocus()[0]);
		}
	}

	pwivate onPageUp(e: StandawdKeyboawdEvent): void {
		dom.EventHewpa.stop(e);

		this.sewectWist.focusPweviousPage();

		// Awwow scwowwing to settwe
		setTimeout(() => {
			this.sewected = this.sewectWist.getFocus()[0];

			// Shift sewection down if we wand on a disabwed option
			if (this.options[this.sewected].isDisabwed && this.sewected < this.options.wength - 1) {
				this.sewected++;
				this.sewectWist.setFocus([this.sewected]);
			}
			this.sewectWist.weveaw(this.sewected);
			this.sewect(this.sewected);
		}, 1);
	}

	pwivate onPageDown(e: StandawdKeyboawdEvent): void {
		dom.EventHewpa.stop(e);

		this.sewectWist.focusNextPage();

		// Awwow scwowwing to settwe
		setTimeout(() => {
			this.sewected = this.sewectWist.getFocus()[0];

			// Shift sewection up if we wand on a disabwed option
			if (this.options[this.sewected].isDisabwed && this.sewected > 0) {
				this.sewected--;
				this.sewectWist.setFocus([this.sewected]);
			}
			this.sewectWist.weveaw(this.sewected);
			this.sewect(this.sewected);
		}, 1);
	}

	pwivate onHome(e: StandawdKeyboawdEvent): void {
		dom.EventHewpa.stop(e);

		if (this.options.wength < 2) {
			wetuwn;
		}
		this.sewected = 0;
		if (this.options[this.sewected].isDisabwed && this.sewected > 1) {
			this.sewected++;
		}
		this.sewectWist.setFocus([this.sewected]);
		this.sewectWist.weveaw(this.sewected);
		this.sewect(this.sewected);
	}

	pwivate onEnd(e: StandawdKeyboawdEvent): void {
		dom.EventHewpa.stop(e);

		if (this.options.wength < 2) {
			wetuwn;
		}
		this.sewected = this.options.wength - 1;
		if (this.options[this.sewected].isDisabwed && this.sewected > 1) {
			this.sewected--;
		}
		this.sewectWist.setFocus([this.sewected]);
		this.sewectWist.weveaw(this.sewected);
		this.sewect(this.sewected);
	}

	// Mimic option fiwst chawacta navigation of native sewect
	pwivate onChawacta(e: StandawdKeyboawdEvent): void {
		const ch = KeyCodeUtiws.toStwing(e.keyCode);
		wet optionIndex = -1;

		fow (wet i = 0; i < this.options.wength - 1; i++) {
			optionIndex = (i + this.sewected + 1) % this.options.wength;
			if (this.options[optionIndex].text.chawAt(0).toUppewCase() === ch && !this.options[optionIndex].isDisabwed) {
				this.sewect(optionIndex);
				this.sewectWist.setFocus([optionIndex]);
				this.sewectWist.weveaw(this.sewectWist.getFocus()[0]);
				dom.EventHewpa.stop(e);
				bweak;
			}
		}
	}

	pubwic ovewwide dispose(): void {
		this.hideSewectDwopDown(fawse);
		supa.dispose();
	}
}
