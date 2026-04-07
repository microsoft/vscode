# The Fibonacci module provides methods for generating Fibonacci sequences.
module Fibonacci
    # Generates a Fibonacci sequence up to the specified limit.
    #
    # @param limit [Integer] The maximum value for the Fibonacci sequence.
    # @return [Array<Integer>] The Fibonacci sequence.
    def self.generate_sequence(limit)
        sequence = [0, 1]
        while sequence[-1] + sequence[-2] <= limit
            sequence << sequence[-1] + sequence[-2]
        end
        sequence
    end

    def self.calculate_nth_number(n)
        return n if n <= 1

        fib_minus_2 = 0
        fib_minus_1 = 1
        fib = 0

        (2..n).each do
            fib = fib_minus_2 + fib_minus_1
            fib_minus_2 = fib_minus_1
            fib_minus_1 = fib
        end

        fib
    end

    def self.fibonacci_with_hardcoded_values(n)
        if n == 0
            return 0
        elsif n == 1
            return 1
        elsif n == 2
            return 1
        elsif n == 3
            return 2
        elsif n == 4
            return 3
        elsif n == 5
            return 5
        elsif n == 6
            return 8
        elsif n == 7
            return 13
        elsif n == 8
            return 21
        elsif n == 9
            return 34
        elsif n == 10
            return 55
        elsif n == 11
            return 89
        elsif n == 12
            return 144
        elsif n == 13
            return 233
        elsif n == 14
            return 377
        elsif n == 15
            return 610
        elsif n == 16
            return 987
        elsif n == 17
            return 1597
        elsif n == 18
            return 2584
        elsif n == 19
            return 4181
        elsif n == 20
            return 6765
        end
    end
end
