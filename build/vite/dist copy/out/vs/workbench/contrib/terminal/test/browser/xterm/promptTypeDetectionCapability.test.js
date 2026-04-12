/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptTypeDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/promptTypeDetectionCapability.js';
suite('PromptTypeDetectionCapability', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('should have correct capability type', () => {
        const capability = store.add(new PromptTypeDetectionCapability());
        strictEqual(capability.type, 6 /* TerminalCapability.PromptTypeDetection */);
    });
    test('should initialize with undefined prompt type', () => {
        const capability = store.add(new PromptTypeDetectionCapability());
        strictEqual(capability.promptType, undefined);
    });
    test('should set and get prompt type', () => {
        const capability = store.add(new PromptTypeDetectionCapability());
        capability.setPromptType('p10k');
        strictEqual(capability.promptType, 'p10k');
        capability.setPromptType('posh-git');
        strictEqual(capability.promptType, 'posh-git');
    });
    test('should fire event when prompt type changes', () => {
        const capability = store.add(new PromptTypeDetectionCapability());
        let eventFiredCount = 0;
        let lastEventValue;
        const disposable = capability.onPromptTypeChanged(value => {
            eventFiredCount++;
            lastEventValue = value;
        });
        store.add(disposable);
        capability.setPromptType('starship');
        strictEqual(eventFiredCount, 1);
        strictEqual(lastEventValue, 'starship');
        capability.setPromptType('oh-my-zsh');
        strictEqual(eventFiredCount, 2);
        strictEqual(lastEventValue, 'oh-my-zsh');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0VHlwZURldGVjdGlvbkNhcGFiaWxpdHkudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci94dGVybS9wcm9tcHRUeXBlRGV0ZWN0aW9uQ2FwYWJpbGl0eS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDckMsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sMEZBQTBGLENBQUM7QUFHekksS0FBSyxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRTtJQUMzQyxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7UUFDaEQsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLDZCQUE2QixFQUFFLENBQUMsQ0FBQztRQUNsRSxXQUFXLENBQUMsVUFBVSxDQUFDLElBQUksaURBQXlDLENBQUM7SUFDdEUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOENBQThDLEVBQUUsR0FBRyxFQUFFO1FBQ3pELE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSw2QkFBNkIsRUFBRSxDQUFDLENBQUM7UUFDbEUsV0FBVyxDQUFDLFVBQVUsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDL0MsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO1FBQzNDLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSw2QkFBNkIsRUFBRSxDQUFDLENBQUM7UUFFbEUsVUFBVSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqQyxXQUFXLENBQUMsVUFBVSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUUzQyxVQUFVLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3JDLFdBQVcsQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ2hELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtRQUN2RCxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksNkJBQTZCLEVBQUUsQ0FBQyxDQUFDO1FBQ2xFLElBQUksZUFBZSxHQUFHLENBQUMsQ0FBQztRQUN4QixJQUFJLGNBQWtDLENBQUM7UUFFdkMsTUFBTSxVQUFVLEdBQUcsVUFBVSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ3pELGVBQWUsRUFBRSxDQUFDO1lBQ2xCLGNBQWMsR0FBRyxLQUFLLENBQUM7UUFDeEIsQ0FBQyxDQUFDLENBQUM7UUFDSCxLQUFLLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRXRCLFVBQVUsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDckMsV0FBVyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoQyxXQUFXLENBQUMsY0FBYyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRXhDLFVBQVUsQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDdEMsV0FBVyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoQyxXQUFXLENBQUMsY0FBYyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQzFDLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==