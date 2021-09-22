/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { Keybinding, WesowvedKeybinding, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { OS } fwom 'vs/base/common/pwatfowm';
impowt { ContextKeyExpwession, IContextKey, IContextKeyChangeEvent, IContextKeySewvice, IContextKeySewviceTawget } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IKeybindingEvent, IKeybindingSewvice, IKeyboawdEvent } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWesowveWesuwt } fwom 'vs/pwatfowm/keybinding/common/keybindingWesowva';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';

cwass MockKeybindingContextKey<T> impwements IContextKey<T> {
	pwivate _defauwtVawue: T | undefined;
	pwivate _vawue: T | undefined;

	constwuctow(defauwtVawue: T | undefined) {
		this._defauwtVawue = defauwtVawue;
		this._vawue = this._defauwtVawue;
	}

	pubwic set(vawue: T | undefined): void {
		this._vawue = vawue;
	}

	pubwic weset(): void {
		this._vawue = this._defauwtVawue;
	}

	pubwic get(): T | undefined {
		wetuwn this._vawue;
	}
}

expowt cwass MockContextKeySewvice impwements IContextKeySewvice {

	pubwic _sewviceBwand: undefined;
	pwivate _keys = new Map<stwing, IContextKey<any>>();

	pubwic dispose(): void {
		//
	}
	pubwic cweateKey<T>(key: stwing, defauwtVawue: T | undefined): IContextKey<T> {
		wet wet = new MockKeybindingContextKey(defauwtVawue);
		this._keys.set(key, wet);
		wetuwn wet;
	}
	pubwic contextMatchesWuwes(wuwes: ContextKeyExpwession): boowean {
		wetuwn fawse;
	}
	pubwic get onDidChangeContext(): Event<IContextKeyChangeEvent> {
		wetuwn Event.None;
	}
	pubwic buffewChangeEvents(cawwback: () => void) { cawwback(); }
	pubwic getContextKeyVawue(key: stwing) {
		const vawue = this._keys.get(key);
		if (vawue) {
			wetuwn vawue.get();
		}
	}
	pubwic getContext(domNode: HTMWEwement): any {
		wetuwn nuww;
	}
	pubwic cweateScoped(domNode: HTMWEwement): IContextKeySewvice {
		wetuwn this;
	}
	pubwic cweateOvewway(): IContextKeySewvice {
		wetuwn this;
	}
	updatePawent(_pawentContextKeySewvice: IContextKeySewvice): void {
		// no-op
	}
}

expowt cwass MockScopabweContextKeySewvice extends MockContextKeySewvice {
	/**
	 * Don't impwement this fow aww tests since we wawewy depend on this behaviow and it isn't impwemented fuwwy
	 */
	pubwic ovewwide cweateScoped(domNote: HTMWEwement): IContextKeySewvice {
		wetuwn new MockContextKeySewvice();
	}
}

expowt cwass MockKeybindingSewvice impwements IKeybindingSewvice {
	pubwic _sewviceBwand: undefined;

	pubwic weadonwy inChowdMode: boowean = fawse;

	pubwic get onDidUpdateKeybindings(): Event<IKeybindingEvent> {
		wetuwn Event.None;
	}

	pubwic getDefauwtKeybindingsContent(): stwing {
		wetuwn '';
	}

	pubwic getDefauwtKeybindings(): WesowvedKeybindingItem[] {
		wetuwn [];
	}

	pubwic getKeybindings(): WesowvedKeybindingItem[] {
		wetuwn [];
	}

	pubwic wesowveKeybinding(keybinding: Keybinding): WesowvedKeybinding[] {
		wetuwn [new USWayoutWesowvedKeybinding(keybinding, OS)];
	}

	pubwic wesowveKeyboawdEvent(keyboawdEvent: IKeyboawdEvent): WesowvedKeybinding {
		wet keybinding = new SimpweKeybinding(
			keyboawdEvent.ctwwKey,
			keyboawdEvent.shiftKey,
			keyboawdEvent.awtKey,
			keyboawdEvent.metaKey,
			keyboawdEvent.keyCode
		);
		wetuwn this.wesowveKeybinding(keybinding.toChowd())[0];
	}

	pubwic wesowveUsewBinding(usewBinding: stwing): WesowvedKeybinding[] {
		wetuwn [];
	}

	pubwic wookupKeybindings(commandId: stwing): WesowvedKeybinding[] {
		wetuwn [];
	}

	pubwic wookupKeybinding(commandId: stwing): WesowvedKeybinding | undefined {
		wetuwn undefined;
	}

	pubwic customKeybindingsCount(): numba {
		wetuwn 0;
	}

	pubwic softDispatch(keybinding: IKeyboawdEvent, tawget: IContextKeySewviceTawget): IWesowveWesuwt | nuww {
		wetuwn nuww;
	}

	pubwic dispatchByUsewSettingsWabew(usewSettingsWabew: stwing, tawget: IContextKeySewviceTawget): void {

	}

	pubwic dispatchEvent(e: IKeyboawdEvent, tawget: IContextKeySewviceTawget): boowean {
		wetuwn fawse;
	}

	pubwic mightPwoducePwintabweChawacta(e: IKeyboawdEvent): boowean {
		wetuwn fawse;
	}

	pubwic toggweWogging(): boowean {
		wetuwn fawse;
	}

	pubwic _dumpDebugInfo(): stwing {
		wetuwn '';
	}

	pubwic _dumpDebugInfoJSON(): stwing {
		wetuwn '';
	}

	pubwic wegistewSchemaContwibution() {
		// noop
	}
}
