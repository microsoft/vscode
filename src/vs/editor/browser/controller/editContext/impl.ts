/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NativeEditContext } from 'vs/editor/browser/controller/editContext/native/nativeEditContext';
import { TextAreaHandler } from 'vs/editor/browser/controller/editContext/textArea/textAreaHandler';

export const EditContextImpl = false ? TextAreaHandler : NativeEditContext;
