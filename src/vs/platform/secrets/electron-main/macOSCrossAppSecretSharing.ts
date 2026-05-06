/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { dirname } from '../../../base/common/path.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IEncryptionMainService } from '../../encryption/common/encryptionService.js';
import { IStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { CROSS_APP_SHARED_SECRET_KEYS, secretStorageKey, readEncryptedSecret, writeEncryptedSecret } from '../common/secrets.js';
import { IStateService } from '../../state/node/state.js';
import { INodeProcess, isMacintosh } from '../../../base/common/platform.js';
import { IStorageMain } from '../../storage/electron-main/storageMain.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILaunchMainService } from '../../launch/electron-main/launchMainService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ICrossAppIPCService } from '../../crossAppIpc/electron-main/crossAppIpcService.js';

const MIGRATION_STATE_KEY = 'crossAppSecretSharing.migrationDone';

/**
 * Message types exchanged between apps over crossAppIPC for secret sharing.
 */
const enum CrossAppSecretMessageType {
	/** Agents → Host: Request secrets */
	SecretRequest = 'secrets/request',
	/** Host → Agents: Response with secrets */
	SecretResponse = 'secrets/response',
	/** Agents → Host: Confirms secrets were stored, both sides mark migration done */
	SecretAck = 'secrets/ack',
}

interface CrossAppSecretMessage {
	type: CrossAppSecretMessageType;
	data?: Record<string, string>;
}

/**
 * Coordinates one-time secret migration between the VS Code app and the
 * agents app using Electron's crossAppIPC (macOS only).
 *
 * **Demand-driven**: Only the agents app initiates migration. If it
 * detects that migration hasn't been done yet, it:
 * 1. Waits for the crossAppIPC connection (managed by ICrossAppIPCService).
 * 2. Spawns Code.app with `--share-secrets-with-agents-app`, which
 *    either starts Code.app fresh or (if already running) forwards
 *    the arg to the existing instance via the node IPC socket.
 * 3. Code.app creates its own crossAppIPC connection when it sees
 *    the arg, and the two connect.
 * 4. Agents app sends `SecretRequest` → Code.app responds with
 *    `SecretResponse` → Agents app sends `SecretAck`.
 * 5. Both sides mark migration as done. Code.app quits if it was
 *    launched solely for this purpose.
 *
 * Security: crossAppIPC uses code-signature verification (Mach ports
 * on macOS) — the kernel authenticates both endpoints. No secrets are
 * ever in process args, files, or network.
 */
export class MacOSCrossAppSecretSharing extends Disposable {

	private readonly isEmbeddedApp: boolean;
	private readonly applicationStorage: IStorageMain;
	private _onHostMigrationComplete: (() => void) | undefined;
	private readonly hostHandshakeListeners = this._register(new DisposableStore());

	constructor(
		storageMainService: IStorageMainService,
		private readonly encryptionMainService: IEncryptionMainService,
		private readonly stateService: IStateService,
		private readonly logService: ILogService,
		environmentMainService: IEnvironmentMainService,
		launchMainService: ILaunchMainService,
		lifecycleMainService: ILifecycleMainService,
		private readonly crossAppIPCService: ICrossAppIPCService,
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
			// Agents app: initiate migration if needed
			this.initializeAsAgentsApp();
		} else if (environmentMainService.args['share-secrets-with-agents-app']) {
			// Code.app launched fresh with --share-secrets-with-agents-app:
			// respond to the agents app's request, then quit if no other reason to stay
			const hasOtherArgs = environmentMainService.args._.length > 0 || environmentMainService.args['folder-uri'] || environmentMainService.args['file-uri'];
			this.initializeAsHostApp(hasOtherArgs ? undefined : () => {
				this.logService.info('[CrossAppSecretSharing] Host app was launched for migration only, quitting');
				lifecycleMainService.quit();
			});
		} else {
			// Code.app already running: listen for --share-secrets-with-agents-app
			// forwarded from a second instance via the launch service
			this._register(launchMainService.onDidRequestShareSecrets(() => {
				this.initializeAsHostApp();
			}));
		}
	}

	private async initializeAsAgentsApp(): Promise<void> {
		if (!isMacintosh || !this.isEmbeddedApp) {
			return;
		}

		if (this.isMigrationDone()) {
			this.logService.trace('[CrossAppSecretSharing] Migration already done, skipping');
			return;
		}

		// Wait for storage to be ready before we start — handleSecretResponse
		// will write secrets into applicationStorage.
		await this.applicationStorage.whenInit;

		if (!this.crossAppIPCService.initialized) {
			this.logService.info('[CrossAppSecretSharing] crossAppIPC not initialized, skipping migration');
			return;
		}

		this.logService.info('[CrossAppSecretSharing] Migration needed, starting...');

		// Listen for connection — when connected, request secrets
		this._register(this.crossAppIPCService.onDidConnect(isServer => {
			this.logService.info(`[CrossAppSecretSharing] Connected (isServer=${isServer}), requesting secrets from host app`);
			this.crossAppIPCService.sendMessage({ type: CrossAppSecretMessageType.SecretRequest });
		}));

		// Listen for messages
		this._register(this.crossAppIPCService.onDidReceiveMessage(msg => {
			const secretMsg = msg as CrossAppSecretMessage;
			if (secretMsg?.type === CrossAppSecretMessageType.SecretResponse) {
				this.handleSecretResponse(secretMsg.data ?? {});
			}
		}));

		// If already connected (e.g. service was initialized before storage was ready),
		// send the request immediately.
		if (this.crossAppIPCService.connected) {
			this.logService.info(`[CrossAppSecretSharing] Already connected (isServer=${this.crossAppIPCService.isServer}), requesting secrets from host app`);
			this.crossAppIPCService.sendMessage({ type: CrossAppSecretMessageType.SecretRequest });
		}

		// Spawn Code.app with --share-secrets-with-agents-app
		this.spawnHostApp();

		// Timeout: if migration doesn't complete within 30s, give up
		setTimeout(() => {
			if (!this.isMigrationDone()) {
				this.logService.warn('[CrossAppSecretSharing] Migration timed out');
			}
		}, 30_000);
	}

	private async initializeAsHostApp(onComplete?: () => void): Promise<void> {
		if (!isMacintosh || this.isEmbeddedApp) {
			onComplete?.();
			return;
		}

		if (this.isMigrationDone()) {
			this.logService.trace('[CrossAppSecretSharing] Migration already done, skipping');
			onComplete?.();
			return;
		}

		// Wait for application storage to be fully initialized before
		// checking for secrets — storage may still be in-memory at this
		// point during early startup.
		await this.applicationStorage.whenInit;

		if (!this.hasAnySharedSecrets()) {
			this.logService.trace('[CrossAppSecretSharing] No shared secrets to share, skipping');
			onComplete?.();
			return;
		}

		if (!this.crossAppIPCService.initialized) {
			this.logService.info('[CrossAppSecretSharing] crossAppIPC not initialized');
			onComplete?.();
			return;
		}

		this._onHostMigrationComplete = onComplete;

		this.logService.info('[CrossAppSecretSharing] Host app responding to secret sharing request');

		// Dispose previous listeners if initializeAsHostApp is called again
		// (e.g. via repeated onDidRequestShareSecrets events).
		this.hostHandshakeListeners.clear();

		// Listen for messages from the agents app
		this.hostHandshakeListeners.add(this.crossAppIPCService.onDidReceiveMessage(msg => {
			const secretMsg = msg as CrossAppSecretMessage;
			if (secretMsg?.type === CrossAppSecretMessageType.SecretRequest) {
				this.handleSecretRequest();
			} else if (secretMsg?.type === CrossAppSecretMessageType.SecretAck) {
				this.handleSecretAck();
			}
		}));

		// If disconnected before ack, still allow the host to quit
		this.hostHandshakeListeners.add(this.crossAppIPCService.onDidDisconnect(() => {
			this._onHostMigrationComplete?.();
			this._onHostMigrationComplete = undefined;
		}));
	}

	private isMigrationDone(): boolean {
		return this.stateService.getItem<boolean>(MIGRATION_STATE_KEY, false);
	}

	private hasAnySharedSecrets(): boolean {
		for (const key of CROSS_APP_SHARED_SECRET_KEYS) {
			if (this.applicationStorage.get(secretStorageKey(key)) !== undefined) {
				return true;
			}
		}
		return false;
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

	private async handleSecretRequest(): Promise<void> {
		this.logService.info('[CrossAppSecretSharing] Host app handling secret request');

		const secrets: Record<string, string> = {};

		for (const key of CROSS_APP_SHARED_SECRET_KEYS) {
			try {
				const decrypted = await readEncryptedSecret(
					key,
					(fullKey) => this.applicationStorage.get(fullKey),
					(value) => this.encryptionMainService.decrypt(value),
					this.logService,
				);
				if (decrypted !== undefined) {
					secrets[key] = decrypted;
				}
			} catch (err) {
				this.logService.error('[CrossAppSecretSharing] Failed to read secret for key:', key, err);
			}
		}

		this.crossAppIPCService.sendMessage({ type: CrossAppSecretMessageType.SecretResponse, data: secrets });
		this.logService.info('[CrossAppSecretSharing] Sent secrets response with', Object.keys(secrets).length, 'keys');
	}

	private async handleSecretResponse(secrets: Record<string, string>): Promise<void> {
		this.logService.info('[CrossAppSecretSharing] Agents app received', Object.keys(secrets).length, 'secrets');

		for (const [key, value] of Object.entries(secrets)) {
			if (!CROSS_APP_SHARED_SECRET_KEYS.includes(key)) {
				this.logService.warn('[CrossAppSecretSharing] Ignoring unexpected key:', key);
				continue;
			}

			try {
				await writeEncryptedSecret(
					key,
					value,
					(fullKey, encrypted) => this.applicationStorage.set(fullKey, encrypted),
					(v) => this.encryptionMainService.encrypt(v),
					this.logService,
				);
			} catch (err) {
				this.logService.error('[CrossAppSecretSharing] Failed to store secret for key:', key, err);
			}
		}

		this.stateService.setItem(MIGRATION_STATE_KEY, true);
		this.logService.info('[CrossAppSecretSharing] Migration complete');

		// Tell the host app migration is done so it can also record it.
		// Don't close here — let the host close first after receiving the ack.
		this.crossAppIPCService.sendMessage({ type: CrossAppSecretMessageType.SecretAck });
	}

	private handleSecretAck(): void {
		this.stateService.setItem(MIGRATION_STATE_KEY, true);
		this.logService.info('[CrossAppSecretSharing] Host app received ack, migration complete on both sides');

		const onComplete = this._onHostMigrationComplete;
		this._onHostMigrationComplete = undefined;

		onComplete?.();
	}
}
