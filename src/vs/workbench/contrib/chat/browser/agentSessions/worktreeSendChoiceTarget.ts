/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../base/browser/dom.js';
import { isAuxiliaryWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, runOnChange } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { isVisibleOnboardingTarget, markOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';

/**
 * What asks where a new chat works as its first request is sent, in a callout on the worktree control of that chat: by the
 * chat's resource, holding no UI. The controls take part as targets of the callout ({@link WorktreeSendChoiceTarget}).
 */
export interface IWorktreeSendChoiceAsker {
	/** The onboarding target id that the callout anchors on. */
	readonly targetId: string;
	/** The chat asked about now, until it has the answer. */
	readonly pendingSendChoice: IObservable<URI | undefined>;
	/** Fires with the chat asked about each time its callout shows, also again on another control once the one it showed on is gone. */
	readonly onDidShowSendChoice: Event<URI>;
	/** Ends the question about the chat of `resource` unanswered, where it asks about it. */
	cancelSendChoice(resource: URI): void;
}

/** A worktree control of a chat, as {@link IWorktreeSendChoiceTargetService} knows it: without its element. */
export interface IWorktreeSendChoiceControl {
	/** The chat the control shows. */
	readonly resource: IObservable<URI | undefined>;
	/** Whether the control is where its chat offers New Worktree now; it always is when not given. */
	readonly isOffered?: () => boolean;
	/**
	 * Whether the callout can show on the control now, such as while it shows in the window the callout shows in and is
	 * visible there; it always can when not given.
	 */
	readonly isPresentable?: () => boolean;
}

/** A control registered with {@link IWorktreeSendChoiceTargetService}, until it is disposed. */
export interface IWorktreeSendChoiceControlRegistration extends IDisposable {
	/** Whether the callout of its asker targets the control now. */
	isTarget(): boolean;
}

export const IWorktreeSendChoiceTargetService = createDecorator<IWorktreeSendChoiceTargetService>('worktreeSendChoiceTargetService');

/**
 * Which worktree control the callout of an asker shows on, and when its question ends unanswered. The callout targets the
 * control it shows on while that control shows the chat asked about where it offers New Worktree and can present it, else the
 * first registered control that does. The question ends unanswered once that control shows another chat, or once it goes with no other
 * control of the chat to show on, which it then shows on. Other controls, such as one in another window, never end it.
 */
export interface IWorktreeSendChoiceTargetService {
	readonly _serviceBrand: undefined;

	/** Registers `control` as a possible target of the callout of `asker`, until the returned registration is disposed. */
	registerControl(asker: IWorktreeSendChoiceAsker, control: IWorktreeSendChoiceControl): IWorktreeSendChoiceControlRegistration;
}

/** Chat identities, not file system paths: exactly the same resource. */
function isSameChat(a: URI | undefined, b: URI | undefined): boolean {
	return !!a && !!b && isEqual(a, b);
}

/** The controls of one asker, and the control its callout shows on (`anchor`) with the chat it asked about there. */
class AskerControls extends Disposable {

	private readonly _controls: { readonly control: IWorktreeSendChoiceControl; readonly store: DisposableStore }[] = [];
	private _anchor: { readonly entry: AskerControls['_controls'][number]; readonly asked: URI } | undefined;

	constructor(private readonly _asker: IWorktreeSendChoiceAsker) {
		super();
		// The callout shows on the control it targets
		this._register(_asker.onDidShowSendChoice(asked => {
			const entry = this._targetOf(asked);
			this._anchor = entry && { entry, asked };
		}));
		// Answered or ended meanwhile
		this._register(autorun(reader => {
			const pending = _asker.pendingSendChoice.read(reader);
			if (this._anchor && !isSameChat(this._anchor.asked, pending)) {
				this._anchor = undefined;
			}
		}));
	}

	get isEmpty(): boolean {
		return this._controls.length === 0;
	}

	add(control: IWorktreeSendChoiceControl): AskerControls['_controls'][number] {
		const entry = { control, store: new DisposableStore() };
		entry.store.add(runOnChange(control.resource, shown => {
			const anchor = this._anchor;
			if (anchor?.entry === entry && !isSameChat(anchor.asked, shown)) {
				this._anchor = undefined;
				this._asker.cancelSendChoice(anchor.asked);
			}
		}));
		this._controls.push(entry);
		return entry;
	}

	remove(entry: AskerControls['_controls'][number]): void {
		const index = this._controls.indexOf(entry);
		if (index < 0) {
			return;
		}
		this._controls.splice(index, 1);
		entry.store.dispose();
		const anchor = this._anchor;
		if (anchor?.entry === entry) {
			this._anchor = undefined;
			// Another control of the chat, such as one rendered in its place before it went, which the callout shows on again
			const next = this._targetOf(anchor.asked);
			this._anchor = next && { entry: next, asked: anchor.asked };
			if (!next) {
				this._asker.cancelSendChoice(anchor.asked);
			}
		}
	}

	isTarget(entry: AskerControls['_controls'][number]): boolean {
		const pending = this._asker.pendingSendChoice.get();
		return !!pending && this._targetOf(pending) === entry;
	}

	/** The control the callout about `asked` targets: the one it shows on while it still can, else the first that can. */
	private _targetOf(asked: URI): AskerControls['_controls'][number] | undefined {
		const canShowOn = (entry: AskerControls['_controls'][number]) => isSameChat(entry.control.resource.get(), asked) && (entry.control.isOffered?.() ?? true) && (entry.control.isPresentable?.() ?? true);
		const anchored = this._anchor?.entry;
		return anchored && isSameChat(this._anchor?.asked, asked) && canShowOn(anchored) ? anchored : this._controls.find(canShowOn);
	}

	override dispose(): void {
		for (const entry of this._controls) {
			entry.store.dispose();
		}
		this._controls.length = 0;
		super.dispose();
	}
}

export class WorktreeSendChoiceTargetService extends Disposable implements IWorktreeSendChoiceTargetService {

	declare readonly _serviceBrand: undefined;

	private readonly _askers = new Map<IWorktreeSendChoiceAsker, AskerControls>();

	constructor() {
		super();
		this._register(toDisposable(() => {
			for (const controls of this._askers.values()) {
				controls.dispose();
			}
			this._askers.clear();
		}));
	}

	registerControl(asker: IWorktreeSendChoiceAsker, control: IWorktreeSendChoiceControl): IWorktreeSendChoiceControlRegistration {
		let controls = this._askers.get(asker);
		if (!controls) {
			controls = new AskerControls(asker);
			this._askers.set(asker, controls);
		}
		const askerControls = controls;
		const entry = askerControls.add(control);
		let disposed = false;
		return {
			isTarget: () => !disposed && askerControls.isTarget(entry),
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				askerControls.remove(entry);
				if (askerControls.isEmpty && this._askers.get(asker) === askerControls) {
					this._askers.delete(asker);
					askerControls.dispose();
				}
			},
		};
	}
}

/**
 * Marks `element`, the worktree control of the chat `resource` shows, as the target of `asker`'s callout while
 * {@link IWorktreeSendChoiceTargetService} tells it is (and while `isOffered` tells, where given, such as while the control is
 * where the chat offers New Worktree). The service ends the question as the rules there say.
 */
export class WorktreeSendChoiceTarget extends Disposable {

	constructor(
		element: HTMLElement,
		asker: IWorktreeSendChoiceAsker,
		resource: IObservable<URI | undefined>,
		isOffered: (() => boolean) | undefined,
		@IWorktreeSendChoiceTargetService targetService: IWorktreeSendChoiceTargetService,
	) {
		super();
		// The callout shows in the window of the workbench, not in an auxiliary window, on a visible control only
		const isPresentable = () => {
			const targetWindow = getWindow(element);
			return !isAuxiliaryWindow(targetWindow) && isVisibleOnboardingTarget(targetWindow, element);
		};
		const registration = this._register(targetService.registerControl(asker, { resource, isOffered, isPresentable }));
		// A callout run has no scope: it matches only the control it targets, and every other control is out of scope
		this._register(markOnboardingTarget(element, asker.targetId, {
			scope: () => registration.isTarget() ? undefined : (resource.get()?.toString() ?? ''),
		}));
	}
}

registerSingleton(IWorktreeSendChoiceTargetService, WorktreeSendChoiceTargetService, InstantiationType.Delayed);
