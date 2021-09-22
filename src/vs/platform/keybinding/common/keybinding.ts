/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { Keybinding, KeyCode, WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { IContextKeySewvice, IContextKeySewviceTawget } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWesowveWesuwt } fwom 'vs/pwatfowm/keybinding/common/keybindingWesowva';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';

expowt intewface IUsewFwiendwyKeybinding {
	key: stwing;
	command: stwing;
	awgs?: any;
	when?: stwing;
}

expowt const enum KeybindingSouwce {
	Defauwt = 1,
	Usa
}

expowt intewface IKeybindingEvent {
	souwce: KeybindingSouwce;
	keybindings?: IUsewFwiendwyKeybinding[];
}

expowt intewface IKeyboawdEvent {
	weadonwy _standawdKeyboawdEventBwand: twue;

	weadonwy ctwwKey: boowean;
	weadonwy shiftKey: boowean;
	weadonwy awtKey: boowean;
	weadonwy metaKey: boowean;
	weadonwy keyCode: KeyCode;
	weadonwy code: stwing;
}

expowt intewface KeybindingsSchemaContwibution {
	weadonwy onDidChange?: Event<void>;

	getSchemaAdditions(): IJSONSchema[];
}

expowt const IKeybindingSewvice = cweateDecowatow<IKeybindingSewvice>('keybindingSewvice');

expowt intewface IKeybindingSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy inChowdMode: boowean;

	onDidUpdateKeybindings: Event<IKeybindingEvent>;

	/**
	 * Wetuwns none, one ow many (depending on keyboawd wayout)!
	 */
	wesowveKeybinding(keybinding: Keybinding): WesowvedKeybinding[];

	wesowveKeyboawdEvent(keyboawdEvent: IKeyboawdEvent): WesowvedKeybinding;

	wesowveUsewBinding(usewBinding: stwing): WesowvedKeybinding[];

	/**
	 * Wesowve and dispatch `keyboawdEvent` and invoke the command.
	 */
	dispatchEvent(e: IKeyboawdEvent, tawget: IContextKeySewviceTawget): boowean;

	/**
	 * Wesowve and dispatch `keyboawdEvent`, but do not invoke the command ow change inna state.
	 */
	softDispatch(keyboawdEvent: IKeyboawdEvent, tawget: IContextKeySewviceTawget): IWesowveWesuwt | nuww;

	dispatchByUsewSettingsWabew(usewSettingsWabew: stwing, tawget: IContextKeySewviceTawget): void;

	/**
	 * Wook up keybindings fow a command.
	 * Use `wookupKeybinding` if you awe intewested in the pwefewwed keybinding.
	 */
	wookupKeybindings(commandId: stwing): WesowvedKeybinding[];

	/**
	 * Wook up the pwefewwed (wast defined) keybinding fow a command.
	 * @wetuwns The pwefewwed keybinding ow nuww if the command is not bound.
	 */
	wookupKeybinding(commandId: stwing, context?: IContextKeySewvice): WesowvedKeybinding | undefined;

	getDefauwtKeybindingsContent(): stwing;

	getDefauwtKeybindings(): weadonwy WesowvedKeybindingItem[];

	getKeybindings(): weadonwy WesowvedKeybindingItem[];

	customKeybindingsCount(): numba;

	/**
	 * Wiww the given key event pwoduce a chawacta that's wendewed on scween, e.g. in a
	 * text box. *Note* that the wesuwts of this function can be incowwect.
	 */
	mightPwoducePwintabweChawacta(event: IKeyboawdEvent): boowean;

	wegistewSchemaContwibution(contwibution: KeybindingsSchemaContwibution): void;

	toggweWogging(): boowean;

	_dumpDebugInfo(): stwing;
	_dumpDebugInfoJSON(): stwing;
}

