/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import type { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import { ShellIntegrationQuality } from './toolTerminalCreator.js';

export class RunInTerminalToolTelemetry {
	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
	}

	logPrepare(state: {
		terminalToolSessionId: string | undefined;
		subCommands: string[];
		autoApproveAllowed: 'allowed' | 'needsOptIn' | 'off';
		autoApproveResult: 'approved' | 'denied' | 'manual';
		autoApproveReason: 'subCommand' | 'commandLine' | undefined;
		autoApproveDefault: boolean | undefined;
	}) {
		const subCommandsSanitized = state.subCommands.map(e => {
			const commandName = e.split(' ')[0];
			let sanitizedCommandName = commandName.toLowerCase();
			if (!commandAllowList.has(sanitizedCommandName)) {
				if (/^(?:[A-Z][a-z0-9]+)+(?:-(?:[A-Z][a-z0-9]+))*$/.test(commandName)) {
					sanitizedCommandName = '(unknown:pwsh)';
				} else if (/^[a-z0-9_\-\.\\\/:;]+$/i.test(commandName)) {
					const properties: string[] = [];
					if (/[a-z]/.test(commandName)) {
						properties.push('ascii_lower');
					}
					if (/[A-Z]/.test(commandName)) {
						properties.push('ascii_upper');
					}
					if (/[0-9]/.test(commandName)) {
						properties.push('numeric');
					}
					const chars: string[] = [];
					for (const c of ['.', '-', '_', '/', '\\', ':', ';']) {
						if (commandName.includes(c)) {
							chars.push(c);
						}
					}
					sanitizedCommandName = `(unknown:${properties.join(',')}:${chars.join('')})`;
				} else if (/[^\x00-\x7F]/.test(commandName)) {
					sanitizedCommandName = '(unknown:unicode)';
				} else {
					sanitizedCommandName = '(unknown)';
				}
			}
			return sanitizedCommandName;
		});

		type TelemetryEvent = {
			terminalToolSessionId: string | undefined;

			subCommands: TelemetryTrustedValue<string>;
			autoApproveAllowed: string;
			autoApproveResult: string;
			autoApproveReason: string | undefined;
			autoApproveDefault: boolean | undefined;
		};
		type TelemetryClassification = {
			owner: 'tyriar';
			comment: 'Understanding the auto approve behavior of the runInTerminal tool';

			terminalToolSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session ID for this particular terminal tool invocation.' };

			subCommands: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A sanitized list of sub-commands that were executed, encoded as a JSON array' };
			autoApproveAllowed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether auto-approve was allowed when evaluated' };
			autoApproveResult: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the command line was auto-approved' };
			autoApproveReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The reason it was auto approved or denied' };
			autoApproveDefault: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the command line was auto approved due to a default rule' };
		};

		this._telemetryService.publicLog2<TelemetryEvent, TelemetryClassification>('toolUse.runInTerminal.prepare', {
			terminalToolSessionId: state.terminalToolSessionId,
			subCommands: new TelemetryTrustedValue(JSON.stringify(subCommandsSanitized)),
			autoApproveAllowed: state.autoApproveAllowed,
			autoApproveResult: state.autoApproveResult,
			autoApproveReason: state.autoApproveReason,
			autoApproveDefault: state.autoApproveDefault,
		});
	}

	logInvoke(instance: ITerminalInstance, state: {
		terminalToolSessionId: string | undefined;
		didUserEditCommand: boolean;
		didToolEditCommand: boolean;
		error: string | undefined;
		isBackground: boolean;
		isNewSession: boolean;
		shellIntegrationQuality: ShellIntegrationQuality;
		outputLineCount: number;
		timingConnectMs: number;
		timingExecuteMs: number;
		pollDurationMs: number | undefined;
		terminalExecutionIdleBeforeTimeout: boolean | undefined;
		exitCode: number | undefined;
		inputUserChars: number;
		inputUserSigint: boolean;
		inputToolManualAcceptCount: number | undefined;
		inputToolManualRejectCount: number | undefined;
		inputToolManualChars: number | undefined;
		inputToolAutoAcceptCount: number | undefined;
		inputToolAutoChars: number | undefined;
		inputToolManualShownCount: number | undefined;
		inputToolFreeFormInputShownCount: number | undefined;
		inputToolFreeFormInputCount: number | undefined;
	}) {
		type TelemetryEvent = {
			terminalSessionId: string;
			terminalToolSessionId: string | undefined;

			result: string;
			strategy: 0 | 1 | 2;
			userEditedCommand: 0 | 1;
			toolEditedCommand: 0 | 1;
			isBackground: 0 | 1;
			isNewSession: 0 | 1;
			outputLineCount: number;
			nonZeroExitCode: -1 | 0 | 1;
			timingConnectMs: number;
			pollDurationMs: number;
			timingExecuteMs: number;
			terminalExecutionIdleBeforeTimeout: boolean;

			inputUserChars: number;
			inputUserSigint: boolean;
			inputToolManualAcceptCount: number;
			inputToolManualRejectCount: number;
			inputToolManualChars: number;
			inputToolManualShownCount: number;
			inputToolFreeFormInputShownCount: number;
			inputToolFreeFormInputCount: number;
		};
		type TelemetryClassification = {
			owner: 'tyriar';
			comment: 'Understanding the usage of the runInTerminal tool';

			terminalSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session ID of the terminal instance.' };
			terminalToolSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session ID for this particular terminal tool invocation.' };

			result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the tool ran successfully, or the type of error' };
			strategy: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'What strategy was used to execute the command (0=none, 1=basic, 2=rich)' };
			userEditedCommand: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user edited the command' };
			toolEditedCommand: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the tool edited the command' };
			isBackground: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the command is a background command' };
			isNewSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether this was the first execution for the terminal session' };
			outputLineCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many lines of output were produced, this is -1 when isBackground is true or if there\'s an error' };
			nonZeroExitCode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the command exited with a non-zero code (-1=error/unknown, 0=zero exit code, 1=non-zero)' };
			timingConnectMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long the terminal took to start up and connect to' };
			timingExecuteMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long the terminal took to execute the command' };
			pollDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long the tool polled for output, this is undefined when isBackground is true or if there\'s an error' };
			terminalExecutionIdleBeforeTimeout: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Indicates whether a terminal became idle before the run-in-terminal tool timed out or was cancelled by the user. This occurs when no data events are received twice consecutively and the model determines, based on terminal output, that the command has completed.' };

			inputUserChars: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of characters the user input manually, a single key stroke could map to several characters. Focus in/out sequences are not counted as part of this' };
			inputUserSigint: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user input the SIGINT signal' };
			inputToolManualAcceptCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the user manually accepted a detected suggestion' };
			inputToolManualRejectCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the user manually rejected a detected suggestion' };
			inputToolManualChars: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of characters input by manual acceptance of a suggestion' };
			inputToolManualShownCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the user was prompted to manually accept an input suggestion' };
			inputToolFreeFormInputShownCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the user was prompted to provide free form input' };
			inputToolFreeFormInputCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the user entered free form input after prompting' };
		};
		this._telemetryService.publicLog2<TelemetryEvent, TelemetryClassification>('toolUse.runInTerminal', {
			terminalSessionId: instance.sessionId,
			terminalToolSessionId: state.terminalToolSessionId,

			result: state.error ?? 'success',
			strategy: state.shellIntegrationQuality === ShellIntegrationQuality.Rich ? 2 : state.shellIntegrationQuality === ShellIntegrationQuality.Basic ? 1 : 0,
			userEditedCommand: state.didUserEditCommand ? 1 : 0,
			toolEditedCommand: state.didToolEditCommand ? 1 : 0,
			isBackground: state.isBackground ? 1 : 0,
			isNewSession: state.isNewSession ? 1 : 0,
			outputLineCount: state.outputLineCount,
			nonZeroExitCode: state.exitCode === undefined ? -1 : state.exitCode === 0 ? 0 : 1,
			timingConnectMs: state.timingConnectMs,
			timingExecuteMs: state.timingExecuteMs,
			pollDurationMs: state.pollDurationMs ?? 0,
			terminalExecutionIdleBeforeTimeout: state.terminalExecutionIdleBeforeTimeout ?? false,

			inputUserChars: state.inputUserChars,
			inputUserSigint: state.inputUserSigint,
			inputToolManualAcceptCount: state.inputToolManualAcceptCount ?? 0,
			inputToolManualRejectCount: state.inputToolManualRejectCount ?? 0,
			inputToolManualChars: state.inputToolManualChars ?? 0,
			inputToolManualShownCount: state.inputToolManualShownCount ?? 0,
			inputToolFreeFormInputShownCount: state.inputToolFreeFormInputShownCount ?? 0,
			inputToolFreeFormInputCount: state.inputToolFreeFormInputCount ?? 0,
		});
	}
}


const commandAllowList: ReadonlySet<string> = new Set([
	// Special chars/scripting
	'!',
	'@',
	'#',
	'$',
	'%',
	'^',
	'&',
	'*',
	'(',
	')',
	'~',
	'{',
	'}',
	'<',
	'>',

	// Utils
	'.',
	'7z',
	'alias',
	'assoc',
	'attrib',
	'awk',
	'basename',
	'bg',
	'blkid',
	'bunzip2',
	'bzip2',
	'cat',
	'cd',
	'certutil',
	'chkdsk',
	'chmod',
	'chown',
	'cipher',
	'clear',
	'cls',
	'cmp',
	'column',
	'comm',
	'compact',
	'compress',
	'copy',
	'cp',
	'curl',
	'cut',
	'date',
	'dd',
	'del',
	'df',
	'diff',
	'dig',
	'dir',
	'dirname',
	'diskpart',
	'dism',
	'disown',
	'du',
	'echo',
	'env',
	'erase',
	'eval',
	'expand',
	'export',
	'fc',
	'fdisk',
	'fg',
	'file',
	'find',
	'findstr',
	'fmt',
	'fold',
	'forfiles',
	'format',
	'free',
	'fsck',
	'git',
	'gpupdate',
	'grep',
	'groupadd',
	'groups',
	'gunzip',
	'gzip',
	'hash',
	'head',
	'hexdump',
	'history',
	'host',
	'htop',
	'icacls',
	'id',
	'ifconfig',
	'iostat',
	'ip',
	'ipconfig',
	'iptables',
	'jobs',
	'jq',
	'kill',
	'killall',
	'less',
	'ln',
	'locate',
	'ls',
	'lsblk',
	'lscpu',
	'lsof',
	'man',
	'mkdir',
	'mklink',
	'more',
	'mount',
	'move',
	'mv',
	'nbtstat',
	'nc/netcat',
	'net',
	'netstat',
	'nice',
	'nl',
	'nohup',
	'nslookup',
	'nslookup',
	'od',
	'passwd',
	'paste',
	'pathping',
	'pause',
	'pgrep',
	'ping',
	'pkill',
	'powercfg',
	'pr',
	'printenv',
	'ps',
	'pwd',
	'query',
	'rar',
	'readlink',
	'realpath',
	'reg',
	'rem',
	'ren',
	'rename',
	'renice',
	'rev',
	'rm',
	'rmdir',
	'robocopy',
	'route',
	'rsync',
	'sc',
	'schtasks',
	'scp',
	'sed',
	'seq',
	'set',
	'setx',
	'sfc',
	'shred',
	'shuf',
	'shutdown',
	'sleep',
	'sort',
	'source',
	'split',
	'ss',
	'ssh',
	'stat',
	'strings',
	'su',
	'subst',
	'sudo',
	'systeminfo',
	'tac',
	'tail',
	'tar',
	'tee',
	'telnet',
	'test',
	'time',
	'top',
	'touch',
	'tr',
	'traceroute',
	'tracert',
	'tree',
	'true',
	'truncate',
	'type',
	'type',
	'umask',
	'umount',
	'unalias',
	'uname',
	'uncompress',
	'unexpand',
	'uniq',
	'unlink',
	'unrar',
	'unzip',
	'uptime',
	'useradd',
	'usermod',
	'vmstat',
	'vol',
	'watch',
	'wc',
	'wget',
	'where',
	'whereis',
	'which',
	'who',
	'whoami',
	'wmic',
	'xargs',
	'xcopy',
	'xxd',
	'xz',
	'yes',
	'zcat',
	'zip',
	'zless',
	'zmore',

	// SCM
	'bitbucket',
	'bzr',
	'cvs',
	'gh',
	'git',
	'glab',
	'hg',
	'svn',
	'fossil',
	'p4',

	// Devtools, languages, package manager
	'adb',
	'ansible',
	'apk',
	'apt-get',
	'apt',
	'aws',
	'az',
	'brew',
	'bundle',
	'cargo',
	'choco',
	'clang',
	'cmake',
	'composer',
	'conan',
	'conda',
	'dnf',
	'docker-compose',
	'docker',
	'dotnet',
	'emacs',
	'esbuild',
	'eslint',
	'flatpak',
	'flutter',
	'fnm',
	'g++',
	'gcc',
	'gcloud',
	'go',
	'gradle',
	'helm',
	'java',
	'javac',
	'jest',
	'julia',
	'kotlin',
	'kubectl',
	'lua',
	'make',
	'mocha',
	'mvn',
	'n',
	'nano',
	'node',
	'npm',
	'nvm',
	'pacman',
	'perl',
	'php',
	'phpunit',
	'pip',
	'pipenv',
	'pnpm',
	'pod',
	'podman',
	'poetry',
	'python',
	'r',
	'rollup',
	'ruby',
	'rustc',
	'rustup',
	'snap',
	'swift',
	'terraform',
	'tsc',
	'tslint',
	'vagrant',
	'vcpkg',
	'vi',
	'vim',
	'vite',
	'vitest',
	'webpack',
	'yarn',
	'yum',
	'zypper',

	// AI tools
	'aider',
	'amp',
	'claude',
	'codex',
	'copilot',
	'gemini',
	'toad',
	'q',

	// Misc Windows executables
	'taskkill',
	'taskkill.exe',

	// PowerShell
	'add-content',
	'compare-object',
	'convertfrom-json',
	'convertto-json',
	'copy-item',
	'format-custom',
	'format-list',
	'format-table',
	'format-wide',
	'get-childitem',
	'get-command',
	'get-content',
	'get-date',
	'get-help',
	'get-location',
	'get-process',
	'get-random',
	'get-service',
	'invoke-expression',
	'invoke-restmethod',
	'invoke-webrequest',
	'join-path',
	'measure-command',
	'measure-object',
	'move-item',
	'new-item',
	'out-file',
	'remove-item',
	'restart-computer',
	'select-object',
	'select-string',
	'select-xml',
	'set-acl',
	'set-content',
	'set-itemproperty',
	'sort-object',
	'split-path',
	'start-process',
	'start-sleep',
	'stop-process',
	'test-path',
	'write-host',
	'write-output',

	// PowerShell aliases
	'iex',
	'irm',
	'iwr',
	'rd',
	'ri',
	'sp',
	'spps',
]);
