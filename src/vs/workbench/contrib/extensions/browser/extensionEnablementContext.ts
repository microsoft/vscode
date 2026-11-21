/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

/**
 * Prefix for the per-extension when-clause context keys that report whether an
 * extension is installed and enabled. The full key is
 * `extensionEnabled:<lowercased extension id>`, e.g. `extensionEnabled:ms-python.python`.
 *
 * Because context keys are matched by exact string, the extension id is always
 * lowercased. When clauses must therefore use the lowercased id (for example
 * `extensionEnabled:github.copilot`, not `extensionEnabled:GitHub.copilot`).
 */
export const EXTENSION_ENABLED_CONTEXT_KEY_PREFIX = 'extensionEnabled:';

/**
 * Mirrors the set of installed and enabled extensions into context keys so that
 * `when` clauses can gate on the presence of another extension without having to
 * activate it. A key `extensionEnabled:<id>` is `true` while the extension is
 * registered (installed and enabled) and `false` once it is removed (uninstalled
 * or disabled).
 */
export class ExtensionEnablementContextKeysContribution extends Disposable implements IWorkbenchContribution {

	private readonly _contextKeys = new Map<string, IContextKey<boolean>>();

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super();

		// Reconcile against the authoritative set of registered extensions rather
		// than trusting individual change deltas. `IExtensionService.extensions`
		// is empty until the initial registration completes (signalled by
		// `onDidRegisterExtensions`, which is not guaranteed to have fired by the
		// `Restored` phase), and change deltas can also report `added` extensions
		// that registry validation then rejects (e.g. dependency loops) without a
		// matching `removed` entry. Recomputing from the final collection keeps the
		// keys correct in both cases.
		this._reconcile();
		this._register(this.extensionService.onDidRegisterExtensions(() => this._reconcile()));
		this._register(this.extensionService.onDidChangeExtensions(() => this._reconcile()));
	}

	private _reconcile(): void {
		const enabledKeys = new Set<string>();
		for (const extension of this.extensionService.extensions) {
			enabledKeys.add(EXTENSION_ENABLED_CONTEXT_KEY_PREFIX + ExtensionIdentifier.toKey(extension.identifier));
		}

		// Update every key we already track to reflect the current registry.
		for (const [key, contextKey] of this._contextKeys) {
			contextKey.set(enabledKeys.has(key));
		}

		// Create keys for extensions that became enabled since the last reconcile.
		for (const key of enabledKeys) {
			if (!this._contextKeys.has(key)) {
				this._contextKeys.set(key, this.contextKeyService.createKey<boolean>(key, true));
			}
		}
	}
}
