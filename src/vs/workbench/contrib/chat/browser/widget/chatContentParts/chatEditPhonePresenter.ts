/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import type { IResolvedTextEditorModel } from '../../../../../../editor/common/services/resolverService.js';
import type { IChatTextEditGroup } from '../../../common/model/chatModel.js';
import type { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';

export type ChatEditCompareModelFactory = () => Promise<IReference<{ originalSha1: string; original: IResolvedTextEditorModel; modified: IResolvedTextEditorModel }>>;

export interface IChatEditPresentation extends IDisposable {
	readonly domNode: HTMLElement;
}

/** A file change with optional before/after resources for created or deleted files. */
export interface IChatEditPhoneDiff {
	readonly uri: URI;
	readonly originalURI: URI | undefined;
	readonly modifiedURI: URI | undefined;
	readonly added: number;
	readonly removed: number;
}

/** An entry-owned edit presentation, without introducing an upward dependency from shared chat. */
export interface IChatEditPhonePresenterImpl {
	/** Whether the phone presentation is active. */
	readonly enabled: IObservable<boolean>;
	renderTextEdit(edit: IChatTextEditGroup, response: IChatResponseViewModel, createModel: ChatEditCompareModelFactory): IChatEditPresentation;
	/** Resolves `false` to fall back to the shared editor. */
	openDiff(diff: IChatEditPhoneDiff): Promise<boolean>;
}

export const IChatEditPhonePresenter = createDecorator<IChatEditPhonePresenter>('chatEditPhonePresenter');

/** Optional edit presentation; the default neither renders rows nor intercepts editor opening. */
export interface IChatEditPhonePresenter {
	readonly _serviceBrand: undefined;

	/** `true` when an impl is registered AND it reports phone layout. */
	readonly enabled: IObservable<boolean>;
	renderTextEdit(edit: IChatTextEditGroup, response: IChatResponseViewModel, createModel: ChatEditCompareModelFactory): IChatEditPresentation | undefined;

	/** Show the change in the phone diff overlay. Resolves `false` when not handled. */
	openDiff(diff: IChatEditPhoneDiff): Promise<boolean>;

	/** Register the phone implementation; the most recent registration wins. */
	setImpl(impl: IChatEditPhonePresenterImpl): IDisposable;
}

class ChatEditPhonePresenterService extends Disposable implements IChatEditPhonePresenter {

	declare readonly _serviceBrand: undefined;

	private readonly _impl = observableValue<IChatEditPhonePresenterImpl | undefined>(this, undefined);

	readonly enabled: IObservable<boolean> = derived(this, reader => {
		const impl = this._impl.read(reader);
		return impl ? impl.enabled.read(reader) : false;
	});

	openDiff(diff: IChatEditPhoneDiff): Promise<boolean> {
		const impl = this._impl.get();
		return impl && impl.enabled.get() ? impl.openDiff(diff) : Promise.resolve(false);
	}

	renderTextEdit(edit: IChatTextEditGroup, response: IChatResponseViewModel, createModel: ChatEditCompareModelFactory): IChatEditPresentation | undefined {
		const impl = this._impl.get();
		return impl?.enabled.get() ? impl.renderTextEdit(edit, response, createModel) : undefined;
	}

	setImpl(impl: IChatEditPhonePresenterImpl): IDisposable {
		this._impl.set(impl, undefined);
		return toDisposable(() => {
			if (this._impl.get() === impl) {
				this._impl.set(undefined, undefined);
			}
		});
	}
}

registerSingleton(IChatEditPhonePresenter, ChatEditPhonePresenterService, InstantiationType.Delayed);
