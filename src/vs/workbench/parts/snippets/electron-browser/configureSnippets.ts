/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { join, basename, dirname, extname } from 'path';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { timeout } from 'vs/base/common/async';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';
import { ISnippetsService } from 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';
import { values } from 'vs/base/common/map';
import { IQuickPickItem, IQuickInputService, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { SnippetSource } from 'vs/workbench/parts/snippets/electron-browser/snippetsFile';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IFileService } from 'vs/platform/files/common/files';
import { INotificationService } from 'vs/platform/notification/common/notification';

const id = 'workbench.action.openSnippets';

namespace ISnippetPick {
	export function is(thing: object): thing is ISnippetPick {
		return thing && typeof (<ISnippetPick>thing).filepath === 'string';
	}
}

interface ISnippetPick extends IQuickPickItem {
	filepath: string;
	hint?: true;
}

async function computePicks(snippetService: ISnippetsService, envService: IEnvironmentService, modeService: IModeService) {

	const existing: ISnippetPick[] = [];
	const future: ISnippetPick[] = [];

	const seen = new Set<string>();

	for (const file of await snippetService.getSnippetFiles()) {

		if (file.source === SnippetSource.Extension) {
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
					if (name) {
						if (names.size >= 4) {
							names.add(`${name}...`);
							break outer;
						} else {
							names.add(name);
						}
					}
				}
			}

			existing.push({
				label: basename(file.location.fsPath),
				filepath: file.location.fsPath,
				description: names.size === 0
					? nls.localize('global.scope', "(global)")
					: nls.localize('global.1', "({0})", values(names).join(', '))
			});

		} else {
			// language snippet
			const mode = basename(file.location.fsPath, '.json');
			existing.push({
				label: basename(file.location.fsPath),
				description: `(${modeService.getLanguageName(mode)})`,
				filepath: file.location.fsPath
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

async function createGlobalSnippetFile(defaultPath: URI, windowService: IWindowService, notificationService: INotificationService, fileService: IFileService, opener: IOpenerService) {

	await fileService.createFolder(defaultPath);
	await timeout(100); // ensure quick pick closes...

	const path = await windowService.showSaveDialog({
		defaultPath: defaultPath.fsPath,
		filters: [{ name: 'Code Snippets', extensions: ['code-snippets'] }]
	});
	if (!path) {
		return undefined;
	}
	const resource = URI.file(path);
	if (dirname(resource.fsPath) !== defaultPath.fsPath) {
		notificationService.error(nls.localize('badPath', "Snippets must be inside this folder: '{0}'. ", defaultPath.fsPath));
		return undefined;
	}

	await fileService.updateContent(resource, [
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

	await opener.open(resource);
	return undefined;
}

async function createLanguageSnippetFile(pick: ISnippetPick, fileService: IFileService) {
	if (await fileService.existsFile(URI.file(pick.filepath))) {
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
	await fileService.updateContent(URI.file(pick.filepath), contents);
}

CommandsRegistry.registerCommand(id, async accessor => {

	const snippetService = accessor.get(ISnippetsService);
	const quickInputService = accessor.get(IQuickInputService);
	const opener = accessor.get(IOpenerService);
	const windowService = accessor.get(IWindowService);
	const modeService = accessor.get(IModeService);
	const envService = accessor.get(IEnvironmentService);
	const notificationService = accessor.get(INotificationService);
	const workspaceService = accessor.get(IWorkspaceContextService);
	const fileService = accessor.get(IFileService);

	const picks = await computePicks(snippetService, envService, modeService);
	const existing: QuickPickInput[] = picks.existing;

	type GlobalSnippetPick = IQuickPickItem & { uri: URI };
	const globalSnippetPicks: GlobalSnippetPick[] = [{
		label: nls.localize('new.global', "New Global Snippets file..."),
		uri: URI.file(join(envService.appSettingsHome, 'snippets'))
	}];
	for (const folder of workspaceService.getWorkspace().folders) {
		globalSnippetPicks.push({
			label: nls.localize('new.folder', "New Snippets file for '{0}'...", folder.name),
			uri: folder.toResource('.vscode')
		});
	}

	if (existing.length > 0) {
		existing.unshift({ type: 'separator', label: nls.localize('group.global', "Existing Snippets") });
		existing.push({ type: 'separator', label: nls.localize('new.global.sep', "New Snippets") });
	} else {
		existing.push({ type: 'separator', label: nls.localize('new.global.sep', "New Snippets") });
	}

	const pick = await quickInputService.pick(([] as QuickPickInput[]).concat(existing, globalSnippetPicks, picks.future), {
		placeHolder: nls.localize('openSnippet.pickLanguage', "Select Snippets File or Create Snippets"),
		matchOnDescription: true
	});

	if (globalSnippetPicks.indexOf(pick as GlobalSnippetPick) >= 0) {
		return createGlobalSnippetFile((pick as GlobalSnippetPick).uri, windowService, notificationService, fileService, opener);
	} else if (ISnippetPick.is(pick)) {
		if (pick.hint) {
			await createLanguageSnippetFile(pick, fileService);
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

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '3_snippets',
	command: {
		id,
		title: nls.localize({ key: 'miOpenSnippets', comment: ['&& denotes a mnemonic'] }, "User &&Snippets")
	},
	order: 1
});
