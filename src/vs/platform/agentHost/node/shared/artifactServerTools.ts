/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import type { IAgentServerToolDefinition } from '../../common/agentServerTools.js';
import { AGENT_HOST_SESSION_LINK_SCHEME } from '../../common/openSessionLink.js';
import { ArtifactServerToolName, LEGACY_ARTIFACT_SERVER_TOOL_NAMES } from '../../common/serverToolNames.js';
import { parseSessionArtifactInputs, SessionArtifactCollection } from '../../common/sessionArtifactCollection.js';
import { SESSION_ARTIFACT_TYPES, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { parseRequiredSessionUriFromChatUri, type ToolDefinition } from '../../common/state/sessionState.js';
import type { IServerToolDisplay, IServerToolGroup } from './agentServerToolHost.js';
import { SessionArtifacts } from './sessionArtifacts.js';

const artifactClassification = 'An issue or pull request you create or attempt to fix, change, or unblock is an artifact; inspection or review alone makes it a reference.';

const artifactInputSchema: NonNullable<ToolDefinition['inputSchema']> = {
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
			description: `Required. \`true\` for an artifact, \`false\` for a reference. ${artifactClassification} Other artifacts are deliverables the user requested or standalone results they are clearly likely to reopen, download, or reuse, such as a report the user asked for. References are existing resources the user should look at because of this task.`,
		},
		link: { type: 'string', description: 'URL of the pull request, issue, commit or website. Required for those kinds.' },
		uri: { type: 'string', description: 'Absolute URI including its scheme. For a local file, pass a file URI such as `file:///C:/path/to/file`, not a plain file system path such as `C:\\path\\to\\file`. Required for the `file` and `resource` kinds.' },
		commitHash: { type: 'string', description: 'The commit hash. Required for the `commit` kind.' },
	},
	required: ['type', 'label', 'isArtifact'],
};

function createAddArtifactInputSchema(inputSchema: NonNullable<ToolDefinition['inputSchema']>): NonNullable<ToolDefinition['inputSchema']> {
	return {
		type: 'object',
		properties: {
			items: {
				type: 'array',
				minItems: 1,
				description: 'Artifacts and references to record in this call. Batch related entries when practical.',
				items: inputSchema,
			},
		},
		required: ['items'],
	};
}

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

export const artifactServerToolDefinitions: IAgentServerToolDefinition[] = [
	{
		name: ArtifactServerToolName.AddArtifactOrReference,
		title: 'Add Artifact or Reference',
		description: `Record one or more artifacts or references so they are surfaced next to the chat input. Use \`items\` and batch related entries in one call when practical. Registration is optional, not an inventory of everything saved; default to no registration. ${artifactClassification} Other artifacts are deliverables the user requested or standalone results they are clearly likely to reopen, download, or reuse, such as a report or plan the user asked for. References are noteworthy existing resources the user will likely want to view. Do not record routine files, scratch files, caches, logs, intermediate results, or configuration snapshots unless the user asked for them as deliverables; persistence or location outside the workspace is not an eligibility signal. Do not record incidental resources, commits you create unless the user asks, or sessions and chats created with session-management tools. Never create, copy, or relocate a file solely to have an artifact to register. Adding an artifact promotes a matching reference, preserving its id; duplicates never downgrade artifacts.`,
		inputSchema: createAddArtifactInputSchema(artifactInputSchema),
		annotations: { readOnlyHint: false },
		deferLoading: false,
	},
	{
		name: ArtifactServerToolName.RemoveArtifactOrReference,
		title: 'Remove Artifact or Reference',
		description: 'Remove an artifact or reference from this session by id.',
		inputSchema: removeArtifactInputSchema,
		annotations: { readOnlyHint: false, destructiveHint: true },
		deferLoading: true,
	},
	{
		name: ArtifactServerToolName.ListArtifactsAndReferences,
		title: 'List Artifacts and References',
		description: 'List the artifacts and references recorded on this session, with their ids.',
		inputSchema: listArtifactsInputSchema,
		annotations: { readOnlyHint: true },
		deferLoading: true,
	},
];

/** Host services the artifact tools need beyond the session state. */
export interface IArtifactServerToolAccessor {
	/** Whether the artifact tools are advertised and executable. */
	readonly isEnabled: () => boolean;
	/** Persists a session's artifacts and references so they survive a host restart. */
	readonly persist: (session: string, artifacts: readonly ISessionArtifact[]) => void | Promise<void>;
}

/** The noun an entry is described by, so every message names what it acted on. */
function entryNoun(isArtifact: boolean): string {
	return isArtifact ? 'artifact' : 'reference';
}

const REMOVED_ARTIFACT_MESSAGE = 'Removed artifact';
const REMOVED_REFERENCE_MESSAGE = 'Removed reference';

interface IArtifactDisplayInput {
	readonly label?: unknown;
	readonly isArtifact?: unknown;
}

function artifactDisplayInputs(args: unknown): readonly IArtifactDisplayInput[] {
	if (!args || typeof args !== 'object' || Array.isArray(args)) {
		return [];
	}
	const input = args as Record<string, unknown>;
	const items = input.items;
	if (!Array.isArray(items)) {
		return [input];
	}
	return items.map(item => item && typeof item === 'object' && !Array.isArray(item) ? item : {});
}

function describeArtifact(artifact: ISessionArtifact): string {
	const value = artifact.link ?? artifact.uri ?? artifact.commitHash ?? '';
	return `${artifact.id} (${artifact.type}, ${entryNoun(artifact.isArtifact)}) ${artifact.label}${value ? ` — ${value}` : ''}`;
}

export function createArtifactServerToolGroup(accessor?: IArtifactServerToolAccessor): IServerToolGroup {
	const isEnabled = () => accessor?.isEnabled() === true;
	return {
		definitions: artifactServerToolDefinitions,
		legacyToolNames: LEGACY_ARTIFACT_SERVER_TOOL_NAMES,
		isEnabled,
		isEnabledForSession: isEnabled,
		getDisplay(toolName, args, result): IServerToolDisplay | undefined {
			switch (toolName) {
				case ArtifactServerToolName.AddArtifactOrReference: {
					const inputs = artifactDisplayInputs(args);
					if (inputs.length > 1) {
						return {
							displayName: 'Add Artifacts or References',
							invocationMessage: `Add ${inputs.length} artifacts or references`,
							pastTenseMessage: `Added ${inputs.length} artifacts or references`,
						};
					}
					const { label, isArtifact } = inputs[0] ?? {};
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
		async execute(stateManager, context, toolName, rawArgs): Promise<string> {
			if (!accessor) {
				throw new Error(`${toolName} is unavailable in this host.`);
			}

			const artifacts = new SessionArtifacts(stateManager, parseRequiredSessionUriFromChatUri(context.chatUri), accessor.persist);
			switch (toolName) {
				case ArtifactServerToolName.AddArtifactOrReference: {
					const inputs = parseSessionArtifactInputs(rawArgs, ArtifactServerToolName.AddArtifactOrReference);
					for (const input of inputs) {
						if (input.uri && URI.parse(input.uri).scheme === AGENT_HOST_SESSION_LINK_SCHEME) {
							throw new Error(`Invalid ${ArtifactServerToolName.AddArtifactOrReference} input: sessions and chats created with session-management tools must not be recorded as artifacts or references.`);
						}
					}
					const result = await artifacts.mutate(collection => {
						const messages: string[] = [];
						for (const input of inputs) {
							const result = collection.addOrPromoteArtifact(input, generateUuid);
							const status = result.added
								? `Added ${entryNoun(result.artifact.isArtifact)}`
								: result.artifacts !== collection.artifacts ? 'Promoted artifact' : 'Already recorded';
							messages.push(`${status}: ${result.artifact.id}`);
							collection = new SessionArtifactCollection(result.artifacts);
						}
						return { artifacts: collection.artifacts, messages };
					});
					return result.messages.join('\n');
				}
				case ArtifactServerToolName.RemoveArtifactOrReference: {
					const id = (rawArgs as { id?: unknown } | undefined)?.id;
					if (typeof id !== 'string' || id.length === 0) {
						throw new Error(`Invalid ${ArtifactServerToolName.RemoveArtifactOrReference} input: id must be a non-empty string.`);
					}
					const result = await artifacts.mutate(collection => collection.remove(id));
					if (!result.removed) {
						return `No artifact or reference with id ${id}.`;
					}
					const message = result.removed.isArtifact ? REMOVED_ARTIFACT_MESSAGE : REMOVED_REFERENCE_MESSAGE;
					return `${message}: ${result.removed.id}`;
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

const artifactToolDiscoveryInstruction = `List/remove (discover if needed): \`${ArtifactServerToolName.ListArtifactsAndReferences}\`, \`${ArtifactServerToolName.RemoveArtifactOrReference}\`.`;

export const ARTIFACT_TOOLS_INSTRUCTION = `Record notable artifacts and references with \`${ArtifactServerToolName.AddArtifactOrReference}\` so they are surfaced next to the chat input. Registration is optional, not an inventory of everything saved; default to no registration. ${artifactClassification} Other artifacts are deliverables the user explicitly requested or standalone results the user is clearly likely to reopen, download, or reuse; references are existing resources the user will likely want to view. Batch related entries in one call when practical. Do not record routine files, scratch files, caches, logs, intermediate results, or configuration snapshots unless the user asked for them as deliverables; persistence or location outside the workspace is not an eligibility signal. Do not record incidental resources, commits you create unless the user asks, or sessions and chats created with session-management tools. Never create, copy, or relocate a file solely to have an artifact to register. ${artifactToolDiscoveryInstruction}`;
