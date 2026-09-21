/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatElicitationRequest, IChatPlanReview, IChatQuestionCarousel, IChatToolInvocation } from './chatService/chatService.js';
import { IChatModel } from './model/chatModel.js';

export interface IChatSessionInputSource {
	readonly resource: URI;
	readonly label: string;
}

/** A live decision presented elsewhere without moving its execution or permission context. */
export interface IChatSessionInputRequest {
	readonly id: string;
	readonly source: IChatSessionInputSource;
	readonly model: IChatModel;
	readonly requestId: string;
	readonly content: IChatToolInvocation | IChatQuestionCarousel | IChatPlanReview | IChatElicitationRequest;
	readonly isActive: IObservable<boolean>;
}

export interface IChatSessionInputRequests extends IDisposable {
	readonly requests: IObservable<readonly IChatSessionInputRequest[]>;
}
