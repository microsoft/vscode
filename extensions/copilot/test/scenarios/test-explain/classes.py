# Copyright (c) Microsoft Corporation and GitHub. All rights reserved.

class Person:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def introduce(self):
        return f"My name is {self.name} and I am {self.age} years old."

def create_person(name, age):
    return Person(name, age)

class OtherPerson:
    def __init__(self, name, age):
        self.name = name
        self.age = age