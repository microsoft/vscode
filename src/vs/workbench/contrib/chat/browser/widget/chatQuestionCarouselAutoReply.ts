/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import Severity from '../../../../../base/common/severity.js';
import { hasKey } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChatQuestion, IChatQuestionCarousel } from '../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ChatMessageRole, getTextResponseFromStream, ILanguageModelsService } from '../../common/languageModels.js';
import { Event } from '../../../../../base/common/event.js';

const enum AutoReplyStorageKeys {
	AutoReplyOptIn = 'chat.autoReply.optIn'
}

/**
 * Encapsulates the logic for automatically replying to question carousels,
 * including opt-in state management, LLM-based answer resolution, fallback
 * answer generation, and answer parsing/merging.
 */
export class ChatQuestionCarouselAutoReply extends Disposable {

	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
	) {
		super();

		// Clear out warning accepted state if the setting is disabled
		this._register(Event.runAndSubscribe(this.configService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(ChatConfiguration.AutoReply)) {
				if (this.configService.getValue(ChatConfiguration.AutoReply) !== true) {
					this.storageService.remove(AutoReplyStorageKeys.AutoReplyOptIn, StorageScope.APPLICATION);
				}
			}
		}));
	}

	async shouldAutoReply(): Promise<boolean> {
		if (!this.configService.getValue<boolean>(ChatConfiguration.AutoReply)) {
			return false;
		}
		return this.checkOptIn();
	}

	async autoReply(
		carousel: IChatQuestionCarousel,
		submit: (answers: Map<string, unknown> | undefined) => Promise<void>,
		modelName: string | undefined,
		requestMessageText: string | undefined,
		token: CancellationToken,
	): Promise<void> {
		if (token.isCancellationRequested || carousel.isUsed || carousel.questions.length === 0) {
			return;
		}

		const fallbackAnswers = this.buildFallbackCarouselAnswers(carousel, requestMessageText);
		let resolvedAnswers = fallbackAnswers;

		const modelId = await this.getModelId(modelName);
		if (modelId && !token.isCancellationRequested) {
			try {
				const parsedAnswers = await this.requestAnswers(modelId, carousel, requestMessageText, token);
				if (parsedAnswers.size > 0) {
					resolvedAnswers = this.mergeAnswers(carousel, parsedAnswers, fallbackAnswers);
				}
			} catch (err) {
				this.logService.debug('#ChatQuestionCarousel: Failed to resolve auto reply', toErrorMessage(err));
			}
		}

		if (token.isCancellationRequested || carousel.isUsed) {
			return;
		}

		await submit(resolvedAnswers);
	}

	// #region Opt-in

	private async checkOptIn(): Promise<boolean> {
		const optedIn = this.storageService.getBoolean(AutoReplyStorageKeys.AutoReplyOptIn, StorageScope.APPLICATION, false);
		if (optedIn) {
			return true;
		}

		const promptResult = await this.dialogService.prompt({
			type: Severity.Warning,
			message: localize('chat.autoReply.enable.title', 'Enable chat auto reply?'),
			buttons: [
				{
					label: localize('chat.autoReply.enable', 'Enable'),
					run: () => true
				},
				{
					label: localize('chat.autoReply.disable', 'Disable'),
					run: () => false
				},
			],
			custom: {
				icon: Codicon.warning,
				disableCloseAction: true,
				markdownDetails: [{
					markdown: new MarkdownString(localize('chat.autoReply.enable.details', 'Chat auto reply answers question carousels using the current model and may make unintended choices. Review your settings and outputs carefully.')),
				}],
			}
		});

		if (promptResult.result !== true) {
			await this.configService.updateValue(ChatConfiguration.AutoReply, false);
			return false;
		}

		this.storageService.store(AutoReplyStorageKeys.AutoReplyOptIn, true, StorageScope.APPLICATION, StorageTarget.USER);
		return true;
	}

	// #endregion

	// #region LLM interaction

	private async getModelId(modelName: string | undefined): Promise<string | undefined> {
		if (!modelName) {
			return undefined;
		}

		let models = await this.languageModelsService.selectLanguageModels({ id: modelName });
		if (models.length > 0) {
			return models[0];
		}

		if (modelName.startsWith('copilot/')) {
			models = await this.languageModelsService.selectLanguageModels({ vendor: 'copilot', family: modelName.replace(/^copilot\//, '') });
			return models[0];
		}

		return undefined;
	}

	private buildPrompt(carousel: IChatQuestionCarousel, requestMessageText: string | undefined, strict: boolean): string {
		const questions = carousel.questions.map(question => ({
			id: question.id,
			type: question.type,
			title: question.title,
			message: typeof question.message === 'string' ? question.message : question.message?.value,
			options: question.options?.map(option => ({ id: option.id, label: option.label })) ?? [],
			allowFreeformInput: question.allowFreeformInput ?? false,
		}));

		const contextLines: string[] = [];
		if (requestMessageText) {
			contextLines.push(`Original user request: ${JSON.stringify(requestMessageText)}`);
		}

		return [
			'Choose default answers for the following questions.',
			'Return a JSON object keyed by question id.',
			'For text questions, the value should be a string.',
			'For singleSelect questions, the value should be { "selectedId": string } or { "freeform": string }.',
			'For multiSelect questions, the value should be { "selectedIds": string[] } and may include { "freeform": string }.',
			'If a question allows freeform input and has no options, return a freeform answer based on the user request when possible.',
			'Use option ids from the provided options.',
			...contextLines,
			'Questions:',
			JSON.stringify(questions),
			strict ? 'Return ONLY valid JSON. Do not include markdown or explanations.' : undefined,
		].filter(Boolean).join('\n');
	}

	private async requestAnswers(
		modelId: string,
		carousel: IChatQuestionCarousel,
		requestMessageText: string | undefined,
		token: CancellationToken,
	): Promise<Map<string, unknown>> {
		const prompt = this.buildPrompt(carousel, requestMessageText, false);
		const response = await this.languageModelsService.sendChatRequest(
			modelId,
			new ExtensionIdentifier('core'),
			[{ role: ChatMessageRole.User, content: [{ type: 'text', value: prompt }] }],
			{},
			token,
		);
		const responseText = await getTextResponseFromStream(response);
		const parsedAnswers = this.parseAnswers(responseText, carousel);
		if (parsedAnswers.size > 0 || token.isCancellationRequested) {
			return parsedAnswers;
		}

		const retryPrompt = this.buildPrompt(carousel, requestMessageText, true);
		const retryResponse = await this.languageModelsService.sendChatRequest(
			modelId,
			new ExtensionIdentifier('core'),
			[{ role: ChatMessageRole.User, content: [{ type: 'text', value: retryPrompt }] }],
			{},
			token,
		);
		const retryText = await getTextResponseFromStream(retryResponse);
		return this.parseAnswers(retryText, carousel);
	}

	// #endregion

	// #region Answer parsing and resolution

	private parseAnswers(responseText: string, carousel: IChatQuestionCarousel): Map<string, unknown> {
		const parsed = this.tryParseJsonObject(responseText);
		if (!parsed) {
			return new Map();
		}

		const answers = new Map<string, unknown>();
		for (const question of carousel.questions) {
			const rawAnswer = parsed[question.id];
			const resolved = this.resolveAnswerFromRaw(question, rawAnswer);
			if (resolved !== undefined) {
				answers.set(question.id, resolved);
			}
		}
		return answers;
	}

	private mergeAnswers(
		carousel: IChatQuestionCarousel,
		resolvedAnswers: Map<string, unknown>,
		fallbackAnswers: Map<string, unknown>,
	): Map<string, unknown> {
		const merged = new Map<string, unknown>();
		for (const question of carousel.questions) {
			const fallback = fallbackAnswers.get(question.id);
			if (this.hasDefaultValue(question) && fallback !== undefined) {
				merged.set(question.id, fallback);
				continue;
			}
			if (resolvedAnswers.has(question.id)) {
				merged.set(question.id, resolvedAnswers.get(question.id)!);
				continue;
			}
			if (fallback !== undefined) {
				merged.set(question.id, fallback);
			}
		}
		return merged;
	}

	private hasDefaultValue(question: IChatQuestion): boolean {
		switch (question.type) {
			case 'text':
				return question.defaultValue !== undefined;
			case 'singleSelect':
				return typeof question.defaultValue === 'string';
			case 'multiSelect':
				return Array.isArray(question.defaultValue)
					? question.defaultValue.length > 0
					: typeof question.defaultValue === 'string';
		}
	}

	private resolveAnswerFromRaw(question: IChatQuestion, raw: unknown): unknown | undefined {
		switch (question.type) {
			case 'text': {
				if (typeof raw === 'string') {
					const value = raw.trim();
					return value.length > 0 ? value : undefined;
				}
				if (raw && typeof raw === 'object' && hasKey(raw, { value: true }) && typeof (raw as { value: unknown }).value === 'string') {
					const value = (raw as { value: string }).value.trim();
					return value.length > 0 ? value : undefined;
				}
				return undefined;
			}
			case 'singleSelect': {
				let selectedInput: string | undefined;
				let freeformInput: string | undefined;
				if (typeof raw === 'string') {
					selectedInput = raw;
				} else if (raw && typeof raw === 'object') {
					if (hasKey(raw, { selectedId: true }) && typeof (raw as { selectedId: unknown }).selectedId === 'string') {
						selectedInput = (raw as { selectedId: string }).selectedId;
					} else if (hasKey(raw, { selectedLabel: true }) && typeof (raw as { selectedLabel: unknown }).selectedLabel === 'string') {
						selectedInput = (raw as { selectedLabel: string }).selectedLabel;
					}
					if (hasKey(raw, { freeform: true }) && typeof (raw as { freeform: unknown }).freeform === 'string') {
						freeformInput = (raw as { freeform: string }).freeform;
					}
				}

				if (freeformInput && freeformInput.trim().length > 0) {
					return { selectedValue: undefined, freeformValue: freeformInput.trim() };
				}

				const match = selectedInput ? this.matchQuestionOption(question, selectedInput) : undefined;
				if (match) {
					return { selectedValue: match.value, freeformValue: undefined };
				}
				return undefined;
			}
			case 'multiSelect': {
				let selectedInputs: string[] = [];
				let freeformInput: string | undefined;
				if (Array.isArray(raw)) {
					selectedInputs = raw.filter(item => typeof item === 'string') as string[];
				} else if (typeof raw === 'string') {
					selectedInputs = raw.split(',').map(item => item.trim()).filter(item => item.length > 0);
				} else if (raw && typeof raw === 'object') {
					if (hasKey(raw, { selectedIds: true })) {
						const selectedIdsValue = (raw as { selectedIds?: unknown }).selectedIds;
						if (Array.isArray(selectedIdsValue)) {
							selectedInputs = selectedIdsValue.filter((item: unknown): item is string => typeof item === 'string');
						}
					}
					if (hasKey(raw, { freeform: true }) && typeof (raw as { freeform?: unknown }).freeform === 'string') {
						freeformInput = (raw as { freeform: string }).freeform;
					}
				}

				const selectedValues = selectedInputs
					.map(input => this.matchQuestionOption(question, input)?.value)
					.filter(value => value !== undefined);
				const freeformValue = freeformInput?.trim();

				if (selectedValues.length > 0 || (freeformValue && freeformValue.length > 0)) {
					return { selectedValues, freeformValue };
				}
				return undefined;
			}
		}
	}

	private matchQuestionOption(question: IChatQuestion, rawInput: string): { id: string; value: unknown } | undefined {
		const options = question.options ?? [];
		if (!options.length) {
			return undefined;
		}

		const normalized = rawInput.trim().toLowerCase();
		const numeric = Number.parseInt(normalized, 10);
		if (!Number.isNaN(numeric) && numeric > 0 && numeric <= options.length) {
			const option = options[numeric - 1];
			return { id: option.id, value: option.value };
		}

		const exactId = options.find(option => option.id.toLowerCase() === normalized);
		if (exactId) {
			return { id: exactId.id, value: exactId.value };
		}
		const exactLabel = options.find(option => option.label.toLowerCase() === normalized);
		if (exactLabel) {
			return { id: exactLabel.id, value: exactLabel.value };
		}
		const partialLabel = options.find(option => option.label.toLowerCase().includes(normalized));
		if (partialLabel) {
			return { id: partialLabel.id, value: partialLabel.value };
		}

		return undefined;
	}

	// #endregion

	// #region Fallback answers

	buildFallbackCarouselAnswers(carousel: IChatQuestionCarousel, requestMessageText: string | undefined): Map<string, unknown> {
		const answers = new Map<string, unknown>();
		for (const question of carousel.questions) {
			const answer = this.getFallbackAnswerForQuestion(question, requestMessageText);
			if (answer !== undefined) {
				answers.set(question.id, answer);
			}
		}
		return answers;
	}

	private getFallbackAnswerForQuestion(question: IChatQuestion, requestMessageText: string | undefined): unknown {
		const fallbackFreeform = requestMessageText?.trim() || localize('chat.questionCarousel.autoReplyFallback', 'OK');

		switch (question.type) {
			case 'text':
				return question.defaultValue ?? fallbackFreeform;
			case 'singleSelect': {
				const defaultOptionId = typeof question.defaultValue === 'string' ? question.defaultValue : undefined;
				const defaultOption = defaultOptionId ? question.options?.find(opt => opt.id === defaultOptionId) : undefined;
				if (defaultOption) {
					return { selectedValue: defaultOption.value, freeformValue: undefined };
				}
				if (question.options && question.options.length > 0) {
					return { selectedValue: question.options[0].value, freeformValue: undefined };
				}
				if (question.allowFreeformInput) {
					return { selectedValue: undefined, freeformValue: fallbackFreeform };
				}
				return undefined;
			}
			case 'multiSelect': {
				const defaultIds = Array.isArray(question.defaultValue)
					? question.defaultValue
					: (typeof question.defaultValue === 'string' ? [question.defaultValue] : []);
				const selectedValues = question.options
					?.filter(opt => defaultIds.includes(opt.id))
					.map(opt => opt.value)
					.filter(value => value !== undefined) ?? [];
				if (selectedValues.length > 0) {
					return { selectedValues, freeformValue: undefined };
				}
				if (question.options && question.options.length > 0) {
					return { selectedValues: [question.options[0].value], freeformValue: undefined };
				}
				if (question.allowFreeformInput) {
					return { selectedValues: [], freeformValue: fallbackFreeform };
				}
				return undefined;
			}
		}
	}

	// #endregion

	// #region Utilities

	private tryParseJsonObject(text: string): Record<string, unknown> | undefined {
		const trimmed = text.trim();
		if (!trimmed) {
			return undefined;
		}
		const start = trimmed.indexOf('{');
		const end = trimmed.lastIndexOf('}');
		const candidate = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
		try {
			const parsed = JSON.parse(candidate) as unknown;
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			return undefined;
		}
		return undefined;
	}

	// #endregion
}
