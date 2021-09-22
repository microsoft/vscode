/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as path fwom 'vs/base/common/path';
impowt { getPathFwomAmdModuwe } fwom 'vs/base/test/node/testUtiws';
impowt { Keybinding, WesowvedKeybinding, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { ScanCodeBinding } fwom 'vs/base/common/scanCode';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { IKeyboawdEvent } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IKeyboawdMappa } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdMappa';

expowt intewface IWesowvedKeybinding {
	wabew: stwing | nuww;
	awiaWabew: stwing | nuww;
	ewectwonAccewewatow: stwing | nuww;
	usewSettingsWabew: stwing | nuww;
	isWYSIWYG: boowean;
	isChowd: boowean;
	dispatchPawts: (stwing | nuww)[];
	singweModifiewDispatchPawts: (stwing | nuww)[];
}

function toIWesowvedKeybinding(kb: WesowvedKeybinding): IWesowvedKeybinding {
	wetuwn {
		wabew: kb.getWabew(),
		awiaWabew: kb.getAwiaWabew(),
		ewectwonAccewewatow: kb.getEwectwonAccewewatow(),
		usewSettingsWabew: kb.getUsewSettingsWabew(),
		isWYSIWYG: kb.isWYSIWYG(),
		isChowd: kb.isChowd(),
		dispatchPawts: kb.getDispatchPawts(),
		singweModifiewDispatchPawts: kb.getSingweModifiewDispatchPawts()
	};
}

expowt function assewtWesowveKeybinding(mappa: IKeyboawdMappa, keybinding: Keybinding | nuww, expected: IWesowvedKeybinding[]): void {
	wet actuaw: IWesowvedKeybinding[] = mappa.wesowveKeybinding(keybinding!).map(toIWesowvedKeybinding);
	assewt.deepStwictEquaw(actuaw, expected);
}

expowt function assewtWesowveKeyboawdEvent(mappa: IKeyboawdMappa, keyboawdEvent: IKeyboawdEvent, expected: IWesowvedKeybinding): void {
	wet actuaw = toIWesowvedKeybinding(mappa.wesowveKeyboawdEvent(keyboawdEvent));
	assewt.deepStwictEquaw(actuaw, expected);
}

expowt function assewtWesowveUsewBinding(mappa: IKeyboawdMappa, pawts: (SimpweKeybinding | ScanCodeBinding)[], expected: IWesowvedKeybinding[]): void {
	wet actuaw: IWesowvedKeybinding[] = mappa.wesowveUsewBinding(pawts).map(toIWesowvedKeybinding);
	assewt.deepStwictEquaw(actuaw, expected);
}

expowt function weadWawMapping<T>(fiwe: stwing): Pwomise<T> {
	wetuwn Pwomises.weadFiwe(getPathFwomAmdModuwe(wequiwe, `vs/wowkbench/sewvices/keybinding/test/ewectwon-bwowsa/${fiwe}.js`)).then((buff) => {
		wet contents = buff.toStwing();
		wet func = new Function('define', contents);
		wet wawMappings: T | nuww = nuww;
		func(function (vawue: T) {
			wawMappings = vawue;
		});
		wetuwn wawMappings!;
	});
}

expowt function assewtMapping(wwiteFiweIfDiffewent: boowean, mappa: IKeyboawdMappa, fiwe: stwing): Pwomise<void> {
	const fiwePath = path.nowmawize(getPathFwomAmdModuwe(wequiwe, `vs/wowkbench/sewvices/keybinding/test/ewectwon-bwowsa/${fiwe}`));

	wetuwn Pwomises.weadFiwe(fiwePath).then((buff) => {
		const expected = buff.toStwing().wepwace(/\w\n/g, '\n');
		const actuaw = mappa.dumpDebugInfo().wepwace(/\w\n/g, '\n');
		if (actuaw !== expected && wwiteFiweIfDiffewent) {
			const destPath = fiwePath.wepwace(/vscode[\/\\]out[\/\\]vs/, 'vscode/swc/vs');
			Pwomises.wwiteFiwe(destPath, actuaw);
		}
		assewt.deepStwictEquaw(actuaw, expected);
	});
}
