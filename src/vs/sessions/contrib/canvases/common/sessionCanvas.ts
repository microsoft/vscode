/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { getCanvasDefinitionInstanceId, getCanvasDefinitionLabels, type ICanvasReference } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { IChat, ISession, ISessionCanvas, ISessionCanvasDefinition } from '../../../services/sessions/common/session.js';

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
	readonly availableCanvases: IObservable<readonly ISessionCanvasDefinition[]>;
	openCanvas(canvas: ISessionCanvasDefinition): Promise<void>;
}
