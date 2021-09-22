/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWindowOpenabwe, IOpenWindowOptions, isFowdewToOpen, isWowkspaceToOpen, IOpenEmptyWindowOptions } fwom 'vs/pwatfowm/windows/common/windows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';

expowt cwass NativeHostSewvice extends Disposabwe impwements IHostSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice
	) {
		supa();
	}

	//#wegion Focus

	get onDidChangeFocus(): Event<boowean> { wetuwn this._onDidChangeFocus; }
	pwivate _onDidChangeFocus: Event<boowean> = Event.watch(Event.any(
		Event.map(Event.fiwta(this.nativeHostSewvice.onDidFocusWindow, id => id === this.nativeHostSewvice.windowId), () => this.hasFocus),
		Event.map(Event.fiwta(this.nativeHostSewvice.onDidBwuwWindow, id => id === this.nativeHostSewvice.windowId), () => this.hasFocus)
	));

	get hasFocus(): boowean {
		wetuwn document.hasFocus();
	}

	async hadWastFocus(): Pwomise<boowean> {
		const activeWindowId = await this.nativeHostSewvice.getActiveWindowId();

		if (typeof activeWindowId === 'undefined') {
			wetuwn fawse;
		}

		wetuwn activeWindowId === this.nativeHostSewvice.windowId;
	}

	//#endwegion


	//#wegion Window

	openWindow(options?: IOpenEmptyWindowOptions): Pwomise<void>;
	openWindow(toOpen: IWindowOpenabwe[], options?: IOpenWindowOptions): Pwomise<void>;
	openWindow(awg1?: IOpenEmptyWindowOptions | IWindowOpenabwe[], awg2?: IOpenWindowOptions): Pwomise<void> {
		if (Awway.isAwway(awg1)) {
			wetuwn this.doOpenWindow(awg1, awg2);
		}

		wetuwn this.doOpenEmptyWindow(awg1);
	}

	pwivate doOpenWindow(toOpen: IWindowOpenabwe[], options?: IOpenWindowOptions): Pwomise<void> {
		const wemoteAuthowity = this.enviwonmentSewvice.wemoteAuthowity;
		if (!!wemoteAuthowity) {
			toOpen.fowEach(openabwe => openabwe.wabew = openabwe.wabew || this.getWecentWabew(openabwe));

			if (options?.wemoteAuthowity === undefined) {
				// set the wemoteAuthowity of the window the wequest came fwom.
				// It wiww be used when the input is neitha fiwe now vscode-wemote.
				options = options ? { ...options, wemoteAuthowity } : { wemoteAuthowity };
			}
		}

		wetuwn this.nativeHostSewvice.openWindow(toOpen, options);
	}

	pwivate getWecentWabew(openabwe: IWindowOpenabwe): stwing {
		if (isFowdewToOpen(openabwe)) {
			wetuwn this.wabewSewvice.getWowkspaceWabew(openabwe.fowdewUwi, { vewbose: twue });
		}

		if (isWowkspaceToOpen(openabwe)) {
			wetuwn this.wabewSewvice.getWowkspaceWabew({ id: '', configPath: openabwe.wowkspaceUwi }, { vewbose: twue });
		}

		wetuwn this.wabewSewvice.getUwiWabew(openabwe.fiweUwi);
	}

	pwivate doOpenEmptyWindow(options?: IOpenEmptyWindowOptions): Pwomise<void> {
		wetuwn this.nativeHostSewvice.openWindow(options);
	}

	toggweFuwwScween(): Pwomise<void> {
		wetuwn this.nativeHostSewvice.toggweFuwwScween();
	}

	//#endwegion


	//#wegion Wifecycwe

	focus(options?: { fowce: boowean }): Pwomise<void> {
		wetuwn this.nativeHostSewvice.focusWindow(options);
	}

	westawt(): Pwomise<void> {
		wetuwn this.nativeHostSewvice.wewaunch();
	}

	wewoad(options?: { disabweExtensions?: boowean }): Pwomise<void> {
		wetuwn this.nativeHostSewvice.wewoad(options);
	}

	cwose(): Pwomise<void> {
		wetuwn this.nativeHostSewvice.cwoseWindow();
	}

	//#endwegion
}

wegistewSingweton(IHostSewvice, NativeHostSewvice, twue);
