/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IInteractiveSessionEditorOptions, InteractiveSessionEditor } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditor';
import { IInteractiveSessionModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionModel';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';

export class InteractiveSessionEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.interactiveSession';
	static count = 0;

	private readonly inputCount: number;
	public sessionId: string | undefined;

	static getNewEditorUri(): URI {
		const handle = Math.floor(Math.random() * 1e9);
		return InteractiveSessionUri.generate(handle);
	}

	constructor(
		readonly resource: URI,
		readonly options: IInteractiveSessionEditorOptions,
		initialSessionId: string | undefined,
		@IInteractiveSessionService private readonly interactiveSessionService: IInteractiveSessionService
	) {
		super();

		const parsed = InteractiveSessionUri.parse(resource);
		if (typeof parsed?.handle !== 'number') {
			throw new Error('Invalid interactive session URI');
		}

		this.sessionId = initialSessionId;
		this.inputCount = InteractiveSessionEditorInput.count++;
	}

	override get editorId(): string | undefined {
		return InteractiveSessionEditor.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return otherInput instanceof InteractiveSessionEditorInput && otherInput.resource.toString() === this.resource.toString();
	}

	override get typeId(): string {
		return InteractiveSessionEditorInput.ID;
	}

	override getName(): string {
		return nls.localize('interactiveSessionEditorName', "Interactive Session") + (this.inputCount > 0 ? ` ${this.inputCount + 1}` : '');
	}

	override async resolve(): Promise<InteractiveSessionEditorModel | null> {
		const model = typeof this.sessionId === 'string' ?
			this.interactiveSessionService.retrieveSession(this.sessionId) :
			this.interactiveSessionService.startSession(this.options.providerId, false, CancellationToken.None);

		if (!model) {
			return null;
		}

		await model.waitForInitialization();
		this.sessionId = model.sessionId;
		return new InteractiveSessionEditorModel(model);
	}
}

export class InteractiveSessionEditorModel extends Disposable implements IEditorModel {
	private _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	private _isDisposed = false;
	private _isResolved = false;

	constructor(
		readonly model: IInteractiveSessionModel
	) { super(); }

	async resolve(): Promise<void> {
		this._isResolved = true;
	}

	isResolved(): boolean {
		return this._isResolved;
	}

	isDisposed(): boolean {
		return this._isDisposed;
	}

	override dispose(): void {
		super.dispose();
		this._isDisposed = true;
	}
}

export namespace InteractiveSessionUri {

	export const scheme = Schemas.vscodeInteractiveSesssion;


	export function generate(handle: number): URI {
		return URI.from({ scheme, path: `interactiveSession-${handle}` });
	}

	export function parse(resource: URI): { handle: number } | undefined {
		if (resource.scheme !== scheme) {
			return undefined;
		}

		const match = resource.path.match(/interactiveSession-(\d+)/);
		const handleStr = match?.[1];
		if (typeof handleStr !== 'string') {
			return undefined;
		}

		const handle = parseInt(handleStr);
		if (isNaN(handle)) {
			return undefined;
		}

		return { handle };
	}
}

interface ISerializedInteractiveSessionEditorInput {
	options: IInteractiveSessionEditorOptions;
	resource: URI;
	sessionId: string;
}

export class InteractiveSessionEditorInputSerializer implements IEditorSerializer {
	canSerialize(input: EditorInput): boolean {
		return input instanceof InteractiveSessionEditorInput;
	}

	serialize(input: EditorInput): string | undefined {
		if (!(input instanceof InteractiveSessionEditorInput)) {
			return undefined;
		}

		if (typeof input.sessionId !== 'string') {
			return undefined;
		}

		const obj: ISerializedInteractiveSessionEditorInput = {
			options: input.options,
			resource: input.resource,
			sessionId: input.sessionId
		};
		return JSON.stringify(obj);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			const parsed: ISerializedInteractiveSessionEditorInput = JSON.parse(serializedEditor);
			const resource = URI.revive(parsed.resource);
			return instantiationService.createInstance(InteractiveSessionEditorInput, resource, parsed.options as IInteractiveSessionEditorOptions, parsed.sessionId);
		} catch (err) {
			return undefined;
		}
	}
}
