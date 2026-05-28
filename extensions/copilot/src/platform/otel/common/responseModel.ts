/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Normalizes `gen_ai.response.model` so it stays consistent with
 * `gen_ai.request.model` when they refer to the same logical model and only
 * differ in `.` vs `-` (e.g. `claude-opus-4.6` vs `claude-opus-4-6`).
 * Returns the resolved value unchanged when it adds real specificity
 * (e.g. `gpt-5.4-mini` → `gpt-5.4-mini-2026-03-17`).
 */
export function normalizeResponseModel(requestModel: string | undefined, responseModel: string | undefined): string | undefined {
	if (!responseModel) {
		return undefined;
	}
	if (!requestModel) {
		return responseModel;
	}
	const canonical = (s: string) => s.replace(/\./g, '-').toLowerCase();
	return canonical(requestModel) === canonical(responseModel) ? requestModel : responseModel;
}
