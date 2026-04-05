/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test-workbench_change - new file
// TSCode Welcome Page - Custom welcome page based on GettingStartedPage

import { GettingStartedPage } from './gettingStarted.js';
import { TscodeWelcomeInput } from './tscodeWelcomeInput.js';
import { IEditorSerializer, IEditorOpenContext } from '../../../common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { $ } from '../../../../base/browser/dom.js';
import { GettingStartedEditorOptions, GettingStartedInput } from './gettingStartedInput.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

export class TscodeWelcomePage extends GettingStartedPage {
	// Note: Cannot override parent class static ID, so we use a different ID during registration
	private parentElement?: HTMLElement;
	private iconAdded = false;

	protected override createEditor(parent: HTMLElement): void {
		super.createEditor(parent);
		this.parentElement = parent;
		// Add custom styling for TSCode welcome page
		parent.classList.add('tscode-welcome');
	}

	override async setInput(newInput: GettingStartedInput, options: GettingStartedEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		// Call parent implementation first
		await super.setInput(newInput, options, context, token);

		// Add icon after categories slide is built
		if (!this.iconAdded && this.parentElement) {
			// Use setTimeout to ensure DOM is fully rendered
			setTimeout(() => this.addProductIconToDOM(), 50);
		}
	}

	private findProductNameElement(element: HTMLElement): HTMLElement | null {
		// Recursively search for h1 element with product-name class
		if (element.tagName === 'H1' && element.classList.contains('product-name')) {
			return element;
		}

		for (let i = 0; i < element.children.length; i++) {
			const child = element.children[i] as HTMLElement;
			const found = this.findProductNameElement(child);
			if (found) {
				return found;
			}
		}

		return null;
	}

	private addProductIconToDOM(): void {
		if (!this.parentElement || this.iconAdded) {
			return;
		}

		const productNameElement = this.findProductNameElement(this.parentElement);

		if (productNameElement && !productNameElement.classList.contains('icon-added')) {
			productNameElement.classList.add('icon-added');
			this.iconAdded = true;

			const svgIcon = `<svg viewBox="-4 -4 32 32" style="width:32px;height:32px;overflow:visible;vertical-align:middle;margin-right:12px;display:inline-block;" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg8-tscode" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4fc3f7"/><stop offset="50%" stop-color="#2979ff"/><stop offset="100%" stop-color="#69f0ae"/></linearGradient><filter id="glow-tscode"><feGaussianBlur stdDeviation="0.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><style>@keyframes eye-shift-tscode {0%   { transform: translateX(-3px); }30%  { transform: translateX(-3px); }50%  { transform: translateX(3px); }80%  { transform: translateX(3px); }100% { transform: translateX(-3px); }}@keyframes ring-pulse-tscode {0%, 100% { r: 12.75; opacity: 0.6; stroke-width: 1.5; }50%       { r: 14;    opacity: 1;   stroke-width: 1.5; }}@keyframes ring-pulse-bg-tscode {0%, 100% { r: 12.75; opacity: 0.2; stroke-width: 3; }50%       { r: 14.5;  opacity: 0.5; stroke-width: 3; }}.thinking-eye-tscode  { animation: eye-shift-tscode 2.0s ease-in-out infinite; }.glow-ring-tscode     { animation: ring-pulse-tscode 2.0s ease-in-out infinite; filter: url(#glow-tscode); }.glow-ring-bg-tscode  { animation: ring-pulse-bg-tscode 2.0s ease-in-out infinite; }</style></defs><circle cx="12" cy="12" r="12" fill="#e8f4ff"/><circle class="glow-ring-bg-tscode" cx="12" cy="12" r="12.75" fill="none" stroke="url(#bg8-tscode)" stroke-width="2" opacity="0.2"/><circle class="glow-ring-tscode"    cx="12" cy="12" r="12.75" fill="none" stroke="url(#bg8-tscode)" stroke-width="1.5"/><g class="thinking-eye-tscode"><ellipse cx="9"  cy="9.33" rx="1.63" ry="2.62" fill="#2979ff"/><ellipse cx="15" cy="9.33" rx="1.63" ry="2.62" fill="#2979ff"/></g></svg>`;

			const iconSpan = $('span.product-icon');
			iconSpan.innerHTML = svgIcon;

			// Insert icon before the text content
			const textContent = productNameElement.textContent;
			productNameElement.textContent = '';
			productNameElement.appendChild(iconSpan);
			productNameElement.appendChild(document.createTextNode(textContent || ''));

			// Add flex display to align icon and text
			productNameElement.style.display = 'flex';
			productNameElement.style.alignItems = 'center';
		}
	}
}

export class TscodeWelcomeInputSerializer implements IEditorSerializer {
	public canSerialize(_editorInput: TscodeWelcomeInput): boolean {
		return true;
	}

	public serialize(editorInput: TscodeWelcomeInput): string {
		return JSON.stringify({ selectedCategory: editorInput.selectedCategory, selectedStep: editorInput.selectedStep });
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): TscodeWelcomeInput {
		return instantiationService.invokeFunction(_accessor => {
			try {
				const { selectedCategory, selectedStep } = JSON.parse(serializedEditorInput);
				return new TscodeWelcomeInput({ selectedCategory, selectedStep });
			} catch { }
			return new TscodeWelcomeInput({});
		});
	}
}
