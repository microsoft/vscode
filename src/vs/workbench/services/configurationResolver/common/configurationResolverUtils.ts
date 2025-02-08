/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';

export function applyDeprecatedVariableMessage(schema: IJSONSchema) {
	schema.pattern = schema.pattern || '^(?!.*\\$\\{(env|config|command)\\.)';
	schema.patternErrorMessage = schema.patternErrorMessage ||
		nls.localize('deprecatedVariables', "'env.', 'config.' and 'command.' are deprecated, use 'env:', 'config:' and 'command:' instead.");
}
