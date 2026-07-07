/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parseCMakeLists } from '../../common/parsers/cmakeListsParser.js';

suite('RoboAgent - cmakeListsParser', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('extracts add_executable targets and find_package deps', () => {
		const cmake = `
cmake_minimum_required(VERSION 3.8)
project(demo_cpp_pkg)
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(std_msgs REQUIRED)

add_executable(talker src/talker.cpp)
ament_target_dependencies(talker rclcpp std_msgs)
add_executable(listener src/listener.cpp)
ament_target_dependencies(listener rclcpp std_msgs)

install(TARGETS talker listener DESTINATION lib/\${PROJECT_NAME})
ament_package()
`;
		const result = parseCMakeLists(cmake);
		assert.deepStrictEqual(result.executables.sort(), ['listener', 'talker']);
		assert.ok(result.findPackages.includes('rclcpp'));
		assert.ok(result.findPackages.includes('std_msgs'));
		assert.ok(!result.findPackages.includes('ament_cmake'), 'ament_cmake should be filtered out');
		assert.strictEqual(result.generatesInterfaces, false);
	});

	test('detects rosidl_generate_interfaces and interface files', () => {
		const cmake = `
project(demo_msgs)
find_package(rosidl_default_generators REQUIRED)
rosidl_generate_interfaces(\${PROJECT_NAME}
  "msg/Point32.msg"
  "srv/AddTwoInts.srv"
  "action/Fibonacci.action"
  DEPENDENCIES std_msgs
)
`;
		const result = parseCMakeLists(cmake);
		assert.strictEqual(result.generatesInterfaces, true);
		assert.ok(result.interfaceFiles.includes('msg/Point32.msg'));
		assert.ok(result.interfaceFiles.includes('srv/AddTwoInts.srv'));
		assert.ok(result.interfaceFiles.includes('action/Fibonacci.action'));
	});

	test('ignores commented-out targets', () => {
		const cmake = `
# add_executable(ghost src/ghost.cpp)
add_executable(real src/real.cpp)
`;
		const result = parseCMakeLists(cmake);
		assert.deepStrictEqual(result.executables, ['real']);
	});

	test('skips variable-based executable names', () => {
		const cmake = `add_executable(\${TARGET_NAME} src/main.cpp)`;
		const result = parseCMakeLists(cmake);
		assert.deepStrictEqual(result.executables, []);
	});

	test('captures per-target source files', () => {
		const cmake = `
add_executable(talker src/talker.cpp src/util.cpp)
add_executable(listener src/listener.cpp)
`;
		const result = parseCMakeLists(cmake);
		const talker = result.executableTargets.find(t => t.name === 'talker');
		const listener = result.executableTargets.find(t => t.name === 'listener');
		assert.deepStrictEqual(talker?.sources, ['src/talker.cpp', 'src/util.cpp']);
		assert.deepStrictEqual(listener?.sources, ['src/listener.cpp']);
	});
});
