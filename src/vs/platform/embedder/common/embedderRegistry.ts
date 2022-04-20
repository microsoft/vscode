/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservableValue } from 'vs/base/common/observableValue';
import { URI } from 'vs/base/common/uri';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LogLevel } from 'vs/platform/log/common/log';
import { IProgress, IProgressCompositeOptions, IProgressDialogOptions, IProgressNotificationOptions, IProgressOptions, IProgressStep, IProgressWindowOptions } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';

export const Extensions = {
	EmbedderApiContrib: 'workbench.web.embedder.api.contrib'
};

export interface IEmbedderApi {
	commands: {
		executeCommand(command: string, ...args: any[]): Promise<unknown>;
	};

	progress: {
		withProgress<R>(
			options: IProgressOptions | IProgressDialogOptions | IProgressNotificationOptions | IProgressWindowOptions | IProgressCompositeOptions,
			task: (progress: IProgress<IProgressStep>) => Promise<R>
		): Promise<R>;
	};

	logger: {
		log(id: string, level: LogLevel, message: string): Promise<void>;
	};

	product: {
		getUriScheme(): Promise<string>;
	};

	timer: {
		retrievePerformanceMarks(): Promise<[string, readonly PerformanceMark[]][]>;
	};

	telemetry: {
		readonly telemetryLevel: IObservableValue<TelemetryLevel>;
	};

	opener: {
		openUri(target: URI): Promise<boolean>;
	};

	lifecycle: {
		shutdown: () => Promise<void>;
	};
}

type IEmbedderApiKey = keyof IEmbedderApi & string;

export interface IEmbedderApiRegistry {
	/**
	 * Registers contribution for the Embedder API available to vscode-dev consumers
	 */
	register<T extends IEmbedderApiKey>(key: T, descriptor: SyncDescriptor<IEmbedderApi[T]>): void;

	/**
	 * Get Embedder API for vscode-dev consumers
	 */
	get<T extends IEmbedderApiKey>(key: T, instantiationService: IInstantiationService): IEmbedderApi[T];
}

export class EmbedderApiRegistry implements IEmbedderApiRegistry {
	private _apiConstructors = new Map<IEmbedderApiKey, SyncDescriptor<IEmbedderApi[IEmbedderApiKey]>>();
	private _hydratedApis = new Map<IEmbedderApiKey, IEmbedderApi[IEmbedderApiKey]>();
	constructor() { }

	register<T extends IEmbedderApiKey>(key: T, descriptor: SyncDescriptor<IEmbedderApi[T]>): void {
		if (!this._apiConstructors.has(key)) {
			this._apiConstructors.set(key, descriptor);
		}
	}

	get<T extends IEmbedderApiKey>(key: T, instantiationService: IInstantiationService): IEmbedderApi[T] {
		if (this._hydratedApis.has(key)) {
			return this._hydratedApis.get(key)! as IEmbedderApi[T];
		} else if (this._apiConstructors.has(key)) {
			const api = instantiationService.createInstance(this._apiConstructors.get(key)!.ctor) as IEmbedderApi[T];
			this._hydratedApis.set(key, api);
			return api;
		}
		throw new Error(`Attempted to get API for ${key} before it was registered to EmbedderApiRegistry.`);
	}
}

Registry.add(Extensions.EmbedderApiContrib, new EmbedderApiRegistry());

