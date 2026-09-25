/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';
import { createBashPromptScript, createPowerShellPromptScript } from './promptScripts.js';

const viewportReset = '\x1b[0m\x1b[2J\x1b[H';
const startupDiagnosticLimit = 8192;

class PromptInitialization {
	private pending = '';
	private startupDiagnostic = '';
	private started = false;
	private settled = false;
	private resolve!: () => void;
	private reject!: (error: Error) => void;
	readonly ready: Promise<void>;

	constructor(
		readonly command: string,
		readonly startMarker: string,
		readonly successMarker: string,
		readonly errorMarker: string,
	) {
		this.ready = new Promise<void>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
		// A frame can reject initialization before the caller starts awaiting it.
		void this.ready.catch(() => { });
	}

	private output(data: string): string {
		if (this.started) {
			return data;
		}
		this.startupDiagnostic = (this.startupDiagnostic + data).slice(-startupDiagnosticLimit);
		return '';
	}

	/** Hides command echo until execution starts, then forwards diagnostics and the new prompt. */
	accept(data: string): string {
		let value = this.pending + data;
		this.pending = '';
		let output = '';
		while (value.length > 0) {
			let index = -1;
			let marker: string | undefined;
			for (const candidate of [this.startMarker, this.successMarker, this.errorMarker]) {
				const candidateIndex = value.indexOf(candidate);
				if (candidateIndex >= 0 && (index < 0 || candidateIndex < index)) {
					index = candidateIndex;
					marker = candidate;
				}
			}
			if (marker !== undefined) {
				output += this.output(value.slice(0, index));
				value = value.slice(index + marker.length);
				if (marker === this.startMarker) {
					if (!this.started) {
						this.started = true;
						this.startupDiagnostic = '';
						// The remote shell also clears its viewport before emitting this marker.
						output += viewportReset;
					}
				} else if (!this.settled) {
					this.settled = true;
					if (marker === this.successMarker && this.started) {
						this.resolve();
					} else {
						this.reject(new Error(this.started
							? 'Remote prompt initialization failed. Review the shell error above, or reconnect with --no-prompt-prefix.'
							: 'Remote prompt initialization failed before setup started. Reconnect with --no-prompt-prefix to inspect the shell.'));
					}
				}
				continue;
			}
			let suffixLength = Math.min(value.length, Math.max(this.startMarker.length, this.successMarker.length, this.errorMarker.length) - 1);
			while (suffixLength > 0) {
				const suffix = value.slice(-suffixLength);
				if (this.startMarker.startsWith(suffix) || this.successMarker.startsWith(suffix) || this.errorMarker.startsWith(suffix)) {
					break;
				}
				suffixLength--;
			}
			output += this.output(value.slice(0, value.length - suffixLength));
			this.pending = suffixLength > 0 ? value.slice(-suffixLength) : '';
			break;
		}
		return output;
	}

	flush(showDiagnostics = false): string {
		const pending = this.pending;
		this.pending = '';
		if (this.started) {
			return pending;
		}
		const diagnostic = stripVTControlCharacters(this.startupDiagnostic + pending)
			.replace(/\b[A-Za-z0-9+/]{80,}={0,2}/g, '[encoded setup text omitted]')
			.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '')
			.trim()
			.slice(-2000);
		this.startupDiagnostic = '';
		return showDiagnostics && diagnostic ? `\r\nLast startup output (setup did not start):\r\n${diagnostic}\r\n` : '';
	}

	dispose(): void {
		if (!this.settled) {
			this.settled = true;
			this.reject(new Error('Prompt initialization cancelled.'));
		}
	}
}

export function createPromptInitialization(shellTitle: string, tunnelName: string): PromptInitialization | undefined {
	const shell = shellTitle.split(/[/\\]/).at(-1)?.toLowerCase().replace(/\.exe$/, '');
	if (shell !== 'powershell' && shell !== 'pwsh' && shell !== 'bash') {
		return undefined;
	}
	const id = randomUUID();
	const prefix = `]777;tunnel-prompt;${id};`;
	const startMarker = `\x1b${prefix}start\x07`;
	const successMarker = `\x1b${prefix}ok\x07`;
	const errorMarker = `\x1b${prefix}error\x07`;
	let command: string;
	if (shell === 'bash') {
		const encoded = Buffer.from(createBashPromptScript(tunnelName), 'utf8').toString('base64');
		command = `printf '\\033[0m\\033[2J\\033[H\\033${prefix}start\\007'; if __tunnel_prompt_setup=$(printf %s '${encoded}' | base64 -d) && . <(printf %s "$__tunnel_prompt_setup"); then printf '\\033${prefix}ok\\007'; else printf '%s\\n' 'Tunnel prompt initialization failed.' >&2; printf '\\033${prefix}error\\007'; fi; unset __tunnel_prompt_setup\r`;
	} else {
		const encoded = Buffer.from(createPowerShellPromptScript(tunnelName), 'utf8').toString('base64');
		command = `[Console]::Write(([char]27)+'[0m'+([char]27)+'[2J'+([char]27)+'[H'+([char]27)+'${prefix}start'+[char]7); $__tunnel_prompt_preference=$ErrorActionPreference; try { $ErrorActionPreference='Stop'; . ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')))); [Console]::Write(([char]27)+'${prefix}ok'+[char]7) } catch { Write-Error $_ -ErrorAction Continue; [Console]::Write(([char]27)+'${prefix}error'+[char]7) } finally { $ErrorActionPreference=$__tunnel_prompt_preference; Remove-Variable __tunnel_prompt_preference }\r`;
	}
	return new PromptInitialization(command, startMarker, successMarker, errorMarker);
}
