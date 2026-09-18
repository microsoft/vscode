/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'node:crypto';
import { createBashPromptScript, createPowerShellPromptScript } from './promptScripts.js';

class PromptInitialization {
	private pending = '';
	private settled = false;
	private resolve!: () => void;
	private reject!: (error: Error) => void;
	readonly ready: Promise<void>;

	constructor(
		readonly command: string,
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

	/** Removes only this initialization's acknowledgement, including markers split across frames. */
	accept(data: string): string {
		let value = this.pending + data;
		this.pending = '';
		let output = '';
		while (value.length > 0) {
			const success = value.indexOf(this.successMarker);
			const error = value.indexOf(this.errorMarker);
			const index = success < 0 ? error : error < 0 ? success : Math.min(success, error);
			if (index >= 0) {
				const marker = index === success ? this.successMarker : this.errorMarker;
				output += value.slice(0, index);
				value = value.slice(index + marker.length);
				if (!this.settled) {
					this.settled = true;
					if (marker === this.successMarker) {
						this.resolve();
					} else {
						this.reject(new Error('Remote prompt initialization failed. Review the shell error above, or reconnect with --no-prompt-prefix.'));
					}
				}
				continue;
			}
			let suffixLength = Math.min(value.length, Math.max(this.successMarker.length, this.errorMarker.length) - 1);
			while (suffixLength > 0) {
				const suffix = value.slice(-suffixLength);
				if (this.successMarker.startsWith(suffix) || this.errorMarker.startsWith(suffix)) {
					break;
				}
				suffixLength--;
			}
			output += value.slice(0, value.length - suffixLength);
			this.pending = suffixLength > 0 ? value.slice(-suffixLength) : '';
			break;
		}
		return output;
	}

	flush(): string {
		const pending = this.pending;
		this.pending = '';
		return pending;
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
	const successMarker = `\x1b${prefix}ok\x07`;
	const errorMarker = `\x1b${prefix}error\x07`;
	let command: string;
	if (shell === 'bash') {
		const encoded = Buffer.from(createBashPromptScript(tunnelName), 'utf8').toString('base64');
		command = `if __tunnel_prompt_setup=$(printf %s '${encoded}' | base64 -d) && . <(printf %s "$__tunnel_prompt_setup"); then printf '\\033${prefix}ok\\007'; else printf '%s\\n' 'Tunnel prompt initialization failed.' >&2; printf '\\033${prefix}error\\007'; fi; unset __tunnel_prompt_setup\r`;
	} else {
		const encoded = Buffer.from(createPowerShellPromptScript(tunnelName), 'utf8').toString('base64');
		command = `$__tunnel_prompt_preference=$ErrorActionPreference; try { $ErrorActionPreference='Stop'; . ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')))); [Console]::Write(([char]27)+'${prefix}ok'+[char]7) } catch { Write-Error $_ -ErrorAction Continue; [Console]::Write(([char]27)+'${prefix}error'+[char]7) } finally { $ErrorActionPreference=$__tunnel_prompt_preference; Remove-Variable __tunnel_prompt_preference }\r`;
	}
	return new PromptInitialization(command, successMarker, errorMarker);
}
