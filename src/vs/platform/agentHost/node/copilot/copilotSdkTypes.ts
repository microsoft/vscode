/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, CopilotSession, ResumeSessionConfig, SessionConfig } from '@github/copilot-sdk';

/** Public session operations, without the identity of a particular SDK module's private fields. */
export interface ICopilotSession extends Pick<CopilotSession, 'sessionId' | 'on' | 'getEvents' | 'send' | 'abort' | 'setModel' | 'disconnect'> {
	readonly rpc: Pick<CopilotSession['rpc'], 'agent' | 'canvas' | 'commands' | 'contentExclusion' | 'debug' | 'extensions' | 'fleet' | 'gitHubAuth' | 'history' | 'instructions' | 'mcp' | 'metadata' | 'mode' | 'options' | 'permissions' | 'plan' | 'sendMessages' | 'ui' | 'usage'> & {
		eventLog: Pick<CopilotSession['rpc']['eventLog'], 'registerInterest' | 'releaseInterest'>;
		tasks: Pick<CopilotSession['rpc']['tasks'], 'list' | 'refresh'>;
	};
}

/** Host session configuration contains tool names and runtime plugins, not SDK-owned instances. */
type SdkOwnedSessionOption = 'availableTools' | 'excludedTools' | 'canvases' | 'onEvent' | 'createSessionFsProvider';

export type ICopilotSessionConfig = Omit<SessionConfig, SdkOwnedSessionOption> & {
	availableTools?: string[];
	excludedTools?: string[];
};

export type ICopilotResumeSessionConfig = Omit<ResumeSessionConfig, SdkOwnedSessionOption> & {
	availableTools?: string[];
	excludedTools?: string[];
};

type DiscoveredSkill = Awaited<ReturnType<CopilotClient['rpc']['skills']['discover']>>['skills'][number];
type DiscoveredSkills = Awaited<ReturnType<CopilotClient['rpc']['skills']['discover']>>;

/** Public client operations shared by the bundled and explicitly selected development SDKs. */
export interface ICopilotClient extends Pick<CopilotClient, 'start' | 'stop' | 'listSessions' | 'getSessionMetadata' | 'deleteSession'> {
	readonly rpc: Pick<CopilotClient['rpc'], 'models' | 'commands' | 'sessions' | 'agents' | 'instructions' | 'extensions'> & {
		skills: Pick<CopilotClient['rpc']['skills'], 'getDiscoveryPaths'> & {
			discover(params: Parameters<CopilotClient['rpc']['skills']['discover']>[0]): Promise<Omit<DiscoveredSkills, 'skills'> & {
				skills: Pick<DiscoveredSkill, 'path' | 'name' | 'description' | 'enabled' | 'userInvocable'>[];
			}>;
		};
	};
	createSession(config: ICopilotSessionConfig): Promise<ICopilotSession>;
	resumeSession(sessionId: string, config: ICopilotResumeSessionConfig): Promise<ICopilotSession>;
}
