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
	/** Space-separated command-line arguments from the profile, if any. */
	readonly commandLineArgs?: string;
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

/** Undo the XML entity escaping used inside .slnx attribute values. */
function unescapeXml(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
}

/** Extract the project paths (forward-slashed, relative) listed in a .slnx file. */
export function parseSlnxProjects(slnxText: string): string[] {
	const out: string[] = [];
	const re = /<Project\s+[^>]*Path\s*=\s*"([^"]+\.csproj)"/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(slnxText))) {
		out.push(unescapeXml(m[1]).replace(/\\/g, '/'));
	}
	return out;
}

/** Extract the target framework: <TargetFramework>, or the first entry of <TargetFrameworks>. */
export function targetFrameworkOf(csprojXml: string): string | undefined {
	const single = /<TargetFramework>\s*([^<\s]+)\s*<\/TargetFramework>/i.exec(csprojXml)?.[1];
	if (single) {
		return single;
	}
	const multi = /<TargetFrameworks>\s*([^<]+)\s*<\/TargetFrameworks>/i.exec(csprojXml)?.[1];
	return multi?.split(';')[0]?.trim() || undefined;
}

/** Extract <AssemblyName> from a .csproj, if present. */
export function assemblyNameOf(csprojXml: string): string | undefined {
	return /<AssemblyName>\s*([^<\s]+)\s*<\/AssemblyName>/i.exec(csprojXml)?.[1];
}

/** Remove // and /* *​/ comments from JSON-with-comments text without touching string values. */
export function stripJsonComments(text: string): string {
	let out = '';
	let inString = false;
	let escaped = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			out += ch;
			if (escaped) {
				escaped = false;
			} else if (ch === '\\') {
				escaped = true;
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
			out += ch;
			continue;
		}
		if (ch === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') { i++; }
			if (i < text.length) { out += '\n'; } // keep line structure intact
			continue;
		}
		if (ch === '/' && text[i + 1] === '*') {
			i += 2;
			while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { i++; }
			i++;
			continue;
		}
		out += ch;
	}
	return out;
}

/** Tolerant JSON parse: launchSettings.json routinely contains comments. */
function parseJsonCLike(text: string): any {
	return JSON.parse(stripJsonComments(text));
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
					const anyP = p as {
						applicationUrl?: string;
						environmentVariables?: Record<string, string>;
						commandLineArgs?: string;
					};
					profiles.push({
						name,
						applicationUrl: anyP.applicationUrl ?? '',
						environmentVariables: anyP.environmentVariables ?? {},
						commandLineArgs: anyP.commandLineArgs,
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

/** Split a launch profile's commandLineArgs string into arguments, honouring double quotes
 *  (e.g. `--message "hello world"` stays one argument). */
export function splitCommandLineArgs(args: string): string[] {
	const out: string[] = [];
	let current = '';
	let inQuote = false;
	for (const ch of args) {
		if (ch === '"') {
			inQuote = !inQuote;
			continue;
		}
		if (ch === ' ' && !inQuote) {
			if (current.length > 0) {
				out.push(current);
				current = '';
			}
			continue;
		}
		current += ch;
	}
	if (current.length > 0) {
		out.push(current);
	}
	return out;
}
