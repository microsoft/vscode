/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure project-detection and launch-profile logic for the dotnet extension.
 * No `vscode` imports: this module is the liftable seam from the pipeline prototype
 * (extensions/dotnet/PROTOTYPE-pipeline.html) and is unit-testable with plain node.
 */

export type ProjectKind = 'WEB' | 'CONSOLE' | 'LIBRARY';

export interface LaunchProfile {
	readonly name: string;
	readonly applicationUrl: string;
	readonly environmentVariables: Readonly<Record<string, string>>;
	/** True when this profile was synthesized (no Launch Settings existed), never written to disk. */
	readonly synthesized?: boolean;
}

export interface ResolvedProfiles {
	readonly profiles: readonly LaunchProfile[];
	/** True when the profiles came from the implicit Default Profile instead of launchSettings.json. */
	readonly synthesized: boolean;
	/** Profiles that were dropped because they are not `commandName: "Project"` (e.g. IIS Express). */
	readonly ignored: readonly { name: string; commandName: string }[];
}

/** Classify a .csproj by its SDK and output type. */
export function classifyCsproj(csprojXml: string): ProjectKind {
	const sdk = /\bSdk\s*=\s*"([^"]+)"/.exec(csprojXml)?.[1] ?? '';
	if (sdk === 'Microsoft.NET.Sdk.Web') {
		return 'WEB';
	}
	if (/<OutputType>\s*Exe\s*<\/OutputType>/i.test(csprojXml)) {
		return 'CONSOLE';
	}
	return 'LIBRARY';
}

export function isRunnableKind(kind: ProjectKind): boolean {
	return kind === 'WEB' || kind === 'CONSOLE';
}

/** Extract the project paths (forward-slashed, relative) listed in a .sln file. */
export function parseSlnProjects(slnText: string): string[] {
	const out: string[] = [];
	const re = /^Project\([^)]*\)\s*=\s*"[^"]*"\s*,\s*"([^"]+\.csproj)"/gmi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(slnText))) {
		out.push(m[1].replace(/\\/g, '/'));
	}
	return out;
}

/** Extract <TargetFramework> from a .csproj, if present. */
export function targetFrameworkOf(csprojXml: string): string | undefined {
	return /<TargetFramework>\s*([^<\s]+)\s*<\/TargetFramework>/i.exec(csprojXml)?.[1];
}

/** Extract <AssemblyName> from a .csproj, if present. */
export function assemblyNameOf(csprojXml: string): string | undefined {
	return /<AssemblyName>\s*([^<\s]+)\s*<\/AssemblyName>/i.exec(csprojXml)?.[1];
}

/** Tolerant JSON parse: launchSettings.json routinely contains comments. */
function parseJsonCLike(text: string): any {
	const stripped = text
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/[^\n\r]*/g, '$1');
	return JSON.parse(stripped);
}

const defaultProfile = (forWeb: boolean): LaunchProfile => ({
	name: 'Default Profile',
	applicationUrl: forWeb ? 'http://localhost:5000' : '',
	environmentVariables: {},
	synthesized: true,
});

/** Launch Settings → pickable Launch Profiles.
 *
 * `commandName: "Project"` profiles are kept; anything else (IIS Express) is ignored.
 * When nothing usable remains — including when there is no file at all — the implicit
 * Default Profile is synthesized in memory.
 */
export function resolveProfiles(launchSettingsText: string | undefined, kind: ProjectKind): ResolvedProfiles {
	const profiles: LaunchProfile[] = [];
	const ignored: { name: string; commandName: string }[] = [];
	if (launchSettingsText !== undefined) {
		try {
			const ls = parseJsonCLike(launchSettingsText);
			for (const [name, p] of Object.entries(ls?.profiles ?? {})) {
				const commandName = (p as { commandName?: string })?.commandName;
				if (commandName === 'Project') {
					const anyP = p as { applicationUrl?: string; environmentVariables?: Record<string, string> };
					profiles.push({
						name,
						applicationUrl: anyP.applicationUrl ?? '',
						environmentVariables: anyP.environmentVariables ?? {},
					});
				} else {
					ignored.push({ name, commandName: commandName ?? 'unknown' });
				}
			}
		} catch {
			// Malformed file: fall through to the synthesized Default Profile.
		}
	}
	if (profiles.length === 0) {
		profiles.push(defaultProfile(kind === 'WEB'));
		return { profiles, synthesized: true, ignored };
	}
	return { profiles, synthesized: false, ignored };
}

/** The first http(s) URL in an applicationUrl string like "https://localhost:7001;http://localhost:7000". */
export function firstHttpUrl(applicationUrl: string): string | undefined {
	return applicationUrl
		.split(';')
		.map(u => u.trim())
		.find(u => /^https?:\/\//.test(u));
}
