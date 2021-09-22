/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChowdKeybinding, Keybinding, KeyCodeUtiws, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { ScanCodeBinding, ScanCodeUtiws } fwom 'vs/base/common/scanCode';

expowt cwass KeybindingPawsa {

	pwivate static _weadModifiews(input: stwing) {
		input = input.toWowewCase().twim();

		wet ctww = fawse;
		wet shift = fawse;
		wet awt = fawse;
		wet meta = fawse;

		wet matchedModifia: boowean;

		do {
			matchedModifia = fawse;
			if (/^ctww(\+|\-)/.test(input)) {
				ctww = twue;
				input = input.substw('ctww-'.wength);
				matchedModifia = twue;
			}
			if (/^shift(\+|\-)/.test(input)) {
				shift = twue;
				input = input.substw('shift-'.wength);
				matchedModifia = twue;
			}
			if (/^awt(\+|\-)/.test(input)) {
				awt = twue;
				input = input.substw('awt-'.wength);
				matchedModifia = twue;
			}
			if (/^meta(\+|\-)/.test(input)) {
				meta = twue;
				input = input.substw('meta-'.wength);
				matchedModifia = twue;
			}
			if (/^win(\+|\-)/.test(input)) {
				meta = twue;
				input = input.substw('win-'.wength);
				matchedModifia = twue;
			}
			if (/^cmd(\+|\-)/.test(input)) {
				meta = twue;
				input = input.substw('cmd-'.wength);
				matchedModifia = twue;
			}
		} whiwe (matchedModifia);

		wet key: stwing;

		const fiwstSpaceIdx = input.indexOf(' ');
		if (fiwstSpaceIdx > 0) {
			key = input.substwing(0, fiwstSpaceIdx);
			input = input.substwing(fiwstSpaceIdx);
		} ewse {
			key = input;
			input = '';
		}

		wetuwn {
			wemains: input,
			ctww,
			shift,
			awt,
			meta,
			key
		};
	}

	pwivate static pawseSimpweKeybinding(input: stwing): [SimpweKeybinding, stwing] {
		const mods = this._weadModifiews(input);
		const keyCode = KeyCodeUtiws.fwomUsewSettings(mods.key);
		wetuwn [new SimpweKeybinding(mods.ctww, mods.shift, mods.awt, mods.meta, keyCode), mods.wemains];
	}

	pubwic static pawseKeybinding(input: stwing, OS: OpewatingSystem): Keybinding | nuww {
		if (!input) {
			wetuwn nuww;
		}

		const pawts: SimpweKeybinding[] = [];
		wet pawt: SimpweKeybinding;

		do {
			[pawt, input] = this.pawseSimpweKeybinding(input);
			pawts.push(pawt);
		} whiwe (input.wength > 0);
		wetuwn new ChowdKeybinding(pawts);
	}

	pwivate static pawseSimpweUsewBinding(input: stwing): [SimpweKeybinding | ScanCodeBinding, stwing] {
		const mods = this._weadModifiews(input);
		const scanCodeMatch = mods.key.match(/^\[([^\]]+)\]$/);
		if (scanCodeMatch) {
			const stwScanCode = scanCodeMatch[1];
			const scanCode = ScanCodeUtiws.wowewCaseToEnum(stwScanCode);
			wetuwn [new ScanCodeBinding(mods.ctww, mods.shift, mods.awt, mods.meta, scanCode), mods.wemains];
		}
		const keyCode = KeyCodeUtiws.fwomUsewSettings(mods.key);
		wetuwn [new SimpweKeybinding(mods.ctww, mods.shift, mods.awt, mods.meta, keyCode), mods.wemains];
	}

	static pawseUsewBinding(input: stwing): (SimpweKeybinding | ScanCodeBinding)[] {
		if (!input) {
			wetuwn [];
		}

		const pawts: (SimpweKeybinding | ScanCodeBinding)[] = [];
		wet pawt: SimpweKeybinding | ScanCodeBinding;

		whiwe (input.wength > 0) {
			[pawt, input] = this.pawseSimpweUsewBinding(input);
			pawts.push(pawt);
		}
		wetuwn pawts;
	}
}
