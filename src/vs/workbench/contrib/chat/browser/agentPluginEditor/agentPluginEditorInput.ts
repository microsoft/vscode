/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { AgentPluginItemKind, IAgentPluginItem } from './agentPluginItems.js';

const AgentPluginEditorIcon = registerIcon('agent-plugin-editor-icon', Codicon.extensions, localize('agentPluginEditorLabelIcon', 'Icon of the Agent Plugin editor.'));

function getPluginId(item: IAgentPluginItem): string {
	if (item.kind === AgentPluginItemKind.Installed) {
		return item.plugin.uri.toString();
	}
	return `${item.marketplaceReference.canonicalId}/${item.source}`;
}

export class AgentPluginEditorInput extends EditorInput {

	static readonly ID = 'workbench.agentPlugin.input';

	override get typeId(): string {
		return AgentPluginEditorInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal;
	}

	override get resource() {
		return URI.from({
			scheme: Schemas.extension,
			path: `/agentPlugin/${encodeURIComponent(getPluginId(this._item))}`
		});
	}

	constructor(private _item: IAgentPluginItem) {
		super();
	}

	get item(): IAgentPluginItem { return this._item; }

	override getName(): string {
		return localize('agentPluginInputName', "Plugin: {0}", this._item.name);
	}

	override getIcon(): ThemeIcon | undefined {
		return AgentPluginEditorIcon;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		return other instanceof AgentPluginEditorInput && getPluginId(this._item) === getPluginId(other._item);
	}
}
