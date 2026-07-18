/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { computeRos2GraphLayout, nodeVertexId, topicVertexId, Ros2GraphVertex } from '../../common/ros2GraphLayout.js';
import { buildTopicRegistry, EMPTY_ROS2_GRAPH, Ros2Communication, Ros2Node, Ros2WorkspaceGraph } from '../../common/ros2WorkspaceModel.js';

function makeGraph(nodes: Ros2Node[], communications: Ros2Communication[]): Ros2WorkspaceGraph {
	return { ...EMPTY_ROS2_GRAPH, nodes, communications, topics: buildTopicRegistry(communications), indexedAt: 1 };
}

function vertex(vertices: readonly Ros2GraphVertex[], id: string): Ros2GraphVertex {
	const found = vertices.find(v => v.id === id);
	assert.ok(found, `vertex ${id} present`);
	return found;
}

suite('RoboAgent - ros2GraphLayout', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const talker: Ros2Node = { name: 'talker', package: 'demo', language: 'cpp' };
	const listener: Ros2Node = { name: 'listener', package: 'demo', language: 'python' };

	const pub = (node: Ros2Node, topic: string, messageType?: string): Ros2Communication =>
		({ package: node.package, node: node.name, kind: 'publisher', name: topic, messageType });
	const sub = (node: Ros2Node, topic: string, messageType?: string): Ros2Communication =>
		({ package: node.package, node: node.name, kind: 'subscriber', name: topic, messageType });

	test('lays out a pub→topic→sub chain left to right', () => {
		const layout = computeRos2GraphLayout(makeGraph([talker, listener], [
			pub(talker, '/chatter', 'std_msgs/String'),
			sub(listener, '/chatter', 'std_msgs/String'),
		]));

		assert.strictEqual(layout.vertices.length, 3);
		const talkerV = vertex(layout.vertices, nodeVertexId('demo', 'talker'));
		const topicV = vertex(layout.vertices, topicVertexId('/chatter'));
		const listenerV = vertex(layout.vertices, nodeVertexId('demo', 'listener'));
		assert.ok(talkerV.x < topicV.x && topicV.x < listenerV.x, 'data flows left to right');
		assert.strictEqual(topicV.sublabel, 'std_msgs/String');
		assert.deepStrictEqual(
			layout.edges.map(e => `${e.source}->${e.target}`).sort(),
			['node:demo/talker->topic:/chatter', 'topic:/chatter->node:demo/listener']);
		assert.ok(layout.width > 0 && layout.height > 0);
	});

	test('terminates and layers a cyclic graph', () => {
		const layout = computeRos2GraphLayout(makeGraph([talker, listener], [
			pub(talker, '/ping'), sub(listener, '/ping'),
			pub(listener, '/pong'), sub(talker, '/pong'),
		]));
		assert.strictEqual(layout.vertices.length, 4);
		assert.strictEqual(layout.edges.length, 4);
		// Every vertex received a position inside the drawing extent.
		for (const v of layout.vertices) {
			assert.ok(v.x >= 0 && v.x + v.width <= layout.width, `${v.id} x within extent`);
			assert.ok(v.y >= 0 && v.y + v.height <= layout.height, `${v.id} y within extent`);
		}
	});

	test('links service/action clients to servers with labeled dashed-kind edges', () => {
		const layout = computeRos2GraphLayout(makeGraph([talker, listener], [
			{ package: 'demo', node: 'talker', kind: 'service_client', name: '/add_two_ints' },
			{ package: 'demo', node: 'listener', kind: 'service_server', name: '/add_two_ints' },
			{ package: 'demo', node: 'talker', kind: 'action_client', name: '/fibonacci' },
			{ package: 'demo', node: 'listener', kind: 'action_server', name: '/fibonacci' },
		]));
		assert.deepStrictEqual(layout.edges.map(e => ({ kind: e.kind, label: e.label, source: e.source, target: e.target })).sort((a, b) => a.kind.localeCompare(b.kind)), [
			{ kind: 'action', label: '/fibonacci', source: 'node:demo/talker', target: 'node:demo/listener' },
			{ kind: 'service', label: '/add_two_ints', source: 'node:demo/talker', target: 'node:demo/listener' },
		]);
	});

	test('is deterministic regardless of input order', () => {
		const comms = [
			pub(talker, '/chatter', 'std_msgs/String'), sub(listener, '/chatter'),
			pub(listener, '/status'), sub(talker, '/status'),
		];
		const a = computeRos2GraphLayout(makeGraph([talker, listener], comms));
		const b = computeRos2GraphLayout(makeGraph([listener, talker], [...comms].reverse()));
		assert.deepStrictEqual(a.vertices, b.vertices);
	});

	test('package filter drops foreign nodes and unreferenced topics', () => {
		const other: Ros2Node = { name: 'imu', package: 'sensors', language: 'cpp' };
		const layout = computeRos2GraphLayout(makeGraph([talker, listener, other], [
			pub(talker, '/chatter'), sub(listener, '/chatter'),
			pub(other, '/imu/data'),
		]), { packages: ['demo'] });
		assert.deepStrictEqual(layout.vertices.map(v => v.id).sort(),
			['node:demo/listener', 'node:demo/talker', 'topic:/chatter']);
	});

	test('parks isolated nodes in a trailing column', () => {
		const idle: Ros2Node = { name: 'idle', package: 'demo', language: 'unknown' };
		const layout = computeRos2GraphLayout(makeGraph([talker, listener, idle], [
			pub(talker, '/chatter'), sub(listener, '/chatter'),
		]));
		const idleV = vertex(layout.vertices, nodeVertexId('demo', 'idle'));
		for (const v of layout.vertices) {
			if (v.id !== idleV.id) {
				assert.ok(idleV.x > v.x, `isolated node right of ${v.id}`);
			}
		}
	});

	test('renders an empty graph to an empty extent', () => {
		const layout = computeRos2GraphLayout(EMPTY_ROS2_GRAPH);
		assert.deepStrictEqual(layout.vertices, []);
		assert.deepStrictEqual(layout.edges, []);
	});
});
