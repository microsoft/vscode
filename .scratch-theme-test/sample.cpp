#include <iostream>
#include <vector>
#include <string>

namespace theme {

struct Task {
	int id;
	std::string name;
	bool done = false;
};

class Scheduler {
public:
	void add(const Task& task) {
		tasks_.push_back(task);
	}

	int run() const {
		int count = 0;
		for (const auto& task : tasks_) {
			std::cout << "running " << task.name << '\n';
			++count;
		}
		return count;
	}

private:
	std::vector<Task> tasks_;
};

}  // namespace theme

int main() {
	theme::Scheduler scheduler;
	scheduler.add({1, "build", false});
	return scheduler.run();
}
