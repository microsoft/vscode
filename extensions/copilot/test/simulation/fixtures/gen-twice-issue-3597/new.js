/**
 * Finds all prime numbers up to a given limit `n`.
 * @param {number} n - The limit to find primes up to.
 * @returns {number[]} An array of prime numbers up to `n`.
 */
function findPrimes(n) {
    let primes = [];
    // Loop through all numbers from 2 to `n`
    for (let i = 2; i < n; i++) {
        let isPrime = true;
        // Check if `i` is divisible by any number from 2 to the square root of `i`
        for (let j = 2; j <= Math.sqrt(i); j++) {
            if (i % j === 0) {
                isPrime = false;
                break;
            }
        }
        // If `i` is not divisible by any number, it is a prime number
        if (isPrime) {
            primes.push(i);
        }
    }
    return primes;
}

console.log(findPrimes(100));

