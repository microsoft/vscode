/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorOption, IComputedEditorOptions } from '../config/editorOptions.js';
import { ILineBreaksComputerFactory, ILineBreaksComputer, ModelLineProjectionData, ILineBreaksComputerContext } from '../modelLineProjectionData.js';

enum LineBreaksComputationType {
	Dom = 'dom',
	Monospace = 'monospace'
}

export class LineBreaksComputerFactory implements ILineBreaksComputerFactory {

	constructor(
		private readonly domLineBreaksComputerFactory: ILineBreaksComputerFactory,
		private readonly monospaceLineBreaksComputerFactory: ILineBreaksComputerFactory
	) { }

	public createLineBreaksComputer(context: ILineBreaksComputerContext, options: IComputedEditorOptions, tabSize: number): LineBreaksComputer {
		return new LineBreaksComputer(context, options, tabSize, this.domLineBreaksComputerFactory, this.monospaceLineBreaksComputerFactory);
	}
}

export class LineBreaksComputer implements ILineBreaksComputer {

	private readonly _domLineBreaksComputer: ILineBreaksComputer;
	private readonly _monospaceLineBreaksComputer: ILineBreaksComputer;

	private readonly _options: IComputedEditorOptions;
	private readonly _context: ILineBreaksComputerContext;
	private readonly _lineBreaksComputationMapping: LineBreaksComputationType[] = [];

	constructor(
		context: ILineBreaksComputerContext,
		options: IComputedEditorOptions,
		tabSize: number,
		domLineBreaksComputerFactory: ILineBreaksComputerFactory,
		monospaceLineBreaksComputerFactory: ILineBreaksComputerFactory
	) {
		this._context = context;
		this._options = options;
		this._domLineBreaksComputer = domLineBreaksComputerFactory.createLineBreaksComputer(context, options, tabSize);
		this._monospaceLineBreaksComputer = monospaceLineBreaksComputerFactory.createLineBreaksComputer(context, options, tabSize);
	}

	addRequest(lineNumber: number, previousLineBreakData: ModelLineProjectionData | null): void {
		const options = this._options;
		const wrappingStrategy = options.get(EditorOption.wrappingStrategy);
		const allowVariableFonts = options.get(EditorOption.effectiveAllowVariableFonts);
		if (wrappingStrategy === 'advanced' || (allowVariableFonts && this._context.hasVariableFonts(lineNumber))) {
			this._domLineBreaksComputer.addRequest(lineNumber, previousLineBreakData);
			this._lineBreaksComputationMapping.push(LineBreaksComputationType.Dom);
		} else {
			this._monospaceLineBreaksComputer.addRequest(lineNumber, previousLineBreakData);
			this._lineBreaksComputationMapping.push(LineBreaksComputationType.Monospace);
		}
	}

	finalize(): (ModelLineProjectionData | null)[] {
		const domLineBreaks = this._domLineBreaksComputer.finalize();
		const monospaceLineBreaks = this._monospaceLineBreaksComputer.finalize();
		const result: (ModelLineProjectionData | null)[] = [];
		for (let i = 0; i < this._lineBreaksComputationMapping.length; i++) {
			switch (this._lineBreaksComputationMapping[i]) {
				case LineBreaksComputationType.Dom:
					result.push(domLineBreaks.shift() ?? null);
					break;
				case LineBreaksComputationType.Monospace:
					result.push(monospaceLineBreaks.shift() ?? null);
					break;
			}
		}
		return result;
	}
}
