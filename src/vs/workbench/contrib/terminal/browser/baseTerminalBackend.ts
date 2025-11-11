/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isObject } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { ICrossVersionSerializedTerminalState, IPtyHostController, ISerializedTerminalState, ITerminalLogService } from '../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { TerminalContribCommandId } from '../terminalContribExports.js';

export abstract class BaseTerminalBackend extends Disposable {
	private _isPtyHostUnresponsive: boolean = false;

	get isResponsive(): boolean { return !this._isPtyHostUnresponsive; }

	protected readonly _onPtyHostConnected = this._register(new Emitter<void>());
	readonly onPtyHostConnected = this._onPtyHostConnected.event;
	protected readonly _onPtyHostRestart = this._register(new Emitter<void>());
	readonly onPtyHostRestart = this._onPtyHostRestart.event;
	protected readonly _onPtyHostUnresponsive = this._register(new Emitter<void>());
	readonly onPtyHostUnresponsive = this._onPtyHostUnresponsive.event;
	protected readonly _onPtyHostResponsive = this._register(new Emitter<void>());
	readonly onPtyHostResponsive = this._onPtyHostResponsive.event;

	constructor(
		private readonly _ptyHostController: IPtyHostController,
		protected readonly _logService: ITerminalLogService,
		historyService: IHistoryService,
		configurationResolverService: IConfigurationResolverService,
		statusBarService: IStatusbarService,
		protected readonly _workspaceContextService: IWorkspaceContextService
	) {
		super();

		let unresponsiveStatusBarEntry: IStatusbarEntry;
		let statusBarAccessor: IStatusbarEntryAccessor;
		let hasStarted = false;

		// Attach pty host listeners
		this._register(this._ptyHostController.onPtyHostExit(() => {
			this._logService.error(`The terminal's pty host process exited, the connection to all terminal processes was lost`);
		}));
		this._register(this.onPtyHostConnected(() => hasStarted = true));
		this._register(this._ptyHostController.onPtyHostStart(() => {
			this._logService.debug(`The terminal's pty host process is starting`);
			// Only fire the _restart_ event after it has started
			if (hasStarted) {
				this._logService.trace('IPtyHostController#onPtyHostRestart');
				this._onPtyHostRestart.fire();
			}
			statusBarAccessor?.dispose();
			this._isPtyHostUnresponsive = false;
		}));
		this._register(this._ptyHostController.onPtyHostUnresponsive(() => {
			statusBarAccessor?.dispose();
			if (!unresponsiveStatusBarEntry) {
				unresponsiveStatusBarEntry = {
					name: localize('ptyHostStatus', 'Pty Host Status'),
					text: `$(debug-disconnect) ${localize('ptyHostStatus.short', 'Pty Host')}`,
					tooltip: localize('nonResponsivePtyHost', "The connection to the terminal's pty host process is unresponsive, terminals may stop working. Click to manually restart the pty host."),
					ariaLabel: localize('ptyHostStatus.ariaLabel', 'Pty Host is unresponsive'),
					command: TerminalContribCommandId.DeveloperRestartPtyHost,
					kind: 'warning'
				};
			}
			statusBarAccessor = statusBarService.addEntry(unresponsiveStatusBarEntry, 'ptyHostStatus', StatusbarAlignment.LEFT);
			this._isPtyHostUnresponsive = true;
			this._onPtyHostUnresponsive.fire();
		}));
		this._register(this._ptyHostController.onPtyHostResponsive(() => {
			if (!this._isPtyHostUnresponsive) {
				return;
			}
			this._logService.info('The pty host became responsive again');
			statusBarAccessor?.dispose();
			this._isPtyHostUnresponsive = false;
			this._onPtyHostResponsive.fire();
		}));
		this._register(this._ptyHostController.onPtyHostRequestResolveVariables(async e => {
			// Only answer requests for this workspace
			if (e.workspaceId !== this._workspaceContextService.getWorkspace().id) {
				return;
			}
			const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot(Schemas.file);
			const lastActiveWorkspaceRoot = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? undefined : undefined;
			const resolveCalls: Promise<string>[] = e.originalText.map(t => {
				return configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, t);
			});
			const result = await Promise.all(resolveCalls);
			this._ptyHostController.acceptPtyHostResolvedVariables(e.requestId, result);
		}));
	}

	restartPtyHost(): void {
		this._ptyHostController.restartPtyHost();
	}

	protected _deserializeTerminalState(serializedState: string | undefined): ISerializedTerminalState[] | undefined {
		if (serializedState === undefined) {
			return undefined;
		}
		const crossVersionState = JSON.parse(serializedState) as unknown;
		if (!isCrossVersionSerializedTerminalState(crossVersionState)) {
			this._logService.warn('Could not revive serialized processes, wrong format', crossVersionState);
			return undefined;
		}
		if (crossVersionState.version !== 1) {
			this._logService.warn(`Could not revive serialized processes, wrong version "${crossVersionState.version}"`, crossVersionState);
			return undefined;
		}
		return crossVersionState.state as ISerializedTerminalState[];
	}

	protected _getWorkspaceId(): string {
		return this._workspaceContextService.getWorkspace().id;
	}
}

function isCrossVersionSerializedTerminalState(obj: unknown): obj is ICrossVersionSerializedTerminalState {
	return (
		isObject(obj) &&
		'version' in obj && typeof obj.version === 'number' &&
		'state' in obj && Array.isArray(obj.state)
	);
}
