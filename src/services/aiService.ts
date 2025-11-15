import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface CodeFile {
  name: string;
  content: string;
  language: string;
}

export async function generateCode(prompt: string, context?: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const fullPrompt = context 
      ? `Context:\n${context}\n\nUser Request:\n${prompt}\n\nGenerate clean, production-ready code with comments.`
      : `${prompt}\n\nGenerate clean, production-ready code with comments.`;
    
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating code:', error);
    throw new Error('Failed to generate code. Please check your API key.');
  }
}

export async function chatWithAI(messages: Message[]): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const chat = model.startChat({
      history: messages.slice(0, -1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      })),
    });
    
    const lastMessage = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error chatting with AI:', error);
    throw new Error('Failed to get AI response. Please check your API key.');
  }
}

export async function explainCode(code: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const prompt = `Explain the following code in detail:\n\n${code}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error explaining code:', error);
    throw new Error('Failed to explain code.');
  }
}

export async function improveCode(code: string, instructions?: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const prompt = instructions
      ? `Improve the following code based on these instructions: ${instructions}\n\nCode:\n${code}`
      : `Improve and optimize the following code:\n\n${code}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error improving code:', error);
    throw new Error('Failed to improve code.');
  }
}
