/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDelayedChannel, IChannel, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { arch, platform } from '../../../../base/common/process.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILocalTranscriptionProxyConfig, ILocalTranscriptionService, localTranscriptionChannelName } from '../../../../platform/localTranscription/common/localTranscription.js';
import { IUtilityProcessWorkerWorkbenchService } from '../../utilityProcess/electron-browser/utilityProcessWorkerWorkbenchService.js';

/**
 * Platform/architecture combinations for which onnxruntime-node ships a prebuilt
 * binary and packaging keeps it (see `onnxRuntimeShippedTargets` in
 * build/gulpfile.vscode.ts). On anything else (e.g. darwin/x64, linux/armhf) the
 * native addon is absent, so on-device transcription cannot run and the feature
 * must report itself unsupported rather than showing a mic that fails on use.
 */
const SUPPORTED_TARGETS = new Set<string>([
	'darwin-arm64',
	'linux-x64',
	'linux-arm64',
	'win32-x64',
	'win32-arm64',
]);

function isOnDeviceTranscriptionSupported(): boolean {
	return !!platform && !!arch && SUPPORTED_TARGETS.has(`${platform}-${arch}`);
}

/**
 * Renderer-side proxy for the on-device transcription service, which runs in a
 * utility process (heavy: transformers.js + native onnxruntime-node). The
 * worker is spun up lazily on first use and torn down with the window.
 */
export class LocalTranscriptionService {

	declare readonly _serviceBrand: undefined;

	readonly isSupported = isOnDeviceTranscriptionSupported();

	private _channel: IChannel | undefined;
	private _proxy: ILocalTranscriptionService | undefined;

	constructor(
		@IUtilityProcessWorkerWorkbenchService private readonly utilityProcessWorkerWorkbenchService: IUtilityProcessWorkerWorkbenchService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) { }

	private _getChannel(): IChannel {
		if (!this._channel) {
			this._channel = getDelayedChannel((async () => {
				const { client } = await this.utilityProcessWorkerWorkbenchService.createWorker({
					moduleId: 'vs/platform/localTranscription/node/localTranscriptionMain',
					type: 'localTranscription',
					name: 'local-transcription'
				});
				return client.getChannel(localTranscriptionChannelName);
			})());
		}
		return this._channel;
	}

	private _getProxy(): ILocalTranscriptionService {
		if (!this._proxy) {
			this._proxy = ProxyChannel.toService<ILocalTranscriptionService>(this._getChannel(), { disableMarshalling: true });
		}
		return this._proxy;
	}

	get onDidChangeModelStatus() { return this._getProxy().onDidChangeModelStatus; }
	get onDidTranscribe() { return this._getProxy().onDidTranscribe; }

	getModelStatus() { return this._getProxy().getModelStatus(); }
	start(options: { cacheDir: string; model?: string; language?: string }) { return this._getProxy().start({ cacheDir: options.cacheDir, model: options.model, language: options.language, proxy: this._readProxyConfig() }); }
	pushAudio(chunk: Parameters<ILocalTranscriptionService['pushAudio']>[0]) { return this._getProxy().pushAudio(chunk); }
	stop() { return this._getProxy().stop(); }
	cancel() { return this._getProxy().cancel(); }

	/**
	 * Snapshot the `http.*` proxy settings for the utility process, which has no
	 * `IConfigurationService`/`IRequestService` of its own. Mirrors how
	 * `RequestService` reads them: prefer the user-local value over the default
	 * and ignore workspace overrides (a workspace should not redirect a model
	 * download through an arbitrary proxy).
	 */
	private _readProxyConfig(): ILocalTranscriptionProxyConfig {
		const inspectLocal = <T>(key: string): T | undefined => {
			const values = this.configurationService.inspect<T>(key);
			return values.userLocalValue ?? values.defaultValue;
		};
		return {
			url: inspectLocal<string>('http.proxy'),
			strictSSL: !!inspectLocal<boolean>('http.proxyStrictSSL'),
			authorization: inspectLocal<string>('http.proxyAuthorization')
		};
	}
}

registerSingleton(ILocalTranscriptionService, LocalTranscriptionService, InstantiationType.Delayed);
