import pytest


@pytest.fixture(scope="function", params=[1, 2])
def setup(request):
    return request.param


class TestClass1:
    def test_method1(self, setup):  # test_marker--TestClass1::test_method1
        assert 1 == 1


class TestClass2:
    def test_method1(self, setup):  # test_marker--TestClass2::test_method1
        assert 2 == 2
