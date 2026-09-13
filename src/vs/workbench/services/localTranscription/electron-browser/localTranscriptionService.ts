/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDelayedChannel, IChannel, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { arch, platform } from '../../../../base/common/process.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ILocalTranscriptionModelStatus, ILocalTranscriptionResult, ILocalTranscriptionService, localTranscriptionChannelName } from '../../../../platform/localTranscription/common/localTranscription.js';
import { IUtilityProcessWorker, IUtilityProcessWorkerWorkbenchService } from '../../utilityProcess/electron-browser/utilityProcessWorkerWorkbenchService.js';

/**
 * Platform/architecture combinations for which the Foundry Local native runtime
 * ships a prebuilt addon and core libraries, and packaging keeps them (see the
 * Foundry Local bundling in build/gulpfile.vscode.ts). On anything else (e.g.
 * darwin/x64, linux/armhf) the native runtime is absent, so on-device
 * transcription cannot run and the feature must report itself unsupported rather
 * than showing a mic that fails on use.
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
 * utility process (heavy: Foundry Local native ASR runtime — onnxruntime +
 * onnxruntime-genai). The worker is spun up lazily on first use and torn down
 * with the window.
 */
export class LocalTranscriptionService extends Disposable {

	declare readonly _serviceBrand: undefined;

	readonly isSupported = isOnDeviceTranscriptionSupported();

	private readonly _onDidChangeModelStatus = this._register(new Emitter<ILocalTranscriptionModelStatus>());
	readonly onDidChangeModelStatus = this._onDidChangeModelStatus.event;

	private readonly _onDidTranscribe = this._register(new Emitter<ILocalTranscriptionResult>());
	readonly onDidTranscribe = this._onDidTranscribe.event;

	private readonly _worker = this._register(new MutableDisposable<IUtilityProcessWorker>());
	private readonly _workerEvents = this._register(new DisposableStore());
	private _channel: IChannel | undefined;
	private _proxy: ILocalTranscriptionService | undefined;
	private _workerGeneration = 0;

	constructor(
		@IUtilityProcessWorkerWorkbenchService private readonly utilityProcessWorkerWorkbenchService: IUtilityProcessWorkerWorkbenchService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
	}

	private _getChannel(): IChannel {
		if (!this._channel) {
			this._channel = getDelayedChannel(this._createWorkerChannel(this._workerGeneration));
		}
		return this._channel;
	}

	private async _createWorkerChannel(generation: number): Promise<IChannel> {
		const worker = await this.utilityProcessWorkerWorkbenchService.createWorker({
			moduleId: 'vs/platform/localTranscription/node/localTranscriptionMain',
			type: 'localTranscription',
			name: 'local-transcription',
			// The on-device dictation runtime is downloaded from our CDN and its
			// native addons are signed by a third party,
			// so on macOS it must load in the plugin helper (library validation
			// disabled) to avoid a Team ID mismatch dlopen failure.
			allowLoadingUnsignedLibraries: true
		});
		if (generation !== this._workerGeneration || this._store.isDisposed) {
			worker.dispose();
			throw new CancellationError();
		}
		this._worker.value = worker;

		const channel = worker.client.getChannel(localTranscriptionChannelName);
		const proxy = ProxyChannel.toService<ILocalTranscriptionService>(channel, { disableMarshalling: true });
		this._workerEvents.clear();
		this._workerEvents.add(proxy.onDidChangeModelStatus(status => this._onDidChangeModelStatus.fire(status)));
		this._workerEvents.add(proxy.onDidTranscribe(result => this._onDidTranscribe.fire(result)));

		void worker.onDidTerminate.then(() => {
			if (this._worker.value === worker) {
				this._resetWorker();
			}
		});

		return channel;
	}

	private _getProxy(): ILocalTranscriptionService {
		if (!this._proxy) {
			this._proxy = ProxyChannel.toService<ILocalTranscriptionService>(this._getChannel(), { disableMarshalling: true });
		}
		return this._proxy;
	}

	getModelStatus() { return this._getProxy().getModelStatus(); }
	importModel(options: Parameters<ILocalTranscriptionService['importModel']>[0]) { return this._getProxy().importModel(options); }
	start(options: { cacheDir: string; model?: string; language?: string }) {
		const { proxyUrl, noProxy, proxyStrictSSL, proxyAuthorization } = this._resolveProxyConfig();
		const runtime = this.productService.dictationRuntime;
		return this._getProxy().start({
			cacheDir: options.cacheDir,
			model: options.model,
			language: options.language,
			proxyUrl,
			noProxy,
			proxyStrictSSL,
			proxyAuthorization,
			runtimeUrlTemplate: runtime?.urlTemplate,
			runtimeVersion: runtime?.version,
		});
	}
	pushAudio(chunk: Parameters<ILocalTranscriptionService['pushAudio']>[0]) { return this._getProxy().pushAudio(chunk); }
	stop() { return this._getProxy().stop(); }
	async cancel(): Promise<void> {
		const proxy = this._proxy;
		if (!proxy) {
			return;
		}
		const worker = this._detachWorker();
		if (!worker) {
			return;
		}
		try {
			await proxy.cancel();
		} finally {
			worker.dispose();
		}
	}

	private _detachWorker(): IUtilityProcessWorker | undefined {
		this._workerGeneration++;
		this._channel = undefined;
		this._proxy = undefined;
		this._workerEvents.clear();
		return this._worker.clearAndLeak();
	}

	private _resetWorker(): void {
		this._detachWorker()?.dispose();
	}

	override dispose(): void {
		this._workerGeneration++;
		super.dispose();
	}

	/**
	 * Read VS Code's `http.proxy`/`http.noProxy`/`http.proxyStrictSSL`/
	 * `http.proxyAuthorization` settings so the utility process can honor a proxy
	 * configured only in VS Code (not in the OS environment). Returns empty values
	 * when unset, in which case the process's inherited environment proxy still
	 * applies and TLS verification stays on.
	 */
	private _resolveProxyConfig(): { proxyUrl: string | undefined; noProxy: string | undefined; proxyStrictSSL: boolean | undefined; proxyAuthorization: string | undefined } {
		const proxyUrl = this.configurationService.getValue<string>('http.proxy')?.trim() || undefined;
		const noProxyList = this.configurationService.getValue<string[]>('http.noProxy');
		const noProxy = Array.isArray(noProxyList) && noProxyList.length ? noProxyList.join(',') : undefined;
		const strictSSL = this.configurationService.getValue<boolean>('http.proxyStrictSSL');
		const proxyStrictSSL = strictSSL === false ? false : undefined;
		const proxyAuthorization = this.configurationService.getValue<string>('http.proxyAuthorization')?.trim() || undefined;
		return { proxyUrl, noProxy, proxyStrictSSL, proxyAuthorization };
	}
}

registerSingleton(ILocalTranscriptionService, LocalTranscriptionService, InstantiationType.Delayed);
