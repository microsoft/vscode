/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Mirrors `GitConfigParser` and `parseGitmodules` of extensions/git/src/git.ts, so that the agent host finds the same
// submodules as Source Control. Keep the two in sync; the tests port the Git extension's `parseGitmodules` tests.

interface IGitConfigSection {
	readonly name: string;
	readonly subSectionName?: string;
	readonly properties: Record<string, string>;
}

const LINE_SEPARATOR = /\r?\n/;
const PROPERTY_REGEX = /^\s*(\w+)\s*=\s*"?([^"]+)"?$/;
const SECTION_REGEX = /^\s*\[\s*([^\]]+?)\s*(\"[^"]+\")*\]\s*$/;

function parseGitConfig(raw: string): IGitConfigSection[] {
	const sections: IGitConfigSection[] = [];
	// Without a prototype, a key such as `__proto__` is an ordinary property
	const newProperties = (): Record<string, string> => Object.create(null);
	let section: IGitConfigSection = { name: 'DEFAULT', properties: newProperties() };
	for (const line of raw.split(LINE_SEPARATOR)) {
		const sectionMatch = line.match(SECTION_REGEX);
		if (sectionMatch?.length === 3) {
			sections.push(section);
			section = { name: sectionMatch[1], subSectionName: sectionMatch[2]?.replaceAll('"', ''), properties: newProperties() };
			continue;
		}
		const propertyMatch = line.match(PROPERTY_REGEX);
		if (propertyMatch?.length === 3 && !Object.hasOwn(section.properties, propertyMatch[1])) {
			section.properties[propertyMatch[1]] = propertyMatch[2];
		}
	}
	sections.push(section);
	return sections;
}

/** A submodule a `.gitmodules` file lists. */
export interface IGitmodulesEntry {
	readonly name: string;
	/** Its path, relative to the repository root, as written. */
	readonly path: string;
	readonly url: string;
}

/** The submodules a `.gitmodules` file lists, in order: the `submodule` sections that have a name, a path and a URL. */
export function parseGitmodules(raw: string): IGitmodulesEntry[] {
	const result: IGitmodulesEntry[] = [];
	for (const section of parseGitConfig(raw)) {
		const { path, url } = section.properties;
		if (section.name === 'submodule' && section.subSectionName && path && url) {
			result.push({ name: section.subSectionName, path, url });
		}
	}
	return result;
}
