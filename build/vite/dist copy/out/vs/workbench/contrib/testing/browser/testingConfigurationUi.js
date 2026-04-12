/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { groupBy } from '../../../../base/common/arrays.js';
import { isDefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { testingUpdateProfiles } from './icons.js';
import { testConfigurationGroupNames } from '../common/constants.js';
import { canUseProfileWithTest, ITestProfileService } from '../common/testProfileService.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
function buildPicker(accessor, { onlyGroup, showConfigureButtons = true, onlyForTest, onlyConfigurable, placeholder = localize('testConfigurationUi.pick', 'Pick a test profile to use'), }) {
    const profileService = accessor.get(ITestProfileService);
    const items = [];
    const pushItems = (allProfiles, description) => {
        for (const profiles of groupBy(allProfiles, (a, b) => a.group - b.group)) {
            let addedHeader = false;
            if (onlyGroup) {
                if (profiles[0].group !== onlyGroup) {
                    continue;
                }
                addedHeader = true; // showing one group, no need for label
            }
            for (const profile of profiles) {
                if (onlyConfigurable && !profile.hasConfigurationHandler) {
                    continue;
                }
                if (!addedHeader) {
                    items.push({ type: 'separator', label: testConfigurationGroupNames[profiles[0].group] });
                    addedHeader = true;
                }
                items.push(({
                    type: 'item',
                    profile,
                    label: profile.label,
                    description,
                    alwaysShow: true,
                    buttons: profile.hasConfigurationHandler && showConfigureButtons
                        ? [{
                                iconClass: ThemeIcon.asClassName(testingUpdateProfiles),
                                tooltip: localize('updateTestConfiguration', 'Update Test Configuration')
                            }] : []
                }));
            }
        }
    };
    if (onlyForTest !== undefined) {
        pushItems(profileService.getControllerProfiles(onlyForTest.controllerId).filter(p => canUseProfileWithTest(p, onlyForTest)));
    }
    else {
        for (const { profiles, controller } of profileService.all()) {
            pushItems(profiles, controller.label.get());
        }
    }
    const quickpick = accessor.get(IQuickInputService).createQuickPick({ useSeparators: true });
    quickpick.items = items;
    quickpick.placeholder = placeholder;
    return quickpick;
}
const triggerButtonHandler = (service, resolve) => (evt) => {
    const profile = evt.item.profile;
    if (profile) {
        service.configure(profile.controllerId, profile.profileId);
        resolve(undefined);
    }
};
CommandsRegistry.registerCommand({
    id: 'vscode.pickMultipleTestProfiles',
    handler: async (accessor, options) => {
        const profileService = accessor.get(ITestProfileService);
        const quickpick = buildPicker(accessor, options);
        if (!quickpick) {
            return;
        }
        const disposables = new DisposableStore();
        disposables.add(quickpick);
        quickpick.canSelectMany = true;
        if (options.selected) {
            quickpick.selectedItems = quickpick.items
                .filter((i) => i.type === 'item')
                .filter(i => options.selected.some(s => s.controllerId === i.profile.controllerId && s.profileId === i.profile.profileId));
        }
        const pick = await new Promise(resolve => {
            disposables.add(quickpick.onDidAccept(() => {
                const selected = quickpick.selectedItems;
                resolve(selected.map(s => s.profile).filter(isDefined));
            }));
            disposables.add(quickpick.onDidHide(() => resolve(undefined)));
            disposables.add(quickpick.onDidTriggerItemButton(triggerButtonHandler(profileService, resolve)));
            quickpick.show();
        });
        disposables.dispose();
        return pick;
    }
});
CommandsRegistry.registerCommand({
    id: 'vscode.pickTestProfile',
    handler: async (accessor, options) => {
        const profileService = accessor.get(ITestProfileService);
        const quickpick = buildPicker(accessor, options);
        if (!quickpick) {
            return;
        }
        const disposables = new DisposableStore();
        disposables.add(quickpick);
        const pick = await new Promise(resolve => {
            disposables.add(quickpick.onDidAccept(() => resolve(quickpick.selectedItems[0]?.profile)));
            disposables.add(quickpick.onDidHide(() => resolve(undefined)));
            disposables.add(quickpick.onDidTriggerItemButton(triggerButtonHandler(profileService, resolve)));
            quickpick.show();
        });
        disposables.dispose();
        return pick;
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZ0NvbmZpZ3VyYXRpb25VaS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0aW5nQ29uZmlndXJhdGlvblVpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3BGLE9BQU8sRUFBa0Msa0JBQWtCLEVBQTZCLE1BQU0sc0RBQXNELENBQUM7QUFDckosT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUNuRCxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUVyRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFldkUsU0FBUyxXQUFXLENBQUMsUUFBMEIsRUFBRSxFQUNoRCxTQUFTLEVBQ1Qsb0JBQW9CLEdBQUcsSUFBSSxFQUMzQixXQUFXLEVBQ1gsZ0JBQWdCLEVBQ2hCLFdBQVcsR0FBRyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsNEJBQTRCLENBQUMsR0FDbkQ7SUFDN0IsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQ3pELE1BQU0sS0FBSyxHQUFvRSxFQUFFLENB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