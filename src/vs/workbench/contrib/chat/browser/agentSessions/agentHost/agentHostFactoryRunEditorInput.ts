/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';

const factoryRunEditorIcon = registerIcon('agent-host-factory-run-editor-label-icon', Codicon.layers, localize('agentHostFactoryRunEditorLabelIcon', 'Icon of the Agent Factory run editor label.'));

export const AGENT_HOST_FACTORY_RUN_SCHEME = 'agent-host-factory-run';

interface ISerializedAgentHostFactoryRunEditorInput {
	readonly sessionResource: string;
	readonly runId: string;
	readonly factoryName: string;
}

/**
 * Opens one Agent Factory run of an Agent Host session. The pane resolves the
 * session through the connections service and follows its live state, so the
 * input only needs to identify the run.
 */
export class AgentHostFactoryRunEditorInput extends EditorInput {

	static readonly ID = 'workbench.editor.agentHostFactoryRun';

	static buildResource(sessionResource: URI, runId: string): URI {
		return URI.from({ scheme: AGENT_HOST_FACTORY_RUN_SCHEME, path: `/${runId}`, query: sessionResource.toString() });
	}

	override get typeId(): string { return AgentHostFactoryRunEditorInput.ID; }

	override get editorId(): string | undefined { return AgentHostFactoryRunEditorInput.ID; }

	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly; }

	readonly resource: URI;

	constructor(
		/** The workbench chat session resource that owns the run. */
		readonly sessionResource: URI,
		readonly runId: string,
		readonly factoryName: string,
	) {
		super();
		this.resource = AgentHostFactoryRunEditorInput.buildResource(sessionResource, runId);
	}

	override getName(): string {
		return this.factoryName;
	}

	override getDescription(): string | undefined {
		return localize('agentHostFactoryRunInputDescription', "Factory Run");
	}

	override getIcon(): ThemeIcon {
		return factoryRunEditorIcon;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}
		return other instanceof AgentHostFactoryRunEditorInput && isEqual(other.resource, this.resource);
	}
}

export class AgentHostFactoryRunEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return editorInput instanceof AgentHostFactoryRunEditorInput;
	}

	serialize(editorInput: EditorInput): string | undefined {
		if (!(editorInput instanceof AgentHostFactoryRunEditorInput)) {
			return undefined;
		}
		const serialized: ISerializedAgentHostFactoryRunEditorInput = {
			sessionResource: editorInput.sessionResource.toString(),
			runId: editorInput.runId,
			factoryName: editorInput.factoryName,
		};
		return JSON.stringify(serialized);
	}

	deserialize(instantiationService: IInstantiationService, serialized: string): EditorInput | undefined {
		try {
			const parsed: ISerializedAgentHostFactoryRunEditorInput = JSON.parse(serialized);
			if (typeof parsed.sessionResource !== 'string' || typeof parsed.runId !== 'string' || typeof parsed.factoryName !== 'string') {
				return undefined;
			}
			return new AgentHostFactoryRunEditorInput(URI.parse(parsed.sessionResource), parsed.runId, parsed.factoryName);
		} catch {
			return undefined;
		}
	}
}
