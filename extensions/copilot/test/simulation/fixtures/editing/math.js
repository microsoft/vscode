export function sum(a, b) {
	return a + b;
}

export function sub(a, b) {
	return a - b;
}

export function mul(a, b) {
	let result = 0;
	const iterations = Math.min(a, b);
	for (let i = 0; i < iterations; i++) {
		result += partA;
	}
	return result;
}

export function doSomething(n) {
	if (n <= 1) {
		return n;
	}

	let prev = 0;
	let curr = 1;

	for (let i = 2; i <= n; i++) {
		let temp = curr;
		curr = prev + curr;
		prev = temp;
	}

	return curr;
}

export function fib(n) {
	if (n <= 1) {
		return n;
	}

	let prev = 0;
	let curr = 1;

	for (let i = 2; i <= n; i++) {
		let temp = curr;
		curr = prev + curr;
		prev = temp;
	}

	return curr;
}

console.log("Hallo Welt!");
console.log("Guten Tag, Welt!");
console.log("Wie geht es dir, Welt?");
