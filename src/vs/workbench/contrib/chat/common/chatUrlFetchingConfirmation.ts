/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IQuickInputButton, IQuickInputService, IQuickTreeItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { ConfirmedReason, ToolConfirmKind } from './chatService.js';
import { ChatConfiguration } from './constants.js';
import {
	ILanguageModelToolConfirmationActions,
	ILanguageModelToolConfirmationContribution,
	ILanguageModelToolConfirmationContributionQuickTreeItem,
	ILanguageModelToolConfirmationRef
} from './languageModelToolsConfirmationService.js';
import { extractUrlPatterns, getPatternLabel, isUrlApproved, IUrlApprovalSettings } from './chatUrlFetchingPatterns.js';

const trashButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.trash),
	tooltip: localize('delete', "Delete")
};

export class ChatUrlFetchingConfirmationContribution implements ILanguageModelToolConfirmationContribution {
	readonly canUseDefaultApprovals = false;

	constructor(
		private readonly _getURLS: (parameters: unknown) => string[] | undefined,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IPreferencesService private readonly _preferencesService: IPreferencesService
	) { }

	getPreConfirmAction(ref: ILanguageModelToolConfirmationRef): ConfirmedReason | undefined {
		return this._checkApproval(ref, true);
	}

	getPostConfirmAction(ref: ILanguageModelToolConfirmationRef): ConfirmedReason | undefined {
		return this._checkApproval(ref, false);
	}

	private _checkApproval(ref: ILanguageModelToolConfirmationRef, checkRequest: boolean): ConfirmedReason | undefined {
		const urls = this._getURLS(ref.parameters);
		if (!urls || urls.length === 0) {
			return undefined;
		}

		const approvedUrls = this._getApprovedUrls();

		// Check if all URLs are approved
		const allApproved = urls.every(url => {
			try {
				const uri = URI.parse(url);
				return isUrlApproved(uri, approvedUrls, checkRequest);
			} catch {
				return false;
			}
		});

		if (allApproved) {
			return {
				type: ToolConfirmKind.Setting,
				id: ChatConfiguration.AutoApprovedUrls
			};
		}

		return undefined;
	}

	getPreConfirmActions(ref: ILanguageModelToolConfirmationRef): ILanguageModelToolConfirmationActions[] {
		return this._getConfirmActions(ref, true);
	}

	getPostConfirmActions(ref: ILanguageModelToolConfirmationRef): ILanguageModelToolConfirmationActions[] {
		return this._getConfirmActions(ref, false);
	}

	private _getConfirmActions(ref: ILanguageModelToolConfirmationRef, forRequest: boolean): ILanguageModelToolConfirmationActions[] {
		const urls = this._getURLS(ref.parameters);
		if (!urls || urls.length === 0) {
			return [];
		}

		const actions: ILanguageModelToolConfirmationActions[] = [];

		// Get unique URLs (may have duplicates)
		const uniqueUrls = Array.from(new Set(urls)).map(u => URI.parse(u));

		// For each URL, get its patterns
		const urlPatterns = new ResourceMap<string[]>(uniqueUrls.map(u => [u, extractUrlPatterns(u)] as const));

		// If only one URL, show quick actions for specific patterns
		if (urlPatterns.size === 1) {
			const uri = uniqueUrls[0];
			const patterns = urlPatterns.get(uri)!;

			// Show top 2 most relevant patterns as quick actions
			const topPatterns = patterns.slice(0, 2);
			for (const pattern of topPatterns) {
				const patternLabel = getPatternLabel(uri, pattern);
				actions.push({
					label: forRequest
						? localize('approveRequestTo', "Allow requests to {0}", patternLabel)
						: localize('approveResponseFrom', "Allow responses from {0}", patternLabel),
					select: async () => {
						await this._approvePattern(pattern, forRequest, !forRequest);
						return true;
					}
				});
			}

			// "More options" action
			actions.push({
				label: localize('moreOptions', "Allow requests to..."),
				select: async () => {
					const result = await this._showMoreOptions(ref, [{ uri, patterns }], forRequest);
					return result;
				}
			});
		} else {
			// Multiple URLs - show "More options" only
			actions.push({
				label: localize('moreOptionsMultiple', "Configure URL Approvals..."),
				select: async () => {
					await this._showMoreOptions(ref, [...urlPatterns].map(([uri, patterns]) => ({ uri, patterns })), forRequest);
					return true;
				}
			});
		}

		return actions;
	}

	private async _showMoreOptions(ref: ILanguageModelToolConfirmationRef, urls: { uri: URI; patterns: string[] }[], forRequest: boolean): Promise<boolean> {
		interface IPatternTreeItem extends IQuickTreeItem {
			pattern: string;
			approvalType?: 'request' | 'response';
			children?: IPatternTreeItem[];
		}

		return new Promise<boolean>((resolve) => {
			const disposables = new DisposableStore();
			const quickTree = disposables.add(this._quickInputService.createQuickTree<IPatternTreeItem>());
			quickTree.ignoreFocusOut = true;
			quickTree.sortByLabel = false;
			quickTree.placeholder = localize('selectApproval', "Select URL pattern to approve");

			const treeItems: IPatternTreeItem[] = [];
			const approvedUrls = this._getApprovedUrls();

			for (const { uri, patterns } of urls) {
				for (const pattern of patterns.slice().sort((a, b) => b.length - a.length)) {
					const settings = approvedUrls[pattern];
					const requestChecked = typeof settings === 'boolean' ? settings : (settings?.approveRequest ?? false);
					const responseChecked = typeof settings === 'boolean' ? settings : (settings?.approveResponse ?? false);

					treeItems.push({
						label: getPatternLabel(uri, pattern),
						pattern,
						checked: requestChecked && responseChecked ? true : (!requestChecked && !responseChecked ? false : 'mixed'),
						collapsed: true,
						children: [
							{
								label: localize('allowRequestsCheckbox', "Make requests without confirmation"),
								pattern,
								approvalType: 'request',
								checked: requestChecked
							},
							{
								label: localize('allowResponsesCheckbox', "Allow responses without confirmation"),
								pattern,
								approvalType: 'response',
								checked: responseChecked
							}
						],
					});
				}
			}

			quickTree.setItemTree(treeItems);

			const updateApprovals = () => {
				const current = { ...this._getApprovedUrls() };
				for (const item of quickTree.itemTree) {
					// root-level items

					const allowPre = item.children?.find(c => c.approvalType === 'request')?.checked;
					const allowPost = item.children?.find(c => c.approvalType === 'response')?.checked;

					if (allowPost && allowPre) {
						current[item.pattern] = true;
					} else if (!allowPost && !allowPre) {
						delete current[item.pattern];
					} else {
						current[item.pattern] = {
							approveRequest: !!allowPre || undefined,
							approveResponse: !!allowPost || undefined,
						};
					}
				}

				return this._configurationService.updateValue(ChatConfiguration.AutoApprovedUrls, current);
			};

			disposables.add(quickTree.onDidAccept(async () => {
				quickTree.busy = true;
				await updateApprovals();
				resolve(!!this._checkApproval(ref, forRequest));
				quickTree.hide();
			}));

			disposables.add(quickTree.onDidHide(() => {
				updateApprovals();
				disposables.dispose();
				resolve(false);
			}));

			quickTree.show();
		});
	}

	private async _approvePattern(pattern: string, approveRequest: boolean, approveResponse: boolean): Promise<void> {
		const approvedUrls = { ...this._getApprovedUrls() };

		// Create the approval settings
		let value: boolean | IUrlApprovalSettings;
		if (approveRequest === approveResponse) {
			value = approveRequest;
		} else {
			value = { approveRequest, approveResponse };
		}

		approvedUrls[pattern] = value;

		await this._configurationService.updateValue(
			ChatConfiguration.AutoApprovedUrls,
			approvedUrls
		);
	}

	getManageActions(): ILanguageModelToolConfirmationContributionQuickTreeItem[] {
		const approvedUrls = { ...this._getApprovedUrls() };
		const items: ILanguageModelToolConfirmationContributionQuickTreeItem[] = [];

		for (const [pattern, settings] of Object.entries(approvedUrls)) {
			const label = pattern;
			let description: string;

			if (typeof settings === 'boolean') {
				description = settings
					? localize('approveAll', "Approve all")
					: localize('denyAll', "Deny all");
			} else {
				const parts: string[] = [];
				if (settings.approveRequest) {
					parts.push(localize('requests', "requests"));
				}
				if (settings.approveResponse) {
					parts.push(localize('responses', "responses"));
				}
				description = parts.length > 0
					? localize('approves', "Approves {0}", parts.join(', '))
					: localize('noApprovals', "No approvals");
			}

			const item: ILanguageModelToolConfirmationContributionQuickTreeItem = {
				label,
				description,
				buttons: [trashButton],
				checked: true,
				onDidChangeChecked: (checked) => {
					if (checked) {
						approvedUrls[pattern] = settings;
					} else {
						delete approvedUrls[pattern];
					}

					this._configurationService.updateValue(ChatConfiguration.AutoApprovedUrls, approvedUrls);
				}
			};

			items.push(item);
		}

		items.push({
			pickable: false,
			label: localize('moreOptionsManage', "More Options..."),
			description: localize('openSettings', "Open settings"),
			onDidOpen: () => {
				this._preferencesService.openUserSettings({ query: ChatConfiguration.AutoApprovedUrls });
			}
		});

		return items;
	}

	async reset(): Promise<void> {
		await this._configurationService.updateValue(
			ChatConfiguration.AutoApprovedUrls,
			{}
		);
	}

	private _getApprovedUrls(): Readonly<Record<string, boolean | IUrlApprovalSettings>> {
		return this._configurationService.getValue<Record<string, boolean | IUrlApprovalSettings>>(
			ChatConfiguration.AutoApprovedUrls
		) || {};
	}
}
