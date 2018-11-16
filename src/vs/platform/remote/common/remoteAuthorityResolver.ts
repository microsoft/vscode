/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgressStep } from 'vs/platform/progress/common/progress';
import { Event } from 'vs/base/common/event';

export const IRemoteAuthorityResolverService = createDecorator<IRemoteAuthorityResolverService>('remoteAuthorityResolverService');

export interface ResolvedAuthority {
	readonly authority: string;
	readonly host: string;
	readonly port: number;
}

export type IResolvingProgressEvent =
	{ type: 'progress', authority: string, data: IProgressStep }
	| { type: 'finished', authority: string }
	| { type: 'output', authority: string, data: { channel: string, message: string; isErr?: boolean; } };

export interface IRemoteAuthorityResolverService {

	_serviceBrand: any;

	onResolvingProgress: Event<IResolvingProgressEvent>;

	resolveAuthority(authority: string): Thenable<ResolvedAuthority>;

	getRemoteAuthorityResolver(authority: string): Thenable<IRemoteAuthorityResolver | null>;
}

export interface IRemoteAuthorityResolver {
	label: string;
	path: string;
	authorityPrefix: string;
	syncExtensions?: boolean;
}
