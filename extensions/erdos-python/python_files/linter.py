import subprocess
import sys

linter_settings = {
    "pylint": {
        "args": ["--reports=n", "--output-format=json"],
    },
    "flake8": {
        "args": ["--format", "%(row)d,%(col)d,%(code).1s,%(code)s:%(text)s"],
    },
    "bandit": {
        "args": [
            "-f",
            "custom",
            "--msg-template",
            "{line},{col},{severity},{test_id}:{msg}",
            "-n",
            "-1",
        ],
    },
    "mypy": {"args": []},
    "prospector": {
        "args": ["--absolute-paths", "--output-format=json"],
    },
    "pycodestyle": {
        "args": ["--format", "%(row)d,%(col)d,%(code).1s,%(code)s:%(text)s"],
    },
    "pydocstyle": {
        "args": [],
    },
    "pylama": {"args": ["--format=parsable"]},
}


def main():
    invoke = sys.argv[1]
    if invoke == "-m":
        linter = sys.argv[2]
        args = [sys.executable, "-m", linter] + linter_settings[linter]["args"] + sys.argv[3:]
    else:
        linter = sys.argv[2]
        args = [sys.argv[3]] + linter_settings[linter]["args"] + sys.argv[4:]

    if hasattr(subprocess, "run"):
        subprocess.run(args, encoding="utf-8", stdout=sys.stdout, stderr=sys.stderr)
    else:
        subprocess.call(args, stdout=sys.stdout, stderr=sys.stderr)


if __name__ == "__main__":
    main()
