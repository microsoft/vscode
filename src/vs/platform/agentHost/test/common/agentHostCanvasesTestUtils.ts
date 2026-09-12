/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';

export const unavailableCanvases = {
	_serviceBrand: undefined,
	available: false,
	readiness: undefined,
	onDidReleaseHold: Event.None,
	holdsSession: () => false,
	connect: () => { throw new Error('No canvas runtime in this test.'); },
	loadChat: async () => [],
	persistChat: async () => { },
	requestApproval: async () => false,
	appendAttachments: () => { },
	discardPendingAttachments: () => { },
	getChatInitialization: () => undefined,
	beginChatCreation: () => { throw new Error('No canvas initialization in this test.'); },
	isChatInitializing: () => false,
	cancelChatInitialization: () => { },
	cancelSessionInitialization: () => { },
	assertChatInitialization: () => { },
	retainChat: async () => { },
	needsTurnInitialization: () => false,
	prepareForTurn: async () => { },
	beginTurnPreparation: () => { throw new Error('No canvas turn preparation in this test.'); },
	cancelTurnPreparation: () => false,
};
