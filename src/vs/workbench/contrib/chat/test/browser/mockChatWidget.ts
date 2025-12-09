/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatAgentLocation } from '../../common/constants.js';

export class MockChatWidgetService implements IChatWidgetService {
	readonly onDidAddWidget: Event<IChatWidget> = Event.None;

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
