/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { getLanguage, getLanguageForResource, ILanguage, WellKnownLanguageId, wellKnownLanguages } from '../../../util/common/languages';
import { isUri } from '../../../util/common/types';
import { createSha256Hash } from '../../../util/common/crypto';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Location, Range, Uri } from '../../../vscodeTypes';
import { findWordInReferences } from '../../linkify/vscode-node/findWord';
import { PromptReference } from '../../prompt/common/conversation';

const codeBlockScheme = 'vscode-chat-code-block';

/**
 * Hovers that are provided by a language provider in cases where the correct types are not known.
 *
 * A good example of this is how js/ts shows `any` for any unknown types. In these cases, we instead want to try looking
 * up a more helpful hover using the workspace symbols.
 */
const genericHoverMessages: RegExp[] = [
	/^\n```(typescript|javascript|tsx|jsx)\S*\nany\n```\n$/i,
];

/**
 * Groupings of languages that can reference each other for intellisense.
 *
 * For example, when trying to look up a symbol in a JS code block, we shouldn't bother
 * looking up symbols in c++ or markdown files.
 */
const languageReferenceGroups: readonly Set<string>[] = [
	new Set<WellKnownLanguageId>([
		'typescript',
		'javascript',
		'typescriptreact',
		'javascriptreact',
	]),

	// Put all other languages in their own group
	...Array.from(wellKnownLanguages.keys(), lang => new Set([lang]))
];

/**
 * Provides support for Intellisense chat code blocks.
 */
class CodeBlockIntelliSenseProvider implements vscode.DefinitionProvider, vscode.ImplementationProvider, vscode.TypeDefinitionProvider, vscode.HoverProvider {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.LocationLink[] | undefined> {
		return this.goTo('vscode.experimental.executeDefinitionProvider_recursive', document, position, token);
	}

	async provideImplementation(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.LocationLink[] | undefined> {
		return this.goTo('vscode.experimental.executeImplementationProvider_recursive', document, position, token);
	}

	async provideTypeDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.LocationLink[] | undefined> {
		return this.goTo('vscode.experimental.executeTypeDefinitionProvider_recursive', document, position, token);
	}

	async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover | undefined> {
		const localHoverResponse = await this.execHover(document.uri, position);
		const localHovers = this.filterOutGenericHovers(localHoverResponse);
		if (localHovers?.length) {
			return this.convertHover(localHovers);
		}

		if (token.isCancellationRequested) {
			return;
		}

		const referencesCtx = await this.getReferencesContext(document, position, token);
		if (!referencesCtx || token.isCancellationRequested) {
			return;
		}

		for (const wordMatch of referencesCtx.wordMatches) {
			const hovers = await this.execHover(wordMatch.uri, wordMatch.range.start);
			if (token.isCancellationRequested) {
				return;
			}
			if (hovers?.length) {
				return this.convertHover(hovers);
			}
		}

		return this.convertHover(localHoverResponse);
	}

	private async execHover(uri: Uri, position: vscode.Position): Promise<vscode.Hover[]> {
		return vscode.commands.executeCommand<vscode.Hover[]>('vscode.experimental.executeHoverProvider_recursive', uri, position);
	}

	private convertHover(hovers: readonly vscode.Hover[]): vscode.Hover | undefined {
		return hovers.length ?
			new vscode.Hover(hovers.flatMap(x => x.contents), hovers[0].range)
			: undefined;
	}

	private filterOutGenericHovers(localHoverResponse: vscode.Hover[]): vscode.Hover[] {
		return localHoverResponse.filter(hover => {
			return hover.contents.some(entry => {
				if (typeof entry === 'string') {
					return entry.length;
				}

				if (!entry.value.length) {
					return false;
				}

				for (const pattern of genericHoverMessages) {
					if (pattern.test(entry.value)) {
						return false;
					}
				}

				return true;
			});
		});
	}


	private async goTo(command: string, document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.LocationLink[] | undefined> {
		const codeBlockId = await createSha256Hash(document.uri.fragment);
		if (token.isCancellationRequested) {
			return;
		}

		/* __GDPR__
			"codeBlock.action.goTo" : {
				"owner": "mjbvz",
				"comment": "Counts interactions with code blocks in chat responses",
				"languageId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Language of the currently open document." },
				"command": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The go to command being run." },
				"codeBlockId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Unique hash of the code block." }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('codeBlock.action.goTo', {
			languageId: document.languageId,
			command,
			codeBlockId,
		});

		const localLocations = await this.executeGoToInChatBlocks(command, document, position);
		if (localLocations?.length) {
			return localLocations;
		}

		if (token.isCancellationRequested) {
			return;
		}

		return this.executeGoToInChatReferences(command, document, position, token);
	}

	private async executeGoToInChatBlocks(command: string, document: vscode.TextDocument, position: vscode.Position): Promise<vscode.LocationLink[] | undefined> {
		const result = await this.executeGoTo(command, document.uri, position);
		return result?.map((result): vscode.LocationLink => {
			if ('uri' in result) {
				return {
					targetRange: result.range,
					targetUri: result.uri,
				};
			} else {
				return result;
			}
		});
	}

	private async executeGoTo(command: string, uri: vscode.Uri, position: vscode.Position): Promise<Array<vscode.Location | vscode.LocationLink> | undefined> {
		return vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(command, uri, position);
	}

	private async executeGoToInChatReferences(command: string, document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<Array<vscode.LocationLink> | undefined> {
		const ctx = await this.getReferencesContext(document, position, token);
		if (!ctx || token.isCancellationRequested) {
			return;
		}

		for (const wordMatch of ctx.wordMatches) {
			const result = await this.executeGoTo(command, wordMatch.uri, wordMatch.range.start);
			if (token.isCancellationRequested) {
				return;
			}

			if (result) {
				return result.map((result): vscode.LocationLink => {
					if ('uri' in result) {
						return {
							targetRange: result.range,
							targetUri: result.uri,
							originSelectionRange: ctx.wordRange,
						};
					} else {
						return {
							targetSelectionRange: result.targetSelectionRange,
							targetRange: result.targetRange,
							targetUri: result.targetUri,
							originSelectionRange: ctx.wordRange,
						};
					}
				});
			}
		}

		return undefined;
	}

	private async getReferencesContext(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<{ wordRange: vscode.Range; wordMatches: vscode.Location[] } | undefined> {
		const references = this.getReferences(document);
		if (!references?.length) {
			return;
		}

		const wordRange = document.getWordRangeAtPosition(position);
		if (!wordRange) {
			return;
		}

		const word = document.getText(wordRange);
		const wordMatches = await this.instantiationService.invokeFunction(accessor => findWordInReferences(accessor, references, word, {}, token));
		return { wordRange, wordMatches };
	}

	private getReferences(document: vscode.TextDocument): readonly PromptReference[] {
		const refs = this.extractReferences(document);

		// Filter out references that don't belong to the same language family
		const docLang = getLanguage(document);
		const docLangGroup = getReferenceGroupForLanguage(docLang);
		if (!docLangGroup) {
			// Unknown language so skip filtering
			return refs;
		}

		return refs.filter(ref => {
			const uri = refToUri(ref);
			if (!uri) {
				return false;
			}

			const lang = getLanguageForResource(uri);
			if (!docLangGroup.has(lang.languageId)) {
				return false;
			}

			return true;
		});
	}

	private extractReferences(document: vscode.TextDocument): readonly PromptReference[] {
		try {
			const fragment = decodeURIComponent(document.uri.fragment);
			const parsedFragment = JSON.parse(fragment);
			return parsedFragment.references.map((ref: any): PromptReference => {
				if ('range' in ref) {
					return new PromptReference(new Location(
						Uri.from(ref.uri),
						new Range(ref.range.startLineNumber - 1, ref.range.startColumn - 1, ref.range.endLineNumber - 1, ref.range.endColumn - 1)));
				} else {
					return new PromptReference(Uri.from(ref.uri));
				}
			});
		} catch {
			return [];
		}
	}
}

function refToUri(ref: PromptReference) {
	return isUri(ref.anchor)
		? ref.anchor
		: 'uri' in ref.anchor
			? ref.anchor.uri
			: 'value' in ref.anchor && isUri(ref.anchor.value) ? ref.anchor.value : undefined;
}

function getReferenceGroupForLanguage(docLang: ILanguage) {
	return languageReferenceGroups.find(group => group.has(docLang.languageId));
}

export function register(accessor: ServicesAccessor): vscode.Disposable {
	const goToProvider = accessor.get(IInstantiationService).createInstance(CodeBlockIntelliSenseProvider);
	const selector: vscode.DocumentSelector = { scheme: codeBlockScheme, exclusive: true };

	return vscode.Disposable.from(
		vscode.languages.registerDefinitionProvider(selector, goToProvider),
		vscode.languages.registerTypeDefinitionProvider(selector, goToProvider),
		vscode.languages.registerImplementationProvider(selector, goToProvider),
		vscode.languages.registerHoverProvider(selector, goToProvider),
	);
}
