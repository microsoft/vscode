import unittest

from mmath import sub


class TestExample(unittest.TestCase):

    def test_subtract(self):
        self.assertEqual(sub.subtract(5, 3), 2)
        self.assertEqual(sub.subtract(3, 5), -2)


if __name__ == "__main__":
    unittest.main()
