/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { init, COMMAND_ID } from './aiGuardMenu.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const AiGuardEnabledContext = new RawContextKey<boolean>('aiGuardEnabled', true);

export class AiGuardContribution
	extends Disposable
	implements IWorkbenchContribution {

	private readonly _disabledResources = new ResourceMap<boolean>();
	private readonly _ctxAiGuardEnabled: IContextKey<boolean>;

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
		this._ctxAiGuardEnabled = AiGuardEnabledContext.bindTo(this._contextKeyService);

		this._register(init());

		this._register(CommandsRegistry.registerCommand(COMMAND_ID, (accessor, ...args) => {
			let resource: URI | undefined;
			if (args[0] instanceof URI) {
				resource = args[0];
			} else {
				resource = this._editorService.activeEditor?.resource;
			}

			if (resource) {
				this.toggle(resource);
			}
		}));

		this._register(this._codeEditorService.onCodeEditorAdd(this._onEditorAdd, this));
		this._codeEditorService.listCodeEditors().forEach(e => this._onEditorAdd(e));

		this._register(this._editorService.onDidActiveEditorChange(() => this._updateContextKey()));
		this._updateContextKey();
	}

	private toggle(resource: URI) {
		if (this._disabledResources.has(resource)) {
			this._disabledResources.delete(resource);
			this.updateEditors(resource, true); // Enable
			this.updateConfiguration(resource, true);
		} else {
			this._disabledResources.set(resource, true);
			this.updateEditors(resource, false); // Disable
			this.updateConfiguration(resource, false);
		}
		this._updateContextKey();
	}

	private _updateContextKey() {
		const resource = this._editorService.activeEditor?.resource;
		if (resource) {
			this._ctxAiGuardEnabled.set(!this._disabledResources.has(resource));
		} else {
			this._ctxAiGuardEnabled.set(true);
		}
	}

	private updateConfiguration(resource: URI, enabled: boolean) {
		const value = enabled ? undefined : false;
		const affordanceValue = enabled ? undefined : 'off';

		this._configurationService.updateValue('editor.inlineSuggest.enabled', value, { resource }, ConfigurationTarget.MEMORY);
		this._configurationService.updateValue('inlineChat.affordance', affordanceValue, { resource }, ConfigurationTarget.MEMORY);
	}

	private updateEditors(resource: URI, enabled: boolean) {
		for (const editor of this._codeEditorService.listCodeEditors()) {
			if (editor.hasModel() && editor.getModel().uri.toString() === resource.toString()) {
				this._applyGuard(editor, !enabled);
			}
		}
	}

	private _onEditorAdd(editor: ICodeEditor) {
		this._register(editor.onDidChangeModel(() => {
			if (editor.hasModel() && this._disabledResources.has(editor.getModel().uri)) {
				this._applyGuard(editor, true);
			}
		}));
		if (editor.hasModel() && this._disabledResources.has(editor.getModel().uri)) {
			this._applyGuard(editor, true);
		}
	}

	private _applyGuard(editor: ICodeEditor, disabled: boolean) {
		editor.updateOptions({ inlineSuggest: { enabled: !disabled } });
	}
}
