/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

import * as types from 'vs/base/common/types';
import * as Paths from 'path';
import { ExtensionsRegistry, ExtensionMessageCollector } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ExtensionData, IThemeExtensionPoint } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { FileIconThemeData } from 'vs/workbench/services/themes/electron-browser/fileIconThemeData';

let iconThemeExtPoint = ExtensionsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>('iconThemes', [], {
	description: nls.localize('vscode.extension.contributes.iconThemes', 'Contributes file icon themes.'),
	type: 'array',
	items: {
		type: 'object',
		defaultSnippets: [{ body: { id: '${1:id}', label: '${2:label}', path: './fileicons/${3:id}-icon-theme.json' } }],
		properties: {
			id: {
				description: nls.localize('vscode.extension.contributes.iconThemes.id', 'Id of the icon theme as used in the user settings.'),
				type: 'string'
			},
			label: {
				description: nls.localize('vscode.extension.contributes.iconThemes.label', 'Label of the icon theme as shown in the UI.'),
				type: 'string'
			},
			path: {
				description: nls.localize('vscode.extension.contributes.iconThemes.path', 'Path of the icon theme definition file. The path is relative to the extension folder and is typically \'./icons/awesome-icon-theme.json\'.'),
				type: 'string'
			}
		},
		required: ['path', 'id']
	}
});
export class FileIconThemeStore {

	private knownIconThemes: FileIconThemeData[];
	private readonly onDidChangeEmitter: Emitter<FileIconThemeData[]>;

	public get onDidChange(): Event<FileIconThemeData[]> { return this.onDidChangeEmitter.event; }

	constructor(@IExtensionService private extensionService: IExtensionService) {
		this.knownIconThemes = [];
		this.onDidChangeEmitter = new Emitter<FileIconThemeData[]>();
		this.initialize();
	}

	private initialize() {
		iconThemeExtPoint.setHandler((extensions) => {
			for (let ext of extensions) {
				let extensionData = {
					extensionId: ext.description.id,
					extensionPublisher: ext.description.publisher,
					extensionName: ext.description.name,
					extensionIsBuiltin: ext.description.isBuiltin
				};
				this.onIconThemes(ext.description.extensionFolderPath, extensionData, ext.value, ext.collector);
			}
			this.onDidChangeEmitter.fire(this.knownIconThemes);
		});
	}

	private onIconThemes(extensionFolderPath: string, extensionData: ExtensionData, iconThemes: IThemeExtensionPoint[], collector: ExtensionMessageCollector): void {
		if (!Array.isArray(iconThemes)) {
			collector.error(nls.localize(
				'reqarray',
				"Extension point `{0}` must be an array.",
				iconThemeExtPoint.name
			));
			return;
		}
		iconThemes.forEach(iconTheme => {
			if (!iconTheme.path || !types.isString(iconTheme.path)) {
				collector.error(nls.localize(
					'reqpath',
					"Expected string in `contributes.{0}.path`. Provided value: {1}",
					iconThemeExtPoint.name,
					String(iconTheme.path)
				));
				return;
			}
			if (!iconTheme.id || !types.isString(iconTheme.id)) {
				collector.error(nls.localize(
					'reqid',
					"Expected string in `contributes.{0}.id`. Provided value: {1}",
					iconThemeExtPoint.name,
					String(iconTheme.path)
				));
				return;
			}
			let normalizedAbsolutePath = Paths.normalize(Paths.join(extensionFolderPath, iconTheme.path));

			if (normalizedAbsolutePath.indexOf(Paths.normalize(extensionFolderPath)) !== 0) {
				collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", iconThemeExtPoint.name, normalizedAbsolutePath, extensionFolderPath));
			}

			let themeData = FileIconThemeData.fromExtensionTheme(iconTheme, normalizedAbsolutePath, extensionData);
			this.knownIconThemes.push(themeData);
		});

	}

	public findThemeData(iconTheme: string): TPromise<FileIconThemeData> {
		return this.getFileIconThemes().then(allIconSets => {
			for (let iconSet of allIconSets) {
				if (iconSet.id === iconTheme) {
					return iconSet;
				}
			}
			return null;
		});
	}

	public findThemeBySettingsId(settingsId: string): TPromise<FileIconThemeData> {
		return this.getFileIconThemes().then(allIconSets => {
			for (let iconSet of allIconSets) {
				if (iconSet.settingsId === settingsId) {
					return iconSet;
				}
			}
			return null;
		});
	}

	public getFileIconThemes(): TPromise<FileIconThemeData[]> {
		return this.extensionService.whenInstalledExtensionsRegistered().then(isReady => {
			return this.knownIconThemes;
		});
	}

}
