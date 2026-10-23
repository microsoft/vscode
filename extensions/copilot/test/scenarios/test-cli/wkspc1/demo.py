# Copyright (c) Microsoft Corporation and GitHub. All rights reserved.

# Program to display the Fibonacci sequence up to n-th term
def printFibb(nterms)
    # first two terms
    n1, n2 = 0, 1
    count = 0
    print("Fibonacci sequence upto",nterms,":")
    print(n1)
    # generate fibonacci sequence
    print("Fibonacci sequence:")
    while count < nterms:
        print(n1)
        nth = n1 + n2
        # update values
        n1 = n2
        n2 = nth
        count += 1

printFibb(34);