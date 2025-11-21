/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct, coalesce } from '../../../../../base/common/arrays.js';
import { IMatch, IFilter, or, matchesCamelCase, matchesWords, matchesBaseContiguousSubString } from '../../../../../base/common/filters.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ILanguageModelsService, ILanguageModelChatMetadata, IUserFriendlyLanguageModel } from '../../../chat/common/languageModels.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { localize } from '../../../../../nls.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

export const MODEL_ENTRY_TEMPLATE_ID = 'model.entry.template';
export const VENDOR_ENTRY_TEMPLATE_ID = 'vendor.entry.template';
export const GROUP_ENTRY_TEMPLATE_ID = 'group.entry.template';

const wordFilter = or(matchesBaseContiguousSubString, matchesWords);
const CAPABILITY_REGEX = /@capability:\s*([^\s]+)/gi;
const VISIBLE_REGEX = /@visible:\s*(true|false)/i;
const PROVIDER_REGEX = /@provider:\s*((".+?")|([^\s]+))/gi;

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
	modelIdMatches?: IMatch[];
	capabilityMatches?: string[];
}

export interface IVendorItemEntry {
	type: 'vendor';
	id: string;
	vendorEntry: IVendorEntry;
	templateId: string;
	collapsed: boolean;
}

export interface IGroupItemEntry {
	type: 'group';
	id: string;
	group: string;
	label: string;
	templateId: string;
	collapsed: boolean;
}

export function isVendorEntry(entry: IViewModelEntry): entry is IVendorItemEntry {
	return entry.type === 'vendor';
}

export function isGroupEntry(entry: IViewModelEntry): entry is IGroupItemEntry {
	return entry.type === 'group';
}

export type IViewModelEntry = IModelItemEntry | IVendorItemEntry | IGroupItemEntry;

export interface IViewModelChangeEvent {
	at: number;
	removed: number;
	added: IViewModelEntry[];
}

export const enum ChatModelGroup {
	Vendor = 'vendor',
	Visibility = 'visibility'
}

export class ChatModelsViewModel extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<IViewModelChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _onDidChangeGrouping = this._register(new Emitter<ChatModelGroup>());
	readonly onDidChangeGrouping = this._onDidChangeGrouping.event;

	private modelEntries: IModelEntry[];
	private readonly collapsedGroups = new Set<string>();
	private searchValue: string = '';
	private modelsSorted: boolean = false;

	private _groupBy: ChatModelGroup = ChatModelGroup.Vendor;
	get groupBy(): ChatModelGroup { return this._groupBy; }
	set groupBy(groupBy: ChatModelGroup) {
		if (this._groupBy !== groupBy) {
			this._groupBy = groupBy;
			this.collapsedGroups.clear();
			this.modelEntries = this.sortModels(this.modelEntries);
			this.filter(this.searchValue);
			this._onDidChangeGrouping.fire(groupBy);
		}
	}

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService
	) {
		super();
		this.modelEntries = [];
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.refresh()));
	}

	private readonly _viewModelEntries: IViewModelEntry[] = [];
	get viewModelEntries(): readonly IViewModelEntry[] {
		return this._viewModelEntries;
	}
	private splice(at: number, removed: number, added: IViewModelEntry[]): void {
		this._viewModelEntries.splice(at, removed, ...added);
		if (this.selectedEntry) {
			this.selectedEntry = this._viewModelEntries.find(entry => entry.id === this.selectedEntry?.id);
		}
		this._onDidChange.fire({ at, removed, added });
	}

	selectedEntry: IViewModelEntry | undefined;

	public shouldRefilter(): boolean {
		return !this.modelsSorted;
	}

	filter(searchValue: string): readonly IViewModelEntry[] {
		this.searchValue = searchValue;
		if (!this.modelsSorted) {
			this.modelEntries = this.sortModels(this.modelEntries);
		}
		const filtered = this.filterModels(this.modelEntries, searchValue);
		this.splice(0, this._viewModelEntries.length, filtered);
		return this.viewModelEntries;
	}

	private filterModels(modelEntries: IModelEntry[], searchValue: string): IViewModelEntry[] {
		let visible: boolean | undefined;

		const visibleMatches = VISIBLE_REGEX.exec(searchValue);
		if (visibleMatches && visibleMatches[1]) {
			visible = visibleMatches[1].toLowerCase() === 'true';
			searchValue = searchValue.replace(VISIBLE_REGEX, '');
		}

		const providerNames: string[] = [];
		let providerMatch: RegExpExecArray | null;
		PROVIDER_REGEX.lastIndex = 0;
		while ((providerMatch = PROVIDER_REGEX.exec(searchValue)) !== null) {
			const providerName = providerMatch[2] ? providerMatch[2].substring(1, providerMatch[2].length - 1) : providerMatch[3];
			providerNames.push(providerName);
		}
		if (providerNames.length > 0) {
			searchValue = searchValue.replace(PROVIDER_REGEX, '');
		}

		const capabilities: string[] = [];
		let capabilityMatch: RegExpExecArray | null;
		CAPABILITY_REGEX.lastIndex = 0;
		while ((capabilityMatch = CAPABILITY_REGEX.exec(searchValue)) !== null) {
			capabilities.push(capabilityMatch[1].toLowerCase());
		}
		if (capabilities.length > 0) {
			searchValue = searchValue.replace(CAPABILITY_REGEX, '');
		}

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

		const isFiltering = searchValue !== '' || capabilities.length > 0 || providerNames.length > 0 || visible !== undefined;

		const result: IViewModelEntry[] = [];
		const words = searchValue.split(' ');
		const allVendors = new Set(this.modelEntries.map(m => m.vendor));
		const showHeaders = allVendors.size > 1;
		const addedGroups = new Set<string>();
		const lowerProviders = providerNames.map(p => p.toLowerCase().trim());

		for (const modelEntry of modelEntries) {
			if (visible !== undefined) {
				if ((modelEntry.metadata.isUserSelectable ?? false) !== visible) {
					continue;
				}
			}

			if (lowerProviders.length > 0) {
				const matchesProvider = lowerProviders.some(provider =>
					modelEntry.vendor.toLowerCase() === provider ||
					modelEntry.vendorDisplayName.toLowerCase() === provider
				);
				if (!matchesProvider) {
					continue;
				}
			}

			// Filter by capabilities
			let matchedCapabilities: string[] = [];
			if (capabilities.length > 0) {
				if (!modelEntry.metadata.capabilities) {
					continue;
				}
				let matchesAll = true;
				for (const capability of capabilities) {
					const matchedForThisCapability = this.getMatchingCapabilities(modelEntry, capability);
					if (matchedForThisCapability.length === 0) {
						matchesAll = false;
						break;
					}
					matchedCapabilities.push(...matchedForThisCapability);
				}
				if (!matchesAll) {
					continue;
				}
				matchedCapabilities = distinct(matchedCapabilities);
			}

			// Filter by text
			let modelMatches: ModelItemMatches | undefined;
			if (searchValue) {
				modelMatches = new ModelItemMatches(modelEntry, searchValue, words, completeMatch);
				if (!modelMatches.modelNameMatches && !modelMatches.modelIdMatches && !modelMatches.providerMatches && !modelMatches.capabilityMatches) {
					continue;
				}
			}

			if (this.groupBy === ChatModelGroup.Vendor) {
				if (showHeaders) {
					if (!addedGroups.has(modelEntry.vendor)) {
						const isCollapsed = !isFiltering && this.collapsedGroups.has(modelEntry.vendor);
						const vendorInfo = this.languageModelsService.getVendors().find(v => v.vendor === modelEntry.vendor);
						result.push({
							type: 'vendor',
							id: `vendor-${modelEntry.vendor}`,
							vendorEntry: {
								vendor: modelEntry.vendor,
								vendorDisplayName: modelEntry.vendorDisplayName,
								managementCommand: vendorInfo?.managementCommand
							},
							templateId: VENDOR_ENTRY_TEMPLATE_ID,
							collapsed: isCollapsed
						});
						addedGroups.add(modelEntry.vendor);
					}

					if (!isFiltering && this.collapsedGroups.has(modelEntry.vendor)) {
						continue;
					}
				}
			} else if (this.groupBy === ChatModelGroup.Visibility) {
				const isVisible = modelEntry.metadata.isUserSelectable ?? false;
				const groupKey = isVisible ? 'visible' : 'hidden';
				if (!addedGroups.has(groupKey)) {
					const isCollapsed = !isFiltering && this.collapsedGroups.has(groupKey);
					result.push({
						type: 'group',
						id: `group-${groupKey}`,
						group: groupKey,
						label: isVisible ? localize('visible', "Visible") : localize('hidden', "Hidden"),
						templateId: GROUP_ENTRY_TEMPLATE_ID,
						collapsed: isCollapsed
					});
					addedGroups.add(groupKey);
				}

				if (!isFiltering && this.collapsedGroups.has(groupKey)) {
					continue;
				}
			}

			const modelId = ChatModelsViewModel.getId(modelEntry);
			result.push({
				type: 'model',
				id: modelId,
				templateId: MODEL_ENTRY_TEMPLATE_ID,
				modelEntry,
				modelNameMatches: modelMatches?.modelNameMatches || undefined,
				modelIdMatches: modelMatches?.modelIdMatches || undefined,
				providerMatches: modelMatches?.providerMatches || undefined,
				capabilityMatches: matchedCapabilities.length ? matchedCapabilities : undefined,
			});
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

	private sortModels(modelEntries: IModelEntry[]): IModelEntry[] {
		if (this.groupBy === ChatModelGroup.Visibility) {
			modelEntries.sort((a, b) => {
				const aVisible = a.metadata.isUserSelectable ?? false;
				const bVisible = b.metadata.isUserSelectable ?? false;
				if (aVisible === bVisible) {
					if (a.vendor === b.vendor) {
						return a.metadata.name.localeCompare(b.metadata.name);
					}
					if (a.vendor === 'copilot') { return -1; }
					if (b.vendor === 'copilot') { return 1; }
					return a.vendorDisplayName.localeCompare(b.vendorDisplayName);
				}
				return aVisible ? -1 : 1;
			});
		} else if (this.groupBy === ChatModelGroup.Vendor) {
			modelEntries.sort((a, b) => {
				if (a.vendor === b.vendor) {
					return a.metadata.name.localeCompare(b.metadata.name);
				}
				if (a.vendor === 'copilot') { return -1; }
				if (b.vendor === 'copilot') { return 1; }
				return a.vendorDisplayName.localeCompare(b.vendorDisplayName);
			});
		}
		this.modelsSorted = true;
		return modelEntries;
	}

	getVendors(): IUserFriendlyLanguageModel[] {
		return [...this.languageModelsService.getVendors()].sort((a, b) => {
			if (a.vendor === 'copilot') { return -1; }
			if (b.vendor === 'copilot') { return 1; }
			return a.displayName.localeCompare(b.displayName);
		});
	}

	async refresh(): Promise<void> {
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

		const modelEntries = distinct(this.modelEntries, modelEntry => ChatModelsViewModel.getId(modelEntry));
		this.modelEntries = this._groupBy === ChatModelGroup.Visibility ? this.sortModels(modelEntries) : modelEntries;
		this.filter(this.searchValue);
	}

	toggleVisibility(model: IModelItemEntry): void {
		const isVisible = model.modelEntry.metadata.isUserSelectable ?? false;
		const newVisibility = !isVisible;
		this.languageModelsService.updateModelPickerPreference(model.modelEntry.identifier, newVisibility);
		const metadata = this.languageModelsService.lookupLanguageModel(model.modelEntry.identifier);
		const index = this.viewModelEntries.indexOf(model);
		if (metadata && index !== -1) {
			model.id = ChatModelsViewModel.getId(model.modelEntry);
			model.modelEntry.metadata = metadata;
			if (this.groupBy === ChatModelGroup.Visibility) {
				this.modelsSorted = false;
			}
			this.splice(index, 1, [model]);
		}
	}

	private static getId(modelEntry: IModelEntry): string {
		return `${modelEntry.identifier}.${modelEntry.metadata.version}-visible:${modelEntry.metadata.isUserSelectable}`;
	}

	toggleCollapsed(viewModelEntry: IViewModelEntry): void {
		const id = isGroupEntry(viewModelEntry) ? viewModelEntry.group : isVendorEntry(viewModelEntry) ? viewModelEntry.vendorEntry.vendor : undefined;
		if (!id) {
			return;
		}
		this.selectedEntry = viewModelEntry;
		if (this.collapsedGroups.has(id)) {
			this.collapsedGroups.delete(id);
		} else {
			this.collapsedGroups.add(id);
		}
		this.filter(this.searchValue);
	}

	getConfiguredVendors(): IVendorEntry[] {
		const result: IVendorEntry[] = [];
		const seenVendors = new Set<string>();
		for (const modelEntry of this.modelEntries) {
			if (!seenVendors.has(modelEntry.vendor)) {
				seenVendors.add(modelEntry.vendor);
				const vendorInfo = this.languageModelsService.getVendors().find(v => v.vendor === modelEntry.vendor);
				result.push({
					vendor: modelEntry.vendor,
					vendorDisplayName: modelEntry.vendorDisplayName,
					managementCommand: vendorInfo?.managementCommand
				});
			}
		}
		return result;
	}
}

class ModelItemMatches {

	readonly modelNameMatches: IMatch[] | null = null;
	readonly modelIdMatches: IMatch[] | null = null;
	readonly providerMatches: IMatch[] | null = null;
	readonly capabilityMatches: IMatch[] | null = null;

	constructor(modelEntry: IModelEntry, searchValue: string, words: string[], completeMatch: boolean) {
		if (!completeMatch) {
			// Match against model name
			this.modelNameMatches = modelEntry.metadata.name ?
				this.matches(searchValue, modelEntry.metadata.name, (word, wordToMatchAgainst) => matchesWords(word, wordToMatchAgainst, true), words) :
				null;

			this.modelIdMatches = this.matches(searchValue, modelEntry.identifier, or(matchesWords, matchesCamelCase), words);

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
