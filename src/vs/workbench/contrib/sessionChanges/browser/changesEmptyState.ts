/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Menus } from '../../sessions/browser/menus.js';
import { SessionsEmptyStateActions } from '../../../browser/parts/sessions/sessionsEmptyStateActions.js';
import { SessionsEmptyStateLayout } from '../../../browser/parts/sessions/sessionsEmptyStateLayout.js';

export class ChangesEmptyState extends Disposable {
	private readonly emptyStateLayout: SessionsEmptyStateLayout;

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const content = append(container, $('.sessions-empty-state-content'));
		append(content, $('.sessions-empty-state-description')).textContent = localize('changes.empty', "No changed files");
		const actions = append(content, $('.changes-empty-state-actions'));
		this._register(instantiationService.createInstance(SessionsEmptyStateActions, actions, Menus.EmptyChangesActions, {
			ariaLabel: localize('changes.emptyActions', "Changes actions"),
			telemetrySource: 'changes.emptyState',
		}));
		this.emptyStateLayout = this._register(new SessionsEmptyStateLayout(container, [content], actions));
	}

	layout(): void {
		this.emptyStateLayout.layout();
	}
}
