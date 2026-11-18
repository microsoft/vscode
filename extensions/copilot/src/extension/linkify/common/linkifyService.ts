/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvService } from '../../../platform/env/common/envService';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import { PromptReference } from '../../prompt/common/conversation';
import { FilePathLinkifier } from './filePathLinkifier';
import { LinkifiedText } from './linkifiedText';
import { Linkifier } from './linkifier';
import { ModelFilePathLinkifier } from './modelFilePathLinkifier';
import { StatCache } from './statCache';

/**
 * A stateful linkifier.
 */
export interface ILinkifier {
	/**
	 * The total number of links that have been added.
	 *
	 * This may not be up to date if there are any ongoing `append` or `flush` calls.
	 */
	readonly totalAddedLinkCount: number;

	/**
	 * Add new text to the linkifier.
	 *
	 * @returns The new text that has been linkified. This may include parts of text that was previously passed to `.append`.
	 * It also may be empty if we are still accumulating text for linkification.
	 */
	append(newText: string, token: CancellationToken): Promise<LinkifiedText>;

	/**
	 * Complete the current linkification. If there is any pending text, it will be linkified and returned.
	 */
	flush(token: CancellationToken): Promise<LinkifiedText | undefined>;
}

export interface IContributedLinkifierFactory {
	create(): IContributedLinkifier;
}

export interface IContributedLinkifier {
	linkify(
		text: string,
		context: LinkifierContext,
		token: CancellationToken
	): Promise<LinkifiedText | undefined>;
}

export interface LinkifierContext {
	readonly requestId: string | undefined;
	readonly references: readonly PromptReference[];
}

export const ILinkifyService = createServiceIdentifier<ILinkifyService>('ILinkifyService');

export interface ILinkifyService {
	readonly _serviceBrand: undefined;

	/**
	 * Register a new global linkifier that is run for all text.
	 */
	registerGlobalLinkifier(linkifier: IContributedLinkifierFactory): IDisposable;

	/**
	 * Create a new {@link ILinkifier stateful linkifier}.
	 */
	createLinkifier(
		context: LinkifierContext,
		additionalLinkifiers?: readonly IContributedLinkifierFactory[],
	): ILinkifier;
}

export class LinkifyService implements ILinkifyService {

	declare readonly _serviceBrand: undefined;

	private readonly globalLinkifiers = new Set<IContributedLinkifierFactory>();

	constructor(
		@IFileSystemService private readonly fileSystem: IFileSystemService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IEnvService private readonly envService: IEnvService,
	) {
	}

	registerGlobalLinkifier(linkifier: IContributedLinkifierFactory): IDisposable {
		if (this.globalLinkifiers.has(linkifier)) {
			throw new Error('Linkifier already registered');
		}

		this.globalLinkifiers.add(linkifier);
		return { dispose: () => this.globalLinkifiers.delete(linkifier) };
	}

	createLinkifier(
		context: LinkifierContext,
		additionalLinkifiers?: readonly IContributedLinkifierFactory[],
	): ILinkifier {
		// Model and file path linkifiers share a stat cache per linkifier instance
		// so that filesystem lookups are not duplicated across them.
		const statCache = new StatCache(this.fileSystem);
		const builtInLinkifiers: IContributedLinkifier[] = [
			new ModelFilePathLinkifier(this.workspaceService, statCache),
			new FilePathLinkifier(this.workspaceService, statCache),
		];
		const additional = (additionalLinkifiers || []).map(x => x.create());
		const global = [...this.globalLinkifiers].map(x => x.create());
		return new Linkifier(context, this.envService.uriScheme, [...additional, ...builtInLinkifiers, ...global]);
	}
}
