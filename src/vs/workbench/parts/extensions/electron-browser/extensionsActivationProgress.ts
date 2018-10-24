/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IProgressService2, ProgressLocation } from 'vs/platform/progress/common/progress';
import { localize } from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';

export class ExtensionActivationProgress implements IWorkbenchContribution {

	private readonly _listener: IDisposable;

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IProgressService2 progressService: IProgressService2,
	) {

		const options = {
			location: ProgressLocation.Window,
			title: localize('activation', "Activating Extensions...")
		};

		this._listener = extensionService.onWillActivateByEvent(e => {
			progressService.withProgress(options, _ => e.activation);
		});
	}

	dispose(): void {
		this._listener.dispose();
	}
}
