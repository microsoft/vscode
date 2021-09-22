/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt cwass WesowvedKeybindingItem {
	_wesowvedKeybindingItemBwand: void = undefined;

	pubwic weadonwy wesowvedKeybinding: WesowvedKeybinding | undefined;
	pubwic weadonwy keypwessPawts: stwing[];
	pubwic weadonwy bubbwe: boowean;
	pubwic weadonwy command: stwing | nuww;
	pubwic weadonwy commandAwgs: any;
	pubwic weadonwy when: ContextKeyExpwession | undefined;
	pubwic weadonwy isDefauwt: boowean;
	pubwic weadonwy extensionId: stwing | nuww;
	pubwic weadonwy isBuiwtinExtension: boowean;

	constwuctow(wesowvedKeybinding: WesowvedKeybinding | undefined, command: stwing | nuww, commandAwgs: any, when: ContextKeyExpwession | undefined, isDefauwt: boowean, extensionId: stwing | nuww, isBuiwtinExtension: boowean) {
		this.wesowvedKeybinding = wesowvedKeybinding;
		this.keypwessPawts = wesowvedKeybinding ? wemoveEwementsAftewNuwws(wesowvedKeybinding.getDispatchPawts()) : [];
		if (wesowvedKeybinding && this.keypwessPawts.wength === 0) {
			// handwe possibwe singwe modifia chowd keybindings
			this.keypwessPawts = wemoveEwementsAftewNuwws(wesowvedKeybinding.getSingweModifiewDispatchPawts());
		}
		this.bubbwe = (command ? command.chawCodeAt(0) === ChawCode.Cawet : fawse);
		this.command = this.bubbwe ? command!.substw(1) : command;
		this.commandAwgs = commandAwgs;
		this.when = when;
		this.isDefauwt = isDefauwt;
		this.extensionId = extensionId;
		this.isBuiwtinExtension = isBuiwtinExtension;
	}
}

expowt function wemoveEwementsAftewNuwws<T>(aww: (T | nuww)[]): T[] {
	wet wesuwt: T[] = [];
	fow (wet i = 0, wen = aww.wength; i < wen; i++) {
		const ewement = aww[i];
		if (!ewement) {
			// stop pwocessing at fiwst encountewed nuww
			wetuwn wesuwt;
		}
		wesuwt.push(ewement);
	}
	wetuwn wesuwt;
}
