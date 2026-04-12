/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { parse } from '../../../../base/common/console.js';
export function logRemoteEntry(logService, entry, label = null) {
    const args = parse(entry).args;
    let firstArg = args.shift();
    if (typeof firstArg !== 'string') {
        return;
    }
    if (!entry.severity) {
        entry.severity = 'info';
    }
    if (label) {
        if (!/^\[/.test(label)) {
            label = `[${label}]`;
        }
        if (!/ $/.test(label)) {
            label = `${label} `;
        }
        firstArg = label + firstArg;
    }
    switch (entry.severity) {
        case 'log':
        case 'info':
            logService.info(firstArg, ...args);
            break;
        case 'warn':
            logService.warn(firstArg, ...args);
            break;
        case 'error':
            logService.error(firstArg, ...args);
            break;
    }
}
export function logRemoteEntryIfError(logService, entry, label) {
    const args = parse(entry).args;
    const firstArg = args.shift();
    if (typeof firstArg !== 'string' || entry.severity !== 'error') {
        return;
    }
    if (!/^\[/.test(label)) {
        label = `[${label}]`;
    }
    if (!/ $/.test(label)) {
        label = `${label} `;
    }
    logService.error(label + firstArg, ...args);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQ29uc29sZVV0aWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcmVtb3RlQ29uc29sZVV0aWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFxQixLQUFLLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUc5RSxNQUFNLFVBQVUsY0FBYyxDQUFDLFVBQXVCLEVBQUUsS0FBd0IsRUFBRSxRQUF1QixJQUFJO0lBQzVHLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDL0IsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzVCLElBQUksT0FBTyxRQUFRLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDbEMsT0FBTztJQUNSLENBQUM7SUFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3JCLEtBQUssQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDO0lBQ3pCLENBQUM7SUFFRCxJQUFJLEtBQUssRUFBRSxDQUFDO1FBQ1gsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN4QixLQUFLLEdBQUcsSUFBSSxLQUFLLEdBQUcsQ0FBQztRQUN0QixDQUFDO1FBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN2QixLQUFLLEdBQUcsR0FBRyxLQUFLLEdBQUcsQ0FBQztRQUNyQixDQUFDO1FBQ0QsUUFBUSxHQUFHLEtBQUssR0FBRyxRQUFRLENBQUM7SUFDN0IsQ0FBQztJQUVELFFBQVEsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3hCLEtBQUssS0FBSyxDQUFDO1FBQ1gsS0FBSyxNQUFNO1lBQ1YsVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUNuQyxNQUFNO1FBQ1AsS0FBSyxNQUFNO1lBQ1YsVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUNuQyxNQUFNO1FBQ1AsS0FBSyxPQUFPO1lBQ1gsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUNwQyxNQUFNO0lBQ1IsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLFVBQVUscUJBQXFCLENBQUMsVUFBdUIsRUFBRSxLQUF3QixFQUFFLEtBQWE7SUFDckcsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQztJQUMvQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDOUIsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRLElBQUksS0FBSyxDQUFDLFFBQVEsS0FBSyxPQUFPLEVBQUUsQ0FBQztRQUNoRSxPQUFPO0lBQ1IsQ0FBQztJQUVELElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDeEIsS0FBSyxHQUFHLElBQUksS0FBSyxHQUFHLENBQUM7SUFDdEIsQ0FBQztJQUNELElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdkIsS0FBSyxHQUFHLEdBQUcsS0FBSyxHQUFHLENBQUM7SUFDckIsQ0FBQztJQUVELFVBQVUsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLFFBQVEsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQzdDLENBQUMifQ==