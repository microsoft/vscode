/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorOption } from '../config/editorOptions.js';
import { ILineBreaksComputerFactory, ILineBreaksComputer, ModelLineProjectionData } from '../modelLineProjectionData.js';
import { IEditorConfiguration } from '../config/editorConfiguration.js';
import { LineInjectedText } from '../textModelEvents.js';
import { IViewLineTokens } from '../tokens/lineTokens.js';
import { InlineDecorations } from './viewModelDecorations.js';

export class LineBreaksComputerFactory {

	constructor(
		private readonly domLineBreaksComputerFactory: ILineBreaksComputerFactory,
		private readonly monospaceLineBreaksComputerFactory: ILineBreaksComputerFactory
	) { }

	public createLineBreaksComputer(config: IEditorConfiguration, tabSize: number): LineBreaksComputer {
		return new LineBreaksComputer(config, tabSize, this.domLineBreaksComputerFactory, this.monospaceLineBreaksComputerFactory);
	}
}

enum LineBreaksComputerType {
	Dom = 'dom',
	Monospace = 'monospace'
}

export class LineBreaksComputer implements ILineBreaksComputer {

	private readonly _domLineBreaksComputer: ILineBreaksComputer;
	private readonly _monospaceLineBreaksComputer: ILineBreaksComputer;
	private readonly _lineBreaksComputerMapping: LineBreaksComputerType[] = [];
	private readonly _config: IEditorConfiguration;

	constructor(
		config: IEditorConfiguration,
		tabSize: number,
		domLineBreaksComputerFactory: ILineBreaksComputerFactory,
		monospaceLineBreaksComputerFactory: ILineBreaksComputerFactory
	) {
		this._config = config;
		this._domLineBreaksComputer = domLineBreaksComputerFactory.createLineBreaksComputer(config, tabSize);
		this._monospaceLineBreaksComputer = monospaceLineBreaksComputerFactory.createLineBreaksComputer(config, tabSize);
	}

	addRequest(lineText: string, injectedText: LineInjectedText[] | null, inlineDecorations: InlineDecorations, lineTokens: IViewLineTokens, previousLineBreakData: ModelLineProjectionData | null): void {
		const wrappingStrategy = this._config.options.get(EditorOption.wrappingStrategy);
		if (wrappingStrategy === 'advanced' || inlineDecorations.affectsFonts) {
			this._domLineBreaksComputer.addRequest(lineText, injectedText, inlineDecorations, lineTokens, previousLineBreakData);
			this._lineBreaksComputerMapping.push(LineBreaksComputerType.Dom);
		} else {
			this._monospaceLineBreaksComputer.addRequest(lineText, injectedText, inlineDecorations, lineTokens, previousLineBreakData);
			this._lineBreaksComputerMapping.push(LineBreaksComputerType.Monospace);
		}
	}

	finalize(): (ModelLineProjectionData | null)[] {
		const domLineBreaks = this._domLineBreaksComputer.finalize();
		const monospaceLineBreaks = this._monospaceLineBreaksComputer.finalize();
		const result: (ModelLineProjectionData | null)[] = [];
		for (let i = 0; i < this._lineBreaksComputerMapping.length; i++) {
			switch (this._lineBreaksComputerMapping[i]) {
				case LineBreaksComputerType.Dom:
					result.push(domLineBreaks.shift() ?? null);
					break;
				case LineBreaksComputerType.Monospace:
					result.push(monospaceLineBreaks.shift() ?? null);
					break;
			}
		}
		return result;
	}
}
