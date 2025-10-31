/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct, coalesce } from '../../../../../base/common/arrays.js';
import { IMatch, IFilter, or, matchesContiguousSubString, matchesPrefix, matchesCamelCase, matchesWords } from '../../../../../base/common/filters.js';
import { Emitter } from '../../../../../base/common/event.js';
import { EditorModel } from '../../../../common/editor/editorModel.js';
import { ILanguageModelsService, ILanguageModelChatMetadata, IUserFriendlyLanguageModel } from '../../../chat/common/languageModels.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

export const MODEL_ENTRY_TEMPLATE_ID = 'model.entry.template';
export const VENDOR_ENTRY_TEMPLATE_ID = 'vendor.entry.template';

const wordFilter = or(matchesPrefix, matchesWords, matchesContiguousSubString);
const CAPABILITY_REGEX = /@capability:\s*([^\s]+)/gi;
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

export interface IVendorEntry {
	vendor: string;
	vendorDisplayName: string;
	managementCommand?: string;
}

export interface IModelEntry {
	vendor: string;
	vendorDisplayName: string;
	identifier: string;
	metadata: ILanguageModelChatMetadata;
}

export interface IModelItemEntry {
	type: 'model';
	id: string;
	modelEntry: IModelEntry;
	templateId: string;
	providerMatches?: IMatch[];
	modelNameMatches?: IMatch[];
	capabilityMatches?: string[];
}

export interface IVendorItemEntry {
	type: 'vendor';
	id: string;
	vendorEntry: IVendorEntry;
	templateId: string;
	collapsed: boolean;
}

export function isVendorEntry(entry: IModelItemEntry | IVendorItemEntry): entry is IVendorItemEntry {
	return entry.type === 'vendor';
}

export class ChatModelsViewModel extends EditorModel {

	private readonly _onDidChangeModelEntries = this._register(new Emitter<void>());
	readonly onDidChangeModelEntries = this._onDidChangeModelEntries.event;

	private modelEntries: IModelEntry[];
	private readonly collapsedVendors = new Set<string>();

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService
	) {
		super();
		this.modelEntries = [];

		this._register(this.chatEntitlementService.onDidChangeEntitlement(async () => {
			await this.resolve();
			this._onDidChangeModelEntries.fire();
		}));
	}

	fetch(searchValue: string): (IModelItemEntry | IVendorItemEntry)[] {
		let modelEntries = this.modelEntries;
		const capabilityMatchesMap = new Map<string, string[]>();

		const visibleMatches = VISIBLE_REGEX.exec(searchValue);
		if (visibleMatches && visibleMatches[1]) {
			const visible = visibleMatches[1].toLowerCase() === 'true';
			modelEntries = this.filterByVisible(modelEntries, visible);
			searchValue = searchValue.replace(VISIBLE_REGEX, '');
		}

		const providerNames: string[] = [];
		let match: RegExpExecArray | null;

		const providerRegexGlobal = /@provider:\s*((".+?")|([^\s]+))/gi;
		while ((match = providerRegexGlobal.exec(searchValue)) !== null) {
			const providerName = match[2] ? match[2].substring(1, match[2].length - 1) : match[3];
			providerNames.push(providerName);
		}

		// Apply provider filter with OR logic if multiple providers
		if (providerNames.length > 0) {
			modelEntries = this.filterByProviders(modelEntries, providerNames);
			searchValue = searchValue.replace(/@provider:\s*((".+?")|([^\s]+))/gi, '').replace(/@vendor:\s*((".+?")|([^\s]+))/gi, '');
		}

		// Apply capability filters with AND logic if multiple capabilities
		const capabilityNames: string[] = [];
		let capabilityMatch: RegExpExecArray | null;

		while ((capabilityMatch = CAPABILITY_REGEX.exec(searchValue)) !== null) {
			capabilityNames.push(capabilityMatch[1].toLowerCase());
		}

		if (capabilityNames.length > 0) {
			const filteredEntries = this.filterByCapabilities(modelEntries, capabilityNames);
			modelEntries = [];
			for (const { entry, matchedCapabilities } of filteredEntries) {
				modelEntries.push(entry);
				capabilityMatchesMap.set(ChatModelsViewModel.getId(entry), matchedCapabilities);
			}
			searchValue = searchValue.replace(/@capability:\s*([^\s]+)/gi, '');
		}

		searchValue = searchValue.trim();
		if (!searchValue) {
			return this.toEntries(modelEntries, capabilityMatchesMap);
		}

		return this.filterByText(modelEntries, searchValue, capabilityMatchesMap);
	}

	private filterByProviders(modelEntries: IModelEntry[], providers: string[]): IModelEntry[] {
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

	private filterByCapabilities(modelEntries: IModelEntry[], capabilities: string[]): { entry: IModelEntry; matchedCapabilities: string[] }[] {
		const result: { entry: IModelEntry; matchedCapabilities: string[] }[] = [];
		for (const m of modelEntries) {
			if (!m.metadata.capabilities) {
				continue;
			}
			const allMatchedCapabilities: string[] = [];
			let matchesAll = true;

			for (const capability of capabilities) {
				const matchedForThisCapability = this.getMatchingCapabilities(m, capability);
				if (matchedForThisCapability.length === 0) {
					matchesAll = false;
					break;
				}
				allMatchedCapabilities.push(...matchedForThisCapability);
			}

			if (matchesAll) {
				result.push({ entry: m, matchedCapabilities: distinct(allMatchedCapabilities) });
			}
		}
		return result;
	}

	private getMatchingCapabilities(modelEntry: IModelEntry, capability: string): string[] {
		const matchedCapabilities: string[] = [];
		if (!modelEntry.metadata.capabilities) {
			return matchedCapabilities;
		}

		switch (capability) {
			case 'tools':
			case 'toolcalling':
				if (modelEntry.metadata.capabilities.toolCalling === true) {
					matchedCapabilities.push('toolCalling');
				}
				break;
			case 'vision':
				if (modelEntry.metadata.capabilities.vision === true) {
					matchedCapabilities.push('vision');
				}
				break;
			case 'agent':
			case 'agentmode':
				if (modelEntry.metadata.capabilities.agentMode === true) {
					matchedCapabilities.push('agentMode');
				}
				break;
			default:
				// Check edit tools
				if (modelEntry.metadata.capabilities.editTools) {
					for (const tool of modelEntry.metadata.capabilities.editTools) {
						if (tool.toLowerCase().includes(capability)) {
							matchedCapabilities.push(tool);
						}
					}
				}
				break;
		}
		return matchedCapabilities;
	}

	private filterByText(modelEntries: IModelEntry[], searchValue: string, capabilityMatchesMap: Map<string, string[]>): IModelItemEntry[] {
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
				|| modelMatches.capabilityMatches
			) {
				const modelId = ChatModelsViewModel.getId(modelEntry);
				result.push({
					type: 'model',
					id: modelId,
					templateId: MODEL_ENTRY_TEMPLATE_ID,
					modelEntry,
					modelNameMatches: modelMatches.modelNameMatches || undefined,
					providerMatches: modelMatches.providerMatches || undefined,
					capabilityMatches: capabilityMatchesMap.get(modelId),
				});
			}
		}
		return result;
	}

	getVendors(): IUserFriendlyLanguageModel[] {
		return [...this.languageModelsService.getVendors()].sort((a, b) => {
			if (a.vendor === 'copilot') { return -1; }
			if (b.vendor === 'copilot') { return 1; }
			return a.displayName.localeCompare(b.displayName);
		});
	}

	override async resolve(): Promise<void> {
		this.modelEntries = [];

		for (const vendor of this.getVendors()) {
			const modelIdentifiers = await this.languageModelsService.selectLanguageModels({ vendor: vendor.vendor }, vendor.vendor === 'copilot');
			const models = coalesce(modelIdentifiers.map(identifier => {
				const metadata = this.languageModelsService.lookupLanguageModel(identifier);
				if (!metadata) {
					return undefined;
				}
				if (vendor.vendor === 'copilot' && metadata.id === 'auto') {
					return undefined;
				}
				return {
					vendor: vendor.vendor,
					vendorDisplayName: vendor.displayName,
					identifier,
					metadata
				};
			}));

			this.modelEntries.push(...models.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)));
		}

		this.modelEntries = distinct(this.modelEntries, modelEntry => ChatModelsViewModel.getId(modelEntry));

		return super.resolve();
	}

	private static getId(modelEntry: IModelEntry): string {
		return modelEntry.identifier + modelEntry.vendor + (modelEntry.metadata.version || '');
	}

	toggleVendorCollapsed(vendorId: string): void {
		if (this.collapsedVendors.has(vendorId)) {
			this.collapsedVendors.delete(vendorId);
		} else {
			this.collapsedVendors.add(vendorId);
		}
		this._onDidChangeModelEntries.fire();
	}

	getConfiguredVendors(): IVendorItemEntry[] {
		return this.toEntries(this.modelEntries, new Map(), true) as IVendorItemEntry[];
	}

	private toEntries(modelEntries: IModelEntry[], capabilityMatchesMap: Map<string, string[]>, excludeModels?: boolean): (IVendorItemEntry | IModelItemEntry)[] {
		const result: (IVendorItemEntry | IModelItemEntry)[] = [];
		const vendorMap = new Map<string, IModelEntry[]>();

		for (const modelEntry of modelEntries) {
			const models = vendorMap.get(modelEntry.vendor) || [];
			models.push(modelEntry);
			vendorMap.set(modelEntry.vendor, models);
		}

		const showVendorHeaders = vendorMap.size > 1;

		for (const [vendor, models] of vendorMap) {
			const firstModel = models[0];
			const isCollapsed = this.collapsedVendors.has(vendor);
			const vendorInfo = this.languageModelsService.getVendors().find(v => v.vendor === vendor);

			if (showVendorHeaders) {
				result.push({
					type: 'vendor',
					id: `vendor-${vendor}`,
					vendorEntry: {
						vendor: firstModel.vendor,
						vendorDisplayName: firstModel.vendorDisplayName,
						managementCommand: vendorInfo?.managementCommand
					},
					templateId: VENDOR_ENTRY_TEMPLATE_ID,
					collapsed: isCollapsed
				});
			}

			if (!excludeModels && (!isCollapsed || !showVendorHeaders)) {
				for (const modelEntry of models) {
					const modelId = ChatModelsViewModel.getId(modelEntry);
					result.push({
						type: 'model',
						id: modelId,
						modelEntry,
						templateId: MODEL_ENTRY_TEMPLATE_ID,
						capabilityMatches: capabilityMatchesMap.get(modelId),
					});
				}
			}
		}

		return result;
	}
}

class ModelItemMatches {

	readonly modelNameMatches: IMatch[] | null = null;
	readonly providerMatches: IMatch[] | null = null;
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
