/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductService } from '../../../../platform/product/common/productService.js';
import { Action } from '../../../../base/common/actions.js';
import { IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { URI } from '../../../../base/common/uri.js';
import { IExtensionHostProfile } from '../../../services/extensions/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IRequestService, asText } from '../../../../platform/request/common/request.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { Utils } from '../../../../platform/profiling/common/profiling.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IRequestContext } from '../../../../base/parts/request/common/request.js';

abstract class RepoInfo {
	abstract get base(): string;
	abstract get owner(): string;
	abstract get repo(): string;

	static fromExtension(desc: IExtensionDescription): RepoInfo | undefined {

		let result: RepoInfo | undefined;

		// scheme:auth/OWNER/REPO/issues/
		if (desc.bugs && typeof desc.bugs.url === 'string') {
			const base = URI.parse(desc.bugs.url);
			const match = /\/([^/]+)\/([^/]+)\/issues\/?$/.exec(desc.bugs.url);
			if (match) {
				result = {
					base: base.with({ path: null, fragment: null, query: null }).toString(true),
					owner: match[1],
					repo: match[2]
				};
			}
		}
		// scheme:auth/OWNER/REPO.git
		if (!result && desc.repository && typeof desc.repository.url === 'string') {
			const base = URI.parse(desc.repository.url);
			const match = /\/([^/]+)\/([^/]+)(\.git)?$/.exec(desc.repository.url);
			if (match) {
				result = {
					base: base.with({ path: null, fragment: null, query: null }).toString(true),
					owner: match[1],
					repo: match[2]
				};
			}
		}

		// for now only GH is supported
		if (result && result.base.indexOf('github') === -1) {
			result = undefined;
		}

		return result;
	}
}

export class SlowExtensionAction extends Action {

	constructor(
		readonly extension: IExtensionDescription,
		readonly profile: IExtensionHostProfile,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super('report.slow', localize('cmd.reportOrShow', "Performance Issue"), 'extension-action report-issue');
		this.enabled = Boolean(RepoInfo.fromExtension(extension));
	}

	override async run(): Promise<void> {
		const action = await this._instantiationService.invokeFunction(createSlowExtensionAction, this.extension, this.profile);
		if (action) {
			await action.run();
		}
	}
}

export async function createSlowExtensionAction(
	accessor: ServicesAccessor,
	extension: IExtensionDescription,
	profile: IExtensionHostProfile
): Promise<Action | undefined> {

	const info = RepoInfo.fromExtension(extension);
	if (!info) {
		return undefined;
	}

	const requestService = accessor.get(IRequestService);
	const instaService = accessor.get(IInstantiationService);
	const url = `https://api.github.com/search/issues?q=is:issue+state:open+in:title+repo:${info.owner}/${info.repo}+%22Extension+causes+high+cpu+load%22`;
	let res: IRequestContext;
	try {
		res = await requestService.request({ url }, CancellationToken.None);
	} catch {
		return undefined;
	}
	const rawText = await asText(res);
	if (!rawText) {
		return undefined;
	}

	const data = <{ total_count: number }>JSON.parse(rawText);
	if (!data || typeof data.total_count !== 'number') {
		return undefined;
	} else if (data.total_count === 0) {
		return instaService.createInstance(ReportExtensionSlowAction, extension, info, profile);
	} else {
		return instaService.createInstance(ShowExtensionSlowAction, extension, info, profile);
	}
}

class ReportExtensionSlowAction extends Action {

	constructor(
		readonly extension: IExtensionDescription,
		readonly repoInfo: RepoInfo,
		readonly profile: IExtensionHostProfile,
		@IDialogService private readonly _dialogService: IDialogService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IProductService private readonly _productService: IProductService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@INativeWorkbenchEnvironmentService private readonly _environmentService: INativeWorkbenchEnvironmentService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super('report.slow', localize('cmd.report', "Report Issue"));
	}

	override async run(): Promise<void> {

		// rewrite pii (paths) and store on disk
		const data = Utils.rewriteAbsolutePaths(this.profile.data, 'pii_removed');
		const path = joinPath(this._environmentService.tmpDir, `${this.extension.identifier.value}-unresponsive.cpuprofile.txt`);
		await this._fileService.writeFile(path, VSBuffer.fromString(JSON.stringify(data, undefined, 4)));

		// build issue
		const os = await this._nativeHostService.getOSProperties();
		const title = encodeURIComponent('Extension causes high cpu load');
		const osVersion = `${os.type} ${os.arch} ${os.release}`;
		const message = `:warning: Make sure to **attach** this file from your *home*-directory:\n:warning:\`${path}\`\n\nFind more details here: https://github.com/microsoft/vscode/wiki/Explain-extension-causes-high-cpu-load`;
		const body = encodeURIComponent(`- Issue Type: \`Performance\`
- Extension Name: \`${this.extension.name}\`
- Extension Version: \`${this.extension.version}\`
- OS Version: \`${osVersion}\`
- VS Code version: \`${this._productService.version}\`\n\n${message}`);

		const url = `${this.repoInfo.base}/${this.repoInfo.owner}/${this.repoInfo.repo}/issues/new/?body=${body}&title=${title}`;
		this._openerService.open(URI.parse(url));

		this._dialogService.info(
			localize('attach.title', "Did you attach the CPU-Profile?"),
			localize('attach.msg', "This is a reminder to make sure that you have not forgotten to attach '{0}' to the issue you have just created.", path.fsPath)
		);
	}
}

class ShowExtensionSlowAction extends Action {

	constructor(
		readonly extension: IExtensionDescription,
		readonly repoInfo: RepoInfo,
		readonly profile: IExtensionHostProfile,
		@IDialogService private readonly _dialogService: IDialogService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@INativeWorkbenchEnvironmentService private readonly _environmentService: INativeWorkbenchEnvironmentService,
		@IFileService private readonly _fileService: IFileService,

	) {
		super('show.slow', localize('cmd.show', "Show Issues"));
	}

	override async run(): Promise<void> {

		// rewrite pii (paths) and store on disk
		const data = Utils.rewriteAbsolutePaths(this.profile.data, 'pii_removed');
		const path = joinPath(this._environmentService.tmpDir, `${this.extension.identifier.value}-unresponsive.cpuprofile.txt`);
		await this._fileService.writeFile(path, VSBuffer.fromString(JSON.stringify(data, undefined, 4)));

		// show issues
		const url = `${this.repoInfo.base}/${this.repoInfo.owner}/${this.repoInfo.repo}/issues?utf8=✓&q=is%3Aissue+state%3Aopen+%22Extension+causes+high+cpu+load%22`;
		this._openerService.open(URI.parse(url));

		this._dialogService.info(
			localize('attach.title', "Did you attach the CPU-Profile?"),
			localize('attach.msg2', "This is a reminder to make sure that you have not forgotten to attach '{0}' to an existing performance issue.", path.fsPath)
		);
	}
}
