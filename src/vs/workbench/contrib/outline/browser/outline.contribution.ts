/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IViewsRegistry, IViewDescriptor, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { OutlinePanel } from './outlinePanel';
import { VIEW_CONTAINER } from 'vs/workbench/contrib/files/common/files';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { OutlineConfigKeys, OutlineViewId } from 'vs/editor/contrib/documentSymbols/outline';

const _outlineDesc = <IViewDescriptor>{
	id: OutlineViewId,
	name: localize('name', "Outline"),
	ctorDescriptor: { ctor: OutlinePanel },
	canToggleVisibility: true,
	hideByDefault: false,
	collapsed: true,
	order: 2,
	weight: 30,
	focusCommand: { id: 'outline.focus' }
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([_outlineDesc], VIEW_CONTAINER);

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
		[OutlineConfigKeys.problemsColors]: {
			'description': localize('outline.problem.colors', "Use colors for Errors & Warnings."),
			'type': 'boolean',
			'default': true
		},
		[OutlineConfigKeys.problemsBadges]: {
			'description': localize('outline.problems.badges', "Use badges for Errors & Warnings."),
			'type': 'boolean',
			'default': true
		},
		'outline.filteredTypes.file': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.file', "When set to `false` outline never shows `file`-symbols.")
		},
		'outline.filteredTypes.module': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.module', "When set to `false` outline never shows `module`-symbols.")
		},
		'outline.filteredTypes.namespace': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.namespace', "When set to `false` outline never shows `namespace`-symbols.")
		},
		'outline.filteredTypes.package': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.package', "When set to `false` outline never shows `package`-symbols.")
		},
		'outline.filteredTypes.class': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.class', "When set to `false` outline never shows `class`-symbols.")
		},
		'outline.filteredTypes.method': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.method', "When set to `false` outline never shows `method`-symbols.")
		},
		'outline.filteredTypes.property': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.property', "When set to `false` outline never shows `property`-symbols.")
		},
		'outline.filteredTypes.field': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.field', "When set to `false` outline never shows `field`-symbols.")
		},
		'outline.filteredTypes.constructor': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.constructor', "When set to `false` outline never shows `constructor`-symbols.")
		},
		'outline.filteredTypes.enum': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.enum', "When set to `false` outline never shows `enum`-symbols.")
		},
		'outline.filteredTypes.interface': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.interface', "When set to `false` outline never shows `interface`-symbols.")
		},
		'outline.filteredTypes.function': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.function', "When set to `false` outline never shows `function`-symbols.")
		},
		'outline.filteredTypes.variable': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.variable', "When set to `false` outline never shows `variable`-symbols.")
		},
		'outline.filteredTypes.constant': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.constant', "When set to `false` outline never shows `constant`-symbols.")
		},
		'outline.filteredTypes.string': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.string', "When set to `false` outline never shows `string`-symbols.")
		},
		'outline.filteredTypes.number': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.number', "When set to `false` outline never shows `number`-symbols.")
		},
		'outline.filteredTypes.boolean': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.boolean', "When set to `false` outline never shows `boolean`-symbols.")
		},
		'outline.filteredTypes.array': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.array', "When set to `false` outline never shows `array`-symbols.")
		},
		'outline.filteredTypes.object': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.object', "When set to `false` outline never shows `object`-symbols.")
		},
		'outline.filteredTypes.key': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.key', "When set to `false` outline never shows `key`-symbols.")
		},
		'outline.filteredTypes.null': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.null', "When set to `false` outline never shows `null`-symbols.")
		},
		'outline.filteredTypes.enumMember': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.enumMember', "When set to `false` outline never shows `enumMember`-symbols.")
		},
		'outline.filteredTypes.struct': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.struct', "When set to `false` outline never shows `struct`-symbols.")
		},
		'outline.filteredTypes.event': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.event', "When set to `false` outline never shows `event`-symbols.")
		},
		'outline.filteredTypes.operator': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.operator', "When set to `false` outline never shows `operator`-symbols.")
		},
		'outline.filteredTypes.typeParameter': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.typeParameter', "When set to `false` outline never shows `typeParameter`-symbols.")
		}
	}
});
