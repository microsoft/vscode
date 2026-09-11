/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, toDisposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentHostCanvasPackagesService, type ICanvasPackageLaunch } from '../../common/agentHostCanvasPackages.js';
import { AgentHostLocalCanvasesConfigKey, platformRootSchema } from '../../common/agentHostSchema.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostCustomizationEnablementService } from '../agentHostCustomizationEnablementService.js';
import { isCanvasPackageEnabled } from './copilotCanvasPackages.js';

export interface ICopilotCanvasLaunchScope {
	readonly sessionId: string;
	readonly session: URI;
	readonly chat: URI;
	readonly workspace: URI;
	readonly pluginDirectories: readonly URI[];
	/** Disconnects this exact backing without deleting its retained state. */
	stop(): Promise<void>;
}

export interface ICopilotCanvasLaunchLease extends IDisposable {
	assertCurrent(): void;
	/** Opens the launch gate after public SDK retention has completed. */
	markRetained(): void;
}

interface IBoundScope {
	readonly scope: ICopilotCanvasLaunchScope;
	readonly launches: Map<string, ICanvasPackageLaunch>;
	retained: boolean;
	revoked: boolean;
}

/** Resolves pre-launch authority against the exact backing, including before host registration. */
export class CopilotCanvasLaunchAuthority extends Disposable {
	private readonly _scopes = new Map<string, IBoundScope>();
	private readonly _stops = new Set<Promise<void>>();

	constructor(
		private readonly _isLocalHost: () => boolean,
		@IAgentHostCanvasPackagesService private readonly _packages: IAgentHostCanvasPackagesService,
		@IAgentHostCustomizationEnablementService private readonly _enablement: IAgentHostCustomizationEnablementService,
		@IAgentConfigurationService private readonly _configuration: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._packages.onDidChange(() => this._reconcile()));
		this._register(this._enablement.onDidChange(() => this._reconcile()));
		this._register(this._configuration.onDidRootConfigChange(() => this._reconcile()));
		this._register(toDisposable(() => {
			for (const bound of this._scopes.values()) {
				this._revoke(bound);
			}
			this._scopes.clear();
		}));
	}

	get enabled(): boolean {
		return !this._store.isDisposed && this._isLocalHost() && this._packages.supported
			&& this._configuration.getRootValue(platformRootSchema, AgentHostLocalCanvasesConfigKey) === true;
	}

	bind(scope: ICopilotCanvasLaunchScope): ICopilotCanvasLaunchLease {
		if (!this.enabled || this._scopes.has(scope.sessionId) || this._scopes.size >= 128) {
			throw new Error('Canvas launch authority is unavailable or the backing is already registered.');
		}
		const bound: IBoundScope = { scope, launches: new Map(), retained: false, revoked: false };
		this._scopes.set(scope.sessionId, bound);
		const lease = toDisposable(() => {
			bound.revoked = true;
			if (this._scopes.get(scope.sessionId) === bound) {
				this._scopes.delete(scope.sessionId);
			}
		});
		return {
			assertCurrent: () => this._assertCurrent(bound),
			markRetained: () => {
				this._assertCurrent(bound);
				bound.retained = true;
			},
			dispose: () => lease.dispose(),
		};
	}

	async resolve(sessionId: string, extensionId: string, modulePath: string): Promise<ICanvasPackageLaunch | undefined> {
		const bound = this._scopes.get(sessionId);
		if (!bound?.retained || !this._isCurrent(bound)) {
			return undefined;
		}
		const launch = await this._packages.resolveLaunch(extensionId, modulePath, bound.scope.workspace);
		if (!launch || !this._isCurrent(bound) || !bound.scope.pluginDirectories.some(directory => isEqual(directory, launch.pluginDirectory))
			|| !this._isEnabled(bound, launch)) {
			return undefined;
		}
		bound.launches.set(extensionId, launch);
		return launch;
	}

	revokeChat(chat: URI): void {
		for (const bound of this._scopes.values()) {
			if (isEqual(bound.scope.chat, chat)) {
				this._revoke(bound);
			}
		}
	}

	revokeAll(): void {
		for (const bound of this._scopes.values()) {
			this._revoke(bound);
		}
	}

	isAuthorized(chat: URI, extensionId: string): boolean {
		for (const bound of this._scopes.values()) {
			const launch = bound.launches.get(extensionId);
			if (launch && isEqual(bound.scope.chat, chat)) {
				return this._isCurrent(bound) && this._isEnabled(bound, launch);
			}
		}
		return false;
	}

	async whenIdle(): Promise<void> {
		while (this._stops.size) {
			await Promise.all(this._stops);
		}
	}

	private _isCurrent(bound: IBoundScope): boolean {
		return this.enabled && !bound.revoked && this._scopes.get(bound.scope.sessionId) === bound;
	}

	private _assertCurrent(bound: IBoundScope): void {
		if (!this._isCurrent(bound)) {
			throw new CancellationError();
		}
	}

	private _isEnabled(bound: IBoundScope, launch: ICanvasPackageLaunch): boolean {
		const item = this._packages.list().find(item => item.id === launch.packageId);
		return !!item && isCanvasPackageEnabled(item, launch, this._packages, this._enablement, bound.scope.session, bound.scope.workspace);
	}

	private _reconcile(): void {
		for (const bound of this._scopes.values()) {
			if (!this._isCurrent(bound) || [...bound.launches.values()].some(launch => !this._isEnabled(bound, launch))) {
				this._revoke(bound);
			}
		}
	}

	private _revoke(bound: IBoundScope): void {
		if (bound.revoked) {
			return;
		}
		bound.revoked = true;
		const stopping = bound.scope.stop();
		this._stops.add(stopping);
		void stopping.then(() => this._stops.delete(stopping), error => {
			this._stops.delete(stopping);
			this._logService.error('[CopilotCanvas] Failed to stop a revoked canvas backing.', error);
		});
	}
}
