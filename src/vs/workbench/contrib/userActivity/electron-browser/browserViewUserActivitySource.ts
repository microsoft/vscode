/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout, RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { IUserActivityEvent, IUserActivitySource, IUserActivityTarget, USER_ACTIVITY_MAX_CONTEXT } from '../../../services/userActivity/common/userActivityCapture.js';
import { capText } from '../../../services/userActivity/browser/userActivityCaptureHelpers.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../browserView/common/browserView.js';
import { BrowserEditorInput } from '../../browserView/common/browserEditorInput.js';

/** A page settles this long after it navigates, changes title or gets focus before it is recorded. */
const SETTLE = 800;
/** How long reading a page's text may take. */
const SNAPSHOT_TIMEOUT = 2000;
/** A page's text is read at most once in this long. */
const SNAPSHOT_REUSE = 30_000;

type BrowserChange = 'navigate' | 'title' | 'focus';

/**
 * The integrated browser for the user activity capture: a page navigated to, retitled or
 * focused, with its address, title and visible text (from its accessibility snapshot).
 */
export class BrowserViewUserActivitySource extends Disposable implements IUserActivitySource {

	private readonly views = this._register(new DisposableMap<string>());
	private readonly snapshots = new Map<string, { readonly url: string; readonly text: string | undefined; readonly at: number }>();
	private record: (event: IUserActivityEvent) => void = () => { };

	constructor(
		@IBrowserViewWorkbenchService private readonly browserViewService: IBrowserViewWorkbenchService,
	) {
		super();
	}

	start(record: (event: IUserActivityEvent) => void): void {
		this.record = record;
		this.sync();
		this._register(this.browserViewService.onDidChangeBrowserViews(() => this.sync()));
	}

	describeResource(resource: URI): Partial<IUserActivityTarget> | undefined {
		const id = BrowserViewUri.getId(resource);
		const input = id ? this.browserViewService.getKnownBrowserViews().get(id) : undefined;
		if (!input) {
			return undefined;
		}
		const url = input.model?.url ?? input.url;
		return { area: 'browser', ...(url ? { url } : {}), title: input.getTitle() };
	}

	private sync(): void {
		const known = this.browserViewService.getKnownBrowserViews();
		for (const [id, input] of known) {
			if (!this.views.has(id)) {
				this.views.set(id, this.track(input));
			}
		}
		for (const id of [...this.views.keys()]) {
			if (!known.has(id)) {
				this.views.deleteAndDispose(id);
				this.snapshots.delete(id);
			}
		}
	}

	private track(input: BrowserEditorInput): IDisposable {
		const store = new DisposableStore();
		const pending = new Set<BrowserChange>();
		let last: string | undefined;
		const settle = store.add(new RunOnceScheduler(async () => {
			const model = input.model;
			// A page that still loads is recorded once it has loaded, unless it was only focused.
			if (!model || (model.loading && !pending.has('focus'))) {
				return;
			}
			const change = pending.has('navigate') ? 'navigate' : pending.has('title') ? 'title' : 'focus';
			pending.clear();
			const key = `${model.url}|${model.title}`;
			if (change !== 'focus' && key === last) {
				return;
			}
			last = key;
			const time = Date.now();
			const context = model.loading ? undefined : await this.pageText(input.id, model);
			if (store.isDisposed) {
				return;
			}
			this.record({
				kind: 'browser',
				time,
				target: { area: 'browser', uri: input.resource, url: model.url, ...(model.title ? { title: model.title } : {}) },
				...(context ? { context } : {}),
				detail: { change },
			});
		}, SETTLE));
		const changed = (change: BrowserChange) => {
			pending.add(change);
			settle.schedule();
		};
		const watching = store.add(new MutableDisposable<DisposableStore>());
		const watch = (model: IBrowserViewModel) => {
			const s = new DisposableStore();
			s.add(model.onDidNavigate(() => changed('navigate')));
			s.add(model.onDidChangeTitle(() => changed('title')));
			s.add(model.onDidChangeFocus(e => e.focused && changed('focus')));
			s.add(model.onDidChangeLoadingState(e => !e.loading && pending.size && settle.schedule()));
			watching.value = s;
		};
		if (input.model) {
			watch(input.model);
		}
		store.add(input.onDidResolveModel(watch));
		return store;
	}

	/** The page's visible text, read from its accessibility snapshot at most once in {@link SNAPSHOT_REUSE} per page. */
	private async pageText(id: string, model: IBrowserViewModel): Promise<string | undefined> {
		const url = model.url;
		const cached = this.snapshots.get(id);
		if (cached && cached.url === url && Date.now() - cached.at < SNAPSHOT_REUSE) {
			return cached.text;
		}
		let text: string | undefined;
		try {
			const snapshot = await raceTimeout(model.getAccessibilitySnapshot(), SNAPSHOT_TIMEOUT);
			text = snapshot?.text.trim() ? capText(snapshot.text.trim(), USER_ACTIVITY_MAX_CONTEXT) : undefined;
		} catch {
			text = undefined;
		}
		this.snapshots.set(id, { url, text, at: Date.now() });
		return text;
	}
}
