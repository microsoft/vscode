# Copyright (c) Microsoft Corporation and GitHub. All rights reserved.

class MyClass
    def hello
      puts "Hello, world!"
    end
  end

class MySecondClass
    def greet(name)
        puts "Hello, #{name}!"
    end
end

my_instance = MyClass.new
second_instance = MySecondClass.new
second_instance.greet("Alice")
