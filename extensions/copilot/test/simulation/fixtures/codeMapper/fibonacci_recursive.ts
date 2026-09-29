function fibonacci_recursive(n: number): number {
	if (n === 1) return 0;
	if (n === 2) return 1;
	return fibonacci_recursive(n - 1) + fibonacci_recursive(n - 2);
}

function generate_fibonacci_recursive(n: number) {
	const fibonacci_series = Array.from({ length: n }, (_, i) => fibonacci_recursive(i + 1));
	return fibonacci_series;
}

const mock_data = {
	number: 10
};

console.log('\nFibonacci Series using recursion:');
console.log(generate_fibonacci_recursive(mock_data.number));

