# Variable assignment
num = 10

# Array
arr = [1, 2, 3, 4, 5]

# Hash
hash = { "key1" => "value1", "key2" => "value2" }

# If-else condition
if num > 5
  puts "Greater than 5"
else
  puts "Less than or equal to 5"
end

# Case statement
case num
when 1
  puts "One"
when 2
  puts "Two"
else
  puts "Other"
end

# While loop
while num > 0
  puts num
  num -= 1
end

# For loop
for i in arr
  puts i
end

# Each loop
arr.each do |i|
  puts i
end

# Function definition
def add(a, b)
  a + b
end

# Function call
puts add(2, 3)

# Class definition
class MyClass
	# Instance variable
	@my_var = 10

	# Constructor
	def initialize(value = 10)
		@my_var = value
	end

	# Getter method
	def my_var
		@my_var
	end

	# Setter method
	def my_var=(value)
		@my_var = value
	end
end

# Object instantiation
obj = MyClass.new

# Method call on object
puts obj.my_var
obj.my_var = 20
puts obj.my_var

# Module definition
module MyModule
  def self.say_hello
    puts "Hello"
  end
end

# Call method on module
MyModule.say_hello

# Exception handling
begin
  1 / 0
rescue ZeroDivisionError
  puts "Cannot divide by zero"
end

# Block
3.times { puts "Hello" }

# Proc
my_proc = Proc.new { |x| puts x }
my_proc.call(10)

# Lambda
my_lambda = ->(x) { puts x }
my_lambda.call(20)

# Symbol
puts :my_symbol

# String interpolation
puts "The number is #{num}"

# Regular expression
puts "Hello" =~ /e/

# Range
(1..5).each { |i| puts i }

# File I/O
File.open("test.txt", "w") { |file| file.write("Hello, world!") }
