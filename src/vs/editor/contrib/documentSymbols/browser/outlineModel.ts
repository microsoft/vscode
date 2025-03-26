/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModelService } from '../../../common/services/resolverService.js';
import { IOutlineModelService } from './outlineModel.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';

CommandsRegistry.registerCommand('_executeDocumentSymbolProvider', async function (accessor, ...args) {
	const [resource] = args;
	if (!URI.isUri(resource)) {
		throw new Error('Invalid URI');
	}

	const outlineService = accessor.get(IOutlineModelService);
	const modelService = accessor.get(ITextModelService);

	const reference = await modelService.createModelReference(resource);
	try {
		return (await outlineService.getOrCreate(reference.object.textEditorModel, CancellationToken.None)).getTopLevelSymbols();
	} finally {
		reference.dispose();
	}
});

export class OutlineModel {
	private static readonly _outlineModelPool: OutlineModel[] = [];
	private static readonly _maxOutlineModelPoolSize = 10;

	private _outline: any;
	private _disposed: boolean;

	constructor(outline: any) {
		this._outline = outline;
		this._disposed = false;
	}

	public static create(outline: any): OutlineModel {
		if (OutlineModel._outlineModelPool.length > 0) {
			const model = OutlineModel._outlineModelPool.pop()!;
			model._outline = outline;
			model._disposed = false;
			return model;
		}
		return new OutlineModel(outline);
	}

	public dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._outline = null;
		if (OutlineModel._outlineModelPool.length < OutlineModel._maxOutlineModelPoolSize) {
			OutlineModel._outlineModelPool.push(this);
		}
	}

	public getTopLevelSymbols(): any[] {
		if (this._disposed) {
			throw new Error('OutlineModel is disposed');
		}
		return this._outline;
	}

	public static manageOutlineIteratively(outline: any): any {
		const stack = [outline];
		const result = [];

		while (stack.length > 0) {
			const current = stack.pop();
			if (current.children) {
				for (const child of current.children) {
					stack.push(child);
				}
			}
			result.push(current);
		}

		return result;
	}
}
