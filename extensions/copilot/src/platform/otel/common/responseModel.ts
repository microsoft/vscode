/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Normalizes `gen_ai.response.model` so it stays consistent with
 * `gen_ai.request.model` when they refer to the same logical model.
 *
 * Returns the request model when:
 * - Their canonical forms (lowercase, `.`→`-`) are equal, e.g.
 *   `claude-opus-4.6` vs `claude-opus-4-6`.
 * - The response is a less specific prefix of the request (server stripped a
 *   variant suffix like reasoning effort), e.g. request
 *   `claude-opus-4.7-high` vs response `claude-opus-4-7`.
 *
 * Returns the response model unchanged when it adds real specificity
 * (e.g. `gpt-5.4-mini` → `gpt-5.4-mini-2026-03-17`) or refers to a
 * genuinely different model.
 */
export function normalizeResponseModel(requestModel: string | undefined, responseModel: string | undefined): string | undefined {
	if (!responseModel) {
		return undefined;
	}
	if (!requestModel) {
		return responseModel;
	}
	const canonical = (s: string) => s.replace(/\./g, '-').toLowerCase();
	const cReq = canonical(requestModel);
	const cRes = canonical(responseModel);
	if (cReq === cRes) {
		return requestModel;
	}
	// Response is a less specific form of the request (e.g. request adds
	// a reasoning-effort suffix that the server strips). Require a `-`
	// boundary so `gpt-4` is not treated as a prefix of `gpt-40`.
	if (cReq.startsWith(cRes + '-')) {
		return requestModel;
	}
	return responseModel;
}
