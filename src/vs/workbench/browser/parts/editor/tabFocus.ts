/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { TabFocus } from 'vs/editor/browser/config/tabFocus';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class TabFocusMode extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<boolean>());
	readonly onDidChange = this._onDidChange.event;

	constructor(@IConfigurationService configurationService: IConfigurationService) {
		super();
		TabFocus.onDidChangeTabFocus((tabFocusMode) => this._onDidChange.fire(tabFocusMode));
		const editorConfig: boolean = configurationService.getValue('editor.tabFocusMode');
		TabFocus.setTabFocusMode(editorConfig);
		this._onDidChange.fire(editorConfig);
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.tabFocusMode')) {
				const value: boolean = configurationService.getValue('editor.tabFocusMode');
				TabFocus.setTabFocusMode(value);
				this._onDidChange.fire(value);
			}
		}));
	}
}
