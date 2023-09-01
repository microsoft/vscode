/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { TabFocus } from 'vs/editor/browser/config/tabFocus';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export const editorTabFocusContextKey = new RawContextKey<boolean>('editorTabFocusMode', false, true);

export class TabFocusMode extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private _editorContext: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();

		this._editorContext = editorTabFocusContextKey.bindTo(contextKeyService);
		const editorConfig: boolean = configurationService.getValue('editor.tabFocusMode');
		this._editorContext.set(editorConfig);
		TabFocus.setTabFocusMode(editorConfig);
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.tabFocusMode')) {
				const editorConfig: boolean = configurationService.getValue('editor.tabFocusMode');
				TabFocus.setTabFocusMode(editorConfig);
				this._editorContext.set(editorConfig);
				this._onDidChange.fire();
			}
		}));
		TabFocus.onDidChangeTabFocus(() => this._editorContext.set(TabFocus.getTabFocusMode()));
	}
}
