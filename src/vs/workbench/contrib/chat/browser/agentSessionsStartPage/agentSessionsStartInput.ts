/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IUntypedEditorInput } from '../../../../common/editor.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';

export const agentSessionsStartInputTypeId = 'workbench.editors.agentSessionsStartInput';

export interface AgentSessionsStartEditorOptions extends IEditorOptions {
	selectedTab?: 'agents' | 'code' | 'learn';
}

export class AgentSessionsStartInput extends EditorInput {

	static readonly ID = agentSessionsStartInputTypeId;
	static readonly RESOURCE = URI.from({ scheme: Schemas.vscodeAgentSessionsStart, authority: 'start' });

	private _selectedTab: 'agents' | 'code' | 'learn' = 'agents';

	override get typeId(): string {
		return AgentSessionsStartInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override toUntyped(): IUntypedEditorInput {
		return {
			resource: AgentSessionsStartInput.RESOURCE,
			options: {
				override: AgentSessionsStartInput.ID,
				pinned: false
			}
		};
	}

	get resource(): URI | undefined {
		return AgentSessionsStartInput.RESOURCE;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		return other instanceof AgentSessionsStartInput;
	}

	constructor(options: AgentSessionsStartEditorOptions = {}) {
		super();
		this._selectedTab = options.selectedTab ?? 'agents';
	}

	override getName() {
		return localize('agentSessionsStart', "Agents");
	}

	get selectedTab(): 'agents' | 'code' | 'learn' {
		return this._selectedTab;
	}

	set selectedTab(tab: 'agents' | 'code' | 'learn') {
		this._selectedTab = tab;
		this._onDidChangeLabel.fire();
	}
}
