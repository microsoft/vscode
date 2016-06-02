/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/markers-statistics-widget';
import * as dom from 'vs/base/browser/dom';
import { MarkerStatistics } from 'vs/platform/markers/common/markers';
import { MarkersModel } from 'vs/workbench/parts/markers/common/markersModel';

export default class MarkerStatisticsWidget {

	private errorElement: HTMLElement;
	private warningElement: HTMLElement;
	private infoElement: HTMLElement;
	private labelElement: HTMLElement;

	constructor(container: HTMLElement, private short: boolean = true, private stats?: MarkerStatistics) {
		if (short) {
			let widget= dom.append(container, dom.emmet('.markers-statistics-widget'));
			this.errorElement = dom.append(widget, dom.emmet('.item-label-hidden'));
			this.warningElement = dom.append(widget, dom.emmet('.item-label-hidden'));
			this.infoElement = dom.append(widget, dom.emmet('.item-label-hidden'));
		} else {
			this.labelElement = dom.append(container, dom.emmet('span'));
		}
		if (this.stats) {
			this.setStatistics(stats);
		}
	}

	public setStatistics(stats: MarkerStatistics): void {
		this.stats = stats;
		this.render();
	}

	private render(): void {
		if (this.short) {
			dom.toggleClass(this.errorElement, 'item-label-hidden', this.stats.errors <= 0);
			dom.toggleClass(this.errorElement, 'item-label-error', this.stats.errors > 0);
			this.errorElement.innerHTML = '' + this.stats.errors;

			dom.toggleClass(this.warningElement, 'item-label-hidden', this.stats.warnings <= 0);
			dom.toggleClass(this.warningElement, 'item-label-warning', this.stats.warnings > 0);
			this.warningElement.innerHTML = '' + this.stats.warnings;

			dom.toggleClass(this.infoElement, 'item-label-hidden', this.stats.infos <= 0);
			dom.toggleClass(this.infoElement, 'item-label-info', this.stats.infos > 0);
			this.infoElement.innerHTML = '' + this.stats.infos;
		} else {
			this.labelElement.textContent = MarkersModel.getStatisticsLabel(this.stats);
		}
	}
}