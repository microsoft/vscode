/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { writeFile, exists } from 'vs/base/node/pfs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { join, basename, dirname, extname } from 'path';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { timeout } from 'vs/base/common/async';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import URI from 'vs/base/common/uri';
import { ISnippetsService } from 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';
import { values } from 'vs/base/common/map';

const id = 'workbench.action.openSnippets';

namespace ISnippetPick {
	export function is(thing: object): thing is ISnippetPick {
		return thing && typeof (<ISnippetPick>thing).filepath === 'string';
	}
}

interface ISnippetPick extends IPickOpenEntry {
	filepath: string;
	hint?: true;
}

async function computePicks(snippetService: ISnippetsService, envService: IEnvironmentService, modeService: IModeService) {

	const existing: ISnippetPick[] = [];
	const future: ISnippetPick[] = [];

	const seen = new Set<string>();

	for (const file of await snippetService.getSnippetFiles()) {

		if (!file.isUserSnippets) {
			// skip extension snippets
			continue;
		}

		if (file.isGlobalSnippets) {

			await file.load();

			// list scopes for global snippets
			const names = new Set<string>();
			outer: for (const snippet of file.data) {
				for (const scope of snippet.scopes) {
					const name = modeService.getLanguageName(scope);
					if (names.size >= 4) {
						names.add(`${name}...`);
						break outer;
					} else {
						names.add(name);
					}
				}
			}

			existing.push({
				label: basename(file.filepath),
				filepath: file.filepath,
				description: names.size === 0
					? nls.localize('global.scope', "(global)")
					: nls.localize('global.1', "({0})", values(names).join(', '))
			});

		} else {
			// language snippet
			const mode = basename(file.filepath, '.json');
			existing.push({
				label: basename(file.filepath),
				description: `(${modeService.getLanguageName(mode)})`,
				filepath: file.filepath
			});
			seen.add(mode);
		}
	}

	const dir = join(envService.appSettingsHome, 'snippets');
	for (const mode of modeService.getRegisteredModes()) {
		const label = modeService.getLanguageName(mode);
		if (label && !seen.has(mode)) {
			future.push({
				label: mode,
				description: `(${label})`,
				filepath: join(dir, `${mode}.json`),
				hint: true
			});
		}
	}

	existing.sort((a, b) => {
		let a_ext = extname(a.filepath);
		let b_ext = extname(b.filepath);
		if (a_ext === b_ext) {
			return a.label.localeCompare(b.label);
		} else if (a_ext === '.code-snippets') {
			return -1;
		} else {
			return 1;
		}
	});

	future.sort((a, b) => {
		return a.label.localeCompare(b.label);
	});

	return { existing, future };
}

async function createGlobalSnippetFile(envService: IEnvironmentService, windowService: IWindowService, opener: IOpenerService) {

	await timeout(100); // ensure quick pick closes...

	const defaultPath = join(envService.appSettingsHome, 'snippets');
	const path = await windowService.showSaveDialog({
		defaultPath,
		filters: [{ name: 'Code Snippets', extensions: ['code-snippets'] }]
	});
	if (!path || dirname(path) !== defaultPath) {
		return undefined;
	}
	await writeFile(path, [
		'{',
		'\t// Place your global snippets here. Each snippet is defined under a snippet name and has a scope, prefix, body and ',
		'\t// description. Add comma separated ids of the languages where the snippet is applicable in the scope field. If scope ',
		'\t// is left empty or omitted, the snippet gets applied to all languages. The prefix is what is ',
		'\t// used to trigger the snippet and the body will be expanded and inserted. Possible variables are: ',
		'\t// $1, $2 for tab stops, $0 for the final cursor position, and ${1:label}, ${2:another} for placeholders. ',
		'\t// Placeholders with the same ids are connected.',
		'\t// Example:',
		'\t// "Print to console": {',
		'\t// \t"scope": "javascript,typescript",',
		'\t// \t"prefix": "log",',
		'\t// \t"body": [',
		'\t// \t\t"console.log(\'$1\');",',
		'\t// \t\t"$2"',
		'\t// \t],',
		'\t// \t"description": "Log output to console"',
		'\t// }',
		'}'
	].join('\n'));

	await opener.open(URI.file(path));
}

async function createLanguageSnippetFile(pick: ISnippetPick) {
	if (await exists(pick.filepath)) {
		return;
	}
	const contents = [
		'{',
		'\t// Place your snippets for ' + pick.label + ' here. Each snippet is defined under a snippet name and has a prefix, body and ',
		'\t// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:',
		'\t// $1, $2 for tab stops, $0 for the final cursor position, and ${1:label}, ${2:another} for placeholders. Placeholders with the ',
		'\t// same ids are connected.',
		'\t// Example:',
		'\t// "Print to console": {',
		'\t// \t"prefix": "log",',
		'\t// \t"body": [',
		'\t// \t\t"console.log(\'$1\');",',
		'\t// \t\t"$2"',
		'\t// \t],',
		'\t// \t"description": "Log output to console"',
		'\t// }',
		'}'
	].join('\n');
	await writeFile(pick.filepath, contents);
}

CommandsRegistry.registerCommand(id, async accessor => {

	const snippetService = accessor.get(ISnippetsService);
	const quickOpenService = accessor.get(IQuickOpenService);
	const opener = accessor.get(IOpenerService);
	const windowService = accessor.get(IWindowService);
	const modeService = accessor.get(IModeService);
	const envService = accessor.get(IEnvironmentService);

	const { existing, future } = await computePicks(snippetService, envService, modeService);
	const newGlobalPick = <IPickOpenEntry>{ label: nls.localize('new.global', "New Global Snippets file...") };
	if (existing.length > 0) {
		existing[0].separator = { label: nls.localize('group.global', "Existing Snippets") };
		newGlobalPick.separator = { border: true, label: nls.localize('new.global.sep', "New Snippets") };
	} else {
		newGlobalPick.separator = { label: nls.localize('new.global.sep', "New Snippets") };
	}

	const pick = await quickOpenService.pick(<(IPickOpenEntry | ISnippetPick)[]>[].concat(existing, newGlobalPick, future), {
		placeHolder: nls.localize('openSnippet.pickLanguage', "Select Snippets File or Create Snippets"),
		matchOnDescription: true
	});

	if (pick === newGlobalPick) {
		return createGlobalSnippetFile(envService, windowService, opener);

	} else if (ISnippetPick.is(pick)) {
		if (pick.hint) {
			await createLanguageSnippetFile(pick);
		}
		return opener.open(URI.file(pick.filepath));
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id,
		title: { value: nls.localize('openSnippet.label', "Configure User Snippets"), original: 'Preferences: Configure User Snippets' },
		category: nls.localize('preferences', "Preferences")
	}
});
