/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessagePoster } from './messaging';
import { PreviewSettings } from './settings';
import { getStrings } from './strings';

export class CodeBlockManager {
	private _messaging?: MessagePoster;

	constructor(private readonly _settings: PreviewSettings) { }

	public setPoster(poster: MessagePoster) {
		this._messaging = poster;
	}

	public initializeCodeBlocks() {
		const shellBlocks = document.querySelectorAll('pre:has(.code-line)');
		shellBlocks.forEach(pre => {
			this._initializeCodeBlock(pre);
		});
	}

	private _initializeCodeBlock(pre: Element) {
		if (pre.parentElement?.classList.contains('code-block-wrapper')) {
			return;
		}
		const wrapper = document.createElement('div');
		wrapper.className = 'code-block-wrapper';
		pre.parentElement?.replaceChild(wrapper, pre);
		wrapper.appendChild(pre);

		const buttonsContainer = document.createElement('div');
		buttonsContainer.className = 'code-block-buttons';

		const createClickHandler = (messageType: 'copyText' | 'runInTerminal', parameterName: string) => (e: MouseEvent) => {
			e.preventDefault();
			const currentText = pre.querySelector('.code-line')?.textContent ?? '';
			this._messaging!.postMessage(messageType, {
				[parameterName]: currentText
			});
		};

		const strings = getStrings();

		this._createButton(buttonsContainer, {
			title: strings.codeBlockCopyAction,
			icon: 'copy',
			onClick: createClickHandler('copyText', 'text')
		});

		if (this._shouldAllowRunInTerminal(pre)) {
			this._createButton(buttonsContainer, {
				title: strings.codeBlockRunAction,
				icon: 'terminal',
				onClick: createClickHandler('runInTerminal', 'command')
			});
		}

		wrapper.appendChild(buttonsContainer);
	}

	private _shouldAllowRunInTerminal(pre: Element) {
		return pre.querySelector('.language-shell') !== null && this._settings.allowScriptExecution;
	}

	private _createButton(container: HTMLElement, options: { title: string; icon: string; onClick: (e: MouseEvent) => void }) {
		const button = document.createElement('button');
		button.className = 'terminal-button';
		button.title = options.title;
		button.innerHTML = `<i class="codicon codicon-${options.icon}"></i>`;
		button.addEventListener('click', options.onClick);
		container.appendChild(button);
		return button;
	}
}
