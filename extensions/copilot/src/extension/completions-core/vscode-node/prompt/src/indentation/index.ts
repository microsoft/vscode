/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { processJava } from './java';
import { processMarkdown } from './markdown';
import { registerLanguageSpecificParser } from './parsing';

registerLanguageSpecificParser('markdown', processMarkdown);
registerLanguageSpecificParser('java', processJava);

export * from './classes';
export * from './description';
export * from './manipulation';
export * from './parsing';

