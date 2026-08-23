/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Project, Symbol as NativeSymbol } from '@typescript/native/unstable/async';
import type { ModuleDeclaration } from '@typescript/native/unstable/ast';
import { ImportsRunnable, TypeOfExpressionRunnable, TypeOfLocalsRunnable, TypesOfNeighborFilesRunnable } from './baseContextProviders';
import { ContextProvider, type ComputeContextSession, type ContextRunnableCollector, type ProviderComputeContext, type RequestContext } from './contextProvider';
import type tss from './typescripts';
import type { CancellationTokenWithTimer } from './typescripts';

export class ModuleContextProvider extends ContextProvider {
	protected readonly declaration: ModuleDeclaration;
	private readonly tokenInfo: tss.TokenInfo;
	private readonly computeInfo: ProviderComputeContext;

	public override readonly isCallableProvider: boolean = true;

	constructor(declaration: ModuleDeclaration, tokenInfo: tss.TokenInfo, computeInfo: ProviderComputeContext) {
		super();
		this.declaration = declaration;
		this.tokenInfo = tokenInfo;
		this.computeInfo = computeInfo;
	}

	public override async provide(result: ContextRunnableCollector, session: ComputeContextSession, project: Project, context: RequestContext, token: CancellationTokenWithTimer): Promise<void> {
		token.throwIfCancellationRequested();
		if (!this.computeInfo.isFirstCallableProvider(this)) {
			return;
		}
		const excludes = new Set<NativeSymbol>();
		result.addPrimary(new TypeOfLocalsRunnable(session, project, context, this.tokenInfo, excludes, undefined));
		const expression = TypeOfExpressionRunnable.create(session, project, context, this.tokenInfo, token);
		if (expression !== undefined) {
			result.addPrimary(expression);
		}
		result.addSecondary(new ImportsRunnable(session, project, context, this.tokenInfo, excludes));
		if (context.neighborFiles.length > 0) {
			result.addTertiary(new TypesOfNeighborFilesRunnable(session, project, context, this.tokenInfo));
		}
	}
}
