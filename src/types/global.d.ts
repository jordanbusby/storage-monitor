interface iMonitorListItem {
  storage_name: string
  storage_id: string
  storage_code: string
  url: string
  logins: string[]
  panel_id: number
}

interface iParsedPanel {
  storage_name: string
  storage_id: string
  storage_code: string
  url: string
  logins: { username: string, password: string }[]
}

type iRequestResults = 'success' | 'error' | 'timeout' | 'autherror'

interface ConnectionTracking {
  attempts: number
  authError: boolean
  authErrorCount: number
  lastAttemptedLogin: null | Login
  usingDefaultLogin: boolean
  currentLogin: Login
}

interface Login {
  username: string
  password: string
}

interface Panel {
  logins: { username: string, password: string }[]
  storage_name: string
  storage_id: string
  storage_code: string
  url: string
  panel_id: number
}