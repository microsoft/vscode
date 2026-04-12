/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
export function getUnchangedRegionSettings(configurationService) {
    return createHideUnchangedRegionOptions(configurationService);
}
function createHideUnchangedRegionOptions(configurationService) {
    const disposables = new DisposableStore();
    const unchangedRegionsEnablementEmitter = disposables.add(new Emitter());
    const result = {
        options: {
            enabled: configurationService.getValue('diffEditor.hideUnchangedRegions.enabled'),
            minimumLineCount: configurationService.getValue('diffEditor.hideUnchangedRegions.minimumLineCount'),
            contextLineCount: configurationService.getValue('diffEditor.hideUnchangedRegions.contextLineCount'),
            revealLineCount: configurationService.getValue('diffEditor.hideUnchangedRegions.revealLineCount'),
        },
        // We only care about enable/disablement.
        // If user changes counters when a diff editor is open, we do not care, might as well ask user to reload.
        // Simpler and almost never going to happen.
        onDidChangeEnablement: unchangedRegionsEnablementEmitter.event.bind(unchangedRegionsEnablementEmitter),
        dispose: () => disposables.dispose()
    };
    disposables.add(configurationService.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('diffEditor.hideUnchangedRegions.minimumLineCount')) {
            result.options.minimumLineCount = configurationService.getValue('diffEditor.hideUnchangedRegions.minimumLineCount');
        }
        if (e.affectsConfiguration('diffEditor.hideUnchangedRegions.contextLineCount')) {
            result.options.contextLineCount = configurationService.getValue('diffEditor.hideUnchangedRegions.contextLineCount');
        }
        if (e.affectsConfiguration('diffEditor.hideUnchangedRegions.revealLineCount')) {
            result.options.revealLineCount = configurationService.getValue('diffEditor.hideUnchangedRegions.revealLineCount');
        }
        if (e.affectsConfiguration('diffEditor.hideUnchangedRegions.enabled')) {
            result.options.enabled = configurationService.getValue('diffEditor.hideUnchangedRegions.enabled');
            unchangedRegionsEnablementEmitter.fire(result.options.enabled);
        }
    }));
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5jaGFuZ2VkRWRpdG9yUmVnaW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvZGlmZi91bmNoYW5nZWRFZGl0b3JSZWdpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFhdkYsTUFBTSxVQUFVLDBCQUEwQixDQUFDLG9CQUEyQztJQUNyRixPQUFPLGdDQUFnQyxDQUFDLG9CQUFvQixDQUFDLENBQUM7QUFDL0QsQ0FBQztBQUVELFNBQVMsZ0NBQWdDLENBQUMsb0JBQTJDO0lBQ3BGLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFDMUMsTUFBTSxpQ0FBaUMsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUFXLENBQUMsQ0FBQztJQUVsRixNQUFNLE1BQU0sR0FBRztRQUNkLE9BQU8sRUFBRTtZQUNSLE9BQU8sRUFBRSxvQkFBb0IsQ0FBQyxRQUFRLENBQVUseUNBQXlDLENBQUM7WUFDMUYsZ0JBQWdCLEVBQUUsb0JBQW9CLENBQUMsUUFBUSxDQUFTLGtEQUFrRCxDQUFDO1lBQzNHLGdCQUFnQixFQUFFLG9CQUFvQixDQUFDLFFBQVEsQ0FBUyxrREFBa0QsQ0FBQztZQUMzRyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsUUFBUSxDQUFTLGlEQUFpRCxDQUFDO1NBQ3pHO1FBQ0QseUNBQXlDO1FBQ3pDLHlHQUF5RztRQUN6Ryw0Q0FBNEM7UUFDNUMscUJBQXFCLEVBQUUsaUNBQWlDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQztRQUN0RyxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRTtLQUNwQyxDQUFDO0lBRUYsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUNqRSxJQUFJLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxrREFBa0QsQ0FBQyxFQUFFLENBQUM7WUFDaEYsTUFBTSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsR0FBRyxvQkFBb0IsQ0FBQyxRQUFRLENBQVMsa0RBQWtELENBQUMsQ0FBQztRQUM3SCxDQUFDO1FBQ0QsSUFBSSxDQUFDLENBQUMsb0JBQW9CLENBQUMsa0RBQWtELENBQUMsRUFBRSxDQUFDO1lBQ2hGLE1BQU0sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUFTLGtEQUFrRCxDQUFDLENBQUM7UUFDN0gsQ0FBQztRQUNELElBQUksQ0FBQyxDQUFDLG9CQUFvQixDQUFDLGlEQUFpRCxDQUFDLEVBQUUsQ0FBQztZQUMvRSxNQUFNLENBQUMsT0FBTyxDQUFDLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxRQUFRLENBQVMsaURBQWlELENBQUMsQ0FBQztRQUMzSCxDQUFDO1FBQ0QsSUFBSSxDQUFDLENBQUMsb0JBQW9CLENBQUMseUNBQXlDLENBQUMsRUFBRSxDQUFDO1lBQ3ZFLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxHQUFHLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO1lBQ2xHLGlDQUFpQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2hFLENBQUM7SUFFRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDIn0=