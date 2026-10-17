/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const bashState = '__vscode_tunnel_prompt_7a9d3e';
const powerShellState = '__VscodeTunnelPrompt_7A9D3E';

function promptPrefix(tunnelName: string): string {
	if (!tunnelName || /[\p{C}\p{Zl}\p{Zp}]/u.test(tunnelName)) {
		throw new Error('The tunnel prompt label must be nonempty and contain only printable characters.');
	}
	return `[${tunnelName}] `;
}

function bashLiteral(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Modifies an already initialized Bash session; does not source profiles or write files.
 * The final PROMPT_COMMAND hook runs after existing hooks and preserves their exit status.
 */
export function createBashPromptScript(tunnelName: string): string {
	const prefix = promptPrefix(tunnelName);
	const state = bashState;
	const marker = '${' + state + '_prefix}';
	return `
if declare -F ${state}_install >/dev/null; then
	printf '%s\\n' 'Tunnel prompt initialization failed: reserved Bash function already exists.' >&2
	false
else
	${state}_install() {
		local declaration variable
		for variable in PS1 PROMPT_COMMAND ${state}_prefix ${state}_literal ${state}_rendered ${state}_owner; do
			declaration=$(declare -p "$variable" 2>/dev/null) || declaration=''
			if [[ $declaration =~ ^declare\\ -[^[:space:]]*r ]]; then
				printf 'Tunnel prompt initialization failed: %s is readonly.\\n' "$variable" >&2
				return 1
			fi
		done
		declaration=$(declare -p PROMPT_COMMAND 2>/dev/null) || declaration=''
		if [[ $declaration =~ ^declare\\ -[^[:space:]]*A ]]; then
			printf '%s\\n' 'Tunnel prompt initialization failed: associative PROMPT_COMMAND is unsupported.' >&2
			return 1
		fi
		if [[ \${${state}_owner-} != 'vscode-tunnel-prompt-v1' ]]; then
			for variable in ${state}_owner ${state}_prefix ${state}_literal ${state}_rendered; do
				if declare -p "$variable" &>/dev/null; then
					printf '%s\\n' 'Tunnel prompt initialization failed: reserved Bash session state already exists.' >&2
					return 1
				fi
			done
			if declare -F ${state}_apply >/dev/null; then
				printf '%s\\n' 'Tunnel prompt initialization failed: reserved Bash session state already exists.' >&2
				return 1
			fi
		fi
		${state}_apply() {
			local previous_status=$? next_prefix
			if [[ -n \${${state}_rendered-} && \${PS1-} == "$${state}_rendered"* ]]; then
				PS1=\${PS1#"$${state}_rendered"}
			fi
			if shopt -q promptvars; then
				next_prefix=${bashLiteral(marker)}
			else
				next_prefix=$${state}_literal
			fi
			PS1="$next_prefix\${PS1-}"
			${state}_rendered=$next_prefix
			return "$previous_status"
		} || return 1
		${state}_owner='vscode-tunnel-prompt-v1'
		${state}_prefix=${bashLiteral(prefix)}
		${state}_literal=${bashLiteral(prefix.replaceAll('\\', '\\\\'))}
		declaration=$(declare -p PROMPT_COMMAND 2>/dev/null) || declaration=''
		if [[ $declaration =~ ^declare\\ -[^[:space:]]*a ]]; then
			for variable in "\${!PROMPT_COMMAND[@]}"; do
				if [[ \${PROMPT_COMMAND[variable]} == '${state}_apply' ]]; then
					unset 'PROMPT_COMMAND[variable]'
				fi
			done
			PROMPT_COMMAND+=('${state}_apply')
		else
			case "\${PROMPT_COMMAND-}" in
				'${state}_apply'|*$'\\n''${state}_apply') ;;
				'') PROMPT_COMMAND='${state}_apply' ;;
				*) PROMPT_COMMAND="$PROMPT_COMMAND"$'\\n''${state}_apply' ;;
			esac
		fi
		${state}_apply
	}
	if ${state}_install; then
		unset -f ${state}_install
	else
		unset -f ${state}_install
		false
	fi
fi
`;
}

/**
 * Dot-source into an existing PowerShell session. State, prompt and optional wsl function
 * are process-local; the native wsl.exe command remains accessible without the wrapper.
 */
export function createPowerShellPromptScript(tunnelName: string): string {
	const prefix = promptPrefix(tunnelName);
	const state = `$global:${powerShellState}`;
	const bashStartup = `if [ -r "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi\n${createBashPromptScript(tunnelName)}`;
	const startupCommand = `exec bash --rcfile <(printf %s ${Buffer.from(bashStartup, 'utf8').toString('base64')} | base64 -d) -i`;
	return `
& {
	$ErrorActionPreference = 'Stop'
	$existing = Microsoft.PowerShell.Utility\\Get-Variable -Name '${powerShellState}' -Scope Global -ErrorAction Ignore
	if ($existing -and (($existing.Value -isnot [hashtable]) -or ($existing.Value.Owner -ne 'vscode-tunnel-prompt-v1'))) {
		throw 'Tunnel prompt initialization failed: reserved PowerShell session state already exists.'
	}
	$nativeWsl = Microsoft.PowerShell.Core\\Get-Command wsl.exe -CommandType Application -ErrorAction Ignore | Microsoft.PowerShell.Utility\\Select-Object -First 1
	if ($nativeWsl) {
		$existingWsl = Microsoft.PowerShell.Core\\Get-Command wsl -CommandType Alias,Function -ErrorAction Ignore
		if ($existingWsl -and (!$existing -or ($existingWsl -isnot [System.Management.Automation.FunctionInfo]) -or ![object]::ReferenceEquals($existingWsl.ScriptBlock, $existing.Value.WslWrapper))) {
			throw 'Tunnel prompt initialization failed: an existing wsl alias or function would be overwritten. Remove it explicitly or use --no-prompt-prefix.'
		}
	}
	$currentPrompt = Microsoft.PowerShell.Core\\Get-Command prompt -CommandType Function -ErrorAction Stop
	if (!$existing) {
		${state} = @{
			Owner = 'vscode-tunnel-prompt-v1'
			OriginalPrompt = $currentPrompt.ScriptBlock
		}
	} elseif (![object]::ReferenceEquals($currentPrompt.ScriptBlock, ${state}.PromptWrapper)) {
		${state}.OriginalPrompt = $currentPrompt.ScriptBlock
	}
	${state}.Prefix = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(prefix, 'utf8').toString('base64')}'))
	${state}.BashStartupCommand = '${startupCommand}'
	function global:prompt {
		$previousSuccess = $?
		$previousExitCode = Microsoft.PowerShell.Utility\\Get-Variable LASTEXITCODE -Scope Global -ErrorAction Ignore
		$previousExitCodeValue = if ($previousExitCode) { $previousExitCode.Value } else { $null }
		try {
			# Ignore restores $? without emitting an error or adding a record to $Error.
			if (!$previousSuccess) { Microsoft.PowerShell.Utility\\Write-Error 'Previous command failed.' -ErrorAction Ignore }
			$originalPrompt = & ${state}.OriginalPrompt
			${state}.Prefix + ($originalPrompt -join '')
		} finally {
			if ($previousExitCode) { $global:LASTEXITCODE = $previousExitCodeValue }
			else { Microsoft.PowerShell.Utility\\Remove-Variable LASTEXITCODE -Scope Global -ErrorAction Ignore }
		}
	}
	${state}.PromptWrapper = (Microsoft.PowerShell.Core\\Get-Command prompt -CommandType Function).ScriptBlock
	if ($nativeWsl) {
		${state}.WslPath = $nativeWsl.Path
		function global:wsl {
			$interactive = $true
			for ($index = 0; $index -lt $args.Count; $index++) {
				if (@('-d', '--distribution', '-u', '--user', '--cd') -cnotcontains $args[$index]) {
					$interactive = $false
					break
				}
				$index++
				if ($index -ge $args.Count -or [string]::IsNullOrEmpty([string]$args[$index]) -or ([string]$args[$index]).StartsWith('-')) {
					$interactive = $false
					break
				}
			}
			if ($interactive) {
				& ${state}.WslPath @args --exec bash --noprofile --norc -c ${state}.BashStartupCommand
			} else {
				& ${state}.WslPath @args
			}
		}
		${state}.WslWrapper = (Microsoft.PowerShell.Core\\Get-Command wsl -CommandType Function).ScriptBlock
	}
}
`;
}
