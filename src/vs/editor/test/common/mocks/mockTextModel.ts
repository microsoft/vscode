/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { ITextModel } from '../../../common/model.js';
import { LineEditSource, ILineEditSourcesChangedEvent } from '../../../common/lineEditSource.js';
import { mock } from '../../../../base/test/common/mock.js';

/**
 * A simple mock text model that always returns Undetermined for line edit sources.
 * This is useful for test cases that don't need actual line edit tracking.
 */
export class MockTextModel extends mock<ITextModel>() {
	override getLineEditSource(lineNumber: number): LineEditSource {
		return LineEditSource.Undetermined;
	}

	override getAllLineEditSources(): Map<number, LineEditSource> {
		return new Map();
	}

	override onDidChangeLineEditSources: Event<ILineEditSourcesChangedEvent> = Event.None;
}
