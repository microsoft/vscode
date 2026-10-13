export function isOdd(N) {
	return !isEven(N);
}
export function sum(a, b) {
	return a + b;
}

export function sub(x, y) {
	return x - y;
}

export function mul(a, b) {
	let result = 0;
	for (let i = 0; i < b; i++) {
		result = sum(result, a);
	}
	return result;
}

export function fib(nth) {
	if (nth <= 0) return 0;
	if (nth === 1) return 0;
	if (nth === 2) return 1;

	let prev = 0;
	let curr = 1;
	for (let i = 3; i <= nth; i++) {
		let next = prev + curr;
		prev = curr;
		curr = next;
	}

	return curr;
}

export function isPrime(N) {

	if (N <= 1) return false;
	for (let i = 2; i <= Math.sqrt(N); i++) {
		if (N % i === 0) {
			return false;
		}
	}
	return true;
}

export function isEven(number) {

	return number % 2 === 0;
}
