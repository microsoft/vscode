/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { RemoteAuthorityResolverErrorCode } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ExtensionHostKind } from 'vs/workbench/services/extensions/common/extensionHostKind';
import { ExtensionHostManager, friendlyExtHostName } from 'vs/workbench/services/extensions/common/extensionHostManager';
import { IExtensionHostManager } from 'vs/workbench/services/extensions/common/extensionHostManagers';
import { IExtensionDescriptionDelta } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { IResolveAuthorityResult } from 'vs/workbench/services/extensions/common/extensionHostProxy';
import { ExtensionRunningLocation } from 'vs/workbench/services/extensions/common/extensionRunningLocation';
import { ActivationKind, ExtensionActivationReason, ExtensionHostExtensions, ExtensionHostStartup, IExtensionHost, IInternalExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ResponsiveState } from 'vs/workbench/services/extensions/common/rpcProtocol';

/**
 * Waits until `start()` and only if it has extensions proceeds to really start.
 */
export class LazyCreateExtensionHostManager extends Disposable implements IExtensionHostManager {

	public readonly onDidExit: Event<[number, string | null]>;
	private readonly _onDidChangeResponsiveState: Emitter<ResponsiveState> = this._register(new Emitter<ResponsiveState>());
	public readonly onDidChangeResponsiveState: Event<ResponsiveState> = this._onDidChangeResponsiveState.event;

	private readonly _extensionHost: IExtensionHost;
	private _startCalled: Barrier;
	private _actual: ExtensionHostManager | null;
	private _lazyStartExtensions: ExtensionHostExtensions | null;

	public get pid(): number | null {
		if (this._actual) {
			return this._actual.pid;
		}
		return null;
	}

	public get kind(): ExtensionHostKind {
		return this._extensionHost.runningLocation.kind;
	}

	public get startup(): ExtensionHostStartup {
		return this._extensionHost.startup;
	}

	public get friendyName(): string {
		return friendlyExtHostName(this.kind, this.pid);
	}

	constructor(
		extensionHost: IExtensionHost,
		private readonly _internalExtensionService: IInternalExtensionService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._extensionHost = extensionHost;
		this.onDidExit = extensionHost.onExit;
		this._startCalled = new Barrier();
		this._actual = null;
		this._lazyStartExtensions = null;
	}

	private _createActual(reason: string): ExtensionHostManager {
		this._logService.info(`Creating lazy extension host (${this.friendyName}). Reason: ${reason}`);
		this._actual = this._register(this._instantiationService.createInstance(ExtensionHostManager, this._extensionHost, [], this._internalExtensionService));
		this._register(this._actual.onDidChangeResponsiveState((e) => this._onDidChangeResponsiveState.fire(e)));
		return this._actual;
	}

	private async _getOrCreateActualAndStart(reason: string): Promise<ExtensionHostManager> {
		if (this._actual) {
			// already created/started
			return this._actual;
		}
		const actual = this._createActual(reason);
		await actual.start(this._lazyStartExtensions!.versionId, this._lazyStartExtensions!.allExtensions, this._lazyStartExtensions!.myExtensions);
		return actual;
	}

	public async ready(): Promise<void> {
		await this._startCalled.wait();
		if (this._actual) {
			await this._actual.ready();
		}
	}
	public async disconnect(): Promise<void> {
		await this._actual?.disconnect();
	}
	public representsRunningLocation(runningLocation: ExtensionRunningLocation): boolean {
		return this._extensionHost.runningLocation.equals(runningLocation);
	}
	public async deltaExtensions(extensionsDelta: IExtensionDescriptionDelta): Promise<void> {
		await this._startCalled.wait();
		if (this._actual) {
			return this._actual.deltaExtensions(extensionsDelta);
		}
		this._lazyStartExtensions!.delta(extensionsDelta);
		if (extensionsDelta.myToAdd.length > 0) {
			const actual = this._createActual(`contains ${extensionsDelta.myToAdd.length} new extension(s) (installed or enabled): ${extensionsDelta.myToAdd.map(extId => extId.value)}`);
			await actual.start(this._lazyStartExtensions!.versionId, this._lazyStartExtensions!.allExtensions, this._lazyStartExtensions!.myExtensions);
			return;
		}
	}
	public containsExtension(extensionId: ExtensionIdentifier): boolean {
		return this._extensionHost.extensions?.containsExtension(extensionId) ?? false;
	}
	public async activate(extension: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<boolean> {
		await this._startCalled.wait();
		if (this._actual) {
			return this._actual.activate(extension, reason);
		}
		return false;
	}
	public async activateByEvent(activationEvent: string, activationKind: ActivationKind): Promise<void> {
		if (activationKind === ActivationKind.Immediate) {
			// this is an immediate request, so we cannot wait for start to be called
			if (this._actual) {
				return this._actual.activateByEvent(activationEvent, activationKind);
			}
			return;
		}
		await this._startCalled.wait();
		if (this._actual) {
			return this._actual.activateByEvent(activationEvent, activationKind);
		}
	}
	public activationEventIsDone(activationEvent: string): boolean {
		if (!this._startCalled.isOpen()) {
			return false;
		}
		if (this._actual) {
			return this._actual.activationEventIsDone(activationEvent);
		}
		return true;
	}
	public async getInspectPort(tryEnableInspector: boolean): Promise<{ port: number; host: string } | undefined> {
		await this._startCalled.wait();
		return this._actual?.getInspectPort(tryEnableInspector);
	}
	public async resolveAuthority(remoteAuthority: string, resolveAttempt: number): Promise<IResolveAuthorityResult> {
		await this._startCalled.wait();
		if (this._actual) {
			return this._actual.resolveAuthority(remoteAuthority, resolveAttempt);
		}
		return {
			type: 'error',
			error: {
				message: `Cannot resolve authority`,
				code: RemoteAuthorityResolverErrorCode.Unknown,
				detail: undefined
			}
		};
	}
	public async getCanonicalURI(remoteAuthority: string, uri: URI): Promise<URI | null> {
		await this._startCalled.wait();
		if (this._actual) {
			return this._actual.getCanonicalURI(remoteAuthority, uri);
		}
		throw new Error(`Cannot resolve canonical URI`);
	}
	public async start(extensionRegistryVersionId: number, allExtensions: IExtensionDescription[], myExtensions: ExtensionIdentifier[]): Promise<void> {
		if (myExtensions.length > 0) {
			// there are actual extensions, so let's launch the extension host
			const actual = this._createActual(`contains ${myExtensions.length} extension(s): ${myExtensions.map(extId => extId.value)}.`);
			const result = actual.start(extensionRegistryVersionId, allExtensions, myExtensions);
			this._startCalled.open();
			return result;
		}
		// there are no actual extensions running, store extensions in `this._lazyStartExtensions`
		this._lazyStartExtensions = new ExtensionHostExtensions(extensionRegistryVersionId, allExtensions, myExtensions);
		this._startCalled.open();
	}
	public async extensionTestsExecute(): Promise<number> {
		await this._startCalled.wait();
		const actual = await this._getOrCreateActualAndStart(`execute tests.`);
		return actual.extensionTestsExecute();
	}
	public async setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void> {
		await this._startCalled.wait();
		if (this._actual) {
			return this._actual.setRemoteEnvironment(env);
		}
	}
}
