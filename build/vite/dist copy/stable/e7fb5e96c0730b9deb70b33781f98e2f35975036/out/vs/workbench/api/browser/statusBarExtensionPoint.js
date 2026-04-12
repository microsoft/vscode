/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../services/extensions/common/extensionsRegistry.js';
import { IStatusbarService } from '../../services/statusbar/browser/statusbar.js';
import { isAccessibilityInformation } from '../../../platform/accessibility/common/accessibility.js';
import { isMarkdownString } from '../../../base/common/htmlContent.js';
import { getCodiconAriaLabel } from '../../../base/common/iconLabels.js';
import { hash } from '../../../base/common/hash.js';
import { Emitter } from '../../../base/common/event.js';
import { registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { Iterable } from '../../../base/common/iterator.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { asStatusBarItemIdentifier } from '../common/extHostTypes.js';
import { STATUS_BAR_ERROR_ITEM_BACKGROUND, STATUS_BAR_WARNING_ITEM_BACKGROUND } from '../../common/theme.js';
// --- service
export const IExtensionStatusBarItemService = createDecorator('IExtensionStatusBarItemService');
export var StatusBarUpdateKind;
(function (StatusBarUpdateKind) {
    StatusBarUpdateKind[StatusBarUpdateKind["DidDefine"] = 0] = "DidDefine";
    StatusBarUpdateKind[StatusBarUpdateKind["DidUpdate"] = 1] = "DidUpdate";
})(StatusBarUpdateKind || (StatusBarUpdateKind = {}));
let ExtensionStatusBarItemService = class ExtensionStatusBarItemService {
    constructor(_statusbarService) {
        this._statusbarService = _statusbarService;
        this._entries = new Map();
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
    }
    dispose() {
        this._entries.forEach(entry => entry.accessor.dispose());
        this._entries.clear();
        this._onDidChange.dispose();
    }
    setOrUpdateEntry(entryId, id, extensionId, name, text, tooltip, command, color, backgroundColor, alignLeft, priority, accessibilityInformation) {
        // if there are icons in the text use the tooltip for the aria label
        let ariaLabel;
        let role = undefined;
        if (accessibilityInformation) {
            ariaLabel = accessibilityInformation.label;
            role = accessibilityInformation.role;
        }
        else {
            ariaLabel = getCodiconAriaLabel(text);
            if (typeof tooltip === 'string' || isMarkdownString(tooltip)) {
                const tooltipString = typeof tooltip === 'string' ? tooltip : tooltip.value;
                ariaLabel += `, ${tooltipString}`;
            }
        }
        let kind = undefined;
        switch (backgroundColor?.id) {
            case STATUS_BAR_ERROR_ITEM_BACKGROUND:
            case STATUS_BAR_WARNING_ITEM_BACKGROUND:
                // override well known colors that map to status entry kinds to support associated themable hover colors
                kind = backgroundColor.id === STATUS_BAR_ERROR_ITEM_BACKGROUND ? 'error' : 'warning';
                color = undefined;
                backgroundColor = undefined;
        }
        const entry = { name, text, tooltip, command, color, backgroundColor, ariaLabel, role, kind, extensionId };
        if (typeof priority === 'undefined') {
            priority = 0;
        }
        let alignment = alignLeft ? 0 /* StatusbarAlignment.LEFT */ : 1 /* StatusbarAlignment.RIGHT */;
        // alignment and priority can only be set once (at creation time)
        const existingEntry = this._entries.get(entryId);
        if (existingEntry) {
            alignment = existingEntry.alignment;
            priority = existingEntry.priority;
        }
        // Create new entry if not existing
        if (!existingEntry) {
            let entryPriority;
            if (typeof extensionId === 'string') {
                // We cannot enforce unique priorities across all extensions, so we
                // use the extension identifier as a secondary sort key to reduce
                // the likelyhood of collisions.
                // See https://github.com/microsoft/vscode/issues/177835
                // See https://github.com/microsoft/vscode/issues/123827
                entryPriority = { primary: priority, secondary: hash(extensionId) };
            }
            else {
                entryPriority = priority;
            }
            const accessor = this._statusbarService.addEntry(entry, id, alignment, entryPriority);
            this._entries.set(entryId, {
                accessor,
                entry,
                alignment,
                priority,
                disposable: toDisposable(() => {
                    accessor.dispose();
                    this._entries.delete(entryId);
                    this._onDidChange.fire({ removed: entryId });
                })
            });
            this._onDidChange.fire({ added: [entryId, { entry, alignment, priority }] });
            return 0 /* StatusBarUpdateKind.DidDefine */;
        }
        else {
            // Otherwise update
            existingEntry.accessor.update(entry);
            existingEntry.entry = entry;
            return 1 /* StatusBarUpdateKind.DidUpdate */;
        }
    }
    unsetEntry(entryId) {
        this._entries.get(entryId)?.disposable.dispose();
        this._entries.delete(entryId);
    }
    getEntries() {
        return this._entries.entries();
    }
};
ExtensionStatusBarItemService = __decorate([
    __param(0, IStatusbarService)
], ExtensionStatusBarItemService);
registerSingleton(IExtensionStatusBarItemService, ExtensionStatusBarItemService, 1 /* InstantiationType.Delayed */);
function isUserFriendlyStatusItemEntry(candidate) {
    const obj = candidate;
    return (typeof obj.id === 'string' && obj.id.length > 0)
        && typeof obj.name === 'string'
        && typeof obj.text === 'string'
        && (obj.alignment === 'left' || obj.alignment === 'right')
        && (obj.command === undefined || typeof obj.command === 'string')
        && (obj.tooltip === undefined || typeof obj.tooltip === 'string')
        && (obj.priority === undefined || typeof obj.priority === 'number')
        && (obj.accessibilityInformation === undefined || isAccessibilityInformation(obj.accessibilityInformation));
}
const statusBarItemSchema = {
    type: 'object',
    required: ['id', 'text', 'alignment', 'name'],
    properties: {
        id: {
            type: 'string',
            markdownDescription: localize('id', 'The identifier of the status bar entry. Must be unique within the extension. The same value must be used when calling the `vscode.window.createStatusBarItem(id, ...)`-API')
        },
        name: {
            type: 'string',
            description: localize('name', 'The name of the entry, like \'Python Language Indicator\', \'Git Status\' etc. Try to keep the length of the name short, yet descriptive enough that users can understand what the status bar item is about.')
        },
        text: {
            type: 'string',
            description: localize('text', 'The text to show for the entry. You can embed icons in the text by leveraging the `$(<name>)`-syntax, like \'Hello {0}!\'', '$(globe)')
        },
        tooltip: {
            type: 'string',
            description: localize('tooltip', 'The tooltip text for the entry.')
        },
        command: {
            type: 'string',
            description: localize('command', 'The command to execute when the status bar entry is clicked.')
        },
        alignment: {
            type: 'string',
            enum: ['left', 'right'],
            description: localize('alignment', 'The alignment of the status bar entry.')
        },
        priority: {
            type: 'number',
            description: localize('priority', 'The priority of the status bar entry. Higher value means the item should be shown more to the left.')
        },
        accessibilityInformation: {
            type: 'object',
            description: localize('accessibilityInformation', 'Defines the role and aria label to be used when the status bar entry is focused.'),
            required: ['label'],
            properties: {
                role: {
                    type: 'string',
                    description: localize('accessibilityInformation.role', 'The role of the status bar entry which defines how a screen reader interacts with it. More about aria roles can be found here https://w3c.github.io/aria/#widget_roles')
                },
                label: {
                    type: 'string',
                    description: localize('accessibilityInformation.label', 'The aria label of the status bar entry. Defaults to the entry\'s text.')
                }
            }
        }
    }
};
const statusBarItemsSchema = {
    description: localize('vscode.extension.contributes.statusBarItems', "Contributes items to the status bar."),
    oneOf: [
        statusBarItemSchema,
        {
            type: 'array',
            items: statusBarItemSchema
        }
    ]
};
const statusBarItemsExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'statusBarItems',
    jsonSchema: statusBarItemsSchema,
});
let StatusBarItemsExtensionPoint = class StatusBarItemsExtensionPoint {
    constructor(statusBarItemsService) {
        const contributions = new DisposableStore();
        statusBarItemsExtensionPoint.setHandler((extensions) => {
            contributions.clear();
            for (const entry of extensions) {
                if (!isProposedApiEnabled(entry.description, 'contribStatusBarItems')) {
                    entry.collector.error(`The ${statusBarItemsExtensionPoint.name} is proposed API`);
                    continue;
                }
                const { value, collector } = entry;
                for (const candidate of Iterable.wrap(value)) {
                    if (!isUserFriendlyStatusItemEntry(candidate)) {
                        collector.error(localize('invalid', "Invalid status bar item contribution."));
                        continue;
                    }
                    const fullItemId = asStatusBarItemIdentifier(entry.description.identifier, candidate.id);
                    const kind = statusBarItemsService.setOrUpdateEntry(fullItemId, fullItemId, ExtensionIdentifier.toKey(entry.description.identifier), candidate.name ?? entry.description.displayName ?? entry.description.name, candidate.text, candidate.tooltip, candidate.command ? { id: candidate.command, title: candidate.name } : undefined, undefined, undefined, candidate.alignment === 'left', candidate.priority, candidate.accessibilityInformation);
                    if (kind === 0 /* StatusBarUpdateKind.DidDefine */) {
                        contributions.add(toDisposable(() => statusBarItemsService.unsetEntry(fullItemId)));
                    }
                }
            }
        });
    }
};
StatusBarItemsExtensionPoint = __decorate([
    __param(0, IExtensionStatusBarItemService)
], StatusBarItemsExtensionPoint);
export { StatusBarItemsExtensionPoint };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdHVzQmFyRXh0ZW5zaW9uUG9pbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvc3RhdHVzQmFyRXh0ZW5zaW9uUG9pbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxpQkFBaUIsRUFBaUssTUFBTSwrQ0FBK0MsQ0FBQztBQUdqUCxPQUFPLEVBQTZCLDBCQUEwQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDaEksT0FBTyxFQUFtQixnQkFBZ0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQVMsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzVHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN4RixPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN0RSxP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