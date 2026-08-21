/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { ArtifactServerToolName } from '../../common/serverToolNames.js';
import { parseSessionArtifactInput, SessionArtifactCollection } from '../../common/sessionArtifactCollection.js';
import { readSessionArtifacts, SESSION_ARTIFACT_TYPES, SessionArtifactType, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { parseRequiredSessionUriFromChatUri, type ToolDefinition } from '../../common/state/sessionState.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';
import type { IServerToolDisplay, IServerToolExecutionContext, IServerToolGroup } from './agentServerToolHost.js';

const addArtifactInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		type: {
			type: 'string',
			enum: [...SESSION_ARTIFACT_TYPES],
			description: 'The kind of artifact. Use `resource` only when no other kind applies.',
		},
		label: { type: 'string', description: 'Short label shown to the user.' },
		link: { type: 'string', description: 'URL of the pull request, issue, commit or website. Required for those kinds.' },
		uri: { type: 'string', description: 'URI of the file or resource. Required for the `file` and `resource` kinds.' },
		commitHash: { type: 'string', description: 'The commit hash. Required for the `commit` kind.' },
		createdByThisSession: { type: 'boolean', description: 'Required for the `pullRequest` kind: `true` when this session created the pull request, `false` when it only references an existing one.' },
	},
	required: ['type', 'label'],
};

const removeArtifactInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		id: { type: 'string', description: 'The artifact id returned by `add_artifact` or `list_artifacts`.' },
	},
	required: ['id'],
};

const listArtifactsInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {},
};

export const artifactServerToolDefinitions: ToolDefinition[] = [
	{
		name: ArtifactServerToolName.AddArtifact,
		title: 'Add Artifact',
		description: 'Record something the user will want to open — a pull request, issue, commit found while investigating or answering a question, website, file or other resource — so it is surfaced next to the chat input. Do not record commits you create unless the user explicitly asks you to add them as artifacts.',
		inputSchema: addArtifactInputSchema,
		annotations: { readOnlyHint: false },
	},
	{
		name: ArtifactServerToolName.RemoveArtifact,
		title: 'Remove Artifact',
		description: 'Remove an artifact from this session by id.',
		inputSchema: removeArtifactInputSchema,
		annotations: { readOnlyHint: false, destructiveHint: true },
	},
	{
		name: ArtifactServerToolName.ListArtifacts,
		title: 'List Artifacts',
		description: 'List the artifacts recorded on this session, with their ids.',
		inputSchema: listArtifactsInputSchema,
		annotations: { readOnlyHint: true },
	},
];

/** Host services the artifact tools need beyond the session state. */
export interface IArtifactServerToolAccessor {
	/** Whether the artifact tools are advertised and executable. */
	readonly isEnabled: () => boolean;
	/** Persists a session's artifacts so they survive a host restart. */
	readonly persist: (session: string, artifacts: readonly ISessionArtifact[]) => void;
}

function describeArtifact(artifact: ISessionArtifact): string {
	const value = artifact.link ?? artifact.uri ?? artifact.commitHash ?? '';
	return `${artifact.id} (${artifact.type}) ${artifact.label}${value ? ` — ${value}` : ''}`;
}

/**
 * Reads, mutates and republishes the artifacts of the session that owns the
 * executing chat. The artifacts live on the session's `_meta` bag, so a change
 * reaches subscribed clients through the regular action envelope.
 */
class SessionArtifacts {

	private readonly _session: string;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		context: IServerToolExecutionContext,
	) {
		this._session = parseRequiredSessionUriFromChatUri(context.chatUri);
	}

	read(): SessionArtifactCollection {
		return new SessionArtifactCollection(readSessionArtifacts(this._stateManager.getSessionState(this._session)?._meta));
	}

	write(artifacts: readonly ISessionArtifact[], accessor: IArtifactServerToolAccessor): void {
		const meta = this._stateManager.getSessionState(this._session)?._meta;
		this._stateManager.setSessionMeta(this._session, withSessionArtifacts(meta, artifacts));
		accessor.persist(this._session, artifacts);
	}
}

export function createArtifactServerToolGroup(accessor?: IArtifactServerToolAccessor): IServerToolGroup {
	return {
		definitions: artifactServerToolDefinitions,
		isEnabled(): boolean {
			return accessor?.isEnabled() === true;
		},
		getDisplay(toolName, args): IServerToolDisplay | undefined {
			switch (toolName) {
				case ArtifactServerToolName.AddArtifact: {
					const label = (args as { label?: unknown } | undefined)?.label;
					return typeof label === 'string' && label.length > 0
						? { displayName: 'Add Artifact', invocationMessage: `Add artifact "${label}"`, pastTenseMessage: `Added artifact "${label}"` }
						: { displayName: 'Add Artifact', invocationMessage: 'Add artifact', pastTenseMessage: 'Added artifact' };
				}
				case ArtifactServerToolName.RemoveArtifact:
					return { displayName: 'Remove Artifact', invocationMessage: 'Remove artifact', pastTenseMessage: 'Removed artifact' };
				case ArtifactServerToolName.ListArtifacts:
					return { displayName: 'List Artifacts', invocationMessage: 'List artifacts', pastTenseMessage: 'Listed artifacts' };
				default:
					return undefined;
			}
		},
		execute(stateManager, context, toolName, rawArgs): string {
			if (!accessor) {
				throw new Error(`${toolName} is unavailable in this host.`);
			}

			const artifacts = new SessionArtifacts(stateManager, context);
			switch (toolName) {
				case ArtifactServerToolName.AddArtifact: {
					const input = parseSessionArtifactInput(rawArgs, ArtifactServerToolName.AddArtifact);
					const result = artifacts.read().add(input, generateUuid);
					if (!result.added) {
						return `Artifact already recorded: ${describeArtifact(result.artifact)}`;
					}
					artifacts.write(result.artifacts, accessor);
					return `Added artifact: ${describeArtifact(result.artifact)}`;
				}
				case ArtifactServerToolName.RemoveArtifact: {
					const id = (rawArgs as { id?: unknown } | undefined)?.id;
					if (typeof id !== 'string' || id.length === 0) {
						throw new Error(`Invalid ${ArtifactServerToolName.RemoveArtifact} input: id must be a non-empty string.`);
					}
					const result = artifacts.read().remove(id);
					if (!result.removed) {
						return `No artifact with id ${id}.`;
					}
					artifacts.write(result.artifacts, accessor);
					return `Removed artifact: ${describeArtifact(result.removed)}`;
				}
				case ArtifactServerToolName.ListArtifacts: {
					const current = artifacts.read().artifacts;
					return current.length === 0
						? 'No artifacts recorded for this session.'
						: current.map(describeArtifact).join('\n');
				}
				default:
					throw new Error(`Unknown artifact tool: ${toolName}`);
			}
		},
	};
}

/**
 * The instruction appended to every agent's host instructions while the
 * artifact tools are enabled.
 */
export const ARTIFACT_TOOLS_INSTRUCTION = `When you produce something the user will want to open — a pull request, an issue, a website, a plan file or another resource — or find a notable commit worth showing the user while investigating or answering a question, record it once with \`${ArtifactServerToolName.AddArtifact}\` (types: ${SESSION_ARTIFACT_TYPES.join(', ')}; use \`${SessionArtifactType.Resource}\` when nothing else fits). Do not record routine files you merely edited. Do not record commits you create unless the user explicitly asks you to add them as artifacts.`;
