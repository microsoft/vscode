import { Link, List, Separator, Stack } from '@fluentui/react';
import { View } from '../../layout/layout';

export const OtherToolsView = () => {
	return (
		<View title='Other Tools'>
			<Stack grow={true} verticalFill={true}>
				<Stack.Item>
					<List
						items={[
							{ name: 'VS Code Standup (Redomond)', href: 'https://vscode-standup.azurewebsites.net' },
							{ name: 'VS Code Standup (Zurich)', href: 'http://stand.azurewebsites.net/' },
							{},
							{ name: 'VS Code Errors', href: 'https://vscode-errors.azurewebsites.net' },
							{ name: 'VS Code GDPR', href: 'https://github.com/microsoft/vscode-gdpr-tooling' },
						]}
						onRenderCell={(item) => {
							if (!item?.name) {
								return <Separator></Separator>
							}
							return <div style={{ marginBottom: 12 }}><Link href={item!.href} target='_blank'>{item!.name}</Link></div>
						}}
					>
					</List>
				</Stack.Item>
			</Stack>
		</View>
	);
}