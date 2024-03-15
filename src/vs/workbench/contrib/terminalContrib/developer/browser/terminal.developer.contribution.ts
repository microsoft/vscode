/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/developer';
import { VSBuffer } from 'vs/base/common/buffer';
import { Disposable, IDisposable, MutableDisposable, combinedDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { localize, localize2 } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IFileService } from 'vs/platform/files/common/files';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ITerminalLogService, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IInternalXtermTerminal, ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import type { Terminal } from '@xterm/xterm';
import { ITerminalCommand, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { getWindow } from 'vs/base/browser/dom';

registerTerminalAction({
	id: TerminalCommandId.ShowTextureAtlas,
	title: localize2('workbench.action.terminal.showTextureAtlas', 'Show Terminal Texture Atlas'),
	category: Categories.Developer,
	precondition: ContextKeyExpr.or(TerminalContextKeys.isOpen),
	run: async (c, accessor) => {
		const fileService = accessor.get(IFileService);
		const openerService = accessor.get(IOpenerService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const bitmap = await c.service.activeInstance?.xterm?.textureAtlas;
		if (!bitmap) {
			return;
		}
		const cwdUri = workspaceContextService.getWorkspace().folders[0].uri;
		const fileUri = URI.joinPath(cwdUri, 'textureAtlas.png');
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const ctx = canvas.getContext('bitmaprenderer');
		if (!ctx) {
			return;
		}
		ctx.transferFromImageBitmap(bitmap);
		const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res));
		if (!blob) {
			return;
		}
		await fileService.writeFile(fileUri, VSBuffer.wrap(new Uint8Array(await blob.arrayBuffer())));
		openerService.open(fileUri);
	}
});

registerTerminalAction({
	id: TerminalCommandId.WriteDataToTerminal,
	title: localize2('workbench.action.terminal.writeDataToTerminal', 'Write Data to Terminal'),
	category: Categories.Developer,
	run: async (c, accessor) => {
		const quickInputService = accessor.get(IQuickInputService);
		const instance = await c.service.getActiveOrCreateInstance();
		await c.service.revealActiveTerminal();
		await instance.processReady;
		if (!instance.xterm) {
			throw new Error('Cannot write data to terminal if xterm isn\'t initialized');
		}
		const data = await quickInputService.input({
			value: '',
			placeHolder: 'Enter data, use \\x to escape',
			prompt: localize('workbench.action.terminal.writeDataToTerminal.prompt', "Enter data to write directly to the terminal, bypassing the pty"),
		});
		if (!data) {
			return;
		}
		let escapedData = data
			.replace(/\\n/g, '\n')
			.replace(/\\r/g, '\r');
		while (true) {
			const match = escapedData.match(/\\x([0-9a-fA-F]{2})/);
			if (match === null || match.index === undefined || match.length < 2) {
				break;
			}
			escapedData = escapedData.slice(0, match.index) + String.fromCharCode(parseInt(match[1], 16)) + escapedData.slice(match.index + 4);
		}
		const xterm = instance.xterm as any as IInternalXtermTerminal;
		xterm._writeText(escapedData);
	}
});


registerTerminalAction({
	id: TerminalCommandId.RestartPtyHost,
	title: localize2('workbench.action.terminal.restartPtyHost', 'Restart Pty Host'),
	category: Categories.Developer,
	run: async (c, accessor) => {
		const logService = accessor.get(ITerminalLogService);
		const backends = Array.from(c.instanceService.getRegisteredBackends());
		const unresponsiveBackends = backends.filter(e => !e.isResponsive);
		// Restart only unresponsive backends if there are any
		const restartCandidates = unresponsiveBackends.length > 0 ? unresponsiveBackends : backends;
		for (const backend of restartCandidates) {
			logService.warn(`Restarting pty host for authority "${backend.remoteAuthority}"`);
			backend.restartPtyHost();
		}
	}
});

class DevModeContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.devMode';
	static get(instance: ITerminalInstance): DevModeContribution | null {
		return instance.getContribution<DevModeContribution>(DevModeContribution.ID);
	}

	private _xterm: IXtermTerminal & { raw: Terminal } | undefined;
	private _activeDevModeDisposables = new MutableDisposable();
	private _currentColor = 0;

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.DevMode)) {
				this._updateDevMode();
			}
		}));
	}

	xtermReady(xterm: IXtermTerminal & { raw: Terminal }): void {
		this._xterm = xterm;
		this._updateDevMode();
	}

	private _updateDevMode() {
		const devMode: boolean = this._isEnabled();
		this._xterm?.raw.element?.classList.toggle('dev-mode', devMode);

		// Text area syncing
		if (this._xterm?.raw.textarea) {
			const font = this._terminalService.configHelper.getFont(getWindow(this._xterm.raw.textarea));
			this._xterm.raw.textarea.style.fontFamily = font.fontFamily;
			this._xterm.raw.textarea.style.fontSize = `${font.fontSize}px`;
		}

		// Sequence markers
		const commandDetection = this._instance.capabilities.get(TerminalCapability.CommandDetection);
		if (devMode) {
			if (commandDetection) {
				const commandDecorations = new Map<ITerminalCommand, IDisposable[]>();
				this._activeDevModeDisposables.value = combinedDisposable(
					commandDetection.onCommandFinished(command => {
						const colorClass = `color-${this._currentColor}`;
						const decorations: IDisposable[] = [];
						commandDecorations.set(command, decorations);
						if (command.promptStartMarker) {
							const d = this._instance.xterm!.raw?.registerDecoration({
								marker: command.promptStartMarker
							});
							if (d) {
								decorations.push(d);
								d.onRender(e => {
									e.textContent = 'A';
									e.classList.add('xterm-sequence-decoration', 'top', 'left', colorClass);
								});
							}
						}
						if (command.marker) {
							const d = this._instance.xterm!.raw?.registerDecoration({
								marker: command.marker,
								x: command.startX
							});
							if (d) {
								decorations.push(d);
								d.onRender(e => {
									e.textContent = 'B';
									e.classList.add('xterm-sequence-decoration', 'top', 'right', colorClass);
								});
							}
						}
						if (command.executedMarker) {
							const d = this._instance.xterm!.raw?.registerDecoration({
								marker: command.executedMarker,
								x: command.executedX
							});
							if (d) {
								decorations.push(d);
								d.onRender(e => {
									e.textContent = 'C';
									e.classList.add('xterm-sequence-decoration', 'bottom', 'left', colorClass);
								});
							}
						}
						if (command.endMarker) {
							const d = this._instance.xterm!.raw?.registerDecoration({
								marker: command.endMarker
							});
							if (d) {
								decorations.push(d);
								d.onRender(e => {
									e.textContent = 'D';
									e.classList.add('xterm-sequence-decoration', 'bottom', 'right', colorClass);
								});
							}
						}
						this._currentColor = (this._currentColor + 1) % 2;
					}),
					commandDetection.onCommandInvalidated(commands => {
						for (const c of commands) {
							const decorations = commandDecorations.get(c);
							if (decorations) {
								dispose(decorations);
							}
							commandDecorations.delete(c);
						}
					})
				);
			} else {
				this._activeDevModeDisposables.value = this._instance.capabilities.onDidAddCapabilityType(e => {
					if (e === TerminalCapability.CommandDetection) {
						this._updateDevMode();
					}
				});
			}
		} else {
			this._activeDevModeDisposables.clear();
		}
	}

	private _isEnabled(): boolean {
		return this._configurationService.getValue(TerminalSettingId.DevMode) || false;
	}
}

registerTerminalContribution(DevModeContribution.ID, DevModeContribution);
