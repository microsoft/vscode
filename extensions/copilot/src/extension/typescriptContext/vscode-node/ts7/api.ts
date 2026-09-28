/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { API, Project, Snapshot, DocumentIdentifier } from '@typescript/native/unstable/async';
import {
	SyntaxKind,
	isArrowFunction,
	isClassDeclaration,
	isConstructorDeclaration,
	isFunctionDeclaration,
	isFunctionExpression,
	isGetAccessorDeclaration,
	isMethodDeclaration,
	isModuleDeclaration,
	isSetAccessorDeclaration,
	isSourceFile,
	type Node,
	type SourceFile,
} from '@typescript/native/unstable/ast';
import * as protocol from '../../common/serverProtocol';
import { CompilerOptionsRunnable } from './baseContextProviders';
import { ClassContextProvider } from './classContextProvider';
import { ContextProvider, ContextRunnableCollector, type ComputeContextSession, type ContextProviderFactory, type ContextResult, type ContextRunnable, type ProviderComputeContext, type RequestContext } from './contextProvider';
import { FunctionContextProvider } from './functionContextProvider';
import { AccessorProvider, ConstructorContextProvider, MethodContextProvider } from './methodContextProvider';
import { ModuleContextProvider } from './moduleContextProvider';
import { PrepareNesRenameResult, validateNesRename } from './nesRenameValidator';
import { SourceFileContextProvider } from './sourceFileContextProvider';
import { RecoverableError } from './types';
import tss, { Symbols, type CancellationTokenWithTimer } from './typescripts';

class ProviderComputeContextImpl implements ProviderComputeContext {
	private firstCallableProvider: ContextProvider | undefined;

	public update(contextProvider: ContextProvider): ContextProvider {
		if (this.firstCallableProvider === undefined && contextProvider.isCallableProvider === true) {
			this.firstCallableProvider = contextProvider;
		}
		return contextProvider;
	}

	public isFirstCallableProvider(contextProvider: ContextProvider): boolean {
		return this.firstCallableProvider === contextProvider;
	}
}

class ContextProviders {
	private static readonly Factories = new Map<SyntaxKind, ContextProviderFactory>([
		[SyntaxKind.SourceFile, (_node, tokenInfo, computeContext) => new SourceFileContextProvider(tokenInfo, computeContext)],
		[SyntaxKind.FunctionDeclaration, (node, tokenInfo, computeContext) => isFunctionDeclaration(node) ? new FunctionContextProvider(node, tokenInfo, computeContext) : undefined],
		[SyntaxKind.ArrowFunction, (node, tokenInfo, computeContext) => isArrowFunction(node) ? new FunctionContextProvider(node, tokenInfo, computeContext) : undefined],
		[SyntaxKind.FunctionExpression, (node, tokenInfo, computeContext) => isFunctionExpression(node) ? new FunctionContextProvider(node, tokenInfo, computeContext) : undefined],
		[SyntaxKind.GetAccessor, (node, tokenInfo, computeContext) => isGetAccessorDeclaration(node) ? new AccessorProvider(node, tokenInfo, computeContext) : undefined],
		[SyntaxKind.SetAccessor, (node, tokenInfo, computeContext) => isSetAccessorDeclaration(node) ? new AccessorProvider(node, tokenInfo, computeContext) : undefined],
		[SyntaxKind.ClassDeclaration, (node, tokenInfo) => isClassDeclaration(node) ? ClassContextProvider.create(node, tokenInfo) : undefined],
		[SyntaxKind.Constructor, (node, tokenInfo, computeContext) => isConstructorDeclaration(node) ? new ConstructorContextProvider(node, tokenInfo, computeContext) : undefined],
		[SyntaxKind.MethodDeclaration, (node, tokenInfo, computeContext) => isMethodDeclaration(node) ? new MethodContextProvider(node, tokenInfo, computeContext) : undefined],
		[SyntaxKind.ModuleDeclaration, (node, tokenInfo, computeContext) => isModuleDeclaration(node) ? new ModuleContextProvider(node, tokenInfo, computeContext) : undefined],
	]);

	private readonly tokenInfo: tss.TokenInfo;
	private readonly computeInfo: ProviderComputeContextImpl = new ProviderComputeContextImpl();

	constructor(tokenInfo: tss.TokenInfo) {
		this.tokenInfo = tokenInfo;
	}

	public async execute(result: ContextResult, session: ComputeContextSession, project: Project, token: CancellationTokenWithTimer): Promise<void> {
		const collector = await this.getContextRunnables(session, project, result.context, token);
		result.addPath(tss.StableSyntaxKinds.getPath(this.tokenInfo.touching ?? this.tokenInfo.token));
		for (const runnable of collector.entries()) {
			runnable.initialize(result);
		}
		await this.executeRunnables(collector.getPrimaryRunnables(), result, token);
		await this.executeRunnables(collector.getSecondaryRunnables(), result, token);
		await this.executeRunnables(collector.getTertiaryRunnables(), result, token);
		result.done();
	}

	private async executeRunnables(runnables: ContextRunnable[], result: ContextResult, token: CancellationTokenWithTimer): Promise<void> {
		for (const runnable of runnables) {
			token.throwIfCancellationRequested();
			try {
				await runnable.compute(token);
			} catch (error) {
				if (error instanceof RecoverableError) {
					result.addErrorData(error);
				} else {
					throw error;
				}
			}
		}
	}

	private async getContextRunnables(session: ComputeContextSession, project: Project, context: RequestContext, token: CancellationTokenWithTimer): Promise<ContextRunnableCollector> {
		const result = new ContextRunnableCollector(context.clientSideRunnableResults);
		result.addPrimary(new CompilerOptionsRunnable(session, project, context, this.tokenInfo.token.getSourceFile()));
		for (const provider of this.computeProviders()) {
			await provider.provide(result, session, project, context, token);
		}
		return result;
	}

	private computeProviders(): ContextProvider[] {
		const result: ContextProvider[] = [];
		let token: Node | undefined = this.tokenInfo.touching;
		if (token === undefined) {
			token = this.tokenInfo.token.kind === SyntaxKind.EndOfFile ? this.tokenInfo.previous : this.tokenInfo.token;
		}
		if (token === undefined || token.kind === SyntaxKind.EndOfFile) {
			return result;
		}
		let current: Node | undefined = token;
		while (current !== undefined) {
			const factory = ContextProviders.Factories.get(current.kind);
			const provider = factory?.(current, this.tokenInfo, this.computeInfo);
			if (provider !== undefined) {
				result.push(this.computeInfo.update(provider));
			}
			if (isSourceFile(current)) {
				break;
			}
			current = current.parent;
		}
		return result;
	}
}

export async function computeContext(result: ContextResult, session: ComputeContextSession, project: Project, document: SourceFile, position: number, token: CancellationTokenWithTimer): Promise<void> {
	const sourceFile = await project.program.getSourceFile(document.fileName);
	if (sourceFile === undefined) {
		result.addErrorData(new RecoverableError('No source file found for document', RecoverableError.NoSourceFile));
		return;
	}
	const tokenInfo = tss.getRelevantTokens(sourceFile, position);
	await new ContextProviders(tokenInfo).execute(result, session, project, token);
}

export async function prepareNesRename<FromLSP extends boolean>(result: PrepareNesRenameResult, api: API<FromLSP>, snapshot: Snapshot, project: Project, document: SourceFile, position: number, oldName: string | undefined, newName: string | undefined, lastSymbolRename: protocol.Range | undefined, token: CancellationTokenWithTimer): Promise<void> {
	if (typeof oldName !== 'string' || oldName.length === 0) {
		result.setCanRename(protocol.RenameKind.no, 'No old name provided');
		return;
	}
	if (typeof newName !== 'string' || newName.length === 0) {
		result.setCanRename(protocol.RenameKind.no, 'No new name provided');
		return;
	}

	const state = await doPrepareNesRename(result, project, document, position, oldName, newName, token);
	if (state !== PrepareState.unavailable || lastSymbolRename === undefined) {
		return;
	}

	const [oldText, oldPosition] = getOldText(document, position, oldName, newName, lastSymbolRename);
	await runWithTemporaryFileUpdate<FromLSP>(api, snapshot, document.fileName, oldText, async updatedSnapshot => {
		const updatedProject = await getUpdatedProject(updatedSnapshot, project, document.fileName);
		const updatedSourceFile = await updatedProject?.program.getSourceFile(document.fileName);
		if (updatedProject === undefined || updatedSourceFile === undefined) {
			result.setCanRename(protocol.RenameKind.no, 'No source file found for document');
			return;
		}
		const updatedState = await doPrepareNesRename(result, updatedProject, updatedSourceFile, oldPosition, oldName, newName, token);
		if (updatedState === PrepareState.prepared && (result.getCanRename() === protocol.RenameKind.maybe || result.getCanRename() === protocol.RenameKind.yes)) {
			result.setOnOldState(true);
		}
	});
}

export async function nesRename<FromLSP extends boolean>(api: API<FromLSP>, snapshot: Snapshot, project: Project, document: SourceFile, position: number, oldName: string | undefined, newName: string | undefined, lastSymbolRename: protocol.Range | undefined, token: CancellationTokenWithTimer): Promise<protocol.RenameGroup[]> {
	if (oldName === undefined || newName === undefined || lastSymbolRename === undefined) {
		return [];
	}

	const [oldText, oldPosition] = getOldText(document, position, oldName, newName, lastSymbolRename);
	const groups = new Map<string, protocol.RenameGroup>();
	const seen = new Set<string>();
	await runWithTemporaryFileUpdate<FromLSP>(api, snapshot, document.fileName, oldText, async updatedSnapshot => {
		const updatedProject = await getUpdatedProject(updatedSnapshot, project, document.fileName);
		const updatedSourceFile = await updatedProject?.program.getSourceFile(document.fileName);
		if (updatedProject === undefined || updatedSourceFile === undefined) {
			return;
		}
		const renameTarget = getRenameTarget(updatedSourceFile, oldPosition, oldName);
		if (renameTarget.node.getText(updatedSourceFile) !== oldName) {
			return;
		}
		const symbols = new Symbols(updatedProject, token);
		const referencedSymbols = await updatedProject.languageService.getReferencedSymbolsForNode(renameTarget.node, renameTarget.position);
		for (const referencedSymbol of referencedSymbols) {
			const definition = await referencedSymbol.definition.resolve(updatedProject);
			if (definition === undefined || await symbols.isSourceFileFromLibrary(definition.getSourceFile())) {
				return;
			}
		}
		for (const referencedSymbol of referencedSymbols) {
			for (const reference of referencedSymbol.references) {
				token.throwIfCancellationRequested();
				const node = await reference.resolve(updatedProject);
				if (node === undefined) {
					continue;
				}
				const sourceFile = node.getSourceFile();
				if (await symbols.isSourceFileFromLibrary(sourceFile)) {
					continue;
				}
				const startPosition = node.getStart(sourceFile);
				const endPosition = node.getEnd();
				const key = `${sourceFile.path}:${startPosition}:${endPosition}`;
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);
				const start = sourceFile.getLineAndCharacterOfPosition(startPosition);
				const end = sourceFile.getLineAndCharacterOfPosition(endPosition);
				const delta = newName.length - oldName.length;
				if (
					sourceFile.fileName === document.fileName &&
					start.line === lastSymbolRename.start.line && start.character === lastSymbolRename.start.character &&
					end.line === lastSymbolRename.end.line && end.character === lastSymbolRename.end.character - delta
				) {
					continue;
				}
				let group = groups.get(sourceFile.fileName);
				if (group === undefined) {
					group = { file: sourceFile.fileName, changes: [] };
					groups.set(sourceFile.fileName, group);
				}
				group.changes.push({
					range: {
						start: { line: start.line, character: start.character },
						end: { line: end.line, character: end.character },
					},
				});
			}
		}
	});
	return Array.from(groups.values());
}

function runWithTemporaryFileUpdate<FromLSP extends boolean>(api: API<FromLSP>, baseSnapshot: Snapshot, file: DocumentIdentifier, newText: string, cb: (newSnapshot: Snapshot) => void | Promise<void>): Promise<void> {
	interface ApiWithTemporaryFileUpdate {
		runWithTemporaryFileUpdate(baseSnapshot: Snapshot, file: DocumentIdentifier, newText: string, cb: (newSnapshot: Snapshot) => void | Promise<void>): Promise<void>;
	}
	if (typeof (api as unknown as ApiWithTemporaryFileUpdate).runWithTemporaryFileUpdate === 'function') {
		return (api as unknown as ApiWithTemporaryFileUpdate).runWithTemporaryFileUpdate(baseSnapshot, file, newText, cb);
	}
	return Promise.resolve();
}

const enum PrepareState {
	prepared,
	unavailable,
	mismatch,
}

async function doPrepareNesRename(result: PrepareNesRenameResult, project: Project, sourceFile: SourceFile, position: number, oldName: string, newName: string, token: CancellationTokenWithTimer): Promise<PrepareState> {
	const renameTarget = getRenameTarget(sourceFile, position, oldName);
	const tokenText = renameTarget.node.getText(sourceFile);
	if (tokenText !== oldName) {
		result.setCanRename(protocol.RenameKind.no, `Old name '${oldName}' does not match symbol name '${tokenText}'`);
		return PrepareState.mismatch;
	}
	token.throwIfCancellationRequested();
	if (await project.checker.getSymbolAtLocation(renameTarget.node) === undefined) {
		result.setCanRename(protocol.RenameKind.no, 'No symbol found at location');
		return PrepareState.unavailable;
	}
	result.setCanRename(protocol.RenameKind.maybe, oldName);
	await validateNesRename(result, project, renameTarget.node, oldName, newName, token);
	return PrepareState.prepared;
}

function getRenameTarget(sourceFile: SourceFile, position: number, oldName: string): { node: Node; position: number } {
	const token = tss.getRelevantTokens(sourceFile, position).token;
	if (token.getText(sourceFile) === oldName) {
		return { node: token, position };
	}
	let current: Node | undefined = token.parent;
	while (current !== undefined && !isSourceFile(current)) {
		if (isFunctionDeclaration(current) && current.name?.getText(sourceFile) === oldName) {
			return { node: current.name, position: current.name.getStart(sourceFile) };
		}
		current = current.parent;
	}
	return { node: token, position };
}

async function getUpdatedProject(snapshot: Snapshot, project: Project, fileName: string): Promise<Project | undefined> {
	return snapshot.getProject(project.configFileName) ?? await snapshot.getDefaultProjectForFile(fileName);
}

function getOldText(sourceFile: SourceFile, position: number, oldName: string, newName: string, lastSymbolRename: protocol.Range): [string, number] {
	const startPosition = sourceFile.getPositionOfLineAndCharacter(lastSymbolRename.start.line, lastSymbolRename.start.character);
	const endPosition = sourceFile.getPositionOfLineAndCharacter(lastSymbolRename.end.line, lastSymbolRename.end.character);
	const oldText = sourceFile.text.substring(0, startPosition) + oldName + sourceFile.text.substring(endPosition);
	return [oldText, position < startPosition ? position : position - (newName.length - oldName.length)];
}
