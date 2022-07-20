/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { TextEditorService } from 'vs/workbench/contrib/textEditor/browser/textEditorService';
import { ITextEditorService } from 'vs/workbench/services/textfile/common/textEditorService';

registerSingleton(ITextEditorService, TextEditorService, false /* do not change: https://github.com/microsoft/vscode/issues/137675 */);
