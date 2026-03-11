/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { IUntypedEditorInput } from '../../../common/editor.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';

export const agentSessionsWelcomeInputTypeId = 'workbench.editors.agentSessionsWelcomeInput';
export type AgentSessionsWelcomeInitiator = 'startup' | 'command';
export type AgentSessionsWelcomeWorkspaceKind = 'empty' | 'folder' | 'workspace';

export interface AgentSessionsWelcomeEditorOptions extends IEditorOptions {
	showTelemetryNotice?: boolean;
	initiator?: AgentSessionsWelcomeInitiator;
	workspaceKind?: AgentSessionsWelcomeWorkspaceKind;
}

export class AgentSessionsWelcomeInput extends EditorInput {

	static readonly ID = agentSessionsWelcomeInputTypeId;
	static readonly RESOURCE = URI.from({ scheme: Schemas.walkThrough, authority: 'vscode_agent_sessions_welcome' });

	private _showTelemetryNotice: boolean;
	private _initiator: AgentSessionsWelcomeInitiator;
	private _workspaceKind?: AgentSessionsWelcomeWorkspaceKind;

	override get typeId(): string {
		return AgentSessionsWelcomeInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override toUntyped(): IUntypedEditorInput {
		return {
			resource: AgentSessionsWelcomeInput.RESOURCE,
			options: {
				override: AgentSessionsWelcomeInput.ID,
				pinned: false
			}
		};
	}

	get resource(): URI | undefined {
		return AgentSessionsWelcomeInput.RESOURCE;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		return other instanceof AgentSessionsWelcomeInput;
	}

	constructor(
		options: AgentSessionsWelcomeEditorOptions = {},
	) {
		super();
		this._showTelemetryNotice = !!options.showTelemetryNotice;
		this._initiator = options.initiator ?? 'command';
		this._workspaceKind = options.workspaceKind;
	}

	override getName() {
		return localize('agentSessionsWelcome', "Welcome");
	}

	get showTelemetryNotice(): boolean {
		return this._showTelemetryNotice;
	}

	set showTelemetryNotice(value: boolean) {
		this._showTelemetryNotice = value;
	}

	get initiator(): AgentSessionsWelcomeInitiator {
		return this._initiator;
	}

	get workspaceKind(): AgentSessionsWelcomeWorkspaceKind | undefined {
		return this._workspaceKind;
	}

	override getTelemetryDescriptor(): { [key: string]: unknown } {
		const descriptor = super.getTelemetryDescriptor();
		descriptor['initiator'] = this._initiator;
		descriptor['workspaceKind'] = this._workspaceKind;
		/* __GDPR__FRAGMENT__
			"EditorTelemetryDescriptor" : {
				"initiator" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "How the welcome page was opened - startup or command." },
				"workspaceKind" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The type of workspace - empty, folder, or workspace." }
			}
		*/
		return descriptor;
	}
}
