# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from testscenarios import TestWithScenarios

class TestMathOperations(TestWithScenarios):
    scenarios = [
        ('add', {'test_id': 'test_add', 'a': 5, 'b': 3, 'expected': 8}),
        ('subtract', {'test_id': 'test_subtract', 'a': 5, 'b': 3, 'expected': 2}),
        ('multiply', {'test_id': 'test_multiply', 'a': 5, 'b': 3, 'expected': 15})
    ]
    a: int = 0
    b: int = 0
    expected: int = 0
    test_id: str = ""

    def test_operations(self):
        result = None
        if self.test_id == 'test_add':
            result = self.a + self.b
        elif self.test_id == 'test_subtract':
            result = self.a - self.b
        elif self.test_id == 'test_multiply':
            result = self.a * self.b
        self.assertEqual(result, self.expected)
