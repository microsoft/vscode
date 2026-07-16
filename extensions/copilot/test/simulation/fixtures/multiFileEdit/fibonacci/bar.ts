import { fibonacci } from './version1';

export function sumFibonacci(n: number): number {
	let sum = 0;
	for (let i = 0; i < n; i++) {
		sum += fibonacci(i);
	}
	return sum;
}