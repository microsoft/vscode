/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from '../../../../base/common/network.js';
import { generateUuid } from '../../../../base/common/uuid.js';
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
		const panel = this.webviewWorkbenchService.openWebview(
			{
				title: vm.name,
				options: {},
				contentOptions: {
					allowScripts: true,
					localResourceRoots: [FileAccess.asFileUri(NOVNC_ROOT)],
				},
				extension: undefined,
			},
			'gitcortex.virtualDesktop',
			vm.name,
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
		const cspSource = webviewGenericCspSource;
		const nonce = generateUuid().replace(/-/g, '');
		const connectUrl = JSON.stringify(webSocketUrl);
		const tokenValue = JSON.stringify(token);
		const focusLabel = localize('vm.desktop.focusTarget', "Bureau de la machine virtuelle. Appuyez sur Entrée ou Espace pour interagir.");
		const leaveLabel = localize('vm.desktop.leaveInteraction', "Interaction avec le bureau terminée. Appuyez sur Tab pour continuer.");

		return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${cspSource} ws://127.0.0.1:*; script-src ${cspSource} 'nonce-${nonce}'; style-src ${cspSource} 'nonce-${nonce}'; img-src ${cspSource} data:; font-src ${cspSource};">
	<style nonce="${nonce}">
		html, body {
			height: 100%;
			margin: 0;
			padding: 0;
			overflow: hidden;
			background: var(--vscode-editor-background, var(--vscode-background, transparent));
			color: var(--vscode-editor-foreground, var(--vscode-foreground, inherit));
		}
		#screen { width: 100%; height: 100%; }
		#status {
			position: absolute;
			top: 8px;
			left: 8px;
			padding: 4px 10px;
			font-family: sans-serif;
			font-size: 12px;
			color: var(--vscode-widget-foreground, var(--vscode-editor-foreground, inherit));
			background: var(--vscode-widget-background, var(--vscode-editorWidget-background, transparent));
			border: 1px solid var(--vscode-widget-border, var(--vscode-editorWidget-border, transparent));
			border-radius: 4px;
			z-index: 10;
		}
		#desktop-focus-target {
			position: absolute;
			top: 8px;
			right: 8px;
			z-index: 20;
			padding: 4px 8px;
			font: inherit;
			color: var(--vscode-button-foreground, var(--vscode-editor-foreground, inherit));
			background: var(--vscode-button-background, var(--vscode-editorWidget-background, transparent));
			border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, transparent));
			cursor: pointer;
		}
		#desktop-focus-target:hover { background: var(--vscode-button-hoverBackground, var(--vscode-button-background, transparent)); }
		#desktop-focus-target:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
	</style>
</head>
<body>
	<div id="status" role="status" aria-live="polite">${escapeHtml(localize('vm.desktop.connecting', "Connexion à {0}…", vm.name))}</div>
	<button id="desktop-focus-target" type="button" aria-label="${escapeHtml(focusLabel)}" title="${escapeHtml(focusLabel)}">${escapeHtml(localize('vm.desktop.interact', "Interagir avec le bureau"))}</button>
	<div id="screen" role="application" aria-label="${escapeHtml(localize('vm.desktop.screenLabel', "Bureau distant de {0}", vm.name))}"></div>
	<script type="module" nonce="${nonce}">
		import RFB from ${JSON.stringify(rfbUri.toString(true))};
		const status = document.getElementById('status');
		const focusTarget = document.getElementById('desktop-focus-target');
		const screen = document.getElementById('screen');
		const rfb = new RFB(screen, ${connectUrl}, { wsProtocols: ['binary', ${tokenValue}] });
		rfb.scaleViewport = true;
		rfb.resizeSession = true;
		focusTarget.addEventListener('click', () => { rfb.focus({ preventScroll: true }); focusTarget.blur(); });
		focusTarget.addEventListener('keydown', event => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				rfb.focus({ preventScroll: true });
				focusTarget.blur();
			}
		});
		document.addEventListener('keydown', event => {
			if (event.key === 'Escape') {
				rfb.blur();
				focusTarget.focus({ preventScroll: true });
				status.style.display = '';
				status.textContent = ${JSON.stringify(leaveLabel)};
			}
		});
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
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
