/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorOption, IComputedEditorOptions } from '../config/editorOptions.js';
import { ILineBreaksComputerFactory, ILineBreaksComputer, ModelLineProjectionData } from '../modelLineProjectionData.js';
import { IEditorConfiguration } from '../config/editorConfiguration.js';
import { DOMLineBreaksComputerFactory } from '../../browser/view/domLineBreaksComputer.js';
import { MonospaceLineBreaksComputerFactory } from './monospaceLineBreaksComputer.js';
import { LineInjectedText } from '../textModelEvents.js';
import { InlineDecoration } from '../viewModel.js';
import { IViewLineTokens } from '../tokens/lineTokens.js';

export class GeneralLineBreaksComputerFactory implements ILineBreaksComputerFactory {


	constructor(private readonly targetWindow: Window, private readonly options: IComputedEditorOptions) { }

	public createLineBreaksComputer(config: IEditorConfiguration, tabSize: number): ILineBreaksComputer {
		return new GeneralLineBreaksComputer(this.targetWindow, config, this.options, tabSize);
	}
}

export class GeneralLineBreaksComputer implements ILineBreaksComputer {

	private readonly _domLineBreaksComputer: ILineBreaksComputer;
	private readonly _monospaceLineBreaksComputer: ILineBreaksComputer;
	private readonly _lineNumbers: number[] = [];

	constructor(targetWindow: Window, private readonly config: IEditorConfiguration, options: IComputedEditorOptions, tabSize: number) {
		const domLineBreaksComputerFactory = DOMLineBreaksComputerFactory.create(targetWindow);
		this._domLineBreaksComputer = domLineBreaksComputerFactory.createLineBreaksComputer(config, tabSize);

		const monospaceLineBreaksComputerFactory = MonospaceLineBreaksComputerFactory.create(options);
		this._monospaceLineBreaksComputer = monospaceLineBreaksComputerFactory.createLineBreaksComputer(config, tabSize);
	}

	addRequest(lineNumber: number, lineText: string, injectedText: LineInjectedText[] | null, inlineDecorations: InlineDecoration[], lineTokens: IViewLineTokens, previousLineBreakData: ModelLineProjectionData | null, hasFontDecorations: boolean = false): void {
		this._lineNumbers.push(lineNumber);
		const wrappingStrategy = this.config.options.get(EditorOption.wrappingStrategy);
		if (wrappingStrategy === 'advanced' || hasFontDecorations) {
			this._domLineBreaksComputer.addRequest(lineNumber, lineText, injectedText, inlineDecorations, lineTokens, previousLineBreakData, hasFontDecorations);
		} else {
			this._monospaceLineBreaksComputer.addRequest(lineNumber, lineText, injectedText, inlineDecorations, lineTokens, previousLineBreakData, hasFontDecorations);
		}
	}

	finalize(): Map<number, ModelLineProjectionData | null> {
		const map1 = this._domLineBreaksComputer.finalize() ?? new Map<number, ModelLineProjectionData>();
		const map2 = this._monospaceLineBreaksComputer.finalize() ?? new Map<number, ModelLineProjectionData>();
		return new Map([...map1, ...map2]);
	}

	finalizeToArray(): (ModelLineProjectionData | null)[] {
		const map = this.finalize();
		const result: (ModelLineProjectionData | null)[] = [];
		for (const lineNumber of this._lineNumbers) {
			result.push(map.get(lineNumber) ?? null);
		}
		return result;
	}
}
