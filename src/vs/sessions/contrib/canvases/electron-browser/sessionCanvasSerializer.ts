/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditorSerializer } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { ISessionCanvasReference, ISessionCanvasService, SessionCanvasInput } from '../common/sessionCanvas.js';

interface ISerializedCanvasReference {
	readonly version: 1;
	readonly providerId: string;
	readonly session: string;
	readonly chat: string;
	readonly canvas: string;
}

/** Resolves the service during deserialization, after editor-part construction. */
class CanvasInputRestorer {
	constructor(@ISessionCanvasService private readonly canvasService: ISessionCanvasService) { }

	restore(reference: ISessionCanvasReference): SessionCanvasInput | undefined {
		return this.canvasService.restoreCanvasInput(reference);
	}
}

/** Working-set identity is adoptable only by an already admitted presentation in this live runtime. */
export class SessionCanvasSerializer implements IEditorSerializer {
	constructor(@ILogService private readonly logService: ILogService) { }

	canSerialize(input: EditorInput): input is SessionCanvasInput {
		return input instanceof SessionCanvasInput && !input.isDisposed();
	}

	serialize(input: EditorInput): string | undefined {
		if (!this.canSerialize(input)) {
			return undefined;
		}
		const reference = input.reference;
		const data: ISerializedCanvasReference = {
			version: 1,
			providerId: reference.providerId,
			session: reference.session.toString(),
			chat: reference.chat.toString(),
			canvas: reference.canvas.toString(),
		};
		return JSON.stringify(data);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): SessionCanvasInput | undefined {
		let reference: ISessionCanvasReference;
		try {
			const data = JSON.parse(serializedEditor) as Partial<ISerializedCanvasReference> | null;
			if (!data || data.version !== 1 || typeof data.providerId !== 'string' || !data.providerId
				|| typeof data.session !== 'string' || typeof data.chat !== 'string' || typeof data.canvas !== 'string') {
				throw new Error('Invalid canvas reference');
			}
			const session = URI.parse(data.session, true);
			const chat = URI.parse(data.chat, true);
			const canvas = URI.parse(data.canvas, true);
			reference = { providerId: data.providerId, session, chat, canvas };
		} catch {
			this.logService.warn('[SessionCanvasSerializer] Ignoring invalid canvas reference');
			return undefined;
		}
		return instantiationService.createInstance(CanvasInputRestorer).restore(reference);
	}
}
