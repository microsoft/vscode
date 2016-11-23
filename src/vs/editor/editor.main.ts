/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/editor/browser/editor.all';
import 'vs/editor/contrib/quickOpen/browser/quickOutline';
import 'vs/editor/contrib/quickOpen/browser/gotoLine';
import 'vs/editor/contrib/quickOpen/browser/quickCommand';

import { createMonacoBaseAPI } from 'vs/editor/common/standalone/standaloneBase';
import { createMonacoEditorAPI } from 'vs/editor/browser/standalone/standaloneEditor';
import { createMonacoLanguagesAPI } from 'vs/editor/browser/standalone/standaloneLanguages';
import { DefaultConfig } from 'vs/editor/common/config/defaultConfig';

// Set defaults for standalone editor
DefaultConfig.editor.wrappingIndent = 'none';
DefaultConfig.editor.folding = false;
DefaultConfig.editor.glyphMargin = false;

var global: any = self;
global.monaco = createMonacoBaseAPI();
global.monaco.editor = createMonacoEditorAPI();
global.monaco.languages = createMonacoLanguagesAPI();