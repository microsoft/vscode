/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TODO: Remove this compatibility file after adopting a protocol release containing https://github.com/microsoft/agent-host-protocol/pull/451.

import { isObject } from '../../../../base/common/types.js';
import type { RootState } from '../state/protocol/state.js';

export interface ICloudSandboxProject {
	readonly id: string;
	readonly path: string;
	readonly git: boolean;
	readonly status: 'ready' | 'cloning' | 'failed';
	readonly remoteUrl?: string;
	readonly error?: string;
}

export function readCloudSandboxCloneResult(result: unknown): ICloudSandboxProject | undefined {
	return isRecord(result) ? readProject(result.project) : undefined;
}

function readProject(value: unknown): ICloudSandboxProject | undefined {
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

export function readCloudSandboxProjects(state: RootState): readonly ICloudSandboxProject[] | undefined {
	const capability = state._meta?.['copilot.projectManagement'];
	if (!isRecord(capability) || capability.available !== true) {
		return undefined;
	}
	const copilot = state.config?.values?.copilot;
	if (!isRecord(copilot) || !Array.isArray(copilot.projects)) {
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
