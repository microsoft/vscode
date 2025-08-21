/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
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
		autoApproveResult: 'approved' | 'denied' | 'manual';
		autoApproveReason: 'subCommand' | 'commandLine' | undefined;
		autoApproveDefault: boolean | undefined;
	}) {
		const subCommandsSanitized = state.subCommands.map(e => {
			let commandName = e.split(' ')[0].toLowerCase();
			if (!commandAllowList.has(commandName)) {
				if (/[\\\/]/.test(commandName)) {
					commandName = '(unknown:path)';
				} else {
					commandName = '(unknown)';
				}
			}
			return commandName;
		});

		type TelemetryEvent = {
			terminalToolSessionId: string | undefined;

			subCommands: string;
			autoApproveResult: string;
			autoApproveReason: string | undefined;
			autoApproveDefault: boolean | undefined;
		};
		type TelemetryClassification = {
			owner: 'tyriar';
			comment: 'Understanding the auto approve behavior of the runInTerminal tool';

			terminalToolSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session ID for this particular terminal tool invocation.' };

			subCommands: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A sanitized list of sub-commands that were executed, encoded as a JSON array' };
			autoApproveResult: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the command line was auto-approved' };
			autoApproveReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The reason it was auto approved or denied' };
			autoApproveDefault: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the command line was auto approved due to a default rule' };
		};

		this._telemetryService.publicLog2<TelemetryEvent, TelemetryClassification>('toolUse.runInTerminal.prepare', {
			terminalToolSessionId: state.terminalToolSessionId,
			subCommands: JSON.stringify(subCommandsSanitized),
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
		pollDurationMs?: number;
		terminalExecutionIdleBeforeTimeout?: boolean;
		exitCode: number | undefined;
		autoReplyCount?: number;
		inputUserChars: number;
		inputUserSigint: boolean;
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
			autoReplyCount: number;

			inputUserChars: number;
			inputUserSigint: boolean;
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
			autoReplyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the tool automatically replied to the terminal requesting user input.' };

			inputUserChars: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of characters the user input manually, a single key stroke could map to several characters. Focus in/out sequences are not counted as part of this' };
			inputUserSigint: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user input the SIGINT signal' };
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
			autoReplyCount: state.autoReplyCount ?? 0,

			inputUserChars: state.inputUserChars,
			inputUserSigint: state.inputUserSigint,
		});
	}
}


const commandAllowList: ReadonlySet<string> = new Set([
	// Utils
	'.',
	'7z',
	'alias',
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
	'chmod',
	'chown',
	'cmp',
	'column',
	'comm',
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
	'free',
	'git',
	'grep',
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
	'mkdir',
	'mklink',
	'more',
	'mount',
	'move',
	'mv',
	'nc/netcat',
	'netstat',
	'nice',
	'nl',
	'nohup',
	'nslookup',
	'nslookup',
	'od',
	'paste',
	'pathping',
	'pgrep',
	'ping',
	'pkill',
	'pr',
	'printenv',
	'ps',
	'pwd',
	'rar',
	'readlink',
	'realpath',
	'reg',
	'ren',
	'rename',
	'renice',
	'rev',
	'rm',
	'rmdir',
	'robocopy',
	'route',
	'rsync',
	'schtasks',
	'scp',
	'sed',
	'seq',
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
	'vmstat',
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
	'apk',
	'apt-get',
	'apt',
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
	'docker',
	'dotnet',
	'flatpak',
	'g++',
	'gcc',
	'go',
	'gradle',
	'java',
	'javac',
	'kotlin',
	'kubectl',
	'make',
	'mvn',
	'node',
	'npm',
	'pacman',
	'perl',
	'php',
	'phpunit',
	'pip',
	'pipenv',
	'pnpm',
	'pod',
	'poetry',
	'python',
	'ruby',
	'rustc',
	'snap',
	'swift',
	'vcpkg',
	'yarn',
	'yum',
	'zypper',
	'tsc',
	'eslint',
	'tslint',
	'jest',
	'mocha',
	'vitest',
	'webpack',
	'vite',
	'rollup',
	'esbuild',

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
