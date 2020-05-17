export function parseKindModifier(kindModifiers: string): Set<string> {
	return new Set(kindModifiers.split(/,|\s+/g));
}
