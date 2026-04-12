/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import assert from 'assert';
import * as path from '../../../../../base/common/path.js';
import { Promises } from '../../../../../base/node/pfs.js';
import { FileAccess } from '../../../../../base/common/network.js';
function toIResolvedKeybinding(kb) {
    return {
        label: kb.getLabel(),
        ariaLabel: kb.getAriaLabel(),
        electronAccelerator: kb.getElectronAccelerator(),
        userSettingsLabel: kb.getUserSettingsLabel(),
        isWYSIWYG: kb.isWYSIWYG(),
        isMultiChord: kb.hasMultipleChords(),
        dispatchParts: kb.getDispatchChords(),
        singleModifierDispatchParts: kb.getSingleModifierDispatchChords()
    };
}
export function assertResolveKeyboardEvent(mapper, keyboardEvent, expected) {
    const actual = toIResolvedKeybinding(mapper.resolveKeyboardEvent(keyboardEvent));
    assert.deepStrictEqual(actual, expected);
}
export function assertResolveKeybinding(mapper, keybinding, expected) {
    const actual = mapper.resolveKeybinding(keybinding).map(toIResolvedKeybinding);
    assert.deepStrictEqual(actual, expected);
}
export function readRawMapping(file) {
    return fs.promises.readFile(FileAccess.asFileUri(`vs/workbench/services/keybinding/test/node/${file}.js`).fsPath).then((buff) => {
        const contents = buff.toString();
        const func = new Function('define', contents); // CodeQL [SM01632] This is used in tests and we read the files as JS to avoid slowing down TS compilation
        let rawMappings = null;
        func(function (value) {
            rawMappings = value;
        });
        return rawMappings;
    });
}
export function assertMapping(writeFileIfDifferent, mapper, file) {
    const filePath = path.normalize(FileAccess.asFileUri(`vs/workbench/services/keybinding/test/node/${file}`).fsPath);
    return fs.promises.readFile(filePath).then((buff) => {
        const expected = buff.toString().replace(/\r\n/g, '\n');
        const actual = mapper.dumpDebugInfo().replace(/\r\n/g, '\n');
        if (actual !== expected && writeFileIfDifferent) {
            const destPath = filePath.replace(/[\/\\]out[\/\\]vs[\/\\]workbench/, '/src/vs/workbench');
            Promises.writeFile(destPath, actual);
        }
        assert.deepStrictEqual(actual, expected);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5Ym9hcmRNYXBwZXJUZXN0VXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMva2V5YmluZGluZy90ZXN0L25vZGUva2V5Ym9hcmRNYXBwZXJUZXN0VXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxJQUFJLE1BQU0sb0NBQW9DLENBQUM7QUFFM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRzNELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQWFuRSxTQUFTLHFCQUFxQixDQUFDLEVBQXNCO0lBQ3BELE9BQU87UUFDTixLQUFLLEVBQUUsRUFBRSxDQUFDLFFBQVEsRUFBRTtRQUNwQixTQUFTLEVBQUUsRUFBRSxDQUFDLFlBQVksRUFBRTtRQUM1QixtQkFBbUIsRUFBRSxFQUFFLENBQUMsc0JBQXNCLEVBQUU7UUFDaEQsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLG9CQUFvQixFQUFFO1FBQzVDLFNBQVMsRUFBRSxFQUFFLENBQUMsU0FBUyxFQUFFO1FBQ3pCLFlBQVksRUFBRSxFQUFFLENBQUMsaUJBQWlCLEVBQUU7UUFDcEMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsRUFBRTtRQUNyQywyQkFBMkIsRUFBRSxFQUFFLENBQUMsK0JBQStCLEVBQUU7S0FDakUsQ0FBQztBQUNILENBQUM7QUFFRCxNQUFNLFVBQVUsMEJBQTBCLENBQUMsTUFBdUIsRUFBRSxhQUE2QixFQUFFLFFBQTZCO0lBQy9ILE1BQU0sTUFBTSxHQUFHLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBQ2pGLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBQzFDLENBQUM7QUFFRCxNQUFNLFVBQVUsdUJBQXVCLENBQUMsTUFBdUIsRUFBRSxVQUFzQixFQUFFLFFBQStCO0lBQ3ZILE1BQU0sTUFBTSxHQUEwQixNQUFNLENBQUMsaUJBQWlCLENBQUMsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDdEcsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDMUMsQ0FBQztBQUVELE1BQU0sVUFBVSxjQUFjLENBQUksSUFBWTtJQUM3QyxPQUFPLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsOENBQThDLElBQUksS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDL0gsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2pDLE1BQU0sSUFBSSxHQUFHLElBQUksUUFBUSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFBLDBHQUEwRztRQUN4SixJQUFJLFdBQVcsR0FBYSxJQUFJLENBQUM7UUFDakMsSUFBSSxDQUFDLFVBQVUsS0FBUTtZQUN0QixXQUFXLEdBQUcsS0FBSyxDQUFDO1FBQ3JCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxXQUFZLENBQUM7SUFDckIsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsTUFBTSxVQUFVLGFBQWEsQ0FBQyxvQkFBNkIsRUFBRSxNQUF1QixFQUFFLElBQVk7SUFDakcsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLDhDQUE4QyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRW5ILE9BQU8sRUFBRSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDbkQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDeEQsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0QsSUFBSSxNQUFNLEtBQUssUUFBUSxJQUFJLG9CQUFvQixFQUFFLENBQUM7WUFDakQsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxrQ0FBa0MsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1lBQzNGLFFBQVEsQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3RDLENBQUM7UUFDRCxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMifQ==