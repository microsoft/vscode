/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatEditingSession } from '../../common/chatEditingService.js';
import { IChatChangeEvent, IChatModel, IChatRequestModel, IExportableChatData, IInputModel, ISerializableChatData } from '../../common/chatModel.js';
import { ChatAgentLocation } from '../../common/constants.js';

export class MockChatModel extends Disposable implements IChatModel {
	readonly onDidDispose = this._register(new Emitter<void>()).event;
	readonly onDidChange = this._register(new Emitter<IChatChangeEvent>()).event;
	readonly sessionId = '';
	readonly timestamp = 0;
	readonly initialLocation = ChatAgentLocation.Chat;
	readonly title = '';
	readonly hasCustomTitle = false;
	readonly requestInProgress = observableValue('requestInProgress', false);
	readonly requestNeedsInput = observableValue('requestNeedsInput', false);
	readonly inputPlaceholder = undefined;
	readonly editingSession = undefined;
	readonly checkpoint = undefined;
	readonly inputModel: IInputModel = {
		state: observableValue('inputModelState', undefined),
		setState: () => { },
		clearState: () => { }
	};
	readonly contributedChatSession = undefined;
	isDisposed = false;

	constructor(readonly sessionResource: URI) {
		super();
	}

	override dispose() {
		this.isDisposed = true;
		super.dispose();
	}

	startEditingSession(isGlobalEditingSession?: boolean, transferFromSession?: IChatEditingSession): void { }
	getRequests(): IChatRequestModel[] { return []; }
	setCheckpoint(requestId: string | undefined): void { }
	toExport(): IExportableChatData {
		return {
			initialLocation: this.initialLocation,
			requests: [],
			responderUsername: '',
			responderAvatarIconUri: undefined
		};
	}
	toJSON(): ISerializableChatData {
		return {
			version: 3,
			sessionId: this.sessionId,
			creationDate: this.timestamp,
			isImported: false,
			lastMessageDate: this.timestamp,
			customTitle: undefined,
			initialLocation: this.initialLocation,
			requests: [],
			responderUsername: '',
			responderAvatarIconUri: undefined
		};
	}
}
