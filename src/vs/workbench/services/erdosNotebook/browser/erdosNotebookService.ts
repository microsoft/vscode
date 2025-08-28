/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IErdosNotebookInstance } from './IErdosNotebookInstance.js';
import { usingErdosNotebooks as utilUsingErdosNotebooks } from '../common/erdosNotebookUtils.js';

export const IErdosNotebookService = createDecorator<IErdosNotebookService>('erdosNotebookService');
export interface IErdosNotebookService {
	readonly _serviceBrand: undefined;

	initialize(): void;

	getInstances(): Set<IErdosNotebookInstance>;

	getActiveInstance(): IErdosNotebookInstance | null;

	registerInstance(instance: IErdosNotebookInstance): void;

	unregisterInstance(instance: IErdosNotebookInstance): void;

	getInstance(resource: URI): IErdosNotebookInstance | undefined;

	usingErdosNotebooks(): boolean;
}

class ErdosNotebookService extends Disposable implements IErdosNotebookService {

	_serviceBrand: undefined;

	private _instances = new Set<IErdosNotebookInstance>();
	private _activeInstance: IErdosNotebookInstance | null = null;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
	}

	public override dispose(): void {
		super.dispose();
	}

	public initialize(): void {
	}

	public getInstances(): Set<IErdosNotebookInstance> {
		return this._instances;
	}

	public getActiveInstance(): IErdosNotebookInstance | null {
		return this._activeInstance;
	}

	public registerInstance(instance: IErdosNotebookInstance): void {
		if (!this._instances.has(instance)) {
			this._instances.add(instance);
		}
		this._activeInstance = instance;
	}

	public unregisterInstance(instance: IErdosNotebookInstance): void {
		this._instances.delete(instance);
		if (this._activeInstance === instance) {
			this._activeInstance = null;
		}
	}

	public getInstance(resource: URI): IErdosNotebookInstance | undefined {
		for (const instance of this._instances) {
			if (instance.uri.toString() === resource.toString()) {
				return instance;
			}
		}
		return undefined;
	}

	public usingErdosNotebooks(): boolean {
		return utilUsingErdosNotebooks(this._configurationService);
	}
}

registerSingleton(IErdosNotebookService, ErdosNotebookService, InstantiationType.Delayed);
