/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { ArtifactServerToolName, LEGACY_ARTIFACT_SERVER_TOOL_NAMES } from '../../common/serverToolNames.js';
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
			description: 'The kind of artifact or reference. Use `resource` only when no other kind applies.',
		},
		label: { type: 'string', description: 'Short label shown to the user.' },
		isArtifact: {
			type: 'boolean',
			description: 'Required. `true` for an artifact — something this session produced, such as a pull request or issue it opened, a plan file it wrote outside the workspace, or another side effect of its work. `false` for a reference — something it did not produce but the user should look at, such as the pull request or commit that introduced a bug, or a website that matters for the task.',
		},
		link: { type: 'string', description: 'URL of the pull request, issue, commit or website. Required for those kinds.' },
		uri: { type: 'string', description: 'URI of the file or resource. Required for the `file` and `resource` kinds.' },
		commitHash: { type: 'string', description: 'The commit hash. Required for the `commit` kind.' },
	},
	required: ['type', 'label', 'isArtifact'],
};

const removeArtifactInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		id: { type: 'string', description: `The id returned by \`${ArtifactServerToolName.AddArtifactOrReference}\` or \`${ArtifactServerToolName.ListArtifactsAndReferences}\`.` },
	},
	required: ['id'],
};

const listArtifactsInputSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {},
};

export const artifactServerToolDefinitions: ToolDefinition[] = [
	{
		name: ArtifactServerToolName.AddArtifactOrReference,
		title: 'Add Artifact or Reference',
		description: 'Record an artifact or a reference so it is surfaced next to the chat input. An artifact is something this session produced that is not just an ordinary workspace edit: a pull request or issue it opened, a plan or report file it wrote outside the workspace, or another side effect of its work. A reference is something the session did not produce but the user should look at because of this task: the pull request or commit that introduced a bug, an issue it investigated, or a website worth reading. Set `isArtifact` accordingly. Do not record routine files you merely edited.',
		inputSchema: addArtifactInputSchema,
		annotations: { readOnlyHint: false },
	},
	{
		name: ArtifactServerToolName.RemoveArtifactOrReference,
		title: 'Remove Artifact or Reference',
		description: 'Remove an artifact or reference from this session by id.',
		inputSchema: removeArtifactInputSchema,
		annotations: { readOnlyHint: false, destructiveHint: true },
	},
	{
		name: ArtifactServerToolName.ListArtifactsAndReferences,
		title: 'List Artifacts and References',
		description: 'List the artifacts and references recorded on this session, with their ids.',
		inputSchema: listArtifactsInputSchema,
		annotations: { readOnlyHint: true },
	},
];

/** Host services the artifact tools need beyond the session state. */
export interface IArtifactServerToolAccessor {
	/** Whether the artifact tools are advertised and executable. */
	readonly isEnabled: () => boolean;
	/** Persists a session's artifacts and references so they survive a host restart. */
	readonly persist: (session: string, artifacts: readonly ISessionArtifact[]) => void;
}

/** The noun an entry is described by, so every message names what it acted on. */
function entryNoun(isArtifact: boolean): string {
	return isArtifact ? 'artifact' : 'reference';
}

const REMOVED_ARTIFACT_MESSAGE = 'Removed artifact';
const REMOVED_REFERENCE_MESSAGE = 'Removed reference';

function describeArtifact(artifact: ISessionArtifact): string {
	const value = artifact.link ?? artifact.uri ?? artifact.commitHash ?? '';
	return `${artifact.id} (${artifact.type}, ${entryNoun(artifact.isArtifact)}) ${artifact.label}${value ? ` — ${value}` : ''}`;
}

/**
 * Reads, mutates and republishes the artifacts and references of the session
 * that owns the executing chat. They live on the session's `_meta` bag, so a
 * change reaches subscribed clients through the regular action envelope.
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
		legacyToolNames: LEGACY_ARTIFACT_SERVER_TOOL_NAMES,
		isEnabled(): boolean {
			return accessor?.isEnabled() === true;
		},
		getDisplay(toolName, args, result): IServerToolDisplay | undefined {
			switch (toolName) {
				case ArtifactServerToolName.AddArtifactOrReference: {
					const { label, isArtifact } = (args ?? {}) as { label?: unknown; isArtifact?: unknown };
					// The flag is only trusted for display when the agent actually sent
					// a boolean; `execute` rejects anything else.
					const noun = typeof isArtifact === 'boolean' ? entryNoun(isArtifact) : 'artifact or reference';
					const suffix = typeof label === 'string' && label.length > 0 ? ` "${label}"` : '';
					return {
						displayName: typeof isArtifact === 'boolean' ? (isArtifact ? 'Add Artifact' : 'Add Reference') : 'Add Artifact or Reference',
						invocationMessage: `Add ${noun}${suffix}`,
						pastTenseMessage: `Added ${noun}${suffix}`,
					};
				}
				case ArtifactServerToolName.RemoveArtifactOrReference: {
					// Only the result says whether an artifact or a reference was removed.
					const text = result?.text ?? '';
					const pastTenseMessage = text.startsWith(REMOVED_REFERENCE_MESSAGE)
						? REMOVED_REFERENCE_MESSAGE
						: text.startsWith(REMOVED_ARTIFACT_MESSAGE) ? REMOVED_ARTIFACT_MESSAGE : undefined;
					return {
						displayName: 'Remove Artifact or Reference',
						invocationMessage: 'Remove artifact or reference',
						...(pastTenseMessage ? { pastTenseMessage } : {}),
					};
				}
				case ArtifactServerToolName.ListArtifactsAndReferences:
					return { displayName: 'List Artifacts and References', invocationMessage: 'List artifacts and references', pastTenseMessage: 'Listed artifacts and references' };
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
				case ArtifactServerToolName.AddArtifactOrReference: {
					const input = parseSessionArtifactInput(rawArgs, ArtifactServerToolName.AddArtifactOrReference);
					const result = artifacts.read().add(input, generateUuid);
					if (!result.added) {
						return `Already recorded: ${describeArtifact(result.artifact)}`;
					}
					artifacts.write(result.artifacts, accessor);
					return `Added ${entryNoun(result.artifact.isArtifact)}: ${describeArtifact(result.artifact)}`;
				}
				case ArtifactServerToolName.RemoveArtifactOrReference: {
					const id = (rawArgs as { id?: unknown } | undefined)?.id;
					if (typeof id !== 'string' || id.length === 0) {
						throw new Error(`Invalid ${ArtifactServerToolName.RemoveArtifactOrReference} input: id must be a non-empty string.`);
					}
					const result = artifacts.read().remove(id);
					if (!result.removed) {
						return `No artifact or reference with id ${id}.`;
					}
					artifacts.write(result.artifacts, accessor);
					const message = result.removed.isArtifact ? REMOVED_ARTIFACT_MESSAGE : REMOVED_REFERENCE_MESSAGE;
					return `${message}: ${describeArtifact(result.removed)}`;
				}
				case ArtifactServerToolName.ListArtifactsAndReferences: {
					const current = artifacts.read().artifacts;
					return current.length === 0
						? 'No artifacts or references recorded for this session.'
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
export const ARTIFACT_TOOLS_INSTRUCTION = `Record the notable results of your work with \`${ArtifactServerToolName.AddArtifactOrReference}\` (types: ${SESSION_ARTIFACT_TYPES.join(', ')}; use \`${SessionArtifactType.Resource}\` when nothing else fits) so they are surfaced next to the chat input. Pass \`isArtifact: true\` for an artifact — something this session produced beyond ordinary workspace edits, such as a pull request or issue you opened, a plan or report file you wrote outside the workspace, or another side effect of your work. Pass \`isArtifact: false\` for a reference — something you did not produce but the user should look at because of this task, such as the pull request or commit that introduced a bug, an issue you investigated, or a website worth reading. Record each one once, and do not record routine files you merely edited or commits you create unless the user asks for them.`;
