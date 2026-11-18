/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../util/vs/base/common/uuid';

export function createCorrelationId(engine: string, flags: Partial<{ isFromCursorJump: boolean }> | undefined): string {
	return JSON.stringify({ id: generateUuid(), engine, ...flags });
}
