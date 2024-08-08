/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { IAction } from 'vs/base/common/actions';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Registry } from 'vs/platform/registry/common/platform';
import { SimpleSettingRenderer } from 'vs/workbench/contrib/markdown/browser/markdownSettingRenderer';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';

const configuration: IConfigurationNode = {
	'id': 'examples',
	'title': 'Examples',
	'type': 'object',
	'properties': {
		'example.booleanSetting': {
			'type': 'boolean',
			'default': false,
			'scope': ConfigurationScope.APPLICATION
		},
		'example.booleanSetting2': {
			'type': 'boolean',
			'default': true,
			'scope': ConfigurationScope.APPLICATION
		},
		'example.stringSetting': {
			'type': 'string',
			'default': 'one',
			'scope': ConfigurationScope.APPLICATION
		},
		'example.numberSetting': {
			'type': 'number',
			'default': 3,
			'scope': ConfigurationScope.APPLICATION
		}
	}
};

class MarkdownConfigurationService extends TestConfigurationService {
	override async updateValue(key: string, value: any): Promise<void> {
		const [section, setting] = key.split('.');
		return this.setUserConfiguration(section, { [setting]: value });
	}
}

suite('Markdown Setting Renderer Test', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let configurationService: TestConfigurationService;
	let preferencesService: IPreferencesService;
	let contextMenuService: IContextMenuService;
	let settingRenderer: SimpleSettingRenderer;

	suiteSetup(() => {
		configurationService = new MarkdownConfigurationService();
		preferencesService = <IPreferencesService>{
			getSetting: (setting) => {
				let type = 'boolean';
				if (setting.includes('string')) {
					type = 'string';
				}
				return { type, key: setting };
			}
		};
		contextMenuService = <IContextMenuService>{};
		Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(configuration);
		settingRenderer = new SimpleSettingRenderer(configurationService, contextMenuService, preferencesService, { publicLog2: () => { } } as any, { writeText: async () => { } } as any);
	});

	suiteTeardown(() => {
		Registry.as<IConfigurationRegistry>(Extensions.Configuration).deregisterConfigurations([configuration]);
	});

	test('render code setting button with value', () => {
		const htmlRenderer = settingRenderer.getHtmlRenderer();
		const htmlNoValue = '<a href="code-oss://settings/example.booleanSetting" codesetting="true">';
		const renderedHtmlNoValue = htmlRenderer({ block: false, raw: htmlNoValue, pre: false, text: '', type: 'html' });
		assert.strictEqual(renderedHtmlNoValue,
			`<code tabindex="0"><a href="code-setting://example.booleanSetting/true" class="codesetting" title="View or change setting" aria-role="button"><svg width="14" height="14" viewBox="0 0 15 15" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.8 1.3-2-.8-.8-2 1.3-.7-.2zM9.4 1l.5 2.4L12 2.1l2 2-1.4 2.1 2.4.4v2.8l-2.4.5L14 12l-2 2-2.1-1.4-.5 2.4H6.6l-.5-2.4L4 13.9l-2-2 1.4-2.1L1 9.4V6.6l2.4-.5L2.1 4l2-2 2.1 1.4.4-2.4h2.8zm.6 7c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zM8 9c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1z"/></svg>
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

		const verifyOriginalState = (actions: IAction[] | undefined): actions is IAction[] => {
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
