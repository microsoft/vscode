/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CopilotNamedAnnotationList } from '../../../../../../platform/completions-core/common/openai/copilotAnnotations';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { FinishedCallback, RequestDelta, SolutionDecision } from '../openai/fetch';
import { APIChoice, convertToAPIChoice } from '../openai/openai';
import { TerseBlockTrimmer } from './blockTrimmer';

class StreamingCompletion {
	startOffset = 0;
	text = '';
	trimCount = 0;

	constructor(
		readonly index: number,
		readonly documentPrefix: string
	) { }

	updateText(text: string): void {
		this.text = text;
	}

	get addedToPrefix(): string {
		return this.text.substring(0, this.startOffset);
	}

	get effectivePrefix(): string {
		return this.documentPrefix + this.addedToPrefix;
	}

	get effectiveText(): string {
		return this.text.substring(this.startOffset);
	}

	get isFirstCompletion(): boolean {
		return this.trimCount === 0;
	}

	/**
	 * Returns the index of the line ending to use when trimming the completion
	 * as a "single line" completion. This allows the completion to begin with
	 * a single leading new line as a special case for completing the next line.
	 * It supports CRLF and LF line endings. The index is the start of the line
	 * terminator. Returns -1 if a suitable line ending was not found.
	 */
	get firstNewlineOffset(): number {
		const matches = [...this.text.matchAll(/\r?\n/g)];
		if (matches.length > 0 && matches[0].index === 0) {
			matches.shift();
		}
		return matches.length > 0 ? matches[0].index : -1;
	}

	trimAt(effectiveOffset: number): StreamingCompletion {
		const trimmed = new StreamingCompletion(this.index, this.documentPrefix);
		trimmed.startOffset = this.startOffset;
		trimmed.text = this.text.substring(0, this.startOffset + effectiveOffset);
		trimmed.trimCount = this.trimCount;
		this.startOffset += effectiveOffset;
		this.trimCount++;
		return trimmed;
	}
}

export class StreamedCompletionSplitter {
	private readonly lineLimit = 3;
	private readonly completions = new Map<number, StreamingCompletion>();

	constructor(
		private readonly prefix: string,
		private readonly languageId: string,
		private readonly initialSingleLine: boolean,
		private readonly trimmerLookahead: number,
		private readonly cacheFunction: (prefixAddition: string, item: APIChoice) => void,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	getFinishedCallback(): FinishedCallback {
		return async (completionText: string, delta: RequestDelta): Promise<SolutionDecision> => {
			const index = delta.index ?? 0;
			const completion = this.getCompletion(index, completionText);

			// emmulate single line completion when this.initialSingleLine is set
			if (completion.isFirstCompletion && this.initialSingleLine && completion.firstNewlineOffset >= 0) {
				const result = {
					yieldSolution: true,
					continueStreaming: true,
					finishOffset: completion.firstNewlineOffset,
				};
				completion.trimAt(result.finishOffset);
				if (delta.finished) {
					await this.trimAll(delta, completion);
				}
				return result;
			}

			return delta.finished ? await this.trimAll(delta, completion) : await this.trimOnce(delta, completion);
		};
	}

	private getCompletion(index: number, newText: string): StreamingCompletion {
		let completion = this.completions.get(index);
		if (!completion) {
			completion = new StreamingCompletion(index, this.prefix);
			this.completions.set(index, completion);
		}
		completion.updateText(newText);
		return completion;
	}

	private async trimOnce(delta: RequestDelta, completion: StreamingCompletion): Promise<SolutionDecision> {
		const offset = await this.trim(completion);
		if (offset === undefined) {
			return {
				yieldSolution: false,
				continueStreaming: true,
			};
		}

		if (completion.isFirstCompletion) {
			completion.trimAt(offset);
			return {
				yieldSolution: true,
				continueStreaming: true,
				finishOffset: offset,
			};
		} else {
			this.cacheCompletion(delta, completion, offset);
			return {
				yieldSolution: false,
				continueStreaming: true,
			};
		}
	}

	private async trimAll(delta: RequestDelta, completion: StreamingCompletion): Promise<SolutionDecision> {
		let offset: number | undefined;
		let firstOffset: number | undefined;

		do {
			offset = await this.trim(completion);

			if (completion.isFirstCompletion) {
				firstOffset = offset;
				completion.trimAt(offset ?? completion.effectiveText.length);
			} else {
				this.cacheCompletion(delta, completion, offset);
			}
		} while (offset !== undefined);

		if (firstOffset !== undefined) {
			return {
				yieldSolution: true,
				continueStreaming: true,
				finishOffset: firstOffset,
			};
		}

		return {
			yieldSolution: false,
			continueStreaming: true,
		};
	}

	private async trim(completion: StreamingCompletion): Promise<number | undefined> {
		const trimmer = new TerseBlockTrimmer(
			this.languageId,
			completion.effectivePrefix,
			completion.effectiveText,
			this.lineLimit,
			this.trimmerLookahead
		);
		return await trimmer.getCompletionTrimOffset();
	}

	private cacheCompletion(delta: RequestDelta, completion: StreamingCompletion, offset?: number) {
		const trimmed = completion.trimAt(offset ?? completion.effectiveText.length);
		if (trimmed.effectiveText.trim() === '') {
			return;
		}
		const apiChoice = this.instantiationService.invokeFunction(convertToAPIChoice,
			trimmed.effectiveText.trimEnd(),
			delta.getAPIJsonData!(), // FIXME@ulugbekna
			trimmed.index,
			delta.requestId!, // FIXME@ulugbekna
			offset !== undefined,
			delta.telemetryData!
		);
		apiChoice.copilotAnnotations = this.adjustedAnnotations(apiChoice, completion, trimmed);
		apiChoice.generatedChoiceIndex = trimmed.trimCount;

		this.cacheFunction(trimmed.addedToPrefix, apiChoice);
	}

	private adjustedAnnotations(
		choice: APIChoice,
		fullCompletion: StreamingCompletion,
		trimmedCompletion: StreamingCompletion
	): CopilotNamedAnnotationList | undefined {
		if (choice.copilotAnnotations === undefined) { return undefined; }

		const newStartOffset = trimmedCompletion.addedToPrefix.length;
		const newEndOffset = newStartOffset + choice.completionText.length;
		// whether the current split choice is at the end of the original choice
		const atEnd = newEndOffset >= fullCompletion.text.length;

		const adjusted: CopilotNamedAnnotationList = {};
		for (const [name, annotationGroup] of Object.entries(choice.copilotAnnotations)) {
			const adjustedAnnotations = annotationGroup
				.filter(a => {
					return (
						a.start_offset - newStartOffset < choice.completionText.length &&
						a.stop_offset - newStartOffset > 0
					);
				})
				.map(a => {
					const newA = { ...a };
					newA.start_offset -= newStartOffset;
					newA.stop_offset -= newStartOffset;
					if (!atEnd) { newA.stop_offset = Math.min(newA.stop_offset, choice.completionText.length); }
					return newA;
				});
			if (adjustedAnnotations.length > 0) {
				adjusted[name] = adjustedAnnotations;
			}
		}
		return Object.keys(adjusted).length > 0 ? adjusted : undefined;
	}
}
