/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { localize } from 'vs/nls';
import { IViewsService, ViewsRegistry, IViewDescriptor } from 'vs/workbench/common/views';
import { OutlinePanel } from './outlinePanel';
import { MenuRegistry } from 'vs/platform/actions/common/actions';
import { VIEW_CONTAINER } from 'vs/workbench/parts/files/common/files';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { OutlineConfigKeys, OutlineViewId } from 'vs/workbench/parts/outline/electron-browser/outline';

const _outlineDesc = <IViewDescriptor>{
	id: OutlineViewId,
	name: localize('name', "Outline"),
	ctor: OutlinePanel,
	container: VIEW_CONTAINER,
	canToggleVisibility: true,
	hideByDefault: false,
	collapsed: true,
	order: 2,
	weight: 30
};

ViewsRegistry.registerViews([_outlineDesc]);

CommandsRegistry.registerCommand('outline.focus', accessor => {
	let viewsService = accessor.get(IViewsService);
	return viewsService.openView(OutlineViewId, true);
});

MenuRegistry.addCommand({
	id: 'outline.focus',
	category: localize('category.focus', "File"),
	title: localize('label.focus', "Focus on Outline")
});

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	'id': 'outline',
	'order': 117,
	'title': localize('outlineConfigurationTitle', "Outline"),
	'type': 'object',
	'properties': {
		[OutlineConfigKeys.icons]: {
			'description': localize('outline.showIcons', "Render Outline Elements with Icons."),
			'type': 'boolean',
			'default': true
		},
		[OutlineConfigKeys.problemsEnabled]: {
			'description': localize('outline.showProblem', "Show Errors & Warnings on Outline Elements."),
			'type': 'boolean',
			'default': true
		},
		[OutlineConfigKeys.problemsEnabled]: {
			'description': localize('outline.showProblem', "Show Errors & Warnings on Outline Elements."),
			'type': 'boolean',
			'default': true
		},
		[OutlineConfigKeys.problemsColors]: {
			'description': localize('outline.problem.colors', "Use colors for Errors & Warnings."),
			'type': 'boolean',
			'default': true
		},
		[OutlineConfigKeys.problemsBadges]: {
			'description': localize('outline.problems.badges', "Use badges for Errors & Warnings."),
			'type': 'boolean',
			'default': true
		}
	}
});
