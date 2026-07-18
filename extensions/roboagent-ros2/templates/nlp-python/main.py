"""RoboAgent starter: minimal NLP pipeline stub."""


def analyze(text: str) -> dict:
    tokens = text.split()
    return {"tokens": len(tokens), "chars": len(text), "first": tokens[0] if tokens else None}


def main() -> None:
    sample = "RoboAgent understands robotics, not just syntax."
    print(analyze(sample))


if __name__ == "__main__":
    main()
