/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IFileDecorationsService } from 'vs/workbench/services/fileDecorations/browser/fileDecorations';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ISCMService, ISCMRepository } from 'vs/workbench/services/scm/common/scm';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';

export class FileDecorations implements IWorkbenchContribution {

	private readonly _disposables: IDisposable[];
	// private readonly _type: DecorationType;
	private readonly _repositoryListeners = new Map<ISCMRepository, IDisposable>();

	constructor(
		@IFileDecorationsService private _decorationsService: IFileDecorationsService,
		@ISCMService private _scmService: ISCMService,
	) {
		this._scmService.repositories.forEach(this._onDidAddRepository, this);
		this._disposables = [
			this._scmService.onDidAddRepository(this._onDidAddRepository, this),
			this._scmService.onDidRemoveRepository(this._onDidRemoveRepository, this),
		];
	}

	dispose(): void {
		dispose(this._disposables);
	}

	private _onDidAddRepository(repo: ISCMRepository): void {
		const type = this._decorationsService.registerDecorationType(repo.provider.label);
		const { provider } = repo;

		let oldDecorations = new Map<string, URI>();
		const listener = provider.onDidChangeResources(() => {

			let newDecorations = new Map<string, URI>();
			for (const group of provider.resources) {

				for (const resource of group.resourceCollection.resources) {
					if (!resource.decorations.color) {
						continue;
					}

					this._decorationsService.setFileDecoration(type, resource.sourceUri, {
						severity: Severity.Info,
						message: resource.decorations.tooltip,
						color: resource.decorations.color
					});
					newDecorations.set(resource.sourceUri.toString(), resource.sourceUri);
				}
			}

			oldDecorations.forEach((value, key) => {
				if (!newDecorations.has(key)) {
					this._decorationsService.unsetFileDecoration(type, value);
				}
			});

			oldDecorations = newDecorations;
		});

		this._repositoryListeners.set(repo, {
			dispose() {
				listener.dispose();
				type.dispose();
			}
		});
	}

	private _onDidRemoveRepository(repo: ISCMRepository): void {
		let listener = this._repositoryListeners.get(repo);
		if (listener) {
			this._repositoryListeners.delete(repo);
			listener.dispose();
		}
	}


	getId(): string {
		throw new Error('smc.SCMFileDecorations');
	}

}
