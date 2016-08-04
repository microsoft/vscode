/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {GotoLineAction} from './gotoLine';

// Contribute Ctrl+G to "Go to line" using quick open
CommonEditorRegistry.registerEditorAction2(new GotoLineAction());