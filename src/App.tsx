import { LyrixaEditorShell } from './features/editor/LyrixaEditorShell'
import { ShortcutsProvider } from './features/shortcuts/ShortcutsContext'

function App() {
  return (
    <ShortcutsProvider>
      <LyrixaEditorShell />
    </ShortcutsProvider>
  )
}

export default App
