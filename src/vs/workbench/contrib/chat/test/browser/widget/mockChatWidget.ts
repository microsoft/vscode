/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ChatAgentLocation } from '../../../common/constants.js';

export class MockChatWidgetService implements IChatWidgetService {
	readonly onDidAddWidget: Event<IChatWidget> = Event.None;
	readonly onDidRemoveWidget: Event<IChatWidget> = Event.None;
	readonly onDidChangeWidgetVisibility: Event<IChatWidget> = Event.None;
	readonly onDidBackgroundSession: Event<URI> = Event.None;
	readonly onDidChangeFocusedWidget: Event<IChatWidget | undefined> = Event.None;
	readonly onDidChangeFocusedSession: Event<void> = Event.None;

	readonly _serviceBrand: undefined;

	/**
	 * Returns the most recently focused widget if any.
	 */
	readonly lastFocusedWidget: IChatWidget | undefined;

	getWidgetByInputUri(uri: URI): IChatWidget | undefined {
		return undefined;
	}

	getWidgetBySessionResource(sessionResource: URI): IChatWidget | undefined {
		return undefined;
	}

	getWidgetsByLocations(location: ChatAgentLocation): ReadonlyArray<IChatWidget> {
		return [];
	}

	revealWidget(preserveFocus?: boolean): Promise<IChatWidget | undefined> {
		return Promise.resolve(undefined);
	}

	revealChatView(preserveFocus?: boolean): Promise<IChatWidget | undefined> {
		return Promise.resolve(undefined);
	}

	reveal(widget: IChatWidget, preserveFocus?: boolean): Promise<boolean> {
		return Promise.resolve(true);
	}

	getAllWidgets(): ReadonlyArray<IChatWidget> {
		throw new Error('Method not implemented.');
	}

	openSession(sessionResource: URI): Promise<IChatWidget | undefined> {
		throw new Error('Method not implemented.');
	}

	register(newWidget: IChatWidget): IDisposable {
		return Disposable.None;
	}
}

/**
 * Creates a chat widget whose input part refers back to the widget, like `ChatWidget` and `ChatInputPart`,
 * so the widget cannot be serialized as JSON.
 */
export function createCircularChatWidget(inputUri: URI, sessionResource: URI | undefined): IChatWidget {
	const input = { inputUri, widget: undefined as IChatWidget | undefined };
	const widget = upcastPartial<IChatWidget>({
		input: upcastPartial<IChatWidget['input']>(input),
		viewModel: sessionResource ? upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource }) : undefined,
	});
	input.widget = widget;
	return widget;
}
