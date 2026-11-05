/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SkillProvider } from '@github/copilot-sdk';
import { readFile } from 'fs/promises';
import { FileAccess } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME } from '../../common/agentHostCustomizationUri.js';
import { CustomizationType } from '../../common/state/protocol/state.js';
import { CustomizationLoadStatus, customizationId, type DirectoryCustomization } from '../../common/state/sessionState.js';

const troubleshootName = 'troubleshoot';
const skillsDirectory = URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skills' });
const troubleshootUri = URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skill/troubleshoot' });

function troubleshootDescriptor() {
	return {
		name: troubleshootName,
		description: localize('copilot.builtinTroubleshoot.description', "Investigate unexpected Copilot session behavior, slow requests, tool failures, and customization loading by analyzing session event logs."),
		userInvocable: true,
	};
}

/** Publishes the host-owned skill without exporting session-specific paths to clients. */
export function buildCopilotBuiltinSkillsContainer(): DirectoryCustomization {
	const uri = skillsDirectory.toString();
	const skillUri = troubleshootUri.toString();
	const { name, description } = troubleshootDescriptor();
	return {
		type: CustomizationType.Directory,
		id: customizationId(uri),
		uri,
		name: 'builtin',
		enabled: true,
		contents: CustomizationType.Skill,
		writable: false,
		load: { kind: CustomizationLoadStatus.Loaded },
		children: [{
			type: CustomizationType.Skill,
			id: customizationId(skillUri),
			uri: skillUri,
			name,
			description,
		}],
	};
}

/** Supplies paths for the exact SDK conversation on create and resume, including peer chats. */
export function createCopilotSkillProvider(sdkConversationId: string, copilotHome: URI): SkillProvider {
	const sessionStateDirectory = joinPath(copilotHome, 'session-state');
	const eventsFile = joinPath(sessionStateDirectory, sdkConversationId, 'events.jsonl');
	return {
		listSkills: () => [troubleshootDescriptor()],
		readSkill: async (name, { signal }) => {
			if (name !== troubleshootName) {
				return undefined;
			}
			signal.throwIfAborted();
			const content = await readFile(FileAccess.asFileUri('vs/platform/agentHost/node/copilot/skills/troubleshoot/SKILL.md').fsPath, { encoding: 'utf8', signal });
			signal.throwIfAborted();
			const context = [
				`Current conversation events file (JSON-encoded host path): ${JSON.stringify(eventsFile.fsPath)}`,
				`Session-state directory (JSON-encoded host path): ${JSON.stringify(sessionStateDirectory.fsPath)}`,
			].join('\n');
			return content.replace('{{COPILOT_SESSION_LOG_CONTEXT}}', () => context);
		},
	};
}
