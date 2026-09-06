export function isEmailAddress(value: string): boolean {
	return includes(value, '@');
}

function includes(value: string, char: string): boolean {
	return value.includes(char);
}