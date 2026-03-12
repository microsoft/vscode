/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../../base/common/arrays.js';
import { IMatch, IFilter, or, matchesCamelCase, matchesWords, matchesBaseContiguousSubString } from '../../../../../base/common/filters.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ILanguageModelsService, ILanguageModelProviderDescriptor, ILanguageModelChatMetadataAndIdentifier } from '../../../chat/common/languageModels.js';
import { localize } from '../../../../../nls.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILanguageModelsProviderGroup } from '../../common/languageModelsConfiguration.js';
import Severity from '../../../../../base/common/severity.js';

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

export interface ILanguageModelProvider {
	vendor: ILanguageModelProviderDescriptor;
	group: ILanguageModelsProviderGroup;
}

export interface ILanguageModel extends ILanguageModelChatMetadataAndIdentifier {
	provider: ILanguageModelProvider;
	visible: boolean;
}

export interface ILanguageModelEntry {
	type: 'model';
	id: string;
	templateId: string;
	model: ILanguageModel;
	providerMatches?: IMatch[];
	modelNameMatches?: IMatch[];
	modelIdMatches?: IMatch[];
	capabilityMatches?: string[];
}

export interface ILanguageModelGroupEntry {
	type: 'group';
	id: string;
	label: string;
	collapsed: boolean;
	templateId: string;
}

export interface ILanguageModelProviderEntry {
	type: 'vendor';
	id: string;
	label: string;
	templateId: string;
	collapsed: boolean;
	vendorEntry: ILanguageModelProvider;
}

export interface IStatusEntry {
	type: 'status';
	id: string;
	message: string;
	severity: Severity;
}

export interface ILanguageModelEntriesGroup {
	group: ILanguageModelGroupEntry | ILanguageModelProviderEntry;
	models: ILanguageModel[];
	status?: IStatusEntry;
}

export function isLanguageModelProviderEntry(entry: IViewModelEntry): entry is ILanguageModelProviderEntry {
	return entry.type === 'vendor';
}

export function isLanguageModelGroupEntry(entry: IViewModelEntry): entry is ILanguageModelGroupEntry {
	return entry.type === 'group';
}

export function isStatusEntry(entry: IViewModelEntry): entry is IStatusEntry {
	return entry.type === 'status';
}

export type IViewModelEntry = ILanguageModelEntry | ILanguageModelProviderEntry | ILanguageModelGroupEntry | IStatusEntry;

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

	private languageModels: ILanguageModel[];
	private languageModelGroupStatuses: Array<{ provider: ILanguageModelProvider; status: { severity: Severity; message: string } }> = [];
	private languageModelGroups: ILanguageModelEntriesGroup[] = [];

	private readonly collapsedGroups = new Set<string>();
	private searchValue: string = '';
	private modelsSorted: boolean = false;

	private _groupBy: ChatModelGroup = ChatModelGroup.Vendor;
	get groupBy(): ChatModelGroup { return this._groupBy; }
	set groupBy(groupBy: ChatModelGroup) {
		if (this._groupBy !== groupBy) {
			this._groupBy = groupBy;
			this.collapsedGroups.clear();
			this.languageModelGroups = this.groupModels(this.languageModels);
			this.doFilter();
			this._onDidChangeGrouping.fire(groupBy);
		}
	}

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
	) {
		super();
		this.languageModels = [];
		this._register(this.languageModelsService.onDidChangeLanguageModels(vendor => this.refreshVendor(vendor)));
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
		if (searchValue !== this.searchValue) {
			this.searchValue = searchValue;
			this.collapsedGroups.clear();
			if (!this.modelsSorted) {
				this.languageModelGroups = this.groupModels(this.languageModels);
			}
			this.doFilter();
		}
		return this.viewModelEntries;
	}

	private doFilter(): void {
		const viewModelEntries: IViewModelEntry[] = [];
		const shouldShowGroupHeaders = this.languageModelGroups.length > 1;

		for (const group of this.languageModelGroups) {
			if (this.collapsedGroups.has(group.group.id)) {
				group.group.collapsed = true;
				if (shouldShowGroupHeaders) {
					viewModelEntries.push(group.group);
				}
				continue;
			}

			const groupEntries: IViewModelEntry[] = [];
			if (group.status) {
				groupEntries.push(group.status);
			}

			groupEntries.push(...this.filterModels(group.models, this.searchValue));

			if (groupEntries.length > 0) {
				group.group.collapsed = false;
				if (shouldShowGroupHeaders) {
					viewModelEntries.push(group.group);
				}
				viewModelEntries.push(...groupEntries);
			}
		}
		this.splice(0, this._viewModelEntries.length, viewModelEntries);
	}

	private filterModels(modelEntries: ILanguageModel[], searchValue: string): IViewModelEntry[] {
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

		const result: IViewModelEntry[] = [];
		const words = searchValue.split(' ');
		const lowerProviders = providerNames.map(p => p.toLowerCase().trim());

		for (const modelEntry of modelEntries) {
			if (visible !== undefined) {
				if (modelEntry.visible !== visible) {
					continue;
				}
			}

			if (lowerProviders.length > 0) {
				const matchesProvider = lowerProviders.some(provider =>
					modelEntry.provider.vendor.vendor.toLowerCase() === provider ||
					modelEntry.provider.vendor.displayName.toLowerCase() === provider
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

			const modelId = this.getModelId(modelEntry);
			result.push({
				type: 'model',
				id: modelId,
				templateId: MODEL_ENTRY_TEMPLATE_ID,
				model: modelEntry,
				modelNameMatches: modelMatches?.modelNameMatches || undefined,
				modelIdMatches: modelMatches?.modelIdMatches || undefined,
				providerMatches: modelMatches?.providerMatches || undefined,
				capabilityMatches: matchedCapabilities.length ? matchedCapabilities : undefined,
			});
		}
		return result;
	}

	private getMatchingCapabilities(modelEntry: ILanguageModel, capability: string): string[] {
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

	private groupModels(languageModels: ILanguageModel[]): ILanguageModelEntriesGroup[] {
		const result: ILanguageModelEntriesGroup[] = [];
		if (this.groupBy === ChatModelGroup.Visibility) {
			const visible = [], hidden = [];
			for (const model of languageModels) {
				if (model.visible) {
					visible.push(model);
				} else {
					hidden.push(model);
				}
			}
			result.push({
				group: {
					type: 'group',
					id: 'visible',
					label: localize('visible', "Visible"),
					templateId: GROUP_ENTRY_TEMPLATE_ID,
					collapsed: this.collapsedGroups.has('visible')
				},
				models: visible
			});
			result.push({
				group: {
					type: 'group',
					id: 'hidden',
					label: localize('hidden', "Hidden"),
					templateId: GROUP_ENTRY_TEMPLATE_ID,
					collapsed: this.collapsedGroups.has('hidden'),
				},
				models: hidden
			});
		}
		else if (this.groupBy === ChatModelGroup.Vendor) {
			for (const model of languageModels) {
				const groupId = this.getProviderGroupId(model.provider.group);
				let group = result.find(group => group.group.id === groupId);
				if (!group) {
					group = {
						group: this.createLanguageModelProviderEntry(model.provider),
						models: [],
					};
					result.push(group);
				}
				group.models.push(model);
			}
			for (const statusGroup of this.languageModelGroupStatuses) {
				const groupId = this.getProviderGroupId(statusGroup.provider.group);
				let group = result.find(group => group.group.id === groupId);
				if (!group) {
					group = {
						group: this.createLanguageModelProviderEntry(statusGroup.provider),
						models: [],
					};
					result.push(group);
				}
				group.status = {
					id: `status.${group.group.id}`,
					type: 'status',
					...statusGroup.status,
				};
			}
			result.sort((a, b) => {
				if (a.models[0]?.provider.vendor.isDefault) { return -1; }
				if (b.models[0]?.provider.vendor.isDefault) { return 1; }
				return a.group.label.localeCompare(b.group.label);
			});
		}
		for (const group of result) {
			group.models.sort((a, b) => {
				if (a.provider.vendor.isDefault && b.provider.vendor.isDefault) {
					return a.metadata.name.localeCompare(b.metadata.name);
				}
				if (a.provider.vendor.isDefault) { return -1; }
				if (b.provider.vendor.isDefault) { return 1; }
				if (a.provider.group.name === b.provider.group.name) {
					return a.metadata.name.localeCompare(b.metadata.name);
				}
				return a.provider.group.name.localeCompare(b.provider.group.name);
			});
		}
		this.modelsSorted = true;
		return result;
	}

	private createLanguageModelProviderEntry(provider: ILanguageModelProvider): ILanguageModelProviderEntry {
		const id = this.getProviderGroupId(provider.group);
		return {
			type: 'vendor',
			id,
			label: provider.group.name,
			templateId: VENDOR_ENTRY_TEMPLATE_ID,
			collapsed: this.collapsedGroups.has(id),
			vendorEntry: {
				group: provider.group,
				vendor: provider.vendor
			},
		};
	}

	getVendors(): ILanguageModelProviderDescriptor[] {
		return [...this.languageModelsService.getVendors()].sort((a, b) => {
			if (a.isDefault) { return -1; }
			if (b.isDefault) { return 1; }
			return a.displayName.localeCompare(b.displayName);
		});
	}

	async refresh(): Promise<void> {
		await this.languageModelsService.selectLanguageModels({});
		await this.refreshAllVendors();
	}

	private async refreshAllVendors(): Promise<void> {
		this.languageModels = [];
		this.languageModelGroupStatuses = [];
		for (const vendor of this.getVendors()) {
			this.addVendorModels(vendor);
		}
		this.languageModelGroups = this.groupModels(this.languageModels);
		this.doFilter();
	}

	private refreshVendor(vendorId: string): void {
		const vendor = this.getVendors().find(v => v.vendor === vendorId);
		if (!vendor) {
			return;
		}

		// Remove existing models for this vendor
		this.languageModels = this.languageModels.filter(m => m.provider.vendor.vendor !== vendorId);
		this.languageModelGroupStatuses = this.languageModelGroupStatuses.filter(s => s.provider.vendor.vendor !== vendorId);

		// Add updated models for this vendor
		this.addVendorModels(vendor);
		this.languageModelGroups = this.groupModels(this.languageModels);
		this.doFilter();
	}

	private addVendorModels(vendor: ILanguageModelProviderDescriptor): void {
		const models: ILanguageModel[] = [];
		const languageModelsGroups = this.languageModelsService.getLanguageModelGroups(vendor.vendor);
		for (const group of languageModelsGroups) {
			const provider: ILanguageModelProvider = {
				group: group.group ?? {
					vendor: vendor.vendor,
					name: vendor.displayName
				},
				vendor
			};
			if (group.status) {
				this.languageModelGroupStatuses.push({
					provider,
					status: {
						message: group.status.message,
						severity: group.status.severity
					}
				});
			}
			for (const identifier of group.modelIdentifiers) {
				const metadata = this.languageModelsService.lookupLanguageModel(identifier);
				if (!metadata) {
					continue;
				}
				if (vendor.isDefault && metadata.id === 'auto') {
					continue;
				}
				models.push({
					identifier,
					metadata,
					provider,
					visible: metadata.isUserSelectable ?? false,
				});
			}
		}
		this.languageModels.push(...models.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)));
	}

	toggleVisibility(model: ILanguageModelEntry): void {
		const newVisibility = !model.model.visible;
		this.languageModelsService.updateModelPickerPreference(model.model.identifier, newVisibility);
		const metadata = this.languageModelsService.lookupLanguageModel(model.model.identifier);
		const index = this.viewModelEntries.indexOf(model);
		if (metadata && index !== -1) {
			model.model.visible = newVisibility;
			model.model.metadata = metadata;
			model.id = this.getModelId(model.model);
			if (this.groupBy === ChatModelGroup.Visibility) {
				this.modelsSorted = false;
			}
			this.splice(index, 1, [model]);
		}
	}

	setModelsVisibility(models: ILanguageModelEntry[], visible: boolean): void {
		for (const model of models) {
			this.languageModelsService.updateModelPickerPreference(model.model.identifier, visible);
			model.model.visible = visible;
		}
		// Refresh to update the UI
		this.languageModelGroups = this.groupModels(this.languageModels);
		this.doFilter();
	}

	setGroupVisibility(group: ILanguageModelProviderEntry | ILanguageModelGroupEntry, visible: boolean): void {
		const models = this.getModelsForGroup(group);
		for (const model of models) {
			this.languageModelsService.updateModelPickerPreference(model.identifier, visible);
			model.visible = visible;
		}
		// Refresh to update the UI
		this.languageModelGroups = this.groupModels(this.languageModels);
		this.doFilter();
	}

	getModelsForGroup(group: ILanguageModelProviderEntry | ILanguageModelGroupEntry): ILanguageModel[] {
		if (isLanguageModelProviderEntry(group)) {
			return this.languageModels.filter(m =>
				this.getProviderGroupId(m.provider.group) === group.id
			);
		} else {
			// Group by visibility
			return this.languageModels.filter(m =>
				(group.id === 'visible' && m.visible) ||
				(group.id === 'hidden' && !m.visible)
			);
		}
	}

	private getModelId(modelEntry: ILanguageModel): string {
		return `${modelEntry.provider.group.name}.${modelEntry.identifier}.${modelEntry.metadata.version}-visible:${modelEntry.visible}`;
	}

	private getProviderGroupId(group: ILanguageModelsProviderGroup): string {
		return `${group.vendor}-${group.name}`;
	}

	toggleCollapsed(viewModelEntry: IViewModelEntry): void {
		const id = isLanguageModelGroupEntry(viewModelEntry) ? viewModelEntry.id : isLanguageModelProviderEntry(viewModelEntry) ? viewModelEntry.id : undefined;
		if (!id) {
			return;
		}
		this.selectedEntry = viewModelEntry;
		if (!this.collapsedGroups.delete(id)) {
			this.collapsedGroups.add(id);
		}
		this.doFilter();
	}

	collapseAll(): void {
		this.collapsedGroups.clear();
		for (const entry of this.viewModelEntries) {
			if (isLanguageModelProviderEntry(entry) || isLanguageModelGroupEntry(entry)) {
				this.collapsedGroups.add(entry.id);
			}
		}
		this.doFilter();
	}

	getConfiguredVendors(): ILanguageModelProvider[] {
		const result: ILanguageModelProvider[] = [];
		const seenVendors = new Set<string>();
		for (const modelEntry of this.languageModels) {
			if (!seenVendors.has(modelEntry.provider.group.name)) {
				seenVendors.add(modelEntry.provider.group.name);
				result.push(modelEntry.provider);
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

	constructor(modelEntry: ILanguageModel, searchValue: string, words: string[], completeMatch: boolean) {
		if (!completeMatch) {
			// Match against model name
			this.modelNameMatches = modelEntry.metadata.name ?
				this.matches(searchValue, modelEntry.metadata.name, (word, wordToMatchAgainst) => matchesWords(word, wordToMatchAgainst, true), words) :
				null;

			this.modelIdMatches = this.matches(searchValue, modelEntry.metadata.id, or(matchesWords, matchesCamelCase), words);

			// Match against vendor display name
			this.providerMatches = this.matches(searchValue, modelEntry.provider.group.name, (word, wordToMatchAgainst) => matchesWords(word, wordToMatchAgainst, true), words);

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
