export function sum() {
	return [...arguments].reduce((acc, val) => acc + val, 0);
}

export function subtract() {
	return [...arguments].reduce((acc, val) => acc - val, 0);
}
