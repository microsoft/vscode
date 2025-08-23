# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import unittest
from reverse import reverse_sentence, reverse_string

class TestReverseFunctions(unittest.TestCase):

    def test_reverse_sentence(self):
        """
        Tests the reverse_sentence function to ensure it correctly reverses each word in a sentence.

        Test cases:
        - "hello world" should be reversed to "olleh dlrow"
        - "Python is fun" should be reversed to "nohtyP si nuf"
        - "a b c" should remain "a b c" as each character is a single word
        """
        self.assertEqual(reverse_sentence("hello world"), "olleh dlrow")
        self.assertEqual(reverse_sentence("Python is fun"), "nohtyP si nuf")
        self.assertEqual(reverse_sentence("a b c"), "a b c")

    def test_reverse_sentence_error(self):
        self.assertEqual(reverse_sentence(""), "Error: Input is None")
        self.assertEqual(reverse_sentence(None), "Error: Input is None")

    def test_reverse_string(self):
        self.assertEqual(reverse_string("hello"), "olleh")
        self.assertEqual(reverse_string("Python"), "nohtyP")
        # this test specifically does not cover the error cases

if __name__ == '__main__':
    unittest.main()
