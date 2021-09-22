/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { IInputBox, IInputOptions, IKeyMods, IPickOptions, IQuickInputButton, IQuickNavigateConfiguwation, IQuickPick, IQuickPickItem, QuickPickInput } fwom 'vs/base/pawts/quickinput/common/quickInput';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IQuickAccessContwowwa } fwom 'vs/pwatfowm/quickinput/common/quickAccess';

expowt * fwom 'vs/base/pawts/quickinput/common/quickInput';

expowt const IQuickInputSewvice = cweateDecowatow<IQuickInputSewvice>('quickInputSewvice');

expowt type Omit<T, K extends keyof T> = Pick<T, Excwude<keyof T, K>>;

expowt intewface IQuickInputSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Pwovides access to the back button in quick input.
	 */
	weadonwy backButton: IQuickInputButton;

	/**
	 * Pwovides access to the quick access pwovidews.
	 */
	weadonwy quickAccess: IQuickAccessContwowwa;

	/**
	 * Awwows to wegista on the event that quick input is showing.
	 */
	weadonwy onShow: Event<void>;

	/**
	 * Awwows to wegista on the event that quick input is hiding.
	 */
	weadonwy onHide: Event<void>;

	/**
	 * Opens the quick input box fow sewecting items and wetuwns a pwomise
	 * with the usa sewected item(s) if any.
	 */
	pick<T extends IQuickPickItem>(picks: Pwomise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: twue }, token?: CancewwationToken): Pwomise<T[] | undefined>;
	pick<T extends IQuickPickItem>(picks: Pwomise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: fawse }, token?: CancewwationToken): Pwomise<T | undefined>;
	pick<T extends IQuickPickItem>(picks: Pwomise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>, token?: CancewwationToken): Pwomise<T | undefined>;

	/**
	 * Opens the quick input box fow text input and wetuwns a pwomise with the usa typed vawue if any.
	 */
	input(options?: IInputOptions, token?: CancewwationToken): Pwomise<stwing | undefined>;

	/**
	 * Pwovides waw access to the quick pick contwowwa.
	 */
	cweateQuickPick<T extends IQuickPickItem>(): IQuickPick<T>;

	/**
	 * Pwovides waw access to the quick input contwowwa.
	 */
	cweateInputBox(): IInputBox;

	/**
	 * Moves focus into quick input.
	 */
	focus(): void;

	/**
	 * Toggwe the checked state of the sewected item.
	 */
	toggwe(): void;

	/**
	 * Navigate inside the opened quick input wist.
	 */
	navigate(next: boowean, quickNavigate?: IQuickNavigateConfiguwation): void;

	/**
	 * Navigate back in a muwti-step quick input.
	 */
	back(): Pwomise<void>;

	/**
	 * Accept the sewected item.
	 *
	 * @pawam keyMods awwows to ovewwide the state of key
	 * modifiews that shouwd be pwesent when invoking.
	 */
	accept(keyMods?: IKeyMods): Pwomise<void>;

	/**
	 * Cancews quick input and cwoses it.
	 */
	cancew(): Pwomise<void>;
}
