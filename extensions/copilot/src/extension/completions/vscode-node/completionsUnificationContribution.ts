/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { languages } from 'vscode';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, DebugOwner, observableFromEvent } from '../../../util/vs/base/common/observableInternal';

export class CompletionsUnificationContribution extends Disposable {

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		const unificationState = unificationStateObservable(this);

		this._register(autorun(reader => {
			const state = unificationState.read(reader);
			telemetryService.setAdditionalExpAssignments(state?.expAssignments ?? []);
		}));
	}
}

export function unificationStateObservable(owner: DebugOwner) {
	return observableFromEvent(
		owner,
		l => (languages as languagesMaybeWithUnification).onDidChangeCompletionsUnificationState?.(l) ?? Disposable.None,
		() => (languages as languagesMaybeWithUnification).inlineCompletionsUnificationState
	);
}

interface languagesMaybeWithUnification {
	readonly inlineCompletionsUnificationState?: InlineCompletionsUnificationState;
	readonly onDidChangeCompletionsUnificationState?: Event<void>;
}

interface InlineCompletionsUnificationState {
	codeUnification: boolean;
	modelUnification: boolean;
	extensionUnification: boolean;
	expAssignments: string[];
}
