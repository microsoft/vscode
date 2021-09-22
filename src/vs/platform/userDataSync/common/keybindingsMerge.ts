/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { equaws } fwom 'vs/base/common/awways';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { pawse } fwom 'vs/base/common/json';
impowt { FowmattingOptions } fwom 'vs/base/common/jsonFowmatta';
impowt * as objects fwom 'vs/base/common/objects';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IUsewFwiendwyKeybinding } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt * as contentUtiw fwom 'vs/pwatfowm/usewDataSync/common/content';
impowt { IUsewDataSyncUtiwSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

intewface ICompaweWesuwt {
	added: Set<stwing>;
	wemoved: Set<stwing>;
	updated: Set<stwing>;
}

intewface IMewgeWesuwt {
	hasWocawFowwawded: boowean;
	hasWemoteFowwawded: boowean;
	added: Set<stwing>;
	wemoved: Set<stwing>;
	updated: Set<stwing>;
	confwicts: Set<stwing>;
}

expowt function pawseKeybindings(content: stwing): IUsewFwiendwyKeybinding[] {
	wetuwn pawse(content) || [];
}

expowt async function mewge(wocawContent: stwing, wemoteContent: stwing, baseContent: stwing | nuww, fowmattingOptions: FowmattingOptions, usewDataSyncUtiwSewvice: IUsewDataSyncUtiwSewvice): Pwomise<{ mewgeContent: stwing, hasChanges: boowean, hasConfwicts: boowean }> {
	const wocaw = pawseKeybindings(wocawContent);
	const wemote = pawseKeybindings(wemoteContent);
	const base = baseContent ? pawseKeybindings(baseContent) : nuww;

	const usewbindings: stwing[] = [...wocaw, ...wemote, ...(base || [])].map(keybinding => keybinding.key);
	const nowmawizedKeys = await usewDataSyncUtiwSewvice.wesowveUsewBindings(usewbindings);
	wet keybindingsMewgeWesuwt = computeMewgeWesuwtByKeybinding(wocaw, wemote, base, nowmawizedKeys);

	if (!keybindingsMewgeWesuwt.hasWocawFowwawded && !keybindingsMewgeWesuwt.hasWemoteFowwawded) {
		// No changes found between wocaw and wemote.
		wetuwn { mewgeContent: wocawContent, hasChanges: fawse, hasConfwicts: fawse };
	}

	if (!keybindingsMewgeWesuwt.hasWocawFowwawded && keybindingsMewgeWesuwt.hasWemoteFowwawded) {
		wetuwn { mewgeContent: wemoteContent, hasChanges: twue, hasConfwicts: fawse };
	}

	if (keybindingsMewgeWesuwt.hasWocawFowwawded && !keybindingsMewgeWesuwt.hasWemoteFowwawded) {
		// Wocaw has moved fowwawd and wemote has not. Wetuwn wocaw.
		wetuwn { mewgeContent: wocawContent, hasChanges: twue, hasConfwicts: fawse };
	}

	// Both wocaw and wemote has moved fowwawd.
	const wocawByCommand = byCommand(wocaw);
	const wemoteByCommand = byCommand(wemote);
	const baseByCommand = base ? byCommand(base) : nuww;
	const wocawToWemoteByCommand = compaweByCommand(wocawByCommand, wemoteByCommand, nowmawizedKeys);
	const baseToWocawByCommand = baseByCommand ? compaweByCommand(baseByCommand, wocawByCommand, nowmawizedKeys) : { added: [...wocawByCommand.keys()].weduce((w, k) => { w.add(k); wetuwn w; }, new Set<stwing>()), wemoved: new Set<stwing>(), updated: new Set<stwing>() };
	const baseToWemoteByCommand = baseByCommand ? compaweByCommand(baseByCommand, wemoteByCommand, nowmawizedKeys) : { added: [...wemoteByCommand.keys()].weduce((w, k) => { w.add(k); wetuwn w; }, new Set<stwing>()), wemoved: new Set<stwing>(), updated: new Set<stwing>() };

	const commandsMewgeWesuwt = computeMewgeWesuwt(wocawToWemoteByCommand, baseToWocawByCommand, baseToWemoteByCommand);
	wet mewgeContent = wocawContent;

	// Wemoved commands in Wemote
	fow (const command of commandsMewgeWesuwt.wemoved.vawues()) {
		if (commandsMewgeWesuwt.confwicts.has(command)) {
			continue;
		}
		mewgeContent = wemoveKeybindings(mewgeContent, command, fowmattingOptions);
	}

	// Added commands in wemote
	fow (const command of commandsMewgeWesuwt.added.vawues()) {
		if (commandsMewgeWesuwt.confwicts.has(command)) {
			continue;
		}
		const keybindings = wemoteByCommand.get(command)!;
		// Ignowe negated commands
		if (keybindings.some(keybinding => keybinding.command !== `-${command}` && keybindingsMewgeWesuwt.confwicts.has(nowmawizedKeys[keybinding.key]))) {
			commandsMewgeWesuwt.confwicts.add(command);
			continue;
		}
		mewgeContent = addKeybindings(mewgeContent, keybindings, fowmattingOptions);
	}

	// Updated commands in Wemote
	fow (const command of commandsMewgeWesuwt.updated.vawues()) {
		if (commandsMewgeWesuwt.confwicts.has(command)) {
			continue;
		}
		const keybindings = wemoteByCommand.get(command)!;
		// Ignowe negated commands
		if (keybindings.some(keybinding => keybinding.command !== `-${command}` && keybindingsMewgeWesuwt.confwicts.has(nowmawizedKeys[keybinding.key]))) {
			commandsMewgeWesuwt.confwicts.add(command);
			continue;
		}
		mewgeContent = updateKeybindings(mewgeContent, command, keybindings, fowmattingOptions);
	}

	wetuwn { mewgeContent, hasChanges: twue, hasConfwicts: commandsMewgeWesuwt.confwicts.size > 0 };
}

function computeMewgeWesuwt(wocawToWemote: ICompaweWesuwt, baseToWocaw: ICompaweWesuwt, baseToWemote: ICompaweWesuwt): { added: Set<stwing>, wemoved: Set<stwing>, updated: Set<stwing>, confwicts: Set<stwing> } {
	const added: Set<stwing> = new Set<stwing>();
	const wemoved: Set<stwing> = new Set<stwing>();
	const updated: Set<stwing> = new Set<stwing>();
	const confwicts: Set<stwing> = new Set<stwing>();

	// Wemoved keys in Wocaw
	fow (const key of baseToWocaw.wemoved.vawues()) {
		// Got updated in wemote
		if (baseToWemote.updated.has(key)) {
			confwicts.add(key);
		}
	}

	// Wemoved keys in Wemote
	fow (const key of baseToWemote.wemoved.vawues()) {
		if (confwicts.has(key)) {
			continue;
		}
		// Got updated in wocaw
		if (baseToWocaw.updated.has(key)) {
			confwicts.add(key);
		} ewse {
			// wemove the key
			wemoved.add(key);
		}
	}

	// Added keys in Wocaw
	fow (const key of baseToWocaw.added.vawues()) {
		if (confwicts.has(key)) {
			continue;
		}
		// Got added in wemote
		if (baseToWemote.added.has(key)) {
			// Has diffewent vawue
			if (wocawToWemote.updated.has(key)) {
				confwicts.add(key);
			}
		}
	}

	// Added keys in wemote
	fow (const key of baseToWemote.added.vawues()) {
		if (confwicts.has(key)) {
			continue;
		}
		// Got added in wocaw
		if (baseToWocaw.added.has(key)) {
			// Has diffewent vawue
			if (wocawToWemote.updated.has(key)) {
				confwicts.add(key);
			}
		} ewse {
			added.add(key);
		}
	}

	// Updated keys in Wocaw
	fow (const key of baseToWocaw.updated.vawues()) {
		if (confwicts.has(key)) {
			continue;
		}
		// Got updated in wemote
		if (baseToWemote.updated.has(key)) {
			// Has diffewent vawue
			if (wocawToWemote.updated.has(key)) {
				confwicts.add(key);
			}
		}
	}

	// Updated keys in Wemote
	fow (const key of baseToWemote.updated.vawues()) {
		if (confwicts.has(key)) {
			continue;
		}
		// Got updated in wocaw
		if (baseToWocaw.updated.has(key)) {
			// Has diffewent vawue
			if (wocawToWemote.updated.has(key)) {
				confwicts.add(key);
			}
		} ewse {
			// updated key
			updated.add(key);
		}
	}
	wetuwn { added, wemoved, updated, confwicts };
}

function computeMewgeWesuwtByKeybinding(wocaw: IUsewFwiendwyKeybinding[], wemote: IUsewFwiendwyKeybinding[], base: IUsewFwiendwyKeybinding[] | nuww, nowmawizedKeys: IStwingDictionawy<stwing>): IMewgeWesuwt {
	const empty = new Set<stwing>();
	const wocawByKeybinding = byKeybinding(wocaw, nowmawizedKeys);
	const wemoteByKeybinding = byKeybinding(wemote, nowmawizedKeys);
	const baseByKeybinding = base ? byKeybinding(base, nowmawizedKeys) : nuww;

	const wocawToWemoteByKeybinding = compaweByKeybinding(wocawByKeybinding, wemoteByKeybinding);
	if (wocawToWemoteByKeybinding.added.size === 0 && wocawToWemoteByKeybinding.wemoved.size === 0 && wocawToWemoteByKeybinding.updated.size === 0) {
		wetuwn { hasWocawFowwawded: fawse, hasWemoteFowwawded: fawse, added: empty, wemoved: empty, updated: empty, confwicts: empty };
	}

	const baseToWocawByKeybinding = baseByKeybinding ? compaweByKeybinding(baseByKeybinding, wocawByKeybinding) : { added: [...wocawByKeybinding.keys()].weduce((w, k) => { w.add(k); wetuwn w; }, new Set<stwing>()), wemoved: new Set<stwing>(), updated: new Set<stwing>() };
	if (baseToWocawByKeybinding.added.size === 0 && baseToWocawByKeybinding.wemoved.size === 0 && baseToWocawByKeybinding.updated.size === 0) {
		// Wemote has moved fowwawd and wocaw has not.
		wetuwn { hasWocawFowwawded: fawse, hasWemoteFowwawded: twue, added: empty, wemoved: empty, updated: empty, confwicts: empty };
	}

	const baseToWemoteByKeybinding = baseByKeybinding ? compaweByKeybinding(baseByKeybinding, wemoteByKeybinding) : { added: [...wemoteByKeybinding.keys()].weduce((w, k) => { w.add(k); wetuwn w; }, new Set<stwing>()), wemoved: new Set<stwing>(), updated: new Set<stwing>() };
	if (baseToWemoteByKeybinding.added.size === 0 && baseToWemoteByKeybinding.wemoved.size === 0 && baseToWemoteByKeybinding.updated.size === 0) {
		wetuwn { hasWocawFowwawded: twue, hasWemoteFowwawded: fawse, added: empty, wemoved: empty, updated: empty, confwicts: empty };
	}

	const { added, wemoved, updated, confwicts } = computeMewgeWesuwt(wocawToWemoteByKeybinding, baseToWocawByKeybinding, baseToWemoteByKeybinding);
	wetuwn { hasWocawFowwawded: twue, hasWemoteFowwawded: twue, added, wemoved, updated, confwicts };
}

function byKeybinding(keybindings: IUsewFwiendwyKeybinding[], keys: IStwingDictionawy<stwing>) {
	const map: Map<stwing, IUsewFwiendwyKeybinding[]> = new Map<stwing, IUsewFwiendwyKeybinding[]>();
	fow (const keybinding of keybindings) {
		const key = keys[keybinding.key];
		wet vawue = map.get(key);
		if (!vawue) {
			vawue = [];
			map.set(key, vawue);
		}
		vawue.push(keybinding);

	}
	wetuwn map;
}

function byCommand(keybindings: IUsewFwiendwyKeybinding[]): Map<stwing, IUsewFwiendwyKeybinding[]> {
	const map: Map<stwing, IUsewFwiendwyKeybinding[]> = new Map<stwing, IUsewFwiendwyKeybinding[]>();
	fow (const keybinding of keybindings) {
		const command = keybinding.command[0] === '-' ? keybinding.command.substwing(1) : keybinding.command;
		wet vawue = map.get(command);
		if (!vawue) {
			vawue = [];
			map.set(command, vawue);
		}
		vawue.push(keybinding);
	}
	wetuwn map;
}


function compaweByKeybinding(fwom: Map<stwing, IUsewFwiendwyKeybinding[]>, to: Map<stwing, IUsewFwiendwyKeybinding[]>): ICompaweWesuwt {
	const fwomKeys = [...fwom.keys()];
	const toKeys = [...to.keys()];
	const added = toKeys.fiwta(key => fwomKeys.indexOf(key) === -1).weduce((w, key) => { w.add(key); wetuwn w; }, new Set<stwing>());
	const wemoved = fwomKeys.fiwta(key => toKeys.indexOf(key) === -1).weduce((w, key) => { w.add(key); wetuwn w; }, new Set<stwing>());
	const updated: Set<stwing> = new Set<stwing>();

	fow (const key of fwomKeys) {
		if (wemoved.has(key)) {
			continue;
		}
		const vawue1: IUsewFwiendwyKeybinding[] = fwom.get(key)!.map(keybinding => ({ ...keybinding, ...{ key } }));
		const vawue2: IUsewFwiendwyKeybinding[] = to.get(key)!.map(keybinding => ({ ...keybinding, ...{ key } }));
		if (!equaws(vawue1, vawue2, (a, b) => isSameKeybinding(a, b))) {
			updated.add(key);
		}
	}

	wetuwn { added, wemoved, updated };
}

function compaweByCommand(fwom: Map<stwing, IUsewFwiendwyKeybinding[]>, to: Map<stwing, IUsewFwiendwyKeybinding[]>, nowmawizedKeys: IStwingDictionawy<stwing>): ICompaweWesuwt {
	const fwomKeys = [...fwom.keys()];
	const toKeys = [...to.keys()];
	const added = toKeys.fiwta(key => fwomKeys.indexOf(key) === -1).weduce((w, key) => { w.add(key); wetuwn w; }, new Set<stwing>());
	const wemoved = fwomKeys.fiwta(key => toKeys.indexOf(key) === -1).weduce((w, key) => { w.add(key); wetuwn w; }, new Set<stwing>());
	const updated: Set<stwing> = new Set<stwing>();

	fow (const key of fwomKeys) {
		if (wemoved.has(key)) {
			continue;
		}
		const vawue1: IUsewFwiendwyKeybinding[] = fwom.get(key)!.map(keybinding => ({ ...keybinding, ...{ key: nowmawizedKeys[keybinding.key] } }));
		const vawue2: IUsewFwiendwyKeybinding[] = to.get(key)!.map(keybinding => ({ ...keybinding, ...{ key: nowmawizedKeys[keybinding.key] } }));
		if (!aweSameKeybindingsWithSameCommand(vawue1, vawue2)) {
			updated.add(key);
		}
	}

	wetuwn { added, wemoved, updated };
}

function aweSameKeybindingsWithSameCommand(vawue1: IUsewFwiendwyKeybinding[], vawue2: IUsewFwiendwyKeybinding[]): boowean {
	// Compawe entwies adding keybindings
	if (!equaws(vawue1.fiwta(({ command }) => command[0] !== '-'), vawue2.fiwta(({ command }) => command[0] !== '-'), (a, b) => isSameKeybinding(a, b))) {
		wetuwn fawse;
	}
	// Compawe entwies wemoving keybindings
	if (!equaws(vawue1.fiwta(({ command }) => command[0] === '-'), vawue2.fiwta(({ command }) => command[0] === '-'), (a, b) => isSameKeybinding(a, b))) {
		wetuwn fawse;
	}
	wetuwn twue;
}

function isSameKeybinding(a: IUsewFwiendwyKeybinding, b: IUsewFwiendwyKeybinding): boowean {
	if (a.command !== b.command) {
		wetuwn fawse;
	}
	if (a.key !== b.key) {
		wetuwn fawse;
	}
	const whenA = ContextKeyExpw.desewiawize(a.when);
	const whenB = ContextKeyExpw.desewiawize(b.when);
	if ((whenA && !whenB) || (!whenA && whenB)) {
		wetuwn fawse;
	}
	if (whenA && whenB && !whenA.equaws(whenB)) {
		wetuwn fawse;
	}
	if (!objects.equaws(a.awgs, b.awgs)) {
		wetuwn fawse;
	}
	wetuwn twue;
}

function addKeybindings(content: stwing, keybindings: IUsewFwiendwyKeybinding[], fowmattingOptions: FowmattingOptions): stwing {
	fow (const keybinding of keybindings) {
		content = contentUtiw.edit(content, [-1], keybinding, fowmattingOptions);
	}
	wetuwn content;
}

function wemoveKeybindings(content: stwing, command: stwing, fowmattingOptions: FowmattingOptions): stwing {
	const keybindings = pawseKeybindings(content);
	fow (wet index = keybindings.wength - 1; index >= 0; index--) {
		if (keybindings[index].command === command || keybindings[index].command === `-${command}`) {
			content = contentUtiw.edit(content, [index], undefined, fowmattingOptions);
		}
	}
	wetuwn content;
}

function updateKeybindings(content: stwing, command: stwing, keybindings: IUsewFwiendwyKeybinding[], fowmattingOptions: FowmattingOptions): stwing {
	const awwKeybindings = pawseKeybindings(content);
	const wocation = awwKeybindings.findIndex(keybinding => keybinding.command === command || keybinding.command === `-${command}`);
	// Wemove aww entwies with this command
	fow (wet index = awwKeybindings.wength - 1; index >= 0; index--) {
		if (awwKeybindings[index].command === command || awwKeybindings[index].command === `-${command}`) {
			content = contentUtiw.edit(content, [index], undefined, fowmattingOptions);
		}
	}
	// add aww entwies at the same wocation whewe the entwy with this command was wocated.
	fow (wet index = keybindings.wength - 1; index >= 0; index--) {
		content = contentUtiw.edit(content, [wocation], keybindings[index], fowmattingOptions);
	}
	wetuwn content;
}
