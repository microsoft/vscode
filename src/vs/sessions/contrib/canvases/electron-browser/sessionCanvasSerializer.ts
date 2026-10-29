/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditorSerializer } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { CanvasInput, ICanvasService } from '../../../../workbench/contrib/canvases/common/canvas.js';

interface ISerializedCanvasPresentation {
	readonly version: 1;
	readonly id: string;
}

/** Resolves the service after editor-part construction, avoiding a service cycle during serializer startup. */
class CanvasInputRestorer {
	constructor(@ICanvasService private readonly canvasService: ICanvasService) { }

	restore(serializationId: string): CanvasInput | undefined {
		return this.canvasService.restoreCanvasInput(serializationId);
	}
}

/**
 * Serializes only an opaque capability issued by the live canvas service. The
 * persisted value contains no provider, session, chat, canvas, source, or title
 * identity and is unusable after the service instance that issued it is gone.
 */
export class SessionCanvasSerializer implements IEditorSerializer {
	constructor(@ILogService private readonly logService: ILogService) { }

	canSerialize(input: EditorInput): input is CanvasInput {
		return input instanceof CanvasInput && !input.isDisposed() && input.serializationId !== undefined;
	}

	serialize(input: EditorInput): string | undefined {
		if (!this.canSerialize(input)) {
			return undefined;
		}
		const serializationId = input.serializationId;
		if (!serializationId) {
			return undefined;
		}
		const data: ISerializedCanvasPresentation = {
			version: 1,
			id: serializationId,
		};
		return JSON.stringify(data);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): CanvasInput | undefined {
		let serializationId: string;
		try {
			const data = JSON.parse(serializedEditor) as Partial<ISerializedCanvasPresentation> | null;
			if (!data || data.version !== 1 || typeof data.id !== 'string' || !data.id) {
				throw new Error('Invalid canvas presentation');
			}
			serializationId = data.id;
		} catch {
			this.logService.warn('[SessionCanvasSerializer] Ignoring invalid canvas presentation');
			return undefined;
		}
		return instantiationService.createInstance(CanvasInputRestorer).restore(serializationId);
	}
}
