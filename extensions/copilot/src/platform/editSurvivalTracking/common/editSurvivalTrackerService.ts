/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createDecorator as createServiceIdentifier, IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ILogService } from '../../log/common/logService';
import { EditCollector } from './editCollector';
import { EditComputer } from './editComputer';
import { EditSurvivalReporter, EditSurvivalResult } from './editSurvivalReporter';

export const IEditSurvivalTrackerService = createServiceIdentifier<IEditSurvivalTrackerService>('IEditSurvivalTrackerService');

export interface IEditSurvivalTrackingSession {
	collectAIEdits(textEdit: vscode.TextEdit | vscode.TextEdit[]): void;
	startReporter(sendTelemetryEvent: (res: EditSurvivalResult) => void): void;
	cancel(): void;
}

export interface IEditSurvivalTrackerService {
	readonly _serviceBrand: undefined;
	initialize(document: vscode.TextDocument): IEditSurvivalTrackingSession;
}

export class NullEditSurvivalTrackingSession implements IEditSurvivalTrackingSession {
	collectAIEdits() { }
	startReporter() { }
	cancel() { }
}

export class NullEditSurvivalTrackerService implements IEditSurvivalTrackerService {
	readonly _serviceBrand: undefined;

	initialize(document: vscode.TextDocument): IEditSurvivalTrackingSession {
		return new NullEditSurvivalTrackingSession();
	}
}

export class EditSurvivalTrackerService implements IEditSurvivalTrackerService {
	readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService
	) {
	}

	initialize(document: vscode.TextDocument): IEditSurvivalTrackingSession {
		const editCollector = this._instantiationService.createInstance(EditCollector, document.getText());
		let reporter: EditSurvivalReporter | undefined;
		return {
			collectAIEdits: (edits: vscode.TextEdit | vscode.TextEdit[]) => {
				try {
					editCollector.addEdits(Array.isArray(edits) ? edits : [edits]);
				} catch (error) {
					this._logService.error('[EditSurvivalTrackerService] Error while collecting edits', error);
				}
			},
			startReporter: (sendTelemetryEvent: (res: EditSurvivalResult) => void) => {
				const userEditComputer = this._instantiationService.createInstance(EditComputer, editCollector.getText(), document);
				(async () => {
					try {
						const [aiEdits, userEditsResult] = await Promise.all([editCollector.getEdits(), userEditComputer.compute()]);
						const userEdits = userEditsResult.getEditsSinceInitial();
						reporter = this._instantiationService.createInstance(EditSurvivalReporter, document, editCollector.initialText, aiEdits, userEdits, {}, sendTelemetryEvent);
					} finally {
						userEditComputer.dispose();
					}
				})();
			},
			cancel: () => {
				reporter?.cancel();
			}
		};
	}
}
