/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInlineChatSession2, IInlineChatSessionService } from '../../../../workbench/contrib/inlineChat/browser/inlineChatSessionService.js';

class NullInlineChatSessionService implements IInlineChatSessionService {
	declare _serviceBrand: undefined;

	readonly onWillStartSession: Event<IActiveCodeEditor> = Event.None;
	readonly onDidChangeSessions: Event<this> = Event.None;

	dispose(): void { }

	createSession(_editor: ICodeEditor): IInlineChatSession2 {
		throw new Error('Inline chat sessions are not supported in the sessions window');
	}

	getSessionByTextModel(_uri: URI): IInlineChatSession2 | undefined {
		return undefined;
	}

	getSessionBySessionUri(_uri: URI): IInlineChatSession2 | undefined {
		return undefined;
	}
}

registerSingleton(IInlineChatSessionService, NullInlineChatSessionService, InstantiationType.Delayed);
