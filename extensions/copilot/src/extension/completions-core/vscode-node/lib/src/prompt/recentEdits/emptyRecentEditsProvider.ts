/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICompletionsRecentEditsProviderService } from './recentEditsProvider';
import { RecentEdit } from './recentEditsReducer';

export class EmptyRecentEditsProvider implements ICompletionsRecentEditsProviderService {
	declare _serviceBrand: undefined;
	isEnabled(): boolean {
		return false;
	}

	start(): void {
		return;
	}

	getRecentEdits(): RecentEdit[] {
		return [];
	}

	getEditSummary(edit: RecentEdit): string | null {
		return null;
	}
}
