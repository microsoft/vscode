/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWhenIdle } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorContributionInstantiation, IEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class CodeEditorContributions extends Disposable {

	private _editor: ICodeEditor | null = null;
	private _instantiationService: IInstantiationService | null = null;

	/**
	 * Contains all instantiated contributions.
	 */
	private readonly _instances = this._register(new DisposableMap<string, IEditorContribution>());
	/**
	 * Contains contributions which are not yet instantiated.
	 */
	private readonly _pending = new Map<string, IEditorContributionDescription>();
	/**
	 * Tracks which instantiation kinds are still left in `_pending`.
	 */
	private readonly _finishedInstantiation: boolean[] = [];

	constructor(

	) {
		super();

		this._finishedInstantiation[EditorContributionInstantiation.Eager] = false;
		this._finishedInstantiation[EditorContributionInstantiation.AfterFirstRender] = false;
		this._finishedInstantiation[EditorContributionInstantiation.BeforeFirstInteraction] = false;
		this._finishedInstantiation[EditorContributionInstantiation.Eventually] = false;
	}

	public initialize(editor: ICodeEditor, contributions: IEditorContributionDescription[], instantiationService: IInstantiationService) {
		this._editor = editor;
		this._instantiationService = instantiationService;

		for (const desc of contributions) {
			if (this._pending.has(desc.id)) {
				onUnexpectedError(new Error(`Cannot have two contributions with the same id ${desc.id}`));
				continue;
			}
			this._pending.set(desc.id, desc);
		}

		this._instantiateSome(EditorContributionInstantiation.Eager);

		// AfterFirstRender
		// - these extensions will be instantiated at the latest 50ms after the first render.
		// - but if there is idle time, we will instantiate them sooner.
		this._register(runWhenIdle(() => {
			this._instantiateSome(EditorContributionInstantiation.AfterFirstRender);
		}));

		// BeforeFirstInteraction
		// - these extensions will be instantiated at the latest before a mouse or a keyboard event.
		// - but if there is idle time, we will instantiate them sooner.
		this._register(runWhenIdle(() => {
			this._instantiateSome(EditorContributionInstantiation.BeforeFirstInteraction);
		}));

		// Eventually
		// - these extensions will only be instantiated when there is idle time.
		// - since there is no guarantee that there will ever be idle time, we set a timeout of 5s here.
		this._register(runWhenIdle(() => {
			this._instantiateSome(EditorContributionInstantiation.Eventually);
		}, 5000));
	}

	public saveViewState(): { [key: string]: any } {
		const contributionsState: { [key: string]: any } = {};
		for (const [id, contribution] of this._instances) {
			if (typeof contribution.saveViewState === 'function') {
				contributionsState[id] = contribution.saveViewState();
			}
		}
		return contributionsState;
	}

	public restoreViewState(contributionsState: { [key: string]: any }): void {
		for (const [id, contribution] of this._instances) {
			if (typeof contribution.restoreViewState === 'function') {
				contribution.restoreViewState(contributionsState[id]);
			}
		}
	}

	public get(id: string): IEditorContribution | null {
		this._instantiateById(id);
		return this._instances.get(id) || null;
	}

	/**
	 * used by tests
	 */
	public set(id: string, value: IEditorContribution) {
		this._instances.set(id, value);
	}

	public onBeforeInteractionEvent(): void {
		// this method is called very often by the editor!
		this._instantiateSome(EditorContributionInstantiation.BeforeFirstInteraction);
	}

	public onAfterModelAttached(): void {
		this._register(runWhenIdle(() => {
			this._instantiateSome(EditorContributionInstantiation.AfterFirstRender);
		}, 50));
	}

	private _instantiateSome(instantiation: EditorContributionInstantiation): void {
		if (this._finishedInstantiation[instantiation]) {
			// already done with this instantiation!
			return;
		}
		this._finishedInstantiation[instantiation] = true;

		const contribs = this._findPendingContributionsByInstantiation(instantiation);
		for (const contrib of contribs) {
			this._instantiateById(contrib.id);
		}
	}

	private _findPendingContributionsByInstantiation(instantiation: EditorContributionInstantiation): readonly IEditorContributionDescription[] {
		const result: IEditorContributionDescription[] = [];
		for (const [, desc] of this._pending) {
			if (desc.instantiation === instantiation) {
				result.push(desc);
			}
		}
		return result;
	}

	private _instantiateById(id: string): void {
		const desc = this._pending.get(id);
		if (!desc) {
			return;
		}

		this._pending.delete(id);

		if (!this._instantiationService || !this._editor) {
			throw new Error(`Cannot instantiate contributions before being initialized!`);
		}

		try {
			const instance = this._instantiationService.createInstance(desc.ctor, this._editor);
			this._instances.set(desc.id, instance);
			if (typeof instance.restoreViewState === 'function' && desc.instantiation !== EditorContributionInstantiation.Eager) {
				console.warn(`Editor contribution '${desc.id}' should be eager instantiated because it uses saveViewState / restoreViewState.`);
			}
		} catch (err) {
			onUnexpectedError(err);
		}
	}
}
