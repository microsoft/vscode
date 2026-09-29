export function connectFromRow(row: [number, string, { loose: boolean, lazy: boolean }]) {
	const options = row[2];
	const loose = options.loose = options.lazy || false;
	const timeout = row[0] * (loose ? 10 : 1);
	connect(row[1], { timeout, loose });
}
export function connect(address: string, options: { timeout?: number, loose: boolean } = { loose: false }): void {
	// TODO: Actually connect
}
export function findRow(table: string, conditions: [string, string][], order?: string, limit?: number): string[] {
	// TODO: Actually find row
	return []
}