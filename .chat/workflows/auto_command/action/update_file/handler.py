import sys

def replace_text_in_file(fileName: str, old_content: str, newContent: str) -> None:
    """
    Replace text in a file within the specified range with new content.

    :param fileName: The name of the file to modify.
    :param startPos: The starting position of the range to replace.
    :param endPos: The ending position of the range to replace.
    :param newContent: The new content to replace the specified range with.
    """
    with open(fileName, 'r') as file:
        content = file.read()

	# how many times old_content occurs in content
    count = content.count(old_content)
    # if count is not 1, then we can't replace the text
    if count != 1:
		# output error message to stderr and exit
        print(f"Error: {old_content} occurs {count} times in {fileName}.", file=sys.stderr)
        exit(-1)
	
	# replace old_content with new_content
    modified_content = content.replace(old_content, new_content)

    with open(fileName, 'w') as file:
        file.write(modified_content)


if __name__ == "__main__":
	try:
		file_name = sys.argv[1]
		old_content = sys.argv[2]
		new_content = sys.argv[3]

		replace_text_in_file(file_name, old_content, new_content)
	except Exception as e:
		print(e, file=sys.stderr)
		exit(-1)
exit(0)