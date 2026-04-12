/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
import { Extensions as ViewExtensions } from '../../../common/views.js';
import { OutlinePane } from './outlinePane.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { VIEW_CONTAINER } from '../../files/browser/explorerViewlet.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IOutlinePane } from './outline.js';
// --- actions
import './outlineActions.js';
// --- view
const outlineViewIcon = registerIcon('outline-view-icon', Codicon.symbolClass, localize('outlineViewIcon', 'View icon of the outline view.'));
Registry.as(ViewExtensions.ViewsRegistry).registerViews([{
        id: IOutlinePane.Id,
        name: localize2('name', "Outline"),
        containerIcon: outlineViewIcon,
        ctorDescriptor: new SyncDescriptor(OutlinePane),
        canToggleVisibility: true,
        canMoveView: true,
        hideByDefault: false,
        collapsed: true,
        order: 2,
        weight: 30,
        focusCommand: { id: 'outline.focus' }
    }], VIEW_CONTAINER);
// --- configurations
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    'id': 'outline',
    'order': 117,
    'title': localize('outlineConfigurationTitle', "Outline"),
    'type': 'object',
    'properties': {
        ["outline.icons" /* OutlineConfigKeys.icons */]: {
            'description': localize('outline.showIcons', "Render Outline elements with icons."),
            'type': 'boolean',
            'default': true
        },
        ["outline.collapseItems" /* OutlineConfigKeys.collapseItems */]: {
            'description': localize('outline.initialState', "Controls whether Outline items are collapsed or expanded."),
            'type': 'string',
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            'enum': [
                'alwaysCollapse',
                'alwaysExpand'
            ],
            'enumDescriptions': [
                localize('outline.initialState.collapsed', "Collapse all items."),
                localize('outline.initialState.expanded', "Expand all items.")
            ],
            'default': 'alwaysExpand'
        },
        ["outline.problems.enabled" /* OutlineConfigKeys.problemsEnabled */]: {
            'markdownDescription': localize('outline.showProblem', "Show errors and warnings on Outline elements. Overwritten by {0} when it is off.", '`#problems.visibility#`'),
            'type': 'boolean',
            'default': true
        },
        ["outline.problems.colors" /* OutlineConfigKeys.problemsColors */]: {
            'markdownDescription': localize('outline.problem.colors', "Use colors for errors and warnings on Outline elements. Overwritten by {0} when it is off.", '`#problems.visibility#`'),
            'type': 'boolean',
            'default': true
        },
        ["outline.problems.badges" /* OutlineConfigKeys.problemsBadges */]: {
            'markdownDescription': localize('outline.problems.badges', "Use badges for errors and warnings on Outline elements. Overwritten by {0} when it is off.", '`#problems.visibility#`'),
            'type': 'boolean',
            'default': true
        },
        'outline.showFiles': {
            type: 'boolean',
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            default: true,
            markdownDescription: localize('filteredTypes.file', "When enabled, Outline shows `file`-symbols.")
        },
        'outline.showModules': {
            type: 'boolean',
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            default: true,
            markdownDescription: localize('filteredTypes.module', "When enabled, Outline shows `module`-symbols.")
        },
        'outline.showNamespaces': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.namespace', "When enabled, Outline shows `namespace`-symbols.")
        },
        'outline.showPackages': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.package', "When enabled, Outline shows `package`-symbols.")
        },
        'outline.showClasses': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.class', "When enabled, Outline shows `class`-symbols.")
        },
        'outline.showMethods': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.method', "When enabled, Outline shows `method`-symbols.")
        },
        'outline.showProperties': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.property', "When enabled, Outline shows `property`-symbols.")
        },
        'outline.showFields': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.field', "When enabled, Outline shows `field`-symbols.")
        },
        'outline.showConstructors': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.constructor', "When enabled, Outline shows `constructor`-symbols.")
        },
        'outline.showEnums': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.enum', "When enabled, Outline shows `enum`-symbols.")
        },
        'outline.showInterfaces': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.interface', "When enabled, Outline shows `interface`-symbols.")
        },
        'outline.showFunctions': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.function', "When enabled, Outline shows `function`-symbols.")
        },
        'outline.showVariables': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.variable', "When enabled, Outline shows `variable`-symbols.")
        },
        'outline.showConstants': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.constant', "When enabled, Outline shows `constant`-symbols.")
        },
        'outline.showStrings': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.string', "When enabled, Outline shows `string`-symbols.")
        },
        'outline.showNumbers': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.number', "When enabled, Outline shows `number`-symbols.")
        },
        'outline.showBooleans': {
            type: 'boolean',
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            default: true,
            markdownDescription: localize('filteredTypes.boolean', "When enabled, Outline shows `boolean`-symbols.")
        },
        'outline.showArrays': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.array', "When enabled, Outline shows `array`-symbols.")
        },
        'outline.showObjects': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.object', "When enabled, Outline shows `object`-symbols.")
        },
        'outline.showKeys': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.key', "When enabled, Outline shows `key`-symbols.")
        },
        'outline.showNull': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.null', "When enabled, Outline shows `null`-symbols.")
        },
        'outline.showEnumMembers': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.enumMember', "When enabled, Outline shows `enumMember`-symbols.")
        },
        'outline.showStructs': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.struct', "When enabled, Outline shows `struct`-symbols.")
        },
        'outline.showEvents': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.event', "When enabled, Outline shows `event`-symbols.")
        },
        'outline.showOperators': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.operator', "When enabled, Outline shows `operator`-symbols.")
        },
        'outline.showTypeParameters': {
            type: 'boolean',
            default: true,
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            markdownDescription: localize('filteredTypes.typeParameter', "When enabled, Outline shows `typeParameter`-symbols.")
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0bGluZS5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9vdXRsaW5lL2Jyb3dzZXIvb3V0bGluZS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQWtCLFVBQVUsSUFBSSxjQUFjLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN4RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDL0MsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBMEIsVUFBVSxJQUFJLHVCQUF1QixFQUFzQixNQUFNLG9FQUFvRSxDQUFDO0FBQ3ZLLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUVqRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRTVDLGNBQWM7QUFFZCxPQUFPLHFCQUFxQixDQUFDO0FBRTdCLFdBQVc7QUFFWCxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsbUJBQW1CLEVBQUUsT0FBTyxDQUFDLFdBQVcsRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQyxDQUFDO0FBRTlJLFFBQVEsQ0FBQyxFQUFFLENBQWlCLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN4RSxF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