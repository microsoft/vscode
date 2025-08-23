# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.


import importlib
import textwrap

# __file__ = "/Users/anthonykim/Desktop/vscode-python/python_files/normalizeSelection.py"
# sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))
import normalizeSelection


class TestNormalizationScript:
    """Unit tests for the normalization script."""

    def test_basic_normalization(self):
        src = 'print("this is a test")'
        expected = src + "\n"
        result = normalizeSelection.normalize_lines(src)
        assert result == expected

    def test_more_than_one_line(self):
        src = textwrap.dedent(
            """\
            # Some rando comment

            def show_something():
                print("Something")
            """
        )
        expected = textwrap.dedent(
            """\
            def show_something():
                print("Something")

            """
        )
        result = normalizeSelection.normalize_lines(src)
        assert result == expected

    def test_with_hanging_indent(self):
        src = textwrap.dedent(
            """\
            x = 22
            y = 30
            z = -10
            result = x + y + z

            if result == 42:
                print("The answer to life, the universe, and everything")
            """
        )
        expected = textwrap.dedent(
            """\
            x = 22
            y = 30
            z = -10
            result = x + y + z
            if result == 42:
                print("The answer to life, the universe, and everything")

            """
        )
        result = normalizeSelection.normalize_lines(src)
        assert result == expected

    def test_clear_out_extraneous_newlines(self):
        src = textwrap.dedent(
            """\
            value_x = 22

            value_y = 30

            value_z = -10

            print(value_x + value_y + value_z)

            """
        )
        expected = textwrap.dedent(
            """\
            value_x = 22
            value_y = 30
            value_z = -10
            print(value_x + value_y + value_z)
            """
        )
        result = normalizeSelection.normalize_lines(src)
        assert result == expected

    def test_clear_out_extra_lines_and_whitespace(self):
        src = textwrap.dedent(
            """\
            if True:
                x = 22

                y = 30

                z = -10

            print(x + y + z)

            """
        )
        expected = textwrap.dedent(
            """\
            if True:
                x = 22
                y = 30
                z = -10

            print(x + y + z)
            """
        )
        result = normalizeSelection.normalize_lines(src)
        assert result == expected

    def test_partial_single_line(self):
        src = "   print('foo')"
        expected = textwrap.dedent(src) + "\n"
        result = normalizeSelection.normalize_lines(src)
        assert result == expected

    def test_multiline_with_indent(self):
        src = """\

        if (x > 0
            and condition == True):
            print('foo')
        else:

            print('bar')
        """

        expected = textwrap.dedent(
            """\
        if (x > 0
            and condition == True):
            print('foo')
        else:
            print('bar')

        """
        )

        result = normalizeSelection.normalize_lines(src)
        assert result == expected

    def test_multiline_with_comment(self):
        src = textwrap.dedent(
            """\

            def show_something():
                # A comment
                print("Something")
            """
        )
        expected = textwrap.dedent(
            """\
            def show_something():
                # A comment
                print("Something")

            """
        )
        result = normalizeSelection.normalize_lines(src)
        assert result == expected

    def test_exception(self):
        src = "       if True:"
        expected = src + "\n\n"
        result = normalizeSelection.normalize_lines(src)
        assert result == expected

    def test_multiline_exception(self):
        src = textwrap.dedent(
            """\

            def show_something():
                if True:
            """
        )
        expected = src + "\n\n"
        result = normalizeSelection.normalize_lines(src)
        assert result == expected

    def test_decorators(self):
        src = textwrap.dedent(
            """\
            def foo(func):

                def wrapper():
                    print('before')
                    func()
                    print('after')

                return wrapper


            @foo
            def show_something():
                print("Something")
            """
        )
        expected = textwrap.dedent(
            """\
            def foo(func):
                def wrapper():
                    print('before')
                    func()
                    print('after')
                return wrapper

            @foo
            def show_something():
                print("Something")

            """
        )
        result = normalizeSelection.normalize_lines(src)
        assert result == expected

    def test_fstring(self):
        importlib.reload(normalizeSelection)
        src = textwrap.dedent(
            """\
            name = "Ahri"
            age = 10

            print(f'My name is {name}')
            """
        )

        expected = textwrap.dedent(
            """\
            name = "Ahri"
            age = 10
            print(f'My name is {name}')
            """
        )
        result = normalizeSelection.normalize_lines(src)

        assert result == expected

    def test_list_comp(self):
        importlib.reload(normalizeSelection)
        src = textwrap.dedent(
            """\
            names = ['Ahri', 'Bobby', 'Charlie']
            breed = ['Pomeranian', 'Welsh Corgi', 'Siberian Husky']
            dogs = [(name, breed) for name, breed in zip(names, breed)]

            print(dogs)
            my_family_dog = 'Corgi'
            """
        )

        expected = textwrap.dedent(
            """\
            names = ['Ahri', 'Bobby', 'Charlie']
            breed = ['Pomeranian', 'Welsh Corgi', 'Siberian Husky']
            dogs = [(name, breed) for name, breed in zip(names, breed)]
            print(dogs)
            my_family_dog = 'Corgi'
            """
        )

        result = normalizeSelection.normalize_lines(src)

        assert result == expected

    def test_return_dict(self):
        importlib.reload(normalizeSelection)
        src = textwrap.dedent(
            """\
            def get_dog(name, breed):
                return {'name': name, 'breed': breed}
            """
        )

        expected = textwrap.dedent(
            """\
            def get_dog(name, breed):
                return {'name': name, 'breed': breed}

            """
        )

        result = normalizeSelection.normalize_lines(src)

        assert result == expected

    def test_return_dict2(self):
        importlib.reload(normalizeSelection)
        src = textwrap.dedent(
            """\
            def get_dog(name, breed):
                return {'name': name, 'breed': breed}

            dog = get_dog('Ahri', 'Pomeranian')
            print(dog)
            """
        )

        expected = textwrap.dedent(
            """\
            def get_dog(name, breed):
                return {'name': name, 'breed': breed}

            dog = get_dog('Ahri', 'Pomeranian')
            print(dog)
            """
        )

        result = normalizeSelection.normalize_lines(src)

        assert result == expected
