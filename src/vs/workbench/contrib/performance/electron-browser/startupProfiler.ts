/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../common/contributions.js';
import { localize } from '../../../../nls.js';
import { dirname, basename } from '../../../../base/common/resources.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { PerfviewContrib } from '../browser/perfviewEditor.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { URI } from '../../../../base/common/uri.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';

export class StartupProfiler implements IWorkbenchContribution {

	constructor(
		@IDialogService private readonly _dialogService: IDialogService,
		@INativeWorkbenchEnvironmentService private readonly _environmentService: INativeWorkbenchEnvironmentService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IExtensionService extensionService: IExtensionService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IProductService private readonly _productService: IProductService,
		@IFileService private readonly _fileService: IFileService,
		@ILabelService private readonly _labelService: ILabelService,
	) {
		// wait for everything to be ready
		Promise.all([
			lifecycleService.when(LifecyclePhase.Eventually),
			extensionService.whenInstalledExtensionsRegistered()
		]).then(() => {
			this._stopProfiling();
		});
	}

	private _stopProfiling(): void {

		if (!this._environmentService.args['prof-startup-prefix']) {
			return;
		}
		const profileFilenamePrefix = URI.file(this._environmentService.args['prof-startup-prefix']);

		const dir = dirname(profileFilenamePrefix);
		const prefix = basename(profileFilenamePrefix);

		const removeArgs: string[] = ['--prof-startup'];
		const markerFile = this._fileService.readFile(profileFilenamePrefix).then(value => removeArgs.push(...value.toString().split('|')))
			.then(() => this._fileService.del(profileFilenamePrefix, { recursive: true })) // (1) delete the file to tell the main process to stop profiling
			.then(() => new Promise<void>(resolve => { // (2) wait for main that recreates the fail to signal profiling has stopped
				const check = () => {
					this._fileService.exists(profileFilenamePrefix).then(exists => {
						if (exists) {
							resolve();
						} else {
							setTimeout(check, 500);
						}
					});
				};
				check();
			}))
			.then(() => this._fileService.del(profileFilenamePrefix, { recursive: true })); // (3) finally delete the file again

		markerFile.then(() => {
			return this._fileService.resolve(dir).then(stat => {
				return (stat.children ? stat.children.filter(value => value.resource.path.includes(prefix)) : []).map(stat => stat.resource);
			});
		}).then(files => {
			const profileFiles = files.reduce((prev, cur) => `${prev}${this._labelService.getUriLabel(cur)}\n`, '\n');

			return this._dialogService.confirm({
				type: 'info',
				message: localize('prof.message', "Successfully created profiles."),
				detail: localize('prof.detail', "Please create an issue and manually attach the following files:\n{0}", profileFiles),
				primaryButton: localize({ key: 'prof.restartAndFileIssue', comment: ['&& denotes a mnemonic'] }, "&&Create Issue and Restart"),
				cancelButton: localize('prof.restart', "Restart")
			}).then(res => {
				if (res.confirmed) {
					Promise.all<any>([
						this._nativeHostService.showItemInFolder(files[0].fsPath),
						this._createPerfIssue(files.map(file => basename(file)))
					]).then(() => {
						// keep window stable until restart is selected
						return this._dialogService.confirm({
							type: 'info',
							message: localize('prof.thanks', "Thanks for helping us."),
							detail: localize('prof.detail.restart', "A final restart is required to continue to use '{0}'. Again, thank you for your contribution.", this._productService.nameLong),
							primaryButton: localize({ key: 'prof.restart.button', comment: ['&& denotes a mnemonic'] }, "&&Restart")
						}).then(res => {
							// now we are ready to restart
							if (res.confirmed) {
								this._nativeHostService.relaunch({ removeArgs });
							}
						});
					});

				} else {
					// simply restart
					this._nativeHostService.relaunch({ removeArgs });
				}
			});
		});
	}

	private async _createPerfIssue(files: string[]): Promise<void> {
		const reportIssueUrl = this._productService.reportIssueUrl;
		if (!reportIssueUrl) {
			return;
		}

		const contrib = PerfviewContrib.get();
		const ref = await this._textModelResolverService.createModelReference(contrib.getInputUri());
		try {
			await this._clipboardService.writeText(ref.object.textEditorModel.getValue());
		} finally {
			ref.dispose();
		}

		const body = `
1. :warning: We have copied additional data to your clipboard. Make sure to **paste** here. :warning:
1. :warning: Make sure to **attach** these files from your *home*-directory: :warning:\n${files.map(file => `-\`${file}\``).join('\n')}
`;

		const baseUrl = reportIssueUrl;
		const queryStringPrefix = baseUrl.indexOf('?') === -1 ? '?' : '&';

		this._openerService.open(URI.parse(`${baseUrl}${queryStringPrefix}body=${encodeURIComponent(body)}`));
	}
}
