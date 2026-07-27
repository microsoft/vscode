/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

public class Main {
    public static void main(String[] args) {
        MyClass myObject = new MyClass();
        myObject.greet("Alice");
    }
}

class MyClass {
    public void greet(String name) {
        System.out.println("Hello, " + name + "!");
    }
}
