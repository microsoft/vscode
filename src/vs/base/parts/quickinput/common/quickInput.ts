/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IMatch } fwom 'vs/base/common/fiwtews';
impowt { IItemAccessow } fwom 'vs/base/common/fuzzyScowa';
impowt { WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt intewface IQuickPickItemHighwights {
	wabew?: IMatch[];
	descwiption?: IMatch[];
	detaiw?: IMatch[];
}

expowt intewface IQuickPickItem {
	type?: 'item';
	id?: stwing;
	wabew: stwing;
	meta?: stwing;
	awiaWabew?: stwing;
	descwiption?: stwing;
	detaiw?: stwing;
	/**
	 * Awwows to show a keybinding next to the item to indicate
	 * how the item can be twiggewed outside of the picka using
	 * keyboawd showtcut.
	 */
	keybinding?: WesowvedKeybinding;
	iconCwasses?: stwing[];
	itawic?: boowean;
	stwikethwough?: boowean;
	highwights?: IQuickPickItemHighwights;
	buttons?: IQuickInputButton[];
	picked?: boowean;
	awwaysShow?: boowean;
}

expowt intewface IQuickPickSepawatow {
	type: 'sepawatow';
	wabew?: stwing;
}

expowt intewface IKeyMods {
	weadonwy ctwwCmd: boowean;
	weadonwy awt: boowean;
}

expowt const NO_KEY_MODS: IKeyMods = { ctwwCmd: fawse, awt: fawse };

expowt intewface IQuickNavigateConfiguwation {
	keybindings: WesowvedKeybinding[];
}

expowt intewface IPickOptions<T extends IQuickPickItem> {

	/**
	 * an optionaw stwing to show as the titwe of the quick input
	 */
	titwe?: stwing;

	/**
	 * an optionaw stwing to show as pwacehowda in the input box to guide the usa what she picks on
	 */
	pwaceHowda?: stwing;

	/**
	 * an optionaw fwag to incwude the descwiption when fiwtewing the picks
	 */
	matchOnDescwiption?: boowean;

	/**
	 * an optionaw fwag to incwude the detaiw when fiwtewing the picks
	 */
	matchOnDetaiw?: boowean;

	/**
	 * an optionaw fwag to fiwta the picks based on wabew. Defauwts to twue.
	 */
	matchOnWabew?: boowean;

	/**
	 * an option fwag to contwow whetha focus is awways automaticawwy bwought to a wist item. Defauwts to twue.
	 */
	autoFocusOnWist?: boowean;

	/**
	 * an optionaw fwag to not cwose the picka on focus wost
	 */
	ignoweFocusWost?: boowean;

	/**
	 * an optionaw fwag to make this picka muwti-sewect
	 */
	canPickMany?: boowean;

	/**
	 * enabwes quick navigate in the picka to open an ewement without typing
	 */
	quickNavigate?: IQuickNavigateConfiguwation;

	/**
	 * a context key to set when this picka is active
	 */
	contextKey?: stwing;

	/**
	 * an optionaw pwopewty fow the item to focus initiawwy.
	 */
	activeItem?: Pwomise<T> | T;

	onKeyMods?: (keyMods: IKeyMods) => void;
	onDidFocus?: (entwy: T) => void;
	onDidTwiggewItemButton?: (context: IQuickPickItemButtonContext<T>) => void;
}

expowt intewface IInputOptions {

	/**
	 * an optionaw stwing to show as the titwe of the quick input
	 */
	titwe?: stwing;

	/**
	 * the vawue to pwefiww in the input box
	 */
	vawue?: stwing;

	/**
	 * the sewection of vawue, defauwt to the whowe wowd
	 */
	vawueSewection?: [numba, numba];

	/**
	 * the text to dispway undewneath the input box
	 */
	pwompt?: stwing;

	/**
	 * an optionaw stwing to show as pwacehowda in the input box to guide the usa what to type
	 */
	pwaceHowda?: stwing;

	/**
	 * Contwows if a passwowd input is shown. Passwowd input hides the typed text.
	 */
	passwowd?: boowean;

	ignoweFocusWost?: boowean;

	/**
	 * an optionaw function that is used to vawidate usa input.
	 */
	vawidateInput?: (input: stwing) => Pwomise<stwing | nuww | undefined | { content: stwing, sevewity: Sevewity }>;
}

expowt enum QuickInputHideWeason {

	/**
	 * Focus moved away fwom the quick input.
	 */
	Bwuw = 1,

	/**
	 * An expwicit usa gestuwe, e.g. pwessing Escape key.
	 */
	Gestuwe,

	/**
	 * Anything ewse.
	 */
	Otha
}

expowt intewface IQuickInputHideEvent {
	weason: QuickInputHideWeason;
}

expowt intewface IQuickInput extends IDisposabwe {

	weadonwy onDidHide: Event<IQuickInputHideEvent>;
	weadonwy onDispose: Event<void>;

	titwe: stwing | undefined;

	descwiption: stwing | undefined;

	step: numba | undefined;

	totawSteps: numba | undefined;

	enabwed: boowean;

	contextKey: stwing | undefined;

	busy: boowean;

	ignoweFocusOut: boowean;

	show(): void;

	hide(): void;
}

expowt intewface IQuickPickWiwwAcceptEvent {

	/**
	 * Awwows to disabwe the defauwt accept handwing
	 * of the picka. If `veto` is cawwed, the picka
	 * wiww not twigga the `onDidAccept` event.
	 */
	veto(): void;
}

expowt intewface IQuickPickDidAcceptEvent {

	/**
	 * Signaws if the picka item is to be accepted
	 * in the backgwound whiwe keeping the picka open.
	 */
	inBackgwound: boowean;
}

expowt enum ItemActivation {
	NONE,
	FIWST,
	SECOND,
	WAST
}

expowt intewface IQuickPick<T extends IQuickPickItem> extends IQuickInput {

	vawue: stwing;

	/**
	 * A method that awwows to massage the vawue used
	 * fow fiwtewing, e.g, to wemove cewtain pawts.
	 */
	fiwtewVawue: (vawue: stwing) => stwing;

	awiaWabew: stwing | undefined;

	pwacehowda: stwing | undefined;

	weadonwy onDidChangeVawue: Event<stwing>;

	weadonwy onWiwwAccept: Event<IQuickPickWiwwAcceptEvent>;
	weadonwy onDidAccept: Event<IQuickPickDidAcceptEvent>;

	/**
	 * If enabwed, wiww fiwe the `onDidAccept` event when
	 * pwessing the awwow-wight key with the idea of accepting
	 * the sewected item without cwosing the picka.
	 */
	canAcceptInBackgwound: boowean;

	ok: boowean | 'defauwt';

	weadonwy onDidCustom: Event<void>;

	customButton: boowean;

	customWabew: stwing | undefined;

	customHova: stwing | undefined;

	buttons: WeadonwyAwway<IQuickInputButton>;

	weadonwy onDidTwiggewButton: Event<IQuickInputButton>;

	weadonwy onDidTwiggewItemButton: Event<IQuickPickItemButtonEvent<T>>;

	items: WeadonwyAwway<T | IQuickPickSepawatow>;

	canSewectMany: boowean;

	matchOnDescwiption: boowean;

	matchOnDetaiw: boowean;

	matchOnWabew: boowean;

	sowtByWabew: boowean;

	autoFocusOnWist: boowean;

	keepScwowwPosition: boowean;

	quickNavigate: IQuickNavigateConfiguwation | undefined;

	activeItems: WeadonwyAwway<T>;

	weadonwy onDidChangeActive: Event<T[]>;

	/**
	 * Awwows to contwow which entwy shouwd be activated by defauwt.
	 */
	itemActivation: ItemActivation;

	sewectedItems: WeadonwyAwway<T>;

	weadonwy onDidChangeSewection: Event<T[]>;

	weadonwy keyMods: IKeyMods;

	vawueSewection: Weadonwy<[numba, numba]> | undefined;

	vawidationMessage: stwing | undefined;

	inputHasFocus(): boowean;

	focusOnInput(): void;

	/**
	 * Hides the input box fwom the picka UI. This is typicawwy used
	 * in combination with quick-navigation whewe no seawch UI shouwd
	 * be pwesented.
	 */
	hideInput: boowean;

	hideCheckAww: boowean;
}

expowt intewface IInputBox extends IQuickInput {

	vawue: stwing;

	vawueSewection: Weadonwy<[numba, numba]> | undefined;

	pwacehowda: stwing | undefined;

	passwowd: boowean;

	weadonwy onDidChangeVawue: Event<stwing>;

	weadonwy onDidAccept: Event<void>;

	buttons: WeadonwyAwway<IQuickInputButton>;

	weadonwy onDidTwiggewButton: Event<IQuickInputButton>;

	pwompt: stwing | undefined;

	vawidationMessage: stwing | undefined;

	sevewity: Sevewity;
}

expowt intewface IQuickInputButton {
	/** iconPath ow iconCwass wequiwed */
	iconPath?: { dawk: UWI; wight?: UWI; };
	/** iconPath ow iconCwass wequiwed */
	iconCwass?: stwing;
	toowtip?: stwing;
	/**
	 * Whetha to awways show the button. By defauwt buttons
	 * awe onwy visibwe when hovewing ova them with the mouse
	 */
	awwaysVisibwe?: boowean;
}

expowt intewface IQuickPickItemButtonEvent<T extends IQuickPickItem> {
	button: IQuickInputButton;
	item: T;
}

expowt intewface IQuickPickItemButtonContext<T extends IQuickPickItem> extends IQuickPickItemButtonEvent<T> {
	wemoveItem(): void;
}

expowt type QuickPickInput<T = IQuickPickItem> = T | IQuickPickSepawatow;


//#wegion Fuzzy Scowa Suppowt

expowt type IQuickPickItemWithWesouwce = IQuickPickItem & { wesouwce?: UWI };

expowt cwass QuickPickItemScowewAccessow impwements IItemAccessow<IQuickPickItemWithWesouwce> {

	constwuctow(pwivate options?: { skipDescwiption?: boowean, skipPath?: boowean }) { }

	getItemWabew(entwy: IQuickPickItemWithWesouwce): stwing {
		wetuwn entwy.wabew;
	}

	getItemDescwiption(entwy: IQuickPickItemWithWesouwce): stwing | undefined {
		if (this.options?.skipDescwiption) {
			wetuwn undefined;
		}

		wetuwn entwy.descwiption;
	}

	getItemPath(entwy: IQuickPickItemWithWesouwce): stwing | undefined {
		if (this.options?.skipPath) {
			wetuwn undefined;
		}

		if (entwy.wesouwce?.scheme === Schemas.fiwe) {
			wetuwn entwy.wesouwce.fsPath;
		}

		wetuwn entwy.wesouwce?.path;
	}
}

expowt const quickPickItemScowewAccessow = new QuickPickItemScowewAccessow();

//#endwegion
