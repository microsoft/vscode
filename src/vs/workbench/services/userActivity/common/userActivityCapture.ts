/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { BrandedService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * The kinds of {@link IUserActivityEvent}, in the order of the members of the proposed API's
 * `UserActivityKind` enum: the API's value of a kind is its 1-based position here.
 */
export const USER_ACTIVITY_KINDS = ['focus', 'click', 'selection', 'type', 'copy', 'cut', 'paste', 'command', 'openEditor', 'sessionSwitch', 'browser', 'terminal', 'windowFocus', 'search', 'read'] as const;

export type UserActivityKind = typeof USER_ACTIVITY_KINDS[number];

/** The most text an event carries in {@link IUserActivityEvent.text}. */
export const USER_ACTIVITY_MAX_TEXT = 2000;
/** The most text an event carries in {@link IUserActivityEvent.context}. */
export const USER_ACTIVITY_MAX_CONTEXT = 4000;

/**
 * Where an activity happened.
 */
export interface IUserActivityTarget {
	/** The part of the window: `editor`, `chat`, `chatInput`, `sessions`, `terminal`, `browser`, `explorer`, `scm`, `search`, `panel`, `sidebar`, `auxiliarybar`, `statusbar`, `titlebar`, `quickInput`, `notifications`, `dialog` or `other`. */
	readonly area: string;
	/** The view's id, when it happened in a view. */
	readonly view?: string;
	/** What the element says: its accessible name, title, or visible text, shortened. */
	readonly label?: string;
	/** The element's ARIA role. */
	readonly role?: string;
	/** The document, chat session or other resource it happened in. */
	readonly uri?: URI;
	/** That resource's title. */
	readonly title?: string;
	/** The integrated browser's address. */
	readonly url?: string;
	/** The 1-based line in a document. */
	readonly line?: number;
}

/**
 * One thing the user did, as the proposed API `userActivity` reports it.
 */
export interface IUserActivityEvent {
	readonly kind: UserActivityKind;
	/** When, in milliseconds since the epoch. */
	readonly time: number;
	readonly target: IUserActivityTarget;
	/** At most {@link USER_ACTIVITY_MAX_TEXT} characters. */
	readonly text?: string;
	/** At most {@link USER_ACTIVITY_MAX_CONTEXT} characters. */
	readonly context?: string;
	readonly detail?: { readonly [key: string]: string | number | boolean };
}

/**
 * A source of activity outside the core of the workbench (chat, terminals, the integrated
 * browser). Sources are created when capture starts and disposed when it stops, so nothing
 * listens while no one records.
 */
export interface IUserActivitySource extends IDisposable {
	/** Starts recording; called once, right after the source is created. */
	start(record: (event: IUserActivityEvent) => void): void;
	/**
	 * What the source knows about a resource that an editor shows or that is typed or selected in:
	 * the chat input's session and title, a browser page's address. Merged over what the
	 * workbench knows.
	 */
	describeResource?(resource: URI): Partial<IUserActivityTarget> | undefined;
}

/** A source's constructor: its arguments are the services it needs. */
export type UserActivitySourceCtor<Services extends BrandedService[] = BrandedService[]> = new (...services: Services) => IUserActivitySource;

const sources = new Set<UserActivitySourceCtor>();

/**
 * Registers a {@link IUserActivitySource}. It is instantiated (with its services injected) each
 * time capture starts.
 */
export function registerUserActivitySource<Services extends BrandedService[]>(ctor: UserActivitySourceCtor<Services>): IDisposable {
	const registered = ctor as unknown as UserActivitySourceCtor;
	sources.add(registered);
	return toDisposable(() => sources.delete(registered));
}

export function getUserActivitySources(): readonly UserActivitySourceCtor[] {
	return [...sources];
}

export const IUserActivityCaptureService = createDecorator<IUserActivityCaptureService>('userActivityCaptureService');

/**
 * Records what the user does in the window (clicks, selections, typing, copy and paste, focus,
 * editors, chat sessions, browser pages, terminal commands, commands) while at least one
 * {@link start} is live. Local to the window; nothing is recorded, and no listener is attached,
 * while capture is stopped. Password fields are never recorded.
 */
export interface IUserActivityCaptureService {
	readonly _serviceBrand: undefined;

	/** Fires for each recorded event while capture runs. */
	readonly onDidRecord: Event<IUserActivityEvent>;

	/** Whether capture runs. */
	readonly isCapturing: boolean;

	/**
	 * Starts capture, or keeps it running. Capture stops when every returned disposable is disposed.
	 */
	start(): IDisposable;
}
