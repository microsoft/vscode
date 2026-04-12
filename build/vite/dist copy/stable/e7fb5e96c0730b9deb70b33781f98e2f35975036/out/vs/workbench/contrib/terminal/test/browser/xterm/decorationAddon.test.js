/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { notEqual, strictEqual, throws } from 'assert';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { DecorationAddon } from '../../../browser/xterm/decorationAddon.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
suite('DecorationAddon', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let decorationAddon;
    let xterm;
    setup(async () => {
        const TerminalCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
        class TestTerminal extends TerminalCtor {
            registerDecoration(decorationOptions) {
                if (decorationOptions.marker.isDisposed) {
                    return undefined;
                }
                const element = document.createElement('div');
                return { marker: decorationOptions.marker, element, onDispose: () => { }, isDisposed: false, dispose: () => { }, onRender: (element) => { return element; } };
            }
        }
        const instantiationService = workbenchInstantiationService({
            configurationService: () => new TestConfigurationService({
                files: {},
                workbench: {
                    hover: { delay: 5 },
                },
                terminal: {
                    integrated: {
                        shellIntegration: {
                            decorationsEnabled: 'both'
                        }
                    }
                }
            })
        }, store);
        xterm = store.add(new TestTerminal({
            allowProposedApi: true,
            cols: 80,
            rows: 30,
            logger: TestXtermLogger
        }));
        const capabilities = store.add(new TerminalCapabilityStore());
        capabilities.add(2 /* TerminalCapability.CommandDetection */, store.add(instantiationService.createInstance(CommandDetectionCapability, xterm)));
        decorationAddon = store.add(instantiationService.createInstance(DecorationAddon, undefined, capabilities));
        xterm.loadAddon(decorationAddon);
    });
    suite('registerDecoration', () => {
        test('should throw when command has no marker', async () => {
            throws(() => decorationAddon.registerCommandDecoration({ command: 'cd src', timestamp: Date.now(), hasOutput: () => false }));
        });
        test('should return undefined when marker has been disposed of', async () => {
            const marker = xterm.registerMarker(1);
            marker?.dispose();
            strictEqual(decorationAddon.registerCommandDecoration({ command: 'cd src', marker, timestamp: Date.now(), hasOutput: () => false }), undefined);
        });
        test('should return decoration when marker has not been disposed of', async () => {
            const marker = xterm.registerMarker(2);
            notEqual(decorationAddon.registerCommandDecoration({ command: 'cd src', marker, timestamp: Date.now(), hasOutput: () => false }), undefined);
        });
        test('should return decoration with mark properties', async () => {
            const marker = xterm.registerMarker(2);
            notEqual(decorationAddon.registerCommandDecoration(undefined, undefined, { marker }), undefined);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdGlvbkFkZG9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC90ZXN0L2Jyb3dzZXIveHRlcm0vZGVjb3JhdGlvbkFkZG9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBRTVILE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHVGQUF1RixDQUFDO0FBQ25JLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG9GQUFvRixDQUFDO0FBQzdILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFFekcsS0FBSyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtJQUM3QixNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksZUFBZ0MsQ0FBQztJQUNyQyxJQUFJLEtBQXVCLENBQUM7SUFFNUIsS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFO1FBQ2hCLE1BQU0sWUFBWSxHQUFHLENBQUMsTUFBTSxtQkFBbUIsQ0FBZ0MsY0FBYyxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO1FBQ3pILE1BQU0sWUFBYSxTQUFRLFlB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