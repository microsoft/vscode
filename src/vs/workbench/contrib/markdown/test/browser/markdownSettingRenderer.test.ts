/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { Registry } from 'vs/platform/registry/common/platform';
import { SimpleSettingRenderer } from 'vs/workbench/contrib/markdown/browser/markdownSettingRenderer';

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
	let settingRenderer: SimpleSettingRenderer;

	suiteSetup(() => {
		configurationService = new MarkdownConfigurationService();
		Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(configuration);
		settingRenderer = new SimpleSettingRenderer(configurationService);
	});

	suiteTeardown(() => {
		Registry.as<IConfigurationRegistry>(Extensions.Configuration).deregisterConfigurations([configuration]);
	});

	test('render boolean setting', () => {
		const htmlRenderer = settingRenderer.getHtmlRenderer();
		const htmlNoValue = '<span codesetting="example.booleanSetting">';
		const renderedHtmlNoValue = htmlRenderer(htmlNoValue);
		assert.equal(renderedHtmlNoValue,
			`(<a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.booleanSetting%22%5D">View "Example: Boolean Setting" in Settings</a>)`);

		const htmlWithValue = '<span codesetting="example.booleanSetting:true">';
		const renderedHtmlWithValue = htmlRenderer(htmlWithValue);
		assert.equal(renderedHtmlWithValue,
			`(<a href="code-setting://example.booleanSetting/true">Enable "Example: Boolean Setting" now</a> | <a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.booleanSetting%22%5D">View in Settings</a>)`);

		const htmlWithValueSetToFalse = '<span codesetting="example.booleanSetting2:false">';
		const renderedHtmlWithValueSetToFalse = htmlRenderer(htmlWithValueSetToFalse);
		assert.equal(renderedHtmlWithValueSetToFalse,
			`(<a href="code-setting://example.booleanSetting2/false">Disable "Example: Boolean Setting2" now</a> | <a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.booleanSetting2%22%5D">View in Settings</a>)`);

		const htmlSameValue = '<span codesetting="example.booleanSetting:false">';
		const renderedHtmlSameValue = htmlRenderer(htmlSameValue);
		assert.equal(renderedHtmlSameValue,
			`(<a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.booleanSetting%22%5D">View "Example: Boolean Setting" in Settings</a>)`);
	});

	test('render string setting', () => {
		const htmlRenderer = settingRenderer.getHtmlRenderer();
		const htmlNoValue = '<span codesetting="example.stringSetting">';
		const renderedHtmlNoValue = htmlRenderer(htmlNoValue);
		assert.equal(renderedHtmlNoValue,
			`(<a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.stringSetting%22%5D">View "Example: String Setting" in Settings</a>)`);

		const htmlWithValue = '<span codesetting="example.stringSetting:two">';
		const renderedHtmlWithValue = htmlRenderer(htmlWithValue);
		assert.equal(renderedHtmlWithValue,
			`(<a href="code-setting://example.stringSetting/two">Set "Example: String Setting" to "two" now</a> | <a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.stringSetting%22%5D">View in Settings</a>)`);

		const htmlSameValue = '<span codesetting="example.stringSetting:one">';
		const renderedHtmlSameValue = htmlRenderer(htmlSameValue);
		assert.equal(renderedHtmlSameValue,
			`(<a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.stringSetting%22%5D">View "Example: String Setting" in Settings</a>)`);
	});

	test('render number setting', () => {
		const htmlRenderer = settingRenderer.getHtmlRenderer();
		const htmlNoValue = '<span codesetting="example.numberSetting">';
		const renderedHtmlNoValue = htmlRenderer(htmlNoValue);
		assert.equal(renderedHtmlNoValue,
			`(<a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.numberSetting%22%5D">View "Example: Number Setting" in Settings</a>)`);

		const htmlWithValue = '<span codesetting="example.numberSetting:2">';
		const renderedHtmlWithValue = htmlRenderer(htmlWithValue);
		assert.equal(renderedHtmlWithValue,
			`(<a href="code-setting://example.numberSetting/2">Set "Example: Number Setting" to 2 now</a> | <a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.numberSetting%22%5D">View in Settings</a>)`);

		const htmlSameValue = '<span codesetting="example.numberSetting:3">';
		const renderedHtmlSameValue = htmlRenderer(htmlSameValue);
		assert.equal(renderedHtmlSameValue,
			`(<a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.numberSetting%22%5D">View "Example: Number Setting" in Settings</a>)`);
	});

	test('updating and restoring the setting through the renderer changes what is rendered', async () => {
		await configurationService.setUserConfiguration('example', { stringSetting: 'two' });
		const htmlRenderer = settingRenderer.getHtmlRenderer();
		const htmlWithValue = '<span codesetting="example.stringSetting:three">';
		const renderedHtmlWithValue = htmlRenderer(htmlWithValue);
		assert.equal(renderedHtmlWithValue,
			`(<a href="code-setting://example.stringSetting/three">Set "Example: String Setting" to "three" now</a> | <a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.stringSetting%22%5D">View in Settings</a>)`);
		assert.equal(configurationService.getValue('example.stringSetting'), 'two');

		// Update the value
		await settingRenderer.updateSettingValue(URI.parse(`${Schemas.codeSetting}://example.stringSetting/three`));
		assert.equal(configurationService.getValue('example.stringSetting'), 'three');
		const renderedHtmlWithValueAfterUpdate = htmlRenderer(htmlWithValue);
		assert.equal(renderedHtmlWithValueAfterUpdate,
			`(<a href="code-setting://example.stringSetting/two">Restore value of "Example: String Setting"</a> | <a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.stringSetting%22%5D">View in Settings</a>)`);

		// Restore the value
		await settingRenderer.updateSettingValue(URI.parse(`${Schemas.codeSetting}://example.stringSetting/two`));
		assert.equal(configurationService.getValue('example.stringSetting'), 'two');
		const renderedHtmlWithValueAfterRestore = htmlRenderer(htmlWithValue);
		assert.equal(renderedHtmlWithValueAfterRestore,
			`(<a href="code-setting://example.stringSetting/three">Set "Example: String Setting" to "three" now</a> | <a href="command:workbench.action.openSettings?%5B%22%40id%3Aexample.stringSetting%22%5D">View in Settings</a>)`);
	});
});
