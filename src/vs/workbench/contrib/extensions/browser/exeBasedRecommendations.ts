/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionTipsService, IExecutableBasedExtensionTip } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionRecommendations, ExtensionRecommendation } from 'vs/workbench/contrib/extensions/browser/extensionRecommendations';
import { localize } from 'vs/nls';
import { ExtensionRecommendationReason } from 'vs/workbench/services/extensionRecommendations/common/extensionRecommendations';

export class ExeBasedRecommendations extends ExtensionRecommendations {

	private _otherTips: IExecutableBasedExtensionTip[] = [];
	private _importantTips: IExecutableBasedExtensionTip[] = [];

	get otherRecommendations(): ReadonlyArray<ExtensionRecommendation> { return this._otherTips.map(tip => this.toExtensionRecommendation(tip)); }
	get importantRecommendations(): ReadonlyArray<ExtensionRecommendation> { return this._importantTips.map(tip => this.toExtensionRecommendation(tip)); }

	get recommendations(): ReadonlyArray<ExtensionRecommendation> { return [...this.importantRecommendations, ...this.otherRecommendations]; }

	constructor(
		@IExtensionTipsService private readonly extensionTipsService: IExtensionTipsService,
	) {
		super();
	}

	getRecommendations(exe: string): { important: ExtensionRecommendation[]; others: ExtensionRecommendation[] } {
		const important = this._importantTips
			.filter(tip => tip.exeName.toLowerCase() === exe.toLowerCase())
			.map(tip => this.toExtensionRecommendation(tip));

		const others = this._otherTips
			.filter(tip => tip.exeName.toLowerCase() === exe.toLowerCase())
			.map(tip => this.toExtensionRecommendation(tip));

		return { important, others };
	}

	protected async doActivate(): Promise<void> {
		this._otherTips = await this.extensionTipsService.getOtherExecutableBasedTips();
		await this.fetchImportantExeBasedRecommendations();
	}

	private _importantExeBasedRecommendations: Promise<Map<string, IExecutableBasedExtensionTip>> | undefined;
	private async fetchImportantExeBasedRecommendations(): Promise<Map<string, IExecutableBasedExtensionTip>> {
		if (!this._importantExeBasedRecommendations) {
			this._importantExeBasedRecommendations = this.doFetchImportantExeBasedRecommendations();
		}
		return this._importantExeBasedRecommendations;
	}

	private async doFetchImportantExeBasedRecommendations(): Promise<Map<string, IExecutableBasedExtensionTip>> {
		const importantExeBasedRecommendations = new Map<string, IExecutableBasedExtensionTip>();
		this._importantTips = await this.extensionTipsService.getImportantExecutableBasedTips();
		this._importantTips.forEach(tip => importantExeBasedRecommendations.set(tip.extensionId.toLowerCase(), tip));
		return importantExeBasedRecommendations;
	}

	private toExtensionRecommendation(tip: IExecutableBasedExtensionTip): ExtensionRecommendation {
		return {
			extension: tip.extensionId.toLowerCase(),
			reason: {
				reasonId: ExtensionRecommendationReason.Executable,
				reasonText: localize('exeBasedRecommendation', "This extension is recommended because you have {0} installed.", tip.exeFriendlyName)
			}
		};
	}

}

