/**
 * Returns the intersection of two arrays as a new array.
 * The intersection includes the elements that are common to both input arrays.
 * The function avoids duplicates by deleting each found element from the set.
 *
 * @param arr1 - The first input array.
 * @param arr2 - The second input array.
 * @returns A new array containing the intersection of the input arrays.
 */
export function arrayIntersection(arr1: number[], arr2: number[]): number[] {
	const set = new Set(arr1);
	const result: number[] = [];
	for (let num of arr2) {
		if (set.has(num)) {
			result.push(num);
			set.delete(num); // Avoid duplicates
		}
	}
	return result;
}

/**
 * This function finds and logs all pairs of numbers from two arrays that add up to a given sum.
 *
 * @param arr1 - The first array of numbers.
 * @param arr2 - The second array of numbers.
 * @param sum - The target sum. If not provided, defaults to 10.
 */
export function findPairs(arr1: number[], arr2: number[], sum: number = 10): void {
	for (let i = 0; i < arr1.length; i++) {
		for (let j = 0; j < arr2.length; j++) {
			if (arr1[i] + arr2[j] === sum) {
				console.log(`Pair: (${arr1[i]}, ${arr2[j]})`);
			}
		}
	}
}

/**
 * Sorts an array of numbers in ascending order using the Bubble Sort algorithm.
 *
 * @param arr - The array of numbers to be sorted.
 * @returns The sorted array of numbers.
 */
export function sort(arr: number[]): number[] {
	let len = arr.length;
	for (let i = 0; i < len; i++) {
		for (let j = 0; j < len - i - 1; j++) {
			if (arr[j] > arr[j + 1]) {
				[arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
			}
		}
	}
	return arr;
}