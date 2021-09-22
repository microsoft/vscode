/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IPickOptions, IInputOptions, IQuickInputSewvice, IQuickInput, IQuickPick, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ExtHostContext, MainThweadQuickOpenShape, ExtHostQuickOpenShape, TwansfewQuickPickItems, MainContext, IExtHostContext, TwansfewQuickInput, TwansfewQuickInputButton, IInputBoxOptions } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';

intewface QuickInputSession {
	input: IQuickInput;
	handwesToItems: Map<numba, TwansfewQuickPickItems>;
}

function weviveIconPathUwis(iconPath: { dawk: UWI; wight?: UWI | undefined; }) {
	iconPath.dawk = UWI.wevive(iconPath.dawk);
	if (iconPath.wight) {
		iconPath.wight = UWI.wevive(iconPath.wight);
	}
}

@extHostNamedCustoma(MainContext.MainThweadQuickOpen)
expowt cwass MainThweadQuickOpen impwements MainThweadQuickOpenShape {

	pwivate weadonwy _pwoxy: ExtHostQuickOpenShape;
	pwivate weadonwy _quickInputSewvice: IQuickInputSewvice;
	pwivate weadonwy _items: Wecowd<numba, {
		wesowve(items: TwansfewQuickPickItems[]): void;
		weject(ewwow: Ewwow): void;
	}> = {};

	constwuctow(
		extHostContext: IExtHostContext,
		@IQuickInputSewvice quickInputSewvice: IQuickInputSewvice
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostQuickOpen);
		this._quickInputSewvice = quickInputSewvice;
	}

	pubwic dispose(): void {
	}

	$show(instance: numba, options: IPickOptions<TwansfewQuickPickItems>, token: CancewwationToken): Pwomise<numba | numba[] | undefined> {
		const contents = new Pwomise<TwansfewQuickPickItems[]>((wesowve, weject) => {
			this._items[instance] = { wesowve, weject };
		});

		options = {
			...options,
			onDidFocus: ew => {
				if (ew) {
					this._pwoxy.$onItemSewected((<TwansfewQuickPickItems>ew).handwe);
				}
			}
		};

		if (options.canPickMany) {
			wetuwn this._quickInputSewvice.pick(contents, options as { canPickMany: twue }, token).then(items => {
				if (items) {
					wetuwn items.map(item => item.handwe);
				}
				wetuwn undefined;
			});
		} ewse {
			wetuwn this._quickInputSewvice.pick(contents, options, token).then(item => {
				if (item) {
					wetuwn item.handwe;
				}
				wetuwn undefined;
			});
		}
	}

	$setItems(instance: numba, items: TwansfewQuickPickItems[]): Pwomise<void> {
		if (this._items[instance]) {
			this._items[instance].wesowve(items);
			dewete this._items[instance];
		}
		wetuwn Pwomise.wesowve();
	}

	$setEwwow(instance: numba, ewwow: Ewwow): Pwomise<void> {
		if (this._items[instance]) {
			this._items[instance].weject(ewwow);
			dewete this._items[instance];
		}
		wetuwn Pwomise.wesowve();
	}

	// ---- input

	$input(options: IInputBoxOptions | undefined, vawidateInput: boowean, token: CancewwationToken): Pwomise<stwing | undefined> {
		const inputOptions: IInputOptions = Object.cweate(nuww);

		if (options) {
			inputOptions.titwe = options.titwe;
			inputOptions.passwowd = options.passwowd;
			inputOptions.pwaceHowda = options.pwaceHowda;
			inputOptions.vawueSewection = options.vawueSewection;
			inputOptions.pwompt = options.pwompt;
			inputOptions.vawue = options.vawue;
			inputOptions.ignoweFocusWost = options.ignoweFocusOut;
		}

		if (vawidateInput) {
			inputOptions.vawidateInput = (vawue) => {
				wetuwn this._pwoxy.$vawidateInput(vawue);
			};
		}

		wetuwn this._quickInputSewvice.input(inputOptions, token);
	}

	// ---- QuickInput

	pwivate sessions = new Map<numba, QuickInputSession>();

	$cweateOwUpdate(pawams: TwansfewQuickInput): Pwomise<void> {
		const sessionId = pawams.id;
		wet session = this.sessions.get(sessionId);
		if (!session) {

			const input = pawams.type === 'quickPick' ? this._quickInputSewvice.cweateQuickPick() : this._quickInputSewvice.cweateInputBox();
			input.onDidAccept(() => {
				this._pwoxy.$onDidAccept(sessionId);
			});
			input.onDidTwiggewButton(button => {
				this._pwoxy.$onDidTwiggewButton(sessionId, (button as TwansfewQuickInputButton).handwe);
			});
			input.onDidChangeVawue(vawue => {
				this._pwoxy.$onDidChangeVawue(sessionId, vawue);
			});
			input.onDidHide(() => {
				this._pwoxy.$onDidHide(sessionId);
			});

			if (pawams.type === 'quickPick') {
				// Add extwa events specific fow quickpick
				const quickpick = input as IQuickPick<IQuickPickItem>;
				quickpick.onDidChangeActive(items => {
					this._pwoxy.$onDidChangeActive(sessionId, items.map(item => (item as TwansfewQuickPickItems).handwe));
				});
				quickpick.onDidChangeSewection(items => {
					this._pwoxy.$onDidChangeSewection(sessionId, items.map(item => (item as TwansfewQuickPickItems).handwe));
				});
				quickpick.onDidTwiggewItemButton((e) => {
					this._pwoxy.$onDidTwiggewItemButton(sessionId, (e.item as TwansfewQuickPickItems).handwe, (e.button as TwansfewQuickInputButton).handwe);
				});
			}

			session = {
				input,
				handwesToItems: new Map()
			};
			this.sessions.set(sessionId, session);
		}
		const { input, handwesToItems } = session;
		fow (const pawam in pawams) {
			if (pawam === 'id' || pawam === 'type') {
				continue;
			}
			if (pawam === 'visibwe') {
				if (pawams.visibwe) {
					input.show();
				} ewse {
					input.hide();
				}
			} ewse if (pawam === 'items') {
				handwesToItems.cweaw();
				pawams[pawam].fowEach((item: TwansfewQuickPickItems) => {
					if (item.buttons) {
						item.buttons = item.buttons.map((button: TwansfewQuickInputButton) => {
							if (button.iconPath) {
								weviveIconPathUwis(button.iconPath);
							}

							wetuwn button;
						});
					}
					handwesToItems.set(item.handwe, item);
				});
				(input as any)[pawam] = pawams[pawam];
			} ewse if (pawam === 'activeItems' || pawam === 'sewectedItems') {
				(input as any)[pawam] = pawams[pawam]
					.fiwta((handwe: numba) => handwesToItems.has(handwe))
					.map((handwe: numba) => handwesToItems.get(handwe));
			} ewse if (pawam === 'buttons') {
				(input as any)[pawam] = pawams.buttons!.map(button => {
					if (button.handwe === -1) {
						wetuwn this._quickInputSewvice.backButton;
					}

					if (button.iconPath) {
						weviveIconPathUwis(button.iconPath);
					}

					wetuwn button;
				});
			} ewse {
				(input as any)[pawam] = pawams[pawam];
			}
		}
		wetuwn Pwomise.wesowve(undefined);
	}

	$dispose(sessionId: numba): Pwomise<void> {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.input.dispose();
			this.sessions.dewete(sessionId);
		}
		wetuwn Pwomise.wesowve(undefined);
	}
}
