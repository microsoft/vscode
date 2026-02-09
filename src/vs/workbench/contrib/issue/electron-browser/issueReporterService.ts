/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, reset } from '../../../../base/browser/dom.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Schemas } from '../../../../base/common/network.js';
import { IProductConfiguration } from '../../../../base/common/product.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { isRemoteDiagnosticError } from '../../../../platform/diagnostics/common/diagnostics.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProcessService } from '../../../../platform/process/common/process.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IUpdateService, StateType } from '../../../../platform/update/common/update.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { applyZoom } from '../../../../platform/window/electron-browser/window.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { BaseIssueReporterService } from '../browser/baseIssueReporterService.js';
import { IssueReporterData as IssueReporterModelData } from '../browser/issueReporterModel.js';
import { IIssueFormService, IssueReporterData, IssueType } from '../common/issue.js';

// GitHub has let us know that we could up our limit here to 8k. We chose 7500 to play it safe.
// ref https://github.com/microsoft/vscode/issues/159191
const MAX_URL_LENGTH = 7500;

// Github API and issues on web has a limit of 65536. We chose 65500 to play it safe.
// ref https://github.com/github/issues/issues/12858
const MAX_GITHUB_API_LENGTH = 65500;


export class IssueReporter extends BaseIssueReporterService {
	private readonly processService: IProcessService;
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
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IIssueFormService issueFormService: IIssueFormService,
		@IProcessService processService: IProcessService,
		@IThemeService themeService: IThemeService,
		@IFileService fileService: IFileService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IOpenerService openerService: IOpenerService
	) {
		super(disableExtensions, data, os, product, window, false, issueFormService, themeService, fileService, fileDialogService, contextMenuService, authenticationService, openerService);
		this.processService = processService;
		this.processService.getSystemInfo().then(info => {
			this.issueReporterModel.update({ systemInfo: info });
			this.receivedSystemInfo = true;

			this.updateSystemInfo(this.issueReporterModel.getData());
			this.updateButtonStates();
		});
		if (this.data.issueType === IssueType.PerformanceIssue) {
			this.processService.getPerformanceInfo().then(info => {
				this.updatePerformanceInfo(info as Partial<IssueReporterData>);
			});
		}

		this.checkForUpdates();
		this.setEventHandlers();
		applyZoom(this.data.zoomLevel, this.window);
		this.updateExperimentsInfo(this.data.experiments);
		this.updateRestrictedMode(this.data.restrictedMode);
		this.updateUnsupportedMode(this.data.isUnsupported);
	}

	private async checkForUpdates(): Promise<void> {
		const updateState = this.updateService.state;
		if (updateState.type === StateType.Ready || updateState.type === StateType.Downloaded) {
			this.needsUpdate = true;
			// eslint-disable-next-line no-restricted-syntax
			const includeAcknowledgement = this.getElementById('version-acknowledgements');
			// eslint-disable-next-line no-restricted-syntax
			const updateBanner = this.getElementById('update-banner');
			if (updateBanner && includeAcknowledgement) {
				includeAcknowledgement.classList.remove('hidden');
				updateBanner.classList.remove('hidden');
				updateBanner.textContent = localize('updateAvailable', "A new version of {0} is available.", this.product.nameLong);
			}
		}
	}

	public override setEventHandlers(): void {
		super.setEventHandlers();

		this.addEventListener('issue-type', 'change', (event: Event) => {
			const issueType = parseInt((<HTMLInputElement>event.target).value);
			this.issueReporterModel.update({ issueType: issueType });
			if (issueType === IssueType.PerformanceIssue && !this.receivedPerformanceInfo) {
				this.processService.getPerformanceInfo().then(info => {
					this.updatePerformanceInfo(info as Partial<IssueReporterData>);
				});
			}

			// Resets placeholder
			// eslint-disable-next-line no-restricted-syntax
			const descriptionTextArea = <HTMLInputElement>this.getElementById('issue-title');
			if (descriptionTextArea) {
				descriptionTextArea.placeholder = localize('undefinedPlaceholder', "Please enter a title");
			}

			this.updateButtonStates();
			this.setSourceOptions();
			this.render();
		});
	}

	public override async submitToGitHub(issueTitle: string, issueBody: string, gitHubDetails: { owner: string; repositoryName: string }): Promise<boolean> {
		if (issueBody.length > MAX_GITHUB_API_LENGTH) {
			const extensionData = this.issueReporterModel.getData().extensionData;
			if (extensionData) {
				issueBody = issueBody.replace(extensionData, '');
				const date = new Date();
				const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
				const formattedTime = date.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
				const fileName = `extensionData_${formattedDate}_${formattedTime}.md`;
				try {
					const downloadPath = await this.fileDialogService.showSaveDialog({
						title: localize('saveExtensionData', "Save Extension Data"),
						availableFileSystems: [Schemas.file],
						defaultUri: joinPath(await this.fileDialogService.defaultFilePath(Schemas.file), fileName),
					});

					if (downloadPath) {
						await this.fileService.writeFile(downloadPath, VSBuffer.fromString(extensionData));
					}
				} catch (e) {
					console.error('Writing extension data to file failed');
					return false;
				}
			} else {
				console.error('Issue body too large to submit to GitHub');
				return false;
			}
		}
		const url = `https://api.github.com/repos/${gitHubDetails.owner}/${gitHubDetails.repositoryName}/issues`;
		const init = {
			method: 'POST',
			body: JSON.stringify({
				title: issueTitle,
				body: issueBody
			}),
			headers: new Headers({
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.data.githubAccessToken}`
			})
		};

		const response = await fetch(url, init);
		if (!response.ok) {
			console.error('Invalid GitHub URL provided.');
			return false;
		}
		const result = await response.json();
		await this.openerService.open(result.html_url, { openExternal: true });
		this.close();
		return true;
	}

	public override async createIssue(shouldCreate?: boolean, privateUri?: boolean): Promise<boolean> {
		const selectedExtension = this.issueReporterModel.getData().selectedExtension;
		// Short circuit if the extension provides a custom issue handler
		if (this.nonGitHubIssueUrl) {
			const url = this.getExtensionBugsUrl();
			if (url) {
				this.hasBeenSubmitted = true;
				await this.openerService.open(url, { openExternal: true });
				return true;
			}
		}

		if (!this.validateInputs()) {
			// If inputs are invalid, set focus to the first one and add listeners on them
			// to detect further changes
			// eslint-disable-next-line no-restricted-syntax
			const invalidInput = this.window.document.getElementsByClassName('invalid-input');
			if (invalidInput.length) {
				(<HTMLInputElement>invalidInput[0]).focus();
			}

			this.addEventListener('issue-title', 'input', _ => {
				this.validateInput('issue-title');
			});

			this.addEventListener('description', 'input', _ => {
				this.validateInput('description');
			});

			this.addEventListener('issue-source', 'change', _ => {
				this.validateInput('issue-source');
			});

			if (this.issueReporterModel.fileOnExtension()) {
				this.addEventListener('extension-selector', 'change', _ => {
					this.validateInput('extension-selector');
					this.validateInput('description');
				});
			}

			return false;
		}

		this.hasBeenSubmitted = true;

		// eslint-disable-next-line no-restricted-syntax
		const issueTitle = (<HTMLInputElement>this.getElementById('issue-title')).value;
		const issueBody = this.issueReporterModel.serialize();

		let issueUrl = privateUri ? this.getPrivateIssueUrl() : this.getIssueUrl();
		if (!issueUrl && selectedExtension?.uri) {
			const uri = URI.revive(selectedExtension.uri);
			issueUrl = uri.toString();
		} else if (!issueUrl) {
			console.error(`No ${privateUri ? 'private ' : ''}issue url found`);
			return false;
		}

		const gitHubDetails = this.parseGitHubUrl(issueUrl);

		// eslint-disable-next-line no-restricted-syntax
		const baseUrl = this.getIssueUrlWithTitle((<HTMLInputElement>this.getElementById('issue-title')).value, issueUrl);
		let url = baseUrl + `&body=${encodeURIComponent(issueBody)}`;

		url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);

		if (this.data.githubAccessToken && gitHubDetails && shouldCreate) {
			if (await this.submitToGitHub(issueTitle, issueBody, gitHubDetails)) {
				return true;
			}
		}

		try {
			if (url.length > MAX_URL_LENGTH || issueBody.length > MAX_GITHUB_API_LENGTH) {
				url = await this.writeToClipboard(baseUrl, issueBody);
				url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);
			}
		} catch (_) {
			console.error('Writing to clipboard failed');
			return false;
		}

		await this.openerService.open(url, { openExternal: true });
		return true;
	}

	public override async writeToClipboard(baseUrl: string, issueBody: string): Promise<string> {
		const shouldWrite = await this.issueFormService.showClipboardDialog();
		if (!shouldWrite) {
			throw new CancellationError();
		}

		await this.nativeHostService.writeClipboardText(issueBody);

		return baseUrl + `&body=${encodeURIComponent(localize('pasteData', "We have written the needed data into your clipboard because it was too large to send. Please paste."))}`;
	}

	private updateSystemInfo(state: IssueReporterModelData) {
		// eslint-disable-next-line no-restricted-syntax
		const target = this.window.document.querySelector<HTMLElement>('.block-system .block-info');

		if (target) {
			const systemInfo = state.systemInfo!;
			const renderedDataTable = $('table', undefined,
				$('tr', undefined,
					$('td', undefined, 'CPUs'),
					$('td', undefined, systemInfo.cpus || '')
				),
				$('tr', undefined,
					$('td', undefined, 'GPU Status' as string),
					$('td', undefined, Object.keys(systemInfo.gpuStatus).map(key => `${key}: ${systemInfo.gpuStatus[key]}`).join('\n'))
				),
				$('tr', undefined,
					$('td', undefined, 'Load (avg)' as string),
					$('td', undefined, systemInfo.load || '')
				),
				$('tr', undefined,
					$('td', undefined, 'Memory (System)' as string),
					$('td', undefined, systemInfo.memory)
				),
				$('tr', undefined,
					$('td', undefined, 'Process Argv' as string),
					$('td', undefined, systemInfo.processArgs)
				),
				$('tr', undefined,
					$('td', undefined, 'Screen Reader' as string),
					$('td', undefined, systemInfo.screenReader)
				),
				$('tr', undefined,
					$('td', undefined, 'VM'),
					$('td', undefined, systemInfo.vmHint)
				)
			);
			reset(target, renderedDataTable);

			systemInfo.remoteData.forEach(remote => {
				target.appendChild($<HTMLHRElement>('hr'));
				if (isRemoteDiagnosticError(remote)) {
					const remoteDataTable = $('table', undefined,
						$('tr', undefined,
							$('td', undefined, 'Remote'),
							$('td', undefined, remote.hostName)
						),
						$('tr', undefined,
							$('td', undefined, ''),
							$('td', undefined, remote.errorMessage)
						)
					);
					target.appendChild(remoteDataTable);
				} else {
					const remoteDataTable = $('table', undefined,
						$('tr', undefined,
							$('td', undefined, 'Remote'),
							$('td', undefined, remote.latency ? `${remote.hostName} (latency: ${remote.latency.current.toFixed(2)}ms last, ${remote.latency.average.toFixed(2)}ms average)` : remote.hostName)
						),
						$('tr', undefined,
							$('td', undefined, 'OS'),
							$('td', undefined, remote.machineInfo.os)
						),
						$('tr', undefined,
							$('td', undefined, 'CPUs'),
							$('td', undefined, remote.machineInfo.cpus || '')
						),
						$('tr', undefined,
							$('td', undefined, 'Memory (System)' as string),
							$('td', undefined, remote.machineInfo.memory)
						),
						$('tr', undefined,
							$('td', undefined, 'VM'),
							$('td', undefined, remote.machineInfo.vmHint)
						)
					);
					target.appendChild(remoteDataTable);
				}
			});
		}
	}

	private updateRestrictedMode(restrictedMode: boolean) {
		this.issueReporterModel.update({ restrictedMode });
	}

	private updateUnsupportedMode(isUnsupported: boolean) {
		this.issueReporterModel.update({ isUnsupported });
	}

	private updateExperimentsInfo(experimentInfo: string | undefined) {
		this.issueReporterModel.update({ experimentInfo });
		// eslint-disable-next-line no-restricted-syntax
		const target = this.window.document.querySelector<HTMLElement>('.block-experiments .block-info');
		if (target) {
			target.textContent = experimentInfo ? experimentInfo : localize('noCurrentExperiments', "No current experiments.");
		}
	}
}
