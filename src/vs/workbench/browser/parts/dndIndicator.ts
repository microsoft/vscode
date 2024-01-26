/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TODO@benibenj Move file to correct location

import 'vs/css!./media/dndIndicator';
import { append } from 'vs/base/browser/dom';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { TAB_Drag_And_Drop_Between_Indicator } from 'vs/workbench/common/theme';

export class DndBetweenIndicator {

	private _beforeIndicatorContainer: HTMLElement | undefined;
	private get beforeIndicatorContainer(): HTMLElement {
		// Lazily create dom elements
		if (!this._beforeIndicatorContainer) {
			this._beforeIndicatorContainer = append(this.container, this.creatIndicator());
			this._beforeIndicatorContainer.classList.add('dnd-indicator-left');
		}
		return this._beforeIndicatorContainer;
	}

	private _afterIndicatorContainer: HTMLElement | undefined;
	private get afterIndicatorContainer(): HTMLElement {
		// Lazily create dom elements
		if (!this._afterIndicatorContainer) {
			this._afterIndicatorContainer = append(this.container, this.creatIndicator());
			this._afterIndicatorContainer.classList.add('dnd-indicator-right');
		}
		return this._afterIndicatorContainer;
	}

	private indicatorOffsetContainerTop!: number;

	constructor(private readonly container: HTMLElement, containerHeight: number, private indicatorHeight: number) {
		this.setIndicatorOffset(containerHeight, indicatorHeight);
	}

	private creatIndicator(): HTMLElement {
		const indicatorContainer = document.createElement('div');
		indicatorContainer.classList.add('dnd-indicator-container');
		indicatorContainer.style.height = `${this.indicatorHeight}px`;

		const bar = append(indicatorContainer, document.createElement('div'));
		bar.style.height = `${this.indicatorHeight}px`;
		bar.classList.add('dnd-indicator-bar');

		const trinagleTopLeft = append(indicatorContainer, document.createElement('div'));
		const trinagleBottomLeft = append(indicatorContainer, document.createElement('div'));
		trinagleTopLeft.classList.add('dnd-indicator-top');
		trinagleBottomLeft.classList.add('dnd-indicator-bottom');

		return indicatorContainer;
	}

	public updateHeights(containerHeight: number, indicatorHeight: number): void {
		// Does not change the height of the already rendered indicators
		// Indicator should be removed and reset if the height changes
		// hide() -> updateHeights() -> setBetween()

		this.indicatorHeight = indicatorHeight;

		this.setIndicatorOffset(containerHeight, indicatorHeight);
	}

	private setIndicatorOffset(containerHeight: number, indicatorHeight: number): void {
		this.indicatorOffsetContainerTop = (containerHeight - indicatorHeight) / 2;
	}

	public setBetween(before: HTMLElement | undefined, after: HTMLElement | undefined): void {
		this.set(
			before ? { top: before.offsetTop, left: before.offsetLeft + before.offsetWidth } : undefined,
			after ? { top: after.offsetTop, left: after.offsetLeft } : undefined
		);
	}

	public setBefore(element: HTMLElement, isFirstElement?: boolean): void {
		const position = { top: element.offsetTop, left: element.offsetLeft };
		this.set(!!isFirstElement ? undefined : position, position);
	}

	public setBeforeFirst(container: HTMLElement): void {
		this.set(
			undefined,
			{ top: container.offsetTop, left: container.offsetLeft }
		);
	}

	public setAfter(element: HTMLElement, isLastElement?: boolean): void {
		const position = { top: element.offsetTop, left: element.offsetLeft + element.offsetWidth };
		this.set(position, !!isLastElement ? undefined : position);
	}

	public setAfterLast(container: HTMLElement): void {
		const lastElement = container.lastElementChild as HTMLElement | null;
		if (lastElement === null) {
			throw new Error('Container has no children');
		}

		const endOfLast = { top: lastElement.offsetTop, left: lastElement.offsetLeft + lastElement.offsetWidth };

		this.set(endOfLast, endOfLast);
	}

	private set(before: { top: number; left: number } | undefined, after: { top: number; left: number } | undefined): void {
		this.beforeIndicatorContainer.style.display = before ? 'block' : 'none';
		this.afterIndicatorContainer.style.display = after ? 'block' : 'none';

		// If both indicators are located at the same position, we overlap the bars
		let overlapOffset = 0;
		if (before && after && before.left === after.left) {
			overlapOffset = 1;
		}

		if (before) {
			this.beforeIndicatorContainer.style.top = `${before.top + this.indicatorOffsetContainerTop}px`;
			this.beforeIndicatorContainer.style.left = `${before.left + overlapOffset}px`;
		}

		if (after) {
			this.afterIndicatorContainer.style.top = `${after.top + this.indicatorOffsetContainerTop}px`;
			this.afterIndicatorContainer.style.left = `${after.left}px`;
		}
	}

	public hide(): void {
		if (!this._beforeIndicatorContainer || !this._afterIndicatorContainer) {
			return;
		}

		this.container.removeChild(this._beforeIndicatorContainer);
		this.container.removeChild(this._afterIndicatorContainer);

		this._afterIndicatorContainer = undefined;
		this._beforeIndicatorContainer = undefined;
	}
}

// TODO: Color should be contributable by consumer

registerThemingParticipant((theme, collector) => {
	const dndIndicatorColor = theme.getColor(TAB_Drag_And_Drop_Between_Indicator);
	if (dndIndicatorColor) {
		// DnD Feedback

		collector.addRule(`
			.monaco-workbench .dnd-indicator-container .dnd-indicator-bar {
				background-color: ${dndIndicatorColor};
			}

			.monaco-workbench .dnd-indicator-container .dnd-indicator-top{
				border-top-color: ${dndIndicatorColor};
			}

			.monaco-workbench .dnd-indicator-container .dnd-indicator-bottom{
				border-bottom-color: ${dndIndicatorColor};
			}
		`);
	}

});
