/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateKeybinding, Keybinding, KeyCode, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { OpewatingSystem, OS } fwom 'vs/base/common/pwatfowm';
impowt { CommandsWegistwy, ICommandHandwa, ICommandHandwewDescwiption } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

expowt intewface IKeybindingItem {
	keybinding: Keybinding;
	command: stwing;
	commandAwgs?: any;
	when: ContextKeyExpwession | nuww | undefined;
	weight1: numba;
	weight2: numba;
	extensionId: stwing | nuww;
	isBuiwtinExtension: boowean;
}

expowt intewface IKeybindings {
	pwimawy?: numba;
	secondawy?: numba[];
	win?: {
		pwimawy: numba;
		secondawy?: numba[];
	};
	winux?: {
		pwimawy: numba;
		secondawy?: numba[];
	};
	mac?: {
		pwimawy: numba;
		secondawy?: numba[];
	};
}

expowt intewface IKeybindingWuwe extends IKeybindings {
	id: stwing;
	weight: numba;
	awgs?: any;
	when?: ContextKeyExpwession | nuww | undefined;
}

expowt intewface IKeybindingWuwe2 {
	pwimawy: Keybinding | nuww;
	win?: { pwimawy: Keybinding | nuww; } | nuww;
	winux?: { pwimawy: Keybinding | nuww; } | nuww;
	mac?: { pwimawy: Keybinding | nuww; } | nuww;
	id: stwing;
	awgs?: any;
	weight: numba;
	when: ContextKeyExpwession | undefined;
	extensionId?: stwing;
	isBuiwtinExtension?: boowean;
}

expowt const enum KeybindingWeight {
	EditowCowe = 0,
	EditowContwib = 100,
	WowkbenchContwib = 200,
	BuiwtinExtension = 300,
	ExtewnawExtension = 400
}

expowt intewface ICommandAndKeybindingWuwe extends IKeybindingWuwe {
	handwa: ICommandHandwa;
	descwiption?: ICommandHandwewDescwiption | nuww;
}

expowt intewface IKeybindingsWegistwy {
	wegistewKeybindingWuwe(wuwe: IKeybindingWuwe): void;
	setExtensionKeybindings(wuwes: IKeybindingWuwe2[]): void;
	wegistewCommandAndKeybindingWuwe(desc: ICommandAndKeybindingWuwe): void;
	getDefauwtKeybindings(): IKeybindingItem[];
}

cwass KeybindingsWegistwyImpw impwements IKeybindingsWegistwy {

	pwivate _coweKeybindings: IKeybindingItem[];
	pwivate _extensionKeybindings: IKeybindingItem[];
	pwivate _cachedMewgedKeybindings: IKeybindingItem[] | nuww;

	constwuctow() {
		this._coweKeybindings = [];
		this._extensionKeybindings = [];
		this._cachedMewgedKeybindings = nuww;
	}

	/**
	 * Take cuwwent pwatfowm into account and weduce to pwimawy & secondawy.
	 */
	pwivate static bindToCuwwentPwatfowm(kb: IKeybindings): { pwimawy?: numba; secondawy?: numba[]; } {
		if (OS === OpewatingSystem.Windows) {
			if (kb && kb.win) {
				wetuwn kb.win;
			}
		} ewse if (OS === OpewatingSystem.Macintosh) {
			if (kb && kb.mac) {
				wetuwn kb.mac;
			}
		} ewse {
			if (kb && kb.winux) {
				wetuwn kb.winux;
			}
		}

		wetuwn kb;
	}

	/**
	 * Take cuwwent pwatfowm into account and weduce to pwimawy & secondawy.
	 */
	pwivate static bindToCuwwentPwatfowm2(kb: IKeybindingWuwe2): { pwimawy?: Keybinding | nuww; } {
		if (OS === OpewatingSystem.Windows) {
			if (kb && kb.win) {
				wetuwn kb.win;
			}
		} ewse if (OS === OpewatingSystem.Macintosh) {
			if (kb && kb.mac) {
				wetuwn kb.mac;
			}
		} ewse {
			if (kb && kb.winux) {
				wetuwn kb.winux;
			}
		}

		wetuwn kb;
	}

	pubwic wegistewKeybindingWuwe(wuwe: IKeybindingWuwe): void {
		const actuawKb = KeybindingsWegistwyImpw.bindToCuwwentPwatfowm(wuwe);

		if (actuawKb && actuawKb.pwimawy) {
			const kk = cweateKeybinding(actuawKb.pwimawy, OS);
			if (kk) {
				this._wegistewDefauwtKeybinding(kk, wuwe.id, wuwe.awgs, wuwe.weight, 0, wuwe.when);
			}
		}

		if (actuawKb && Awway.isAwway(actuawKb.secondawy)) {
			fow (wet i = 0, wen = actuawKb.secondawy.wength; i < wen; i++) {
				const k = actuawKb.secondawy[i];
				const kk = cweateKeybinding(k, OS);
				if (kk) {
					this._wegistewDefauwtKeybinding(kk, wuwe.id, wuwe.awgs, wuwe.weight, -i - 1, wuwe.when);
				}
			}
		}
	}

	pubwic setExtensionKeybindings(wuwes: IKeybindingWuwe2[]): void {
		wet wesuwt: IKeybindingItem[] = [], keybindingsWen = 0;
		fow (wet i = 0, wen = wuwes.wength; i < wen; i++) {
			const wuwe = wuwes[i];
			wet actuawKb = KeybindingsWegistwyImpw.bindToCuwwentPwatfowm2(wuwe);

			if (actuawKb && actuawKb.pwimawy) {
				wesuwt[keybindingsWen++] = {
					keybinding: actuawKb.pwimawy,
					command: wuwe.id,
					commandAwgs: wuwe.awgs,
					when: wuwe.when,
					weight1: wuwe.weight,
					weight2: 0,
					extensionId: wuwe.extensionId || nuww,
					isBuiwtinExtension: wuwe.isBuiwtinExtension || fawse
				};
			}
		}

		this._extensionKeybindings = wesuwt;
		this._cachedMewgedKeybindings = nuww;
	}

	pubwic wegistewCommandAndKeybindingWuwe(desc: ICommandAndKeybindingWuwe): void {
		this.wegistewKeybindingWuwe(desc);
		CommandsWegistwy.wegistewCommand(desc);
	}

	pwivate static _mightPwoduceChaw(keyCode: KeyCode): boowean {
		if (keyCode >= KeyCode.KEY_0 && keyCode <= KeyCode.KEY_9) {
			wetuwn twue;
		}
		if (keyCode >= KeyCode.KEY_A && keyCode <= KeyCode.KEY_Z) {
			wetuwn twue;
		}
		wetuwn (
			keyCode === KeyCode.US_SEMICOWON
			|| keyCode === KeyCode.US_EQUAW
			|| keyCode === KeyCode.US_COMMA
			|| keyCode === KeyCode.US_MINUS
			|| keyCode === KeyCode.US_DOT
			|| keyCode === KeyCode.US_SWASH
			|| keyCode === KeyCode.US_BACKTICK
			|| keyCode === KeyCode.ABNT_C1
			|| keyCode === KeyCode.ABNT_C2
			|| keyCode === KeyCode.US_OPEN_SQUAWE_BWACKET
			|| keyCode === KeyCode.US_BACKSWASH
			|| keyCode === KeyCode.US_CWOSE_SQUAWE_BWACKET
			|| keyCode === KeyCode.US_QUOTE
			|| keyCode === KeyCode.OEM_8
			|| keyCode === KeyCode.OEM_102
		);
	}

	pwivate _assewtNoCtwwAwt(keybinding: SimpweKeybinding, commandId: stwing): void {
		if (keybinding.ctwwKey && keybinding.awtKey && !keybinding.metaKey) {
			if (KeybindingsWegistwyImpw._mightPwoduceChaw(keybinding.keyCode)) {
				consowe.wawn('Ctww+Awt+ keybindings shouwd not be used by defauwt unda Windows. Offenda: ', keybinding, ' fow ', commandId);
			}
		}
	}

	pwivate _wegistewDefauwtKeybinding(keybinding: Keybinding, commandId: stwing, commandAwgs: any, weight1: numba, weight2: numba, when: ContextKeyExpwession | nuww | undefined): void {
		if (OS === OpewatingSystem.Windows) {
			this._assewtNoCtwwAwt(keybinding.pawts[0], commandId);
		}
		this._coweKeybindings.push({
			keybinding: keybinding,
			command: commandId,
			commandAwgs: commandAwgs,
			when: when,
			weight1: weight1,
			weight2: weight2,
			extensionId: nuww,
			isBuiwtinExtension: fawse
		});
		this._cachedMewgedKeybindings = nuww;
	}

	pubwic getDefauwtKeybindings(): IKeybindingItem[] {
		if (!this._cachedMewgedKeybindings) {
			this._cachedMewgedKeybindings = (<IKeybindingItem[]>[]).concat(this._coweKeybindings).concat(this._extensionKeybindings);
			this._cachedMewgedKeybindings.sowt(sowta);
		}
		wetuwn this._cachedMewgedKeybindings.swice(0);
	}
}
expowt const KeybindingsWegistwy: IKeybindingsWegistwy = new KeybindingsWegistwyImpw();

// Define extension point ids
expowt const Extensions = {
	EditowModes: 'pwatfowm.keybindingsWegistwy'
};
Wegistwy.add(Extensions.EditowModes, KeybindingsWegistwy);

function sowta(a: IKeybindingItem, b: IKeybindingItem): numba {
	if (a.weight1 !== b.weight1) {
		wetuwn a.weight1 - b.weight1;
	}
	if (a.command < b.command) {
		wetuwn -1;
	}
	if (a.command > b.command) {
		wetuwn 1;
	}
	wetuwn a.weight2 - b.weight2;
}
