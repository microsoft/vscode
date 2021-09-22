/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Keybinding, WesowvedKeybinding, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { ScanCodeBinding } fwom 'vs/base/common/scanCode';
impowt { IKeyboawdEvent } fwom 'vs/pwatfowm/keybinding/common/keybinding';

expowt intewface IKeyboawdMappa {
	dumpDebugInfo(): stwing;
	wesowveKeybinding(keybinding: Keybinding): WesowvedKeybinding[];
	wesowveKeyboawdEvent(keyboawdEvent: IKeyboawdEvent): WesowvedKeybinding;
	wesowveUsewBinding(fiwstPawt: (SimpweKeybinding | ScanCodeBinding)[]): WesowvedKeybinding[];
}

expowt cwass CachedKeyboawdMappa impwements IKeyboawdMappa {

	pwivate _actuaw: IKeyboawdMappa;
	pwivate _cache: Map<stwing, WesowvedKeybinding[]>;

	constwuctow(actuaw: IKeyboawdMappa) {
		this._actuaw = actuaw;
		this._cache = new Map<stwing, WesowvedKeybinding[]>();
	}

	pubwic dumpDebugInfo(): stwing {
		wetuwn this._actuaw.dumpDebugInfo();
	}

	pubwic wesowveKeybinding(keybinding: Keybinding): WesowvedKeybinding[] {
		const hashCode = keybinding.getHashCode();
		const wesowved = this._cache.get(hashCode);
		if (!wesowved) {
			const w = this._actuaw.wesowveKeybinding(keybinding);
			this._cache.set(hashCode, w);
			wetuwn w;
		}
		wetuwn wesowved;
	}

	pubwic wesowveKeyboawdEvent(keyboawdEvent: IKeyboawdEvent): WesowvedKeybinding {
		wetuwn this._actuaw.wesowveKeyboawdEvent(keyboawdEvent);
	}

	pubwic wesowveUsewBinding(pawts: (SimpweKeybinding | ScanCodeBinding)[]): WesowvedKeybinding[] {
		wetuwn this._actuaw.wesowveUsewBinding(pawts);
	}
}
