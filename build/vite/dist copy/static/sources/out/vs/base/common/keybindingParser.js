/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyCodeUtils, ScanCodeUtils } from './keyCodes.js';
import { KeyCodeChord, ScanCodeChord, Keybinding } from './keybindings.js';
export class KeybindingParser {
    static _readModifiers(input) {
        input = input.toLowerCase().trim();
        let ctrl = false;
        let shift = false;
        let alt = false;
        let meta = false;
        let matchedModifier;
        do {
            matchedModifier = false;
            if (/^ctrl(\+|\-)/.test(input)) {
                ctrl = true;
                input = input.substr('ctrl-'.length);
                matchedModifier = true;
            }
            if (/^shift(\+|\-)/.test(input)) {
                shift = true;
                input = input.substr('shift-'.length);
                matchedModifier = true;
            }
            if (/^alt(\+|\-)/.test(input)) {
                alt = true;
                input = input.substr('alt-'.length);
                matchedModifier = true;
            }
            if (/^meta(\+|\-)/.test(input)) {
                meta = true;
                input = input.substr('meta-'.length);
                matchedModifier = true;
            }
            if (/^win(\+|\-)/.test(input)) {
                meta = true;
                input = input.substr('win-'.length);
                matchedModifier = true;
            }
            if (/^cmd(\+|\-)/.test(input)) {
                meta = true;
                input = input.substr('cmd-'.length);
                matchedModifier = true;
            }
        } while (matchedModifier);
        let key;
        const firstSpaceIdx = input.indexOf(' ');
        if (firstSpaceIdx > 0) {
            key = input.substring(0, firstSpaceIdx);
            input = input.substring(firstSpaceIdx);
        }
        else {
            key = input;
            input = '';
        }
        return {
            remains: input,
            ctrl,
            shift,
            alt,
            meta,
            key
        };
    }
    static parseChord(input) {
        const mods = this._readModifiers(input);
        const scanCodeMatch = mods.key.match(/^\[([^\]]+)\]$/);
        if (scanCodeMatch) {
            const strScanCode = scanCodeMatch[1];
            const scanCode = ScanCodeUtils.lowerCaseToEnum(strScanCode);
            return [new ScanCodeChord(mods.ctrl, mods.shift, mods.alt, mods.meta, scanCode), mods.remains];
        }
        const keyCode = KeyCodeUtils.fromUserSettings(mods.key);
        return [new KeyCodeChord(mods.ctrl, mods.shift, mods.alt, mods.meta, keyCode), mods.remains];
    }
    static parseKeybinding(input) {
        if (!input) {
            return null;
        }
        const chords = [];
        let chord;
        while (input.length > 0) {
            [chord, input] = this.parseChord(input);
            chords.push(chord);
        }
        return (chords.length > 0 ? new Keybinding(chords) : null);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ1BhcnNlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdQYXJzZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDNUQsT0FBTyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFTLE1BQU0sa0JBQWtCLENBQUM7QUFFbEYsTUFBTSxPQUFPLGdCQUFnQjtJQUVwQixNQUFNLENBQUMsY0FBYyxDQUFDLEtBQWE7UUFDMUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUVuQyxJQUFJLElBQUksR0FBRyxLQUFLLENBQUM7UUFDakIsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ2xCLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQztRQUNoQixJQUFJLElBQUksR0FBRyxLQUFLLENBQUM7UUFFakIsSUFBSSxlQUF3QixDQUFDO1FBRTdCLEdBQUcsQ0FBQztZQUNILGVBQWUsR0FBRyxLQUFLLENBQUM7WUFDeEIsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2hDLElBQUksR0FBRyxJQUFJLENBQUM7Z0JBQ1osS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNyQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1lBQ3hCLENBQUM7WUFDRCxJQUFJLGVBQWUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDakMsS0FBSyxHQUFHLElBQUksQ0FBQztnQkFDYixLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3RDLGVBQWUsR0FBRyxJQUFJLENBQUM7WUFDeEIsQ0FBQztZQUNELElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUMvQixHQUFHLEdBQUcsSUFBSSxDQUFDO2dCQUNYLEtBQUssR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDcEMsZUFBZSxHQUFHLElBQUksQ0FBQztZQUN4QixDQUFDO1lBQ0QsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2hDLElBQUksR0FBRyxJQUFJLENBQUM7Z0JBQ1osS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNyQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1lBQ3hCLENBQUM7WUFDRCxJQUFJLGFBQWEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDL0IsSUFBSSxHQUFHLElBQUksQ0FBQztnQkFDWixLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3BDLGVBQWUsR0FBRyxJQUFJLENBQUM7WUFDeEIsQ0FBQztZQUNELElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUMvQixJQUFJLEdBQUcsSUFBSSxDQUFDO2dCQUNaLEtBQUssR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDcEMsZUFBZSxHQUFHLElBQUksQ0FBQztZQUN4QixDQUFDO1FBQ0YsQ0FBQyxRQUFRLGVBQWUsRUFBRTtRQUUxQixJQUFJLEdBQVcsQ0FBQztRQUVoQixNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3pDLElBQUksYUFBYSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3ZCLEdBQUcsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUN4QyxLQUFLLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN4QyxDQUFDO2FBQU0sQ0FBQztZQUNQLEdBQUcsR0FBRyxLQUFLLENBQUM7WUFDWixLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQ1osQ0FBQztRQUVELE9BQU87WUFDTixPQUFPLEVBQUUsS0FBSztZQUNkLElBQUk7WUFDSixLQUFLO1lBQ0wsR0FBRztZQUNILElBQUk7WUFDSixHQUFHO1NBQ0gsQ0FBQztJQUNILENBQUM7SUFFTyxNQUFNLENBQUMsVUFBVSxDQUFDLEtBQWE7UUFDdEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3ZELElBQUksYUFBYSxFQUFFLENBQUM7WUFDbkIsTUFBTSxXQUFXLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDNUQsT0FBTyxDQUFDLElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2hHLENBQUM7UUFDRCxNQUFNLE9BQU8sR0FBRyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hELE9BQU8sQ0FBQyxJQUFJLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUM5RixDQUFDO0lBRUQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxLQUFhO1FBQ25DLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFZLEVBQUUsQ0FBQztRQUMzQixJQUFJLEtBQVksQ0FBQztRQUVqQixPQUFPLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDekIsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN4QyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3BCLENBQUM7UUFDRCxPQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM1RCxDQUFDO0NBQ0QifQ==