/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';

import { ImportsRunnable, TypeOfExpressionRunnable, TypeOfLocalsRunnable, TypesOfNeighborFilesRunnable } from './baseContextProviders';
import { ContextProvider, type ComputeContextSession, type ContextRunnableCollector, type ProviderComputeContext, type RequestContext } from './contextProvider';
import tss from './typescripts';

export class ModuleContextProvider extends ContextProvider {

	protected readonly declaration: tt.ModuleDeclaration;
	private readonly tokenInfo: tss.TokenInfo;
	private readonly computeInfo: ProviderComputeContext;

	public override readonly isCallableProvider: boolean;

	constructor(declaration: tt.ModuleDeclaration, tokenInfo: tss.TokenInfo, computeInfo: ProviderComputeContext) {
		super();
		this.declaration = declaration;
		this.tokenInfo = tokenInfo;
		this.computeInfo = computeInfo;
		this.isCallableProvider = true;
	}

	public provide(result: ContextRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void {
		token.throwIfCancellationRequested();
		if (!this.computeInfo.isFirstCallableProvider(this)) {
			return;
		}
		const excludes = new Set<tt.Symbol>();
		result.addPrimary(new TypeOfLocalsRunnable(session, languageService, context, this.tokenInfo, excludes, undefined));
		const runnable = TypeOfExpressionRunnable.create(session, languageService, context, this.tokenInfo, token);
		if (runnable !== undefined) {
			result.addPrimary(runnable);
		}
		result.addSecondary(new ImportsRunnable(session, languageService, context, this.tokenInfo, excludes, undefined));
		if (context.neighborFiles.length > 0) {
			result.addTertiary(new TypesOfNeighborFilesRunnable(session, languageService, context, this.tokenInfo, undefined));
		}
	}
}