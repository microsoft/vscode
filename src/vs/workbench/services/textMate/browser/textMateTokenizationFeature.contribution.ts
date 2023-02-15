/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from 'vs/platform/instantiation/common/extensions';
import { ITextMateTokenizationFeature } from 'vs/workbench/services/textMate/browser/textMateTokenizationFeature';
import { TextMateTokenizationFeature } from 'vs/workbench/services/textMate/browser/textMateTokenizationFeatureImpl';

registerSingleton(ITextMateTokenizationFeature, TextMateTokenizationFeature, InstantiationType.Eager);
