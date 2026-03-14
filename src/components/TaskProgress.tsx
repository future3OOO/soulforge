import { TextAttributes } from "@opentui/core";
import { useEffect, useState } from "react";
import { icon } from "../core/icons.js";
import { onTaskChange, type Task, type TaskStatus } from "../core/tools/task-list.js";
import { Spinner } from "./shared.js";

const STATUS_ICONS: Record<TaskStatus, string> = {
  done: "✓",
  "in-progress": "",
  pending: "○",
  blocked: "✗",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  done: "#4a7",
  "in-progress": "#9B30FF",
  pending: "#555",
  blocked: "#f44",
};

const MAX_VISIBLE = 6;

interface TaskListProps {
  tasks: Task[];
  nested?: boolean;
}

export function TaskList({ tasks, nested }: TaskListProps) {
  if (tasks.length === 0) return null;

  const done = tasks.filter((t) => t.status === "done").length;

  const renderTask = (task: Task) => (
    <box key={String(task.id)} height={1} flexDirection="row">
      <text>
        {task.status === "in-progress" ? (
          <Spinner color={STATUS_COLORS["in-progress"]} />
        ) : (
          <span fg={STATUS_COLORS[task.status]}>{STATUS_ICONS[task.status]}</span>
        )}
        <span> </span>
        <span
          fg={
            task.status === "done"
              ? "#666"
              : task.status === "in-progress"
                ? "#eee"
                : STATUS_COLORS[task.status]
          }
          attributes={task.status === "in-progress" ? TextAttributes.BOLD : undefined}
        >
          {task.title}
        </span>
      </text>
    </box>
  );

  if (nested) {
    return (
      <box flexDirection="column" paddingLeft={2}>
        {tasks.slice(0, MAX_VISIBLE).map(renderTask)}
        {tasks.length > MAX_VISIBLE && (
          <text fg="#555"> +{String(tasks.length - MAX_VISIBLE)} more</text>
        )}
      </box>
    );
  }

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      border={true}
      borderColor="#336"
      paddingX={1}
      width="100%"
    >
      <box gap={1} flexDirection="row" height={1}>
        <text fg="#336" attributes={TextAttributes.BOLD}>
          {icon("plan")} Tasks
        </text>
        <text fg="#555">
          {String(done)}/{String(tasks.length)}
        </text>
      </box>
      {tasks.slice(0, MAX_VISIBLE).map(renderTask)}
      {tasks.length > MAX_VISIBLE && (
        <text fg="#555">+{String(tasks.length - MAX_VISIBLE)} more</text>
      )}
    </box>
  );
}

export function TaskProgress() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => onTaskChange(setTasks), []);

  if (tasks.length === 0) return null;

  return <TaskList tasks={tasks} />;
}

export function useTaskList(): Task[] {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => onTaskChange(setTasks), []);
  return tasks;
}
