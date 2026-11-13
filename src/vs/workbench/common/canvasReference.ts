/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../base/common/uri.js';

export interface ICanvas {
	readonly resource: URI;
	readonly instanceId: string | undefined;
	readonly title: string;
	readonly status?: string;
	readonly source: URI | undefined;
	/** Owning extension identifier, when the host reports it. */
	readonly extensionId?: string;
	/** Provider-local canvas type identifier, when the host reports it. */
	readonly canvasId?: string;
}

export interface ICanvasOwner {
	readonly providerId: string;
	readonly session: URI;
	readonly chat: URI;
}

export interface ICanvasReference extends ICanvasOwner {
	readonly canvas: URI;
}

export function canvasOwnerKey(owner: ICanvasOwner): string {
	return `${owner.providerId}\u0000${owner.session.toString()}\u0000${owner.chat.toString()}`;
}

export function getCanvasReferenceKey(reference: ICanvasReference): string {
	return `${canvasOwnerKey(reference)}\u0000${reference.canvas.toString()}`;
}
