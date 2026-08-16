/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IChatInputWindowCIFailure, IChatInputWindowCIFailureProvider, IChatInputWindowService } from '../../../../workbench/contrib/chat/common/chatInputWindow.js';
import { BlockedSessionReason, BlockedSessions } from '../../blockedSessions/browser/blockedSessions.js';
import { IBlockedSessionsCIFixModel } from './blockedSessionsCIFixModel.js';

export class OmniCIFailureProvider extends Disposable implements IChatInputWindowCIFailureProvider {

	readonly failures: IObservable<readonly IChatInputWindowCIFailure[]>;

	constructor(
		private readonly _blockedSessions: BlockedSessions,
		private readonly _ciFixModel: IBlockedSessionsCIFixModel,
		enabled: boolean,
	) {
		super();

		this.failures = derivedOpts({
			owner: this,
			equalsFn: (a, b) => equals(a, b, (x, y) =>
				x.sessionResource.toString() === y.sessionResource.toString()
				&& x.occurrenceId === y.occurrenceId
				&& x.label === y.label
				&& x.failed === y.failed
				&& x.pending === y.pending
				&& x.updatedAt === y.updatedAt),
		}, reader => {
			if (!enabled) {
				return [];
			}

			const hiddenSessions = this._ciFixModel.hiddenSessions.read(reader);
			const failures: IChatInputWindowCIFailure[] = [];
			for (const blocked of this._blockedSessions.blockedSessionsWithReasons.read(reader)) {
				if (blocked.reason !== BlockedSessionReason.FailingCI || hiddenSessions.has(blocked.session.sessionId)) {
					continue;
				}
				const state = this._ciFixModel.getCIFix(blocked.session).read(reader);
				if (!state) {
					continue;
				}
				failures.push({
					sessionResource: blocked.session.resource,
					occurrenceId: blocked.occurrenceId,
					label: blocked.session.title.read(reader),
					failed: state.failed,
					pending: state.pending,
					updatedAt: blocked.session.updatedAt.read(reader).getTime(),
				});
			}
			return failures;
		});
	}

	fixCI(sessionResource: URI): void {
		const blocked = this._blockedSessions.blockedSessionsWithReasons.get().find(candidate =>
			candidate.reason === BlockedSessionReason.FailingCI
			&& candidate.session.resource.toString() === sessionResource.toString());
		if (blocked) {
			this._ciFixModel.fixCI(blocked.session);
		}
	}
}

export class OmniCIFailureContribution extends Disposable {

	static readonly ID = 'sessions.contrib.omniCIFailure';

	constructor(
		@IChatInputWindowService chatInputWindowService: IChatInputWindowService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService productService: IProductService,
		@IBlockedSessionsCIFixModel ciFixModel: IBlockedSessionsCIFixModel,
	) {
		super();

		const blockedSessions = this._register(instantiationService.createInstance(BlockedSessions));
		const provider = this._register(new OmniCIFailureProvider(blockedSessions, ciFixModel, productService.quality !== 'stable'));
		this._register(chatInputWindowService.registerCIFailureProvider(provider));
	}
}
