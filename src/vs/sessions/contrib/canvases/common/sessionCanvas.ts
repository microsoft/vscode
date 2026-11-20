/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ActiveEditorContext, MainEditorAreaVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { CanvasInput, getCanvasDefinitionInstanceId, getCanvasDefinitionLabels } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { SessionActiveChatCanvasReferenceKeysContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ActiveSessionCanvasReferenceContext } from '../../../common/agentsWindowContextKeys.js';
import { IChat, ISession, ISessionCanvas, ISessionCanvasDefinition } from '../../../../workbench/services/sessions/common/session.js';
import { type ICanvasOwner, type ICanvasReference } from '../../../../workbench/common/canvasReference.js';

export const WindowCanvasesAvailableContext = new RawContextKey<boolean>('windowCanvasesAvailable', false);
export const SessionCanvasActivityBarToggledContext = ContextKeyExpr.and(
	MainEditorAreaVisibleContext,
	ActiveEditorContext.isEqualTo(CanvasInput.EDITOR_ID),
	ContextKeyExpr.in(ActiveSessionCanvasReferenceContext.key, SessionActiveChatCanvasReferenceKeysContext.key),
)!;

export function createSessionCanvasReference(session: ISession, chat: IChat, canvas: ISessionCanvas): ICanvasReference {
	return {
		providerId: session.providerId,
		session: session.resource,
		chat: chat.resource,
		canvas: canvas.resource,
	};
}

export function getSessionCanvasDefinitionLabels(canvases: readonly ISessionCanvasDefinition[]): readonly string[] {
	return getCanvasDefinitionLabels(canvases);
}

export function getSessionCanvasDefinitionInstanceId(canvas: ISessionCanvasDefinition): string {
	return getCanvasDefinitionInstanceId(canvas);
}

export const ISessionCanvasRegistryService = createDecorator<ISessionCanvasRegistryService>('sessionCanvasRegistryService');

export interface ISessionCanvasRegistryService {
	readonly _serviceBrand: undefined;
	/** The focused chat, which the Canvas menus act on: they list its running canvases and open canvases in it. */
	readonly owner: IObservable<ICanvasOwner | undefined>;
	/** Whether canvases are enabled and the active chat supports them, even when no canvas type is registered. */
	readonly supportsCanvases: IObservable<boolean>;
	readonly availableCanvases: IObservable<readonly ISessionCanvasDefinition[]>;
	/** Opens a new canvas of `canvas`'s type in the focused chat, beside any canvases of that type it already has. */
	openCanvas(canvas: ISessionCanvasDefinition): Promise<void>;
}
