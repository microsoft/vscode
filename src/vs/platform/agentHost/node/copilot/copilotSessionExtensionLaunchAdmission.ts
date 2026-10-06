/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ExtensionLaunchProviderResolveRequest } from '@github/copilot-sdk';
import * as fs from 'fs/promises';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Disposable, type IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import type { ILogService } from '../../../log/common/log.js';

function isSafePathComponent(value: string): boolean {
	return value.length > 0
		&& value !== '.'
		&& value !== '..'
		&& !/[\\/:<>"|?*\x00-\x1f]/.test(value)
		&& !/[. ]$/.test(value)
		&& !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
}

/** Admission for SDK-owned extensions discovered under `<copilotHome>/session-state/<sdkId>/extensions` on one runtime connection. */
export class CopilotSessionExtensionLaunchAdmission extends Disposable {
	private readonly _leases = new Map<string, Set<object>>();
	private _disposed = false;

	constructor(
		private readonly _copilotHome: string,
		private readonly _logService: ILogService,
	) {
		super();
	}

	acquire(sessionId: string): IDisposable {
		if (this._disposed || !isSafePathComponent(sessionId)) {
			this._logService.warn(`[Copilot] Cannot admit session extensions for '${sessionId}'`);
			return Disposable.None;
		}
		let leases = this._leases.get(sessionId);
		if (!leases) {
			leases = new Set();
			this._leases.set(sessionId, leases);
		}
		const lease = {};
		leases.add(lease);
		const admittedLeases = leases;
		return toDisposable(() => {
			admittedLeases.delete(lease);
			if (admittedLeases.size === 0 && this._leases.get(sessionId) === admittedLeases) {
				this._leases.delete(sessionId);
			}
		});
	}

	async resolve(request: ExtensionLaunchProviderResolveRequest): Promise<string | undefined> {
		const deny = (reason: string) => {
			this._logService.trace(`[Copilot] Denied session extension launch '${request.id}': ${reason}`);
			return undefined;
		};
		if (this._disposed || request.source !== 'session' || !isSafePathComponent(request.name)
			|| !request.id.startsWith('session:') || !request.id.endsWith(`:${request.name}`)) {
			return deny('invalid session extension identity');
		}
		const sessionId = request.id.slice('session:'.length, -(`:${request.name}`.length));
		const leases = this._leases.get(sessionId);
		if (!leases?.size) {
			return deny('owning SDK session is not admitted');
		}
		const admittedLeases = [...leases];
		const stateDirectory = join(this._copilotHome, 'session-state');
		const sessionDirectory = join(stateDirectory, sessionId);
		const extensionsDirectory = join(sessionDirectory, 'extensions');
		const expectedModulePath = join(extensionsDirectory, request.name, 'extension.mjs');
		if (request.modulePath !== expectedModulePath) {
			return deny('entrypoint does not belong to the owning SDK session');
		}
		try {
			const [home, state, session, extensions, modulePath] = await Promise.all([
				fs.realpath(this._copilotHome),
				fs.realpath(stateDirectory),
				fs.realpath(sessionDirectory),
				fs.realpath(extensionsDirectory),
				fs.realpath(expectedModulePath),
			]);
			const samePath = (a: string, b: string) => isEqual(URI.file(a), URI.file(b));
			if (!samePath(state, join(home, 'session-state'))
				|| !samePath(session, join(state, sessionId))
				|| !samePath(extensions, join(session, 'extensions'))
				|| !samePath(modulePath, join(extensions, request.name, 'extension.mjs'))) {
				return deny('canonical entrypoint escapes its session scope');
			}
			if (!(await fs.stat(modulePath)).isFile()) {
				return deny('entrypoint is not a file');
			}
			// A replacement admission must not revive an in-flight launch from the previous lifetime.
			if (this._disposed || !admittedLeases.some(lease => leases.has(lease))) {
				return deny('owning SDK session was released during resolution');
			}
			return modulePath;
		} catch (error) {
			this._logService.warn(`[Copilot] Cannot resolve session extension '${request.id}': ${getErrorMessage(error)}`);
			return undefined;
		}
	}

	override dispose(): void {
		this._disposed = true;
		for (const leases of this._leases.values()) {
			leases.clear();
		}
		this._leases.clear();
		super.dispose();
	}
}
