# This sample tests that the type checker handles the case
# where a symbol within a class scope is assigned an expression
# that includes the same symbol, but that same symbol is defined
# in an outer scope.

a = 0
b = 1
c = 4


class MyClass:
    # This should not generate an error because
    # the RHS of the assignment refers to a different
    # "a", declared in an outer scope.
    a = a

    # Same with "b" here.
    (b, a) = (b, 3)

    # Same with "c" here.
    [c] = [c]

    # This should generate an error because "d" is
    # not declared in the outer scope.
    e = d
