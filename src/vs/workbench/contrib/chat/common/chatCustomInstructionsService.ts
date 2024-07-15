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
	provideCustomInstructions(token: CancellationToken): ProviderResult<IChatCustomInstruction[]>;
}

export interface IChatCustomInstructionsService {

	readonly _serviceBrand: undefined;

	registerProvider(id: string, provider: IChatCustomInstructionProvider): IDisposable;

	getProviders(): IChatCustomInstructionProvider[];
}



export class ChatCustomInstructionsService extends Disposable implements IChatCustomInstructionsService {

	readonly _serviceBrand: undefined;

	private readonly providers = new Map<string, IChatCustomInstructionProvider>();

	registerProvider(id: string, provider: IChatCustomInstructionProvider): IDisposable {
		if (this.providers.has(id)) {
			throw new Error(`Provider with id ${id} already registered`);
		}
		this.providers.set(id, provider);
		return toDisposable(() => {
			this.providers.delete(id);
		});
	}

	public getProviders(): IChatCustomInstructionProvider[] {
		return [...this.providers.values()];
	}

	public override dispose(): void {
		this.providers.clear();
		super.dispose();
	}
}
