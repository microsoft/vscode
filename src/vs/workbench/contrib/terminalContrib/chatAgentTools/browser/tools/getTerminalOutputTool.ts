/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { StringSHA1 } from '../../../../../../base/common/hash.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { RunInTerminalTool } from './runInTerminalTool.js';
import { TerminalToolId } from './toolIds.js';

export const GetTerminalOutputToolData: IToolData = {
	id: TerminalToolId.GetTerminalOutput,
	toolReferenceName: 'getTerminalOutput',
	legacyToolReferenceFullNames: ['runCommands/getTerminalOutput'],
	displayName: localize('getTerminalOutputTool.displayName', 'Get Terminal Output'),
	modelDescription: `Get output from an active terminal execution (identified by the \`id\` returned from ${TerminalToolId.RunInTerminal}).`,
	icon: Codicon.terminal,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				description: `The ID of an active terminal execution to check (returned by ${TerminalToolId.RunInTerminal} for async executions, or for sync executions that timed out and were moved to the background). This must be the exact opaque UUID returned by that tool; terminal names, labels, or integers are invalid.`,
				pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
			},
		},
		required: ['id'],
	}
};

export interface IGetTerminalOutputInputParams {
	id?: string;
}

interface IOutputSnapshot {
	readonly terminalInstanceId: number;
	readonly length: number;
	readonly hash: string;
}

export class GetTerminalOutputTool extends Disposable implements IToolImpl {

	private static readonly _maxOutputSnapshots = 100;
	private readonly _lastOutputSnapshotByExecutionId = new Map<string, IOutputSnapshot>();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalService terminalService: ITerminalService,
	) {
		super();

		this._register(terminalService.onDidDisposeInstance(instance => this._forgetTerminalInstance(instance.instanceId)));
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('getTerminalOutput.progressive', "Checking terminal output"),
			pastTenseMessage: localize('getTerminalOutput.past', "Checked terminal output"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IGetTerminalOutputInputParams;

		if (!args.id) {
			return {
				content: [{
					kind: 'text',
					value: `Error: 'id' (the persistent terminal UUID returned by ${TerminalToolId.RunInTerminal} in async mode) must be provided.`
				}]
			};
		}

		const execution = RunInTerminalTool.getExecution(args.id);
		if (!execution) {
			this._lastOutputSnapshotByExecutionId.delete(args.id);
			return {
				content: [{
					kind: 'text',
					value: `Error: No active terminal execution found with ID ${args.id}. The ID must be the exact value returned by ${TerminalToolId.RunInTerminal} in async mode.`
				}]
			};
		}

		return {
			content: [{
				kind: 'text',
				value: this._formatOutput(args.id, execution.instance.instanceId, execution.getOutput())
			}]
		};
	}

	private _formatOutput(id: string, terminalInstanceId: number, output: string): string {
		if (!this._configurationService.getValue<boolean>(TerminalChatAgentToolsSettingId.OutputDeltas)) {
			this._lastOutputSnapshotByExecutionId.clear();
			return `Output of terminal ${id}:\n${output}`;
		}

		const previousOutputSnapshot = this._lastOutputSnapshotByExecutionId.get(id);
		const currentOutputSnapshot = this._createOutputSnapshot(terminalInstanceId, output);
		this._rememberOutput(id, currentOutputSnapshot);

		if (previousOutputSnapshot === undefined) {
			return `Output of terminal ${id}:\n${output}`;
		}
		if (currentOutputSnapshot.length === previousOutputSnapshot.length && currentOutputSnapshot.hash === previousOutputSnapshot.hash) {
			return `Output of terminal ${id} unchanged since previous poll (${output.length} characters already shown). No new output.`;
		}

		if (output.length > previousOutputSnapshot.length && this._hashOutput(output, previousOutputSnapshot.length) === previousOutputSnapshot.hash) {
			const delta = output.slice(previousOutputSnapshot.length);
			return `Output of terminal ${id} since previous poll (${delta.length} new characters, ${output.length} total characters):\n${delta}`;
		}
		return `Output of terminal ${id} changed since previous poll; returning current output (${output.length} characters):\n${output}`;
	}

	private _rememberOutput(id: string, snapshot: IOutputSnapshot): void {
		if (!this._lastOutputSnapshotByExecutionId.has(id) && this._lastOutputSnapshotByExecutionId.size >= GetTerminalOutputTool._maxOutputSnapshots) {
			const oldestId = this._lastOutputSnapshotByExecutionId.keys().next().value;
			if (oldestId !== undefined) {
				this._lastOutputSnapshotByExecutionId.delete(oldestId);
			}
		}
		this._lastOutputSnapshotByExecutionId.set(id, snapshot);
	}

	private _createOutputSnapshot(terminalInstanceId: number, output: string): IOutputSnapshot {
		return {
			terminalInstanceId,
			length: output.length,
			hash: this._hashOutput(output),
		};
	}

	private _forgetTerminalInstance(terminalInstanceId: number): void {
		for (const [id, snapshot] of this._lastOutputSnapshotByExecutionId) {
			if (snapshot.terminalInstanceId === terminalInstanceId) {
				this._lastOutputSnapshotByExecutionId.delete(id);
			}
		}
	}

	private _hashOutput(output: string, length = output.length): string {
		const sha = new StringSHA1();
		sha.update(length === output.length ? output : output.slice(0, length));
		return sha.digest();
	}

	override dispose(): void {
		this._lastOutputSnapshotByExecutionId.clear();
		super.dispose();
	}
}
