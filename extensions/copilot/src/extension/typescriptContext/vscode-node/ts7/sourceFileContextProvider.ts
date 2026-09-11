/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SymbolFlags, type Project, type Symbol as NativeSymbol } from '@typescript/native/unstable/async';
import type { SourceFile } from '@typescript/native/unstable/ast';
import { ImportsRunnable, TypeOfExpressionRunnable, TypeOfLocalsRunnable, TypesOfNeighborFilesRunnable } from './baseContextProviders';
import { AbstractContextRunnable, ComputeCost, ContextProvider, SnippetLocation, type ComputeContextSession, type ContextResult, type ContextRunnableCollector, type ProviderComputeContext, type RequestContext, type RunnableResult } from './contextProvider';
import * as protocol from '../../common/serverProtocol';
import tss, { type CancellationTokenWithTimer } from './typescripts';

export class GlobalsRunnable extends AbstractContextRunnable {
	private readonly tokenInfo: tss.TokenInfo;

	constructor(session: ComputeContextSession, project: Project, context: RequestContext, tokenInfo: tss.TokenInfo) {
		super(session, project, context, 'GlobalsRunnable', SnippetLocation.Secondary, protocol.Priorities.Globals, ComputeCost.Medium);
		this.tokenInfo = tokenInfo;
	}

	public override getActiveSourceFile(): SourceFile {
		return this.tokenInfo.token.getSourceFile();
	}

	protected override createRunnableResult(result: ContextResult): RunnableResult {
		return result.createRunnableResult(this.id, this.priority, protocol.SpeculativeKind.emit, { emitMode: protocol.EmitMode.ClientBased, scope: { kind: protocol.CacheScopeKind.File } });
	}

	protected override async run(_result: RunnableResult, token: CancellationTokenWithTimer): Promise<void> {
		for (const symbol of await this.getSymbolsInScope()) {
			token.throwIfCancellationRequested();
			if (!await this.handleSymbol(symbol, undefined, true)) {
				break;
			}
		}
	}

	protected async getSymbolsInScope(): Promise<readonly NativeSymbol[]> {
		const result: NativeSymbol[] = [];
		const symbols = await this.symbols.getSymbolsInScope(this.getActiveSourceFile(), SymbolFlags.Function | SymbolFlags.Class | SymbolFlags.Interface | SymbolFlags.TypeAlias | SymbolFlags.ValueModule);
		for (const symbol of symbols) {
			if (await this.skipSymbolBasedOnDeclaration(symbol)) {
				continue;
			}
			result.push(await this.symbols.getLeafSymbol(symbol));
		}
		return result;
	}
}

export class SourceFileContextProvider extends ContextProvider {
	private readonly tokenInfo: tss.TokenInfo;
	private readonly computeInfo: ProviderComputeContext;

	public override readonly isCallableProvider: boolean = true;

	constructor(tokenInfo: tss.TokenInfo, computeInfo: ProviderComputeContext) {
		super();
		this.tokenInfo = tokenInfo;
		this.computeInfo = computeInfo;
	}

	public override async provide(result: ContextRunnableCollector, session: ComputeContextSession, project: Project, context: RequestContext, token: CancellationTokenWithTimer): Promise<void> {
		token.throwIfCancellationRequested();
		result.addSecondary(new GlobalsRunnable(session, project, context, this.tokenInfo));
		if (!this.computeInfo.isFirstCallableProvider(this)) {
			return;
		}
		result.addPrimary(new TypeOfLocalsRunnable(session, project, context, this.tokenInfo, new Set(), undefined));
		const expression = TypeOfExpressionRunnable.create(session, project, context, this.tokenInfo, token);
		if (expression !== undefined) {
			result.addPrimary(expression);
		}
		result.addSecondary(new ImportsRunnable(session, project, context, this.tokenInfo, new Set()));
		if (context.neighborFiles.length > 0) {
			result.addTertiary(new TypesOfNeighborFilesRunnable(session, project, context, this.tokenInfo));
		}
	}
}
