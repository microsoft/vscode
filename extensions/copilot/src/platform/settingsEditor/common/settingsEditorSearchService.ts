/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { CancellationToken, Progress, SettingsSearchProvider, SettingsSearchProviderOptions, SettingsSearchResult } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export const ISettingsEditorSearchService = createServiceIdentifier<ISettingsEditorSearchService>('ISettingsEditorSearchService');

export interface ISettingsEditorSearchService extends SettingsSearchProvider {
	readonly _serviceBrand: undefined;

	provideSettingsSearchResults(query: string, options: SettingsSearchProviderOptions, progress: Progress<SettingsSearchResult>, token: CancellationToken): Thenable<void>;
}

export class NoopSettingsEditorSearchService implements ISettingsEditorSearchService {
	readonly _serviceBrand: undefined;

	provideSettingsSearchResults(query: string, options: SettingsSearchProviderOptions, progress: Progress<SettingsSearchResult>, token: CancellationToken): Thenable<void> {
		return Promise.resolve(undefined);
	}
}