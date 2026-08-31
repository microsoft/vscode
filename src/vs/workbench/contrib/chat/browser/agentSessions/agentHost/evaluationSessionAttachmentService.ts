/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { SessionInputRequestKind } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { ToolCallStatus } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
export interface IEvaluationSessionIdentity {
	readonly connectionAuthority: string;
	readonly backendSession: URI;
}
export const enum EvaluationSessionActiveClientPublicationState {
	Pending,
	Ready,
}
export interface IEvaluationSessionAttachment extends IDisposable {
	markActiveClientPublicationReady(): void;
}
export const IEvaluationSessionAttachmentService = createDecorator<IEvaluationSessionAttachmentService>('evaluationSessionAttachmentService');
export interface IEvaluationSessionAttachmentService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeActiveClientPublicationState: Event<IEvaluationSessionIdentity>;
	attach(identity: IEvaluationSessionIdentity): IEvaluationSessionAttachment;
	isAttached(identity: IEvaluationSessionIdentity): boolean;
	getActiveClientPublicationState(identity: IEvaluationSessionIdentity): EvaluationSessionActiveClientPublicationState | undefined;
	waitForActiveClientPublicationReady(identity: IEvaluationSessionIdentity, token: CancellationToken): Promise<boolean> | undefined;
	shouldDeferConfirmation(identity: IEvaluationSessionIdentity & { readonly clientId: string }, request: { readonly kind: SessionInputRequestKind; readonly clientId: string; readonly toolCall: { readonly status: ToolCallStatus } }): boolean;
}
export class EvaluationSessionAttachmentService implements IEvaluationSessionAttachmentService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeActiveClientPublicationState = new Emitter<IEvaluationSessionIdentity>();
	readonly onDidChangeActiveClientPublicationState = this._onDidChangeActiveClientPublicationState.event;
	private _attachment: {
		readonly identity: IEvaluationSessionIdentity;
		readonly readiness: DeferredPromise<boolean>;
		state: EvaluationSessionActiveClientPublicationState;
	} | undefined;
	attach(identity: IEvaluationSessionIdentity): IEvaluationSessionAttachment {
		if (this._attachment) {
			throw new Error('An evaluation session is already attached to this window.');
		}
		const attachment = {
			identity,
			readiness: new DeferredPromise<boolean>(),
			state: EvaluationSessionActiveClientPublicationState.Pending,
		};
		this._attachment = attachment;
		this._onDidChangeActiveClientPublicationState.fire(identity);
		return {
			markActiveClientPublicationReady: () => {
				if (this._attachment !== attachment || attachment.state === EvaluationSessionActiveClientPublicationState.Ready) {
					return;
				}
				attachment.state = EvaluationSessionActiveClientPublicationState.Ready;
				attachment.readiness.complete(true);
				this._onDidChangeActiveClientPublicationState.fire(identity);
			},
			dispose: () => {
				if (this._attachment === attachment) {
					this._attachment = undefined;
					attachment.readiness.complete(false);
					this._onDidChangeActiveClientPublicationState.fire(identity);
				}
			}
		};
	}
	isAttached(identity: IEvaluationSessionIdentity): boolean {
		return this._isIdentity(this._attachment?.identity, identity);
	}
	getActiveClientPublicationState(identity: IEvaluationSessionIdentity): EvaluationSessionActiveClientPublicationState | undefined {
		return this.isAttached(identity) ? this._attachment?.state : undefined;
	}
	waitForActiveClientPublicationReady(identity: IEvaluationSessionIdentity, token: CancellationToken): Promise<boolean> | undefined {
		const attachment = this._attachment;
		if (!attachment || !this._isIdentity(attachment.identity, identity)) {
			return undefined;
		}
		if (attachment.state === EvaluationSessionActiveClientPublicationState.Ready) {
			return Promise.resolve(!token.isCancellationRequested);
		}
		return raceCancellation(attachment.readiness.p, token, false);
	}
	shouldDeferConfirmation(identity: IEvaluationSessionIdentity & { readonly clientId: string }, request: { readonly kind: SessionInputRequestKind; readonly clientId: string; readonly toolCall: { readonly status: ToolCallStatus } }): boolean {
		return this.isAttached(identity)
			&& request.kind === SessionInputRequestKind.ToolClientExecution
			&& request.clientId === identity.clientId
			&& request.toolCall.status === ToolCallStatus.PendingConfirmation;
	}
	private _isIdentity(first: IEvaluationSessionIdentity | undefined, second: IEvaluationSessionIdentity): boolean {
		return first?.connectionAuthority === second.connectionAuthority
			&& first.backendSession.toString() === second.backendSession.toString();
	}
}

registerSingleton(IEvaluationSessionAttachmentService, EvaluationSessionAttachmentService, InstantiationType.Delayed);
