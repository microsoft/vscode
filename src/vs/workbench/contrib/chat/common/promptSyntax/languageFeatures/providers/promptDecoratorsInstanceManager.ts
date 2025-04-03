/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextModelPromptDecorator } from './textModelPromptDecorator.js';
import { ProviderInstanceManagerBase } from './providerInstanceManagerBase.js';

/**
 * Provider for prompt syntax decorators on text models.
 */
export class PromptDecoratorsInstanceManager extends ProviderInstanceManagerBase<TextModelPromptDecorator> {
	protected override readonly InstanceClass = TextModelPromptDecorator;
}
