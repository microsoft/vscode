/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, isHTMLInputElement, isHTMLTextAreaElement, reset, windowOpenNoOpener } from 'vs/base/browser/dom';
import { Codicon } from 'vs/base/common/codicons';
import { groupBy } from 'vs/base/common/collections';
import { isMacintosh } from 'vs/base/common/platform';
import { IProductConfiguration } from 'vs/base/common/product';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IIssueMainService, IssueReporterData, IssueReporterExtensionData } from 'vs/platform/issue/common/issue';
import { BaseIssueReporterService } from 'vs/workbench/contrib/issue/browser/issue';

// GitHub has let us know that we could up our limit here to 8k. We chose 7500 to play it safe.
// ref https://github.com/microsoft/vscode/issues/159191

export class IssueWebReporter extends BaseIssueReporterService {
	constructor(
		disableExtensions: boolean,
		data: IssueReporterData,
		os: {
			type: string;
			arch: string;
			release: string;
		},
		product: IProductConfiguration,
		window: Window,
		@IIssueMainService issueMainService: IIssueMainService
	) {
		super(disableExtensions, data, os, product, window, true, issueMainService);

		const target = this.window.document.querySelector<HTMLElement>('.block-system .block-info');

		const webInfo = this.window.navigator.userAgent;
		if (webInfo) {
			target?.appendChild(this.window.document.createTextNode(webInfo));
			this.receivedSystemInfo = true;
			this.issueReporterModel.update({ systemInfoWeb: webInfo });

		}

		this.setEventHandlers();
		this.handleExtensionData(data.enabledExtensions);
	}

	private handleExtensionData(extensions: IssueReporterExtensionData[]) {
		const installedExtensions = extensions.filter(x => !x.isBuiltin);
		const { nonThemes, themes } = groupBy(installedExtensions, ext => {
			return ext.isTheme ? 'themes' : 'nonThemes';
		});

		const numberOfThemeExtesions = themes && themes.length;
		this.issueReporterModel.update({ numberOfThemeExtesions, enabledNonThemeExtesions: nonThemes, allExtensions: installedExtensions });
		this.updateExtensionTable(nonThemes, numberOfThemeExtesions);
		if (this.disableExtensions || installedExtensions.length === 0) {
			(<HTMLButtonElement>this.getElementById('disableExtensions')).disabled = true;
		}

		this.updateExtensionSelector(installedExtensions);
	}

	private async sendReporterMenu(extension: IssueReporterExtensionData): Promise<IssueReporterData | undefined> {
		try {
			const data = await this.issueMainService.$sendReporterMenu(extension.id, extension.name);
			return data;
		} catch (e) {
			console.error(e);
			return undefined;
		}
	}

	public override setEventHandlers(): void {
		super.setEventHandlers();
		this.previewButton.onDidClick(async () => {
			this.delayedSubmit.trigger(async () => {
				this.createIssue();
			});
		});

		this.addEventListener('disableExtensions', 'click', () => {
			this.issueMainService.$reloadWithExtensionsDisabled();
		});

		this.addEventListener('extensionBugsLink', 'click', (e: Event) => {
			const url = (<HTMLElement>e.target).innerText;
			windowOpenNoOpener(url);
		});

		this.addEventListener('disableExtensions', 'keydown', (e: Event) => {
			e.stopPropagation();
			if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
				this.issueMainService.$reloadWithExtensionsDisabled();
			}
		});

		this.window.document.onkeydown = async (e: KeyboardEvent) => {
			const cmdOrCtrlKey = isMacintosh ? e.metaKey : e.ctrlKey;
			// Cmd/Ctrl+Enter previews issue and closes window
			if (cmdOrCtrlKey && e.key === 'Enter') {
				this.delayedSubmit.trigger(async () => {
					if (await this.createIssue()) {
						this.close();
					}
				});
			}

			// Cmd/Ctrl + w closes issue window
			if (cmdOrCtrlKey && e.key === 'w') {
				e.stopPropagation();
				e.preventDefault();

				const issueTitle = (<HTMLInputElement>this.getElementById('issue-title'))!.value;
				const { issueDescription } = this.issueReporterModel.getData();
				if (!this.hasBeenSubmitted && (issueTitle || issueDescription)) {
					// fire and forget
					this.issueMainService.$showConfirmCloseDialog();
				} else {
					this.close();
				}
			}

			// With latest electron upgrade, cmd+a is no longer propagating correctly for inputs in this window on mac
			// Manually perform the selection
			if (isMacintosh) {
				if (cmdOrCtrlKey && e.key === 'a' && e.target) {
					if (isHTMLInputElement(e.target) || isHTMLTextAreaElement(e.target)) {
						(<HTMLInputElement>e.target).select();
					}
				}
			}
		};
	}

	private updateExtensionSelector(extensions: IssueReporterExtensionData[]): void {
		interface IOption {
			name: string;
			id: string;
		}

		const extensionOptions: IOption[] = extensions.map(extension => {
			return {
				name: extension.displayName || extension.name || '',
				id: extension.id
			};
		});

		// Sort extensions by name
		extensionOptions.sort((a, b) => {
			const aName = a.name.toLowerCase();
			const bName = b.name.toLowerCase();
			if (aName > bName) {
				return 1;
			}

			if (aName < bName) {
				return -1;
			}

			return 0;
		});

		const makeOption = (extension: IOption, selectedExtension?: IssueReporterExtensionData): HTMLOptionElement => {
			const selected = selectedExtension && extension.id === selectedExtension.id;
			return $<HTMLOptionElement>('option', {
				'value': extension.id,
				'selected': selected || ''
			}, extension.name);
		};

		const extensionsSelector = this.getElementById<HTMLSelectElement>('extension-selector');
		if (extensionsSelector) {
			const { selectedExtension } = this.issueReporterModel.getData();
			reset(extensionsSelector, this.makeOption('', localize('selectExtension', "Select extension"), true), ...extensionOptions.map(extension => makeOption(extension, selectedExtension)));

			if (!selectedExtension) {
				extensionsSelector.selectedIndex = 0;
			}

			this.addEventListener('extension-selector', 'change', async (e: Event) => {
				this.clearExtensionData();
				const selectedExtensionId = (<HTMLInputElement>e.target).value;
				this.selectedExtension = selectedExtensionId;
				const extensions = this.issueReporterModel.getData().allExtensions;
				const matches = extensions.filter(extension => extension.id === selectedExtensionId);
				if (matches.length) {
					this.issueReporterModel.update({ selectedExtension: matches[0] });
					const selectedExtension = this.issueReporterModel.getData().selectedExtension;
					if (selectedExtension) {
						const iconElement = document.createElement('span');
						iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
						this.setLoading(iconElement);
						const openReporterData = await this.sendReporterMenu(selectedExtension);
						if (openReporterData) {
							if (this.selectedExtension === selectedExtensionId) {
								this.removeLoading(iconElement, true);
								this.data = openReporterData;
							} else if (this.selectedExtension !== selectedExtensionId) {
							}
						}
						else {
							if (!this.loadingExtensionData) {
								iconElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
							}
							this.removeLoading(iconElement);
							this.clearExtensionData();
							selectedExtension.data = undefined;
							selectedExtension.uri = undefined;
						}
						if (this.selectedExtension === selectedExtensionId) {
							// repopulates the fields with the new data given the selected extension.
							this.updateExtensionStatus(matches[0]);
							this.openReporter = false;
						}
					} else {
						this.issueReporterModel.update({ selectedExtension: undefined });
						this.clearSearchResults();
						this.clearExtensionData();
						this.validateSelectedExtension();
						this.updateExtensionStatus(matches[0]);
					}
				}
			});
		}

		this.addEventListener('problem-source', 'change', (_) => {
			this.validateSelectedExtension();
		});
	}
}
