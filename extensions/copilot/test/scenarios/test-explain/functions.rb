# Copyright (c) Microsoft Corporation and GitHub. All rights reserved.

class Greeter
    def say_hello
        puts "Hello, world!"
    end

    def say_goodbye
        puts "Goodbye, world!"
    end
end
greeter = Greeter.new
greeter.send(:say_hello)