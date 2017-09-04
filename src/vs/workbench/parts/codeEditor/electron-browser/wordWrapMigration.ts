/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IMessageService } from 'vs/platform/message/common/message';
import { IPreferencesService } from 'vs/workbench/parts/preferences/common/preferences';
import { Action } from 'vs/base/common/actions';
import Severity from 'vs/base/common/severity';

interface IStorageData {
	dontShowPrompt: boolean;
}

class WordWrapMigrationStorage {
	private static KEY = 'wordWrapMigration';

	private _storageService: IStorageService;
	private _value: IStorageData;

	constructor(storageService: IStorageService) {
		this._storageService = storageService;
		this._value = this._read();
	}

	private _read(): IStorageData {
		let jsonValue = this._storageService.get(WordWrapMigrationStorage.KEY, StorageScope.GLOBAL);
		if (!jsonValue) {
			return null;
		}
		try {
			return JSON.parse(jsonValue);
		} catch (err) {
			return null;
		}
	}

	public get(): IStorageData {
		return this._value;
	}

	public set(data: IStorageData): void {
		this._value = data;
		this._storageService.store(WordWrapMigrationStorage.KEY, JSON.stringify(this._value), StorageScope.GLOBAL);
	}
}

@editorContribution
class WordWrapMigrationController extends Disposable implements IEditorContribution {

	private static ID = 'editor.contrib.wordWrapMigrationController';
	private static _checked = false;

	constructor(
		editor: ICodeEditor,
		@IConfigurationService private configurationService: IConfigurationService,
		@IMessageService private messageService: IMessageService,
		@IStorageService private storageService: IStorageService,
		@IPreferencesService private preferencesService: IPreferencesService
	) {
		super();

		this._promptIfNecessary();
	}

	public getId(): string {
		return WordWrapMigrationController.ID;
	}

	private _promptIfNecessary(): void {
		if (WordWrapMigrationController._checked) {
			// Already checked
			return;
		}
		WordWrapMigrationController._checked = true;

		let result = this.configurationService.lookup('editor.wrappingColumn');
		if (typeof result.value === 'undefined') {
			// Setting is not used
			return;
		}

		const storage = new WordWrapMigrationStorage(this.storageService);
		const storedData = storage.get();
		if (storedData && storedData.dontShowPrompt) {
			// Do not prompt stored
			return;
		}

		let isUserSetting = (typeof result.user !== 'undefined');
		this._prompt(storage, isUserSetting);
	}

	private _prompt(storage: WordWrapMigrationStorage, userSettings: boolean): void {
		const okAction = new Action(
			'wordWrapMigration.ok',
			nls.localize('wordWrapMigration.ok', "OK"),
			null,
			true,
			() => TPromise.as(true)
		);
		const dontShowAgainAction = new Action(
			'wordWrapMigration.dontShowAgain',
			nls.localize('wordWrapMigration.dontShowAgain', "Don't show again"),
			null,
			true,
			() => {
				storage.set({
					dontShowPrompt: true
				});
				return TPromise.as(true);
			}
		);
		const openSettings = new Action(
			'wordWrapMigration.openSettings',
			nls.localize('wordWrapMigration.openSettings', "Open Settings"),
			null,
			true,
			() => {
				if (userSettings) {
					this.preferencesService.openGlobalSettings();
				} else {
					this.preferencesService.openWorkspaceSettings();
				}
				return TPromise.as(true);
			}
		);
		this.messageService.show(Severity.Info, {
			message: nls.localize('wordWrapMigration.prompt', "The setting `editor.wrappingColumn` has been deprecated in favor of `editor.wordWrap`."),
			actions: [okAction, openSettings, dontShowAgainAction]
		});
	}
}
