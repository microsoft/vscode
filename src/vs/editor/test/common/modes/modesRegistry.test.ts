/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/plaintext/common/plaintext.contribution';
import 'vs/languages/html/common/html.contribution';

import * as assert from 'assert';
import * as Platform from 'vs/platform/platform';
import * as ModesExtensions from 'vs/editor/common/modes/modesRegistry';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import * as Modes from 'vs/editor/common/modes';

suite('Editor Modes - Modes Registry', () => {
	test('Bug 12104: [f12] createModel not successfully handling mime type list?', () => {
		var modesRegistry = <ModesExtensions.IEditorModesRegistry>Platform.Registry.as(ModesExtensions.Extensions.EditorModes);
		assert.equal(modesRegistry.getModeId('text/html,text/plain'), 'html');
	});
});

