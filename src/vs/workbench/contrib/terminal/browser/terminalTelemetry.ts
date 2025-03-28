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
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
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
			isCustomPtyImplementation: boolean;
			isExtensionOwnedTerminal: boolean;
			isLoginShell: boolean;
			isReconnect: boolean;
		};
		type TerminalCreationTelemetryClassification = {
			owner: 'tyriar';
			comment: 'Track details about terminal creation, such as the shell type';
			shellType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The path of the file as a hash.' };
			isCustomPtyImplementation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the terminal was using a custom PTY implementation.' };
			isExtensionOwnedTerminal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the terminal was created by an extension.' };
			isLoginShell: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the arguments contain -l or --login.' };
			isReconnect: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the terminal is reconnecting to an existing instance.' };
		};
		this._telemetryService.publicLog2<TerminalCreationTelemetryData, TerminalCreationTelemetryClassification>('terminal/createInstance', {
			shellType: getSanitizedShellType(shellLaunchConfig),
			isCustomPtyImplementation: !!shellLaunchConfig.customPtyImplementation,
			isExtensionOwnedTerminal: !!shellLaunchConfig.isExtensionOwnedTerminal,
			isLoginShell: (typeof shellLaunchConfig.args === 'string' ? shellLaunchConfig.args.split(' ') : shellLaunchConfig.args)?.some(arg => arg === '-l' || arg === '--login') ?? false,
			isReconnect: !!shellLaunchConfig.attachPersistentProcess,
		});
	}
}

const enum AllowedShellType {
	Unknown = 'unknown',

	// Windows only
	CommandPrompt = 'cmd',
	Cygwin = 'cygwin-bash',
	GitBash = 'git-bash',
	Msys2 = 'msys2-bash',
	WindowsPowerShell = 'windows-powershell',
	Wsl = 'wsl',


	// Common Unix shells
	Bash = 'bash',
	Fish = 'fish',
	Pwsh = 'pwsh',
	PwshPreview = 'pwsh-preview',
	Sh = 'sh',
	Ssh = 'ssh',
	Tmux = 'tmux',
	Zsh = 'zsh',

	// More shells
	Amm = 'amm',
	Ash = 'ash',
	Csh = 'csh',
	Dash = 'dash',
	Elvish = 'elvish',
	Ion = 'ion',
	Ksh = 'ksh',
	Mksh = 'mksh',
	Msh = 'msh',
	NuShell = 'nu',
	Plan9Shell = 'rc',
	SchemeShell = 'scsh',
	Tcsh = 'tcsh',
	Termux = 'termux',
	Xonsh = 'xonsh',

	// Lanugage REPLs
	// These are expected to be very low since they are not typically the default shell
	Clojure = 'clj',
	CommonLispSbcl = 'sbcl',
	Crystal = 'crystal',
	Deno = 'deno',
	Elixir = 'iex',
	Erlang = 'erl',
	FSharp = 'fsi',
	Go = 'go',
	HaskellGhci = 'ghci',
	Java = 'jshell',
	Julia = 'julia',
	Lua = 'lua',
	Node = 'node',
	Ocaml = 'ocaml',
	Perl = 'perl',
	Php = 'php',
	PrologSwipl = 'swipl',
	Python = 'python',
	R = 'R',
	RubyIrb = 'irb',
	Scala = 'scala',
	SchemeRacket = 'racket',
	SmalltalkGnu = 'gst',
	SmalltalkPharo = 'pharo',
	Tcl = 'tclsh',
	TsNode = 'ts-node',
}

// Types that match the executable name directly
const shellTypeExecutableAllowList: Set<string> = new Set([
	// Windows only
	AllowedShellType.CommandPrompt,
	AllowedShellType.Wsl,

	// Common Unix shells
	AllowedShellType.Bash,
	AllowedShellType.Fish,
	AllowedShellType.Pwsh,
	AllowedShellType.Sh,
	AllowedShellType.Ssh,
	AllowedShellType.Tmux,
	AllowedShellType.Zsh,

	// More shells
	AllowedShellType.Amm,
	AllowedShellType.Ash,
	AllowedShellType.Csh,
	AllowedShellType.Dash,
	AllowedShellType.Elvish,
	AllowedShellType.Ion,
	AllowedShellType.Ksh,
	AllowedShellType.Mksh,
	AllowedShellType.Msh,
	AllowedShellType.NuShell,
	AllowedShellType.Plan9Shell,
	AllowedShellType.SchemeShell,
	AllowedShellType.Tcsh,
	AllowedShellType.Termux,
	AllowedShellType.Xonsh,

	// Lanugage REPLs
	AllowedShellType.Clojure,
	AllowedShellType.CommonLispSbcl,
	AllowedShellType.Crystal,
	AllowedShellType.Deno,
	AllowedShellType.Elixir,
	AllowedShellType.Erlang,
	AllowedShellType.FSharp,
	AllowedShellType.Go,
	AllowedShellType.HaskellGhci,
	AllowedShellType.Java,
	AllowedShellType.Julia,
	AllowedShellType.Lua,
	AllowedShellType.Node,
	AllowedShellType.Ocaml,
	AllowedShellType.Perl,
	AllowedShellType.Php,
	AllowedShellType.PrologSwipl,
	AllowedShellType.Python,
	AllowedShellType.R,
	AllowedShellType.RubyIrb,
	AllowedShellType.Scala,
	AllowedShellType.SchemeRacket,
	AllowedShellType.SmalltalkGnu,
	AllowedShellType.SmalltalkPharo,
	AllowedShellType.Tcl,
	AllowedShellType.TsNode,
]) satisfies Set<AllowedShellType>;

// Dynamic executables that map to a single type
const shellTypeExecutableRegexAllowList: { regex: RegExp; type: AllowedShellType }[] = [
	{ regex: /^(?:pwsh|powershell)(?:-preview)?$/i, type: AllowedShellType.PwshPreview },
	{ regex: /^python(?:\d+(?:\.\d+)?)?$/i, type: AllowedShellType.Python },
];

// Path-based look ups
const shellTypePathRegexAllowList: { regex: RegExp; type: AllowedShellType }[] = [
	// Cygwin uses bash.exe, so look up based on the path
	{ regex: /\\Cygwin(?:64)?\\.+\\bash\.exe$/i, type: AllowedShellType.Cygwin },
	// Git bash uses bash.exe, so look up based on the path
	{ regex: /\\Git\\.+\\bash\.exe$/i, type: AllowedShellType.GitBash },
	// Msys2 uses bash.exe, so look up based on the path
	{ regex: /\\msys2(?:64)?\\.+\\(?:bash|msys2)\.exe$/i, type: AllowedShellType.Msys2 },
	// WindowsPowerShell should always be installed on this path, we cannot just look at the
	// executable name since powershell is the CLI on other platforms sometimes (eg. snap package)
	{ regex: /\\WindowsPowerShell\\v1.0\\powershell.exe$/i, type: AllowedShellType.WindowsPowerShell },
	// WSL executables will represent some other shell in the end, but it's difficult to determine
	// when we log
	{ regex: /\\Windows\\(?:System32|SysWOW64|Sysnative)\\(?:bash|wsl)\.exe$/i, type: AllowedShellType.Wsl },
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
