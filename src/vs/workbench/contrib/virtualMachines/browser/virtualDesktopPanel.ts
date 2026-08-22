/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from '../../../../base/common/network.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IVirtualMachineInfo, IVirtualMachinesService } from '../../../../platform/virtualMachines/common/virtualMachines.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IWebviewWorkbenchService } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { asWebviewUri, webviewGenericCspSource } from '../../webview/common/webview.js';
import { WebviewInput } from '../../webviewPanel/browser/webviewEditorInput.js';
import { Codicon } from '../../../../base/common/codicons.js';

export const IVirtualDesktopOpener = createDecorator<IVirtualDesktopOpener>('virtualDesktopOpener');

export interface IVirtualDesktopOpener {
	readonly _serviceBrand: undefined;
	openDesktop(vm: IVirtualMachineInfo): Promise<void>;
}

const NOVNC_ROOT = 'vs/workbench/contrib/virtualMachines/browser/media/novnc';

/**
 * Opens a live graphical console of a virtual machine in an editor webview,
 * using the vendored noVNC client connected to the loopback VNC proxy.
 */
export class VirtualDesktopOpener extends Disposable implements IVirtualDesktopOpener {

	declare readonly _serviceBrand: undefined;

	private readonly panels = new Map<string, WebviewInput>();

	constructor(
		@IVirtualMachinesService private readonly virtualMachinesService: IVirtualMachinesService,
		@IWebviewWorkbenchService private readonly webviewWorkbenchService: IWebviewWorkbenchService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
	}

	async openDesktop(vm: IVirtualMachineInfo): Promise<void> {
		const existing = this.panels.get(vm.id);
		if (existing) {
			this.webviewWorkbenchService.revealWebview(existing, this.editorGroup(), false);
			return;
		}

		const display = await this.virtualMachinesService.openDisplay(vm.id);

		const title = vm.name;
		const panel = this.webviewWorkbenchService.openWebview(
			{
				title,
				options: {},
				contentOptions: {
					allowScripts: true,
					localResourceRoots: [FileAccess.asFileUri(NOVNC_ROOT)],
				},
				extension: undefined,
			},
			'gitcortex.virtualDesktop',
			title,
			Codicon.vm,
			{ group: this.editorGroup(), preserveFocus: false },
		);
		this.panels.set(vm.id, panel);
		panel.onWillDispose(() => this.panels.delete(vm.id));

		panel.webview.setHtml(this.renderHtml(panel, vm, display.webSocketUrl, display.token));
	}

	private editorGroup() {
		return this.editorService.activeEditorPane?.group ?? ACTIVE_GROUP;
	}

	private renderHtml(panel: WebviewInput, vm: IVirtualMachineInfo, webSocketUrl: string, token: string): string {
		const rfbUri = asWebviewUri(FileAccess.asFileUri(`${NOVNC_ROOT}/core/rfb.js`));
		// 'unsafe-inline' is required for the small bootstrap module script and
		// styles below; the noVNC library itself loads from the app origin.
		const cspSource = `${webviewGenericCspSource} 'unsafe-inline'`;

		return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${cspSource} ws://127.0.0.1:*; script-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; font-src ${cspSource};">
	<style>
		html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; background: #1e1e1e; }
		#screen { width: 100%; height: 100%; }
		#status { position: absolute; top: 8px; left: 8px; padding: 4px 10px; font-family: sans-serif; font-size: 12px; color: #fff; background: rgba(0,0,0,0.6); border-radius: 4px; z-index: 10; }
	</style>
</head>
<body>
	<div id="status">${escapeHtml(localize('vm.desktop.connecting', "Connexion à {0}…", vm.name))}</div>
	<div id="screen"></div>
	<script type="module">
		import RFB from '${rfbUri.toString(true)}';
		const status = document.getElementById('status');
		const rfb = new RFB(document.getElementById('screen'), ${JSON.stringify(webSocketUrl)}, { wsProtocols: ['binary', ${JSON.stringify(token)}] });
		rfb.scaleViewport = true;
		rfb.resizeSession = true;
		rfb.addEventListener('connect', () => { status.style.display = 'none'; });
		rfb.addEventListener('disconnect', e => {
			status.style.display = '';
			status.textContent = e.detail.clean
				? ${JSON.stringify(localize('vm.desktop.disconnected', "Session terminée."))}
				: ${JSON.stringify(localize('vm.desktop.lost', "Connexion perdue avec la machine virtuelle."))};
		});
		rfb.addEventListener('securityfailure', e => {
			status.style.display = '';
			status.textContent = 'VNC security failure: ' + (e.detail.reason || e.detail.status);
		});
	</script>
</body>
</html>`;
	}
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
