/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { ProviderResult } from 'vs/editor/common/languages';

export const IChatCustomInstructionsService = createDecorator<IChatCustomInstructionsService>('chatCustomInstructionsService');

export interface IChatCustomInstruction {
	readonly name: string;
	readonly resource: URI;
}

export interface IChatCustomInstructionProvider {
	provideCustomInstructions(token: CancellationToken): ProviderResult<IChatCustomInstruction[] | undefined>;
}

export interface IChatCustomInstructionsService {

	readonly _serviceBrand: undefined;

	registerProvider(provider: IChatCustomInstructionProvider): IDisposable;

	getProviders(): IChatCustomInstructionProvider[];
}



export class ChatCustomInstructionsService extends Disposable implements IChatCustomInstructionsService {

	readonly _serviceBrand: undefined;

	private readonly providers: IChatCustomInstructionProvider[] = [];

	registerProvider(provider: IChatCustomInstructionProvider): IDisposable {
		this.providers.push(provider);
		return toDisposable(() => {
			const index = this.providers.indexOf(provider);
			if (index !== -1) {
				this.providers.splice(index, 1);
			}
		});
	}

	public getProviders(): IChatCustomInstructionProvider[] {
		return [...this.providers];
	}

	public override dispose(): void {
		this.providers.length = 0;
		super.dispose();
	}
}
