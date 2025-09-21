/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITableDesign } from '../../common/erdosDatabaseClientApi.js';

/**
 * Editor input for Table Design editor.
 * Holds the connection information and table design data.
 */
export class TableDesignInput extends EditorInput {

	static readonly ID = 'erdos.tableDesignInput';

	constructor(
		public readonly connectionId: string,
		public readonly database: string,
		public readonly table: string,
		public initialDesign: ITableDesign | undefined,
		public readonly resource: URI
	) {
		super();
	}

	override get typeId(): string {
		return TableDesignInput.ID;
	}

	override getName(): string {
		return `Table Design - ${this.database}.${this.table}`;
	}

	override getDescription(): string | undefined {
		return `${this.connectionId} - ${this.database}.${this.table}`;
	}

	override get capabilities(): number {
		return super.capabilities;
	}

	override matches(otherInput: EditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof TableDesignInput) {
			return otherInput.connectionId === this.connectionId && 
				   otherInput.database === this.database && 
				   otherInput.table === this.table;
		}

		return false;
	}

	public updateDesign(design: ITableDesign): void {
		this.initialDesign = design;
		// Notify listeners that the label may have changed due to updated design
		this._onDidChangeLabel.fire();
	}

	override dispose(): void {
		super.dispose();
	}
}
