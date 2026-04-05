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

			// Create SVG element using DOM API instead of innerHTML
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('viewBox', '-4 -4 32 32');
			svg.setAttribute('style', 'width:80px;height:80px;overflow:visible;vertical-align:middle;margin-right:12px;display:inline-block;');

			// Create defs
			const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

			// Create gradient
			const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
			gradient.setAttribute('id', 'bg8-tscode');
			gradient.setAttribute('x1', '0%');
			gradient.setAttribute('y1', '0%');
			gradient.setAttribute('x2', '100%');
			gradient.setAttribute('y2', '100%');

			const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
			stop1.setAttribute('offset', '0%');
			stop1.setAttribute('stop-color', '#4fc3f7');
			gradient.appendChild(stop1);

			const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
			stop2.setAttribute('offset', '50%');
			stop2.setAttribute('stop-color', '#2979ff');
			gradient.appendChild(stop2);

			const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
			stop3.setAttribute('offset', '100%');
			stop3.setAttribute('stop-color', '#69f0ae');
			gradient.appendChild(stop3);

			defs.appendChild(gradient);

			// Create filter
			const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
			filter.setAttribute('id', 'glow-tscode');

			const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
			feGaussianBlur.setAttribute('stdDeviation', '0.8');
			feGaussianBlur.setAttribute('result', 'blur');
			filter.appendChild(feGaussianBlur);

			const feMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
			const feMergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
			feMergeNode1.setAttribute('in', 'blur');
			const feMergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
			feMergeNode2.setAttribute('in', 'SourceGraphic');
			feMerge.appendChild(feMergeNode1);
			feMerge.appendChild(feMergeNode2);
			filter.appendChild(feMerge);

			defs.appendChild(filter);

			// Create style
			const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
			style.textContent = `
				@keyframes eye-shift-tscode {
					0%   { transform: translateX(-3px); }
					30%  { transform: translateX(-3px); }
					50%  { transform: translateX(3px); }
					80%  { transform: translateX(3px); }
					100% { transform: translateX(-3px); }
				}
				@keyframes ring-pulse-tscode {
					0%, 100% { r: 12.75; opacity: 0.6; stroke-width: 1.5; }
					50%       { r: 14;    opacity: 1;   stroke-width: 1.5; }
				}
				@keyframes ring-pulse-bg-tscode {
					0%, 100% { r: 12.75; opacity: 0.2; stroke-width: 3; }
					50%       { r: 14.5;  opacity: 0.5; stroke-width: 3; }
				}
				.thinking-eye-tscode  { animation: eye-shift-tscode 2.0s ease-in-out infinite; }
				.glow-ring-tscode     { animation: ring-pulse-tscode 2.0s ease-in-out infinite; filter: url(#glow-tscode); }
				.glow-ring-bg-tscode  { animation: ring-pulse-bg-tscode 2.0s ease-in-out infinite; }
			`;
			defs.appendChild(style);

			svg.appendChild(defs);

			// Create background circle
			const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			bgCircle.setAttribute('cx', '12');
			bgCircle.setAttribute('cy', '12');
			bgCircle.setAttribute('r', '12');
			bgCircle.setAttribute('fill', '#e8f4ff');
			svg.appendChild(bgCircle);

			// Create glow ring background
			const glowRingBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			glowRingBg.setAttribute('class', 'glow-ring-bg-tscode');
			glowRingBg.setAttribute('cx', '12');
			glowRingBg.setAttribute('cy', '12');
			glowRingBg.setAttribute('r', '12.75');
			glowRingBg.setAttribute('fill', 'none');
			glowRingBg.setAttribute('stroke', 'url(#bg8-tscode)');
			glowRingBg.setAttribute('stroke-width', '2');
			glowRingBg.setAttribute('opacity', '0.2');
			svg.appendChild(glowRingBg);

			// Create glow ring
			const glowRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			glowRing.setAttribute('class', 'glow-ring-tscode');
			glowRing.setAttribute('cx', '12');
			glowRing.setAttribute('cy', '12');
			glowRing.setAttribute('r', '12.75');
			glowRing.setAttribute('fill', 'none');
			glowRing.setAttribute('stroke', 'url(#bg8-tscode)');
			glowRing.setAttribute('stroke-width', '1.5');
			svg.appendChild(glowRing);

			// Create eyes group
			const eyesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			eyesGroup.setAttribute('class', 'thinking-eye-tscode');

			const leftEye = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
			leftEye.setAttribute('cx', '9');
			leftEye.setAttribute('cy', '9.33');
			leftEye.setAttribute('rx', '1.63');
			leftEye.setAttribute('ry', '2.62');
			leftEye.setAttribute('fill', '#2979ff');
			eyesGroup.appendChild(leftEye);

			const rightEye = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
			rightEye.setAttribute('cx', '15');
			rightEye.setAttribute('cy', '9.33');
			rightEye.setAttribute('rx', '1.63');
			rightEye.setAttribute('ry', '2.62');
			rightEye.setAttribute('fill', '#2979ff');
			eyesGroup.appendChild(rightEye);

			svg.appendChild(eyesGroup);

			// Create icon container
			const iconSpan = $('span.product-icon');
			iconSpan.appendChild(svg);

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
