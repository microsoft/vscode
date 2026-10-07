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

/**
 * One file change produced by an agent, as the chat knows it: the file plus the
 * before/after resources a diff can be read from. Either side may be absent for
 * a created or deleted file.
 */
export interface IChatEditPhoneDiff {
	readonly uri: URI;
	readonly originalURI: URI | undefined;
	readonly modifiedURI: URI | undefined;
	readonly added: number;
	readonly removed: number;
}

/**
 * Implementation of the phone edit presenter, registered by the agents-window
 * (sessions) layer. Stays in `vs/workbench` as an interface so the chat content
 * parts compile and run with no sessions dependency.
 */
export interface IChatEditPhonePresenterImpl {
	/** Whether the phone presentation is active. */
	readonly enabled: IObservable<boolean>;
	renderTextEdit(edit: IChatTextEditGroup, response: IChatResponseViewModel, createModel: ChatEditCompareModelFactory): IChatEditPresentation;
	/**
	 * Show the change in the phone diff overlay. Resolves `true` when handled;
	 * `false` lets the caller fall back to the desktop editor.
	 */
	openDiff(diff: IChatEditPhoneDiff): Promise<boolean>;
}

export const IChatEditPhonePresenter = createDecorator<IChatEditPhonePresenter>('chatEditPhonePresenter');

/**
 * Workbench-layer hook for the phone presentation of agent edits in chat.
 *
 * On desktop an edit renders as an inline diff editor (or a pill that opens
 * one). Neither fits a phone: a side-by-side diff at 390px shows a few
 * characters per side. When {@link enabled} is `true`, content parts render an
 * edit as a tappable file row and route opening through {@link openDiff}.
 *
 * The default singleton is a no-op (`enabled === false`, `openDiff` resolves
 * `false`); the agents-window layer registers the real implementation.
 */
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
