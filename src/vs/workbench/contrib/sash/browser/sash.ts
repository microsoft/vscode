/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createStyleSheet } from 'vs/base/browser/dom';
import { setSashSize, minSize, maxSize } from 'vs/base/browser/ui/sash/sash';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { isIPad } from 'vs/base/browser/browser';

export class SashSizeController extends Disposable implements IWorkbenchContribution {
	private readonly configurationName = 'workbench.sash.size';
	private stylesheet: HTMLStyleElement;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.stylesheet = createStyleSheet();
		this._register(toDisposable(() => this.stylesheet.parentElement!.removeChild(this.stylesheet)));

		const onDidChangeSizeConfiguration = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(this.configurationName));
		this._register(onDidChangeSizeConfiguration(this.onDidChangeSizeConfiguration, this));
		this.onDidChangeSizeConfiguration();
	}

	private onDidChangeSizeConfiguration(): void {
		const size = this.configurationService.getValue<number>(this.configurationName);

		if (!isIPad && size && size >= minSize && size <= maxSize) {
			// Update styles
			const styles: string[] = [];
			styles.push(`.monaco-sash.vertical { cursor: ew-resize; top: 0; width: ${size}px; height: 100%; }`);
			styles.push(`.monaco-sash.horizontal { cursor: ns-resize; left: 0; width: 100%; height: ${size}px; }`);
			styles.push(`.monaco-sash:not(.disabled).orthogonal-start::before, .monaco-sash:not(.disabled).orthogonal-end::after { content: ' '; height: ${size * 2}px; width: ${size * 2}px; z-index: 100; display: block; cursor: all-scroll; position: absolute; }`);
			styles.push(`.monaco-sash.orthogonal-start.vertical::before { left: -${size / 2}px; top: -${size}px; }`);
			styles.push(`.monaco-sash.orthogonal-end.vertical::after { left: -${size / 2}px; bottom: -${size}px; }`);
			styles.push(`.monaco-sash.orthogonal-start.horizontal::before { top: -${size / 2}px; left: -${size}px; }`);
			styles.push(`.monaco-sash.orthogonal-end.horizontal::after { top: -${size / 2}px; right: -${size}px; }`);

			this.stylesheet.innerHTML = styles.join('\n');

			// Update behavor
			setSashSize(size);
		}
	}
}
