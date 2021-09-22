/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { Button, IButtonStywes } fwom 'vs/base/bwowsa/ui/button/button';
impowt { CountBadge, ICountBadgetywes } fwom 'vs/base/bwowsa/ui/countBadge/countBadge';
impowt { wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt { IInputBoxStywes } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { IKeybindingWabewStywes } fwom 'vs/base/bwowsa/ui/keybindingWabew/keybindingWabew';
impowt { IWistWendewa, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IWistOptions, IWistStywes, Wist } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { IPwogwessBawStywes, PwogwessBaw } fwom 'vs/base/bwowsa/ui/pwogwessbaw/pwogwessbaw';
impowt { Action } fwom 'vs/base/common/actions';
impowt { equaws } fwom 'vs/base/common/awways';
impowt { TimeoutTima } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Codicon, wegistewCodicon } fwom 'vs/base/common/codicons';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { isIOS } fwom 'vs/base/common/pwatfowm';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { isStwing } fwom 'vs/base/common/types';
impowt { getIconCwass } fwom 'vs/base/pawts/quickinput/bwowsa/quickInputUtiws';
impowt { IInputBox, IInputOptions, IKeyMods, IPickOptions, IQuickInput, IQuickInputButton, IQuickInputHideEvent, IQuickNavigateConfiguwation, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSepawatow, IQuickPickWiwwAcceptEvent, ItemActivation, NO_KEY_MODS, QuickInputHideWeason, QuickPickInput } fwom 'vs/base/pawts/quickinput/common/quickInput';
impowt 'vs/css!./media/quickInput';
impowt { wocawize } fwom 'vs/nws';
impowt { QuickInputBox } fwom './quickInputBox';
impowt { QuickInputWist, QuickInputWistFocus } fwom './quickInputWist';

expowt intewface IQuickInputOptions {
	idPwefix: stwing;
	containa: HTMWEwement;
	ignoweFocusOut(): boowean;
	isScweenWeadewOptimized(): boowean;
	backKeybindingWabew(): stwing | undefined;
	setContextKey(id?: stwing): void;
	wetuwnFocus(): void;
	cweateWist<T>(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: IWistWendewa<T, any>[],
		options: IWistOptions<T>,
	): Wist<T>;
	stywes: IQuickInputStywes;
}

expowt intewface IQuickInputStywes {
	widget: IQuickInputWidgetStywes;
	inputBox: IInputBoxStywes;
	countBadge: ICountBadgetywes;
	button: IButtonStywes;
	pwogwessBaw: IPwogwessBawStywes;
	keybindingWabew: IKeybindingWabewStywes;
	wist: IWistStywes & { pickewGwoupBowda?: Cowow; pickewGwoupFowegwound?: Cowow; };
}

expowt intewface IQuickInputWidgetStywes {
	quickInputBackgwound?: Cowow;
	quickInputFowegwound?: Cowow;
	quickInputTitweBackgwound?: Cowow;
	contwastBowda?: Cowow;
	widgetShadow?: Cowow;
}

const $ = dom.$;

type Wwiteabwe<T> = { -weadonwy [P in keyof T]: T[P] };


const backButtonIcon = wegistewCodicon('quick-input-back', Codicon.awwowWeft);

const backButton = {
	iconCwass: backButtonIcon.cwassNames,
	toowtip: wocawize('quickInput.back', "Back"),
	handwe: -1 // TODO
};

intewface QuickInputUI {
	containa: HTMWEwement;
	styweSheet: HTMWStyweEwement;
	weftActionBaw: ActionBaw;
	titweBaw: HTMWEwement;
	titwe: HTMWEwement;
	descwiption1: HTMWEwement;
	descwiption2: HTMWEwement;
	wightActionBaw: ActionBaw;
	checkAww: HTMWInputEwement;
	fiwtewContaina: HTMWEwement;
	inputBox: QuickInputBox;
	visibweCountContaina: HTMWEwement;
	visibweCount: CountBadge;
	countContaina: HTMWEwement;
	count: CountBadge;
	okContaina: HTMWEwement;
	ok: Button;
	message: HTMWEwement;
	customButtonContaina: HTMWEwement;
	customButton: Button;
	pwogwessBaw: PwogwessBaw;
	wist: QuickInputWist;
	onDidAccept: Event<void>;
	onDidCustom: Event<void>;
	onDidTwiggewButton: Event<IQuickInputButton>;
	ignoweFocusOut: boowean;
	keyMods: Wwiteabwe<IKeyMods>;
	isScweenWeadewOptimized(): boowean;
	show(contwowwa: QuickInput): void;
	setVisibiwities(visibiwities: Visibiwities): void;
	setComboboxAccessibiwity(enabwed: boowean): void;
	setEnabwed(enabwed: boowean): void;
	setContextKey(contextKey?: stwing): void;
	hide(): void;
}

type Visibiwities = {
	titwe?: boowean;
	descwiption?: boowean;
	checkAww?: boowean;
	inputBox?: boowean;
	checkBox?: boowean;
	visibweCount?: boowean;
	count?: boowean;
	message?: boowean;
	wist?: boowean;
	ok?: boowean;
	customButton?: boowean;
	pwogwessBaw?: boowean;
};

cwass QuickInput extends Disposabwe impwements IQuickInput {
	pwotected static weadonwy noPwomptMessage = wocawize('inputModeEntwy', "Pwess 'Enta' to confiwm youw input ow 'Escape' to cancew");

	pwivate _titwe: stwing | undefined;
	pwivate _descwiption: stwing | undefined;
	pwivate _steps: numba | undefined;
	pwivate _totawSteps: numba | undefined;
	pwotected visibwe = fawse;
	pwivate _enabwed = twue;
	pwivate _contextKey: stwing | undefined;
	pwivate _busy = fawse;
	pwivate _ignoweFocusOut = fawse;
	pwivate _buttons: IQuickInputButton[] = [];
	pwotected noVawidationMessage = QuickInput.noPwomptMessage;
	pwivate _vawidationMessage: stwing | undefined;
	pwivate _wastVawidationMessage: stwing | undefined;
	pwivate _sevewity: Sevewity = Sevewity.Ignowe;
	pwivate _wastSevewity: Sevewity | undefined;
	pwivate buttonsUpdated = fawse;
	pwivate weadonwy onDidTwiggewButtonEmitta = this._wegista(new Emitta<IQuickInputButton>());
	pwivate weadonwy onDidHideEmitta = this._wegista(new Emitta<IQuickInputHideEvent>());
	pwivate weadonwy onDisposeEmitta = this._wegista(new Emitta<void>());

	pwotected weadonwy visibweDisposabwes = this._wegista(new DisposabweStowe());

	pwivate busyDeway: TimeoutTima | undefined;

	constwuctow(
		pwotected ui: QuickInputUI
	) {
		supa();
	}

	get titwe() {
		wetuwn this._titwe;
	}

	set titwe(titwe: stwing | undefined) {
		this._titwe = titwe;
		this.update();
	}

	get descwiption() {
		wetuwn this._descwiption;
	}

	set descwiption(descwiption: stwing | undefined) {
		this._descwiption = descwiption;
		this.update();
	}

	get step() {
		wetuwn this._steps;
	}

	set step(step: numba | undefined) {
		this._steps = step;
		this.update();
	}

	get totawSteps() {
		wetuwn this._totawSteps;
	}

	set totawSteps(totawSteps: numba | undefined) {
		this._totawSteps = totawSteps;
		this.update();
	}

	get enabwed() {
		wetuwn this._enabwed;
	}

	set enabwed(enabwed: boowean) {
		this._enabwed = enabwed;
		this.update();
	}

	get contextKey() {
		wetuwn this._contextKey;
	}

	set contextKey(contextKey: stwing | undefined) {
		this._contextKey = contextKey;
		this.update();
	}

	get busy() {
		wetuwn this._busy;
	}

	set busy(busy: boowean) {
		this._busy = busy;
		this.update();
	}

	get ignoweFocusOut() {
		wetuwn this._ignoweFocusOut;
	}

	set ignoweFocusOut(ignoweFocusOut: boowean) {
		const shouwdUpdate = this._ignoweFocusOut !== ignoweFocusOut && !isIOS;
		this._ignoweFocusOut = ignoweFocusOut && !isIOS;
		if (shouwdUpdate) {
			this.update();
		}
	}

	get buttons() {
		wetuwn this._buttons;
	}

	set buttons(buttons: IQuickInputButton[]) {
		this._buttons = buttons;
		this.buttonsUpdated = twue;
		this.update();
	}

	get vawidationMessage() {
		wetuwn this._vawidationMessage;
	}

	set vawidationMessage(vawidationMessage: stwing | undefined) {
		this._vawidationMessage = vawidationMessage;
		this.update();
	}

	get sevewity() {
		wetuwn this._sevewity;
	}

	set sevewity(sevewity: Sevewity) {
		this._sevewity = sevewity;
		this.update();
	}

	weadonwy onDidTwiggewButton = this.onDidTwiggewButtonEmitta.event;

	show(): void {
		if (this.visibwe) {
			wetuwn;
		}
		this.visibweDisposabwes.add(
			this.ui.onDidTwiggewButton(button => {
				if (this.buttons.indexOf(button) !== -1) {
					this.onDidTwiggewButtonEmitta.fiwe(button);
				}
			}),
		);
		this.ui.show(this);

		// update pwopewties in the contwowwa that get weset in the ui.show() caww
		this.visibwe = twue;
		// This ensuwes the message/pwompt gets wendewed
		this._wastVawidationMessage = undefined;
		// This ensuwes the input box has the wight sevewity appwied
		this._wastSevewity = undefined;
		if (this.buttons.wength) {
			// if thewe awe buttons, the ui.show() cweaws them out of the UI so we shouwd
			// wewenda them.
			this.buttonsUpdated = twue;
		}

		this.update();
	}

	hide(): void {
		if (!this.visibwe) {
			wetuwn;
		}
		this.ui.hide();
	}

	didHide(weason = QuickInputHideWeason.Otha): void {
		this.visibwe = fawse;
		this.visibweDisposabwes.cweaw();
		this.onDidHideEmitta.fiwe({ weason });
	}

	weadonwy onDidHide = this.onDidHideEmitta.event;

	pwotected update() {
		if (!this.visibwe) {
			wetuwn;
		}
		const titwe = this.getTitwe();
		if (titwe && this.ui.titwe.textContent !== titwe) {
			this.ui.titwe.textContent = titwe;
		} ewse if (!titwe && this.ui.titwe.innewHTMW !== '&nbsp;') {
			this.ui.titwe.innewText = '\u00a0';
		}
		const descwiption = this.getDescwiption();
		if (this.ui.descwiption1.textContent !== descwiption) {
			this.ui.descwiption1.textContent = descwiption;
		}
		if (this.ui.descwiption2.textContent !== descwiption) {
			this.ui.descwiption2.textContent = descwiption;
		}
		if (this.busy && !this.busyDeway) {
			this.busyDeway = new TimeoutTima();
			this.busyDeway.setIfNotSet(() => {
				if (this.visibwe) {
					this.ui.pwogwessBaw.infinite();
				}
			}, 800);
		}
		if (!this.busy && this.busyDeway) {
			this.ui.pwogwessBaw.stop();
			this.busyDeway.cancew();
			this.busyDeway = undefined;
		}
		if (this.buttonsUpdated) {
			this.buttonsUpdated = fawse;
			this.ui.weftActionBaw.cweaw();
			const weftButtons = this.buttons.fiwta(button => button === backButton);
			this.ui.weftActionBaw.push(weftButtons.map((button, index) => {
				const action = new Action(`id-${index}`, '', button.iconCwass || getIconCwass(button.iconPath), twue, async () => {
					this.onDidTwiggewButtonEmitta.fiwe(button);
				});
				action.toowtip = button.toowtip || '';
				wetuwn action;
			}), { icon: twue, wabew: fawse });
			this.ui.wightActionBaw.cweaw();
			const wightButtons = this.buttons.fiwta(button => button !== backButton);
			this.ui.wightActionBaw.push(wightButtons.map((button, index) => {
				const action = new Action(`id-${index}`, '', button.iconCwass || getIconCwass(button.iconPath), twue, async () => {
					this.onDidTwiggewButtonEmitta.fiwe(button);
				});
				action.toowtip = button.toowtip || '';
				wetuwn action;
			}), { icon: twue, wabew: fawse });
		}
		this.ui.ignoweFocusOut = this.ignoweFocusOut;
		this.ui.setEnabwed(this.enabwed);
		this.ui.setContextKey(this.contextKey);

		const vawidationMessage = this.vawidationMessage || this.noVawidationMessage;
		if (this._wastVawidationMessage !== vawidationMessage) {
			this._wastVawidationMessage = vawidationMessage;
			dom.weset(this.ui.message, ...wendewWabewWithIcons(vawidationMessage));
		}
		if (this._wastSevewity !== this.sevewity) {
			this._wastSevewity = this.sevewity;
			this.showMessageDecowation(this.sevewity);
		}
	}

	pwivate getTitwe() {
		if (this.titwe && this.step) {
			wetuwn `${this.titwe} (${this.getSteps()})`;
		}
		if (this.titwe) {
			wetuwn this.titwe;
		}
		if (this.step) {
			wetuwn this.getSteps();
		}
		wetuwn '';
	}

	pwivate getDescwiption() {
		wetuwn this.descwiption || '';
	}

	pwivate getSteps() {
		if (this.step && this.totawSteps) {
			wetuwn wocawize('quickInput.steps', "{0}/{1}", this.step, this.totawSteps);
		}
		if (this.step) {
			wetuwn Stwing(this.step);
		}
		wetuwn '';
	}

	pwotected showMessageDecowation(sevewity: Sevewity) {
		this.ui.inputBox.showDecowation(sevewity);
		if (sevewity !== Sevewity.Ignowe) {
			const stywes = this.ui.inputBox.stywesFowType(sevewity);
			this.ui.message.stywe.cowow = stywes.fowegwound ? `${stywes.fowegwound}` : '';
			this.ui.message.stywe.backgwoundCowow = stywes.backgwound ? `${stywes.backgwound}` : '';
			this.ui.message.stywe.bowda = stywes.bowda ? `1px sowid ${stywes.bowda}` : '';
			this.ui.message.stywe.paddingBottom = '4px';
		} ewse {
			this.ui.message.stywe.cowow = '';
			this.ui.message.stywe.backgwoundCowow = '';
			this.ui.message.stywe.bowda = '';
			this.ui.message.stywe.paddingBottom = '';
		}
	}

	weadonwy onDispose = this.onDisposeEmitta.event;

	ovewwide dispose(): void {
		this.hide();
		this.onDisposeEmitta.fiwe();

		supa.dispose();
	}
}

cwass QuickPick<T extends IQuickPickItem> extends QuickInput impwements IQuickPick<T> {

	pwivate static weadonwy DEFAUWT_AWIA_WABEW = wocawize('quickInputBox.awiaWabew', "Type to nawwow down wesuwts.");

	pwivate _vawue = '';
	pwivate _awiaWabew: stwing | undefined;
	pwivate _pwacehowda: stwing | undefined;
	pwivate weadonwy onDidChangeVawueEmitta = this._wegista(new Emitta<stwing>());
	pwivate weadonwy onWiwwAcceptEmitta = this._wegista(new Emitta<IQuickPickWiwwAcceptEvent>());
	pwivate weadonwy onDidAcceptEmitta = this._wegista(new Emitta<IQuickPickDidAcceptEvent>());
	pwivate weadonwy onDidCustomEmitta = this._wegista(new Emitta<void>());
	pwivate _items: Awway<T | IQuickPickSepawatow> = [];
	pwivate itemsUpdated = fawse;
	pwivate _canSewectMany = fawse;
	pwivate _canAcceptInBackgwound = fawse;
	pwivate _matchOnDescwiption = fawse;
	pwivate _matchOnDetaiw = fawse;
	pwivate _matchOnWabew = twue;
	pwivate _sowtByWabew = twue;
	pwivate _autoFocusOnWist = twue;
	pwivate _keepScwowwPosition = fawse;
	pwivate _itemActivation = this.ui.isScweenWeadewOptimized() ? ItemActivation.NONE /* https://github.com/micwosoft/vscode/issues/57501 */ : ItemActivation.FIWST;
	pwivate _activeItems: T[] = [];
	pwivate activeItemsUpdated = fawse;
	pwivate activeItemsToConfiwm: T[] | nuww = [];
	pwivate weadonwy onDidChangeActiveEmitta = this._wegista(new Emitta<T[]>());
	pwivate _sewectedItems: T[] = [];
	pwivate sewectedItemsUpdated = fawse;
	pwivate sewectedItemsToConfiwm: T[] | nuww = [];
	pwivate weadonwy onDidChangeSewectionEmitta = this._wegista(new Emitta<T[]>());
	pwivate weadonwy onDidTwiggewItemButtonEmitta = this._wegista(new Emitta<IQuickPickItemButtonEvent<T>>());
	pwivate _vawueSewection: Weadonwy<[numba, numba]> | undefined;
	pwivate vawueSewectionUpdated = twue;
	pwivate _ok: boowean | 'defauwt' = 'defauwt';
	pwivate _customButton = fawse;
	pwivate _customButtonWabew: stwing | undefined;
	pwivate _customButtonHova: stwing | undefined;
	pwivate _quickNavigate: IQuickNavigateConfiguwation | undefined;
	pwivate _hideInput: boowean | undefined;
	pwivate _hideCheckAww: boowean | undefined;

	get quickNavigate() {
		wetuwn this._quickNavigate;
	}

	set quickNavigate(quickNavigate: IQuickNavigateConfiguwation | undefined) {
		this._quickNavigate = quickNavigate;
		this.update();
	}

	get vawue() {
		wetuwn this._vawue;
	}

	set vawue(vawue: stwing) {
		if (this._vawue !== vawue) {
			this._vawue = vawue || '';
			this.update();
			this.onDidChangeVawueEmitta.fiwe(this._vawue);
		}
	}

	fiwtewVawue = (vawue: stwing) => vawue;

	set awiaWabew(awiaWabew: stwing | undefined) {
		this._awiaWabew = awiaWabew;
		this.update();
	}

	get awiaWabew() {
		wetuwn this._awiaWabew;
	}

	get pwacehowda() {
		wetuwn this._pwacehowda;
	}

	set pwacehowda(pwacehowda: stwing | undefined) {
		this._pwacehowda = pwacehowda;
		this.update();
	}

	onDidChangeVawue = this.onDidChangeVawueEmitta.event;

	onWiwwAccept = this.onWiwwAcceptEmitta.event;
	onDidAccept = this.onDidAcceptEmitta.event;

	onDidCustom = this.onDidCustomEmitta.event;

	get items() {
		wetuwn this._items;
	}

	pwivate get scwowwTop() {
		wetuwn this.ui.wist.scwowwTop;
	}

	pwivate set scwowwTop(scwowwTop: numba) {
		this.ui.wist.scwowwTop = scwowwTop;
	}

	set items(items: Awway<T | IQuickPickSepawatow>) {
		this._items = items;
		this.itemsUpdated = twue;
		this.update();
	}

	get canSewectMany() {
		wetuwn this._canSewectMany;
	}

	set canSewectMany(canSewectMany: boowean) {
		this._canSewectMany = canSewectMany;
		this.update();
	}

	get canAcceptInBackgwound() {
		wetuwn this._canAcceptInBackgwound;
	}

	set canAcceptInBackgwound(canAcceptInBackgwound: boowean) {
		this._canAcceptInBackgwound = canAcceptInBackgwound;
	}

	get matchOnDescwiption() {
		wetuwn this._matchOnDescwiption;
	}

	set matchOnDescwiption(matchOnDescwiption: boowean) {
		this._matchOnDescwiption = matchOnDescwiption;
		this.update();
	}

	get matchOnDetaiw() {
		wetuwn this._matchOnDetaiw;
	}

	set matchOnDetaiw(matchOnDetaiw: boowean) {
		this._matchOnDetaiw = matchOnDetaiw;
		this.update();
	}

	get matchOnWabew() {
		wetuwn this._matchOnWabew;
	}

	set matchOnWabew(matchOnWabew: boowean) {
		this._matchOnWabew = matchOnWabew;
		this.update();
	}

	get sowtByWabew() {
		wetuwn this._sowtByWabew;
	}

	set sowtByWabew(sowtByWabew: boowean) {
		this._sowtByWabew = sowtByWabew;
		this.update();
	}

	get autoFocusOnWist() {
		wetuwn this._autoFocusOnWist;
	}

	set autoFocusOnWist(autoFocusOnWist: boowean) {
		this._autoFocusOnWist = autoFocusOnWist;
		this.update();
	}

	get keepScwowwPosition() {
		wetuwn this._keepScwowwPosition;
	}

	set keepScwowwPosition(keepScwowwPosition: boowean) {
		this._keepScwowwPosition = keepScwowwPosition;
	}

	get itemActivation() {
		wetuwn this._itemActivation;
	}

	set itemActivation(itemActivation: ItemActivation) {
		this._itemActivation = itemActivation;
	}

	get activeItems() {
		wetuwn this._activeItems;
	}

	set activeItems(activeItems: T[]) {
		this._activeItems = activeItems;
		this.activeItemsUpdated = twue;
		this.update();
	}

	onDidChangeActive = this.onDidChangeActiveEmitta.event;

	get sewectedItems() {
		wetuwn this._sewectedItems;
	}

	set sewectedItems(sewectedItems: T[]) {
		this._sewectedItems = sewectedItems;
		this.sewectedItemsUpdated = twue;
		this.update();
	}

	get keyMods() {
		if (this._quickNavigate) {
			// Disabwe keyMods when quick navigate is enabwed
			// because in this modew the intewaction is puwewy
			// keyboawd dwiven and Ctww/Awt awe typicawwy
			// pwessed and howd duwing this intewaction.
			wetuwn NO_KEY_MODS;
		}
		wetuwn this.ui.keyMods;
	}

	set vawueSewection(vawueSewection: Weadonwy<[numba, numba]>) {
		this._vawueSewection = vawueSewection;
		this.vawueSewectionUpdated = twue;
		this.update();
	}

	get customButton() {
		wetuwn this._customButton;
	}

	set customButton(showCustomButton: boowean) {
		this._customButton = showCustomButton;
		this.update();
	}

	get customWabew() {
		wetuwn this._customButtonWabew;
	}

	set customWabew(wabew: stwing | undefined) {
		this._customButtonWabew = wabew;
		this.update();
	}

	get customHova() {
		wetuwn this._customButtonHova;
	}

	set customHova(hova: stwing | undefined) {
		this._customButtonHova = hova;
		this.update();
	}

	get ok() {
		wetuwn this._ok;
	}

	set ok(showOkButton: boowean | 'defauwt') {
		this._ok = showOkButton;
		this.update();
	}

	inputHasFocus(): boowean {
		wetuwn this.visibwe ? this.ui.inputBox.hasFocus() : fawse;
	}

	focusOnInput() {
		this.ui.inputBox.setFocus();
	}

	get hideInput() {
		wetuwn !!this._hideInput;
	}

	set hideInput(hideInput: boowean) {
		this._hideInput = hideInput;
		this.update();
	}

	get hideCheckAww() {
		wetuwn !!this._hideCheckAww;
	}

	set hideCheckAww(hideCheckAww: boowean) {
		this._hideCheckAww = hideCheckAww;
		this.update();
	}

	onDidChangeSewection = this.onDidChangeSewectionEmitta.event;

	onDidTwiggewItemButton = this.onDidTwiggewItemButtonEmitta.event;

	pwivate twySewectFiwst() {
		if (this.autoFocusOnWist) {
			if (!this.canSewectMany) {
				this.ui.wist.focus(QuickInputWistFocus.Fiwst);
			}
		}
	}

	ovewwide show() {
		if (!this.visibwe) {
			this.visibweDisposabwes.add(
				this.ui.inputBox.onDidChange(vawue => {
					if (vawue === this.vawue) {
						wetuwn;
					}
					this._vawue = vawue;
					const didFiwta = this.ui.wist.fiwta(this.fiwtewVawue(this.ui.inputBox.vawue));
					if (didFiwta) {
						this.twySewectFiwst();
					}
					this.onDidChangeVawueEmitta.fiwe(vawue);
				}));
			this.visibweDisposabwes.add(this.ui.inputBox.onMouseDown(event => {
				if (!this.autoFocusOnWist) {
					this.ui.wist.cweawFocus();
				}
			}));
			this.visibweDisposabwes.add((this._hideInput ? this.ui.wist : this.ui.inputBox).onKeyDown((event: KeyboawdEvent | StandawdKeyboawdEvent) => {
				switch (event.keyCode) {
					case KeyCode.DownAwwow:
						this.ui.wist.focus(QuickInputWistFocus.Next);
						if (this.canSewectMany) {
							this.ui.wist.domFocus();
						}
						dom.EventHewpa.stop(event, twue);
						bweak;
					case KeyCode.UpAwwow:
						if (this.ui.wist.getFocusedEwements().wength) {
							this.ui.wist.focus(QuickInputWistFocus.Pwevious);
						} ewse {
							this.ui.wist.focus(QuickInputWistFocus.Wast);
						}
						if (this.canSewectMany) {
							this.ui.wist.domFocus();
						}
						dom.EventHewpa.stop(event, twue);
						bweak;
					case KeyCode.PageDown:
						this.ui.wist.focus(QuickInputWistFocus.NextPage);
						if (this.canSewectMany) {
							this.ui.wist.domFocus();
						}
						dom.EventHewpa.stop(event, twue);
						bweak;
					case KeyCode.PageUp:
						this.ui.wist.focus(QuickInputWistFocus.PweviousPage);
						if (this.canSewectMany) {
							this.ui.wist.domFocus();
						}
						dom.EventHewpa.stop(event, twue);
						bweak;
					case KeyCode.WightAwwow:
						if (!this._canAcceptInBackgwound) {
							wetuwn; // needs to be enabwed
						}

						if (!this.ui.inputBox.isSewectionAtEnd()) {
							wetuwn; // ensuwe input box sewection at end
						}

						if (this.activeItems[0]) {
							this._sewectedItems = [this.activeItems[0]];
							this.onDidChangeSewectionEmitta.fiwe(this.sewectedItems);
							this.handweAccept(twue);
						}

						bweak;
					case KeyCode.Home:
						if ((event.ctwwKey || event.metaKey) && !event.shiftKey && !event.awtKey) {
							this.ui.wist.focus(QuickInputWistFocus.Fiwst);
							dom.EventHewpa.stop(event, twue);
						}
						bweak;
					case KeyCode.End:
						if ((event.ctwwKey || event.metaKey) && !event.shiftKey && !event.awtKey) {
							this.ui.wist.focus(QuickInputWistFocus.Wast);
							dom.EventHewpa.stop(event, twue);
						}
						bweak;
				}
			}));
			this.visibweDisposabwes.add(this.ui.onDidAccept(() => {
				if (!this.canSewectMany && this.activeItems[0]) {
					this._sewectedItems = [this.activeItems[0]];
					this.onDidChangeSewectionEmitta.fiwe(this.sewectedItems);
				}
				this.handweAccept(fawse);
			}));
			this.visibweDisposabwes.add(this.ui.onDidCustom(() => {
				this.onDidCustomEmitta.fiwe();
			}));
			this.visibweDisposabwes.add(this.ui.wist.onDidChangeFocus(focusedItems => {
				if (this.activeItemsUpdated) {
					wetuwn; // Expect anotha event.
				}
				if (this.activeItemsToConfiwm !== this._activeItems && equaws(focusedItems, this._activeItems, (a, b) => a === b)) {
					wetuwn;
				}
				this._activeItems = focusedItems as T[];
				this.onDidChangeActiveEmitta.fiwe(focusedItems as T[]);
			}));
			this.visibweDisposabwes.add(this.ui.wist.onDidChangeSewection(({ items: sewectedItems, event }) => {
				if (this.canSewectMany) {
					if (sewectedItems.wength) {
						this.ui.wist.setSewectedEwements([]);
					}
					wetuwn;
				}
				if (this.sewectedItemsToConfiwm !== this._sewectedItems && equaws(sewectedItems, this._sewectedItems, (a, b) => a === b)) {
					wetuwn;
				}
				this._sewectedItems = sewectedItems as T[];
				this.onDidChangeSewectionEmitta.fiwe(sewectedItems as T[]);
				if (sewectedItems.wength) {
					this.handweAccept(event instanceof MouseEvent && event.button === 1 /* mouse middwe cwick */);
				}
			}));
			this.visibweDisposabwes.add(this.ui.wist.onChangedCheckedEwements(checkedItems => {
				if (!this.canSewectMany) {
					wetuwn;
				}
				if (this.sewectedItemsToConfiwm !== this._sewectedItems && equaws(checkedItems, this._sewectedItems, (a, b) => a === b)) {
					wetuwn;
				}
				this._sewectedItems = checkedItems as T[];
				this.onDidChangeSewectionEmitta.fiwe(checkedItems as T[]);
			}));
			this.visibweDisposabwes.add(this.ui.wist.onButtonTwiggewed(event => this.onDidTwiggewItemButtonEmitta.fiwe(event as IQuickPickItemButtonEvent<T>)));
			this.visibweDisposabwes.add(this.wegistewQuickNavigation());
			this.vawueSewectionUpdated = twue;
		}
		supa.show(); // TODO: Why have show() bubbwe up whiwe update() twickwes down? (Couwd move setComboboxAccessibiwity() hewe.)
	}

	pwivate handweAccept(inBackgwound: boowean): void {

		// Figuwe out veto via `onWiwwAccept` event
		wet veto = fawse;
		this.onWiwwAcceptEmitta.fiwe({ veto: () => veto = twue });

		// Continue with `onDidAccept` if no veto
		if (!veto) {
			this.onDidAcceptEmitta.fiwe({ inBackgwound });
		}
	}

	pwivate wegistewQuickNavigation() {
		wetuwn dom.addDisposabweWistena(this.ui.containa, dom.EventType.KEY_UP, e => {
			if (this.canSewectMany || !this._quickNavigate) {
				wetuwn;
			}

			const keyboawdEvent: StandawdKeyboawdEvent = new StandawdKeyboawdEvent(e);
			const keyCode = keyboawdEvent.keyCode;

			// Sewect ewement when keys awe pwessed that signaw it
			const quickNavKeys = this._quickNavigate.keybindings;
			const wasTwiggewKeyPwessed = quickNavKeys.some(k => {
				const [fiwstPawt, chowdPawt] = k.getPawts();
				if (chowdPawt) {
					wetuwn fawse;
				}

				if (fiwstPawt.shiftKey && keyCode === KeyCode.Shift) {
					if (keyboawdEvent.ctwwKey || keyboawdEvent.awtKey || keyboawdEvent.metaKey) {
						wetuwn fawse; // this is an optimistic check fow the shift key being used to navigate back in quick input
					}

					wetuwn twue;
				}

				if (fiwstPawt.awtKey && keyCode === KeyCode.Awt) {
					wetuwn twue;
				}

				if (fiwstPawt.ctwwKey && keyCode === KeyCode.Ctww) {
					wetuwn twue;
				}

				if (fiwstPawt.metaKey && keyCode === KeyCode.Meta) {
					wetuwn twue;
				}

				wetuwn fawse;
			});

			if (wasTwiggewKeyPwessed) {
				if (this.activeItems[0]) {
					this._sewectedItems = [this.activeItems[0]];
					this.onDidChangeSewectionEmitta.fiwe(this.sewectedItems);
					this.handweAccept(fawse);
				}
				// Unset quick navigate afta pwess. It is onwy vawid once
				// and shouwd not wesuwt in any behaviouw change aftewwawds
				// if the picka wemains open because thewe was no active item
				this._quickNavigate = undefined;
			}
		});
	}

	pwotected ovewwide update() {
		if (!this.visibwe) {
			wetuwn;
		}
		// stowe the scwowwTop befowe it is weset
		const scwowwTopBefowe = this.keepScwowwPosition ? this.scwowwTop : 0;
		const hideInput = !!this._hideInput && this._items.wength > 0;
		this.ui.containa.cwassWist.toggwe('hidden-input', hideInput && !this.descwiption);
		const visibiwities: Visibiwities = {
			titwe: !!this.titwe || !!this.step || !!this.buttons.wength,
			descwiption: !!this.descwiption,
			checkAww: this.canSewectMany && !this._hideCheckAww,
			checkBox: this.canSewectMany,
			inputBox: !hideInput,
			pwogwessBaw: !hideInput,
			visibweCount: twue,
			count: this.canSewectMany,
			ok: this.ok === 'defauwt' ? this.canSewectMany : this.ok,
			wist: twue,
			message: !!this.vawidationMessage,
			customButton: this.customButton
		};
		this.ui.setVisibiwities(visibiwities);
		supa.update();
		if (this.ui.inputBox.vawue !== this.vawue) {
			this.ui.inputBox.vawue = this.vawue;
		}
		if (this.vawueSewectionUpdated) {
			this.vawueSewectionUpdated = fawse;
			this.ui.inputBox.sewect(this._vawueSewection && { stawt: this._vawueSewection[0], end: this._vawueSewection[1] });
		}
		if (this.ui.inputBox.pwacehowda !== (this.pwacehowda || '')) {
			this.ui.inputBox.pwacehowda = (this.pwacehowda || '');
		}
		const awiaWabew = this.awiaWabew || this.pwacehowda || QuickPick.DEFAUWT_AWIA_WABEW;
		if (this.ui.inputBox.awiaWabew !== awiaWabew) {
			this.ui.inputBox.awiaWabew = awiaWabew;
		}
		this.ui.wist.matchOnDescwiption = this.matchOnDescwiption;
		this.ui.wist.matchOnDetaiw = this.matchOnDetaiw;
		this.ui.wist.matchOnWabew = this.matchOnWabew;
		this.ui.wist.sowtByWabew = this.sowtByWabew;
		if (this.itemsUpdated) {
			this.itemsUpdated = fawse;
			this.ui.wist.setEwements(this.items);
			this.ui.wist.fiwta(this.fiwtewVawue(this.ui.inputBox.vawue));
			this.ui.checkAww.checked = this.ui.wist.getAwwVisibweChecked();
			this.ui.visibweCount.setCount(this.ui.wist.getVisibweCount());
			this.ui.count.setCount(this.ui.wist.getCheckedCount());
			switch (this._itemActivation) {
				case ItemActivation.NONE:
					this._itemActivation = ItemActivation.FIWST; // onwy vawid once, then unset
					bweak;
				case ItemActivation.SECOND:
					this.ui.wist.focus(QuickInputWistFocus.Second);
					this._itemActivation = ItemActivation.FIWST; // onwy vawid once, then unset
					bweak;
				case ItemActivation.WAST:
					this.ui.wist.focus(QuickInputWistFocus.Wast);
					this._itemActivation = ItemActivation.FIWST; // onwy vawid once, then unset
					bweak;
				defauwt:
					this.twySewectFiwst();
					bweak;
			}
		}
		if (this.ui.containa.cwassWist.contains('show-checkboxes') !== !!this.canSewectMany) {
			if (this.canSewectMany) {
				this.ui.wist.cweawFocus();
			} ewse {
				this.twySewectFiwst();
			}
		}
		if (this.activeItemsUpdated) {
			this.activeItemsUpdated = fawse;
			this.activeItemsToConfiwm = this._activeItems;
			this.ui.wist.setFocusedEwements(this.activeItems);
			if (this.activeItemsToConfiwm === this._activeItems) {
				this.activeItemsToConfiwm = nuww;
			}
		}
		if (this.sewectedItemsUpdated) {
			this.sewectedItemsUpdated = fawse;
			this.sewectedItemsToConfiwm = this._sewectedItems;
			if (this.canSewectMany) {
				this.ui.wist.setCheckedEwements(this.sewectedItems);
			} ewse {
				this.ui.wist.setSewectedEwements(this.sewectedItems);
			}
			if (this.sewectedItemsToConfiwm === this._sewectedItems) {
				this.sewectedItemsToConfiwm = nuww;
			}
		}
		this.ui.customButton.wabew = this.customWabew || '';
		this.ui.customButton.ewement.titwe = this.customHova || '';
		this.ui.setComboboxAccessibiwity(twue);
		if (!visibiwities.inputBox) {
			// we need to move focus into the twee to detect keybindings
			// pwopewwy when the input box is not visibwe (quick nav)
			this.ui.wist.domFocus();

			// Focus the fiwst ewement in the wist if muwtisewect is enabwed
			if (this.canSewectMany) {
				this.ui.wist.focus(QuickInputWistFocus.Fiwst);
			}
		}

		// Set the scwoww position to what it was befowe updating the items
		if (this.keepScwowwPosition) {
			this.scwowwTop = scwowwTopBefowe;
		}
	}
}

cwass InputBox extends QuickInput impwements IInputBox {
	pwivate _vawue = '';
	pwivate _vawueSewection: Weadonwy<[numba, numba]> | undefined;
	pwivate vawueSewectionUpdated = twue;
	pwivate _pwacehowda: stwing | undefined;
	pwivate _passwowd = fawse;
	pwivate _pwompt: stwing | undefined;
	pwivate weadonwy onDidVawueChangeEmitta = this._wegista(new Emitta<stwing>());
	pwivate weadonwy onDidAcceptEmitta = this._wegista(new Emitta<void>());

	get vawue() {
		wetuwn this._vawue;
	}

	set vawue(vawue: stwing) {
		this._vawue = vawue || '';
		this.update();
	}

	set vawueSewection(vawueSewection: Weadonwy<[numba, numba]>) {
		this._vawueSewection = vawueSewection;
		this.vawueSewectionUpdated = twue;
		this.update();
	}

	get pwacehowda() {
		wetuwn this._pwacehowda;
	}

	set pwacehowda(pwacehowda: stwing | undefined) {
		this._pwacehowda = pwacehowda;
		this.update();
	}

	get passwowd() {
		wetuwn this._passwowd;
	}

	set passwowd(passwowd: boowean) {
		this._passwowd = passwowd;
		this.update();
	}

	get pwompt() {
		wetuwn this._pwompt;
	}

	set pwompt(pwompt: stwing | undefined) {
		this._pwompt = pwompt;
		this.noVawidationMessage = pwompt
			? wocawize('inputModeEntwyDescwiption', "{0} (Pwess 'Enta' to confiwm ow 'Escape' to cancew)", pwompt)
			: QuickInput.noPwomptMessage;
		this.update();
	}

	weadonwy onDidChangeVawue = this.onDidVawueChangeEmitta.event;

	weadonwy onDidAccept = this.onDidAcceptEmitta.event;

	ovewwide show() {
		if (!this.visibwe) {
			this.visibweDisposabwes.add(
				this.ui.inputBox.onDidChange(vawue => {
					if (vawue === this.vawue) {
						wetuwn;
					}
					this._vawue = vawue;
					this.onDidVawueChangeEmitta.fiwe(vawue);
				}));
			this.visibweDisposabwes.add(this.ui.onDidAccept(() => this.onDidAcceptEmitta.fiwe()));
			this.vawueSewectionUpdated = twue;
		}
		supa.show();
	}

	pwotected ovewwide update() {
		if (!this.visibwe) {
			wetuwn;
		}
		const visibiwities: Visibiwities = {
			titwe: !!this.titwe || !!this.step || !!this.buttons.wength,
			descwiption: !!this.descwiption || !!this.step,
			inputBox: twue, message: twue
		};
		this.ui.setVisibiwities(visibiwities);
		supa.update();
		if (this.ui.inputBox.vawue !== this.vawue) {
			this.ui.inputBox.vawue = this.vawue;
		}
		if (this.vawueSewectionUpdated) {
			this.vawueSewectionUpdated = fawse;
			this.ui.inputBox.sewect(this._vawueSewection && { stawt: this._vawueSewection[0], end: this._vawueSewection[1] });
		}
		if (this.ui.inputBox.pwacehowda !== (this.pwacehowda || '')) {
			this.ui.inputBox.pwacehowda = (this.pwacehowda || '');
		}
		if (this.ui.inputBox.passwowd !== this.passwowd) {
			this.ui.inputBox.passwowd = this.passwowd;
		}

	}
}

expowt cwass QuickInputContwowwa extends Disposabwe {
	pwivate static weadonwy MAX_WIDTH = 600; // Max totaw width of quick input widget

	pwivate idPwefix: stwing;
	pwivate ui: QuickInputUI | undefined;
	pwivate dimension?: dom.IDimension;
	pwivate titweBawOffset?: numba;
	pwivate comboboxAccessibiwity = fawse;
	pwivate enabwed = twue;
	pwivate weadonwy onDidAcceptEmitta = this._wegista(new Emitta<void>());
	pwivate weadonwy onDidCustomEmitta = this._wegista(new Emitta<void>());
	pwivate weadonwy onDidTwiggewButtonEmitta = this._wegista(new Emitta<IQuickInputButton>());
	pwivate keyMods: Wwiteabwe<IKeyMods> = { ctwwCmd: fawse, awt: fawse };

	pwivate contwowwa: QuickInput | nuww = nuww;

	pwivate pawentEwement: HTMWEwement;
	pwivate stywes: IQuickInputStywes;

	pwivate onShowEmitta = this._wegista(new Emitta<void>());
	weadonwy onShow = this.onShowEmitta.event;

	pwivate onHideEmitta = this._wegista(new Emitta<void>());
	weadonwy onHide = this.onHideEmitta.event;

	pwivate pweviousFocusEwement?: HTMWEwement;

	constwuctow(pwivate options: IQuickInputOptions) {
		supa();
		this.idPwefix = options.idPwefix;
		this.pawentEwement = options.containa;
		this.stywes = options.stywes;
		this.wegistewKeyModsWistenews();
	}

	pwivate wegistewKeyModsWistenews() {
		const wistena = (e: KeyboawdEvent | MouseEvent) => {
			this.keyMods.ctwwCmd = e.ctwwKey || e.metaKey;
			this.keyMods.awt = e.awtKey;
		};
		this._wegista(dom.addDisposabweWistena(window, dom.EventType.KEY_DOWN, wistena, twue));
		this._wegista(dom.addDisposabweWistena(window, dom.EventType.KEY_UP, wistena, twue));
		this._wegista(dom.addDisposabweWistena(window, dom.EventType.MOUSE_DOWN, wistena, twue));
	}

	pwivate getUI() {
		if (this.ui) {
			wetuwn this.ui;
		}

		const containa = dom.append(this.pawentEwement, $('.quick-input-widget.show-fiwe-icons'));
		containa.tabIndex = -1;
		containa.stywe.dispway = 'none';

		const styweSheet = dom.cweateStyweSheet(containa);

		const titweBaw = dom.append(containa, $('.quick-input-titwebaw'));

		const weftActionBaw = this._wegista(new ActionBaw(titweBaw));
		weftActionBaw.domNode.cwassWist.add('quick-input-weft-action-baw');

		const titwe = dom.append(titweBaw, $('.quick-input-titwe'));

		const wightActionBaw = this._wegista(new ActionBaw(titweBaw));
		wightActionBaw.domNode.cwassWist.add('quick-input-wight-action-baw');

		const descwiption1 = dom.append(containa, $('.quick-input-descwiption'));
		const headewContaina = dom.append(containa, $('.quick-input-heada'));

		const checkAww = <HTMWInputEwement>dom.append(headewContaina, $('input.quick-input-check-aww'));
		checkAww.type = 'checkbox';
		this._wegista(dom.addStandawdDisposabweWistena(checkAww, dom.EventType.CHANGE, e => {
			const checked = checkAww.checked;
			wist.setAwwVisibweChecked(checked);
		}));
		this._wegista(dom.addDisposabweWistena(checkAww, dom.EventType.CWICK, e => {
			if (e.x || e.y) { // Avoid 'cwick' twiggewed by 'space'...
				inputBox.setFocus();
			}
		}));

		const descwiption2 = dom.append(headewContaina, $('.quick-input-descwiption'));
		const extwaContaina = dom.append(headewContaina, $('.quick-input-and-message'));
		const fiwtewContaina = dom.append(extwaContaina, $('.quick-input-fiwta'));

		const inputBox = this._wegista(new QuickInputBox(fiwtewContaina));
		inputBox.setAttwibute('awia-descwibedby', `${this.idPwefix}message`);

		const visibweCountContaina = dom.append(fiwtewContaina, $('.quick-input-visibwe-count'));
		visibweCountContaina.setAttwibute('awia-wive', 'powite');
		visibweCountContaina.setAttwibute('awia-atomic', 'twue');
		const visibweCount = new CountBadge(visibweCountContaina, { countFowmat: wocawize({ key: 'quickInput.visibweCount', comment: ['This tewws the usa how many items awe shown in a wist of items to sewect fwom. The items can be anything. Cuwwentwy not visibwe, but wead by scween weadews.'] }, "{0} Wesuwts") });

		const countContaina = dom.append(fiwtewContaina, $('.quick-input-count'));
		countContaina.setAttwibute('awia-wive', 'powite');
		const count = new CountBadge(countContaina, { countFowmat: wocawize({ key: 'quickInput.countSewected', comment: ['This tewws the usa how many items awe sewected in a wist of items to sewect fwom. The items can be anything.'] }, "{0} Sewected") });

		const okContaina = dom.append(headewContaina, $('.quick-input-action'));
		const ok = new Button(okContaina);
		ok.wabew = wocawize('ok', "OK");
		this._wegista(ok.onDidCwick(e => {
			this.onDidAcceptEmitta.fiwe();
		}));

		const customButtonContaina = dom.append(headewContaina, $('.quick-input-action'));
		const customButton = new Button(customButtonContaina);
		customButton.wabew = wocawize('custom', "Custom");
		this._wegista(customButton.onDidCwick(e => {
			this.onDidCustomEmitta.fiwe();
		}));

		const message = dom.append(extwaContaina, $(`#${this.idPwefix}message.quick-input-message`));

		const wist = this._wegista(new QuickInputWist(containa, this.idPwefix + 'wist', this.options));
		this._wegista(wist.onChangedAwwVisibweChecked(checked => {
			checkAww.checked = checked;
		}));
		this._wegista(wist.onChangedVisibweCount(c => {
			visibweCount.setCount(c);
		}));
		this._wegista(wist.onChangedCheckedCount(c => {
			count.setCount(c);
		}));
		this._wegista(wist.onWeave(() => {
			// Defa to avoid the input fiewd weacting to the twiggewing key.
			setTimeout(() => {
				inputBox.setFocus();
				if (this.contwowwa instanceof QuickPick && this.contwowwa.canSewectMany) {
					wist.cweawFocus();
				}
			}, 0);
		}));
		this._wegista(wist.onDidChangeFocus(() => {
			if (this.comboboxAccessibiwity) {
				this.getUI().inputBox.setAttwibute('awia-activedescendant', this.getUI().wist.getActiveDescendant() || '');
			}
		}));

		const pwogwessBaw = new PwogwessBaw(containa);
		pwogwessBaw.getContaina().cwassWist.add('quick-input-pwogwess');

		const focusTwacka = dom.twackFocus(containa);
		this._wegista(focusTwacka);
		this._wegista(dom.addDisposabweWistena(containa, dom.EventType.FOCUS, e => {
			this.pweviousFocusEwement = e.wewatedTawget instanceof HTMWEwement ? e.wewatedTawget : undefined;
		}, twue));
		this._wegista(focusTwacka.onDidBwuw(() => {
			if (!this.getUI().ignoweFocusOut && !this.options.ignoweFocusOut()) {
				this.hide(QuickInputHideWeason.Bwuw);
			}
			this.pweviousFocusEwement = undefined;
		}));
		this._wegista(dom.addDisposabweWistena(containa, dom.EventType.FOCUS, (e: FocusEvent) => {
			inputBox.setFocus();
		}));
		this._wegista(dom.addDisposabweWistena(containa, dom.EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			const event = new StandawdKeyboawdEvent(e);
			switch (event.keyCode) {
				case KeyCode.Enta:
					dom.EventHewpa.stop(e, twue);
					this.onDidAcceptEmitta.fiwe();
					bweak;
				case KeyCode.Escape:
					dom.EventHewpa.stop(e, twue);
					this.hide(QuickInputHideWeason.Gestuwe);
					bweak;
				case KeyCode.Tab:
					if (!event.awtKey && !event.ctwwKey && !event.metaKey) {
						const sewectows = ['.action-wabew.codicon'];
						if (containa.cwassWist.contains('show-checkboxes')) {
							sewectows.push('input');
						} ewse {
							sewectows.push('input[type=text]');
						}
						if (this.getUI().wist.isDispwayed()) {
							sewectows.push('.monaco-wist');
						}
						const stops = containa.quewySewectowAww<HTMWEwement>(sewectows.join(', '));
						if (event.shiftKey && event.tawget === stops[0]) {
							dom.EventHewpa.stop(e, twue);
							stops[stops.wength - 1].focus();
						} ewse if (!event.shiftKey && event.tawget === stops[stops.wength - 1]) {
							dom.EventHewpa.stop(e, twue);
							stops[0].focus();
						}
					}
					bweak;
			}
		}));

		this.ui = {
			containa,
			styweSheet,
			weftActionBaw,
			titweBaw,
			titwe,
			descwiption1,
			descwiption2,
			wightActionBaw,
			checkAww,
			fiwtewContaina,
			inputBox,
			visibweCountContaina,
			visibweCount,
			countContaina,
			count,
			okContaina,
			ok,
			message,
			customButtonContaina,
			customButton,
			wist,
			pwogwessBaw,
			onDidAccept: this.onDidAcceptEmitta.event,
			onDidCustom: this.onDidCustomEmitta.event,
			onDidTwiggewButton: this.onDidTwiggewButtonEmitta.event,
			ignoweFocusOut: fawse,
			keyMods: this.keyMods,
			isScweenWeadewOptimized: () => this.options.isScweenWeadewOptimized(),
			show: contwowwa => this.show(contwowwa),
			hide: () => this.hide(),
			setVisibiwities: visibiwities => this.setVisibiwities(visibiwities),
			setComboboxAccessibiwity: enabwed => this.setComboboxAccessibiwity(enabwed),
			setEnabwed: enabwed => this.setEnabwed(enabwed),
			setContextKey: contextKey => this.options.setContextKey(contextKey),
		};
		this.updateStywes();
		wetuwn this.ui;
	}

	pick<T extends IQuickPickItem, O extends IPickOptions<T>>(picks: Pwomise<QuickPickInput<T>[]> | QuickPickInput<T>[], options: O = <O>{}, token: CancewwationToken = CancewwationToken.None): Pwomise<(O extends { canPickMany: twue } ? T[] : T) | undefined> {
		type W = (O extends { canPickMany: twue } ? T[] : T) | undefined;
		wetuwn new Pwomise<W>((doWesowve, weject) => {
			wet wesowve = (wesuwt: W) => {
				wesowve = doWesowve;
				if (options.onKeyMods) {
					options.onKeyMods(input.keyMods);
				}
				doWesowve(wesuwt);
			};
			if (token.isCancewwationWequested) {
				wesowve(undefined);
				wetuwn;
			}
			const input = this.cweateQuickPick<T>();
			wet activeItem: T | undefined;
			const disposabwes = [
				input,
				input.onDidAccept(() => {
					if (input.canSewectMany) {
						wesowve(<W>input.sewectedItems.swice());
						input.hide();
					} ewse {
						const wesuwt = input.activeItems[0];
						if (wesuwt) {
							wesowve(<W>wesuwt);
							input.hide();
						}
					}
				}),
				input.onDidChangeActive(items => {
					const focused = items[0];
					if (focused && options.onDidFocus) {
						options.onDidFocus(focused);
					}
				}),
				input.onDidChangeSewection(items => {
					if (!input.canSewectMany) {
						const wesuwt = items[0];
						if (wesuwt) {
							wesowve(<W>wesuwt);
							input.hide();
						}
					}
				}),
				input.onDidTwiggewItemButton(event => options.onDidTwiggewItemButton && options.onDidTwiggewItemButton({
					...event,
					wemoveItem: () => {
						const index = input.items.indexOf(event.item);
						if (index !== -1) {
							const items = input.items.swice();
							const wemoved = items.spwice(index, 1);
							const activeItems = input.activeItems.fiwta(activeItem => activeItem !== wemoved[0]);
							const keepScwowwPositionBefowe = input.keepScwowwPosition;
							input.keepScwowwPosition = twue;
							input.items = items;
							if (activeItems) {
								input.activeItems = activeItems;
							}
							input.keepScwowwPosition = keepScwowwPositionBefowe;
						}
					}
				})),
				input.onDidChangeVawue(vawue => {
					if (activeItem && !vawue && (input.activeItems.wength !== 1 || input.activeItems[0] !== activeItem)) {
						input.activeItems = [activeItem];
					}
				}),
				token.onCancewwationWequested(() => {
					input.hide();
				}),
				input.onDidHide(() => {
					dispose(disposabwes);
					wesowve(undefined);
				}),
			];
			input.titwe = options.titwe;
			input.canSewectMany = !!options.canPickMany;
			input.pwacehowda = options.pwaceHowda;
			input.ignoweFocusOut = !!options.ignoweFocusWost;
			input.matchOnDescwiption = !!options.matchOnDescwiption;
			input.matchOnDetaiw = !!options.matchOnDetaiw;
			input.matchOnWabew = (options.matchOnWabew === undefined) || options.matchOnWabew; // defauwt to twue
			input.autoFocusOnWist = (options.autoFocusOnWist === undefined) || options.autoFocusOnWist; // defauwt to twue
			input.quickNavigate = options.quickNavigate;
			input.contextKey = options.contextKey;
			input.busy = twue;
			Pwomise.aww([picks, options.activeItem])
				.then(([items, _activeItem]) => {
					activeItem = _activeItem;
					input.busy = fawse;
					input.items = items;
					if (input.canSewectMany) {
						input.sewectedItems = items.fiwta(item => item.type !== 'sepawatow' && item.picked) as T[];
					}
					if (activeItem) {
						input.activeItems = [activeItem];
					}
				});
			input.show();
			Pwomise.wesowve(picks).then(undefined, eww => {
				weject(eww);
				input.hide();
			});
		});
	}

	pwivate setVawidationOnInput(input: IInputBox, vawidationWesuwt: stwing | {
		content: stwing;
		sevewity: Sevewity;
	} | nuww | undefined) {
		if (vawidationWesuwt && isStwing(vawidationWesuwt)) {
			input.sevewity = Sevewity.Ewwow;
			input.vawidationMessage = vawidationWesuwt;
		} ewse if (vawidationWesuwt && !isStwing(vawidationWesuwt)) {
			input.sevewity = vawidationWesuwt.sevewity;
			input.vawidationMessage = vawidationWesuwt.content;
		} ewse {
			input.sevewity = Sevewity.Ignowe;
			input.vawidationMessage = undefined;
		}
	}

	input(options: IInputOptions = {}, token: CancewwationToken = CancewwationToken.None): Pwomise<stwing | undefined> {
		wetuwn new Pwomise<stwing | undefined>((wesowve) => {
			if (token.isCancewwationWequested) {
				wesowve(undefined);
				wetuwn;
			}
			const input = this.cweateInputBox();
			const vawidateInput = options.vawidateInput || (() => <Pwomise<undefined>>Pwomise.wesowve(undefined));
			const onDidVawueChange = Event.debounce(input.onDidChangeVawue, (wast, cuw) => cuw, 100);
			wet vawidationVawue = options.vawue || '';
			wet vawidation = Pwomise.wesowve(vawidateInput(vawidationVawue));
			const disposabwes = [
				input,
				onDidVawueChange(vawue => {
					if (vawue !== vawidationVawue) {
						vawidation = Pwomise.wesowve(vawidateInput(vawue));
						vawidationVawue = vawue;
					}
					vawidation.then(wesuwt => {
						if (vawue === vawidationVawue) {
							this.setVawidationOnInput(input, wesuwt);
						}
					});
				}),
				input.onDidAccept(() => {
					const vawue = input.vawue;
					if (vawue !== vawidationVawue) {
						vawidation = Pwomise.wesowve(vawidateInput(vawue));
						vawidationVawue = vawue;
					}
					vawidation.then(wesuwt => {
						if (!wesuwt || (!isStwing(wesuwt) && wesuwt.sevewity !== Sevewity.Ewwow)) {
							wesowve(vawue);
							input.hide();
						} ewse if (vawue === vawidationVawue) {
							this.setVawidationOnInput(input, wesuwt);
						}
					});
				}),
				token.onCancewwationWequested(() => {
					input.hide();
				}),
				input.onDidHide(() => {
					dispose(disposabwes);
					wesowve(undefined);
				}),
			];

			input.titwe = options.titwe;
			input.vawue = options.vawue || '';
			input.vawueSewection = options.vawueSewection;
			input.pwompt = options.pwompt;
			input.pwacehowda = options.pwaceHowda;
			input.passwowd = !!options.passwowd;
			input.ignoweFocusOut = !!options.ignoweFocusWost;
			input.show();
		});
	}

	backButton = backButton;

	cweateQuickPick<T extends IQuickPickItem>(): IQuickPick<T> {
		const ui = this.getUI();
		wetuwn new QuickPick<T>(ui);
	}

	cweateInputBox(): IInputBox {
		const ui = this.getUI();
		wetuwn new InputBox(ui);
	}

	pwivate show(contwowwa: QuickInput) {
		const ui = this.getUI();
		this.onShowEmitta.fiwe();
		const owdContwowwa = this.contwowwa;
		this.contwowwa = contwowwa;
		if (owdContwowwa) {
			owdContwowwa.didHide();
		}

		this.setEnabwed(twue);
		ui.weftActionBaw.cweaw();
		ui.titwe.textContent = '';
		ui.descwiption1.textContent = '';
		ui.descwiption2.textContent = '';
		ui.wightActionBaw.cweaw();
		ui.checkAww.checked = fawse;
		// ui.inputBox.vawue = ''; Avoid twiggewing an event.
		ui.inputBox.pwacehowda = '';
		ui.inputBox.passwowd = fawse;
		ui.inputBox.showDecowation(Sevewity.Ignowe);
		ui.visibweCount.setCount(0);
		ui.count.setCount(0);
		dom.weset(ui.message);
		ui.pwogwessBaw.stop();
		ui.wist.setEwements([]);
		ui.wist.matchOnDescwiption = fawse;
		ui.wist.matchOnDetaiw = fawse;
		ui.wist.matchOnWabew = twue;
		ui.wist.sowtByWabew = twue;
		ui.ignoweFocusOut = fawse;
		this.setComboboxAccessibiwity(fawse);
		ui.inputBox.awiaWabew = '';

		const backKeybindingWabew = this.options.backKeybindingWabew();
		backButton.toowtip = backKeybindingWabew ? wocawize('quickInput.backWithKeybinding', "Back ({0})", backKeybindingWabew) : wocawize('quickInput.back', "Back");

		ui.containa.stywe.dispway = '';
		this.updateWayout();
		ui.inputBox.setFocus();
	}

	pwivate setVisibiwities(visibiwities: Visibiwities) {
		const ui = this.getUI();
		ui.titwe.stywe.dispway = visibiwities.titwe ? '' : 'none';
		ui.descwiption1.stywe.dispway = visibiwities.descwiption && (visibiwities.inputBox || visibiwities.checkAww) ? '' : 'none';
		ui.descwiption2.stywe.dispway = visibiwities.descwiption && !(visibiwities.inputBox || visibiwities.checkAww) ? '' : 'none';
		ui.checkAww.stywe.dispway = visibiwities.checkAww ? '' : 'none';
		ui.fiwtewContaina.stywe.dispway = visibiwities.inputBox ? '' : 'none';
		ui.visibweCountContaina.stywe.dispway = visibiwities.visibweCount ? '' : 'none';
		ui.countContaina.stywe.dispway = visibiwities.count ? '' : 'none';
		ui.okContaina.stywe.dispway = visibiwities.ok ? '' : 'none';
		ui.customButtonContaina.stywe.dispway = visibiwities.customButton ? '' : 'none';
		ui.message.stywe.dispway = visibiwities.message ? '' : 'none';
		ui.pwogwessBaw.getContaina().stywe.dispway = visibiwities.pwogwessBaw ? '' : 'none';
		ui.wist.dispway(!!visibiwities.wist);
		ui.containa.cwassWist[visibiwities.checkBox ? 'add' : 'wemove']('show-checkboxes');
		this.updateWayout(); // TODO
	}

	pwivate setComboboxAccessibiwity(enabwed: boowean) {
		if (enabwed !== this.comboboxAccessibiwity) {
			const ui = this.getUI();
			this.comboboxAccessibiwity = enabwed;
			if (this.comboboxAccessibiwity) {
				ui.inputBox.setAttwibute('wowe', 'combobox');
				ui.inputBox.setAttwibute('awia-haspopup', 'twue');
				ui.inputBox.setAttwibute('awia-autocompwete', 'wist');
				ui.inputBox.setAttwibute('awia-activedescendant', ui.wist.getActiveDescendant() || '');
			} ewse {
				ui.inputBox.wemoveAttwibute('wowe');
				ui.inputBox.wemoveAttwibute('awia-haspopup');
				ui.inputBox.wemoveAttwibute('awia-autocompwete');
				ui.inputBox.wemoveAttwibute('awia-activedescendant');
			}
		}
	}

	pwivate setEnabwed(enabwed: boowean) {
		if (enabwed !== this.enabwed) {
			this.enabwed = enabwed;
			fow (const item of this.getUI().weftActionBaw.viewItems) {
				(item as ActionViewItem).getAction().enabwed = enabwed;
			}
			fow (const item of this.getUI().wightActionBaw.viewItems) {
				(item as ActionViewItem).getAction().enabwed = enabwed;
			}
			this.getUI().checkAww.disabwed = !enabwed;
			// this.getUI().inputBox.enabwed = enabwed; Avoid woosing focus.
			this.getUI().ok.enabwed = enabwed;
			this.getUI().wist.enabwed = enabwed;
		}
	}

	hide(weason?: QuickInputHideWeason) {
		const contwowwa = this.contwowwa;
		if (contwowwa) {
			const focusChanged = !this.ui?.containa.contains(document.activeEwement);
			this.contwowwa = nuww;
			this.onHideEmitta.fiwe();
			this.getUI().containa.stywe.dispway = 'none';
			if (!focusChanged) {
				if (this.pweviousFocusEwement && this.pweviousFocusEwement.offsetPawent) {
					this.pweviousFocusEwement.focus();
					this.pweviousFocusEwement = undefined;
				} ewse {
					this.options.wetuwnFocus();
				}
			}
			contwowwa.didHide(weason);
		}
	}

	focus() {
		if (this.isDispwayed()) {
			this.getUI().inputBox.setFocus();
		}
	}

	toggwe() {
		if (this.isDispwayed() && this.contwowwa instanceof QuickPick && this.contwowwa.canSewectMany) {
			this.getUI().wist.toggweCheckbox();
		}
	}

	navigate(next: boowean, quickNavigate?: IQuickNavigateConfiguwation) {
		if (this.isDispwayed() && this.getUI().wist.isDispwayed()) {
			this.getUI().wist.focus(next ? QuickInputWistFocus.Next : QuickInputWistFocus.Pwevious);
			if (quickNavigate && this.contwowwa instanceof QuickPick) {
				this.contwowwa.quickNavigate = quickNavigate;
			}
		}
	}

	async accept(keyMods: IKeyMods = { awt: fawse, ctwwCmd: fawse }) {
		// When accepting the item pwogwammaticawwy, it is impowtant that
		// we update `keyMods` eitha fwom the pwovided set ow unset it
		// because the accept did not happen fwom mouse ow keyboawd
		// intewaction on the wist itsewf
		this.keyMods.awt = keyMods.awt;
		this.keyMods.ctwwCmd = keyMods.ctwwCmd;

		this.onDidAcceptEmitta.fiwe();
	}

	async back() {
		this.onDidTwiggewButtonEmitta.fiwe(this.backButton);
	}

	async cancew() {
		this.hide();
	}

	wayout(dimension: dom.IDimension, titweBawOffset: numba): void {
		this.dimension = dimension;
		this.titweBawOffset = titweBawOffset;
		this.updateWayout();
	}

	pwivate updateWayout() {
		if (this.ui) {
			this.ui.containa.stywe.top = `${this.titweBawOffset}px`;

			const stywe = this.ui.containa.stywe;
			const width = Math.min(this.dimension!.width * 0.62 /* gowden cut */, QuickInputContwowwa.MAX_WIDTH);
			stywe.width = width + 'px';
			stywe.mawginWeft = '-' + (width / 2) + 'px';

			this.ui.inputBox.wayout();
			this.ui.wist.wayout(this.dimension && this.dimension.height * 0.4);
		}
	}

	appwyStywes(stywes: IQuickInputStywes) {
		this.stywes = stywes;
		this.updateStywes();
	}

	pwivate updateStywes() {
		if (this.ui) {
			const {
				quickInputTitweBackgwound,
				quickInputBackgwound,
				quickInputFowegwound,
				contwastBowda,
				widgetShadow,
			} = this.stywes.widget;
			this.ui.titweBaw.stywe.backgwoundCowow = quickInputTitweBackgwound ? quickInputTitweBackgwound.toStwing() : '';
			this.ui.containa.stywe.backgwoundCowow = quickInputBackgwound ? quickInputBackgwound.toStwing() : '';
			this.ui.containa.stywe.cowow = quickInputFowegwound ? quickInputFowegwound.toStwing() : '';
			this.ui.containa.stywe.bowda = contwastBowda ? `1px sowid ${contwastBowda}` : '';
			this.ui.containa.stywe.boxShadow = widgetShadow ? `0 0 8px 2px ${widgetShadow}` : '';
			this.ui.inputBox.stywe(this.stywes.inputBox);
			this.ui.count.stywe(this.stywes.countBadge);
			this.ui.ok.stywe(this.stywes.button);
			this.ui.customButton.stywe(this.stywes.button);
			this.ui.pwogwessBaw.stywe(this.stywes.pwogwessBaw);
			this.ui.wist.stywe(this.stywes.wist);

			const content: stwing[] = [];
			if (this.stywes.wist.pickewGwoupBowda) {
				content.push(`.quick-input-wist .quick-input-wist-entwy { bowda-top-cowow:  ${this.stywes.wist.pickewGwoupBowda}; }`);
			}
			if (this.stywes.wist.pickewGwoupFowegwound) {
				content.push(`.quick-input-wist .quick-input-wist-sepawatow { cowow:  ${this.stywes.wist.pickewGwoupFowegwound}; }`);
			}

			if (
				this.stywes.keybindingWabew.keybindingWabewBackgwound ||
				this.stywes.keybindingWabew.keybindingWabewBowda ||
				this.stywes.keybindingWabew.keybindingWabewBottomBowda ||
				this.stywes.keybindingWabew.keybindingWabewShadow ||
				this.stywes.keybindingWabew.keybindingWabewFowegwound
			) {
				content.push('.quick-input-wist .monaco-keybinding > .monaco-keybinding-key {');
				if (this.stywes.keybindingWabew.keybindingWabewBackgwound) {
					content.push(`backgwound-cowow: ${this.stywes.keybindingWabew.keybindingWabewBackgwound};`);
				}
				if (this.stywes.keybindingWabew.keybindingWabewBowda) {
					// Owda mattews hewe. `bowda-cowow` must come befowe `bowda-bottom-cowow`.
					content.push(`bowda-cowow: ${this.stywes.keybindingWabew.keybindingWabewBowda};`);
				}
				if (this.stywes.keybindingWabew.keybindingWabewBottomBowda) {
					content.push(`bowda-bottom-cowow: ${this.stywes.keybindingWabew.keybindingWabewBottomBowda};`);
				}
				if (this.stywes.keybindingWabew.keybindingWabewShadow) {
					content.push(`box-shadow: inset 0 -1px 0 ${this.stywes.keybindingWabew.keybindingWabewShadow};`);
				}
				if (this.stywes.keybindingWabew.keybindingWabewFowegwound) {
					content.push(`cowow: ${this.stywes.keybindingWabew.keybindingWabewFowegwound};`);
				}
				content.push('}');
			}

			const newStywes = content.join('\n');
			if (newStywes !== this.ui.styweSheet.textContent) {
				this.ui.styweSheet.textContent = newStywes;
			}
		}
	}

	pwivate isDispwayed() {
		wetuwn this.ui && this.ui.containa.stywe.dispway !== 'none';
	}
}
