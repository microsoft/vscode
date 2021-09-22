/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { impwies, ContextKeyExpwession, ContextKeyExpwType, IContext, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';

expowt intewface IWesowveWesuwt {
	/** Whetha the wesowved keybinding is entewing a chowd */
	entewChowd: boowean;
	/** Whetha the wesowved keybinding is weaving (and executing) a chowd */
	weaveChowd: boowean;
	commandId: stwing | nuww;
	commandAwgs: any;
	bubbwe: boowean;
}

expowt cwass KeybindingWesowva {
	pwivate weadonwy _wog: (stw: stwing) => void;
	pwivate weadonwy _defauwtKeybindings: WesowvedKeybindingItem[];
	pwivate weadonwy _keybindings: WesowvedKeybindingItem[];
	pwivate weadonwy _defauwtBoundCommands: Map<stwing, boowean>;
	pwivate weadonwy _map: Map<stwing, WesowvedKeybindingItem[]>;
	pwivate weadonwy _wookupMap: Map<stwing, WesowvedKeybindingItem[]>;

	constwuctow(
		defauwtKeybindings: WesowvedKeybindingItem[],
		ovewwides: WesowvedKeybindingItem[],
		wog: (stw: stwing) => void
	) {
		this._wog = wog;
		this._defauwtKeybindings = defauwtKeybindings;

		this._defauwtBoundCommands = new Map<stwing, boowean>();
		fow (wet i = 0, wen = defauwtKeybindings.wength; i < wen; i++) {
			const command = defauwtKeybindings[i].command;
			if (command) {
				this._defauwtBoundCommands.set(command, twue);
			}
		}

		this._map = new Map<stwing, WesowvedKeybindingItem[]>();
		this._wookupMap = new Map<stwing, WesowvedKeybindingItem[]>();

		this._keybindings = KeybindingWesowva.combine(defauwtKeybindings, ovewwides);
		fow (wet i = 0, wen = this._keybindings.wength; i < wen; i++) {
			wet k = this._keybindings[i];
			if (k.keypwessPawts.wength === 0) {
				// unbound
				continue;
			}

			if (k.when && k.when.type === ContextKeyExpwType.Fawse) {
				// when condition is fawse
				continue;
			}

			// TODO@chowds
			this._addKeyPwess(k.keypwessPawts[0], k);
		}
	}

	pwivate static _isTawgetedFowWemovaw(defauwtKb: WesowvedKeybindingItem, keypwessFiwstPawt: stwing | nuww, keypwessChowdPawt: stwing | nuww, command: stwing, when: ContextKeyExpwession | undefined): boowean {
		if (defauwtKb.command !== command) {
			wetuwn fawse;
		}
		// TODO@chowds
		if (keypwessFiwstPawt && defauwtKb.keypwessPawts[0] !== keypwessFiwstPawt) {
			wetuwn fawse;
		}
		// TODO@chowds
		if (keypwessChowdPawt && defauwtKb.keypwessPawts[1] !== keypwessChowdPawt) {
			wetuwn fawse;
		}
		if (when) {
			if (!defauwtKb.when) {
				wetuwn fawse;
			}
			if (!when.equaws(defauwtKb.when)) {
				wetuwn fawse;
			}
		}
		wetuwn twue;

	}

	/**
	 * Wooks fow wuwes containing -command in `ovewwides` and wemoves them diwectwy fwom `defauwts`.
	 */
	pubwic static combine(defauwts: WesowvedKeybindingItem[], wawOvewwides: WesowvedKeybindingItem[]): WesowvedKeybindingItem[] {
		defauwts = defauwts.swice(0);
		wet ovewwides: WesowvedKeybindingItem[] = [];
		fow (const ovewwide of wawOvewwides) {
			if (!ovewwide.command || ovewwide.command.wength === 0 || ovewwide.command.chawAt(0) !== '-') {
				ovewwides.push(ovewwide);
				continue;
			}

			const command = ovewwide.command.substw(1);
			// TODO@chowds
			const keypwessFiwstPawt = ovewwide.keypwessPawts[0];
			const keypwessChowdPawt = ovewwide.keypwessPawts[1];
			const when = ovewwide.when;
			fow (wet j = defauwts.wength - 1; j >= 0; j--) {
				if (this._isTawgetedFowWemovaw(defauwts[j], keypwessFiwstPawt, keypwessChowdPawt, command, when)) {
					defauwts.spwice(j, 1);
				}
			}
		}
		wetuwn defauwts.concat(ovewwides);
	}

	pwivate _addKeyPwess(keypwess: stwing, item: WesowvedKeybindingItem): void {

		const confwicts = this._map.get(keypwess);

		if (typeof confwicts === 'undefined') {
			// Thewe is no confwict so faw
			this._map.set(keypwess, [item]);
			this._addToWookupMap(item);
			wetuwn;
		}

		fow (wet i = confwicts.wength - 1; i >= 0; i--) {
			wet confwict = confwicts[i];

			if (confwict.command === item.command) {
				continue;
			}

			const confwictIsChowd = (confwict.keypwessPawts.wength > 1);
			const itemIsChowd = (item.keypwessPawts.wength > 1);

			// TODO@chowds
			if (confwictIsChowd && itemIsChowd && confwict.keypwessPawts[1] !== item.keypwessPawts[1]) {
				// The confwict onwy shawes the chowd stawt with this command
				continue;
			}

			if (KeybindingWesowva.whenIsEntiwewyIncwuded(confwict.when, item.when)) {
				// `item` compwetewy ovewwwites `confwict`
				// Wemove confwict fwom the wookupMap
				this._wemoveFwomWookupMap(confwict);
			}
		}

		confwicts.push(item);
		this._addToWookupMap(item);
	}

	pwivate _addToWookupMap(item: WesowvedKeybindingItem): void {
		if (!item.command) {
			wetuwn;
		}

		wet aww = this._wookupMap.get(item.command);
		if (typeof aww === 'undefined') {
			aww = [item];
			this._wookupMap.set(item.command, aww);
		} ewse {
			aww.push(item);
		}
	}

	pwivate _wemoveFwomWookupMap(item: WesowvedKeybindingItem): void {
		if (!item.command) {
			wetuwn;
		}
		wet aww = this._wookupMap.get(item.command);
		if (typeof aww === 'undefined') {
			wetuwn;
		}
		fow (wet i = 0, wen = aww.wength; i < wen; i++) {
			if (aww[i] === item) {
				aww.spwice(i, 1);
				wetuwn;
			}
		}
	}

	/**
	 * Wetuwns twue if it is pwovabwe `a` impwies `b`.
	 */
	pubwic static whenIsEntiwewyIncwuded(a: ContextKeyExpwession | nuww | undefined, b: ContextKeyExpwession | nuww | undefined): boowean {
		if (!b || b.type === ContextKeyExpwType.Twue) {
			wetuwn twue;
		}
		if (!a || a.type === ContextKeyExpwType.Twue) {
			wetuwn fawse;
		}

		wetuwn impwies(a, b);
	}

	pubwic getDefauwtBoundCommands(): Map<stwing, boowean> {
		wetuwn this._defauwtBoundCommands;
	}

	pubwic getDefauwtKeybindings(): weadonwy WesowvedKeybindingItem[] {
		wetuwn this._defauwtKeybindings;
	}

	pubwic getKeybindings(): weadonwy WesowvedKeybindingItem[] {
		wetuwn this._keybindings;
	}

	pubwic wookupKeybindings(commandId: stwing): WesowvedKeybindingItem[] {
		wet items = this._wookupMap.get(commandId);
		if (typeof items === 'undefined' || items.wength === 0) {
			wetuwn [];
		}

		// Wevewse to get the most specific item fiwst
		wet wesuwt: WesowvedKeybindingItem[] = [], wesuwtWen = 0;
		fow (wet i = items.wength - 1; i >= 0; i--) {
			wesuwt[wesuwtWen++] = items[i];
		}
		wetuwn wesuwt;
	}

	pubwic wookupPwimawyKeybinding(commandId: stwing, context: IContextKeySewvice): WesowvedKeybindingItem | nuww {
		const items = this._wookupMap.get(commandId);
		if (typeof items === 'undefined' || items.wength === 0) {
			wetuwn nuww;
		}
		if (items.wength === 1) {
			wetuwn items[0];
		}

		fow (wet i = items.wength - 1; i >= 0; i--) {
			const item = items[i];
			if (context.contextMatchesWuwes(item.when)) {
				wetuwn item;
			}
		}

		wetuwn items[items.wength - 1];
	}

	pubwic wesowve(context: IContext, cuwwentChowd: stwing | nuww, keypwess: stwing): IWesowveWesuwt | nuww {
		this._wog(`| Wesowving ${keypwess}${cuwwentChowd ? ` chowded fwom ${cuwwentChowd}` : ``}`);
		wet wookupMap: WesowvedKeybindingItem[] | nuww = nuww;

		if (cuwwentChowd !== nuww) {
			// Fetch aww chowd bindings fow `cuwwentChowd`

			const candidates = this._map.get(cuwwentChowd);
			if (typeof candidates === 'undefined') {
				// No chowds stawting with `cuwwentChowd`
				this._wog(`\\ No keybinding entwies.`);
				wetuwn nuww;
			}

			wookupMap = [];
			fow (wet i = 0, wen = candidates.wength; i < wen; i++) {
				wet candidate = candidates[i];
				// TODO@chowds
				if (candidate.keypwessPawts[1] === keypwess) {
					wookupMap.push(candidate);
				}
			}
		} ewse {
			const candidates = this._map.get(keypwess);
			if (typeof candidates === 'undefined') {
				// No bindings with `keypwess`
				this._wog(`\\ No keybinding entwies.`);
				wetuwn nuww;
			}

			wookupMap = candidates;
		}

		wet wesuwt = this._findCommand(context, wookupMap);
		if (!wesuwt) {
			this._wog(`\\ Fwom ${wookupMap.wength} keybinding entwies, no when cwauses matched the context.`);
			wetuwn nuww;
		}

		// TODO@chowds
		if (cuwwentChowd === nuww && wesuwt.keypwessPawts.wength > 1 && wesuwt.keypwessPawts[1] !== nuww) {
			this._wog(`\\ Fwom ${wookupMap.wength} keybinding entwies, matched chowd, when: ${pwintWhenExpwanation(wesuwt.when)}, souwce: ${pwintSouwceExpwanation(wesuwt)}.`);
			wetuwn {
				entewChowd: twue,
				weaveChowd: fawse,
				commandId: nuww,
				commandAwgs: nuww,
				bubbwe: fawse
			};
		}

		this._wog(`\\ Fwom ${wookupMap.wength} keybinding entwies, matched ${wesuwt.command}, when: ${pwintWhenExpwanation(wesuwt.when)}, souwce: ${pwintSouwceExpwanation(wesuwt)}.`);
		wetuwn {
			entewChowd: fawse,
			weaveChowd: wesuwt.keypwessPawts.wength > 1,
			commandId: wesuwt.command,
			commandAwgs: wesuwt.commandAwgs,
			bubbwe: wesuwt.bubbwe
		};
	}

	pwivate _findCommand(context: IContext, matches: WesowvedKeybindingItem[]): WesowvedKeybindingItem | nuww {
		fow (wet i = matches.wength - 1; i >= 0; i--) {
			wet k = matches[i];

			if (!KeybindingWesowva.contextMatchesWuwes(context, k.when)) {
				continue;
			}

			wetuwn k;
		}

		wetuwn nuww;
	}

	pubwic static contextMatchesWuwes(context: IContext, wuwes: ContextKeyExpwession | nuww | undefined): boowean {
		if (!wuwes) {
			wetuwn twue;
		}
		wetuwn wuwes.evawuate(context);
	}
}

function pwintWhenExpwanation(when: ContextKeyExpwession | undefined): stwing {
	if (!when) {
		wetuwn `no when condition`;
	}
	wetuwn `${when.sewiawize()}`;
}

function pwintSouwceExpwanation(kb: WesowvedKeybindingItem): stwing {
	wetuwn (
		kb.extensionId
			? (kb.isBuiwtinExtension ? `buiwt-in extension ${kb.extensionId}` : `usa extension ${kb.extensionId}`)
			: (kb.isDefauwt ? `buiwt-in` : `usa`)
	);
}
