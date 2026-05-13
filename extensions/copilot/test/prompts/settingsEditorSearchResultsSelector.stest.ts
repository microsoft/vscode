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
	stest.skip({ description: 'Selects expected command center setting' }, async (testingServiceCollection) => {
		const accessor = testingServiceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);

		const selector = instantiationService.createInstance(SettingsEditorSearchResultsSelector);
		const settingsList: SettingListItem[] = [
			{
				'key': 'search.actionsPosition',
				'type': 'string',
				'description': 'Controls the positioning of the actionbar on rows in the search view.',
				'enum': [
					'auto',
					'right'
				],
				'enumDescriptions': [
					'Position the actionbar to the right when the search view is narrow, and immediately after the content when the search view is wide.',
					'Always position the actionbar to the right.'
				]
			},
			{
				'key': 'debug.toolBarLocation',
				'type': 'string',
				'markdownDescription': 'Controls the location of the debug toolbar. Either `floating` in all views, `docked` in the debug view, `commandCenter` (requires `#window.commandCenter#`), or `hidden`.',
				'enum': [
					'floating',
					'docked',
					'commandCenter',
					'hidden'
				]
			},
			{
				'key': 'workbench.activityBar.location',
				'type': 'string',
				'markdownDescription': 'Controls the location of the Activity Bar relative to the Primary and Secondary Side Bars.',
				'enum': [
					'default',
					'top',
					'bottom',
					'hidden'
				],
				'enumDescriptions': [
					'Show the Activity Bar on the side of the Primary Side Bar and on top of the Secondary Side Bar.',
					'Show the Activity Bar on top of the Primary and Secondary Side Bars.',
					'Show the Activity Bar at the bottom of the Primary and Secondary Side Bars.',
					'Hide the Activity Bar in the Primary and Secondary Side Bars.'
				]
			},
			{
				'key': 'debug.hideLauncherWhileDebugging',
				'type': 'boolean',
				'markdownDescription': 'Hide \'Start Debugging\' control in title bar of \'Run and Debug\' view while debugging is active. Only relevant when `#debug.toolBarLocation#` is not `docked`.'
			},
			{
				'key': 'workbench.view.alwaysShowHeaderActions',
				'type': 'boolean',
				'description': 'Controls the visibility of view header actions. View header actions may either be always visible, or only visible when that view is focused or hovered over.'
			},
			{
				'key': 'workbench.sideBar.location',
				'type': 'string',
				'description': 'Controls the location of the primary side bar and activity bar. They can either show on the left or right of the workbench. The secondary side bar will show on the opposite side of the workbench.',
				'enum': [
					'left',
					'right'
				]
			},
			{
				'key': 'window.menuBarVisibility',
				'type': 'string',
				'markdownDescription': `Control the visibility of the menu bar. A setting of 'toggle' means that the menu bar is hidden and a single press of the Alt key will show it. A setting of 'compact' will move the menu into the side bar.`,
				'enum': [
					'classic',
					'visible',
					'toggle',
					'hidden',
					'compact'
				]
			},
			{
				'key': 'window.customTitleBarVisibility',
				'type': 'string',
				'markdownDescription': 'Adjust when the custom title bar should be shown. The custom title bar can be hidden when in full screen mode with `windowed`. The custom title bar can only be hidden in non full screen mode with `never` when `#window.titleBarStyle#` is set to `native`.',
				'enum': [
					'auto',
					'windowed',
					'never'
				]
			},
			{
				'key': 'search.seedOnFocus',
				'type': 'boolean',
				'markdownDescription': 'Update the search query to the editor\'s selected text when focusing the search view. This happens either on click or when triggering the `workbench.views.search.focus` command.'
			},
			{
				'key': 'search.searchOnType',
				'type': 'boolean',
				'description': 'Search all files as you type.'
			},
			{
				'key': 'editor.find.addExtraSpaceOnTop',
				'type': 'boolean',
				'description': 'Controls whether the Find Widget should add extra lines on top of the editor. When true, you can scroll beyond the first line when the Find Widget is visible.'
			},
			{
				'key': 'search.quickOpen.includeHistory',
				'type': 'boolean',
				'description': 'Whether to include results from recently opened files in the file results for Quick Open.'
			},
			{
				'key': 'search.searchEditor.focusResultsOnSearch',
				'type': 'boolean',
				'markdownDescription': 'When a search is triggered, focus the Search Editor results instead of the Search Editor input.'
			},
			{
				'key': 'search.defaultViewMode',
				'type': 'string',
				'description': 'Controls the default search result view mode.',
				'enum': [
					'tree',
					'list'
				],
				'enumDescriptions': [
					'Shows search results as a tree.',
					'Shows search results as a list.'
				]
			},
			{
				'key': 'editor.scrollbar.horizontal',
				'type': 'string',
				'description': 'Controls the visibility of the horizontal scrollbar.',
				'enum': [
					'auto',
					'visible',
					'hidden'
				],
				'enumDescriptions': [
					'The horizontal scrollbar will be visible only when necessary.',
					'The horizontal scrollbar will always be visible.',
					'The horizontal scrollbar will always be hidden.'
				]
			},
			{
				'key': 'accessibility.hideAccessibleView',
				'type': 'boolean',
				'description': 'Controls whether the Accessible View is hidden.'
			},
			{
				'key': 'search.quickAccess.preserveInput',
				'type': 'boolean',
				'description': 'Controls whether the last typed input to Quick Search should be restored when opening it the next time.'
			},
			{
				'key': 'workbench.layoutControl.enabled',
				'type': 'boolean',
				'markdownDescription': 'Controls whether the layout control is shown in the custom title bar. This setting only has an effect when `#window.customTitleBarVisibility#` is not set to `never`.'
			},
			{
				'key': 'terminal.integrated.accessibleViewPreserveCursorPosition',
				'type': 'boolean',
				'markdownDescription': `Preserve the cursor position on reopen of the terminal's accessible view rather than setting it to the bottom of the buffer.`
			},
			{
				'key': 'notebook.find.filters',
				'type': 'object',
				'markdownDescription': 'Customize the Find Widget behavior for searching within notebook cells. When both markup source and markup preview are enabled, the Find Widget will search either the source code or preview based on the current state of the cell.'
			},
			{
				'key': '[search-result]',
				'type': 'object',
				'description': 'Configure settings to be overridden for the search-result language.'
			},
			{
				'key': 'workbench.commandPalette.experimental.enableNaturalLanguageSearch',
				'type': 'boolean',
				'description': 'Controls whether the command palette should include similar commands. You must have an extension installed that provides Natural Language support.'
			},
			{
				'key': 'window.commandCenter',
				'type': 'boolean',
				'markdownDescription': 'Show command launcher together with the window title. This setting only has an effect when `#window.customTitleBarVisibility#` is not set to `never`.'
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
				'key': 'editor.scrollbar.vertical',
				'type': 'string',
				'description': 'Controls the visibility of the vertical scrollbar.',
				'enum': [
					'auto',
					'visible',
					'hidden'
				],
				'enumDescriptions': [
					'The vertical scrollbar will be visible only when necessary.',
					'The vertical scrollbar will always be visible.',
					'The vertical scrollbar will always be hidden.'
				]
			},
		];
		const endpointProvider = accessor.get(IEndpointProvider);
		const endpoint = await endpointProvider.getChatEndpoint('copilot-base');
		const results = await selector.selectTopSearchResults(endpoint, 'Hide search bar at top of window', settingsList, CancellationToken.None);
		assert.ok(results.length > 0, 'No settings were selected');
		assert.ok(results.some(result => result === 'window.commandCenter'), 'Expected setting "window.commandCenter" was not found');
	});

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
				'key': 'github.copilot.chat.newWorkspaceCreation.enabled',
				'type': 'boolean',
				'description': 'Whether to enable new agentic workspace creation.'
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
		const endpoint = await endpointProvider.getChatEndpoint('copilot-base');
		const results = await selector.selectTopSearchResults(endpoint, 'agentmode', settingsList, CancellationToken.None);
		assert.ok(results.length > 0, 'No settings were selected');
		assert.ok(results.some(result => result === 'chat.agent.enabled'), 'Expected setting "chat.agent.enabled" was not found');
	});
});
