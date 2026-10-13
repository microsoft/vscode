export function connect(address: string, timeout: number, loose: boolean) {
	// TODO: Actually connect
}
export function connectLegacy(address: string, options: { timeout?: number, loose: boolean } = { loose: false }): void {
	connect(address, options.timeout ?? 1000, options.loose);
}
export function findRow(table: string, conditions: [string, string][], order?: string, limit?: number): string[] {
	// TODO: Actually find row
	return []
}
export function connectReal(address: string, options: { timeout?: number, loose: boolean } = { loose: false }): void {
	connect(address, options.timeout ?? 1000, options.loose);
}