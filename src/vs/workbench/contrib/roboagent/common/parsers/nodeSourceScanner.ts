/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Ros2CommKind, Ros2NodeLanguage } from '../ros2WorkspaceModel.js';

/** A communication endpoint discovered in a node's source. */
export interface ScannedComm {
	readonly kind: Ros2CommKind;
	/** Topic / service / action name. */
	readonly name: string;
	/** Message/service/action type, best-effort. */
	readonly messageType?: string;
}

export interface ScannedNodeSource {
	readonly communications: ScannedComm[];
	readonly parameters: string[];
}

/**
 * Statically scan a single node source file for its ROS2 communication surface:
 * publishers, subscribers, service servers/clients, action servers/clients, and
 * declared parameters. Regex-based and tolerant — it recognises the canonical
 * rclcpp / rclpy call shapes and silently skips anything it can't resolve
 * (e.g. topic names built from variables).
 */
export function scanNodeSource(text: string, language: Ros2NodeLanguage): ScannedNodeSource {
	const src = language === 'python' ? stripPyComments(text) : stripCppComments(text);
	return language === 'python' ? scanPython(src) : scanCpp(src);
}

// --- C++ (rclcpp) ----------------------------------------------------------

function scanCpp(src: string): ScannedNodeSource {
	const comms: ScannedComm[] = [];

	// create_publisher<geometry_msgs::msg::Twist>("cmd_vel", ...)
	pushMatches(comms, src, /create_publisher\s*<\s*([\w:]+)\s*>\s*\(\s*"([^"]+)"/g, 'publisher', normalizeCppType);
	// create_subscription<sensor_msgs::msg::LaserScan>("scan", ...)
	pushMatches(comms, src, /create_subscription\s*<\s*([\w:]+)\s*>\s*\(\s*"([^"]+)"/g, 'subscriber', normalizeCppType);
	// create_service<example_interfaces::srv::AddTwoInts>("add_two_ints", ...)
	pushMatches(comms, src, /create_service\s*<\s*([\w:]+)\s*>\s*\(\s*"([^"]+)"/g, 'service_server', normalizeCppType);

	// rclcpp_action::create_server<Fibonacci>(node, "fibonacci", ...) — name is 2nd (string) arg
	pushMatches(comms, src, /rclcpp_action::create_server\s*<\s*([\w:]+)\s*>\s*\([^;"]*?"([^"]+)"/g, 'action_server', normalizeCppType);
	// rclcpp_action::create_client<Fibonacci>(node, "fibonacci", ...)
	pushMatches(comms, src, /rclcpp_action::create_client\s*<\s*([\w:]+)\s*>\s*\([^;"]*?"([^"]+)"/g, 'action_client', normalizeCppType);

	// Service clients: create_client<...>("srv") — but NOT the action client above.
	// Strip the rclcpp_action:: client calls first so we don't double-count.
	const noActionClients = src.replace(/rclcpp_action::create_client\s*<[\w:]+>\s*\([^;]*?\)/g, '');
	pushMatches(comms, noActionClients, /(?<!action::)create_client\s*<\s*([\w:]+)\s*>\s*\(\s*"([^"]+)"/g, 'service_client', normalizeCppType);

	// declare_parameter<T>("name", ...) or declare_parameter("name", ...)
	const parameters = collectNames(src, /declare_parameter(?:<[^>]*>)?\s*\(\s*"([^"]+)"/g);

	return { communications: dedupeComms(comms), parameters: dedupe(parameters) };
}

function normalizeCppType(t: string): string {
	// geometry_msgs::msg::Twist -> geometry_msgs/Twist
	return t.replace(/::(?:msg|srv|action)::/g, '/').replace(/::/g, '/');
}

// --- Python (rclpy) --------------------------------------------------------

function scanPython(src: string): ScannedNodeSource {
	const comms: ScannedComm[] = [];

	// self.create_publisher(Twist, 'cmd_vel', 10)
	pushMatches(comms, src, /create_publisher\s*\(\s*([\w.]+)\s*,\s*['"]([^'"]+)['"]/g, 'publisher', id);
	pushMatches(comms, src, /create_subscription\s*\(\s*([\w.]+)\s*,\s*['"]([^'"]+)['"]/g, 'subscriber', id);
	pushMatches(comms, src, /create_service\s*\(\s*([\w.]+)\s*,\s*['"]([^'"]+)['"]/g, 'service_server', id);
	pushMatches(comms, src, /create_client\s*\(\s*([\w.]+)\s*,\s*['"]([^'"]+)['"]/g, 'service_client', id);
	// ActionServer(self, Fibonacci, 'fibonacci', ...) — type is 2nd arg, name is 3rd (string)
	pushMatches(comms, src, /ActionServer\s*\(\s*[\w.]+\s*,\s*([\w.]+)\s*,\s*['"]([^'"]+)['"]/g, 'action_server', id);
	pushMatches(comms, src, /ActionClient\s*\(\s*[\w.]+\s*,\s*([\w.]+)\s*,\s*['"]([^'"]+)['"]/g, 'action_client', id);

	// self.declare_parameter('name', default) and declare_parameters(namespace, [...])
	const parameters = collectNames(src, /declare_parameter\s*\(\s*['"]([^'"]+)['"]/g);

	return { communications: dedupeComms(comms), parameters: dedupe(parameters) };
}

// --- shared helpers --------------------------------------------------------

function id(t: string): string {
	// Python type may be `module.Type` — keep only the class name.
	const dot = t.lastIndexOf('.');
	return dot === -1 ? t : t.slice(dot + 1);
}

/** Each match's group 1 is the type, group 2 is the name. */
function pushMatches(out: ScannedComm[], text: string, re: RegExp, kind: Ros2CommKind, typeFn: (t: string) => string): void {
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		out.push({ kind, name: m[2], messageType: typeFn(m[1]) || undefined });
	}
}

function collectNames(text: string, re: RegExp): string[] {
	const out: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		// ROS reserves the `use_sim_time` / `qos_overrides` auto-params; keep user ones only-ish.
		if (m[1] !== 'use_sim_time') {
			out.push(m[1]);
		}
	}
	return out;
}

function dedupeComms(comms: ScannedComm[]): ScannedComm[] {
	const seen = new Set<string>();
	const out: ScannedComm[] = [];
	for (const c of comms) {
		const key = `${c.kind}|${c.name}|${c.messageType ?? ''}`;
		if (!seen.has(key)) {
			seen.add(key);
			out.push(c);
		}
	}
	return out;
}

function dedupe(values: string[]): string[] {
	return Array.from(new Set(values));
}

function stripCppComments(text: string): string {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/[^\n]*/g, '');
}

function stripPyComments(text: string): string {
	// Strip full-line and trailing `#` comments (best-effort; ignores `#` inside strings,
	// which is acceptable for our declaration-shaped patterns).
	return text.replace(/#[^\n]*/g, '');
}
