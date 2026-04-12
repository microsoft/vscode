/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { coalesce } from '../../../../base/common/arrays.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { languagesExtPoint } from '../../../services/language/common/languageService.js';
const Fields = Object.freeze({
    viewType: 'viewType',
    displayName: 'displayName',
    selector: 'selector',
    priority: 'priority',
});
const customEditorsContributionSchema = {
    type: 'object',
    required: [
        Fields.viewType,
        Fields.displayName,
        Fields.selector,
    ],
    additionalProperties: false,
    properties: {
        [Fields.viewType]: {
            type: 'string',
            markdownDescription: nls.localize('contributes.viewType', 'Identifier for the custom editor. This must be unique across all custom editors, so we recommend including your extension id as part of `viewType`. The `viewType` is used when registering custom editors with `vscode.registerCustomEditorProvider` and in the `onCustomEditor:${id}` [activation event](https://code.visualstudio.com/api/references/activation-events).'),
        },
        [Fields.displayName]: {
            type: 'string',
            description: nls.localize('contributes.displayName', 'Human readable name of the custom editor. This is displayed to users when selecting which editor to use.'),
        },
        [Fields.selector]: {
            type: 'array',
            description: nls.localize('contributes.selector', 'Set of globs that the custom editor is enabled for.'),
            items: {
                type: 'object',
                defaultSnippets: [{
                        body: {
                            filenamePattern: '$1',
                        }
                    }],
                additionalProperties: false,
                properties: {
                    filenamePattern: {
                        type: 'string',
                        description: nls.localize('contributes.selector.filenamePattern', 'Glob that the custom editor is enabled for.'),
                    },
                }
            }
        },
        [Fields.priority]: {
            type: 'string',
            markdownDeprecationMessage: nls.localize('contributes.priority', 'Controls if the custom editor is enabled automatically when the user opens a file. This may be overridden by users using the `workbench.editorAssociations` setting.'),
            enum: [
                "default" /* CustomEditorPriority.default */,
                "option" /* CustomEditorPriority.option */,
            ],
            markdownEnumDescriptions: [
                nls.localize('contributes.priority.default', 'The editor is automatically used when the user opens a resource, provided that no other default custom editors are registered for that resource.'),
                nls.localize('contributes.priority.option', 'The editor is not automatically used when the user opens a resource, but a user can switch to the editor using the `Reopen With` command.'),
            ],
            default: "default" /* CustomEditorPriority.default */
        }
    }
};
export const customEditorsExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'customEditors',
    deps: [languagesExtPoint],
    jsonSchema: {
        description: nls.localize('contributes.customEditors', 'Contributed custom editors.'),
        type: 'array',
        defaultSnippets: [{
                body: [{
                        [Fields.viewType]: '$1',
                        [Fields.displayName]: '$2',
                        [Fields.selector]: [{
                                filenamePattern: '$3'
                            }],
                    }]
            }],
        items: customEditorsContributionSchema
    },
    activationEventsGenerator: function* (contribs) {
        for (const contrib of contribs) {
            const viewType = contrib[Fields.viewType];
            if (viewType) {
                yield `onCustomEditor:${viewType}`;
            }
        }
    },
});
class CustomEditorsDataRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.customEditors;
    }
    render(manifest) {
        const customEditors = manifest.contributes?.customEditors || [];
        if (!customEditors.length) {
            return { data: { headers: [], rows: [] }, dispose: () => { } };
        }
        const headers = [
            nls.localize('customEditors view type', "View Type"),
            nls.localize('customEditors priority', "Priority"),
            nls.localize('customEditors filenamePattern', "Filename Pattern"),
        ];
        const rows = customEditors
            .map(customEditor => {
            return [
                customEditor.viewType,
                customEditor.priority ?? '',
                coalesce(customEditor.selector.map(x => x.filenamePattern)).join(', ')
            ];
        });
        return {
            data: {
                headers,
                rows
            },
            dispose: () => { }
        };
    }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'customEditors',
    label: nls.localize('customEditors', "Custom Editors"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(CustomEditorsDataRenderer),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUG9pbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jdXN0b21FZGl0b3IvY29tbW9uL2V4dGVuc2lvblBvaW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU3RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRTVFLE9BQU8sRUFBRSxVQUFVLEVBQW1HLE1BQU0sbUVBQW1FLENBQUM7QUFDaE0sT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDL0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFekYsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUM1QixRQUFRLEVBQUUsVUFBVTtJQUNwQixXQUFXLEVBQUUsYUFBYTtJQUMxQixRQUFRLEVBQUUsVUFBVTtJQUNwQixRQUFRLEVBQUUsVUFBVTtDQUNwQixDQUFDLENBQUM7QUFFSCxNQUFNLCtCQUErQixHQUFHO0lBQ3ZDLElBQUksRUFBRSxRQUFRO0lBQ2QsUUFBUSxFQUFFO1FBQ1QsTUFBTSxDQUFDLFFBQVE7UUFDZixNQUFNLENBQUMsV0FBVztRQUNsQixNQUFNLENBQUMsUUFBUTtLQUNmO0lBQ0Qsb0JBQW9CLEVBQUUsS0FBSztJQUMzQixVQUFVLEVBQUU7UUFDWCxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUNsQixJQUFJLEVB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