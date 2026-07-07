/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { scanNodeSource, ScannedComm } from '../../common/parsers/nodeSourceScanner.js';

function find(comms: ScannedComm[], kind: string, name: string): ScannedComm | undefined {
	return comms.find(c => c.kind === kind && c.name === name);
}

suite('RoboAgent - nodeSourceScanner', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('scans a C++ (rclcpp) node', () => {
		const cpp = `
class MyNode : public rclcpp::Node {
  MyNode() : Node("my_node") {
    pub_ = this->create_publisher<geometry_msgs::msg::Twist>("cmd_vel", 10);
    sub_ = this->create_subscription<sensor_msgs::msg::LaserScan>("scan", 10, cb);
    srv_ = this->create_service<example_interfaces::srv::AddTwoInts>("add_two_ints", handle);
    cli_ = this->create_client<example_interfaces::srv::AddTwoInts>("add_two_ints");
    action_ = rclcpp_action::create_server<Fibonacci>(this, "fibonacci", g, c, a);
    this->declare_parameter<double>("max_speed", 1.0);
    this->declare_parameter("frame_id", "base_link");
    // this->create_publisher<std_msgs::msg::Bool>("ghost", 1);
  }
};`;
		const { communications, parameters } = scanNodeSource(cpp, 'cpp');

		assert.deepStrictEqual(find(communications, 'publisher', 'cmd_vel')?.messageType, 'geometry_msgs/Twist');
		assert.deepStrictEqual(find(communications, 'subscriber', 'scan')?.messageType, 'sensor_msgs/LaserScan');
		assert.deepStrictEqual(find(communications, 'service_server', 'add_two_ints')?.messageType, 'example_interfaces/AddTwoInts');
		assert.ok(find(communications, 'service_client', 'add_two_ints'), 'service client found');
		assert.deepStrictEqual(find(communications, 'action_server', 'fibonacci')?.messageType, 'Fibonacci');
		assert.deepStrictEqual(parameters.sort(), ['frame_id', 'max_speed']);
		// commented-out publisher must not appear
		assert.strictEqual(find(communications, 'publisher', 'ghost'), undefined);
	});

	test('scans a Python (rclpy) node', () => {
		const py = `
class MyNode(Node):
    def __init__(self):
        super().__init__('my_node')
        self.pub = self.create_publisher(Twist, 'cmd_vel', 10)
        self.sub = self.create_subscription(LaserScan, 'scan', self.cb, 10)
        self.srv = self.create_service(AddTwoInts, 'add_two_ints', self.handle)
        self.cli = self.create_client(AddTwoInts, 'add_two_ints')
        self._as = ActionServer(self, Fibonacci, 'fibonacci', self.execute)
        self.declare_parameter('max_speed', 1.0)
        # self.create_publisher(Bool, 'ghost', 1)`;
		const { communications, parameters } = scanNodeSource(py, 'python');

		assert.deepStrictEqual(find(communications, 'publisher', 'cmd_vel')?.messageType, 'Twist');
		assert.deepStrictEqual(find(communications, 'subscriber', 'scan')?.messageType, 'LaserScan');
		assert.ok(find(communications, 'service_server', 'add_two_ints'), 'service server found');
		assert.ok(find(communications, 'service_client', 'add_two_ints'), 'service client found');
		assert.deepStrictEqual(find(communications, 'action_server', 'fibonacci')?.messageType, 'Fibonacci');
		assert.deepStrictEqual(parameters, ['max_speed']);
		assert.strictEqual(find(communications, 'publisher', 'ghost'), undefined);
	});

	test('empty for a node with no ROS calls', () => {
		const { communications, parameters } = scanNodeSource('int main() { return 0; }', 'cpp');
		assert.deepStrictEqual(communications, []);
		assert.deepStrictEqual(parameters, []);
	});

	test('ignores use_sim_time auto-parameter', () => {
		const { parameters } = scanNodeSource(`self.declare_parameter('use_sim_time', False)\nself.declare_parameter('rate', 10)`, 'python');
		assert.deepStrictEqual(parameters, ['rate']);
	});
});
