package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type Task struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

func loadTasks(path string) ([]Task, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var tasks []Task
	if err := json.Unmarshal(raw, &tasks); err != nil {
		return nil, err
	}
	return tasks, nil
}

func main() {
	tasks := []Task{{ID: 1, Name: "build", Status: "idle"}}
	for _, t := range tasks {
		fmt.Printf("running %s\n", t.Name)
	}
}
