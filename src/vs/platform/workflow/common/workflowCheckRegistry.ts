/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IWorkflowCheck, IWorkflowCheckRegistry } from './workflow.js';

export class WorkflowCheckRegistry extends Disposable implements IWorkflowCheckRegistry {
	private readonly checks = new Map<string, IWorkflowCheck>();

	register(check: IWorkflowCheck): IDisposable {
		if (this._store.isDisposed) {
			throw new Error(localize('workflow.registryDisposed', "The workflow check registry has been disposed."));
		}
		if (!check.id || this.checks.has(check.id)) {
			throw new Error(localize('workflow.duplicateCheck', "Workflow check '{0}' is already registered or has an invalid identifier.", check.id));
		}
		this.checks.set(check.id, check);
		return toDisposable(() => {
			if (this.checks.get(check.id) === check) {
				this.checks.delete(check.id);
			}
		});
	}

	get(id: string): IWorkflowCheck | undefined {
		return this.checks.get(id);
	}

	override dispose(): void {
		this.checks.clear();
		super.dispose();
	}
}
