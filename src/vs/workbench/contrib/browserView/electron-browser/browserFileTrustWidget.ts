/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { dirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import type { IBrowserViewLoadError } from '../../../../platform/browserView/common/browserView.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { MANAGE_TRUST_COMMAND_ID } from '../../workspace/common/workspace.js';
import type { IBrowserViewModel } from '../common/browserView.js';

/** Workspace Trust recovery for a native file navigation denied by main. */
export class BrowserFileTrustWidget extends Disposable {
	readonly element = $('.browser-error-container.browser-file-trust-container');
	private readonly contentStore = this._register(new DisposableStore());
	private model: IBrowserViewModel | undefined;
	private error: IBrowserViewLoadError | undefined;
	private url = '';
	private loading = false;
	private generation = 0;
	private buttons: Button[] = [];

	constructor(
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.element.style.display = 'none';
		this.element.setAttribute('role', 'group');
		this.element.setAttribute('aria-label', localize('browser.fileAccessBlocked', "File Access Blocked"));
	}

	update(model: IBrowserViewModel | undefined): void {
		const error = model?.error?.fileAccessDenied ? model.error : undefined;
		const url = model?.url ?? '';
		const loading = model?.loading ?? false;
		if (model === this.model && error === this.error && url === this.url && loading === this.loading) {
			return;
		}
		this.generation++;
		this.contentStore.clear();
		this.buttons = [];
		this.element.replaceChildren();
		this.model = model;
		this.error = error;
		this.url = url;
		this.loading = loading;
		this.element.style.display = 'none';
		if (!model || !error) {
			return;
		}
		const resource = URI.parse(error.url);
		if (resource.scheme !== Schemas.file) {
			return;
		}
		const folder = dirname(resource.with({ query: null, fragment: null }));
		const content = $('.browser-error-content');
		const title = $('.browser-error-title');
		title.textContent = localize('browser.fileAccessBlocked', "File Access Blocked");
		const detail = $('.browser-error-detail');
		detail.textContent = localize('browser.fileAccessBlockedDetail', "This local file is not in a trusted folder. Review Workspace Trust or leave it blocked.");
		const path = $('.browser-error-detail');
		const pathValue = $('code');
		pathValue.textContent = folder.fsPath;
		path.appendChild(pathValue);
		content.append(title, detail, path);
		if (model.presentation) {
			const executionDetail = $('.browser-error-detail');
			executionDetail.textContent = localize('browser.fileAccessExecutionApproval', "Approving an extension to run does not grant local file access.");
			content.appendChild(executionDetail);
		}
		const generation = this.generation;
		const addButton = (label: string, secondary: boolean, action: () => Promise<void>) => {
			const container = $('.browser-error-detail');
			const button = this.contentStore.add(new Button(container, { ...defaultButtonStyles, secondary }));
			button.label = label;
			button.enabled = !loading;
			this.buttons.push(button);
			this.contentStore.add(button.onDidClick(() => void this.run(model, error, generation, action)));
			content.appendChild(container);
		};
		addButton(localize('browser.trustFileFolder', "Trust Folder..."), false, async () => {
			const trusted = await this.workspaceTrustRequestService.requestResourcesTrust({
				uri: folder,
				message: localize('browser.trustFileFolderMessage', "The integrated browser can load local files only from trusted folders. Trusting this folder applies to Workspace Trust throughout VS Code, not just this page."),
			});
			if (trusted && this.isCurrent(model, error, generation) && !model.loading) {
				await model.loadURL(error.url);
			}
		});
		addButton(localize('browser.manageFileTrust', "Manage Workspace Trust"), true, async () => {
			await this.commandService.executeCommand(MANAGE_TRUST_COMMAND_ID);
		});
		addButton(localize('browser.reloadTrustedFile', "Reload"), true, async () => {
			await model.loadURL(error.url);
		});
		this.element.appendChild(content);
		this.element.style.display = '';
	}

	focus(): boolean {
		const button = this.buttons.find(button => button.enabled);
		if (!button) {
			return false;
		}
		button.focus();
		return true;
	}

	private isCurrent(model: IBrowserViewModel, error: IBrowserViewLoadError, generation: number): boolean {
		return !this._store.isDisposed && this.model === model && this.error === error && this.generation === generation;
	}

	private async run(model: IBrowserViewModel, error: IBrowserViewLoadError, generation: number, action: () => Promise<void>): Promise<void> {
		if (!this.isCurrent(model, error, generation) || model.loading) {
			return;
		}
		for (const button of this.buttons) {
			button.enabled = false;
		}
		try {
			await action();
		} catch (failure) {
			this.logService.error('Browser file trust operation failed.', failure);
			if (this.isCurrent(model, error, generation)) {
				this.notificationService.error(localize('browser.fileTrustOperationFailed', "The file could not be reopened. Review Workspace Trust and try Reload again."));
			}
		} finally {
			if (this.isCurrent(model, error, generation)) {
				for (const button of this.buttons) {
					button.enabled = !model.loading;
				}
			}
		}
	}
}
