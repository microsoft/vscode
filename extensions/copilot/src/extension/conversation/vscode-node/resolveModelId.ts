/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const autoModelId = 'copilot/auto';

/**
 * When the user has selected the "auto" model, replace the modelId with
 * the actual model that served the request so that downstream telemetry
 * reflects the resolved model rather than the opaque "copilot/auto" identifier.
 */
export function resolveModelIdForTelemetry(modelId: string, resolvedModel: string | undefined): string {
	return modelId === autoModelId ? (resolvedModel || autoModelId) : modelId;
}
