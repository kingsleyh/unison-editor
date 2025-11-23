import { Editor as MonacoEditor } from '@monaco-editor/react';
import { useRef } from 'react';
import type * as Monaco from 'monaco-editor';
import { registerUnisonLanguage } from '../editor/unisonLanguage';

interface EditorProps {
  value: string;
  onChange?: (value: string | undefined) => void;
  language?: string;
  readOnly?: boolean;
}

export function Editor({
  value,
  onChange,
  language = 'unison',
  readOnly = false,
}: EditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  function handleEditorWillMount(monaco: typeof Monaco) {
    // Register Unison language BEFORE the editor mounts
    registerUnisonLanguage(monaco);
  }

  function handleEditorDidMount(editor: Monaco.editor.IStandaloneCodeEditor) {
    editorRef.current = editor;
  }

  return (
    <MonacoEditor
      language={language}
      value={value}
      onChange={onChange}
      beforeMount={handleEditorWillMount}
      onMount={handleEditorDidMount}
      theme="unison-dark"
      options={{
        readOnly,
        minimap: { enabled: true },
        fontSize: 14,
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'on',
      }}
    />
  );
}
