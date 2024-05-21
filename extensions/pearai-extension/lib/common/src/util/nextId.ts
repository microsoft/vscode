export function createNextId({ prefix = "" }: { prefix: string }) {
	let id = 0;
	return () => `${prefix}${id++}`;
}
