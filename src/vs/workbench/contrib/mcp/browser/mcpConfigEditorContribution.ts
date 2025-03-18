/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { markdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { findNodeAtLocation, parseTree as jsonParseTree, Node } from '../../../../base/common/json.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { InlayHint, InlayHintList } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { ConfigurationResolverExpression, IResolvedValue } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { mcpConfigurationSection } from '../common/mcpConfiguration.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { EditStoredInput, RemoveStoredInput } from './mcpCommands.js';

export class McpConfigEditorContribution extends Disposable implements IEditorContribution {
	public static readonly ID = 'editor.contrib.mcpConfigEditing';

	public static get(editor: ICodeEditor): McpConfigEditorContribution | null {
		return editor.getContribution<McpConfigEditorContribution>(McpConfigEditorContribution.ID);
	}

	private readonly _displayed = this._register(new DisposableStore());

	private readonly _uris: { uri: URI; scope: StorageScope; target: ConfigurationTarget; pathPrefix: string[] }[] = [];

	constructor(
		private readonly _editor: ICodeEditor,
		@IPreferencesService private readonly _preferencesService: IPreferencesService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
	) {
		super();

		this._uris.push({ uri: this._preferencesService.userSettingsResource, target: ConfigurationTarget.USER_LOCAL, scope: StorageScope.PROFILE, pathPrefix: [mcpConfigurationSection] });
		if (this._preferencesService.workspaceSettingsResource) {
			this._uris.push({ uri: this._preferencesService.workspaceSettingsResource, target: ConfigurationTarget.WORKSPACE, scope: StorageScope.WORKSPACE, pathPrefix: [mcpConfigurationSection] });
			this._uris.push({ uri: URI.joinPath(this._preferencesService.workspaceSettingsResource, '../mcp.json'), target: ConfigurationTarget.WORKSPACE, scope: StorageScope.WORKSPACE, pathPrefix: [] });
		}
		this._register(this._editor.onDidChangeModel(() => this._onModelChanged()));
		this._onModelChanged();

		this._remoteAgentService.getEnvironment().then(remoteEnvironment => {
			if (remoteEnvironment) {
				this._uris.push({ uri: remoteEnvironment.settingsPath, target: ConfigurationTarget.USER_REMOTE, scope: StorageScope.PROFILE, pathPrefix: [mcpConfigurationSection] });
			}
		});
	}

	private _onModelChanged(): void {
	}
}


