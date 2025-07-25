// Single-line comment
/* Multi-line
   comment */
/** Javadoc comment */
package com.example;

@Annotation(name = "test")
public class Main<T> extends SuperClass implements Runnable {
    private static final int CONSTANT = 100;

    public static void main(String[] args) {
        int x = 10_000;
        List<String> list = new ArrayList<>();
        System.out.println("Hello");
    }

    @Override
    public <T> T genericMethod(T param) throws IOException {
        if (param instanceof String s) {
            return s;
        }
        return null;
    }
}
