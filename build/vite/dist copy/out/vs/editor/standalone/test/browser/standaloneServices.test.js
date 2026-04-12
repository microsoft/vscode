/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { StandaloneCodeEditorService } from '../../browser/standaloneCodeEditorService.js';
import { StandaloneCommandService, StandaloneConfigurationService, StandaloneKeybindingService, StandaloneNotificationService } from '../../browser/standaloneServices.js';
import { StandaloneThemeService } from '../../browser/standaloneThemeService.js';
import { ContextKeyService } from '../../../../platform/contextkey/browser/contextKeyService.js';
import { InstantiationService } from '../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
suite('StandaloneKeybindingService', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    class TestStandaloneKeybindingService extends StandaloneKeybindingService {
        testDispatch(e) {
            super._dispatch(e, null);
        }
    }
    test('issue microsoft/monaco-editor#167', () => {
        const disposables = new DisposableStore();
        const serviceCollection = new ServiceCollection();
        const instantiationService = new InstantiationService(serviceCollection, true);
        const configurationService = new StandaloneConfigurationService(new NullLogService());
        const contextKeyService = disposables.add(new ContextKeyService(configurationService));
        const commandService = new StandaloneCommandService(instantiationService);
        const notificationService = new StandaloneNotificationService();
        const standaloneThemeService = disposables.add(new StandaloneThemeService());
        const codeEditorService = disposables.add(new StandaloneCodeEditorService(contextKeyService, standaloneThemeService));
        const keybindingService = disposables.add(new TestStandaloneKeybindingService(contextKeyService, commandService, NullTelemetryService, notificationService, new NullLogService(), codeEditorService));
        let commandInvoked = false;
        disposables.add(keybindingService.addDynamicKeybinding('testCommand', 67 /* KeyCode.F9 */, () => {
            commandInvoked = true;
        }, undefined));
        keybindingService.testDispatch({
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: 67 /* KeyCode.F9 */,
            code: null
        });
        assert.ok(commandInvoked, 'command invoked');
        disposables.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZVNlcnZpY2VzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3Ivc3RhbmRhbG9uZS90ZXN0L2Jyb3dzZXIvc3RhbmRhbG9uZVNlcnZpY2VzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMzRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsOEJBQThCLEVBQUUsMkJBQTJCLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMzSyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNqRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN6RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUVuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFL0YsS0FBSyxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFBRTtJQUV6Qyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLE1BQU0sK0JBQWdDLFNBQVEsMkJBQTJCO1FBQ2pFLFlBQVksQ0FBQyxDQUFpQjtZQUNwQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxJQUFLLENBQUMsQ0FBQztRQUMzQixDQUFDO0tBQ0Q7SUFFRCxJQUFJLENBQUMsbUNBQW1DLEVBQUUsR0FBRyxFQUFFO1FBRTlDLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLGlCQUFpQixFQUFFLENBQUM7UUFDbEQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLG9CQUFvQixDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQy9FLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSw4QkFBOEIsQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDdEYsTUFBTSxpQkFBaUIsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQ3ZGLE1BQU0sY0FBYyxHQUFHLElBQUksd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUMxRSxNQUFNLG1CQUFtQixHQUFHLElBQUksNkJBQTZCLEVBQUUsQ0FBQztRQUNoRSxNQUFNLHNCQUFzQixHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxzQkFBc0IsRUFBRSxDQUFDLENBQUM7UUFDN0UsTUFBTSxpQkFBaUIsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksMkJBQTJCLENBQUMsaUJBQWlCLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO1FBQ3RILE1BQU0saUJBQWlCLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLCtCQUErQixDQUFDLGlCQUFpQixFQUFFLGNBQWMsRUFBRSxvQkFBb0IsRUFBRSxtQkFBbUIsRUFBRSxJQUFJLGNBQWMsRUFBRSxFQUFFLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUV0TSxJQUFJLGNBQWMsR0FBRyxLQUFLLENBQUM7UUFDM0IsV0FBVyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLHVCQUFjLEdBQUcsRUFBRTtZQUN0RixjQUFjLEdBQUcsSUFBSSxDQUFDO1FBQ3ZCLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBRWYsaUJBQWlCLENBQUMsWUFBWSxDQUFDO1lBQzlCLDJCQUEyQixFQUFFLElBQUk7WUFDakMsT0FBTyxFQUFFLEtBQUs7WUFDZCxRQUFRLEVBQUUsS0FBSztZQUNmLE1BQU0sRUFBRSxLQUFLO1lBQ2IsT0FBTyxFQUFFLEtBQUs7WUFDZCxXQUFXLEVBQUUsS0FBSztZQUNsQixPQUFPLHFCQUFZO1lBQ25CLElBQUksRUFBRSxJQUFLO1NBQ1gsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxjQUFjLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUU3QyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdkIsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9