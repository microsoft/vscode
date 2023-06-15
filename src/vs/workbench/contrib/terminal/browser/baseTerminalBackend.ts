/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { withNullAsUndefined } from 'vs/base/common/types';
import { localize } from 'vs/nls';
import { ILogService } from 'vs/platform/log/common/log';
import { ICrossVersionSerializedTerminalState, IPtyHostController, ISerializedTerminalState } from 'vs/platform/terminal/common/terminal';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { STATUS_BAR_WARNING_ITEM_BACKGROUND, STATUS_BAR_WARNING_ITEM_FOREGROUND } from 'vs/workbench/common/theme';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';

export abstract class BaseTerminalBackend extends Disposable {
	private _isPtyHostUnresponsive: boolean = false;

	get isResponsive(): boolean { return !this._isPtyHostUnresponsive; }

	protected readonly _onPtyHostRestart = this._register(new Emitter<void>());
	readonly onPtyHostRestart = this._onPtyHostRestart.event;
	protected readonly _onPtyHostUnresponsive = this._register(new Emitter<void>());
	readonly onPtyHostUnresponsive = this._onPtyHostUnresponsive.event;
	protected readonly _onPtyHostResponsive = this._register(new Emitter<void>());
	readonly onPtyHostResponsive = this._onPtyHostResponsive.event;

	constructor(
		private readonly _ptyHostController: IPtyHostController,
		protected readonly _logService: ILogService,
		historyService: IHistoryService,
		configurationResolverService: IConfigurationResolverService,
		statusBarService: IStatusbarService,
		protected readonly _workspaceContextService: IWorkspaceContextService
	) {
		super();

		let unresponsiveStatusBarEntry: IStatusbarEntry;
		let statusBarAccessor: IStatusbarEntryAccessor;

		// Attach pty host listeners
		if (this._ptyHostController.onPtyHostExit) {
			this._register(this._ptyHostController.onPtyHostExit(() => {
				this._logService.error(`The terminal's pty host process exited, the connection to all terminal processes was lost`);
			}));
		}
		if (this._ptyHostController.onPtyHostStart) {
			this._register(this._ptyHostController.onPtyHostStart(() => {
				this._onPtyHostRestart.fire();
				statusBarAccessor?.dispose();
				this._isPtyHostUnresponsive = false;
			}));
		}
		if (this._ptyHostController.onPtyHostUnresponsive) {
			this._register(this._ptyHostController.onPtyHostUnresponsive(() => {
				statusBarAccessor?.dispose();
				if (!unresponsiveStatusBarEntry) {
					unresponsiveStatusBarEntry = {
						name: localize('ptyHostStatus', 'Pty Host Status'),
						text: `$(debug-disconnect) ${localize('ptyHostStatus.short', 'Pty Host')}`,
						tooltip: localize('nonResponsivePtyHost', "The connection to the terminal's pty host process is unresponsive, terminals may stop working. Click to manually restart the pty host."),
						ariaLabel: localize('ptyHostStatus.ariaLabel', 'Pty Host is unresponsive'),
						command: TerminalCommandId.RestartPtyHost,
						backgroundColor: themeColorFromId(STATUS_BAR_WARNING_ITEM_BACKGROUND),
						color: themeColorFromId(STATUS_BAR_WARNING_ITEM_FOREGROUND),
					};
				}
				statusBarAccessor = statusBarService.addEntry(unresponsiveStatusBarEntry, 'ptyHostStatus', StatusbarAlignment.LEFT);
				this._isPtyHostUnresponsive = true;
				this._onPtyHostUnresponsive.fire();
			}));
		}
		if (this._ptyHostController.onPtyHostResponsive) {
			this._register(this._ptyHostController.onPtyHostResponsive(() => {
				if (!this._isPtyHostUnresponsive) {
					return;
				}
				this._logService.info('The pty host became responsive again');
				statusBarAccessor?.dispose();
				this._isPtyHostUnresponsive = false;
				this._onPtyHostResponsive.fire();
			}));
		}
		if (this._ptyHostController.onPtyHostRequestResolveVariables) {
			this._register(this._ptyHostController.onPtyHostRequestResolveVariables(async e => {
				// Only answer requests for this workspace
				if (e.workspaceId !== this._workspaceContextService.getWorkspace().id) {
					return;
				}
				const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(Schemas.file);
				const lastActiveWorkspaceRoot = activeWorkspaceRootUri ? withNullAsUndefined(this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri)) : undefined;
				const resolveCalls: Promise<string>[] = e.originalText.map(t => {
					return configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, t);
				});
				const result = await Promise.all(resolveCalls);
				this._ptyHostController.acceptPtyHostResolvedVariables?.(e.requestId, result);
			}));
		}
	}

	restartPtyHost(): void {
		this._ptyHostController.restartPtyHost?.();
	}

	protected _deserializeTerminalState(serializedState: string | undefined): ISerializedTerminalState[] | undefined {
		if (serializedState === undefined) {
			return undefined;
		}
		const parsedUnknown = JSON.parse(serializedState);
		if (!('version' in parsedUnknown) || !('state' in parsedUnknown) || !Array.isArray(parsedUnknown.state)) {
			this._logService.warn('Could not revive serialized processes, wrong format', parsedUnknown);
			return undefined;
		}
		const parsedCrossVersion = parsedUnknown as ICrossVersionSerializedTerminalState;
		if (parsedCrossVersion.version !== 1) {
			this._logService.warn(`Could not revive serialized processes, wrong version "${parsedCrossVersion.version}"`, parsedCrossVersion);
			return undefined;
		}
		return parsedCrossVersion.state as ISerializedTerminalState[];
	}
}
