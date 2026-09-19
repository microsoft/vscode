/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface NewSessionDefault {
	readonly variant: 'control' | 'treatment';
	readonly assignmentContext: string;
}

export function parseNewSessionPolicy(response: unknown): NewSessionDefault | undefined {
	if (typeof response !== 'object' || response === null || Array.isArray(response)) {
		throw new Error('Invalid session policy response');
	}
	if (!('new_session_policy' in response)) {
		return undefined;
	}
	const policy = response.new_session_policy;
	if (typeof policy !== 'object' || policy === null
		|| !('version' in policy) || policy.version !== 1
		|| !('experiment_id' in policy) || policy.experiment_id !== 'auto_default_v1'
		|| !('assignment' in policy) || (policy.assignment !== 'control' && policy.assignment !== 'treatment')
		|| !('assignment_context' in policy) || typeof policy.assignment_context !== 'string'
		|| policy.assignment_context.length === 0 || policy.assignment_context.length > 8 * 1024
		|| /[\x00-\x1F\x7F]/.test(policy.assignment_context)
		|| (policy.assignment === 'treatment' ? !('default_model' in policy) || policy.default_model !== 'auto' : 'default_model' in policy)) {
		throw new Error('Invalid new session policy');
	}
	return { variant: policy.assignment, assignmentContext: policy.assignment_context };
}
