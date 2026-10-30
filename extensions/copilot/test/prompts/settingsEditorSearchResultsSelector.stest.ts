/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { SettingsEditorSearchResultsSelector } from '../../src/extension/prompt/node/settingsEditorSearchResultsSelector';
import { SettingListItem } from '../../src/platform/embeddings/common/vscodeIndex';
import { IEndpointProvider } from '../../src/platform/endpoint/common/endpointProvider';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ssuite, stest } from '../base/stest';

ssuite({ title: 'settingsEditorSearchResultsSelector', location: 'external' }, () => {
	stest({ description: 'Selects expected agent mode setting' }, async (testingServiceCollection) => {
		const accessor = testingServiceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);

		const selector = instantiationService.createInstance(SettingsEditorSearchResultsSelector);
		const settingsList: SettingListItem[] = [
			{
				'key': 'github.copilot.chat.codesearch.enabled',
				'type': 'boolean',
				'markdownDescription': 'Whether to enable agentic codesearch when using `#codebase`.'
			},
			{
				'key': 'chat.agent.enabled',
				'type': 'boolean',
				'description': 'Enable agent mode for Copilot Chat. When this is enabled, a dropdown appears in the view to toggle agent mode.'
			},
			{
				'key': 'github.copilot.chat.agent.runTasks',
				'type': 'boolean',
				'description': 'Configures whether Copilot Edits can run workspace tasks in agent mode.'
			},
			{
				'key': 'chat.mcp.enabled',
				'type': 'boolean',
				'description': 'Enables integration with Model Context Protocol servers to provide additional tools and functionality.'
			},
			{
				'key': 'github.copilot.advanced',
				'type': 'object'
			},
			{
				'key': 'scm.autoReveal',
				'type': 'boolean',
				'description': 'Controls whether the Source Control view should automatically reveal and select files when opening them.'
			},
			{
				'key': 'search.mode',
				'type': 'string',
				'markdownDescription': 'Controls where new `Search: Find in Files` and `Find in Folder` operations occur: either in the search view, or in a search editor.',
				'enum': [
					'view',
					'reuseEditor',
					'newEditor'
				],
				'enumDescriptions': [
					'Search in the search view, either in the panel or side bars.',
					'Search in an existing search editor if present, otherwise in a new search editor.',
					'Search in a new search editor.'
				]
			},
			{
				'key': 'mcp',
				'type': 'object',
				'description': 'Model Context Protocol server configurations'
			},
			{
				'key': 'notebook.experimental.generate',
				'type': 'boolean',
				'markdownDescription': 'Enable experimental generate action to create code cell with inline chat enabled.'
			},
			{
				'key': 'workbench.settings.enableNaturalLanguageSearch',
				'type': 'boolean',
				'description': 'Controls whether to enable the natural language search mode for settings. The natural language search is provided by a Microsoft online service.'
			},
			{
				'key': 'workbench.commandPalette.experimental.enableNaturalLanguageSearch',
				'type': 'boolean',
				'description': 'Controls whether the command palette should include similar commands. You must have an extension installed that provides Natural Language support.'
			},
			{
				'key': 'github.copilot.chat.completionContext.typescript.mode',
				'type': 'string',
				'markdownDescription': 'The execution mode of the TypeScript Copilot context provider.',
				'enum': [
					'off',
					'sidecar',
					'on'
				]
			},
			{
				'key': 'chat.tools.autoApprove',
				'type': 'boolean',
				'description': 'Controls whether tool use should be automatically approved.'
			},
			{
				'key': 'github.copilot.chat.agent.thinkingTool',
				'type': 'boolean',
				'markdownDescription': 'Enables the thinking tool that allows Copilot to think deeply about your request before generating a response in agent mode.'
			},
			{
				'key': 'testing.automaticallyOpenPeekView',
				'type': 'string',
				'description': 'Configures when the error Peek view is automatically opened.',
				'enum': [
					'failureAnywhere',
					'failureInVisibleDocument',
					'never'
				],
				'enumDescriptions': [
					'Open automatically no matter where the failure is.',
					'Open automatically when a test fails in a visible document.',
					'Never automatically open.'
				]
			},
			{
				'key': 'typescript.autoClosingTags',
				'type': 'boolean',
				'description': 'Enable/disable automatic closing of JSX tags.'
			},
			{
				'key': 'typescript.tsserver.web.typeAcquisition.enabled',
				'type': 'boolean',
				'description': 'Enable/disable package acquisition on the web. This enables IntelliSense for imported packages. Requires `#typescript.tsserver.web.projectWideIntellisense.enabled#`. Currently not supported for Safari.'
			},
			{
				'key': 'workbench.editor.alwaysShowEditorActions',
				'type': 'boolean',
				'markdownDescription': 'Controls whether to always show the editor actions, even when the editor group is not active.'
			},
			{
				'key': 'javascript.autoClosingTags',
				'type': 'boolean',
				'description': 'Enable/disable automatic closing of JSX tags.'
			},
			{
				'key': 'editor.guides.highlightActiveBracketPair',
				'type': 'boolean',
				'description': 'Controls whether the editor should highlight the active bracket pair.'
			},
			{
				'key': 'workbench.enableExperiments',
				'type': 'boolean',
				'description': 'Fetches experiments to run from a Microsoft online service.'
			},
			{
				'key': 'workbench.list.openMode',
				'type': 'string',
				'description': 'Controls how to open items in trees and lists using the mouse (if supported). Note that some trees and lists might choose to ignore this setting if it is not applicable.',
				'enum': [
					'singleClick',
					'doubleClick'
				]
			},
			{
				'key': 'scm.alwaysShowActions',
				'type': 'boolean',
				'description': 'Controls whether inline actions are always visible in the Source Control view.'
			},
			{
				'key': 'chat.detectParticipant.enabled',
				'type': 'boolean',
				'description': 'Enables chat participant autodetection for panel chat.'
			},
		];

		const endpointProvider = accessor.get(IEndpointProvider);
		const endpoint = await endpointProvider.getChatEndpoint('copilot-utility');
		const results = await selector.selectTopSearchResults(endpoint, 'agentmode', settingsList, CancellationToken.None);
		assert.ok(results.length > 0, 'No settings were selected');
		assert.ok(results.some(result => result === 'chat.agent.enabled'), 'Expected setting "chat.agent.enabled" was not found');
	});
});
