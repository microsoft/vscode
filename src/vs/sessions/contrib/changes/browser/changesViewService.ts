/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChangesViewModel } from './changesViewModel.js';

export const IChangesViewService = createDecorator<IChangesViewService>('changesViewService');

/**
 * Owns the single {@link ChangesViewModel} shared by the Changes view and the
 * multi-diff source resolver.
 *
 * Both the Changes view (auxiliary bar) and the multi-diff source resolver need
 * a {@link ChangesViewModel}, but they have independent lifecycles: the resolver
 * must exist even when the view is closed (so a previously open changes diff
 * editor can resolve its contents during workbench restore, and so the session
 * header's "View All Changes" action works). Sharing a single view model through
 * this service ensures both resolve the same changeset selection, so revealing a
 * file in a non-default changeset (e.g. "Last Turn Changes") matches the diffs
 * produced by the resolver.
 */
export interface IChangesViewService {
	readonly _serviceBrand: undefined;

	/**
	 * The shared view model backing the Changes view and the multi-diff source
	 * resolver.
	 */
	readonly viewModel: ChangesViewModel;
}

export class ChangesViewService extends Disposable implements IChangesViewService {

	declare readonly _serviceBrand: undefined;

	readonly viewModel: ChangesViewModel;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.viewModel = this._register(instantiationService.createInstance(ChangesViewModel));
	}
}

registerSingleton(IChangesViewService, ChangesViewService, InstantiationType.Delayed);
