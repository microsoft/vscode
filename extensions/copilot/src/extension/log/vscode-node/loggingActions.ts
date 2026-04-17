/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as tls from 'tls';
import * as util from 'util';
import * as vscode from 'vscode';

import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { IEnvService, isScenarioAutomation } from '../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { collectErrorMessages, collectSingleLineErrorMessage, ILogService, sanitizeNetworkErrorForTelemetry } from '../../../platform/log/common/logService';
import { outputChannel } from '../../../platform/log/vscode/outputChannelLogTarget';
import { FetchEvent, IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IFetcher, userAgentLibraryHeader } from '../../../platform/networking/common/networking';
import { NodeFetcher } from '../../../platform/networking/node/nodeFetcher';
import { NodeFetchFetcher } from '../../../platform/networking/node/nodeFetchFetcher';
import { ElectronFetcher } from '../../../platform/networking/vscode-node/electronFetcher';
import { getShadowedConfig } from '../../../platform/networking/vscode-node/fetcherServiceImpl';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';

import { shuffle } from '../../../util/vs/base/common/arrays';
import { timeout } from '../../../util/vs/base/common/async';
import { Disposable, MutableDisposable } from '../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { EXTENSION_ID } from '../../common/constants';

interface ProxyAgentLog {
	trace(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string | Error, ...args: any[]): void;
}

interface ProxyAgentParams {
	log: ProxyAgentLog;
	loadSystemCertificatesFromNode: () => boolean | undefined;
}

interface ProxyAgent {
	loadSystemCertificates?(params: ProxyAgentParams): Promise<string[]>;
	resolveProxyURL?(url: string): Promise<string | undefined>;
}

export class LoggingActionsContrib {
	constructor(
		@IVSCodeExtensionContext private readonly _context: IVSCodeExtensionContext,
		@IEnvService private envService: IEnvService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IAuthenticationService private readonly authService: IAuthenticationService,
		@ICAPIClientService private readonly capiClientService: ICAPIClientService,
		@IFetcherService private readonly fetcherService: IFetcherService,
		@ILogService private logService: ILogService,
	) {
		const collectDiagnostics = async () => {
			const document = await vscode.workspace.openTextDocument({ language: 'markdown' });
			const editor = await vscode.window.showTextDocument(document);
			const electronConfig = getShadowedConfig<boolean>(this.configurationService, this.experimentationService, ConfigKey.Shared.DebugUseElectronFetcher, ConfigKey.TeamInternal.DebugExpUseElectronFetcher);
			const nodeConfig = getShadowedConfig<boolean>(this.configurationService, this.experimentationService, ConfigKey.Shared.DebugUseNodeFetcher, ConfigKey.TeamInternal.DebugExpUseNodeFetcher);
			const nodeFetchConfig = getShadowedConfig<boolean>(this.configurationService, this.experimentationService, ConfigKey.Shared.DebugUseNodeFetchFetcher, ConfigKey.TeamInternal.DebugExpUseNodeFetchFetcher);
			const ext = vscode.extensions.getExtension(EXTENSION_ID);
			const product = require(path.join(vscode.env.appRoot, 'product.json'));
			await appendText(editor, `## GitHub Copilot Chat

- Extension: ${this.envService.getVersion()} (${this.envService.getBuildType()})
- VS Code: ${vscode.version} (${product.commit || 'out-of-source'})
- OS: ${os.platform()} ${os.release()} ${os.arch()}${vscode.env.remoteName ? `
- Remote Name: ${vscode.env.remoteName}` : ''}${vscode.env.remoteName && ext ? `
- Extension Kind: ${vscode.ExtensionKind[ext.extensionKind]}` : ''}
- GitHub Account: ${this.authService.anyGitHubSession?.account.label || 'Signed Out'}

## Network

User Settings:
\`\`\`json${getNetworkSettings()}
  "github.copilot.advanced.debug.useElectronFetcher": ${electronConfig},
  "github.copilot.advanced.debug.useNodeFetcher": ${nodeConfig},
  "github.copilot.advanced.debug.useNodeFetchFetcher": ${nodeFetchConfig}
\`\`\`${getProxyEnvVariables()}
`);
			const proxyAgent = loadVSCodeModule<ProxyAgent>('@vscode/proxy-agent');
			const loadSystemCertificatesFromNode = this.configurationService.getNonExtensionConfig<boolean>('http.systemCertificatesNode');
			const osCertificates = proxyAgent?.loadSystemCertificates ? await loadSystemCertificates(proxyAgent.loadSystemCertificates, loadSystemCertificatesFromNode, this.logService) : undefined;
			const urls = [
				this.capiClientService.dotcomAPIURL,
				this.capiClientService.capiPingURL,
				this.capiClientService.proxyBaseURL + '/_ping',
			];
			const isGHEnterprise = this.capiClientService.dotcomAPIURL !== 'https://api.github.com';
			const timeoutSeconds = 10;
			const electronFetcher = ElectronFetcher.create(this.envService);
			const electronCurrent = !!electronFetcher && electronConfig;
			const nodeCurrent = !electronCurrent && nodeConfig;
			const nodeFetchCurrent = !electronCurrent && !nodeCurrent && nodeFetchConfig;
			const nodeCurrentFallback = !electronCurrent && !nodeFetchCurrent;
			const activeFetcher = this.fetcherService.getUserAgentLibrary();
			const nodeFetcher = new NodeFetcher(this.envService);
			const fetchers = {
				['Electron fetch']: {
					fetcher: electronFetcher,
					current: electronCurrent,
				},
				['Node.js https']: {
					fetcher: nodeFetcher,
					current: nodeCurrent || nodeCurrentFallback,
				},
				['Node.js fetch']: {
					fetcher: new NodeFetchFetcher(this.envService),
					current: nodeFetchCurrent,
				},
			};
			const dnsLookup = util.promisify(dns.lookup);
			for (const url of urls) {
				const authHeaders = await this.getAuthHeaders(isGHEnterprise, url);
				const host = new URL(url).hostname;
				await appendText(editor, `\nConnecting to ${url}:\n`);
				for (const family of [4, 6]) {
					await appendText(editor, `- DNS ipv${family} Lookup: `);
					const start = Date.now();
					try {
						const dnsResult = await Promise.race([dnsLookup(host, { family }), timeout(timeoutSeconds * 1000)]);
						if (dnsResult) {
							await appendText(editor, `${dnsResult.address} (${Date.now() - start} ms)\n`);
						} else {
							await appendText(editor, `timed out after ${timeoutSeconds} seconds\n`);
						}
					} catch (err) {
						await appendText(editor, `Error (${Date.now() - start} ms): ${err?.message}\n`);
					}
				}
				let probeProxyURL: string | undefined;
				if (proxyAgent?.resolveProxyURL) {
					await appendText(editor, `- Proxy URL: `);
					const start = Date.now();
					try {
						const proxyURL = await Promise.race([proxyAgent.resolveProxyURL(url), timeoutAfter(timeoutSeconds * 1000)]);
						if (proxyURL === 'timeout') {
							await appendText(editor, `timed out after ${timeoutSeconds} seconds\n`);
						} else {
							await appendText(editor, `${proxyURL || 'None'} (${Date.now() - start} ms)\n`);
							probeProxyURL = proxyURL;
						}
					} catch (err) {
						await appendText(editor, `Error (${Date.now() - start} ms): ${err?.message}\n`);
					}
				}
				if (proxyAgent?.loadSystemCertificates && probeProxyURL?.startsWith('https:')) {
					const tlsOrig: typeof tls | undefined = (tls as any).__vscodeOriginal;
					if (tlsOrig) {
						await appendText(editor, `- Proxy TLS: `);
						if (!osCertificates) {
							await appendText(editor, `(failed to load system certificates) `);
						}
						const start = Date.now();
						try {
							const result = await Promise.race([tlsConnect(tlsOrig, probeProxyURL, [...tls.rootCertificates, ...(osCertificates || [])]), timeout(timeoutSeconds * 1000)]);
							if (result) {
								await appendText(editor, `${result} (${Date.now() - start} ms)\n`);
							} else {
								await appendText(editor, `timed out after ${timeoutSeconds} seconds\n`);
							}
						} catch (err) {
							await appendText(editor, `Error (${Date.now() - start} ms): ${err?.message}\n`);
						}
					}
				}
				if (probeProxyURL) {
					const httpx: typeof https | typeof http | undefined = probeProxyURL.startsWith('https:') ? (https as any).__vscodeOriginal : (http as any).__vscodeOriginal;
					if (httpx) {
						await appendText(editor, `- Proxy Connection: `);
						const start = Date.now();
						try {
							const result = await Promise.race([proxyConnect(httpx, probeProxyURL, url), timeout(timeoutSeconds * 1000)]);
							if (result) {
								const headers = Object.keys(result.headers).map(header => `\n	${header}: ${result.headers[header]}`);
								const text = `${result.statusCode} ${result.statusMessage}${headers.join('')}`;
								await appendText(editor, `${text} (${Date.now() - start} ms)\n`);
							} else {
								await appendText(editor, `timed out after ${timeoutSeconds} seconds\n`);
							}
						} catch (err) {
							await appendText(editor, `Error (${Date.now() - start} ms): ${err?.message}\n`);
						}
					}
				}
				for (const [name, fetcher] of Object.entries(fetchers)) {
					await appendText(editor, `- ${name}${fetcher.current ? ' (configured)' : fetcher.fetcher?.getUserAgentLibrary() === activeFetcher ? ' (active)' : ''}: `);
					if (fetcher.fetcher) {
						const start = Date.now();
						try {
							const response = await Promise.race([fetcher.fetcher.fetch(url, { headers: authHeaders, callSite: 'diagnostics-fetcher-probe' }), timeout(timeoutSeconds * 1000)]);
							if (response) {
								await appendText(editor, `HTTP ${response.status} (${Date.now() - start} ms)\n`);
							} else {
								await appendText(editor, `timed out after ${timeoutSeconds} seconds\n`);
							}
						} catch (err) {
							await appendText(editor, `Error (${Date.now() - start} ms): ${collectErrorMessages(err)}\n`);
						}
					} else {
						await appendText(editor, 'Unavailable\n');
					}
				}
			}

			const currentFetcher = Object.values(fetchers).find(fetcher => fetcher.current)?.fetcher || nodeFetcher;
			const secondaryUrls = [
				{ url: 'https://mobile.events.data.microsoft.com', fetcher: currentFetcher },
				{ url: 'https://dc.services.visualstudio.com', fetcher: currentFetcher },
				{ url: 'https://copilot-telemetry.githubusercontent.com/_ping', fetcher: nodeFetcher },
				{ url: vscode.Uri.parse(this.capiClientService.copilotTelemetryURL).with({ path: '/_ping' }).toString(), fetcher: nodeFetcher },
				{ url: 'https://default.exp-tas.com', fetcher: nodeFetcher },
			];
			await appendText(editor, `\n`);
			for (const { url, fetcher } of secondaryUrls) {
				const authHeaders = await this.getAuthHeaders(isGHEnterprise, url);
				await appendText(editor, `Connecting to ${url}: `);
				const start = Date.now();
				try {
					const response = await Promise.race([fetcher.fetch(url, { headers: authHeaders, callSite: 'diagnostics-secondary-probe' }), timeout(timeoutSeconds * 1000)]);
					if (response) {
						await appendText(editor, `HTTP ${response.status} (${Date.now() - start} ms)\n`);
					} else {
						await appendText(editor, `timed out after ${timeoutSeconds} seconds\n`);
					}
				} catch (err) {
					await appendText(editor, `Error (${Date.now() - start} ms): ${collectErrorMessages(err)}\n`);
				}
			}
			await appendText(editor, `\nNumber of system certificates: ${osCertificates?.length ?? 'failed to load'}\n`);
			await appendText(editor, `
## Documentation

In corporate networks: [Troubleshooting firewall settings for GitHub Copilot](https://docs.github.com/en/copilot/troubleshooting-github-copilot/troubleshooting-firewall-settings-for-github-copilot).`);

			return document.getText();
		};
		this._context.subscriptions.push(vscode.commands.registerCommand('github.copilot.debug.collectDiagnostics', collectDiagnostics));
		// Internal command is not declared in package.json so it can be used from the welcome views while the extension is being activated.
		this._context.subscriptions.push(vscode.commands.registerCommand('github.copilot.debug.collectDiagnostics.internal', collectDiagnostics));
		this._context.subscriptions.push(vscode.commands.registerCommand('github.copilot.debug.showOutputChannel.internal', () => outputChannel.show()));
		this._context.subscriptions.push(new NetworkStatus(this.fetcherService, this.configurationService, this.experimentationService));
	}

	private async getAuthHeaders(isGHEnterprise: boolean, url: string) {
		const authHeaders: Record<string, string> = {};
		if (isGHEnterprise) {
			let token = '';
			if (url === this.capiClientService.dotcomAPIURL) {
				token = this.authService.anyGitHubSession?.accessToken || '';
			} else {
				try {
					token = (await this.authService.getCopilotToken()).token;
				} catch (_err) {
					// Ignore error
					token = '';
				}
			}
			authHeaders['Authorization'] = `Bearer ${token}`;
		}
		return authHeaders;
	}
}

async function appendText(editor: vscode.TextEditor, string: string) {
	await editor.edit(builder => {
		builder.insert(editor.document.lineAt(editor.document.lineCount - 1).range.end, string);
	});
}

function timeoutAfter(ms: number) {
	return new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), ms));
}

function loadVSCodeModule<T>(moduleName: string): T | undefined {
	const appRoot = vscode.env.appRoot;
	try {
		return require(`${appRoot}/node_modules.asar/${moduleName}`);
	} catch (err) {
		// Not in ASAR.
	}
	try {
		return require(`${appRoot}/node_modules/${moduleName}`);
	} catch (err) {
		// Not available.
	}
	return undefined;
}

async function loadSystemCertificates(load: NonNullable<ProxyAgent['loadSystemCertificates']>, loadSystemCertificatesFromNode: boolean | undefined, logService: ILogService): Promise<(string | Buffer)[] | undefined> {
	try {
		const certificates = await load({
			log: {
				trace(message: string, ..._args: any[]) {
					logService.trace(message);
				},
				debug(message: string, ..._args: any[]) {
					logService.debug(message);
				},
				info(message: string, ..._args: any[]) {
					logService.info(message);
				},
				warn(message: string, ..._args: any[]) {
					logService.warn(message);
				},
				error(message: string | Error, ..._args: any[]) {
					logService.error(typeof message === 'string' ? message : String(message));
				},
			} satisfies ProxyAgentLog,
			loadSystemCertificatesFromNode: () => loadSystemCertificatesFromNode,
		});
		return Array.isArray(certificates) ? certificates : undefined;
	} catch (err) {
		logService.error(err);
		return undefined;
	}
}

async function tlsConnect(tlsOrig: typeof tls, proxyURL: string, ca: (string | Buffer)[]) {
	return new Promise<string>((resolve, reject) => {
		const proxyUrlObj = new URL(proxyURL);
		const socket = tlsOrig.connect({
			host: proxyUrlObj.hostname,
			port: parseInt(proxyUrlObj.port, 10),
			servername: proxyUrlObj.hostname,
			ca,
		}, () => {
			socket.end();
			resolve('Succeeded');
		});
		socket.on('error', reject);
	});
}

async function proxyConnect(httpx: typeof https | typeof http, proxyUrl: string, targetUrl: string, sanitize = false) {
	return new Promise<{ statusCode: number | undefined; statusMessage: string | undefined; headers: Record<string, string | string[]> }>((resolve, reject) => {
		const proxyUrlObj = new URL(proxyUrl);
		const targetUrlObj = new URL(targetUrl);
		const targetHost = `${targetUrlObj.hostname}:${targetUrlObj.port || (targetUrlObj.protocol === 'https:' ? 443 : 80)}`;
		const options = {
			method: 'CONNECT',
			host: proxyUrlObj.hostname,
			port: proxyUrlObj.port,
			path: targetHost,
			headers: {
				Host: targetHost,
			},
			rejectUnauthorized: false,
		};
		const req = httpx.request(options);
		req.on('connect', (res, socket, head) => {
			const headers = ['proxy-authenticate', 'proxy-agent', 'server', 'via'].reduce((acc, header) => {
				const value = res.headers[header];
				if (value) {
					const doSanitize = sanitize && !['proxy-agent', 'server'].includes(header);
					acc[header] = doSanitize ? Array.isArray(value) ? value.map(sanitizeValue) : sanitizeValue(value) : value;
				}
				return acc;
			}, {} as Record<string, string | string[]>);
			socket.end();
			resolve({ statusCode: res.statusCode, statusMessage: res.statusMessage, headers });
		});
		req.on('error', reject);
		req.end();
	});
}

const networkSettingsIds = [
	'http.proxy',
	'http.noProxy',
	'http.proxyAuthorization',
	'http.proxyStrictSSL',
	'http.proxySupport',
	'http.electronFetch',
	'http.fetchAdditionalSupport',
	'http.proxyKerberosServicePrincipal',
	'http.systemCertificates',
	'http.systemCertificatesNode',
	'http.experimental.systemCertificatesV2',
	'http.useLocalProxyConfiguration',
];
const alwaysShowSettingsIds = [
	'http.systemCertificatesNode',
];

function getNetworkSettings() {
	const configuration = vscode.workspace.getConfiguration();
	return networkSettingsIds.map(key => {
		const i = configuration.inspect(key);
		const v = configuration.get(key, i?.defaultValue);
		if (alwaysShowSettingsIds.includes(key) || v !== i?.defaultValue && !(Array.isArray(v) && Array.isArray(i?.defaultValue) && v.length === 0 && i?.defaultValue.length === 0)) {
			return `\n  "${key}": ${JSON.stringify(v)},`;
		}
		return '';
	}).join('');
}

function getProxyEnvVariables() {
	const res = [];
	const envVars = ['http_proxy', 'https_proxy', 'ftp_proxy', 'all_proxy', 'no_proxy'];
	for (const env in process.env) {
		if (envVars.includes(env.toLowerCase())) {
			res.push(`\n- ${env}=${process.env[env]}`);
		}
	}
	return res.length ? `\n\nEnvironment Variables:${res.join('')}` : '';
}

export class FetcherTelemetryContribution {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		instantiationService.invokeFunction(collectFetcherTelemetry);
	}
}

function collectFetcherTelemetry(accessor: ServicesAccessor): void {
	const extensionContext = accessor.get(IVSCodeExtensionContext);
	const envService = accessor.get(IEnvService);
	const logService = accessor.get(ILogService);
	const configurationService = accessor.get(IConfigurationService);
	const expService = accessor.get(IExperimentationService);

	if (!vscode.env.isTelemetryEnabled || extensionContext.extensionMode !== vscode.ExtensionMode.Production || isScenarioAutomation) {
		return;
	}

	if (!configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.DebugCollectFetcherTelemetry, expService)) {
		return;
	}

	const now = Date.now();
	const previous = extensionContext.globalState.get<number>('lastCollectFetcherTelemetryTime', 0);
	if (now - previous < 5 * 60 * 1000) {
		logService.debug(`Send fetcher telemetry: Skipped.`);
		return;
	}

	(async () => {
		await extensionContext.globalState.update('lastCollectFetcherTelemetryTime', now);

		logService.debug(`Send fetcher telemetry: Exclude other windows.`);
		const windowUUID = generateUuid();
		await extensionContext.globalState.update('lastCollectFetcherTelemetryUUID', windowUUID);
		await timeout(5000);
		if (extensionContext.globalState.get<string>('lastCollectFetcherTelemetryUUID') !== windowUUID) {
			logService.debug(`Send fetcher telemetry: Other window won.`);
			return;
		}
		logService.debug(`Send fetcher telemetry: This window won.`);

		const fetchers = [
			ElectronFetcher.create(envService),
			new NodeFetchFetcher(envService),
			new NodeFetcher(envService),
		].filter(fetcher => fetcher) as IFetcher[];

		// Randomize to offset any order dependency in telemetry.
		shuffle(fetchers);

		// First loop: probe each fetcher with an empty body to collect connectivity results.
		const probeResults: Record<string, string> = {};
		for (const fetcher of fetchers) {
			const library = fetcher.getUserAgentLibrary();
			const key = library.replace(/-/g, '');
			const requestStartTime = Date.now();
			try {
				const response = await sendRawTelemetry(fetcher, envService, extensionContext, 'GitHub.copilot-chat/fetcherTelemetryProbe', {});
				probeResults[key] = `Status: ${response.status}`;
				logService.debug(`Fetcher telemetry probe: ${library} ${probeResults[key]} (${Date.now() - requestStartTime}ms)`);
			} catch (e) {
				probeResults[key] = `Error: ${sanitizeNetworkErrorForTelemetry(collectSingleLineErrorMessage(e, true))}`;
				logService.debug(`Fetcher telemetry probe: ${library} ${probeResults[key]} (${Date.now() - requestStartTime}ms)`);
			}
		}

		// Second loop: send the actual telemetry event including probe results.
		const requestGroupId = generateUuid();
		const extensionKind = extensionContext.extension.extensionKind === vscode.ExtensionKind.UI ? 'local' : 'remote';
		for (const fetcher of fetchers) {
			const requestStartTime = Date.now();
			try {
				/* __GDPR__
					"fetcherTelemetry" : {
						"owner": "chrmarti",
						"comment": "Telemetry event to test connectivity of different fetcher implementations.",
						"requestGroupId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id to group requests from the same run." },
						"clientLibrary": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The fetcher library used for this request." },
						"extensionKind": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the extension runs locally or remotely." },
						"remoteName": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The remote name, if any." },
						"electronfetch": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Probe result for the electron-fetch fetcher." },
						"nodefetch": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Probe result for the node-fetch fetcher." },
						"nodehttp": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Probe result for the node-http fetcher." }
					}
				*/
				const properties: Record<string, string> = {
					requestGroupId,
					clientLibrary: fetcher.getUserAgentLibrary(),
					extensionKind,
					remoteName: vscode.env.remoteName ?? 'none',
					...probeResults,
				};
				const response = await sendRawTelemetry(fetcher, envService, extensionContext, 'GitHub.copilot-chat/fetcherTelemetry', properties);

				logService.debug(`Fetcher telemetry: Succeeded in ${Date.now() - requestStartTime}ms using ${fetcher.getUserAgentLibrary()} with status ${response.status} (${response.statusText}).`);
			} catch (e) {
				logService.debug(`Fetcher telemetry: Failed in ${Date.now() - requestStartTime}ms using ${fetcher.getUserAgentLibrary()}.`);
			}
		}
	})().catch(err => {
		logService.error(err);
	});
}

async function sendRawTelemetry(fetcher: IFetcher, envService: IEnvService, extensionContext: IVSCodeExtensionContext, eventName: string, properties: Record<string, string>) {
	const url = 'https://mobile.events.data.microsoft.com/OneCollector/1.0?cors=true&content-type=application/x-json-stream';
	const product = require(path.join(vscode.env.appRoot, 'product.json'));
	const vscodeCommitHash: string = product.commit || '';
	const ariaKey = (extensionContext.extension.packageJSON as { ariaKey?: string }).ariaKey ?? '';
	const iKey = `o:${ariaKey.split('-')[0]}`;
	const sdkVer = '1DS-Web-JS-4.3.10';
	const eventTime = new Date(Date.now() - 10).toISOString();
	const event = {
		name: eventName,
		time: eventTime,
		ver: '4.0',
		iKey,
		ext: {
			sdk: { ver: sdkVer },
			web: { consentDetails: '{"GPC_DataSharingOptIn":false}' },
		},
		data: {
			baseData: {
				name: eventName,
				properties: {
					...properties,
					'abexp.assignmentcontext': '',
					'common.os': os.platform(),
					'common.nodeArch': os.arch(),
					'common.platformversion': os.release(),
					'common.telemetryclientversion': '1.5.0',
					'common.extname': EXTENSION_ID,
					'common.extversion': envService.getVersion(),
					'common.vscodemachineid': envService.machineId,
					'common.vscodesessionid': envService.sessionId,
					'common.vscodecommithash': vscodeCommitHash,
					'common.sqmid': '',
					'common.devDeviceId': envService.devDeviceId,
					'common.vscodeversion': envService.vscodeVersion,
					'common.vscodereleasedate': product.date || 'unknown',
					'common.isnewappinstall': vscode.env.isNewAppInstall,
					'common.product': envService.uiKind,
					'common.uikind': envService.uiKind,
					'common.remotename': envService.remoteName ?? 'none',
					'version': 'PostChannel=4.3.10',
				},
			},
		},
	};
	const body = JSON.stringify(event);
	const headers: Record<string, string> = {
		'Client-Id': 'NO_AUTH',
		'client-version': sdkVer,
		'apikey': ariaKey,
		'upload-time': String(Date.now()),
		'time-delta-to-apply-millis': 'use-collector-delta',
		'cache-control': 'no-cache, no-store',
		'content-type': 'application/x-json-stream',
		'User-Agent': `GitHubCopilotChat/${envService.getVersion()}`,
		[userAgentLibraryHeader]: fetcher.getUserAgentLibrary(),
	};
	if (fetcher.getUserAgentLibrary() === NodeFetcher.ID) {
		headers['content-length'] = String(Buffer.byteLength(body));
	}
	const response = await fetcher.fetch(url, {
		method: 'POST',
		headers,
		body,
		callSite: 'diagnostics-telemetry-probe',
	});
	await response.text();
	return response;
}

const ids_paths = /(^|\b)[\p{L}\p{Nd}]+((=""?[^"]+""?)|(([.:=/"_-]+[\p{L}\p{Nd}]+)+))(\b|$)/giu;
export function sanitizeValue(input: string | undefined): string {
	return (input || '').replace(ids_paths, (m) => maskByClass(m));
}

function maskByClass(s: string): string {
	if (/^net::[A-Z_]+$/.test(s) || ['dev-container', 'attached-container', 'k8s-container', 'ssh-remote'].includes(s)) {
		return s;
	}
	return s.replace(/\p{Lu}|\p{Ll}|\p{Nd}/gu, (ch) => {
		if (/\p{Lu}/u.test(ch)) {
			return 'A';
		}
		if (/\p{Ll}/u.test(ch)) {
			return 'a';
		}
		return '0';
	});
}

class NetworkStatus extends Disposable {

	private readonly _statusBarItem: vscode.StatusBarItem;
	private readonly _events: FetchEvent[] = [];
	private readonly _fetchSubscription = this._register(new MutableDisposable());

	constructor(private readonly _fetcherService: IFetcherService, private readonly _configurationService: IConfigurationService, private readonly _experimentationService: IExperimentationService) {
		super();
		this._statusBarItem = this._register(vscode.window.createStatusBarItem('copilot.networkStatus', vscode.StatusBarAlignment.Right, -1000));
		this._statusBarItem.name = 'Copilot Network Status';
		this._register(_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ConfigKey.TeamInternal.DebugShowNetworkStatus.fullyQualifiedId)) {
				this._update();
			}
		}));
		this._update();
	}

	private _isEnabled(): boolean {
		return this._configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.DebugShowNetworkStatus, this._experimentationService);
	}

	private _onEvent(event: FetchEvent): void {
		this._events.push(event);
		const cutoff = Date.now() - 5 * 60 * 1000;
		while (this._events.length > 0 && this._events[0].timestamp < cutoff) {
			this._events.shift();
		}
		this._update();
	}

	private _update(): void {
		const enabled = this._isEnabled();
		if (enabled && !this._fetchSubscription.value) {
			this._fetchSubscription.value = this._fetcherService.onDidFetch(e => this._onEvent(e));
		} else if (!enabled) {
			this._fetchSubscription.value = undefined;
			this._events.length = 0;
			this._statusBarItem.hide();
			return;
		}
		const latestById = new Map<string, FetchEvent>();
		for (const e of this._events) {
			latestById.set(e.internalId, e);
		}
		const latest = [...latestById.values()];
		const errors = latest.filter(e => e.outcome === 'error');
		this._statusBarItem.text = `Copilot Network: ${errors.length} errors / ${latest.length} total`;

		const byHostname = new Map<string, { total: number; errors: number; cancellations: number }>();
		for (const e of latest) {
			let entry = byHostname.get(e.hostname);
			if (!entry) {
				entry = { total: 0, errors: 0, cancellations: 0 };
				byHostname.set(e.hostname, entry);
			}
			entry.total++;
			if (e.outcome === 'error') {
				entry.errors++;
			} else if (e.outcome === 'cancel') {
				entry.cancellations++;
			}
		}
		const tooltip = new vscode.MarkdownString();
		tooltip.appendMarkdown(`| Hostname | Errors | Cancellations | Total |\n`);
		tooltip.appendMarkdown(`|:--|--:|--:|--:|\n`);
		for (const [hostname, { total, errors, cancellations }] of [...byHostname].sort((a, b) => b[1].total - a[1].total)) {
			tooltip.appendMarkdown(`| ${hostname} | ${errors} | ${cancellations} | ${total} |\n`);
		}
		tooltip.appendMarkdown(`\n**${errors.length}** of **${latest.length}** network requests failed in the last 5 minutes`);
		this._statusBarItem.tooltip = tooltip;

		this._statusBarItem.show();
	}
}
