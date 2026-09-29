import org.junit.Assert;
import org.junit.Test;

package com.example;

public class MyCalculatorTest {

    // we add a comment with test's number in a line above the test

    // test #1
    @Test
    public void testAdd() {
        MyCalculator calculator = new MyCalculator();
        Assert.assertEquals(5, calculator.add(2, 3));
        Assert.assertEquals(-1, calculator.add(-2, 1));
        Assert.assertEquals(0, calculator.add(2, -2));
    }
}
