/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeybindingParser } from '../../../../base/common/keybindingParser.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
export class KeybindingIO {
    static writeKeybindingItem(out, item) {
        if (!item.resolvedKeybinding) {
            return;
        }
        const quotedSerializedKeybinding = JSON.stringify(item.resolvedKeybinding.getUserSettingsLabel());
        out.write(`{ "key": ${rightPaddedString(quotedSerializedKeybinding + ',', 25)} "command": `);
        const quotedSerializedWhen = item.when ? JSON.stringify(item.when.serialize()) : '';
        const quotedSerializeCommand = JSON.stringify(item.command);
        if (quotedSerializedWhen.length > 0) {
            out.write(`${quotedSerializeCommand},`);
            out.writeLine();
            out.write(`                                     "when": ${quotedSerializedWhen}`);
        }
        else {
            out.write(`${quotedSerializeCommand}`);
        }
        if (item.commandArgs) {
            out.write(',');
            out.writeLine();
            out.write(`                                     "args": ${JSON.stringify(item.commandArgs)}`);
        }
        out.write(' }');
    }
    static readUserKeybindingItem(input) {
        const keybinding = 'key' in input && typeof input.key === 'string'
            ? KeybindingParser.parseKeybinding(input.key)
            : null;
        const when = 'when' in input && typeof input.when === 'string'
            ? ContextKeyExpr.deserialize(input.when)
            : undefined;
        const command = 'command' in input && typeof input.command === 'string'
            ? input.command
            : null;
        const commandArgs = 'args' in input && typeof input.args !== 'undefined'
            ? input.args
            : undefined;
        return {
            keybinding,
            command,
            commandArgs,
            when,
            _sourceKey: 'key' in input && typeof input.key === 'string' ? input.key : undefined,
        };
    }
}
function rightPaddedString(str, minChars) {
    if (str.length < minChars) {
        return str + (new Array(minChars - str.length).join(' '));
    }
    return str;
}
export class OutputBuilder {
    constructor() {
        this._lines = [];
        this._currentLine = '';
    }
    write(str) {
        this._currentLine += str;
    }
    writeLine(str = '') {
        this._lines.push(this._currentLine + str);
        this._currentLine = '';
    }
    toString() {
        this.writeLine();
        return this._lines.join('\n');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ0lPLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdJTy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUUvRSxPQUFPLEVBQUUsY0FBYyxFQUF3QixNQUFNLHNEQUFzRCxDQUFDO0FBVzVHLE1BQU0sT0FBTyxZQUFZO0lBRWpCLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxHQUFrQixFQUFFLElBQTRCO1FBQ2pGLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUM5QixPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sMEJBQTBCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsb0JBQW9CLEVBQUUsQ0FBQyxDQUFDO1FBQ2xHLEdBQUcsQ0FBQyxLQUFLLENBQUMsWUFBWSxpQkFBaUIsQ0FBQywwQkFBMEIsR0FBRyxHQUFHLEVBQUUsRUFBRSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRTdGLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNwRixNQUFNLHNCQUFzQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzVELElBQUksb0JBQW9CLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3JDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxzQkFBc0IsR0FBRyxDQUFDLENBQUM7WUFDeEMsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0RBQWdELG9CQUFvQixFQUFFLENBQUMsQ0FBQztRQUNuRixDQUFDO2FBQU0sQ0FBQztZQUNQLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxzQkFBc0IsRUFBRSxDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3RCLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDZixHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsR0FBRyxDQUFDLEtBQUssQ0FBQyxnREFBZ0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQy9GLENBQUM7UUFDRCxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2pCLENBQUM7SUFFTSxNQUFNLENBQUMsc0JBQXNCLENBQUMsS0FBYTtRQUNqRCxNQUFNLFVBQVUsR0FBRyxLQUFLLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxDQUFDLEdBQUcsS0FBSyxRQUFRO1lBQ2pFLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQztZQUM3QyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQ1IsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUTtZQUM3RCxDQUFDLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO1lBQ3hDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDYixNQUFNLE9BQU8sR0FBRyxTQUFTLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxDQUFDLE9BQU8sS0FBSyxRQUFRO1lBQ3RFLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTztZQUNmLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDUixNQUFNLFdBQVcsR0FBRyxNQUFNLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBSyxXQUFXO1lBQ3ZFLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSTtZQUNaLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDYixPQUFPO1lBQ04sVUFBVTtZQUNWLE9BQU87WUFDUCxXQUFXO1lBQ1gsSUFBSTtZQUNKLFVBQVUsRUFBRSxLQUFLLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxDQUFDLEdBQUcsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVM7U0FDbkYsQ0FBQztJQUNILENBQUM7Q0FDRDtBQUVELFNBQVMsaUJBQWlCLENBQUMsR0FBVyxFQUFFLFFBQWdCO0lBQ3ZELElBQUksR0FBRyxDQUFDLE1BQU0sR0FBRyxRQUFRLEVBQUUsQ0FBQztRQUMzQixPQUFPLEdBQUcsR0FBRyxDQUFDLElBQUksS0FBSyxDQUFDLFFBQVEsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUNELE9BQU8sR0FBRyxDQUFDO0FBQ1osQ0FBQztBQUVELE1BQU0sT0FBTyxhQUFhO0lBQTFCO1FBRVMsV0FBTSxHQUFhLEVBQUUsQ0FBQztRQUN0QixpQkFBWSxHQUFXLEVBQUUsQ0FBQztJQWVuQyxDQUFDO0lBYkEsS0FBSyxDQUFDLEdBQVc7UUFDaEIsSUFBSSxDQUFDLFlBQVksSUFBSSxHQUFHLENBQUM7SUFDMUIsQ0FBQztJQUVELFNBQVMsQ0FBQyxNQUFjLEVBQUU7UUFDekIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksR0FBRyxHQUFHLENBQUMsQ0FBQztRQUMxQyxJQUFJLENBQUMsWUFBWSxHQUFHLEVBQUUsQ0FBQztJQUN4QixDQUFDO0lBRUQsUUFBUTtRQUNQLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNqQixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQy9CLENBQUM7Q0FDRCJ9