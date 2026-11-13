/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { ActiveEditorContext, MainEditorAreaVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { CanvasInput } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { SessionActiveChatCanvasReferenceKeysContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ActiveSessionCanvasReferenceContext } from '../../../../common/agentsWindowContextKeys.js';
import { WindowCanvasInput } from '../../../../../workbench/contrib/sessions/browser/windowCanvas.js';
import { CanvasActivityBarToggledContext } from '../../browser/canvasActivityBar.js';

suite('Canvas Activity Bar', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('checks the shared Canvas submenu for the represented active Canvas', () => {
		const activeCanvasReference = 'provider\u0000session:/active\u0000chat:/active\u0000canvas:/active';
		const siblingCanvasReference = 'provider\u0000session:/active\u0000chat:/sibling\u0000canvas:/active';
		const evaluate = (activeEditor: string, editorVisible: boolean, reference = '') => CanvasActivityBarToggledContext.evaluate({
			getValue: <T extends ContextKeyValue>(key: string) => {
				if (key === ActiveEditorContext.key) {
					return activeEditor as T;
				}
				if (key === MainEditorAreaVisibleContext.key) {
					return editorVisible as T;
				}
				if (key === ActiveSessionCanvasReferenceContext.key) {
					return reference as T;
				}
				if (key === SessionActiveChatCanvasReferenceKeysContext.key) {
					return [activeCanvasReference] as T;
				}
				return undefined;
			},
		} satisfies IContext);

		assert.deepStrictEqual({
			windowCanvas: evaluate(WindowCanvasInput.EDITOR_ID, true),
			activeChatCanvas: evaluate(CanvasInput.EDITOR_ID, true, activeCanvasReference),
			siblingChatCanvas: evaluate(CanvasInput.EDITOR_ID, true, siblingCanvasReference),
			hiddenWindowCanvas: evaluate(WindowCanvasInput.EDITOR_ID, false),
			hiddenActiveChatCanvas: evaluate(CanvasInput.EDITOR_ID, false, activeCanvasReference),
		}, {
			windowCanvas: true,
			activeChatCanvas: true,
			siblingChatCanvas: false,
			hiddenWindowCanvas: false,
			hiddenActiveChatCanvas: false,
		});
	});
});
