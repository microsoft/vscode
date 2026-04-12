/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ResourceSet } from '../../../../base/common/map.js';
import { chatEditingSessionIsReady } from './editing/chatEditingService.js';
import { isLegacyChatTerminalToolInvocationData } from './chatService/chatService.js';
export function checkModeOption(mode, option) {
    if (option === undefined) {
        return undefined;
    }
    if (typeof option === 'function') {
        return option(mode);
    }
    return option;
}
/**
 * @deprecated This is the old API shape, we should support this for a while before removing it so
 * we don't break existing chats
 */
export function migrateLegacyTerminalToolSpecificData(data) {
    if (isLegacyChatTerminalToolInvocationData(data)) {
        data = {
            kind: 'terminal',
            commandLine: {
                original: data.command,
                toolEdited: undefined,
                userEdited: undefined
            },
            language: data.language
        };
    }
    return data;
}
export async function awaitStatsForSession(model) {
    if (!model.editingSession) {
        return undefined;
    }
    await chatEditingSessionIsReady(model.editingSession);
    await Promise.all(model.editingSession.entries.get().map(entry => entry.getDiffInfo?.()));
    const diffs = model.editingSession.entries.get();
    const reduceResult = diffs.reduce((acc, diff) => {
        acc.fileUris.add(diff.originalURI);
        acc.added += diff.linesAdded?.get() ?? 0;
        acc.removed += diff.linesRemoved?.get() ?? 0;
        return acc;
    }, { fileUris: new ResourceSet(), added: 0, removed: 0 });
    if (reduceResult.fileUris.size > 0 && (reduceResult.added > 0 || reduceResult.removed > 0)) {
        return {
            fileCount: reduceResult.fileUris.size,
            added: reduceResult.added,
            removed: reduceResult.removed
        };
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTVFLE9BQU8sRUFBRSxzQ0FBc0MsRUFBNEcsTUFBTSw4QkFBOEIsQ0FBQztBQUdoTSxNQUFNLFVBQVUsZUFBZSxDQUFDLElBQWtCLEVBQUUsTUFBK0Q7SUFDbEgsSUFBSSxNQUFNLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDMUIsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUNELElBQUksT0FBTyxNQUFNLEtBQUssVUFBVSxFQUFFLENBQUM7UUFDbEMsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckIsQ0FBQztJQUNELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVEOzs7R0FHRztBQUNILE1BQU0sVUFBVSxxQ0FBcUMsQ0FBQyxJQUE2RTtJQUNsSSxJQUFJLHNDQUFzQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDbEQsSUFBSSxHQUFHO1lBQ04sSUFBSSxFQUFFLFVBQVU7WUFDaEIsV0FBVyxFQUFFO2dCQUNaLFFBQVEsRUFBRSxJQUFJLENBQUMsT0FBTztnQkFDdEIsVUFBVSxFQUFFLFNBQVM7Z0JBQ3JCLFVBQVUsRUFBRSxTQUFTO2FBQ3JCO1lBQ0QsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1NBQ21CLENBQUM7SUFDN0MsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQztBQUVELE1BQU0sQ0FBQyxLQUFLLFVBQVUsb0JBQW9CLENBQUMsS0FBaUI7SUFDM0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUMzQixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsTUFBTSx5QkFBeUIsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDdEQsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUUxRixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNqRCxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFO1FBQy9DLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNuQyxHQUFHLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pDLEdBQUcsQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0MsT0FBTyxHQUFHLENBQUM7SUFDWixDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBRTFELElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksWUFBWSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQzVGLE9BQU87WUFDTixTQUFTLEVBQUUsWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJO1lBQ3JDLEtBQUssRUFBRSxZQUFZLENBQUMsS0FBSztZQUN6QixPQUFPLEVBQUUsWUFBWSxDQUFDLE9BQU87U0FDN0IsQ0FBQztJQUNILENBQUM7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNsQixDQUFDIn0=