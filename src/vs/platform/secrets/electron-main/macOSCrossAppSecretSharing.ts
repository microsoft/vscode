/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { dirname } from '../../../base/common/path.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IEncryptionMainService } from '../../encryption/common/encryptionService.js';
import { IStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { CROSS_APP_SHARED_SECRET_KEYS, readEncryptedSecret } from '../common/secrets.js';
import { IStateService } from '../../state/node/state.js';
import { INodeProcess, isMacintosh } from '../../../base/common/platform.js';
import { IStorageMain } from '../../storage/electron-main/storageMain.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILaunchMainService } from '../../launch/electron-main/launchMainService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ISharedKeychainMainService } from '../common/sharedKeychainService.js';

const MIGRATION_STATE_KEY = 'sharedKeychain.migrationDone';
const HOST_SPAWN_STATE_KEY = 'sharedKeychain.hostSpawnDone';

/**
 * Coordinates one-time secret migration between the VS Code app and the
 * agents app via the macOS shared keychain (macOS only).
 *
 * Each app migrates its own secrets from safeStorage+SQLite into the
 * shared keychain on startup. The agents app also spawns Code.app
 * (once) with `--share-secrets-with-agents-app` to trigger Code's
 * migration if the shared keychain doesn't yet contain all expected
 * keys.
 *
 * After migration, both apps read from and write to the shared keychain
 * for cross-app secret keys (via {@link NativeSecretStorageService}).
 */
export class MacOSCrossAppSecretSharing extends Disposable {

	private readonly isEmbeddedApp: boolean;
	private readonly applicationStorage: IStorageMain;

	constructor(
		storageMainService: IStorageMainService,
		private readonly encryptionMainService: IEncryptionMainService,
		private readonly sharedKeychainMainService: ISharedKeychainMainService,
		private readonly stateService: IStateService,
		private readonly logService: ILogService,
		environmentMainService: IEnvironmentMainService,
		launchMainService: ILaunchMainService,
		lifecycleMainService: ILifecycleMainService,
	) {
		super();
		this.isEmbeddedApp = !!(process as INodeProcess).isEmbeddedApp;
		this.applicationStorage = storageMainService.applicationStorage;
		this.initialize(environmentMainService, launchMainService, lifecycleMainService);
	}

	private initialize(
		environmentMainService: IEnvironmentMainService,
		launchMainService: ILaunchMainService,
		lifecycleMainService: ILifecycleMainService,
	): void {
		if (this.isEmbeddedApp) {
			// Agents app: migrate own secrets + spawn Code.app if needed
			this.initializeAsAgentsApp();
		} else if (environmentMainService.args['share-secrets-with-agents-app']) {
			// Code.app launched with --share-secrets-with-agents-app:
			// migrate secrets to shared keychain, then quit if no other reason to stay
			const hasOtherArgs = environmentMainService.args._.length > 0 || environmentMainService.args['folder-uri'] || environmentMainService.args['file-uri'];
			this.migrateSecrets().then(() => {
				if (!hasOtherArgs) {
					this.logService.info('[CrossAppSecretSharing] Host app was launched for migration only, quitting');
					lifecycleMainService.quit();
				}
			});
		} else {
			// Code.app normal startup: migrate own secrets
			this.migrateSecrets();
			// Also respond to spawn requests from the agents app
			this._register(launchMainService.onDidRequestShareSecrets(() => {
				this.migrateSecrets();
			}));
		}
	}

	private async initializeAsAgentsApp(): Promise<void> {
		if (!isMacintosh) {
			return;
		}

		// Migrate own secrets (if any) to shared keychain
		await this.migrateSecrets();

		// If we've already spawned Code.app before, don't do it again
		if (this.stateService.getItem<boolean>(HOST_SPAWN_STATE_KEY, false)) {
			return;
		}

		// Check if the shared keychain has all expected keys
		let needsHostMigration = false;
		for (const key of CROSS_APP_SHARED_SECRET_KEYS) {
			if (await this.sharedKeychainMainService.get(key) === undefined) {
				needsHostMigration = true;
				break;
			}
		}

		if (needsHostMigration) {
			this.logService.info('[CrossAppSecretSharing] Shared keychain incomplete, spawning host app');
			this.spawnHostApp();
		}

		// Mark that we've attempted the host spawn (don't retry on next startup)
		this.stateService.setItem(HOST_SPAWN_STATE_KEY, true);
	}

	/**
	 * Migrates this app's secrets from safeStorage+SQLite to the shared keychain.
	 * Idempotent — skips if already done.
	 */
	private async migrateSecrets(): Promise<void> {
		if (!isMacintosh) {
			return;
		}

		if (this.stateService.getItem<boolean>(MIGRATION_STATE_KEY, false)) {
			this.logService.trace('[CrossAppSecretSharing] Migration already done, skipping');
			return;
		}

		await this.applicationStorage.whenInit;

		this.logService.info('[CrossAppSecretSharing] Starting shared keychain migration');

		for (const key of CROSS_APP_SHARED_SECRET_KEYS) {
			try {
				const decrypted = await readEncryptedSecret(
					key,
					(fullKey) => this.applicationStorage.get(fullKey),
					(value) => this.encryptionMainService.decrypt(value),
					this.logService,
				);
				if (decrypted !== undefined) {
					await this.sharedKeychainMainService.set(key, decrypted);
					this.logService.trace('[CrossAppSecretSharing] Migrated key to shared keychain:', key);
				}
			} catch (err) {
				this.logService.error('[CrossAppSecretSharing] Failed to migrate key:', key, err);
			}
		}

		this.stateService.setItem(MIGRATION_STATE_KEY, true);
		this.logService.info('[CrossAppSecretSharing] Migration complete');
	}

	private spawnHostApp(): void {
		// Agents app's process.execPath:
		//   <Code.app>/Contents/Applications/<Agents.app>/Contents/MacOS/Electron
		// Code.app bundle is 6 directories up:
		//   MacOS → Contents → <Agents.app> → Applications → Contents → <Code.app>
		const codeAppBundle = dirname(dirname(dirname(dirname(dirname(dirname(process.execPath))))));

		this.logService.info('[CrossAppSecretSharing] Spawning host app:', codeAppBundle);

		const child = execFile('open', [
			'-a', codeAppBundle,
			'-n',                                // new instance (so args are passed even if already running)
			'-g',                                // don't bring to front
			'--args', '--share-secrets-with-agents-app',
		], (error) => {
			if (error) {
				this.logService.error('[CrossAppSecretSharing] Failed to spawn host app:', error.message);
			}
		});
		child.unref();
	}
}
