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
			markdownDescription: localize('filteredTypes.file', "When enabled outline shows `file`-symbols.")
		},
		'outline.filteredTypes.module': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.module', "When enabled outline shows `module`-symbols.")
		},
		'outline.filteredTypes.namespace': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.namespace', "When enabled outline shows `namespace`-symbols.")
		},
		'outline.filteredTypes.package': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.package', "When enabled outline shows `package`-symbols.")
		},
		'outline.filteredTypes.class': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.class', "When enabled outline shows `class`-symbols.")
		},
		'outline.filteredTypes.method': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.method', "When enabled outline shows `method`-symbols.")
		},
		'outline.filteredTypes.property': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.property', "When enabled outline shows `property`-symbols.")
		},
		'outline.filteredTypes.field': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.field', "When enabled outline shows `field`-symbols.")
		},
		'outline.filteredTypes.constructor': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.constructor', "When enabled outline shows `constructor`-symbols.")
		},
		'outline.filteredTypes.enum': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.enum', "When enabled outline shows `enum`-symbols.")
		},
		'outline.filteredTypes.interface': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.interface', "When enabled outline shows `interface`-symbols.")
		},
		'outline.filteredTypes.function': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.function', "When enabled outline shows `function`-symbols.")
		},
		'outline.filteredTypes.variable': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.variable', "When enabled outline shows `variable`-symbols.")
		},
		'outline.filteredTypes.constant': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.constant', "When enabled outline shows `constant`-symbols.")
		},
		'outline.filteredTypes.string': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.string', "When enabled outline shows `string`-symbols.")
		},
		'outline.filteredTypes.number': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.number', "When enabled outline shows `number`-symbols.")
		},
		'outline.filteredTypes.boolean': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.boolean', "When enabled outline shows `boolean`-symbols.")
		},
		'outline.filteredTypes.array': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.array', "When enabled outline shows `array`-symbols.")
		},
		'outline.filteredTypes.object': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.object', "When enabled outline shows `object`-symbols.")
		},
		'outline.filteredTypes.key': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.key', "When enabled outline shows `key`-symbols.")
		},
		'outline.filteredTypes.null': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.null', "When enabled outline shows `null`-symbols.")
		},
		'outline.filteredTypes.enumMember': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.enumMember', "When enabled outline shows `enumMember`-symbols.")
		},
		'outline.filteredTypes.struct': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.struct', "When enabled outline shows `struct`-symbols.")
		},
		'outline.filteredTypes.event': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.event', "When enabled outline shows `event`-symbols.")
		},
		'outline.filteredTypes.operator': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.operator', "When enabled outline shows `operator`-symbols.")
		},
		'outline.filteredTypes.typeParameter': {
			type: 'boolean',
			default: true,
			markdownDescription: localize('filteredTypes.typeParameter', "When enabled outline shows `typeParameter`-symbols.")
		}
	}
});
