/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema, TypeFromJsonSchema } from '../../../base/common/jsonSchema.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../services/extensions/common/extensionsRegistry.js';
import { IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment, IStatusbarEntryAccessor, IStatusbarEntry, StatusbarAlignment, IStatusbarEntryPriority, StatusbarEntryKind } from '../../services/statusbar/browser/statusbar.js';
import { ThemeColor } from '../../../base/common/themables.js';
import { Command } from '../../../editor/common/languages.js';
import { IAccessibilityInformation, isAccessibilityInformation } from '../../../platform/accessibility/common/accessibility.js';
import { IMarkdownString, isMarkdownString } from '../../../base/common/htmlContent.js';
import { getCodiconAriaLabel } from '../../../base/common/iconLabels.js';
import { hash } from '../../../base/common/hash.js';
import { Event, Emitter } from '../../../base/common/event.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { Iterable } from '../../../base/common/iterator.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { asStatusBarItemIdentifier } from '../common/extHostTypes.js';
import { STATUS_BAR_ERROR_ITEM_BACKGROUND, STATUS_BAR_WARNING_ITEM_BACKGROUND } from '../../common/theme.js';
import { IManagedHoverTooltipMarkdownString } from '../../../base/browser/ui/hover/hover.js';


// --- service

export const IExtensionStatusBarItemService = createDecorator<IExtensionStatusBarItemService>('IExtensionStatusBarItemService');

export interface IExtensionStatusBarItemChangeEvent {
	readonly added?: ExtensionStatusBarEntry;
	readonly removed?: string;
}

export type ExtensionStatusBarEntry = [string, {
	entry: IStatusbarEntry;
	alignment: MainThreadStatusBarAlignment;
	priority: number;
}];

export const enum StatusBarUpdateKind {
	DidDefine,
	DidUpdate
}

export interface IExtensionStatusBarItemService {
	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<IExtensionStatusBarItemChangeEvent>;

	setOrUpdateEntry(id: string, statusId: string, extensionId: string | undefined, name: string, text: string, tooltip: IMarkdownString | string | undefined | IManagedHoverTooltipMarkdownString, command: Command | undefined, color: string | ThemeColor | undefined, backgroundColor: ThemeColor | undefined, alignLeft: boolean, priority: number | undefined, accessibilityInformation: IAccessibilityInformation | undefined): StatusBarUpdateKind;

	unsetEntry(id: string): void;

	getEntries(): Iterable<ExtensionStatusBarEntry>;
}


class ExtensionStatusBarItemService implements IExtensionStatusBarItemService {

	declare readonly _serviceBrand: undefined;

	private readonly _entries: Map<string, { accessor: IStatusbarEntryAccessor; entry: IStatusbarEntry; alignment: MainThreadStatusBarAlignment; priority: number; disposable: IDisposable }> = new Map();

	private readonly _onDidChange = new Emitter<IExtensionStatusBarItemChangeEvent>();
	readonly onDidChange: Event<IExtensionStatusBarItemChangeEvent> = this._onDidChange.event;

	constructor(@IStatusbarService private readonly _statusbarService: IStatusbarService) { }

	dispose(): void {
		this._entries.forEach(entry => entry.accessor.dispose());
		this._entries.clear();
		this._onDidChange.dispose();
	}

	setOrUpdateEntry(entryId: string,
		id: string, extensionId: string | undefined, name: string, text: string,
		tooltip: IMarkdownString | string | undefined | IManagedHoverTooltipMarkdownString,
		command: Command | undefined, color: string | ThemeColor | undefined, backgroundColor: ThemeColor | undefined,
		alignLeft: boolean, priority: number | undefined, accessibilityInformation: IAccessibilityInformation | undefined
	): StatusBarUpdateKind {
		// if there are icons in the text use the tooltip for the aria label
		let ariaLabel: string;
		let role: string | undefined = undefined;
		if (accessibilityInformation) {
			ariaLabel = accessibilityInformation.label;
			role = accessibilityInformation.role;
		} else {
			ariaLabel = getCodiconAriaLabel(text);
			if (typeof tooltip === 'string' || isMarkdownString(tooltip)) {
				const tooltipString = typeof tooltip === 'string' ? tooltip : tooltip.value;
				ariaLabel += `, ${tooltipString}`;
			}
		}
		let kind: StatusbarEntryKind | undefined = undefined;
		switch (backgroundColor?.id) {
			case STATUS_BAR_ERROR_ITEM_BACKGROUND:
			case STATUS_BAR_WARNING_ITEM_BACKGROUND:
				// override well known colors that map to status entry kinds to support associated themable hover colors
				kind = backgroundColor.id === STATUS_BAR_ERROR_ITEM_BACKGROUND ? 'error' : 'warning';
				color = undefined;
				backgroundColor = undefined;
		}
		const entry: IStatusbarEntry = { name, text, tooltip, command, color, backgroundColor, ariaLabel, role, kind, extensionId };

		if (typeof priority === 'undefined') {
			priority = 0;
		}

		let alignment = alignLeft ? StatusbarAlignment.LEFT : StatusbarAlignment.RIGHT;

		// alignment and priority can only be set once (at creation time)
		const existingEntry = this._entries.get(entryId);
		if (existingEntry) {
			alignment = existingEntry.alignment;
			priority = existingEntry.priority;
		}

		// Create new entry if not existing
		if (!existingEntry) {
			let entryPriority: number | IStatusbarEntryPriority;
			if (typeof extensionId === 'string') {
				// We cannot enforce unique priorities across all extensions, so we
				// use the extension identifier as a secondary sort key to reduce
				// the likelyhood of collisions.
				// See https://github.com/microsoft/vscode/issues/177835
				// See https://github.com/microsoft/vscode/issues/123827
				entryPriority = { primary: priority, secondary: hash(extensionId) };
			} else {
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
			return StatusBarUpdateKind.DidDefine;

		} else {
			// Otherwise update
			existingEntry.accessor.update(entry);
			existingEntry.entry = entry;
			return StatusBarUpdateKind.DidUpdate;
		}
	}

	unsetEntry(entryId: string): void {
		this._entries.get(entryId)?.disposable.dispose();
		this._entries.delete(entryId);
	}

	getEntries(): Iterable<[string, { entry: IStatusbarEntry; alignment: MainThreadStatusBarAlignment; priority: number }]> {
		return this._entries.entries();
	}
}

registerSingleton(IExtensionStatusBarItemService, ExtensionStatusBarItemService, InstantiationType.Delayed);

// --- extension point and reading of it

type IUserFriendlyStatusItemEntry = TypeFromJsonSchema<typeof statusBarItemSchema>;

function isUserFriendlyStatusItemEntry(candidate: unknown): candidate is IUserFriendlyStatusItemEntry {
	const obj = candidate as IUserFriendlyStatusItemEntry;
	return (typeof obj.id === 'string' && obj.id.length > 0)
		&& typeof obj.name === 'string'
		&& typeof obj.text === 'string'
		&& (obj.alignment === 'left' || obj.alignment === 'right')
		&& (obj.command === undefined || typeof obj.command === 'string')
		&& (obj.tooltip === undefined || typeof obj.tooltip === 'string')
		&& (obj.priority === undefined || typeof obj.priority === 'number')
		&& (obj.accessibilityInformation === undefined || isAccessibilityInformation(obj.accessibilityInformation))
		;
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
			description: localize('text', 'The text to show for the entry. You can embed icons in the text by leveraging the `$(<name>)`-syntax, like \'Hello $(globe)!\'')
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
} as const satisfies IJSONSchema;

const statusBarItemsSchema: IJSONSchema = {
	description: localize('vscode.extension.contributes.statusBarItems', "Contributes items to the status bar."),
	oneOf: [
		statusBarItemSchema,
		{
			type: 'array',
			items: statusBarItemSchema
		}
	]
};

const statusBarItemsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IUserFriendlyStatusItemEntry | IUserFriendlyStatusItemEntry[]>({
	extensionPoint: 'statusBarItems',
	jsonSchema: statusBarItemsSchema,
});

export class StatusBarItemsExtensionPoint {

	constructor(@IExtensionStatusBarItemService statusBarItemsService: IExtensionStatusBarItemService) {

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

					const kind = statusBarItemsService.setOrUpdateEntry(
						fullItemId,
						fullItemId,
						ExtensionIdentifier.toKey(entry.description.identifier),
						candidate.name ?? entry.description.displayName ?? entry.description.name,
						candidate.text,
						candidate.tooltip,
						candidate.command ? { id: candidate.command, title: candidate.name } : undefined,
						undefined, undefined,
						candidate.alignment === 'left',
						candidate.priority,
						candidate.accessibilityInformation
					);

					if (kind === StatusBarUpdateKind.DidDefine) {
						contributions.add(toDisposable(() => statusBarItemsService.unsetEntry(fullItemId)));
					}
				}
			}
		});
	}
}
