/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { isCancellationError, onUnexpectedError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IRange } from '../../../editor/common/core/range.js';
import { ISelection } from '../../../editor/common/core/selection.js';
import { ITextModel } from '../../../editor/common/model.js';
import { ICustomTextEditorNavigation } from '../../contrib/customEditor/common/customTextEditorNavigation.js';
import { ExtHostCustomEditorsShape, WebviewHandle } from '../common/extHost.protocol.js';

export class MainThreadCustomTextEditorNavigation extends Disposable implements ICustomTextEditorNavigation {

	private readonly _onDidChangeSelection = this._register(new Emitter<void>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;
	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;
	private readonly _lifetime = new CancellationTokenSource();
	private readonly _states = new Set<number>();
	private _nextState = 0;
	private _disposed = false;
	private _selection: ISelection | undefined;

	constructor(
		readonly model: ITextModel,
		selection: ISelection | undefined,
		private readonly _handle: WebviewHandle,
		private readonly _proxy: ExtHostCustomEditorsShape,
		private readonly _focus: () => void,
	) {
		super();
		this._selection = selection;
	}

	get selection(): ISelection | undefined {
		return this._selection;
	}

	updateSelection(selection: ISelection | undefined): void {
		if (!this._disposed) {
			this._selection = selection;
			this._onDidChangeSelection.fire();
		}
	}

	async revealRange(range: IRange, selection: ISelection | undefined, preserveFocus: boolean, token: CancellationToken): Promise<void> {
		if (this._disposed || token.isCancellationRequested) {
			return;
		}
		if (selection) {
			for (const stateId of this._states) {
				this._proxy.$releaseCustomTextEditorViewState(this._handle, stateId);
			}
			this._states.clear();
		}
		const cancellation = new CancellationTokenSource(this._lifetime.token);
		const listener = token.onCancellationRequested(() => cancellation.cancel());
		try {
			await this._proxy.$revealCustomTextEditorRange(this._handle, range, selection, preserveFocus, cancellation.token);
			if (!preserveFocus && !cancellation.token.isCancellationRequested) {
				this._focus();
			}
		} catch (error) {
			this._handleError(error);
		} finally {
			listener.dispose();
			cancellation.dispose();
		}
	}

	captureViewState(): IDisposable {
		if (this._disposed) {
			return Disposable.None;
		}
		const stateId = this._nextState++;
		this._states.add(stateId);
		const captured = this._proxy.$captureCustomTextEditorViewState(this._handle, stateId).catch(error => {
			this._states.delete(stateId);
			this._proxy.$releaseCustomTextEditorViewState(this._handle, stateId);
			this._handleError(error);
		});
		return toDisposable(() => {
			void captured.then(async () => {
				if (this._states.delete(stateId)) {
					await this._proxy.$restoreCustomTextEditorViewState(this._handle, stateId, this._lifetime.token);
				}
			}).catch(error => this._handleError(error));
		});
	}

	override dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._lifetime.dispose(true);
		this._states.clear();
		this._proxy.$disposeCustomTextEditorNavigation(this._handle);
		this._onDidDispose.fire();
		super.dispose();
	}

	private _handleError(error: unknown): void {
		if (!isCancellationError(error)) {
			onUnexpectedError(error);
		}
	}
}
