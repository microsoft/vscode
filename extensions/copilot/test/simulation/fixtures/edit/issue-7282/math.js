
export function fib(nth) {
	if (nth <= 0) return 0;
	if (nth === 1) return 0;
	if (nth === 2) return 1;

	return fib(nth - 1) + fib(nth - 2);
}

export function isOdd(n) {
	return n % 2 !== 0;
}

export function sum(a, b) {
	assert.strictEqual(typeof a, 'number', 'a must be of type number');
	return a + b;
}

export function sub(a, b) {
	return a - b;
}

export function sumArray(arr) {
	return arr.reduce((sum, num) => sum + num, 0);
}

export function div(A, b) {
	return A / b;
}

export function mul(a, b) {
	return a * b;
}


export function isPrime(number) {
	if (number <= 1) return false;
	for (let i = 2; i <= Math.sqrt(number); i++) {
		if (number % i === 0) {
			return false;
		}
	}
	return true;
}


export function isEven(n) {
	return n % 2 === 0;
}
