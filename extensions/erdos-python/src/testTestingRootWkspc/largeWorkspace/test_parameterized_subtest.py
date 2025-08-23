# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import pytest
import unittest


@pytest.mark.parametrize("num", range(0, 2000))
def test_odd_even(num):
    assert num % 2 == 0


class NumbersTest(unittest.TestCase):
    def test_even(self):
        for i in range(0, 2000):
            with self.subTest(i=i):
                self.assertEqual(i % 2, 0)


# The repeated tests below are to test the unittest communication as it hits it maximum limit of bytes.


class NumberedTests1(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests2(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests3(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests4(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests5(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests6(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests7(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests8(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests9(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests10(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests11(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests12(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests13(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests14(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests15(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests16(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests17(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests18(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests19(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)


class NumberedTests20(unittest.TestCase):
    def test_abc(self):
        self.assertEqual(1 % 2, 0)
