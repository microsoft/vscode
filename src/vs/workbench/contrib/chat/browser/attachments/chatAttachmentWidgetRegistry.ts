/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as event from '../../../../../base/common/event.js';
import { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';

/**
 * Interface for a contributed attachment widget instance.
 */
export interface IChatAttachmentWidgetInstance extends IDisposable {
	readonly element: HTMLElement;
	readonly onDidDelete: event.Event<Event>;
	readonly onDidOpen: event.Event<void>;
	/** Optional label element, used for applying warning styles on omitted attachments. */
	readonly label?: { readonly element: HTMLElement };
	/** Creates the detail preview used by the input editor's keyboard hover. */
	getPreviewHoverContent?(): HTMLElement | undefined;
	/** Whether the attachment provides a delayed reference preview. Activation still navigates. */
	readonly supportsPreview?: boolean;
	/** Shared pointer hover, also revealed when the editor gives the reference keyboard focus. */
	readonly previewHover?: IManagedHover;
	/** Fires when account changes or widget disposal invalidate displayed preview details. */
	readonly onDidChangePreview?: event.Event<void>;
	/**
	 * The name that the widget shows for the attachment, when it differs from
	 * the attachment's name and can change, as the title of a linked session does.
	 */
	readonly displayName?: string;
}

/**
 * Factory function type for creating attachment widgets. `sessionResource` is
 * the session of the chat that shows the attachment, `undefined` when the
 * attachment is not shown in a chat session.
 */
export type ChatAttachmentWidgetFactory = (
	attachment: IChatRequestVariableEntry,
	options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
	container: HTMLElement,
	sessionResource: URI | undefined,
) => IChatAttachmentWidgetInstance;

export const IChatAttachmentWidgetRegistry = createDecorator<IChatAttachmentWidgetRegistry>('chatAttachmentWidgetRegistry');

export interface IChatAttachmentWidgetRegistry {
	readonly _serviceBrand: undefined;

	/**
	 * Register a widget factory for a specific attachment kind.
	 */
	registerFactory(kind: string, factory: ChatAttachmentWidgetFactory): IDisposable;

	/**
	 * Whether a widget factory is registered for an attachment kind.
	 */
	hasFactory(kind: string): boolean;

	/**
	 * Try to create a widget for the given attachment using a registered factory.
	 * Returns undefined if no factory is registered for the attachment's kind.
	 * `sessionResource` is the session of the chat that shows the attachment.
	 */
	createWidget(
		attachment: IChatRequestVariableEntry,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		sessionResource: URI | undefined,
	): IChatAttachmentWidgetInstance | undefined;
}

export class ChatAttachmentWidgetRegistry implements IChatAttachmentWidgetRegistry {

	declare readonly _serviceBrand: undefined;

	private readonly _factories = new Map<string, ChatAttachmentWidgetFactory>();

	registerFactory(kind: string, factory: ChatAttachmentWidgetFactory): IDisposable {
		this._factories.set(kind, factory);
		return {
			dispose: () => {
				if (this._factories.get(kind) === factory) {
					this._factories.delete(kind);
				}
			}
		};
	}

	hasFactory(kind: string): boolean {
		return this._factories.has(kind);
	}

	createWidget(
		attachment: IChatRequestVariableEntry,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		sessionResource: URI | undefined,
	): IChatAttachmentWidgetInstance | undefined {
		const factory = this._factories.get(attachment.kind);
		if (!factory) {
			return undefined;
		}
		return factory(attachment, options, container, sessionResource);
	}
}
