/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { SessionReviewSection } from '../common/sessionReview.js';
import { IChat, ISession } from '../common/session.js';

export interface ISessionReviewSelection {
	readonly resource: URI;
	readonly label: string;
}

export interface ISessionReviewService {
	readonly _serviceBrand: undefined;
	readonly selection: IObservable<ISessionReviewSelection | undefined>;
	readonly section: IObservable<SessionReviewSection | undefined>;
	close(): Promise<boolean>;
	discuss(): void;
	send(session: ISession, chat: IChat, query: string, attachments: readonly IChatRequestVariableEntry[]): Promise<boolean>;
	focusReply(): void;
}

export const ISessionReviewService = createDecorator<ISessionReviewService>('sessionReviewService');
