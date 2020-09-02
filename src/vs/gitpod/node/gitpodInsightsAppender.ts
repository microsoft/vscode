/* eslint-disable code-import-patterns */
/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { GitpodClient, GitpodServer, GitpodServiceImpl } from '@gitpod/gitpod-protocol/lib/gitpod-service';
import { JsonRpcProxyFactory } from '@gitpod/gitpod-protocol/lib/messaging/proxy-factory';
import { RemoteTrackMessage } from '@gitpod/gitpod-protocol/lib/analytics';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ITelemetryAppender, validateTelemetryData } from 'vs/platform/telemetry/common/telemetryUtils';
import { GetTokenRequest } from '@gitpod/supervisor-api-grpc/lib/token_pb';
import { StatusServiceClient } from '@gitpod/supervisor-api-grpc/lib/status_grpc_pb';
import { InfoServiceClient } from '@gitpod/supervisor-api-grpc/lib/info_grpc_pb';
import { TokenServiceClient } from '@gitpod/supervisor-api-grpc/lib/token_grpc_pb';
import { ContentStatusRequest } from '@gitpod/supervisor-api-grpc/lib/status_pb';
import { WorkspaceInfoRequest } from '@gitpod/supervisor-api-grpc/lib/info_pb';
import * as ReconnectingWebSocket from 'reconnecting-websocket';
import * as WebSocket from 'ws';
import { ConsoleLogger, listen as doListen } from 'vscode-ws-jsonrpc';
import * as grpc from '@grpc/grpc-js';
import * as util from 'util';
import { filter, mixin } from 'vs/base/common/objects';

class SupervisorConnection {
	readonly deadlines = {
		long: 30 * 1000,
		normal: 15 * 1000,
		short: 5 * 1000
	};
	private readonly addr = process.env.SUPERVISOR_ADDR || 'localhost:22999';
	readonly metadata = new grpc.Metadata();
	readonly status: StatusServiceClient;
	readonly token: TokenServiceClient;
	readonly info: InfoServiceClient;

	constructor() {
		this.status = new StatusServiceClient(this.addr, grpc.credentials.createInsecure());
		this.token = new TokenServiceClient(this.addr, grpc.credentials.createInsecure());
		this.info = new InfoServiceClient(this.addr, grpc.credentials.createInsecure());
	}
}

type GitpodConnection = Omit<GitpodServiceImpl<GitpodClient, GitpodServer>, 'server'> & {
	server: Pick<GitpodServer, 'trackEvent'>;
};

async function getSupervisorData() {
	const supervisor = new SupervisorConnection();

	let contentAvailable = false;
	while (!contentAvailable) {
		try {
			const contentStatusRequest = new ContentStatusRequest();
			contentStatusRequest.setWait(true);
			const result = await util.promisify(supervisor.status.contentStatus.bind(supervisor.status, contentStatusRequest, supervisor.metadata, {
				deadline: Date.now() + supervisor.deadlines.long
			}))();
			contentAvailable = result.getAvailable();
		} catch (e) {
			console.error('Cannot maintain connection to supervisor', e);
		}
	}

	const workspaceInfo = await util.promisify(supervisor.info.workspaceInfo.bind(supervisor.info, new WorkspaceInfoRequest(), supervisor.metadata, {
		deadline: Date.now() + supervisor.deadlines.long
	}))();
	const gitpodApi = workspaceInfo.getGitpodApi()!;
	const gitpodApiHost = gitpodApi.getHost();
	const gitpodApiEndpoint = gitpodApi.getEndpoint();
	const gitpodHost = workspaceInfo.getGitpodHost();
	const workspaceId = workspaceInfo.getWorkspaceId();
	const instanceId = workspaceInfo.getInstanceId();

	const getTokenRequest = new GetTokenRequest();
	getTokenRequest.setKind('gitpod');
	getTokenRequest.setHost(gitpodApiHost);
	getTokenRequest.addScope('function:trackEvent');

	const getTokenResponse = await util.promisify(supervisor.token.getToken.bind(supervisor.token, getTokenRequest, supervisor.metadata, {
		deadline: Date.now() + supervisor.deadlines.long
	}))();
	const serverToken = getTokenResponse.getToken();

	return {
		serverToken,
		gitpodHost,
		gitpodApiEndpoint,
		workspaceId,
		instanceId
	};
}

async function getClient(productName: string, productVersion: string, serverToken: string, gitpodHost: string, gitpodApiEndpoint: string): Promise<GitpodConnection> {
	const factory = new JsonRpcProxyFactory<GitpodServer>();
	const gitpodService = new GitpodServiceImpl<GitpodClient, GitpodServer>(factory.createProxy()) as GitpodConnection;

	const webSocket = new (ReconnectingWebSocket as any)(gitpodApiEndpoint, undefined, {
		maxReconnectionDelay: 10000,
		minReconnectionDelay: 1000,
		reconnectionDelayGrowFactor: 1.3,
		connectionTimeout: 10000,
		maxRetries: Infinity,
		debug: false,
		startClosed: false,
		WebSocket: class extends WebSocket {
			constructor(address: string, protocols?: string | string[]) {
				super(address, protocols, {
					headers: {
						'Origin': new URL(gitpodHost).origin,
						'Authorization': `Bearer ${serverToken}`,
						'User-Agent': productName,
						'X-Client-Version': productVersion,
					}
				});
			}
		}
	});
	webSocket.onerror = console.error;
	doListen({
		webSocket: webSocket as any,
		onConnection: connection => factory.listen(connection),
		logger: new ConsoleLogger()
	});

	return gitpodService;
}

export class GitpodInsightsAppender implements ITelemetryAppender {

	private _asyncAIClient: Promise<GitpodConnection> | null;
	private _defaultData: { [key: string]: any } = Object.create(null);

	constructor(private productName: string, private productVersion: string) {
		this._asyncAIClient = null;
	}

	private _withAIClient(callback: (aiClient: Pick<GitpodServer, 'trackEvent'>) => void): void {
		if (!this._asyncAIClient) {
			this._asyncAIClient = getSupervisorData().then(
				(supervisorData) => {
					this._defaultData['workspaceId'] = supervisorData.workspaceId;
					this._defaultData['workspaceInstanceId'] = supervisorData.instanceId;

					return getClient(this.productName, this.productVersion, supervisorData.serverToken, supervisorData.gitpodHost, supervisorData.gitpodApiEndpoint);
				}
			);
		}

		this._asyncAIClient.then(
			(aiClient) => {
				callback(aiClient.server);
			},
			(err) => {
				onUnexpectedError(err);
				console.error(err);
			}
		);
	}

	log(eventName: string, data?: any): void {
		this._withAIClient((aiClient) => {
			data = mixin(data, this._defaultData);
			data = validateTelemetryData(data);
			const mappedEvent = mapTelemetryData(eventName, data.properties);
			if (mappedEvent) {
				mappedEvent.properties = filter(mappedEvent.properties, (_, v) => v !== undefined && v !== null);
				aiClient.trackEvent(mappedEvent);
			}
		});
	}

	flush(): Promise<any> {
		return Promise.resolve(undefined);
	}
}

// const formatEventName = (str: string) => {
// 	return str
// 		.replace(/^[A-Z]/g, letter => letter.toLowerCase())
// 		.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
// 		.replace(/[^\w]/g, '_');
// };

let readAccessTracked = false;
let writeAccessTracked = false;
function mapTelemetryData(eventName: string, data: any): RemoteTrackMessage | undefined {
	switch (eventName) {
		case 'editorOpened':
			if (readAccessTracked || (<string>data.typeId) !== 'workbench.editors.files.fileEditorInput') {
				return undefined;
			}
			readAccessTracked = true;
			return {
				event: 'vscode_file_access',
				properties: {
					kind: 'read',
					workspaceId: data.workspaceId,
					workspaceInstanceId: data.workspaceInstanceId,
					sessionID: data.sessionID,
					timestamp: data.timestamp
				},
			};
		case 'filePUT':
			if (writeAccessTracked) {
				return undefined;
			}
			writeAccessTracked = true;
			return {
				event: 'vscode_file_access',
				properties: {
					kind: 'write',
					workspaceId: data.workspaceId,
					workspaceInstanceId: data.workspaceInstanceId,
					sessionID: data.sessionID,
					timestamp: data.timestamp
				},
			};
		case 'notification:show':
			return {
				event: 'vscode_notification',
				properties: {
					action: 'show',
					notificationId: data.id,
					source: data.source,
					workspaceId: data.workspaceId,
					workspaceInstanceId: data.workspaceInstanceId,
					sessionID: data.sessionID,
					timestamp: data.timestamp
				},
			};
		case 'notification:close':
			return {
				event: 'vscode_notification',
				properties: {
					action: 'close',
					notificationId: data.id,
					source: data.source,
					workspaceId: data.workspaceId,
					workspaceInstanceId: data.workspaceInstanceId,
					sessionID: data.sessionID,
					timestamp: data.timestamp
				},
			};
		case 'notification:hide':
			return {
				event: 'vscode_notification',
				properties: {
					action: 'hide',
					notificationId: data.id,
					source: data.source,
					workspaceId: data.workspaceId,
					workspaceInstanceId: data.workspaceInstanceId,
					sessionID: data.sessionID,
					timestamp: data.timestamp
				},
			};
		case 'notification:actionExecuted':
			return {
				event: 'vscode_notification',
				properties: {
					action: 'actionExecuted',
					notificationId: data.id,
					source: data.source,
					actionLabel: data.actionLabel,
					workspaceId: data.workspaceId,
					workspaceInstanceId: data.workspaceInstanceId,
					sessionID: data.sessionID,
					timestamp: data.timestamp
				},
			};
		case 'settingsEditor.settingModified':
			return {
				event: 'vscode_update_configuration',
				properties: {
					key: data.key,
					target: data.target,
					workspaceId: data.workspaceId,
					workspaceInstanceId: data.workspaceInstanceId,
					sessionID: data.sessionID,
					timestamp: data.timestamp
				},
			};
		case 'extensionGallery:install':
			return {
				event: 'vscode_extension_gallery',
				properties: {
					kind: 'install',
					extensionId: data.id,
					workspaceId: data.workspaceId,
					workspaceInstanceId: data.workspaceInstanceId,
					sessionID: data.sessionID,
					timestamp: data.timestamp
				},
			};
		case 'extensionGallery:update':
			return {
				event: 'vscode_extension_gallery',
				properties: {
					kind: 'update',
					extensionId: data.id,
					workspaceId: data.workspaceId,
					workspaceInstanceId: data.workspaceInstanceId,
					sessionID: data.sessionID,
					timestamp: data.timestamp
				},
			};
		case 'extensionGallery:uninstall':
			return {
				event: 'vscode_extension_gallery',
				properties: {
					kind: 'uninstall',
					extensionId: data.id,
					workspaceId: data.workspaceId,
					workspaceInstanceId: data.workspaceInstanceId,
					sessionID: data.sessionID,
					timestamp: data.timestamp
				},
			};
		case 'gettingStarted.ActionExecuted':
			return {
				event: 'vscode_getting_started',
				properties: {
					kind: 'action_executed',
					command: data.command,
					argument: data.argument,
					workspaceId: data.workspaceId,
					workspaceInstanceId: data.workspaceInstanceId,
					sessionID: data.sessionID,
					timestamp: data.timestamp
				},
			};
		case 'editorClosed':
			if ((<string>data.typeId) !== 'workbench.editors.gettingStartedInput') {
				return undefined;
			}
			return {
				event: 'vscode_getting_started',
				properties: {
					kind: 'editor_closed',
					workspaceId: data.workspaceId,
					workspaceInstanceId: data.workspaceInstanceId,
					sessionID: data.sessionID,
					timestamp: data.timestamp
				},
			};
	}

	return undefined;
}
