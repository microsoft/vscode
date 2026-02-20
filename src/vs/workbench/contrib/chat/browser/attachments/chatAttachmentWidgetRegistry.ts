/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as event from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';

/**
 * Interface for a contributed attachment widget instance.
 */
export interface IChatAttachmentWidgetInstance extends IDisposable {
	readonly element: HTMLElement;
	readonly onDidDelete: event.Event<Event>;
	readonly onDidOpen: event.Event<void>;
}

/**
 * Factory function type for creating attachment widgets.
 * Receives the instantiation service so it can create DI-injected widget instances.
 */
export type ChatAttachmentWidgetFactory = (
	instantiationService: IInstantiationService,
	attachment: IChatRequestVariableEntry,
	options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
	container: HTMLElement,
) => IChatAttachmentWidgetInstance;

export const IChatAttachmentWidgetRegistry = createDecorator<IChatAttachmentWidgetRegistry>('chatAttachmentWidgetRegistry');

export interface IChatAttachmentWidgetRegistry {
	readonly _serviceBrand: undefined;

	/**
	 * Register a widget factory for a specific attachment kind.
	 */
	registerFactory(kind: string, factory: ChatAttachmentWidgetFactory): IDisposable;

	/**
	 * Try to create a widget for the given attachment using a registered factory.
	 * Returns undefined if no factory is registered for the attachment's kind.
	 */
	createWidget(
		instantiationService: IInstantiationService,
		attachment: IChatRequestVariableEntry,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
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

	createWidget(
		instantiationService: IInstantiationService,
		attachment: IChatRequestVariableEntry,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
	): IChatAttachmentWidgetInstance | undefined {
		const factory = this._factories.get(attachment.kind);
		if (!factory) {
			return undefined;
		}
		return factory(instantiationService, attachment, options, container);
	}
}
