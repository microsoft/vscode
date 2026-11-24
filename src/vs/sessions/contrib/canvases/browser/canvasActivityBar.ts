/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ActiveEditorContext, MainEditorAreaVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { WindowCanvasInput } from '../../../../workbench/contrib/sessions/browser/windowCanvas.js';
import { SessionCanvasActivityBarToggledContext } from '../common/sessionCanvas.js';

export const CanvasActivityBarToggledContext = ContextKeyExpr.or(
	SessionCanvasActivityBarToggledContext,
	ContextKeyExpr.and(MainEditorAreaVisibleContext, ActiveEditorContext.isEqualTo(WindowCanvasInput.EDITOR_ID)),
)!;
