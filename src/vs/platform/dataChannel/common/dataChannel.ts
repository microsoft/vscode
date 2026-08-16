/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IDataChannelService = createDecorator<IDataChannelService>('dataChannelService');

export interface IDataChannelService {
	readonly _serviceBrand: undefined;

	readonly onDidSendData: Event<IDataChannelEvent>;

	getDataChannel<T>(channelId: string): CoreDataChannel<T>;
}

export interface CoreDataChannel<T = unknown> {
	sendData(data: T): void;
}

export interface IDataChannelEvent<T = unknown> {
	channelId: string;
	data: T;
}

export const ILinkPresentationService = createDecorator<ILinkPresentationService>('linkPresentationService');

export type LinkPresentationKind =
	| 'resource'
	| 'issue'
	| 'pullRequest'
	| 'commit'
	| 'file'
	| 'folder'
	| 'session'
	| 'repository'
	| 'branch';

export type LinkPresentationStatusKind =
	| 'neutral'
	| 'pending'
	| 'success'
	| 'warning'
	| 'error'
	| 'open'
	| 'closed'
	| 'merged'
	| 'draft'
	| 'notPlanned';

export interface ILinkPresentationStatus {
	readonly kind: LinkPresentationStatusKind;
	readonly label: string;
}

export interface ILinkPresentation {
	readonly kind: LinkPresentationKind;
	readonly title?: string;
	readonly detail?: string;
	readonly reference?: string;
	readonly status?: ILinkPresentationStatus;
	readonly secondaryStatus?: ILinkPresentationStatus;
	readonly changes?: {
		readonly insertions: number;
		readonly deletions: number;
	};
	readonly tooltip?: string;
	readonly ariaLabel?: string;
	readonly isLoading?: boolean;
}

export function parseLinkPresentation(value: unknown): ILinkPresentation {
	if (!isRecord(value) || !isLinkPresentationKind(value.kind)) {
		throw new Error('Invalid link presentation payload');
	}
	const status = parseLinkPresentationStatus(value.status);
	const secondaryStatus = parseLinkPresentationStatus(value.secondaryStatus);
	const changes = parseLinkPresentationChanges(value.changes);
	return {
		kind: value.kind,
		...(typeof value.title === 'string' ? { title: value.title } : {}),
		...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
		...(typeof value.reference === 'string' ? { reference: value.reference } : {}),
		...(status ? { status } : {}),
		...(secondaryStatus ? { secondaryStatus } : {}),
		...(changes ? { changes } : {}),
		...(typeof value.tooltip === 'string' ? { tooltip: value.tooltip } : {}),
		...(typeof value.ariaLabel === 'string' ? { ariaLabel: value.ariaLabel } : {}),
		...(value.isLoading === true ? { isLoading: true } : {}),
	};
}

function parseLinkPresentationStatus(value: unknown): ILinkPresentationStatus | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!isRecord(value) || !isLinkPresentationStatusKind(value.kind) || typeof value.label !== 'string') {
		throw new Error('Invalid link presentation status');
	}
	return { kind: value.kind, label: value.label };
}

function parseLinkPresentationChanges(value: unknown): ILinkPresentation['changes'] {
	if (value === undefined) {
		return undefined;
	}
	if (!isRecord(value) || typeof value.insertions !== 'number' || typeof value.deletions !== 'number') {
		throw new Error('Invalid link presentation changes');
	}
	return { insertions: value.insertions, deletions: value.deletions };
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

function isLinkPresentationStatusKind(value: unknown): value is LinkPresentationStatusKind {
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

export interface ILinkPresentationWatcher extends IDisposable {
	readonly presentation: IObservable<ILinkPresentation | undefined>;
}

export interface ILinkPresentationProvider {
	createLinkPresentationWatcher(resource: URI): ILinkPresentationWatcher;
}

export interface ILinkPresentationProviderRegistration {
	readonly id: string;
	readonly uriPattern: RegExp;
	readonly initialKind: LinkPresentationKind;
	readonly enablement?: string;
}

export interface ILinkPresentationRule {
	readonly id: string;
	readonly uriPattern: RegExp;
	readonly initialKind: LinkPresentationKind;
}

export interface ILinkPresentationService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeLinkPresentationRules: Event<void>;
	readonly linkPresentationRules: readonly ILinkPresentationRule[];

	registerLinkPresentationProvider(registration: ILinkPresentationProviderRegistration, provider: ILinkPresentationProvider): IDisposable;
	registerExtensionLinkPresentationProvider(extensionId: string, providerId: string, provider: ILinkPresentationProvider): IDisposable;
	getLinkPresentationRule(resource: URI): ILinkPresentationRule | undefined;
	createLinkPresentationWatcher(providerId: string, resource: URI): ILinkPresentationWatcher | undefined;
}

export class NullDataChannelService implements IDataChannelService {
	_serviceBrand: undefined;
	get onDidSendData(): Event<IDataChannelEvent<unknown>> {
		return Event.None;
	}
	getDataChannel<T>(_channelId: string): CoreDataChannel<T> {
		return {
			sendData: () => { },
		};
	}
}
