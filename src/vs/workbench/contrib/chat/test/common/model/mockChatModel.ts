/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IChatEditingSession } from '../../../common/editing/chatEditingService.js';
import { IChatChangeEvent, IChatModel, IChatRequestModel, IChatRequestNeedsInputInfo, IExportableChatData, IInputModel, ISerializableChatData } from '../../../common/model/chatModel.js';
import { ChatAgentLocation } from '../../../common/constants.js';

export class MockChatModel extends Disposable implements IChatModel {
	readonly onDidDispose = this._register(new Emitter<void>()).event;
	readonly onDidChange = this._register(new Emitter<IChatChangeEvent>()).event;
	sessionId = '';
	readonly timestamp = 0;
	readonly timing = { startTime: 0 };
	readonly initialLocation = ChatAgentLocation.Chat;
	readonly title = '';
	readonly hasCustomTitle = false;
	customTitle: string | undefined;
	lastMessageDate = Date.now();
	creationDate = Date.now();
	requests: IChatRequestModel[] = [];
	readonly requestInProgress = observableValue('requestInProgress', false);
	readonly requestNeedsInput = observableValue<IChatRequestNeedsInputInfo | undefined>('requestNeedsInput', undefined);
	readonly inputPlaceholder = undefined;
	readonly editingSession = undefined;
	readonly checkpoint = undefined;
	readonly willKeepAlive = true;
	readonly inputModel: IInputModel = {
		state: observableValue('inputModelState', undefined),
		setState: () => { },
		clearState: () => { },
		toJSON: () => undefined
	};
	readonly contributedChatSession = undefined;
	isDisposed = false;
	lastRequestObs: IObservable<IChatRequestModel | undefined>;

	constructor(readonly sessionResource: URI) {
		super();
		this.lastRequest = undefined;
		this.lastRequestObs = observableValue('lastRequest', undefined);
	}

	readonly hasRequests = false;
	readonly lastRequest: IChatRequestModel | undefined;

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
			lastMessageDate: this.lastMessageDate,
			customTitle: this.customTitle,
			initialLocation: this.initialLocation,
			requests: [],
			responderUsername: '',
			responderAvatarIconUri: undefined
		};
	}
}
