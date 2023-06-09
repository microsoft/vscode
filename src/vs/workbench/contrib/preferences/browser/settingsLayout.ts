/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IProductService } from 'vs/platform/product/common/productService';
import { getExperimentalExtensionToggleData } from 'vs/workbench/contrib/preferences/common/preferences';
import { IWorkbenchAssignmentService } from 'vs/workbench/services/assignment/common/assignmentService';
export interface ITOCEntry<T> {
	id: string;
	label: string;
	order?: number;
	children?: ITOCEntry<T>[];
	settings?: Array<T>;
}

const defaultCommonlyUsedSettings: string[] = [
	'files.autoSave',
	'editor.fontSize',
	'editor.fontFamily',
	'editor.tabSize',
	'editor.renderWhitespace',
	'editor.cursorStyle',
	'editor.multiCursorModifier',
	'editor.insertSpaces',
	'editor.wordWrap',
	'files.exclude',
	'files.associations',
	'workbench.editor.enablePreview'
];

export async function getCommonlyUsedData(workbenchAssignmentService: IWorkbenchAssignmentService, environmentService: IEnvironmentService, productService: IProductService): Promise<ITOCEntry<string>> {
	const toggleData = await getExperimentalExtensionToggleData(workbenchAssignmentService, environmentService, productService);
	return {
		id: 'commonlyUsed',
		label: localize('commonlyUsed', "Commonly Used"),
		settings: toggleData ? toggleData.commonlyUsed : defaultCommonlyUsedSettings
	};
}

export const tocData: ITOCEntry<string> = {
	id: 'root',
	label: 'root',
	children: [
		{
			id: 'editor',
			label: localize('textEditor', "Text Editor"),
			settings: ['editor.*'],
			children: [
				{
					id: 'editor/cursor',
					label: localize('cursor', "Cursor"),
					settings: ['editor.cursor*']
				},
				{
					id: 'editor/find',
					label: localize('find', "Find"),
					settings: ['editor.find.*']
				},
				{
					id: 'editor/font',
					label: localize('font', "Font"),
					settings: ['editor.font*']
				},
				{
					id: 'editor/format',
					label: localize('formatting', "Formatting"),
					settings: ['editor.format*']
				},
				{
					id: 'editor/diffEditor',
					label: localize('diffEditor', "Diff Editor"),
					settings: ['diffEditor.*']
				},
				{
					id: 'editor/minimap',
					label: localize('minimap', "Minimap"),
					settings: ['editor.minimap.*']
				},
				{
					id: 'editor/suggestions',
					label: localize('suggestions', "Suggestions"),
					settings: ['editor.*suggest*']
				},
				{
					id: 'editor/files',
					label: localize('files', "Files"),
					settings: ['files.*']
				}
			]
		},
		{
			id: 'workbench',
			label: localize('workbench', "Workbench"),
			settings: ['workbench.*'],
			children: [
				{
					id: 'workbench/appearance',
					label: localize('appearance', "Appearance"),
					settings: ['workbench.activityBar.*', 'workbench.*color*', 'workbench.fontAliasing', 'workbench.iconTheme', 'workbench.sidebar.location', 'workbench.*.visible', 'workbench.tips.enabled', 'workbench.tree.*', 'workbench.view.*']
				},
				{
					id: 'workbench/breadcrumbs',
					label: localize('breadcrumbs', "Breadcrumbs"),
					settings: ['breadcrumbs.*']
				},
				{
					id: 'workbench/editor',
					label: localize('editorManagement', "Editor Management"),
					settings: ['workbench.editor.*']
				},
				{
					id: 'workbench/settings',
					label: localize('settings', "Settings Editor"),
					settings: ['workbench.settings.*']
				},
				{
					id: 'workbench/zenmode',
					label: localize('zenMode', "Zen Mode"),
					settings: ['zenmode.*']
				},
				{
					id: 'workbench/screencastmode',
					label: localize('screencastMode', "Screencast Mode"),
					settings: ['screencastMode.*']
				}
			]
		},
		{
			id: 'window',
			label: localize('window', "Window"),
			settings: ['window.*'],
			children: [
				{
					id: 'window/newWindow',
					label: localize('newWindow', "New Window"),
					settings: ['window.*newwindow*']
				}
			]
		},
		{
			id: 'features',
			label: localize('features', "Features"),
			children: [
				{
					id: 'features/accessibility',
					label: localize('accessibility', "Accessibility"),
					settings: ['accessibility.*']
				},
				{
					id: 'features/explorer',
					label: localize('fileExplorer', "Explorer"),
					settings: ['explorer.*', 'outline.*']
				},
				{
					id: 'features/search',
					label: localize('search', "Search"),
					settings: ['search.*']
				},
				{
					id: 'features/debug',
					label: localize('debug', "Debug"),
					settings: ['debug.*', 'launch']
				},
				{
					id: 'features/testing',
					label: localize('testing', "Testing"),
					settings: ['testing.*']
				},
				{
					id: 'features/scm',
					label: localize('scm', "Source Control"),
					settings: ['scm.*']
				},
				{
					id: 'features/extensions',
					label: localize('extensions', "Extensions"),
					settings: ['extensions.*']
				},
				{
					id: 'features/terminal',
					label: localize('terminal', "Terminal"),
					settings: ['terminal.*']
				},
				{
					id: 'features/task',
					label: localize('task', "Task"),
					settings: ['task.*']
				},
				{
					id: 'features/problems',
					label: localize('problems', "Problems"),
					settings: ['problems.*']
				},
				{
					id: 'features/output',
					label: localize('output', "Output"),
					settings: ['output.*']
				},
				{
					id: 'features/comments',
					label: localize('comments', "Comments"),
					settings: ['comments.*']
				},
				{
					id: 'features/remote',
					label: localize('remote', "Remote"),
					settings: ['remote.*']
				},
				{
					id: 'features/timeline',
					label: localize('timeline', "Timeline"),
					settings: ['timeline.*']
				},
				{
					id: 'features/notebook',
					label: localize('notebook', 'Notebook'),
					settings: ['notebook.*', 'interactiveWindow.*']
				},
				{
					id: 'features/audioCues',
					label: localize('audioCues', 'Audio Cues'),
					settings: ['audioCues.*']
				},
				{
					id: 'features/mergeEditor',
					label: localize('mergeEditor', 'Merge Editor'),
					settings: ['mergeEditor.*']
				},
				{
					id: 'features/chat',
					label: localize('chat', 'Chat'),
					settings: ['chat.*', 'inlineChat.*']
				}
			]
		},
		{
			id: 'application',
			label: localize('application', "Application"),
			children: [
				{
					id: 'application/http',
					label: localize('proxy', "Proxy"),
					settings: ['http.*']
				},
				{
					id: 'application/keyboard',
					label: localize('keyboard', "Keyboard"),
					settings: ['keyboard.*']
				},
				{
					id: 'application/update',
					label: localize('update', "Update"),
					settings: ['update.*']
				},
				{
					id: 'application/telemetry',
					label: localize('telemetry', "Telemetry"),
					settings: ['telemetry.*']
				},
				{
					id: 'application/settingsSync',
					label: localize('settingsSync', "Settings Sync"),
					settings: ['settingsSync.*']
				},
				{
					id: 'application/experimental',
					label: localize('experimental', "Experimental"),
					settings: ['application.experimental.*']
				},
				{
					id: 'application/other',
					label: localize('other', "Other"),
					settings: ['application.*']
				}
			]
		},
		{
			id: 'security',
			label: localize('security', "Security"),
			settings: isWindows ? ['security.*'] : undefined,
			children: [
				{
					id: 'security/workspace',
					label: localize('workspace', "Workspace"),
					settings: ['security.workspace.*']
				}
			]
		}
	]
};

export const knownAcronyms = new Set<string>();
[
	'css',
	'html',
	'scss',
	'less',
	'json',
	'js',
	'ts',
	'ie',
	'id',
	'php',
	'scm',
].forEach(str => knownAcronyms.add(str));

export const knownTermMappings = new Map<string, string>();
knownTermMappings.set('power shell', 'PowerShell');
knownTermMappings.set('powershell', 'PowerShell');
knownTermMappings.set('javascript', 'JavaScript');
knownTermMappings.set('typescript', 'TypeScript');
