/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
	ILinkPresentation,
	ILinkPresentationProvider,
	LinkPresentation,
	LinkPresentationKind,
	LinkPresentationStatusKind,
} from '@vscode/markdown-editor';
import { Disposable, observableValue, type ISettableObservable } from '@vscode/observables';

interface LinkPresentationEntry {
	readonly presentation: ISettableObservable<LinkPresentation | undefined>;
	references: number;
}

export class WebviewLinkPresentationProvider extends Disposable implements ILinkPresentationProvider {
	readonly #entries = new Map<string, LinkPresentationEntry>();
	readonly #postMessage: (message: unknown) => void;
	#syncScheduled = false;

	constructor(postMessage: (message: unknown) => void) {
		super();
		this.#postMessage = postMessage;
	}

	createLinkPresentation(url: string): ILinkPresentation | undefined {
		const initialPresentation = createInitialPresentation(url);
		if (!initialPresentation) {
			return undefined;
		}

		let entry = this.#entries.get(url);
		if (!entry) {
			entry = {
				presentation: observableValue(`linkPresentation:${url}`, initialPresentation),
				references: 0,
			};
			this.#entries.set(url, entry);
		}
		entry.references++;
		this.#scheduleTargetSync();

		let disposed = false;
		return {
			presentation: entry.presentation,
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				this.#release(url, entry);
			},
		};
	}

	handleMessage(message: unknown): boolean {
		if (!isRecord(message) || message.type !== 'richLinkPresentations' || !Array.isArray(message.presentations)) {
			return false;
		}
		for (const value of message.presentations) {
			if (!isRecord(value) || typeof value.href !== 'string') {
				continue;
			}
			const entry = this.#entries.get(value.href);
			if (!entry) {
				continue;
			}
			entry.presentation.set(readLinkPresentation(value.presentation), undefined);
		}
		return true;
	}

	override dispose(): void {
		this.#entries.clear();
		super.dispose();
	}

	#release(url: string, entry: LinkPresentationEntry): void {
		entry.references--;
		if (entry.references === 0 && this.#entries.get(url) === entry) {
			this.#entries.delete(url);
			this.#scheduleTargetSync();
		}
	}

	#scheduleTargetSync(): void {
		if (this.#syncScheduled) {
			return;
		}
		this.#syncScheduled = true;
		queueMicrotask(() => {
			this.#syncScheduled = false;
			this.#postMessage({ type: 'richLinkTargets', hrefs: [...this.#entries.keys()] });
		});
	}
}

function createInitialPresentation(url: string): LinkPresentation | undefined {
	const target = classifyLink(url);
	return target ? {
		...target,
		status: { kind: 'pending', label: 'Loading' },
	} : undefined;
}

interface InitialLinkTarget {
	readonly kind: LinkPresentationKind;
	readonly title?: string;
}

function classifyLink(url: string): InitialLinkTarget | undefined {
	if (url.startsWith('agent-host-session://')) {
		return { kind: 'session' };
	}
	if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
		return url.startsWith('#') ? undefined : { kind: 'file' };
	}

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return undefined;
	}
	if (parsed.protocol === 'commit:') {
		return parsed.hostname || parsed.pathname ? { kind: 'commit' } : undefined;
	}
	if (parsed.protocol === 'file:') {
		return { kind: 'file' };
	}
	const segments = parsed.pathname.split('/').filter(Boolean);
	const commitIndex = segments.lastIndexOf('commit');
	if ((parsed.protocol === 'https:' || parsed.protocol === 'http:')
		&& commitIndex >= 1
		&& commitIndex < segments.length - 1
	) {
		return { kind: 'commit' };
	}
	if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
		return undefined;
	}
	if (segments.length < 2) {
		return undefined;
	}
	switch (segments[2]) {
		case 'issues': return { kind: segments[3] ? 'issue' : 'repository' };
		case 'pull': return segments[3]
			? {
				kind: 'pullRequest',
				...(/^\d+$/.test(segments[3]) ? { title: `#${segments[3]}` } : {}),
			}
			: { kind: 'repository' };
		case 'commit': return { kind: segments[3] ? 'commit' : 'repository' };
		case 'tree': return { kind: segments[4] ? 'resource' : segments[3] ? 'branch' : 'repository' };
		case 'blob': return { kind: segments[3] && segments[4] ? 'file' : 'repository' };
		default: return segments.length === 2 ? { kind: 'repository' } : undefined;
	}
}

function readLinkPresentation(value: unknown): LinkPresentation | undefined {
	if (!isRecord(value) || !isLinkPresentationKind(value.kind)) {
		return undefined;
	}
	const title = typeof value.title === 'string' ? value.title : undefined;
	const detail = typeof value.detail === 'string' ? value.detail : undefined;
	const reference = typeof value.reference === 'string' ? value.reference : undefined;
	const tooltip = typeof value.tooltip === 'string' ? value.tooltip : undefined;
	const ariaLabel = typeof value.ariaLabel === 'string' ? value.ariaLabel : undefined;
	const status = readStatus(value.status);
	const secondaryStatus = readStatus(value.secondaryStatus);
	return {
		kind: value.kind,
		...(title ? { title } : {}),
		...(detail ? { detail } : {}),
		...(reference ? { reference } : {}),
		...(status ? { status } : {}),
		...(secondaryStatus ? { secondaryStatus } : {}),
		...(tooltip ? { tooltip } : {}),
		...(ariaLabel ? { ariaLabel } : {}),
	};
}

function readStatus(value: unknown): LinkPresentation['status'] {
	return isRecord(value) && isStatusKind(value.kind) && typeof value.label === 'string'
		? { kind: value.kind, label: value.label }
		: undefined;
}

function isLinkPresentationKind(value: unknown): value is LinkPresentationKind {
	return value === 'resource'
		|| value === 'issue'
		|| value === 'pullRequest'
		|| value === 'commit'
		|| value === 'file'
		|| value === 'folder'
		|| value === 'session'
		|| value === 'repository'
		|| value === 'branch';
}

function isStatusKind(value: unknown): value is LinkPresentationStatusKind {
	return value === 'neutral'
		|| value === 'pending'
		|| value === 'success'
		|| value === 'warning'
		|| value === 'error'
		|| value === 'open'
		|| value === 'closed'
		|| value === 'merged'
		|| value === 'draft'
		|| value === 'notPlanned';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
