/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct, coalesce } from '../../../../../base/common/arrays.js';
import { IMatch, IFilter, or, matchesContiguousSubString, matchesPrefix, matchesCamelCase, matchesWords } from '../../../../../base/common/filters.js';
import { Emitter } from '../../../../../base/common/event.js';
import { EditorModel } from '../../../../common/editor/editorModel.js';
import { ILanguageModelsService, ILanguageModelChatMetadata } from '../../../chat/common/languageModels.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

export const MODEL_ENTRY_TEMPLATE_ID = 'model.entry.template';

const wordFilter = or(matchesPrefix, matchesWords, matchesContiguousSubString);
const CAPABILITY_REGEX = /@capability:\s*([^\s]+)/i;
const VISIBLE_REGEX = /@visible:\s*(true|false)/i;

export const SEARCH_SUGGESTIONS = {
	FILTER_TYPES: [
		'@provider:',
		'@capability:',
		'@visible:'
	],
	CAPABILITIES: [
		'@capability:tools',
		'@capability:vision',
		'@capability:agent'
	],
	VISIBILITY: [
		'@visible:true',
		'@visible:false'
	]
};

export interface IModelEntry {
	vendor: string;
	vendorDisplayName: string;
	managementCommand?: string;
	identifier: string;
	metadata: ILanguageModelChatMetadata;
}

export interface IModelItemEntry {
	id: string;
	modelEntry: IModelEntry;
	templateId: string;
	providerMatches?: IMatch[];
	modelNameMatches?: IMatch[];
	capabilityMatches?: IMatch[];
	vendorMatches?: IMatch[];
}

export class ChatModelsViewModel extends EditorModel {

	private readonly _onDidChangeModelEntries = this._register(new Emitter<void>());
	readonly onDidChangeModelEntries = this._onDidChangeModelEntries.event;

	private _modelEntries: IModelEntry[];

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService
	) {
		super();
		this._modelEntries = [];

		// Refresh data when entitlement changes
		this._register(this.chatEntitlementService.onDidChangeEntitlement(async () => {
			await this.resolve();
			this._onDidChangeModelEntries.fire();
		}));
	}

	fetch(searchValue: string): IModelItemEntry[] {
		let modelEntries = this._modelEntries;

		// @visible:true or @visible:false
		const visibleMatches = VISIBLE_REGEX.exec(searchValue);
		if (visibleMatches && visibleMatches[1]) {
			const visible = visibleMatches[1].toLowerCase() === 'true';
			modelEntries = this.filterByVisible(modelEntries, visible);
			searchValue = searchValue.replace(VISIBLE_REGEX, '');
		}

		// Extract all @provider:PROVIDER_NAME or @vendor:VENDOR_NAME filters
		const providerNames: string[] = [];
		let match: RegExpExecArray | null;

		// Find all provider matches (non-greedy match with ".+?" instead of "..+")
		const providerRegexGlobal = /@provider:\s*((".+?")|([^\s]+))/gi;
		while ((match = providerRegexGlobal.exec(searchValue)) !== null) {
			const providerName = match[2] ? match[2].substring(1, match[2].length - 1) : match[3];
			providerNames.push(providerName);
		}

		// Find all vendor matches
		const vendorRegexGlobal = /@vendor:\s*((".+?")|([^\s]+))/gi;
		while ((match = vendorRegexGlobal.exec(searchValue)) !== null) {
			const vendorName = match[2] ? match[2].substring(1, match[2].length - 1) : match[3];
			providerNames.push(vendorName);
		}

		// Apply provider filter with OR logic if multiple providers
		if (providerNames.length > 0) {
			modelEntries = this.filterByProviders(modelEntries, providerNames);
			searchValue = searchValue.replace(/@provider:\s*((".+?")|([^\s]+))/gi, '').replace(/@vendor:\s*((".+?")|([^\s]+))/gi, '');
		}

		// @capability:CAPABILITY_NAME
		const capabilityMatches = CAPABILITY_REGEX.exec(searchValue);
		if (capabilityMatches && capabilityMatches[1]) {
			const capability = capabilityMatches[1].toLowerCase();
			modelEntries = this.filterByCapability(modelEntries, capability);
			searchValue = searchValue.replace(CAPABILITY_REGEX, '');
		}

		searchValue = searchValue.trim();
		if (!searchValue) {
			return modelEntries.map((modelEntry): IModelItemEntry => ({
				id: ChatModelsViewModel.getId(modelEntry),
				modelEntry,
				templateId: MODEL_ENTRY_TEMPLATE_ID
			}));
		}

		return this.filterByText(modelEntries, searchValue);
	}

	private filterByProviders(modelEntries: IModelEntry[], providers: string[]): IModelEntry[] {
		// OR logic: include models that match ANY of the providers
		const lowerProviders = providers.map(p => p.toLowerCase().trim());
		return modelEntries.filter(m =>
			lowerProviders.some(provider =>
				m.vendor.toLowerCase() === provider ||
				m.vendorDisplayName.toLowerCase() === provider
			)
		);
	}

	private filterByVisible(modelEntries: IModelEntry[], visible: boolean): IModelEntry[] {
		return modelEntries.filter(m => (m.metadata.isUserSelectable ?? false) === visible);
	}

	private filterByCapability(modelEntries: IModelEntry[], capability: string): IModelEntry[] {
		return modelEntries.filter(m => {
			if (!m.metadata.capabilities) {
				return false;
			}
			switch (capability) {
				case 'tools':
				case 'toolcalling':
					return m.metadata.capabilities.toolCalling === true;
				case 'vision':
					return m.metadata.capabilities.vision === true;
				case 'agent':
				case 'agentmode':
					return m.metadata.capabilities.agentMode === true;
				default:
					// Check edit tools
					return m.metadata.capabilities.editTools?.some(tool =>
						tool.toLowerCase().includes(capability)
					) ?? false;
			}
		});
	}

	private filterByText(modelEntries: IModelEntry[], searchValue: string): IModelItemEntry[] {
		const quoteAtFirstChar = searchValue.charAt(0) === '"';
		const quoteAtLastChar = searchValue.charAt(searchValue.length - 1) === '"';
		const completeMatch = quoteAtFirstChar && quoteAtLastChar;
		if (quoteAtFirstChar) {
			searchValue = searchValue.substring(1);
		}
		if (quoteAtLastChar) {
			searchValue = searchValue.substring(0, searchValue.length - 1);
		}
		searchValue = searchValue.trim();

		const result: IModelItemEntry[] = [];
		const words = searchValue.split(' ');

		for (const modelEntry of modelEntries) {
			const modelMatches = new ModelItemMatches(modelEntry, searchValue, words, completeMatch);
			if (modelMatches.modelNameMatches
				|| modelMatches.providerMatches
				|| modelMatches.vendorMatches
				|| modelMatches.capabilityMatches
			) {
				result.push({
					id: ChatModelsViewModel.getId(modelEntry),
					templateId: MODEL_ENTRY_TEMPLATE_ID,
					modelEntry,
					modelNameMatches: modelMatches.modelNameMatches || undefined,
					providerMatches: modelMatches.providerMatches || undefined,
					vendorMatches: modelMatches.vendorMatches || undefined,
					capabilityMatches: modelMatches.capabilityMatches || undefined
				});
			}
		}
		return result;
	}

	override async resolve(): Promise<void> {
		this._modelEntries = [];

		const vendors = this.languageModelsService.getVendors();

		for (const vendor of vendors) {
			const modelIdentifiers = await this.languageModelsService.selectLanguageModels({ vendor: vendor.vendor }, vendor.vendor === 'copilot');
			const models = coalesce(modelIdentifiers.map(identifier => {
				const metadata = this.languageModelsService.lookupLanguageModel(identifier);
				if (!metadata) {
					return undefined;
				}
				return {
					vendor: vendor.vendor,
					vendorDisplayName: vendor.displayName,
					managementCommand: vendor.managementCommand,
					identifier,
					metadata
				};
			}));

			this._modelEntries.push(...models.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)));
		}

		this._modelEntries = distinct(this._modelEntries, modelEntry => ChatModelsViewModel.getId(modelEntry));

		return super.resolve();
	}

	private static getId(modelEntry: IModelEntry): string {
		return modelEntry.identifier + modelEntry.vendor + (modelEntry.metadata.version || '');
	}

	get modelEntries(): IModelEntry[] {
		return this._modelEntries;
	}
}

class ModelItemMatches {

	readonly modelNameMatches: IMatch[] | null = null;
	readonly providerMatches: IMatch[] | null = null;
	readonly vendorMatches: IMatch[] | null = null;
	readonly capabilityMatches: IMatch[] | null = null;

	constructor(modelEntry: IModelEntry, searchValue: string, words: string[], completeMatch: boolean) {
		if (!completeMatch) {
			// Match against model name
			this.modelNameMatches = modelEntry.metadata.name ?
				this.matches(searchValue, modelEntry.metadata.name, (word, wordToMatchAgainst) => matchesWords(word, wordToMatchAgainst, true), words) :
				null;

			// Match against model identifier
			if (!this.modelNameMatches) {
				this.modelNameMatches = this.matches(searchValue, modelEntry.identifier, or(matchesWords, matchesCamelCase), words);
			}

			// Match against vendor display name
			this.providerMatches = this.matches(searchValue, modelEntry.vendorDisplayName, (word, wordToMatchAgainst) => matchesWords(word, wordToMatchAgainst, true), words);

			// Match against vendor id
			this.vendorMatches = this.matches(searchValue, modelEntry.vendor, or(matchesWords, matchesCamelCase), words);

			// Match against capabilities
			if (modelEntry.metadata.capabilities) {
				const capabilityStrings: string[] = [];
				if (modelEntry.metadata.capabilities.toolCalling) {
					capabilityStrings.push('tools', 'toolCalling');
				}
				if (modelEntry.metadata.capabilities.vision) {
					capabilityStrings.push('vision');
				}
				if (modelEntry.metadata.capabilities.agentMode) {
					capabilityStrings.push('agent', 'agentMode');
				}
				if (modelEntry.metadata.capabilities.editTools) {
					capabilityStrings.push(...modelEntry.metadata.capabilities.editTools);
				}

				const capabilityString = capabilityStrings.join(' ');
				if (capabilityString) {
					this.capabilityMatches = this.matches(searchValue, capabilityString, or(matchesWords, matchesCamelCase), words);
				}
			}
		}
	}

	private matches(searchValue: string | null, wordToMatchAgainst: string, wordMatchesFilter: IFilter, words: string[]): IMatch[] | null {
		let matches = searchValue ? wordFilter(searchValue, wordToMatchAgainst) : null;
		if (!matches) {
			matches = this.matchesWords(words, wordToMatchAgainst, wordMatchesFilter);
		}
		if (matches) {
			matches = this.filterAndSort(matches);
		}
		return matches;
	}

	private matchesWords(words: string[], wordToMatchAgainst: string, wordMatchesFilter: IFilter): IMatch[] | null {
		let matches: IMatch[] | null = [];
		for (const word of words) {
			const wordMatches = wordMatchesFilter(word, wordToMatchAgainst);
			if (wordMatches) {
				matches = [...(matches || []), ...wordMatches];
			} else {
				matches = null;
				break;
			}
		}
		return matches;
	}

	private filterAndSort(matches: IMatch[]): IMatch[] {
		return distinct(matches, (a => a.start + '.' + a.end))
			.filter(match => !matches.some(m => !(m.start === match.start && m.end === match.end) && (m.start <= match.start && m.end >= match.end)))
			.sort((a, b) => a.start - b.start);
	}
}
