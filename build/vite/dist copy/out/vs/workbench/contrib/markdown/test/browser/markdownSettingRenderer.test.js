/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SimpleSettingRenderer } from '../../browser/markdownSettingRenderer.js';
const configuration = {
    'id': 'examples',
    'title': 'Examples',
    'type': 'object',
    'properties': {
        'example.booleanSetting': {
            'type': 'boolean',
            'default': false,
            'scope': 1 /* ConfigurationScope.APPLICATION */
        },
        'example.booleanSetting2': {
            'type': 'boolean',
            'default': true,
            'scope': 1 /* ConfigurationScope.APPLICATION */
        },
        'example.stringSetting': {
            'type': 'string',
            'default': 'one',
            'scope': 1 /* ConfigurationScope.APPLICATION */
        },
        'example.numberSetting': {
            'type': 'number',
            'default': 3,
            'scope': 1 /* ConfigurationScope.APPLICATION */
        }
    }
};
class MarkdownConfigurationService extends TestConfigurationService {
    async updateValue(key, value) {
        const [section, setting] = key.split('.');
        return this.setUserConfiguration(section, { [setting]: value });
    }
}
suite('Markdown Setting Renderer Test', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let configurationService;
    let preferencesService;
    let contextMenuService;
    let settingRenderer;
    suiteSetup(() => {
        configurationService = new MarkdownConfigurationService();
        preferencesService = {
            getSetting: (setting) => {
                let type = 'boolean';
                if (setting.includes('string')) {
                    type = 'string';
                }
                return { type, key: setting };
            }
        };
        contextMenuService = {};
        Registry.as(Extensions.Configuration).registerConfiguration(configuration);
        // eslint-disable-next-line local/code-no-any-casts
        settingRenderer = new SimpleSettingRenderer(configurationService, contextMenuService, preferencesService, { publicLog2: () => { } }, { writeText: async () => { } });
    });
    suiteTeardown(() => {
        Registry.as(Extensions.Configuration).deregisterConfigurations([configuration]);
    });
    test('render code setting button with value', () => {
        const htmlRenderer = settingRenderer.getHtmlRenderer();
        const htmlNoValue = '<a href="code-oss://settings/example.booleanSetting" codesetting="true">';
        const renderedHtmlNoValue = htmlRenderer({ block: false, raw: htmlNoValue, pre: false, text: '', type: 'html' });
        assert.strictEqual(renderedHtmlNoValue, `<code tabindex="0"><a href="code-setting://example.booleanSetting/true" class="codesetting" title="View or change setting" aria-role="button"><svg width="14" height="14" viewBox="0 0 15 15" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.8 1.3-2-.8-.8-2 1.3-.7-.2zM9.4 1l.5 2.4L12 2.1l2 2-1.4 2.1 2.4.4v2.8l-2.4.5L14 12l-2 2-2.1-1.4-.5 2.4H6.6l-.5-2.4L4 13.9l-2-2 1.4-2.1L1 9.4V6.6l2.4-.5L2.1 4l2-2 2.1 1.4.4-2.4h2.8zm.6 7c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zM8 9c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1z"/></svg>
			<span class="separator"></span>
			<span class="setting-name">example.booleanSetting</span>
		</a></code>`);
    });
    test('actions with no value', () => {
        const uri = URI.parse(settingRenderer.settingToUriString('example.booleanSetting'));
        const actions = settingRenderer.getActions(uri);
        assert.strictEqual(actions?.length, 2);
        assert.strictEqual(actions[0].label, 'View "Example: Boolean Setting" in Settings');
    });
    test('actions with value + updating and restoring', async () => {
        await configurationService.setUserConfiguration('example', { stringSetting: 'two' });
        const uri = URI.parse(settingRenderer.settingToUriString('example.stringSetting', 'three'));
        const verifyOriginalState = (actions) => {
            assert.strictEqual(actions?.length, 3);
            assert.strictEqual(actions[0].label, 'Set "Example: String Setting" to "three"');
            assert.strictEqual(actions[1].label, 'View in Settings');
            assert.strictEqual(configurationService.getValue('example.stringSetting'), 'two');
            return true;
        };
        const actions = settingRenderer.getActions(uri);
        if (verifyOriginalState(actions)) {
            // Update the value
            await actions[0].run();
            assert.strictEqual(configurationService.getValue('example.stringSetting'), 'three');
            const actionsUpdated = settingRenderer.getActions(uri);
            assert.strictEqual(actionsUpdated?.length, 3);
            assert.strictEqual(actionsUpdated[0].label, 'Restore value of "Example: String Setting"');
            assert.strictEqual(actions[1].label, 'View in Settings');
            assert.strictEqual(actions[2].label, 'Copy Setting ID');
            assert.strictEqual(configurationService.getValue('example.stringSetting'), 'three');
            // Restore the value
            await actionsUpdated[0].run();
            verifyOriginalState(settingRenderer.getActions(uri));
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Rvd25TZXR0aW5nUmVuZGVyZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21hcmtkb3duL3Rlc3QvYnJvd3Nlci9tYXJrZG93blNldHRpbmdSZW5kZXJlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUU1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFzQixVQUFVLEVBQThDLE1BQU0sdUVBQXVFLENBQUM7QUFDbkssT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFFekgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR2pGLE1BQU0sYUFBYSxHQUF1QjtJQUN6QyxJQUFJLEVBQUUsVUFBVTtJQUNoQixPQUFPLEVBQUUsVUFBVTtJQUNuQixNQUFNLEVBQUUsUUFBUTtJQUNoQixZQUFZLEVBQUU7UUFDYix3QkFBd0IsRUFBRTtZQUN6QixNQUFNLEVBQUUsU0FBUztZQUNqQixTQUFTLEVBQUUsS0FBSztZQUNoQixPQUFPLHdDQUFnQztTQUN2QztRQUNELHlCQUF5QixFQUFFO1lBQzFCLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLFNBQVMsRUFBRSxJQUFJO1lBQ2YsT0FBTyx3Q0FBZ0M7U0FDdkM7UUFDRCx1QkFBdUIsRUFBRTtZQUN4QixNQUFNLEVBQUUsUUFBUTtZQUNoQixTQUFTLEVBQUUsS0FBSztZQUNoQixPQUFPLHdDQUFnQztTQUN2QztRQUNELHVCQUF1QixFQUFFO1lB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