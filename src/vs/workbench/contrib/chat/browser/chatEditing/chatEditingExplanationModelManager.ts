/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { DetailedLineRangeMapping, LineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ChatMessageRole, ILanguageModelsService } from '../../common/languageModels.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import * as nls from '../../../../../nls.js';

/**
 * Simple diff info interface for explanation generation
 */
export interface IExplanationDiffInfo {
	readonly changes: readonly (LineRangeMapping | DetailedLineRangeMapping)[];
	readonly identical: boolean;
	readonly originalModel: ITextModel;
	readonly modifiedModel: ITextModel;
}

/**
 * A single explanation for a change
 */
export interface IChangeExplanation {
	readonly uri: URI;
	readonly startLineNumber: number;
	readonly endLineNumber: number;
	readonly originalText: string;
	readonly modifiedText: string;
	readonly explanation: string;
}

/**
 * Progress state for explanation generation
 */
export type ExplanationProgress = 'idle' | 'loading' | 'complete' | 'error';

/**
 * Explanation state for a single URI
 */
export interface IExplanationState {
	readonly progress: ExplanationProgress;
	readonly explanations: readonly IChangeExplanation[];
	readonly diffInfo: IExplanationDiffInfo;
	readonly chatSessionResource: URI | undefined;
	readonly errorMessage?: string;
}

/**
 * Handle returned when generating explanations
 */
export interface IExplanationGenerationHandle extends IDisposable {
	/**
	 * The URIs being explained
	 */
	readonly uris: readonly URI[];

	/**
	 * Promise that resolves when generation is complete
	 */
	readonly completed: Promise<void>;
}

export const IChatEditingExplanationModelManager = createDecorator<IChatEditingExplanationModelManager>('chatEditingExplanationModelManager');

export interface IChatEditingExplanationModelManager {
	readonly _serviceBrand: undefined;

	/**
	 * Observable map from URI to explanation state.
	 * When a URI has state, explanations are shown. When removed, they are hidden.
	 * UI code can use autorun or derived to react to state changes.
	 */
	readonly state: IObservable<ResourceMap<IExplanationState>>;

	/**
	 * Generates explanations for the given diff infos using a single LLM request.
	 * This allows the model to understand the complete change across files.
	 * Returns a disposable handle for lifecycle management.
	 * The generation can be cancelled by disposing the handle or via the cancellation token.
	 * Disposing the handle also removes the explanations from the state.
	 *
	 * State is updated per-file as explanations are parsed from the response.
	 *
	 * @param diffInfos Array of diff info objects, one per file
	 * @param chatSessionResource Chat session resource for follow-up actions
	 * @param token Cancellation token for external cancellation control
	 * @returns A handle with disposal and completion tracking
	 */
	generateExplanations(diffInfos: readonly IExplanationDiffInfo[], chatSessionResource: URI | undefined, token: CancellationToken): IExplanationGenerationHandle;
}

/**
 * Gets the text content for a change
 */
function getChangeTexts(change: LineRangeMapping | DetailedLineRangeMapping, diffInfo: IExplanationDiffInfo): { originalText: string; modifiedText: string } {
	const originalLines: string[] = [];
	const modifiedLines: string[] = [];

	// Get original text
	for (let i = change.original.startLineNumber; i < change.original.endLineNumberExclusive; i++) {
		const line = diffInfo.originalModel.getLineContent(i);
		originalLines.push(line);
	}

	// Get modified text
	for (let i = change.modified.startLineNumber; i < change.modified.endLineNumberExclusive; i++) {
		const line = diffInfo.modifiedModel.getLineContent(i);
		modifiedLines.push(line);
	}

	return {
		originalText: originalLines.join('\n'),
		modifiedText: modifiedLines.join('\n')
	};
}

export class ChatEditingExplanationModelManager extends Disposable implements IChatEditingExplanationModelManager {
	declare readonly _serviceBrand: undefined;

	private readonly _state = observableValue<ResourceMap<IExplanationState>>(this, new ResourceMap<IExplanationState>());
	readonly state: IObservable<ResourceMap<IExplanationState>> = this._state;

	constructor(
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
	) {
		super();
	}

	private _updateUriState(uri: URI, uriState: IExplanationState): void {
		const current = this._state.get();
		const newState = new ResourceMap<IExplanationState>(current);
		newState.set(uri, uriState);
		this._state.set(newState, undefined);
	}

	private _updateUriStatePartial(uri: URI, partial: Partial<IExplanationState>): void {
		const current = this._state.get();
		const existing = current.get(uri);
		if (existing) {
			const newState = new ResourceMap<IExplanationState>(current);
			newState.set(uri, { ...existing, ...partial });
			this._state.set(newState, undefined);
		}
	}

	private _removeUris(uris: readonly URI[]): void {
		const current = this._state.get();
		const newState = new ResourceMap<IExplanationState>(current);
		for (const uri of uris) {
			newState.delete(uri);
		}
		this._state.set(newState, undefined);
	}

	generateExplanations(diffInfos: readonly IExplanationDiffInfo[], chatSessionResource: URI | undefined, token: CancellationToken): IExplanationGenerationHandle {
		const uris = diffInfos.map(d => d.modifiedModel.uri);
		const cts = new CancellationTokenSource(token);

		// Set loading state for all URIs with diffInfo and chatSessionResource
		for (const diffInfo of diffInfos) {
			this._updateUriState(diffInfo.modifiedModel.uri, {
				progress: 'loading',
				explanations: [],
				diffInfo,
				chatSessionResource,
			});
		}

		const completed = this._doGenerateExplanations(diffInfos, cts.token);

		return {
			uris,
			completed,
			dispose: () => {
				cts.dispose(true);
				this._removeUris(uris);
			}
		};
	}

	private async _doGenerateExplanations(diffInfos: readonly IExplanationDiffInfo[], cancellationToken: CancellationToken): Promise<void> {
		// Filter out empty diffs and fire empty events for them
		const nonEmptyDiffs: IExplanationDiffInfo[] = [];
		for (const diffInfo of diffInfos) {
			if (diffInfo.changes.length === 0 || diffInfo.identical) {
				this._updateUriStatePartial(diffInfo.modifiedModel.uri, {
					progress: 'complete',
					explanations: [],
				});
			} else {
				nonEmptyDiffs.push(diffInfo);
			}
		}

		if (nonEmptyDiffs.length === 0) {
			return;
		}

		// Build change data for all files
		interface FileChangeData {
			uri: URI;
			fileName: string;
			changes: {
				startLineNumber: number;
				endLineNumber: number;
				originalText: string;
				modifiedText: string;
			}[];
		}

		const fileChanges: FileChangeData[] = nonEmptyDiffs.map(diffInfo => {
			const uri = diffInfo.modifiedModel.uri;
			const fileName = basename(uri);
			const changes = diffInfo.changes.map(change => {
				const { originalText, modifiedText } = getChangeTexts(change, diffInfo);
				return {
					startLineNumber: change.modified.startLineNumber,
					endLineNumber: change.modified.endLineNumberExclusive - 1,
					originalText,
					modifiedText,
				};
			});
			return { uri, fileName, changes };
		});

		// Total number of changes across all files
		const totalChanges = fileChanges.reduce((sum, f) => sum + f.changes.length, 0);

		try {
			// Select a high-end model for better understanding of all changes together
			let models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'claude-3.5-sonnet' });
			if (!models.length) {
				models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o' });
			}
			if (!models.length) {
				models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4' });
			}
			if (!models.length) {
				// Fallback to any available model
				models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot' });
			}
			if (!models.length) {
				for (const fileData of fileChanges) {
					this._updateUriStatePartial(fileData.uri, {
						progress: 'error',
						explanations: [],
						errorMessage: nls.localize('noModelAvailable', "No language model available"),
					});
				}
				return;
			}

			if (cancellationToken.isCancellationRequested) {
				return;
			}

			// Build a prompt with all changes from all files
			let changeIndex = 0;
			const changesDescription = fileChanges.map(fileData => {
				return fileData.changes.map(data => {
					const desc = `=== CHANGE ${changeIndex} (File: ${fileData.fileName}, Lines ${data.startLineNumber}-${data.endLineNumber}) ===
BEFORE:
${data.originalText || '(empty)'}

AFTER:
${data.modifiedText || '(empty)'}`;
					changeIndex++;
					return desc;
				}).join('\n\n');
			}).join('\n\n');

			const fileCount = fileChanges.length;
			const prompt = `Analyze these ${totalChanges} code changes across ${fileCount} file${fileCount > 1 ? 's' : ''} and provide a brief explanation for each one.
These changes are part of a single coherent modification, so consider how they relate to each other.

${changesDescription}

Respond with a JSON array containing exactly ${totalChanges} objects, one for each change in order.
Each object should have an "explanation" field with a brief sentence (max 15 words) explaining what changed and why.
Be specific about the actual code changes. Return ONLY valid JSON, no markdown.

Example response format:
[{"explanation": "Added null check to prevent crash"}, {"explanation": "Renamed variable for clarity"}]`;

			const response = await this._languageModelsService.sendChatRequest(
				models[0],
				new ExtensionIdentifier('core'),
				[{ role: ChatMessageRole.User, content: [{ type: 'text', value: prompt }] }],
				{},
				cancellationToken
			);

			let responseText = '';
			for await (const part of response.stream) {
				if (cancellationToken.isCancellationRequested) {
					return;
				}
				if (Array.isArray(part)) {
					for (const p of part) {
						if (p.type === 'text') {
							responseText += p.value;
						}
					}
				} else if (part.type === 'text') {
					responseText += part.value;
				}
			}

			await response.result;

			if (cancellationToken.isCancellationRequested) {
				return;
			}

			// Parse the JSON response
			let parsed: { explanation: string }[] = [];
			try {
				// Handle potential markdown wrapping
				let jsonText = responseText.trim();
				if (jsonText.startsWith('```')) {
					jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
				}
				parsed = JSON.parse(jsonText);
			} catch {
				// JSON parsing failed - will use default messages
			}

			// Map explanations back to files
			let parsedIndex = 0;
			for (const fileData of fileChanges) {
				const explanations: IChangeExplanation[] = [];
				for (const data of fileData.changes) {
					const parsedExplanation = parsed[parsedIndex]?.explanation?.trim() || nls.localize('codeWasModified', "Code was modified.");
					explanations.push({
						uri: fileData.uri,
						startLineNumber: data.startLineNumber,
						endLineNumber: data.endLineNumber,
						originalText: data.originalText,
						modifiedText: data.modifiedText,
						explanation: parsedExplanation,
					});
					parsedIndex++;
				}

				this._updateUriStatePartial(fileData.uri, {
					progress: 'complete',
					explanations,
				});
			}
		} catch (e) {
			if (!cancellationToken.isCancellationRequested) {
				const errorMessage = e instanceof Error ? e.message : nls.localize('explanationFailed', "Failed to generate explanations");
				for (const fileData of fileChanges) {
					this._updateUriStatePartial(fileData.uri, {
						progress: 'error',
						explanations: [],
						errorMessage,
					});
				}
			}
		}
	}
}

registerSingleton(IChatEditingExplanationModelManager, ChatEditingExplanationModelManager, InstantiationType.Delayed);
