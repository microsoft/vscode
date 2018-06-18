/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISetting } from 'vs/workbench/services/preferences/common/preferences';

export interface ITOCEntry {
	id: string;
	label: string;

	children?: ITOCEntry[];
	settings?: (string | ISetting)[];
}

export const tocData: ITOCEntry = {
	id: 'root',
	label: 'root',
	children: [
		{
			id: 'editor',
			label: 'Text Editor',
			children: [
				{
					id: 'editor/cursor',
					label: 'Cursor',
					settings: ['editor.cursor*']
				},
				{
					id: 'editor/find',
					label: 'Find',
					settings: ['editor.find.*']
				},
				{
					id: 'editor/font',
					label: 'Font',
					settings: ['editor.font*']
				},
				{
					id: 'editor/format',
					label: 'Format',
					settings: ['editor.format*']
				},
				{
					id: 'editor/diff',
					label: 'Diff Editor',
					settings: ['diffEditor.*']
				},
				{
					id: 'editor/minimap',
					label: 'Minimap',
					settings: ['editor.minimap.*']
				},
				{
					id: 'editor/suggestions',
					label: 'Suggestions',
					settings: ['editor.*suggestion*']
				},
				{
					id: 'editor/files',
					label: 'Files',
					settings: ['files.*']
				},
				{
					id: 'editor/editor',
					label: 'Editor',
					settings: ['editor.*']
				}
			]
		},
		{
			id: 'workbench',
			label: 'Workbench',
			children: [
				{
					id: 'workbench/appearance',
					label: 'Appearance',
					settings: ['workbench.activityBar.*', 'workbench.*color*', 'workbench.fontAliasing', 'workbench.iconTheme', 'workbench.sidebar.location', 'workbench.*.visible', 'workbench.tips.enabled', 'workbench.tree.*', 'workbench.view.*']
				},
				{
					id: 'workbench/editor',
					label: 'Editor Management',
					settings: ['workbench.editor.*']
				},
				{
					id: 'workbench/zenmode',
					label: 'Zen Mode',
					settings: ['zenmode.*']
				},
				{
					id: 'workbench/workbench',
					label: 'Workbench',
					settings: ['workbench.*']
				}
			]
		},
		{
			id: 'window',
			label: 'Window',
			children: [
				{
					id: 'window/newWindow',
					label: 'New Window',
					settings: ['window.*newwindow*']
				},
				{
					id: 'window/window',
					label: 'Window',
					settings: ['window.*']
				}
			]
		},
		{
			id: 'features',
			label: 'Features',
			children: [
				{
					id: 'features/explorer',
					label: 'File Explorer',
					settings: ['explorer.*', 'outline.*']
				},
				{
					id: 'features/search',
					label: 'Search',
					settings: ['search.*']
				}
				,
				{
					id: 'features/debug',
					label: 'Debug',
					settings: ['debug.*', 'launch']
				},
				{
					id: 'features/scm',
					label: 'SCM',
					settings: ['scm.*']
				},
				{
					id: 'features/extensions',
					label: 'Extension Viewlet',
					settings: ['extensions.*']
				},
				{
					id: 'features/terminal',
					label: 'Terminal',
					settings: ['terminal.*']
				},
				{
					id: 'features/problems',
					label: 'Problems',
					settings: ['problems.*']
				}
			]
		},
		{
			id: 'application',
			label: 'Application',
			children: [
				{
					id: 'application/http',
					label: 'Proxy',
					settings: ['http.*']
				},
				{
					id: 'application/keyboard',
					label: 'Keyboard',
					settings: ['keyboard.*']
				},
				{
					id: 'application/update',
					label: 'Update',
					settings: ['update.*']
				},
				{
					id: 'application/telemetry',
					label: 'Telemetry',
					settings: ['telemetry.*']
				}
			]
		},
		{
			id: 'extensions',
			label: 'Extensions',
			settings: ['*']
		}
	]
};
