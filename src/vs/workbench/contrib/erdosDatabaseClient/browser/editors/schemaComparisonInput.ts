/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { ISchemaComparison } from '../../common/erdosDatabaseClientApi.js';

/**
 * Editor input for Schema Comparison editor.
 * Holds the source and target connection/database information and comparison results.
 */
export class SchemaComparisonInput extends EditorInput {

	static readonly ID = 'erdos.schemaComparisonInput';

	constructor(
		public readonly fromConnection: string,
		public readonly fromDatabase: string,
		public readonly toConnection: string,
		public readonly toDatabase: string,
		public initialComparison: ISchemaComparison | undefined,
		public readonly resource: URI
	) {
		super();
	}

	override get typeId(): string {
		return SchemaComparisonInput.ID;
	}

	override getName(): string {
		return `Schema Comparison - ${this.fromDatabase} → ${this.toDatabase}`;
	}

	override getDescription(): string | undefined {
		return `Compare ${this.fromConnection}/${this.fromDatabase} with ${this.toConnection}/${this.toDatabase}`;
	}

	override get capabilities(): number {
		return super.capabilities;
	}

	override matches(otherInput: EditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof SchemaComparisonInput) {
			return otherInput.fromConnection === this.fromConnection &&
				   otherInput.fromDatabase === this.fromDatabase &&
				   otherInput.toConnection === this.toConnection &&
				   otherInput.toDatabase === this.toDatabase;
		}

		return false;
	}

	public updateComparison(comparison: ISchemaComparison): void {
		this.initialComparison = comparison;
		this._onDidChangeLabel.fire();
	}

	override dispose(): void {
		super.dispose();
	}
}
