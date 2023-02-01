/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IQuickDiffService, QuickDiff, QuickDiffProvider } from 'vs/workbench/contrib/scm/common/quickDiff';
import { isEqualOrParent } from 'vs/base/common/resources';
import { score } from 'vs/editor/common/languageSelector';

function createProviderComparer(uri: URI): (a: QuickDiffProvider, b: QuickDiffProvider) => number {
	return (a, b) => {
		if (a.rootUri && !b.rootUri) {
			return -1;
		} else if (!a.rootUri && b.rootUri) {
			return 1;
		} else if (!a.rootUri && !b.rootUri) {
			return 0;
		}

		const aIsParent = isEqualOrParent(uri, a.rootUri!);
		const bIsParent = isEqualOrParent(uri, b.rootUri!);

		if (aIsParent && bIsParent) {
			return a.rootUri!.fsPath.length - b.rootUri!.fsPath.length;
		} else if (aIsParent) {
			return -1;
		} else if (bIsParent) {
			return 1;
		} else {
			return 0;
		}
	};
}

export class QuickDiffService implements IQuickDiffService {
	declare readonly _serviceBrand: undefined;

	private quickDiffProviders: Set<QuickDiffProvider> = new Set();

	addQuickDiffProvider(quickDiff: QuickDiffProvider): IDisposable {
		this.quickDiffProviders.add(quickDiff);
		return {
			dispose: () => {
				this.quickDiffProviders.delete(quickDiff);
			}
		};
	}

	private isQuickDiff(diff: { originalResource: URI | null; label: string }): diff is QuickDiff {
		return !!diff.originalResource;
	}

	async getQuickDiffs(uri: URI, language: string = '', isSynchronized: boolean = false): Promise<QuickDiff[]> {
		const sorted = Array.from(this.quickDiffProviders).sort(createProviderComparer(uri));

		const diffs = await Promise.all(Array.from(sorted.values()).map(async (provider) => {
			const scoreValue = provider.selector ? score(provider.selector, uri, language, isSynchronized, undefined, undefined) : 10;
			const diff = {
				originalResource: scoreValue > 0 ? await provider.getOriginalResource(uri) : null,
				label: provider.label
			};
			return diff;
		}));
		return diffs.filter<QuickDiff>(this.isQuickDiff);
	}
}
