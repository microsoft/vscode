/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {QuickOutlineAction} from './quickOutline';

// Contribute "Quick Outline" to context menu
CommonEditorRegistry.registerEditorAction2(new QuickOutlineAction());
