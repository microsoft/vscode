/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';

export class DiagnosticData {
	constructor(
		public readonly documentUri: URI,
		public readonly message: string,
		public readonly severity: 'error' | 'warning',
		public readonly range: OffsetRange,
		public readonly code: string | number | undefined,
		public readonly source: string | undefined,
	) { }

	public toString(): string {
		return `${this.severity.toUpperCase()}: ${this.message} (${this.range})`;
	}

	public equals(other: DiagnosticData): boolean {
		return isEqual(this.documentUri, other.documentUri)
			&& this.message === other.message
			&& this.severity === other.severity
			&& this.range.equals(other.range)
			&& this.code === other.code
			&& this.source === other.source;
	}
}
