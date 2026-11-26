/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandDetectionCapability, ITerminalCapabilityImplMap, ITerminalCapabilityStore, ITerminalCommand, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IPromptInputModel, PromptInputState } from '../../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';
import { GeneralShellType, PosixShellType, TerminalShellType } from '../../../../../platform/terminal/common/terminal.js';
import { getTerminalInstanceBlocker } from '../../browser/terminalUnattendedRestart.js';

suite('getTerminalInstanceBlocker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	interface ITestTerminalOptions {
		readonly hasChildProcesses?: boolean;
		readonly shellType?: TerminalShellType;
		readonly noShellType?: boolean;
		readonly shellIntegration?: boolean;
		readonly executing?: boolean;
		readonly promptState?: PromptInputState;
		readonly prefix?: string;
		readonly suffix?: string;
	}

	function blocker(options: ITestTerminalOptions = {}): string | undefined {
		const commandDetection = options.shellIntegration === false ? undefined : upcastPartial<ICommandDetectionCapability>({
			executingCommandObject: options.executing ? upcastPartial<ITerminalCommand>({}) : undefined,
			promptInputModel: upcastPartial<IPromptInputModel>({
				state: options.promptState ?? PromptInputState.Input,
				prefix: options.prefix ?? '',
				suffix: options.suffix ?? '',
			}),
		});
		const capabilities = upcastPartial<ITerminalCapabilityStore>({
			get: <T extends TerminalCapability>(capability: T) => (capability === TerminalCapability.CommandDetection ? commandDetection : undefined) as ITerminalCapabilityImplMap[T] | undefined,
		});

		return getTerminalInstanceBlocker({
			hasChildProcesses: options.hasChildProcesses ?? false,
			shellType: options.noShellType ? undefined : options.shellType ?? PosixShellType.Bash,
			capabilities,
		});
	}

	test('only an interactive shell idle at an empty prompt can be restarted', () => {
		assert.deepStrictEqual({
			idleShell: blocker(),
			childProcess: blocker({ hasChildProcesses: true }),
			replAsShell: blocker({ shellType: GeneralShellType.Python }),
			unknownShell: blocker({ noShellType: true }),
			noShellIntegration: blocker({ shellIntegration: false }),
			builtinLoop: blocker({ executing: true, promptState: PromptInputState.Execute }),
			promptNotDetected: blocker({ promptState: PromptInputState.Unknown }),
			typedCommand: blocker({ prefix: 'git pu', suffix: 'sh' }),
			typedWhitespace: blocker({ prefix: '  ' }),
		}, {
			idleShell: undefined,
			childProcess: 'terminal.runningProcess',
			replAsShell: 'terminal.runningProcess',
			unknownShell: 'terminal.runningProcess',
			noShellIntegration: 'terminal.idleUnknown',
			builtinLoop: 'terminal.runningProcess',
			promptNotDetected: 'terminal.idleUnknown',
			typedCommand: 'terminal.pendingInput',
			typedWhitespace: undefined,
		});
	});
});
