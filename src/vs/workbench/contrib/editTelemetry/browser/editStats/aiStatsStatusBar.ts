/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { n } from '../../../../../base/browser/dom.js';
import { createHotClass } from '../../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IStatusbarService, StatusbarAlignment } from '../../../../services/statusbar/browser/statusbar.js';

export class AiStatsStatusBar extends Disposable {
	public static readonly hot = createHotClass(AiStatsStatusBar);

	constructor(
		aiRate: IObservable<number>,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
	) {
		super();

		this._register(autorun((reader) => {
			const container = n.div({
				style: {
					height: '100%',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
				}
			}, [
				n.div(
					{
						class: 'ai-stats-status-bar',
						style: {
							display: 'flex',
							flexDirection: 'column',

							width: 50,
							height: 10,

							borderRadius: 6,
							border: '1.5px solid var(--vscode-statusBar-foreground)',
						}
					},
					[
						n.div({
							style: {
								flex: 1,

								display: 'flex',
								overflow: 'hidden',

								borderRadius: 6,
								border: '2px solid transparent',
							}
						}, [
							n.div({
								style: {
									width: aiRate.map(v => `${v * 100}%`),
									backgroundColor: 'var(--vscode-statusBar-foreground)',
								}
							})
						])
					]
				)
			]).keepUpdated(reader.store);


			reader.store.add(this._statusbarService.addEntry({
				name: localize('inlineSuggestions', "Inline Suggestions"),
				ariaLabel: localize('inlineSuggestionsStatusBar', "Inline suggestions status bar"),
				text: '',
				content: container.element,
			}, 'aiStatsStatusBar', StatusbarAlignment.RIGHT, 100));
		}));
	}
}
