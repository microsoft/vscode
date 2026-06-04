import json
from dataclasses import dataclass


@dataclass
class Task:
    id: int
    name: str
    status: str = "idle"


def load_tasks(path: str) -> list[Task]:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return [Task(**item) for item in data if item["status"] != "done"]


class Scheduler:
    def __init__(self) -> None:
        self.tasks: list[Task] = []

    def add(self, task: Task) -> None:
        self.tasks.append(task)

    def run(self) -> int:
        count = 0
        for task in self.tasks:
            print(f"running {task.name}")
            count += 1
        return count


if __name__ == "__main__":
    scheduler = Scheduler()
    scheduler.add(Task(1, "build"))
    print(scheduler.run())
