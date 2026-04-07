/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ChatFetchResponseType } from '../../../platform/chat/common/commonTypes';
import { JsonSchema } from '../../../platform/configuration/common/jsonSchema';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { createSha256Hash } from '../../../util/common/crypto';
import { extractCodeBlocks } from '../../../util/common/markdown';
import { mapFindFirst } from '../../../util/vs/base/common/arraysFind';
import { DeferredPromise, raceCancellation } from '../../../util/vs/base/common/async';
import { CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { Disposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { cloneAndChange } from '../../../util/vs/base/common/objects';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatLocation as VsCodeChatLocation } from '../../../vscodeTypes';
import { Conversation, Turn } from '../../prompt/common/conversation';
import { McpToolCallingLoop } from './mcpToolCallingLoop';
import { McpPickRef } from './mcpToolCallingTools';
import { IInstallableMcpServer, IMcpServerVariable, IMcpStdioServerConfiguration, NuGetMcpSetup } from './nuget';

export type PackageType = 'npm' | 'pip' | 'docker' | 'nuget';

export interface IValidatePackageArgs {
	type: PackageType;
	name: string;
	targetConfig: JsonSchema;
}

interface PromptStringInputInfo {
	id: string;
	type: 'promptString';
	description: string;
	default?: string;
	password?: boolean;
}

export interface IPendingSetupArgs {
	name: string;
	version?: string;
	readme?: string;
	getMcpServer?(installConsent: Promise<void>): Promise<Omit<IInstallableMcpServer, 'name'> | undefined>;
}

export const enum ValidatePackageErrorType {
	NotFound = 'NotFound',
	UnknownPackageType = 'UnknownPackageType',
	UnhandledError = 'UnhandledError',
	MissingCommand = 'MissingCommand',
	BadCommandVersion = 'BadCommandVersion',
}

const enum FlowFinalState {
	Done = 'Done',
	Failed = 'Failed',
	NameMismatch = 'NameMismatch',
}

// contract with https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/mcp/browser/mcpCommandsAddConfiguration.ts
export type ValidatePackageResult =
	{ state: 'ok'; publisher: string; name?: string; version?: string } & IPendingSetupArgs
	| { state: 'error'; error: string; helpUri?: string; helpUriLabel?: string; errorType: ValidatePackageErrorType };

type AssistedServerConfiguration = {
	type: 'assisted';
	name?: string;
	server: any;
	inputs: PromptStringInputInfo[];
	inputValues: Record<string, string> | undefined;
} | {
	type: 'mapped';
	name?: string;
	server: Omit<IMcpStdioServerConfiguration, 'type'>;
	inputs?: IMcpServerVariable[];
};

interface NpmPackageResponse {
	maintainers?: Array<{ name: string }>;
	readme?: string;
	'dist-tags'?: { latest?: string };
}

interface PyPiPackageResponse {
	info?: {
		author?: string;
		author_email?: string;
		description?: string;
		name?: string;
		version?: string;
	};
}

interface DockerHubResponse {
	user?: string;
	name?: string;
	namespace?: string;
	description?: string;
	full_description?: string;
}

export class McpSetupCommands extends Disposable {
	private pendingSetup?: {
		cts: CancellationTokenSource;
		canPrompt: DeferredPromise<void>;
		done: Promise<AssistedServerConfiguration | undefined>;
		stopwatch: StopWatch; // since the validation began, may include waiting for the user,
		validateArgs: IValidatePackageArgs;
		pendingArgs: IPendingSetupArgs;
	};

	constructor(
		@ITelemetryService readonly telemetryService: ITelemetryService,
		@ILogService readonly logService: ILogService,
		@IFetcherService readonly fetcherService: IFetcherService,
		@IInstantiationService readonly instantiationService: IInstantiationService,
	) {
		super();
		this._register(toDisposable(() => this.pendingSetup?.cts.dispose(true)));
		this._register(vscode.commands.registerCommand('github.copilot.chat.mcp.setup.flow', async (args: { name: string }) => {
			let finalState = FlowFinalState.Failed;
			let result;
			try {
				// allow case-insensitive comparison
				if (this.pendingSetup?.pendingArgs.name.toUpperCase() !== args.name.toUpperCase()) {
					finalState = FlowFinalState.NameMismatch;
					vscode.window.showErrorMessage(vscode.l10n.t("Failed to generate MCP server configuration with a matching package name. Expected '{0}' but got '{1}' from generated configuration.", args.name, this.pendingSetup?.pendingArgs.name ?? ''));
					return undefined;
				}

				this.pendingSetup.canPrompt.complete(undefined);
				result = await this.pendingSetup.done;
				finalState = FlowFinalState.Done;
				return result;
			} finally {
				/* __GDPR__
					"mcp.setup.flow" : {
						"owner": "joelverhagen",
						"comment": "Reports the result of the agent-assisted MCP server installation",
						"finalState": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The final state of the installation (e.g., 'Done', 'Failed')" },
						"configurationType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Generic configuration typed produced by the installation" },
						"packageType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Package type (e.g., npm)" },
						"packageName": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Package name used for installation" },
						"packageVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Package version" },
						"durationMs": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Duration of the installation process in milliseconds" }
					}
				*/
				this.telemetryService.sendMSFTTelemetryEvent('mcp.setup.flow', {
					finalState: finalState,
					configurationType: result?.type,
					packageType: this.pendingSetup?.validateArgs.type,
					packageName: await this.lowerHash(this.pendingSetup?.pendingArgs.name || args.name),
					packageVersion: this.pendingSetup?.pendingArgs.version,
				}, {
					durationMs: this.pendingSetup?.stopwatch.elapsed() ?? -1
				});
			}
		}));
		this._register(vscode.commands.registerCommand('github.copilot.chat.mcp.setup.validatePackage', async (args: IValidatePackageArgs): Promise<ValidatePackageResult> => {
			const sw = new StopWatch();
			const result = await McpSetupCommands.validatePackageRegistry(args, this.logService, this.fetcherService);
			if (result.state === 'ok') {
				this.enqueuePendingSetup(args, result, sw);
			}

			/* __GDPR__
				"mcp.setup.validatePackage" : {
					"owner": "joelverhagen",
					"comment": "Reports success or failure of agent-assisted MCP server validation step",
					"state": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Validation state of the package" },
					"packageType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Package type (e.g., npm)" },
					"packageName": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Package name used for installation" },
					"packageVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Package version" },
					"errorType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Generic type of error encountered during validation" },
					"durationMs": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Duration of the validation process in milliseconds" }
				}
			*/
			this.telemetryService.sendMSFTTelemetryEvent(
				'mcp.setup.validatePackage',
				result.state === 'ok' ?
					{
						state: result.state,
						packageType: args.type,
						packageName: await this.lowerHash(result.name || args.name),
						packageVersion: result.version
					} :
					{
						state: result.state,
						packageType: args.type,
						packageName: await this.lowerHash(args.name),
						errorType: result.errorType
					},
				{ durationMs: sw.elapsed() });

			// return the minimal result to avoid leaking implementation details
			// not all package information is needed to request consent to install the package
			return result.state === 'ok' ?
				{ state: 'ok', publisher: result.publisher, name: result.name, version: result.version } :
				{ state: 'error', error: result.error, helpUri: result.helpUri, helpUriLabel: result.helpUriLabel, errorType: result.errorType };
		}));
		this._register(vscode.commands.registerCommand('github.copilot.chat.mcp.setup.check', () => {
			return 1;
		}));
	}

	private async lowerHash(input: string | undefined) {
		return input ? await createSha256Hash(input.toLowerCase()) : undefined;
	}

	private async enqueuePendingSetup(validateArgs: IValidatePackageArgs, pendingArgs: IPendingSetupArgs, sw: StopWatch) {
		const cts = new CancellationTokenSource();
		const canPrompt = new DeferredPromise<void>();
		const pickRef = new McpPickRef(raceCancellation(canPrompt.p, cts.token));

		// we start doing the prompt in the background so the first call is speedy
		const done = (async () => {

			// if the package has a server manifest, we can fetch it and use it instead of a tool loop
			if (pendingArgs.getMcpServer) {
				let mcpServer: Omit<IInstallableMcpServer, 'name'> | undefined;
				try {
					mcpServer = await pendingArgs.getMcpServer(canPrompt.p);
				} catch (error) {
					this.logService.warn(`Unable to fetch MCP server configuration for ${validateArgs.type} package ${pendingArgs.name}@${pendingArgs.version}. Configuration will be generated from the package README.
Error: ${error}`);
				}

				if (mcpServer) {
					return {
						type: 'mapped' as const,
						name: pendingArgs.name,
						server: mcpServer.config as Omit<IMcpStdioServerConfiguration, 'type'>,
						inputs: mcpServer.inputs
					};
				}
			}

			const fakePrompt = `Generate an MCP configuration for ${validateArgs.name}`;
			const mcpLoop = this.instantiationService.createInstance(McpToolCallingLoop, {
				toolCallLimit: 100, // limited via `getAvailableTools` in the loop
				conversation: new Conversation(generateUuid(), [new Turn(undefined, { type: 'user', message: fakePrompt })]),
				request: {
					attempt: 0,
					enableCommandDetection: false,
					isParticipantDetected: false,
					location: VsCodeChatLocation.Panel,
					command: undefined,
					location2: undefined,
					// note: this is not used, model is hardcoded in the McpToolCallingLoop
					model: (await vscode.lm.selectChatModels())[0],
					prompt: fakePrompt,
					references: [],
					toolInvocationToken: generateUuid() as never,
					toolReferences: [],
					tools: new Map(),
					id: '1',
					sessionId: '',
					sessionResource: vscode.Uri.parse('chat:/1'),
					hasHooksEnabled: false,
				},
				props: {
					targetSchema: validateArgs.targetConfig,
					packageName: pendingArgs.name, // prefer the resolved name, not the input
					packageVersion: pendingArgs.version,
					packageType: validateArgs.type,
					pickRef,
					packageReadme: pendingArgs.readme || '<empty>',
				},
			});

			const toolCallLoopResult = await mcpLoop.run(undefined, cts.token);
			if (toolCallLoopResult.response.type !== ChatFetchResponseType.Success) {
				vscode.window.showErrorMessage(vscode.l10n.t("Failed to generate MCP configuration for {0}: {1}", validateArgs.name, toolCallLoopResult.response.reason));
				return undefined;
			}

			const { name, ...server } = mapFindFirst(extractCodeBlocks(toolCallLoopResult.response.value), block => {
				try {
					const j = JSON.parse(block.code);

					// Unwrap if the model returns `mcpServers` in a wrapper object
					if (j && typeof j === 'object' && j.hasOwnProperty('mcpServers')) {
						const [name, obj] = Object.entries(j.mcpServers)[0] as [string, object];
						return { ...obj, name };
					}

					return j;
				} catch {
					return undefined;
				}
			});

			const inputs: PromptStringInputInfo[] = [];
			let inputValues: Record<string, string> | undefined;
			const extracted = cloneAndChange(server, value => {
				if (typeof value === 'string') {
					const fromInput = pickRef.picks.find(p => p.choice === value);
					if (fromInput) {
						inputs.push({ id: fromInput.id, type: 'promptString', description: fromInput.title });
						inputValues ??= {};
						const replacement = '${input:' + fromInput.id + '}';
						inputValues[replacement] = value;
						return replacement;
					}
				}
			});

			return { type: 'assisted' as const, name, server: extracted, inputs, inputValues };
		})().finally(() => {
			cts.dispose();
			pickRef.dispose();
		});

		this.pendingSetup?.cts.dispose(true);
		this.pendingSetup = { cts, canPrompt, done, validateArgs, pendingArgs, stopwatch: sw };
	}

	public static async validatePackageRegistry(args: { type: PackageType; name: string }, logService: ILogService, fetcherService: IFetcherService): Promise<ValidatePackageResult> {
		try {
			if (args.type === 'npm') {
				const response = await fetcherService.fetch(`https://registry.npmjs.org/${encodeURIComponent(args.name)}`, { method: 'GET', callSite: 'mcp-npm-registry' });
				if (!response.ok) {
					return { state: 'error', errorType: ValidatePackageErrorType.NotFound, error: vscode.l10n.t("Package {0} not found in npm registry", args.name) };
				}
				const data = await response.json() as NpmPackageResponse;
				const version = data['dist-tags']?.latest;
				return {
					state: 'ok',
					publisher: data.maintainers?.[0]?.name || 'unknown',
					name: args.name,
					version,
					readme: data.readme,
				};
			} else if (args.type === 'pip') {
				const response = await fetcherService.fetch(`https://pypi.org/pypi/${encodeURIComponent(args.name)}/json`, { method: 'GET', callSite: 'mcp-pypi-registry' });
				if (!response.ok) {
					return { state: 'error', errorType: ValidatePackageErrorType.NotFound, error: vscode.l10n.t("Package {0} not found in PyPI registry", args.name) };
				}
				const data = await response.json() as PyPiPackageResponse;
				const publisher = data.info?.author || data.info?.author_email || 'unknown';
				const name = data.info?.name || args.name;
				const version = data.info?.version;
				return {
					state: 'ok',
					publisher,
					name,
					version,
					readme: data.info?.description
				};
			} else if (args.type === 'nuget') {
				const nuGetMcpSetup = new NuGetMcpSetup(logService, fetcherService);
				return await nuGetMcpSetup.getNuGetPackageMetadata(args.name);
			} else if (args.type === 'docker') {
				// Docker Hub API uses namespace/repository format
				// Handle both formats: 'namespace/repository' or just 'repository' (assumes 'library/' namespace)
				const [namespace, repository] = args.name.includes('/')
					? args.name.split('/', 2)
					: ['library', args.name];

				const response = await fetcherService.fetch(`https://hub.docker.com/v2/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(repository)}`, { method: 'GET', callSite: 'mcp-docker-registry' });
				if (!response.ok) {
					return { state: 'error', errorType: ValidatePackageErrorType.NotFound, error: vscode.l10n.t("Docker image {0} not found in Docker Hub registry", args.name) };
				}
				const data = await response.json() as DockerHubResponse;
				return {
					state: 'ok',
					publisher: data.namespace || data.user || 'unknown',
					name: args.name,
					readme: data.full_description || data.description,
				};
			}
			return { state: 'error', error: vscode.l10n.t("Unsupported package type: {0}", args.type), errorType: ValidatePackageErrorType.UnknownPackageType };
		} catch (error) {
			return { state: 'error', error: vscode.l10n.t("Error querying package: {0}", (error as Error).message), errorType: ValidatePackageErrorType.UnhandledError };
		}
	}
}
