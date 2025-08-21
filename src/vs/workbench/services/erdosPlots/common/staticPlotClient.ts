/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ILanguageRuntimeMessageOutput } from '../../languageRuntime/common/languageRuntimeService.js';
import { createSuggestedFileNameForPlot, IErdosPlotClient, IZoomablePlotClient, ZoomLevel, IExtendedErdosPlotMetadata } from './erdosPlots.js';

export class StaticPlotClient extends Disposable implements IErdosPlotClient, IZoomablePlotClient {
	public readonly metadata: IExtendedErdosPlotMetadata;
	public readonly mimeType;
	public readonly data;
	public readonly code?: string;

	public onDidChangeZoomLevel: Event<ZoomLevel>;

	private readonly _zoomLevelEventEmitter = new Emitter<ZoomLevel>();

	static fromMetadata(storageService: IStorageService, metadata: IExtendedErdosPlotMetadata, mimeType: string, data: string): StaticPlotClient {
		return new StaticPlotClient(storageService, metadata.session_id, metadata, mimeType, data);
	}

	static fromMessage(storageService: IStorageService, sessionId: string, message: ILanguageRuntimeMessageOutput, code?: string): StaticPlotClient {
		const metadata = {
			id: message.id,
			parent_id: message.parent_id,
			created: Date.parse(message.when),
			session_id: sessionId,
			code: code ? code : '',
			suggested_file_name: createSuggestedFileNameForPlot(storageService),
			output_id: message.output_id,
			zoom_level: ZoomLevel.Fit,
		};

		const imageKey = Object.keys(message.data).find(key => key.startsWith('image/'));
		if (!imageKey) {
			throw new Error(`No image/ MIME type found in message data. ` +
				`Found MIME types: ${Object.keys(message.data).join(', ')}`);
		}
		const data = message.data[imageKey];
		if (typeof data !== 'string') {
			throw new Error(`Expected string data for MIME ${imageKey}, got: ${typeof data}`);
		}

		const mimeType = imageKey;

		return new StaticPlotClient(storageService, sessionId, metadata, mimeType, data);
	}

	private constructor(storageService: IStorageService, sessionId: string, metadata: IExtendedErdosPlotMetadata, mimeType: string, data: string) {
		super();

		this.metadata = metadata;
		this.mimeType = mimeType;
		this.data = data;
		this.code = metadata.code;

		this.onDidChangeZoomLevel = this._zoomLevelEventEmitter.event;
	}

	get uri() {
		if (this.mimeType === 'image/svg+xml') {
			const svgData = encodeURIComponent(this.data);
			return `data:${this.mimeType};utf8,${svgData}`;
		}
		return `data:${this.mimeType};base64,${this.data}`;
	}

	get id() {
		return this.metadata.id;
	}

	set zoomLevel(zoom: ZoomLevel) {
		if (this.metadata.zoom_level !== zoom) {
			this.metadata.zoom_level = zoom;
			this._zoomLevelEventEmitter.fire(zoom);
		}
	}

	get zoomLevel(): ZoomLevel {
		return this.metadata.zoom_level ?? ZoomLevel.Fit;
	}
}
