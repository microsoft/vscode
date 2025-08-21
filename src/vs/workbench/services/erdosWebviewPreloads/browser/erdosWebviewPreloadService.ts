/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IErdosPlotClient } from '../../erdosPlots/common/erdosPlots.js';
import { IErdosNotebookInstance } from '../../erdosNotebook/browser/IErdosNotebookInstance.js';

export const ERDOS_HOLOVIEWS_ID = 'erdosWebviewPreloadService';

export const IErdosWebviewPreloadService = createDecorator<IErdosWebviewPreloadService>(ERDOS_HOLOVIEWS_ID);

export type NotebookPreloadOutputResults =
	| { preloadMessageType: 'preload' }
	| {
		preloadMessageType: 'display';
		webview: Promise<{
			readonly id: string;
			readonly sessionId: string;
			dispose(): void;
			readonly onDidRender: Event<void>;
		}>;
	};

export interface IErdosWebviewPreloadService {
	readonly _serviceBrand: undefined;

	initialize(): void;

	readonly onDidCreatePlot: Event<IErdosPlotClient>;

	sessionInfo(sessionId: string): { numberOfMessages: number } | null;

	attachNotebookInstance(instance: IErdosNotebookInstance): void;

	addNotebookOutput(
		opts:
			{
				instance: IErdosNotebookInstance;
				outputId: string;
				outputs: { mime: string; data: VSBuffer }[];
			}
	): NotebookPreloadOutputResults | undefined;
}
