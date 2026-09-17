from setuptools import setup

setup(
    name="Demo",
    license="MIT",
    version="0.1.2",
    author_email="sebastien@eustace.io",
    url="https://github.com/demo/demo",
    packages=["demo"],
    platforms={'platform' : 8},
    install_requires=["pendulum>=1.4.4"],
    extras_require={"foo": ["cleo"], "bar": ["tomlkit"]},
)
