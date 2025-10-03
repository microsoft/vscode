/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { INativeOpenFileRequest } from '../../../../platform/window/common/window.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { registerRemoteContributions } from './terminalRemote.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ITerminalService } from '../browser/terminal.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { disposableWindowInterval, getActiveWindow } from '../../../../base/browser/dom.js';

export class TerminalNativeContribution extends Disposable implements IWorkbenchContribution {
	declare _serviceBrand: undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@INativeHostService nativeHostService: INativeHostService
	) {
		super();

		ipcRenderer.on('vscode:openFiles', (_: unknown, request: INativeOpenFileRequest) => { this._onOpenFileRequest(request); });
		this._register(nativeHostService.onDidResumeOS(() => this._onOsResume()));

		this._terminalService.setNativeDelegate({
			getWindowCount: () => nativeHostService.getWindowCount()
		});

		const connection = remoteAgentService.getConnection();
		if (connection && connection.remoteAuthority) {
			registerRemoteContributions();
		}
	}

	private _onOsResume(): void {
		for (const instance of this._terminalService.instances) {
			instance.xterm?.forceRedraw();
		}
	}

	private async _onOpenFileRequest(request: INativeOpenFileRequest): Promise<void> {
		// if the request to open files is coming in from the integrated terminal (identified though
		// the termProgram variable) and we are instructed to wait for editors close, wait for the
		// marker file to get deleted and then focus back to the integrated terminal.
		if (request.termProgram === 'vscode' && request.filesToWait) {
			const waitMarkerFileUri = URI.revive(request.filesToWait.waitMarkerFileUri);
			await this._whenFileDeleted(waitMarkerFileUri);

			// Focus active terminal
			this._terminalService.activeInstance?.focus();
		}
	}

	private _whenFileDeleted(path: URI): Promise<void> {
		// Complete when wait marker file is deleted
		return new Promise<void>(resolve => {
			let running = false;
			const interval = disposableWindowInterval(getActiveWindow(), async () => {
				if (!running) {
					running = true;
					const exists = await this._fileService.exists(path);
					running = false;

					if (!exists) {
						interval.dispose();
						resolve(undefined);
					}
				}
			}, 1000);
		});
	}
}
