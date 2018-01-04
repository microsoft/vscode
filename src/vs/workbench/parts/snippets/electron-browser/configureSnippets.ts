/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { fileExists, writeFile, readdir } from 'vs/base/node/pfs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IQuickOpenService, IPickOpenEntry, ISeparator } from 'vs/platform/quickOpen/common/quickOpen';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { join, basename, dirname } from 'path';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { endsWith } from 'vs/base/common/strings';
import { timeout } from 'vs/base/common/async';

const id = 'workbench.action.openSnippets';

class LanguagePick implements IPickOpenEntry {

	static list(modeService: IModeService, envService: IEnvironmentService): LanguagePick[] {
		const modes = modeService.getRegisteredModes();
		const result: LanguagePick[] = [];
		for (const mode of modes) {
			const langLabel = modeService.getLanguageName(mode);
			if (langLabel) {
				result.push(new LanguagePick(langLabel, mode, join(envService.appSettingsHome, 'snippets', `${mode}.json`)));
			}
		}
		if (result.length > 0) {
			result.sort(LanguagePick.compare);
			result[0].separator = { label: nls.localize('group.lang', "Language Snippets") };
		}
		return result;
	}

	label: string;
	filepath: string;
	langName: string;

	separator?: ISeparator;

	constructor(langLabel: string, langName: string, filepath: string) {
		this.label = langLabel;
		this.langName = langName;
		this.filepath = filepath;
	}

	async create(): Promise<this> {
		const contents = [
			'{',
			'/*',
			'\t// Place your snippets for ' + this.langName + ' here. Each snippet is defined under a snippet name and has a prefix, body and ',
			'\t// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:',
			'\t// $1, $2 for tab stops, $0 for the final cursor position, and ${1:label}, ${2:another} for placeholders. Placeholders with the ',
			'\t// same ids are connected.',
			'\t// Example:',
			'\t"Print to console": {',
			'\t\t"prefix": "log",',
			'\t\t"body": [',
			'\t\t\t"console.log(\'$1\');",',
			'\t\t\t"$2"',
			'\t\t],',
			'\t\t"description": "Log output to console"',
			'\t}',
			'*/',
			'}'
		].join('\n');
		await writeFile(this.filepath, contents);
		return this;
	}

	static compare(a: LanguagePick, b: LanguagePick): number {
		return a.label.localeCompare(b.label);
	}
}

class SnippetFilePick implements IPickOpenEntry {

	static list(envService: IEnvironmentService): Thenable<SnippetFilePick[]> {
		const dir = join(envService.appSettingsHome, 'snippets');
		return readdir(dir).then(entries => {
			const result: SnippetFilePick[] = [];
			for (const filename of entries) {
				if (endsWith(filename, '.code-snippets')) {
					result.push(new SnippetFilePick(join(dir, filename)));
				}
			}
			if (result.length > 0) {
				result[0].separator = { border: true, label: nls.localize('group.global', "Global Snippets") };
			}
			return result;
		});
	}

	label: string;
	filepath: string;
	separator?: ISeparator;

	constructor(filepath: string) {
		this.label = basename(filepath);
		this.filepath = filepath;
	}
}

class NewSnippetFilePick implements IPickOpenEntry {

	readonly label: string = nls.localize('create', "Create Global Snippets File...");

	constructor(
		private _envService: IEnvironmentService,
		private _windowService: IWindowService
	) {
		//
	}

	async create(): Promise<string> {
		const defaultPath = join(this._envService.appSettingsHome, 'snippets');
		const path = await this._windowService.showSaveDialog({
			defaultPath,
			filters: [{ name: 'Code Snippets', extensions: ['code-snippets'] }]
		});
		if (!path || dirname(path) !== defaultPath) {
			return undefined;
		}
		await writeFile(path, [
			'{',
			'/*',
			'\t// Each snippet is defined under a snippet name and has a scope, prefix, body and ',
			'\t// description. The scope defines in watch languages the snippet is applicable. The prefix is what is ',
			'\t// used to trigger the snippet and the body will be expanded and inserted.Possible variables are: ',
			'\t// $1, $2 for tab stops, $0 for the final cursor position, and ${1:label}, ${2:another} for placeholders. ',
			'\t// Placeholders with the same ids are connected.',
			'\t// Example:',
			'\t"Print to console": {',
			'\t\t"scope": "javascript,typescript",',
			'\t\t"prefix": "log",',
			'\t\t"body": [',
			'\t\t\t"console.log(\'$1\');",',
			'\t\t\t"$2"',
			'\t\t],',
			'\t\t"description": "Log output to console"',
			'\t}',
			'*/',
			'}'
		].join('\n'));

		return path;
	}
}

type SnippetPick = LanguagePick | SnippetFilePick | NewSnippetFilePick;

CommandsRegistry.registerCommand(id, async accessor => {

	const quickOpenService = accessor.get(IQuickOpenService);
	const windowsService = accessor.get(IWindowsService);
	const windowService = accessor.get(IWindowService);
	const modeService = accessor.get(IModeService);
	const envService = accessor.get(IEnvironmentService);

	function openFile(filePath: string): TPromise<void> {
		return windowsService.openWindow([filePath], { forceReuseWindow: true });
	}

	const picks = <SnippetPick[]>[
		...LanguagePick.list(modeService, envService),
		...await SnippetFilePick.list(envService),
		new NewSnippetFilePick(envService, windowService),
	];

	const pick = await quickOpenService.pick(picks, {
		placeHolder: nls.localize('openSnippet.pickLanguage', "Select Language or Global snippet")
	});

	if (pick instanceof LanguagePick) {
		if (!await fileExists(pick.filepath)) {
			await pick.create();
		}
		return openFile(pick.filepath);

	} else if (pick instanceof SnippetFilePick) {
		// simply open the file
		return openFile(pick.filepath);

	} else if (pick instanceof NewSnippetFilePick) {
		await timeout(500); // quick pick will stay open otherwise
		const path = await pick.create();
		if (path) {
			return openFile(path);
		}
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id,
		title: { value: nls.localize('openSnippet.label', "Configure User Snippets"), original: 'Preferences: Configure User Snippets' },
		category: nls.localize('preferences', "Preferences")
	}
});
