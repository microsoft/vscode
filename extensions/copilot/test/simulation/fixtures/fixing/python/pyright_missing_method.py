# This sample tests various logical expressions.


class Foo:
    def do_something1(self):
        pass

    def do_something2(self):
        pass


class Bar:
    def do_something1(self):
        pass


a = 0
foo = Foo()
bar = Bar()

b = a and foo or bar

# This should not be flagged as an error because
# the type of b should be type Foo.
b.do_something1()

# This should be flagged as an error because
# Bar doesn't define a do_something2 method.
b.do_something2()
