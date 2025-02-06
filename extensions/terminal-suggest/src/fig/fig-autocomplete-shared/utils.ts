export function makeArray<T>(object: T | T[]): T[] {
	return Array.isArray(object) ? object : [object];
}

export enum SpecLocationSource {
	GLOBAL = "global",
	LOCAL = "local",
}
