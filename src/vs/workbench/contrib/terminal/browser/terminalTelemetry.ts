/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindowById } from '../../../../base/browser/dom.js';
import { isAuxiliaryWindow } from '../../../../base/browser/window.js';
import { timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import { isString } from '../../../../base/common/types.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalLocation, type IShellLaunchConfig, type ShellIntegrationInjectionFailureReason } from '../../../../platform/terminal/common/terminal.js';
import type { IWorkbenchContribution } from '../../../common/contributions.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { ITerminalEditorService, ITerminalService, type ITerminalInstance } from './terminal.js';

export class TerminalTelemetryContribution extends Disposable implements IWorkbenchContribution {
	static ID = 'terminalTelemetry';

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@ITerminalService terminalService: ITerminalService,
		@ITerminalEditorService terminalEditorService: ITerminalEditorService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._register(terminalService.onDidCreateInstance(async instance => {
			const store = new DisposableStore();
			this._store.add(store);

			await Promise.race([
				// Wait for process ready so the shell launch config is fully resolved, then
				// allow another 10 seconds for the shell integration to be fully initialized
				instance.processReady.then(() => {
					return timeout(10000);
				}),
				// If the terminal is disposed, it's ready to report on immediately
				Event.toPromise(instance.onDisposed, store),
				// If the app is shutting down, flush
				Event.toPromise(lifecycleService.onWillShutdown, store),
			]);

			// Determine window status, this is done some time after the process is ready and could
			// reflect the terminal being moved.
			let isInAuxWindow = false;
			try {
				const input = terminalEditorService.getInputFromResource(instance.resource);
				const windowId = input.group?.windowId;
				isInAuxWindow = !!(windowId && isAuxiliaryWindow(getWindowById(windowId, true).window));
			} catch {
			}

			this._logCreateInstance(instance, isInAuxWindow);
			this._store.delete(store);
		}));
	}

	private _logCreateInstance(instance: ITerminalInstance, isInAuxWindow: boolean): void {
		const slc = instance.shellLaunchConfig;
		const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);

		type TerminalCreationTelemetryData = {
			location: string;

			shellType: TelemetryTrustedValue<string>;
			promptType: TelemetryTrustedValue<string | undefined>;

			isCustomPtyImplementation: boolean;
			isExtensionOwnedTerminal: boolean;
			isLoginShell: boolean;
			isReconnect: boolean;
			hasRemoteAuthority: boolean;

			shellIntegrationQuality: number;
			shellIntegrationInjected: boolean;
			shellIntegrationInjectionFailureReason: ShellIntegrationInjectionFailureReason | undefined;

			terminalSessionId: string;
		};
		type TerminalCreationTelemetryClassification = {
			owner: 'tyriar';
			comment: 'Track details about terminal creation, such as the shell type';

			location: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The location of the terminal.' };

			shellType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The detected shell type for the terminal.' };
			promptType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The detected prompt type for the terminal.' };

			isCustomPtyImplementation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the terminal was using a custom PTY implementation.' };
			isExtensionOwnedTerminal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the terminal was created by an extension.' };
			isLoginShell: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the arguments contain -l or --login.' };
			isReconnect: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the terminal is reconnecting to an existing instance.' };
			hasRemoteAuthority: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the terminal has a remote authority, this is likely a connection terminal when undefined in a window with a remote authority.' };

			shellIntegrationQuality: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The shell integration quality (rich=2, basic=1 or none=0).' };
			shellIntegrationInjected: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the shell integration script was injected.' };
			shellIntegrationInjectionFailureReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Info about shell integration injection.' };

			terminalSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session ID of the terminal instance.' };
		};
		this._telemetryService.publicLog2<TerminalCreationTelemetryData, TerminalCreationTelemetryClassification>('terminal/createInstance', {
			location: (instance.target === TerminalLocation.Panel
				? 'view'
				: instance.target === TerminalLocation.Editor
					? (isInAuxWindow ? 'editor-auxwindow' : 'editor')
					: 'unknown'),

			shellType: new TelemetryTrustedValue(getSanitizedShellType(slc)),
			promptType: new TelemetryTrustedValue(instance.capabilities.get(TerminalCapability.PromptTypeDetection)?.promptType),

			isCustomPtyImplementation: !!slc.customPtyImplementation,
			isExtensionOwnedTerminal: !!slc.isExtensionOwnedTerminal,
			isLoginShell: (isString(slc.args) ? slc.args.split(' ') : slc.args)?.some(arg => arg === '-l' || arg === '--login') ?? false,
			isReconnect: !!slc.attachPersistentProcess,
			hasRemoteAuthority: instance.hasRemoteAuthority,

			shellIntegrationQuality: commandDetection?.hasRichCommandDetection ? 2 : commandDetection ? 1 : 0,
			shellIntegrationInjected: instance.usedShellIntegrationInjection,
			shellIntegrationInjectionFailureReason: instance.shellIntegrationInjectionFailureReason,
			terminalSessionId: instance.sessionId,
		});
	}
}

// #region Shell Type

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
	{ regex: /^(?:pwsh|powershell)-preview$/i, type: AllowedShellType.PwshPreview },
	{ regex: /^python(?:\d+(?:\.\d+)?)?$/i, type: AllowedShellType.Python },
];

// Path-based look ups
const shellTypePathRegexAllowList: { regex: RegExp; type: AllowedShellType }[] = [
	// Cygwin uses bash.exe, so look up based on the path
	{ regex: /\\Cygwin(?:64)?\\.+\\bash\.exe$/i, type: AllowedShellType.Cygwin },
	// Git bash uses bash.exe, so look up based on the path
	{ regex: /\\Git\\.+\\bash\.exe$/i, type: AllowedShellType.GitBash },
	// Msys2 uses bash.exe, so look up based on the path
	{ regex: /\\msys(?:32|64)\\.+\\(?:bash|msys2)\.exe$/i, type: AllowedShellType.Msys2 },
	// WindowsPowerShell should always be installed on this path, we cannot just look at the
	// executable name since powershell is the CLI on other platforms sometimes (eg. snap package)
	{ regex: /\\WindowsPowerShell\\v1.0\\powershell.exe$/i, type: AllowedShellType.WindowsPowerShell },
	// WSL executables will represent some other shell in the end, but it's difficult to determine
	// when we log
	{ regex: /\\Windows\\(?:System32|SysWOW64|Sysnative)\\(?:bash|wsl)\.exe$/i, type: AllowedShellType.Wsl },
];

function getSanitizedShellType(slc: IShellLaunchConfig): AllowedShellType {
	if (!slc.executable) {
		return AllowedShellType.Unknown;
	}
	const executableFile = basename(slc.executable);
	const executableFileWithoutExt = executableFile.replace(/\.[^\.]+$/, '');
	for (const entry of shellTypePathRegexAllowList) {
		if (entry.regex.test(slc.executable)) {
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

// #endregion Shell Type
