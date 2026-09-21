/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../base/common/types.js';
import type { RootState } from '../state/protocol/state.js';

export interface IAgentHostProject {
	readonly id: string;
	readonly path: string;
	readonly git: boolean;
	readonly status: 'ready' | 'cloning' | 'failed';
	readonly remoteUrl?: string;
	readonly error?: string;
}

export function supportsAgentHostProjects(state: RootState): boolean {
	const value = state._meta?.['copilot.projectManagement'];
	return isRecord(value) && value.available === true;
}

export function readAgentHostCloneResult(result: unknown): IAgentHostProject | undefined {
	return isRecord(result) ? readProject(result.project) : undefined;
}

function readProject(value: unknown): IAgentHostProject | undefined {
	if (!isRecord(value)
		|| typeof value.id !== 'string' || !value.id
		|| typeof value.path !== 'string' || !value.path
		|| typeof value.git !== 'boolean') {
		return undefined;
	}
	const status = value.status === undefined ? 'ready' : value.status;
	if (status !== 'ready' && status !== 'cloning' && status !== 'failed') {
		return undefined;
	}
	return {
		id: value.id,
		path: value.path,
		git: value.git,
		status,
		remoteUrl: typeof value.remoteUrl === 'string' ? value.remoteUrl : undefined,
		error: typeof value.error === 'string' ? value.error : undefined,
	};
}

export function readAgentHostProjects(state: RootState): readonly IAgentHostProject[] {
	const copilot = state.config?.values?.copilot;
	if (!supportsAgentHostProjects(state) || !isRecord(copilot) || !Array.isArray(copilot.projects)) {
		return [];
	}
	return copilot.projects.flatMap(value => {
		const project = readProject(value);
		return project ? [project] : [];
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}
