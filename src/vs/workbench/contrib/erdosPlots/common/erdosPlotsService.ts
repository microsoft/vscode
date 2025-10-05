/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IErdosPlotMetadata } from '../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { ILanguageRuntimeMessageOutput } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';

export const ERDOS_PLOTS_VIEW_ID = 'workbench.panel.erdosPlots';
export const ERDOS_PLOTS_SERVICE_ID = 'erdosPlotsService';
export const IErdosPlotsService = createDecorator<IErdosPlotsService>(ERDOS_PLOTS_SERVICE_ID);

// ===== Plot Size and Sizing =====

export interface IPlotSize {
	height: number;
	width: number;
}

export class AutomaticPlotSizer {
	private static readonly GOLDEN_RATIO = 1.61803398875;
	private static readonly MINIMUM_SIZE = 400;

	public calculateOptimalSize(containerSize: IPlotSize): IPlotSize | undefined {
		const adjustedSize = containerSize;
		const aspectRatio = containerSize.width > containerSize.height ?
			containerSize.width / containerSize.height :
			containerSize.height / containerSize.width;

		if (aspectRatio > AutomaticPlotSizer.GOLDEN_RATIO) {
			if (containerSize.width > containerSize.height) {
				adjustedSize.width = containerSize.height * AutomaticPlotSizer.GOLDEN_RATIO;
			} else {
				adjustedSize.height = containerSize.width * AutomaticPlotSizer.GOLDEN_RATIO;
			}
		}

		if (adjustedSize.width > adjustedSize.height) {
			if (adjustedSize.width < AutomaticPlotSizer.MINIMUM_SIZE) {
				adjustedSize.width = AutomaticPlotSizer.MINIMUM_SIZE;
				adjustedSize.height = adjustedSize.width / AutomaticPlotSizer.GOLDEN_RATIO;
			}
		} else if (adjustedSize.height < AutomaticPlotSizer.MINIMUM_SIZE) {
			if (adjustedSize.height < AutomaticPlotSizer.MINIMUM_SIZE) {
				adjustedSize.height = AutomaticPlotSizer.MINIMUM_SIZE;
				adjustedSize.width = adjustedSize.height / AutomaticPlotSizer.GOLDEN_RATIO;
			}
		}

		adjustedSize.height = Math.floor(adjustedSize.height);
		adjustedSize.width = Math.floor(adjustedSize.width);
		return adjustedSize;
	}
}

// ===== Plot Client Types =====

export interface IErdosPlotClient extends IDisposable {
	readonly id: string;
	readonly metadata: IErdosPlotMetadata;
}

export class StaticPlotInstance extends Disposable implements IErdosPlotClient {
	public readonly metadata: IErdosPlotMetadata;
	public readonly mimeType;
	public readonly data;
	public readonly code?: string;

	static createFromMetadata(storageService: IStorageService, metadata: IErdosPlotMetadata, mimeType: string, data: string): StaticPlotInstance {
		return new StaticPlotInstance(storageService, metadata.session_id, metadata, mimeType, data);
	}

	static createFromRuntimeMessage(
		storageService: IStorageService,
		sessionId: string,
		message: ILanguageRuntimeMessageOutput,
		source_file?: string,
		source_type?: string,
		batch_id?: string,
		language?: string
	): StaticPlotInstance {
		const metadata: IErdosPlotMetadata = {
			id: message.id,
			parent_id: message.parent_id,
			created: Date.parse(message.when),
			session_id: sessionId,
			code: '',
			output_id: message.output_id,
			language,
			source_file,
			source_type,
			batch_id
		};

		const imageMimeType = Object.keys(message.data).find(key => key.startsWith('image/'));
		if (!imageMimeType) {
			throw new Error(`No image/ MIME type found in message data. Found MIME types: ${Object.keys(message.data).join(', ')}`);
		}
		const imageData = message.data[imageMimeType];
		if (typeof imageData !== 'string') {
			throw new Error(`Expected string data for MIME ${imageMimeType}, got: ${typeof imageData}`);
		}

		const mimeType = imageMimeType;
		return new StaticPlotInstance(storageService, sessionId, metadata, mimeType, imageData);
	}

	private constructor(storageService: IStorageService, sessionId: string, metadata: IErdosPlotMetadata, mimeType: string, data: string) {
		super();
		this.metadata = metadata;
		this.mimeType = mimeType;
		this.data = data;
		this.code = metadata.code;
	}

	get dataUri() {
		if (this.mimeType === 'image/svg+xml') {
			const encodedSvg = encodeURIComponent(this.data);
			return `data:${this.mimeType};utf8,${encodedSvg}`;
		}
		return `data:${this.mimeType};base64,${this.data}`;
	}

	get id() {
		return this.metadata.id;
	}
}

// ===== History =====

export interface IPlotHistoryGroup {
	readonly id: string;
	readonly source: string;
	readonly timestamp: number;
	readonly plotIds: string[];
	readonly sessionId: string;
	readonly language?: string;
	readonly sourceType: string;
	readonly batchId?: string;
}

// ===== Service Interface =====

export interface IErdosPlotsService {
	readonly _serviceBrand: undefined;
	readonly allPlots: IErdosPlotClient[];
	readonly activePlotId: string | undefined;
	readonly onPlotCreated: Event<IErdosPlotClient>;
	readonly onPlotActivated: Event<string>;
	readonly onPlotDeleted: Event<string>;
	readonly onPlotsReplaced: Event<IErdosPlotClient[]>;
	readonly onPlotMetadataChanged: Event<IErdosPlotClient>;
	activatePlot(id: string): void;
	activateNextPlot(): void;
	activatePreviousPlot(): void;
	deletePlot(id: string): void;
	deleteAllPlots(): void;
	modifyPlotMetadata(plotId: string, updates: Partial<IErdosPlotMetadata>): void;
	fetchPlotAtIndex(index: number): IErdosPlotClient | undefined;
	initialize(): void;
	readonly historyGroups: IPlotHistoryGroup[];
	readonly onHistoryChanged: Event<void>;
	fetchPlotsInGroup(groupId: string): IErdosPlotClient[];
}
