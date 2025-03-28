/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import type { IShellLaunchConfig } from '../../../../platform/terminal/common/terminal.js';
import type { IWorkbenchContribution } from '../../../common/contributions.js';
import { ITerminalService } from './terminal.js';

export class TerminalTelemetryContribution extends Disposable implements IWorkbenchContribution {
	static ID = 'terminalTelemetry';

	constructor(
		@ITerminalService terminalService: ITerminalService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super();

		this._register(terminalService.onDidCreateInstance(async instance => {
			// Wait for process ready so the shell launch config is fully resolved
			await instance.processReady;
			this._logCreateInstance(instance.shellLaunchConfig);
		}));
	}

	private _logCreateInstance(shellLaunchConfig: IShellLaunchConfig): void {
		type TerminalCreationTelemetryData = {
			shellType: string;
			isReconnect: boolean;
			isCustomPtyImplementation: boolean;
			isLoginShell: boolean;
		};
		type TerminalCreationTelemetryClassification = {
			owner: 'tyriar';
			comment: 'Track details about terminal creation, such as the shell type';
			shellType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The path of the file as a hash.' };
			isReconnect: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the terminal is reconnecting to an existing instance.' };
			isCustomPtyImplementation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the terminal was using a custom PTY implementation.' };
			isLoginShell: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the arguments contain -l or --login.' };
		};
		this._telemetryService.publicLog2<TerminalCreationTelemetryData, TerminalCreationTelemetryClassification>('terminal/createInstance', {
			shellType: getSanitizedShellType(shellLaunchConfig),
			isReconnect: !!shellLaunchConfig.attachPersistentProcess,
			isCustomPtyImplementation: !!shellLaunchConfig.customPtyImplementation,
			isLoginShell: (typeof shellLaunchConfig.args === 'string' ? shellLaunchConfig.args.split(' ') : shellLaunchConfig.args)?.some(arg => arg === '-l' || arg === '--login') ?? false,
		});
	}
}

const enum AllowedShellType {
	Unknown = 'unknown',

	// Windows only
	CommandPrompt = 'cmd',
	GitBash = 'git-bash',
	WindowsPowerShell = 'windows-powershell',
	Wsl = 'wsl',

	// All platforms
	Bash = 'bash',
	Csh = 'csh',
	Dash = 'dash',
	Fish = 'fish',
	Ksh = 'ksh',
	Nushell = 'nu',
	Pwsh = 'pwsh',
	Sh = 'sh',
	Ssh = 'ssh',
	Tcsh = 'tcsh',
	Tmux = 'tmux',
	Zsh = 'zsh',

	// Lanugage REPLs
	Julia = 'julia',
	Node = 'node',
	Python = 'python',
	RubyIrb = 'irb',
}

// Types that match the executable name directly
const shellTypeExecutableAllowList: Set<string> = new Set([
	AllowedShellType.CommandPrompt,
	AllowedShellType.Wsl,

	AllowedShellType.Bash,
	AllowedShellType.Csh,
	AllowedShellType.Dash,
	AllowedShellType.Fish,
	AllowedShellType.Ksh,
	AllowedShellType.Nushell,
	AllowedShellType.Pwsh,
	AllowedShellType.Sh,
	AllowedShellType.Ssh,
	AllowedShellType.Tcsh,
	AllowedShellType.Tmux,
	AllowedShellType.Zsh,

	AllowedShellType.Julia,
	AllowedShellType.Node,
	AllowedShellType.RubyIrb,
]) satisfies Set<AllowedShellType>;

// Dynamic executables that map to a single type
const shellTypeExecutableRegexAllowList: { regex: RegExp; type: AllowedShellType }[] = [
	{ regex: /^python(?:\d+(?:\.\d+)?)?$/i, type: AllowedShellType.Python },
];

// Path-based look ups
const shellTypePathRegexAllowList: { regex: RegExp; type: AllowedShellType }[] = [
	// Git bash uses bash.exe, so look up based on the path
	{ regex: /Git\\bin\\bash\.exe$/i, type: AllowedShellType.GitBash },
	// WindowsPowerShell should always be installed on this path, we cannot just look at the
	// executable name since powershell is the CLI on other platforms sometimes (eg. snap package)
	{ regex: /WindowsPowerShell\\v1.0\\powershell.exe$/i, type: AllowedShellType.WindowsPowerShell },
	// WSL executables will represent some other shell in the end, but it's difficult to determine
	// when we log
	{ regex: /Windows\\System32\\(?:bash|wsl)\.exe$/i, type: AllowedShellType.Wsl },
];

function getSanitizedShellType(shellLaunchConfig: IShellLaunchConfig): AllowedShellType {
	if (!shellLaunchConfig.executable) {
		return AllowedShellType.Unknown;
	}
	const executableFile = basename(shellLaunchConfig.executable);
	const executableFileWithoutExt = executableFile.replace(/\.[^\.]+$/, '');
	for (const entry of shellTypePathRegexAllowList) {
		if (entry.regex.test(shellLaunchConfig.executable)) {
			return entry.type;
		}
	}
	for (const entry of shellTypeExecutableRegexAllowList) {
		if (entry.regex.test(executableFileWithoutExt)) {
			return entry.type;
		}
	}
	if ((shellTypeExecutableAllowList).has(executableFileWithoutExt)) {
		return executableFileWithoutExt as AllowedShellType;
	}
	return AllowedShellType.Unknown;
}
