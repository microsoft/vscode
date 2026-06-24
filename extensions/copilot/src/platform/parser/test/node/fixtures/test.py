# This is a single line comment

"""
This is a multi-line comment
"""

# Importing a module
import math

# Variable assignment
x = 10

# Function definition
def square(num):
    """This is a docstring"""
    foo = a or b
    return num ** 2

# Conditional statements
if x > 0:
    print("Positive")
elif x < 0:
    print("Negative")
else:
    print("Zero")

# For loop
for i in range(5):
    print(i)

# While loop
while x > 0:
    x -= 1

# List comprehension
squares = [i**2 for i in range(10)]

# Class definition
class MyClass:
    def __init__(self, name):
        self.name = name

    def greet(self):
        print(f"Hello, {self.name}")

# Creating an object
obj = MyClass("Python")

# Calling a method
obj.greet()

# Error handling
try:
    print(10 / 0)
except ZeroDivisionError:
    print("Cannot divide by zero")
finally:
    print("End of error handling")

# With statement
with open('file.txt', 'w') as f:
    f.write("Hello, World!")

# Lambda function
square = lambda x: x**2

# Generator expression
gen = (i**2 for i in range(10))

# Decorator
def my_decorator(func):
    def wrapper():
        print("Before function call")
        func()
        print("After function call")
    return wrapper

@my_decorator
def say_hello():
    print("Hello")

say_hello()
