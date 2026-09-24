/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { TestContext } from './context.js';

export interface DesktopLauncher {
	readonly name: string;
	launch(args: string[]): void;
}

/**
 * Read only the main group: desktop actions can have their own Exec and Name keys.
 */
export function parseDesktopEntry(contents: string): Record<string, string> {
	const entry: Record<string, string> = {};
	let mainGroup = false;
	for (const line of contents.split(/\r?\n/)) {
		if (line.startsWith('[')) {
			mainGroup = line === '[Desktop Entry]';
		} else if (mainGroup && !line.startsWith('#')) {
			const separator = line.indexOf('=');
			if (separator > 0) {
				entry[line.slice(0, separator)] = line.slice(separator + 1);
			}
		}
	}
	return entry;
}

/**
 * These launchers contain an executable, switches and one file/URL field code.
 * Reject other forms rather than interpreting desktop Exec as a shell command.
 */
export function desktopCommand(entry: Record<string, string>): { executable: string; args: string[] } {
	const match = /^(?:"(?<quotedExecutable>[^"]+)"|(?<executable>\S+))(?<arguments>(?:\s+(?:--[\w-]+|%[FU]))*)$/.exec(entry.Exec ?? '');
	assert.ok(match?.groups, `Unsupported desktop Exec: ${entry.Exec}`);
	const args = match.groups.arguments.trim().split(/\s+/).filter(Boolean);
	assert.deepStrictEqual(args.filter(arg => arg.startsWith('%')), [entry.MimeType?.includes('x-scheme-handler/') ? '%U' : '%F']);
	return { executable: match.groups.quotedExecutable ?? match.groups.executable, args: args.filter(arg => !arg.startsWith('%')) };
}

/**
 * Compatibility entries must remain launchable, but must not duplicate the app menu.
 */
export function validateDesktopEntries(entries: readonly Record<string, string>[]) {
	assert.strictEqual(entries.length, 4);
	for (const [index, entry] of entries.entries()) {
		assert.strictEqual(entry.Type, 'Application');
		assert.notStrictEqual(entry.Hidden, 'true', 'Hidden=true disables saved launchers');
		assert.strictEqual(entry.NoDisplay === 'true', index !== 0, 'Only the canonical application entry should be visible');
		if (index < 2) {
			assert.ok(entry.StartupWMClass, 'Missing StartupWMClass');
		}
		const command = desktopCommand(entry);
		if (index >= 2) {
			assert.ok(entry.MimeType?.includes('x-scheme-handler/'), 'Missing URL handler MIME type');
			assert.ok(command.args.includes('--open-url'), 'URL handler must pass --open-url');
		}
	}
	for (const [canonical, legacy] of [[entries[0], entries[1]], [entries[2], entries[3]]]) {
		assert.deepStrictEqual(
			[legacy.Exec, legacy.StartupWMClass, legacy.MimeType],
			[canonical.Exec, canonical.StartupWMClass, canonical.MimeType],
			'Legacy launcher must have the same target and window identity as the canonical launcher',
		);
	}
}

/**
 * Bound launcher helpers so a broken target cannot hang the synchronous test runner.
 */
function runLauncher(context: TestContext, command: string, args: string[]) {
	context.log(`Launching: ${command} ${args.join(' ')}`);
	const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30_000 });
	assert.ifError(result.error);
	assert.strictEqual(result.status, 0, `Launcher failed: ${result.stderr}`);
}

/**
 * Validate both current and saved launcher IDs from an installed DEB/RPM.
 */
export function linuxLaunchers(context: TestContext, entryPoint: string): DesktopLauncher[] {
	const applicationName = path.basename(entryPoint);
	const product: { linuxDesktopName: string } = JSON.parse(fs.readFileSync(path.join(path.dirname(entryPoint), 'resources', 'app', 'product.json'), 'utf8'));
	const canonicalId = product.linuxDesktopName;
	assert.ok(canonicalId, 'Missing Linux desktop identity in product.json');
	const names = [`${canonicalId}.desktop`, `${applicationName}.desktop`, `${canonicalId}.UrlHandler.desktop`, `${applicationName}-url-handler.desktop`];
	const entries = names.map(name => parseDesktopEntry(fs.readFileSync(path.join('/usr/share/applications', name), 'utf8')));
	validateDesktopEntries(entries);
	for (const entry of entries) {
		const { executable } = desktopCommand(entry);
		fs.accessSync(executable, fs.constants.X_OK);
		assert.strictEqual(fs.realpathSync(executable), fs.realpathSync(entryPoint), 'Desktop entry targets the wrong installation');
	}
	return entries.slice(0, 2).map((entry, index) => ({
		name: names[index],
		launch: args => {
			const command = desktopCommand(entry);
			runLauncher(context, command.executable, [...command.args, ...(context.isRootUser ? ['--no-sandbox'] : []), ...args]);
		},
	}));
}

function powershellString(value: string): string {
	return `'${value.replace(/'/g, '\'\'')}'`;
}

/**
 * Resolve shell-known folders rather than assuming an English or unredirected profile.
 */
export function windowsLaunchers(context: TestContext, entryPoint: string, type: 'user' | 'system'): DesktopLauncher[] {
	const product: { nameLong: string } = JSON.parse(fs.readFileSync(path.join(path.dirname(entryPoint), 'resources', 'app', 'product.json'), 'utf8'));
	const folders = type === 'user' ? ['Programs', 'DesktopDirectory'] : ['CommonPrograms', 'CommonDesktopDirectory'];
	const script = `
		$ErrorActionPreference = 'Stop'
		$shell = New-Object -ComObject WScript.Shell
		$name = ${powershellString(product.nameLong)}
		@(
			Join-Path ([Environment]::GetFolderPath('${folders[0]}')) "$name\\$name.lnk"
			Join-Path ([Environment]::GetFolderPath('${folders[1]}')) "$name.lnk"
		) | ForEach-Object {
			if (!(Test-Path -LiteralPath $_)) { throw "Missing shortcut: $_" }
			$link = $shell.CreateShortcut($_)
			[PSCustomObject]@{ path = $_; target = $link.TargetPath; arguments = $link.Arguments }
		} | ConvertTo-Json -Compress
	`;
	const shortcuts: { path: string; target: string; arguments: string }[] = JSON.parse(context.runNoErrors('powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script).stdout);
	assert.strictEqual(shortcuts.length, 2);
	return shortcuts.map(shortcut => {
		assert.strictEqual(fs.realpathSync(shortcut.target).toLowerCase(), fs.realpathSync(entryPoint).toLowerCase(), `Wrong shortcut target: ${shortcut.path}`);
		assert.strictEqual(shortcut.arguments, '', `Unexpected shortcut arguments: ${shortcut.path}`);
		return {
			name: shortcut.path,
			launch: args => {
				const argumentsString = args.map(arg => `"${arg}"`).join(' ');
				runLauncher(context, 'powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
					`$ErrorActionPreference = 'Stop'; Start-Process -FilePath ${powershellString(shortcut.path)} -ArgumentList ${powershellString(argumentsString)}`]);
			},
		};
	});
}

/**
 * Launch the exact downloaded bundle, not another registered version of VS Code.
 */
export function macOSLaunchers(context: TestContext, entryPoint: string): DesktopLauncher[] {
	const bundle = path.dirname(path.dirname(path.dirname(entryPoint)));
	const plist = path.join(bundle, 'Contents', 'Info.plist');
	const executable = context.runNoErrors('/usr/libexec/PlistBuddy', '-c', 'Print :CFBundleExecutable', plist).stdout.trim();
	const bundleType = context.runNoErrors('/usr/libexec/PlistBuddy', '-c', 'Print :CFBundlePackageType', plist).stdout.trim();
	assert.deepStrictEqual([executable, bundleType], [path.basename(entryPoint), 'APPL']);
	return [{
		name: bundle,
		launch: args => runLauncher(context, '/usr/bin/open', ['-n', '-a', bundle, '--args', ...args]),
	}];
}
