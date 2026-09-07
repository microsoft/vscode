/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Project, Symbol as NativeSymbol } from '@typescript/native/unstable/async';
import type { ArrowFunction, FunctionDeclaration, FunctionExpression } from '@typescript/native/unstable/ast';
import { FunctionLikeContextProvider } from './baseContextProviders';
import type { ComputeContextSession, ContextRunnableCollector, ProviderComputeContext, RequestContext } from './contextProvider';
import type tss from './typescripts';
import type { CancellationTokenWithTimer } from './typescripts';

export class FunctionContextProvider extends FunctionLikeContextProvider {
	protected readonly functionDeclaration: FunctionDeclaration | ArrowFunction | FunctionExpression;

	constructor(functionDeclaration: FunctionDeclaration | ArrowFunction | FunctionExpression, tokenInfo: tss.TokenInfo, computeContext: ProviderComputeContext) {
		super(functionDeclaration, tokenInfo, computeContext);
		this.functionDeclaration = functionDeclaration;
	}

	public override async provide(result: ContextRunnableCollector, session: ComputeContextSession, project: Project, context: RequestContext, token: CancellationTokenWithTimer): Promise<void> {
		await super.provide(result, session, project, context, token);
	}

	protected override async getTypeExcludes(): Promise<Set<NativeSymbol>> {
		return new Set();
	}
}
