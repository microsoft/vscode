/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import React, { Component, useState } from 'react';

// Define a type for the props
interface MyComponentProps {
	initialCount: number;
}

// Define a functional component
const MyFunctionalComponent: React.FC<MyComponentProps> = ({ initialCount }) => {
	const [count, setCount] = useState(initialCount);

	return (
		<div>
			<p>Count: {count}</p>
			<button onClick={() => setCount(count + 1)}>Increase</button>
		</div>
	);
};

// Define a class component
class MyClassComponent extends Component<MyComponentProps> {
	state = {
		count: this.props.initialCount,
	};

	increaseCount = () => {
		this.setState({ count: this.state.count + 1 });
	};

	render() {
		return (
			<div>
				<p>Count: {this.state.count}</p>
				<button onClick={this.increaseCount}>Increase</button>
			</div>
		);
	}
}

// Use the components
const App: React.FC = () => (
	<div>
		<MyFunctionalComponent initialCount={0} />
		<MyClassComponent initialCount={0} />
	</div>
);

export default App;
