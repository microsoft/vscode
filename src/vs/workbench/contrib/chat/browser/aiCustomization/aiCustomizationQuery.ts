/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type CustomizationDiscoveryType = 'skill' | 'mcp' | 'plugin';

const typeOrder = [
	'skill',
	'mcp',
	'plugin',
] as const;

const typeAliases = new Map<string, CustomizationDiscoveryType>([
	['skill', 'skill'],
	['skills', 'skill'],
	['mcp', 'mcp'],
	['mcps', 'mcp'],
	['plugin', 'plugin'],
	['plugins', 'plugin'],
]);

function normalizeText(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

export class CustomizationDiscoveryQuery {

	private constructor(
		readonly text: string,
		readonly installed: boolean,
		private readonly selectedTypes: ReadonlySet<CustomizationDiscoveryType>,
	) { }

	static parse(value: string): CustomizationDiscoveryQuery {
		let installed = false;
		const types = new Set<CustomizationDiscoveryType>();
		const textParts: string[] = [];

		for (const part of value.split(/\s+/)) {
			if (!part) {
				continue;
			}

			const normalizedPart = part.toLowerCase();
			if (normalizedPart === '@installed') {
				installed = true;
				continue;
			}

			if (normalizedPart.startsWith('@type:')) {
				const type = typeAliases.get(normalizedPart.slice('@type:'.length));
				if (type) {
					types.add(type);
					continue;
				}
			}

			textParts.push(part);
		}

		return new CustomizationDiscoveryQuery(normalizeText(textParts.join(' ')), installed, types);
	}

	get types(): ReadonlySet<CustomizationDiscoveryType> {
		return new Set(this.selectedTypes);
	}

	isEmpty(): boolean {
		return !this.text && !this.installed && this.selectedTypes.size === 0;
	}

	withInstalled(installed: boolean): CustomizationDiscoveryQuery {
		return installed === this.installed ? this : new CustomizationDiscoveryQuery(this.text, installed, this.selectedTypes);
	}

	withType(type: CustomizationDiscoveryType, enabled: boolean): CustomizationDiscoveryQuery {
		if (this.selectedTypes.has(type) === enabled) {
			return this;
		}
		const types = new Set(this.selectedTypes);
		if (enabled) {
			types.add(type);
		} else {
			types.delete(type);
		}
		return new CustomizationDiscoveryQuery(this.text, this.installed, types);
	}

	equals(other: CustomizationDiscoveryQuery): boolean {
		if (this.text !== other.text || this.installed !== other.installed || this.selectedTypes.size !== other.selectedTypes.size) {
			return false;
		}
		for (const type of this.selectedTypes) {
			if (!other.selectedTypes.has(type)) {
				return false;
			}
		}
		return true;
	}

	toString(): string {
		const parts = this.text ? [this.text] : [];
		for (const type of typeOrder) {
			if (this.selectedTypes.has(type)) {
				parts.push(`@type:${type}`);
			}
		}
		if (this.installed) {
			parts.push('@installed');
		}
		return parts.join(' ');
	}
}

export function getCustomizationDiscoveryQuerySuggestions(value: string): readonly string[] {
	const query = CustomizationDiscoveryQuery.parse(value);
	const result: string[] = [];
	if (!query.installed) {
		result.push('@installed ');
	}
	for (const type of typeOrder) {
		if (!query.types.has(type)) {
			result.push(`@type:${type} `);
		}
	}
	return result;
}
