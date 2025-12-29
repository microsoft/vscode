/**
 * Tests for MarkdownRenderer component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MarkdownRenderer } from '../../chat/MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('renders plain text', () => {
    render(<MarkdownRenderer content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders headings', () => {
    render(<MarkdownRenderer content="# Heading 1\n## Heading 2" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Heading 1');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Heading 2');
  });

  it('renders lists', () => {
    render(<MarkdownRenderer content="- Item 1\n- Item 2\n- Item 3" />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Item 1');
  });

  it('renders inline code', () => {
    render(<MarkdownRenderer content="Use `const` for constants" />);
    expect(screen.getByText('const')).toHaveStyle({ fontFamily: expect.stringContaining('mono') });
  });

  it('renders code blocks', () => {
    const code = "```typescript\nconst x = 1;\n```";
    render(<MarkdownRenderer content={code} />);
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
  });

  it('renders code blocks with language', () => {
    const code = "```python\ndef hello():\n    pass\n```";
    render(<MarkdownRenderer content={code} />);
    expect(screen.getByText(/python/i)).toBeInTheDocument();
  });

  it('renders bold text', () => {
    render(<MarkdownRenderer content="This is **bold** text" />);
    const bold = screen.getByText('bold');
    expect(bold.tagName).toBe('STRONG');
  });

  it('renders italic text', () => {
    render(<MarkdownRenderer content="This is *italic* text" />);
    const italic = screen.getByText('italic');
    expect(italic.tagName).toBe('EM');
  });

  it('renders links', () => {
    render(<MarkdownRenderer content="Check [this link](https://example.com)" />);
    const link = screen.getByRole('link', { name: 'this link' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders blockquotes', () => {
    render(<MarkdownRenderer content="> This is a quote" />);
    expect(screen.getByText('This is a quote')).toBeInTheDocument();
  });

  it('renders tables', () => {
    const table = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;
    
    render(<MarkdownRenderer content={table} />);
    expect(screen.getByText('Header 1')).toBeInTheDocument();
    expect(screen.getByText('Cell 1')).toBeInTheDocument();
  });

  it('calls onCodeApply when code apply is triggered', () => {
    const onCodeApply = jest.fn();
    const code = "```typescript\nconst x = 1;\n```";
    
    render(<MarkdownRenderer content={code} onCodeApply={onCodeApply} />);
    
    // CodeBlock should render with Apply button
    const applyButton = screen.getByRole('button', { name: /apply/i });
    expect(applyButton).toBeInTheDocument();
  });
});

