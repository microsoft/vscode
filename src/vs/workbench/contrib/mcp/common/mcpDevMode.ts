/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as arraysEqual } from '../../../../base/common/arrays.js';
import { assertNever } from '../../../../base/common/assert.js';
import { Throttler } from '../../../../base/common/async.js';
import * as glob from '../../../../base/common/glob.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, autorunDelta, derivedOpts } from '../../../../base/common/observable.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IConfig, IDebugService, IDebugSessionOptions } from '../../debug/common/debug.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { IMcpServer, McpServerDefinition, McpServerLaunch, McpServerTransportType } from './mcpTypes.js';

export class McpDevModeServerAttache extends Disposable {
	public active: boolean = false;

	constructor(
		server: IMcpServer,
		@IMcpRegistry registry: IMcpRegistry,
		@IFileService fileService: IFileService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super();

		const workspaceFolder = server.readDefinitions().map(({ collection }) => collection?.presentation?.origin &&
			workspaceContextService.getWorkspaceFolder(collection.presentation?.origin)?.uri);

		const restart = async () => {
			await server.stop();
			await server.start();
		};

		// 1. Auto-start the server, restart if entering debug mode
		let didAutoStart = false;
		this._register(autorun(reader => {
			const defs = server.readDefinitions().read(reader);
			if (!defs.collection || !defs.server || !defs.server.devMode) {
				didAutoStart = false;
				return;
			}

			// don't keep trying to start the server unless it's a new server or devmode is newly turned on
			if (didAutoStart) {
				return;
			}

			const delegates = registry.delegates.read(reader);
			if (!delegates.some(d => d.canStart(defs.collection!, defs.server!))) {
				return;
			}

			server.start();
			didAutoStart = true;
		}));

		const debugMode = server.readDefinitions().map(d => !!d.server?.devMode?.debug);
		this._register(autorunDelta(debugMode, ({ lastValue, newValue }) => {
			if (lastValue === false && newValue === true) {
				restart();
			}
		}));

		// 2. Watch for file changes
		const watchObs = derivedOpts<string[] | undefined>({ equalsFn: arraysEqual }, reader => {
			const def = server.readDefinitions().read(reader);
			const watch = def.server?.devMode?.watch;
			return typeof watch === 'string' ? [watch] : watch;
		});

		const restartScheduler = this._register(new Throttler());

		this._register(autorun(reader => {
			const pattern = watchObs.read(reader);
			const wf = workspaceFolder.read(reader);
			if (!pattern || !wf) {
				return;
			}

			const includes = pattern.filter(p => !p.startsWith('!'));
			const excludes = pattern.filter(p => p.startsWith('!')).map(p => p.slice(1));
			reader.store.add(fileService.watch(wf, { includes, excludes, recursive: true }));

			const includeParse = includes.map(p => glob.parse({ base: wf.fsPath, pattern: p }));
			const excludeParse = excludes.map(p => glob.parse({ base: wf.fsPath, pattern: p }));
			reader.store.add(fileService.onDidFilesChange(e => {
				for (const change of [e.rawAdded, e.rawDeleted, e.rawUpdated]) {
					for (const uri of change) {
						if (includeParse.some(i => i(uri.fsPath)) && !excludeParse.some(e => e(uri.fsPath))) {
							restartScheduler.queue(restart);
							break;
						}
					}
				}
			}));
		}));
	}
}

export interface IMcpDevModeDebugging {
	readonly _serviceBrand: undefined;

	transform(definition: McpServerDefinition, launch: McpServerLaunch): Promise<McpServerLaunch>;
}

export const IMcpDevModeDebugging = createDecorator<IMcpDevModeDebugging>('mcpDevModeDebugging');

export class McpDevModeDebugging implements IMcpDevModeDebugging {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IDebugService private readonly debugService: IDebugService,
	) { }

	public async transform(definition: McpServerDefinition, launch: McpServerLaunch): Promise<McpServerLaunch> {
		if (!definition.devMode?.debug || launch.type !== McpServerTransportType.Stdio) {
			return launch;
		}

		const port = await this.getDebugPort();
		const name = `MCP: ${definition.label}`; // for debugging
		const options: IDebugSessionOptions = { startedByUser: false, suppressDebugView: true };
		const commonConfig: Partial<IConfig> = {
			internalConsoleOptions: 'neverOpen',
			suppressMultipleSessionWarning: true,
		};

		switch (definition.devMode.debug) {
			case 'node': {
				// We intentionally assert types as the DA has additional properties beyong IConfig
				// eslint-disable-next-line local/code-no-dangerous-type-assertions
				this.debugService.startDebugging(undefined, {
					type: 'pwa-node',
					request: 'attach',
					name,
					port,
					host: '127.0.0.1',
					timeout: 30_000,
					continueOnAttach: true,
					...commonConfig,
				} as IConfig, options);
				return { ...launch, args: [`--inspect-brk=127.0.0.1:${port}`, ...launch.args] };
			}
			default:
				assertNever(definition.devMode.debug, `Unknown debug type ${definition.devMode.debug}`);
		}
	}

	protected getDebugPort() {
		return Promise.resolve(9230);
	}
}
