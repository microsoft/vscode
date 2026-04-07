/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Remote } from '../vscode/git';

interface GitConfigSection {
	name: string;
	subSectionName?: string;
	properties: { [key: string]: string };
}

class GitConfigParser {
	private static readonly _lineSeparator = /\r?\n/;

	private static readonly _propertyRegex = /^\s*(\w+)\s*=\s*"?([^"]+)"?$/;
	private static readonly _sectionRegex = /^\s*\[\s*([^\]]+?)\s*(\"[^"]+\")*\]\s*$/;

	static parse(raw: string): GitConfigSection[] {
		const config: { sections: GitConfigSection[] } = { sections: [] };
		let section: GitConfigSection = { name: 'DEFAULT', properties: {} };

		const addSection = (section?: GitConfigSection) => {
			if (!section) { return; }
			config.sections.push(section);
		};

		for (const line of raw.split(GitConfigParser._lineSeparator)) {
			// Section
			const sectionMatch = line.match(GitConfigParser._sectionRegex);
			if (sectionMatch?.length === 3) {
				addSection(section);
				section = { name: sectionMatch[1], subSectionName: sectionMatch[2]?.replaceAll('"', ''), properties: {} };

				continue;
			}

			// Property
			const propertyMatch = line.match(GitConfigParser._propertyRegex);
			if (propertyMatch?.length === 3 && !Object.keys(section.properties).includes(propertyMatch[1])) {
				section.properties[propertyMatch[1]] = propertyMatch[2];
			}
		}

		addSection(section);

		return config.sections;
	}
}

export function parseGitRemotes(raw: string): Remote[] {
	const remotes: Remote[] = [];

	for (const remoteSection of GitConfigParser.parse(raw).filter(s => s.name === 'remote')) {
		if (remoteSection.subSectionName) {
			remotes.push({
				name: remoteSection.subSectionName,
				fetchUrl: remoteSection.properties['url'],
				pushUrl: remoteSection.properties['pushurl'] ?? remoteSection.properties['url'],
				isReadOnly: false
			});
		}
	}

	return remotes;
}

export interface GitUriParams {
	path: string;
	ref: string;
	submoduleOf?: string;
}

export interface GitUriOptions {
	scheme?: string;
	replaceFileExtension?: boolean;
	submoduleOf?: string;
}

// As a mitigation for extensions like ESLint showing warnings and errors
// for git URIs, let's change the file extension of these uris to .git,
// when `replaceFileExtension` is true.
export function toGitUri(uri: vscode.Uri, ref: string, options: GitUriOptions = {}): vscode.Uri {
	const params: GitUriParams = {
		path: uri.fsPath,
		ref
	};

	if (options.submoduleOf) {
		params.submoduleOf = options.submoduleOf;
	}

	let path = uri.path;

	if (options.replaceFileExtension) {
		path = `${path}.git`;
	} else if (options.submoduleOf) {
		path = `${path}.diff`;
	}

	return uri.with({ scheme: options.scheme ?? 'git', path, query: JSON.stringify(params) });
}
