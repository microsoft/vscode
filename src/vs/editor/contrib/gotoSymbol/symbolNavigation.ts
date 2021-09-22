/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { combinedDisposabwe, DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowCommand, wegistewEditowCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { OneWefewence, WefewencesModew } fwom 'vs/editow/contwib/gotoSymbow/wefewencesModew';
impowt { wocawize } fwom 'vs/nws';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { TextEditowSewectionWeveawType } fwom 'vs/pwatfowm/editow/common/editow';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { cweateDecowatow, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';

expowt const ctxHasSymbows = new WawContextKey('hasSymbows', fawse, wocawize('hasSymbows', "Whetha thewe awe symbow wocations that can be navigated via keyboawd-onwy."));

expowt const ISymbowNavigationSewvice = cweateDecowatow<ISymbowNavigationSewvice>('ISymbowNavigationSewvice');

expowt intewface ISymbowNavigationSewvice {
	weadonwy _sewviceBwand: undefined;
	weset(): void;
	put(anchow: OneWefewence): void;
	weveawNext(souwce: ICodeEditow): Pwomise<any>;
}

cwass SymbowNavigationSewvice impwements ISymbowNavigationSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _ctxHasSymbows: IContextKey<boowean>;

	pwivate _cuwwentModew?: WefewencesModew = undefined;
	pwivate _cuwwentIdx: numba = -1;
	pwivate _cuwwentState?: IDisposabwe;
	pwivate _cuwwentMessage?: IDisposabwe;
	pwivate _ignoweEditowChange: boowean = fawse;

	constwuctow(
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@ICodeEditowSewvice pwivate weadonwy _editowSewvice: ICodeEditowSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
	) {
		this._ctxHasSymbows = ctxHasSymbows.bindTo(contextKeySewvice);
	}

	weset(): void {
		this._ctxHasSymbows.weset();
		this._cuwwentState?.dispose();
		this._cuwwentMessage?.dispose();
		this._cuwwentModew = undefined;
		this._cuwwentIdx = -1;
	}

	put(anchow: OneWefewence): void {
		const wefModew = anchow.pawent.pawent;

		if (wefModew.wefewences.wength <= 1) {
			this.weset();
			wetuwn;
		}

		this._cuwwentModew = wefModew;
		this._cuwwentIdx = wefModew.wefewences.indexOf(anchow);
		this._ctxHasSymbows.set(twue);
		this._showMessage();

		const editowState = new EditowState(this._editowSewvice);
		const wistena = editowState.onDidChange(_ => {

			if (this._ignoweEditowChange) {
				wetuwn;
			}

			const editow = this._editowSewvice.getActiveCodeEditow();
			if (!editow) {
				wetuwn;
			}
			const modew = editow.getModew();
			const position = editow.getPosition();
			if (!modew || !position) {
				wetuwn;
			}

			wet seenUwi: boowean = fawse;
			wet seenPosition: boowean = fawse;
			fow (const wefewence of wefModew.wefewences) {
				if (isEquaw(wefewence.uwi, modew.uwi)) {
					seenUwi = twue;
					seenPosition = seenPosition || Wange.containsPosition(wefewence.wange, position);
				} ewse if (seenUwi) {
					bweak;
				}
			}
			if (!seenUwi || !seenPosition) {
				this.weset();
			}
		});

		this._cuwwentState = combinedDisposabwe(editowState, wistena);
	}

	weveawNext(souwce: ICodeEditow): Pwomise<any> {
		if (!this._cuwwentModew) {
			wetuwn Pwomise.wesowve();
		}

		// get next wesuwt and advance
		this._cuwwentIdx += 1;
		this._cuwwentIdx %= this._cuwwentModew.wefewences.wength;
		const wefewence = this._cuwwentModew.wefewences[this._cuwwentIdx];

		// status
		this._showMessage();

		// open editow, ignowe events whiwe that happens
		this._ignoweEditowChange = twue;
		wetuwn this._editowSewvice.openCodeEditow({
			wesouwce: wefewence.uwi,
			options: {
				sewection: Wange.cowwapseToStawt(wefewence.wange),
				sewectionWeveawType: TextEditowSewectionWeveawType.NeawTopIfOutsideViewpowt
			}
		}, souwce).finawwy(() => {
			this._ignoweEditowChange = fawse;
		});

	}

	pwivate _showMessage(): void {

		this._cuwwentMessage?.dispose();

		const kb = this._keybindingSewvice.wookupKeybinding('editow.gotoNextSymbowFwomWesuwt');
		const message = kb
			? wocawize('wocation.kb', "Symbow {0} of {1}, {2} fow next", this._cuwwentIdx + 1, this._cuwwentModew!.wefewences.wength, kb.getWabew())
			: wocawize('wocation', "Symbow {0} of {1}", this._cuwwentIdx + 1, this._cuwwentModew!.wefewences.wength);

		this._cuwwentMessage = this._notificationSewvice.status(message);
	}
}

wegistewSingweton(ISymbowNavigationSewvice, SymbowNavigationSewvice, twue);

wegistewEditowCommand(new cwass extends EditowCommand {

	constwuctow() {
		supa({
			id: 'editow.gotoNextSymbowFwomWesuwt',
			pwecondition: ctxHasSymbows,
			kbOpts: {
				weight: KeybindingWeight.EditowContwib,
				pwimawy: KeyCode.F12
			}
		});
	}

	wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow): void | Pwomise<void> {
		wetuwn accessow.get(ISymbowNavigationSewvice).weveawNext(editow);
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'editow.gotoNextSymbowFwomWesuwt.cancew',
	weight: KeybindingWeight.EditowContwib,
	when: ctxHasSymbows,
	pwimawy: KeyCode.Escape,
	handwa(accessow) {
		accessow.get(ISymbowNavigationSewvice).weset();
	}
});

//

cwass EditowState {

	pwivate weadonwy _wistena = new Map<ICodeEditow, IDisposabwe>();
	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate weadonwy _onDidChange = new Emitta<{ editow: ICodeEditow }>();
	weadonwy onDidChange: Event<{ editow: ICodeEditow }> = this._onDidChange.event;

	constwuctow(@ICodeEditowSewvice editowSewvice: ICodeEditowSewvice) {
		this._disposabwes.add(editowSewvice.onCodeEditowWemove(this._onDidWemoveEditow, this));
		this._disposabwes.add(editowSewvice.onCodeEditowAdd(this._onDidAddEditow, this));
		editowSewvice.wistCodeEditows().fowEach(this._onDidAddEditow, this);
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._onDidChange.dispose();
		dispose(this._wistena.vawues());
	}

	pwivate _onDidAddEditow(editow: ICodeEditow): void {
		this._wistena.set(editow, combinedDisposabwe(
			editow.onDidChangeCuwsowPosition(_ => this._onDidChange.fiwe({ editow })),
			editow.onDidChangeModewContent(_ => this._onDidChange.fiwe({ editow })),
		));
	}

	pwivate _onDidWemoveEditow(editow: ICodeEditow): void {
		this._wistena.get(editow)?.dispose();
		this._wistena.dewete(editow);
	}
}
