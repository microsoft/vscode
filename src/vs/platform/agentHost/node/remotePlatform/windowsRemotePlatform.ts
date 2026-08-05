/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	sshOperation,
	validateCommit,
	validateShellToken,
	type ISshExec,
} from '../sshRemoteAgentHostHelpers.js';
import {
	_asRemotePath,
	type CliPublishPolicy,
	type IInstallCliOptions,
	type IRemoteLaunchSpec,
	type IRemotePlatform,
	type IRemotePlatformInfo,
	type RemotePath,
} from './remotePlatform.js';

/**
 * Encode a PowerShell script payload for use with the
 * `-EncodedCommand` switch: UTF-16LE bytes, base64-encoded. Exported so
 * tests can round-trip the payload emitted for each operation.
 */
export function encodePowerShellCommand(payload: string): string {
	return Buffer.from(payload, 'utf16le').toString('base64');
}

/**
 * Wrap a PowerShell script fragment in the standard envelope: stop on
 * errors, silence progress records (which serialise to CLIXML on stderr
 * and dominate large transfers), pin the console output encoding to
 * UTF-8, and defer to the payload's own final `exit` statement.
 */
function wrapEnvelope(payload: string): string {
	return [
		`$ErrorActionPreference = 'Stop'`,
		`$ProgressPreference = 'SilentlyContinue'`,
		`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`,
		payload,
	].join('\n');
}

/**
 * Build the outer `powershell.exe -EncodedCommand ...` invocation. The
 * base64 alphabet contains no shell metacharacter, so this wire form is
 * inert under `cmd.exe`, PowerShell and `sh` alike - eliminating the
 * default-shell ambiguity of Win32-OpenSSH.
 */
export function buildPowerShellCommand(payload: string): string {
	const encoded = encodePowerShellCommand(wrapEnvelope(payload));
	return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
}

/** Escape a string for use inside a single-quoted PowerShell literal. */
function escapePSSingleQuoted(value: string): string {
	return `'${value.replace(/'/g, `''`)}'`;
}

const COMMIT_HEX_EXE_RE = /^[0-9a-f]{40}\.exe$/;

/**
 * The only principals the install boundary keeps: `OWNER RIGHTS` - which
 * resolves to whoever owns the object - plus `SYSTEM` and `Administrators`.
 * The latter two are parity with POSIX, where root already reads a 0600 file.
 */
const PROTECTED_SIDS = ['S-1-3-4', 'S-1-5-18', 'S-1-5-32-544'];

/**
 * PowerShell establishing the install boundary: the root is restricted to
 * {@link PROTECTED_SIDS} with an inheritable DACL, so no other unprivileged
 * account can modify anything we later place there and execute. The extraction
 * directory and the published binary are created beneath it and inherit it.
 *
 * `/inheritance:r` removes inherited ACEs on some hosts and converts them to
 * explicit ones on others, so the resulting DACL is swept and then re-read to
 * confirm nothing survived. Principals are named by SID because an account
 * name such as `AzureAD\\user@example.com` does not survive interpolation into
 * a command line, and the DACL is read through `System.Security.AccessControl`
 * rather than `Get-Acl` because `Microsoft.PowerShell.Security` is not loadable
 * on every host. A host that cannot apply this fails the install: the
 * alternative is executing a binary any local account could have swapped.
 */
const PROTECT_ROOT_PAYLOAD = [
	`$sids = @(${PROTECTED_SIDS.map(sid => `'${sid}'`).join(', ')})`,
	`function Get-VSCodeExtraSid($p) {`,
	`  $sd = [Security.AccessControl.DirectorySecurity]::new($p, 'Access')`,
	`  @($sd.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | Where-Object { $_.AccessControlType -eq 'Allow' -and $sids -notcontains $_.IdentityReference.Value } | ForEach-Object { $_.IdentityReference.Value })`,
	`}`,
	`if (-not (Test-Path -PathType Container -LiteralPath $root)) {`,
	`  New-Item -ItemType Directory -Path $root -Force | Out-Null`,
	`}`,
	`& icacls $root /inheritance:r /grant:r @($sids | ForEach-Object { '*' + $_ + ':(OI)(CI)F' }) | Out-Null`,
	`foreach ($s in (Get-VSCodeExtraSid $root)) { & icacls $root /remove:g ('*' + $s) | Out-Null }`,
	`$extra = Get-VSCodeExtraSid $root`,
	`if ($LASTEXITCODE -ne 0 -or $extra.Count -gt 0) { throw ('Could not restrict permissions on ' + $root + ' (' + ($extra -join ',') + ')') }`,
].join('\n');

/**
 * Publication step for {@link WindowsRemotePlatform.installCli}. `File.Replace`
 * renames the destination aside rather than unlinking it, so it succeeds even
 * against a mapped executable image and never leaves a window with no
 * destination; it carries the replaced file's DACL forward, which is why the
 * caller resets the destination to the install root's DACL afterwards.
 */
function buildPublishStep(publish: CliPublishPolicy): string {
	if (publish === 'immutable') {
		return [
			`  try {`,
			`    Move-Item -LiteralPath $extracted.FullName -Destination $dest -ErrorAction Stop`,
			`  } catch {`,
			`    if (-not (Test-Path -PathType Leaf -LiteralPath $dest)) { throw }`,
			`  }`,
		].join('\n');
	}
	return [
		`  if (Test-Path -PathType Leaf -LiteralPath $dest) {`,
		`    try { [System.IO.File]::Replace($extracted.FullName, $dest, [NullString]::Value) }`,
		`    catch { throw ('Could not replace ' + $dest + ': ' + $_.Exception.Message) }`,
		`  } else {`,
		`    Move-Item -LiteralPath $extracted.FullName -Destination $dest -ErrorAction Stop`,
		`  }`,
	].join('\n');
}

/**
 * Remote platform strategy for Windows remotes. Every operation is sent
 * as a base64-encoded PowerShell payload; native executables end with
 * `exit $LASTEXITCODE` so their exit code survives the envelope's
 * `$ErrorActionPreference = 'Stop'`.
 */
export class WindowsRemotePlatform implements IRemotePlatform {

	constructor(public readonly info: IRemotePlatformInfo) { }

	cliArchiveName(quality: string): string {
		const q = validateShellToken(quality, 'quality');
		switch (q) {
			case 'stable': return 'code';
			case 'exploration': return 'code-exploration';
			default: return 'code-insiders';
		}
	}

	installRoot(serverDataFolderName: string): RemotePath {
		const d = validateShellToken(serverDataFolderName, 'server data folder name');
		return _asRemotePath(`"$env:USERPROFILE\\${d}"`);
	}

	cliDataDir(serverDataFolderName: string): RemotePath {
		const d = validateShellToken(serverDataFolderName, 'server data folder name');
		return _asRemotePath(`"$env:USERPROFILE\\${d}\\cli"`);
	}

	cliBin(serverDataFolderName: string, quality: string, commit?: string): RemotePath {
		const d = validateShellToken(serverDataFolderName, 'server data folder name');
		const archive = this.cliArchiveName(quality);
		if (commit) {
			const c = validateCommit(commit);
			return _asRemotePath(`"$env:USERPROFILE\\${d}\\${archive}-${c}.exe"`);
		}
		return _asRemotePath(`"$env:USERPROFILE\\${d}\\${archive}.exe"`);
	}

	parseFallbackCliPath(candidate: string, serverDataFolderName: string, quality: string): RemotePath | undefined {
		const d = validateShellToken(serverDataFolderName, 'server data folder name');
		const archive = this.cliArchiveName(quality);
		const segment = `\\${d}\\${archive}-`;
		const idx = candidate.lastIndexOf(segment);
		if (idx <= 0) {
			return undefined;
		}
		const tail = candidate.slice(idx + segment.length);
		if (!COMMIT_HEX_EXE_RE.test(tail)) {
			return undefined;
		}
		if (candidate.indexOf('"') >= 0) {
			return undefined;
		}
		return _asRemotePath(escapePSSingleQuoted(candidate));
	}

	async isExecutableFile(exec: ISshExec, path: RemotePath): Promise<boolean> {
		const payload = [
			`$path = ${path}`,
			`if (Test-Path -PathType Leaf -LiteralPath $path) { exit 0 } else { exit 1 }`,
		].join('\n');
		const { code } = await exec(buildPowerShellCommand(payload), { description: sshOperation.checkCli, ignoreExitCode: true });
		return code === 0;
	}

	async touchFile(exec: ISshExec, path: RemotePath): Promise<boolean> {
		const payload = [
			`$path = ${path}`,
			`try {`,
			`  (Get-Item -LiteralPath $path).LastWriteTime = Get-Date`,
			`  exit 0`,
			`} catch { exit 1 }`,
		].join('\n');
		const { code } = await exec(buildPowerShellCommand(payload), { description: sshOperation.touchCli, ignoreExitCode: true });
		return code === 0;
	}

	async versionCheck(exec: ISshExec, cliBin: RemotePath): Promise<boolean> {
		const payload = [
			`$cli = ${cliBin}`,
			`try { & $cli --version | Out-Null } catch { exit 1 }`,
			`exit $LASTEXITCODE`,
		].join('\n');
		const { code } = await exec(buildPowerShellCommand(payload), { description: sshOperation.verifyCli, ignoreExitCode: true });
		return code === 0;
	}

	async installCli(exec: ISshExec, options: IInstallCliOptions): Promise<void> {
		const { url, installRoot, cliBin, publish } = options;
		// Boundary and download are separate executions because a single
		// payload carrying both would approach cmd.exe's 8191-character line.
		const prepare = [
			`$root = ${installRoot}`,
			PROTECT_ROOT_PAYLOAD,
			`exit 0`,
		].join('\n');
		await exec(buildPowerShellCommand(prepare), { description: sshOperation.installCli });

		const download = [
			`$root = ${installRoot}`,
			`$dest = ${cliBin}`,
			`$url = ${escapePSSingleQuoted(url)}`,
			`if (-not (Test-Path -PathType Container -LiteralPath $root)) { throw 'Install root is missing' }`,
			`$tmpdir = Join-Path $root ('.cli-install-' + [Guid]::NewGuid().ToString('N'))`,
			`New-Item -ItemType Directory -Path $tmpdir -Force | Out-Null`,
			`try {`,
			`  $zip = Join-Path $tmpdir 'cli.zip'`,
			`  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip`,
			`  Expand-Archive -LiteralPath $zip -DestinationPath $tmpdir -Force`,
			`  Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue`,
			`  $extracted = Get-ChildItem -LiteralPath $tmpdir -Filter '*.exe' -File | Select-Object -First 1`,
			`  if ($null -eq $extracted) { throw 'No .exe extracted from CLI archive' }`,
			buildPublishStep(publish),
			`} finally {`,
			`  Remove-Item -LiteralPath $tmpdir -Recurse -Force -ErrorAction SilentlyContinue`,
			`}`,
			`& icacls $dest /reset | Out-Null`,
			`if ($LASTEXITCODE -ne 0) { throw ('Could not restrict permissions on ' + $dest) }`,
			`exit 0`,
		].join('\n');
		await exec(buildPowerShellCommand(download), { description: sshOperation.installCli });
	}

	async pruneOldClis(exec: ISshExec, serverDataFolderName: string, quality: string, keep: number): Promise<void> {
		if (!Number.isInteger(keep) || keep < 0) {
			throw new Error(`Invalid keep count for pruneOldClis: ${keep}`);
		}
		const root = this.installRoot(serverDataFolderName);
		const archive = this.cliArchiveName(quality);
		const nameRegex = `^${archive}-[0-9a-f]{40}\\.exe$`;
		const payload = [
			`$root = ${root}`,
			`$candidates = @()`,
			`try {`,
			`  $candidates = @(Get-ChildItem -LiteralPath $root -File -ErrorAction Stop |`,
			`    Where-Object { $_.Name -match ${escapePSSingleQuoted(nameRegex)} } |`,
			`    Sort-Object LastWriteTime -Descending)`,
			`} catch { }`,
			`if ($candidates.Count -gt ${keep}) {`,
			`  $toDelete = @($candidates | Select-Object -Skip ${keep})`,
			`  foreach ($item in $toDelete) {`,
			`    try { Remove-Item -LiteralPath $item.FullName -Force -ErrorAction Stop } catch { }`,
			`  }`,
			`}`,
			`exit 0`,
		].join('\n');
		await exec(buildPowerShellCommand(payload), { description: sshOperation.pruneClis, ignoreExitCode: true });
	}

	async findFallbackClis(exec: ISshExec, serverDataFolderName: string, quality: string): Promise<readonly RemotePath[]> {
		const root = this.installRoot(serverDataFolderName);
		const archive = this.cliArchiveName(quality);
		const nameRegex = `^${archive}-[0-9a-f]{40}\\.exe$`;
		const payload = [
			`$root = ${root}`,
			`try {`,
			`  Get-ChildItem -LiteralPath $root -File -ErrorAction Stop |`,
			`    Where-Object { $_.Name -match ${escapePSSingleQuoted(nameRegex)} } |`,
			`    Sort-Object LastWriteTime -Descending |`,
			`    ForEach-Object { Write-Output $_.FullName }`,
			`} catch { }`,
			`exit 0`,
		].join('\n');
		const { stdout } = await exec(buildPowerShellCommand(payload), { description: sshOperation.findClis, ignoreExitCode: true });
		const results: RemotePath[] = [];
		for (const line of stdout.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}
			const parsed = this.parseFallbackCliPath(trimmed, serverDataFolderName, quality);
			if (parsed) {
				results.push(parsed);
			}
		}
		return results;
	}

	buildLaunchCommand(spec: IRemoteLaunchSpec): string {
		// A remote path already carries its own quoting and must reach
		// PowerShell unquoted so `$env:USERPROFILE` expands; only literals
		// are escaped.
		const args = spec.args
			.map(a => typeof a === 'string' ? escapePSSingleQuoted(a) : a.path)
			.join(' ');
		const payload = [
			`Write-Output "VSCODE_PID=$PID"`,
			`& ${spec.executable}${args ? ` ${args}` : ''}`,
			`exit $LASTEXITCODE`,
		].join('\n');
		return buildPowerShellCommand(payload);
	}

	buildRawLaunchCommand(_command: string): string {
		throw new Error('remoteAgentHostCommand override is not supported on Windows remotes.');
	}
}

/** Windows-side probe payload used by remote platform detection. */
export const WINDOWS_DETECTION_PAYLOAD = [
	`$archRaw = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }`,
	`switch ($archRaw) {`,
	`  'AMD64' { $arch = 'x64' }`,
	`  'ARM64' { $arch = 'arm64' }`,
	`  default { $arch = 'unknown' }`,
	`}`,
	`Write-Output "VSCODE_REMOTE_OS=win32 VSCODE_REMOTE_ARCH=$arch"`,
	`exit 0`,
].join('\n');

/** Encoded PowerShell command that emits the detection line. */
export function buildWindowsDetectionCommand(): string {
	return buildPowerShellCommand(WINDOWS_DETECTION_PAYLOAD);
}
