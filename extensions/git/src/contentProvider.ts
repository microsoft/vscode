/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { workspace, Uri, Disposable, Event, EventEmitter } from 'vscode';
import { debounce, throttle } from './decorators';
import { Model } from './model';

export class GitContentProvider {

	private disposables: Disposable[] = [];

	private onDidChangeEmitter = new EventEmitter<Uri>();
	get onDidChange(): Event<Uri> { return this.onDidChangeEmitter.event; }

	private uris: { [uri: string]: Uri } = Object.create(null) as { [uri: string]: Uri };

	constructor(private model: Model) {
		this.disposables.push(
			model.onDidChangeRepository(this.eventuallyFireChangeEvents, this),
			workspace.registerTextDocumentContentProvider('git', this)
		);
	}

	@debounce(1100)
	private eventuallyFireChangeEvents(): void {
		this.fireChangeEvents();
	}

	@throttle
	private async fireChangeEvents(): Promise<void> {
		await this.model.whenIdle();

		Object.keys(this.uris).forEach(key => {
			this.onDidChangeEmitter.fire(this.uris[key]);
		});
	}

	async provideTextDocumentContent(uri: Uri): Promise<string> {
		let ref = uri.query;

		if (ref === '~') {
			const fileUri = uri.with({ scheme: 'file', query: '' });
			const uriString = fileUri.toString();
			const [indexStatus] = this.model.indexGroup.resources.filter(r => r.original.toString() === uriString);
			ref = indexStatus ? '' : 'HEAD';
		}

		try {
			const result = await this.model.show(ref, uri);
			this.uris[uri.toString()] = uri;
			return result;
		} catch (err) {
			delete this.uris[uri.toString()];
			return '';
		}
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}