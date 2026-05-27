/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IChatPlanReviewPhonePresenter, IChatPlanReviewPhonePresenterImpl } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatPlanReviewPhonePresenter.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IMobileContentSheetApi, showMobileContentSheet } from '../../../../browser/parts/mobile/mobilePickerSheet.js';

/**
 * Sessions-side implementation of {@link IChatPlanReviewPhonePresenter}.
 *
 * On phone-layout viewports of the agents window, hands the workbench
 * chat plan-review widget DOM (created by {@link ChatPlanReviewPart})
 * over to the shared mobile bottom sheet primitive
 * ({@link showMobileContentSheet}) instead of letting it render inline
 * in the chat message column. Workbench code does not depend on the
 * sheet primitive: it only sees the {@link IChatPlanReviewPhonePresenter}
 * decorator interface, so this wiring stays out of the workbench layer.
 */
class MobilePlanReviewPresenter extends Disposable implements IChatPlanReviewPhonePresenterImpl {

	readonly enabled: IObservable<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super();

		// Track the phone-layout context key (`sessionsIsPhoneLayout`)
		// so the plan-review part re-renders the moment we cross the
		// phone breakpoint. This key is the source of truth for "is
		// this viewport phone-classified" — the layout policy updates
		// it through the workbench's main `layout()` pass.
		const isPhoneCtx = observableContextKey<boolean>('sessionsIsPhoneLayout', contextKeyService);
		this.enabled = derived(this, reader => isPhoneCtx.read(reader) === true);
	}

	showPlanReview(planReviewElement: HTMLElement, title: string): IDisposable {
		// Capture the sheet API in a local closure so the outer
		// `IDisposable` we hand back to the plan-review part can close
		// the sheet on demand. `showMobileContentSheet` calls
		// `renderBody` synchronously inside its promise constructor,
		// so `apiRef` is assigned before the outer disposable is
		// observed.
		let apiRef: IMobileContentSheetApi | undefined;
		showMobileContentSheet(
			this._layoutService.mainContainer,
			title,
			(bodyContainer, api) => {
				apiRef = api;
				bodyContainer.appendChild(planReviewElement);
				// Detach the plan-review element when the sheet tears
				// down so the (workbench-owned) DOM survives sheet
				// dismissal and can be re-mounted on the next tap or
				// when the viewport flips back to desktop.
				return toDisposable(() => {
					if (planReviewElement.parentElement === bodyContainer) {
						bodyContainer.removeChild(planReviewElement);
					}
				});
			},
		);
		// `api.close()` is idempotent in `showMobileContentSheet`, so
		// it's safe for the caller to dispose this handle after the
		// sheet has already auto-closed (Done / backdrop / Escape).
		return toDisposable(() => apiRef?.close());
	}
}

class MobilePlanReviewPresenterContribution extends Disposable implements IWorkbenchContribution {

	private readonly _registration = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@IChatPlanReviewPhonePresenter presenter: IChatPlanReviewPhonePresenter,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const impl = this._register(instantiationService.createInstance(MobilePlanReviewPresenter));

		// Keep the registration mounted for the lifetime of the
		// contribution. The workbench presenter's `enabled` observable
		// already gates the actual sheet path on phone layout, so no
		// dynamic mount/unmount is needed here.
		this._registration.value = presenter.setImpl(impl);
	}
}

registerWorkbenchContribution2(
	'mobilePlanReviewPresenter',
	MobilePlanReviewPresenterContribution,
	WorkbenchPhase.BlockStartup,
);
