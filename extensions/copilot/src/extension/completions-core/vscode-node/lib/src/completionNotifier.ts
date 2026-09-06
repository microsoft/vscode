/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import EventEmitter from 'events';
import { createServiceIdentifier } from '../../../../../util/common/services';
import { ICompletionsTelemetryService } from '../../bridge/src/completionsTelemetryServiceBridge';
import { CancellationToken, Disposable } from '../../types/src';
import { CompletionState } from './completionState';
import { GetGhostTextOptions } from './ghostText/ghostText';
import { telemetryCatch, TelemetryWithExp } from './telemetry';
import { ICompletionsPromiseQueueService } from './util/promiseQueue';

export type CompletionRequestedEvent = {
	completionId: string;
	completionState: CompletionState;
	telemetryData: TelemetryWithExp;
	cancellationToken?: CancellationToken;
	options?: Partial<GetGhostTextOptions>;
};

const requestEventName = 'CompletionRequested';

export const ICompletionsNotifierService = createServiceIdentifier<ICompletionsNotifierService>('ICompletionsNotifierService');
export interface ICompletionsNotifierService {
	readonly _serviceBrand: undefined;
	notifyRequest(
		completionState: CompletionState,
		completionId: string,
		telemetryData: TelemetryWithExp,
		cancellationToken?: CancellationToken,
		options?: Partial<GetGhostTextOptions>
	): void;

	onRequest(listener: (event: CompletionRequestedEvent) => void): Disposable;
}

export class CompletionNotifier implements ICompletionsNotifierService {
	declare _serviceBrand: undefined;
	#emitter = new EventEmitter();
	constructor(
		@ICompletionsPromiseQueueService protected completionsPromiseQueue: ICompletionsPromiseQueueService,
		@ICompletionsTelemetryService protected completionsTelemetryService: ICompletionsTelemetryService,
	) { }

	notifyRequest(
		completionState: CompletionState,
		completionId: string,
		telemetryData: TelemetryWithExp,
		cancellationToken?: CancellationToken,
		options?: Partial<GetGhostTextOptions>
	) {
		return this.#emitter.emit(requestEventName, {
			completionId,
			completionState,
			telemetryData,
			cancellationToken,
			options,
		});
	}

	onRequest(listener: (event: CompletionRequestedEvent) => void): Disposable {
		const wrapper = telemetryCatch(this.completionsTelemetryService, this.completionsPromiseQueue, listener, `event.${requestEventName}`);
		this.#emitter.on(requestEventName, wrapper);
		return Disposable.create(() => this.#emitter.off(requestEventName, wrapper));
	}
}
