content = ""
with open("report.txt", "r") as file:
    content = file.read()
content = content.split("error: ")[1:]


class Correction:
    def __init__(self, string):
        try:
            self.string = string
            lines = string.split("\n")
            self.old, self.new = tuple(lines[0].replace("`", "").split(" should be"))
            if "-->" not in self.string:
                print("No path found, skipping")
                self.path = "READNE.md"
                self.line = 1
                return

            path = lines[1].split("--> ")[1].split(":")[0].strip()
            self.path = path
            self.line = int(lines[1].split("--> ")[1].split(":")[1])
        except Exception as e:
            print("Error parsing correction:", e)
            print("String was:", string)
            exit()

    def present(self):
        # print(self.string)
        if "`, " in self.string.split("\n")[0]:
            print("Multiple corrections suggested, skipping")
            return
        if not (
            "//" in self.string.split("\n")[3]
            or self.string.split("\n")[3].split("|")[1].replace(" ", "").startswith("*")
        ):
            print("Not a code line, skipping")
            return

        if True:
            print(f"Fixing {self.path}:{self.line} {self.old} -> {self.new}")
            with open(self.path, "r") as file:
                file_content = file.read()
            lines = file_content.split("\n")
            if self.line <= len(lines):
                lines[self.line - 1] = lines[self.line - 1].replace(self.old, self.new)
                file_content = "\n".join(lines)
            with open(self.path, "w") as file:
                file.write(file_content)


# content_granular = []

# for i in range(5):
#     print(content[i])

#     print("ee")

for c in content:
    correction = Correction(c)
    correction.present()
