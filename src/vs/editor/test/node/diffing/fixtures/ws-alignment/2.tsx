import { Nav } from '@fluentui/react';
import { View } from '../../layout/layout';

export const WelcomeView = () => {
	return (
		<View title='VS Code Tools'>
			<Nav
				groups={[
					{
						links: [
							{ name: 'VS Code Standup (Redmond)', url: 'https://vscode-standup.azurewebsites.net', icon: 'JoinOnlineMeeting', target: '_blank' },
							{ name: 'VS Code Standup (Zurich)', url: 'https://stand.azurewebsites.net/', icon: 'JoinOnlineMeeting', target: '_blank' },
							{ name: 'VS Code Errors', url: 'https://errors.code.visualstudio.com', icon: 'ErrorBadge', target: '_blank' },
						]
					}
				]}>
			</Nav>
		</View>
	);
}
