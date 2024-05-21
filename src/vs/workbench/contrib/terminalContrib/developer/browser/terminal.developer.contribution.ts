/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { Delayer } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, combinedDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/developer';
import { localize, localize2 } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IFileService } from 'vs/platform/files/common/files';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ITerminalCommand, TerminalCapability, type ICommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalLogService, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IInternalXtermTerminal, ITerminalContribution, ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { TerminalDeveloperCommandId } from 'vs/workbench/contrib/terminalContrib/developer/common/terminal.developer';
import { IStatusbarService, StatusbarAlignment, type IStatusbarEntry, type IStatusbarEntryAccessor } from 'vs/workbench/services/statusbar/browser/statusbar';

registerTerminalAction({
	id: TerminalDeveloperCommandId.ShowTextureAtlas,
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
	id: TerminalDeveloperCommandId.WriteDataToTerminal,
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
	id: TerminalDeveloperCommandId.RecordSession,
	title: localize2('workbench.action.terminal.recordSession', 'Record Terminal Session'),
	category: Categories.Developer,
	run: async (c, accessor) => {
		const clipboardService = accessor.get(IClipboardService);
		const commandService = accessor.get(ICommandService);
		const statusbarService = accessor.get(IStatusbarService);
		const store = new DisposableStore();

		// Set up status bar entry
		const text = localize('workbench.action.terminal.recordSession.recording', "Recording terminal session...");
		const statusbarEntry: IStatusbarEntry = {
			text,
			name: text,
			ariaLabel: text,
			showProgress: 'loading'
		};
		const statusbarHandle = statusbarService.addEntry(statusbarEntry, 'recordSession', StatusbarAlignment.LEFT);
		store.add(statusbarHandle);

		// Create, reveal and focus instance
		const instance = await c.service.createTerminal();
		c.service.setActiveInstance(instance);
		await c.service.revealActiveTerminal();
		await Promise.all([
			instance.processReady,
			instance.focusWhenReady(true)
		]);

		// Record session
		return new Promise<void>(resolve => {
			const events: unknown[] = [];
			const endRecording = () => {
				const session = JSON.stringify(events, null, 2);
				clipboardService.writeText(session);
				store.dispose();
				resolve();
			};


			const timer = store.add(new Delayer(5000));
			store.add(Event.runAndSubscribe(instance.onDimensionsChanged, () => {
				events.push({
					type: 'resize',
					cols: instance.cols,
					rows: instance.rows
				});
				timer.trigger(endRecording);
			}));
			store.add(commandService.onWillExecuteCommand(e => {
				events.push({
					type: 'command',
					id: e.commandId,
				});
				timer.trigger(endRecording);
			}));
			store.add(instance.onWillData(data => {
				events.push({
					type: 'output',
					data,
				});
				timer.trigger(endRecording);
			}));
			store.add(instance.onDidSendText(data => {
				events.push({
					type: 'sendText',
					data,
				});
				timer.trigger(endRecording);
			}));
			store.add(instance.xterm!.raw.onData(data => {
				events.push({
					type: 'input',
					data,
				});
				timer.trigger(endRecording);
			}));
			let commandDetectedRegistered = false;
			store.add(Event.runAndSubscribe(instance.capabilities.onDidAddCapability, e => {
				if (commandDetectedRegistered) {
					return;
				}
				const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
				if (!commandDetection) {
					return;
				}
				store.add(commandDetection.promptInputModel.onDidChangeInput(e => {
					events.push({
						type: 'promptInputChange',
						data: commandDetection.promptInputModel.getCombinedString(),
					});
					timer.trigger(endRecording);
				}));
				commandDetectedRegistered = true;
			}));
		});

	}
});

registerTerminalAction({
	id: TerminalDeveloperCommandId.RestartPtyHost,
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
	private readonly _activeDevModeDisposables = new MutableDisposable();
	private _currentColor = 0;

	private _statusbarEntry: IStatusbarEntry | undefined;
	private readonly _statusbarEntryAccessor: MutableDisposable<IStatusbarEntryAccessor> = this._register(new MutableDisposable());

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
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

		const commandDetection = this._instance.capabilities.get(TerminalCapability.CommandDetection);
		if (devMode) {
			if (commandDetection) {
				const commandDecorations = new Map<ITerminalCommand, IDisposable[]>();
				this._activeDevModeDisposables.value = combinedDisposable(
					// Prompt input
					this._instance.onDidBlur(() => this._updateDevMode()),
					this._instance.onDidFocus(() => this._updateDevMode()),
					commandDetection.promptInputModel.onDidChangeInput(() => this._updateDevMode()),
					// Sequence markers
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

				this._updatePromptInputStatusBar(commandDetection);
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

	private _updatePromptInputStatusBar(commandDetection: ICommandDetectionCapability) {
		const promptInputModel = commandDetection.promptInputModel;
		if (promptInputModel) {
			const name = localize('terminalDevMode', 'Terminal Dev Mode');
			const isExecuting = promptInputModel.cursorIndex === -1;
			this._statusbarEntry = {
				name,
				text: `$(${isExecuting ? 'loading~spin' : 'terminal'}) ${promptInputModel.getCombinedString()}`,
				ariaLabel: name,
				tooltip: 'The detected terminal prompt input',
				kind: 'prominent'
			};
			if (!this._statusbarEntryAccessor.value) {
				this._statusbarEntryAccessor.value = this._statusbarService.addEntry(this._statusbarEntry, `terminal.promptInput.${this._instance.instanceId}`, StatusbarAlignment.LEFT);
			} else {
				this._statusbarEntryAccessor.value.update(this._statusbarEntry);
			}
			this._statusbarService.updateEntryVisibility(`terminal.promptInput.${this._instance.instanceId}`, this._instance.hasFocus);
		}
	}
}

registerTerminalContribution(DevModeContribution.ID, DevModeContribution);
