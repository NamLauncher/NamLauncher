// Author/creator: nattapat2871 (https://nattapat2871.me)
import { LauncherShell } from './app/LauncherShell'
import { useLauncherController } from './app/useLauncherController'

const App = () => {
  const model = useLauncherController()
  return <LauncherShell model={model} />
}

export default App
