record = {
    "headers": {k: str(v) for k, v in self.request.META.items() if k.startswith('HTTP_')}
}
cmd = "git-clang-format --style=\"{{BasedOnStyle: Google, ColumnLimit: 100, IndentWidth: 2, " \ "AlignConsecutiveAssignments: true}}\" {COMMIT_SHA} -- ./**/*.proto > {OUTPUT}".format(