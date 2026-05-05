/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IToolRiskAssessment, ToolRiskLevel } from '../../../tools/chatToolRiskAssessmentService.js';

import './media/toolRiskBadge.css';

const RISK_BADGE_CLASS = 'tool-risk-badge';

export class ToolRiskBadgeWidget extends Disposable {

	public readonly domNode: HTMLElement;

	private readonly _iconEl: HTMLElement;
	private readonly _textEl: HTMLElement;
	private readonly _hoverStore = this._register(new DisposableStore());

	constructor(
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();

		this.domNode = dom.$(`span.${RISK_BADGE_CLASS}`);
		this._iconEl = dom.$('span.tool-risk-icon');
		this._textEl = dom.$('span.tool-risk-text');
		this.domNode.append(this._iconEl, this._textEl);
		this.setLoading();
	}

	setLoading(): void {
		this._setVariant('loading');
		this._setIcon(ThemeIcon.modify(Codicon.loading, 'spin'));
		const text = localize('toolRisk.assessing', "Assessing risk\u2026");
		this._textEl.textContent = text;
		this._setHover(localize('toolRisk.assessingHover', "Generating a risk assessment for this tool call."));
	}

	setHidden(): void {
		this.domNode.style.display = 'none';
	}

	setAssessment(assessment: IToolRiskAssessment): void {
		switch (assessment.risk) {
			case ToolRiskLevel.Green:
				// Green: render the explanation neutrally — no warning icon, no color.
				this._setVariant('neutral');
				this._iconEl.className = 'tool-risk-icon';
				break;
			case ToolRiskLevel.Orange:
				this._setVariant('orange');
				this._setIcon(Codicon.warning);
				break;
			case ToolRiskLevel.Red:
				this._setVariant('red');
				this._setIcon(Codicon.error);
				break;
		}
		this.domNode.style.display = '';
		this._textEl.textContent = assessment.explanation;
		this._setHover(assessment.explanation);
	}

	private _setVariant(variant: 'loading' | 'neutral' | 'orange' | 'red'): void {
		this.domNode.classList.remove('neutral', 'orange', 'red', 'loading');
		this.domNode.classList.add(variant);
	}

	private _setIcon(icon: ThemeIcon): void {
		this._iconEl.className = 'tool-risk-icon ' + ThemeIcon.asClassName(icon);
	}

	private _setHover(content: string): void {
		this._hoverStore.clear();
		this._hoverStore.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.domNode, content));
	}
}
