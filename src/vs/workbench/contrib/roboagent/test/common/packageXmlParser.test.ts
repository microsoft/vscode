/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { parsePackageXml } from '../../common/parsers/packageXmlParser.js';

suite('RoboAgent - packageXmlParser', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const amentCmakePkg = `<?xml version="1.0"?>
<package format="3">
  <name>demo_cpp_pkg</name>
  <version>1.2.3</version>
  <description>A demo C++ package</description>
  <maintainer email="dev@example.com">Jane Dev</maintainer>
  <buildtool_depend>ament_cmake</buildtool_depend>
  <depend>rclcpp</depend>
  <build_depend>std_msgs</build_depend>
  <exec_depend>geometry_msgs</exec_depend>
  <test_depend>ament_lint_auto</test_depend>
  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>`;

	test('parses ament_cmake package metadata and dependencies', () => {
		const result = parsePackageXml(amentCmakePkg);
		assert.ok(result);
		assert.strictEqual(result!.name, 'demo_cpp_pkg');
		assert.strictEqual(result!.version, '1.2.3');
		assert.strictEqual(result!.description, 'A demo C++ package');
		assert.deepStrictEqual(result!.maintainers, ['Jane Dev']);
		assert.strictEqual(result!.buildType, 'ament_cmake');
		assert.strictEqual(result!.isInterfacePackage, false);
	});

	test('<depend> counts as both build and exec', () => {
		const result = parsePackageXml(amentCmakePkg)!;
		assert.ok(result.dependencies.build.includes('rclcpp'), 'build should include rclcpp');
		assert.ok(result.dependencies.exec.includes('rclcpp'), 'exec should include rclcpp');
		assert.ok(result.dependencies.build.includes('std_msgs'));
		assert.ok(result.dependencies.exec.includes('geometry_msgs'));
		assert.deepStrictEqual(result.dependencies.test, ['ament_lint_auto']);
	});

	test('parses ament_python package', () => {
		const xml = `<?xml version="1.0"?>
<package format="3">
  <name>demo_py_pkg</name>
  <version>0.0.1</version>
  <description>Python nodes</description>
  <maintainer email="a@b.c">Py Dev</maintainer>
  <exec_depend>rclpy</exec_depend>
  <export>
    <build_type>ament_python</build_type>
  </export>
</package>`;
		const result = parsePackageXml(xml)!;
		assert.strictEqual(result.name, 'demo_py_pkg');
		assert.strictEqual(result.buildType, 'ament_python');
		assert.deepStrictEqual(result.dependencies.exec, ['rclpy']);
	});

	test('detects interface packages via member_of_group', () => {
		const xml = `<?xml version="1.0"?>
<package format="3">
  <name>demo_msgs</name>
  <version>1.0.0</version>
  <description>msgs</description>
  <maintainer email="a@b.c">Dev</maintainer>
  <buildtool_depend>rosidl_default_generators</buildtool_depend>
  <member_of_group>rosidl_interface_packages</member_of_group>
  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>`;
		const result = parsePackageXml(xml)!;
		assert.strictEqual(result.isInterfacePackage, true);
	});

	test('returns undefined build type when not declared', () => {
		const xml = `<package format="2"><name>x</name><version>1.0.0</version><description>d</description><maintainer email="a@b.c">M</maintainer></package>`;
		const result = parsePackageXml(xml)!;
		assert.strictEqual(result.buildType, undefined);
	});

	test('ignores commented-out dependencies', () => {
		const xml = `<package format="3">
  <name>x</name><version>1.0.0</version><description>d</description>
  <maintainer email="a@b.c">M</maintainer>
  <!-- <depend>should_not_appear</depend> -->
  <depend>real_dep</depend>
</package>`;
		const result = parsePackageXml(xml)!;
		assert.ok(result.dependencies.build.includes('real_dep'));
		assert.ok(!result.dependencies.build.includes('should_not_appear'));
	});

	test('returns undefined when there is no <name>', () => {
		assert.strictEqual(parsePackageXml('<package format="3"></package>'), undefined);
	});
});
