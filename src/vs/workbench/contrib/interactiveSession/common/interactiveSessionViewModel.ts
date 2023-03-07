/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IInteractiveRequestModel, IInteractiveResponseModel, IInteractiveSessionModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionModel';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';

export function isRequestVM(item: unknown): item is IInteractiveRequestViewModel {
	return !isResponseVM(item);
}

export function isResponseVM(item: unknown): item is IInteractiveResponseViewModel {
	return !!item && typeof (item as IInteractiveResponseViewModel).onDidChange !== 'undefined';
}

export interface IInteractiveSessionViewModel {
	sessionId: number;
	onDidDisposeModel: Event<void>;
	onDidChange: Event<void>;
	getItems(): (IInteractiveRequestViewModel | IInteractiveResponseViewModel)[];
}

export interface IInteractiveRequestViewModel {
	readonly id: string;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly message: string;
	currentRenderedHeight: number | undefined;
}

export interface IInteractiveResponseRenderData {
	renderPosition: number;
	renderTime: number;
	isFullyRendered: boolean;
}

export interface IInteractiveResponseViewModel {
	readonly onDidChange: Event<void>;
	readonly id: string;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly response: IMarkdownString;
	readonly isComplete: boolean;
	readonly followups?: string[];
	readonly progressiveResponseRenderingEnabled: boolean;
	renderData?: IInteractiveResponseRenderData;
	currentRenderedHeight: number | undefined;
}

export class InteractiveSessionViewModel extends Disposable {
	private readonly _onDidDisposeModel = this._register(new Emitter<void>());
	readonly onDidDisposeModel = this._onDidDisposeModel.event;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _items: (IInteractiveRequestViewModel | IInteractiveResponseViewModel)[] = [];

	get sessionId() {
		return this._model.sessionId;
	}

	private readonly _progressiveResponseRenderingEnabled: boolean;
	get progressiveResponseRenderingEnabled(): boolean {
		return this._progressiveResponseRenderingEnabled;
	}

	constructor(
		private readonly _model: IInteractiveSessionModel,
		@IInteractiveSessionService private readonly interactiveSessionService: IInteractiveSessionService
	) {
		super();

		this._progressiveResponseRenderingEnabled = this.interactiveSessionService.progressiveRenderingEnabled(this._model.providerId);

		_model.getRequests().forEach((request, i) => {
			this._items.push(new InteractiveRequestViewModel(request));
			if (request.response) {
				this._items.push(new InteractiveResponseViewModel(request.response, this.progressiveResponseRenderingEnabled));
			}
		});

		this._register(_model.onDidDispose(() => this._onDidDisposeModel.fire()));
		this._register(_model.onDidChange(e => {
			if (e.kind === 'clear') {
				this._items.length = 0;
				this._onDidChange.fire();
			} else if (e.kind === 'addRequest') {
				this._items.push(new InteractiveRequestViewModel(e.request));
				if (e.request.response) {
					this.onAddResponse(e.request.response);
				}
			} else if (e.kind === 'addResponse') {
				this.onAddResponse(e.response);
			}

			this._onDidChange.fire();
		}));
	}

	private onAddResponse(responseModel: IInteractiveResponseModel) {
		const response = new InteractiveResponseViewModel(responseModel, this.progressiveResponseRenderingEnabled);
		this._register(response.onDidChange(() => this._onDidChange.fire()));
		this._items.push(response);
	}

	getItems() {
		return this._items;
	}

	override dispose() {
		super.dispose();
		this._items
			.filter((item): item is InteractiveResponseViewModel => item instanceof InteractiveResponseViewModel)
			.forEach((item: InteractiveResponseViewModel) => item.dispose());
	}
}

export class InteractiveRequestViewModel implements IInteractiveRequestViewModel {
	get id() {
		return this._model.id;
	}

	get username() {
		return this._model.username;
	}

	get avatarIconUri() {
		return this._model.avatarIconUri;
	}

	get message() {
		return this._model.message;
	}

	currentRenderedHeight: number | undefined;

	constructor(readonly _model: IInteractiveRequestModel) { }
}

export class InteractiveResponseViewModel extends Disposable implements IInteractiveResponseViewModel {
	private _changeCount = 0;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _isPlaceholder = false;

	get id() {
		return this._model.id + `_${this._changeCount}`;
	}

	get username() {
		return this._model.username;
	}

	get avatarIconUri() {
		return this._model.avatarIconUri;
	}

	get response(): IMarkdownString {
		if (this._isPlaceholder) {
			return new MarkdownString('Thinking...');
		}

		return this._model.response;
	}

	get isComplete() {
		return this._model.isComplete;
	}

	get followups() {
		return this._model.followups;
	}

	renderData: IInteractiveResponseRenderData | undefined = undefined;

	currentRenderedHeight: number | undefined;

	constructor(private readonly _model: IInteractiveResponseModel, public readonly progressiveResponseRenderingEnabled: boolean) {
		super();

		this._isPlaceholder = !_model.response.value && !_model.isComplete;

		this._register(_model.onDidChange(() => {
			if (this._isPlaceholder && _model.response.value) {
				this._isPlaceholder = false;
				if (this.renderData) {
					this.renderData.renderPosition = 0;
				}
			}

			// new data -> new id, new content to render
			this._changeCount++;
			if (this.renderData) {
				this.renderData.isFullyRendered = false;
				this.renderData.renderTime = Date.now();
			}

			this._onDidChange.fire();
		}));
	}
}
