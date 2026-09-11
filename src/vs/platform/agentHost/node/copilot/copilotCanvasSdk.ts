/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClientOptions } from '@github/copilot-sdk';
import { stat } from 'fs/promises';
import { fileURLToPath } from 'url';
import { Schemas } from '../../../../base/common/network.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { isObject } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { isLocalCanvasDevelopmentPlatform } from '../../common/agentHostCanvasPackages.js';
import { AgentHostLaunchKind, AgentHostLaunchKindEnvVar } from '../../common/agentHostTelemetry.js';
import type { CopilotCanvasLaunchAuthority } from './copilotCanvasLaunchAuthority.js';
import type { ICopilotClient, ICopilotSession } from './copilotSdkTypes.js';

export const LocalCanvasSdkEntryEnvVar = 'VSCODE_LOCAL_CANVAS_SDK_ENTRY';
export const LocalCanvasSdkBridgeEnvVar = 'VSCODE_LOCAL_CANVAS_SDK_BRIDGE';
export const LocalCanvasRuntimeCliEnvVar = 'VSCODE_LOCAL_CANVAS_RUNTIME_CLI';

export interface ICopilotCanvasSdkConfiguration {
	readonly sdkEntry: string;
	readonly bridgeEntry: string;
	readonly runtimeCli: string;
}

interface IExtensionLaunchProfile {
	readonly executable: string;
	readonly args: string[];
	readonly env: Record<string, string | undefined>;
}

/** The public v1 launch request; identity and the default bootstrap are supplied by the runtime. */
export interface ICopilotCanvasLaunchRequest {
	readonly id: string;
	readonly name: string;
	readonly modulePath: string;
	readonly source: Awaited<ReturnType<ICopilotSession['rpc']['extensions']['list']>>['extensions'][number]['source'];
	readonly sessionId?: string;
	readonly defaultLaunch?: IExtensionLaunchProfile;
}

export type CopilotCanvasLaunchProvider = (request: ICopilotCanvasLaunchRequest) => Promise<{ launch: IExtensionLaunchProfile | null }>;

export type CopilotCanvasClientOptions = Pick<CopilotClientOptions, 'useLoggedInUser' | 'env' | 'workingDirectory' | 'baseDirectory' | 'telemetry' | 'logLevel' | 'enableRemoteSessions' | 'onGetTraceContext' | 'onGitHubTelemetry'>;

/** The structural public module contract of the locally built canvas SDK. */
export interface ICopilotCanvasSdkModule {
	readonly sdkEntry: string;
	createClient(runtimeCli: string, options: CopilotCanvasClientOptions, resolve: CopilotCanvasLaunchProvider): ICopilotCanvasClientBridge;
}

export interface ICopilotCanvasClientBridge {
	readonly client: ICopilotClient;
	start(): Promise<void>;
	retain(session: ICopilotSession): Promise<void>;
}

export function readCopilotCanvasSdkConfiguration(isBuilt: boolean, environment: NodeJS.ProcessEnv = process.env, hostPlatform = process.platform, architecture = process.arch): ICopilotCanvasSdkConfiguration | undefined {
	if (isBuilt || environment[AgentHostLaunchKindEnvVar] !== AgentHostLaunchKind.VSCodeMainProcess || !isLocalCanvasDevelopmentPlatform(hostPlatform, architecture)) {
		return undefined;
	}
	const sdkEntry = environment[LocalCanvasSdkEntryEnvVar];
	const bridgeEntry = environment[LocalCanvasSdkBridgeEnvVar];
	const runtimeCli = environment[LocalCanvasRuntimeCliEnvVar];
	if (!sdkEntry && !bridgeEntry && !runtimeCli) {
		return undefined;
	}
	if (!sdkEntry || !bridgeEntry || !runtimeCli || !isAbsolute(runtimeCli)) {
		throw new Error(localize('copilot.canvasSdk.entriesRequired', "Local canvas development requires explicit SDK and bridge file URLs and an absolute runtime CLI path."));
	}
	for (const entry of [sdkEntry, bridgeEntry]) {
		const url = new URL(entry);
		if (url.protocol !== `${Schemas.file}:` || url.host || url.search || url.hash || !isAbsolute(fileURLToPath(url))) {
			throw new Error(localize('copilot.canvasSdk.localEntriesRequired', "Local canvas development entries must be absolute local file URLs."));
		}
	}
	return { sdkEntry: new URL(sdkEntry).href, bridgeEntry: new URL(bridgeEntry).href, runtimeCli };
}

function isCanvasSdkModule(value: unknown): value is ICopilotCanvasSdkModule {
	return isObject(value) && 'sdkEntry' in value && typeof value.sdkEntry === 'string'
		&& 'createClient' in value && typeof value.createClient === 'function';
}

export async function loadCopilotCanvasSdk(configuration: ICopilotCanvasSdkConfiguration): Promise<ICopilotCanvasSdkModule> {
	for (const path of [fileURLToPath(configuration.sdkEntry), fileURLToPath(configuration.bridgeEntry), configuration.runtimeCli]) {
		if (!(await stat(path)).isFile()) {
			throw new Error(localize('copilot.canvasSdk.filesRequired', "The local canvas SDK and runtime entries must be files."));
		}
	}
	const module: unknown = await import(configuration.bridgeEntry);
	if (!isCanvasSdkModule(module) || module.sdkEntry !== configuration.sdkEntry) {
		throw new Error(localize('copilot.canvasSdk.incompatibleBridge', "The selected canvas bridge was not built for this public development SDK entry."));
	}
	return module;
}

export function createCopilotCanvasClient(
	sdk: ICopilotCanvasSdkModule,
	configuration: ICopilotCanvasSdkConfiguration,
	options: CopilotCanvasClientOptions,
	resolve: CopilotCanvasLaunchProvider,
): ICopilotCanvasClientBridge {
	return sdk.createClient(configuration.runtimeCli, options, resolve);
}

export function createCopilotCanvasLaunchProvider(authority: Pick<CopilotCanvasLaunchAuthority, 'resolve'>, isCurrent: () => boolean): CopilotCanvasLaunchProvider {
	return async request => {
		if (!isCurrent() || !request.sessionId || !request.id || !request.modulePath || !request.defaultLaunch) {
			return { launch: null };
		}
		const launch = await authority.resolve(request.sessionId, request.id, request.modulePath);
		if (!launch || !isCurrent()) {
			return { launch: null };
		}
		return {
			launch: {
				...request.defaultLaunch,
				env: { ...request.defaultLaunch.env, VSCODE_CANVAS_DATA_DIR: launch.dataDirectory.fsPath },
			},
		};
	};
}
