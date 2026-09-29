/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { ImportsRunnable, TypeOfExpressionRunnable, TypeOfLocalsRunnable, TypesOfNeighborFilesRunnable } from './baseContextProviders';
import { AbstractContextRunnable, ComputeCost, ContextProvider, ContextResult, SnippetLocation, type ComputeContextSession, type ContextRunnableCollector, type ProviderComputeContext, type RequestContext, type RunnableResult } from './contextProvider';
import { CacheScopeKind, EmitMode, Priorities, SpeculativeKind } from './protocol';
import tss, { type TokenInfo } from './typescripts';


export type SymbolsInScope = {
	functions: {
		real: tt.Symbol[];
		aliased: { alias: tt.Symbol; real: tt.Symbol }[];
	};
	modules: { alias: tt.Symbol; real: tt.Symbol }[];
};

export class GlobalsRunnable extends AbstractContextRunnable {

	private readonly tokenInfo: TokenInfo;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, tokenInfo: TokenInfo) {
		super(session, languageService, context, 'GlobalsRunnable', SnippetLocation.Secondary, Priorities.Globals, ComputeCost.Medium);
		this.tokenInfo = tokenInfo;
	}

	public override getActiveSourceFile(): tt.SourceFile {
		return this.tokenInfo.token.getSourceFile();
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		return result.createRunnableResult(this.id, this.priority, SpeculativeKind.emit, { emitMode: EmitMode.ClientBased, scope: { kind: CacheScopeKind.File } });
	}

	protected override run(_result: RunnableResult, token: tt.CancellationToken): void {
		const symbols = this.symbols;
		const sourceFile = this.tokenInfo.token.getSourceFile();

		const inScope = this.getSymbolsInScope(symbols.getTypeChecker(), sourceFile);
		token.throwIfCancellationRequested();

		// Add functions in scope
		for (const symbol of inScope) {
			token.throwIfCancellationRequested();
			if (!this.handleSymbol(symbol, undefined, true)) {
				break;
			}
		}
	}

	protected getSymbolsInScope(typeChecker: tt.TypeChecker, sourceFile: tt.SourceFile): tt.Symbol[] {
		const result: tt.Symbol[] = [];
		const symbols = typeChecker.getSymbolsInScope(sourceFile, ts.SymbolFlags.Function | ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.ValueModule);
		for (const symbol of symbols) {
			if (this.skipSymbolBasedOnDeclaration(symbol)) {
				continue;
			}
			result.push(this.symbols.getLeafSymbol(symbol));
		}
		return result;
	}
}

export class SourceFileContextProvider extends ContextProvider {

	private readonly tokenInfo: tss.TokenInfo;
	private readonly computeInfo: ProviderComputeContext;

	public override readonly isCallableProvider: boolean;

	constructor(tokenInfo: tss.TokenInfo, computeInfo: ProviderComputeContext) {
		super();
		this.tokenInfo = tokenInfo;
		this.computeInfo = computeInfo;
		this.isCallableProvider = true;
	}

	public provide(result: ContextRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void {
		token.throwIfCancellationRequested();
		result.addSecondary(new GlobalsRunnable(session, languageService, context, this.tokenInfo));
		if (!this.computeInfo.isFirstCallableProvider(this)) {
			return;
		}
		result.addPrimary(new TypeOfLocalsRunnable(session, languageService, context, this.tokenInfo, new Set(), undefined));
		const runnable = TypeOfExpressionRunnable.create(session, languageService, context, this.tokenInfo, token);
		if (runnable !== undefined) {
			result.addPrimary(runnable);
		}
		result.addSecondary(new ImportsRunnable(session, languageService, context, this.tokenInfo, new Set(), undefined));
		if (context.neighborFiles.length > 0) {
			result.addTertiary(new TypesOfNeighborFilesRunnable(session, languageService, context, this.tokenInfo));
		}
	}
}