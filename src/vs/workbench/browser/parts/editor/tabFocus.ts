/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { TabFocusContext, TabFocus } from 'vs/editor/browser/config/tabFocus';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TerminalSettingId, terminalTabFocusModeContextKey } from 'vs/platform/terminal/common/terminal';

export const editorTabFocusContextKey = new RawContextKey<boolean>('editorTabFocusMode', false, true);

export class TabFocusMode extends Disposable {
	private _previousViewContext?: TabFocusContext;
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private _editorContext: IContextKey<boolean>;
	private _terminalContext: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();

		this._editorContext = editorTabFocusContextKey.bindTo(contextKeyService);
		this._terminalContext = terminalTabFocusModeContextKey.bindTo(contextKeyService);
		const editorConfig: boolean = configurationService.getValue('editor.tabFocusMode');
		const terminalConfig: boolean = configurationService.getValue(TerminalSettingId.TabFocusMode) ?? editorConfig;
		this._editorContext.set(editorConfig);
		this._terminalContext.set(terminalConfig);
		TabFocus.setTabFocusMode(editorConfig, TabFocusContext.Editor);
		TabFocus.setTabFocusMode(terminalConfig, TabFocusContext.Terminal);
		const viewKey = new Set<string>();
		viewKey.add('focusedView');
		this._register(contextKeyService.onDidChangeContext((c) => {
			if (c.affectsSome(viewKey)) {
				const terminalFocus = contextKeyService.getContextKeyValue('focusedView') === 'terminal';
				const context = terminalFocus ? TabFocusContext.Terminal : TabFocusContext.Editor;
				if (this._previousViewContext === context) {
					return;
				}
				if (terminalFocus) {
					this._editorContext.reset();
				} else {
					this._terminalContext.reset();
				}
				this._previousViewContext = context;
				this._onDidChange.fire();
			}
		}));
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.tabFocusMode')) {
				const editorConfig: boolean = configurationService.getValue('editor.tabFocusMode');
				TabFocus.setTabFocusMode(editorConfig, TabFocusContext.Editor);
				this._editorContext.set(editorConfig);
				const terminalConfig: boolean = configurationService.getValue(TerminalSettingId.TabFocusMode);
				if (terminalConfig === null) {
					// editor config overrides
					configurationService.updateValue(TerminalSettingId.TabFocusMode, editorConfig);
					TabFocus.setTabFocusMode(editorConfig, TabFocusContext.Terminal);
					this._terminalContext.set(editorConfig);
				}
				this._onDidChange.fire();
			} else if (e.affectsConfiguration(TerminalSettingId.TabFocusMode)) {
				const terminalConfig: boolean = configurationService.getValue(TerminalSettingId.TabFocusMode) ?? configurationService.getValue('editor.tabFocusMode');
				configurationService.updateValue(TerminalSettingId.TabFocusMode, terminalConfig);
				TabFocus.setTabFocusMode(terminalConfig, TabFocusContext.Terminal);
				this._terminalContext.set(terminalConfig);
				this._onDidChange.fire();
			}
		}));
		TabFocus.onDidChangeTabFocus(() => {
			const focusedView = contextKeyService.getContextKeyValue('focusedView') === 'terminal' ? TabFocusContext.Terminal : TabFocusContext.Editor;
			if (focusedView === TabFocusContext.Terminal) {
				this._terminalContext.set(TabFocus.getTabFocusMode(focusedView));
			} else {
				this._editorContext.set(TabFocus.getTabFocusMode(focusedView));
			}
		});
	}
}
