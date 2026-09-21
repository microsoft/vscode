/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const announcedRequests = new WeakMap<object, Set<string | number>>();

/** Source and projected widgets share a request object and announce each decision phase only once. */
export function shouldAnnounceChatInputRequest(request: object, phase: string | number): boolean {
	let phases = announcedRequests.get(request);
	if (!phases) {
		phases = new Set();
		announcedRequests.set(request, phases);
	}
	if (phases.has(phase)) {
		return false;
	}
	phases.add(phase);
	return true;
}
