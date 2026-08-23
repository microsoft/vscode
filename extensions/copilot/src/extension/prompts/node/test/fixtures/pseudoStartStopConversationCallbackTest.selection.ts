		assert.deepStrictEqual((progress[0] as ChatAgentContent).content, 'this is test text\n\n');
		assert.deepStrictEqual((progress[1] as ChatAgentContent).content, 'eeep ');
		assert.deepStrictEqual((progress[2] as ChatAgentContent).content, '<processed>');
		assert.deepStrictEqual((progress[3] as ChatAgentContent).content, '\n\n');
		assert.deepStrictEqual((progress[4] as ChatAgentContent).content, 'test test test test 123456');
		assert.deepStrictEqual((progress[5] as ChatAgentContent).content, '</processed>');
		assert.deepStrictEqual((progress[6] as ChatAgentContent).content, '\n\nhello');
