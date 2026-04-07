/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vscode-languageserver-protocol';
import { IInstantiationService } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { VirtualPrompt } from '../../../../prompt/src/components/virtualPrompt';
import { TokenizerName } from '../../../../prompt/src/tokenization';
import { CompletionState } from '../../completionState';
import { TelemetryWithExp } from '../../telemetry';
import { _promptCancelled, _promptError, _promptTimeout, PromptResponse } from '../prompt';
import {
	PromptOrdering,
	TestComponentsCompletionsPromptFactory
} from './componentsCompletionsPromptFactory';
import { createServiceIdentifier } from '../../../../../../../util/common/services';

export interface PromptOpts {
	data?: unknown;
	separateContext?: boolean;
	tokenizer?: TokenizerName;
}

export interface CompletionsPromptOptions {
	completionId: string;
	completionState: CompletionState;
	telemetryData: TelemetryWithExp;
	promptOpts?: PromptOpts;
}

export interface IPromptFactory {
	prompt(
		opts: CompletionsPromptOptions,
		cancellationToken?: CancellationToken
	): Promise<PromptResponse>;
}

export const ICompletionsPromptFactoryService = createServiceIdentifier<ICompletionsPromptFactoryService>('ICompletionsPromptFactoryService');
export interface ICompletionsPromptFactoryService extends IPromptFactory {
	readonly _serviceBrand: undefined;
}

// This class needs to extend CompletionsPromptFactory since it's set on the context.
class SequentialCompletionsPromptFactory implements IPromptFactory {
	declare _serviceBrand: undefined;
	private lastPromise?: Promise<PromptResponse>;

	constructor(private readonly delegate: IPromptFactory) { }

	async prompt(opts: CompletionsPromptOptions, cancellationToken?: CancellationToken): Promise<PromptResponse> {
		this.lastPromise = this.promptAsync(opts, cancellationToken);
		return this.lastPromise;
	}

	private async promptAsync(
		opts: CompletionsPromptOptions,
		cancellationToken?: CancellationToken
	): Promise<PromptResponse> {
		// Wait for previous request to complete
		await this.lastPromise;

		// Check if request was cancelled while waiting
		if (cancellationToken?.isCancellationRequested) {
			return _promptCancelled;
		}

		// Return prompt from delegate catching any errors
		try {
			return await this.delegate.prompt(opts, cancellationToken);
		} catch {
			return _promptError;
		}
	}
}

// 0.01% of prompt construction time is 1s+. Setting this to 1200ms should be safe.
export const DEFAULT_PROMPT_TIMEOUT = 1200;
class TimeoutHandlingCompletionsPromptFactory implements IPromptFactory {
	constructor(private readonly delegate: IPromptFactory) { }

	async prompt(opts: CompletionsPromptOptions, cancellationToken?: CancellationToken): Promise<PromptResponse> {
		const timeoutTokenSource = new CancellationTokenSource();
		const timeoutToken = timeoutTokenSource.token;
		cancellationToken?.onCancellationRequested(() => {
			timeoutTokenSource.cancel();
		});

		return await Promise.race([
			this.delegate.prompt(opts, timeoutToken),
			new Promise<PromptResponse>(resolve => {
				setTimeout(() => {
					// Cancel the token when timeout occurs
					timeoutTokenSource.cancel();
					resolve(_promptTimeout);
				}, DEFAULT_PROMPT_TIMEOUT);
			}),
		]);
	}
}

class BaseComponentsCompletionsPromptFactory implements IPromptFactory {
	declare _serviceBrand: undefined;

	private readonly delegate: IPromptFactory;

	constructor(
		virtualPrompt: VirtualPrompt | undefined,
		ordering: PromptOrdering | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.delegate = new SequentialCompletionsPromptFactory(
			new TimeoutHandlingCompletionsPromptFactory(
				instantiationService.createInstance(TestComponentsCompletionsPromptFactory, virtualPrompt, ordering)
			)
		);
	}

	prompt(opts: CompletionsPromptOptions, cancellationToken?: CancellationToken): Promise<PromptResponse> {
		return this.delegate.prompt(opts, cancellationToken);
	}
}

export class CompletionsPromptFactory extends BaseComponentsCompletionsPromptFactory {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(undefined, undefined, instantiationService);
	}
}

export class TestCompletionsPromptFactory extends BaseComponentsCompletionsPromptFactory { }