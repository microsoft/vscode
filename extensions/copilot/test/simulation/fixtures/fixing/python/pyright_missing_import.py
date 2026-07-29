def adding():
    return 1 + 1

class TestAddingFunction (unittest.TestCase):
    def test_adding (self):
        self.assertEqual (adding(), 2)

if __name__ == '__main__':
    unittest.main()